import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isQuotationAwaitingMyApproval, isQuotationWaitingOnMe } from './quotationWorkflow.js';
import { isSalesOrderWaitingOnMe } from './salesOrderWorkflow.js';
import { isSalesOrderSelfApproval } from './salesOrderApprovalOverride.js';
import { serviceBackfillAwaitingReview, serviceBackfillNeeded } from './serviceSetup.js';
import { SERVICE_BACKFILL_AGING_TEXT } from './serviceBackfillAging.js';
import { EMPTY_QUOTATION_FILTERS } from './quotationListFilter.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

/* ── คิว "รออนุมัติจากคุณ" บนหัวทะเบียนเอกสารขาย (มติผู้ใช้ 2026-08-25) ───────
   ทรงเดียวกับทะเบียนลูกค้า/สินค้า · สิ่งที่เทสต์นี้ล็อกคือ **ขอบเขตของคิว** ไม่ใช่หน้าตา:
   คิวพูดคำว่า "อนุมัติ" ⇒ ต้องนับเฉพาะของที่ผู้ใช้คนนี้กดอนุมัติได้จริง */

test('คิวของใบเสนอราคาเป็นชุดย่อยของ "รอฉันลงมือ" — ไม่รวมใบที่ถูกตีกลับมาให้แก้', () => {
  const ctx = { userId: 'U1', dealOwnerId: 'U1', dealClosed: false };
  const pending = { status: 'sent', approvalStatus: 'pending', createdBy: 'U9' };
  assert.equal(isQuotationAwaitingMyApproval(pending, ctx), true);
  assert.equal(isQuotationWaitingOnMe(pending, ctx), true);

  // ใบที่ผู้อนุมัติตีกลับมาให้ผู้จัดทำแก้ = ของค้างของเรา แต่ **ไม่ใช่ของที่รอเราอนุมัติ**
  const rejectedToMe = { status: 'sent', approvalStatus: 'rejected', createdBy: 'U1', approvalNote: 'แก้ราคา' };
  assert.equal(isQuotationAwaitingMyApproval(rejectedToMe, ctx), false, 'คิวอนุมัติต้องไม่กินใบที่ถูกตีกลับ');

  // ไม่ใช่เจ้าของดีล = ไม่ใช่ผู้อนุมัติของใบนี้
  assert.equal(isQuotationAwaitingMyApproval(pending, { ...ctx, dealOwnerId: 'U2' }), false);
  // ดีลปิดแล้ว = ไม่มีอะไรให้อนุมัติต่อ
  assert.equal(isQuotationAwaitingMyApproval(pending, { ...ctx, dealClosed: true }), false);
});

test('คิวของใบสั่งขายตัดใบที่ตัวเองสร้าง/ยื่นออก — อนุมัติเองไม่ได้', () => {
  const mine = { status: 'pending_approval', createdBy: 'U1', submittedBy: 'U1' };
  const others = { status: 'pending_approval', createdBy: 'U9', submittedBy: 'U9' };
  assert.equal(isSalesOrderWaitingOnMe(others, { userId: 'U1', reviewer: true }), true);
  assert.equal(isSalesOrderSelfApproval(mine, 'U1'), true, 'ใบของตัวเองต้องถูกจับได้');
  assert.equal(isSalesOrderSelfApproval(others, 'U1'), false);
  /* ⭐ "รอฉันลงมือ" (ป้ายบนเมนู + ตัวกรองทะเบียน) ต้องตัดใบตัวเองเหมือนคิวนี้ (22/09) — เดิมนับใบที่ตัวเองยื่น
     ทั้งที่อนุมัติเองไม่ได้ ⇒ ป้ายเกินคิว · เหลือ admin ที่นับ เพราะ override ใบตัวเองได้ (ทำที่หน้าใบ) */
  assert.equal(isSalesOrderWaitingOnMe(mine, { userId: 'U1', reviewer: true, role: 'ae_supervisor' }), false);
  assert.equal(isSalesOrderWaitingOnMe(mine, { userId: 'U1', reviewer: true, role: 'admin' }), true);
});

test('ธง _awaitingMyApproval ติดที่ server ทั้งสองทะเบียน — จอไม่คำนวณเอง', () => {
  const quotes = read('app/api/sales-planning/quotations/route.js');
  const orders = read('app/api/sales-planning/sales-orders/route.js');
  assert.match(quotes, /_awaitingMyApproval: isQuotationAwaitingMyApproval\(/);
  assert.match(orders, /_awaitingMyApproval: \(?isSalesOrderReviewer\(user\.role\)/);
  assert.match(orders, /!isSalesOrderSelfApproval\(row, user\.id\)/, 'ใบของตัวเองต้องถูกตัดที่ server');
  /* ⭐ นับ Actual รายงวด (mig 0412): คิว "งวดรออนุมัติ" อยู่ในชุด "รอฉันอนุมัติ" ด้วย — ตัวตัดสินเดียวกับเลนผู้อนุมัติของ `_waitingOnMe`
     (ตัดงวดที่ตัวเองยื่น ยกเว้น admin) · งวดมาจาก loadListInstallments เฉพาะใบรายงวด (ใบอื่น = null) */
  assert.match(orders, /\|\| installmentActualAwaitingReview\(row, actualInstallmentsOf\(row\) \|\| \[\], \{ userId: user\.id, role: user\.role \}\),/);
  assert.match(orders, /const actualInstallmentsOf = \(row\) => \(isInstallmentActualOrder\(row\) \? \(installmentsByOrder\.get\(row\.id\) \|\| \[\]\) : null\);/);
  // ธง "รอฉันลงมือ" ต้องส่ง role ตัวเดียวกับที่ป้ายบนเมนูส่ง — ไม่งั้น admin เห็นลิสต์กับป้ายไม่ตรงกัน
  // ⭐ แถวต้องแนบ deal — ใบที่ถูกย้อนอนุมัติตัดสินจากเจ้าของดีล (มติ 24/09) · ไม่แนบ = ลิสต์ไม่ตรงป้ายบนเมนู
  /* ⭐ เลนงานบริการย้อนหลัง (mig 0392 · D26) — helper ต้องรู้ว่าใบนี้ **ต้องตั้งจริง** (`serviceBackfillNeeded` ใช้บรรทัด
     + สายธุรกิจ ซึ่ง helper ไม่มี) ⇒ route คิดครั้งเดียวแล้วส่งเข้าไป · ป้ายบนเมนูคิดแบบเดียวกัน */
  /* ⭐ ใบที่สายเปลี่ยนเป็นอย่างอื่นระหว่างรอตรวจงานบริการ ไม่ใช่งานของผู้ตรวจ (RPC อนุมัติปฏิเสธ · หน้าใบไม่มีปุ่ม) ⇒ ตัดเลนผู้ตรวจ */
  /* ⭐ + เลนนับ Actual รายงวด (mig 0412) — ส่งงวดของใบรายงวดให้ helper (ป้ายบนเมนูส่ง actualRows/actualInstallmentsOf ชุดเดียวกัน) */
  assert.match(orders, /_waitingOnMe: isSalesOrderWaitingOnMe\(\{ \.\.\.row, deal: dealById\.get\(row\.dealId\) \|\| null \}, \{\s*userId: user\.id, reviewer: reviewer && !staleServiceReview\(row\), role: user\.role,\s*serviceBackfillNeeded: setupPendingIds\.has\(row\.id\),\s*actualInstallments: actualInstallmentsOf\(row\),\s*\}\)/);
  assert.match(orders, /const reviewer = isSalesOrderReviewer\(user\.role\);/);
  /* แกนที่สองของใบเดียวกัน — ขั้นบัญชีปิดใบ (mig 0250)
     ⭐ ตั้งแต่มติ 2026-08-30 ด่านนี้ขึ้นกับ **งวดชำระ** ⇒ ต้องป้อนงวดของใบนั้นเข้าไปด้วย
     🪤 เรียกมือเปล่าได้ false ทุกใบ = คิวบัญชีว่างเงียบ ๆ ทั้งที่มีงานรออยู่ */
  assert.match(orders, /_awaitingFinanceReview: canConfirmPayment\(user\)\s*\n?\s*&& awaitsFinanceReview\(row, installmentsByOrder\.get\(row\.id\) \|\| \[\]\)/);
});

/* ── คิวเดินตามเปลือกของคนดู (มติผู้ใช้ 2026-08-25) ─────────────────────────
   ทะเบียนใบสั่งขายอยู่ในเมนูของทั้งสายขายและฝ่ายบัญชี (SHARED_DOC_ITEMS · 2026-08-22)
   🪤 ถ้าหน้าจอเช็ค role/department เอง วันที่ฝ่ายใหม่ได้เมนูเอกสารร่วมเพิ่ม
   เปลือกกับการ์ดจะเดินหนีกันเงียบ ๆ ⇒ ต้องถามตัวเดียวกับที่เลือกเปลือก */
test('การ์ดบนทะเบียนใบสั่งขายถามเปลือกที่หน้านี้สวมอยู่ ไม่ใช่เช็ค role เอง', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  assert.match(page, /useShellSystem\(usePathname\(\)\) === "finance"/, 'ต้องถามเปลือกของหน้านี้');
  assert.doesNotMatch(page, /department === ['"]FN['"]|role === ['"]finance['"]/, 'ห้ามเช็คฝ่าย/บทบาทเองในหน้า');
  // ⭐ เปลือกงานขายรวมแถว "งานบริการ (ใบเดิม)" ที่รอฉันตรวจด้วย (mig 0392) · เปลือกบัญชีไม่เกี่ยว
  assert.match(page, /financeShell \? row\._awaitingFinanceReview : \(row\._awaitingMyApproval \|\| row\._awaitingMyServiceReview\)/);
  assert.match(page, /financeShell \? "เปิดใบเพื่อตรวจ" : "เปิดใบเพื่ออนุมัติ"/, 'คำบนปุ่มต้องตรงกับงานของคนที่ยืนอยู่');

  /* 🪤 **บ้านของคนดูอย่างเดียวไม่พอ ต้องดูลิสต์เส้นทางที่บ้านนั้นรับด้วย** —
     ตัวอย่างที่เปลี่ยนจริง: RD เคยรับแค่ `/requests` แล้ว 2026-08-29 รับใบสั่งขายเพิ่ม
     ⇒ เปลือกของหน้าเดียวกันเปลี่ยนตามลิสต์ ไม่ใช่ตาม role · ถ้าตัดสินด้วย home ลอย ๆ
     วันที่ลิสต์การรับเปลี่ยน เนื้อหาจะพูดภาษาเปลือกที่ไม่ได้ครอบมันอยู่
     ⚠️ การ์ด "ตรวจใบ" ยังเป็นของเปลือก `finance` เท่านั้น — RD ที่เปิดทะเบียนนี้อยู่ใน
     เปลือกของตัวเอง (`rd`) จึงไม่เข้าเงื่อนไข ซึ่งถูกแล้ว: เขาไม่ใช่ผู้ตรวจใบ */
  const ctx = read('lib/roleContext.js');
  assert.match(ctx, /export function useShellSystem\(pathname\)/);
  assert.match(ctx, /adoptsPathname\(home, pathname\)/, 'ต้องเช็คลิสต์เส้นทางที่บ้านนั้นรับไปด้วย');
  assert.match(ctx, /homeSystemForUser\(\{ role, department \}\)/, 'hook ต้องเรียกตัวเดียวกับ config/navigation');
  const nav = read('config/navigation.js');
  assert.match(nav, /homeSystemForUser\(user\)/, 'เมนูยังตัดสินด้วยฟังก์ชันเดิม');
  assert.match(nav, /rd: \['\/requests', '\/sa\/sales-orders'/, 'RD รับใบคำร้อง + ใบสั่งขาย');
});

test('ทะเบียนทั้งห้าใช้คิวตัวเดียวกัน และเอกสารขายกดเปิดใบ ไม่ใช่ติ๊กอนุมัติในลิสต์', () => {
  const shared = 'components/ui/ApprovalQueue.js';
  for (const page of [
    'app/database/customers/page.js',
    'app/database/products/page.js',
    'app/sales-planning/quotations/page.js',
    'app/sales-planning/sales-orders/page.js',
    'app/sales-planning/contracts/page.js',
  ]) {
    assert.match(read(page), /import ApprovalQueue from "@\/components\/ui\/ApprovalQueue"/, `${page} ต้องใช้คิวกลาง`);
  }
  /* 🛑 การอนุมัติ QT/SO ตรึงลายเซ็นผู้อนุมัติกับ fingerprint ของเนื้อใบ และโมดัลยืนยัน
     ต้องบอกผลลัพธ์ (ยอด Actual · งวดชำระ) ⇒ ตัดสินในลิสต์ไม่ได้ ต้องเปิดใบก่อน */
  for (const page of [
    'app/sales-planning/quotations/page.js',
    'app/sales-planning/sales-orders/page.js',
    'app/sales-planning/contracts/page.js',
  ]) {
    const src = read(page);
    assert.match(src, /renderAction=\{/, `${page} ต้องส่งปุ่มของตัวเอง`);
    assert.doesNotMatch(src, /<ApprovalQueue[\s\S]{0,400}onDecide=/, `${page} ต้องไม่ตัดสินอนุมัติจากลิสต์`);
  }
  assert.match(read(shared), /renderAction \? renderAction\(rec\)/, 'คิวกลางต้องรองรับทั้งสองโหมด');
});

/* 🪤 **สัญญาไม่มีขั้นอนุมัติ** (draft → awaiting_signature → signed) — การ์ดบนทะเบียน
   สัญญาจึงต้องไม่พูดคำว่า "รออนุมัติ" และต้องใช้ธง `_waitingOnMe` ตัวเดียวกับตัวกรอง
   ไม่ใช่นิยามที่สองที่เดินหนีกันทีหลัง */
test('ทะเบียนสัญญาใช้คำของตัวเอง และยึดธงเดิม', () => {
  const page = read('app/sales-planning/contracts/page.js');
  assert.match(page, /title="ต้องทำตอนนี้ — สัญญาที่ค้างอยู่กับคุณ"/);
  assert.doesNotMatch(page, /<ApprovalQueue[\s\S]{0,300}รออนุมัติ/, 'สัญญาไม่มีขั้นอนุมัติ ห้ามใช้คำนี้');
  assert.match(page, /rows\.filter\(\(row\) => row\._waitingOnMe\)/, 'ต้องใช้ธงเดิม ไม่นิยามใหม่');
  const lib = read('lib/sales/contracts.js');
  assert.match(lib, /contract\.status === 'draft' \|\| contract\.status === 'awaiting_signature'/,
    'นิยาม "ค้างอยู่กับฉัน" ของสัญญาอยู่ที่ lib ที่เดียว');
});

/* 🪤 **คิวยาวได้จริง** — ฝ่ายบัญชีเจอ 43 ใบรอตรวจ (ผู้ใช้ส่งภาพ 2026-08-26) การ์ดกิน
   ทั้งจอจนตารางถูกดันหาย ⇒ ต้องตัดพรีวิวแล้วมีปุ่มกาง · ค่าเดียวกับคิวของทะเบียน
   การชำระ (มติ 2026-08-13) เพื่อให้ "คิวบนหัวหน้า" มีทรงเดียวทั้งระบบ */
test('คิวตัดพรีวิวเท่ากับคิวของทะเบียนการชำระ และมีปุ่มกาง', () => {
  const queue = read('components/ui/ApprovalQueue.js');
  const payments = read('app/finance/payments/page.js');

  const capOf = (src) => Number(/QUEUE_PREVIEW = (\d+)/.exec(src)?.[1]);
  assert.equal(capOf(queue), capOf(payments), 'สองคิวต้องตัดที่จำนวนเดียวกัน');
  assert.match(queue, /items\.slice\(0, QUEUE_PREVIEW\)/);
  assert.match(queue, /ดูอีก \$\{items\.length - QUEUE_PREVIEW\} \$\{unit\}/, 'ปุ่มต้องบอกจำนวนที่เหลือ');
  assert.match(queue, /open \? "ย่อคิว"/, 'กางแล้วต้องย่อกลับได้');

  // ลักษณนามต้องตรงกับของที่นับ — เอกสารเป็น "ใบ" ทะเบียนข้อมูลเป็น "รายการ"
  for (const page of [
    'app/sales-planning/quotations/page.js',
    'app/sales-planning/sales-orders/page.js',
    'app/sales-planning/contracts/page.js',
  ]) assert.match(read(page), /unit="ใบ"/, `${page} ต้องนับเป็นใบ`);
  assert.match(queue, /unit = "รายการ"/, 'ค่าตั้งต้นเป็นรายการ (ลูกค้า/สินค้า)');
});

/* ── งานบริการย้อนหลัง (mig 0392 · PR-A · D26 · D28) ─────────────────────────────────────────────────────
   ใบที่อนุมัติไปแล้วก่อนมีการตั้งงานบริการ ⇒ ฝ่ายขายตั้งย้อนหลังแล้ว "ยื่นตรวจงานบริการ" ให้ผู้จัดการฝ่ายขาย
   ⭐ ผู้จัดการเห็นเป็นแถวชนิด "งานบริการ (ใบเดิม)" ในคิวเดียวกับใบรออนุมัติ — ไม่ใช่คิวที่สอง
   🪤 ค่า 'submitted' ค้างบนใบที่ย้อนอนุมัติ/ออก Rev./ยกเลิกแล้วต้องไม่ขึ้นคิว ⇒ ทุกผิวถามตัวตัดสินตัวเดียว */
test('ธงงานบริการย้อนหลังติดที่ server — ตัวตัดสินตัวเดียว · ตัดคนยื่นเอง (ยกเว้น admin) · ชิปกับเลนใช้ชุดเดียว', () => {
  const orders = read('app/api/sales-planning/sales-orders/route.js');
  assert.match(orders, /_awaitingMyServiceReview: reviewer && serviceBackfillAwaitingReview\(row\)\s*&& \(user\.role === 'admin' \|\| row\.serviceSetupSubmittedById !== user\.id\)/);
  /* F1: สายของโครงการ/ดีลเปลี่ยนระหว่างรอตรวจ = ไม่ขึ้นคิวผู้จัดการ (ค่า submitted คงไว้ — สายกลับเป็นบริการแล้วกลับมารอตรวจ) */
  assert.match(orders, /_awaitingMyServiceReview: reviewer && serviceBackfillAwaitingReview\(row\)\s*&& \(user\.role === 'admin' \|\| row\.serviceSetupSubmittedById !== user\.id\)\s*&& !staleServiceReview\(row\)/);
  assert.match(orders, /const staleServiceReview = \(row\) => serviceBackfillAwaitingReview\(row\) && businessLineById\.get\(row\.id\) !== 'SERVICE';/);
  assert.match(orders, /_serviceSetupPending: setupPendingIds\.has\(row\.id\)/, 'ชิปกับเลน "รอฉันลงมือ" ของเจ้าของดีลนับชุดเดียวกัน');
  assert.match(orders, /serviceReview: serviceBackfillAwaitingReview\(row\) \? serviceReviewOf\(row\) : null/);
  assert.doesNotMatch(orders, /serviceSetupState\s*[!=]==/, 'ห้ามอ่าน serviceSetupState เอง — ผ่าน serviceBackfillAwaitingReview (D28)');

  /* คิวเดียวรวมสองชนิดได้โดย key ไม่ชนกัน: ใบรออนุมัติ = pending_approval · งานบริการรอตรวจ = approved */
  const base = { origin: 'pipeline', supersededById: null, serviceTermsOpenedAt: null, serviceSetupState: 'submitted' };
  assert.equal(serviceBackfillAwaitingReview({ ...base, status: 'approved' }), true);
  for (const status of ['pending_approval', 'approval_revoked', 'revised', 'cancelled']) {
    assert.equal(serviceBackfillAwaitingReview({ ...base, status }), false, `${status} ต้องไม่ขึ้นคิวงานบริการ`);
  }
});

test('⭐ คิวบนหัวทะเบียนใบสั่งขาย: แถว "งานบริการ (ใบเดิม)" บอกชนิดงาน · ตัวเลขจาก server · ไม่นับ Actual · ยื่นโดยใคร', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  // แถวชนิดนี้มีเฉพาะเปลือกงานขาย — เปลือกบัญชีเป็นคิวปิดใบ
  assert.match(page, /const serviceReviewRow = \(o\) => !financeShell && !!o\._awaitingMyServiceReview;/);
  const queue = slice(page, '<ApprovalQueue', 'renderAction=');
  /* ใบที่เปิดแก้หลังอนุมัติ (mig 0396) ป้าย "แก้งานบริการ (หลังอนุมัติ)" มากับแถว (`serviceReview.label` ของ server) · ไม่มี = "งานบริการ (ใบเดิม)" */
  /* + แถว "งวดรออนุมัติ" ของใบ Actual รายงวด (mig 0412) ต่อเป็นกิ่งที่สอง — ใบรออนุมัติปกติยังเป็นเลขที่ใบล้วน */
  assert.match(queue, /primary=\{\(o\) => \(serviceReviewRow\(o\)\s*\? `\$\{o\.serviceReview\?\.label \|\| SERVICE_REVIEW_LABEL\} · \$\{o\.orderNumber\}`\s*: installmentReviewRow\(o\) \? `\$\{INSTALLMENT_REVIEW_LABEL\} · \$\{o\.orderNumber\}` : o\.orderNumber\)\}/);
  assert.match(queue, /: installmentReviewRow\(o\)\s*\? installmentReviewLine\(o\)/, 'แถวงวดรออนุมัติพูดยอดงวดที่ยื่น ไม่ใช่ยอดเต็มใบ');
  assert.match(page, /const installmentReviewRow = \(o\) => !financeShell && !!o\._awaitingMyApproval\s*&& o\.status === "approved" && isInstallmentActualOrder\(o\);/);
  assert.ok(slice(page, 'const installmentReviewLine = (o) =>', '\n  };\n').includes('${fmtMoney(o.actualSubmittedAmount)} ก่อน VAT'));
  assert.match(queue, /: serviceReviewRow\(o\)\s*\? serviceReviewLine\(o\)/, 'บรรทัดรองของแถวงานบริการเป็นของมันเอง ไม่ใช่ยอดเงิน');
  assert.match(page, /const SERVICE_REVIEW_LABEL = "งานบริการ \(ใบเดิม\)";/);

  const line = slice(page, 'function serviceReviewLine(', '\n}\n');
  assert.match(line, /const review = order\.serviceReview \|\| \{\};/);
  for (const piece of [
    '${naText(order.customerName)}',
    '${naText(review.zones)} โซนใน ${naText(review.sites)} ไซต์',
    '${naText(review.roundsLabel)}',
    'ไม่นับ Actual',
    'ยื่นโดย ${submitted}',
  ]) assert.ok(line.includes(piece), `บรรทัดรองขาด ${piece}`);
  assert.match(line, /review\.submittedAt \? fmtDate\(review\.submittedAt\) : null/, 'วันที่ยื่นผ่าน fmtDate (เวลาไทย)');
  /* มติเจ้าของ 08/10 ("อยากสลับ ข้อ 4 กับ ข้อ 5 เปลี่ยน หน่วยรอบบริการ จาก รอบ เป็น เดือน"): บรรทัดคิวเรียงตามคอลัมน์ของตารางงานบริการ
     และแถบผู้อนุมัติบนหน้าใบ — โซน/ไซต์ (③) ก่อนจำนวนรอบบริการ (⑤) · เดิม 29/09 ยึดว่าจำนวนรอบบริการมาก่อนจำนวนโซน
     · คำ "จำนวนรอบบริการ n เดือน" มาจากตัวเดียวกับหน้าใบ (serviceRoundsText) */
  assert.ok(line.indexOf('${naText(review.zones)} โซนใน') < line.indexOf('${naText(review.roundsLabel)}'), 'โซน/ไซต์มาก่อนจำนวนรอบบริการ (ลำดับคอลัมน์ · มติ 08/10)');
  assert.ok(line.indexOf('${naText(review.roundsLabel)}') < line.indexOf('ไม่นับ Actual'), 'จำนวนรอบบริการยังอยู่ก่อนส่วนท้ายของบรรทัด');
  assert.match(line, /แต่ละครั้ง \$\{naText\(review\.zones\)\} โซนใน/);
  const route = read('app/api/sales-planning/sales-orders/route.js');
  assert.match(route, /roundsLabel: serviceRoundsText\(totals\),/, 'ยังไม่มีรอบ = null — จอขึ้นขีดผ่าน naText (ห้ามขีดดิบ · audit:ui)');
  /* ป้ายของใบที่เปิดแก้ = ตัวตัดสินกลาง `serviceSetupReopened` + คำจากแคตตาล็อก (ภาคผนวก A.4) — จอ/route ไม่พิมพ์คำเอง */
  assert.match(route, /reopened: !!serviceSetupReopened\(row\),/);
  assert.match(route, /label: serviceSetupReopened\(row\) \? SERVICE_REOPENED_TEXT\.queueLabel : null,/);
  assert.doesNotMatch(page, /แก้งานบริการ \(หลังอนุมัติ\)/, 'คำอยู่ที่ SERVICE_REOPENED_TEXT.queueLabel ที่เดียว');
  assert.doesNotMatch(route, /รอบ\/โซน/);
  assert.doesNotMatch(line, /fmtMoney|actualAmount|totalAmount/, 'แถวงานบริการไม่พูดยอด — การอนุมัตินี้ไม่แตะยอด');

  // ปุ่มท้ายแถวยังเป็น "เปิดใบเพื่ออนุมัติ" — ตัดสินที่หน้าใบที่เดียว (ด่านเดียว ไม่ใช่จอเดียว)
  assert.match(slice(page, 'renderAction={(o) => (', ')}\n'), /financeShell \? "เปิดใบเพื่อตรวจ" : "เปิดใบเพื่ออนุมัติ"/);
});

/* ⭐ ชิปบนแถบเครื่องมือ ไม่ใช่ตัวเลือกในกล่องกรอง (กฎ direct controls · ม็อก BackfillApproveModal) — ใบค้างตั้ง ~59 ใบ
   ต้องเห็นตัวเลขโดยไม่ต้องเปิดกล่อง · 🪤 ตัวกรองใหม่ต้องร้อยครบทุกจุด ไม่งั้นพังเงียบคนละแบบ:
   filtered (ไม่กรอง) · resetKey (ค้างหน้าที่ว่าง) · onClear (ล้างแล้วไม่หาย) */
test('⭐ ชิป "ยังไม่ตั้งงานบริการ n" — ปุ่มสลับข้างมุมมองสาย ร้อยครบทุกจุด และไม่นับในป้ายของปุ่มตัวกรอง', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  assert.match(page, /const \[serviceSetupPendingOnly, setServiceSetupPendingOnly\] = useStickyState\("serviceSetupPendingOnly", false\);/);
  // ตัวเลขนับจาก rows ทั้งหมด (ไม่ใช่ filtered) — ชิปไม่หดตามตัวกรองอื่น · ธงมาจาก server (serviceBackfillNeeded · D25)
  assert.match(page, /const serviceSetupPendingCount = useMemo\(\s*\(\) => rows\.filter\(\(row\) => row\._serviceSetupPending\)\.length,\s*\[rows\],?\s*\);/);

  const memo = slice(page, 'const filtered = useMemo(', '\n\n');
  /* ตรวจตัวเลข L11 (26/10): เงื่อนไขของมิติย้ายไปตัวตัดสินกลาง (lib/sales/salesOrderListFilter) — หน้าส่งธงเข้าไป */
  assert.match(memo, /serviceSetupPending: serviceSetupPendingOnly,/);
  assert.match(memo, /return rows\.filter\(\(row\) => salesOrderPassesListFilters\(row, filters, \{ matchesSearch \}\)\);/);
  assert.match(read('lib/sales/salesOrderListFilter.js'), /if \(f\.serviceSetupPending && !row\._serviceSetupPending\) return false;/);
  assert.match(memo, /\}, \[[^\]]*\bserviceSetupPendingOnly\b[^\]]*\]\);/, 'ต้องอยู่ใน dependency ของ memo ด้วย');
  assert.match(slice(page, 'usePagination(sorted', ';'), /\$\{serviceSetupPendingOnly\}/);
  assert.match(slice(page, 'onClear={() => {', '}}'), /setServiceSetupPendingOnly\(false\)/);
  assert.doesNotMatch(slice(page, 'const filterCount', ';'), /serviceSetupPending/, 'ชิปเห็นบนแถบเองอยู่แล้ว — ไม่นับซ้ำ');
  assert.doesNotMatch(slice(page, '<FilterPopover', '<GroupMenu'), /ยังไม่ตั้งงานบริการ/, 'ไม่ใช่ตัวเลือกในกล่องกรอง');

  // ตำแหน่ง: ติดท้าย Segmented มุมมองสาย ก่อนช่องค้นหา
  const toolbar = slice(page, 'toolbar={(', '<FilterPopover');
  const segment = toolbar.indexOf('onChange={setLineView}');
  const chip = toolbar.indexOf('aria-pressed={serviceSetupPendingOnly}');
  const search = toolbar.indexOf('className="search-glass"');
  assert.ok(segment > 0 && chip > segment && chip < search, 'ชิปต้องอยู่ระหว่าง Segmented กับช่องค้นหา');

  // ขึ้นเมื่อมีของ หรือกำลังเปิดอยู่ (ปิดไม่ได้ถ้าซ่อนตอนเปิด)
  const block = slice(page, '{(serviceSetupPendingCount > 0 || serviceSetupPendingOnly) && (', '</Button>');
  assert.match(block, /<Button\b/);
  assert.match(block, /size="sm"/);
  /* ผลตรวจทาน 08/10 ("ตามงานค้าง"): เปิด/ปิดชิป = เข้า/ออกคิวงานบริการ ⇒ สลับค่าเดิม + ล้างธง "ผู้ใช้เลือกแบบเรียงเองระหว่างดูคิว"
     (คิวเปิดมาเรียงค้างนานสุดก่อน — ยามของเรื่องนั้นอยู่ท้ายไฟล์) · ตั้งแต่ 20/10 (M15) เปิดชิปล้างตัวกรองอื่นด้วย — ยามอยู่เทสต์ M15 ถัดไป */
  assert.match(block, /onClick=\{toggleServiceSetupPending\}/);
  const toggle = slice(page, 'const toggleServiceSetupPending = () => {', '\n  };');
  assert.match(toggle, /^\s*const toggleServiceSetupPending = \(\) => \{\s*setQueueSortChosen\(false\);/, 'เปิด/ปิด = เริ่มนับการเลือกแบบเรียงใหม่');
  assert.match(toggle, /if \(serviceSetupPendingOnly\) \{ setServiceSetupPendingOnly\(false\); return; \}/, 'ปิด = ถอดธงเฉย ๆ');
  assert.match(block, /ยังไม่ตั้งงานบริการ/);
  assert.match(block, /<CountBadge count=\{serviceSetupPendingCount\}/);
  assert.match(page, /import CountBadge from "@\/components\/ui\/CountBadge";/);
});

/* ══ "ค้าง n วัน" บนทะเบียนใบสั่งขาย (มติเจ้าของ 08/10 "ตามงานค้าง") ══════════════════════════════════════════════════════════
   ตรวจข้อมูลจริง 08/10: 59 ใบสายบริการอนุมัติแล้วงานยังไม่ถึง TS (58 รอฝ่ายขาย · 1 รอผู้จัดการ) นานสุด 56 วัน — ไม่มีจอไหนบอกอายุ
   ⭐ ก้อนอายุติดที่ server (ตัวตัดสินเดียว + วันไทยของ server) · จอวาดชิปตัวเดียว (`ServiceAgingChip`) และไม่พิมพ์คำเอง
   ผิวของหน้านี้: แถวตาราง (= คิวของฝ่ายขายหลังชิป "ยังไม่ตั้งงานบริการ" และตัวกรอง "รอฉันลงมือ") · แถวคิวของผู้จัดการ · บรรทัดสรุป · คำค้น · ตัวเลือกเรียง */
test('ตามงานค้าง: ก้อนอายุของแถวติดที่ server — ฐานเดียวกับชิป "ยังไม่ตั้งงานบริการ" · วันนี้ของ server · ไม่มีคำสั่งอ่านเพิ่ม', () => {
  const orders = read('app/api/sales-planning/sales-orders/route.js');
  assert.ok(orders.includes('serviceAging: setupPendingIds.has(row.id) ? serviceBackfillAging(row, { todayIso }) : null,'),
    'ใบที่มีอะไรให้ตั้งจริง (D25) เท่านั้นที่มีก้อนอายุ — ชุดเดียวกับ _serviceSetupPending และเลนเจ้าของดีล');
  assert.match(orders, /import \{[^}]*\bserviceBackfillAging\b[^}]*\} from '@\/lib\/sales\/serviceSetup';/);
  /* "วันนี้" = วันไทยตัวเดียวกับที่ route ใช้ตัดสินงวดเลยกำหนด — ประกาศครั้งเดียว ก่อนประกอบแถว */
  assert.equal(orders.split('const todayIso = businessDate();').length - 1, 1);
  assert.ok(orders.indexOf('const todayIso = businessDate();') < orders.indexOf('serviceAging: setupPendingIds.has(row.id)'));
  /* นาฬิกาทั้งสี่ (approvedAt · serviceSetupSubmittedAt / RejectedAt / ReopenedAt) มากับ select('*') ของใบอยู่แล้ว */
  assert.match(orders, /\.from\('sales_orders'\)\s*(?:\/\*[^*]*\*\/\s*)?\.select\('\*'\)/);
  assert.doesNotMatch(orders, /serviceSetupState\s*[!=]==/, 'ยังไม่อ่าน serviceSetupState เอง (D28) — ใครถืองานถามตัวตัดสิน');
  assert.doesNotMatch(orders, /ค้าง \$\{|'ค้าง /, 'route ไม่พิมพ์คำของชิปเอง');
});

test('ตามงานค้าง: แถวตารางมีบรรทัด "ชิป + งานบริการ · รอใคร" · อยู่ในคำค้น · จอไม่พิมพ์คำ/ไม่อ่านนาฬิกาเอง', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  assert.match(page, /import ServiceAgingChip from "@\/components\/salesPlanning\/ServiceAgingChip";/);
  assert.match(page, /import \{\s*SERVICE_BACKFILL_AGING_TEXT, compareLongestWaiting, longestWaitingFirst, serviceAgingSummaryText,\s*\} from "@\/lib\/sales\/serviceBackfillAging";/);
  assert.doesNotMatch(page, /from "@\/lib\/sales\/serviceSetup"/, 'ทะเบียนฝั่งจอไม่พก serviceSetup.js ทั้งก้อน — ดึงไฟล์ใบไม้');

  /* บรรทัดรองของเซลล์เอกสาร — ใต้รางขั้น (หรือป้ายยกเลิก) · เฉพาะแถวที่ server ติดก้อนอายุ
     ⚠️ ต้องมีคำบอกว่าเป็นเรื่องงานบริการและค้างที่ใคร: แถวเดียวกันมีกำหนดชำระ — "ค้าง n วัน" ลอย ๆ อ่านเป็นค้างชำระ */
  const row = slice(page, 'const orderRow = (row) => {', '\n  };\n');
  assert.match(row, /\{row\.serviceAging \? \(\s*<span className="cell-sub mt-1\.5">\s*<ServiceAgingChip aging=\{row\.serviceAging\} \/>\{" "\}\s*<span>\{SERVICE_BACKFILL_AGING_TEXT\.rowLabel\[row\.serviceAging\.waitingOn\]\}<\/span>\s*<\/span>\s*\) : null\}/);
  assert.ok(row.indexOf('<StepTrack steps={track.steps} />') < row.indexOf('{row.serviceAging ? ('), 'อยู่ใต้รางขั้นของใบ');
  assert.ok(row.indexOf('{row.serviceAging ? (') < row.indexOf('{row.customerArCode ?'), 'อยู่ในเซลล์แรก (เอกสาร / ความคืบหน้า) — เห็นโดยไม่ต้องเลื่อนตาราง');
  assert.equal((page.match(/<ServiceAgingChip /g) || []).length, 2, 'แถวตาราง + แถวคิวผู้จัดการ');
  for (const who of ['sales', 'manager']) assert.equal(typeof SERVICE_BACKFILL_AGING_TEXT.rowLabel[who], 'string');

  /* คำค้น: ป้าย + คำข้างป้าย ต่อท้ายชุดเดิม (ชุดเดิมไม่ถูกแทรก — ยามของเลขเอกสารเดิมยังยึดรูปเดิมอยู่) */
  const memo = slice(page, 'const filtered = useMemo(', '\n\n');
  /* + บรรทัดรอง "Actual รายงวด · นับแล้ว …" ใต้ยอด (review 26/10) ต่อท้ายอีกก้อน — ชุดเดิมยังไม่ถูกแทรก */
  assert.match(memo, /\.\.\.historicalRefsOf\(row\)\]\s*\.concat\(row\.serviceAging\?\.label, row\.serviceAging \? SERVICE_BACKFILL_AGING_TEXT\.rowLabel\[row\.serviceAging\.waitingOn\] : null\)\s*(?:\/\/[^\n]*\s*)?\.concat\(installmentActualSubLine\(row\)\)\s*\.some\(/);
  assert.match(page, /placeholder="ค้นหาเลข SO \/ QT \/ ลูกค้า \/ AR \/ ดีล \/ เอกสารอ้างอิง \/ เลขเดิม"/, 'คำใบ้ของช่องค้นหาไม่เปลี่ยน');

  /* จอไม่พิมพ์คำของเรื่องนี้เอง (คอมเมนต์ไม่นับ) และไม่อ่านนาฬิกา */
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
  assert.doesNotMatch(code, /ค้าง/, 'คำ "ค้าง…" ทั้งหมดมาจาก SERVICE_BACKFILL_AGING_TEXT');
  assert.doesNotMatch(code, /new Date\(\)|Date\.now\(|businessDate/, 'ก้อนอายุคิดที่ server ด้วยวันไทย');
});

test('ตามงานค้าง: คิวผู้จัดการ — แถวงานบริการรอตรวจมีชิป และเรียงค้างนานสุดก่อนในช่องของตัวเอง · ใบรออนุมัติไม่ขยับ · เปลือกบัญชีไม่เรียง', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  const memo = slice(page, 'const approvalQueue = useMemo(', '\n  );');
  assert.match(memo, /const list = rows\.filter\(\(row\) => \(financeShell \? row\._awaitingFinanceReview : \(row\._awaitingMyApproval \|\| row\._awaitingMyServiceReview\)\)\);/);
  assert.match(memo, /return financeShell \? list : longestWaitingFirst\(list, \(row\) => \(row\._awaitingMyServiceReview \? row\.serviceAging : null\)\);/,
    'เรียงเฉพาะแถวงานบริการรอตรวจ (คีย์จากธงของ server) — แถวอื่นอยู่ช่องเดิม');
  assert.match(memo, /\[rows, financeShell\]/);

  /* ช่อง badge อยู่ระหว่าง rowHref กับ renderAction · บรรทัดหลัก/รองของคิวไม่ถูกแตะ (ยามข้างบนยึดไว้ตัวอักษรต่อตัวอักษร) */
  const queue = slice(page, '<ApprovalQueue', 'renderAction=');
  assert.match(queue, /rowHref=\{queueHref\}[\s\S]*badge=\{\(o\) => \(serviceReviewRow\(o\) \? <ServiceAgingChip aging=\{o\.serviceAging\} \/> : null\)\}\s*$/);
  /* แถว "งวดรออนุมัติ" (ใบ Actual รายงวด) ไปแท็บการชำระตรง ๆ — ปุ่มอนุมัติงวดอยู่ที่นั่นที่เดียว (review 26/10) · แถวอื่นลิงก์เดิม */
  /* + แถวเลนเจ้าของดีล (มีงวดยื่นขอนับได้แล้ว · ธง `_installmentReadyForMe` ของ server) ไปแท็บการชำระด้วย — ทั้งคิวและแถวตารางหลัก (review รอบสอง 26/10) */
  assert.match(page, /const installmentTabRow = \(o\) => installmentReviewRow\(o\) \|\| \(!financeShell && !!o\._installmentReadyForMe\);/);
  assert.match(page, /const queueHref = \(o\) => \(installmentTabRow\(o\) \? `\/sa\/sales-orders\/\$\{o\.id\}\?tab=payment` : `\/sa\/sales-orders\/\$\{o\.id\}`\);/);
  assert.match(page, /<DetailRow key=\{row\.id\} href=\{queueHref\(row\)\} className="premium-row">/);
  assert.match(page, /<Link prefetch=\{false\} href=\{queueHref\(row\)\} className="linklike mono"><strong>\{row\.orderNumber\}<\/strong><\/Link>/);
  const api = read('app/api/sales-planning/sales-orders/route.js');
  assert.match(api, /installmentActualReadyForOwner\(\{ \.\.\.row, deal: dealById\.get\(row\.dealId\) \|\| null \},\s*actualInstallmentsOf\(row\) \|\| \[\], \{ userId: user\.id \}\)\s*\? \{ _installmentReadyForMe: true \}/,
    'ธงของแถวมาจากตัวตัดสินเดียวกับเลนเจ้าของดีลของ "รอฉันลงมือ"');
  assert.match(page, /<Button as=\{Link\} href=\{queueHref\(o\)\} tone="primary" size="sm">/);

  /* คิวกลาง: ช่องเสริม — ไม่ส่ง = DOM เดิม (อีกสี่ทะเบียนไม่ส่ง) · ป้ายอยู่ในลิงก์ของแถว หลังบรรทัดหลัก ก่อนบรรทัดรอง */
  const shared = read('components/ui/ApprovalQueue.js');
  assert.match(shared, /items, onDecide, renderAction, primary, secondary, rowHref, badge,/);
  assert.match(shared, /const extra = badge \? badge\(rec\) : null;/);
  assert.match(shared, /<strong className="code">\{primary\(rec\)\}<\/strong>\{" "\}\s*\{extra \? <>\{extra\}\{" "\}<\/> : null\}\s*<span className="name">\{secondary\(rec\)\}<\/span>/);
  assert.doesNotMatch(shared, /badge = /, 'ไม่มีค่าตั้งต้น — ไม่ส่งคือ undefined');
  for (const other of [
    'app/database/customers/page.js', 'app/database/products/page.js',
    'app/sales-planning/quotations/page.js', 'app/sales-planning/contracts/page.js',
  ]) {
    assert.doesNotMatch(read(other), /<ApprovalQueue[\s\S]{0,1200}\bbadge=/, `${other} ไม่ส่งช่องเสริม — หน้าตาคิวเดิม`);
  }
});

test('ตามงานค้าง: ตัวเลือกเรียง "งานบริการค้างนานสุด" — ค่าตั้งต้นของตารางและตัวเลือกเดิมไม่เปลี่ยน · ใบที่ไม่มีนาฬิกาอยู่ท้ายทั้งสองทิศ', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  assert.match(page, /const SORT_DEFAULT = "recent";/, 'ลำดับตั้งต้นของตารางยังเป็น "ล่าสุด" (ไม่เปลี่ยนลำดับที่ผู้ใช้เลือก)');
  const options = slice(page, 'const SORT_OPTIONS = [', '];');
  assert.deepEqual([...options.matchAll(/value: "(\w+)"/g)].map((m) => m[1]), ['recent', 'order', 'customer', 'actual', 'due', 'waiting'], 'ตัวใหม่ต่อท้าย');
  assert.match(options, /\{ value: "waiting", label: SERVICE_BACKFILL_AGING_TEXT\.sortLabel, dir: "desc" \}/);
  assert.equal(SERVICE_BACKFILL_AGING_TEXT.sortLabel, 'งานบริการค้างนานสุด');

  const compare = slice(page, 'function compareOrders(', '\n}\n');
  const branch = compare.slice(compare.indexOf('key === "waiting"'));
  assert.ok(branch.length > 0, 'ต้องมีกิ่งของตัวเลือกใหม่');
  assert.match(branch, /const aClock = a\.serviceAging\?\.since \|\| null;\s*const bClock = b\.serviceAging\?\.since \|\| null;/);
  assert.match(branch, /if \(!aClock !== !bClock\) return aClock \? -1 : 1;/, 'ไม่มีนาฬิกา = ท้ายเสมอ (ไม่คูณทิศ) — กติกาเดียวกับ "กำหนดชำระ"');
  assert.match(branch, /const byClock = compareLongestWaiting\(a\.serviceAging, b\.serviceAging\);\s*if \(byClock\) return dir === "desc" \? byClock : -byClock;/,
    'มากไปน้อย = ค้างนานสุดก่อน · ตัวเทียบเดียวกับคิวผู้จัดการและแท็บ TS');
  assert.match(compare, /const byOrder = text\(a\.orderNumber\)\.localeCompare\(text\(b\.orderNumber\), "th"\);\s*return key === "order" \? byOrder \* mul : byOrder;/, 'ตัวตัดสินเสมอเดิม');
  /* กิ่งเดิมของ "กำหนดชำระ" ไม่ถูกแตะ */
  assert.match(compare, /if \(!aDue !== !bDue\) return aDue \? -1 : 1;/);
});

test('ตามงานค้าง: บรรทัดสรุปของคิวขึ้นแทนคำอธิบายของแผงเฉพาะตอนเปิดชิป "ยังไม่ตั้งงานบริการ" · ฐานเดียวกับเลขบนชิป · ไม่มีแผงใหม่', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  assert.match(page, /const serviceAgingSummary = useMemo\(\s*\(\) => serviceAgingSummaryText\(serviceSetupPendingCount, rows\.filter\(\(row\) => row\._serviceSetupPending\)\.map\(\(row\) => row\.serviceAging\)\),\s*\[rows, serviceSetupPendingCount\],\s*\);/);
  const panel = slice(page, '<ListPanel', 'toolbar={(');
  assert.match(panel, /subtitle=\{serviceSetupPendingOnly && serviceAgingSummary \? serviceAgingSummary : "ค้นหา ตรวจเอกสาร และติดตามขั้นตอนอนุมัติจากจุดเดียว"\}/);
  assert.equal((page.match(/<ListPanel\b/g) || []).length, 1, 'ไม่เพิ่มแผง');
  assert.equal((page.match(/<SaMetric\s/g) || []).length, 4, 'ไม่เพิ่มการ์ดสรุปบนหัวหน้า');
});

/* ผลตรวจทาน 08/10 (หลังเห็นจอจริงกับข้อมูลจริง): เปิดชิป "ยังไม่ตั้งงานบริการ" แล้วตารางยังเรียง "ล่าสุด" — หน้าแรก (25 ใบ) มีแต่ใบที่ค้าง
   7–20 วัน · ใบที่ค้างตั้งแต่ 30 วันทั้ง 25 ใบอยู่หน้า 2–3 · ใบ 56 วันเป็นแถวที่ 58 จาก 59 ทั้งที่บรรทัดสรุปของแผงเดียวกันบอก "ค้างนานสุด 56 วัน"
   ⇒ คิวงานบริการ (ชิปเปิดอยู่) เปิดมาเรียงค้างนานสุดก่อน และเมนูเรียงโชว์ตัวเลือกนั้น · ลำดับที่ผู้ใช้เลือกเองไม่ถูกทับ
   ⚠️ เฉพาะชิป — ตัวกรอง "รอฉันลงมือ" อย่างเดียวเป็นคิวผสม (ใบถูกตีกลับ/ถูกย้อนอนุมัติอยู่ด้วย) ยังเรียงตามเดิม */
test('ตามงานค้าง: คิวงานบริการ (ชิป "ยังไม่ตั้งงานบริการ" เปิด) เปิดมาเรียงค้างนานสุดก่อน · เมนูเรียง/ปุ่มทิศแสดงลำดับที่ใช้จริง · ไม่ทับลำดับที่ผู้ใช้เลือก', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  assert.match(page, /const SERVICE_QUEUE_SORT = "waiting";/);
  assert.match(page, /const \[queueSortChosen, setQueueSortChosen\] = useStickyState\("serviceQueueSortChosen", false\);/, 'จำคู่กับแบบเรียง (กดย้อนกลับมาได้ค่าเดิม)');
  /* ใช้ค่าตั้งต้นของคิวเฉพาะเมื่อ: ชิปเปิด + แบบเรียงยังเป็นค่าตั้งต้น + ผู้ใช้ยังไม่ได้เลือกเองระหว่างดูคิว */
  assert.match(page, /const queueSortAuto = serviceSetupPendingOnly && sortKey === SORT_DEFAULT && !queueSortChosen;/);
  assert.doesNotMatch(slice(page, 'const queueSortAuto =', ';'), /waitingOnMeOnly/, 'ตัวกรอง "รอฉันลงมือ" อย่างเดียวไม่เปลี่ยนลำดับ (คิวผสม)');
  assert.match(page, /const activeSortKey = queueSortAuto \? SERVICE_QUEUE_SORT : sortKey;/);
  assert.match(page, /const activeSortDir = queueSortAuto \? sortDirOf\(SERVICE_QUEUE_SORT\) : sortDir;/);
  /* ตาราง · การแบ่งหน้า · เมนูเรียง · ปุ่มทิศ ใช้ลำดับเดียวกัน (ไม่มีที่ไหนอ่าน sortKey/sortDir ดิบแล้วเพี้ยนจากที่ตาเห็น) */
  const sorted = slice(page, 'const sorted = useMemo(', '\n\n');
  assert.match(sorted, /if \(activeSortKey === SORT_DEFAULT\) return activeSortDir === "desc" \? \[\.\.\.filtered\]\.reverse\(\) : filtered;/);
  assert.match(sorted, /compareOrders\(a, b, activeSortKey, activeSortDir\)/);
  assert.match(sorted, /\[filtered, activeSortKey, activeSortDir\]/);
  assert.match(slice(page, 'usePagination(sorted', ';'), /\$\{activeSortKey\}\|\$\{activeSortDir\}/, 'เปลี่ยนลำดับ = กลับหน้าแรก');
  const menu = slice(page, '<SortMenu', '/>');
  assert.match(menu, /value=\{activeSortKey\}/, 'เมนูขึ้นตัวเลือกที่ตารางใช้จริง');
  assert.match(menu, /defaultValue=\{SORT_DEFAULT\}/, 'ค่าตั้งต้นของตารางยังเป็น "ล่าสุด" — ปุ่มเรียงติดสีตอนคิวใช้ลำดับของตัวเอง');
  assert.match(menu, /onChange=\{\(value\) => \{ setSortKey\(value\); setSortDir\(sortDirOf\(value\)\); setQueueSortChosen\(serviceSetupPendingOnly\); \}\}/,
    'เลือกเองระหว่างดูคิว (รวมเลือก "ล่าสุด" กลับ) = ใช้ตามที่เลือก');
  const dirButton = slice(page, '<SortDirButton', '/>');
  assert.match(dirButton, /dir=\{activeSortDir\}/);
  assert.match(dirButton, /setSortKey\(activeSortKey\);\s*setSortDir\(activeSortDir === "asc" \? "desc" : "asc"\);\s*setQueueSortChosen\(serviceSetupPendingOnly\);/,
    'กลับทิศ = กลับทิศของลำดับที่เห็นอยู่ (ไม่ใช่ของ "ล่าสุด" ที่ซ่อนอยู่)');
  /* ออกจากคิวทุกทาง (ปุ่มชิป · ล้างตัวกรอง) ล้างธง — เข้าคิวรอบใหม่ได้ค่าตั้งต้นของคิวอีก */
  assert.match(slice(page, 'onClear={() => {', '}}'), /setServiceSetupPendingOnly\(false\); setQueueSortChosen\(false\);/);
  assert.equal(page.split('setQueueSortChosen(').length - 1, 4, 'ปุ่มชิป · ล้างตัวกรอง · เมนูเรียง · ปุ่มทิศ');
  assert.equal(SORT_OPTIONS_DIR('waiting', page), 'desc', 'ทิศตั้งต้นของตัวเลือกนี้ = ค้างนานสุดก่อน');
});

function SORT_OPTIONS_DIR(value, page) {
  const options = slice(page, 'const SORT_OPTIONS = [', '];');
  return new RegExp(`value: "${value}"[^}]*dir: "(\\w+)"`).exec(options)?.[1] || null;
}

/* ══ M15 (ตรวจตัวเลข 2026-10-20 · มติเจ้าของ 20/10 ข้อ 1): ชิป "ยังไม่ตั้งงานบริการ 59" กดแล้วตารางต้องเหลือ 59 ═══════════════════
   เลขบนชิปคงที่ (ทุกใบ · มติ 08/10) ⇒ เปิดชิป = ล้างตัวกรองอื่น **ทุกตัว** รวม "รอฉันลงมือ" · มุมมองสินค้าสลับเป็นบริการ
   🐞 เดิมสลับธงอย่างเดียว — มุมมองสินค้า / สถานะ=รออนุมัติ / ที่มา=ย้อนหลัง / คำค้นที่ค้าง ⇒ 0 แถวทั้งที่ชิปบอก 59 */
test('M15: เปิดชิป "ยังไม่ตั้งงานบริการ" ล้างทุก state ที่ตารางกรอง (รวม "รอฉันลงมือ") · สินค้า → บริการ', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  const toggle = slice(page, 'const toggleServiceSetupPending = () => {', '\n  };');
  const onPath = toggle.slice(toggle.indexOf('return; }') + 'return; }'.length);
  // ทุก state ที่ memo ของตารางอ่าน (dependency) ต้องถูกล้างบนทางเปิด — เพิ่มตัวกรองใหม่แล้วลืมล้าง = เลขบนชิปไม่ตรงอีก
  const memo = slice(page, 'const filtered = useMemo(', '\n\n');
  const deps = /\}, \[([^\]]*)\]\);/.exec(memo)[1].split(',').map((d) => d.trim()).filter(Boolean);
  assert.deepEqual(deps.slice().sort(), ['invoiceFilter', 'lineView', 'originFilter', 'paymentFilter', 'query', 'rows', 'serviceSetupPendingOnly', 'statusFilter', 'waitingOnMeOnly'].sort(),
    'ตัวกรองของตารางเปลี่ยน — ทบทวนว่าเปิดชิปล้างครบไหม แล้วแก้ชุดนี้');
  const CLEARS = {
    query: 'setQuery("")', statusFilter: 'setStatusFilter([])', paymentFilter: 'setPaymentFilter([])',
    invoiceFilter: 'setInvoiceFilter([])', originFilter: 'setOriginFilter([])', waitingOnMeOnly: 'setWaitingOnMeOnly(false)',
  };
  for (const dep of deps) {
    if (dep === 'rows' || dep === 'serviceSetupPendingOnly') continue;
    if (dep === 'lineView') {
      assert.ok(onPath.includes('if (lineView === "PRODUCT") setLineView("SERVICE");'), 'มุมมองสินค้าไม่มีใบของคิวนี้ ⇒ สลับไปบริการ');
      continue;
    }
    assert.ok(onPath.includes(CLEARS[dep]), `เปิดชิปต้องเรียก ${CLEARS[dep]}`);
  }
  assert.ok(onPath.trim().endsWith('setServiceSetupPendingOnly(true);'), 'ตั้งธงหลังล้างตัวกรองเสร็จ');
  // เลขบนชิป + บรรทัดสรุปยังนับจาก rows ทั้งหมด (มติ 08/10 · ไม่หดตาม "รอฉันลงมือ")
  assert.match(page, /const serviceSetupPendingCount = useMemo\(\s*\(\) => rows\.filter\(\(row\) => row\._serviceSetupPending\)\.length,/);
  assert.match(page, /serviceAgingSummaryText\(serviceSetupPendingCount, rows\.filter\(\(row\) => row\._serviceSetupPending\)/);
});

test('M15: ทุกใบที่ขึ้นชิปอนุมัติแล้วและอยู่สาย SERVICE ⇒ หลังเปิดชิป (ตัวกรองว่าง · ทุกสาย/บริการ) แถว = เลขบนชิป', () => {
  const LINES = [[{}], [{ serviceKind: 'package' }], []];
  const rows = [];
  let id = 0;
  for (const status of ['draft', 'pending_approval', 'approved', 'rejected', 'cancelled']) {
    for (const businessLine of ['SERVICE', 'PRODUCT', null]) {
      for (const lines of LINES) {
        for (const supersededById of [null, 'X']) {
          const order = { id: `o${id += 1}`, status, businessLine, lines, supersededById };
          rows.push({ ...order, _serviceSetupPending: serviceBackfillNeeded(order), _waitingOnMe: id % 3 === 0 });
        }
      }
    }
  }
  const chip = rows.filter((row) => row._serviceSetupPending);
  assert.ok(chip.length > 0, 'ชุดทดสอบต้องมีใบที่ขึ้นชิป');
  for (const row of chip) {
    assert.equal(row.status, 'approved');
    assert.equal(row.businessLine, 'SERVICE');
  }
  /* ตัวตัดสินของตาราง (ลำดับเดียวกับ memo `filtered`) หลังเปิดชิป: คำค้น/สถานะ/การชำระ/ใบกำกับ/ที่มา ว่าง · "รอฉันลงมือ" ปิด */
  const tableAfterChip = (lineView) => rows.filter((row) => row._serviceSetupPending
    && (lineView === 'all' || row.businessLine === lineView));
  for (const before of ['all', 'PRODUCT', 'SERVICE']) {
    const after = before === 'PRODUCT' ? 'SERVICE' : before;
    assert.equal(tableAfterChip(after).length, chip.length, `มุมมอง ${before}`);
  }
  // 🐞 ของเดิม: คง "รอฉันลงมือ" / มุมมองสินค้าไว้ ⇒ น้อยกว่าเลขบนชิป
  assert.ok(chip.filter((row) => row._waitingOnMe).length < chip.length);
  assert.equal(tableAfterChip('PRODUCT').length, 0);
});

/* ══ M16 (ตรวจตัวเลข 2026-10-20): แถบ "ใบเสนอราคา Won n ใบยังไม่ได้ออก ใบสั่งขาย" บน /sa/quotations ═════════════════════════
   a. "ดูเฉพาะใบที่ค้าง" ต้องเหลือ n แถว — ล้างคำค้น/ตัวกรองทุกตัว รวม "รอฉันลงมือ"
   b. ตัวกรองนี้ต้องถอดได้จากแถบเครื่องมือ (แถบหายเมื่อใบค้างใบสุดท้ายออก SO แล้ว)
   c. ยังไม่รู้รายการ SO (กำลังโหลด/โหลดพัง) = ไม่ตัดสิน — ไม่ใช่ "ทุกใบ Won ยังไม่มี SO" */
test('M16a: หน้าใช้ตัวตัดสินจาก lib ตรง ๆ · "ดูเฉพาะใบที่ค้าง" ตั้ง QUOTATION_AWAITING_SO_PICK ทั้งชุด — ทุกมิติที่ตารางกรอง', () => {
  /* พฤติกรรม (แถวหลังกด = เลขบนแถบ ทุกชุดตัวกรองที่ค้าง · ของเดิมได้ 0 แถวเมื่อมาจากป้ายเมนู) พิสูจน์กับตัวจริงใน
     quotationListFilter.test.mjs · ยามนี้ผูกหน้าเข้ากับตัวนั้น: memo ของตารางเรียก `quotationPassesListFilters` · ทุกคีย์ของ
     ตัวกรองมาจาก state หนึ่งตัว · `applyQuotationPick` ตั้ง state ทุกตัวนั้นจาก pick */
  const page = read('app/sales-planning/quotations/page.js');
  assert.match(page, /import \{ QUOTATION_AWAITING_SO_PICK, awaitingSalesOrderIdSet, quotationPassesListFilters \} from "@\/lib\/sales\/quotationListFilter";/);
  const memo = slice(page, 'const filtered = useMemo(', '\n\n');
  assert.match(memo, /return rows\.filter\(\(r\) => quotationPassesListFilters\(r, filters, ctx\)\);/);
  assert.match(memo, /const ctx = \{ awaitingIds: awaitingSalesOrderIds, ownerNameOf \};/);
  assert.doesNotMatch(memo, /\.has\(r\.id\)|\.includes\(q\)|toLowerCase/, 'ห้ามเขียนเงื่อนไขกรองซ้ำในหน้า');
  // คีย์ของตัวกรองในหน้า = คีย์ของ EMPTY_QUOTATION_FILTERS ครบ (เพิ่มมิติใหม่แล้วลืมใส่ pick/ลืมล้าง = แดง)
  const literal = slice(memo, 'const filters = {', '};');
  const pairs = literal.slice('const filters = {'.length).split(',').map((part) => part.trim()).filter(Boolean)
    .map((part) => { const [key, value] = part.split(':').map((x) => x.trim()); return [key, value || key]; });
  assert.deepEqual(pairs.map(([key]) => key).sort(), Object.keys(EMPTY_QUOTATION_FILTERS).sort());
  // ทุก state ที่ memo อ่าน (dependency) = state ของตัวกรอง + ข้อมูล/บริบท — ไม่มีตัวกรองแอบอยู่นอก filters
  const deps = /\}, \[([^\]]*)\]\);/.exec(memo)[1].split(',').map((d) => d.trim());
  assert.deepEqual(deps.filter((d) => !['rows', 'awaitingSalesOrderIds', 'ownerNameOf'].includes(d)).sort(), pairs.map(([, state]) => state).sort());
  // applyQuotationPick ตั้ง state ทุกตัวจาก pick (pendingSoActive = ธง pendingSoOnly ที่ผ่านด่าน "รู้รายการ SO แล้ว")
  const apply = slice(page, 'const applyQuotationPick = (pick) => {', '\n  };');
  for (const [key, state] of pairs) {
    const setter = state === 'pendingSoActive' ? 'setPendingSoOnly' : `set${state[0].toUpperCase()}${state.slice(1)}`;
    assert.match(apply, new RegExp(`${setter}\\((\\[\\.\\.\\.)?pick\\.${key}\\]?\\)`), `applyQuotationPick ต้องตั้ง ${state} จาก pick.${key}`);
  }
  assert.match(page, /const showAwaitingSo = \(\) => applyQuotationPick\(QUOTATION_AWAITING_SO_PICK\);/);
  assert.match(slice(page, '<StatusNotice\n            tone="warning"\n            title={`ใบเสนอราคา Won', '</StatusNotice>'),
    /onClick=\{pendingSoActive \? \(\) => setPendingSoOnly\(false\) : showAwaitingSo\}/);
  assert.doesNotMatch(page, /setPendingSoOnly\(\(on\) => !on\)/, 'ห้ามกลับไปสลับธงอย่างเดียว');
  // ธง "รอฉันลงมือ" เปลี่ยนชุดแถว ⇒ กลับหน้า 1
  assert.match(slice(page, 'usePagination(sorted', ';'), /\$\{waitingOnMeOnly\}/);
});

test('M16b: ตัวกรอง "Won ยังไม่ออก SO" ถอดได้จากแถบเครื่องมือ + ล้างตัวกรองล้างให้ · ไม่นับซ้ำในป้ายปุ่มตัวกรอง', () => {
  const page = read('app/sales-planning/quotations/page.js');
  const toolbar = slice(page, 'toolbar={(', '<GroupMenu');
  const chip = slice(toolbar, '{pendingSoActive && (', '</Button>');
  assert.match(chip, /onClick=\{\(\) => setPendingSoOnly\(false\)\}/);
  assert.match(chip, /กรอง: Won ยังไม่ออก SO ×/);
  assert.ok(toolbar.indexOf('กรอง: รอฉันลงมือ ×') < toolbar.indexOf('กรอง: Won ยังไม่ออก SO ×'), 'อยู่ข้างชิป "รอฉันลงมือ"');
  assert.match(slice(toolbar, 'onClear={() => {', '}}'), /setPendingSoOnly\(false\)/);
  assert.doesNotMatch(slice(toolbar, '<FilterPopover', 'onClear'), /pendingSo/, 'ชิปเห็นบนแถบเองอยู่แล้ว — ไม่นับซ้ำ');
});

test('M16c: ยังไม่รู้รายการ SO (null) = ไม่ตัดสิน — หน้าเก็บ null จนโหลดสำเร็จ · ชุดค้างมาจาก awaitingSalesOrderIdSet', () => {
  // พฤติกรรม null/[]/บางส่วน พิสูจน์ใน quotationListFilter.test.mjs — ยามนี้ผูกหน้าให้ส่ง null จริงตอนยังไม่รู้
  const page = read('app/sales-planning/quotations/page.js');
  assert.match(page, /const \[salesOrders, setSalesOrders\] = useState\(null\);/, 'ตั้งต้น = ยังไม่รู้ ไม่ใช่ []');
  assert.doesNotMatch(page, /salesOrdersReady/, 'สถานะ "รู้แล้ว" มาจาก salesOrders !== null ตัวเดียว');
  const fetchBlock = slice(page, 'apiFetch("/api/sales-planning/sales-orders")', '.catch(');
  assert.match(fetchBlock, /\(res\.ok \? res\.json\(\) : null\)/, 'โหลดพัง ≠ รายการว่าง');
  assert.match(fetchBlock, /\.then\(\(data\) => \{ if \(alive && Array\.isArray\(data\)\) setSalesOrders\(data\); \}\)/);
  assert.equal((page.match(/setSalesOrders\(/g) || []).length, 1, 'ตั้งรายการ SO ที่เดียว (หลังโหลดสำเร็จ)');
  assert.match(page, /const awaitingSalesOrderIds = useMemo\(\s*\(\) => awaitingSalesOrderIdSet\(rows, salesOrders\),\s*\[rows, salesOrders\],\s*\);/);
  assert.match(page, /const pendingSoActive = pendingSoOnly && salesOrders !== null;/);
  assert.match(page, /\{awaitingSalesOrderIds\.size > 0 && \(/, 'แถบขึ้นจากชุดที่ผ่านด่าน "รู้รายการ SO แล้ว" เท่านั้น');
});
