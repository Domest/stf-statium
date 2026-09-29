// ============================================================
//  RENDER.JS — отрисовка вкладок навигации и содержимого листов.
//  Макет задан в LAYOUT (config.js), данные читаются через
//  cellAt (api.js), градации — в tints.js, диаграмма — в charts.js.
// ============================================================

// ============================================================
//  НАВИГАЦИЯ ПО ЛИСТАМ
// ============================================================
function renderNav() {
  const nav = document.getElementById('sheets-nav');
  nav.innerHTML = '';

  if (!sheetsList.length) {
    nav.innerHTML = '<div class="nav-empty">В таблице нет листов</div>';
    return;
  }

  sheetsList.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (s.name === currentSheet ? ' active' : '');
    btn.title = s.name;
    btn.appendChild(makeNavIcon());
    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = s.name;
    btn.appendChild(label);
    btn.onclick = () => switchSheet(s.name);
    nav.appendChild(btn);
  });
}

// Иконка вкладки (inline SVG)
function makeNavIcon() {
  const wrap = document.createElement('span');
  wrap.className = 'nav-icon';
  wrap.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<rect x="4" y="3" width="16" height="18" rx="2"/>' +
    '<path d="M8 7h8M8 11h8M8 15h5"/></svg>';
  return wrap;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// Отображение активного листа.
// Разобран только «Основная информация»; для остальных — заглушка.
function renderCurrentSheet() {
  if (currentSheet === 'Основная информация') {
    renderPage();
  } else {
    renderPlaceholder();
  }
}

function renderPlaceholder() {
  const content = document.getElementById('content');
  content.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'sheet-placeholder';
  div.textContent = 'Отображение листа «' + currentSheet +
    '» будет добавлено позже. Данные этого листа уже доступны через API.';
  content.appendChild(div);
}

// ============================================================
//  РЕНДЕР «Основная информация»
// ============================================================
function makeSection(wide) {
  const sec = document.createElement('section');
  sec.className = wide ? 'block block-wide' : 'block';
  return sec;
}

function addSectionTitle(container, titleCell) {
  const h = document.createElement('h2');
  h.className = 'section-title';
  h.textContent = cellAt(titleCell[0], titleCell[1]).display;
  container.appendChild(h);
}

function renderPage() {
  const content = document.getElementById('content');
  content.innerHTML = '';

  // 1. Секции «название — значение»
  LAYOUT.sections.forEach(section => {
    const sec = makeSection();
    addSectionTitle(sec, section.title);
    section.fields.forEach(f => {
      const label = cellAt(f.label[0], f.label[1]).display;
      renderField(sec, label, f.value[0], f.value[1]);
    });
    content.appendChild(sec);
  });

  // 2. Советники
  const advSec = makeSection();
  renderAdvisors(advSec);
  content.appendChild(advSec);

  // 3. Списки сущностей (Раса, Религия, Сословия) — секции на всю ширину
  LAYOUT.entities.forEach(entity => {
    const sec = makeSection(true);
    renderEntity(sec, entity);
    content.appendChild(sec);
  });

  // 4. Персонажи — таблица на всю ширину
  const charSec = makeSection(true);
  renderCharacters(charSec);
  content.appendChild(charSec);
}

// Поле «название -> значение»: <p> с названием, поле ввода / список / <p> для формулы
function renderField(container, labelText, row, col) {
  const cell = cellAt(row, col);
  const div = document.createElement('div');
  div.className = 'field';

  const p = document.createElement('p');
  p.className = 'label';
  p.textContent = labelText;
  div.appendChild(p);

  if (cell.computed) {
    const v = document.createElement('p');
    v.className = 'computed';
    v.dataset.row = row;
    v.dataset.col = col;
    v.title = 'Вычисляется формулой — редактирование запрещено';
    v.textContent = cell.display;
    div.appendChild(v);
  } else if (cell.options && cell.options.length) {
    div.appendChild(makeSelect(row, col, cell.display, cell.options));
  } else {
    div.appendChild(makeInput(row, col, cell.display));
  }
  container.appendChild(div);
}

function renderAdvisors(container) {
  const adv = LAYOUT.advisors;
  addSectionTitle(container, adv.title);

  // Строки советников: идём вниз от строки заголовка, пока заполнено имя
  let row = adv.title[0] + 1;
  while (cellAt(row, adv.nameCol).display !== '') {
    const name = cellAt(row, adv.nameCol).display;
    const h3 = document.createElement('h3');
    h3.className = 'entity-name';
    h3.textContent = name;
    container.appendChild(h3);

    adv.params.forEach(param => {
      const header = cellAt(param.header[0], param.header[1]).display;
      renderField(container, header, row, param.col);
    });
    row++;
  }
}

// Список сущностей (Раса / Религия / Сословия):
// вид таблицы без границ ячеек — строка-заголовок + строка на каждую сущность
function renderEntity(container, entity) {
  addSectionTitle(container, entity.title);

  const table = document.createElement('table');
  table.className = 'entity-table';

  // Заголовки колонок — из строки-заголовка листа
  const thead = document.createElement('tr');
  LAYOUT.ENTITY_COLS.forEach(col => {
    const th = document.createElement('th');
    th.textContent = cellAt(entity.headerRow, col).display;
    thead.appendChild(th);
  });
  table.appendChild(thead);

  // Строки сущностей: вниз, пока заполнен столбец «Название»
  let row = entity.headerRow + 1;
  while (cellAt(row, entity.nameCol).display !== '') {
    const tr = document.createElement('tr');
    LAYOUT.ENTITY_COLS.forEach(col => {
      const cell = cellAt(row, col);
      const header = cellAt(entity.headerRow, col).display;
      const tintKey = tintKeyForHeader(entity, header);
      const td = document.createElement('td');
      if (cell.computed) {
        const p = document.createElement('p');
        p.className = 'computed';
        p.dataset.row = row;
        p.dataset.col = col;
        p.title = 'Вычисляется формулой — редактирование запрещено';
        p.textContent = cell.display;
        if (tintKey) {
          // формульные ячейки тоже красятся градиентом по значению
          p.dataset.tint = tintKey;
          refreshTint(p);
        }
        td.appendChild(p);
      } else if (entity.readonlyColsRe && entity.readonlyColsRe.test(header)) {
        // Лояльность и Статус (Сословия) — только чтение
        const p = document.createElement('p');
        p.className = 'readonly-value';
        p.dataset.row = row;
        p.dataset.col = col;
        p.title = 'Редактирование запрещено';
        p.textContent = cell.display;
        if (tintKey) {
          p.dataset.tint = tintKey;
          refreshTint(p);
        }
        td.appendChild(p);
      } else if (cell.options && cell.options.length) {
        const select = makeSelect(row, col, cell.display, cell.options);
        if (tintKey) attachTint(select, tintKey);
        td.appendChild(select);
      } else {
        const input = makeInput(row, col, cell.display);
        if (tintKey) attachTint(input, tintKey);
        td.appendChild(input);
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
    row++;
  }
  container.appendChild(table);

  // Радиальная диаграмма долей населения — только для секции «Раса»
  if (entity.chart) {
    const chartBox = document.createElement('div');
    chartBox.id = 'race-chart';
    container.appendChild(chartBox);
    renderRaceChart(chartBox, entity);
  }
}

// Персонажи «Правящий дом (династия)» — табличный вид
function renderCharacters(container) {
  const ch = LAYOUT.characters;
  addSectionTitle(container, ch.title);

  const table = document.createElement('table');
  table.className = 'characters';

  // Заголовки столбцов берём из строки-заголовка листа (непустые ячейки)
  const thead = document.createElement('tr');
  const headerCells = [];
  for (let c = 1; c <= 14; c++) {
    const t = cellAt(ch.headerRow, c).display;
    if (t !== '') headerCells.push({ col: c, text: t });
  }
  headerCells.forEach(hc => {
    const th = document.createElement('th');
    th.textContent = hc.text;
    thead.appendChild(th);
  });
  table.appendChild(thead);

  // Данные: все строки ниже строки-заголовка до конца листа
  const lastRow = currentData.length;
  for (let row = ch.headerRow + 1; row <= lastRow; row++) {
    const rowHasContent = headerCells.some(hc => cellAt(row, hc.col).display !== '');
    if (!rowHasContent) continue;

    const tr = document.createElement('tr');
    headerCells.forEach(hc => {
      const cell = cellAt(row, hc.col);
      const td = document.createElement('td');
      if (cell.computed) {
        td.className = 'computed';
        td.dataset.row = row;
        td.dataset.col = hc.col;
        td.title = 'Вычисляется формулой — редактирование запрещено';
        td.textContent = cell.display;
      } else if (cell.options && cell.options.length) {
        td.appendChild(makeSelect(row, hc.col, cell.display, cell.options));
      } else {
        td.appendChild(makeInput(row, hc.col, cell.display));
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  }
  container.appendChild(table);
}