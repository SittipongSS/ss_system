import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pickIntakeOwner } from "./useFileIntake.js";

/* ── ใครได้ไฟล์ที่วาง (Ctrl+V) เมื่อไม่มีอะไรโฟกัสอยู่ ──────────────────────
   ตรรกะนี้ตัดสินว่าไฟล์ไปโผล่ที่ไหน และปลายทางบางตัว (แผงเอกสารแนบ · แผงไฟล์
   ของงานบริหาร) **อัปขึ้น server ทันที** ⇒ เดาผิด = ไฟล์ไปอยู่ผิดที่จริง ๆ
   ไม่ใช่แค่ค้างในฟอร์มให้กดถอดออก · จึงต้องมีเทสต์ ไม่ใช่ "ลองแล้วดูเหมือนถูก" */

const zone = (over = {}) => ({ inDialog: false, weight: 0, ...over });

test("กล่องเดียวบนหน้า — ได้ไปเลย", () => {
  assert.equal(pickIntakeOwner([zone()]), 0);
});

test("ไม่มีกล่องเลย — ไม่มีเจ้าของ ไม่ใช่ index 0", () => {
  assert.equal(pickIntakeOwner([]), -1);
});

test("โมดัลชนะพื้นหลังเสมอ แม้พื้นหลังจะมาก่อนใน DOM", () => {
  const pool = [zone(), zone({ inDialog: true })];
  assert.equal(pickIntakeOwner(pool), 1);
});

/* 🐞 เคสจริงจากหน้ารายละเอียดลูกค้า (ตรวจในเบราว์เซอร์ 2026-08-12): มีกล่องรับไฟล์
   สองกล่อง — แผงเอกสารแนบ (weight 0) กับช่องพิมพ์ของเธรดอัปเดต (weight 1)
   ผู้ใช้ที่กด Ctrl+V ลอย ๆ หมายถึง "แนบเข้าเอกสาร" · ถ้าจะแปะลงแชท เคอร์เซอร์เขา
   อยู่ในช่องแชทอยู่แล้ว ซึ่งเป็นกติกาข้อแรก ไม่ผ่านมาถึงฟังก์ชันนี้ */
test("weight น้อยกว่าชนะ แม้จะอยู่หลังใน DOM", () => {
  const pool = [zone({ weight: 1 }), zone({ weight: 0 })];
  assert.equal(pickIntakeOwner(pool), 1);
});

test("weight เท่ากัน — ตัวแรกใน DOM ชนะ (หลายแถวในฟอร์มเดียว)", () => {
  const pool = [zone(), zone(), zone()];
  assert.equal(pickIntakeOwner(pool), 0);
});

test("ในโมดัลด้วยกันเอง ยังเทียบ weight ต่อ", () => {
  const pool = [zone(), zone({ inDialog: true, weight: 2 }), zone({ inDialog: true, weight: 1 })];
  assert.equal(pickIntakeOwner(pool), 2);
});

/* ── ทางเข้าไฟล์ต้องมีที่เดียว ──────────────────────────────────────────────
   🐞 ที่มา (IS-26080013): จุดแนบไฟล์ 13 จุดเขียน `<input type="file">` เอง ⇒ วางจาก
   คลิปบอร์ดได้ 2 จุด ลากได้ 2 จุด ที่เหลือกดปุ่มอย่างเดียว โดยไม่มีใครตั้งใจให้ต่างกัน
   กฎนี้กันไม่ให้จุดใหม่เขียน input ของตัวเองแล้วหลุดวงจรอีก */
const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ข้อยกเว้นที่ตั้งใจ — คนละงานกับ "แนบไฟล์เข้าระเบียน":
   · นำเข้าข้อมูล (.xlsx/.csv) = ไฟล์ถูกอ่านเป็นตาราง ไม่ได้ถูกเก็บเป็นเอกสารแนบ
   · ตัว primitive เองกับแผงที่ยังถือ input ของตัวเองเพราะเลือกประเภทเอกสารรายการ์ด
     (ทั้งสองผูก useFileIntake แล้ว — ลาก/วาง ทำงานครบ) */
const ALLOWED = new Set([
  "lib/ui/useFileIntake.js",
  "components/AttachmentsPanel.js",
  "components/updates/UpdateThread.js",
  "components/service/CloseVisitSheet.js",
  "components/sahamit/ForecastForm.js",
  "app/database/product-categories/import/page.js",
]);

test("จุดแนบไฟล์ใหม่ต้องผ่าน useFileIntake ไม่เขียน <input type=\"file\"> เอง", () => {
  const offenders = [];
  for (const file of walk(srcRoot)) {
    const rel = path.relative(srcRoot, file).replaceAll("\\", "/");
    if (!/\.(js|jsx)$/.test(rel) || ALLOWED.has(rel)) continue;
    const text = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
    if (/type="file"/.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "ใช้ ui/PendingFiles หรือ lib/ui/useFileIntake แทน");
});

test("จุดที่ยังถือ input เอง ต้องผูก useFileIntake ไว้จริง", () => {
  const mustWire = [
    "components/AttachmentsPanel.js",
    "components/updates/UpdateThread.js",
    "components/service/CloseVisitSheet.js",
  ];
  for (const rel of mustWire) {
    const text = readFileSync(path.join(srcRoot, rel), "utf8");
    assert.match(text, /useFileIntake\(/, `${rel}: ถือ input เองแต่ไม่ได้ผูกทางเข้าไฟล์กลาง`);
  }
});
