import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const CHART_CSS = src("./ChartCard.module.css");
const PREVIEW = src("../../app/settings/design-preview/page.js");

/* ของจริงที่เคยเกิด (2026-07-27): `.canvas :global(.recharts-wrapper) { max-width: 100% }`
   ทำให้กราฟทุกตัวที่ห่อด้วย ChartCanvas หายทั้งอัน — ResponsiveContainer ของ Recharts 3
   วางกราฟไว้ในกล่องวัดขนาดที่ inline เป็น width:0 พอ 100% คิดจากกล่องนั้นจึงเหลือ 0
   เห็นแค่คำอธิบายสี (legend เป็น HTML) ลอยอยู่ในพื้นที่ว่าง */
test("ChartCanvas ต้องไม่บีบความกว้างของ recharts-wrapper", () => {
  const wrapperRules = CHART_CSS
    .replace(/\/\*[\s\S]*?\*\//g, "")   // คอมเมนต์อธิบายกฎนี้เอง ไม่ใช่ selector
    .split("}")
    .filter((block) => /\.recharts-wrapper/.test(block));
  for (const block of wrapperRules) {
    assert.doesNotMatch(block, /max-width/, "recharts-wrapper ห้ามมี max-width");
    assert.doesNotMatch(block, /\bwidth\s*:/, "recharts-wrapper ห้ามถูกกำหนดความกว้างทับ");
  }
});

test("หน้าต้นแบบมีกราฟให้ดูด้วยตา", () => {
  assert.match(PREVIEW, /<ChartCanvas>/);
  assert.match(PREVIEW, /ResponsiveContainer/);
});

/* ของจริงที่เคยเกิด: ครึ่งหนึ่งของตารางในระบบวาง TableScroll เปล่า ๆ ไม่มีการ์ดครอบ
   พอ primitive กลางไม่ให้พื้นเอง ตารางจึงลอยอยู่บนพื้นหน้าไม่มีพื้นรอง
   (ผู้ใช้รายงานหน้าขอราคาผลิต/วัสดุ "พื้นตารางหายไป" 2026-07-27) */
test("TableScroll เป็นพื้นข้อมูลเองเมื่อไม่ได้อยู่ในการ์ด", () => {
  const TABLE = src("./Table.js");
  const TABLE_CSS = src("./Table.module.css");
  assert.match(TABLE, /surface = "auto"/);
  assert.match(TABLE, /data-surface=\{surface\}/);
  // TableShell มีการ์ดของตัวเองแล้ว ข้างในต้องไม่มีกรอบซ้อน
  assert.match(TABLE, /<TableScroll family=\{family\} surface="embedded"/);
  assert.match(TABLE_CSS, /\[data-surface="auto"\][\s\S]{0,200}background: var\(--panel\)/);
});
