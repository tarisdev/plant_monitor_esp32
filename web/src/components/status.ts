import { $ } from "../lib/format";
import { t } from "../lib/i18n";

export type StatusKind = "live" | "idle" | "error";

// the text is kept as a thunk so a language switch can re-render the current status
let line: { kind: StatusKind; text: () => string } = { kind: "idle", text: () => t("connecting") };

export function setStatus(kind: StatusKind, text: () => string) {
  line = { kind, text };
  renderStatus();
}

export function renderStatus() {
  $("conn").className = `pill pill-${line.kind}`;
  $("conn-text").textContent = line.text();
}
