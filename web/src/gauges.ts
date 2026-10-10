import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import { GAUGE_TRACK, SOIL_THIRSTY, TEMP_MAX_GAUGE } from "./config";
import { $ } from "./format";
import { t } from "./i18n";

type TagKind = "good" | "warn" | "bad" | "";

const tempGauge = makeGauge("gauge-temp", "#fbbf24");
const humGauge = makeGauge("gauge-hum", "#60a5fa");
const soilGauge = makeGauge("gauge-soil", "#2dd4bf");

function makeGauge(id: string, color: string) {
  return new Chart($<HTMLCanvasElement>(id), {
    type: "doughnut",
    data: {
      labels: [],
      datasets: [
        {
          data: [0, 1],
          backgroundColor: [color, GAUGE_TRACK],
          borderWidth: 0,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      circumference: 180,
      rotation: -90,
      cutout: "74%",
      animation: { duration: 400 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  } as ChartConfiguration<"doughnut", number[], string>);
}

function setGauge(g: Chart<"doughnut">, value: number | undefined, max: number) {
  const v = typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  g.data.datasets[0].data = [v, max - v];
  g.update();
}

function setTag(id: string, kind: TagKind, text: string) {
  const el = $(id);
  el.textContent = text;
  el.className = kind ? `gauge-tag ${kind}` : "gauge-tag";
}

function rate(id: string, value: unknown, levels: ReadonlyArray<[number, TagKind, string]>) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    setTag(id, "", "—");
    return;
  }
  const found = levels.find(([max]) => value < max);
  if (!found) return;
  const [, kind, label] = found;
  setTag(id, kind, label);
}

export function updateGauges(temp: number | undefined, hum: number | undefined, soil: number | undefined) {
  setGauge(tempGauge, temp, TEMP_MAX_GAUGE);
  setGauge(humGauge, hum, 100);
  setGauge(soilGauge, soil, 100);

  rate("tag-temp", temp, [
    [18, "bad", t("tempCold")],
    [28, "good", t("tempCool")],
    [34, "warn", t("tempWarm")],
    [Infinity, "bad", t("tempHot")],
  ]);
  rate("tag-hum", hum, [
    [30, "bad", t("humDry")],
    [70, "good", t("humOk")],
    [Infinity, "warn", t("humWet")],
  ]);
  rate("tag-soil", soil, [
    [SOIL_THIRSTY, "bad", t("soilDry")],
    [75, "good", t("soilOk")],
    [Infinity, "warn", t("soilWet")],
  ]);
}