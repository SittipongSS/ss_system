import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FILING_TRANSITIONS, canTransitionFiling, filingTransitionError } from "./workflow.js";

/* 🔴 ตรวจระบบ 2026-10-26 ข้อ 4 — route ใบยื่นเช็กสถานะต้นทางแค่ 3 ปลายทาง ⇒ RA ปิดงาน "ชำระแล้ว" จากร่าง/รอรับเงินได้
   (ข้ามการรับเงินจากลูกค้า) · ตีกลับใบที่ชำระแล้วได้ · เลขใบเสร็จบังคับแค่ในโมดัล ⇒ ตารางเดียว + ด่านที่ server */
const SA = { sales: true, ra: false };
const RA = { sales: false, ra: true };
const ADMIN = { sales: true, ra: true };
const ALL = ["draft", "pending", "received", "filing", "complete", "delivered", "rejected"];
const ok = (args) => filingTransitionError(args) === null;

test("ทางเดินปกติครบเส้น (ใบเสียภาษี) — ผ่านเมื่อมีเลขเอกสารครบ", () => {
  assert.ok(ok({ from: "draft", to: "pending", caps: SA }));
  assert.ok(ok({ from: "pending", to: "received", caps: SA, fields: { receiptNumber: "INV-1" } }));
  assert.ok(ok({ from: "received", to: "filing", caps: RA, fields: { taxInvoiceNumber: "TI-1" } }));
  assert.ok(ok({ from: "filing", to: "complete", caps: RA, fields: { exciseReceiptNumber: "ER-1" } }));
  assert.ok(ok({ from: "complete", to: "delivered", caps: SA }));
  assert.ok(ok({ from: "filing", to: "rejected", caps: RA, fields: { rejectionReason: "ยอดไม่ตรง" } }));
  assert.ok(ok({ from: "rejected", to: "received", caps: SA, fields: { receiptNumber: "INV-1" } }));
});

test("ข้ามขั้นไม่ได้ — ทุกคู่ที่ไม่อยู่ในตาราง ตอบ 400 แม้เป็นแอดมิน", () => {
  const allowed = new Set([
    "draft>pending", "pending>received", "rejected>received", "received>filing", "filing>complete",
    "complete>delivered", "received>rejected", "filing>rejected",
  ]);
  const fields = { receiptNumber: "x", taxInvoiceNumber: "x", exciseReceiptNumber: "x", rejectionReason: "x" };
  for (const from of ALL) {
    for (const to of Object.keys(FILING_TRANSITIONS)) {
      if (from === to) continue;
      const result = filingTransitionError({ from, to, caps: ADMIN, fields });
      if (allowed.has(`${from}>${to}`)) assert.equal(result, null, `${from} → ${to} ต้องผ่าน`);
      else assert.equal(result?.status, 400, `${from} → ${to} ต้องถูกปฏิเสธ`);
    }
  }
  // เคสจริงที่เคยหลุด: ปิดงานจากร่าง/รอรับเงิน · ตีกลับใบที่ชำระแล้ว
  assert.match(filingTransitionError({ from: "pending", to: "complete", caps: RA, fields }).error, /ต้องมาจาก "กำลังยื่น"/);
  assert.equal(filingTransitionError({ from: "complete", to: "rejected", caps: RA, fields }).status, 400);
});

test("ใครทำ: SA ทำขั้นของ RA ไม่ได้ และกลับกัน (403)", () => {
  assert.equal(filingTransitionError({ from: "received", to: "filing", caps: SA, fields: { taxInvoiceNumber: "x" } }).status, 403);
  assert.equal(filingTransitionError({ from: "pending", to: "received", caps: RA, fields: { receiptNumber: "x" } }).status, 403);
  assert.equal(filingTransitionError({ from: "complete", to: "delivered", caps: RA }).status, 403);
  assert.equal(filingTransitionError({ from: "draft", to: "nonsense", caps: ADMIN }).status, 400);
});

test("เลขเอกสารบังคับที่ server — ว่าง/ช่องว่างล้วนไม่ผ่าน · ใบยกเว้นไม่ต้องมี", () => {
  for (const blank of [undefined, null, "", "   "]) {
    assert.match(filingTransitionError({ from: "pending", to: "received", caps: SA, fields: { receiptNumber: blank } }).error, /S&S/);
    assert.match(filingTransitionError({ from: "received", to: "filing", caps: RA, fields: { taxInvoiceNumber: blank } }).error, /ใบกำกับภาษี/);
    assert.match(filingTransitionError({ from: "filing", to: "complete", caps: RA, fields: { exciseReceiptNumber: blank } }).error, /ใบเสร็จสรรพสามิต/);
    assert.match(filingTransitionError({ from: "received", to: "rejected", caps: RA, fields: { rejectionReason: blank } }).error, /เหตุผลที่ตีกลับ/);
  }
  assert.ok(ok({ from: "pending", to: "received", caps: SA, exempt: true }));
  // ตีกลับต้องมีเหตุผลเสมอ แม้ใบยกเว้น
  assert.equal(filingTransitionError({ from: "received", to: "rejected", caps: RA, exempt: true }).status, 400);
});

test("ใบยกเว้น: รับเงินแล้ว → ชำระแล้วได้ตรง (ไม่มีขั้นยื่น) · ใบเสียภาษีทำแบบนั้นไม่ได้ · ใบยกเว้นเข้า 'กำลังยื่น' ไม่ได้", () => {
  assert.ok(ok({ from: "received", to: "complete", caps: RA, exempt: true }));
  assert.equal(filingTransitionError({ from: "received", to: "complete", caps: RA, fields: { exciseReceiptNumber: "x" } }).status, 400);
  assert.match(filingTransitionError({ from: "received", to: "filing", caps: RA, exempt: true, fields: { taxInvoiceNumber: "x" } }).error, /ยกเว้นภาษี/);
  assert.equal(canTransitionFiling("received", "complete", { exempt: true }), true);
  assert.equal(canTransitionFiling("received", "complete"), false);
  assert.equal(canTransitionFiling("received", "filing", { exempt: true }), false);
});

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const route = codeOnly(read("../../app/api/orders/[id]/route.js"));
const page = codeOnly(read("../../app/tax/filings/[id]/page.js"));

test("route ตัดสินด้วยตารางกลาง · ยกเว้นตัดสินจากทะเบียน (stampExemptFlags) ไม่ใช่ยอด 0", () => {
  assert.match(route, /filingTransitionError\(\{\s*from: order\.status, to: target, caps: \{ sales: isSales, ra: isLegal \}, exempt, fields,/);
  assert.match(route, /stampExemptFlags\(supabase, \[\{ \.\.\.order, items: exemptItems \|\| \[\] \}\]\)/);
  assert.doesNotMatch(route, /salesTargets|legalTargets/, "รายการปลายทางแยกตามฝ่ายแบบเดิมห้ามกลับมา");
  // ช่องบังคับนับค่าที่เก็บไว้แล้วด้วย (ส่งเลขมารอบก่อน)
  assert.match(route, /exciseReceiptNumber: updates\.exciseReceiptNumber !== undefined \? updates\.exciseReceiptNumber : order\.exciseReceiptNumber/);
  // ปุ่มตีกลับบนจออ่านตารางเดียวกัน
  assert.match(page, /visible: canApprove && canTransitionFiling\(o\.status, "rejected"\)/);
});
