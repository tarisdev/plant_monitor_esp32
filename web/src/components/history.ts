import { DEFAULT_RANGE, LOG_PAGE } from "../lib/config";
import { $, int, n, rangeLabel, stamp } from "../lib/format";
import { tpl } from "../lib/i18n";
import type { Reading } from "../lib/types";

let history: Reading[] = [];
let minutes = DEFAULT_RANGE;
let shown = LOG_PAGE;

/** rows inside the selected time window, oldest first */
export function visibleRows() {
  const since = Date.now() - minutes * 60_000;
  return history.filter((r) => r.timestamp >= since);
}

export function setRange(min: number) {
  minutes = min;
  shown = LOG_PAGE;
}

export function setHistory(rows: Reading[]) {
  history = rows;
  shown = LOG_PAGE;
}

/** paint the log table, its count text and the empty state */
export function paintHistory() {
  const rows = visibleRows();
  const visible = rows.slice(-shown).reverse(); // newest first
  $("log-body").innerHTML = visible
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
  const label = rangeLabel(minutes);
  $("log-count").textContent = rows.length
    ? tpl("logCount", visible.length, rows.length, label)
    : tpl("logCountEmpty", label);
  $("dev-slot").textContent = history.at(-1)?.id ?? "—";
  $("empty").classList.toggle("show", history.length === 0);
}

// infinite scroll: reveal another batch when the log table nears its bottom
$("log-scroll")?.addEventListener("scroll", (event) => {
  const el = event.currentTarget as HTMLElement;
  const total = visibleRows().length;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80 && shown < total) {
    shown = Math.min(shown + LOG_PAGE, total);
    paintHistory();
  }
});
