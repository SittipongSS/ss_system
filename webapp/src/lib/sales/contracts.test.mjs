import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  approvedQuotationsForContract,
  canCancelContract,
  canDeleteContract,
  contractEligibility,
  contractKindsForDeal,
  daysAwaitingSignature,
  isContractWaitingOnMe,
} from './contracts';

const approvedQuote = { id: 'Q1', approvalStatus: 'approved', status: 'sent' };

test('ชนิดสัญญามาจากคู่ (ประเภทดีล, สายธุรกิจของโครงการ)', () => {
  assert.deepEqual(contractKindsForDeal({ dealType: 'SCENT' }), ['scent_design']);
  assert.deepEqual(contractKindsForDeal({ dealType: 'NPD' }, { line: 'PRODUCT' }), ['manufacturing']);
  assert.deepEqual(contractKindsForDeal({ dealType: 'RE-ORDER' }, { line: 'SERVICE' }), ['service']);
  // สาย PRODUCT ไม่ทำให้ดีล SCENT ออกสัญญาจ้างผลิตได้ — คนละแกน
  assert.deepEqual(contractKindsForDeal({ dealType: 'SCENT' }, { line: 'PRODUCT' }), ['scent_design']);
  assert.deepEqual(contractKindsForDeal({ dealType: 'OTHER' }, { line: 'PRODUCT' }), []);
});

test('ยังไม่ระบุสาย = ดีล NPD/RE-ORDER ยังออกสัญญาไม่ได้ (ห้ามเดาสายให้เอง)', () => {
  assert.deepEqual(contractKindsForDeal({ dealType: 'NPD' }, { line: null }), []);
  const result = contractEligibility({
    deal: { dealType: 'NPD' }, project: { line: null }, quotations: [approvedQuote],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /สายธุรกิจ/);
});

test('สายของดีลเองมาก่อนสายของโครงการ (mig 0275) · ดีลเก่ายังสืบจากโครงการได้', () => {
  // ดีลถือสายของตัวเองแล้ว — ใช้ค่านั้น
  assert.deepEqual(contractKindsForDeal({ dealType: 'NPD', line: 'SERVICE' }, { line: 'PRODUCT' }), ['service']);
  // ดีลเก่าที่ยังไม่ระบุ — สืบจากโครงการที่ผูกอยู่
  assert.deepEqual(contractKindsForDeal({ dealType: 'NPD', line: null }, { line: 'PRODUCT' }), ['manufacturing']);
});

test('ด่านออกสัญญา = ใบเสนอราคาที่อนุมัติภายในแล้ว ไม่ใช่ลูกค้าตอบรับ', () => {
  const deal = { dealType: 'SCENT' };
  assert.equal(contractEligibility({ deal, quotations: [] }).ok, false);
  // ส่งแล้วแต่ยังไม่อนุมัติ → ยังออกไม่ได้
  assert.equal(
    contractEligibility({ deal, quotations: [{ approvalStatus: 'pending', status: 'sent' }] }).ok,
    false,
  );
  // อนุมัติแล้ว แม้ลูกค้ายังไม่ตอบรับ (status = 'sent') → ออกได้
  assert.equal(contractEligibility({ deal, quotations: [approvedQuote] }).ok, true);
});

test('ใบเสนอราคาที่ยกเลิก/ถูกปฏิเสธไม่ปลดล็อกสัญญา แม้เคยอนุมัติ', () => {
  const dead = [{ approvalStatus: 'approved', status: 'cancelled' }, { approvalStatus: 'approved', status: 'rejected' }];
  assert.equal(approvedQuotationsForContract(dead).length, 0);
  assert.equal(contractEligibility({ deal: { dealType: 'SCENT' }, quotations: dead }).ok, false);
});

test('ขอชนิดที่ไม่เข้าคู่กับดีล = ปฏิเสธพร้อมบอกชนิดที่ออกได้', () => {
  const result = contractEligibility({
    kind: 'manufacturing', deal: { dealType: 'SCENT' }, quotations: [approvedQuote],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /สัญญาจ้างออกแบบกลิ่น/);
});

test('ลบได้เฉพาะร่างที่ยังไม่เคยออกเลข · ใบที่ออกเลขแล้วต้องยกเลิก', () => {
  assert.equal(canDeleteContract({ status: 'draft', contractNo: null }), true);
  assert.equal(canDeleteContract({ status: 'draft', contractNo: 'CT-26080001' }), false);
  assert.equal(canDeleteContract({ status: 'awaiting_signature', contractNo: 'CT-26080001' }), false);
  assert.equal(canCancelContract({ status: 'awaiting_signature' }), true);
  assert.equal(canCancelContract({ status: 'signed' }), false);
});

test('ใบที่รอมือฉัน = ร่างหรือรอลงนามของฉันเอง', () => {
  assert.equal(isContractWaitingOnMe({ status: 'awaiting_signature', ownerId: 'u1' }, { userId: 'u1' }), true);
  assert.equal(isContractWaitingOnMe({ status: 'signed', ownerId: 'u1' }, { userId: 'u1' }), false);
  assert.equal(isContractWaitingOnMe({ status: 'draft', ownerId: 'u2' }, { userId: 'u1' }), false);
});

test('นับวันค้างเฉพาะใบที่รอลงนาม', () => {
  const now = new Date('2026-08-20T00:00:00Z');
  assert.equal(daysAwaitingSignature({ status: 'awaiting_signature', issuedAt: '2026-08-10T00:00:00Z' }, now), 10);
  assert.equal(daysAwaitingSignature({ status: 'signed', issuedAt: '2026-08-10T00:00:00Z' }, now), null);
});

test('ตำแหน่งผู้ลงนามฝั่งผู้ว่าจ้างตั้งต้นเป็น "ผู้มีอำนาจ/ผู้รับมอบอำนาจ"', async () => {
  const { contractFieldDefaults } = await import('./contractTemplates.js');
  const filled = contractFieldDefaults('scent_design', {});
  // ตรงกับถ้อยคำในตัวสัญญา ("โดย กรรมการผู้มีอำนาจ หรือ ผู้รับมอบอำนาจ") และครอบทั้ง
  // กรณีกรรมการเซ็นเองและกรณีมอบอำนาจ — ฝั่งผู้รับจ้างยังเป็น "กรรมการผู้จัดการ"
  assert.equal(filled.clientSignerTitle, 'ผู้มีอำนาจ/ผู้รับมอบอำนาจ');
});
