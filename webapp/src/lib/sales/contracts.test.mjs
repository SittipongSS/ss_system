import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  approvedQuotationsForContract,
  canApproveExternalContract,
  canCancelContract,
  canDeleteContract,
  canIssueContract,
  canSignContract,
  contractEligibility,
  contractKindsForDeal,
  contractSourceOf,
  daysAwaitingSignature,
  externalApproveError,
  isContractWaitingOnMe,
  isExternalContract,
  showExternalApprove,
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
