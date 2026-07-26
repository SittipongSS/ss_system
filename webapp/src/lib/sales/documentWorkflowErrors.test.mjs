import assert from 'node:assert/strict';
import test from 'node:test';
import { documentWorkflowError } from './documentWorkflowErrors.js';

test('document workflow database errors become stable Thai HTTP responses', () => {
  assert.deepEqual(
    documentWorkflowError(new Error('quotation_withdraw_forbidden')),
    {
      code: 'quotation_withdraw_forbidden',
      message: 'ถอนการยื่นได้เฉพาะผู้ยื่นหรือผู้อนุมัติ',
      status: 403,
    },
  );
  assert.deepEqual(
    documentWorkflowError({ message: 'P0001: sales_order_revision_filing_exists' }),
    {
      code: 'sales_order_revision_filing_exists',
      message: 'ออก Revision ไม่ได้ เนื่องจากมีใบยื่นชำระภาษีผูกอยู่',
      status: 409,
    },
  );
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
