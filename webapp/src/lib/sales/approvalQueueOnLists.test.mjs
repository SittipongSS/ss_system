import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isQuotationAwaitingMyApproval, isQuotationWaitingOnMe } from './quotationWorkflow.js';
import { isSalesOrderWaitingOnMe } from './salesOrderWorkflow.js';
import { isSalesOrderSelfApproval } from './salesOrderApprovalOverride.js';
import { serviceBackfillAwaitingReview } from './serviceSetup.js';

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
  assert.match(orders, /_awaitingMyApproval: isSalesOrderReviewer\(user\.role\)/);
  assert.match(orders, /!isSalesOrderSelfApproval\(row, user\.id\)/, 'ใบของตัวเองต้องถูกตัดที่ server');
  // ธง "รอฉันลงมือ" ต้องส่ง role ตัวเดียวกับที่ป้ายบนเมนูส่ง — ไม่งั้น admin เห็นลิสต์กับป้ายไม่ตรงกัน
  // ⭐ แถวต้องแนบ deal — ใบที่ถูกย้อนอนุมัติตัดสินจากเจ้าของดีล (มติ 24/09) · ไม่แนบ = ลิสต์ไม่ตรงป้ายบนเมนู
  /* ⭐ เลนงานบริการย้อนหลัง (mig 0392 · D26) — helper ต้องรู้ว่าใบนี้ **ต้องตั้งจริง** (`serviceBackfillNeeded` ใช้บรรทัด
     + สายธุรกิจ ซึ่ง helper ไม่มี) ⇒ route คิดครั้งเดียวแล้วส่งเข้าไป · ป้ายบนเมนูคิดแบบเดียวกัน */
  /* ⭐ ใบที่สายเปลี่ยนเป็นอย่างอื่นระหว่างรอตรวจงานบริการ ไม่ใช่งานของผู้ตรวจ (RPC อนุมัติปฏิเสธ · หน้าใบไม่มีปุ่ม) ⇒ ตัดเลนผู้ตรวจ */
  assert.match(orders, /_waitingOnMe: isSalesOrderWaitingOnMe\(\{ \.\.\.row, deal: dealById\.get\(row\.dealId\) \|\| null \}, \{\s*userId: user\.id, reviewer: reviewer && !staleServiceReview\(row\), role: user\.role,\s*serviceBackfillNeeded: setupPendingIds\.has\(row\.id\),\s*\}\)/);
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
  assert.match(queue, /primary=\{\(o\) => \(serviceReviewRow\(o\) \? `\$\{SERVICE_REVIEW_LABEL\} · \$\{o\.orderNumber\}` : o\.orderNumber\)\}/);
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
  assert.match(memo, /if \(serviceSetupPendingOnly && !row\._serviceSetupPending\) return false;/);
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
  assert.match(block, /onClick=\{\(\) => setServiceSetupPendingOnly\(\(on\) => !on\)\}/);
  assert.match(block, /ยังไม่ตั้งงานบริการ/);
  assert.match(block, /<CountBadge count=\{serviceSetupPendingCount\}/);
  assert.match(page, /import CountBadge from "@\/components\/ui\/CountBadge";/);
});
