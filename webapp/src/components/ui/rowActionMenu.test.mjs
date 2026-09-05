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

/* ⭐ **เหตุผลที่กดไม่ได้ต้องเป็นตัวหนังสือ ไม่ใช่ tooltip** (กติกาของระบบ)
   🐞 ของเดิมใส่ `disabledReason` ไว้ใน `title` อย่างเดียว ⇒ เห็นได้เฉพาะเมาส์ที่
      ค้างไว้ · จอสัมผัสและคนที่ใช้คีย์บอร์ดไม่มีทางรู้ว่าทำไมกดไม่ลง
      (เจอตอนทำปุ่มลบรุ่นเครื่อง 2026-09-06) */
test("รายการที่กดไม่ได้ต้องบอกเหตุเป็นตัวหนังสือ ไม่ใช่แค่ tooltip", () => {
  assert.match(MENU, /itemReason/, "ต้องเรนเดอร์ disabledReason ออกมาเป็นข้อความจริง");
  assert.match(MENU, /item\.disabled && item\.disabledReason/,
    "โชว์เฉพาะตอนกดไม่ได้ — ปุ่มที่กดได้ไม่ต้องมีบรรทัดอธิบาย");
  assert.match(MENU_CSS, /\.itemReason\s*\{/, "ต้องมีคลาสจริงใน CSS module ไม่ใช่คลาสผี");
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

/* `extraItems` = ทางไปหน้าอื่นที่ lifecycle ไม่รู้จัก (ไทม์ไลน์ / ใบเสนอราคา / โครงการ)
   หน้าดีลยุบ 4 คอลัมน์เดิมมาไว้ตรงนี้ */
test("รายการที่มี href ต้องเป็น <Link> จริง ไม่ใช่ปุ่มที่ router.push", () => {
  const MENU = readFileSync(path.join(process.cwd(), "src", "components", "ui", "RowActionMenu.js"), "utf8");
  assert.match(MENU, /item\.href \?/, "ต้องแยกทางเรนเดอร์ตาม href");
  assert.match(MENU, /<Link\b[\s\S]{0,200}role="menuitem"/,
    "รายการที่เป็นลิงก์ต้องใช้ next/link — ไม่งั้นเปิดแท็บใหม่/คัดลอกลิงก์ไม่ได้");
  // ตัดคอมเมนต์ทิ้งก่อนสแกน — ตัวคอมเมนต์เองพูดถึงท่าที่ห้ามใช้อยู่
  const code = MENU.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/router\.push/.test(code), "ห้ามใช้ router.push แทนลิงก์");
});

test("extraItems มาก่อนกลุ่ม action และมีเส้นคั่น", () => {
  const RECORD = readFileSync(path.join(process.cwd(), "src", "components", "ui", "RecordActionMenu.js"), "utf8");
  assert.match(RECORD, /const navItems = extraItems/);
  const items = RECORD.slice(RECORD.indexOf("const items = ["));
  assert.ok(items.indexOf("...navItems") < items.indexOf("rest.filter"),
    "ทางไปหน้าอื่นต้องอยู่บนสุดของเมนู");
  assert.match(RECORD, /separatorBefore: index === 0 && navItems\.length > 0/,
    "ต้องมีเส้นคั่นแยกทางไปหน้าอื่น ออกจาก action ที่เปลี่ยนข้อมูล");
});
