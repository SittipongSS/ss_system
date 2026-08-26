import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isQuotationAwaitingMyApproval, isQuotationWaitingOnMe } from './quotationWorkflow.js';
import { isSalesOrderWaitingOnMe } from './salesOrderWorkflow.js';
import { isSalesOrderSelfApproval } from './salesOrderApprovalOverride.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

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
});

test('ธง _awaitingMyApproval ติดที่ server ทั้งสองทะเบียน — จอไม่คำนวณเอง', () => {
  const quotes = read('app/api/sales-planning/quotations/route.js');
  const orders = read('app/api/sales-planning/sales-orders/route.js');
  assert.match(quotes, /_awaitingMyApproval: isQuotationAwaitingMyApproval\(/);
  assert.match(orders, /_awaitingMyApproval: isSalesOrderReviewer\(user\.role\)/);
  assert.match(orders, /!isSalesOrderSelfApproval\(row, user\.id\)/, 'ใบของตัวเองต้องถูกตัดที่ server');
  // แกนที่สองของใบเดียวกัน — ขั้นบัญชีตรวจ (mig 0250)
  assert.match(orders, /_awaitingFinanceReview: canConfirmPayment\(user\) && awaitsFinanceReview\(row\)/);
});

/* ── คิวเดินตามเปลือกของคนดู (มติผู้ใช้ 2026-08-25) ─────────────────────────
   ทะเบียนใบสั่งขายอยู่ในเมนูของทั้งสายขายและฝ่ายบัญชี (SHARED_DOC_ITEMS · 2026-08-22)
   🪤 ถ้าหน้าจอเช็ค role/department เอง วันที่ฝ่ายใหม่ได้เมนูเอกสารร่วมเพิ่ม
   เปลือกกับการ์ดจะเดินหนีกันเงียบ ๆ ⇒ ต้องถามตัวเดียวกับที่เลือกเปลือก */
test('การ์ดบนทะเบียนใบสั่งขายถามเปลือกที่หน้านี้สวมอยู่ ไม่ใช่เช็ค role เอง', () => {
  const page = read('app/sales-planning/sales-orders/page.js');
  assert.match(page, /useShellSystem\(usePathname\(\)\) === "finance"/, 'ต้องถามเปลือกของหน้านี้');
  assert.doesNotMatch(page, /department === ['"]FN['"]|role === ['"]finance['"]/, 'ห้ามเช็คฝ่าย/บทบาทเองในหน้า');
  assert.match(page, /financeShell \? row\._awaitingFinanceReview : row\._awaitingMyApproval/);
  assert.match(page, /financeShell \? "เปิดใบเพื่อตรวจ" : "เปิดใบเพื่ออนุมัติ"/, 'คำบนปุ่มต้องตรงกับงานของคนที่ยืนอยู่');

  /* 🪤 **บ้านของคนดูอย่างเดียวไม่พอ** — RD รับแค่ `/requests` (ADOPTED_SHARED_PATHS)
     ⇒ RD ที่เปิดทะเบียนใบสั่งขายยังอยู่ในเปลือกงานขาย · ถ้าตัดสินด้วย home ลอย ๆ
     วันที่ลิสต์การรับเปลี่ยน เนื้อหาจะพูดภาษาเปลือกที่ไม่ได้ครอบมันอยู่ */
  const ctx = read('lib/roleContext.js');
  assert.match(ctx, /export function useShellSystem\(pathname\)/);
  assert.match(ctx, /adoptsPathname\(home, pathname\)/, 'ต้องเช็คลิสต์เส้นทางที่บ้านนั้นรับไปด้วย');
  assert.match(ctx, /homeSystemForUser\(\{ role, department \}\)/, 'hook ต้องเรียกตัวเดียวกับ config/navigation');
  const nav = read('config/navigation.js');
  assert.match(nav, /homeSystemForUser\(user\)/, 'เมนูยังตัดสินด้วยฟังก์ชันเดิม');
  assert.match(nav, /rd: \['\/requests'\]/, 'RD รับแค่ใบคำร้อง — เอกสารขายยังเป็นเปลือกงานขาย');
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
