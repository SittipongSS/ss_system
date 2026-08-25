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

/* ── 🚫 "เส้นเทียบ" ไม่มีสีของตัวเอง ──────────────────────────────────────
 *
 * เดิมมี `comparison: "var(--text-3)"` ในก้อนข้างล่าง · **เอาออกแล้ว ไม่ใช่เปลี่ยนสี**
 * เพราะวัดมาแล้วว่าไม่มีสีไหนทำหน้าที่นี้ได้เลย (validate_palette · ทั้งสองธีม):
 *
 *   คู่กับ `actual` เฉย ๆ (ธีมมืด · เกณฑ์สายตาปกติ ΔE ≥ 15)
 *     text-3 ↔ accent  13.5  ❌ ตกเกณฑ์ — คนตาปกติก็แยกสองเส้นไม่ออก
 *     violet ↔ accent  14.4  ❌
 *     blue   ↔ accent  16.4  ✅   teal ↔ accent 18.4 ✅
 *   แต่พอเอาไปอยู่ในชุด `CHART_SERIES` จริง (plan/forecast/actual) ตัวที่ผ่านก็พังหมด:
 *     teal   ↔ green(actual)  6.8  ❌      teal ↔ blue(plan)  2.9 (deutan) ❌
 *     text-3 ↔ blue(plan)     3.2  ❌
 *
 * ⇒ ปัญหาไม่ใช่ "เลือกสีผิด" แต่คือ **สีคงที่หนึ่งสีต้องอยู่ข้างชุดสีอะไรก็ได้**
 * ซึ่งเป็นไปไม่ได้โดยโครงสร้าง · เพิ่มสีที่ 7 เข้าไปในจานที่มี 6 สีก็แค่เลื่อนคู่ที่ชนไป
 * อีกที่หนึ่ง
 *
 * ⭐ **กติกาแทน: เส้นเทียบใช้สีเดียวกับเส้นหลักที่มันเทียบด้วย** แล้วแยกด้วยสามอย่างที่
 * ไม่ใช่สี — เส้นประ (`CHART_DASH.comparison`) · เส้นบางกว่า
 * (`CHART_STROKE_WIDTH.comparison`) · จางลง (`CHART_COMPARISON_OPACITY`)
 * ท่านี้ **ไม่มีทางชนกับจานสีชุดไหนได้เลย** เพราะมันไม่ได้กินสีเพิ่ม และคนตาบอดสี
 * อ่านออกด้วย (ความต่างไม่ได้อยู่ที่ hue) · เป็นท่ามาตรฐานของ "งวดก่อน vs งวดนี้" อยู่แล้ว
 *
 * ตัวอย่าง: <Line dataKey="thisYear" stroke={CHART_SERIES.actual} strokeWidth={CHART_STROKE_WIDTH.primary} />
 *           <Line dataKey="lastYear" stroke={CHART_SERIES.actual} strokeWidth={CHART_STROKE_WIDTH.comparison}
 *                 strokeDasharray={CHART_DASH.comparison} strokeOpacity={CHART_COMPARISON_OPACITY} />
 */
export const CHART_COMPARISON_OPACITY = 0.55;

/* ⚠️ **ก้อนนี้ไม่ใช่สีของ "ชุดข้อมูล"** — สีของเส้น/แท่งที่เป็นข้อมูลจริงอยู่ที่
 * `CHART_SERIES` ข้างล่าง (ดูคอมเมนต์ที่นั่น: ห้ามเขียน var(--blue) ตรง ๆ ในกราฟ)
 * ก้อนนี้เหลือไว้สำหรับของที่ **ไม่ใช่ series** เท่านั้น เช่น เส้นอ้างอิง/เส้นเป้าเดี่ยว ๆ
 * และหน้าตัวอย่างดีไซน์ · วันนี้มีผู้ใช้อยู่ที่เดียวคือ `settings/design-preview`
 * 🪤 `actual` ที่นี่เป็น `--accent` แต่ `CHART_SERIES.actual` เป็น `--chart-actual`
 * (= เขียว) — **สองก้อนนี้ให้คำตอบคนละสีสำหรับคำเดียวกัน** ห้ามหยิบมาปนในกราฟเดียว
 * กราฟจริงทุกใบในระบบใช้ `CHART_SERIES`/`CHART_CATEGORICAL` แล้ว
 * `neutral` ใช้ได้เฉพาะตอนอยู่ **ลำพัง** (เส้นฐาน/เส้นศูนย์) ห้ามใช้เป็นสีของ series
 * ที่ต้องแยกจาก series อื่น — ด้วยเหตุผลเดียวกับที่ `comparison` ถูกถอดออก */
export const CHART_COLORS = Object.freeze({
  actual: "var(--accent)",
  target: "var(--blue)",
  forecast: "var(--amber)",
  success: "var(--green)",
  danger: "var(--red)",
  info: "var(--blue)",
  neutral: "var(--text-3)",
});

/* สีชุดข้อมูล (series) — ทางเดียวที่กราฟหยิบสีแท่ง/เส้นของ "ข้อมูล" ได้
   ห้ามเขียน var(--blue)/var(--green)/var(--amber) ตรง ๆ ในกราฟอีก:
   โทเคน --chart-* ประกาศใน globals.css และถูกธีม v2 ทับเป็นชุดที่ผ่าน
   ตัวตรวจ CVD ทั้งสองธีม (ที่มา: รอบตรวจ 2026-08-08 เจอ palette กระจาย
   8 ชุด — "Forecast" เป็นคนละสีในแต่ละหน้า)
   ความหมาย: plan = เป้า/แผน (Target/FC) · forecast = คาดการณ์ ·
   actual = ของจริงที่เกิดแล้ว (ยอดจริง/PO ที่ได้รับ) */
export const CHART_SERIES = Object.freeze({
  plan: "var(--chart-plan)",
  forecast: "var(--chart-forecast)",
  actual: "var(--chart-actual)",
});

/* ชุดสีจำแนกประเภท (เส้น "รอบ FC" ฯลฯ) — ลำดับสำคัญ: จัดให้คู่ติดกันผ่าน
   ตัวตรวจ CVD (4 ตัวแรกผ่านทุกข้อ · 5-6 ยอมรับ WARN โดยมี legend เป็น relief)
   เกิน 6 ค่าให้วนซ้ำที่ผู้เรียก (i % length) — อย่าเติมสีที่ 7 เพิ่มโดยไม่ผ่าน
   validator ทั้งสองธีมก่อน */
export const CHART_CATEGORICAL = Object.freeze([
  "var(--chart-cat-1)",
  "var(--chart-cat-2)",
  "var(--chart-cat-3)",
  "var(--chart-cat-4)",
  "var(--chart-cat-5)",
  "var(--chart-cat-6)",
]);

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
