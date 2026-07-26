// Shared data-visualization contract. Sampled business data uses straight
// segments so charts do not imply intermediate values that were never measured.
export const CHART_LINE_TYPE = "linear";

// Curves are reserved for an explicitly labelled trend or forecast series.
export const CHART_TREND_LINE_TYPE = "monotone";

export const CHART_STROKE_WIDTH = Object.freeze({
  primary: 3,
  comparison: 2,
});

export const CHART_DASH = Object.freeze({
  target: "5 4",
  comparison: "5 4",
});

export const CHART_COLORS = Object.freeze({
  actual: "var(--accent)",
  target: "var(--blue)",
  forecast: "var(--amber)",
  success: "var(--green)",
  danger: "var(--red)",
  info: "var(--blue)",
  neutral: "var(--text-3)",
  comparison: "var(--text-3)",
});

export const CHART_GRID_PROPS = Object.freeze({
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
});

export const CHART_AXIS_TICK = Object.freeze({
  fill: "var(--text-3)",
  fontSize: 12,
});

export const CHART_TOOLTIP_STYLE = Object.freeze({
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--panel)",
  boxShadow: "var(--shadow-lg)",
});
