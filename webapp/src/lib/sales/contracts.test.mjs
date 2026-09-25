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
  externalApproveOpenError,
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

/* ⭐ **มติผู้ใช้ 2026-09-06 กลับด้านจากมติ 2026-08-21** — เดิมเว้นว่างตามต้นฉบับ 13 ส.ค.
   ที่ตัดบรรทัดนี้ออก · แต่บันทึกเพิ่มเติมกับสัญญาบริการใช้ "ผู้มีอำนาจ/ผู้รับมอบอำนาจ" ทั้งคู่
   ⇒ ลูกค้ารายเดียวกันเซ็นสามฉบับแล้วเห็นคนละคำ · ผู้ใช้เลือกให้ทั้งสามฉบับพูดคำเดียวกัน
   ⚠️ เป็นจุดที่ตั้งใจต่างจากต้นฉบับ — ห้ามถอดกลับเพราะ "ต้นฉบับไม่มี" โดยไม่ถามเจ้าของเรื่อง */
test('ตำแหน่งผู้ลงนามฝั่งผู้ว่าจ้าง: สามฉบับใช้คำเดียวกัน', async () => {
  const { contractFieldDefaults } = await import('./contractTemplates.js');
  const { ADDENDUM_TEMPLATE } = await import('./contractTemplateAddendum.js');
  const WORD = 'ผู้มีอำนาจ/ผู้รับมอบอำนาจ';

  assert.equal(contractFieldDefaults('scent_design', {}).clientSignerTitle, WORD);
  assert.equal(contractFieldDefaults('service', {}).clientSignerTitle, WORD);
  const addendumField = ADDENDUM_TEMPLATE.fields.find((f) => f.key === 'clientSignerTitle');
  assert.equal(addendumField.default, WORD);
  // ลบทิ้งเองยังได้ = ไม่พิมพ์บรรทัดนั้น (ต้นฉบับ 13 ส.ค. ไม่มีบรรทัดนี้)
  const cleared = contractFieldDefaults('scent_design', { current: { clientSignerTitle: '' } });
  assert.equal(cleared.clientSignerTitle, WORD, 'ค่าว่างถือว่ายังไม่กรอก — เติมค่าตั้งต้นให้');
});

test('ข้อ 2.9 ใช้ถ้อยคำของต้นฉบับล่าสุด — "เลขที่ใบรับแจ้งน้ำหอม"', async () => {
  const { SCENT_DESIGN_TEMPLATE } = await import('./contractTemplateScentDesign.js');
  const clause = SCENT_DESIGN_TEMPLATE.sections
    .flatMap((section) => section.clauses)
    .find((item) => item.no === 'ข้อ 2.9');
  // ฉบับ 13 ส.ค. 2569 เติมคำว่า "ใบรับแจ้ง" — จุดเดียวที่ต่างจากรุ่น 20260708
  assert.match(clause.text, /เลขที่ใบรับแจ้งน้ำหอมของ/);
  /* เลขรุ่นขึ้นต้นด้วยวันที่ของ *ต้นฉบับ* เสมอ · ตัวอักษรท้ายคือรอบแก้ของเราเอง
     (`20260813b` = มติ 2026-09-06 ใส่ค่าตั้งต้นตำแหน่งผู้ลงนาม) · `20260922` = ข้อ 2.8 ใหม่ */
  assert.match(SCENT_DESIGN_TEMPLATE.version, /^20260922/);
});

test('ข้อ 2.8 ฉบับ 22 ก.ย. — ลูกค้าทำสินค้าสำเร็จรูปที่อื่นได้ · สูตรผลิตให้ลูกค้ารายนี้รายเดียว', async () => {
  const { SCENT_DESIGN_TEMPLATE } = await import('./contractTemplateScentDesign.js');
  const { text } = SCENT_DESIGN_TEMPLATE.sections
    .flatMap((section) => section.clauses)
    .find((item) => item.no === 'ข้อ 2.8');
  // ชื่อคู่สัญญาเป็นช่องกรอก — ข้อความที่ผู้ใช้ส่งมาเป็นฉบับกรอกชื่อลูกค้ารายหนึ่งไว้แล้ว
  assert.match(text, /ร่วมกับ \{\{contractorName\}\} และ \{\{clientName\}\} /);
  assert.doesNotMatch(text, /แฮปป้า/);
  // เลขที่น้ำหอมไม่ได้เป็นความลับร่วมแล้ว
  assert.doesNotMatch(text, /เลขที่น้ำหอม/);
  assert.match(text, /สามารถนำหัวน้ำหอมที่ผลิตกับผู้รับจ้างไปผลิตกับโรงงานอื่นเป็นสินค้าสำเร็จรูปได้/);
  assert.doesNotMatch(text, /ไม่สามารถนำไปผลิตกับที่อื่น/);
  /* มติ 2026-09-22: "แต่เพียงผู้เดียว" = เราผลิตสูตรนี้ให้ลูกค้ารายนี้รายเดียว
     ไม่ใช่ "ลูกค้าต้องผลิตกับเราเท่านั้น" — ประโยคท้ายปิดทางอ่านแบบหลัง */
  assert.match(text, /ผู้รับจ้างจะผลิตให้กับทางผู้ว่าจ้างแต่เพียงผู้เดียว/);
  assert.match(text, /ผู้รับจ้างไม่สามารถนำไปผลิตให้กับผู้ว่าจ้างรายอื่นได้$/);
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

/* 🪤 **ทะเบียนกับหน้ารายละเอียดต้องนับขั้นเท่ากัน** — ของเดิมทะเบียนยุบขั้น
   "รอหัวหน้ารับรอง" (mig 0323) เป็นโน้ตบนหมุดสุดท้าย ⇒ ทะเบียน 3 หมุด หน้าใบ 4 หมุด
   คนคนเดียวกันเปิดสองหน้านี้ห่างกันคลิกเดียวแล้วนับไม่ตรง · เหตุผลที่หน้ารายละเอียด
   เขียนไว้เองใช้ได้กับทะเบียนยิ่งกว่า: ทะเบียนคือที่ที่คนกวาดตาหาว่าใบไหนค้าง */
/* เกณฑ์ "ค้างเกิน N วัน" ต้องมาจาก lib เดียว — เคยมีสี่สำเนา (การ์ดสรุป · ป้ายหน้าใบ ·
   ราง · ตัวหนังสือบนป้าย) แก้เลขที่เดียวแล้วอีกสามที่โกหก
   ⚠️ ล็อกตัวเปรียบเทียบด้วย: เท่าเกณฑ์พอดี = ยังไม่สาย · เกินหนึ่งวัน = สาย (`>` ไม่ใช่ `>=`) */
/* ยอดรวม VAT + ตัวหนังสือ เติมจากใบเสนอราคาตอนสร้างร่าง (แก้ 2026-09-06)
   ⚠️ ต้องเก็บเป็น **ตัวเลขดิบ** — ตัวเรนเดอร์เป็นคนจัดคอมมา/ทศนิยมจาก type:'money' */
test('สัญญาบริการ: ยอดรวม VAT และตัวหนังสือมาจากใบเสนอราคา', async () => {
  const { contractFieldDefaults } = await import('./contractTemplates.js');

  const filled = contractFieldDefaults('service', { quotation: { totalAmount: 38199 } });
  assert.equal(filled.totalWithVat, 38199);
  assert.equal(typeof filled.totalWithVat, 'number', 'ห้ามเก็บสตริงที่จัดรูปแล้ว');
  assert.match(filled.totalWithVatText, /^สามหมื่นแปดพันหนึ่งร้อยเก้าสิบเก้าบาท/);

  // คนกรอกไว้เองชนะเสมอ (ฟังก์ชันเติมเฉพาะช่องว่าง)
  const typed = contractFieldDefaults('service', {
    quotation: { totalAmount: 38199 }, current: { totalWithVat: 40000, totalWithVatText: 'สี่หมื่นบาทถ้วน' },
  });
  assert.equal(typed.totalWithVat, 40000);
  assert.equal(typed.totalWithVatText, 'สี่หมื่นบาทถ้วน');

  /* ยอดว่าง = ไม่เติมอะไรเลย · "ศูนย์บาทถ้วน" จะผ่านด่านช่องบังคับไปขึ้นกระดาษเงียบ ๆ */
  for (const q of [null, { totalAmount: 0 }, { totalAmount: null }]) {
    const blank = contractFieldDefaults('service', { quotation: q });
    assert.ok(!blank.totalWithVat, `ยอดว่างต้องไม่ถูกเติม (${JSON.stringify(q)})`);
    assert.ok(!blank.totalWithVatText, 'ตัวหนังสือต้องไม่ถูกเติมเมื่อยอดว่าง');
  }
});

test('เกณฑ์ค้างลงนามมาจากค่าเดียว และเทียบด้วย > เท่านั้น', async () => {
  const { SIGNATURE_LATE_DAYS } = await import('./contracts.js');
  const { contractListTrack } = await import('./contractListTrack.js');
  const day = 86400000;
  const at = (days) => new Date(Date.now() - days * day).toISOString();
  const stepOf = (days) => contractListTrack({
    status: 'awaiting_signature', contractNo: 'CT-SD-26090001-0', issuedAt: at(days),
  }).steps.find((s) => s.key === 'issue');

  assert.equal(SIGNATURE_LATE_DAYS, 14);
  assert.equal(stepOf(SIGNATURE_LATE_DAYS).state, 'now', 'เท่าเกณฑ์พอดียังไม่สาย');
  assert.equal(stepOf(SIGNATURE_LATE_DAYS + 1).state, 'bad', 'เกินหนึ่งวันคือสาย');
});

test('ทะเบียนสัญญา: รางสี่ขั้น ร่าง → รอลงนาม → รอหัวหน้ารับรอง → ลงนามแล้ว', async () => {
  const { contractListTrack } = await import('./contractListTrack.js');
  const { STEPS } = await import('./contractLifecycle.js');
  const state = (row) => contractListTrack(row).steps.map((s) => s.state);

  assert.deepEqual(state({ status: 'draft' }), ['now', 'todo', 'todo', 'todo']);
  assert.deepEqual(state({ status: 'awaiting_signature', contractNo: 'CT-1', issuedAt: new Date().toISOString() }), ['done', 'now', 'todo', 'todo']);
  assert.deepEqual(state({ status: 'awaiting_approval', contractNo: 'CT-1' }), ['done', 'done', 'now', 'todo']);
  assert.deepEqual(state({ status: 'signed', contractNo: 'CT-1', signedDate: '2026-08-20' }), ['done', 'done', 'done', 'done']);

  // ขั้นที่รอคนอื่นต้องบอกว่ารอใคร ไม่ใช่หมุดเหลืองเปล่า ๆ
  const waiting = contractListTrack({ status: 'awaiting_approval', contractNo: 'CT-1' });
  assert.match(waiting.steps[2].note, /AE Supervisor/);

  // คำบนหมุดต้องตรงกับรางของหน้ารายละเอียดทุกตัว (อยู่คนละไฟล์)
  assert.deepEqual(
    contractListTrack({ status: 'draft' }).steps.map((s) => s.label),
    STEPS.map((s) => s.label),
  );

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

  // ใบที่ระบบเจนเดินรางสี่ขั้น (คนละชุดกับ external)
  assert.equal(contractListTrack({ status: 'draft' }).steps.length, 4);
  // ใบเก่าที่ไม่มีช่อง source = ใบที่ระบบเจน
  assert.equal(contractListTrack({ status: 'draft', source: null }).steps.length, 4);
  // ใบที่ตายแล้วยังไม่มีรางเหมือนเดิม ไม่ว่าสายไหน
  assert.equal(contractListTrack({ status: 'cancelled', source: 'external' }).closed, true);
});

/* 🐞 ของจริง 2026-09-15: เอกสารแทนสัญญาแนบไฟล์ครบตั้งแต่ 3 ก.ย. แต่รางยังสั่ง
   "แนบเอกสารที่ใช้แทนสัญญา" อยู่ 12 วัน — คนดูใบคิดว่ายังไม่มีใครทำอะไร */
test('⭐ ร่าง external ที่แนบเอกสารแล้ว รางเดินไปรอ AE Sup ไม่สั่งให้แนบซ้ำ', async () => {
  const { contractListTrack } = await import('./contractListTrack.js');
  const ready = contractListTrack({ status: 'draft', source: 'external', _externalDocReady: true });
  assert.deepEqual(ready.steps.map((s) => s.state), ['done', 'now']);
  assert.match(ready.steps[1].note, /AE Supervisor/);
  // ไม่มีธง = ยังไม่แนบ (พฤติกรรมเดิม) ไม่ใช่เดาว่าแนบแล้ว
  const bare = contractListTrack({ status: 'draft', source: 'external' });
  assert.deepEqual(bare.steps.map((s) => s.state), ['now', 'todo']);
  assert.match(bare.steps[0].note, /แนบเอกสาร/);
  // อนุมัติแล้ว ธงไม่มีผลอะไร
  const signed = contractListTrack({ status: 'signed', source: 'external', _externalDocReady: true });
  assert.deepEqual(signed.steps.map((s) => s.state), ['done', 'done']);
  // คำบนหมุดยังเป็นชุดเดียวกับหน้ารายละเอียด
  const { EXTERNAL_STEPS } = await import('./contractLifecycle.js');
  assert.deepEqual(ready.steps.map((s) => s.label), EXTERNAL_STEPS.map((s) => s.label));
});

/* 🔴 รีวิว 25/09: หน้ารายละเอียดต้องเดินหมุดเดียวกับทะเบียน/การ์ดบน SO — ของเดิมรางทะเบียนบอก
   "รอ AE Supervisor อนุมัติ" แต่คลิกเข้าหน้าใบแล้วยังสั่ง "แนบเอกสารที่ใช้แทนสัญญา" (สถานะของหมุดไม่ตรงกัน
   ทั้งที่คำบนหมุดตรง) ⇒ ล็อก **สถานะของหมุด** ไม่ใช่แค่คำ */
test('🔴 หน้ารายละเอียด: ร่าง external ที่แนบแล้วเดินหมุดเดียวกับทะเบียน', async () => {
  const { contractListTrack } = await import('./contractListTrack.js');
  const { buildContractLifecycle } = await import('./contractLifecycle.js');
  const detailStates = (docAttached, status = 'draft') => buildContractLifecycle({ external: true, docAttached, contract: { status } })
    .railSteps({ status }).map((step) => step.state);
  const listStates = (ready, status = 'draft') => contractListTrack({ status, source: 'external', _externalDocReady: ready })
    .steps.map((step) => step.state);
  const same = { done: 'done', now: 'current', todo: 'pending' };
  // แนบแล้ว: ขั้นแรกผ่าน ขั้นที่สองเป็นปัจจุบัน — ทั้งสองหน้า
  assert.deepEqual(detailStates(true), ['done', 'current']);
  assert.deepEqual(listStates(true).map((s) => same[s]), detailStates(true));
  // ยังไม่แนบ: พฤติกรรมเดิม — ทั้งสองหน้า
  assert.deepEqual(detailStates(false), ['current', 'pending']);
  assert.deepEqual(listStates(false).map((s) => same[s]), detailStates(false));
  // ธงไม่มีผลกับใบที่อนุมัติแล้ว
  assert.deepEqual(detailStates(true, 'signed'), detailStates(false, 'signed'));
  // คำบนหมุดยังเป็นชุดเดียวกัน
  const { EXTERNAL_ATTACHED_STEPS, EXTERNAL_STEPS } = await import('./contractLifecycle.js');
  assert.deepEqual(EXTERNAL_ATTACHED_STEPS.map((s) => s.label), EXTERNAL_STEPS.map((s) => s.label));
  /* หน้าใบ: การ์ดไฟล์โหลดแล้ว = เชื่อการ์ด · ยังไม่รู้ = ธงของเซิร์ฟเวอร์ (รีวิวรอบสอง 25/09 — เดิมอ่านการ์ดอย่างเดียว
     ⇒ ชุดแรก `[]` ก่อนโหลดเสร็จ/โหลดพัง ทำให้รางกะพริบกลับไป "แนบเอกสาร") */
  const page = readFileSync(new URL('../../app/sales-planning/contracts/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /docAttached: externalDocsKnown \? externalDocs\.length > 0 : !!contract\?\._externalDocReady,/);
  assert.match(page, /const handleAttachments = useCallback\(\(items, \{ loaded \} = \{\}\) => \{[\s\S]{0,400}?if \(!loaded\) return;/);
  const route = readFileSync(new URL('../../app/api/sales-planning/contracts/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /externalDocReadyIds\(supabase, \[current\], user, \{ anyViewer: true, strict: true \}\)/);
  assert.match(route, /_externalDocReady: externalDocReady,/);
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

/* ═══════════════════════════════════════════════════════════════════════
   🐞 **สายเอกสารภายนอกไม่มีคิวเลยทั้งเส้น** (เจอ 2026-09-02)
   สายนี้เดิน `draft → signed` ทีเดียว ไม่เคยแตะ `awaiting_approval` ⇒ เลนผู้รับรอง
   ที่เพิ่งเติมไปตอน mig 0323 ไม่เคยยิงกับมัน · ส่วนเลนเจ้าของถือใบไว้ตลอด แม้หลัง
   แนบไฟล์ครบแล้ว ⇒ **AE Supervisor ไม่มีทางรู้ว่ามีใบรออยู่** นอกจากมีคนไปบอก
   ═══════════════════════════════════════════════════════════════════════ */
const OWNER = { id: 'U-OWN', role: 'ae' };
const mineExt = (extra = {}) => ext({ ownerId: OWNER.id, createdBy: OWNER.id, ...extra });

test('🐞 ใบ external ร่างที่แนบเอกสารแล้ว = งานของ AE Sup ไม่ใช่ของเจ้าของใบ', () => {
  const ready = { externalDocReady: true };
  assert.equal(isContractWaitingOnMe(mineExt(), { user: AE_SUP, ...ready }), true);
  assert.equal(isContractWaitingOnMe(mineExt(), { userId: OWNER.id, user: OWNER, ...ready }), false,
    'แนบแล้ว = พ้นมือเจ้าของ ไปรอคนกดอนุมัติ');
  // AE ธรรมดาไม่ใช่ผู้อนุมัติ ⇒ ไม่เข้าเลนนี้
  assert.equal(isContractWaitingOnMe(mineExt(), { user: AE, ...ready }), false);
});

/* ⚠️ **ยังไม่แนบไฟล์ = ยังเป็นงานของเจ้าของ** — เติม AE Sup เข้าคิวตั้งแต่ใบยังว่าง
   จะทำให้ป้ายของเขาบวมด้วยใบที่กดไม่ได้ (ปุ่มอนุมัติต้องมีไฟล์ก่อน) */
test('ใบ external ร่างที่ยังไม่แนบเอกสาร ยังอยู่เลนเจ้าของ', () => {
  assert.equal(isContractWaitingOnMe(mineExt(), { userId: OWNER.id, user: OWNER }), true);
  assert.equal(isContractWaitingOnMe(mineExt(), { user: AE_SUP }), false);
});

/* 🪤 ไม่ส่งธงมา = ถือว่ายังไม่แนบ — ผู้เรียกที่ลืมต้องได้พฤติกรรมเดิม ไม่ใช่ป้ายบวม */
test('ไม่ส่ง externalDocReady = ตกเลนเจ้าของตามเดิม', () => {
  assert.equal(isContractWaitingOnMe(mineExt(), { user: AE_SUP }), false);
});

/* ใบที่ระบบเจนต้องไม่ถูกธงนี้แตะเลย — สายนั้นมีขั้น awaiting_approval ของตัวเองอยู่แล้ว */
test('ธงเอกสารภายนอกไม่กระทบใบที่ระบบเจน', () => {
  const gen = { status: 'draft', source: 'generated', ownerId: OWNER.id };
  assert.equal(isContractWaitingOnMe(gen, { user: AE_SUP, externalDocReady: true }), false);
  assert.equal(isContractWaitingOnMe(gen, { userId: OWNER.id, user: OWNER, externalDocReady: true }), true);
});

/* 🔴 คิวรีหาไฟล์แนบต้องไม่ยิงในกรณีปกติ — ตัวนับป้ายบนเมนูยิงทุก 2 นาทีทุกคน */
test('🔴 ตัวหาใบที่แนบเอกสารแล้วต้องแคบเสมอ ไม่ยิงฐานถ้าไม่จำเป็น', async () => {
  const { externalDocReadyIds } = await import('./contractExternalDocs.js');
  /* 🪤 นับ **การแตะฐาน** ไม่ใช่ผลลัพธ์ — ตัวห่อ `fetchAllResult` กลืน error ที่โยน
     ในคิวรีแล้วคืนชุดว่างเหมือนกัน ⇒ stub ที่ throw พิสูจน์อะไรไม่ได้เลย */
  const touched = [];
  const spy = { from(table) { touched.push(table); throw new Error('ห้ามแตะฐาน'); } };

  // คนที่ไม่ใช่ผู้อนุมัติ + ไม่ใช่ใบของตัวเอง — ไม่ยิงเลย (รีวิว 25/09: ใบของตัวเองถามได้ ดูเทสต์ถัดไป)
  assert.equal((await externalDocReadyIds(spy, [ext({ id: 'C0', ownerId: 'U-OTHER', createdBy: 'U-OTHER' })], AE)).size, 0);
  assert.equal((await externalDocReadyIds(spy, [ext({ id: 'C0' })], AE)).size, 0);
  assert.deepEqual(touched, [], 'ใบของคนอื่นพลิกเลนของคนดูไม่ได้ ต้องไม่ทำให้เกิดคิวรีเลย');
  // ไม่มีใบ external ร่างในชุด — ไม่ยิงเลย
  assert.equal((await externalDocReadyIds(spy, [{ id: 'C1', status: 'draft' }], AE_SUP)).size, 0);
  assert.equal((await externalDocReadyIds(spy, [ext({ id: 'C2', status: 'signed' })], AE_SUP)).size, 0);
  assert.deepEqual(touched, [], 'ไม่มีใบที่ต้องถาม ต้องไม่ทำให้เกิดคิวรีเลย');

  // มีใบที่ต้องถามจริง ⇒ ถามด้วยคีย์ชนิดเอกสารที่ถูก และคืนเฉพาะใบที่เจอไฟล์
  /* ⚠️ คิวรีถูกห่อด้วย `fetchAllResult` (กติกา check:rowcap) ⇒ ตัวปลอมต้องเป็น
     thenable ที่ตอบ `{ data, error }` และรับ `.range()` ที่ตัวไล่หน้าเรียก */
  const calls = [];
  const stub = {
    from(table) {
      calls.push(table);
      const q = {
        select: () => q,
        eq: (col, val) => { calls.push(`${col}=${val}`); return q; },
        in: (col, ids) => { calls.push(`${col} in ${ids.join(',')}`); return q; },
        order: () => q,
        range: () => q,
        limit: () => q,
        then: (resolve) => resolve({ data: [{ entityId: 'C3' }], error: null }),
      };
      return q;
    },
  };
  const found = await externalDocReadyIds(stub, [ext({ id: 'C3' }), ext({ id: 'C4' })], AE_SUP);
  assert.deepEqual([...found], ['C3']);
  assert.ok(calls.includes('attachments'));
  assert.ok(calls.includes('docType=external_doc'), `ถามด้วยคีย์ผิด: ${calls.join(' | ')}`);
  assert.ok(calls.some((c) => c.startsWith('entityId in ')));
});

/* ⭐ `anyViewer` — รางต้องรู้ว่าแนบแล้วไม่ว่าใครเปิด (เจ้าของใบคือคนที่ต้องเห็นมากที่สุด)
   แต่ยังต้องไม่ยิงฐานถ้าไม่มีใบ external ร่างในชุด และไม่เปิดธง = ด่านผู้อนุมัติเหมือนเดิม */
test('anyViewer: ถามให้คนที่ไม่ใช่ผู้อนุมัติได้ แต่ยังแคบเหมือนเดิม', async () => {
  const { externalDocReadyIds } = await import('./contractExternalDocs.js');
  const touched = [];
  const spy = { from(table) { touched.push(table); throw new Error('ห้ามแตะฐาน'); } };
  assert.equal((await externalDocReadyIds(spy, [{ id: 'C1', status: 'draft' }], AE, { anyViewer: true })).size, 0);
  assert.deepEqual(touched, [], 'ไม่มีใบ external ร่าง ต้องไม่ถามฐานแม้เปิดธง');

  const stub = {
    from() {
      const q = {
        select: () => q, eq: () => q, in: () => q, order: () => q, range: () => q, limit: () => q,
        then: (resolve) => resolve({ data: [{ entityId: 'C9' }], error: null }),
      };
      return q;
    },
  };
  assert.deepEqual([...(await externalDocReadyIds(stub, [ext({ id: 'C9' })], AE, { anyViewer: true }))], ['C9']);
  assert.equal((await externalDocReadyIds(stub, [ext({ id: 'C9' })], AE)).size, 0, 'ไม่เปิดธง + ไม่ใช่ใบของตัวเอง = ไม่ถาม');
});

/* 🔴 รีวิว 25/09: ร่างที่แนบเอกสารแล้วต้อง **หลุดเลน "ค้างอยู่กับคุณ" ของเจ้าของใบ** — รางบนแถวเดียวกัน
   บอก "รอ AE Supervisor อนุมัติ" · ของเดิมถามให้ผู้อนุมัติอย่างเดียว ⇒ เจ้าของเห็นใบค้างในเลนตัวเอง
   + ป้ายเมนู ทั้งที่ไม่มีอะไรให้ทำ · ตัวนับป้ายกับทะเบียนต้องได้ชุดเดียวกัน (`externalDocLaneIds`) */
test('🔴 เจ้าของใบ: ร่าง external ที่แนบแล้วหลุดเลนตัวเอง — ป้ายเมนูกับทะเบียนได้ชุดเดียวกัน', async () => {
  const { externalDocReadyIds, externalDocLaneIds } = await import('./contractExternalDocs.js');
  // ไฟล์แนบมีจริงสองใบ · stub ตอบเฉพาะ id ที่ถูกถามใน `.in()` เหมือนฐานจริง
  const withFile = new Set(['C-own', 'C-other']);
  const stub = {
    from() {
      let asked = [];
      const q = {
        select: () => q, eq: () => q, order: () => q, range: () => q, limit: () => q,
        in: (_col, ids) => { asked = ids; return q; },
        then: (resolve) => resolve({ data: asked.filter((id) => withFile.has(id)).map((entityId) => ({ entityId })), error: null }),
      };
      return q;
    },
  };
  const rows = [
    ext({ id: 'C-own', ownerId: AE.id }),
    ext({ id: 'C-other', ownerId: 'U-OTHER', createdBy: 'U-OTHER' }),
    ext({ id: 'C-own-empty', ownerId: AE.id }),
  ];
  // ตัวนับป้าย (ไม่เปิดธง) — ถามเฉพาะใบของตัวเอง
  const counter = await externalDocReadyIds(stub, rows, AE);
  assert.deepEqual([...counter], ['C-own']);
  // ทะเบียน (ถาม anyViewer ครั้งเดียว แล้วกรองด้วยกติกาเดียวกัน) — ต้องเท่ากับตัวนับเป๊ะ
  const attached = await externalDocReadyIds(stub, rows, AE, { anyViewer: true });
  assert.deepEqual([...externalDocLaneIds(rows, attached, AE)], [...counter]);
  // ผู้อนุมัติได้ทุกใบ
  assert.deepEqual([...externalDocLaneIds(rows, attached, AE_SUP)].sort(), ['C-other', 'C-own']);
  // ผลที่เลน: ใบที่แนบแล้วไม่ใช่งานของเจ้าของ · ใบที่ยังไม่แนบยังเป็นงานของเจ้าของ
  const lane = rows.filter((row) => isContractWaitingOnMe(row, {
    userId: AE.id, user: AE, externalDocReady: counter.has(row.id),
  })).map((row) => row.id);
  assert.deepEqual(lane, ['C-own-empty']);
});

/* 🔴 **เลนคิวของทะเบียนต้องยังใช้ชุดที่ผ่านด่านผู้อนุมัติ** — ป้ายตัวเลขบนเมนูของเจ้าของใบ
   คิดด้วยชุดว่าง (ตัวนับไม่เปิด anyViewer) ⇒ ถ้า route ของทะเบียนเอาชุด "แนบแล้ว" ไปตัดเลน
   ป้ายกับรายการจะนับไม่ตรงกันทันที */
test('🔴 route ทะเบียน: ธงแนบแล้วใช้กับราง ส่วนเลนคิวยังผ่านด่านผู้อนุมัติ', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/route.js', import.meta.url), 'utf8',
  );
  assert.match(route, /const docReady = externalDocLaneIds\(latest, docAttached, user\);/);
  assert.match(route, /externalDocReady: docReady\.has\(row\.id\)/);
  assert.match(route, /_externalDocReady: docAttached\.has\(row\.id\)/);
  const counts = readFileSync(new URL('../../app/api/nav/counts/route.js', import.meta.url), 'utf8');
  assert.doesNotMatch(counts, /anyViewer/, 'ตัวนับป้ายยิงทุก 2 นาทีทุกคน ห้ามเปิดธงนี้');
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
   ⭐ **25/09 ย้ายเข้าแท็บ "สัญญา" ซึ่งขึ้นทุกใบแล้ว** (มติเจ้าของ "เพิ่มสัญญาในหน้า SO" → "ทุกใบ")
      ของเดิมปุ่มต้องอยู่การ์ดจัดการเพราะแท็บขึ้นเฉพาะใบที่มีรอบบริการ ⇒ ใบสายสินค้าไม่มีทางเข้า
      ตอนนี้แท็บขึ้นทุกใบ ⇒ ปุ่มอยู่บนการ์ด "สัญญา" ของดีลในแท็บ · การ์ดจัดการไม่มีทางเข้าที่สอง
   🪤 **ต้องเป็นโมดัลตัวเดิม** — ก๊อปฟอร์มที่สองเมื่อไร สองฝั่งจะขาดคนละอย่างโดยไม่มีใครรู้
      (กฎ "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" ของ AGENTS.md) */
test('⭐ หน้าใบสั่งขายออกสัญญาได้ ด้วยโมดัลตัวเดียวกับหน้าอื่น — ผ่านการ์ดสัญญาของดีลในแท็บ', () => {
  const page = readFileSync(
    new URL('../../app/sales-planning/sales-orders/[id]/page.js', import.meta.url),
    'utf8',
  );
  const card = readFileSync(
    new URL('../../components/salesPlanning/DealContractsCard.js', import.meta.url),
    'utf8',
  );
  // การ์ดของดีลเปิดโมดัลตัวกลาง ส่งดีล+ใบเสนอราคาต่อ ⇒ ข้ามขั้นเลือกลูกค้า/ดีล
  assert.match(card, /import ContractCreateModal from "@\/components\/salesPlanning\/ContractCreateModal";/);
  assert.match(card, /<ContractCreateModal[\s\S]{0,120}?dealId=\{dealId\}[\s\S]{0,80}?quotationId=\{quotationId\}/);
  // หน้าใบส่งดีล+ใบเสนอราคาของใบเข้าการ์ด และปุ่มผ่านด่านของหน้า
  assert.match(page, /<DealContractsCard dealId=\{order\.dealId\} quotationId=\{order\.quotationId\} canEdit=\{canCreateContract\} \/>/);
  assert.ok(
    page.indexOf('<DealContractsCard') > page.indexOf('activeTab === "contract"'),
    'การ์ดต้องอยู่ในเนื้อแท็บสัญญา',
  );
  // ไม่มีทางเข้าที่สองบนหน้าเดียวกัน — ไม่มีโมดัลของหน้าเอง และไม่มีปุ่มบนการ์ดจัดการ
  assert.doesNotMatch(page, /import ContractCreateModal/);
  assert.doesNotMatch(page, /label: "ออกสัญญาจากใบนี้"/);
  /* ใบที่ตายแล้ว/โหมดแก้ไม่ต้องมีปุ่ม — ออกสัญญาจากใบที่ยกเลิกไปแล้วอ่านแล้วสับสน
     ⚠️ 0374 เพิ่มใบย้อนหลังเข้ามาอีกกรณี: สัญญาของใบคือ "เอกสารแทนสัญญา" ที่ฟอร์มคีย์ใบสร้างและอนุมัติ
     พร้อมใบ ⇒ ฉบับที่สองที่ออกจากที่นี่ผูกกับใบไม่ได้ (ด่าน serviceContractLinkError ปิดอยู่) */
  assert.match(page, /const canCreateContract = canEdit && !historical && !editMode && !\["cancelled", "revised"\]\.includes\(order\.status\);/);
});

/* 🔴 รีวิว 25/09: ข้อความ "ยังไม่มีสัญญาที่ผูกได้" ของการ์ดผูกสัญญาบริการเคยชี้ "การ์ด สัญญา ด้านล่าง" ทุกกรณี
   ทั้งที่การ์ดนั้นไม่มีปุ่มให้ (ดูอย่างเดียว · ใบปิดแล้ว · โหมดแก้) หรือไม่ถูกวาดเลย (ใบย้อนหลัง) */
test('🔴 การ์ดผูกสัญญาชี้ "การ์ดด้านล่าง" เฉพาะเมื่อการ์ดนั้นมีปุ่มออกสัญญาให้คนนี้จริง', () => {
  const card = readFileSync(new URL('../../components/salesPlanning/ServiceContractCard.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../app/sales-planning/sales-orders/[id]/page.js', import.meta.url), 'utf8');
  assert.match(card, /const noContractNext = canCreateBelow\s*\n\s*\? "ออกสัญญา หรือใช้เอกสารภายนอก[^"]*การ์ด “สัญญา” ด้านล่าง/);
  // ข้อความชี้การ์ดข้างล่างมีที่เดียว (สาขา canCreateBelow) + สาขาโหมดแก้ที่บอกให้ออกจากโหมดก่อน
  assert.equal(card.match(/การ์ด “สัญญา” ด้านล่าง/g).length, 2);
  /* ใบย้อนหลัง: ทางกู้ที่ใช้ได้จริงคือหน้าดีล (โมดัลของทะเบียนเลือกดีลภาชนะไม่ได้ — ไม่มีใบเสนอราคาอนุมัติ) */
  assert.match(card, /: isHistoricalOrder\(order\)[\s\S]{0,700}?href=\{`\/sa\/deals\/\$\{order\.dealId\}\?tab=quotations`\}/);
  assert.match(page, /canCreateBelow=\{showDealContracts && canCreateContract\}/);
});

/* 🔴 รีวิว 25/09: การ์ดสัญญาของดีลเป็นเนื้อหลักของแท็บ "สัญญา" บนทุก SO แล้ว — โหลดพังต้องไม่ขึ้น "0 ฉบับ ·
   ยังไม่มีสัญญาของดีลนี้" (ว่างปลอม = ชวนออกร่างซ้ำ) · กติกาเดียวกับ `useApiList` (apiListErrorVisible) */
test('🔴 การ์ดสัญญาของดีล: โหลดพังขึ้น error + ลองใหม่ ไม่ใช่ว่างปลอม', () => {
  const card = readFileSync(new URL('../../components/salesPlanning/DealContractsCard.js', import.meta.url), 'utf8');
  assert.match(card, /if \(!res\.ok\) \{\s*\n\s*setFailure\(httpLoadFailure\(res\.status, data\?\.error\)\);/);
  assert.match(card, /<StatusNotice\s*\n\s*tone="error"[\s\S]{0,200}?action=\{<Button[^>]*onClick=\{load\}>ลองใหม่<\/Button>\}/);
  // เลขจำนวน + ข้อความว่าง ขึ้นเฉพาะเมื่อรู้แล้ว (เคยโหลดสำเร็จ)
  assert.match(card, /meta=\{loaded \? `\$\{rows\.length\} ฉบับ` : failed \? "—" : "กำลังโหลด…"\}/);
  assert.match(card, /\{loaded && !rows\.length && \(\s*\n\s*<TableEmpty/);
  assert.doesNotMatch(card, /setRows\(\[\]\)/, 'ห้ามแปลงความล้มเป็นลิสต์ว่าง');
  // ปุ่มออกสัญญากดได้เมื่อรู้แล้วว่าดีลมีสัญญาอะไร
  assert.match(card, /disabled=\{!loaded\}/);
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

/* 🪤 **ธงคิวอ่านชนิดไฟล์ ⇒ คำแนะนำบนการ์ดต้องพาไปชนิดที่ถูก**
   ของเดิมโน้ตเป็นถ้อยคำของสายที่ระบบเจน ("ฉบับที่ลงนามแล้วให้เลือกชนิด …") แต่ขึ้น
   บนใบ external ด้วย ⇒ คนแนบ PO อ่านตามก็เลือกผิดชนิด แล้วใบไม่เข้าคิวของ AE Sup
   ทั้งที่ไฟล์ครบ · เกิดขึ้นจริงแล้วบน production (ไฟล์แนบของใบ external ใบเดียวที่มี
   ถูกตั้งเป็น `signed_contract`) ⇒ แก้ด่านอย่างเดียวไม่พอ ต้องแก้คำด้วย */
test('🪤 การ์ดไฟล์แนบต้องแนะนำชนิดเอกสารตามที่มาของใบ', () => {
  const page = readFileSync(
    new URL('../../app/sales-planning/contracts/[id]/page.js', import.meta.url),
    'utf8',
  );
  assert.match(page, /note=\{external/, 'โน้ตต้องเดินตาม source ไม่ใช่ข้อความเดียวใช้ทั้งสองสาย');
  assert.match(page, /เอกสารที่ใช้แทนสัญญา”\s*— AE Supervisor จะเห็นใบนี้ในคิว/);
  // สายที่ระบบเจนต้องยังได้คำเดิม
  assert.match(page, /ฉบับที่ลงนามแล้วให้เลือกชนิด “สัญญาที่ลงนามแล้ว”/);
});

/* 🪤 **การ์ดสัญญาบนหน้าดีลเป็นจอที่สองที่วาดใบเดียวกัน** — #1573 เติม "ที่มา" ให้
   ทะเบียนสัญญาไปแล้ว แต่การ์ดนี้ยังไม่บอก ⇒ เอกสารภายนอกที่ใช้แทนสัญญา (PO/อีเมล)
   อ่านเหมือนสัญญาจริงของเราทุกที่ยกเว้นทะเบียน */
test('🪤 การ์ดสัญญาบนหน้าดีลต้องบอกที่มาของใบด้วย', () => {
  const card = readFileSync(
    new URL('../../components/salesPlanning/DealContractsCard.js', import.meta.url),
    'utf8',
  );
  assert.match(card, /isExternalContract\(row\)/);
  assert.match(card, /CONTRACT_SOURCE_LABELS\.external/,
    'ต้องใช้ทะเบียนคำกลาง ไม่ใช่พิมพ์ "เอกสารภายนอกใช้แทนสัญญา" ซ้ำในจอ');
});

/* 🪤 **ตัวเลือกตัวกรองต้องเป็นของที่หน้านี้แสดงได้จริง** — ทะเบียนคัดเหลือฉบับล่าสุด
   ของแต่ละสาย (mig 0280) และใบสถานะ `revised` ถูกแทนด้วยฉบับที่ revisionNo สูงกว่า
   เสมอโดยนิยาม ⇒ ถูกคัดทิ้งทุกครั้ง · เอาไปเป็นตัวเลือก = ตัวเลือกที่กดแล้วได้ศูนย์แถว
   ตลอดกาล ซึ่งอ่านเหมือน "ไม่มีข้อมูล" ทั้งที่คือ "หน้านี้แสดงของแบบนั้นไม่ได้" */
test('🪤 ตัวกรองสถานะบนทะเบียนต้องไม่เสนอสถานะที่หน้านี้ไม่มีวันแสดง', async () => {
  const { CONTRACT_LIST_STATUSES, CONTRACT_STATUSES, latestContractRevisions } = await import('./contracts.js');
  assert.ok(!CONTRACT_LIST_STATUSES.includes('revised'));
  // ที่เหลือต้องครบ — ตัดเกินคือซ่อนของที่หาเจอได้จริง
  assert.deepEqual(CONTRACT_LIST_STATUSES, CONTRACT_STATUSES.filter((s) => s !== 'revised'));

  /* พิสูจน์ข้ออ้าง ไม่ใช่เชื่อคอมเมนต์: ใบ `revised` มีสายที่ revisionNo สูงกว่าเสมอ
     ⇒ `latestContractRevisions` ทิ้งมันทุกครั้ง */
  const chain = [
    { id: 'C1', baseNumber: 'CT-1', revisionNo: 0, status: 'revised', createdAt: '2026-08-01' },
    { id: 'C2', baseNumber: 'CT-1', revisionNo: 1, status: 'awaiting_signature', createdAt: '2026-08-02' },
  ];
  assert.deepEqual(latestContractRevisions(chain).map((c) => c.id), ['C2']);

  const page = readFileSync(
    new URL('../../app/sales-planning/contracts/page.js', import.meta.url),
    'utf8',
  );
  assert.match(page, /options: CONTRACT_LIST_STATUSES\.map/);
});

/* 🪤 **ชนิดของไฟล์ที่อนุมัติต้องถูกด้วย ไม่ใช่แค่เป็นไฟล์ของใบนี้**
   จอเสนอเฉพาะ `external_doc` ในโมดัลอนุมัติ แต่คำขอที่ยิงตรงส่งไฟล์ชนิดไหนก็ได้
   ⇒ ใบกลายเป็น `signed` โดยที่ "เอกสารที่ใช้แทนสัญญา" เป็นของอย่างอื่น
   ⚠️ ไม่ใช่เรื่องสมมุติ — ไฟล์แนบของใบ external ใบเดียวบน production เคยถูกตั้งเป็น
      `signed_contract` มาแล้ว เพราะคำแนะนำบนการ์ดพาไปผิดทาง (แก้ที่จอไปแล้ว #1581) */
test('🪤 อนุมัติเอกสารแทนสัญญาต้องรับเฉพาะไฟล์ชนิด external_doc', () => {
  const route = readFileSync(
    new URL('../../app/api/sales-planning/contracts/[id]/approve-external/route.js', import.meta.url),
    'utf8',
  );
  assert.match(route, /"docType"/, 'ต้อง select docType มาด้วย ไม่งั้นเช็คอะไรไม่ได้');
  assert.match(route, /file\.docType !== EXTERNAL_DOC_TYPE/);
  // ใช้ค่าคงที่กลาง ไม่พิมพ์สตริงซ้ำ (พิมพ์ต่างกันเมื่อไร ด่านเงียบไปโดยไม่มีอะไรฟ้อง)
  assert.doesNotMatch(route, /docType !== 'external_doc'/);
});

/* 🪤 **ทุกเส้นที่ผูก "ไฟล์ที่เซ็นแล้ว" เข้ากับใบ ต้องตรวจชนิดไฟล์ด้วย**
   ด่านเดิมของทั้งสามเส้นถามแค่ "เป็นไฟล์แนบของใบนี้ไหม" ⇒ คำขอที่ยิงตรงส่งไฟล์ชนิด
   ไหนก็ได้ แล้วช่อง "ฉบับที่ลงนาม" ชี้ไปที่ของอย่างอื่น · โมดัลบนจอเสนอชนิดเดียวอยู่แล้ว
   แต่ **จอไม่ใช่ด่าน**
   ⚠️ วัดก่อนรัด (2026-09-02): ทั้งฐานยังไม่มีสัญญาหรือบันทึกที่มี `signedFileId` สักใบ
      ⇒ ด่านชุดนี้ไม่ตีกลับของเก่าที่ทำไปแล้วเลย */
test('🪤 ทุกเส้นที่ผูกไฟล์ลงนามต้องตรวจ docType ไม่ใช่แค่ว่าเป็นไฟล์ของใบนี้', () => {
  const cases = [
    ['contracts/[id]/sign', 'SIGNED_CONTRACT_DOC_TYPE'],
    ['contracts/[id]/approve-external', 'EXTERNAL_DOC_TYPE'],
    ['addenda/[id]/sign', 'SIGNED_ADDENDUM_DOC_TYPE'],
  ];
  for (const [rel, constant] of cases) {
    const route = readFileSync(
      new URL(`../../app/api/sales-planning/${rel}/route.js`, import.meta.url),
      'utf8',
    );
    assert.match(route, /"docType"/, `${rel}: ต้อง select docType มาด้วย`);
    assert.match(route, new RegExp(`file\\.docType !== ${constant}`), rel);
    /* ใช้ค่าคงที่กลาง ไม่พิมพ์สตริงซ้ำ — พิมพ์ต่างกันเมื่อไร ด่านเงียบไปโดยไม่มีอะไรฟ้อง */
    assert.doesNotMatch(route, /docType !== '[a-z_]+'/, `${rel}: ห้ามฝังสตริงชนิดเอกสาร`);
  }
});

/* 🔴 **สองปลายของด่านต้องอ่านคีย์จากที่เดียวกัน** — #1589 ยกคีย์ชนิดเอกสารเป็นค่าคงที่
   ที่ฝั่ง API แต่ **จอยังฝังสตริงไว้** ⇒ ถ้าวันหนึ่งค่าคงที่ถูกแก้ จอจะยังอัปด้วยคีย์เก่า
   แล้วด่านจะปฏิเสธ *ทุกไฟล์ที่จอเพิ่งอัปเอง* — เส้นลงนามตายทั้งเส้นพร้อมข้อความที่
   อ่านแล้วงง ("แนบใหม่ด้วยชนิดนั้นก่อน" ทั้งที่เพิ่งแนบมา)
   ⚠️ นี่คือครึ่งที่ขาดของ #1589 เอง — ยกค่าคงที่มาแล้วแต่ใช้ข้างเดียว */
test('🔴 จอกับด่านต้องใช้ค่าคงที่ชนิดเอกสารตัวเดียวกัน ไม่มีสตริงฝังบนจอ', () => {
  const screens = [
    '../../app/sales-planning/contracts/[id]/page.js',
    '../../app/sales-planning/contracts/addenda/[id]/page.js',
  ];
  for (const rel of screens) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8')
      // คอมเมนต์อ้างชื่อคีย์ได้ — ห้ามเฉพาะโค้ดที่ *ใช้* สตริงนั้นจริง
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(src, /["']signed_contract["']/, `${rel}: ฝังสตริง signed_contract`);
    assert.doesNotMatch(src, /["']external_doc["']/, `${rel}: ฝังสตริง external_doc`);
    assert.doesNotMatch(src, /["']signed_addendum["']/, `${rel}: ฝังสตริง signed_addendum`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════
   🔴 **เดดล็อกของขั้นอนุมัติเอกสารแทนสัญญา** (เจอตอนรีเช็ค 2026-09-02)

   ปุ่มบนการ์ดจัดการเอา `externalApproveError` มาปิดตัวเอง แต่ด่านนั้นอ่าน
   **วันที่ที่กรอกในโมดัล** ⇒ ปุ่มถูกปิดเพราะ "ยังไม่ระบุวันที่เริ่มมีผล" ทั้งที่ช่องกรอก
   วันอยู่ใน **โมดัลที่ปุ่มนั้นเป็นคนเปิด** ⇒ AE Supervisor กดอนุมัติไม่ได้เลยสักใบ
   ตั้งแต่ #1529 (2026-08-31) · ยืนยันกับฐาน: ไม่มีใบ external ที่ signed สักใบ
   ═══════════════════════════════════════════════════════════════════════ */

test('🔴 ปุ่มเปิดฟอร์มอนุมัติต้องไม่ถูกปิดด้วยค่าที่กรอกในฟอร์มนั้นเอง', () => {
  const ready = ext({ externalDocKind: 'customer_po' });
  const withFile = { signedFileId: 'ATT-1' };

  // ยังไม่กรอกวันเลย — ปุ่ม *เปิดฟอร์ม* ต้องกดได้
  assert.equal(externalApproveOpenError(ready, AE_SUP, withFile), null);
  // แต่ปุ่ม *ยืนยัน* ในฟอร์มยังต้องบังคับวันเหมือนเดิม
  assert.match(externalApproveError(ready, AE_SUP, withFile), /วันที่เริ่มมีผล/);
});

/* ⚠️ ด่านเปิดฟอร์มต้องเป็น **คำนำหน้าแท้** ของด่านยืนยัน — ไม่ใช่ด่านคนละชุดที่ขัดกันได้
   ทุกเหตุที่ทำให้เปิดไม่ได้ ต้องทำให้ยืนยันไม่ได้ด้วยข้อความเดียวกัน */
test('ด่านเปิดฟอร์มเป็นคำนำหน้าของด่านยืนยันทุกเคส', () => {
  const cases = [
    [null, AE_SUP, {}],
    [ext(), AE, { signedFileId: 'A' }],
    [ext(), AC, { signedFileId: 'A' }],
    [{ status: 'draft', source: 'generated' }, AE_SUP, { signedFileId: 'A' }],
    [ext({ status: 'signed' }), AE_SUP, { signedFileId: 'A' }],
    [ext({ status: 'cancelled' }), AE_SUP, { signedFileId: 'A' }],
    [ext({ externalDocKind: null }), AE_SUP, { signedFileId: 'A' }],
    [ext(), AE_SUP, {}],
  ];
  for (const [contract, user, payload] of cases) {
    const open = externalApproveOpenError(contract, user, payload);
    if (!open) continue;
    assert.equal(externalApproveError(contract, user, payload), open,
      `เหตุที่เปิดฟอร์มไม่ได้ ต้องเป็นเหตุเดียวกับที่ยืนยันไม่ได้: ${open}`);
  }
});

test('🔴 การ์ดจัดการต้องใช้ด่านเปิดฟอร์ม ไม่ใช่ด่านยืนยัน', () => {
  const page = readFileSync(
    new URL('../../app/sales-planning/contracts/[id]/page.js', import.meta.url),
    'utf8',
  );
  assert.match(page, /disabled: !!approveOpenGate/);
  assert.doesNotMatch(page, /disabled: !!approveGate/,
    'ปุ่มบนการ์ดห้ามใช้ด่านที่อ่านค่าจาก state ของโมดัล');
  // ปุ่มยืนยันในโมดัลยังต้องใช้ด่านเต็ม
  assert.match(page, /onClick=\{submitApprove\} disabled=\{busy \|\| !!approveGate\}/);
});

/* 🪤 **คำแนะนำที่ถูก กับตัวเลือกที่ผิด อยู่ในการ์ดเดียวกัน** — #1581 แก้แต่ข้อความโน้ต
   แล้วปล่อยชนิด "สัญญาที่ลงนามแล้ว" ให้เลือกได้ต่อบนใบ external ทั้งที่ใบแบบนี้ไม่มี
   สัญญาของระบบให้ลงนาม ⇒ ตัวเลือกที่ไม่ควรมีคือของที่คนจะเลือกจนได้ (เกิดแล้วจริง) */
test('🪤 การ์ดไฟล์ของใบ external ต้องไม่เสนอชนิด "สัญญาที่ลงนามแล้ว"', () => {
  const page = readFileSync(
    new URL('../../app/sales-planning/contracts/[id]/page.js', import.meta.url),
    'utf8',
  );
  assert.match(page, /docTypes=\{external[\s\S]{0,160}?filter\(\(t\) => t\.key !== SIGNED_CONTRACT_DOC_TYPE\)/);
});

/* ⭐ ดีลของใบสั่งขายย้อนหลัง (mig 0360) ไม่มีใบเสนอราคาโดยธรรมชาติ — ข้ามด่านใบเสนอราคา แต่ด่านชนิด/สายยังเดิน */
test('ดีลภาชนะของใบย้อนหลัง: ออกสัญญาบริการได้โดยไม่มีใบเสนอราคา · ชนิดอื่นยังตีกลับ · ดีลปกติยังต้องมีใบ', () => {
  const container = { origin: 'historical', dealType: 'RE-ORDER', line: 'SERVICE' };
  const service = contractEligibility({ kind: 'service', deal: container, quotations: [] });
  assert.equal(service.ok, true);
  assert.deepEqual(service.kinds, ['service']);
  assert.deepEqual(service.quotations, []);
  const manufacturing = contractEligibility({ kind: 'manufacturing', deal: container, quotations: [] });
  assert.equal(manufacturing.ok, false);
  assert.match(manufacturing.reason, /ออกได้เฉพาะ/);
  const pipeline = contractEligibility({ kind: 'service', deal: { ...container, origin: 'pipeline' }, quotations: [] });
  assert.equal(pipeline.ok, false);
  assert.match(pipeline.reason, /ออกสัญญาได้หลังใบเสนอราคา/);
});

/* ═══════════════════════════════════════════════════════════════════════
   เอกสารแทนสัญญาของใบสั่งขายย้อนหลัง (มติ 22/09/2026 · mig 0374)
   RPC คีย์ใบสร้างร่าง external ที่ชี้กลับใบสั่งขาย (`metadata.historicalSalesOrderId`) แล้ว AE Sup อนุมัติ
   พร้อมใบที่หน้าใบสั่งขาย · หน้าสัญญาต้องไม่มีทางอ้อม (แก้ · ลบ · ยกเลิก · อนุมัติแยก) ระหว่างใบยังไม่อนุมัติ
   ═══════════════════════════════════════════════════════════════════════ */
const readSrc = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const SO_ID = 'SOR-H0123456789abcdef';
const substitute = (extra = {}) => ext({
  id: 'CTR-H1', kind: 'service', ownerId: OWNER.id, createdBy: OWNER.id,
  metadata: { historicalSalesOrderId: SO_ID, dealCode: 'D-1' }, ...extra,
});
const linkedSo = (status, extra = {}) => ({ id: SO_ID, orderNumber: 'SO-26090001', status, origin: 'historical', ...extra });

test('ชนิดเอกสาร "ใบเสนอราคาที่ลูกค้าเซ็น" — ลำดับและสมาชิกตรงกับ CHECK ของ 0374', async () => {
  const { EXTERNAL_DOC_KINDS, EXTERNAL_DOC_KIND_LABELS, externalDocKindLabel } = await import('./contracts.js');
  assert.ok(EXTERNAL_DOC_KINDS.includes('signed_quotation'));
  assert.equal(externalDocKindLabel('signed_quotation'), 'ใบเสนอราคาที่ลูกค้าเซ็น');
  for (const kind of EXTERNAL_DOC_KINDS) assert.ok(EXTERNAL_DOC_KIND_LABELS[kind], `ชนิด ${kind} ไม่มีป้าย`);
  const sql = readSrc('../../../supabase/migrations/0374_historical_so_approval_flow.sql');
  const check = sql.match(/ADD CONSTRAINT sales_contracts_external_kind CHECK \([\s\S]*?"externalDocKind" IN \(([^)]*)\)/);
  assert.ok(check, 'หา CHECK sales_contracts_external_kind ใน 0374 ไม่เจอ');
  const sqlKinds = [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...EXTERNAL_DOC_KINDS], sqlKinds, 'JS กับฐานต้องรับชนิดชุดเดียวกัน ไม่งั้นจอเสนอค่าที่ฐานตีกลับ 23514');
});

test('isSubstituteContract = ใบ external ที่ชี้กลับใบสั่งขายย้อนหลัง เท่านั้น', async () => {
  const { isSubstituteContract } = await import('./contracts.js');
  assert.equal(isSubstituteContract(substitute()), true);
  assert.equal(isSubstituteContract(ext()), false, 'ใบ external ทั่วไปไม่ใช่');
  assert.equal(isSubstituteContract(ext({ metadata: {} })), false);
  // ใบที่ระบบเจนไม่มีทางเป็นเอกสารแทนสัญญา แม้ metadata จะมีคีย์นี้ (ข้อมูลปลอม)
  assert.equal(isSubstituteContract({ status: 'draft', source: 'generated', metadata: { historicalSalesOrderId: SO_ID } }), false);
  assert.equal(isSubstituteContract(null), false);
});

test('⭐ ล็อกเฉพาะร่างที่ใบสั่งขายย้อนหลังของมันยังไม่อนุมัติ (ร่าง · รออนุมัติ · ตีกลับ)', async () => {
  const { historicalContractLockReason } = await import('./contracts.js');
  for (const status of ['draft', 'pending_approval', 'rejected']) {
    const reason = historicalContractLockReason(substitute(), linkedSo(status));
    assert.match(reason || '', /SO-26090001/, `${status} ต้องล็อก`);
    assert.match(reason, /ฟอร์มคีย์ใบ/);
    assert.match(reason, /อนุมัติพร้อมใบที่หน้าใบสั่งขาย/);
  }
  // เลขใบยังไม่มี (ไม่ควรเกิด) — ยังต้องบอกได้ว่าใบไหน
  assert.match(historicalContractLockReason(substitute(), linkedSo('draft', { orderNumber: null })), new RegExp(SO_ID));
});

test('🪤 ใบกำพร้าไม่มีวันติดล็อก — ใบสั่งขายหาย/ยกเลิก/อนุมัติแล้ว/คนละใบ = ไม่ล็อก', async () => {
  const { historicalContractLockReason } = await import('./contracts.js');
  assert.equal(historicalContractLockReason(substitute(), null), null, 'ใบสั่งขายถูกลบแล้ว');
  assert.equal(historicalContractLockReason(substitute(), undefined), null);
  assert.equal(historicalContractLockReason(substitute(), linkedSo('cancelled')), null, 'ใบสั่งขายยกเลิกแล้ว');
  assert.equal(historicalContractLockReason(substitute(), linkedSo('approved')), null);
  assert.equal(historicalContractLockReason(substitute(), linkedSo('draft', { id: 'SOR-HOTHER' })), null,
    'ใบสั่งขายที่ส่งมาต้องเป็นใบที่สัญญาชี้กลับจริง');
  assert.equal(historicalContractLockReason(substitute(), linkedSo('draft', { origin: 'pipeline' })), null);
  // ใบสัญญาที่ออกเลข/ยกเลิกไปแล้วไม่ใช่ร่างที่ต้องกัน
  assert.equal(historicalContractLockReason(substitute({ status: 'signed' }), linkedSo('pending_approval')), null);
  assert.equal(historicalContractLockReason(substitute({ status: 'cancelled' }), linkedSo('draft')), null);
  // ใบ external ทั่วไปไม่เคยล็อก
  assert.equal(historicalContractLockReason(ext(), linkedSo('draft')), null);
});

test('⭐ ไฟล์ตรึงเฉพาะช่วงรอ AE Sup อนุมัติ — ร่าง/ตีกลับยังแนบได้ (ฟอร์มคีย์ใบอัปไฟล์ก่อนส่ง)', async () => {
  const { historicalContractFilesFrozen, HISTORICAL_CONTRACT_FILES_FROZEN_MESSAGE } = await import('./contracts.js');
  assert.equal(historicalContractFilesFrozen(substitute(), linkedSo('pending_approval')), true);
  for (const status of ['draft', 'rejected', 'approved', 'cancelled']) {
    assert.equal(historicalContractFilesFrozen(substitute(), linkedSo(status)), false, status);
  }
  assert.equal(historicalContractFilesFrozen(substitute(), null), false);
  assert.equal(historicalContractFilesFrozen(ext(), linkedSo('pending_approval')), false, 'ใบ external ทั่วไป');
  assert.match(HISTORICAL_CONTRACT_FILES_FROZEN_MESSAGE, /ดึงกลับ/);
});

test('🔴 ด่านอนุมัติเอกสารแทนสัญญา: ล็อกมาก่อนทุกด่าน · ปุ่มซ่อน · ใบ external ทั่วไปเหมือนเดิม', async () => {
  const { historicalContractLockReason } = await import('./contracts.js');
  const pending = linkedSo('pending_approval');
  const lock = historicalContractLockReason(substitute(), pending);
  // ส่งผ่าน payload หรือแนบมากับใบ (GET ของหน้าสัญญา) ได้ผลเดียวกัน
  assert.equal(externalApproveOpenError(substitute(), AE_SUP, { signedFileId: 'A', linkedOrder: pending }), lock);
  assert.equal(externalApproveOpenError(substitute({ linkedHistoricalOrder: pending }), AE_SUP, { signedFileId: 'A' }), lock);
  assert.equal(externalApproveError(substitute(), AE_SUP, { ...OKAY, linkedOrder: pending }), lock, 'ด่านยืนยันต้องได้เหตุเดียวกัน');
  // ล็อกมาก่อนด่านสิทธิ์ — AE ต้องได้เหตุจริง ไม่ใช่ "เฉพาะ AE Supervisor"
  assert.equal(externalApproveOpenError(substitute(), AE, { signedFileId: 'A', linkedOrder: pending }), lock);
  assert.equal(showExternalApprove(substitute({ linkedHistoricalOrder: pending }), AE_SUP), false);
  assert.equal(showExternalApprove(substitute(), AE_SUP, pending), false);
  // ใบสั่งขายยกเลิกแล้ว (trigger ยกเลิกใบนี้ตามอยู่แล้ว) — ถ้ายังเป็นร่าง ต้องเดินด่านเดิมได้ ไม่ติดค้าง
  assert.equal(externalApproveOpenError(substitute({ linkedHistoricalOrder: linkedSo('cancelled') }), AE_SUP, { signedFileId: 'A' }), null);
  assert.equal(showExternalApprove(substitute({ linkedHistoricalOrder: null }), AE_SUP), true);
  // ใบ external ทั่วไปไม่เปลี่ยนอะไร
  assert.equal(externalApproveOpenError(ext(), AE_SUP, { signedFileId: 'A' }), null);
  assert.equal(showExternalApprove(ext(), AE_SUP), true);
});

test('⭐ เลนรอมือฉันของสัญญาตัดเอกสารแทนสัญญาที่ยังเป็นร่าง — เป็นงานของคิวใบสั่งขาย', () => {
  // AE Sup: แนบไฟล์แล้วก็ไม่นับ (อนุมัติพร้อมใบสั่งขาย · ป้ายใบสั่งขายนับให้แล้ว)
  assert.equal(isContractWaitingOnMe(substitute(), { user: AE_SUP, externalDocReady: true }), false);
  // เจ้าของใบ: ร่างนี้ไม่ใช่งานที่ต้องไปทำที่หน้าสัญญา
  assert.equal(isContractWaitingOnMe(substitute(), { userId: OWNER.id, user: OWNER }), false);
  assert.equal(isContractWaitingOnMe(substitute(), { userId: OWNER.id, user: OWNER, externalDocReady: true }), false);
  // ใบ external ทั่วไปยังสลับเลนตามไฟล์เหมือนเดิม
  assert.equal(isContractWaitingOnMe(mineExt(), { user: AE_SUP, externalDocReady: true }), true);
  assert.equal(isContractWaitingOnMe(mineExt(), { userId: OWNER.id, user: OWNER }), true);
});

test('🔴 ตัวหาใบที่แนบเอกสารแล้วไม่ยิงฐานเพื่อเอกสารแทนสัญญา — ไม่มีเลนไหนใช้คำตอบ', async () => {
  const { externalDocReadyIds } = await import('./contractExternalDocs.js');
  const touched = [];
  const spy = { from(table) { touched.push(table); throw new Error('ห้ามแตะฐาน'); } };
  assert.equal((await externalDocReadyIds(spy, [substitute()], AE_SUP)).size, 0);
  assert.deepEqual(touched, []);
});

test('รางของเอกสารแทนสัญญา: หมุดเดียวกับสาย external · คำใบ้พาไปใบสั่งขาย · สองหน้าตรงกัน', async () => {
  const { SUBSTITUTE_STEPS, EXTERNAL_STEPS } = await import('./contractLifecycle.js');
  const { contractListTrack } = await import('./contractListTrack.js');
  assert.deepEqual(SUBSTITUTE_STEPS.map((s) => s.label), EXTERNAL_STEPS.map((s) => s.label));
  assert.equal(SUBSTITUTE_STEPS.find((s) => s.id === 'done').hint, 'อนุมัติพร้อมใบสั่งขายย้อนหลัง');

  const lifecycle = buildContractLifecycle({ canEdit: true, external: true, substitute: true });
  assert.deepEqual(lifecycle.railSteps(substitute()).map((s) => s.label), ['ร่าง', 'อนุมัติใช้แทนสัญญาแล้ว']);

  const track = contractListTrack(substitute());
  assert.deepEqual(track.steps.map((s) => s.label), SUBSTITUTE_STEPS.map((s) => s.label));
  assert.equal(track.steps[1].note, 'อนุมัติพร้อมใบสั่งขายย้อนหลัง');
  assert.equal(track.steps[0].note, SUBSTITUTE_STEPS[0].hint);
  // ใบ external ทั่วไปยังได้คำเดิม
  assert.equal(contractListTrack(ext()).steps[1].note, 'รอ AE Supervisor อนุมัติ');
});

test('🔴 การ์ดจัดการ: ใบที่ล็อกไม่มีปุ่มยกเลิก · ไม่ล็อก (ใบสั่งขายยกเลิกแล้ว) ยกเลิกได้ตามเดิม', () => {
  const ids = (options, record) => buildContractLifecycle({ canEdit: true, external: true, substitute: true, ...options })
    .available(record, AE_SUP).map((entry) => entry.id);
  assert.ok(!ids({ locked: true }, substitute()).includes('cancel'), 'ยกเลิกที่ใบสั่งขาย ไม่ใช่ที่หน้าสัญญา');
  assert.ok(ids({ locked: false }, substitute()).includes('cancel'));
  assert.ok(buildContractLifecycle({ canEdit: true, external: true }).available(ext(), AE_SUP)
    .map((entry) => entry.id).includes('cancel'), 'ใบ external ทั่วไปยังยกเลิกได้');
});

/* ── ยามของ route: ด่านล็อกต้องมาก่อนด่านเดิมทุกเส้นที่ขยับร่าง ─────────────────────────────── */
test('🔴 route ของสัญญา: แก้ · ลบ · ยกเลิก · อนุมัติเอกสารแทนสัญญา ถามล็อกก่อนด่านเดิม', () => {
  const detail = readSrc('../../app/api/sales-planning/contracts/[id]/route.js');
  const patch = detail.slice(detail.indexOf('export const PATCH'), detail.indexOf('export const DELETE'));
  assert.ok(patch.indexOf('historicalContractLockGate(supabase, before)') > 0, 'PATCH ต้องถามล็อก');
  assert.ok(patch.indexOf('historicalContractLockGate(supabase, before)') < patch.indexOf('isContractEditable(before)'));
  const del = detail.slice(detail.indexOf('export const DELETE'));
  assert.ok(del.indexOf('historicalContractLockGate(supabase, row)') > 0, 'DELETE ต้องถามล็อก');
  assert.ok(del.indexOf('historicalContractLockGate(supabase, row)') < del.indexOf('canDeleteContract(row)'));
  assert.ok(del.indexOf('historicalContractLockGate(supabase, row)') < del.indexOf('purgeAttachments('),
    'ต้องตีกลับก่อนกวาดไฟล์แนบทิ้ง');
  // GET แนบใบสั่งขายที่ชี้กลับมาให้จอ (จอถามล็อกด้วยตัวตัดสินเดียวกัน) และอ่านพัง = 500 ไม่ใช่ "ไม่ล็อก"
  const get = detail.slice(detail.indexOf('export const GET'), detail.indexOf('export const PATCH'));
  assert.match(get, /linkedHistoricalOrder: linked\.order/);
  assert.match(get, /if \(linked\.error\) return fail\(/);

  const cancel = readSrc('../../app/api/sales-planning/contracts/[id]/cancel/route.js');
  assert.ok(cancel.indexOf('historicalContractLockGate(supabase, before)') > 0);
  assert.ok(cancel.indexOf('historicalContractLockGate(supabase, before)') < cancel.indexOf('canCancelContract(before)'));

  const approve = readSrc('../../app/api/sales-planning/contracts/[id]/approve-external/route.js');
  assert.ok(approve.indexOf('historicalContractLockGate(supabase, before)') > 0);
  assert.ok(approve.indexOf('historicalContractLockGate(supabase, before)') < approve.indexOf('externalApproveError(before'));
  assert.ok(approve.indexOf('historicalContractLockGate(supabase, before)') < approve.indexOf("rpc('approve_external_sales_contract'"));
});

test('ตัวโหลดใบสั่งขายที่ชี้กลับ: ใบทั่วไปไม่แตะฐาน · อ่านพัง = 500 · ล็อก = 409 · ใบกำพร้าผ่าน', async () => {
  const {
    historicalContractFilesFrozenGate, historicalContractLockGate, loadLinkedHistoricalOrder,
  } = await import('./historicalContractLock.js');
  const touched = [];
  const spy = { from(table) { touched.push(table); throw new Error('ห้ามแตะฐาน'); } };
  assert.deepEqual(await loadLinkedHistoricalOrder(spy, ext()), { order: null, error: null });
  assert.equal(await historicalContractLockGate(spy, { status: 'draft', source: 'generated' }), null);
  assert.equal(await historicalContractFilesFrozenGate(spy, ext()), null);
  assert.deepEqual(touched, [], 'สัญญาที่ไม่ใช่เอกสารแทนสัญญาต้องไม่ทำให้เกิดคิวรี');

  const stub = (result) => {
    const calls = [];
    return {
      calls,
      from(table) {
        calls.push(table);
        const q = {
          select: (cols) => { calls.push(`select ${cols}`); return q; },
          eq: (col, val) => { calls.push(`${col}=${val}`); return q; },
          maybeSingle: async () => result,
        };
        return q;
      },
    };
  };
  const pending = stub({ data: linkedSo('pending_approval'), error: null });
  const lock = await historicalContractLockGate(pending, substitute());
  assert.equal(lock.status, 409);
  assert.match(lock.message, /SO-26090001/);
  assert.deepEqual(pending.calls.slice(0, 1), ['sales_orders']);
  assert.ok(pending.calls.includes(`id=${SO_ID}`), 'ต้องอ่านใบเดียวด้วย id ที่ใบสัญญาชี้กลับ');
  assert.ok(pending.calls.some((c) => /origin/.test(c)), 'ต้อง select origin — ตัวตัดสินถามว่าเป็นใบย้อนหลังจริงไหม');
  const frozen = await historicalContractFilesFrozenGate(stub({ data: linkedSo('pending_approval'), error: null }), substitute());
  assert.equal(frozen.status, 409);
  assert.equal(await historicalContractFilesFrozenGate(stub({ data: linkedSo('draft'), error: null }), substitute()), null);

  const broken = await historicalContractLockGate(stub({ data: null, error: { message: 'timeout' } }), substitute());
  assert.equal(broken.status, 500, 'อ่านไม่สำเร็จต้องไม่กลายเป็น "ไม่ล็อก"');
  assert.match(broken.message, /timeout/);
  const brokenFiles = await historicalContractFilesFrozenGate(stub({ data: null, error: { message: 'timeout' } }), substitute());
  assert.equal(brokenFiles.status, 500);

  assert.equal(await historicalContractLockGate(stub({ data: null, error: null }), substitute()), null, 'ใบสั่งขายถูกลบแล้ว');
  assert.equal(await historicalContractLockGate(stub({ data: linkedSo('cancelled'), error: null }), substitute()), null);
});

test('หน้าสัญญา: ใบที่ล็อกซ่อนปุ่มแก้/ลบ + ประกาศพร้อมลิงก์ใบสั่งขาย · ไฟล์ตรึงช่วงรออนุมัติ', () => {
  const page = readSrc('../../app/sales-planning/contracts/[id]/page.js');
  assert.match(page, /historicalContractLockReason\(contract, linkedOrder\)/);
  assert.match(page, /historicalContractFilesFrozen\(contract, linkedOrder\)/);
  // ⭐ 24/09/2026: ส่งบริบทของโมดัลยกเลิกสัญญาที่ลงนามแล้วต่อท้าย (contractSignedCancel.test ล็อกส่วนนั้น)
  assert.match(page, /buildContractLifecycle\(\{\s*canEdit, external, substitute, locked: !!lockReason,/);
  assert.match(page, /visible: canEdit && isContractEditable\(contract\) && !lockReason/);
  assert.match(page, /visible: canEdit && canDeleteContract\(contract\) && !lockReason/);
  assert.match(page, /href=\{`\/sa\/sales-orders\/\$\{linkedOrder\.id\}`\}/);
  assert.match(page, /canEdit=\{canEdit && !filesFrozen\}/);
});
