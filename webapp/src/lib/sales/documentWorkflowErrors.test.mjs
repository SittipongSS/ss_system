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
test('unknown document workflow errors remain server errors', () => {
  assert.deepEqual(
    documentWorkflowError(new Error('database unavailable')),
    { message: 'database unavailable', status: 500 },
  );
});
