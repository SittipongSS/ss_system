import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const DETAIL = source("./DetailOverview.js");
const TABLE = source("./Table.js");
const TABLE_CSS = source("./Table.module.css");
const CHART = source("./ChartCard.js");
const CHART_CSS = source("./ChartCard.module.css");
const TOAST = source("./Toast.js");
const FEEDBACK = source("../../lib/feedback.js");
const CONFIRM = source("./ConfirmDialog.js");
const LAYOUT = source("../../app/layout.js");

test("detail overview lives in the shared UI layer", () => {
  assert.match(DETAIL, /export default function DetailOverview/);
  assert.match(DETAIL, /DetailStateBadge/);
});

test("table foundation declares list, editable, and matrix contracts", () => {
  for (const component of ["TableShell", "TableToolbar", "TableScroll", "TableEmpty"]) {
    assert.match(TABLE, new RegExp(`export function ${component}`));
  }
  assert.match(TABLE_CSS, /data-family="list"/);
  assert.match(TABLE_CSS, /data-family="editable"/);
  assert.match(TABLE_CSS, /data-family="matrix"/);
  assert.match(TABLE_CSS, /position: sticky/);
});

test("chart foundation owns card, legend, tooltip, empty, and summary zones", () => {
  for (const component of ["ChartLegend", "ChartTooltip", "ChartEmptyState", "ChartSummary"]) {
    assert.match(CHART, new RegExp(`export function ${component}`));
  }
  assert.doesNotMatch(CHART_CSS, /#[0-9a-f]{3,8}|rgba?\(/i);
  assert.doesNotMatch(
    CHART_CSS,
    /:global\(\.recharts-wrapper\)/,
    "Recharts 3 mounts the chart wrapper under a zero-width measuring node; sizing it from that parent collapses every chart",
  );
  assert.match(
    CHART_CSS,
    /\.body\s*>\s*\.canvas\s*\{\s*height:\s*var\(--chart-min-height/,
    "a ChartCanvas directly inside ChartCard needs a definite height for ResponsiveContainer",
  );
});

test("global feedback providers accept imperative migration events", () => {
  assert.match(TOAST, /export \{ notifyToast \}/);
  assert.match(FEEDBACK, /export function notifyToast/);
  assert.match(TOAST, /addEventListener\(TOAST_EVENT/);
  assert.match(CONFIRM, /export function confirmAction/);
  assert.match(CONFIRM, /export function ConfirmProvider/);
  assert.match(LAYOUT, /<ConfirmProvider>/);
});
