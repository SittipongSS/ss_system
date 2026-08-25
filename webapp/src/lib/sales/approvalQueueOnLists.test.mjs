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
});

test('ทะเบียนทั้งสี่ใช้คิวตัวเดียวกัน และเอกสารขายกดเปิดใบ ไม่ใช่ติ๊กอนุมัติในลิสต์', () => {
  const shared = 'components/ui/ApprovalQueue.js';
  for (const page of [
    'app/database/customers/page.js',
    'app/database/products/page.js',
    'app/sales-planning/quotations/page.js',
    'app/sales-planning/sales-orders/page.js',
  ]) {
    assert.match(read(page), /import ApprovalQueue from "@\/components\/ui\/ApprovalQueue"/, `${page} ต้องใช้คิวกลาง`);
  }
  /* 🛑 การอนุมัติ QT/SO ตรึงลายเซ็นผู้อนุมัติกับ fingerprint ของเนื้อใบ และโมดัลยืนยัน
     ต้องบอกผลลัพธ์ (ยอด Actual · งวดชำระ) ⇒ ตัดสินในลิสต์ไม่ได้ ต้องเปิดใบก่อน */
  for (const page of ['app/sales-planning/quotations/page.js', 'app/sales-planning/sales-orders/page.js']) {
    const src = read(page);
    assert.match(src, /renderAction=\{/, `${page} ต้องส่งปุ่มของตัวเอง`);
    assert.doesNotMatch(src, /<ApprovalQueue[\s\S]{0,400}onDecide=/, `${page} ต้องไม่ตัดสินอนุมัติจากลิสต์`);
  }
  assert.match(read(shared), /renderAction \? renderAction\(rec\)/, 'คิวกลางต้องรองรับทั้งสองโหมด');
});
