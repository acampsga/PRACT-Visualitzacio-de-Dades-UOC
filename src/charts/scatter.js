/**
 * scatter.js - Scatterplot: pressió turística (X) vs valor residencial (Y)
 *
 * Cada cercle és un municipi. Mida = residents, color = illa.
 * S'actualitza amb l'any i es connecta amb el mapa via ressaltat creuat.
 */

import * as d3 from "d3";

const ILLA_COLORS = {
  Mallorca: "#0a6ebd",
  Menorca: "#2a9d8f",
  Eivissa: "#e08a1e",
  Formentera: "#b5179e",
};

function illaColor(illa) {
  return ILLA_COLORS[illa] || "#8a99a8";
}

/**
 * @param {string} containerSelector
 * @param {object} data
 *   - years: number[]                 anys disponibles (ordenats)
 *   - metaById: {id: {nom, illa}}
 *   - valueByYear: {year: {id: valor}}        (valor mitjà residencial €)
 *   - touristicIndexByYear: {year: {id: idx}} (índex de pressió turística)
 *   - getResidents: (id, year) => number|undefined
 * @param {(id: string|null) => void} onHighlight  callback per ressaltar al mapa
 * @returns {{ update(year): void, highlight(id): void, clearHighlight(): void }}
 */
export function createScatter(containerSelector, data, onHighlight) {
  const { years, metaById, valueByYear, touristicIndexByYear, touristicMetricsByYear, getResidents } =
    data;

  const container = d3.select(containerSelector);
  container.selectAll("*").remove();

  const margin = { top: 16, right: 24, bottom: 52, left: 70 };
  const width = 900 - margin.left - margin.right;
  const height = 420 - margin.top - margin.bottom;

  // --- Dominis globals (fixos) per a una animació estable ---
  // L'índex compost és sempre 0–100; només cal calcular els extrems de valor i residents.
  let maxValue = 0;
  let maxResidents = 0;
  years.forEach((y) => {
    const idx = touristicIndexByYear[y] || {};
    const val = valueByYear[String(y)] || {};
    Object.keys(idx).forEach((id) => {
      if (val[id] !== undefined) {
        maxValue = Math.max(maxValue, val[id]);
        const r = getResidents(id, y);
        if (r) maxResidents = Math.max(maxResidents, r);
      }
    });
  });
  maxValue = maxValue || 1;
  maxResidents = maxResidents || 1;

  const xScale = d3.scaleLinear().domain([0, 100]).range([0, width]);
  const yScale = d3.scaleLinear().domain([0, maxValue * 1.05]).range([height, 0]);
  const rScale = d3.scaleSqrt().domain([0, maxResidents]).range([3, 26]);

  // --- SVG responsiu ---
  const svgRoot = container
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const svg = svgRoot
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Gridlines (Y)
  const yGrid = svg.append("g").attr("class", "grid-y");
  // Gridlines (X)
  const xGrid = svg.append("g").attr("class", "grid-x");

  // Eixos
  const xAxisG = svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`);
  const yAxisG = svg.append("g").attr("class", "axis");

  yGrid.call(
    d3.axisLeft(yScale).ticks(6).tickSize(-width).tickFormat("")
  );
  yGrid.selectAll("line").attr("class", "gridline");
  yGrid.select(".domain").remove();

  xGrid.attr("transform", `translate(0,${height})`).call(
    d3.axisBottom(xScale).ticks(6).tickSize(-height).tickFormat("")
  );
  xGrid.selectAll("line").attr("class", "gridline");
  xGrid.select(".domain").remove();

  xAxisG.call(d3.axisBottom(xScale).ticks(6));
  yAxisG.call(d3.axisLeft(yScale).ticks(6).tickFormat((d) => d3.format(",")(d)));

  // Etiquetes d'eixos
  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + 42)
    .attr("text-anchor", "middle")
    .text("Índex compost de pressió turística (0–100) →");

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -56)
    .attr("text-anchor", "middle")
    .text("Valor mitjà residencial (€) →");

  // Grup de punts
  const dotsG = svg.append("g").attr("class", "dots");

  // Nota (anys sense índex)
  const note = container.append("p").attr("class", "scatter-note").style("display", "none");

  // Llegenda d'illes
  const legend = container.append("div").attr("class", "scatter-legend");
  Object.keys(ILLA_COLORS).forEach((illa) => {
    const key = legend.append("span").attr("class", "key");
    key
      .append("span")
      .attr("class", "swatch")
      .style("background", ILLA_COLORS[illa]);
    key.append("span").text(illa);
  });

  // Tooltip compartit
  let tooltip = d3.select("body").select(".tooltip.scatter-tip");
  if (tooltip.empty()) {
    tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "tooltip scatter-tip");
  }

  let currentHighlight = null;

  function buildPoints(year) {
    const idx = touristicIndexByYear[year] || {};
    const val = valueByYear[String(year)] || {};
    const metrics = (touristicMetricsByYear && touristicMetricsByYear[year]) || {};
    const points = [];
    Object.keys(idx).forEach((id) => {
      if (val[id] === undefined) return;
      const meta = metaById[id] || {};
      points.push({
        id,
        nom: meta.nom || id,
        illa: meta.illa || "—",
        x: idx[id],
        y: val[id],
        residents: getResidents(id, year),
        metrics: metrics[id] || {},
      });
    });
    return points;
  }

  function applyHighlight() {
    if (currentHighlight == null) {
      dotsG.selectAll(".dot").classed("dimmed", false).classed("highlight", false);
      return;
    }
    dotsG
      .selectAll(".dot")
      .classed("highlight", (d) => d.id === currentHighlight)
      .classed("dimmed", (d) => d.id !== currentHighlight);
  }

  function update(year) {
    const points = buildPoints(year);

    if (points.length === 0) {
      note
        .style("display", "block")
        .text(`Sense dades de pressió turística per a ${year}.`);
    } else {
      note.style("display", "none");
    }

    const sel = dotsG.selectAll(".dot").data(points, (d) => d.id);

    sel.exit().transition().duration(300).attr("r", 0).remove();

    const enter = sel
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("fill", (d) => illaColor(d.illa))
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", 0)
      .on("mouseover", function (event, d) {
        currentHighlight = d.id;
        applyHighlight();
        if (onHighlight) onHighlight(d.id);
        const m = d.metrics || {};
        let extra = "";
        if (m.ocupHotel !== undefined) extra += `<br>Ocupació hotelera: ${m.ocupHotel.toFixed(0)}%`;
        if (m.estada !== undefined) extra += `<br>Estada mitjana: ${m.estada.toFixed(1)} nits`;
        if (m.viatgers !== undefined) extra += `<br>Viatgers: ${d3.format(",")(Math.round(m.viatgers))}`;
        tooltip
          .style("display", "block")
          .html(
            `<strong>${d.nom}</strong><br>` +
              `${d.illa}<br>` +
              `<span class="t-blue">Valor: €${d3.format(",.0f")(d.y)}</span><br>` +
              `<span class="t-accent">Índex de pressió: ${d.x.toFixed(0)} / 100</span>` +
              (d.residents ? `<br>Residents: ${d3.format(",")(d.residents)}` : "") +
              extra
          );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("left", event.pageX + 12 + "px")
          .style("top", event.pageY + 12 + "px");
      })
      .on("mouseout", function () {
        currentHighlight = null;
        applyHighlight();
        if (onHighlight) onHighlight(null);
        tooltip.style("display", "none");
      });

    enter
      .merge(sel)
      .transition()
      .duration(500)
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("fill", (d) => illaColor(d.illa))
      .attr("r", (d) => rScale(d.residents || 0));

    applyHighlight();
  }

  function highlight(id) {
    currentHighlight = id;
    applyHighlight();
  }

  function clearHighlight() {
    currentHighlight = null;
    applyHighlight();
  }

  return { update, highlight, clearHighlight };
}
