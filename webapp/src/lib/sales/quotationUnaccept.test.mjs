import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UNACCEPT_REASON_MAX,
  canUnacceptQuotation,
  normalizeUnacceptReason,
  unacceptReasonError,
} from './quotationUnaccept.js';

test('unaccept reason is trimmed, whitespace-normalized and bounded 10-500', () => {
  assert.equal(normalizeUnacceptReason('  รับใบผิด   ฉบับ  '), 'รับใบผิด ฉบับ');
  assert.match(unacceptReasonError('สั้น'), /อย่างน้อย 10/);
  assert.match(unacceptReasonError('         '), /อย่างน้อย 10/);
  assert.equal(unacceptReasonError('กดรับใบผิดฉบับ — ดีลนี้ปิดด้วยใบอื่น'), '');
  assert.match(unacceptReasonError('ก'.repeat(UNACCEPT_REASON_MAX + 1)), /ไม่เกิน 500/);
});

/* ⭐ มติ 24/09: **เจ้าของดีลปัจจุบัน + ผู้มีอำนาจตัดสิน** ย้อนการรับได้ — ขาเข้า Won เจ้าของดีลกดเองอยู่แล้ว
   (อนุมัติใบเอง 07-18 · รับใบเอง 08-24) ขาออกจึงไม่ต้องรอหัวหน้า · ไม่แตะ Actual เพราะ RPC ปฏิเสธเมื่อมี SO ที่ยังใช้อยู่
   ⚠️ ยึด deal.ownerId ไม่ใช่ขอบเขตทีม — senior_ae/ac/senior_ac แก้ดีลของเพื่อนร่วมทีมได้ แต่ย้อน Won แทนไม่ได้ */
test('ย้อนการรับ: เจ้าของดีลปัจจุบัน + ผู้มีอำนาจตัดสิน · คนอื่นในทีมไม่ได้', () => {
  const deal = { ownerId: 'USR-AE' };
  for (const role of ['admin', 'commercial_director', 'commercial_manager', 'ae_supervisor']) {
    assert.equal(canUnacceptQuotation({ id: 'USR-X', role }, deal), true, role);
  }
  assert.equal(canUnacceptQuotation({ id: 'USR-AE', role: 'ae' }, deal), true);
  assert.equal(canUnacceptQuotation({ id: 'USR-AE', role: 'senior_ae' }, deal), true);
  for (const role of ['ae', 'senior_ae', 'ac', 'senior_ac', 'ac_supervisor']) {
    assert.equal(canUnacceptQuotation({ id: 'USR-TEAMMATE', role }, deal), false, role);
  }
  assert.equal(canUnacceptQuotation({ id: '', role: 'ae' }, { ownerId: '' }), false);
  assert.equal(canUnacceptQuotation({ id: 'USR-AE', role: 'ae' }, null), false);
  assert.equal(canUnacceptQuotation(null, deal), false);
});
