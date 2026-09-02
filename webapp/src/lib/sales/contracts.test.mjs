import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CONTRACT_KINDS,
  approvedQuotationsForContract,
  canApproveExternalContract,
  canCancelContract,
  canDeleteContract,
  canIssueContract,
  canSignContract,
  contractEligibility,
  contractKindsForDeal,
  CONTRACT_NUMBER_MONTH,
  contractKindCode,
  contractNumberPattern,
  contractInForce,
  contractSourceOf,
  daysAwaitingSignature,
  externalApproveError,
  isContractWaitingOnMe,
  isExternalContract,
  showExternalApprove,
  showSignedApprove,
  signedApproveError,
} from './contracts';
import { buildContractLifecycle } from './contractLifecycle';
import { addendumEligibility } from './contractAddenda';

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

/* 🐞 ตรวจ 2026-09-02: เลนผู้รับรองเคยตกทั้งเลน ⇒ ขั้น "รอหัวหน้ารับรอง" ไม่โผล่ใน
   ตัวกรอง "ที่ต้องทำ" และเมนูสัญญาไม่มีป้ายเลย ทั้งที่ใบที่ค้างตรงนั้นบล็อกงานทั้งเส้น */
test('⭐ ขั้นรอหัวหน้ารับรองเป็นของ AE Supervisor — ไม่ใช่ของเจ้าของใบ', () => {
  const row = { status: 'awaiting_approval', ownerId: 'u1', createdBy: 'u1' };
  const sup = { id: 'u9', role: 'ae_supervisor' };
  assert.equal(isContractWaitingOnMe(row, { userId: sup.id, user: sup }), true);
  assert.equal(isContractWaitingOnMe(row, { userId: 'u1', user: { id: 'u1', role: 'ae' } }), false,
    'เจ้าของใบกดรับรองเองไม่ได้ ⇒ ใบนี้ไม่ใช่ของค้างของเขา');
  // admin ใช้สิทธิ์ได้ (break-glass เดียวกับปุ่ม) · คนที่ไม่ส่ง user มาต้องไม่ผ่าน
  assert.equal(isContractWaitingOnMe(row, { user: { id: 'a1', role: 'admin' } }), true);
  assert.equal(isContractWaitingOnMe(row, { userId: 'u9' }), false);
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

test('ทะเบียนสัญญา: รางสามขั้น ร่าง → รอลงนาม → ลงนามแล้ว', async () => {
  const { contractListTrack } = await import('./contractListTrack.js');
  const state = (row) => contractListTrack(row).steps.map((s) => s.state);

  assert.deepEqual(state({ status: 'draft' }), ['now', 'todo', 'todo']);
  assert.deepEqual(state({ status: 'awaiting_signature', contractNo: 'CT-1', issuedAt: new Date().toISOString() }), ['done', 'now', 'todo']);
  assert.deepEqual(state({ status: 'signed', contractNo: 'CT-1', signedDate: '2026-08-20' }), ['done', 'done', 'done']);

  // ใบที่ตายแล้วไม่มีรางให้เดิน — หน้าเว็บโชว์เหตุผลแทน
  assert.equal(contractListTrack({ status: 'cancelled' }).closed, true);
  assert.equal(contractListTrack({ status: 'revised' }).closed, true);
  assert.deepEqual(contractListTrack({ status: 'cancelled' }).steps, []);

  // รอลงนามเกิน 14 วัน = ธงแดงพร้อมโน้ตจำนวนวัน (เกณฑ์เดียวกับการ์ดสรุปบนหัวทะเบียน)
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  const late = contractListTrack({ status: 'awaiting_signature', contractNo: 'CT-1', issuedAt: old });
  assert.equal(late.steps[1].state, 'bad');
  assert.match(late.steps[1].note, /รอมา \d+ วัน/);

  // ใบเสนอราคาถูกปิดแต่ใบออกเลขแล้ว = ธงแดงที่ขั้นที่ค้างอยู่ (ระบบไม่ยกเลิกให้)
  const stale = contractListTrack({
    status: 'awaiting_signature', contractNo: 'CT-1', issuedAt: new Date().toISOString(),
    _quotationClosure: { code: 'revised', label: 'ถูกแทนด้วยฉบับแก้ไข (Rev.)' },
  });
  assert.equal(stale.steps[1].state, 'bad');
  assert.match(stale.steps[1].note, /ใบเสนอราคา/);
});

/* 🪤 **ทะเบียนกับหน้ารายละเอียดต้องเล่าเรื่องเดียวกัน** — #1570 แยกรางของสาย external
   บนหน้ารายละเอียดไปแล้ว ถ้าทะเบียนยังใช้รางสามขั้น ใบ external ที่ signed จะโชว้
   "รอลงนาม" เป็นขั้นที่ผ่านมาแล้ว ทั้งที่ไม่เคยผ่าน · คนคนเดียวกันเปิดสองหน้านี้
   ห่างกันคลิกเดียว */
test('🪤 ทะเบียนสัญญา: ใบ external เดินรางสองขั้น คำเดียวกับหน้ารายละเอียด', async () => {
  const { contractListTrack } = await import('./contractListTrack.js');
  const { EXTERNAL_STEPS } = await import('./contractLifecycle.js');
  const ext2 = (status) => contractListTrack({ status, source: 'external' });

  assert.deepEqual(ext2('draft').steps.map((s) => s.state), ['now', 'todo']);
  assert.deepEqual(ext2('signed').steps.map((s) => s.state), ['done', 'done']);
  assert.ok(!ext2('signed').steps.some((s) => s.label === 'รอลงนาม'), 'ขั้นที่ไม่มีวันเดินผ่านต้องไม่โผล่');

  // คำบนรางสองหน้าต้องตรงกันเป๊ะ — ล็อกไว้เพราะอยู่คนละไฟล์
  assert.deepEqual(
    ext2('draft').steps.map((s) => s.label),
    EXTERNAL_STEPS.map((s) => s.label),
    'คำบนรางทะเบียนต้องตรงกับ EXTERNAL_STEPS ของหน้ารายละเอียด',
  );

  // ใบที่ระบบเจนยังเดินรางสามขั้นเหมือนเดิม
  assert.equal(contractListTrack({ status: 'draft' }).steps.length, 3);
  // ใบเก่าที่ไม่มีช่อง source = ใบที่ระบบเจน
  assert.equal(contractListTrack({ status: 'draft', source: null }).steps.length, 3);
  // ใบที่ตายแล้วยังไม่มีรางเหมือนเดิม ไม่ว่าสายไหน
  assert.equal(contractListTrack({ status: 'cancelled', source: 'external' }).closed, true);
});

test('ใบเสนอราคาถูกปิด: ร่างปิดตาม · ใบที่ออกเลขแล้วแค่เตือน', async () => {
  const {
    quotationClosure, contractFollowsQuotationClosure, contractQuotationNotice,
    newerApprovedQuotation, closureCancelReason,
  } = await import('./contractQuotationState.js');

  // เหตุที่นับว่าปิด — revised ต้องมาก่อน เพราะใบที่ออก Rev. ยังค้าง approved อยู่
  assert.equal(quotationClosure({ status: 'revised', approvalStatus: 'approved' }).code, 'revised');
  assert.equal(quotationClosure({ status: 'cancelled' }).code, 'cancelled');
  assert.equal(quotationClosure({ status: 'rejected' }).code, 'rejected');
  assert.equal(quotationClosure({ status: 'sent', approvalStatus: 'not_submitted' }).code, 'approval_lost');
  assert.equal(quotationClosure({ status: 'sent', approvalStatus: 'approved' }), null);
  assert.equal(quotationClosure(null), null);

  // ร่างที่ยังไม่ออกเลขเท่านั้นที่ปิดตาม
  assert.equal(contractFollowsQuotationClosure({ status: 'draft', contractNo: null }), true);
  assert.equal(contractFollowsQuotationClosure({ status: 'draft', contractNo: 'CT-26080001-0' }), false);
  assert.equal(contractFollowsQuotationClosure({ status: 'awaiting_signature', contractNo: 'CT-26080001-0' }), false);
  assert.equal(contractFollowsQuotationClosure({ status: 'signed', contractNo: 'CT-26080001-0' }), false);

  const closed = { quoteNumber: 'QT-26080001-0', status: 'revised', approvalStatus: 'approved' };
  // ใบที่ลงนามแล้ว: ยังมีผลตามเอกสาร ทางแก้คือบันทึกเพิ่มเติม ไม่ใช่ยกเลิก
  assert.match(contractQuotationNotice({ status: 'signed' }, closed).body, /บันทึกเพิ่มเติม/);
  // ใบที่ออกเลขแล้วแต่ยังไม่เซ็น: ระบบไม่ยกเลิกให้ ต้องให้คนตัดสินใจ
  assert.match(contractQuotationNotice({ status: 'awaiting_signature', contractNo: 'CT-1' }, closed).body, /ไม่ยกเลิกให้/);
  // ร่าง: บอกว่าจะถูกยกเลิกตาม
  assert.match(contractQuotationNotice({ status: 'draft', contractNo: null }, closed).body, /ยกเลิกตาม/);
  // ใบที่ยังใช้ได้ = ไม่มีคำเตือน
  assert.equal(contractQuotationNotice({ status: 'draft' }, { status: 'sent', approvalStatus: 'approved' }), null);

  /* "อนุมัติที่ใบอื่น" — เตือนอย่างเดียว ไม่ปิดร่างตาม เพราะดีลหนึ่งมีใบอนุมัติหลายใบ
     พร้อมกันได้จริง (ออกแบบกลิ่นใบหนึ่ง ผลิตอีกใบหนึ่ง) */
  const mine = { id: 'q1', status: 'sent', approvalStatus: 'approved', approvedAt: '2026-08-01' };
  const newer = newerApprovedQuotation(mine, [
    mine,
    { id: 'q2', quoteNumber: 'QT-2', status: 'sent', approvalStatus: 'approved', approvedAt: '2026-08-09' },
    { id: 'q3', quoteNumber: 'QT-3', status: 'revised', approvalStatus: 'approved', approvedAt: '2026-08-10' },
  ]);
  assert.equal(newer.id, 'q2');
  assert.equal(contractQuotationNotice({ status: 'draft' }, mine, { newerApproved: newer }).tone, 'info');
  assert.equal(newerApprovedQuotation(mine, [mine]), null);

  assert.match(closureCancelReason(closed), /QT-26080001-0 ถูกแทนด้วยฉบับแก้ไข/);
  assert.equal(closureCancelReason({ status: 'sent', approvalStatus: 'approved' }), null);
});

test('บันทึกเพิ่มเติม: ระบบเลือกคำร้องเอง — เก่าสุดก่อน ข้ามใบที่ใช้แล้ว/ไม่มีสูตร', async () => {
  const { pickAddendumRequest, addendumSourceReason } = await import('./addendumRequests.js');

  const candidates = [
    { id: 'r3', docNo: 'SB-3', closedAt: '2026-03-01', formulaCount: 2, taken: false },
    { id: 'r1', docNo: 'SB-1', closedAt: '2026-01-01', formulaCount: 2, taken: true },
    { id: 'r2', docNo: 'SB-2', closedAt: '2026-02-01', formulaCount: 0, taken: false },
  ];
  // r1 ถูกใช้แล้ว · r2 ไม่มีสูตรให้อ้าง ⇒ เหลือ r3
  assert.equal(pickAddendumRequest(candidates).id, 'r3');
  // เก่าสุดก่อน เพื่อให้ครั้งที่ 1, 2, 3 ไล่ตามลำดับที่คำร้องปิดจริง
  assert.equal(pickAddendumRequest([
    { id: 'b', closedAt: '2026-05-02', formulaCount: 1, taken: false },
    { id: 'a', closedAt: '2026-04-30', formulaCount: 1, taken: false },
  ]).id, 'a');
  assert.equal(pickAddendumRequest([]), null);

  // เหตุผลต้องแยกได้ว่า "ไม่มีคำร้อง" กับ "มีแต่ใช้ครบแล้ว" กับ "ยังไม่มีสูตร"
  assert.match(addendumSourceReason([]), /ดีลของสัญญานี้ยังไม่มีคำร้องพัฒนากลิ่นที่ปิดเรื่อง/);
  assert.match(addendumSourceReason([{ id: 'r1', formulaCount: 2, taken: true }]), /ครั้งเดียว/);
  assert.match(addendumSourceReason([{ id: 'r1', formulaCount: 0, taken: false }]), /รหัสสูตร/);
});

test('บันทึกเพิ่มเติม: ร่างลบได้ · ออกเลขแล้วลบไม่ได้', async () => {
  const { canDeleteAddendum, canIssueAddendum, canSignAddendum } = await import('./contractAddenda.js');
  assert.equal(canDeleteAddendum({ status: 'draft', docNo: null }), true);
  assert.equal(canDeleteAddendum({ status: 'awaiting_signature', docNo: 'CT-1-A1' }), false);
  assert.equal(canIssueAddendum({ status: 'draft' }), true);
  assert.equal(canSignAddendum({ status: 'awaiting_signature' }), true);
  assert.equal(canSignAddendum({ status: 'signed' }), false);
});

/* ═══════════════════════════════════════════════════════════════════════
   เอกสารภายนอกใช้แทนสัญญา (mig 0322 · มติผู้ใช้ 2026-08-30)
   *"3 โอเค (PO ลูกค้า / อีเมล / สัญญากระดาษเก่า/ หรืออาจมีอื่นๆ)"* + ต้องผ่าน AE Sup
   ═══════════════════════════════════════════════════════════════════════ */
const AE_SUP = { id: 'U-SUP', role: 'ae_supervisor' };
const AE = { id: 'U-AE', role: 'ae' };
const AC = { id: 'U-AC', role: 'ac' };
const ADMIN = { id: 'U-AD', role: 'admin' };
const FN = { id: 'U-FN', role: 'finance' };
const ext = (extra = {}) => ({
  status: 'draft', source: 'external', externalDocKind: 'customer_po', ...extra,
});
const OKAY = { signedFileId: 'ATT-1', effectiveDate: '2026-09-01', expiryDate: '2027-08-31' };

/* 🔴 ด่านที่ต้องไม่รั่ว — route `/sign` ที่มีอยู่ใช้ `canEditSalesPlanning` ซึ่ง AE/AC ผ่านหมด
   ถ้าลอกด่านนั้นมาใช้กับปุ่มนี้ตามความเคยชิน คนที่ขายงานเองจะอนุมัติเอกสารของตัวเองได้
   = ด่าน "จ่ายก่อนบริการ" ของทั้งเฟสรั่วตั้งแต่ขั้นแรก */
test('⭐ อนุมัติเอกสารแทนสัญญาได้เฉพาะ AE Supervisor (กับ admin)', () => {
  assert.equal(canApproveExternalContract(AE_SUP), true);
  assert.equal(canApproveExternalContract(ADMIN), true);
  for (const user of [AE, AC, FN, null, {}]) {
    assert.equal(canApproveExternalContract(user), false, JSON.stringify(user));
  }
  assert.match(externalApproveError(ext(), AE, OKAY), /เฉพาะ AE Supervisor/);
  assert.match(externalApproveError(ext(), AC, OKAY), /เฉพาะ AE Supervisor/);
  assert.equal(externalApproveError(ext(), AE_SUP, OKAY), null);
});

/* ⭐ วันมีผล/สิ้นสุดบังคับตอนอนุมัติ (ต่างจากใบ generated ที่กรอกทีหลังได้) —
   `paidThrough` กับทะเบียนต่อสัญญา 90 วัน อ่านสองค่านี้ตรง ๆ */
test('⭐ ต้องมีไฟล์ + วันมีผล + วันสิ้นสุด ครบถึงจะอนุมัติได้', () => {
  assert.match(externalApproveError(ext(), AE_SUP, {}), /แนบไฟล์/);
  assert.match(externalApproveError(ext(), AE_SUP, { signedFileId: 'A' }), /วันที่เริ่มมีผล/);
  assert.match(
    externalApproveError(ext(), AE_SUP, { signedFileId: 'A', effectiveDate: '2026-09-01' }),
    /วันที่สิ้นสุด/,
  );
  // ช่วงกลับหัวต้องถูกจับ ไม่ใช่ปล่อยผ่านแล้วได้สัญญาที่หมดอายุก่อนเริ่ม
  assert.match(
    externalApproveError(ext(), AE_SUP, { ...OKAY, effectiveDate: '2027-01-01', expiryDate: '2026-01-01' }),
    /ต้องไม่เกินวันที่สิ้นสุด/,
  );
});

test('ใบที่ยังไม่บอกชนิดเอกสาร อนุมัติไม่ได้', () => {
  assert.match(externalApproveError(ext({ externalDocKind: null }), AE_SUP, OKAY), /ชนิดไหน/);
});

test('อนุมัติได้เฉพาะใบร่างของสาย external', () => {
  assert.match(externalApproveError(ext({ status: 'signed' }), AE_SUP, OKAY), /ถูกอนุมัติไปแล้ว/);
  assert.match(externalApproveError(ext({ status: 'cancelled' }), AE_SUP, OKAY), /ยกเลิกแล้ว/);
  // ใบที่ระบบเจนเองต้องเดินขั้นออกสัญญา/ลงนามตามปกติ ไม่ใช่ทางลัดนี้
  assert.match(
    externalApproveError({ status: 'draft', source: 'generated' }, AE_SUP, OKAY),
    /เจนจากแม่แบบ/,
  );
});

/* 🪤 ปุ่ม "ออกสัญญา" กับ "บันทึกการลงนาม" ต้องไม่ขึ้นบนใบ external —
   ทั้งสองพาใบไปสถานะ `awaiting_signature` ซึ่งสาย external ไม่มี และไม่มีปุ่มไหนพาออกมา */
test('🪤 ใบ external ไม่มีขั้นออกสัญญา/ลงนามแบบเดิม', () => {
  assert.equal(canIssueContract(ext()), false);
  assert.equal(canSignContract(ext({ status: 'awaiting_signature' })), false);
  // ใบปกติยังเดินเส้นเดิมครบ
  assert.equal(canIssueContract({ status: 'draft' }), true);
  assert.equal(canSignContract({ status: 'awaiting_signature' }), true);
});

/* ═══════════════════════════════════════════════════════════════════════
   🔴 ใบ external ต้องไม่มีเอกสารที่ระบบเจนออกมาได้เลย
   เจอบนโค้ดจริง 2026-09-02: ปุ่มพิมพ์บนการ์ดจัดการไม่มี `visible` และ route `/document`
   ไม่รู้จักคำว่า `source` ⇒ ใบ external ชนิดที่ *มีแม่แบบ* (`scent_design`) เรนเดอร์
   "สัญญา" ที่ระบบแต่งเองครบทุกช่องออกมา แล้วเขียนกลับลง `issuedHtml` ถาวร
   (ใบ external ได้ `contractNo` จาก RPC ตอนอนุมัติ ⇒ ผ่านเงื่อนไขเก็บเนื้อ)
   ตรงข้ามกับเหตุผลที่ mig 0322 มีอยู่: "ไม่ต้องกุสัญญาปลอมขึ้นมาในระบบ"
   ═══════════════════════════════════════════════════════════════════════ */
test('🔴 route พิมพ์เอกสารต้องปฏิเสธใบ external ก่อนถามเรื่องแม่แบบ', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/[id]/document/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /isExternalContract\(contract\)/, 'ต้องถามที่มาของใบ');
  /* 🪤 **ลำดับสำคัญ** — ถ้าด่านแม่แบบมาก่อน ใบ external ชนิด service/manufacturing จะได้
     ข้อความผิดทาง ("ส่งต้นฉบับให้ผู้ดูแลเพิ่มก่อน") ทั้งที่สายนี้ไม่ต้องใช้แม่แบบเลย */
  assert.ok(
    route.indexOf('isExternalContract(contract)') < route.indexOf('hasContractTemplate(contract.kind)'),
    'ด่าน external ต้องอยู่ก่อนด่านแม่แบบ',
  );
});

/* 🪤 ด่านที่เทสต์ตรรกะเดิมจับไม่ได้ — `canIssueContract(ext())` เป็น false อยู่แล้ว
   แต่ปุ่มยังโผล่ เพราะ `visible` ของ transition มองแค่ `canEdit`
   ⇒ ไม่ใช่แค่ปุ่มเทาเกินมา: `issue` ถือ `slot: "primary"` และ transition ถูกจัดก่อน
     extraActions ⇒ มันแย่งช่องปุ่มหลักไปจาก "อนุมัติเอกสารแทนสัญญา" แล้วพิมพ์เหตุผลผิด
     ("ออกได้เฉพาะใบที่ยังเป็นร่าง") เป็นข้อความเด่นที่สุดบนการ์ด */
test('🪤 การ์ดจัดการต้องไม่โชว์ปุ่ม "ออกสัญญา" บนใบ external', () => {
  const lifecycle = buildContractLifecycle({ canEdit: true });
  const ids = (record) => lifecycle.available(record, AE_SUP).map((entry) => entry.id);

  assert.ok(!ids(ext()).includes('issue'), 'ใบ external ต้องไม่มีปุ่มออกสัญญา');
  assert.ok(ids({ status: 'draft', source: 'generated' }).includes('issue'), 'ใบที่ระบบเจนยังต้องมี');
  // ยกเลิกร่างยังต้องทำได้ทั้งสองสาย — ซ่อนเกินคือคนละบั๊กที่แย่พอกัน
  assert.ok(ids(ext()).includes('cancel'), 'ร่าง external ยังต้องยกเลิกได้');
});

/* คนไม่มีสิทธิ์แก้ยังต้องไม่เห็นปุ่มไหนเลย — เงื่อนไข external ต้อง **เพิ่ม** ไม่ใช่แทนที่ */
test('ไม่มีสิทธิ์แก้ = ไม่มีปุ่มออกสัญญาทั้งสองสาย', () => {
  const locked = buildContractLifecycle({ canEdit: false });
  for (const record of [ext(), { status: 'draft', source: 'generated' }]) {
    assert.ok(!locked.available(record, AE_SUP).map((e) => e.id).includes('issue'));
  }
});

/* 🔴 ต้นตอของเอกสารปลอม — `fields` ของแม่แบบถูกเติมให้ใบ external ตั้งแต่วันสร้าง
   เพราะ route เรียก `contractFieldDefaults(body.kind, ...)` โดยไม่ดู `source`
   ⇒ ใบ external ชนิด `scent_design` มีชื่อ/เลขทะเบียน/ที่อยู่ + ค่าตั้งต้นครบทุกช่อง
   ⚠️ ทางแก้ **ไม่ใช่** ห้าม external เลือกชนิดที่มีแม่แบบ — PO ครอบงานออกแบบกลิ่นได้จริง */
test('🔴 route สร้างต้องไม่เติม fields ของแม่แบบให้ใบ external', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /fields: external\s*\n\s*\? \{\}/, 'external ต้องได้ fields ว่าง');
  assert.match(route, /templateKey: external \? null :/, 'ใบ external ไม่ได้อ้างแม่แบบใบไหน');
});

/* 🪤 **ประตูหลังของ `fields`** — กันแค่ตอนสร้างไม่พอ ค่าเดิมเดินกลับเข้ามาทาง PATCH ได้
   (จอไม่มีช่องให้กรอกแล้ว แต่ยิงตรงได้) แล้วเส้นเอกสารก็มีของให้เรนเดอร์อีกครั้ง */
test('🪤 PATCH ต้องทิ้ง fields ของใบ external และคุมช่องของสายนี้ตามที่มา', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/[id]/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /if \(isExternalContract\(before\)\) \{\s*\n\s*delete patch\.fields;/);
  // ช่องของสาย external แก้ได้ (กติกา "ฟอร์มสร้าง = ฟอร์มแก้") แต่ต้องผ่านด่านค่าที่รู้จัก
  assert.match(route, /'externalDocKind', 'externalRef',/);
  assert.match(route, /EXTERNAL_DOC_KINDS\.includes\(patch\.externalDocKind\)/);
  /* 🔴 ใบที่ระบบเจนต้องไม่มีสองช่องนี้เลย — CHECK `sales_contracts_external_kind`
     บังคับให้เป็น NULL ⇒ ปล่อยผ่านคือ 23514 ที่คนอ่านไม่ออก */
  assert.match(route, /delete patch\.externalDocKind;/);
});

/* 🔴 เครื่องเจนเอกสารตัวที่สอง — บันทึกเพิ่มเติมสัญญาเขียนขึ้นเป็นภาคผนวกของสัญญาจ้าง
   ออกแบบกลิ่น *ฉบับของเรา* และดึงสถานที่/ผู้ลงนามจาก `contract.fields` ของสัญญาแม่
   ⇒ ใบ external ที่ signed แล้วเคยผ่านด่านได้ (kind ตรง + status ตรง) แล้วออกเอกสารที่
     อ้างข้อสัญญาซึ่งไม่มีอยู่ในกระดาษที่ทั้งสองฝ่ายถืออยู่ · เป็นรูเดียวกับเส้นพิมพ์สัญญา
     แค่ย้ายบ้านมาอยู่เอกสารลูก (และหลังตัด fields ทิ้ง มันจะพิมพ์คู่สัญญาเป็นเส้นประ) */
test('🔴 ใบ external ทำบันทึกเพิ่มเติมสัญญาไม่ได้', () => {
  const signedExternal = { kind: 'scent_design', status: 'signed', source: 'external' };
  const gate = addendumEligibility({ contract: signedExternal });
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /เอกสารภายนอก/);
  /* ใบที่ระบบเจนต้องเดินต่อไปติดด่านของตัวเอง (ไม่ใช่ถูกด่านใหม่กวาดไปด้วย) */
  const generated = addendumEligibility({ contract: { kind: 'scent_design', status: 'signed' } });
  assert.match(generated.reason, /คำร้องพัฒนากลิ่น/, 'ใบ generated ต้องตกที่ด่านคำร้อง ไม่ใช่ด่าน external');
});

/* รางขั้นต้องเล่าเส้นทางของใบนั้นจริง ๆ — สาย external เดิน draft → signed ทีเดียว
   ใช้รางร่วมกันแล้วใบ external จะโชว์ขั้นที่ไม่มีวันเดินผ่าน และหมุดแรกยังสั่งให้
   "กรอกข้อมูลคู่สัญญาและเงื่อนไข" ซึ่งเป็นช่องที่ใบนี้ตั้งใจไม่มี */
test('รางขั้นของใบ external เหลือสองหมุด ไม่มี "รอลงนาม"', () => {
  const ext2 = buildContractLifecycle({ canEdit: true, external: true });
  const labels = ext2.railSteps(ext()).map((step) => step.label);
  assert.deepEqual(labels, ['ร่าง', 'อนุมัติใช้แทนสัญญาแล้ว']);

  const gen = buildContractLifecycle({ canEdit: true });
  const genLabels = gen.railSteps({ status: 'draft' }).map((step) => step.label);
  assert.deepEqual(genLabels, ['ร่าง', 'รอลงนาม', 'รอหัวหน้ารับรอง', 'ลงนามแล้ว']);
});

/* ฟอร์มแก้ต้องไม่กางช่องของแม่แบบให้ใบ external — ตัดสินจาก `source` ไม่ใช่ `kind`
   (ชนิด `scent_design` คืนช่องมาครบเสมอ ไม่ว่าใบนั้นจะใช้แม่แบบหรือไม่) */
test('หน้ารายละเอียดตัดช่องแม่แบบและป้าย "ยังกรอกไม่ครบ" ของใบ external ด้วย source', () => {
  const page = readFileSync(
    new URL('../../app/sales-planning/contracts/[id]/page.js', import.meta.url),
    'utf8',
  );
  assert.match(page, /\(external \? \[\] : contractTemplateFields\(contract\?\.kind\)\)/);
  assert.match(page, /contract && !external \? missingContractFields/);
  // ช่องของสาย external ต้องมีในฟอร์มแก้ด้วย ไม่ใช่มีแค่ตอนสร้าง
  assert.match(page, /onExternalPatch=/);
});

test('ใบเก่าที่ไม่มีช่อง source = ใบที่ระบบเจน ไม่ใช่ external', () => {
  assert.equal(contractSourceOf({}), 'generated');
  assert.equal(contractSourceOf({ source: 'มั่ว' }), 'generated', 'ค่าที่ไม่รู้จักต้องไม่กลายเป็น external');
  assert.equal(isExternalContract({}), false);
});

/* กติกา GatedAction — เจ้าของขั้นเห็นปุ่มเสมอ คนอื่นไม่เห็น */
test('ปุ่มโผล่เฉพาะ AE Sup บนใบ external ที่ยังเป็นร่าง', () => {
  assert.equal(showExternalApprove(ext(), AE_SUP), true);
  assert.equal(showExternalApprove(ext(), AE), false);
  assert.equal(showExternalApprove(ext({ status: 'signed' }), AE_SUP), false);
  assert.equal(showExternalApprove({ status: 'draft', source: 'generated' }, AE_SUP), false);
});

/* ── ยามของ route อนุมัติเอกสารภายนอก ───────────────────────────────────────
   🔴 เทสต์นี้มีอยู่เพราะ **ไม่มีอะไรอื่นจับได้** — `/contracts/[id]/sign` ที่อยู่ข้าง ๆ
   ใช้ `canEditSalesPlanning` ซึ่ง AE/AC ผ่านหมด · ถ้าใครลอกไฟล์นั้นมาแก้ต่อ ปุ่ม
   "อนุมัติเอกสารแทนสัญญา" จะกลายเป็นปุ่มที่ AE กดของตัวเองได้ และเทสต์ตรรกะข้างบน
   ก็ยังเขียวหมด เพราะ route ไม่ได้เรียก `externalApproveError` แล้ว */
test('🔴 route อนุมัติเอกสารภายนอกต้องถามด่านของตัวเอง ไม่ใช่ยืม canEditSalesPlanning', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/[id]/approve-external/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /externalApproveError\(before, user,/, 'ต้องเรียกด่านตัวเดียวกับปุ่มบนจอ');
  // จับ **การเรียกใช้** ไม่ใช่ตัวคำ — คอมเมนต์ในไฟล์อธิบายว่าทำไมถึงไม่ใช้ตัวนี้
  assert.doesNotMatch(route, /canEditSalesPlanning\(/, 'ห้ามยืมด่านของ /sign — AE/AC จะผ่าน');
  assert.match(route, /approve_external_sales_contract/, 'ต้องใช้ RPC ที่จบที่ signed');
  assert.doesNotMatch(route, /rpc\('issue_sales_contract'/, 'RPC เดิมจบที่ awaiting_signature — ใบจะค้าง');
});

/* ── 🐞 บั๊กที่เจอบนจอจริง 2026-08-31 (หลัง #1529 ขึ้น production) ────────────
   ป้าย "สัญญาบริการ" เทาทุกลูกค้าพร้อมเหตุผลผิด ("ลูกค้ารายนี้ยังไม่มีดีลที่ออกสัญญา
   ชนิดนี้ได้") ทั้งที่ฐานมีดีลสาย SERVICE ที่ออกได้ 29 ดีล
   ต้นเหตุ: `/contracts/options` กรอง `kinds` ด้วย `hasContractTemplate` แล้วดีลบริการ
   `kinds` ว่าง ⇒ ถูก `.filter(row => row.kinds.length)` ตัดทิ้งทั้งหมด
   ⇒ ฟีเจอร์ที่ทำมาเพื่อ **ข้าม** ข้อจำกัดแม่แบบ ถูกข้อจำกัดเดิมปิดตายเสียเอง */
test('🐞 /contracts/options ต้องไม่กรองชนิดสัญญาด้วยแม่แบบ — ไม่งั้นเส้น external ตาย', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/options/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /kinds: contractKindsForDeal\(row\.deal, row\.project\),/);
  assert.doesNotMatch(
    route,
    /contractKindsForDeal\([^)]*\)\.filter\(hasContractTemplate\)/,
    'ความพร้อมของแม่แบบเป็นเรื่องของ "ที่มา" ที่จอถามทีหลัง ไม่ใช่ของ "ดีลนี้ออกชนิดไหนได้"',
  );
});

/* จอต้องเป็นคนบวกเงื่อนไขแม่แบบตามที่มาที่เลือก — และต้องกันที่ `disabled` ไม่ใช่แค่คำอธิบาย */
test('โมดัลสร้างสัญญากันแม่แบบตามที่มา ไม่ใช่ปล่อยให้กดแล้วปุ่มตาย', () => {
  const modal = readFileSync(
    new URL('../../components/salesPlanning/ContractCreateModal.js', import.meta.url),
    'utf8',
  );
  /* ⚠️ ยึด **เจตนา** ไม่ใช่รูปประโยค — เคยปักนิพจน์ตรงตัวแล้วเทสต์แตกตอนยกออกมา
     เป็นตัวแปร `needsTemplate` ทั้งที่พฤติกรรมเหมือนเดิมเป๊ะ */
  assert.match(modal, /const needsTemplate = !external && !hasContractTemplate\(item\);/);
  assert.match(modal, /disabled: [^\n]*needsTemplate/, 'ต้องกันที่ disabled ไม่ใช่แค่คำอธิบาย');
  // สาย external ต้องไม่ถูกด่านแม่แบบแตะเลย
  assert.match(modal, /const chosenReady = external\s*\n\s*\? !!kind && EXTERNAL_DOC_KINDS\.includes\(externalDocKind\)/);
});

/* ⭐ **ทางออกสัญญาจากใบสั่งขาย** — เดิมมีสี่ทาง (ดีล · โครงการ · ใบเสนอราคา · ทะเบียน)
   แต่ไม่มีทางจาก SO ทั้งที่การ์ดสัญญาบนใบนั้นเองบอกให้ *"ออกสัญญาที่เมนู สัญญา"*
   🪤 **ต้องอยู่บนการ์ดจัดการ ไม่ใช่ในแท็บสัญญา** — แท็บนั้นขึ้นเฉพาะใบที่มีรอบบริการ
      ⇒ ใบสายสินค้าที่ต้องออก "สัญญาจ้างผลิต" จะไม่มีปุ่มเลยและไม่มีทางรู้ว่ามันมีอยู่
   🪤 **ต้องเป็นโมดัลตัวเดิม** — ก๊อปฟอร์มที่สองเมื่อไร สองฝั่งจะขาดคนละอย่างโดยไม่มีใครรู้
      (กฎ "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" ของ AGENTS.md) */
test('⭐ หน้าใบสั่งขายออกสัญญาได้ ด้วยโมดัลตัวเดียวกับหน้าอื่น', () => {
  const page = readFileSync(
    new URL('../../app/sales-planning/sales-orders/[id]/page.js', import.meta.url),
    'utf8',
  );
  assert.match(page, /import ContractCreateModal from "@\/components\/salesPlanning\/ContractCreateModal";/);
  // ส่งดีล+ใบเสนอราคาของใบไปให้ ⇒ ข้ามขั้นเลือกลูกค้า/ดีล
  assert.match(page, /dealId=\{order\.dealId\}/);
  assert.match(page, /quotationId=\{order\.quotationId\}/);
  // ปุ่มอยู่ใน secondaryActions ของการ์ดจัดการ ไม่ใช่ในบล็อกของแท็บ
  assert.match(page, /id: "contract",[\s\S]{0,200}?label: "ออกสัญญาจากใบนี้"/);
  assert.ok(
    page.indexOf('label: "ออกสัญญาจากใบนี้"') < page.indexOf('activeTab === "contract"'),
    'ปุ่มต้องประกาศในชุด action ของการ์ดจัดการ ไม่ใช่ในเนื้อแท็บสัญญา',
  );
  // ใบที่ตายแล้วไม่ต้องมีปุ่ม — ออกสัญญาจากใบที่ยกเลิกไปแล้วอ่านแล้วสับสน
  assert.match(page, /visible: canEdit && !editMode && !\["cancelled", "revised"\]\.includes\(order\.status\)/);
});

/* ── เลขที่สัญญามีอักษรย่อชนิด (มติผู้ใช้ 2026-08-31) ─────────────────────────
   `CT-YYMMXXXX-R` → `CT-AA-YYMMXXXX-R` — อ่านเลขแล้วรู้ว่าสัญญาอะไรโดยไม่ต้องเปิดใบ */
test('⭐ เลขที่สัญญา CT-BB-YYMMXXXX — อักษรย่อชนิดสัญญาอยู่กลาง', () => {
  assert.equal(contractNumberPattern('scent_design'), 'CT-SD-{YY}{MM}{RUNNING:4}');
  assert.equal(contractNumberPattern('manufacturing'), 'CT-MF-{YY}{MM}{RUNNING:4}');
  assert.equal(contractNumberPattern('service'), 'CT-SR-{YY}{MM}{RUNNING:4}');
  /* ⚠️ **SR ไม่ใช่ SV** — SV เป็นรหัสทีมขาย Services ที่โผล่ในชื่อดีลทุกใบ
     ใช้ซ้ำเมื่อไรคนอ่านเลขจะไม่แน่ใจว่าหมายถึงชนิดสัญญาหรือทีมที่ขาย */
  assert.equal(contractKindCode('service'), 'SR');
  assert.notEqual(contractKindCode('service'), 'SV');
});

/* 🔴 ชนิดที่ไม่รู้จักต้องตัน ไม่ใช่ออกเลขที่มีอักษรย่อมั่ว — เลขที่ออกไปแล้วลบไม่ได้ */
test('ชนิดที่ไม่รู้จักคืน null ไม่ใช่เดาอักษรย่อให้', () => {
  for (const bad of [null, undefined, '', 'มั่ว', 'SERVICE']) {
    assert.equal(contractNumberPattern(bad), null, String(bad));
  }
});

/* 🔴 **เลขรันไม่ตัดรอบเดือน** (มติผู้ใช้ 2026-08-31: "XXXX รันเรื่อยๆ")
   จุดที่พลาดง่ายที่สุด: เลขมี `YYMM` อยู่ในตัว แต่ตัวตัดรอบคือ **คีย์ month ของตัวนับ**
   ซึ่งเป็นคนละค่า ⇒ ต้องเป็น `'-'` ไม่ใช่ `businessMonthKey()`
   เผลอกลับไปใช้เดือนเมื่อไร เลขจะรีเซ็ตทุกเดือนแล้วชนกับใบเดือนก่อนทันที */
test('⭐ คีย์ตัวนับต้องเป็น "-" ไม่ใช่เดือน — เลขรันเดินยาวข้ามเดือน', () => {
  assert.equal(CONTRACT_NUMBER_MONTH, '-');
  assert.doesNotMatch(CONTRACT_NUMBER_MONTH, /^\d{4}$/, 'ห้ามเป็น YYMM');
});

test('ทุกชนิดที่ระบบรองรับต้องมีอักษรย่อครบ และไม่ซ้ำกัน', () => {
  const codes = CONTRACT_KINDS.map(contractKindCode);
  assert.ok(codes.every(Boolean), 'มีชนิดที่ยังไม่มีอักษรย่อ');
  assert.equal(new Set(codes).size, codes.length, 'อักษรย่อซ้ำกัน');
});

/* ทั้งสองเส้นที่ออกเลขต้องใช้รูปแบบรายชนิด ไม่ใช่ค่าคงที่ตัวเดียวแบบเดิม */
test('route ออกเลขทั้งสองเส้นใช้รูปแบบตามชนิด + ตัวนับไม่ตัดรอบ', () => {
  for (const rel of ['issue', 'approve-external']) {
    const route = readFileSync(
      new URL(`../../app/api/sales-planning/contracts/[id]/${rel}/route.js`, import.meta.url),
      'utf8',
    );
    assert.match(route, /contractNumberPattern\([^,)]+\)/, rel);
    assert.doesNotMatch(route, /CONTRACT_NUMBER_PATTERN/, `${rel}: ค่าคงที่เดิมถูกถอดแล้ว`);
    // ชนิด/รหัสที่ไม่ครบต้องถูกปฏิเสธก่อนถึง RPC
    assert.match(route, /if \(!pattern\) return fail\(/, rel);
    /* 🪤 เลขรันเดินยาว ⇒ คีย์ตัวนับต้องเป็น `'-'` **ห้ามกลับไปใช้เดือน**
       เผลอเมื่อไรเลขจะตัดรอบทุกเดือนแล้วชนกับใบเดือนก่อนทันที */
    assert.match(route, /p_month: CONTRACT_NUMBER_MONTH/, rel);
    assert.doesNotMatch(route, /businessMonthKey\(/, `${rel}: เลขไม่ผูกเดือนแล้ว`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   ขั้น "หัวหน้ารับรองการลงนาม" (mig 0323 · มติผู้ใช้ 2026-08-31)
   *"ต้องมีขั้น Approve จาก AE sup ด้วย ไม่งั้นไปทำงานต่อไม่ได้"*
   ═══════════════════════════════════════════════════════════════════════ */
const waiting = (extra = {}) => ({
  status: 'awaiting_approval', source: 'generated',
  signedDate: '2026-08-20', signedFileId: 'ATT-9', ...extra,
});

/* 🔴 ด่านที่ต้องไม่รั่ว — `/sign` ที่อยู่ก่อนหน้าใช้ `canEditSalesPlanning` ซึ่ง AE/AC
   ผ่านหมด · ถ้าขั้นนี้ใช้ตัวเดียวกัน คนที่กดลงนามก็กดรับรองตัวเองได้ = ไม่มีด่านที่สอง */
test('⭐ รับรองการลงนามได้เฉพาะ AE Supervisor (กับ admin)', () => {
  assert.equal(signedApproveError(waiting(), AE_SUP), null);
  assert.equal(signedApproveError(waiting(), ADMIN), null);
  for (const u of [AE, AC, FN]) {
    assert.match(signedApproveError(waiting(), u), /เฉพาะ AE Supervisor/, u.role);
  }
});

test('รับรองได้เฉพาะใบที่บันทึกลงนามแล้ว', () => {
  assert.match(signedApproveError(waiting({ status: 'awaiting_signature' }), AE_SUP), /ยังไม่ได้บันทึกการลงนาม/);
  assert.match(signedApproveError(waiting({ status: 'signed' }), AE_SUP), /รับรองไปแล้ว/);
  assert.match(signedApproveError(waiting({ status: 'draft' }), AE_SUP), /ยังไม่เข้าขั้นรับรอง/);
});

/* ⭐ ไฟล์บังคับ — ฐานบังคับด้วย CHECK `sales_contracts_awaiting_approval_signed`
   ตรวจซ้ำที่นี่เพื่อให้ผู้ใช้ได้ข้อความไทย ไม่ใช่ 23514 ดิบ ๆ */
test('ใบที่ไม่มีไฟล์/วันที่ลงนาม รับรองไม่ได้', () => {
  assert.match(signedApproveError(waiting({ signedFileId: null }), AE_SUP), /ไฟล์ฉบับลงนาม/);
  assert.match(signedApproveError(waiting({ signedDate: null }), AE_SUP), /วันที่ลงนาม/);
});

/* ⚠️ สาย external ไม่มีขั้นนี้ (มติผู้ใช้) — กดทีเดียว draft → signed */
test('สอง "ปุ่มอนุมัติ" ไม่มีทางขึ้นพร้อมกัน — คนละสถานะกัน', () => {
  assert.equal(showSignedApprove(waiting(), AE_SUP), true);
  assert.equal(showExternalApprove(waiting(), AE_SUP), false);
  const extDraft = { status: 'draft', source: 'external', externalDocKind: 'customer_po' };
  assert.equal(showExternalApprove(extDraft, AE_SUP), true);
  assert.equal(showSignedApprove(extDraft, AE_SUP), false);
});

/* 🪤 `signed` ยังแปลว่า "ใช้งานได้" เหมือนเดิม เพราะ mig 0323 บังคับที่ฐานแล้วว่า
   signed ต้องมีคนรับรอง ⇒ ของที่เคยเช็ค status==='signed' ไม่ต้องแก้สักจุด */
test('contractInForce = signed เท่านั้น — ขั้นรอรับรองยังใช้งานไม่ได้', () => {
  assert.equal(contractInForce({ status: 'signed' }), true);
  assert.equal(contractInForce(waiting()), false);
  assert.equal(contractInForce({ status: 'awaiting_signature' }), false);
});

test('ยกเลิกได้ถึงขั้นรอรับรอง — ใบที่ลงนามผิดฉบับต้องมีทางออก', () => {
  assert.equal(canCancelContract(waiting()), true);
  assert.equal(canCancelContract({ status: 'signed' }), false);
});

/* ยามของ route รับรอง — เหตุผลเดียวกับยามของ approve-external */
test('🔴 route รับรองการลงนามถามด่านของตัวเอง ไม่ยืม canEditSalesPlanning', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/[id]/approve-signed/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /signedApproveError\(before, user\)/);
  assert.doesNotMatch(route, /canEditSalesPlanning\(/);
  // กันสองคนกดชน — ต้องเขียนทับเฉพาะใบที่ยังอยู่ขั้นรับรอง
  assert.match(route, /\.eq\('status', 'awaiting_approval'\)/);
});

/* ต้นทาง: /sign ต้องไม่ปิดเป็น signed เองอีกแล้ว */
test('⭐ /sign หยุดที่ "รอหัวหน้ารับรอง" ไม่ปิดเป็นลงนามแล้วเอง', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/[id]/sign/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /status: 'awaiting_approval'/);
  assert.doesNotMatch(route, /status: 'signed'/, 'สายนี้ต้องไม่มีทางลัดไป signed');
});
