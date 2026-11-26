/**
 * app.js — Dashboard D3.js v7
 * Paleta: morado (#4A148C, #6A1B9A, #9C27B0) + oro (#D4AF37, #FFB300, #FFD54F)
 * Rutas relativas para funcionar en subcarpeta o GitHub Pages.
 */

/* ── Rutas ───────────────────────────────────────────────────────── */
const BASE = "./data/gold/dashboard";
const DATASETS = {
  incidence:     `${BASE}/incidencia_yucatan_mensual_v1.json`,
  perception:    `${BASE}/percepcion_ensu_anual_v1.json`,
  newsByMonth:   `${BASE}/noticias_mensuales_v1.json`,
  wordFrequency: `${BASE}/frecuencia_palabras_titulares_v1.json`,
  boundary:      `${BASE}/territorio/limite_municipal_merida.geojson`,
  postalCodes:   `${BASE}/territorio/codigos_postales_merida.geojson`,
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
  document.querySelector("#kpi-percepcion").textContent = `${num(latestPerc.porcentaje_inseguridad_promedio).toFixed(1)}%`;
  document.querySelector("#kpi-percepcion-label").textContent = `ENSU · Mérida · ${latestPerc.anio}`;
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

/* ── Percepción ────────────────────────────────────────────────────── */
function renderPerception() {
  const rows = [...state.data.perception].sort((a, b) => num(a.anio) - num(b.anio));
  drawBars("percepcion-wrap", {
    data: rows.map(r => ({ x: String(r.anio), y: num(r.porcentaje_inseguridad_promedio) })),
    color: C.goldDeep,
    yPercent: true,
    yFormat: d => `${d}%`,
    tooltipFn: d => `<strong>${d.x}</strong>${d.y.toFixed(1)}% inseguro`,
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

  const words = state.data.wordFrequency.slice(0, 12);
  drawHorizBars("palabras-wrap", {
    data: words.map(r => ({ label: r.palabra, value: num(r.frecuencia) })),
    color: C.goldDeep,
    tooltipFn: d => `<strong>${d.label}</strong>${d.value.toLocaleString("es-MX")} menciones`,
  });
}

/* ═══════════════════════════════════════════════════════════════════
   MAPA D3 con GeoJSON
══════════════════════════════════════════════════════════════════════ */
function initMap() {
  if (state.mapInited) return;
  state.mapInited = true;

  const container = document.getElementById("map-container");
  if (!container) return;

  const { boundary, postalCodes } = state.data;
  const hasGeo = boundary && postalCodes;
  if (!hasGeo) {
    // Placeholder de mapa
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
    .attr("aria-label", "Mapa de Mérida con códigos postales");

  // Projection fitted to boundary
  const proj = d3.geoMercator().fitSize([W, H], boundary);
  const path = d3.geoPath(proj);

  // Zoom
  const zoomBehavior = d3.zoom()
    .scaleExtent([0.5, 20])
    .on("zoom", ({ transform }) => { gMap.attr("transform", transform); });
  svg.call(zoomBehavior);

  const gMap = svg.append("g");

  // Postal codes
  gMap.selectAll(".map-postal")
    .data(postalCodes.features).enter().append("path")
    .attr("class", "map-postal")
    .attr("d", path)
    .on("mousemove", (event, d) => {
      const cp = d.properties?.d_cp ?? "sin dato";
      showTip(event, `<strong>CP ${cp}</strong>`);
    })
    .on("mouseleave", hideTip);

  // Municipal boundary
  gMap.selectAll(".map-boundary")
    .data(boundary.features ?? [boundary]).enter().append("path")
    .attr("class", "map-boundary")
    .attr("d", path);

  // Zoom controls
  document.getElementById("map-zoom-in")?.addEventListener("click", () =>
    svg.transition().call(zoomBehavior.scaleBy, 1.5));
  document.getElementById("map-zoom-out")?.addEventListener("click", () =>
    svg.transition().call(zoomBehavior.scaleBy, 0.67));
  document.getElementById("map-reset")?.addEventListener("click", () =>
    svg.transition().call(zoomBehavior.transform, d3.zoomIdentity));

  // Responsive
  const ro = new ResizeObserver(() => {
    const nW = container.clientWidth;
    const nH = container.clientHeight;
    svg.attr("width", nW).attr("height", nH);
    proj.fitSize([nW, nH], boundary);
    gMap.selectAll("path").attr("d", path);
  });
  ro.observe(container);

  setStatus("Mapa Gold cargado correctamente.");
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
    const tiff  = await fromUrl("./data/silver/lidar/merida_elevacion.tif");
    const image = await tiff.getImage();
    const cols  = 160;
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
    const color = new THREE.Color();

    // Paleta morado→oro para elevación
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const v   = elevations[idx];
        const t   = mx === mn ? 0 : (v - mn) / (mx - mn);
        positions[idx*3]   = (c/(cols-1) - .5) * W;
        positions[idx*3+1] = (.5 - r/(rows-1)) * H;
        positions[idx*3+2] = valid[idx] ? (v - mn) * 2.2 : 0;
        // Map t 0→1 : deep purple → gold
        color.lerpColors(
          new THREE.Color(C.purpleDeep),
          new THREE.Color(C.goldDeep),
          t
        );
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
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, side: THREE.DoubleSide }));

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f0620");
    scene.add(mesh);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(-80, -70, 160);
    scene.add(light);

    const container = document.querySelector("#terrain-view");
    const renderer  = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.replaceChildren(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(42, container.clientWidth/container.clientHeight, .1, 1000);
    camera.up.set(0,0,1);
    camera.position.set(W*.8, -H*1.15, Math.max(85, (mx-mn)*2.8));
    camera.lookAt(0,0,10);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0,0,10); controls.enableDamping = true; controls.update();

    const animate = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); };
    animate();

    new ResizeObserver(() => {
      const { clientWidth: cW, clientHeight: cH } = container;
      if (!cW || !cH) return;
      camera.aspect = cW/cH; camera.updateProjectionMatrix();
      renderer.setSize(cW, cH);
    }).observe(container);

    if (msg) msg.textContent = `Malla simplificada · modelo de elevación INEGI CEM 4.0 · ${mn}–${mx} m`;
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
    const [incidence, perception, newsByMonth, wordFrequency, boundary, postalCodes] =
      await Promise.all(Object.values(DATASETS).map(fetchOptional));

    // Mínimo: necesitamos incidencia y percepción para los KPIs del inicio
    if (!incidence || !perception) {
      // Renderizar sin datos — placeholders en cada sección
      state.data = {
        incidence: [], perception: [], newsByMonth: [], wordFrequency: [],
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
      newsByMonth:   newsByMonth   || [],
      wordFrequency: wordFrequency || [],
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
