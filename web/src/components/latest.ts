import { SOIL_THIRSTY } from "../lib/config";
import { $, ago, int, n, uptime } from "../lib/format";
import { updateGauges } from "./gauges";
import { t, tpl } from "../lib/i18n";
import type { Latest } from "../lib/types";

let lastData: Latest | undefined; // cached so a language switch can re-render it
let latestTs: number | undefined;

function flag(id: string, value: unknown, okText: string, badText: string) {
  const el = $(id);
  const unknown = value === undefined || value === null;
  el.textContent = unknown ? "—" : value === true ? okText : badText;
  el.classList.toggle("ok", value === true);
  el.classList.toggle("bad", !unknown && value !== true);
}

/** repaint the relative "last update" text without new data */
export function refreshAgo() {
  $("last-update").textContent = latestTs ? ago(latestTs) : "—";
}

/** render the live document: KPI readouts, gauges and the device list */
export function renderLatest(data: Latest) {
  lastData = data;
  const s = data.sensors ?? {};
  const dev = data.device ?? {};
  const syn = data.sync ?? {};

  $("temp").textContent = n(s.temperature);
  $("hum").textContent = n(s.humidity);
  $("soil").textContent = int(s.soilMoisture);
  $("adc").textContent = int(s.soilRaw);

  updateGauges(s.temperature, s.humidity, s.soilMoisture);

  const soilNow = typeof s.soilMoisture === "number" ? s.soilMoisture : undefined;
  $("soil-now").textContent = tpl(
    "soilNow",
    soilNow === undefined ? "—" : String(soilNow),
    soilNow !== undefined && soilNow >= SOIL_THIRSTY,
  );

  latestTs = syn.synced && typeof syn.timestamp === "number" ? syn.timestamp : undefined;
  refreshAgo();

  flag("dev-dht", dev.dhtOK, t("statusOk"), t("statusBad"));
  flag("dev-wifi", dev.wifi, t("wifiOk"), t("wifiBad"));
  flag("dev-synced", syn.synced, t("syncOk"), t("syncBad"));
  $("dev-ip").textContent = dev.ip || "—";
  $("dev-uptime").textContent = typeof dev.uptimeMs === "number" ? uptime(dev.uptimeMs) : "—";
}

/** re-render the cached document after a language switch */
export function rerenderLatest() {
  if (lastData) renderLatest(lastData);
}
