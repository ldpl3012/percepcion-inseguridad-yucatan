const GOLD = "data/gold/dashboard";
const DATASETS = {
  incidence: `${GOLD}/incidencia_yucatan_mensual_v1.json`,
  perception: `${GOLD}/percepcion_ensu_anual_v1.json`,
  newsByMonth: `${GOLD}/noticias_mensuales_v1.json`,
  wordFrequency: `${GOLD}/frecuencia_palabras_titulares_v1.json`,
  boundary: `${GOLD}/territorio/limite_municipal_merida.geojson`,
  postalCodes: `${GOLD}/territorio/codigos_postales_merida.geojson`,
};
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const COLORS = {
  teal: "#167c79",
  gold: "#d5a74e",
  coral: "#d97561",
  navy: "#143747",
  pale: "rgba(22, 124, 121, .12)",
  grid: "rgba(23, 43, 58, .08)",
};
const state = {
  data: null,
  charts: new Map(),
  map: null,
  terrainStarted: false,
};

function setStatus(message, kind = "ready") {
  const status = document.querySelector("#data-status");
  status.textContent = message;
  const dot = document.querySelector(".status-dot");
  dot.classList.toggle("ready", kind === "ready");
  dot.classList.toggle("error", kind === "error");
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${path} (HTTP ${response.status}).`);
  }
  return response.json();
}

function number(value) {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new Error(`Valor Gold no numérico: ${value}.`);
  }
  return result;
}

function chartOptions({ horizontal = false, percent = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: COLORS.navy,
        padding: 11,
        displayColors: false,
      },
    },
    scales: horizontal
      ? {
          x: {
            beginAtZero: true,
            grid: { color: COLORS.grid },
            ticks: { color: "#75858b", precision: 0 },
          },
          y: { grid: { display: false }, ticks: { color: "#556b72" } },
        }
      : {
          x: {
            grid: { display: false },
            ticks: { color: "#75858b", maxRotation: 0, autoSkip: true },
          },
          y: {
            beginAtZero: true,
            grid: { color: COLORS.grid },
            ticks: {
              color: "#75858b",
              callback: (value) => percent ? `${value}%` : value.toLocaleString("es-MX"),
            },
          },
        },
  };
}

function drawChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) {
    throw new Error("Chart.js no está disponible para dibujar las gráficas.");
  }
  state.charts.get(id)?.destroy();
  const chart = new window.Chart(canvas, config);
  state.charts.set(id, chart);
  return chart;
}

function monthlyIncidence(rows) {
  const totals = new Map();
  for (const row of rows) {
    const key = `${number(row.anio)}-${String(number(row.mes)).padStart(2, "0")}`;
    totals.set(key, (totals.get(key) || 0) + number(row.casos));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, casos]) => ({ mes, casos }));
}

function renderOverview() {
  const { incidence, perception, newsByMonth } = state.data;
  const years = incidence.map((row) => number(row.anio));
  const latestYear = Math.max(...years);
  const latestTotal = incidence
    .filter((row) => number(row.anio) === latestYear)
    .reduce((sum, row) => sum + number(row.casos), 0);
  const latestPerception = [...perception].sort(
    (a, b) => number(b.anio) - number(a.anio),
  )[0];
  const articleCount = newsByMonth.reduce(
    (sum, row) => sum + number(row.noticias),
    0,
  );
  document.querySelector("#kpi-incidencia").textContent =
    Math.round(latestTotal).toLocaleString("es-MX");
  document.querySelector("#kpi-incidencia-label").textContent =
    `Yucatán · ${latestYear} · registros`;
  document.querySelector("#kpi-percepcion").textContent =
    `${number(latestPerception.porcentaje_inseguridad_promedio).toFixed(1)}%`;
  document.querySelector("#kpi-percepcion-label").textContent =
    `ENSU · Mérida · ${latestPerception.anio}`;
  document.querySelector("#kpi-noticias").textContent =
    articleCount.toLocaleString("es-MX");

  const trend = monthlyIncidence(incidence).slice(-36);
  drawChart("overview-chart", {
    type: "line",
    data: {
      labels: trend.map((row) => row.mes),
      datasets: [{
        data: trend.map((row) => row.casos),
        borderColor: COLORS.teal,
        backgroundColor: COLORS.pale,
        fill: true,
        tension: 0.28,
        pointRadius: 1.5,
        pointHoverRadius: 4,
        borderWidth: 2,
      }],
    },
    options: chartOptions(),
  });
}

function renderIncidence() {
  const rows = state.data.incidence;
  const years = [...new Set(rows.map((row) => number(row.anio)))].sort((a, b) => a - b);
  const select = document.querySelector("#incidencia-year");
  const previous = Number(select.value);
  select.replaceChildren(...years.map((year) => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    return option;
  }));
  select.value = String(years.includes(previous) ? previous : years.at(-1));
  const selectedYear = Number(select.value);
  const yearRows = rows.filter((row) => number(row.anio) === selectedYear);
  const byMonth = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return yearRows
      .filter((row) => number(row.mes) === month)
      .reduce((sum, row) => sum + number(row.casos), 0);
  });
  drawChart("incidencia-month-chart", {
    type: "line",
    data: {
      labels: MONTHS,
      datasets: [{
        data: byMonth,
        borderColor: COLORS.teal,
        backgroundColor: COLORS.pale,
        fill: true,
        tension: 0.25,
        pointRadius: 3,
      }],
    },
    options: chartOptions(),
  });

  const byType = new Map();
  for (const row of yearRows) {
    byType.set(row.delito, (byType.get(row.delito) || 0) + number(row.casos));
  }
  const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  drawChart("incidencia-type-chart", {
    type: "bar",
    data: {
      labels: top.map(([label]) => label),
      datasets: [{
        data: top.map(([, value]) => value),
        backgroundColor: COLORS.teal,
        borderRadius: 4,
        barThickness: 15,
      }],
    },
    options: { ...chartOptions({ horizontal: true }), indexAxis: "y" },
  });
}

function renderPerception() {
  const rows = [...state.data.perception].sort(
    (a, b) => number(a.anio) - number(b.anio),
  );
  drawChart("percepcion-chart", {
    type: "bar",
    data: {
      labels: rows.map((row) => String(row.anio)),
      datasets: [{
        data: rows.map((row) => number(row.porcentaje_inseguridad_promedio)),
        backgroundColor: COLORS.gold,
        borderRadius: 5,
        maxBarThickness: 56,
      }],
    },
    options: {
      ...chartOptions({ percent: true }),
      scales: {
        ...chartOptions({ percent: true }).scales,
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: COLORS.grid },
          ticks: { color: "#75858b", callback: (value) => `${value}%` },
        },
      },
    },
  });
}

function renderNews() {
  const monthly = [...state.data.newsByMonth].sort((a, b) =>
    a.mes.localeCompare(b.mes),
  );
  drawChart("noticias-chart", {
    type: "bar",
    data: {
      labels: monthly.map((row) => row.mes),
      datasets: [{
        data: monthly.map((row) => number(row.noticias)),
        backgroundColor: COLORS.coral,
        borderRadius: 4,
        maxBarThickness: 48,
      }],
    },
    options: chartOptions(),
  });

  const words = state.data.wordFrequency.slice(0, 12);
  drawChart("palabras-chart", {
    type: "bar",
    data: {
      labels: words.map((row) => row.palabra),
      datasets: [{
        data: words.map((row) => number(row.frecuencia)),
        backgroundColor: COLORS.navy,
        borderRadius: 4,
        barThickness: 12,
      }],
    },
    options: { ...chartOptions({ horizontal: true }), indexAxis: "y" },
  });
}

function initMap() {
  if (state.map) {
    state.map.invalidateSize();
    return;
  }
  if (!window.L) {
    throw new Error("Leaflet no está disponible para cargar el mapa.");
  }
  const map = window.L.map("map", { scrollWheelZoom: false });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap",
    maxZoom: 19,
  }).addTo(map);
  const postalLayer = window.L.geoJSON(state.data.postalCodes, {
    style: { color: COLORS.teal, weight: 1, fillColor: "#73b8a7", fillOpacity: 0.25 },
    onEachFeature: (feature, layer) => {
      const popup = document.createElement("span");
      popup.textContent = `Código postal: ${feature.properties.d_cp ?? "sin dato"}`;
      layer.bindPopup(popup);
    },
  });
  const boundaryLayer = window.L.geoJSON(state.data.boundary, {
    style: { color: COLORS.coral, weight: 3, fillOpacity: 0 },
  });
  postalLayer.addTo(map);
  boundaryLayer.addTo(map);
  window.L.control.layers(
    null,
    { "Códigos postales": postalLayer, "Límite municipal": boundaryLayer },
    { collapsed: false },
  ).addTo(map);
  map.fitBounds(boundaryLayer.getBounds(), { padding: [12, 12] });
  state.map = map;
  setStatus("Mapa Gold cargado correctamente.");
}

async function initTerrain() {
  const message = document.querySelector("#terrain-status");
  if (state.terrainStarted) return;
  state.terrainStarted = true;
  message.textContent = "Cargando relieve…";
  try {
    const [THREE, { OrbitControls }, { fromUrl }] = await Promise.all([
      import("three"),
      import("three/addons/controls/OrbitControls.js"),
      import("https://cdn.jsdelivr.net/npm/geotiff@2.1.3/+esm"),
    ]);
    const tiff = await fromUrl("data/silver/lidar/merida_elevacion.tif");
    const image = await tiff.getImage();
    const cols = 160;
    const rows = Math.max(2, Math.round(cols * image.getHeight() / image.getWidth()));
    const elevations = await image.readRasters({
      width: cols,
      height: rows,
      interleave: true,
    });
    const nodataValue = image.getGDALNoData();
    const nodata = nodataValue == null ? null : Number(nodataValue);
    const valid = Array.from(elevations, (value) =>
      Number.isFinite(value) && (nodata === null || value !== nodata),
    );
    const samples = Array.from(elevations).filter((value, index) => valid[index]);
    if (!samples.length) throw new Error("El ráster no contiene elevaciones válidas.");
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const positions = new Float32Array(cols * rows * 3);
    const colors = new Float32Array(cols * rows * 3);
    const indices = [];
    const width = 150;
    const height = width * rows / cols;
    const color = new THREE.Color();
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const value = elevations[index];
        const normalized = max === min ? 0 : (value - min) / (max - min);
        positions[index * 3] = (col / (cols - 1) - 0.5) * width;
        positions[index * 3 + 1] = (0.5 - row / (rows - 1)) * height;
        positions[index * 3 + 2] = valid[index] ? (value - min) * 2.2 : 0;
        color.setHSL(0.37 - normalized * 0.25, 0.48, 0.34 + normalized * 0.27);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
    }
    for (let row = 0; row < rows - 1; row += 1) {
      for (let col = 0; col < cols - 1; col += 1) {
        const a = row * cols + col;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (valid[a] && valid[b] && valid[c] && valid[d]) {
          indices.push(a, c, b, b, c, d);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }),
    );
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#e9f1ef");
    scene.add(terrain);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(-80, -70, 160);
    scene.add(light);

    const container = document.querySelector("#terrain-view");
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.replaceChildren(renderer.domElement);
    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.up.set(0, 0, 1);
    camera.position.set(width * 0.8, -height * 1.15, Math.max(85, (max - min) * 2.8));
    camera.lookAt(0, 0, 10);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 10);
    controls.enableDamping = true;
    controls.update();
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };
    animate();
    const resize = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    });
    resize.observe(container);
    message.textContent = `Malla simplificada · elevación ${min}–${max} m · fuente CEM 4.0`;
    setStatus("Modelo de elevación cargado correctamente.");
  } catch (error) {
    state.terrainStarted = false;
    message.textContent = `No se pudo cargar el modelo 3D: ${error.message}`;
    setStatus("Error en el visor de relieve.", "error");
  }
}

function openView(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll(".view").forEach((view) => {
    const active = view.id === `view-${name}`;
    view.hidden = !active;
    view.classList.toggle("active", active);
  });
  requestAnimationFrame(() => {
    try {
      if (name === "incidencia") renderIncidence();
      if (name === "percepcion") renderPerception();
      if (name === "territorio") initMap();
      if (name === "relieve") initTerrain();
      if (name === "prensa") renderNews();
    } catch (error) {
      setStatus(error.message, "error");
      console.error(`No se pudo abrir la vista ${name}:`, error);
    }
  });
}

async function start() {
  try {
    const [
      incidence,
      perception,
      newsByMonth,
      wordFrequency,
      boundary,
      postalCodes,
    ] = await Promise.all(Object.values(DATASETS).map(fetchJSON));
    if (![incidence, perception, newsByMonth, wordFrequency].every(Array.isArray)) {
      throw new Error("Una tabla Gold no tiene el formato esperado (lista JSON).");
    }
    if (!incidence.length || !perception.length) {
      throw new Error("Faltan filas para construir los indicadores principales.");
    }
    state.data = { incidence, perception, newsByMonth, wordFrequency, boundary, postalCodes };
    renderOverview();
    setStatus("Tablas Gold cargadas correctamente.");
  } catch (error) {
    setStatus(error.message, "error");
    document.querySelector("#kpi-incidencia").textContent = "Sin datos";
    document.querySelector("#kpi-percepcion").textContent = "Sin datos";
    document.querySelector("#kpi-noticias").textContent = "Sin datos";
    console.error("No se pudo iniciar el dashboard:", error);
  }
}

document.querySelectorAll(".tab").forEach((tab, index, tabs) => {
  tab.addEventListener("click", () => openView(tab.dataset.view));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    next.focus();
    openView(next.dataset.view);
  });
});
document.querySelector("#incidencia-year").addEventListener("change", () => {
  if (!document.querySelector("#view-incidencia").hidden) renderIncidence();
});

start();
