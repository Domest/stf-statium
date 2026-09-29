// ============================================================
//  TINTS.JS — цветовые градации полей по значению 0..100.
//  Градиенты описаны в TINT_GRADIENTS (config.js).
// ============================================================

// Тон градиента для значения 0..100 (t — доля 0..1)
function tintHue(grad, t) {
  return ((grad.h1 + (grad.h2 - grad.h1) * t) % 360 + 360) % 360;
}

// Ключ градации для колонки сущности по тексту её заголовка
function tintKeyForHeader(entity, header) {
  if (!entity.tints) return null;
  for (const t of entity.tints) {
    if (t.re.test(header)) return t.key;
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