// ============================================================
//  VALIDATION.JS — проверка ввода, нормализация значений
//  и всплывающие подсказки об ошибках.
// ============================================================
const VALIDATION_POPUP_TIMEOUT = 6000; // мс

// Нормализация значения перед отправкой на сервер
// (правила задаются в FIELD_TRANSFORMS из config.js)
function transformValue(row, col, value) {
  if (FIELD_TRANSFORMS[row + ',' + col] === 'hashtag') {
    const v = String(value).trim().replace(/^#+/, '');
    return v === '' ? '' : '#' + v;
  }
  return value;
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