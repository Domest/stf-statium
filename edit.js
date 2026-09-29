// ============================================================
//  EDIT.JS — создание полей ввода и списков, сохранение ячеек
//  и применение свежих снимков данных после сохранения.
//  Проверки ввода — в validation.js, запросы — в api.js.
// ============================================================

function makeInput(row, col, displayValue) {
  const input = document.createElement('input');
  input.className = 'cell-input';
  input.type = 'text';
  input.value = displayValue;
  input.dataset.row = row;
  input.dataset.col = col;
  input.dataset.orig = input.value;

  // Enter — сохранить, Escape — отменить правку
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') {
      input.value = input.dataset.orig;
      input.classList.remove('invalid');
      hideValidationPopup(input);
      input.blur();
    }
  });

  // Потеря фокуса — попытка сохранения, если значение изменилось
  input.addEventListener('blur', () => saveCell(input));

  input.addEventListener('input', () => {
    if (input.value !== input.dataset.orig) {
      input.classList.add('dirty');
    } else {
      input.classList.remove('dirty');
    }
    // Если поле помечено ошибкой — перепроверяем на лету и снимаем ошибку
    if (input.classList.contains('invalid')) {
      const err = validateValue(input.value, isNumericCell(row, col));
      if (!err) {
        input.classList.remove('invalid');
        hideValidationPopup(input);
      }
    }
  });

  return input;
}

// Выпадающий список (ячейка с валидацией данных в таблице)
function makeSelect(row, col, displayValue, options) {
  const select = document.createElement('select');
  select.className = 'cell-input';
  select.dataset.row = row;
  select.dataset.col = col;
  select.dataset.orig = displayValue;
  fillSelectOptions(select, options, displayValue);
  select.addEventListener('change', () => saveCell(select));
  return select;
}

function fillSelectOptions(select, options, displayValue) {
  select.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '—';
  select.appendChild(empty);

  const list = options.slice();
  if (displayValue !== '' && list.indexOf(displayValue) === -1) {
    list.unshift(displayValue); // текущее значение может быть вне списка
  }
  list.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
  select.value = displayValue;
}

async function saveCell(el) {
  const row = parseInt(el.dataset.row, 10);
  const col = parseInt(el.dataset.col, 10);
  const orig = el.dataset.orig;

  if (el.value === orig) {
    el.classList.remove('dirty');
    return; // ничего не изменилось
  }

  // Проверка ввода: текстовые поля проверяем на длину и допустимые символы,
  // числовые — на формат числа. Списки в проверке не нуждаются.
  if (el.tagName === 'INPUT') {
    const validationError = validateValue(el.value, isNumericCell(row, col));
    if (validationError) {
      // Неверный ввод: запрос НЕ отправляем, красная граница + popup с ошибкой
      el.classList.add('invalid');
      showValidationPopup(el, validationError);
      return;
    }
    el.classList.remove('invalid');
    hideValidationPopup(el);
  }

  // Нормализация значения (например, «Хэштег» — всегда одна решётка в начале)
  const valueToSend = transformValue(row, col, el.value);

  if (el.dataset.saving === '1') return; // уже сохраняется
  el.dataset.saving = '1';

  // Прежние значения на экране НЕ стираем: элемент лишь блокируем,
  // но его содержимое остаётся видимым до ответа сервера.
  el.classList.add('saving');
  el.disabled = true;
  beginRequest();

  try {
    const result = await callApi({
      action: 'updateCell',
      row: row,
      col: col,
      value: valueToSend
    });

    if (handleSessionProblem(result)) return;

    if (result.status !== 'success') {
      // Ошибка: возвращаем прежнее значение
      el.value = orig;
      endRequest(false, result.message);
      document.getElementById('status').textContent =
        'Ошибка сохранения (' + row + ',' + col + '): ' + result.message;
      return;
    }

    // Успех: сервер дождался пересчёта формул и вернул свежий снимок —
    // применяем его (обновятся и зависимые вычисляемые значения).
    el.classList.remove('dirty');
    if (result.data) {
      applySnapshot(result);
    } else {
      el.value = String(result.value !== undefined ? result.value : el.value);
      el.dataset.orig = el.value;
    }
    endRequest(true, 'Сохранено');
  } catch (e) {
    el.value = orig;
    endRequest(false, e.message);
    document.getElementById('status').textContent = 'Ошибка соединения: ' + e.message;
  } finally {
    el.disabled = false;
    el.classList.remove('saving');
    delete el.dataset.saving;
  }
}

// Применяем свежий снимок листа (пришёл в ответе на сохранение):
// обновляем значения по месту, не трогая поля с несохранённой правкой (dirty).
function applySnapshot(result) {
  const prevRows = currentData ? currentData.length : 0;
  currentData = result.data || [];
  currentDisplay = result.display || [];
  currentMask = result.formulaMask || [];
  currentValidations = result.validations || {};

  // Размер листа изменился (добавлены строки) — полная перерисовка
  if (currentData.length !== prevRows) {
    renderCurrentSheet();
    return;
  }

  document.querySelectorAll('[data-row][data-col]').forEach(el => {
    if (el.classList.contains('dirty')) return; // у пользователя несохранённая правка
    const cell = cellAt(el.dataset.row, el.dataset.col);
    if (el.tagName === 'P') {
      el.textContent = cell.display;   // пересчитанные формульные значения и поля «только чтение»
      if (el.dataset.tint) refreshTint(el);
      return;
    }
    if (el.tagName === 'SELECT') {
      fillSelectOptions(el, cell.options || [], cell.display);
    }
    el.value = cell.display;
    el.dataset.orig = el.value;
    if (el.dataset.tint) refreshTint(el);
  });

  // Диаграмма «Раса» зависит от численности — перерисовываем её по свежим данным
  const chartBox = document.getElementById('race-chart');
  if (chartBox) renderRaceChart(chartBox, LAYOUT.entities[0]);
}