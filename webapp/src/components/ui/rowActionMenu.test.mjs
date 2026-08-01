import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineLifecycle, ROW_TONES } from "@/lib/recordLifecycle";

/* เมนู "…" ท้ายแถว — มติผู้ใช้ 2026-08-01 แทนที่มติข้อ 2 เดิม
   แถวเหลือ: ปุ่มก้าวถัดไป 1 ปุ่ม (มีสีตามขั้น) + เมนูรวมที่เหลือ
   ที่มา: เอาปุ่มทั้งหมดมาเรียงในแถว (ของเดิม ≈345px) บีบคอลัมน์อื่นจนอ่านไม่ออก
   แต่ตัดทิ้งไปไว้หน้ารายละเอียดอย่างเดียว (#870) ก็ทำให้คิวจริงทำงานไม่ได้ */

const read = (...parts) => readFileSync(path.join(process.cwd(), ...parts), "utf8");
const MENU = read("src", "components", "ui", "RowActionMenu.js");
const MENU_CSS = read("src", "components", "ui", "RowActionMenu.module.css");
const RECORD = read("src", "components", "ui", "RecordActionMenu.js");
const RECORD_CSS = read("src", "components", "ui", "RecordActionMenu.module.css");

test("เมนูต้องเปิดผ่าน portal — ไม่งั้นโดนกรอบตารางตัดหาย", () => {
  assert.match(MENU, /createPortal/,
    "วางเมนูเป็น absolute ในแถวจะโดน overflow ของ TableScroll ตัดทิ้ง");
  assert.match(MENU, /position: "fixed"/);
  assert.match(MENU, /--z-portal-menu/, "ชั้นซ้อนต้องหยิบจากโทเคน ห้ามคิดเลขเอง");
});

test("แผงลอยต้องทึบ ใช้สูตรเดียวกับแผงอื่นของระบบ", () => {
  assert.match(MENU_CSS, /background:\s*var\(--panel-float\)/,
    "แผงโปร่งทำให้ตัวอักษรข้างหลังทะลุขึ้นมาปนกับรายการ (#756)");
  assert.match(MENU_CSS, /box-shadow:\s*var\(--shadow-float\)/);
});

test("เมนูมี ARIA ครบและปิดด้วย Escape ได้", () => {
  assert.match(MENU, /role="menu"/);
  assert.match(MENU, /role="menuitem"/);
  assert.match(MENU, /aria-haspopup="menu"/);
  assert.match(MENU, /aria-expanded=/);
  assert.match(MENU, /Escape/);
  assert.match(MENU, /ArrowDown|ArrowUp/, "เมนูควรเลื่อนด้วยลูกศรได้");
});

test("สีปุ่มก้าวถัดไปมาจากคลาสใน CSS module ไม่ใช่ inline style", () => {
  assert.ok(!/--btn-bg/.test(RECORD),
    "ห้ามเขียน --btn-bg ในคอมโพเนนต์ — ของเดิมทำแบบนั้น 7 จุดในหน้าเพจ");
  assert.ok(!/style=\{\{/.test(RECORD),
    "RecordActionMenu ต้องไม่มี inline style เลย");
  for (const tone of ROW_TONES) {
    assert.ok(RECORD_CSS.includes(`.tone-${tone} {`),
      `CSS ขาดคลาสของโทน ${tone} — ประกาศใน ROW_TONES แล้วต้องมีสีจริง`);
  }
});

test("ทุกโทนใช้โทเคนสี ไม่ใช่ค่าดิบ", () => {
  const toneRules = MENU_CSS + RECORD_CSS;
  const raw = toneRules.match(/\.tone-[a-z]+\s*\{[^}]*background:\s*(#|rgb|hsl)[^;]*/g) || [];
  assert.deepEqual(raw, [], `โทนที่ใช้สีดิบ: ${raw.join(" · ")}`);
});

test("rowTone ที่ไม่มีในลิสต์ต้องตกตอนประกาศ ไม่ใช่เงียบแล้วได้ปุ่มไม่มีสี", () => {
  const build = (rowTone) => defineLifecycle({
    entity: "t", noun: "ทดสอบ",
    statuses: { a: { label: "A" } },
    transitions: [{ id: "go", label: "ไป", kind: "submit", from: ["a"], to: "a", rowTone }],
  });
  assert.doesNotThrow(() => build("teal"));
  assert.throws(() => build("hotpink"), /rowTone/);
  assert.equal(build(undefined).transitions[0].rowTone, "navy", "ไม่ระบุ = navy");
});

test("available() ส่ง rowTone ต่อให้แถว", () => {
  const lifecycle = defineLifecycle({
    entity: "t", noun: "ทดสอบ",
    statuses: { a: { label: "A" } },
    transitions: [{ id: "go", label: "ไป", kind: "submit", slot: "primary", from: ["a"], to: "a", rowTone: "green" }],
  });
  const entry = lifecycle.available({ status: "a" }, {}).find((e) => e.id === "go");
  assert.equal(entry.rowTone, "green");
});

/* แถวต้องอ่านเป็นคอลัมน์ — ช่องปุ่มกว้างคงที่รวมแถวที่ไม่มีปุ่ม */
test("ช่องปุ่มก้าวถัดไปกว้างคงที่ และแถวห้ามตัดบรรทัด", () => {
  assert.match(RECORD_CSS, /flex-wrap:\s*nowrap/);
  assert.match(RECORD_CSS, /--record-step-w:/);
  assert.match(RECORD_CSS, /width:\s*var\(--record-step-w\)/);
});
