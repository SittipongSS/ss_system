import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { metricValueLen } from "./metricValueLen.js";

/* ยอดเงินบนการ์ดสรุป (`Metric` · `.ui-metric strong`) ต้องไม่ถูกตัดด้วย "…"
   🐞 /finance/payments จอ 390 (27/10/2026): "เก็บได้แล้ว ฿10,648,762.…" · "ค้างรับทั้งหมด ฿27,934,367.…"
      ช่อง 2 คอลัมน์เหลือที่ให้ตัวเลข ~111px แต่ค่ายาว 14 ตัวอักษรที่ขั้นเดิม (fs-10) กิน ~121px
   ⇒ ตัวเลขย่อตามความกว้างจริงของกล่องข้อความ (สูตรเดียวกับ `.ui-kpi-value` · kpiCardFit.test.mjs)
   ⚠️ ความยาวส่งเป็น `data-len` ไม่ใช่ inline style — งบ inline style ของ "ส่วนกลาง" รูดขึ้นไม่ได้ */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const GLOBALS = read("../../app/globals.css");
const WORKSPACE = read("../../components/ui/Workspace.js");

const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");

/** body ของทุกบล็อกที่ selector ตรงเป๊ะ (รวมใน media query) */
function ruleBodies(css, selector) {
  const out = [];
  for (const chunk of stripComments(css).split("}")) {
    const open = chunk.lastIndexOf("{");
    if (open === -1) continue;
    const head = chunk.slice(0, open).split("\n").filter(Boolean).pop()?.trim();
    if (head === selector) out.push(chunk.slice(open + 1));
  }
  return out;
}

test("metricValueLen: ค่าสั้นไม่ส่ง · ค่ายาวส่งความยาว · เพดาน 18 · ไม่ใช่ข้อความ/ตัวเลขไม่ส่ง", () => {
  assert.equal(metricValueLen("158 งวด"), undefined);
  assert.equal(metricValueLen("฿1,234.00"), "9");
  assert.equal(metricValueLen("฿10,648,762.00"), "14");
  assert.equal(metricValueLen("฿1,234,567,890,123.00"), "18");
  assert.equal(metricValueLen(123456789), "9");
  assert.equal(metricValueLen(null), undefined);
  assert.equal(metricValueLen({ type: "span" }), undefined);
});

test("Metric ส่ง data-len บนตัวเลข ไม่ใช่ inline style", () => {
  const code = stripComments(WORKSPACE);
  assert.match(code, /<strong data-len=\{metricValueLen\(shown\)\}>\{shown\}<\/strong>/);
  assert.doesNotMatch(code, /"--metric-len"/, "ห้ามส่งความยาวผ่าน style — ใช้ data-len");
});

test("⭐ ตัวเลขบนการ์ดคิดขนาดจากความกว้างกล่องข้อความ ÷ ความยาวค่า · ปลายบนเท่าขั้นเดิมของแต่ละจอ", () => {
  const [strong] = ruleBodies(GLOBALS, ".ui-metric strong");
  assert.ok(strong, "ไม่พบกฎ .ui-metric strong");
  const fontSize = strong.match(/font-size:\s*([^;]+);/);
  assert.ok(fontSize, "ไม่พบ font-size ของ .ui-metric strong");
  assert.match(fontSize[1], /^clamp\(\s*var\(--fs-4\)/, "ปลายล่างต้องเป็นโทเคนขั้นพิมพ์");
  assert.match(fontSize[1], /100cqi\s*\/\s*\(var\(--metric-len,\s*8\)\s*\*\s*0\.54\)/, "ต้องหารความกว้าง container ด้วยความยาวค่า");
  assert.match(fontSize[1], /var\(--metric-value-fs,\s*var\(--fs-11\)\)\s*\)$/, "ปลายบน = ขั้นเดิม (fs-11) — ค่าสั้นหน้าตาเท่าเดิม");

  const [box] = ruleBodies(GLOBALS, ".ui-metric > span:not(.ui-metric-icon)");
  assert.ok(box, "กล่องข้อความต้องเป็น container");
  assert.match(box, /container-type:\s*inline-size/);
  assert.match(box, /flex:\s*1 1 0/, "กล่องข้อความต้องกินที่ที่เหลือ — container ไม่มีขนาดจากเนื้อในแล้ว");

  for (let len = 9; len <= 18; len += 1) {
    const [rule] = ruleBodies(GLOBALS, `.ui-metric strong[data-len="${len}"]`);
    assert.ok(rule && new RegExp(`--metric-len:\\s*${len};`).test(rule), `ไม่มีขั้น data-len="${len}"`);
  }
});

test("จอแคบปรับปลายบนผ่าน --metric-value-fs ไม่ใช่ทับ font-size ตายตัว (ไม่งั้นการย่อหายบนมือถือ)", () => {
  const css = stripComments(GLOBALS);
  assert.doesNotMatch(css, /\.ui-metric strong\s*\{\s*font-size:\s*var\(--fs-10\)/, "font-size ตายตัวบนมือถือทับสูตรย่อ");
  const mobile = ruleBodies(GLOBALS, ".ui-metric").filter((body) => /--metric-value-fs/.test(body));
  assert.ok(mobile.some((body) => /--metric-value-fs:\s*var\(--fs-10\)/.test(body)), "จอ ≤640 ต้องคงขั้น fs-10 เป็นปลายบน");
});
