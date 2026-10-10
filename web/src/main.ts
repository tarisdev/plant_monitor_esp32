import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { initializeApp } from "firebase/app";
import { HISTORY_LIMIT, LOG_PAGE, PLANT_DOC, READINGS_COLL, SOIL_THIRSTY } from "./config";
import type { Latest, Reading } from "./types";
import { $, ago, int, n, stamp, uptime } from "./format";
import { setLang, t, tpl } from "./i18n";
import { makeClimate, makeSoil, labelCharts, updateClimate, updateSoil } from "./charts";
import { updateGauges } from "./gauges";
import "./style.css";

/* ---------- firebase (config from web/.env, see .env.example) ---------- */
const env = import.meta.env;
const required = (key: string) => {
  const value: unknown = env[key];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Missing ${key} — add it to web/.env (template: web/.env.example)`);
  }
  return value;
};

const db = getFirestore(
  initializeApp({
    apiKey: required("VITE_FIREBASE_API_KEY"),
    authDomain: required("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: required("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: required("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: required("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: required("VITE_FIREBASE_APP_ID"),
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
  }),
);

const climate = makeClimate();
const soil = makeSoil();

let history: Reading[] = [];
let rangeMinutes = 4320; // 3 days default; data-range values are minutes
let rangeLabel = "3 ngày";
let latestTs: number | undefined;
let logShown = LOG_PAGE;
let lastData: Latest | undefined; // kept so a language switch can re-render it

const langVi = document.getElementById("lang-vi") as HTMLButtonElement | null;
const langEn = document.getElementById("lang-en") as HTMLButtonElement | null;
langVi?.addEventListener("click", () => switchLang("vi"));
langEn?.addEventListener("click", () => switchLang("en"));

function switchLang(l: "vi" | "en") {
  setLang(l);
  langVi?.classList.toggle("active", l === "vi");
  langEn?.classList.toggle("active", l === "en");
  rangeLabel = getRangeLabel(rangeMinutes);
  labelCharts(climate, soil);
  renderStatus();
  paint();
  if (lastData) renderLatest(lastData);
  if (latestTs) $("last-update").textContent = ago(latestTs);
}

function getRangeLabel(min: number) {
  if (min === 30) return t("range30m");
  if (min === 360) return t("range6h");
  if (min === 1440) return t("range1d");
  if (min === 4320) return t("range3d");
  if (min === 10080) return t("range7d");
  return `${min}m`;
}

// status text is kept as a thunk so switching language can re-render it
let statusLine: { kind: "live" | "idle" | "error"; text: () => string } = {
  kind: "idle",
  text: () => t("connecting"),
};

function setStatus(kind: "live" | "idle" | "error", text: () => string) {
  statusLine = { kind, text };
  renderStatus();
}

function renderStatus() {
  $("conn").className = `pill pill-${statusLine.kind}`;
  $("conn-text").textContent = statusLine.text();
}

function flag(id: string, value: unknown, okText: string, badText: string) {
  const el = $(id);
  const unknown = value === undefined || value === null;
  el.textContent = unknown ? "—" : value === true ? okText : badText;
  el.classList.toggle("ok", value === true);
  el.classList.toggle("bad", !unknown && value !== true);
}

function renderLatest(data: Latest) {
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
  $("last-update").textContent = latestTs ? ago(latestTs) : "—";

  flag("dev-dht", dev.dhtOK, t("statusOk"), t("statusBad"));
  flag("dev-wifi", dev.wifi, t("wifiOk"), t("wifiBad"));
  flag("dev-synced", syn.synced, t("syncOk"), t("syncBad"));
  $("dev-ip").textContent = dev.ip || "—";
  $("dev-uptime").textContent = typeof dev.uptimeMs === "number" ? uptime(dev.uptimeMs) : "—";
}

function renderLog(rows: Reading[]) {
  const visible = rows.slice(-logShown); // newest `logShown` rows, flipped below
  $("log-body").innerHTML = visible
    .reverse()
    .map(
      (r) => `<tr>
        <td>${stamp(r.timestamp)}</td>
        <td>${n(r.temperature)} °C</td>
        <td>${n(r.humidity)} %</td>
        <td>${int(r.soilMoisture)} %</td>
        <td>${int(r.soilRaw)}</td>
        <td class="slot">${r.id}</td>
      </tr>`,
    )
    .join("");
  $("log-count").textContent = rows.length
    ? tpl("logCount", visible.length, rows.length, rangeLabel)
    : t("logCountEmpty");
}

function rowsInRange() {
  const since = Date.now() - rangeMinutes * 60_000;
  return history.filter((r) => r.timestamp >= since);
}

function paint() {
  const rows = rowsInRange();
  const labels = rows.map((r) => stamp(r.timestamp));
  updateClimate(climate, labels, rows.map((r) => r.temperature), rows.map((r) => r.humidity));
  updateSoil(soil, labels, rows.map((r) => r.soilMoisture));
  renderLog(rows);
  const newest = history.at(-1);
  $("dev-slot").textContent = newest ? newest.id : "—";
  $("empty").classList.toggle("show", history.length === 0);
}

// infinite scroll: reveal another batch when the log table nears its bottom
document.getElementById("log-scroll")?.addEventListener("scroll", (event) => {
  const el = event.currentTarget as HTMLElement;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80 && logShown < history.length) {
    logShown = Math.min(logShown + LOG_PAGE, history.length);
    renderLog(rowsInRange());
  }
});

$("ranges").addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-range]");
  const minutes = Number(btn?.dataset.range);
  if (!btn || !Number.isFinite(minutes) || minutes <= 0) return;
  rangeMinutes = minutes;
  rangeLabel = getRangeLabel(minutes);
  logShown = LOG_PAGE;
  $("ranges")
    .querySelectorAll("button")
    .forEach((b) => b.classList.toggle("active", b === btn));
  paint();
});

// restore the saved language (defaults to vi) and apply it to the DOM
switchLang((localStorage.getItem("lang") as "vi" | "en" | null) || "vi");

// start from the button marked active in index.html
const activeRange = $("ranges").querySelector<HTMLButtonElement>("button.active");
const startMinutes = Number(activeRange?.dataset.range);
if (Number.isFinite(startMinutes) && startMinutes > 0) {
  rangeMinutes = startMinutes;
  rangeLabel = getRangeLabel(startMinutes);
}

// live listeners (read-only; the Firestore rules allow public read)
onSnapshot(
  doc(db, PLANT_DOC),
  (snap) => {
    if (!snap.exists()) {
      setStatus("idle", () => t("noState"));
      return;
    }
    renderLatest((snap.data() ?? {}) as Latest);
    setStatus("live", () => t("live"));
  },
  (err) => setStatus("error", () => `${t("firestoreError")} (${err.code})`),
);

onSnapshot(
  query(collection(db, READINGS_COLL), orderBy("timestamp", "desc"), limit(HISTORY_LIMIT)),
  (snap) => {
    history = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Reading, "id">) }))
      .filter((r) => typeof r.timestamp === "number")
      .sort((a, b) => a.timestamp - b.timestamp);
    paint();
  },
  (err) => setStatus("error", () => `${t("firestoreError")} (${err.code})`),
);

// keep the relative "last update" fresh between snapshots
setInterval(() => {
  if (latestTs) $("last-update").textContent = ago(latestTs);
}, 30_000);
