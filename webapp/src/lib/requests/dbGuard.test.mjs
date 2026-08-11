// ข้อความของ trigger `guard_dept_request` ต้องถึงผู้ใช้เป็นภาษาไทย
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestGuardMessage } from './dbGuard.js';

test('รหัสของ guard ทั้งสามตัวมีข้อความไทย', () => {
  for (const code of [
    'dept_request_doc_no_immutable',
    'dept_request_delete_forbidden',
    'dept_request_cancelled_immutable',
  ]) {
    const msg = requestGuardMessage(new Error(code));
    assert.ok(msg, `${code} ต้องมีข้อความ`);
    assert.ok(!msg.includes('dept_request'), `${code} ต้องไม่หลุดรหัสดิบขึ้นจอ`);
  }
});

test('อ่านรหัสที่ postgres ห่อไว้ในข้อความยาวออก', () => {
  const raw = new Error('unexpected error: dept_request_doc_no_immutable (PL/pgSQL function guard_dept_request())');
  assert.match(requestGuardMessage(raw), /เลขที่/);
});

test('รับทั้ง Error และ object ของ supabase ({ message })', () => {
  assert.ok(requestGuardMessage({ message: 'dept_request_delete_forbidden' }));
  assert.ok(requestGuardMessage('dept_request_delete_forbidden'));
});

test('error อื่นคืน null — ผู้เรียกต้องใช้ข้อความเดิมต่อ ไม่ใช่กลบด้วยข้อความมั่ว', () => {
  assert.equal(requestGuardMessage(new Error('duplicate key value violates unique constraint')), null);
  assert.equal(requestGuardMessage(null), null);
  assert.equal(requestGuardMessage(undefined), null);
  assert.equal(requestGuardMessage(''), null);
});
