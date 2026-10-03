// ============================================================
//  PERSONS.JS — секция «Правящий дом»: список персон и окна
//  добавления / изменения / удаления.
//  Подключается ПОСЛЕ edit.js, ПЕРЕД main.js.
//
//  Данные: строки листа НЕ добавляются и НЕ удаляются — значения
//  персон перезаписываются со строки headerRow + 1 и ниже
//  (действие saveCharacters на сервере). Форматирование новой
//  строки копируется со строки-образца (первой строки персон).
// ============================================================

// Контейнер секции персон — для перерисовки после сохранения
let personsSectionEl = null;

// Открытое в данный момент окно (персона или подтверждение удаления)
let activeModal = null;

// ------------------------------------------------------------
//  ДАННЫЕ ПЕРСОН
// ------------------------------------------------------------

// Столбцы блока персон: [{ col, header }] (B..G, characters.cols в config.js)
function personCols() {
  const ch = LAYOUT.characters;
  return ch.cols.map(col => ({
    col: col,
    header: cellAt(ch.headerRow, col).display
  }));
}

// Все персоны листа: [{ row, values: [значения по столбцам] }],
// пока в строке есть хотя бы одно непустое значение
function collectPersons() {
  const ch = LAYOUT.characters;
  const cols = personCols();
  const persons = [];
  const lastRow = currentData ? currentData.length : 0;
  let row = ch.headerRow + 1;
  while (row <= lastRow && cols.some(c => cellAt(row, c.col).display !== '')) {
    persons.push({ row: row, values: cols.map(c => cellAt(row, c.col).display) });
    row++;
  }
  return persons;
}

// Все доступные названия рас / религий — из секций «Раса» и «Религия»
function entityOptions(re) {
  const entity = LAYOUT.entities.find(e =>
    re.test(cellAt(e.title[0], e.title[1]).display));
  if (!entity) return [];
  const names = [];
  let row = entity.headerRow + 1;
  while (cellAt(row, entity.nameCol).display !== '') {
    names.push(cellAt(row, entity.nameCol).display);
    row++;
  }
  return names;
}

// ------------------------------------------------------------
//  ОТОБРАЖЕНИЕ СЕКЦИИ
// ------------------------------------------------------------

// Иконка-кнопка строки/заголовка (маска + currentColor, как у вкладок)
function makePersonBtn(iconSrc, label, danger) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'char-btn' + (danger ? ' danger' : '');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  const icon = document.createElement('span');
  icon.className = 'btn-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.style.setProperty('--icon', 'url("' + iconSrc + '")');
  btn.appendChild(icon);
  return btn;
}

// Секция «Правящий дом»: заголовок с кнопкой «Добавить»,
// таблица персон с кнопками «Изменить» / «Удалить» в каждой строке
function renderCharacters(container) {
  personsSectionEl = container;
  const ch = LAYOUT.characters;
  const cols = personCols();
  const persons = collectPersons();

  // Заголовок: «Правящий дом» — суффикс в скобках убираем
  const head = document.createElement('div');
  head.className = 'chars-head';
  const h = document.createElement('h2');
  h.className = 'section-title';
  h.textContent = cellAt(ch.title[0], ch.title[1]).display
    .replace(/\s*\([^)]*\)\s*$/, '');
  head.appendChild(h);

  const addBtn = makePersonBtn('img/add-icon.svg', 'Добавить', false);
  addBtn.addEventListener('click', () => openPersonModal(null));
  addBtn.classList.add('add');
  head.appendChild(addBtn);
  container.appendChild(head);

  // Таблица: значения — обычный текст, редактирование — через окна
  const scroll = document.createElement('div');
  scroll.className = 'chars-scroll';
  const table = document.createElement('table');
  table.className = 'characters';

  // Заголовки столбцов (Примечание скрыто) + столбец кнопок
  const thead = document.createElement('tr');
  cols.forEach(c => {
    if (ch.hideColsRe && ch.hideColsRe.test(c.header)) return;
    const th = document.createElement('th');
    th.textContent = c.header;
    if (ch.ageRe && ch.ageRe.test(c.header)) th.classList.add('char-age');
    thead.appendChild(th);
  });
  const thAct = document.createElement('th');
  thAct.className = 'char-actions-head';
  thead.appendChild(thAct);
  table.appendChild(thead);

  // Строки персон
  persons.forEach((p, pi) => {
    const tr = document.createElement('tr');
    tr.className = 'char-row';
    cols.forEach((c, ci) => {
      if (ch.hideColsRe && ch.hideColsRe.test(c.header)) return;
      const td = document.createElement('td');
      if (ch.nameRe && ch.nameRe.test(c.header)) td.classList.add('char-name');
      if (ch.ageRe && ch.ageRe.test(c.header)) td.classList.add('char-age');
      td.textContent = p.values[ci];
      tr.appendChild(td);
    });
    // Кнопки в правом углу строки: «Изменить» и «Удалить» (красная)
    const tdAct = document.createElement('td');
    tdAct.className = 'char-actions';
    const editBtn = makePersonBtn('img/edit-icon.svg', 'Изменить', false);
    editBtn.classList.add('edit');
    editBtn.addEventListener('click', e => {
      e.stopPropagation();   // клик по кнопке не открывает просмотр
      openPersonModal(pi);
    });
    const delBtn = makePersonBtn('img/del-person-icon.svg', 'Удалить', true);
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      confirmDeletePerson(pi);
    });
    tdAct.appendChild(editBtn);
    tdAct.appendChild(delBtn);
    tr.appendChild(tdAct);
    table.appendChild(tr);

    // Клик по строке — окно просмотра персоны (поля только для чтения)
    tr.addEventListener('click', () => openPersonModal(pi, true));
  });
  scroll.appendChild(table);
  container.appendChild(scroll);

  if (!persons.length) {
    const empty = document.createElement('div');
    empty.className = 'chars-empty';
    empty.textContent = 'Персон пока нет — добавьте первую кнопкой выше.';
    container.appendChild(empty);
  }

  // Не более maxVisibleRows персон по высоте — дальше прокрутка.
  // Высоту измеряем ПОСЛЕ вставки секции в документ: при первой
  // отрисовке элемент ещё не на экране и offsetHeight равен нулю
  requestAnimationFrame(() => {
    const first = table.querySelector('.char-row');
    if (first && first.offsetHeight > 0) {
      scroll.style.maxHeight =
        (thead.offsetHeight + (first.offsetHeight + 6) * ch.maxVisibleRows + 8) + 'px';
    }
  });
}

// Перерисовка секции персон по свежим данным (после сохранения)
function rerenderPersons() {
  if (!personsSectionEl) return;
  personsSectionEl.innerHTML = '';
  renderCharacters(personsSectionEl);
}

// ------------------------------------------------------------
//  МОДАЛЬНЫЕ ОКНА
// ------------------------------------------------------------

// Показывает окно: поверх контента, контент размыт (как при загрузке)
function openModalEl(backdrop) {
  closeModal();   // второе окно одновременно не открывается
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  document.getElementById('main').classList.add('blur');
  activeModal = backdrop;
}

// Закрывает окно. Правки в полях НЕ сохраняются (сохранение —
// только по кнопке «Завершить» / «Удалить»)
function closeModal() {
  if (!activeModal) return;
  activeModal.remove();
  activeModal = null;
  document.getElementById('main').classList.remove('blur');
}

// Escape закрывает окно без сохранения
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && activeModal) closeModal();
});

// Список для окна персоны: все доступные значения + текущее
function makeModalSelect(options, prefill) {
  const select = document.createElement('select');
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '— выберите —';
  select.appendChild(empty);
  const list = options.slice();
  if (prefill && list.indexOf(prefill) === -1) {
    list.unshift(prefill);   // текущее значение может быть вне списка
  }
  list.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
  select.value = prefill || '';
  return select;
}

// Проверка одного поля окна персоны. Возвращает true, если поле верно.
// Ошибка: красная рамка поля + пояснение под ним
function validatePersonField(f) {
  f.wrap.classList.remove('invalid');
  const v = String(f.input.value).trim();
  let msg = '';
  if (!f.optional && v === '') {
    msg = 'Заполните поле';
  } else if (f.isAge && v !== '' && !/^\d+$/.test(v)) {
    msg = 'Возраст — целое неотрицательное число';
  }
  if (msg) {
    f.wrap.classList.add('invalid');
    f.err.textContent = msg;
    return false;
  }
  return true;
}

// Окно персоны: просмотр (view), добавление (index === null)
// или изменение. В режиме просмотра поля недоступны для правки,
// а кнопка «Изменить» перезагружает окно в режим изменения.
function openPersonModal(index, view) {
  const ch = LAYOUT.characters;
  const persons = collectPersons();
  const editing = !view && index !== null && index !== undefined;
  const person = (editing || view) ? persons[index] : null;
  const cols = personCols();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  // Шапка окна: заголовок, «Изменить» (при просмотре) и крестик
  const head = document.createElement('div');
  head.className = 'modal-head';
  const h = document.createElement('h3');
  h.textContent = view
    ? (person && person.values[0] !== '' ? person.values[0] : 'Просмотр персоны')
    : (editing ? 'Изменение персоны' : 'Новая персона');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.title = 'Закрыть';
  closeBtn.setAttribute('aria-label', 'Закрыть');
  closeBtn.textContent = '✕';
  head.appendChild(h);
  if (view) {
    // «Изменить» — иконка как в строках; окно перезагружается
    // в режим изменения
    const editOpenBtn = makePersonBtn('img/edit-icon.svg', 'Изменить', false);
    editOpenBtn.classList.add('edit');
    editOpenBtn.addEventListener('click', () => openPersonModal(index));
    head.appendChild(editOpenBtn);
  }
  head.appendChild(closeBtn);
  modal.appendChild(head);

  // Поля: все столбцы персоны, включая Примечание (оно — необязательное)
  const fields = [];
  const body = document.createElement('div');
  body.className = 'modal-body';
  cols.forEach((c, ci) => {
    const header = c.header !== '' ? c.header : 'Поле ' + c.col;
    const optional = !!(ch.hideColsRe && ch.hideColsRe.test(header));
    const isAge = !!(ch.ageRe && ch.ageRe.test(header));
    const isRace = !!(ch.raceRe && ch.raceRe.test(header));
    const isReligion = !!(ch.religionRe && ch.religionRe.test(header));
    const prefill = person ? person.values[ci] : '';

    const wrap = document.createElement('div');
    wrap.className = 'person-field';
    const label = document.createElement('label');
    label.textContent = header;
    wrap.appendChild(label);

    let input;
    if (isRace || isReligion) {
      // Списки рас и религий — из всех доступных в таблице
      input = makeModalSelect(
        entityOptions(isRace ? ch.raceRe : ch.religionRe), prefill);
    } else if (isAge) {
      input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.placeholder = 'Целое неотрицательное число';
    } else if (optional) {
      // Примечание — многострочное поле с прокруткой
      input = document.createElement('textarea');
      input.placeholder = 'Необязательно';
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }
    input.classList.add('cell-input', 'person-input');
    if (input.tagName !== 'SELECT') input.value = prefill;
    if (view) input.disabled = true;   // просмотр: поля недоступны для правки
    wrap.appendChild(input);

    const err = document.createElement('div');
    err.className = 'person-err';
    wrap.appendChild(err);
    body.appendChild(wrap);

    const f = { optional: optional, isAge: isAge, input: input, wrap: wrap, err: err };
    // Проверка при снятии фокуса: например, отрицательный возраст
    // сразу подсвечивается, не дожидаясь кнопки «Завершить»
    input.addEventListener('blur', () => validatePersonField(f));
    // Исправление значения снимает ошибку на лету
    input.addEventListener('input', () => {
      if (f.wrap.classList.contains('invalid')) validatePersonField(f);
    });
    fields.push(f);
  });
  modal.appendChild(body);

  // Низ окна: кнопка «Завершить» (в режиме просмотра её нет)
  if (!view) {
    const foot = document.createElement('div');
    foot.className = 'modal-foot';
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'modal-submit';
    submit.textContent = 'Завершить';
    foot.appendChild(submit);
    modal.appendChild(foot);

    submit.addEventListener('click', async () => {
    // Проверки: все поля обязательны (кроме Примечания),
    // возраст — целое неотрицательное число
    let firstBad = null;
    fields.forEach(f => {
      if (!validatePersonField(f) && !firstBad) firstBad = f;
    });
    if (firstBad) {
      firstBad.input.focus();   // завершить не получится, пока есть ошибки
      return;
    }

    // Значения персоны: возраст — числом, остальное — текстом
    const vals = fields.map(f => {
      const v = String(f.input.value).trim();
      return f.isAge ? (v === '' ? '' : Number(v)) : v;
    });
    const list = persons.map(p => p.values.slice());
    if (editing) list[index] = vals;
    else list.push(vals);

    submit.disabled = true;
    if (await savePersons(list)) {
      closeModal();
    } else {
      submit.disabled = false;
    }
    });
  }

  backdrop.appendChild(modal);
  // Закрытие — ТОЛЬКО крестиком или Escape (клик по затемнению
  // не закрывает окно, чтобы случайный клик или выделение текста
  // не потеряли введённые данные). Правки при этом не сохраняются.
  closeBtn.addEventListener('click', closeModal);
  openModalEl(backdrop);
}

// Подтверждение удаления персоны
function confirmDeletePerson(index) {
  const persons = collectPersons();
  const name = persons[index] ? persons[index].values[0] : '';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const p = document.createElement('p');
  p.className = 'confirm-text';
  p.textContent = 'Удалить персону «' + name + '»?';

  const actions = document.createElement('div');
  actions.className = 'confirm-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'confirm-btn';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', closeModal);
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'confirm-btn danger';
  delBtn.textContent = 'Удалить';
  delBtn.addEventListener('click', async () => {
    const list = persons.filter((_, i) => i !== index).map(x => x.values.slice());
    delBtn.disabled = true;
    if (await savePersons(list)) {
      closeModal();
    } else {
      delBtn.disabled = false;
    }
  });
  actions.appendChild(cancelBtn);
  actions.appendChild(delBtn);

  modal.appendChild(p);
  modal.appendChild(actions);
  backdrop.appendChild(modal);
  openModalEl(backdrop);
}

// ------------------------------------------------------------
//  СОХРАНЕНИЕ
// ------------------------------------------------------------

// Отправляет на сервер ПОЛНЫЙ список персон (перезапись строк 27+).
// Строки листа не добавляются и не удаляются.
async function savePersons(characters) {
  beginRequest();
  try {
    const result = await callApi({
      action: 'saveCharacters',
      characters: characters
    });
    if (handleSessionProblem(result)) return false;
    if (result.status !== 'success') {
      endRequest(false, result.message);
      alert('Ошибка сохранения персон: ' + result.message);
      return false;
    }
    // Свежий снимок: обновляем поля по месту и секцию персон целиком
    applySnapshot(result);
    rerenderPersons();
    endRequest(true, 'Сохранено');
    return true;
  } catch (e) {
    endRequest(false, e.message);
    alert('Ошибка соединения: ' + e.message);
    return false;
  }
}