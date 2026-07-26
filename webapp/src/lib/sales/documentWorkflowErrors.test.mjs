import assert from 'node:assert/strict';
import test from 'node:test';
import { documentWorkflowError } from './documentWorkflowErrors.js';

// error ที่ RPC ตีกลับ (mig 0164) โยนออกมา ต้องมีในตารางแปล ไม่ใช่ตกไปข้อความกลาง 500
test('QT rejection errors are translated, not swallowed by the generic 500', () => {
  assert.deepEqual(documentWorkflowError(new Error('quotation_reject_forbidden')), {
    code: 'quotation_reject_forbidden',
    message: 'ตีกลับได้เฉพาะผู้อนุมัติของใบเสนอราคานี้',
    status: 403,
  });
  assert.deepEqual(documentWorkflowError({ message: 'P0001: quotation_reject_state_invalid' }), {
    code: 'quotation_reject_state_invalid',
    message: 'ตีกลับได้เฉพาะใบเสนอราคาที่กำลังรออนุมัติ',
    status: 409,
  });
});

test('document workflow database errors become stable Thai HTTP responses', () => {
  assert.deepEqual(
    documentWorkflowError(new Error('quotation_withdraw_forbidden')),
    {
      code: 'quotation_withdraw_forbidden',
      message: 'ดึงกลับได้เฉพาะผู้ยื่นเอกสารเอง',
      status: 403,
    },
  );
  const filingBlocked = documentWorkflowError({ message: 'P0001: sales_order_revision_filing_exists' });
  assert.equal(filingBlocked.code, 'sales_order_revision_filing_exists');
  assert.equal(filingBlocked.status, 409);
  // ด่านนี้เด้งตั้งแต่ขั้น "ยกเลิกอนุมัติ" (mig 0166) ไม่ใช่ขั้นออก Rev. — ข้อความจึงห้าม
  // พูดถึงแค่ Rev. และต้องบอกทางออก ไม่งั้นผู้ใช้วนหาปุ่มไม่เจอ (ทุกปุ่มถูกใบยื่นบล็อกหมด)
  assert.match(filingBlocked.message, /ใบยื่นชำระภาษี/);
  assert.match(filingBlocked.message, /ลบใบยื่น/);
});
// A3 (2026-07-26): error ที่ไม่รู้จักเคยส่งข้อความ Postgres ดิบออกหน้าเว็บ — ชื่อ constraint
// และค่าในแถวหลุดให้ผู้ใช้เห็น ตอนนี้ต้องเป็นข้อความกลาง + log ตัวจริงฝั่ง server
test('unknown document workflow errors stay generic and never leak Postgres detail', () => {
  const raw = 'insert or update on table "sales_orders" violates foreign key constraint '
    + '"sales_orders_supersededById_fkey" DETAIL: Key (id)=(SO-26070001) is still referenced.';
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args);
  let result;
  try {
    result = documentWorkflowError(new Error(raw), { context: 'sales order revise' });
  } finally {
    console.error = original;
  }

  assert.equal(result.status, 500);
  assert.equal(result.code, undefined);
  assert.doesNotMatch(result.message, /constraint|fkey|sales_orders|SO-26070001/);
  assert.match(result.message, /ผู้ดูแลระบบ/);
  // ตัวจริงต้องไปโผล่ฝั่ง server ไม่ใช่หายไปเฉย ๆ
  assert.equal(logged.length, 1);
  assert.match(String(logged[0][0]), /sales order revise/);
  assert.equal(logged[0][1].message, raw);
});
