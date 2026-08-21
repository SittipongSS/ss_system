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

test('ตำแหน่งผู้ลงนามฝั่งผู้ว่าจ้างไม่มีค่าตั้งต้น — ต้นฉบับล่าสุดไม่มีบรรทัดนี้', async () => {
  const { contractFieldDefaults } = await import('./contractTemplates.js');
  const filled = contractFieldDefaults('scent_design', {});
  // เว้นว่าง = ไม่พิมพ์บรรทัดตำแหน่งใต้ "ผู้ว่าจ้าง" (ฉบับ 13 ส.ค. 2569 ตัดออก)
  assert.ok(!filled.clientSignerTitle, 'ต้องไม่มีค่าตั้งต้น');
});

test('ข้อ 2.9 ใช้ถ้อยคำของต้นฉบับล่าสุด — "เลขที่ใบรับแจ้งน้ำหอม"', async () => {
  const { SCENT_DESIGN_TEMPLATE } = await import('./contractTemplateScentDesign.js');
  const clause = SCENT_DESIGN_TEMPLATE.sections
    .flatMap((section) => section.clauses)
    .find((item) => item.no === 'ข้อ 2.9');
  // ฉบับ 13 ส.ค. 2569 เติมคำว่า "ใบรับแจ้ง" — จุดเดียวที่ต่างจากรุ่น 20260708
  assert.match(clause.text, /เลขที่ใบรับแจ้งน้ำหอมของ/);
  assert.equal(SCENT_DESIGN_TEMPLATE.version, '20260813');
});

test('ร่างลบได้จนกว่าจะออกสัญญา · ออกแล้วต้องออกฉบับแก้ไข', async () => {
  const { canDeleteContract, canReviseContract, contractReviseBlockReason } = await import('./contracts.js');
  // ร่าง = ลบได้ (มติผู้ใช้ 2026-08-21)
  assert.equal(canDeleteContract({ status: 'draft', contractNo: null }), true);
  assert.equal(canReviseContract({ status: 'draft' }), false);
  // ออกเลขแล้ว = ลบไม่ได้ ต้องออก Rev.
  assert.equal(canDeleteContract({ status: 'awaiting_signature', contractNo: 'CT-26080001-0' }), false);
  assert.equal(canReviseContract({ status: 'awaiting_signature' }), true);
  /* ลงนามแล้วออก Rev. ไม่ได้ — ตัวสัญญาข้อ 3.2 บอกเองว่าการแก้ไขเพิ่มเติมต้องทำเป็น
     ลายลักษณ์อักษรและลงนามทั้งสองฝ่าย = "บันทึกเพิ่มเติมสัญญา" ไม่ใช่ Rev. ของใบเดิม */
  assert.equal(canReviseContract({ status: 'signed' }), false);
  assert.match(contractReviseBlockReason({ status: 'signed' }), /บันทึกเพิ่มเติมสัญญา/);
});

test('ทะเบียนเหลือเฉพาะฉบับล่าสุดของแต่ละเลขฐาน', async () => {
  const { latestContractRevisions } = await import('./contracts.js');
  const rows = [
    { id: 'a', baseNumber: 'CT-26080001', revisionNo: 0, status: 'revised', createdAt: '2026-08-01' },
    { id: 'b', baseNumber: 'CT-26080001', revisionNo: 1, status: 'awaiting_signature', createdAt: '2026-08-02' },
    { id: 'c', baseNumber: 'CT-26080002', revisionNo: 0, status: 'signed', createdAt: '2026-08-03' },
    // ร่างที่ยังไม่มีเลข = สายของตัวเอง (คีย์ตกไปที่ id) ต้องไม่ถูกยุบรวมกับใบอื่น
    { id: 'd', baseNumber: null, contractNo: null, revisionNo: 0, status: 'draft', createdAt: '2026-08-04' },
  ];
  const ids = latestContractRevisions(rows).map((row) => row.id).sort();
  assert.deepEqual(ids, ['b', 'c', 'd']);
});

test('บันทึกเพิ่มเติม: ออกได้เฉพาะสัญญาที่ลงนามแล้ว + คำร้องพัฒนากลิ่นที่ปิดเรื่อง', async () => {
  const { addendumEligibility, addendumDocNo } = await import('./contractAddenda.js');
  const signed = { kind: 'scent_design', status: 'signed', contractNo: 'CT-26080001-0' };
  const closedRequest = { kind: 'scent_dev', status: 'closed' };

  assert.equal(addendumEligibility({ contract: signed, request: closedRequest }).ok, true);
  // ยังไม่ลงนาม = ใช้ Rev. แทน (บอกทางออกให้ ไม่ใช่แค่ปฏิเสธ)
  const notSigned = addendumEligibility({ contract: { ...signed, status: 'awaiting_signature' }, request: closedRequest });
  assert.equal(notSigned.ok, false);
  assert.match(notSigned.reason, /ฉบับแก้ไข/);
  // คำร้องที่ยังไม่ปิดเรื่อง = สูตรยังขยับได้ ⇒ ตารางในบันทึกจะไม่ตรงของจริง
  const openRequest = addendumEligibility({ contract: signed, request: { kind: 'scent_dev', status: 'answered' } });
  assert.equal(openRequest.ok, false);
  assert.match(openRequest.reason, /ปิดเรื่อง/);
  // คนละชนิดคำร้อง (ขอเอกสาร/สอบถาม) ไม่มีข้อมูลสูตรให้อ้าง
  assert.equal(addendumEligibility({ contract: signed, request: { kind: 'info', status: 'closed' } }).ok, false);

  // ⭐ ลูกค้าต้องเป็นรายเดียวกับสัญญา (มติผู้ใช้ 2026-08-22)
  const otherCustomer = addendumEligibility({
    contract: { ...signed, customerId: 'CUS-1' },
    request: { ...closedRequest, customerId: 'CUS-2' },
  });
  assert.equal(otherCustomer.ok, false);
  assert.match(otherCustomer.reason, /คนละราย/);
  // รหัสลูกค้าตรงกัน = ผ่าน แม้ชื่อบนเอกสารพิมพ์ไม่เหมือนกัน
  assert.equal(addendumEligibility({
    contract: { ...signed, customerId: 'CUS-1', customerName: 'บริษัท ก จำกัด' },
    request: { ...closedRequest, customerId: 'CUS-1', customerName: 'บริษัท ก จก.' },
  }).ok, true);
  // ใบเก่าที่ไม่มีรหัสลูกค้า → เทียบชื่อแทน
  assert.equal(addendumEligibility({
    contract: { ...signed, customerName: 'บริษัท ก จำกัด' },
    request: { ...closedRequest, customerName: 'บริษัท ข จำกัด' },
  }).ok, false);
  // ⭐ หนึ่งคำร้อง = หนึ่งบันทึก — ใบที่ถูกใช้แล้วต้องบอกว่าไปอยู่เลขที่ไหน
  const taken = addendumEligibility({ contract: signed, request: closedRequest, takenByDocNo: 'CT-26080001-0-A1' });
  assert.equal(taken.ok, false);
  assert.match(taken.reason, /CT-26080001-0-A1/);

  // เลขที่ต่อจากสัญญาแม่ รวมเลขฉบับแก้ไข
  assert.equal(addendumDocNo('CT-26080001-0', 1), 'CT-26080001-0-A1');
  assert.equal(addendumDocNo('CT-26080001-1', 2), 'CT-26080001-1-A2');
  assert.equal(addendumDocNo(null, 1), null);
});

test('บันทึกเพิ่มเติม: ร่างลบได้ · ออกเลขแล้วลบไม่ได้', async () => {
  const { canDeleteAddendum, canIssueAddendum, canSignAddendum } = await import('./contractAddenda.js');
  assert.equal(canDeleteAddendum({ status: 'draft', docNo: null }), true);
  assert.equal(canDeleteAddendum({ status: 'awaiting_signature', docNo: 'CT-1-A1' }), false);
  assert.equal(canIssueAddendum({ status: 'draft' }), true);
  assert.equal(canSignAddendum({ status: 'awaiting_signature' }), true);
  assert.equal(canSignAddendum({ status: 'signed' }), false);
});
