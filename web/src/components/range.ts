import { DEFAULT_RANGE } from "../lib/config";
import { $ } from "../lib/format";

/**
 * Wire the range toolbar. Returns the minutes of the button marked active in
 * index.html so the caller can apply it before the first paint.
 */
export function bindRanges(onChange: (minutes: number) => void): number {
  const bar = $("ranges");
  bar.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-range]");
    const minutes = Number(btn?.dataset.range);
    if (!btn || !Number.isFinite(minutes) || minutes <= 0) return;
    bar.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    onChange(minutes);
  });

  const start = Number(bar.querySelector<HTMLButtonElement>("button.active")?.dataset.range);
  return Number.isFinite(start) && start > 0 ? start : DEFAULT_RANGE;
}
