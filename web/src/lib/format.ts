import { getLang, t } from "./i18n";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const n = (v: unknown, digits = 1) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
};

export const int = (v: unknown) => {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return String(Math.round(v));
};

export const stamp = (ms: number) => {
  const lang = getLang();
  return new Date(ms).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s} ${t("agoSec")}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} ${t("agoMin")}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ${t("agoHour")}`;
  return `${Math.round(h / 24)} ${t("agoDay")}`;
}

/** localized label for a range window given in minutes */
export const rangeLabel = (min: number) => {
  if (min === 30) return t("range30m");
  if (min === 360) return t("range6h");
  if (min === 1440) return t("range1d");
  if (min === 4320) return t("range3d");
  if (min === 10080) return t("range7d");
  return `${min}m`;
};

export function uptime(ms: number) {
  const s = Math.round(ms / 1000);
  const parts = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60)];
  return (["d", "h", "m"] as const)
    .map((u, i) => (parts[i] ? `${parts[i]}${u}` : ""))
    .filter(Boolean)
    .join(" ");
}

export { $ };