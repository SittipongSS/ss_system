import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { resolve } from "./cssCascade.mjs";

/* ── มุมของตารางตรึงสองแกน + แถวรวมที่ตรึงล่าง (2026-09-12) ──────────────────
   🐞 ผู้ใช้ส่งภาพแท็บผลงานขาย: เลื่อนตารางลงแล้ว "ชื่อพนักงาน + ทีม" ของแถวที่ผ่าน
   หัวตารางไปแล้ว **ลอยทับช่องหัว "พนักงาน / ทีม"** (หัวอ่านได้เป็นคำว่า "KA")
   และป้าย "รวมทั้งบริษัท" ลอยติดขอบล่าง ห่างจากตัวเลขแถวตัวเองถึง 155px (วัดจริง)

   ต้นเหตุทั้งคู่คือ **กฎทับกันข้ามไฟล์** ไม่ใช่ค่าที่พิมพ์ผิด:
   · `.scroll[data-family="matrix"] th:first-child` (0,3,1 — `:first-child` นับรวมกับ
     คลาส) ชนะ `.scroll[data-family] thead th` (0,2,2) ⇒ เซลล์มุมเหลือ z-index 2
     เท่าคอลัมน์แรกของ body ⇒ เสมอแล้วแพ้ด้วยลำดับ DOM
   · เซลล์แรกของแถวรวมมีสองคลาส (`fz-c1 fz-foot`) กฎหนึ่งปิด `position` อีกกฎเปิดคืน
     ⇒ `bottom: 0` ที่ประกาศไว้กับ `.fz-foot` กลับมามีผลเฉพาะเซลล์นั้นเซลล์เดียว

   ⚠️ ด่านนี้จึง **แก้ cascade จริง** (cssCascade.mjs) ไม่ใช่ค้นข้อความ — ด่านหาข้อความ
   เขียวได้ทั้งที่ของจริงพัง (ประกาศซ้ำท้ายไฟล์ · ห่อ @media · เปลี่ยนวิธีสะกด selector) */

const WEBAPP = process.cwd();
const read = (p) => fs.readFileSync(path.join(WEBAPP, p), "utf8");
const SOURCES = [
  // ลำดับการโหลดจริง: globals ก่อน แล้ว CSS module
  { name: "globals.css", css: read("src/app/globals.css") },
  { name: "Table.module.css", css: read("src/components/ui/Table.module.css") },
];
const PROPS = ["z-index", "position", "bottom", "left", "background"];
const zOf = (won) => Number(won["z-index"]?.value);

const box = (family, extra = []) => ({
  tag: "div",
  classes: ["scroll", "premium-glass-table", ...extra, "fz-box"],
  attrs: { "data-family": family },
});
const cell = (family, extra, section, node) => [
  box(family, extra),
  { tag: "table", classes: ["fz-table"] },
  { tag: section, classes: [] },
  { tag: "tr", classes: ["premium-row"] },
  node,
];
const won = (chain, options) => resolve(SOURCES, chain, PROPS, options);

/* ตารางจริงสามทรงที่มีอยู่ในแอป — ชื่อคลาสต่างกัน แต่กติกามุมต้องเหมือนกันทุกใบ */
const SHAPES = [
  {
    name: "บอร์ดเช้า (matrix + fz-c1)",
    head: cell("matrix", ["performance-tracking-table"], "thead", { tag: "th", classes: ["fz-c1"], firstChild: true }),
    column: cell("matrix", ["performance-tracking-table"], "tbody", { tag: "td", classes: ["fz-c1"], firstChild: true }),
    headRow: cell("matrix", ["performance-tracking-table"], "thead", { tag: "th", classes: ["num"] }),
  },
  {
    name: "heatmap ทั้งปี (matrix + fz-heatmap)",
    head: cell("matrix", ["fz-heatmap"], "thead", { tag: "th", classes: ["fz-c1"], firstChild: true }),
    column: cell("matrix", ["fz-heatmap"], "tbody", { tag: "td", classes: ["fz-c1"], firstChild: true }),
    headRow: cell("matrix", ["fz-heatmap"], "thead", { tag: "th", classes: ["num"] }),
  },
  {
    /* 🪤 กริดวางเป้า /sa/targets ประกาศ `family="editable"` ไม่ใช่ "matrix" — กฎมุมของ
       Table.module.css เอื้อมไม่ถึง ต้องอาศัยกฎมุมใน globals ที่เขียน `th.`/`td.` ครบ */
    name: "กริดวางเป้า (editable + fz-c1)",
    head: cell("editable", [], "thead", { tag: "th", classes: ["fz-c1"], firstChild: true }),
    column: cell("editable", [], "tbody", { tag: "td", classes: ["fz-c1"], firstChild: true }),
    headRow: cell("editable", [], "thead", { tag: "th", classes: ["num"] }),
  },
  {
    /* ตารางตระกูลนี้หลายใบไม่ใช้คลาส fz-* เลย (ตรึงคอลัมน์แรกจาก td:first-child) */
    name: "matrix ที่ไม่ใช้คลาส fz-* (เช่น กระดานผลิต)",
    head: cell("matrix", [], "thead", { tag: "th", classes: [], firstChild: true }),
    column: cell("matrix", [], "tbody", { tag: "td", classes: [], firstChild: true }),
    headRow: cell("matrix", [], "thead", { tag: "th", classes: ["num"] }),
  },
];

for (const shape of SHAPES) {
  test(`${shape.name} — มุมซ้ายบนต้องอยู่เหนือคอลัมน์ที่ตรึงและเหนือหัวตาราง`, () => {
    const corner = won(shape.head);
    const column = won(shape.column);
    const header = won(shape.headRow);
    assert.equal(corner.position?.value, "sticky", "มุมต้องตรึง");
    assert.ok(Number.isFinite(zOf(corner)), "มุมต้องมี z-index ที่ระบุชัด");
    assert.ok(zOf(corner) > zOf(column),
      `มุม (${zOf(corner)} @${corner["z-index"].from}) ต้องสูงกว่าคอลัมน์ที่ตรึง (${zOf(column)} @${column["z-index"].from}) — เสมอกันเมื่อไรแถวใน body ที่มาทีหลังจะทับหัวตาราง`);
    assert.ok(zOf(corner) >= zOf(header),
      `มุม (${zOf(corner)}) ต้องไม่ต่ำกว่าหัวตาราง (${zOf(header)} @${header["z-index"]?.from})`);
    // ค่าที่ชนะต้องไม่ได้มาจากกฎที่มีเงื่อนไข (@media/@supports) — ไม่งั้นปิดได้ทั้งช่วงจอ
    assert.equal(corner["z-index"].conditional, false, "ค่ามุมต้องไม่ขึ้นกับ @media");
  });
}

/* ── แถวรวมต้องตรึง "ทั้งแถว" ─────────────────────────────────────────────
   ตรงนี้คือหัวใจของบั๊กที่สอง: ป้ายกับตัวเลขต้องได้ position/bottom ชุดเดียวกันเสมอ
   ไม่ว่ามติจะให้ตรึงหรือไม่ตรึง (ตรึงครึ่งแถว = ป้ายลอยหนีแถวตัวเอง) */
const FOOT_SHAPES = [
  ["บอร์ดเช้า", ["performance-tracking-table"]],
  ["heatmap ทั้งปี", ["fz-heatmap"]],
];
for (const [name, extra] of FOOT_SHAPES) {
  test(`${name} — แถวรวมตรึงพร้อมกันทั้งแถว`, () => {
    const corner = won(cell("matrix", extra, "tfoot", { tag: "td", classes: ["fz-c1", "fz-foot"], firstChild: true }));
    const number = won(cell("matrix", extra, "tfoot", { tag: "td", classes: ["num", "mono", "fz-foot"] }));
    assert.equal(corner.position?.value, number.position?.value,
      `ป้ายกับตัวเลขของแถวรวมต้องตรึงแบบเดียวกัน (ป้าย ${corner.position?.value} @${corner.position?.from} · ตัวเลข ${number.position?.value} @${number.position?.from})`);
    assert.equal(corner.bottom?.value, number.bottom?.value,
      "ระยะตรึงล่างต้องเท่ากัน ไม่งั้นป้ายลอยหนีตัวเลขของแถวตัวเอง");
    assert.equal(corner.left?.value, "0", "ป้ายยังต้องตรึงซ้ายด้วย (คอลัมน์ชื่อ)");
    assert.ok(zOf(corner) > zOf(number), "มุมซ้ายล่างต้องอยู่เหนือเซลล์อื่นในแถวเดียวกัน");
    /* มติผู้ใช้ 2026-09-12: ให้ตรึงแถวรวมไว้ล่าง — ถ้ามติเปลี่ยนเป็น "ไม่ตรึง"
       แก้ทั้ง globals.css และบรรทัดนี้พร้อมกัน (ข้อบังคับจริงคือสองบรรทัดข้างบน) */
    assert.equal(number.position?.value, "sticky", "มติ 2026-09-12 ให้แถวรวมตรึงล่าง");
  });
}

test("พื้นของมุมต้องเป็นพื้นหัว/ท้ายตาราง ไม่ใช่พื้นของคอลัมน์", () => {
  for (const [name, extra] of FOOT_SHAPES) {
    const headCorner = won(cell("matrix", extra, "thead", { tag: "th", classes: ["fz-c1"], firstChild: true }));
    const headOther = won(cell("matrix", extra, "thead", { tag: "th", classes: ["num"] }));
    const footCorner = won(cell("matrix", extra, "tfoot", { tag: "td", classes: ["fz-c1", "fz-foot"], firstChild: true }));
    const footOther = won(cell("matrix", extra, "tfoot", { tag: "td", classes: ["num", "mono", "fz-foot"] }));
    /* 🐞 กฎ `td:first-child` ทาสี --panel-solid (สีของคอลัมน์ที่ตรึงซ้าย) ทับกฎมุม
       ⇒ ช่องซ้ายบนเป็นบล็อกเข้มคนละสีกับหัวตารางที่เหลือ (ผู้ใช้ทักว่า "ตรึง แปลก") */
    assert.match(headCorner.background?.value || "", /--panel-2/, `${name}: มุมหัวต้องใช้สีหัวตาราง`);
    assert.match(footCorner.background?.value || "", /--panel-2/, `${name}: มุมท้ายต้องใช้สีแถวท้าย`);
    assert.equal(footCorner.background?.value, footOther.background?.value,
      `${name}: มุมท้ายต้องสีเดียวกับเซลล์อื่นในแถวรวม`);
    assert.match(headOther.background?.value || "", /--panel-2/, `${name}: หัวตารางต้องทึบด้วยสีเดียวกัน`);
  }
});

test("หน้าพิมพ์: ถอดกล่องเลื่อนแล้วต้องถอดการตรึงด้วย", () => {
  const css = read("src/app/globals.css");
  const print = css.match(/@media print \{[\s\S]*?\n\}/);
  assert.ok(print, "หา @media print ไม่เจอ");
  /* sticky ที่ไม่มี scrollport จะไปปักกับกล่องหน้ากระดาษแทน — แถวรวมทับแถวข้อมูล */
  assert.match(print[0], /\.fz-box\.fz-box \{[^}]*max-height:\s*none/, "บนกระดาษต้องไม่มีเพดานกล่อง");
  assert.match(print[0], /\.fz-table[^{]*\{[^}]*position:\s*static/, "บนกระดาษต้องถอด sticky ของตารางตรึง");
});

test("โฟกัสต้องไม่จอดใต้แถวที่ตรึง (WCAG 2.2 · 2.4.11)", () => {
  const body = won(cell("matrix", ["performance-tracking-table"], "tbody", { tag: "td", classes: ["num"] }), {});
  const css = read("src/app/globals.css");
  assert.match(css, /\.fz-table tbody td \{[\s\S]*?scroll-margin-bottom:/,
    "แถวรวมที่ตรึงล่างบังปุ่มที่เพิ่งได้โฟกัส — ต้องกันระยะด้วย scroll-margin");
  assert.ok(body.position === undefined || body.position.value !== "sticky", "เซลล์ในเนื้อตารางต้องไม่ตรึงเอง");
});

/* ── ผูกกับการใช้งานจริง ไม่ใช่แค่ชื่อคลาสใน CSS ────────────────────────── */
for (const [file, firstCell] of [
  ["src/components/salesPlanning/dashboard/performance/YearHeatmap.js", /<td className="fz-c1 fz-foot"/],
  ["src/components/salesPlanning/dashboard/performance/MorningBoard.js", /cellClass\("fz-c1"\)/],
]) {
  test(`${path.basename(file)} — แถวรวมอยู่ใน tfoot และเซลล์แรกเป็นมุม`, () => {
    const source = read(file);
    assert.match(source, /family="matrix"/, "ต้องเป็นตารางตระกูล matrix (กฎมุมผูกกับ data-family)");
    assert.match(source, /<tfoot>[\s\S]*?<\/tfoot>/, "แถวรวมต้องอยู่ใน <tfoot> (ตรึงล่างผ่าน .fz-foot)");
    assert.match(source, firstCell, "เซลล์แรกของแถวรวมต้องได้ทั้ง fz-c1 และ fz-foot");
    assert.match(source, /fz-foot/, "เซลล์ตัวเลขของแถวรวมต้องมี fz-foot ด้วย");
  });
}
