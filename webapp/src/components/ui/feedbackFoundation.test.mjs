import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const TOAST = source("./Toast.js");
const TOAST_CSS = source("./Toast.module.css");
const CONFIRM = source("./ConfirmDialog.js");
const MODAL = source("../Modal.js");
const EXCISE_CONFIRM = source("../excise/ConfirmDialog.js");
const TAX_CONFIRM = source("../tax/ConfirmModal.js");

test("Toast foundation exposes a global provider, queue API, and portal", () => {
  assert.match(TOAST, /export function ToastProvider/);
  assert.match(TOAST, /export function useToast/);
  assert.match(TOAST, /createPortal\(children, document\.body\)/);
  for (const method of ["success", "error", "warning", "info", "dismiss", "clear"]) {
    assert.match(TOAST, new RegExp(`\\b${method}\\b`));
  }
  assert.match(TOAST_CSS, /body:has\(\.form-actions, \.form-action-bar\.page, \[data-toast-avoid\]\)/);
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

test("legacy Tax and Excise confirmations delegate to the shared dialog", () => {
  assert.match(EXCISE_CONFIRM, /@\/components\/ui\/ConfirmDialog/);
  assert.match(EXCISE_CONFIRM, /closeOnSuccess/);
  assert.match(TAX_CONFIRM, /@\/components\/ui\/ConfirmDialog/);
  assert.doesNotMatch(EXCISE_CONFIRM, /useState/);
  assert.doesNotMatch(TAX_CONFIRM, /useState/);
});
