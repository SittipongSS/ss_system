import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  contractLinkable, serviceContractLinkError, serviceContractOptions,
} from './serviceContractLink';

const order = (extra = {}) => ({ id: 'SOR-1', status: 'approved', dealId: 'DL-1', ...extra });
const signed = (extra = {}) => ({
  id: 'CTR-1', contractNo: 'CT-SR-26080001-0', kind: 'service', status: 'signed',
  dealId: 'DL-1', effectiveDate: '2026-09-01', expiryDate: '2027-08-31', ...extra,
});
const ok = { canEdit: true };

/* ⭐ สัญญาต้อง **มีผลแล้ว** ถึงผูกได้ — ขั้น "รอหัวหน้ารับรอง" ยังไม่ผูกพัน
   ผูกไปก็ปลดล็อกงานไม่ได้จริง แต่ทำให้คนเข้าใจผิดว่ามีสัญญาแล้ว */
test('⭐ ผูกได้เฉพาะสัญญาที่มีผลแล้ว', () => {
  assert.equal(serviceContractLinkError(order(), signed(), ok), null);
  for (const s of ['draft', 'awaiting_signature', 'awaiting_approval', 'cancelled', 'revised']) {
    assert.match(serviceContractLinkError(order(), signed({ status: s }), ok), /ยังไม่มีผล/, s);
  }
  assert.equal(contractLinkable(signed()), true);
  assert.equal(contractLinkable(signed({ status: 'awaiting_approval' })), false);
});

/* ⭐ ข้ามดีลไม่ได้ — สัญญาผูกกับดีล และใบก็ออกจากดีล */
test('⭐ สัญญาต้องเป็นของดีลเดียวกับใบ', () => {
  assert.match(serviceContractLinkError(order(), signed({ dealId: 'DL-9' }), ok), /ของดีลอื่น/);
});

test('ถอดสัญญาออกจากใบทำได้เสมอ', () => {
  assert.equal(serviceContractLinkError(order(), null, ok), null);
  assert.equal(serviceContractLinkError(order(), undefined, ok), null);
});

/* ⚠️ ใบที่อนุมัติแล้วยังผูกได้โดยตั้งใจ — สัญญามักมาทีหลังใบ
   แต่ใบที่ยกเลิก/ถูกแทนด้วย Rev. คือเอกสารที่ตายแล้ว */
test('ใบที่ปิดไปแล้วผูกไม่ได้ แต่ใบที่อนุมัติแล้วยังผูกได้', () => {
  assert.equal(serviceContractLinkError(order({ status: 'approved' }), signed(), ok), null);
  assert.equal(serviceContractLinkError(order({ status: 'draft' }), signed(), ok), null);
  for (const s of ['cancelled', 'revised']) {
    assert.match(serviceContractLinkError(order({ status: s }), signed(), ok), /ปิดไปแล้ว/, s);
  }
});

test('ไม่มีสิทธิ์แก้ใบ = ผูกไม่ได้ (ด่านเดียวกับปุ่มบนจอ)', () => {
  assert.match(serviceContractLinkError(order(), signed(), { canEdit: false }), /เฉพาะฝ่ายขาย/);
});

/* ⚠️ ไม่กรองด้วยชนิดสัญญา — ใบบริการที่ออกเป็น "สัญญาจ้างผลิต" มีจริง
   ชนิดโชว์บนตัวเลือกให้คนตัดสินเอง */
test('ตัวเลือกโชว์เลขที่ + ชนิด + ช่วงมีผล และตัดใบที่ยังไม่มีผลออก', () => {
  const opts = serviceContractOptions([
    signed(),
    signed({ id: 'CTR-2', status: 'draft' }),
    signed({ id: 'CTR-3', contractNo: 'CT-MF-26080002-0', kind: 'manufacturing' }),
  ]);
  assert.equal(opts.length, 2, 'ใบร่างต้องไม่อยู่ในตัวเลือก');
  assert.equal(opts[0].label, 'CT-SR-26080001-0 · สัญญาบริการ');
  assert.equal(opts[0].hint, '2026-09-01 — 2027-08-31');
  assert.match(opts[1].label, /สัญญาจ้างผลิต/);
});
