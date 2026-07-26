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
