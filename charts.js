// ============================================================
//  CHARTS.JS — радиальная диаграмма (пончик) долей населения
//  по расам. Палитра секторов — CHART_COLORS (config.js).
// ============================================================

// Столбец сущности по регулярному выражению для заголовка
function findEntityCol(entity, re) {
  for (const col of LAYOUT.ENTITY_COLS) {
    if (re.test(cellAt(entity.headerRow, col).display)) return col;
  }
  return null;
}

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