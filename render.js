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
    const title = SHEET_TITLES[s.name] || s.name;
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (s.name === currentSheet ? ' active' : '');
    btn.title = title;
    btn.appendChild(makeNavIcon(s.name));
    const label = document.createElement('span');
    label.className = 'nav-label';
    label.textContent = title;
    btn.appendChild(label);
    btn.onclick = () => switchSheet(s.name);
    nav.appendChild(btn);
  });
}

// Иконка вкладки: файл из папки img (путь — в SHEET_ICONS, config.js).
// Картинка красится цветом темы через CSS-маску (background-color: currentColor).
function makeNavIcon(sheetName) {
  const wrap = document.createElement('span');
  wrap.className = 'nav-icon';
  wrap.setAttribute('role', 'img');
  const src = SHEET_ICONS[sheetName];
  if (src) {
    wrap.style.setProperty('--icon', 'url("' + src + '")');
  }
  return wrap;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ============================================================
//  ШАПКА: название государства и три показателя
// ============================================================

// Кэш «Полное название государства» с листа «Основная информация»
// (шапка сохраняет его и при переключении на другие вкладки)
let headerStateName = '';

// Ищем поле «Полное название государства» по подписи среди секций макета
function findFullStateNameCell() {
  for (const section of LAYOUT.sections) {
    for (const f of section.fields) {
      if (/полное\s+название/i.test(cellAt(f.label[0], f.label[1]).display)) {
        return f.value;
      }
    }
  }
  return null;
}

// В шапке — значение «Полное название государства» вместо названия таблицы.
// Если текст не влезает в одну строку — включается перенос строк
// и шрифт уменьшается на 2 пт (20px -> 17px).
function updateHeaderTitle() {
  const cell = findFullStateNameCell();
  if (cell) {
    const v = cellAt(cell[0], cell[1]).display;
    if (v !== '') headerStateName = v;
  }
  const title = document.getElementById('table-title');
  title.textContent = headerStateName || tableName;
  title.classList.remove('skeleton');   // скелетон показывается только до загрузки
  title.classList.remove('compact');
  if (title.scrollWidth > title.clientWidth) {
    title.classList.add('compact');
  }
}

// Три показателя в шапке: казна, баланс, рекруты.
// Значения передаёт main.js (пока — случайные заглушки).
function updateHeaderStats(stats) {
  setHeaderStat('stat-treasury', 'Казна на конец хода',
    formatStatNumber(stats.treasury),
    stats.treasury <= 0 ? 'neg' : 'neutral');
  setHeaderStat('stat-balance', 'Баланс',
    (stats.balance > 0 ? '+' : '') + formatStatNumber(stats.balance),
    stats.balance > 0 ? 'pos' : (stats.balance < 0 ? 'neg' : 'neutral'));
  setHeaderStat('stat-recruits', 'Рекруты в конце хода',
    formatStatNumber(stats.recruits), 'neutral');
}

function setHeaderStat(id, label, value, valueClass) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.classList.remove('skeleton');   // полоса-заглушка — только до загрузки
  el.append(label + ': ');
  const b = document.createElement('b');
  b.className = valueClass;
  b.textContent = value;
  el.appendChild(b);
}

// Разряды разделяем пробелом: 12345 -> «12 345»
function formatStatNumber(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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

  // 5. Обновляем название государства в шапке
  updateHeaderTitle();
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

  // Диаграммы под списком сущностей: идут слева направо в одном ряду,
  // при нехватке места — переносятся на следующую строку
  // (настройки — entity.charts в config.js)
  if (entity.charts && entity.charts.length) {
    const row = document.createElement('div');
    row.className = 'entity-charts';
    entity.charts.forEach(chart => {
      const box = document.createElement('div');
      box.id = chart.id;
      box.className = 'entity-chart';
      row.appendChild(box);
      renderEntityChart(box, entity, chart);
    });
    container.appendChild(row);
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