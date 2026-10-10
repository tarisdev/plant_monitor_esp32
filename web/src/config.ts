export const PLANT_DOC = "plants/monitor/latest/data";
export const READINGS_COLL = "plants/monitor/readings";
export const HISTORY_LIMIT = 672; // 7 days × 96 samples/day (firmware ring)

export const SOIL_THIRSTY = 30; // %

export const LOG_PAGE = 60;

export const TEMP_MAX_GAUGE = 60;

export const GAUGE_TRACK = "rgba(148,163,184,.16)";

export const CHART_GRID = { color: "rgba(148,163,184,.12)" } as const;
export const CHART_TICK = { color: "#8ea0bf", font: { size: 11 } } as const;
export const CHART_TOOLTIP = {
  backgroundColor: "rgba(8,13,24,.95)",
  borderColor: "rgba(148,163,184,.25)",
  borderWidth: 1,
  padding: 10,
} as const;
export const CHART_LEGEND = {
  labels: { color: "#cbd5e1", usePointStyle: true, boxWidth: 8 },
} as const;
export const CHART_AXIS = {
  border: { display: false },
  ticks: CHART_TICK,
  grid: CHART_GRID,
} as const;