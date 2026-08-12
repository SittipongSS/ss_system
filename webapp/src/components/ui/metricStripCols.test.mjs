import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* `MetricStrip` นับช่องเองแล้วส่งออกเป็น `data-cols` — ก่อนหน้านี้ผู้เรียกต้องส่ง
   `data-count` มาเอง ซึ่งเป็นตัวเลขคู่ขนานกับจำนวนลูกจริง (หน้าไหนลืมส่งหรือส่งไม่ตรง
   จะได้แถวกำพร้าเงียบ ๆ) · เทสต์นี้กันไม่ให้กลไกเก่ากลับมาอยู่คู่กับกลไกใหม่ */

const SRC = new URL("../../", import.meta.url).pathname;
const src = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

const WORKSPACE = src("components/ui/Workspace.js");
const GLOBALS = src("app/globals.css");

/** โค้ดล้วน ไม่เอาคอมเมนต์ — คอมเมนต์ที่อธิบายกฎเขียนชื่อของที่ *ห้ามใช้* ไว้ในตัว
 *  (`Children.count`) กฎห้ามจึงฟ้องคอมเมนต์ของตัวเองถ้าไม่ตัดทิ้งก่อน */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

test("MetricStrip นับลูกเองด้วย Children.toArray แล้วส่งออกเป็น data-cols", () => {
  const code = codeOnly(WORKSPACE);
  assert.match(code, /Children\.toArray\(children\)\.length/);
  assert.match(code, /data-cols=\{cols\}/);
  // count นับ null/false ที่มาจากการ์ดแบบมีเงื่อนไขด้วย ⇒ ได้คอลัมน์ว่างค้างไว้
  assert.doesNotMatch(code, /Children\.count/);
});

test("ไม่มีใครส่งจำนวนช่องมาเองแล้ว — กลไกคู่ขนานต้องไม่กลับมา", () => {
  const offenders = (function collect(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full, out);
      else if (/\.jsx?$/.test(entry.name) && /data-count/.test(fs.readFileSync(full, "utf8"))) {
        out.push(path.relative(SRC, full));
      }
    }
    return out;
  })(SRC);
  assert.deepEqual(offenders, [], "ใช้ data-cols ที่ MetricStrip นับให้เอง อย่าส่ง data-count มาเอง");
});

/* เอกสาร (UI_DESIGN_SYSTEM.md §Page contract ข้อ 2) สัญญาไว้ว่า "รองรับ 1–6"
   ถ้ากฎหายไปสักค่า แถบจำนวนนั้นจะตกไปใช้ค่าตั้งต้น 4 คอลัมน์เงียบ ๆ */
test("มีกฎคอลัมน์ครบ 1–6 และอยู่ใน min-width: 900 ตามที่คอมเมนต์อ้าง", () => {
  const block = GLOBALS.split("@media (min-width: 900px)")[1] ?? "";
  const head = block.slice(0, block.indexOf("}\n}") + 1);
  for (const n of [1, 2, 3, 5, 6]) {
    assert.match(head, new RegExp(`\\[data-cols="${n}"\\]`), `ขาดกฎของ ${n} ช่อง`);
  }
  // 4 คือค่าตั้งต้นของ .ui-metric-strip อยู่แล้ว จึงไม่ต้องมีกฎซ้ำ
  assert.match(GLOBALS, /\.ui-metric-strip\s*\{[^}]*grid-template-columns:\s*repeat\(4,/);
});

/* เส้นคั่นเป็น gap บนพื้นสีเส้น ไม่ใช่ border รายใบ — border รายใบต้องมีสูตร nth-child
   มาซ่อมทุกครั้งที่จำนวนช่องเปลี่ยนหรือแถบตัดบรรทัด ซึ่งไม่มีสูตรไหนถูกทุกจำนวน */
test("เส้นคั่นของแถบมาจาก gap ไม่ใช่ border ของช่อง", () => {
  const strip = GLOBALS.slice(GLOBALS.indexOf(".ui-metric-strip {"));
  assert.match(strip.slice(0, strip.indexOf("}")), /gap:\s*var\(--rule\)/);
  const metric = GLOBALS.slice(GLOBALS.indexOf("\n.ui-metric {"));
  assert.doesNotMatch(metric.slice(0, metric.indexOf("}")), /border-right/);
  assert.doesNotMatch(GLOBALS, /\.ui-metric:nth-child/);
});
