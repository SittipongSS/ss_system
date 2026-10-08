import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { intakeZoneAttrs, oversizeMessage, pasteClaim, pickIntakeOwner } from "./useFileIntake.js";

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

/* ── กล่อง `paste: "focused"` (รูปของแถว checklist ใบสเปค · 08/10/2569) ─────────
   หนึ่งกล่องต่อแถวตาราง = หลายสิบกล่องต่อหน้า และแต่ละกล่อง **อัปขึ้น server ทันที**
   ⇒ Ctrl+V ลอย ๆ ต้องไม่ไปลงแถวแรกเงียบ ๆ และต้องไม่แย่งแผงแนบไฟล์ตัวจริงของหน้า */
test("paste 'focused' — ไม่มีโฟกัสในกล่อง = ไม่รับ และไม่เข้าคิวเลย", () => {
  assert.equal(pasteClaim({ paste: "focused", focusedInside: false }), "skip");
  assert.equal(pasteClaim({ paste: "focused", focusedInside: false, foreignTextField: true }), "skip");
  // ผู้ใช้เจาะจงแล้ว (โฟกัสอยู่ที่ปุ่มของกล่องนั้น) = รับ
  assert.equal(pasteClaim({ paste: "focused", focusedInside: true }), "take");
});

test("โฟกัสอยู่ในกล่อง 'focused' ของแถว — กล่อง 'auto' ของหน้า (แผงภาพประกอบ) ต้องไม่รับไฟล์เดียวกันซ้ำ", () => {
  // ปุ่มแนบรูปของแถวไม่ใช่ช่องพิมพ์ ⇒ ถ้าไม่มีด่านนี้ กล่อง auto จะไปถามคิวแล้วชนะ = อัปสองที่จากการวางครั้งเดียว
  assert.equal(pasteClaim({ paste: "auto", focusedInside: false, focusedInFocusZone: true }), "skip");
  // กล่องเจ้าของเองยังรับ (โฟกัสอยู่ในตัวเอง)
  assert.equal(pasteClaim({ paste: "focused", focusedInside: true, focusedInFocusZone: true }), "take");
});

test("ค่าตั้งต้น 'auto' ยังเหมือนเดิม — โฟกัสในกล่อง = รับ · ช่องพิมพ์ของคนอื่น = ไม่แตะ · นอกนั้นไปถามคิว", () => {
  assert.equal(pasteClaim({ focusedInside: true }), "take");
  assert.equal(pasteClaim({ focusedInside: false, foreignTextField: true }), "skip");
  assert.equal(pasteClaim({ focusedInside: false }), "pool");
  assert.equal(pasteClaim(), "pool");
  assert.equal(pasteClaim({ paste: "auto", focusedInside: false }), "pool");
});

test("paste 'focused' ไม่ติดป้ายกล่องรับไฟล์ — ไม่อยู่ในคิว จึงไม่บังลำดับ weight ของกล่องอื่น", () => {
  assert.deepEqual(intakeZoneAttrs({ paste: "focused", weight: 0 }), { "data-file-intake-focus": "" });
  assert.deepEqual(intakeZoneAttrs({ weight: 1 }), { "data-file-intake": "", "data-file-intake-weight": "1" });
  assert.deepEqual(intakeZoneAttrs(), { "data-file-intake": "", "data-file-intake-weight": "0" });

  /* จำลองหน้า: 3 กล่องแถว (focused) มาก่อนใน DOM แล้วตามด้วยเธรด (weight 1) กับแผงเอกสาร (weight 0)
     คิว = element ที่ติดป้ายเท่านั้น ⇒ ผลต้องเท่ากับหน้าที่ไม่มีกล่องแถวเลย */
  const page = [
    { paste: "focused", weight: 0 }, { paste: "focused", weight: 0 }, { paste: "focused", weight: 0 },
    { paste: "auto", weight: 1 }, { paste: "auto", weight: 0 },
  ];
  const tagged = page.filter((z) => "data-file-intake" in intakeZoneAttrs(z));
  assert.equal(tagged.length, 2);
  const owner = tagged[pickIntakeOwner(tagged.map((z) => zone({ weight: z.weight })))];
  assert.equal(page.indexOf(owner), 4, "แผงเอกสาร (weight 0) ยังเป็นเจ้าของ");
  // หน้าที่มีแต่กล่องแถว = ไม่มีเจ้าของ paste ลอย ๆ เลย (ไม่ใช่แถวแรก)
  assert.equal(pickIntakeOwner(page.slice(0, 3).filter((z) => "data-file-intake" in intakeZoneAttrs(z))), -1);
});

test("ข้อความไฟล์ใหญ่เกินพิมพ์เพดานที่กล่องนั้นใช้จริง ไม่ใช่ 25 MB เสมอ", () => {
  assert.equal(oversizeMessage(5 * 1024 * 1024, ["a.png"]), "ไฟล์ใหญ่เกิน 5 MB: a.png");
  assert.equal(oversizeMessage(25 * 1024 * 1024, ["a.png", "b.pdf"]), "ไฟล์ใหญ่เกิน 25 MB: a.png, b.pdf");
  const hook = readFileSync(path.join(srcRoot, "lib/ui/useFileIntake.js"), "utf8");
  assert.match(hook, /warn\?\.\(oversizeMessage\(cap, /);
  assert.doesNotMatch(hook, /MAX_UPLOAD_MB/);
});

/* ── hook ต้องเรียกตัวตัดสินจริง ─────────────────────────────────────────────
   เทสต์ข้างบนคุมฟังก์ชันล้วน (`pasteClaim` · `intakeZoneAttrs` · `pickIntakeOwner`) — แต่ hook ฟัง document
   เรนเดอร์ใต้ Node ดิบไม่ได้ ⇒ สายที่ต่อฟังก์ชันพวกนั้นเข้า hook ต้องปักจากซอร์ส ไม่งั้นถอดสายแล้วทุกเทสต์ยังเขียว:
   · `zoneProps` กลับไปเขียนป้ายกล่องเอง ⇒ กล่องรูปของแถว (17–37 กล่อง · weight 0 · อยู่ก่อนใน DOM) เข้าคิว
     แถวแรกชนะแล้วตัวเองตอบ "skip" ⇒ Ctrl+V ลอย ๆ บนหน้าสเปคหายเงียบ (แผงภาพประกอบเคยรับได้)
   · ไม่ส่ง `focusedInFocusZone` ⇒ วางตอนโฟกัสอยู่ที่ปุ่มของแถว = ขึ้นทั้งแถวนั้นและแผงของหน้า */
test("hook ต่อสายเข้า pasteClaim / intakeZoneAttrs จริง — ป้ายกล่องเขียนที่เดียว · คิวมาจากป้ายเท่านั้น", () => {
  const hook = readFileSync(path.join(srcRoot, "lib/ui/useFileIntake.js"), "utf8");
  const count = (re) => (hook.match(re) || []).length;
  // ป้ายของกล่องมาจากฟังก์ชันล้วนตัวเดียว — ตัวอักษรป้ายแต่ละตัวถูกเขียนที่เดียวคือใน intakeZoneAttrs
  assert.equal(count(/\.\.\.intakeZoneAttrs\(\{ paste, weight \}\),/g), 1);
  assert.equal(count(/\[ZONE_ATTR\]: /g), 1);
  assert.equal(count(/\[WEIGHT_ATTR\]: /g), 1);
  assert.equal(count(/\[FOCUS_ZONE_ATTR\]: /g), 1);
  const zoneProps = hook.slice(hook.indexOf("const zoneProps = {"), hook.indexOf("\n  };", hook.indexOf("const zoneProps = {")));
  assert.match(zoneProps, /ref: zoneRef,/);
  assert.match(zoneProps, /\.\.\.intakeZoneAttrs\(\{ paste, weight \}\),/);
  assert.doesNotMatch(zoneProps, /_ATTR|data-file-intake/);
  // การตัดสินว่าใครได้ paste ผ่าน pasteClaim ด้วยข้อมูลครบสี่ตัว
  assert.equal(count(/pasteClaim\(\{/g), 2, "ประกาศหนึ่ง + เรียกใน hook หนึ่ง");
  assert.equal(count(/const claim = pasteClaim\(\{\s*paste,\s*focusedInside: zone\.contains\(active\),\s*foreignTextField: isForeignTextField\(active, zone\),\s*focusedInFocusZone: !!active\?\.closest\?\.\(`\[\$\{FOCUS_ZONE_ATTR\}\]`\),\s*\}\);/g), 1);
  assert.equal(count(/if \(claim === "skip"\) return;/g), 1);
  assert.equal(count(/if \(claim === "pool"\) \{/g), 1);
  // คิวของข้อ 2 สร้างจากกล่องที่ติดป้ายเท่านั้น และเจ้าของต้องเป็นกล่องนี้เอง
  assert.equal(count(/document\.querySelectorAll\(`\[\$\{ZONE_ATTR\}\]`\)\)\.filter\(isVisible\);/g), 1);
  assert.equal(count(/if \(all\[index\] !== zone\) return;/g), 1);
  const onPaste = hook.slice(hook.indexOf("const onPaste = (event) => {"), hook.indexOf("filesFromClipboard(event)"));
  assert.ok(onPaste.indexOf('claim === "skip"') < onPaste.indexOf('claim === "pool"'));
  assert.ok(onPaste.indexOf("const claim = pasteClaim(") !== -1 && onPaste.indexOf("all[index] !== zone") !== -1);
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
  "app/service/import/page.js",
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
