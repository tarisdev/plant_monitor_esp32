import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import { CHART_AXIS, CHART_LEGEND, CHART_TOOLTIP, SOIL_THIRSTY } from "./config";
import { $ } from "./format";
import { t } from "./i18n";

export function updateClimate(chart: Chart<"line">, labels: string[], temps: number[], hums: number[]) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = temps;
  chart.data.datasets[1].data = hums;
  chart.update();
}

export function updateSoil(chart: Chart<"line">, labels: string[], soils: number[]) {
  chart.data.labels = labels;
  chart.data.datasets[0].data = soils;
  chart.data.datasets[1].data = labels.map(() => SOIL_THIRSTY);
  chart.update();
}

// legend labels are translatable — call after switching language
export function labelCharts(climate: Chart<"line">, soil: Chart<"line">) {
  climate.data.datasets[0].label = `${t("kpiTemp")} (°C)`;
  climate.data.datasets[1].label = `${t("kpiHum")} (%)`;
  soil.data.datasets[0].label = `${t("kpiSoil")} (%)`;
  soil.data.datasets[1].label = `${t("soilThreshold")} (${SOIL_THIRSTY}%)`;
  climate.update();
  soil.update();
}

export function makeClimate(): Chart<"line"> {
  return new Chart($<HTMLCanvasElement>("chart-climate"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: `${t("kpiTemp")} (°C)`,
          data: [],
          borderColor: "#fbbf24",
          backgroundColor: "rgba(251,191,36,.14)",
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 14,
          tension: 0.35,
          yAxisID: "y",
        },
        {
          label: `${t("kpiHum")} (%)`,
          data: [],
          borderColor: "#60a5fa",
          backgroundColor: "rgba(96,165,250,.14)",
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 14,
          tension: 0.35,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: 250 },
      plugins: { legend: CHART_LEGEND, tooltip: CHART_TOOLTIP },
      scales: {
        x: { ...CHART_AXIS, ticks: { ...CHART_AXIS.ticks, maxTicksLimit: 7, maxRotation: 0, autoSkip: true } },
        y: { ...CHART_AXIS, position: "left" },
        y1: { ...CHART_AXIS, position: "right", grid: { drawOnChartArea: false } },
      },
    },
  } as ChartConfiguration<"line", number[], string>);
}

export function makeSoil(): Chart<"line"> {
  return new Chart($<HTMLCanvasElement>("chart-soil"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: `${t("kpiSoil")} (%)`,
          data: [],
          borderColor: "#2dd4bf",
          backgroundColor: "rgba(45,212,191,.18)",
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 14,
          tension: 0.35,
          fill: true,
        },
        {
          label: `${t("soilThreshold")} (${SOIL_THIRSTY}%)`,
          data: [],
          borderColor: "rgba(248,113,113,.75)",
          borderWidth: 1.5,
          borderDash: [6, 5],
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      animation: { duration: 250 },
      plugins: { legend: CHART_LEGEND, tooltip: CHART_TOOLTIP },
      scales: {
        x: { ...CHART_AXIS, ticks: { ...CHART_AXIS.ticks, maxTicksLimit: 6, maxRotation: 0, autoSkip: true } },
        y: { ...CHART_AXIS, min: 0, max: 100 },
      },
    },
  } as ChartConfiguration<"line", number[], string>);
}