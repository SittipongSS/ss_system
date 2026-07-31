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
});

test("ConfirmDialog owns async, error, busy, and deliberate focus behavior", () => {
  assert.match(CONFIRM, /await onConfirm\(\)/);
  assert.match(CONFIRM, /setInternalError\(messageText\)/);
  assert.match(CONFIRM, /aria-busy=\{pending \|\| undefined\}/);
  assert.match(CONFIRM, /initialFocusRef=\{hideCancel \? confirmRef : cancelRef\}/);
  assert.match(MODAL, /initialFocusRef\?\.current/);
  assert.match(MODAL, /aria-describedby=\{ariaDescribedBy\}/);
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
     จะเปลี่ยนจากแดงเป็นสีแบรนด์เงียบ ๆ */
  const deleteProject = source("../../app/sa/projects/page.js");
  assert.match(deleteProject, /onConfirm=\{deleteProject\}\s*\r?\n\s*danger/,
    "กล่องลบโครงการต้องส่ง danger เอง (เดิม shim ตั้งให้)");

  /* ทุกจุดที่เคยได้ closeOnSuccess ฟรีจาก shim ต้องส่งเอง */
  for (const page of ["../../app/tax/filings/[id]/page.js", "../../app/tax/registrations/[id]/page.js"]) {
    const text = source(page);
    const opens = (text.match(/<ConfirmDialog\b/g) || []).length;
    const closes = (text.match(/closeOnSuccess/g) || []).length;
    assert.ok(opens > 0, `${page} ไม่มี <ConfirmDialog> แล้ว — เช็คว่าเทสต์ยังชี้ไฟล์ถูก`);
    assert.equal(closes, opens, `${page} มี <ConfirmDialog> ${opens} จุด แต่ส่ง closeOnSuccess ${closes} จุด`);
  }
});
