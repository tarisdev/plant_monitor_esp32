import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import "./style.css";

// Public Firebase web config — read from web/.env at build time (Vite only exposes VITE_* keys).
// A Firebase web apiKey is not a secret, so it is safe to ship inside the bundle.
// Same project the ESP32 writes to. See README section 2.3.
const env = import.meta.env;
const required = (key: string) => {
  const value: unknown = env[key];
  if (typeof value !== "string" || value === "")
    throw new Error(`Missing ${key} — add it to web/.env (template: web/.env.example)`);
  return value;
};

const firebaseConfig = {
  apiKey: required("VITE_FIREBASE_API_KEY"),
  authDomain: required("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: required("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: required("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: required("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: required("VITE_FIREBASE_APP_ID"),
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

// Must equal the firmware #define FS_LATEST / FS_READINGS
// (firmware/payload.check.cjs asserts these two strings against the .ino).
const PLANT_DOC = "plants/monitor/latest/data";
const READINGS_COLL = "plants/monitor/readings";
const HISTORY_LIMIT = 672; // the firmware ring size: 7 days x 96 samples/day

const SOIL_THIRSTY = 30; // % — below this the plant needs watering (dashed line on the chart)

const db = getFirestore(initializeApp(firebaseConfig));

/* ---------- shapes written by the firmware payload ---------- */
type Sensors = { temperature?: number; humidity?: number; soilMoisture?: number; soilRaw?: number };
type Device = { dhtOK?: boolean; wifi?: boolean; ip?: string; uptimeMs?: number };
type Sync = { timestamp?: number; synced?: boolean };
type Latest = { sensors?: Sensors; device?: Device; sync?: Sync };
type Reading = {
  id: string;
  timestamp: number;
  temperature: number;
  humidity: number;
  soilMoisture: number;
  soilRaw: number;
};

/* ---------- tiny helpers ---------- */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const n = (v: unknown, digits = 1) =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(digits) : "—";

const int = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? String(Math.round(v)) : "—";

const stamp = (ms: number) =>
  new Date(ms).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s} giây trước`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

function uptime(ms: number) {
  const s = Math.round(ms / 1000);
  const parts = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60)];
  return (["d", "h", "m"] as const)
    .map((u, i) => (parts[i] ? `${parts[i]}${u}` : ""))
    .filter(Boolean)
    .join(" ");
}

/* ---------- charts ---------- */
const GRID = { color: "rgba(148,163,184,.12)" };
const TICK = { color: "#8ea0bf", font: { size: 11 } };
const TOOLTIP = {
  backgroundColor: "rgba(8,13,24,.95)",
  borderColor: "rgba(148,163,184,.25)",
  borderWidth: 1,
  padding: 10,
};
const LEGEND = { labels: { color: "#cbd5e1", usePointStyle: true, boxWidth: 8 } };
const AXIS = { border: { display: false }, ticks: TICK, grid: GRID };

const climate = new Chart($<HTMLCanvasElement>("chart-climate"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Nhiệt độ (°C)",
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
        label: "Độ ẩm không khí (%)",
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
    plugins: { legend: LEGEND, tooltip: TOOLTIP },
    scales: {
      x: { ...AXIS, ticks: { ...TICK, maxTicksLimit: 7, maxRotation: 0, autoSkip: true } },
      y: { ...AXIS, position: "left" },
      y1: { ...AXIS, position: "right", grid: { drawOnChartArea: false } },
    },
  },
} as ChartConfiguration<"line", number[], string>);

const soil = new Chart($<HTMLCanvasElement>("chart-soil"), {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Độ ẩm đất (%)",
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
        label: `Ngưỡng cần tưới (${SOIL_THIRSTY}%)`,
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
    plugins: { legend: LEGEND, tooltip: TOOLTIP },
    scales: {
      x: { ...AXIS, ticks: { ...TICK, maxTicksLimit: 6, maxRotation: 0, autoSkip: true } },
      y: { ...AXIS, min: 0, max: 100 },
    },
  },
} as ChartConfiguration<"line", number[], string>);

/* ---------- state + rendering ---------- */
let history: Reading[] = [];
let rangeMinutes = 4320; // mặc định 3 ngày; giá trị nút đọc theo phút
let rangeLabel = "3 ngày";
let latestTs: number | undefined;

function setStatus(kind: "live" | "idle" | "error", text: string) {
  $("conn").className = `pill pill-${kind}`;
  $("conn-text").textContent = text;
}

function flag(id: string, value: unknown, okText: string, badText: string) {
  const el = $(id);
  const unknown = value === undefined || value === null;
  el.textContent = unknown ? "—" : value === true ? okText : badText;
  el.classList.toggle("ok", value === true);
  el.classList.toggle("bad", !unknown && value !== true);
}

function renderLatest(data: Latest) {
  const s = data.sensors ?? {};
  const dev = data.device ?? {};
  const syn = data.sync ?? {};

  $("temp").textContent = n(s.temperature);
  $("hum").textContent = n(s.humidity);
  $("soil").textContent = int(s.soilMoisture);
  $("adc").textContent = int(s.soilRaw);

  $("soil-now").textContent =
    typeof s.soilMoisture === "number"
      ? `${s.soilMoisture}% — ${s.soilMoisture < SOIL_THIRSTY ? "cần tưới" : "đủ ẩm"}`
      : "—";

  latestTs = syn.synced && typeof syn.timestamp === "number" ? syn.timestamp : undefined;
  $("last-update").textContent = latestTs ? ago(latestTs) : "—";

  flag("dev-dht", dev.dhtOK, "Hoạt động", "Lỗi đọc");
  flag("dev-wifi", dev.wifi, "Đã kết nối", "Mất kết nối");
  flag("dev-synced", syn.synced, "Đã đồng bộ", "Chưa đồng bộ");
  $("dev-ip").textContent = dev.ip || "—";
  $("dev-uptime").textContent = typeof dev.uptimeMs === "number" ? uptime(dev.uptimeMs) : "—";
}

function renderLog(rows: Reading[]) {
  $("log-body").innerHTML = rows
    .slice()
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
    ? `${rows.length} mẫu trong ${rangeLabel} gần nhất`
    : "chưa có mẫu nào";
}

function paint() {
  const since = Date.now() - rangeMinutes * 60_000;
  const rows = history.filter((r) => r.timestamp >= since);
  const labels = rows.map((r) => stamp(r.timestamp));

  climate.data.labels = labels;
  climate.data.datasets[0].data = rows.map((r) => r.temperature);
  climate.data.datasets[1].data = rows.map((r) => r.humidity);
  climate.update();

  soil.data.labels = labels;
  soil.data.datasets[0].data = rows.map((r) => r.soilMoisture);
  soil.data.datasets[1].data = rows.map(() => SOIL_THIRSTY);
  soil.update();

  renderLog(rows);

  const newest = history.at(-1);
  $("dev-slot").textContent = newest ? newest.id : "—";
  $("empty").classList.toggle("show", history.length === 0);
}

/* ---------- range filter ---------- */
$("ranges").addEventListener("click", (event) => {
  const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-range]");
  const minutes = Number(btn?.dataset.range);
  if (!btn || !Number.isFinite(minutes) || minutes <= 0) return;
  rangeMinutes = minutes;
  rangeLabel = btn.textContent?.trim() || rangeLabel;
  $("ranges")
    .querySelectorAll("button")
    .forEach((b) => b.classList.toggle("active", b === btn));
  paint();
});

/* ---------- live listeners (read-only; the rules allow public read) ---------- */
onSnapshot(
  doc(db, PLANT_DOC),
  (snap) => {
    if (!snap.exists()) {
      setStatus("idle", "Chưa có bản ghi trạng thái");
      return;
    }
    renderLatest((snap.data() ?? {}) as Latest);
    setStatus("live", "Đang nhận dữ liệu trực tiếp");
  },
  (err) => setStatus("error", `Lỗi Firestore (${err.code})`),
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
  (err) => setStatus("error", `Lỗi Firestore (${err.code})`),
);

// Refresh the relative timestamp between snapshots
setInterval(() => {
  if (latestTs) $("last-update").textContent = ago(latestTs);
}, 30_000);


