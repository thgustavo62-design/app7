/* Gráficos em SVG puro: barras agrupadas, linhas, área e barras empilhadas.
   Cores vêm dos tokens CSS, então seguem o tema claro/escuro. */
window.Charts = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const tip = () => document.getElementById("tip");
  function showTip(e, html) {
    const t = tip(); t.innerHTML = html; t.hidden = false;
    const r = t.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    t.style.left = Math.max(8, x) + "px"; t.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip().hidden = true; };
  function el(tag, attrs, parent, text) {
    const n = document.createElementNS(NS, tag);
    for (const a in attrs) n.setAttribute(a, attrs[a]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function niceMax(v) {
    if (!v || v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function frame(host, H) {
    host.innerHTML = "";
    const W = Math.max(260, host.clientWidth || 600);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, host);
    if (host.dataset.label) svg.setAttribute("aria-label", host.dataset.label);
    return { svg, W, H };
  }
  function yAxis(svg, x0, x1, yBase, yTop, max, fmt, ticks = 4) {
    for (let i = 0; i <= ticks; i++) {
      const v = max * i / ticks, y = yBase - (yBase - yTop) * i / ticks;
      el("line", { x1: x0, x2: x1, y1: y, y2: y, class: i === 0 ? "ax" : "gl" }, svg);
      el("text", { x: x0 - 6, y: y + 3.5, "text-anchor": "end" }, svg, fmt(v));
    }
  }
  const barPath = (x, y, w, h, r = 4) => { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
  const rows = (series, i, fmt) => series.map(s => `<div class="r"><span><i style="background:${css(s.color)}"></i>${s.name}</span><span>${s.values[i] == null ? "sem dado" : fmt(s.values[i])}</span></div>`).join("");

  function bars(host, { cats, series, fmt, tipFmt = fmt, height = 240 }) {
    const { svg, W, H } = frame(host, height);
    const L = 60, R = 8, T = 12, B = 30, base = H - B;
    const max = niceMax(Math.max(...series.flatMap(s => s.values.filter(v => v != null))));
    yAxis(svg, L, W - R, base, T, max, fmt);
    const gw = (W - L - R) / cats.length, bw = Math.max(6, Math.min(34, (gw * .64 - 2 * (series.length - 1)) / series.length));
    cats.forEach((c, i) => {
      const gx = L + gw * i + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
      series.forEach((s, j) => {
        const v = s.values[i], x = gx + j * (bw + 2);
        if (v == null) { el("text", { x: x + bw / 2, y: base - 6, "text-anchor": "middle" }, svg, "–"); return; }
        const h = Math.max(1, (base - T) * v / max);
        el("path", { d: barPath(x, base - h, bw, h), fill: css(s.color) }, svg);
      });
      el("text", { x: L + gw * i + gw / 2, y: H - 10, "text-anchor": "middle", class: "lb" }, svg, c);
      const hit = el("rect", { x: L + gw * i, y: T, width: gw, height: base - T, class: "hit" }, svg);
      hit.addEventListener("pointermove", e => showTip(e, `<b>${c}</b>` + rows(series, i, tipFmt)));
      hit.addEventListener("pointerleave", hideTip);
    });
  }

  function lines(host, { cats, series, fmt, tipFmt = fmt, height = 230 }) {
    const { svg, W, H } = frame(host, height);
    const L = 54, R = 64, T = 14, B = 30, base = H - B;
    const max = niceMax(Math.max(...series.flatMap(s => s.values.filter(v => v != null))));
    yAxis(svg, L, W - R, base, T, max, fmt);
    const step = (W - L - R - 32) / Math.max(1, cats.length - 1);
    const xs = i => L + 16 + step * i, ys = v => base - (base - T) * v / max;
    cats.forEach((c, i) => el("text", { x: xs(i), y: H - 10, "text-anchor": "middle", class: "lb" }, svg, c));
    const ends = [];
    series.forEach(s => {
      const pts = s.values.map((v, i) => v == null ? null : `${xs(i)},${ys(v)}`).filter(Boolean).join(" ");
      el("polyline", { points: pts, fill: "none", stroke: css(s.color), "stroke-width": 2, "stroke-linejoin": "round" }, svg);
      s.values.forEach((v, i) => v != null && el("circle", { cx: xs(i), cy: ys(v), r: 4.5, fill: css(s.color), stroke: css("--card"), "stroke-width": 2 }, svg));
      const li = s.values.length - 1; if (s.values[li] != null) ends.push({ y: ys(s.values[li]), t: s.short || s.name, x: xs(li) });
    });
    ends.sort((a, b) => a.y - b.y).forEach((e, i, arr) => { if (i && e.y - arr[i - 1].y < 13) e.y = arr[i - 1].y + 13; el("text", { x: e.x + 10, y: e.y + 4, class: "lb" }, svg, e.t); });
    const xh = el("line", { y1: T, y2: base, class: "xh", visibility: "hidden" }, svg);
    cats.forEach((c, i) => {
      const hit = el("rect", { x: xs(i) - step / 2, y: T, width: step, height: base - T, class: "hit" }, svg);
      hit.addEventListener("pointermove", e => { xh.setAttribute("x1", xs(i)); xh.setAttribute("x2", xs(i)); xh.setAttribute("visibility", "visible"); showTip(e, `<b>${c}</b>` + rows(series, i, tipFmt)); });
      hit.addEventListener("pointerleave", () => { xh.setAttribute("visibility", "hidden"); hideTip(); });
    });
  }

  function area(host, { labels, values, color, fmt, tipFmt = fmt, name = "Valor", height = 210, ticksAt }) {
    const { svg, W, H } = frame(host, height);
    const L = 46, R = 10, T = 16, B = 28, base = H - B, n = values.length;
    const max = niceMax(Math.max(...values));
    yAxis(svg, L, W - R, base, T, max, fmt, 3);
    const xs = i => L + (W - L - R) * i / (n - 1), ys = v => base - (base - T) * v / max;
    const pts = values.map((v, i) => `${xs(i)},${ys(v)}`).join(" ");
    const c = css(color), gid = "ag" + Math.random().toString(36).slice(2, 8);
    const g = el("linearGradient", { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, el("defs", {}, svg));
    el("stop", { offset: "0%", "stop-color": c, "stop-opacity": .3 }, g); el("stop", { offset: "100%", "stop-color": c, "stop-opacity": 0 }, g);
    el("polygon", { points: `${xs(0)},${base} ${pts} ${xs(n - 1)},${base}`, fill: `url(#${gid})` }, svg);
    el("polyline", { points: pts, fill: "none", stroke: c, "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    const pk = values.indexOf(Math.max(...values));
    el("circle", { cx: xs(pk), cy: ys(values[pk]), r: 4.5, fill: c, stroke: css("--card"), "stroke-width": 2 }, svg);
    el("text", { x: Math.min(W - R - 40, Math.max(L + 30, xs(pk))), y: ys(values[pk]) - 9, "text-anchor": "middle", class: "lb" }, svg, "pico " + labels[pk]);
    (ticksAt || [0, Math.round(n / 4), Math.round(n / 2), Math.round(3 * n / 4), n - 1]).forEach(i => el("text", { x: xs(i), y: H - 9, "text-anchor": i === 0 ? "start" : i === n - 1 ? "end" : "middle", class: "lb" }, svg, labels[i]));
    const dot = el("circle", { r: 4, fill: c, stroke: css("--card"), "stroke-width": 2, visibility: "hidden" }, svg);
    const xh = el("line", { y1: T, y2: base, class: "xh", visibility: "hidden" }, svg);
    const hit = el("rect", { x: L, y: T, width: W - L - R, height: base - T, class: "hit" }, svg);
    hit.addEventListener("pointermove", e => {
      const b = svg.getBoundingClientRect(), sx = (e.clientX - b.left) * W / b.width;
      const i = Math.max(0, Math.min(n - 1, Math.round((sx - L) / ((W - L - R) / (n - 1)))));
      dot.setAttribute("cx", xs(i)); dot.setAttribute("cy", ys(values[i])); dot.setAttribute("visibility", "visible");
      xh.setAttribute("x1", xs(i)); xh.setAttribute("x2", xs(i)); xh.setAttribute("visibility", "visible");
      showTip(e, `<b>${labels[i]}</b><div class="r"><span>${name}</span><span>${tipFmt(values[i])}</span></div>`);
    });
    hit.addEventListener("pointerleave", () => { dot.setAttribute("visibility", "hidden"); xh.setAttribute("visibility", "hidden"); hideTip(); });
  }

  /* barras horizontais empilhadas: rows [{label, parts:[{name,color,value}]}] */
  function stacked(host, { rows: data, labelW = 128 }) {
    const rh = 34, { svg, W } = frame(host, data.length * rh + 6);
    const L = Math.min(labelW, W * .34), R = 40;
    const max = Math.max(...data.map(r => r.parts.reduce((a, p) => a + p.value, 0)));
    data.forEach((r, i) => {
      const y = 3 + i * rh;
      el("text", { x: 0, y: y + 18, class: "lb" }, svg, r.label);
      let x = L;
      r.parts.forEach(p => {
        if (!p.value) return;
        const w = Math.max(2, (W - L - R) * p.value / max - 2);
        const rect = el("rect", { x, y: y + 6, width: w, height: 18, rx: 3, fill: css(p.color) }, svg);
        rect.addEventListener("pointermove", e => showTip(e, `<b>${r.label}</b><div class="r"><span>${p.name}</span><span>${p.value}</span></div>`));
        rect.addEventListener("pointerleave", hideTip);
        x += w + 2;
      });
      el("text", { x: x + 6, y: y + 19 }, svg, r.parts.reduce((a, p) => a + p.value, 0));
    });
  }

  return { bars, lines, area, stacked, hideTip };
})();
