import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import { GAUGE_TRACK, SOIL_THIRSTY, TEMP_MAX_GAUGE } from "../lib/config";
import { $ } from "../lib/format";
import { t } from "../lib/i18n";

type TagKind = "good" | "warn" | "bad" | "";

const TEMP_DEFAULT = "#fbbf24"; // neutral amber while there is no reading

const tempGauge = makeGauge("gauge-temp", TEMP_DEFAULT);
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

// temperature tints the whole card per level: cold→blue, cool→green, warm→amber, hot→red.
// Colours the arc only; the caller's setGauge() does the single chart update.
function tintTemp(value: unknown) {
  const level =
    typeof value === "number" && Number.isFinite(value)
      ? ([
          [18, t("tempCold"), "#60a5fa"],
          [28, t("tempCool"), "#4ade80"],
          [34, t("tempWarm"), "#fbbf24"],
          [Infinity, t("tempHot"), "#f87171"],
        ] as ReadonlyArray<[number, string, string]>).find(([max]) => value < max)
      : undefined;

  setTag("tag-temp", "", level?.[1] ?? "—"); // no kind class: the pill colour is --level
  const style = $("card-temp").style;
  if (level) {
    style.setProperty("--level", level[2]);
    style.setProperty("--level-ink", "#04120f");
    tempGauge.data.datasets[0].backgroundColor = [level[2], GAUGE_TRACK];
  } else {
    style.removeProperty("--level");
    style.removeProperty("--level-ink");
    tempGauge.data.datasets[0].backgroundColor = [TEMP_DEFAULT, GAUGE_TRACK];
  }
}

export function updateGauges(temp: number | undefined, hum: number | undefined, soil: number | undefined) {
  tintTemp(temp); // must run before the setGauge() update below
  setGauge(tempGauge, temp, TEMP_MAX_GAUGE);
  setGauge(humGauge, hum, 100);
  setGauge(soilGauge, soil, 100);

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