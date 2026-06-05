/**
 * linegraph.js - Evolució del valor residencial (i pressió turística) d'un municipi
 */

import * as d3 from "d3";

const COLOR_PRICE = "#0a6ebd";
const COLOR_PRICE_FILL = "#cfe3f5";
const COLOR_TOURISTIC = "#e08a1e";

export function createLineGraph(
  containerId,
  csvData,
  touristicSeries,
  municipalityId,
  municipalityName
) {
  // Dades de preu (ús residencial)
  const municipalityData = csvData
    .filter((row) => row.codi_municipi.trim() === municipalityId && row.us === "Residencial")
    .map((row) => ({ year: parseInt(row.any), valor: parseFloat(row.valor_mitja_eur) }))
    .filter((d) => !Number.isNaN(d.valor))
    .sort((a, b) => a.year - b.year);

  const container = d3.select(containerId);
  container.selectAll("*").remove();

  if (municipalityData.length === 0) {
    container.append("p").attr("class", "empty-state").text("Sense dades per a aquest municipi.");
    return;
  }

  // Sèrie de pressió turística precomputada (índex compost), si n'hi ha
  const touristicPressureData = (touristicSeries || [])
    .filter((d) => d && !Number.isNaN(d.index))
    .slice()
    .sort((a, b) => a.year - b.year);

  const hasTouristic = touristicPressureData.length > 0;

  const margin = { top: 28, right: hasTouristic ? 46 : 18, bottom: 34, left: 52 };
  const width = 360 - margin.left - margin.right;
  const height = 240 - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xScale = d3
    .scaleLinear()
    .domain(d3.extent(municipalityData, (d) => d.year))
    .range([0, width]);

  const yScalePrice = d3
    .scaleLinear()
    .domain([0, d3.max(municipalityData, (d) => d.valor)])
    .nice()
    .range([height, 0]);

  let yScaleTouristic = null;
  if (hasTouristic) {
    yScaleTouristic = d3
      .scaleLinear()
      .domain([0, d3.max(touristicPressureData, (d) => d.index)])
      .nice()
      .range([height, 0]);
  }

  // Gridlines horitzontals
  const grid = svg.append("g").attr("class", "grid-y");
  grid.call(d3.axisLeft(yScalePrice).ticks(5).tickSize(-width).tickFormat(""));
  grid.selectAll("line").attr("class", "gridline");
  grid.select(".domain").remove();

  // Eix X
  svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(xScale).ticks(5).tickFormat(d3.format("d")));

  // Eix Y esquerre (preu)
  svg
    .append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScalePrice).ticks(5).tickFormat((d) => d3.format("~s")(d)));

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -42)
    .attr("text-anchor", "middle")
    .attr("fill", COLOR_PRICE)
    .text("Valor (€)");

  // Eix Y dret (índex turístic)
  if (hasTouristic) {
    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(${width},0)`)
      .call(d3.axisRight(yScaleTouristic).ticks(5));

    svg
      .append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(90)")
      .attr("x", height / 2)
      .attr("y", -width - 38)
      .attr("text-anchor", "middle")
      .attr("fill", COLOR_TOURISTIC)
      .text("Índex compost (0–100)");
  }

  // Àrea sota la línia de preu
  const area = d3
    .area()
    .x((d) => xScale(d.year))
    .y0(height)
    .y1((d) => yScalePrice(d.valor))
    .curve(d3.curveMonotoneX);

  svg.append("path").datum(municipalityData).attr("fill", COLOR_PRICE_FILL).attr("opacity", 0.55).attr("d", area);

  // Línia de preu
  const linePrice = d3
    .line()
    .x((d) => xScale(d.year))
    .y((d) => yScalePrice(d.valor))
    .curve(d3.curveMonotoneX);

  svg
    .append("path")
    .datum(municipalityData)
    .attr("fill", "none")
    .attr("stroke", COLOR_PRICE)
    .attr("stroke-width", 2.5)
    .attr("d", linePrice);

  // Línia turística
  if (hasTouristic) {
    const lineTouristic = d3
      .line()
      .x((d) => xScale(d.year))
      .y((d) => yScaleTouristic(d.index))
      .curve(d3.curveMonotoneX);

    svg
      .append("path")
      .datum(touristicPressureData)
      .attr("fill", "none")
      .attr("stroke", COLOR_TOURISTIC)
      .attr("stroke-width", 2.5)
      .attr("stroke-dasharray", "5 3")
      .attr("d", lineTouristic);
  }

  // Tooltip compartit
  let tooltip = d3.select("body").select(".tooltip.line-tip");
  if (tooltip.empty()) {
    tooltip = d3.select("body").append("div").attr("class", "tooltip line-tip");
  }

  // Punts de preu
  svg
    .selectAll(".dot-price")
    .data(municipalityData)
    .enter()
    .append("circle")
    .attr("class", "dot-price")
    .attr("cx", (d) => xScale(d.year))
    .attr("cy", (d) => yScalePrice(d.valor))
    .attr("r", 3)
    .attr("fill", COLOR_PRICE)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1)
    .on("mouseover", function (event, d) {
      d3.select(this).attr("r", 5);
      tooltip
        .style("display", "block")
        .html(`<strong>${d.year}</strong><br><span class="t-blue">€${d3.format(",.0f")(d.valor)}</span>`);
    })
    .on("mousemove", function (event) {
      tooltip.style("left", event.pageX + 12 + "px").style("top", event.pageY + 12 + "px");
    })
    .on("mouseout", function () {
      d3.select(this).attr("r", 3);
      tooltip.style("display", "none");
    });

  // Punts turístics
  if (hasTouristic) {
    svg
      .selectAll(".dot-touristic")
      .data(touristicPressureData)
      .enter()
      .append("circle")
      .attr("class", "dot-touristic")
      .attr("cx", (d) => xScale(d.year))
      .attr("cy", (d) => yScaleTouristic(d.index))
      .attr("r", 3)
      .attr("fill", COLOR_TOURISTIC)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("r", 5);
        tooltip
          .style("display", "block")
          .html(`<strong>${d.year}</strong><br><span class="t-accent">Índex: ${d.index.toFixed(1)}</span>`);
      })
      .on("mousemove", function (event) {
        tooltip.style("left", event.pageX + 12 + "px").style("top", event.pageY + 12 + "px");
      })
      .on("mouseout", function () {
        d3.select(this).attr("r", 3);
        tooltip.style("display", "none");
      });
  }
}
