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
