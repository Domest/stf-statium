// ============================================================
//  CHARTS.JS — диаграммы секций сущностей:
//   - круговая (пончик) с легендой «название — процент»;
//   - гистограмма (вертикальные столбцы) с сеткой.
//  Какие диаграммы у какой секции — задано в entity.charts (config.js).
//  Палитра — CHART_COLORS (config.js).
// ============================================================

// Столбец сущности по регулярному выражению для заголовка
function findEntityCol(entity, re) {
  for (const col of LAYOUT.ENTITY_COLS) {
    if (re.test(cellAt(entity.headerRow, col).display)) return col;
  }
  return null;
}

// Значения сущностей: [{name, value}], пока заполнен столбец «Название».
// value === null, если содержимое ячейки не парсится как число.
function collectEntityValues(entity, valueCol) {
  const items = [];
  let row = entity.headerRow + 1;
  while (cellAt(row, entity.nameCol).display !== '') {
    items.push({
      name: cellAt(row, entity.nameCol).display,
      value: parseCellNumber(cellAt(row, valueCol).display)
    });
    row++;
  }
  return items;
}

function fmtPercent(p) {
  const r = Math.round(p * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',')) + '%';
}

// Число для подписей на диаграммах: «12 500» или «12,5»
function fmtChartNumber(n) {
  const r = Math.round(n * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ============================================================
//  КРУГОВАЯ ДИАГРАММА (пончик)
// ============================================================

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

// Круговая диаграмма долей значений столбца + легенда с процентами.
// sort === true -> доли идут по убыванию, начиная сверху.
// Наведение на долю подсвечивает её и делает жирной строку легенды.
function renderDonutChart(container, entity, re, sort) {
  container.innerHTML = '';
  if (!entity) return;

  const valueCol = findEntityCol(entity, re);
  if (!valueCol) return;

  let items = collectEntityValues(entity, valueCol)
    .filter(it => it.value !== null && it.value > 0);
  if (!items.length) return;
  if (sort) items.sort((a, b) => b.value - a.value);

  const total = items.reduce((s, it) => s + it.value, 0);
  const size = 150, cx = size / 2, cy = size / 2, rOut = 72, rIn = 44;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);

  // Сектора и строки легенды связаны индексом расы
  const segsByItem = [];
  const legendItems = [];
  const setHover = (i, on) => {
    segsByItem[i].forEach(p => p.classList.toggle('hovered', on));
    legendItems[i].classList.toggle('hovered', on);
  };

  let angle = 0;
  items.forEach((it, i) => {
    it.color = CHART_COLORS[i % CHART_COLORS.length];
    it.percent = it.value / total * 100;
    const sweep = it.value / total * 360;
    // Полный круг (единственная доля) одной дугой не рисуется — делим пополам
    const segs = sweep >= 359.99
      ? [[angle, angle + 180], [angle + 180, angle + 360]]
      : [[angle, angle + sweep]];
    const paths = [];
    segs.forEach(seg => {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', donutArcPath(cx, cy, rOut, rIn, seg[0], seg[1]));
      path.setAttribute('fill', it.color);
      path.setAttribute('stroke', '#23180A');
      path.setAttribute('stroke-width', '2');
      path.classList.add('seg');
      path.dataset.legend = i;
      path.addEventListener('pointerenter', () => setHover(i, true));
      path.addEventListener('pointerleave', () => setHover(i, false));
      svg.appendChild(path);
      paths.push(path);
    });
    segsByItem.push(paths);
    angle += sweep;
  });

  const wrap = document.createElement('div');
  wrap.className = 'race-chart';
  wrap.appendChild(svg);

  // Подписи: цветной маркер, название и доля в процентах
  const legend = document.createElement('div');
  legend.className = 'race-chart-legend';
  items.forEach((it, i) => {
    const item = document.createElement('div');
    item.className = 'race-legend-item';
    item.dataset.legend = i;
    const chip = document.createElement('span');
    chip.className = 'race-legend-chip';
    chip.style.background = it.color;
    const text = document.createElement('span');
    text.className = 'race-legend-text';
    text.textContent = it.name + ' — ' + fmtPercent(it.percent);
    item.appendChild(chip);
    item.appendChild(text);
    legend.appendChild(item);
    legendItems.push(item);
  });
  wrap.appendChild(legend);
  container.appendChild(wrap);
}

// ============================================================
//  ГИСТОГРАММА (вертикальные столбцы)
// ============================================================

// Гистограмма значений столбца: столбцы по убыванию (наибольший слева).
// Сетка: деления кратны 10, всего не более 5; от каждого деления
// идёт тусклая горизонтальная линия для ориентирования по значениям.
// Названия под столбцами переносятся ПО БУКВАМ, если не влезают в одну строку.
function renderBarChart(container, entity, re) {
  container.innerHTML = '';
  if (!entity) return;

  const valueCol = findEntityCol(entity, re);
  if (!valueCol) return;

  const items = collectEntityValues(entity, valueCol)
    .filter(it => it.value !== null && it.value >= 0)
    .sort((a, b) => b.value - a.value);   // наибольшее — слева
  if (!items.length) return;

  // Шкала оси: деления кратны 10, не более 5 делений
  const maxValue = items[0].value;
  let step = 10;
  if (maxValue > step * 5) step = Math.ceil(maxValue / 5 / 10) * 10;
  const axisMax = Math.max(step, Math.ceil(Math.max(maxValue, 1) / step) * step);
  const divisions = axisMax / step;   // всегда <= 5

  const barW = 44, gap = 18, leftPad = 40, rightPad = 10;
  const topPad = 20, plotH = 110;

  // Перенос названия по буквам: шрифт 11px ~ 6.4px на символ.
  // Ширина зоны названия — чуть больше шага столбцов (barW + gap).
  const nameWidth = barW + gap - 6;
  const wrapName = (name) => {
    const lines = [];
    let line = '';
    for (const ch of name) {
      if ((line.length + 1) * 6.4 > nameWidth && line.length >= 4) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    if (line !== '') lines.push(line);
    return lines;
  };
  const named = items.map(it => ({ ...it, lines: wrapName(it.name) }));
  const maxLines = named.reduce((m, it) => Math.max(m, it.lines.length), 1);

  // Высота подстраивается под количество строк названий
  const width = leftPad + rightPad + named.length * (barW + gap);
  const height = topPad + plotH + 24 + (maxLines - 1) * 13;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const addText = (x, y, str, anchor, fill, size) => {
    const t = document.createElementNS(svgNS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('text-anchor', anchor);
    t.setAttribute('fill', fill);
    t.setAttribute('font-size', size);
    t.textContent = str;
    svg.appendChild(t);
  };

  const plotRight = width - rightPad;
  const zeroY = topPad + plotH;

  // Тусклые горизонтальные линии от каждого деления + подпись деления
  for (let k = 1; k <= divisions; k++) {
    const v = k * step;
    const y = zeroY - (v / axisMax) * plotH;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', leftPad); line.setAttribute('x2', plotRight);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('stroke', 'rgba(255, 255, 255, .12)');
    svg.appendChild(line);
    addText(leftPad - 6, y + 3, fmtChartNumber(v), 'end',
      'rgba(255, 255, 255, .55)', 10);
  }

  // Базовая линия (ноль)
  const base = document.createElementNS(svgNS, 'line');
  base.setAttribute('x1', leftPad); base.setAttribute('x2', plotRight);
  base.setAttribute('y1', zeroY); base.setAttribute('y2', zeroY);
  base.setAttribute('stroke', 'rgba(255, 255, 255, .3)');
  svg.appendChild(base);

  // Столбцы: значение над столбцом, название — под ним (в несколько строк)
  named.forEach((it, i) => {
    const h = (it.value / axisMax) * plotH;
    const x = leftPad + i * (barW + gap);
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', zeroY - h);
    rect.setAttribute('width', barW);
    rect.setAttribute('height', Math.max(h, 0));
    rect.setAttribute('rx', 2);
    rect.setAttribute('fill', CHART_COLORS[i % CHART_COLORS.length]);
    svg.appendChild(rect);
    addText(x + barW / 2, zeroY - h - 5, fmtChartNumber(it.value),
      'middle', 'rgba(255, 255, 255, .8)', 11);
    it.lines.forEach((lineStr, li) => {
      addText(x + barW / 2, zeroY + 16 + li * 13, lineStr,
        'middle', 'rgba(255, 255, 255, .65)', 11);
    });
  });

  container.appendChild(svg);
}

// ============================================================
//  ПЕРЕРИСОВКА
// ============================================================

// Рисует диаграмму одного типа по её настройке из entity.charts.
// Под диаграммой — видимый заголовок (chart.title), по центру.
function renderEntityChart(container, entity, chart) {
  container.innerHTML = '';
  if (!entity) return;

  const body = document.createElement('div');
  container.appendChild(body);

  if (chart.type === 'donut') {
    renderDonutChart(body, entity, chart.valueRe, chart.sort);
  } else if (chart.type === 'bars') {
    renderBarChart(body, entity, chart.valueRe);
  }

  if (chart.title) {
    const p = document.createElement('p');
    p.className = 'chart-title';
    p.textContent = chart.title;
    container.appendChild(p);
  }
}

// Перерисовывает все диаграммы сущностей по свежим данным
// (вызывается после сохранения из applySnapshot)
function refreshEntityCharts() {
  LAYOUT.entities.forEach(entity => {
    (entity.charts || []).forEach(chart => {
      const box = document.getElementById(chart.id);
      if (box) renderEntityChart(box, entity, chart);
    });
  });
}