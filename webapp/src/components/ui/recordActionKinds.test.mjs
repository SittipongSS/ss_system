import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BACKWARD_KINDS } from "@/lib/recordLifecycle";

/* 🐞 บั๊กที่เทสต์นี้เกิดมาเพื่อกัน (ผู้ใช้ทักจากภาพจริง 2026-08-01):
   `bounce` / `disqualify` / `drop` / `revert` / `reopen` อยู่ใน BACKWARD_KINDS ของ
   recordLifecycle มาตั้งแต่ต้น แต่ **ไม่เคยมีในตาราง KINDS ของ ActionButtons**
   → `KINDS[kind]` เป็น undefined → ปุ่มออกมาไม่มีไอคอนและไม่มีสี **เงียบ ๆ**
   ในภาพจริง: "ตีกลับ" กับ "ไม่ไปต่อ" โล่งอยู่สองปุ่มในกลุ่มที่ปุ่มอื่นมีไอคอนครบ

   ⚠️ อ่าน ActionButtons.js เป็น *ข้อความ* ไม่ import — ไฟล์นั้นมี JSX รันใน node ไม่ได้ */

const read = (...p) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const KINDS_SRC = read("src", "components", "ui", "ActionButtons.js");
const MENU_SRC = read("src", "components", "ui", "RecordActionMenu.js");

/* แกะตาราง KINDS ออกมาเป็น { kind: {tone, Icon} } */
const KINDS = Object.fromEntries(
  [...KINDS_SRC.matchAll(/^ {2}([a-z]+): \{ tone: "([a-z]+)", Icon: (\w+), label: "([^"]*)" \},/gm)]
    .map((m) => [m[1], { tone: m[2], Icon: m[3], label: m[4] }]),
);

test("แกะตาราง KINDS ได้จริง (กันเทสต์เขียวเพราะ regex ไม่แมตช์อะไรเลย)", () => {
  assert.ok(Object.keys(KINDS).length >= 20, `แกะได้แค่ ${Object.keys(KINDS).length} kind — regex น่าจะพัง`);
  assert.equal(KINDS.approve?.tone, "primary");
});

test("ทุก kind ที่ lifecycle ถือว่าเป็นการถอยหลัง ต้องมีไอคอน+สีใน ActionButtons", () => {
  const missing = BACKWARD_KINDS.filter((kind) => !KINDS[kind]);
  assert.deepEqual(missing, [],
    `kind ที่ไม่มีในตาราง KINDS: ${missing.join(" · ")} — ปุ่มจะไม่มีไอคอนและไม่มีสี`);
  for (const kind of BACKWARD_KINDS) {
    assert.ok(KINDS[kind].Icon, `${kind} ต้องมีไอคอน`);
    assert.ok(KINDS[kind].label, `${kind} ต้องมีข้อความเริ่มต้น`);
  }
});

test("การถอยหลังไม่ได้แดงหมด — ไล่ระดับตามความรุนแรง", () => {
  assert.equal(KINDS.bounce.tone, "warning", "ตีกลับ = ส่งกลับต้นทาง ยังกู้ได้");
  assert.equal(KINDS.revert.tone, "warning", "ย้อนสถานะ = ยังกู้ได้");
  assert.equal(KINDS.disqualify.tone, "danger", "ไม่ไปต่อ = ปิดเส้นทาง");
  assert.equal(KINDS.drop.tone, "danger", "ยกเลิกดีล/โครงการ = ปิดเส้นทาง");
  assert.equal(KINDS.reopen.tone, "neutral", "เปิดใหม่ = ไม่ได้ทำลายอะไร");
});

/* เมนูกับการ์ดต้องพูดเรื่องเดียวกันเหมือนกัน — ไม่ใช่ต่างคนต่างทาสี */
test("เมนูในแถวหยิบไอคอน/สีจาก kind ไม่ใช่ทาเองตาม slot", () => {
  assert.match(MENU_SRC, /kindMeta\(/, "ต้องอ่านความหมายจาก ActionButtons");
  assert.ok(!/tone: "danger"/.test(MENU_SRC),
    'ห้ามฮาร์ดโค้ด tone: "danger" ตาม slot — เคยทำให้เมนูแดงแต่การ์ดเทาสำหรับ action เดียวกัน');
});

test("ทุกไอคอนที่ตารางอ้าง ต้อง import มาจริง", () => {
  const imported = (KINDS_SRC.match(/^import \{([\s\S]*?)\} from "lucide-react";/m)?.[1] || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  for (const [kind, meta] of Object.entries(KINDS)) {
    assert.ok(imported.includes(meta.Icon), `${kind} อ้างไอคอน ${meta.Icon} ที่ยังไม่ได้ import`);
  }
});

test("ตาราง KINDS ยังเป็นแหล่งเดียว — ห้ามมี kind ซ้ำ", () => {
  const ids = [...KINDS_SRC.matchAll(/^ {2}([a-z]+): \{ tone:/gm)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, `kind ซ้ำในตาราง: ${ids.join(" ")}`);
});
