/**
 * app.js — Dashboard D3.js v7
 * Paleta: morado (#4A148C, #6A1B9A, #9C27B0) + oro (#D4AF37, #FFB300, #FFD54F)
 * Rutas relativas para funcionar en subcarpeta o GitHub Pages.
 */

/* ── Rutas ───────────────────────────────────────────────────────── */
const BASE = "./data/gold/dashboard";
const DATASETS = {
  incidence:     `${BASE}/incidencia_yucatan_mensual_v1.json`,
  perception:    `${BASE}/percepcion_envipe_anual_v1.json`,
  cifraOculta:   `${BASE}/cifra_oculta_envipe_v1.json`,
  newsByMonth:   `${BASE}/noticias_mensuales_v1.json`,
  wordFrequency: `${BASE}/frecuencia_palabras_titulares_v1.json`,
  bigrams:       `${BASE}/frecuencia_bigramas_titulares_v1.json`,
  newsByOutlet:  `${BASE}/noticias_por_medio_v1.json`,
  boundary:      `${BASE}/territorio/municipios_yucatan.geojson`,
  // postalCodes: capa municipal estatal en boundary
};

/* ── Paleta ──────────────────────────────────────────────────────── */
const C = {
  purpleDeep:  "#4A148C",
  purpleMid:   "#6A1B9A",
  purpleLight: "#9C27B0",
  purplePale:  "rgba(156,39,176,.15)",
  goldDeep:    "#D4AF37",
  goldMid:     "#FFB300",
  goldPale:    "#FFD54F",
  muted:       "#8a7a98",
  grid:        "rgba(106,27,154,.08)",
};

/* ── Meses ───────────────────────────────────────────────────────── */
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/* ── Estado global ───────────────────────────────────────────────── */
const state = {
  data: null,
  mapInited: false,
  terrainStarted: false,
  resizeObservers: new Map(),
};

/* ── Tooltip singleton ───────────────────────────────────────────── */
const tooltip = d3.select("#d3-tooltip");
function showTip(event, html) {
  tooltip.html(html).classed("visible", true);
  moveTip(event);
}
function moveTip(event) {
  const pad = 14;
  tooltip
    .style("left", (event.clientX + pad) + "px")
    .style("top",  (event.clientY - 36) + "px");
}
function hideTip() { tooltip.classed("visible", false); }

/* ── Status bar ──────────────────────────────────────────────────── */
function setStatus(msg, kind = "ready") {
  document.querySelector("#data-status").textContent = msg;
  const dot = document.querySelector(".status-dot");
  dot.classList.toggle("ready", kind === "ready");
  dot.classList.toggle("error", kind === "error");
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function num(v) {
  const r = Number(v);
  if (!Number.isFinite(r)) throw new Error(`Valor no numérico: ${v}`);
  return r;
}

/** Render placeholder elegante cuando no hay datos */
function placeholder(containerId, msg = "Datos pendientes de procesamiento.") {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = "";
  const div = document.createElement("div");
  div.className = "d3-placeholder";
  div.innerHTML = `
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect x="4" y="12" width="40" height="28" rx="4" stroke="${C.purpleLight}" stroke-width="2"/>
      <path d="M4 20h40" stroke="${C.purpleLight}" stroke-width="2"/>
      <circle cx="12" cy="16" r="2" fill="${C.purpleLight}"/>
      <circle cx="20" cy="16" r="2" fill="${C.purpleLight}"/>
      <path d="M14 30 L20 24 L26 28 L34 20" stroke="${C.goldMid}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <p>${msg}</p>`;
  wrap.appendChild(div);
}

/** Elimina resizeObserver de un wrap si ya existe */
function clearResize(id) {
  if (state.resizeObservers.has(id)) {
    state.resizeObservers.get(id).disconnect();
    state.resizeObservers.delete(id);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   GRÁFICA: línea genérica
══════════════════════════════════════════════════════════════════════ */
function drawLine(containerId, {
  data,          // [{x, y}]  x=string etiqueta, y=número
  color = C.purpleMid,
  fillColor = C.purplePale,
  yLabel = "",
  xTickEvery = 1,
  yFormat = d3.format(","),
  tooltipFn = (d) => `<strong>${d.x}</strong>${d.y.toLocaleString("es-MX")}`,
}) {
  clearResize(containerId);
  const wrap = document.getElementById(containerId);
  if (!wrap || !data || !data.length) { placeholder(containerId); return; }
  wrap.innerHTML = "";

  function render() {
    wrap.innerHTML = "";
    const W = wrap.clientWidth  || 400;
    const H = wrap.clientHeight || 300;
    const mg = { top: 16, right: 20, bottom: 42, left: 48 };
    const iW = W - mg.left - mg.right;
    const iH = H - mg.top  - mg.bottom;

    const svg = d3.select(wrap).append("svg")
      .attr("class", "d3-chart")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("aria-label", "Gráfica de línea")
      .attr("role", "img");

    const g = svg.append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    const x = d3.scalePoint().domain(data.map(d => d.x)).range([0, iW]).padding(.5);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.y) * 1.1]).range([iH, 0]).nice();

    // Grid
    g.append("g").selectAll("line")
      .data(y.ticks(5)).enter().append("line")
      .attr("class", "d3-gridline")
      .attr("x1", 0).attr("x2", iW)
      .attr("y1", d => y(d)).attr("y2", d => y(d));

    // Axes
    const xVals = data.map(d => d.x);
    const skip  = Math.max(1, Math.round(xVals.length / Math.max(1, Math.floor(iW / 60))));
    g.append("g").attr("class", "d3-axis").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(x)
        .tickValues(xVals.filter((_, i) => i % skip === 0))
        .tickSize(0).tickPadding(8))
      .selectAll("text").attr("font-size", 9).attr("fill", C.muted);

    g.append("g").attr("class", "d3-axis d3-axis--y")
      .call(d3.axisLeft(y).ticks(5).tickFormat(yFormat).tickSize(0).tickPadding(6))
      .selectAll("text").attr("font-size", 9).attr("fill", C.muted);

    // Area fill
    const area = d3.area()
      .x(d => x(d.x)).y0(iH).y1(d => y(d.y))
      .curve(d3.curveCatmullRom.alpha(.5));
    g.append("path").datum(data)
      .attr("fill", fillColor).attr("d", area);

    // Line
    const line = d3.line()
      .x(d => x(d.x)).y(d => y(d.y))
      .curve(d3.curveCatmullRom.alpha(.5));
    g.append("path").datum(data)
      .attr("fill", "none").attr("stroke", color)
      .attr("stroke-width", 2).attr("d", line);

    // Overlay for tooltip
    const overlay = g.append("g");
    overlay.selectAll("circle")
      .data(data).enter().append("circle")
      .attr("r", 14)
      .attr("cx", d => x(d.x)).attr("cy", d => y(d.y))
      .attr("fill", "transparent")
      .on("mousemove", (event, d) => showTip(event, tooltipFn(d)))
      .on("mouseleave", hideTip);

    // Visible dots
    g.selectAll(".dot")
      .data(data).enter().append("circle")
      .attr("class", "dot")
      .attr("r", 2).attr("cx", d => x(d.x)).attr("cy", d => y(d.y))
      .attr("fill", color).attr("pointer-events", "none");
  }

  render();
  const ro = new ResizeObserver(render);
  ro.observe(wrap);
  state.resizeObservers.set(containerId, ro);
}

/* ═══════════════════════════════════════════════════════════════════
   GRÁFICA: barras verticales
══════════════════════════════════════════════════════════════════════ */
function drawBars(containerId, {
  data,          // [{x, y}]
  color = C.purpleMid,
  yFormat = d3.format(","),
  yPercent = false,
  tooltipFn = (d) => `<strong>${d.x}</strong>${d.y.toLocaleString("es-MX")}`,
}) {
  clearResize(containerId);
  const wrap = document.getElementById(containerId);
  if (!wrap || !data || !data.length) { placeholder(containerId); return; }
  wrap.innerHTML = "";

  function render() {
    wrap.innerHTML = "";
    const W  = wrap.clientWidth  || 400;
    const H  = wrap.clientHeight || 300;
    const mg = { top: 16, right: 20, bottom: 48, left: 48 };
    const iW = W - mg.left - mg.right;
    const iH = H - mg.top  - mg.bottom;

    const svg = d3.select(wrap).append("svg")
      .attr("class", "d3-chart")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("aria-label", "Gráfica de barras").attr("role", "img");

    const g = svg.append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    const maxY = yPercent ? 100 : d3.max(data, d => d.y) * 1.12;
    const x = d3.scaleBand().domain(data.map(d => d.x)).range([0, iW]).padding(.32);
    const y = d3.scaleLinear().domain([0, maxY]).range([iH, 0]).nice();

    g.append("g").selectAll("line")
      .data(y.ticks(5)).enter().append("line")
      .attr("class", "d3-gridline")
      .attr("x1", 0).attr("x2", iW)
      .attr("y1", d => y(d)).attr("y2", d => y(d));

    const skip = Math.max(1, Math.round(data.length / Math.max(1, Math.floor(iW / 55))));
    g.append("g").attr("class", "d3-axis").attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(x)
        .tickValues(data.map(d => d.x).filter((_, i) => i % skip === 0))
        .tickSize(0).tickPadding(8))
      .selectAll("text").attr("font-size", 9).attr("fill", C.muted)
        .attr("transform", data.length > 10 ? "rotate(-30)" : null)
        .attr("text-anchor", data.length > 10 ? "end" : "middle");

    g.append("g").attr("class", "d3-axis d3-axis--y")
      .call(d3.axisLeft(y).ticks(5)
        .tickFormat(yPercent ? d => `${d}%` : yFormat)
        .tickSize(0).tickPadding(6))
      .selectAll("text").attr("font-size", 9).attr("fill", C.muted);

    g.selectAll(".bar")
      .data(data).enter().append("rect")
      .attr("class", "bar").attr("fill", color)
      .attr("rx", 4).attr("ry", 4)
      .attr("x", d => x(d.x))
      .attr("width", x.bandwidth())
      .attr("y", iH).attr("height", 0)
      .on("mousemove", (event, d) => showTip(event, tooltipFn(d)))
      .on("mouseleave", hideTip)
      .transition().duration(500).ease(d3.easeCubicOut)
      .attr("y", d => y(d.y)).attr("height", d => iH - y(d.y));
  }

  render();
  const ro = new ResizeObserver(render);
  ro.observe(wrap);
  state.resizeObservers.set(containerId, ro);
}

/* ═══════════════════════════════════════════════════════════════════
   GRÁFICA: barras horizontales
══════════════════════════════════════════════════════════════════════ */
function drawHorizBars(containerId, {
  data,       // [{label, value}]
  color = C.purpleMid,
  tooltipFn = (d) => `<strong>${d.label}</strong>${d.value.toLocaleString("es-MX")}`,
}) {
  clearResize(containerId);
  const wrap = document.getElementById(containerId);
  if (!wrap || !data || !data.length) { placeholder(containerId); return; }
  wrap.innerHTML = "";

  function render() {
    wrap.innerHTML = "";
    const W  = wrap.clientWidth  || 400;
    const H  = wrap.clientHeight || 300;
    const mg = { top: 10, right: 30, bottom: 10, left: Math.min(190, W * .44) };
    const iW = W - mg.left - mg.right;
    const iH = H - mg.top  - mg.bottom;

    const svg = d3.select(wrap).append("svg")
      .attr("class", "d3-chart")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("aria-label", "Gráfica de barras horizontales").attr("role", "img");

    const g = svg.append("g").attr("transform", `translate(${mg.left},${mg.top})`);

    const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, iH]).padding(.28);
    const x = d3.scaleLinear().domain([0, d3.max(data, d => d.value) * 1.08]).range([0, iW]).nice();

    // Y axis (labels)
    g.append("g").attr("class", "d3-axis d3-axis--y")
      .call(d3.axisLeft(y).tickSize(0).tickPadding(8))
      .selectAll("text")
        .attr("font-size", 9).attr("fill", C.muted)
        .text(d => d.length > 28 ? d.slice(0, 26) + "…" : d);

    // Bars
    g.selectAll(".hbar")
      .data(data).enter().append("rect")
      .attr("class", "hbar").attr("fill", color)
      .attr("rx", 3).attr("ry", 3)
      .attr("y", d => y(d.label)).attr("height", y.bandwidth())
      .attr("x", 0).attr("width", 0)
      .on("mousemove", (event, d) => showTip(event, tooltipFn(d)))
      .on("mouseleave", hideTip)
      .transition().duration(500).ease(d3.easeCubicOut)
      .attr("width", d => x(d.value));

    // Value labels
    g.selectAll(".hval")
      .data(data).enter().append("text")
      .attr("class", "hval")
      .attr("x", d => x(d.value) + 5)
      .attr("y", d => y(d.label) + y.bandwidth() / 2 + 3)
      .attr("font-size", 9).attr("fill", C.muted)
      .text(d => d.value.toLocaleString("es-MX"));
  }

  render();
  const ro = new ResizeObserver(render);
  ro.observe(wrap);
  state.resizeObservers.set(containerId, ro);
}

/* ═══════════════════════════════════════════════════════════════════
   RENDERIZADORES por sección
══════════════════════════════════════════════════════════════════════ */

/* ── Overview ──────────────────────────────────────────────────────── */
function renderOverview() {
  const { incidence, perception, newsByMonth } = state.data;

  // KPIs
  const years = incidence.map(r => num(r.anio));
  const latestYear = Math.max(...years);
  const latestTotal = incidence
    .filter(r => num(r.anio) === latestYear)
    .reduce((s, r) => s + num(r.casos), 0);
  const latestPerc = [...perception].sort((a, b) => num(b.anio) - num(a.anio))[0];
  const artCount = newsByMonth.reduce((s, r) => s + num(r.noticias), 0);

  document.querySelector("#kpi-incidencia").textContent = Math.round(latestTotal).toLocaleString("es-MX");
  document.querySelector("#kpi-incidencia-label").textContent = `Yucatán · ${latestYear} · registros`;
  document.querySelector("#kpi-percepcion").textContent = `${num(latestPerc.porcentaje_inseguridad_total).toFixed(1)}%`;
  document.querySelector("#kpi-percepcion-label").textContent = `ENVIPE · Yucatán · ${latestPerc.anio}`;
  document.querySelector("#kpi-noticias").textContent = artCount.toLocaleString("es-MX");

  // Trend line (last 36 months)
  const totals = new Map();
  for (const r of incidence) {
    const key = `${num(r.anio)}-${String(num(r.mes)).padStart(2, "0")}`;
    totals.set(key, (totals.get(key) || 0) + num(r.casos));
  }
  const trend = [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-36)
    .map(([x, y]) => ({ x, y }));

  drawLine("overview-wrap", {
    data: trend,
    color: C.purpleMid,
    fillColor: C.purplePale,
    tooltipFn: d => `<strong>${d.x}</strong>${d.y.toLocaleString("es-MX")} casos`,
  });
}

/* ── Incidencia ────────────────────────────────────────────────────── */
function renderIncidence() {
  const rows  = state.data.incidence;
  const years = [...new Set(rows.map(r => num(r.anio)))].sort((a, b) => a - b);
  const sel   = document.querySelector("#incidencia-year");

  if (!sel.options.length) {
    years.forEach(yr => {
      const o = document.createElement("option");
      o.value = String(yr); o.textContent = String(yr);
      sel.appendChild(o);
    });
    sel.value = String(years.at(-1));
  }

  const yr      = Number(sel.value);
  const yrRows  = rows.filter(r => num(r.anio) === yr);

  // Mensual (línea)
  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    x: MONTHS[i],
    y: yrRows.filter(r => num(r.mes) === i + 1).reduce((s, r) => s + num(r.casos), 0),
  }));
  drawLine("incidencia-month-wrap", {
    data: byMonth,
    color: C.purpleMid,
    fillColor: C.purplePale,
    tooltipFn: d => `<strong>${d.x}</strong>${d.y.toLocaleString("es-MX")} casos`,
  });

  // Por tipo de delito (barras horizontales)
  const byType = new Map();
  for (const r of yrRows) byType.set(r.delito, (byType.get(r.delito) || 0) + num(r.casos));
  const top10 = [...byType.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([label, value]) => ({ label, value }));

  drawHorizBars("incidencia-type-wrap", {
    data: top10,
    color: C.purpleLight,
    tooltipFn: d => `<strong>${d.label}</strong>${d.value.toLocaleString("es-MX")} casos`,
  });
}

/* ── Percepción y Cifra Oculta (ENVIPE) ───────────────────────────── */
function drawPerceptionMultiLine(containerId, rows) {
  const el = document.getElementById(containerId);
  if (!el || !rows.length) return;
  clearResize(containerId);

  const series = [
    { key: "m", label: "Mujeres", color: "#9C27B0", width: 2.6, dash: null },
    { key: "y", label: "Total",   color: "#D4AF37", width: 1.8, dash: "4,3" },
    { key: "h", label: "Hombres", color: "#5E35B1", width: 2.6, dash: null },
  ];

  const paint = () => {
    el.innerHTML = "";
    const W = el.clientWidth || 520;
    const H = el.clientHeight || 300;
    const m = { top: 34, right: 48, bottom: 32, left: 44 };
    const w = Math.max(180, W - m.left - m.right);
    const h = Math.max(140, H - m.top - m.bottom);

    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    // Leyenda superior
    const leg = svg.append("g").attr("transform", `translate(${m.left}, 14)`);
    series.forEach((s, i) => {
      const item = leg.append("g").attr("transform", `translate(${i * 96}, 0)`);
      item.append("line")
        .attr("x1", 0).attr("x2", 18).attr("y1", 0).attr("y2", 0)
        .attr("stroke", s.color).attr("stroke-width", s.width)
        .attr("stroke-dasharray", s.dash || "none");
      item.append("text")
        .attr("x", 24).attr("y", 4)
        .style("font-size", "11px").style("fill", "currentColor")
        .text(s.label);
    });

    const x = d3.scalePoint().domain(rows.map(d => d.x)).range([0, w]).padding(0.15);
    const maxVal = d3.max(rows, d => Math.max(d.y, d.m, d.h)) || 70;
    const y = d3.scaleLinear().domain([0, Math.min(100, Math.ceil(maxVal / 10) * 10 + 10)]).range([h, 0]);

    g.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d}%`).tickSize(-w))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll(".tick line").attr("stroke", "rgba(128,128,128,.15)"))
      .call(ax => ax.selectAll("text").style("font-size", "11px"));

    g.append("g").attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).tickValues(rows.filter(d => Number(d.x) % 2 === 0).map(d => d.x)))
      .call(ax => ax.select(".domain").attr("stroke", "rgba(128,128,128,.3)"))
      .call(ax => ax.selectAll("text").style("font-size", "11px"));

    const last = rows[rows.length - 1];
    series.forEach(s => {
      const line = d3.line().x(d => x(d.x)).y(d => y(d[s.key])).curve(d3.curveLinear);
      g.append("path").datum(rows).attr("fill", "none")
        .attr("stroke", s.color).attr("stroke-width", s.width)
        .attr("stroke-dasharray", s.dash || "none")
        .attr("d", line);

      g.selectAll(`.pt-${s.key}`).data(rows).join("circle")
        .attr("cx", d => x(d.x)).attr("cy", d => y(d[s.key]))
        .attr("r", s.key === "y" ? 2.5 : 3.2)
        .attr("fill", s.color)
        .on("mouseenter", (ev, d) => showTip(ev, `<strong>Yucatán · ${d.x}</strong>Mujeres: ${d.m.toFixed(1)}%<br>Total: ${d.y.toFixed(1)}%<br>Hombres: ${d.h.toFixed(1)}%`))
        .on("mousemove", moveTip)
        .on("mouseleave", hideTip);

      // Etiqueta directa del último año
      if (last) {
        g.append("text")
          .attr("x", x(last.x) + 6)
          .attr("y", y(last[s.key]) + 3.5)
          .style("font-size", "10.5px")
          .style("font-weight", s.key === "y" ? "500" : "700")
          .style("fill", s.color)
          .text(`${last[s.key].toFixed(1)}%`);
      }
    });
  };

  paint();
  const ro = new ResizeObserver(paint);
  ro.observe(el);
  state.resizeObservers.set(containerId, ro);
}

function renderPerception() {
  const rows = [...state.data.perception].sort((a, b) => num(a.anio) - num(b.anio));
  drawPerceptionMultiLine("percepcion-wrap", rows.map(r => ({
    x: String(r.anio),
    y: num(r.porcentaje_inseguridad_total),
    m: num(r.porcentaje_inseguridad_mujeres),
    h: num(r.porcentaje_inseguridad_hombres),
  })));

  const co = state.data.cifraOculta || [];
  if (!co.length) return;

  const years = [...new Set(co.map(r => num(r.anio)))].sort((a, b) => b - a);
  const sel = document.getElementById("cifra-oculta-year");
  if (sel && !sel.options.length) {
    years.forEach(yr => {
      const opt = document.createElement("option");
      opt.value = String(yr);
      opt.textContent = String(yr);
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => renderPerception());
  }

  const chosenYear = sel ? Number(sel.value) : years[0];
  const topCo = co
    .filter(r => num(r.anio) === chosenYear && r.delito !== "Total")
    .sort((a, b) => num(b.porcentaje_cifra_oculta) - num(a.porcentaje_cifra_oculta));

  drawHorizBars("cifra-oculta-wrap", {
    data: topCo.map(r => ({ label: r.delito, value: num(r.porcentaje_cifra_oculta) })),
    color: C.purpleMid,
    tooltipFn: d => `<strong>${d.label} (${chosenYear})</strong>${d.value.toFixed(1)}% sin denuncia`,
  });
}

/* ── Prensa ────────────────────────────────────────────────────────── */
function renderNews() {
  const monthly = [...state.data.newsByMonth].sort((a, b) => a.mes.localeCompare(b.mes));
  drawBars("noticias-wrap", {
    data: monthly.map(r => ({ x: r.mes, y: num(r.noticias) })),
    color: C.purpleLight,
    tooltipFn: d => `<strong>${d.x}</strong>${d.y.toLocaleString("es-MX")} artículos`,
  });

  const bigrams = (state.data.bigrams || []).slice(0, 12);
  if (bigrams.length) {
    drawHorizBars("bigramas-wrap", {
      data: bigrams.map(r => ({ label: r.frase, value: num(r.frecuencia) })),
      color: C.purpleMid,
      tooltipFn: d => `<strong>${d.label}</strong>${d.value.toLocaleString("es-MX")} menciones`,
    });
  }

  const words = (state.data.wordFrequency || []).slice(0, 12);
  drawHorizBars("palabras-wrap", {
    data: words.map(r => ({ label: r.palabra, value: num(r.frecuencia) })),
    color: C.goldDeep,
    tooltipFn: d => `<strong>${d.label}</strong>${d.value.toLocaleString("es-MX")} menciones`,
  });

  const outlets = (state.data.newsByOutlet || []).slice(0, 10);
  if (outlets.length) {
    drawHorizBars("medios-wrap", {
      data: outlets.map(r => ({ label: r.medio, value: num(r.noticias) })),
      color: C.purpleLight,
      tooltipFn: d => `<strong>${d.label}</strong>${d.value.toLocaleString("es-MX")} artículos`,
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════
   MAPA D3 con GeoJSON
══════════════════════════════════════════════════════════════════════ */
function initMap() {
  if (state.mapInited) return;
  state.mapInited = true;

  const container = document.getElementById("map-container");
  if (!container) return;

  const { boundary } = state.data;
  if (!boundary || !boundary.features?.length) {
    const msg = document.createElement("div");
    msg.className = "d3-placeholder";
    msg.innerHTML = `<p>Datos geográficos pendientes de procesamiento.</p>`;
    container.appendChild(msg);
    return;
  }

  const W = container.clientWidth  || 700;
  const H = container.clientHeight || 500;

  const svg = d3.select(container).append("svg")
    .attr("width", W).attr("height", H)
    .attr("aria-label", "Mapa de los 106 municipios de Yucatán");

  const proj = d3.geoMercator().fitSize([W, H], boundary);
  const path = d3.geoPath(proj);

  const zoomBehavior = d3.zoom()
    .scaleExtent([0.5, 20])
    .on("zoom", ({ transform }) => { gMap.attr("transform", transform); });
  svg.call(zoomBehavior);

  const gMap = svg.append("g");
  const layerConfigs = {
    prensa: {
      value: d => Number(d.properties?.NOTICIAS_MENCIONES ?? 0),
      scale: d3.scaleThreshold()
        .domain([1, 3, 8, 20])
        .range([
          "rgba(156, 39, 176, 0.10)",
          "rgba(156, 39, 176, 0.42)",
          "rgba(123, 31, 162, 0.68)",
          "rgba(74, 20, 140, 0.90)",
          "rgba(212, 175, 55, 0.62)"
        ]),
      legend: [
        ["rgba(156,39,176,.10)", "0 notas en titulares"],
        ["rgba(156,39,176,.42)", "1–2 notas"],
        ["rgba(123,31,162,.68)", "3–7 notas"],
        ["rgba(74,20,140,.90)",  "8–19 notas"],
        ["rgba(212,175,55,.62)", "Mérida (185 notas)"]
      ]
    },
    area: {
      value: d => Number(d.properties?.AREA_KM2 ?? 0),
      scale: d3.scaleThreshold()
        .domain([200, 500, 1000, 2000])
        .range([
          "rgba(156, 39, 176, 0.12)",
          "rgba(156, 39, 176, 0.34)",
          "rgba(123, 31, 162, 0.56)",
          "rgba(74, 20, 140, 0.78)",
          "rgba(212, 175, 55, 0.65)"
        ]),
      legend: [
        ["rgba(156,39,176,.12)", "< 200 km²"],
        ["rgba(156,39,176,.34)", "200–500 km²"],
        ["rgba(123,31,162,.56)", "500–1,000 km²"],
        ["rgba(74,20,140,.78)",  "1,000–2,000 km²"],
        ["rgba(212,175,55,.65)", "> 2,000 km² (Tizimín, Tekax)"]
      ]
    },
    elevacion: {
      value: d => Number(d.properties?.ELEV_MEAN_M ?? 0),
      scale: d3.scaleThreshold()
        .domain([10, 20, 35, 60])
        .range([
          "rgba(59, 18, 97, 0.28)",
          "rgba(123, 31, 162, 0.44)",
          "rgba(156, 39, 176, 0.64)",
          "rgba(184, 134, 11, 0.62)",
          "rgba(212, 175, 55, 0.85)"
        ]),
      legend: [
        ["rgba(59,18,97,.28)",   "< 10 m (costa / norponiente)"],
        ["rgba(123,31,162,.44)", "10–20 m (planicie baja)"],
        ["rgba(156,39,176,.64)", "20–35 m (planicie interior)"],
        ["rgba(184,134,11,.62)", "35–60 m (transición sur)"],
        ["rgba(212,175,55,.85)", "> 60 m (Sierrita Puuc)"]
      ]
    }
  };

  let activeLayer = "prensa";
  const legendEl = document.getElementById("map-legend");

  function renderMapLayer(layerKey) {
    activeLayer = layerKey;
    const cfg = layerConfigs[layerKey] || layerConfigs.prensa;
    gMap.selectAll(".map-postal")
      .transition().duration(220)
      .style("fill", d => cfg.scale(cfg.value(d)));

    if (legendEl) {
      legendEl.innerHTML = cfg.legend.map(([bg, label]) =>
        `<div class="map-legend-item"><div class="map-legend-swatch" style="background:${bg};border:1px solid rgba(106,27,154,.55)"></div><span>${label}</span></div>`
      ).join("");
    }
  }

  gMap.selectAll(".map-postal")
    .data(boundary.features).enter().append("path")
    .attr("class", d => String(d.properties?.MUN_OFICIA ?? "").padStart(5, "0") === "31050"
      ? "map-postal map-mun-capital"
      : "map-postal")
    .attr("d", path)
    .on("mousemove", (event, d) => {
      const p = d.properties || {};
      const mun = p.NOM_MUN ?? "Sin dato";
      const cve = String(p.MUN_OFICIA ?? "").padStart(5, "0");
      const zona = p.ZONA_GEO ?? "Yucatán";
      const area = Number(p.AREA_KM2);
      const evMean = Number(p.ELEV_MEAN_M);
      const evMax = Number(p.ELEV_MAX_M);
      const m = Number(p.NOTICIAS_MENCIONES ?? 0);
      const cop = Number(p.MENCIONES_COPLADEM ?? 0);
      const ej = p.TITULAR_EJEMPLO ?? "";

      const areaTxt = Number.isFinite(area) ? `${area.toLocaleString("es-MX")} km²` : "s/d";
      const elevTxt = Number.isFinite(evMean)
        ? `${evMean.toFixed(1)} m prom.${Number.isFinite(evMax) ? ` (máx. ${evMax.toFixed(0)} m)` : ""}`
        : "s/d";
      const notaTxt = m > 0
        ? `<strong>${m}</strong> ${m === 1 ? "nota" : "notas"} en prensa`
        : "0 notas en titulares";
      const gobTxt = cop > 0 ? ` · COPLADEM Policía: <strong>${cop}</strong>` : "";
      const ejHtml = ej ? `<br><span style="opacity:.9;font-style:italic">“${ej}”</span>` : "";

      showTip(
        event,
        `<strong>${mun}</strong> · Clave ${cve}<br>` +
        `<span>${zona} · Área: ${areaTxt}</span><br>` +
        `<span>Elevación: ${elevTxt}</span><br>` +
        `<span>${notaTxt}${gobTxt}</span>` +
        ejHtml
      );
    })
    .on("mouseleave", hideTip);

  renderMapLayer("prensa");

  document.querySelectorAll(".layer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".layer-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderMapLayer(btn.dataset.layer);
    });
  });

  document.getElementById("map-zoom-in")?.addEventListener("click", () =>
    svg.transition().call(zoomBehavior.scaleBy, 1.5));
  document.getElementById("map-zoom-out")?.addEventListener("click", () =>
    svg.transition().call(zoomBehavior.scaleBy, 0.67));
  document.getElementById("map-reset")?.addEventListener("click", () =>
    svg.transition().call(zoomBehavior.transform, d3.zoomIdentity));

  const ro = new ResizeObserver(() => {
    const nW = container.clientWidth;
    const nH = container.clientHeight;
    svg.attr("width", nW).attr("height", nH);
    proj.fitSize([nW, nH], boundary);
    gMap.selectAll("path").attr("d", path);
  });
  ro.observe(container);

  setStatus("Mapa estatal de Yucatán cargado correctamente.");
}

/* ═══════════════════════════════════════════════════════════════════
   RELIEVE 3-D (Three.js — sin cambios funcionales)
══════════════════════════════════════════════════════════════════════ */
async function initTerrain() {
  const msg = document.querySelector("#terrain-status");
  if (state.terrainStarted) return;
  state.terrainStarted = true;
  if (msg) msg.textContent = "Cargando modelo de elevación…";

  try {
    const [THREE, { OrbitControls }, { fromUrl }] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
      import("https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm"),
    ]);
    const tiff  = await fromUrl("./data/silver/lidar/yucatan_elevacion.tif");
    const image = await tiff.getImage();
    const cols  = 240;
    const rows  = Math.max(2, Math.round(cols * image.getHeight() / image.getWidth()));
    const elevations = await image.readRasters({ width: cols, height: rows, interleave: true });

    const nodataVal = image.getGDALNoData();
    const nodata = nodataVal == null ? null : Number(nodataVal);
    const valid  = Array.from(elevations, v => Number.isFinite(v) && (nodata === null || v !== nodata));
    const samples = Array.from(elevations).filter((_, i) => valid[i]);
    if (!samples.length) throw new Error("El ráster no contiene elevaciones válidas.");

    const mn = Math.min(...samples), mx = Math.max(...samples);
    const positions = new Float32Array(cols * rows * 3);
    const colors    = new Float32Array(cols * rows * 3);
    const indices   = [];
    const W = 150, H = W * rows / cols;
    const cLow = new THREE.Color("#3b1261");
    const cMid = new THREE.Color("#9c27b0");
    const cHigh = new THREE.Color("#d4af37");
    const color = new THREE.Color();
    let zScale = 0.16;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const v   = elevations[idx];
        const rawT = mx === mn ? 0 : Math.max(0, Math.min(1, (v - mn) / (mx - mn)));
        const t = Math.pow(rawT, 0.58);
        positions[idx*3]   = (c/(cols-1) - .5) * W;
        positions[idx*3+1] = (.5 - r/(rows-1)) * H;
        positions[idx*3+2] = valid[idx] ? (v - mn) * zScale : 0;

        if (t < 0.5) {
          color.lerpColors(cLow, cMid, t * 2);
        } else {
          color.lerpColors(cMid, cHigh, (t - 0.5) * 2);
        }
        colors[idx*3]   = color.r;
        colors[idx*3+1] = color.g;
        colors[idx*3+2] = color.b;
      }
    }
    for (let r = 0; r < rows-1; r++) {
      for (let c = 0; c < cols-1; c++) {
        const a = r*cols+c, b = a+1, cc = a+cols, d = cc+1;
        if (valid[a] && valid[b] && valid[cc] && valid[d]) indices.push(a,cc,b,b,cc,d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, metalness: .06, side: THREE.DoubleSide }));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f0620");
    scene.add(mesh);
    scene.add(new THREE.AmbientLight(0xffffff, 1.35));
    const light = new THREE.DirectionalLight(0xfff5e6, 2.1);
    light.position.set(-70, -85, 140);
    scene.add(light);

    const container = document.querySelector("#terrain-view");
    const renderer  = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.replaceChildren(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(40, container.clientWidth/container.clientHeight, .1, 1000);
    camera.up.set(0,0,1);
    const defaultCamPos = [W * 0.55, -H * 1.05, 82];
    camera.position.set(...defaultCamPos);
    camera.lookAt(0, 0, 8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 8);
    controls.enableDamping = true;
    controls.update();

    let exag2x = false;
    document.getElementById("terrain-exag")?.addEventListener("click", (ev) => {
      exag2x = !exag2x;
      mesh.scale.z = exag2x ? 2.0 : 1.0;
      ev.currentTarget.textContent = exag2x ? "Relieve 2×" : "Relieve 1×";
    });
    document.getElementById("terrain-reset")?.addEventListener("click", () => {
      camera.position.set(...defaultCamPos);
      controls.target.set(0, 0, 8);
      controls.update();
    });

    const animate = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); };
    animate();

    new ResizeObserver(() => {
      const { clientWidth: cW, clientHeight: cH } = container;
      if (!cW || !cH) return;
      camera.aspect = cW/cH; camera.updateProjectionMatrix();
      renderer.setSize(cW, cH);
    }).observe(container);

    if (msg) msg.textContent = `CEM 4.0 estatal (240×${rows}) · elevación ${mn.toFixed(0)}–${mx.toFixed(0)} m s. n. m.`;
    setStatus("Modelo de elevación cargado correctamente.");
  } catch (err) {
    state.terrainStarted = false;
    if (msg) msg.textContent = `No se pudo cargar el modelo 3D: ${err.message}`;
    setStatus("Error en el visor de relieve.", "error");
  }
}

/* ═══════════════════════════════════════════════════════════════════
   NAVEGACIÓN entre vistas
══════════════════════════════════════════════════════════════════════ */
function openView(name) {
  document.querySelectorAll(".tab").forEach(tab => {
    const on = tab.dataset.view === name;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll(".view").forEach(view => {
    const on = view.id === `view-${name}`;
    view.hidden = !on;
    view.classList.toggle("active", on);
  });

  requestAnimationFrame(() => {
    try {
      if (!state.data) return;
      if (name === "incidencia") renderIncidence();
      if (name === "percepcion") renderPerception();
      if (name === "territorio") initMap();
      if (name === "relieve")    initTerrain();
      if (name === "prensa")     renderNews();
    } catch (err) {
      setStatus(err.message, "error");
      console.error(`Error al abrir ${name}:`, err);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   CARGA DE DATOS
══════════════════════════════════════════════════════════════════════ */
async function fetchOptional(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function start() {
  try {
    const [incidence, perception, cifraOculta, newsByMonth, wordFrequency, bigrams, newsByOutlet, boundary, postalCodes] =
      await Promise.all(Object.values(DATASETS).map(fetchOptional));

    // Mínimo: necesitamos incidencia y percepción para los KPIs del inicio
    if (!incidence || !perception) {
      // Renderizar sin datos — placeholders en cada sección
      state.data = {
        incidence: [], perception: [], cifraOculta: [], newsByMonth: [], wordFrequency: [], bigrams: [], newsByOutlet: [],
        boundary: null, postalCodes: null,
      };
      placeholder("overview-wrap", "Pipeline ETL pendiente: ejecuta build_gold.py para generar los datos.");
      setStatus("Datos Gold pendientes de generación.", "error");

      document.querySelector("#kpi-incidencia").textContent = "—";
      document.querySelector("#kpi-percepcion").textContent = "—";
      document.querySelector("#kpi-noticias").textContent   = "—";
      return;
    }

    state.data = {
      incidence:     incidence     || [],
      perception:    perception    || [],
      cifraOculta:   cifraOculta   || [],
      newsByMonth:   newsByMonth   || [],
      wordFrequency: wordFrequency || [],
      bigrams:       bigrams       || [],
      newsByOutlet:  newsByOutlet  || [],
      boundary,
      postalCodes,
    };

    renderOverview();
    setStatus("Tablas Gold cargadas correctamente.");
  } catch (err) {
    setStatus(err.message, "error");
    console.error("Error al iniciar el dashboard:", err);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   EVENTS
══════════════════════════════════════════════════════════════════════ */
document.querySelectorAll(".tab").forEach((tab, i, tabs) => {
  tab.addEventListener("click", () => openView(tab.dataset.view));
  tab.addEventListener("keydown", e => {
    if (!["ArrowLeft","ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const dir  = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    next.focus(); openView(next.dataset.view);
  });
});

document.querySelector("#incidencia-year")?.addEventListener("change", () => {
  if (!document.querySelector("#view-incidencia").hidden) renderIncidence();
});

start();
