import assert from "node:assert/strict";
import test from "node:test";

import {
  CHART_DASH,
  CHART_LINE_TYPE,
  CHART_STROKE_WIDTH,
  CHART_TREND_LINE_TYPE,
} from "./chartTheme.js";

test("sampled business series use straight line segments", () => {
  assert.equal(CHART_LINE_TYPE, "linear");
});

test("curve type is explicit and reserved for labelled trend series", () => {
  assert.equal(CHART_TREND_LINE_TYPE, "monotone");
});

test("shared chart emphasis tokens keep actual stronger than comparisons", () => {
  assert.ok(CHART_STROKE_WIDTH.primary > CHART_STROKE_WIDTH.comparison);
  assert.equal(CHART_DASH.target, "5 4");
});
