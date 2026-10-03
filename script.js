// ============================================================
//  ПОДКЛЮЧЕНИЕ И СЕССИЯ
// ============================================================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxS0PfbjYRRwkXmIh9f-Ii__h0kq73jXtDRbntUHlK76wy70W-66Ps7MDEuejk3NmdKZQ/exec';
const token = localStorage.getItem('session_token');
const tableName = localStorage.getItem('table_name');

if (!token || !tableName) {
  location.href = 'index.html';
}

// В заголовке — только название таблицы
document.getElementById('table-title').textContent = tableName;

// ============================================================
//  ЛИСТЫ (вкладки навигации)
// ============================================================
let sheetsList = [];
let currentSheet = localStorage.getItem('sheet_name') || null;

// ============================================================
//  МАКЕТ ЛИСТА «Основная информация» (координаты [строка, столбец], 1-индексные)
//
//    столбец B — названия переменных,  D — их значения   (Основной блок, Состояние государства)
//    столбец F — названия переменных,  G — их значения   (Принцип государства, Население, Престиж)
//    столбцы I..N — списки Раса / Религия / Сословия (строка-заголовок + данные)
//    Советники: B — имя советника, C/D/E/G — параметры
//    Персонажи: B..G (Имя, Раса, Религия, Возраст, Статус, Примечание) — таблица
// ============================================================
const LAYOUT = {
  sections: [
    { title: [2, 2], fields: [
      { label: [3, 2],  value: [3, 4] },
      { label: [4, 2],  value: [4, 4] },
      { label: [5, 2],  value: [5, 4] },
      { label: [6, 2],  value: [6, 4] },
      { label: [7, 2],  value: [7, 4] },
      { label: [8, 2],  value: [8, 4] },
      { label: [9, 2],  value: [9, 4] },
      { label: [10, 2], value: [10, 4] }
    ]},
    { title: [12, 2], fields: [
      { label: [13, 2], value: [13, 4] },
      { label: [14, 2], value: [14, 4] },
      { label: [15, 2], value: [15, 4] },
      { label: [16, 2], value: [16, 4] },
      { label: [17, 2], value: [17, 4] },
      { label: [18, 2], value: [18, 4] }
    ]},
    { title: [2, 6], fields: [
      { label: [3, 6], value: [3, 7] },
      { label: [4, 6], value: [4, 7] },
      { label: [5, 6], value: [5, 7] },
      { label: [6, 6], value: [6, 7] },
      { label: [7, 6], value: [7, 7] }
    ]},
    { title: [9, 6], fields: [
      { label: [10, 6], value: [10, 7] },
      { label: [11, 6], value: [11, 7] },
      { label: [12, 6], value: [12, 7] }
    ]},
    { title: [14, 6], fields: [
      { label: [15, 6], value: [15, 7] },
      { label: [16, 6], value: [16, 7] },
      { label: [17, 6], value: [17, 7] }
    ]}
  ],

  // «Советники правителя»: имя советника — подпись, параметры — значения
  advisors: {
    title: [20, 2],
    nameCol: 2,
    params: [
      { header: [20, 3], col: 3 },   // Уровень
      { header: [20, 4], col: 4 },   // Тип советника
      { header: [20, 5], col: 5 },   // Бонус
      { header: [20, 7], col: 7 }    // Содержание, ОП/ход
    ]
  },

  // Списки сущностей: каждая строка -> поля «<Имя> — <Колонка>»
  entities: [
    // Раса: под списком — радиальная диаграмма долей населения
    { title: [2, 9],  headerRow: 3,  nameCol: 9,
      chart: true, populationRe: /числен|населени/i },
    { title: [10, 9], headerRow: 11, nameCol: 9 },   // Религия
    // Сословия: Лояльность и Статус — только чтение;
    // Лояльность — градация красный->зелёный, Влияние — фиолетовый->жёлтый
    { title: [18, 9], headerRow: 19, nameCol: 9,
      readonlyColsRe: /лояльн|статус/i,
      tints: [
        { re: /лояльн/i, key: 'loyalty' },
        { re: /влияни/i, key: 'influence' }
      ] }
  ],
  ENTITY_COLS: [9, 10, 11, 12, 13, 14],             // I..N

  // «Правящий дом (династия)» — единственный табличный блок
  characters: { title: [25, 2], headerRow: 26 }
};

// Специальная нормализация значений отдельных полей (ключ — "строка,столбец").
// «Хэштег»: итоговое значение всегда с ОДНОЙ решёткой в начале —
// если пользователь ввёл текст без «#», она добавляется; если «#» уже
// стоит в начале — текст не меняется (дубли решёток схлопываются в одну).
const FIELD_TRANSFORMS = {
  '4,4': 'hashtag'   // Хэштег (Основной блок)
};

function transformValue(row, col, value) {
  if (FIELD_TRANSFORMS[row + ',' + col] === 'hashtag') {
    const v = String(value).trim().replace(/^#+/, '');
    return v === '' ? '' : '#' + v;
  }
  return value;
}

// ============================================================
//  ЦВЕТОВЫЕ ГРАДАЦИИ И ДИАГРАММА «РАСА»
// ============================================================

// Градиенты 0 -> 100 для полей с цветовой градацией.
// Цвет считается в HSL: интерполяция идёт по цветовому ТОНУ (h1 -> h2),
// поэтому промежуточные значения тоже получают насыщенный оттенок,
// а не грязно-бурый, как при смешивании RGB-компонент.
//   h1 -> h2 — тон в градусах (может пересекать границу 360),
//   s — насыщенность %, l — светлота %
const TINT_GRADIENTS = {
  loyalty:   { h1: 0,   h2: 120, s: 85, l: 58 },  // красный -> оранжевый -> жёлтый -> зелёный
  influence: { h1: 270, h2: 420, s: 90, l: 62 }    // фиолетовый -> пурпурный -> оранжевый -> жёлтый
};

// Тон градиента для значения 0..100 (t — доля 0..1)
function tintHue(grad, t) {
  return ((grad.h1 + (grad.h2 - grad.h1) * t) % 360 + 360) % 360;
}

// Число из отображаемого значения ячейки («18 000», «-3,5», «42%»)
function parseCellNumber(text) {
  const n = parseFloat(String(text).replace(/[\s\u00A0]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

// Ключ градации для колонки сущности по тексту её заголовка
function tintKeyForHeader(entity, header) {
  if (!entity.tints) return null;
  for (const t of entity.tints) {
    if (t.re.test(header)) return t.key;
  }
  return null;
}

// Сырое числовое значение ячейки (если display-строка не распарсилась)
function rawNumberAt(row, col) {
  const r = row - 1, c = col - 1;
  if (currentData && currentData[r] && typeof currentData[r][c] === 'number') {
    return currentData[r][c];
  }
  return null;
}

// Подбирает цвет по значению 0..100 и записывает его в CSS-переменные элемента
function refreshTint(el) {
  const grad = TINT_GRADIENTS[el.dataset.tint];
  if (!grad) return;
  let n = parseCellNumber(el.tagName === 'P' ? el.textContent : el.value);
  if (n === null) {
    // display может быть нечисловым (формат ячейки) — берём сырое значение
    n = rawNumberAt(el.dataset.row, el.dataset.col);
  }
  if (n === null) {
    el.style.removeProperty('--tint-color');
    el.style.removeProperty('--tint-bg');
    return;
  }
  const t = Math.max(0, Math.min(1, n / 100));
  const core = Math.round(tintHue(grad, t)) + ', ' + grad.s + '%, ' + grad.l + '%';
  el.style.setProperty('--tint-color', 'hsl(' + core + ')');
  el.style.setProperty('--tint-bg', 'hsla(' + core + ', .18)');
}

// Вешает градацию на редактируемое поле + обновляет цвет при вводе
function attachTint(el, key) {
  el.dataset.tint = key;
  refreshTint(el);
  el.addEventListener('input', () => refreshTint(el));
  el.addEventListener('change', () => refreshTint(el));
}

// Столбец сущности по регулярному выражению для заголовка
function findEntityCol(entity, re) {
  for (const col of LAYOUT.ENTITY_COLS) {
    if (re.test(cellAt(entity.headerRow, col).display)) return col;
  }
  return null;
}

// ---- Радиальная диаграмма (пончик) долей населения по расам ----

const CHART_COLORS = ['#8C5938', '#946937', '#886E35', '#706624', '#707639',
  '#146EAF', '#A8574B', '#5A7D4A', '#7A5BA8', '#3E8C7A'];

function fmtPercent(p) {
  const r = Math.round(p * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')) + '%';
}

// Дуга кольца (пончика): от угла a1 до a2 в градусах (0 — сверху, по часовой)
function donutArcPath(cx, cy, rOut, rIn, a1, a2) {
  const pt = (r, a) => {
    const rad = (a - 90) * Math.PI / 180;
    return (cx + r * Math.cos(rad)).toFixed(2) + ' ' + (cy + r * Math.sin(rad)).toFixed(2);
  };
  const large = (a2 - a1) % 360 > 180 ? 1 : 0;
  return 'M ' + pt(rOut, a1) +
    ' A ' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + pt(rOut, a2) +
    ' L ' + pt(rIn, a2) +
    ' A ' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + pt(rIn, a1) +
    ' Z';
}

// Строит диаграмму внутри контейнера (контейнер очищается)
function renderRaceChart(container, entity) {
  container.innerHTML = '';
  if (!entity) return;

  // Столбец с численностью ищем по заголовку («Численность», «Население»…)
  const popCol = findEntityCol(entity, entity.populationRe);
  if (!popCol) return;

  const items = [];
  let row = entity.headerRow + 1;
  while (cellAt(row, entity.nameCol).display !== '') {
    const v = parseCellNumber(cellAt(row, popCol).display);
    if (v !== null && v > 0) {
      items.push({ name: cellAt(row, entity.nameCol).display, value: v });
    }
    row++;
  }
  if (!items.length) return;

  const total = items.reduce((s, it) => s + it.value, 0);
  const size = 150, cx = size / 2, cy = size / 2, rOut = 72, rIn = 44;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);

  let angle = 0;
  items.forEach((it, i) => {
    it.color = CHART_COLORS[i % CHART_COLORS.length];
    it.percent = it.value / total * 100;
    const sweep = it.value / total * 360;
    // Полный круг (единственная раса) одной дугой не рисуется — делим пополам
    const segs = sweep >= 359.99
      ? [[angle, angle + 180], [angle + 180, angle + 360]]
      : [[angle, angle + sweep]];
    segs.forEach(seg => {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', donutArcPath(cx, cy, rOut, rIn, seg[0], seg[1]));
      path.setAttribute('fill', it.color);
      path.setAttribute('stroke', '#23180A');
      path.setAttribute('stroke-width', '2');
      svg.appendChild(path);
    });
    angle += sweep;
  });

  const wrap = document.createElement('div');
  wrap.className = 'race-chart';
  wrap.appendChild(svg);

  // Подписи: цветной маркер, название расы и её доля в процентах
  const legend = document.createElement('div');
  legend.className = 'race-chart-legend';
  items.forEach(it => {
    const item = document.createElement('div');
    item.className = 'race-legend-item';
    const chip = document.createElement('span');
    chip.className = 'race-legend-chip';
    chip.style.background = it.color;
    const text = document.createElement('span');
    text.textContent = it.name + ' — ' + fmtPercent(it.percent);
    item.appendChild(chip);
    item.appendChild(text);
    legend.appendChild(item);
  });
  wrap.appendChild(legend);
  container.appendChild(wrap);
}

// ============================================================
//  ДАННЫЕ
// ============================================================
let currentData = null;        // сырые значения (getValues)
let currentDisplay = null;     // отформатированные значения (getDisplayValues)
let currentMask = null;        // formulaMask[r][c] === true -> формулы, только чтение
let currentValidations = null; // "строка,столбец" -> варианты выпадающего списка

// Число запросов к серверу. Пока запрос идёт — данные на экране не трогаем.
let pendingRequests = 0;

// Все запросы идут с указанием активного листа
async function callApi(payload) {
  const res = await fetch(WEB_APP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({
      ...payload,
      token: token,
      tableName: tableName,
      sheetName: currentSheet
    })
  });
  return res.json();
}

// Доступ к ячейке по координатам макета [строка, столбец] (1-индексным)
function cellAt(row, col) {
  const r = row - 1, c = col - 1;
  const inDisplay = currentDisplay && r >= 0 && r < currentDisplay.length &&
                    currentDisplay[r] && c >= 0 && c < currentDisplay[r].length;
  return {
    display: inDisplay ? String(currentDisplay[r][c]) : '',
    computed: !!(currentMask && currentMask[r] && currentMask[r][c]),
    options: (currentValidations && currentValidations[row + ',' + col]) || null
  };
}

// ============================================================
//  ИНДИКАТОР СТАТУСА В ШАПКЕ
// ============================================================
const statusEl = document.getElementById('update-status');

function setStatus(type, text) {
  statusEl.className = 'show ' + type;
  statusEl.textContent = text;
}

function beginRequest() {
  pendingRequests++;
  setStatus('loading', 'Обновление данных…');
}

function endRequest(ok, message) {
  pendingRequests = Math.max(0, pendingRequests - 1);
  if (pendingRequests > 0) return; // ещё есть незавершённые запросы
  const time = new Date().toLocaleTimeString();
  if (ok) {
    setStatus('success', (message || 'Данные обновлены') + ' · ' + time);
  } else {
    setStatus('error', 'Ошибка: ' + message);
  }
}

// ============================================================
//  СЕССИИ
// ============================================================
function handleSessionProblem(result) {
  if (result.code === 'SESSION_EXPIRED') {
    alert('Сессия истекла. Войдите заново.');
    clearSession();
    location.href = 'index.html';
    return true;
  }
  if (result.code === 'WRONG_TABLE') {
    alert('Эта сессия недействительна для данной таблицы.');
    clearSession();
    location.href = 'index.html';
    return true;
  }
  return false;
}

function clearSession() {
  localStorage.removeItem('session_token');
  localStorage.removeItem('session_expires');
  localStorage.removeItem('table_name');
  localStorage.removeItem('sheet_name');
}

// ============================================================
//  ВАЛИДАЦИЯ ВВОДА
// ============================================================
const VALIDATION_POPUP_TIMEOUT = 6000; // мс

// Ячейка «числовая», если её текущее сырое значение — число
function isNumericCell(row, col) {
  const r = row - 1, c = col - 1;
  return !!(currentData && currentData[r] && typeof currentData[r][c] === 'number');
}

// Проверка введённого значения. Возвращает текст ошибки или null, если всё верно.
function validateValue(value, isNumeric) {
  if (isNumeric) {
    // Только цифры, знак минус и десятичная дробь (точка или запятая);
    // пробелы допустимы как разделители разрядов («18 000»).
    if (/^-?\d+(?:[\s\u00A0]?\d+)*(?:[.,]\d+)?$/.test(value)) return null;
    return 'Значение должно быть числом: только цифры, знак минус и десятичная дробь';
  }
  if (value.trim().length <= 2) {
    return 'Текст должен быть длиннее 2 символов';
  }
  // Только буквы любых алфавитов, цифры, пробелы и обычная пунктуация.
  // Эмодзи и спецсимволы не проходят белый список.
  if (!/^[\p{L}\p{N}\s.,()\-:;+%№#«»"'/&]*$/u.test(value)) {
    return 'Текст содержит недопустимые символы: эмодзи и спецсимволы запрещены';
  }
  return null;
}

function showValidationPopup(el, message) {
  hideValidationPopup(el);
  const popup = document.createElement('div');
  popup.className = 'validation-popup';
  popup.textContent = message;
  if (el.parentElement) el.parentElement.appendChild(popup);
  el._popupTimer = setTimeout(() => hideValidationPopup(el), VALIDATION_POPUP_TIMEOUT);
}

function hideValidationPopup(el) {
  if (el._popupTimer) {
    clearTimeout(el._popupTimer);
    el._popupTimer = null;
  }
  if (el.parentElement) {
    el.parentElement.querySelectorAll(':scope > .validation-popup')
      .forEach(p => p.remove());
  }
}

// ============================================================
//  НАВИГАЦИЯ ПО ЛИСТАМ
// ============================================================
async function loadSheets() {
  beginRequest();
  try {
    const result = await callApi({ action: 'listSheets' });
    if (handleSessionProblem(result)) return false;

    if (result.status !== 'success') {
      endRequest(false, result.message);
      document.getElementById('sheets-nav').innerHTML =
        '<div class="nav-loading">Ошибка: ' + escapeHtml(result.message) + '</div>';
      return false;
    }

    sheetsList = result.sheets || [];

    // Картинка таблицы в шапке (из конфига Code.gs)
    const icon = document.getElementById('table-icon');
    icon.onerror = () => { icon.hidden = true; }; // битая ссылка — просто скрываем
    if (result.imageUrl) {
      icon.hidden = false;
      icon.src = result.imageUrl;
    } else {
      icon.hidden = true;
    }

    // Активный лист: сохранённый (если ещё существует) или лист по умолчанию
    const stored = currentSheet;
    if (!stored || !sheetsList.some(s => s.name === stored)) {
      currentSheet = result.defaultSheet && sheetsList.some(s => s.name === result.defaultSheet)
        ? result.defaultSheet
        : (sheetsList[0] ? sheetsList[0].name : null);
    }

    renderNav();
    endRequest(true, 'Список листов получен');
    return true;
  } catch (e) {
    endRequest(false, e.message);
    document.getElementById('sheets-nav').innerHTML =
      '<div class="nav-loading">Ошибка соединения</div>';
    return false;
  }
}

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

function switchSheet(name) {
  if (name === currentSheet) return;
  currentSheet = name;
  localStorage.setItem('sheet_name', name);
  renderNav();
  loadData();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

// ============================================================
//  ЗАГРУЗКА ДАННЫХ ЛИСТА
// ============================================================
async function loadData() {
  if (!currentSheet) {
    document.getElementById('content').textContent = 'Нет доступных листов.';
    return;
  }
  beginRequest();
  try {
    const result = await callApi({ action: 'getTableData' });
    if (handleSessionProblem(result)) return;

    if (result.status !== 'success') {
      endRequest(false, result.message);
      document.getElementById('status').textContent = 'Ошибка: ' + result.message;
      return;
    }
    // Сервер мог подставить лист по умолчанию — синхронизируемся
    if (result.sheet && result.sheet !== currentSheet) {
      currentSheet = result.sheet;
      localStorage.setItem('sheet_name', currentSheet);
      renderNav();
    }
    // Перерисовываем ТОЛЬКО после успешного ответа:
    // до этого момента прежние значения остаются на экране.
    currentData = result.data || [];
    currentDisplay = result.display || [];
    currentMask = result.formulaMask || [];
    currentValidations = result.validations || {};
    renderCurrentSheet();
    endRequest(true);
  } catch (e) {
    endRequest(false, e.message);
    document.getElementById('status').textContent = 'Ошибка соединения: ' + e.message;
  }
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

// ============================================================
//  РЕДАКТИРОВАНИЕ
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

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================
document.getElementById('refresh-btn').onclick = loadData;

document.getElementById('logout-btn').onclick = () => {
  clearSession();
  location.href = 'index.html';
};

// Автопроверка срока жизни сессии, затем — список листов и данные активного листа
const expiresAt = parseInt(localStorage.getItem('session_expires') || '0', 10);
if (expiresAt && Date.now() > expiresAt) {
  handleSessionProblem({ code: 'SESSION_EXPIRED' });
} else {
  loadSheets().then(ok => { if (ok) loadData(); });
}