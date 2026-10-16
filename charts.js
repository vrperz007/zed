/*
 * Mound Report charts: small, dependency-free SVG line charts and sparklines.
 * Colors come from CSS variables so charts follow light and dark themes.
 */
const Charts = (() => {
  'use strict';
  const DAY = 86400000;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function niceStep(range, count) {
    const raw = range / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return s * mag;
  }

  function fmtNum(v, decimals) {
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function fmtDay(t) {
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /**
   * series: [{ label, color, points: [{ x: ms, y: number, filled: bool, label: string }] }]
   */
  function line({ series, width, height = 260, unit = '', decimals = 0 }) {
    const all = series.flatMap(s => s.points);
    if (!all.length) return '';

    const W = Math.max(300, Math.round(width));
    const H = height;
    const L = 56, R = 52, T = 28, B = 32;

    let ymin = Math.min(...all.map(p => p.y));
    let ymax = Math.max(...all.map(p => p.y));
    if (ymin === ymax) { ymin -= Math.max(1, Math.abs(ymin) * 0.02); ymax += Math.max(1, Math.abs(ymax) * 0.02); }
    const pad = (ymax - ymin) * 0.15;
    ymin -= pad; ymax += pad;
    const step = niceStep(ymax - ymin, 4);
    const y0 = Math.floor(ymin / step) * step;
    const y1 = Math.ceil(ymax / step) * step;
    const tickDec = step < 1 ? 1 : 0;

    let xmin = Math.min(...all.map(p => p.x));
    let xmax = Math.max(...all.map(p => p.x));
    if (xmin === xmax) { xmin -= DAY * 3; xmax += DAY * 3; }
    const xpad = (xmax - xmin) * 0.03;
    xmin -= xpad; xmax += xpad;

    const sx = x => L + (x - xmin) / (xmax - xmin) * (W - L - R);
    const sy = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    const f = n => n.toFixed(1);

    let out = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(series.map(s => s.label).join(' and '))} over time">`;

    // Horizontal grid + y labels
    for (let v = y0; v <= y1 + step / 1000; v += step) {
      const y = sy(v);
      out += `<line x1="${L}" x2="${W - R}" y1="${f(y)}" y2="${f(y)}" class="c-grid"/>`;
      out += `<text x="${L - 10}" y="${f(y)}" class="c-label" text-anchor="end" dominant-baseline="middle">${fmtNum(v, tickDec)}</text>`;
    }
    if (unit) out += `<text x="${L - 10}" y="11" class="c-unit" text-anchor="end">${esc(unit)}</text>`;

    // X labels: unique session dates, thinned to fit
    const xs = [...new Set(all.map(p => p.x))].sort((a, b) => a - b);
    const maxLabels = Math.max(2, Math.floor((W - L - R) / 72));
    let shown = xs;
    if (xs.length > maxLabels) {
      const idx = new Set();
      for (let k = 0; k < maxLabels; k++) idx.add(Math.round(k * (xs.length - 1) / (maxLabels - 1)));
      shown = xs.filter((_, i) => idx.has(i));
    }
    shown.forEach(x => {
      out += `<line x1="${f(sx(x))}" x2="${f(sx(x))}" y1="${H - B}" y2="${H - B + 4}" class="c-tick"/>`;
      out += `<text x="${f(sx(x))}" y="${H - 10}" class="c-label" text-anchor="middle">${fmtDay(x)}</text>`;
    });
    out += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="c-axis"/>`;

    // Series
    series.forEach((s, si) => {
      const pts = [...s.points].sort((a, b) => a.x - b.x);
      if (!pts.length) return;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f(sx(p.x))},${f(sy(p.y))}`).join('');
      if (si === 0 && pts.length > 1) {
        const area = `${d}L${f(sx(pts[pts.length - 1].x))},${H - B}L${f(sx(pts[0].x))},${H - B}Z`;
        out += `<path d="${area}" style="fill:${s.color};opacity:.09"/>`;
      }
      if (pts.length > 1) out += `<path d="${d}" style="fill:none;stroke:${s.color};stroke-width:2.25;stroke-linejoin:round;stroke-linecap:round"/>`;
      pts.forEach((p, i) => {
        const last = i === pts.length - 1;
        const r = last ? 5.5 : 4.2;
        const fill = p.filled ? s.color : 'var(--surface)';
        out += `<circle cx="${f(sx(p.x))}" cy="${f(sy(p.y))}" r="${r}" style="fill:${fill};stroke:${s.color};stroke-width:2"><title>${esc(p.label)}: ${fmtNum(p.y, decimals)} ${esc(unit)}</title></circle>`;
      });
      // Endpoint value label
      const lp = pts[pts.length - 1];
      out += `<text x="${f(sx(lp.x) + 9)}" y="${f(sy(lp.y))}" class="c-end" dominant-baseline="middle" style="fill:${s.color}">${fmtNum(lp.y, decimals)}</text>`;
    });

    out += '</svg>';
    return out;
  }

  function spark(values, { w = 92, h = 28 } = {}) {
    if (!values || values.length < 2) return '<span class="spark-empty">—</span>';
    let min = Math.min(...values), max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }
    const px = i => 3 + i / (values.length - 1) * (w - 6);
    const py = v => 3 + (1 - (v - min) / (max - min)) * (h - 6);
    const pts = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
    const lx = px(values.length - 1), ly = py(values[values.length - 1]);
    const up = values[values.length - 1] >= values[0];
    return `<svg class="spark ${up ? 'spark-up' : 'spark-down'}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">` +
      `<polyline points="${pts}" class="spark-line"/>` +
      `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.8" class="spark-dot"/></svg>`;
  }

  return { line, spark };
})();
