import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineLifecycle, normalizeSlots } from "@/lib/recordLifecycle";

/* `extraActions` = action ที่ **ไม่ใช่การย้ายสถานะ** (แก้ไข/ลบ) บนการ์ดเดียวกับ
   ปุ่มเดินหน้า — มติผู้ใช้ 2026-08-01 ว่า "การควบคุมคือการควบคุม" แยกด้วย *ช่อง*
   ไม่ใช่แยกไปคนละที่

   ที่มา: รอบแรกวางปุ่มลบไว้ที่ `footer` และปล่อยแก้ไขไว้หัวหน้า → ผู้ใช้ต้องเรียนรู้
   สองที่ · ตรวจแล้วพบว่าหน้าเอกสาร **6 จาก 7 หน้า** วางแก้ไข (secondary) และลบ
   (danger) ไว้บนการ์ดอยู่แล้ว มีแต่หน้าทะเบียนภาษีที่ใช้ไอคอนหัวหน้า */

const CARD_SRC = readFileSync(
  path.join(process.cwd(), "src", "components", "ui", "RecordControlCard.js"),
  "utf8",
);
const LEAD_PAGE = readFileSync(
  path.join(process.cwd(), "src", "app", "sales-planning", "leads", "[id]", "page.js"),
  "utf8",
);

const demo = defineLifecycle({
  entity: "demo",
  noun: "รายการ",
  statuses: { open: { label: "เปิด", tone: "info" } },
  steps: [{ id: "s1", label: "ขั้นเดียว", statuses: ["open"] }],
  transitions: [
    { id: "go", label: "ไปต่อ", kind: "submit", slot: "primary", from: "open", to: "open" },
  ],
});

/* จำลองการรวมที่การ์ดทำ — ถ้าตรรกะในการ์ดเปลี่ยน เทสต์ข้างล่างที่อ่านซอร์สจะจับได้ */
const merge = (entries, extras) =>
  normalizeSlots([
    ...entries,
    ...extras.filter((a) => a && a.visible !== false).map((a) => ({ ...a, slot: a.slot || "secondary" })),
  ]);

test("extraActions ที่ visible=false ต้องไม่โผล่", () => {
  const merged = merge(demo.available({ status: "open" }, {}), [
    { id: "edit", label: "แก้ไข", slot: "secondary", visible: false },
    { id: "delete", label: "ลบ", slot: "danger", visible: true },
  ]);
  assert.deepEqual(merged.map((a) => a.id), ["go", "delete"]);
});

/* ไม่ระบุ visible = โชว์ (ไม่ใช่ซ่อน) — พลาดทางนี้แล้วปุ่มหายเงียบ */
test("ไม่ระบุ visible ถือว่าโชว์", () => {
  const merged = merge([], [{ id: "edit", label: "แก้ไข" }]);
  assert.deepEqual(merged.map((a) => a.id), ["edit"]);
});

test("ไม่ระบุ slot ตกไปเป็น secondary ไม่ใช่ primary", () => {
  const merged = merge([], [{ id: "edit", label: "แก้ไข" }]);
  assert.equal(merged[0].slot, "secondary",
    "ค่าเริ่มต้นต้องไม่แย่งช่องปุ่มหลักจากก้าวถัดไป");
});

/* กติกา "primary ได้ตัวเดียว" ต้องคุมทั้งชุดหลังรวม ไม่ใช่แค่ฝั่ง transition */
test("extraActions slot=primary ไม่ทำให้เกิดปุ่มหลักสองปุ่ม", () => {
  const merged = merge(demo.available({ status: "open" }, {}), [
    { id: "edit", label: "แก้ไข", slot: "primary" },
  ]);
  const primaries = merged.filter((a) => a.slot === "primary");
  assert.equal(primaries.length, 1, "ต้องเหลือปุ่มหลักตัวเดียว");
  assert.equal(primaries[0].id, "go", "ก้าวถัดไปต้องได้ช่องหลักก่อน extraActions");
});

test("การ์ดรวม extraActions เข้ากับ transition จริง ไม่ได้แค่ต่อท้าย", () => {
  assert.match(CARD_SRC, /normalizeSlots\(\[[\s\S]{0,200}\.\.\.entries,[\s\S]{0,200}extraActions/,
    "ต้องรวมสองแหล่งแล้วค่อย normalizeSlots ไม่งั้นกติกาปุ่มหลักหลุด");
  assert.match(CARD_SRC, /const inSlot = \(slot\)/);
  assert.doesNotMatch(CARD_SRC, /entries\.filter\(\(entry\) => entry\.slot ===/,
    "ยังกรองจาก entries ตรง ๆ อยู่ — extraActions จะไม่ถูกแสดง");
});

/* extraActions มีกล่องยืนยันของตัวเอง (confirmAction) หรือเป็นการสลับโหมด
   ถ้าเผลอส่งไปเปิด TransitionDialog จะได้กล่องเปล่าที่ไม่มี transition */
test("extraActions กด onClick ตรง ๆ ไม่เปิด TransitionDialog", () => {
  assert.match(CARD_SRC, /onClick: entry\.onClick \|\|/,
    "ต้องใช้ onClick ของ action เองก่อน แล้วค่อย fallback ไปเปิดกล่อง");
});

/* ── หน้าลีดต้องใช้จริง ไม่ใช่มีของแล้วไม่ต่อ ───────────────────────── */

test("หน้าลีดส่งแก้ไข/ลบ ผ่าน extraActions ไม่ใช่ footer หรือหัวหน้า", () => {
  assert.match(LEAD_PAGE, /extraActions=\{recordActions\}/);
  assert.match(LEAD_PAGE, /id: "edit",[\s\S]{0,200}slot: "secondary"/,
    "แก้ไขต้องอยู่ช่อง secondary");
  assert.match(LEAD_PAGE, /id: "delete",[\s\S]{0,200}slot: "danger"/,
    "ลบต้องอยู่ช่อง danger");
  assert.doesNotMatch(LEAD_PAGE, /footer=\{lead\.canDelete/,
    "ปุ่มลบต้องไม่กลับไปอยู่ footer");
});

/* ปุ่มยกเลิก/บันทึกตอนแก้ไข ยังต้องอยู่หัวหน้า — ใกล้ช่องที่กำลังพิมพ์
   (ถ้าย้ายลงการ์ดด้วย ผู้ใช้ต้องเลื่อนตาไปอีกฝั่งเพื่อกดบันทึก) */
test("ตอนแก้ไข ปุ่มยกเลิก/บันทึกยังอยู่หัวหน้า", () => {
  assert.match(LEAD_PAGE, /const backActions = editing \? \(/,
    "หัวหน้าต้องมีปุ่มเฉพาะตอน editing");
  assert.match(LEAD_PAGE, /backActions[\s\S]{0,400}กำลังบันทึก/);
});

/* 🪤 id ที่ชนกับ transition = React key ซ้ำในช่องเดียวกัน → ปุ่มหนึ่งหายเงียบ ๆ
   (DocumentControlPanel ใช้ `key={action.id}`) — เจอจริงที่หน้าต้นแบบหลัง #866 */
test("extraActions ที่ id ชนกับ transition ถูกทิ้ง — lifecycle เป็นเจ้าของ id", () => {
  assert.match(CARD_SRC, /takenIds/,
    "การ์ดต้องกันไม่ให้ extraActions ใช้ id ซ้ำกับ transition");
  assert.match(CARD_SRC, /!takenIds\.has\(action\.id\)/,
    "ตัวกรอง extraActions ต้องเช็ค id ที่ transition จองไว้แล้ว");
});

test("หน้าต้นแบบต้องไม่สาธิตการใช้ id ที่ชนกันเอง", () => {
  const PREVIEW = readFileSync(
    path.join(process.cwd(), "src", "app", "settings", "design-preview", "page.js"),
    "utf8",
  );
  const block = PREVIEW.slice(PREVIEW.indexOf("extraActions={["));
  const extraIds = [...block.slice(0, block.indexOf("]}")).matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(extraIds.length >= 2, "หน้าต้นแบบต้องยังสาธิต extraActions อยู่");
  for (const id of extraIds) {
    assert.ok(!PREVIEW.includes(`{ id: "${id}", label:`),
      `id "${id}" ของ extraActions ชนกับ transition ใน lifecycle ตัวอย่าง — การ์ดจะทิ้งตัวนี้`);
  }
});
