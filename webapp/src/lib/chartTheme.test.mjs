import assert from "node:assert/strict";
import test from "node:test";

import {
  CHART_CATEGORICAL,
  CHART_COLORS,
  CHART_COMPARISON_OPACITY,
  CHART_DASH,
  CHART_LINE_TYPE,
  CHART_SERIES,
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

/* ── เส้นเทียบต้องไม่มีสีของตัวเอง ─────────────────────────────────────────
   🐞 เดิม `CHART_COLORS.comparison = "var(--text-3)"` — วัดด้วย validate_palette แล้ว
   ตกเกณฑ์สายตาปกติในธีมมืด (ΔE 13.5 เทียบกับ accent · เกณฑ์ขั้นต่ำ 15) = คนตาปกติ
   ก็แยกสองเส้นไม่ออก · และไม่มีสีไหนแทนได้ เพราะสีคงที่หนึ่งสีต้องไปอยู่ข้างชุดสีอะไร
   ก็ได้ (teal ผ่านตอนคู่กับ accent แต่ชน green ของ CHART_SERIES ที่ ΔE 6.8)
   ⇒ เส้นเทียบใช้ **สีเดียวกับเส้นหลัก** แล้วแยกด้วย เส้นประ + ความหนา + ความทึบ
   เทสต์นี้กันไม่ให้ใครเติมสีกลับเข้าไปโดยไม่ได้อ่านเหตุผล */
test("comparison series has no colour of its own", () => {
  assert.equal(CHART_COLORS.comparison, undefined);
  assert.ok(CHART_COMPARISON_OPACITY > 0 && CHART_COMPARISON_OPACITY < 1);
  // ต้องจางพอให้เห็นว่าเป็นของรอง แต่ยังอ่านออก
  assert.ok(CHART_COMPARISON_OPACITY >= 0.4, "จางกว่านี้อ่านไม่ออกบนพื้นการ์ด");
  assert.ok(CHART_COMPARISON_OPACITY <= 0.7, "ทึบกว่านี้แข่งกับเส้นหลัก");
  // แยกด้วยสามอย่างที่ไม่ใช่สี — ขาดข้อใดข้อหนึ่งแล้วเหลือ hue เป็นตัวแยกเดียว
  assert.equal(CHART_DASH.comparison, "5 4");
  assert.ok(CHART_STROKE_WIDTH.comparison < CHART_STROKE_WIDTH.primary);
});

/* `CHART_COLORS` ไม่ใช่จานสีของ series — กราฟจริงต้องหยิบจาก CHART_SERIES/CHART_CATEGORICAL
   ปล่อยให้มันโตเป็นจานที่สองเมื่อไร จะได้ "Forecast คนละสีในแต่ละหน้า" กลับมาอีก
   (รอบตรวจ 2026-08-08 เจอ palette กระจาย 8 ชุด) */
test("CHART_COLORS ไม่กลายเป็นจานสี series ชุดที่สอง", () => {
  assert.equal(Object.keys(CHART_SERIES).length, 3);
  assert.equal(CHART_CATEGORICAL.length, 6);
  for (const value of Object.values(CHART_SERIES)) assert.match(value, /^var\(--chart-/);
  for (const value of CHART_CATEGORICAL) assert.match(value, /^var\(--chart-cat-/);
});
