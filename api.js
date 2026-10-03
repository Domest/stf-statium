// ============================================================
//  API.JS — сессия, запросы к серверу, состояние данных листа
//  и индикатор статуса в шапке.
// ============================================================

// Сессия (её кладёт в localStorage страница входа index.html)
const token = localStorage.getItem('session_token');
const tableName = localStorage.getItem('table_name');

// Мобильный ли экран (ширина до 860px): от этого зависят скрываемая
// навигация, перенос кнопок в неё и спойлеры диаграмм
const mobileMedia = window.matchMedia('(max-width: 860px)');

// ============================================================
//  СОСТОЯНИЕ ДАННЫХ АКТИВНОГО ЛИСТА
// ============================================================
let currentData = null;        // сырые значения (getValues)
let currentDisplay = null;     // отформатированные значения (getDisplayValues)
let currentMask = null;        // formulaMask[r][c] === true -> формулы, только чтение
let currentValidations = null; // "строка,столбец" -> варианты выпадающего списка

// Листы (вкладки навигации)
let sheetsList = [];
let currentSheet = localStorage.getItem('sheet_name') || null;

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

// Ячейка «числовая», если её текущее сырое значение — число
function isNumericCell(row, col) {
  const r = row - 1, c = col - 1;
  return !!(currentData && currentData[r] && typeof currentData[r][c] === 'number');
}

// Сырое числовое значение ячейки (если display-строка не распарсилась)
function rawNumberAt(row, col) {
  const r = row - 1, c = col - 1;
  if (currentData && currentData[r] && typeof currentData[r][c] === 'number') {
    return currentData[r][c];
  }
  return null;
}

// Число из отображаемого значения ячейки («18 000», «-3,5», «42%»)
function parseCellNumber(text) {
  const n = parseFloat(String(text).replace(/[\s\u00A0]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

// ============================================================
//  ИНДИКАТОР СТАТУСА В ШАПКЕ
// ============================================================
const statusEl = document.getElementById('update-status');

// Время последнего успешного обновления — показывается
// на мобильных под иконкой done
let lastSuccessTime = null;

// Иконка результата через CSS-маску (красится цветом currentColor)
function statusIcon(file) {
  return '<span class="status-icon" style="--icon: url(\'img/' + file + '\');"></span>';
}

function setStatus(type, text) {
  statusEl.className = 'show ' + type;
  if (mobileMedia.matches) {
    // Мобильная версия: вместо текста — иконки.
    // Загрузка — крутящаяся иконка; успех — done с временем
    // под ним; ошибка — красный крест
    if (type === 'loading') {
      statusEl.innerHTML = statusIcon('loading-icon.svg');
    } else {
      statusEl.innerHTML =
        statusIcon(type === 'success' ? 'done-icon.svg' : 'error-icon.svg') +
        (lastSuccessTime ? '<span class="status-time">' + lastSuccessTime + '</span>' : '');
    }
  } else {
    statusEl.textContent = text;
  }
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
    lastSuccessTime = time;
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