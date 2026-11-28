
function renderTitularesVisor(payload) {
  const wrapLista = document.getElementById("titulares-lista");
  const wrapMedios = document.getElementById("titulares-medios-pills");
  const selMun = document.getElementById("titulares-mun-select");
  const inpSearch = document.getElementById("titulares-search");
  const countEl = document.getElementById("titulares-count-label");
  const subEl = document.getElementById("titulares-resumen-sub");

  if (!wrapLista || !payload) return;

  const items = Array.isArray(payload.titulares) ? payload.titulares : [];
  const topMedios = Array.isArray(payload.top_medios) ? payload.top_medios : [];

  if (subEl) {
    const tot = Number(payload.total_titulares || items.length).toLocaleString("es-MX");
    const muns = Number(payload.municipios_con_notas || 0);
    const meds = Number(payload.medios_distintos || 0);
    subEl.textContent = `${tot} titulares recolectados en ${muns} municipios y ${meds} medios (mostrando muestra filtrable)`;
  }

  if (selMun && selMun.options.length <= 1) {
    const munCounts = new Map();
    for (const it of items) {
      const m = it.municipio || "Yucatán";
      munCounts.set(m, (munCounts.get(m) || 0) + 1);
    }
    const sortedMuns = [...munCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [m, c] of sortedMuns) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = `${m} (${c})`;
      selMun.appendChild(opt);
    }
  }

  let medioActivo = "";

  if (wrapMedios) {
    wrapMedios.innerHTML = "";
    for (const m of topMedios.slice(0, 8)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "layer-btn";
      btn.textContent = `${m.medio} (${m.total})`;
      btn.addEventListener("click", () => {
        medioActivo = medioActivo === m.medio ? "" : m.medio;
        [...wrapMedios.querySelectorAll("button")].forEach(b => b.classList.toggle("active", b === btn && Boolean(medioActivo)));
        pintar();
      });
      wrapMedios.appendChild(btn);
    }
  }

  function pintar() {
    const munVal = selMun ? selMun.value : "__ALL__";
    const qVal = (inpSearch ? inpSearch.value : "").trim().toLowerCase();

    const filtrados = items.filter(it => {
      const okMun = munVal === "__ALL__" || (it.municipio || "Yucatán") === munVal;
      const okMedio = !medioActivo || (it.medio || "") === medioActivo;
      const texto = `${it.municipio || ""} ${it.medio || ""} ${it.titular || ""}`.toLowerCase();
      const okQ = !qVal || texto.includes(qVal);
      return okMun && okMedio && okQ;
    });

    const visibles = filtrados.slice(0, 36);
    if (countEl) {
      countEl.textContent = `${visibles.length} de ${filtrados.length}`;
    }

    wrapLista.innerHTML = "";
    if (!visibles.length) {
      wrapLista.innerHTML = `<p class="subtitulo-tecnico">No hay titulares que coincidan con ese filtro.</p>`;
      return;
    }

    for (const it of visibles) {
      const card = document.createElement("article");
      card.style.cssText = "border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fff;display:flex;flex-direction:column;justify-content:space-between;gap:8px;";

      const meta = document.createElement("div");
      meta.style.cssText = "font-size:12px;color:#5b21b6;font-weight:700;";
      meta.textContent = `${it.medio || "Medio"} · ${it.municipio || "Yucatán"}`;

      const title = document.createElement("div");
      title.style.cssText = "font-size:14px;line-height:1.4;color:#111827;font-weight:600;";
      title.textContent = it.titular || "";

      const foot = document.createElement("div");
      foot.style.cssText = "display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#6b7280;gap:8px;";
      const fechaSpan = document.createElement("span");
      fechaSpan.textContent = (it.fecha || "").slice(0, 16);
      foot.appendChild(fechaSpan);

      if (it.url) {
        const a = document.createElement("a");
        a.href = it.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = "Ver nota →";
        a.style.cssText = "color:#5b21b6;font-weight:700;text-decoration:none;";
        foot.appendChild(a);
      }

      card.append(meta, title, foot);
      wrapLista.appendChild(card);
    }
  }

  if (selMun) selMun.addEventListener("change", pintar);
  if (inpSearch) inpSearch.addEventListener("input", pintar);
  pintar();
}

async function initTitularesVisor() {
  try {
    const r = await fetch(`${BASE}/titulares_muestra_v1.json`);
    if (!r.ok) return;
    const payload = await r.json();
    renderTitularesVisor(payload);
  } catch (e) {
    console.warn("Visor de titulares no disponible:", e);
  }
}

/**
 * app.js — Capítulo 05: Percepción de inseguridad en Yucatán (D3.js v7)
 */
const BASE = "./data/gold/dashboard";
const DATASETS = {
  incidence:     `${BASE}/incidencia_yucatan_mensual_v1.json`,
  perception:    `${BASE}/percepcion_envipe_anual_v1.json`,
  cifraOculta:   `${BASE}/cifra_oculta_envipe_v1.json`,
  wordFrequency: `${BASE}/frecuencia_palabras_titulares_v1.json`,
  boundary:      `${BASE}/territorio/municipios_yucatan.geojson`,
};

const PAL = {
  purple:    "#600d8b",
  amber:     "#ed9f22",
  amberDark: "#b45309",
  gray:      "#9ca3af",
  ink:       "#0d0d0d",
  border:    "#e5e7eb",
};

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const state = {
  data: null,
  layer: "prensa",
  selectedMun: null,
  terrainStarted: false,
  resizeObservers: new Map(),
};

const tooltip = d3.select("#d3-tooltip");
function showTip(event, html) {
  tooltip.html(html).classed("visible", true)
    .style("left", Math.min(window.innerWidth - 270, event.clientX + 14) + "px")
    .style("top",  Math.max(12, event.clientY - 36) + "px");
}
function hideTip() { tooltip.classed("visible", false); }

function setStatus(msg, kind = "ready") {
  const el = document.querySelector("#data-status");
  if (el) el.textContent = msg;
  const dot = document.querySelector(".status-dot");
  if (dot) {
    dot.classList.toggle("ready", kind === "ready");
    dot.classList.toggle("error", kind === "error");
  }
}

function num(v) {
  const r = Number(v);
  return Number.isFinite(r) ? r : 0;
}

function bindResize(id, fn) {
  if (state.resizeObservers.has(id)) {
    state.resizeObservers.get(id).disconnect();
    state.resizeObservers.delete(id);
  }
  const el = document.getElementById(id);
  if (!el) return;
  fn();
  const ro = new ResizeObserver(fn);
  ro.observe(el);
  state.resizeObservers.set(id, ro);
}

/* ── KPIs de apertura ───────────────────────────────────────────── */
function renderHeroKPIs() {
  const { incidence, perception, cifraOculta } = state.data;

  if (perception.length) {
    const latestPerc = [...perception].sort((a, b) => num(b.anio) - num(a.anio))[0];
    const pctTotal = num(latestPerc.porcentaje_inseguridad_total);
    (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#hero-pct"), `${pctTotal.toFixed(1)} %`);
    (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#kpi-percepcion"), `${pctTotal.toFixed(1)} %`);
    (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#kpi-percepcion-label"), `Población de 18+ años que se siente insegura · INEGI, ENVIPE ${latestPerc.anio}`);
  }

  if (cifraOculta.length) {
    const maxCoYr = Math.max(...cifraOculta.map(r => num(r.anio)));
    const topDelito = cifraOculta
      .filter(r => num(r.anio) === maxCoYr && r.delito !== "Total")
      .sort((a, b) => num(b.porcentaje_cifra_oculta) - num(a.porcentaje_cifra_oculta))[0];
    if (topDelito) {
      const val = num(topDelito.porcentaje_cifra_oculta);
      (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#kpi-oculta"), `${val.toFixed(1)} %`);
      (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#kpi-oculta-label"), `Sin denuncia en ${topDelito.delito.toLowerCase()} · INEGI, ENVIPE ${maxCoYr}`);
      (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#oculta-headline"), `${val.toFixed(1)} %`);
    }
  }

    (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#kpi-incidencia"), "3,398");
  (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#kpi-incidencia-label"), "Titulares recolectados en 106 municipios · Google News RSS");
}

/* ── Escena 1: Pictogramas + Serie limpia sin rejillas ──────────── */
function renderEscena1() {
  const rows = [...state.data.perception].sort((a, b) => num(a.anio) - num(b.anio));
  if (!rows.length) return;

  const slider = document.getElementById("perc-year-slider");
  const label = document.getElementById("perc-year-label");
  const playBtn = document.getElementById("perc-play-btn");
  if (slider && !slider.dataset.ready) {
    slider.dataset.ready = "1";
    slider.min = 0;
    slider.max = rows.length - 1;
    slider.value = rows.length - 1;
    slider.addEventListener("input", () => renderEscena1());

    let timer = null;
    const stopPlay = () => {
      if (timer) { clearInterval(timer); timer = null; }
      if (playBtn) { playBtn.textContent = "▶ Reproducir"; playBtn.classList.remove("active"); }
    };
    playBtn?.addEventListener("click", () => {
      if (timer) { stopPlay(); return; }
      if (Number(slider.value) >= rows.length - 1) slider.value = 0;
      renderEscena1();
      playBtn.textContent = "⏸ Pausar";
      playBtn.classList.add("active");
      timer = setInterval(() => {
        const next = Number(slider.value) + 1;
        if (next >= rows.length) { stopPlay(); return; }
        slider.value = String(next);
        renderEscena1();
      }, 850);
    });
  }

  const idx = slider ? Number(slider.value) : rows.length - 1;
  const cur = rows[idx] || rows.at(-1);
  if (label) label.textContent = cur.anio;

  const mVal = num(cur.porcentaje_inseguridad_mujeres);
  const hVal = num(cur.porcentaje_inseguridad_hombres);
  const tVal = num(cur.porcentaje_inseguridad_total);
  const gap = Math.abs(mVal - hVal);
  (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#gap-headline"), `+${gap.toFixed(1)}`);

  bindResize("percepcion-pictos-wrap", () => {
    const wrap = document.getElementById("percepcion-pictos-wrap");
    if (!wrap) return;
    wrap.innerHTML = "";
    const W = wrap.clientWidth || 480;
    const H = 310;
    const svg = d3.select(wrap).append("svg").attr("viewBox", `0 0 ${W} ${H}`);

    svg.append("text").attr("x", W * 0.5).attr("y", 30).attr("text-anchor", "middle")
      .style("font-size", "12.5px").style("font-weight", "800").style("fill", PAL.amberDark)
      .text(`Brecha ${cur.anio}: +${gap.toFixed(1)} puntos porcentuales`);

    const drawGroup = (cx, pct, color, name) => {
      const g = svg.append("g").attr("transform", `translate(${cx}, 68)`);
      g.append("text").attr("y", 0).attr("text-anchor", "middle")
        .style("font-size", "11.5px").style("font-weight", "700").style("fill", PAL.ink).text(name);
      g.append("text").attr("y", 34).attr("text-anchor", "middle")
        .style("font-size", "30px").style("font-weight", "800").style("fill", color).text(`${pct.toFixed(1)} %`);

      const filled = Math.round(pct / 10);
      for (let i = 0; i < 10; i++) {
        const px = ((i % 5) - 2) * 24;
        const py = 58 + Math.floor(i / 5) * 44;
        const on = i < filled;
        const p = g.append("g").attr("transform", `translate(${px},${py})`);
        p.append("circle").attr("r", 5).attr("fill", on ? color : PAL.border);
        p.append("rect").attr("x", -5.5).attr("y", 7).attr("width", 11).attr("height", 17).attr("rx", 5).attr("fill", on ? color : PAL.border);
      }
    };

    drawGroup(W * 0.27, mVal, PAL.purple, "MUJERES (FOCO)");
    drawGroup(W * 0.73, hVal, PAL.amber, "HOMBRES (COMPARACIÓN)");

    svg.append("text").attr("x", W * 0.5).attr("y", H - 14).attr("text-anchor", "middle")
      .style("font-size", "12px").style("font-weight", "600").style("fill", PAL.gray)
      .text(`Total estatal ${cur.anio}: ${tVal.toFixed(1)} %`);
  });

  bindResize("percepcion-linea-wrap", () => {
    const wrap = document.getElementById("percepcion-linea-wrap");
    if (!wrap) return;
    wrap.innerHTML = "";
    const W = wrap.clientWidth || 480;
    const H = 310;
    const m = { top: 22, right: 94, bottom: 30, left: 42 };
    const w = W - m.left - m.right;
    const h = H - m.top - m.bottom;

    const svg = d3.select(wrap).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const x = d3.scalePoint().domain(rows.map(r => String(r.anio))).range([0, w]);
    const y = d3.scaleLinear().domain([0, 60]).range([h, 0]);

    g.append("g").call(d3.axisLeft(y).ticks(4).tickFormat(v => `${v}%`).tickSize(0).tickPadding(8))
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("text").style("font-size", "11px").style("fill", PAL.gray));

    g.append("g").attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).tickValues(rows.filter(r => num(r.anio) % 3 === 0).map(r => String(r.anio))).tickSize(4))
      .call(ax => ax.select(".domain").attr("stroke", PAL.border))
      .call(ax => ax.selectAll("line").attr("stroke", PAL.border))
      .call(ax => ax.selectAll("text").style("font-size", "11px").style("fill", PAL.gray));

    const series = [
      { key: "porcentaje_inseguridad_mujeres", label: "Mujeres", color: PAL.purple, width: 2.8, dash: null },
      { key: "porcentaje_inseguridad_total",   label: "Total",   color: PAL.gray,   width: 1.8, dash: "4,3" },
      { key: "porcentaje_inseguridad_hombres", label: "Hombres", color: PAL.amber,  width: 2.6, dash: null },
    ];

    const last = rows.at(-1);
    series.forEach(s => {
      const line = d3.line().x(r => x(String(r.anio))).y(r => y(num(r[s.key])));
      g.append("path").datum(rows).attr("fill", "none")
        .attr("stroke", s.color).attr("stroke-width", s.width)
        .attr("stroke-dasharray", s.dash || "none").attr("d", line);

      g.selectAll(null).data(rows).enter().append("circle")
        .attr("cx", r => x(String(r.anio))).attr("cy", r => y(num(r[s.key])))
        .attr("r", r => r.anio === cur.anio ? 5 : 3).attr("fill", s.color)
        .on("mousemove", (ev, r) => showTip(ev, `<strong>${s.label} · ${r.anio}</strong>${num(r[s.key]).toFixed(1)} %`))
        .on("mouseleave", hideTip);

      g.append("text")
        .attr("x", x(String(last.anio)) + 8)
        .attr("y", y(num(last[s.key])) + 4)
        .style("font-size", "11px").style("font-weight", "700").style("fill", s.color)
        .text(`${s.label} ${num(last[s.key]).toFixed(1)}%`);
    });
  });
}

/* ── Escena 2: Cifra oculta ─────────────────────────────────────── */
function renderEscena2() {
  const co = state.data.cifraOculta || [];
  if (!co.length) return;

  const years = [...new Set(co.map(r => num(r.anio)))].sort((a, b) => b - a);
  const sel = document.getElementById("cifra-oculta-year");
  if (sel && !sel.options.length) {
    years.forEach(yr => {
      const opt = document.createElement("option");
      opt.value = String(yr); opt.textContent = String(yr);
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => renderEscena2());
  }

  const chosenYear = sel ? Number(sel.value) : years[0];
  const yrRows = co.filter(r => num(r.anio) === chosenYear);
  const totalRow = yrRows.find(r => r.delito === "Total");
  const avgVal = totalRow ? num(totalRow.porcentaje_cifra_oculta) : null;

  const items = yrRows
    .filter(r => r.delito !== "Total")
    .sort((a, b) => num(b.porcentaje_cifra_oculta) - num(a.porcentaje_cifra_oculta))
    .slice(0, 9)
    .map(r => ({ label: r.delito, value: num(r.porcentaje_cifra_oculta) }));

  if (items.length) {
    (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#oculta-headline"), `${items[0].value.toFixed(1)} %`);
  }

  bindResize("cifra-oculta-wrap", () => {
    const wrap = document.getElementById("cifra-oculta-wrap");
    if (!wrap || !items.length) return;
    wrap.innerHTML = "";
    const W = wrap.clientWidth || 960;
    const H = 340;
    const m = { top: 26, right: 68, bottom: 20, left: Math.min(265, W * 0.36) };
    const w = W - m.left - m.right;
    const h = H - m.top - m.bottom;

    const svg = d3.select(wrap).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const y = d3.scaleBand().domain(items.map(d => d.label)).range([0, h]).padding(0.28);
    const x = d3.scaleLinear().domain([0, 100]).range([0, w]);

    g.append("g").call(d3.axisLeft(y).tickSize(0).tickPadding(10))
      .call(ax => ax.select(".domain").remove())
      .selectAll("text").style("font-size", "12px").style("font-weight", "600").style("fill", PAL.ink)
      .text(d => d.length > 36 ? d.slice(0, 34) + "…" : d);

    const rowsG = g.selectAll(".lollipop-row")
      .data(items).enter().append("g")
      .attr("class", "lollipop-row")
      .style("cursor", "pointer");

    // Riel de fondo 0 - 100%
    rowsG.append("rect")
      .attr("x", 0)
      .attr("y", d => y(d.label) + y.bandwidth() / 2 - 4)
      .attr("width", w)
      .attr("height", 8)
      .attr("rx", 4)
      .attr("fill", "#f3f4f6");

    // Tallo animado
    rowsG.append("line")
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", d => y(d.label) + y.bandwidth() / 2)
      .attr("y2", d => y(d.label) + y.bandwidth() / 2)
      .attr("stroke", d => d.value >= 90 ? PAL.purple : "#6b7280")
      .attr("stroke-width", 4)
      .attr("stroke-linecap", "round")
      .transition().duration(550).delay((_, i) => i * 45)
      .attr("x2", d => x(d.value));

    // Halo exterior del nodo
    rowsG.append("circle")
      .attr("cx", 0)
      .attr("cy", d => y(d.label) + y.bandwidth() / 2)
      .attr("r", 0)
      .attr("fill", d => d.value >= 90 ? PAL.purple : "#6b7280")
      .attr("opacity", 0.18)
      .transition().duration(550).delay((_, i) => i * 45)
      .attr("cx", d => x(d.value))
      .attr("r", 12);

    // Nodo principal
    rowsG.append("circle")
      .attr("class", "lollipop-dot")
      .attr("cx", 0)
      .attr("cy", d => y(d.label) + y.bandwidth() / 2)
      .attr("r", 0)
      .attr("fill", d => d.value >= 90 ? PAL.purple : "#4b5563")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2)
      .transition().duration(550).delay((_, i) => i * 45)
      .attr("cx", d => x(d.value))
      .attr("r", 6.5);

    // Etiqueta de porcentaje
    rowsG.append("text")
      .attr("x", 14)
      .attr("y", d => y(d.label) + y.bandwidth() / 2 + 4)
      .style("font-size", "12px").style("font-weight", "800")
      .style("fill", d => d.value >= 90 ? PAL.purple : PAL.ink)
      .text(d => `${d.value.toFixed(1)} %`)
      .transition().duration(550).delay((_, i) => i * 45)
      .attr("x", d => x(d.value) + 14);

    // Interacción hover con resalte
    rowsG
      .on("mousemove", function(ev, d) {
        rowsG.style("opacity", 0.38);
        d3.select(this).style("opacity", 1);
        d3.select(this).select(".lollipop-dot").attr("r", 8.5);
        const den = (100 - d.value).toFixed(1);
        showTip(ev, `<strong>${d.label} (${chosenYear})</strong>${d.value.toFixed(1)} % sin denuncia · Solo ${den} % denunciado`);
      })
      .on("mouseleave", function() {
        rowsG.style("opacity", 1);
        d3.select(this).select(".lollipop-dot").attr("r", 6.5);
        hideTip();
      });

    if (avgVal !== null) {
      g.append("line")
        .attr("x1", x(avgVal)).attr("x2", x(avgVal))
        .attr("y1", -4).attr("y2", h)
        .attr("stroke", PAL.amber).attr("stroke-width", 2.2);
      g.append("text")
        .attr("x", x(avgVal)).attr("y", -10).attr("text-anchor", "middle")
        .style("font-size", "11px").style("font-weight", "800").style("fill", PAL.amberDark)
        .text(`Total estatal ${chosenYear}: ${avgVal.toFixed(1)} %`);
    }
  });
}

/* ── Escena 3: Reloj mensual + Delitos SESNSP ───────────────────── */
function shortDelitoLabel(name) {
  const s = String(name || "").trim();
  const low = s.toLowerCase();
  if (low.includes("libertad y la seguridad sexual") || low.includes("libertad sexual")) return "Otros c/ libertad sexual";
  if (low.includes("libertad personal")) return "Otros c/ libertad personal";
  if (low.includes("vida y la integridad")) return "Otros c/ vida e integridad";
  if (low.includes("contra la familia")) return "Otros c/ la familia";
  if (low.includes("contra el patrimonio")) return "Otros c/ el patrimonio";
  if (low.includes("violencia de género")) return "Violencia de género";
  return s.length > 26 ? s.slice(0, 24) + "…" : s;
}

function renderEscena3() {
  const rows = state.data.incidence || [];
  if (!rows.length) return;

  const years = [...new Set(rows.map(r => num(r.anio)))].sort((a, b) => a - b);
  const sel = document.querySelector("#incidencia-year");
  if (sel && !sel.options.length) {
    years.forEach(yr => {
      const o = document.createElement("option");
      o.value = String(yr); o.textContent = String(yr);
      sel.appendChild(o);
    });
    sel.value = String(years.at(-1));
    sel.addEventListener("change", () => { renderEscena3(); document.dispatchEvent(new CustomEvent("sesnsp-year-change", { detail: Number(sel.value) })); });
  }

  const yr = Number(sel.value);
  const yrRows = rows.filter(r => num(r.anio) === yr);
  const totalYr = yrRows.reduce((s, r) => s + num(r.casos), 0);
  (function(el, v){ if (el) el.textContent = v; })(document.querySelector("#sesnsp-headline"), Math.round(totalYr).toLocaleString("es-MX"));

  const byMonth = Array.from({ length: 12 }, (_, i) => ({
    x: MONTHS[i],
    full: MONTHS_FULL[i],
    y: yrRows.filter(r => num(r.mes) === i + 1).reduce((s, r) => s + num(r.casos), 0),
  }));
  const maxMonthVal = d3.max(byMonth, d => d.y) || 0;

  bindResize("incidencia-month-wrap", () => {
    const wrap = document.getElementById("incidencia-month-wrap");
    if (!wrap) return;
    wrap.innerHTML = "";
    const W = wrap.clientWidth || 460;
    const H = 310;
    const size = Math.min(W, H);
    const innerR = size * 0.17;
    const outerR = size * 0.38;

    const svg = d3.select(wrap).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const g = svg.append("g").attr("transform", `translate(${W / 2},${H / 2})`);

    const angle = d3.scaleBand().domain(byMonth.map(d => d.x)).range([0, 2 * Math.PI]).padding(0.14);
    const radius = d3.scaleLinear().domain([0, maxMonthVal || 1]).range([innerR, outerR]);

    // Anillos guía de radar editorial
    [0.35, 0.68, 1].forEach(t => {
      g.append("circle")
        .attr("r", innerR + (outerR - innerR) * t)
        .attr("fill", "none")
        .attr("stroke", "#e5e7eb")
        .attr("stroke-dasharray", t === 1 ? "none" : "3,3")
        .attr("stroke-width", 1);
    });

    const arc = d3.arc()
      .innerRadius(innerR)
      .outerRadius(d => radius(d.y))
      .startAngle(d => angle(d.x))
      .endAngle(d => angle(d.x) + angle.bandwidth())
      .cornerRadius(6);

    const centerTop = g.append("text")
      .attr("y", -3)
      .attr("text-anchor", "middle")
      .style("font-size", "17px")
      .style("font-weight", "800")
      .style("fill", PAL.ink)
      .text(yr);

    const centerSub = g.append("text")
      .attr("y", 14)
      .attr("text-anchor", "middle")
      .style("font-size", "10.5px")
      .style("font-weight", "700")
      .style("fill", PAL.purple)
      .text(`${Math.round(totalYr).toLocaleString("es-MX")} total`);

    const petals = g.selectAll(".petal")
      .data(byMonth).enter().append("path")
      .attr("class", "petal")
      .style("cursor", "pointer")
      .attr("fill", d => d.y === maxMonthVal && maxMonthVal > 0 ? PAL.purple : "#9ca3af")
      .attr("opacity", d => d.y === maxMonthVal && maxMonthVal > 0 ? 0.95 : 0.78);

    petals.transition()
      .duration(600)
      .delay((_, i) => i * 35)
      .attrTween("d", function(d) {
        const interp = d3.interpolate(innerR, radius(d.y));
        return t => d3.arc()
          .innerRadius(innerR)
          .outerRadius(interp(t))
          .startAngle(angle(d.x))
          .endAngle(angle(d.x) + angle.bandwidth())
          .cornerRadius(6)();
      });

    petals
      .on("mousemove", function(ev, d) {
        petals.attr("opacity", 0.35);
        d3.select(this).attr("opacity", 1).attr("fill", PAL.amber);
        centerTop.text(d.x.toUpperCase());
        centerSub.text(`${Math.round(d.y).toLocaleString("es-MX")} casos`);
        const share = totalYr > 0 ? ((d.y / totalYr) * 100).toFixed(1) : "0.0";
        showTip(ev, `<strong>${d.full} ${yr}</strong>${Math.round(d.y).toLocaleString("es-MX")} víctimas (${share} % del año)`);
      })
      .on("mouseleave", function() {
        petals
          .attr("fill", d => d.y === maxMonthVal && maxMonthVal > 0 ? PAL.purple : "#9ca3af")
          .attr("opacity", d => d.y === maxMonthVal && maxMonthVal > 0 ? 0.95 : 0.78);
        centerTop.text(yr);
        centerSub.text(`${Math.round(totalYr).toLocaleString("es-MX")} total`);
        hideTip();
      });

    byMonth.forEach(d => {
      const a = angle(d.x) + angle.bandwidth() / 2 - Math.PI / 2;
      const lx = Math.cos(a) * (outerR + 22);
      const ly = Math.sin(a) * (outerR + 22);
      g.append("text").attr("x", lx).attr("y", ly + 4).attr("text-anchor", "middle")
        .style("font-size", "10.5px").style("font-weight", d.y === maxMonthVal && maxMonthVal > 0 ? "800" : "600")
        .style("fill", d.y === maxMonthVal && maxMonthVal > 0 ? PAL.purple : PAL.ink)
        .text(`${d.x} (${Math.round(d.y)})`);
    });
  });

  const byType = new Map();
  for (const r of yrRows) byType.set(r.delito, (byType.get(r.delito) || 0) + num(r.casos));
  const top8 = [...byType.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([label, value]) => ({ label, value }));

  bindResize("incidencia-type-wrap", () => {
    const wrap = document.getElementById("incidencia-type-wrap");
    if (!wrap || !top8.length) return;
    wrap.innerHTML = "";
    const W = wrap.clientWidth || 470;
    const H = 385;
    const m = { top: 8, right: 108, bottom: 10, left: Math.min(182, W * 0.41) };
    const w = W - m.left - m.right;
    const h = H - m.top - m.bottom;

    const svg = d3.select(wrap).append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .style("width", "100%")
      .style("display", "block");
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const y = d3.scaleBand().domain(top8.map(d => d.label)).range([0, h]).padding(0.22);
    const x = d3.scaleLinear().domain([0, (d3.max(top8, d => d.value) || 1) * 1.38]).range([0, w]);

    g.append("g").call(d3.axisLeft(y).tickSize(0).tickPadding(8))
      .call(ax => ax.select(".domain").remove())
      .selectAll("text").style("font-size", "11.5px").style("font-weight", "600").style("fill", PAL.ink)
      .text(d => shortDelitoLabel(d));

    const barColor = (i) => (i === 0 ? PAL.purple : i === 1 ? PAL.amber : PAL.gray);

    const rowsG = g.selectAll(".type-row")
      .data(top8).enter().append("g")
      .attr("class", "type-row")
      .style("cursor", "pointer");

    rowsG.append("rect")
      .attr("x", 0).attr("y", d => y(d.label))
      .attr("width", w).attr("height", y.bandwidth())
      .attr("rx", 6).attr("fill", "#f3f4f6");

    rowsG.append("rect")
      .attr("class", "type-bar")
      .attr("y", d => y(d.label)).attr("height", y.bandwidth())
      .attr("x", 0).attr("width", 0).attr("rx", 6)
      .attr("fill", (_, i) => barColor(i))
      .transition().duration(550).delay((_, i) => i * 45)
      .attr("width", d => x(d.value));

    rowsG.append("text")
      .attr("x", 8)
      .attr("y", d => y(d.label) + y.bandwidth() / 2 + 4)
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", "11px").style("font-weight", "700")
      .style("fill", (_, i) => i === 0 ? PAL.purple : i === 1 ? PAL.amberDark : PAL.ink)
      .text(d => {
        const val = Math.round(d.value).toLocaleString("es-MX");
        const pct = totalYr > 0 ? ((d.value / totalYr) * 100).toFixed(1) : "0.0";
        return `${val} (${pct}%)`;
      })
      .transition().duration(550).delay((_, i) => i * 45)
      .attr("x", d => x(d.value) + 8);

    rowsG
      .on("mousemove", function(ev, d) {
        rowsG.style("opacity", 0.38);
        d3.select(this).style("opacity", 1);
        d3.select(this).select(".type-bar").attr("fill", PAL.amberDark);
        const pct = totalYr > 0 ? ((d.value / totalYr) * 100).toFixed(1) : "0.0";
        showTip(ev, `<strong>${d.label} (${yr})</strong>${Math.round(d.value).toLocaleString("es-MX")} víctimas (${pct} % del total)`);
      })
      .on("mouseleave", function(_, d) {
        rowsG.style("opacity", 1);
        const idx = top8.indexOf(d);
        d3.select(this).select(".type-bar").attr("fill", barColor(idx));
        hideTip();
      });

    // Pie editorial al fondo de la tarjeta para aprovechar el espacio y sintetizar la concentración
    const top2Sum = top8.slice(0, 2).reduce((s, d) => s + d.value, 0);
    const top2Share = totalYr > 0 ? ((top2Sum / totalYr) * 100).toFixed(1) : "0.0";
    const foot = document.createElement("p");
    foot.className = "subtitulo-tecnico";
    foot.style.margin = "8px 0 0";
    foot.style.fontSize = "12px";
    foot.innerHTML = `<strong style="color:${PAL.purple};">${shortDelitoLabel(top8[0].label)}</strong> y <strong style="color:${PAL.amberDark};">${shortDelitoLabel(top8[1]?.label || "")}</strong> concentran <span class="mono-inline">${top2Share} %</span> de las víctimas de ${yr}.`;
    wrap.appendChild(foot);
  });
}

/* ── Escena 4: Mapa de los 106 municipios (conectado a NOM_MUN y NOTICIAS_MENCIONES) ── */
function initMap() {
  const geo = state.data.boundary;
  const container = document.getElementById("map-container");
  if (!geo?.features?.length || !container) return;

  const features = geo.features;
  const getName = f => f.properties?.NOM_MUN || f.properties?.NOMGEO || "Municipio";

  const dl = document.getElementById("municipios-list");
  if (dl) {
    dl.innerHTML = features
      .map(getName)
      .filter(Boolean)
      .sort()
      .map(n => `<option value="${n}"></option>`)
      .join("");
  }

  const layers = {
    prensa: {
      key: "NOTICIAS_MENCIONES",
      scale: d3.scaleThreshold().domain([1, 3, 10, 50]).range(["#ffffff", "#f3e8ff", "#d8b4fe", "#9333ea", "#600d8b"]),
      legend: [
        ["#ffffff", "0 notas en prensa"],
        ["#f3e8ff", "1–2 notas"],
        ["#d8b4fe", "3–9 notas"],
        ["#9333ea", "10–49 notas"],
        ["#600d8b", "75+ notas (tope feed ~100)"],
      ],
      fmt: v => v >= 98 ? "100+ notas" : `${v} notas`,
    },
    area: {
      key: "AREA_KM2",
      scale: d3.scaleThreshold().domain([150, 350, 700, 1500]).range(["#f3e8ff", "#d8b4fe", "#a855f7", "#7e22ce", "#600d8b"]),
      legend: [
        ["#f3e8ff", "< 150 km²"],
        ["#d8b4fe", "150–350 km²"],
        ["#a855f7", "350–700 km²"],
        ["#7e22ce", "700–1,500 km²"],
        ["#600d8b", "75+ notas (tope feed ~100)"],
      ],
      fmt: v => `${num(v).toLocaleString("es-MX", { maximumFractionDigits: 1 })} km²`,
    },
    elevacion: {
      key: "ELEV_MEAN_M",
      scale: d3.scaleThreshold().domain([10, 20, 35, 60]).range(["#f3e8ff", "#d8b4fe", "#fde68a", "#ed9f22", "#b45309"]),
      legend: [
        ["#f3e8ff", "< 10 m (costa / norponiente)"],
        ["#d8b4fe", "10–20 m (planicie baja)"],
        ["#fde68a", "20–35 m (planicie interior)"],
        ["#ed9f22", "35–60 m (transición sur)"],
        ["#b45309", "> 60 m (Sierrita Puuc)"],
      ],
      fmt: v => `${num(v).toFixed(1)} m`,
    },
  };

  const W = container.clientWidth || 960;
  const H = container.clientHeight || 410;
  container.querySelector("svg")?.remove();

  const svg = d3.select(container).insert("svg", ":first-child")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .style("width", "100%").style("height", "100%");
  const g = svg.append("g");

  const projection = d3.geoMercator().fitExtent([[18, 16], [W - 18, H - 16]], geo);
  const path = d3.geoPath(projection);

  const zoom = d3.zoom().scaleExtent([1, 14]).on("zoom", ev => g.attr("transform", ev.transform));
  svg.call(zoom);

  const paths = g.selectAll("path")
    .data(features).enter().append("path")
    .attr("class", "map-postal")
    .attr("d", path)
    .on("mousemove", (ev, f) => {
      const p = f.properties || {};
      showTip(ev,
        `<strong>${getName(f)}</strong>` +
        `Prensa: ${num(p.NOTICIAS_MENCIONES)} notas · COPLADEM: ${num(p.MENCIONES_COPLADEM)}<br>` +
        `Superficie: ${num(p.AREA_KM2).toFixed(1)} km² · Elevación: ${num(p.ELEV_MEAN_M).toFixed(1)} m`
      );
    })
    .on("mouseleave", hideTip)
    .on("click", (_, f) => focusMunicipio(f));

  function syncHemerotecaMun(munName) {
    const selMun = document.getElementById("titulares-mun-select");
    const inpSearch = document.getElementById("titulares-search");
    if (!selMun) return;
    if (!munName) {
      selMun.value = "__ALL__";
      if (inpSearch && inpSearch.dataset.fromMap === "1") {
        inpSearch.value = "";
        delete inpSearch.dataset.fromMap;
        inpSearch.dispatchEvent(new Event("input"));
      }
      selMun.dispatchEvent(new Event("change"));
      return;
    }
    const opt = [...selMun.options].find(o => o.value.toLowerCase() === munName.toLowerCase());
    if (opt) {
      selMun.value = opt.value;
      if (inpSearch && inpSearch.dataset.fromMap === "1") {
        inpSearch.value = "";
        delete inpSearch.dataset.fromMap;
        inpSearch.dispatchEvent(new Event("input"));
      }
      selMun.dispatchEvent(new Event("change"));
    } else if (inpSearch) {
      selMun.value = "__ALL__";
      selMun.dispatchEvent(new Event("change"));
      inpSearch.value = munName;
      inpSearch.dataset.fromMap = "1";
      inpSearch.dispatchEvent(new Event("input"));
    }
  }

  function focusMunicipio(f) {
    state.selectedMun = getName(f);
    paths.classed("is-highlighted", d => getName(d) === state.selectedMun);
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const k = Math.min(8, 0.72 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const tx = W / 2 - (k * (x0 + x1)) / 2;
    const ty = H / 2 - (k * (y0 + y1)) / 2;
    svg.transition().duration(550).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
    updateTop5();
    syncHemerotecaMun(state.selectedMun);
  }

  function updateTop5() {
    const cfg = layers[state.layer];
    const top5 = [...features]
      .sort((a, b) => num(b.properties?.[cfg.key]) - num(a.properties?.[cfg.key]))
      .slice(0, 5);
    const strip = document.getElementById("top5-strip");
    if (!strip) return;
    strip.innerHTML = `<span style="font-weight:700;color:var(--muted)">Top 5:</span>` +
      top5.map(f => {
        const name = getName(f);
        const val = cfg.fmt(num(f.properties?.[cfg.key]));
        const cls = name === state.selectedMun ? "top5-chip selected" : "top5-chip";
        return `<button class="${cls}" data-mun="${name}">${name} (${val})</button>`;
      }).join("");
    strip.querySelectorAll(".top5-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const found = features.find(f => getName(f) === btn.dataset.mun);
        if (found) focusMunicipio(found);
      });
    });
  }

  function applyLayer(layerName) {
    state.layer = layerName;
    const cfg = layers[layerName];
    paths.attr("fill", f => cfg.scale(num(f.properties?.[cfg.key])));
    const leg = document.getElementById("map-legend");
    if (leg) {
      leg.innerHTML = cfg.legend
        .map(([c, t]) => `<div class="map-legend-item"><span class="map-legend-swatch" style="background:${c};border:1px solid #d1d5db"></span><span>${t}</span></div>`)
        .join("");
    }
    updateTop5();
  }

  document.querySelectorAll(".layer-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".layer-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      applyLayer(btn.dataset.layer);
    });
  });

  document.getElementById("mun-search")?.addEventListener("change", ev => {
    const q = ev.target.value.trim().toLowerCase();
    const found = features.find(f => getName(f).toLowerCase() === q)
      || features.find(f => getName(f).toLowerCase().includes(q));
    if (found) focusMunicipio(found);
  });

  document.getElementById("map-zoom-in")?.addEventListener("click", () => svg.transition().duration(250).call(zoom.scaleBy, 1.6));
  document.getElementById("map-zoom-out")?.addEventListener("click", () => svg.transition().duration(250).call(zoom.scaleBy, 0.65));
  document.getElementById("map-reset")?.addEventListener("click", () => {
    state.selectedMun = null;
    paths.classed("is-highlighted", false);
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
    updateTop5();
    syncHemerotecaMun(null);
  });

  applyLayer("prensa");
}

function renderNewsWords() {
  const STOPWORDS_CORPUS = new Set([
    "dos", "uno", "tres", "tras", "por", "con", "del", "las", "los",
    "una", "para", "sin", "sobre", "que", "sus", "fue", "son", "hay",
    "entre", "desde", "hasta", "como", "más", "mas", "año", "años", "ya", "al"
  ]);
  const words = (state.data.wordFrequency || [])
    .map(r => ({ label: String(r.palabra || "").trim(), value: num(r.frecuencia) }))
    .filter(w => w.label && w.value > 0 && !STOPWORDS_CORPUS.has(w.label.toLowerCase()))
    .slice(0, 40);
  let activeWord = null;

  bindResize("palabras-wrap", () => {
    const wrap = document.getElementById("palabras-wrap");
    if (!wrap || !words.length) return;
    wrap.innerHTML = "";

    const W = wrap.clientWidth || 480;
    const H = 315;

    const svg = d3.select(wrap).append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .style("width", "100%")
      .style("height", "100%")
      .style("display", "block");

    const root = d3.hierarchy({ children: words }).sum(d => Math.pow(d.value, 0.65));
    const pack = d3.pack()
      .size([W - 4, H - 4])
      .padding(2);
    const nodes = pack(root).leaves();

    const g = svg.append("g").attr("transform", "translate(2,2)");

    const getFill = (d, i) => {
      if (d.data.label === activeWord) return PAL.amber;
      if (i === 0) return PAL.purple;
      if (i === 1) return "#8b2fc9";
      if (i < 9) return "#d8b4fe";
      return "#e5e7eb";
    };

    const getStroke = (d, i) => {
      if (d.data.label === activeWord) return PAL.amberDark;
      if (i < 2) return PAL.purple;
      if (i < 9) return "#a855f7";
      return PAL.gray;
    };

    const getTextColor = (d, i) => {
      if (d.data.label === activeWord) return PAL.ink;
      if (i < 2) return "#ffffff";
      return PAL.ink;
    };

    const bubbles = g.selectAll("g.word-node")
      .data(nodes)
      .join("g")
      .attr("class", "word-node")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .style("cursor", "pointer");

    bubbles.append("circle")
      .attr("class", "word-circle")
      .attr("r", 0)
      .attr("fill", (d, i) => getFill(d, i))
      .attr("stroke", (d, i) => getStroke(d, i))
      .attr("stroke-width", 1.5)
      .transition().duration(500).delay((_, i) => i * 15)
      .attr("r", d => d.r);

    bubbles.each(function(d, i) {
      const el = d3.select(this);
      if (d.r < 9) return;
      const showCount = d.r >= 18;
      const fontSize = Math.max(8, Math.min(15, d.r * 0.33));
      const color = getTextColor(d, i);
      const maxChars = Math.max(4, Math.floor((d.r * 1.75) / (fontSize * 0.52)));
      const shortLbl = d.data.label.length > maxChars
        ? d.data.label.slice(0, Math.max(3, maxChars - 1)) + "…"
        : d.data.label;

      el.append("text")
        .attr("class", "word-lbl")
        .attr("text-anchor", "middle")
        .attr("dy", showCount ? "-0.12em" : "0.35em")
        .style("font-size", `${fontSize}px`)
        .style("font-weight", "700")
        .style("fill", color)
        .style("pointer-events", "none")
        .text(shortLbl);

      if (showCount) {
        el.append("text")
          .attr("class", "word-num")
          .attr("text-anchor", "middle")
          .attr("dy", "1.1em")
          .style("font-family", "'JetBrains Mono', monospace")
          .style("font-size", `${Math.max(8, fontSize * 0.76)}px`)
          .style("font-weight", "700")
          .style("fill", color)
          .style("opacity", 0.9)
          .style("pointer-events", "none")
          .text(d.data.value.toLocaleString("es-MX"));
      }
    });

    const refreshBubbles = () => {
      bubbles.select("circle.word-circle")
        .attr("fill", (d, i) => getFill(d, i))
        .attr("stroke", (d, i) => getStroke(d, i));
      bubbles.selectAll("text.word-lbl, text.word-num")
        .style("fill", (d, i) => getTextColor(d, i));
    };

    bubbles
      .on("mousemove", function(ev, d) {
        bubbles.style("opacity", 0.42);
        d3.select(this).style("opacity", 1);
        d3.select(this).select("circle.word-circle")
          .attr("fill", PAL.amber)
          .attr("stroke", PAL.ink)
          .attr("stroke-width", 2);
        d3.select(this).selectAll("text.word-lbl, text.word-num")
          .style("fill", PAL.ink)
          .style("opacity", 1);
        const isFiltered = activeWord === d.data.label;
        showTip(
          ev,
          `<strong>"${d.data.label}"</strong>${d.data.value.toLocaleString("es-MX")} menciones · ${isFiltered ? "Clic para quitar filtro" : "Clic para filtrar titulares"}`
        );
      })
      .on("mouseleave", function() {
        bubbles.style("opacity", 1);
        refreshBubbles();
        hideTip();
      })
      .on("click", function(_, d) {
        activeWord = activeWord === d.data.label ? null : d.data.label;
        const inpSearch = document.getElementById("titulares-search");
        if (inpSearch) {
          inpSearch.value = activeWord || "";
          inpSearch.dispatchEvent(new Event("input"));
        }
        refreshBubbles();
      });
  });
}

/* ── Visor 3D del relieve estatal desde GeoJSON CEM 4.0 ─────────── */
async function initTerrain() {
  const msg = document.querySelector("#terrain-status");
  if (state.terrainStarted || !state.data?.boundary?.features) return;
  state.terrainStarted = true;

  try {
    const [THREE, { OrbitControls }] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
    ]);

    const feats = state.data.boundary.features;
    const [[minX, minY], [maxX, maxY]] = d3.geoBounds(state.data.boundary);
    const pts = feats.map(f => {
      const c = d3.geoCentroid(f);
      return { x: c[0], y: c[1], z: num(f.properties?.ELEV_MEAN_M ?? 12) };
    });

    const cols = 130, rows = 88;
    const W = 150, H = W * rows / cols;
    const elevations = new Float32Array(cols * rows);
    const mn = 0, mx = d3.max(pts, p => p.z) || 105;

    for (let r = 0; r < rows; r++) {
      const lat = maxY - (r / (rows - 1)) * (maxY - minY);
      for (let c = 0; c < cols; c++) {
        const lon = minX + (c / (cols - 1)) * (maxX - minX);
        let numW = 0, denW = 0, minD = 999;
        for (const p of pts) {
          const d2 = (lon - p.x) ** 2 + (lat - p.y) ** 2;
          if (d2 < minD) minD = d2;
          const w = 1 / (d2 + 0.002);
          numW += w * p.z;
          denW += w;
        }
        elevations[r * cols + c] = minD < 0.032 ? numW / denW : -1;
      }
    }

    const positions = new Float32Array(cols * rows * 3);
    const colors = new Float32Array(cols * rows * 3);
    const indices = [];
    const cLow = new THREE.Color("#3b1261");
    const cMid = new THREE.Color("#7c3aed");
    const cHigh = new THREE.Color("#ed9f22");
    const color = new THREE.Color();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const v = elevations[idx];
        const t = v < 0 ? 0 : Math.pow(Math.max(0, Math.min(1, (v - mn) / (mx - mn))), 0.65);
        positions[idx * 3]     = (c / (cols - 1) - 0.5) * W;
        positions[idx * 3 + 1] = (0.5 - r / (rows - 1)) * H;
        positions[idx * 3 + 2] = v >= 0 ? v * 0.22 : 0;
        if (t < 0.5) color.lerpColors(cLow, cMid, t * 2);
        else color.lerpColors(cMid, cHigh, (t - 0.5) * 2);
        colors[idx * 3] = color.r; colors[idx * 3 + 1] = color.g; colors[idx * 3 + 2] = color.b;
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
        if (elevations[a] >= 0 && elevations[b] >= 0 && elevations[cc] >= 0 && elevations[d] >= 0) {
          indices.push(a, cc, b, b, cc, d);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, side: THREE.DoubleSide }));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0f0620");
    scene.add(mesh, new THREE.AmbientLight(0xffffff, 1.4));
    const light = new THREE.DirectionalLight(0xfff5e6, 2.0);
    light.position.set(-70, -85, 140);
    scene.add(light);

    const container = document.querySelector("#terrain-view");
    const tW = container.clientWidth || 440, tH = container.clientHeight || 260;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(tW, tH);
    container.replaceChildren(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(40, tW / tH, 0.1, 1000);
    camera.up.set(0, 0, 1);
    const defaultCamPos = [W * 0.52, -H * 1.05, 82];
    camera.position.set(...defaultCamPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 6);
    controls.enableDamping = true;
    controls.update();

    let exag2x = false;
    document.getElementById("terrain-exag")?.addEventListener("click", ev => {
      exag2x = !exag2x;
      mesh.scale.z = exag2x ? 2.0 : 1.0;
      ev.currentTarget.textContent = exag2x ? "Relieve 2×" : "Relieve 1×";
    });
    document.getElementById("terrain-reset")?.addEventListener("click", () => {
      camera.position.set(...defaultCamPos);
      controls.target.set(0, 0, 6);
      controls.update();
    });

    const animate = () => { controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); };
    animate();

    new ResizeObserver(() => {
      const cW = container.clientWidth, cH = container.clientHeight;
      if (!cW || !cH) return;
      camera.aspect = cW / cH; camera.updateProjectionMatrix();
      renderer.setSize(cW, cH);
    }).observe(container);

    if (msg) msg.textContent = `CEM 4.0 estatal (106 municipios) · elevación media ${mn}–${mx.toFixed(1)} m s. n. m.`;
  } catch {
    if (msg) msg.textContent = "Modelo físico CEM 4.0 · Costa norte (0 m) a Sierrita Puuc (196 m).";
  }
}


function renderEscena5() {
  const incRows = state.data.incidence || [];
  if (!incRows.length) return;

  const monthMap = new Map();
  for (const r of incRows) {
    const anio = num(r.anio);
    const mes = num(r.mes);
    if (!anio || !mes) continue;
    const key = `${anio}-${mes}`;
    monthMap.set(key, (monthMap.get(key) || 0) + num(r.casos));
  }
  const radialData = [...monthMap.entries()].map(([k, delitos]) => {
    const [anio, mes] = k.split("-").map(Number);
    return { anio, mes, mesNombre: MONTHS_FULL[mes - 1] || MONTHS[mes - 1], mesCorto: MONTHS[mes - 1], delitos };
  }).sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));

  const years = [...new Set(radialData.map(d => d.anio))].sort((a, b) => a - b);
  const selYearEl = document.getElementById("incidencia-year");
  let highlightedYear = selYearEl && selYearEl.value ? Number(selYearEl.value) : years.at(-1);
  let activeEra = "all";

  const getEras = () => ({
    year:  { label: `${highlightedYear}`, fn: d => d.anio === highlightedYear },
    all:   { label: "2015–2025", fn: () => true },
    peak:  { label: "2015–2016", fn: d => d.anio <= 2016 },
    break: { label: "2018", fn: d => d.anio === 2018 },
    low:   { label: "2019–2025", fn: d => d.anio >= 2019 }
  });

  bindResize("pulso-radial-wrap", () => {
    const wrap = document.getElementById("pulso-radial-wrap");
    const insp = document.getElementById("pulso-inspector");
    if (!wrap || !radialData.length) return;
    wrap.innerHTML = "";

    const size = 370;
    const cx = size / 2, cy = size / 2;
    const innerR = 56, outerR = 150;

    const svg = d3.select(wrap).append("svg")
      .attr("viewBox", `0 0 ${size} ${size}`)
      .style("width", "100%").style("max-width", "365px")
      .style("display", "block").style("margin", "0 auto");

    const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);
    const angle = d3.scaleBand().domain(d3.range(1, 13)).range([0, Math.PI * 2]).padding(0.06);
    const radius = d3.scaleBand().domain(years).range([innerR, outerR]).padding(0.08);

    const colorScale = d3.scaleThreshold()
      .domain([60, 150, 320, 450])
      .range(["#f3e8ff", "#c084fc", "#7e22ce", PAL.purple, PAL.amber]);

    const arc = d3.arc()
      .innerRadius(d => radius(d.anio))
      .outerRadius(d => radius(d.anio) + radius.bandwidth())
      .startAngle(d => angle(d.mes))
      .endAngle(d => angle(d.mes) + angle.bandwidth())
      .cornerRadius(2.5);

    const petals = g.selectAll("path.petal")
      .data(radialData).join("path")
      .attr("class", "petal")
      .attr("d", arc)
      .attr("fill", d => colorScale(d.delitos))
      .style("cursor", "pointer");

    g.selectAll("text.m-lbl")
      .data(d3.range(1, 13)).join("text")
      .attr("x", m => Math.sin(angle(m) + angle.bandwidth() / 2) * (outerR + 18))
      .attr("y", m => -Math.cos(angle(m) + angle.bandwidth() / 2) * (outerR + 18) + 4)
      .attr("text-anchor", "middle")
      .style("font-size", "11px").style("font-weight", "700").style("fill", PAL.ink)
      .text(m => MONTHS[m - 1]);

    const centerYear = g.append("text").attr("text-anchor", "middle").attr("y", -13)
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", "13px").style("font-weight", "800").style("fill", PAL.purple);

    const centerTotal = g.append("text").attr("text-anchor", "middle").attr("y", 3)
      .style("font-family", "'JetBrains Mono', monospace")
      .style("font-size", "11px").style("font-weight", "700").style("fill", PAL.ink);

    const centerSub = g.append("text").attr("text-anchor", "middle").attr("y", 18)
      .style("font-size", "9.5px").style("font-weight", "700").style("fill", PAL.amberDark)
      .text("centro 2015 → borde 2025");

    const updateInspectorEra = () => {
      const eras = getEras();
      const e = eras[activeEra];
      const subset = radialData.filter(e.fn);
      const tot = d3.sum(subset, d => d.delitos);
      const peak = subset.reduce((best, cur) => (!best || cur.delitos > best.delitos ? cur : best), null);
      const totStr = Math.round(tot).toLocaleString("es-MX");

      centerYear.text(e.label);
      centerTotal.text(`${totStr} reg.`);
      centerSub.text(peak ? `Pico: ${peak.mesCorto} (${Math.round(peak.delitos).toLocaleString("es-MX")})` : "centro 2015 → borde 2025");
      if (insp) {
        insp.textContent = peak
          ? `${e.label}: ${totStr} reg. · Pico ${peak.mesCorto} (${Math.round(peak.delitos).toLocaleString("es-MX")})`
          : `${e.label}: ${totStr} reg.`;
      }
    };

    const syncEraUI = () => {
      const eras = getEras();
      const yrBtn = document.getElementById("pulso-yr-btn");
      if (yrBtn) yrBtn.textContent = `Año ${highlightedYear}`;
      document.querySelectorAll("#pulso-eras-bar button").forEach(b => {
        b.classList.toggle("active", b.dataset.era === activeEra);
      });

      petals.transition().duration(250)
        .attr("fill", d => colorScale(d.delitos))
        .style("opacity", d => eras[activeEra].fn(d) ? 1 : 0.24);

      updateInspectorEra();
    };

    petals
      .on("mousemove", function(ev, d) {
        d3.select(this).attr("stroke", PAL.ink).attr("stroke-width", 1.8);
        const valStr = Math.round(d.delitos).toLocaleString("es-MX");
        centerYear.text(`${d.mesCorto.toUpperCase()} ${d.anio}`);
        centerTotal.text(`${valStr} reg.`);
        centerSub.text(d.anio <= 2016 ? "Cima previa a 2018" : "Corte actual SESNSP");
        if (insp) insp.textContent = `${d.mesNombre} ${d.anio}: ${valStr} registros`;
        showTip(ev, `<strong>${d.mesNombre} ${d.anio}</strong>${valStr} registros SESNSP`);
      })
      .on("mouseleave", function() {
        d3.select(this).attr("stroke", "none");
        hideTip();
        updateInspectorEra();
      });

    syncEraUI();

    document.querySelectorAll("#pulso-eras-bar button").forEach(btn => {
      btn.onclick = () => {
        activeEra = btn.dataset.era;
        syncEraUI();
      };
    });

    document.addEventListener("sesnsp-year-change", (ev) => {
      highlightedYear = Number(ev.detail);
      activeEra = "year";
      syncEraUI();
    });
  });
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo cargar ${url}`);
  return r.json();
}

async function start() {
  try {
    const [incidence, perception, cifraOculta, wordFrequency, boundary] =
      await Promise.all(Object.values(DATASETS).map(fetchJSON));

    state.data = { incidence, perception, cifraOculta, wordFrequency, boundary };

    renderHeroKPIs();
    renderEscena1();
    renderEscena2();
    renderEscena3();
    renderEscena5();
    initMap();
    renderNewsWords();
    initTerrain();
    initTitularesVisor();
    setStatus("Datos Gold verificados");
  } catch (err) {
    console.error(err);
    setStatus(err.message, "error");
  }
}

start();


// Filtro dinámico de escenas (ver todas o una sola)
document.addEventListener("click", (ev) => {
  const btn = ev.target.closest(".escena-tab");
  if (!btn) return;
  document.querySelectorAll(".escena-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const target = btn.dataset.target;
  document.querySelectorAll(".escena-block").forEach(sec => {
    sec.style.display = (target === "all" || sec.id === target) ? "" : "none";
  });
  window.dispatchEvent(new Event("resize"));
});


// Navegación suave desde tarjetas KPI superiores
if (window.location.hash) {
  history.replaceState(null, "", window.location.pathname + window.location.search);
  window.scrollTo(0, 0);
}

document.addEventListener("click", (ev) => {
  const card = ev.target.closest("[data-jump]");
  if (!card) return;
  ev.preventDefault();
  const target = document.querySelector(card.dataset.jump);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
});


// Botón flotante para volver arriba
(() => {
  const btn = document.getElementById("back-to-top");
  if (!btn) return;
  const toggleBtn = () => btn.classList.toggle("visible", window.scrollY > 420);
  window.addEventListener("scroll", toggleBtn, { passive: true });
  toggleBtn();
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
})();
