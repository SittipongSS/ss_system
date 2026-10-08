import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const TOAST = source("./Toast.js");
const TOAST_CSS = source("./Toast.module.css");
const CONFIRM = source("./ConfirmDialog.js");
const MODAL = source("../Modal.js");

test("Toast foundation exposes a global provider, queue API, and portal", () => {
  assert.match(TOAST, /export function ToastProvider/);
  assert.match(TOAST, /export function useToast/);
  assert.match(TOAST, /createPortal\(children, document\.body\)/);
  for (const method of ["success", "error", "warning", "info", "dismiss", "clear"]) {
    assert.match(TOAST, new RegExp(`\\b${method}\\b`));
  }
  // modifier ของแถบเต็มหน้าเปลี่ยนจาก `.page` เป็น `.is-page` แล้ว (ชนคลาสวางเลย์เอาต์ —
  // ดู components/ui/formActionBar.test.mjs)
  assert.match(TOAST_CSS, /body:has\(\.form-actions, \.form-action-bar\.is-page, \[data-toast-avoid\]\)/);
  assert.doesNotMatch(TOAST_CSS, /border-inline-start|border-left/);
  // 🐞 UAT จอหน้างาน 25/09: toast ขอบล่างทับปุ่มหลักของแผ่นเต็มจอ แล้วการแตะทำให้มันค้าง
  assert.match(TOAST_CSS, /@media \(max-width: 640px\)\s*\{\s*:global\(body:has\(\.overlay\.phone-sheet\)\)\s*\.viewport\s*\{[^}]*top:[^}]*bottom: auto/);
  assert.doesNotMatch(TOAST, /onMouseEnter=\{stopTimer\}/, "แตะบนจอสัมผัสยิง mouseenter ด้วย — หยุดนับเฉพาะ pointerType mouse");
  assert.match(TOAST, /pointerType === "mouse"\) stopTimer/);
  // 🐞 review 26/09: แถบงานของช่างสูงเกินกว่าที่ยก 88px พ้น — แถบที่อยู่บนจอส่ง toast ขึ้นบน (กฎมาหลัง data-toast-avoid)
  const avoidAt = TOAST_CSS.indexOf('[data-toast-avoid]');
  const topAt = TOAST_CSS.indexOf(':global(body:has([data-toast-top]:not([hidden] *))) .viewport {');
  assert.ok(avoidAt > -1 && topAt > avoidAt, 'กฎขึ้นบนต้องมาหลังกฎยก');
});

test("ConfirmDialog owns async, error, busy, and deliberate focus behavior", () => {
  assert.match(CONFIRM, /await onConfirm\(\)/);
  assert.match(CONFIRM, /setInternalError\(messageText\)/);
  assert.match(CONFIRM, /aria-busy=\{pending \|\| undefined\}/);
  assert.match(CONFIRM, /initialFocusRef=\{hideCancel \? confirmRef : cancelRef\}/);
  assert.match(MODAL, /initialFocusRef\?\.current/);
  assert.match(MODAL, /aria-describedby=\{ariaDescribedBy\}/);
});

/* 🐞 UAT เอกสารประเมินพื้นที่ 2026-10-08 (จอ 360): กล่องยืนยันที่เนื้อยาวกว่าจอเปิดมา **เลื่อนลงไปแล้ว** 168px — โฟกัสแรกอยู่ที่ปุ่ม
   "ยกเลิก" ท้ายเนื้อ เบราว์เซอร์จึงเลื่อน `.drawer-body` ไปหาปุ่ม ⇒ ข้อความหลักกับ "อย่าปิดหน้านี้ระหว่างรอ" หลุดขึ้นไปเหนือจอ
   · ยืนยันแล้วล้ม: กล่องแดงโผล่ครึ่งเดียวที่ขอบล่าง แถวปุ่มอยู่ใต้จอ และโฟกัสหล่นไป body (ปุ่มยืนยันถูก disabled ระหว่างรอ) */
test("ConfirmDialog เปิดที่บรรทัดแรก · ยืนยันแล้วล้ม = แถวปุ่มกับข้อผิดพลาดเลื่อนเข้ามา และโฟกัสกลับเข้ากล่อง", () => {
  assert.match(CONFIRM, /initialFocusRef=\{hideCancel \? confirmRef : cancelRef\}[\s\S]{0,260}initialFocusScroll=\{false\}/,
    "โฟกัสแรกไม่เลื่อนเนื้อกล่องตาม — กล่องยืนยันต้องอ่านจากบรรทัดแรก");
  assert.match(MODAL, /\n {2}initialFocusScroll = true,\n/, "ค่าตั้งต้นของ Modal เหมือนเดิม — โมดัลฟอร์มที่ชี้โฟกัสไปช่องกรอกยังเลื่อนตาม");
  assert.match(MODAL, /initialFocus\.focus\(\{ preventScroll: !initialFocusScroll \}\);/);
  assert.match(MODAL, /\}, \[open, initialFocusRef, initialFocusScroll\]\);/);

  const effect = CONFIRM.slice(CONFIRM.indexOf("if (!open || !resolvedError || pending) return;"));
  assert.ok(effect.length > 0 && effect.length < CONFIRM.length, "ไม่มี effect ของข้อผิดพลาด");
  assert.match(effect, /^if \(!open \|\| !resolvedError \|\| pending\) return;\s*const actions = actionsRef\.current;\s*if \(!actions\) return;\s*actions\.scrollIntoView\(\{ block: "nearest" \}\);/,
    "รอจนปุ่มกลับมากดได้ (ไม่ pending) แล้วเลื่อนแถวปุ่มเข้ามา — กล่องแดงอยู่เหนือแถวปุ่มพอดี");
  assert.match(effect, /if \(dialog && !dialog\.contains\(document\.activeElement\)\) \{\s*\(confirmRef\.current \|\| cancelRef\.current\)\?\.focus\(\{ preventScroll: true \}\);\s*\}\s*\}, \[open, resolvedError, pending\]\);/,
    "คืนโฟกัสเฉพาะตอนโฟกัสหลุดออกนอกกล่อง — คนที่ย้ายโฟกัสเองไม่ถูกดึงกลับ");
  assert.match(CONFIRM, /<div className="confirm-dialog-actions" ref=\{actionsRef\}>/);
  /* กล่องแดงต้องอยู่ติดเหนือแถวปุ่มใน DOM — เลื่อนแถวปุ่มเข้ามา = เห็นคู่กัน */
  const alertAt = CONFIRM.indexOf('<StatusNotice tone="error" role="alert">');
  assert.ok(alertAt !== -1 && alertAt < CONFIRM.indexOf('<div className="confirm-dialog-actions"'));
});

/* 🐞 UAT เอกสารประเมินพื้นที่ 2026-10-08: ตัวหนังสือของหน้าข้างหลังทะลุขึ้นมาซ้อนกับเนื้อโมดัล — พื้นของ `.drawer` เคยเป็น `--panel` (โปร่ง 6%)
   ซึ่งต้องมาคู่กับ backdrop-filter แต่ blur ของ `.overlay` ไม่ถึง Chrome (ตัวแปลง CSS ทิ้งบรรทัดที่ไม่มี prefix ของกฎนั้น) */
test("พื้นของโมดัลทึบ 100% — ไม่พึ่ง blur ของ overlay", () => {
  const globals = source("../../app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const drawer = /\n\.drawer \{([^}]*)\}/.exec(globals)?.[1] || "";
  assert.match(drawer, /background: var\(--panel-solid\);/);
  assert.doesNotMatch(drawer, /background: var\(--panel\);/);
  assert.match(globals, /--panel-solid: #[0-9a-f]{6};/, "โทเคนพื้นทึบต้องเป็นสีทึบจริง (ไม่มี alpha)");
});

/* เดิมเทสต์นี้ตรวจว่า shim สองตัว "ส่งต่อให้ ConfirmDialog กลางถูกไหม"
   ปลดระวาง shim แล้ว (2026-07-30) จึงเปลี่ยนมาตรึง *ผลของการปลด* แทน:
   ทั้งคู่เขียนคอมเมนต์ตัวเองว่า "one-release migration window" แต่อยู่ยาว และ
   **แอบตั้งค่าเริ่มต้นให้** — tax/ConfirmModal ตั้ง danger=true (ของกลางเป็น false)
   ส่วน excise/ConfirmDialog บังคับ closeOnSuccess
   ถ้าลบเฉย ๆ โดยไม่เขียนค่ากลับ พฤติกรรมจะเปลี่ยนแบบไม่มีใครเห็น */
test("shim ยืนยันของภาษี/สรรพสามิตถูกปลดระวาง และค่าที่มันแอบตั้งถูกเขียนกลับแล้ว", () => {
  for (const shim of ["../tax/ConfirmModal.js", "../excise/ConfirmDialog.js"]) {
    assert.equal(existsSync(fileURLToPath(new URL(shim, import.meta.url))), false,
      `${shim} กลับมาแล้ว — ให้เรียก components/ui/ConfirmDialog ตรง ๆ`);
  }

  /* จุดเดียวที่เคยพึ่งค่าเริ่มต้น danger=true ของ shim — ถ้าหาย กล่อง "ลบโครงการ"
     จะเปลี่ยนจากแดงเป็นสีแบรนด์เงียบ ๆ
     ⚠️ ย้ายบ้านแล้ว: หน้า *รายการ* โครงการเป็นหน้าอ่านอย่างเดียวตั้งแต่ 2026-08-02
     (การควบคุมอยู่บนการ์ด Record Control ของหน้ารายละเอียด) กล่องลบจึงอยู่ที่
     หน้ารายละเอียดที่เดียว — เทสต์ตามไปตรึงที่นั่นแทน ไม่ใช่ปล่อยผ่าน */
  const listPage = source("../../app/sa/projects/page.js");
  assert.equal(/<ConfirmDialog\b/.test(listPage), false,
    "หน้ารายการโครงการมีกล่องยืนยันกลับมาแล้ว — ถ้าตั้งใจ ให้ตรึง danger ของมันด้วย");
  const detailPage = source("../../app/sa/projects/[id]/page.js");
  assert.match(detailPage, /danger=\{confirmState\?\.danger \?\? true\}/,
    "กล่องยืนยันหน้ารายละเอียดโครงการต้อง default danger=true (เดิม shim ตั้งให้)");

  /* ทุกจุดที่เคยได้ closeOnSuccess ฟรีจาก shim ต้องส่งเอง */
  for (const page of ["../../app/tax/filings/[id]/page.js", "../../app/tax/registrations/[id]/page.js"]) {
    const text = source(page);
    const opens = (text.match(/<ConfirmDialog\b/g) || []).length;
    const closes = (text.match(/closeOnSuccess/g) || []).length;
    assert.ok(opens > 0, `${page} ไม่มี <ConfirmDialog> แล้ว — เช็คว่าเทสต์ยังชี้ไฟล์ถูก`);
    assert.equal(closes, opens, `${page} มี <ConfirmDialog> ${opens} จุด แต่ส่ง closeOnSuccess ${closes} จุด`);
  }
});
