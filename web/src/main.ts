import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { HISTORY_LIMIT, PLANT_DOC, READINGS_COLL } from "./lib/config";
import { db } from "./lib/firebase";
import { stamp } from "./lib/format";
import { setLang, t } from "./lib/i18n";
import type { Lang, Latest, Reading } from "./lib/types";
import { labelCharts, makeClimate, makeSoil, updateClimate, updateSoil } from "./components/charts";
import { paintHistory, setHistory, setRange, visibleRows } from "./components/history";
import { refreshAgo, renderLatest, rerenderLatest } from "./components/latest";
import { bindRanges } from "./components/range";
import { renderStatus, setStatus } from "./components/status";
import "./style.css";

const climate = makeClimate();
const soil = makeSoil();

/** repaint the charts and the log for the current window */
function paint() {
  paintHistory();
  const rows = visibleRows();
  const labels = rows.map((r) => stamp(r.timestamp));
  updateClimate(climate, labels, rows.map((r) => r.temperature), rows.map((r) => r.humidity));
  updateSoil(soil, labels, rows.map((r) => r.soilMoisture));
}

/** re-render every piece of text for the new language, data included */
function switchLang(l: Lang) {
  setLang(l);
  labelCharts(climate, soil);
  renderStatus();
  paint();
  rerenderLatest();
}

const fail = (err: { code?: string }) => () => `${t("firestoreError")} (${err.code})`;

// language switch: setLang re-labels static DOM, then switchLang re-renders the rest
const langButtons: ReadonlyArray<[string, Lang]> = [
  ["lang-vi", "vi"],
  ["lang-en", "en"],
];
langButtons.forEach(([id, l]) => document.getElementById(id)?.addEventListener("click", () => switchLang(l)));

setRange(bindRanges((minutes) => {
  setRange(minutes);
  paint();
}));
switchLang((localStorage.getItem("lang") as Lang | null) || "vi");

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
  (err) => setStatus("error", fail(err)),
);

onSnapshot(
  query(collection(db, READINGS_COLL), orderBy("timestamp", "desc"), limit(HISTORY_LIMIT)),
  (snap) => {
    setHistory(
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Reading, "id">) }))
        .filter((r) => typeof r.timestamp === "number")
        .sort((a, b) => a.timestamp - b.timestamp),
    );
    paint();
  },
  (err) => setStatus("error", fail(err)),
);

// keep the relative "last update" fresh between snapshots
setInterval(refreshAgo, 30_000);
