import './styles.css';
import * as d3 from "d3";
import { createLineGraph } from './charts/linegraph.js';
import { createScatter } from './charts/scatter.js';

// Dimensions lògiques (la projecció hi treballa; el SVG és responsiu via viewBox)
const width = 900;
const height = 450;

// --- Càrrega de dades ---
const geojson = await d3.json("/data/municipis.geojson");
const csvData = await d3.csv("/data/Habitatge.csv");
const residentsData = await d3.csv("/data/Residents.csv");
const touristicData = await d3.csv("/data/Núm de viatgers i pernoctacions.csv");
const hotelData = await d3.csv("/data/Grau d'ocupació per places hoteleres.csv");
const apartmentData = await d3.csv("/data/Grau d'ocupació per apartaments turístics.csv");

// --- Meta per municipi (nom + illa) des del geojson ---
const metaById = {};
geojson.features.forEach((f) => {
  metaById[f.properties.id] = {
    nom: f.properties.nom,
    illa: f.properties.nom_consell_illa,
  };
});

// --- Valor residencial per any (valueByYear[any][codi]) ---
const valueByYear = {};
let globalMinValue = Infinity;
let globalMaxValue = -Infinity;

// Agregat residencial a nivell d'Illes Balears (per a les xifres clau)
const balearsValueByYear = {};

csvData.forEach((row) => {
  if (row.us !== "Residencial") return;

  // Agregat de tot l'arxipèlag
  if (row.nivell === "Agregat" && row.territori === "ILLES BALEARS") {
    const v = parseFloat(row.valor_mitja_eur);
    if (!Number.isNaN(v)) balearsValueByYear[row.any] = v;
    return;
  }

  // Valor per municipi
  if (row.codi_municipi) {
    const year = row.any;
    const codi = row.codi_municipi.trim();
    const valor = parseFloat(row.valor_mitja_eur);
    if (Number.isNaN(valor)) return;
    if (!valueByYear[year]) valueByYear[year] = {};
    valueByYear[year][codi] = valor;
    globalMinValue = Math.min(globalMinValue, valor);
    globalMaxValue = Math.max(globalMaxValue, valor);
  }
});

// --- Residents per any (2021–2025) ---
const residentsByYear = {};
residentsData.forEach((row) => {
  const year = parseInt(row.any);
  const codi = row.codi_municipi.trim();
  const residents = parseInt(row.residents);
  if (Number.isNaN(residents)) return;
  if (!residentsByYear[year]) residentsByYear[year] = {};
  residentsByYear[year][codi] = residents;
});

// Conjunt oficial de municipis turístics (font de veritat: es_municipi_turistic)
const touristicSet = new Set();
residentsData.forEach((row) => {
  if (row.es_municipi_turistic && row.es_municipi_turistic.trim() === "True") {
    touristicSet.add(row.codi_municipi.trim());
  }
});

const residentYears = Object.keys(residentsByYear)
  .map(Number)
  .sort((a, b) => a - b);

// Residents per a un any donat, amb fallback a l'any disponible més proper
function getResidents(id, year) {
  let y = year;
  if (!residentsByYear[y] || residentsByYear[y][id] === undefined) {
    y = residentYears.reduce(
      (best, cur) => (Math.abs(cur - year) < Math.abs(best - year) ? cur : best),
      residentYears[0]
    );
  }
  return residentsByYear[y] ? residentsByYear[y][id] : undefined;
}

// Població de referència (base fixa): residents de l'any més antic disponible (2021)
const residentsRefYear = residentYears[0];
const residentsRef = { ...(residentsByYear[residentsRefYear] || {}) };

// ============================================================
//  ÍNDEX COMPOST DE PRESSIÓ TURÍSTICA (IPT, 0–100), 2008–2025
//  Components normalitzats (min–max) i ponderats, renormalitzant
//  sobre els presents:
//    · Pressió sobre residents  log(1 + pernoctacions/residentsRef)  45%
//    · Ocupació hotelera (%)                                         25%
//    · Estada mitjana (nits)                                         20%
//    · Ocupació apartaments (%)                                      10%
// ============================================================
const WEIGHTS = { pressio: 0.45, ocupHotel: 0.25, estada: 0.2, ocupApart: 0.1 };

// Recull de mètriques anuals crues per municipi i any
const touristicMetricsByYear = {};
function ensureMetrics(year, codi) {
  if (!touristicMetricsByYear[year]) touristicMetricsByYear[year] = {};
  if (!touristicMetricsByYear[year][codi]) touristicMetricsByYear[year][codi] = {};
  return touristicMetricsByYear[year][codi];
}

touristicData.forEach((row) => {
  if (row.tipus_periode !== "anual") return;
  const year = parseInt(row.any);
  const codi = row.codi_municipi.trim();
  const m = ensureMetrics(year, codi);
  const viatgers = parseFloat(row.viatgers);
  const pernoctacions = parseFloat(row.pernoctacions);
  const estada = parseFloat(row.estada_mitjana);
  if (!Number.isNaN(viatgers)) m.viatgers = viatgers;
  if (!Number.isNaN(pernoctacions)) m.pernoctacions = pernoctacions;
  if (!Number.isNaN(estada)) m.estada = estada;
  // Pressió sobre residents amb base de població fixa (= índex oficial a 2021+)
  const ref = residentsRef[codi];
  if (!Number.isNaN(pernoctacions) && ref) m.pressio = pernoctacions / ref;
});

hotelData.forEach((row) => {
  if (row.tipus_periode !== "anual") return;
  const oc = parseFloat(row.ocupacio_places_pct);
  if (!Number.isNaN(oc)) ensureMetrics(parseInt(row.any), row.codi_municipi.trim()).ocupHotel = oc;
});

apartmentData.forEach((row) => {
  if (row.tipus_periode !== "anual") return;
  const oc = parseFloat(row.ocupacio_apartaments_pct);
  if (!Number.isNaN(oc)) ensureMetrics(parseInt(row.any), row.codi_municipi.trim()).ocupApart = oc;
});

// Log a la pressió per atenuar l'asimetria abans del min–max
const pressioTransform = (v) => Math.log(1 + v);

// Extrems globals per component (sobre tota la distribució anual 2008–2025)
const compExtent = { pressio: [Infinity, -Infinity], ocupHotel: [Infinity, -Infinity], estada: [Infinity, -Infinity], ocupApart: [Infinity, -Infinity] };
function track(key, raw) {
  if (raw === undefined || Number.isNaN(raw)) return;
  const v = key === "pressio" ? pressioTransform(raw) : raw;
  compExtent[key][0] = Math.min(compExtent[key][0], v);
  compExtent[key][1] = Math.max(compExtent[key][1], v);
}
Object.values(touristicMetricsByYear).forEach((byCodi) =>
  Object.values(byCodi).forEach((m) => {
    track("pressio", m.pressio);
    track("ocupHotel", m.ocupHotel);
    track("estada", m.estada);
    track("ocupApart", m.ocupApart);
  })
);

function norm01(key, raw) {
  if (raw === undefined || Number.isNaN(raw)) return undefined;
  const v = key === "pressio" ? pressioTransform(raw) : raw;
  const [lo, hi] = compExtent[key];
  if (hi <= lo) return 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

// Índex compost 0–100 a partir de les mètriques d'un municipi/any
function composite(m) {
  let acc = 0;
  let wsum = 0;
  for (const key of Object.keys(WEIGHTS)) {
    const n = norm01(key, m[key]);
    if (n !== undefined) {
      acc += WEIGHTS[key] * n;
      wsum += WEIGHTS[key];
    }
  }
  return wsum === 0 ? undefined : (acc / wsum) * 100;
}

// Índex de pressió turística (compost) per any → touristicIndexByYear[year][codi]
const touristicIndexByYear = {};
Object.keys(touristicMetricsByYear).forEach((year) => {
  const y = parseInt(year);
  Object.keys(touristicMetricsByYear[year]).forEach((codi) => {
    const ipt = composite(touristicMetricsByYear[year][codi]);
    if (ipt === undefined) return;
    if (!touristicIndexByYear[y]) touristicIndexByYear[y] = {};
    touristicIndexByYear[y][codi] = ipt;
  });
});

// --- Escala de color seqüencial ---
const colorScale = d3
  .scaleSequential(d3.interpolateBlues)
  .domain([globalMinValue, globalMaxValue]);

// --- Projecció i path ---
const projection = d3.geoMercator().fitSize([width, height], geojson);
const pathGenerator = d3.geoPath().projection(projection);

// --- Anys disponibles ---
const availableYears = [...new Set(Object.keys(valueByYear).map((y) => parseInt(y)))].sort(
  (a, b) => a - b
);
const minYear = availableYears[0];
const maxYear = availableYears[availableYears.length - 1];
let currentYear = maxYear;

// --- SVG del mapa ---
const svg = d3.select("#map").select("svg");
const g = svg.append("g");

// --- Tooltip del mapa ---
const tooltip = d3.select("body").append("div").attr("class", "tooltip map-tip");

// --- Estat ---
const municipalityInfo = document.getElementById("municipality-info");
let selectedMunicipality = null;
let isTouristicMode = false;

function isTouristic(feature) {
  // Font de veritat: flag oficial es_municipi_turistic (Residents.csv).
  // El geojson també s'ha corregit perquè hi coincideixi.
  return touristicSet.has(feature.properties.id);
}

// --- Panell d'informació ---
function updateMunicipalityInfo(feature) {
  if (!feature || !municipalityInfo) return;
  const id = feature.properties.id;
  const valor = valueByYear[String(currentYear)]
    ? valueByYear[String(currentYear)][id]
    : undefined;
  const residents = getResidents(id, currentYear);
  const idx = touristicIndexByYear[currentYear]
    ? touristicIndexByYear[currentYear][id]
    : undefined;

  municipalityInfo.classList.remove("empty-state");

  let html = `<span class="muni-name">${feature.properties.nom}</span>`;
  html += `<div class="stat-row"><span class="stat-label">Illa</span><span class="stat-value">${
    metaById[id]?.illa || "—"
  }</span></div>`;
  if (residents !== undefined) {
    html += `<div class="stat-row"><span class="stat-label">Residents</span><span class="stat-value">${residents.toLocaleString(
      "ca-ES"
    )}</span></div>`;
  }
  if (valor !== undefined) {
    html += `<div class="stat-row"><span class="stat-label">Valor residencial (${currentYear})</span><span class="stat-value">€${valor.toLocaleString(
      "ca-ES",
      { maximumFractionDigits: 0 }
    )}</span></div>`;
  } else {
    html += `<div class="stat-row"><span class="stat-label">Valor residencial (${currentYear})</span><span class="stat-value">—</span></div>`;
  }
  if (idx !== undefined) {
    html += `<div class="stat-row"><span class="stat-label">Índex de pressió turística (${currentYear})</span><span class="stat-value">${idx.toFixed(
      0
    )}<span class="stat-unit"> / 100</span></span></div>`;
  }

  // Desglossament de mètriques turístiques (si n'hi ha)
  const m = touristicMetricsByYear[currentYear] && touristicMetricsByYear[currentYear][id];
  if (m) {
    const row = (label, value) =>
      `<div class="stat-row sub"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
    if (m.ocupHotel !== undefined) html += row("Ocupació hotelera", m.ocupHotel.toFixed(0) + "%");
    if (m.ocupApart !== undefined) html += row("Ocupació apartaments", m.ocupApart.toFixed(0) + "%");
    if (m.estada !== undefined) html += row("Estada mitjana", m.estada.toFixed(1) + " nits");
    if (m.viatgers !== undefined)
      html += row("Viatgers", Math.round(m.viatgers).toLocaleString("ca-ES"));
    if (m.pernoctacions !== undefined)
      html += row("Pernoctacions", Math.round(m.pernoctacions).toLocaleString("ca-ES"));
  }

  municipalityInfo.innerHTML = html;
}

// --- Render dels municipis ---
const municipalities = g
  .selectAll("path")
  .data(geojson.features)
  .enter()
  .append("path")
  .attr("d", pathGenerator)
  .attr("class", "municipality")
  .on("mouseover", function (event, d) {
    const touristicText = isTouristic(d) ? "Turístic" : "No turístic";
    tooltip
      .style("display", "block")
      .html(`<strong>${d.properties.nom}</strong><br>${touristicText}`);
    if (scatter) scatter.highlight(d.properties.id);
  })
  .on("mousemove", function (event) {
    tooltip
      .style("left", event.pageX + 12 + "px")
      .style("top", event.pageY + 12 + "px");
  })
  .on("mouseout", function () {
    tooltip.style("display", "none");
    if (scatter) scatter.clearHighlight();
  })
  .on("click", function (event, d) {
    selectedMunicipality = d;
    municipalities.classed("selected", (m) => m === d);
    updateMunicipalityInfo(d);
    createLineGraph(
      "#linegraph",
      csvData,
      getTouristicSeries(d.properties.id),
      d.properties.id,
      d.properties.nom
    );
  });

// --- Contorn turístic (overlay) ---
function applyTouristicOutline() {
  municipalities.classed("touristic-outline", (d) => isTouristicMode && isTouristic(d));
}

// --- Actualització del mapa per any ---
function updateMap(year) {
  currentYear = year;
  const yearData = valueByYear[String(year)] || {};
  municipalities
    .transition()
    .duration(400)
    .attr("fill", (d) => {
      const valor = yearData[d.properties.id];
      return valor !== undefined ? colorScale(valor) : "#dfe4ea";
    });
  applyTouristicOutline();
  if (selectedMunicipality) updateMunicipalityInfo(selectedMunicipality);
}

// --- Xifres clau (KPIs) que canvien amb l'any ---
const baseYear = String(minYear);
function renderKeyFigures(year) {
  const fmtEur = (v) => "€" + d3.format(",.0f")(v);

  // 1) Valor mitjà residencial a Balears
  const balVal = balearsValueByYear[String(year)];

  // 2) Variació des de l'any inicial
  const balBase = balearsValueByYear[baseYear];
  let variacio = null;
  if (balVal !== undefined && balBase) variacio = ((balVal - balBase) / balBase) * 100;

  // 3) Municipi més car de l'any
  const yearData = valueByYear[String(year)] || {};
  let topId = null;
  let topVal = -Infinity;
  Object.keys(yearData).forEach((id) => {
    if (yearData[id] > topVal) {
      topVal = yearData[id];
      topId = id;
    }
  });

  const set = (sel, value, sub) => {
    const el = document.querySelector(sel + " .kpi-value");
    const elSub = document.querySelector(sel + " .kpi-sub");
    if (el) el.textContent = value;
    if (elSub && sub !== undefined) elSub.textContent = sub;
  };

  set("#kpi-value", balVal !== undefined ? fmtEur(balVal) : "—", `Balears · ${year}`);
  set(
    "#kpi-change",
    variacio !== null ? (variacio >= 0 ? "+" : "") + variacio.toFixed(0) + "%" : "—",
    `des de ${minYear}`
  );
  set(
    "#kpi-top",
    topId ? metaById[topId]?.nom || topId : "—",
    topId ? fmtEur(topVal) : ""
  );
}

// --- Llegenda de color ---
function renderLegend() {
  const legend = d3.select("#map-legend");
  legend.selectAll("*").remove();
  legend.append("div").attr("class", "legend-title").text("Valor mitjà residencial (€)");
  const stops = d3.range(0, 1.0001, 0.1).map((t) => d3.interpolateBlues(t));
  legend
    .append("div")
    .attr("class", "legend-bar")
    .style("background", `linear-gradient(to right, ${stops.join(",")})`);
  const scale = legend.append("div").attr("class", "legend-scale");
  const fmt = (v) => "€" + d3.format(",.0f")(v);
  scale.append("span").text(fmt(globalMinValue));
  scale.append("span").text(fmt((globalMinValue + globalMaxValue) / 2));
  scale.append("span").text(fmt(globalMaxValue));
}

// --- Sèrie temporal de l'IPT compost per a un municipi ---
function getTouristicSeries(id) {
  const series = [];
  Object.keys(touristicIndexByYear).forEach((y) => {
    const v = touristicIndexByYear[y][id];
    if (v !== undefined) series.push({ year: parseInt(y), index: v });
  });
  return series.sort((a, b) => a.year - b.year);
}

// --- Scatterplot connectat ---
function highlightMapMunicipality(id) {
  municipalities.classed("linked", (d) => id != null && d.properties.id === id);
}

const scatter = createScatter(
  "#scatterplot",
  { years: availableYears, metaById, valueByYear, touristicIndexByYear, touristicMetricsByYear, getResidents },
  highlightMapMunicipality
);

// --- Sincronització d'any ---
function setYear(year) {
  yearSlider.value = year;
  yearLabel.textContent = year;
  updateMap(year);
  scatter.update(year);
  renderKeyFigures(year);
}

// --- Slider ---
const yearSlider = document.getElementById("year-slider");
const yearLabel = document.getElementById("year-label");
yearSlider.min = minYear;
yearSlider.max = maxYear;
yearSlider.value = maxYear;
yearLabel.textContent = maxYear;
yearSlider.addEventListener("input", (e) => {
  stopPlay();
  setYear(parseInt(e.target.value));
});

// --- Botó d'animació (play/pausa) ---
const playBtn = document.getElementById("play-btn");
const playIcon = playBtn.querySelector(".play-icon");
const playText = playBtn.querySelector(".play-text");
let playTimer = null;

function startPlay() {
  playBtn.classList.add("active");
  playIcon.textContent = "❚❚";
  playText.textContent = "Pausa";
  if (parseInt(yearSlider.value) >= maxYear) setYear(minYear);
  playTimer = setInterval(() => {
    const next = parseInt(yearSlider.value) + 1;
    if (next > maxYear) {
      stopPlay();
      return;
    }
    setYear(next);
  }, 420);
}

function stopPlay() {
  if (!playTimer) return;
  clearInterval(playTimer);
  playTimer = null;
  playBtn.classList.remove("active");
  playIcon.textContent = "▶";
  playText.textContent = "Reproduir";
}

playBtn.addEventListener("click", () => {
  if (playTimer) stopPlay();
  else startPlay();
});

// --- Toggle municipis turístics ---
const touristicBtn = document.getElementById("toggle-touristic-btn");
touristicBtn.addEventListener("click", () => {
  isTouristicMode = !isTouristicMode;
  touristicBtn.classList.toggle("active", isTouristicMode);
  touristicBtn.textContent = isTouristicMode
    ? "Amagar municipis turístics"
    : "Ressaltar municipis turístics";
  applyTouristicOutline();
});

// --- Render inicial ---
renderLegend();
renderKeyFigures(maxYear);
updateMap(maxYear);
scatter.update(maxYear);
