// ============================================================
//  MAIN.JS — точка входа: инициализация, загрузка листов и данных.
//  Подключается ПОСЛЕДНИМ, после всех остальных js-файлов:
//  config.js, api.js, validation.js, tints.js, charts.js,
//  render.js, edit.js, main.js
// ============================================================

// Без активной сессии — обратно на страницу входа
if (!token || !tableName) {
  location.href = 'index.html';
}

// В заголовке — только название таблицы
document.getElementById('table-title').textContent = tableName;

// ============================================================
//  ЛИСТЫ (вкладки навигации)
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

    // В навигации показываем только вкладки из VISIBLE_SHEETS (config.js),
    // в порядке этого списка
    const allSheets = result.sheets || [];
    sheetsList = VISIBLE_SHEETS
      .filter(name => allSheets.some(s => s.name === name))
      .map(name => allSheets.find(s => s.name === name));

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

function switchSheet(name) {
  if (name === currentSheet) return;
  currentSheet = name;
  localStorage.setItem('sheet_name', name);
  renderNav();
  setSidebarOpen(false);   // на мобильных закрываем навигацию
  // Контент скрывается, по центру — индикатор «Загрузка»
  document.getElementById('main').classList.add('loading');
  loadData(false);
}

// ============================================================
//  ЗАГРУЗКА ДАННЫХ ЛИСТА
// ============================================================
// isRefresh === true — загрузка по кнопке «Обновить»:
//   индикатор поверх текущего контента, контент размыт.
// isRefresh === false — начальная загрузка или переключение вкладки:
//   контент скрыт, по центру — «Загрузка» с крутящейся иконкой.
async function loadData(isRefresh) {
  const main = document.getElementById('main');
  main.classList.toggle('refreshing', !!isRefresh);
  main.classList.toggle('loading', !isRefresh);

  if (!currentSheet) {
    main.classList.remove('loading', 'refreshing');
    document.getElementById('content').textContent = 'Нет доступных листов.';
    return;
  }
  beginRequest();
  try {
    const result = await callApi({ action: 'getTableData' });
    if (handleSessionProblem(result)) return;

    if (result.status !== 'success') {
      endRequest(false, result.message);
      main.classList.remove('loading', 'refreshing');
      setHeaderSkeleton(false);
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
    // Шапка: название государства и показатели — вместо скелетонов
    updateHeaderTitle();
    updateHeaderStats(headerStatsStub);
    setHeaderSkeleton(false);
    // Плавная смена вида: индикатор гаснет, контент проявляется
    main.classList.remove('loading', 'refreshing');
    endRequest(true);
  } catch (e) {
    endRequest(false, e.message);
    main.classList.remove('loading', 'refreshing');
    setHeaderSkeleton(false);
    document.getElementById('status').textContent = 'Ошибка соединения: ' + e.message;
  }
}

// ============================================================
//  ИНИЦИАЛИЗАЦИЯ
// ============================================================
// Три показателя в шапке: казна на конец хода, баланс, рекруты.
// Пока переменные не используются — случайные значения-заглушки;
// показываются только после первой успешной загрузки контента.
const headerStatsStub = {
  treasury: Math.round(Math.random() * 6000 - 400),   // Казна на конец хода
  balance: Math.round(Math.random() * 300) - 150,     // Баланс (+/-)
  recruits: Math.round(Math.random() * 100)           // Рекруты в конце хода
};

// Скелетоны в шапке (название государства и показатели):
// прямоугольники с проходящим блеском, пока контент не загружен
function setHeaderSkeleton(on) {
  document.getElementById('table-title').classList.toggle('skeleton', on);
  document.querySelectorAll('.header-stat').forEach(el => el.classList.toggle('skeleton', on));
}
setHeaderSkeleton(true);
// С самого старта контент в режиме загрузки: по центру — «Загрузка»
document.getElementById('main').classList.add('loading');

document.getElementById('refresh-btn').onclick = () => loadData(true);

// ============================================================
//  МОБИЛЬНАЯ РАСКЛАДКА: скрываемая навигация, перенос кнопок
// ============================================================
const navToggle = document.getElementById('nav-toggle');
// Класс «open» вешаем на ОБЛАСТЬ навигации: вместе с панелью
// уезжает и кнопка «>», прикреплённая к её правому краю
const sidebarEl = document.getElementById('sidebar-area');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');

// Открытие/закрытие навигации кнопкой «>» под шапкой, у панели
function setSidebarOpen(open) {
  sidebarEl.classList.toggle('open', open);
  sidebarBackdrop.classList.toggle('show', open);
  navToggle.classList.toggle('open', open);
}

navToggle.addEventListener('click', () =>
  setSidebarOpen(!sidebarEl.classList.contains('open')));
sidebarBackdrop.addEventListener('click', () => setSidebarOpen(false));

// ============================================================
//  ПОКАЗАТЕЛИ ШАПКИ (казна, баланс, рекруты)
// ============================================================
// На десктопе — в шапке, у разделительной линии (как раньше).
// На мобильных — в выпадающей секции под шапкой, которая
// открывается/закрывается круглой кнопкой «>» по центру.
const statsArea = document.getElementById('stats-area');
const headerStats = document.getElementById('header-stats');
const statsToggle = document.getElementById('stats-toggle');

statsToggle.addEventListener('click', () => {
  statsArea.classList.toggle('open');
  updateNavToggleOffset();
});

// Кнопка «>» навигации смещается вниз на высоту открытой секции
// показателей, чтобы не перекрывать её
function updateNavToggleOffset() {
  if (!mobileMedia.matches || !statsArea.classList.contains('open')) {
    navToggle.style.top = '';
    return;
  }
  const baseTop = parseFloat(getComputedStyle(navToggle).top) || 10;
  navToggle.style.top = (baseTop + headerStats.offsetHeight) + 'px';
}
// Перенос строк в секции может изменить её высоту (поворот экрана,
// изменение ширины) — пересчитываем смещение
window.addEventListener('resize', updateNavToggleOffset);

// ============================================================
//  ПЕРЕНОС ЭЛЕМЕНТОВ МЕЖДУ РЕЖИМАМИ (мобильный <-> десктоп)
// ============================================================
// На мобильных кнопки «Карта» и «Выйти» переносятся в блок
// навигации — под вкладками, за разделительной линией,
// а показатели шапки — в выпадающую секцию под шапкой.
// При возврате к десктопной ширине — всё обратно.
function applyLayoutMode() {
  if (mobileMedia.matches) {
    // показатели — в секцию, ПЕРЕД кнопкой «>»:
    // кнопка в потоке секции уедет вниз, под показатели
    statsArea.insertBefore(headerStats, statsToggle);
  } else {
    statsArea.classList.remove('open');          // секция закрыта
    updateNavToggleOffset();
    document.getElementById('site-header')      // показатели — в шапку,
      .insertBefore(headerStats,                // сразу после линии
        document.getElementById('update-status'));
  }
  const target = mobileMedia.matches
    ? document.getElementById('nav-actions')
    : document.getElementById('toolbar');
  target.appendChild(document.getElementById('map-btn'));
  target.appendChild(document.getElementById('logout-btn'));
}

// Смена режима (мобильный <-> десктоп): переносим кнопки,
// закрываем навигацию и перерисовываем лист
// (спойлеры диаграмм строятся по-разному)
mobileMedia.addEventListener('change', () => {
  applyLayoutMode();
  setSidebarOpen(false);
  renderCurrentSheet();
});
applyLayoutMode();

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