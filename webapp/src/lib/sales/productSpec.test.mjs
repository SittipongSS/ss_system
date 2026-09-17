import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_SPEC_CERTIFICATIONS, PRODUCT_SPEC_CERT_STATUS_LABELS, PRODUCT_SPEC_CHECKLIST,
  PRODUCT_SPEC_CHECKLIST_KEYS, productSpecCertPendingLabel, productSpecCertSeed,
  productSpecChecklistSeed,
} from './productSpecChecklist.js';
import {
  productSpecScopeReason, productSpecUsedForCategory, productSpecUsedForFgCode,
} from './productSpecScope.js';
import {
  productSpecApproveBlock, productSpecEditBlock, productSpecIssueBlock,
  productSpecLineState, productSpecNewRevisionBlock, productSpecReviewBlock,
  productSpecSubmitBlock,
} from './productSpecWorkflow.js';
import { parseProductSpecDocNo, productSpecDocNoParts } from './productSpecDocNo.js';

/* ── ทะเบียน checklist ─────────────────────────────────────────────── */

test('checklist มี 17 แถวตามแบบฟอร์มกระดาษ และคีย์ไม่ซ้ำ', () => {
  assert.equal(PRODUCT_SPEC_CHECKLIST.length, 17);
  assert.equal(new Set(PRODUCT_SPEC_CHECKLIST_KEYS).size, 17);
  for (const row of PRODUCT_SPEC_CHECKLIST) {
    assert.ok(row.label.length > 0, `แถว ${row.key} ไม่มีคำ`);
  }
});

test('ฉบับใหม่ได้ 17 แถวเปล่า เรียงตามกระดาษ', () => {
  const seed = productSpecChecklistSeed();
  assert.equal(seed.length, 17);
  assert.deepEqual(seed.map((row) => row.sortOrder), [...Array(17).keys()]);
  assert.equal(seed[0].itemKey, 'raw_material');
  assert.equal(seed[0].detail, null);
  assert.equal(seed[0].preparedByS, false);
});

test('ออก Rev. ใหม่ = ยกค่าที่กรอกไว้มาทั้งหมด ไม่ใช่เริ่มจากศูนย์', () => {
  const previous = [
    { itemKey: 'raw_material', itemLabel: 'วัตถุดิบ/สารประกอบ', detail: 'น้ำหอม', preparedByS: true, preparedByCustomer: false, note: null },
    { itemKey: 'cap', itemLabel: 'ฝา', detail: 'สีเงิน', preparedByS: true, preparedByCustomer: false, note: 'ล็อตใหม่' },
  ];
  const seed = productSpecChecklistSeed(previous);
  assert.equal(seed.find((row) => row.itemKey === 'raw_material').detail, 'น้ำหอม');
  assert.equal(seed.find((row) => row.itemKey === 'cap').note, 'ล็อตใหม่');
  // แถวที่ไม่เคยกรอกยังว่าง
  assert.equal(seed.find((row) => row.itemKey === 'card').detail, null);
});

test('แถวที่ผู้ใช้เพิ่มเองถูกยกไปฉบับใหม่ด้วย ต่อท้ายทะเบียน', () => {
  const seed = productSpecChecklistSeed([
    { itemKey: null, itemLabel: 'ถุงผ้าใส่ขวด', detail: 'สีครีม', preparedByS: false, preparedByCustomer: true, note: null },
  ]);
  assert.equal(seed.length, 18);
  assert.equal(seed[17].itemLabel, 'ถุงผ้าใส่ขวด');
  assert.equal(seed[17].itemKey, null);
  assert.equal(seed[17].preparedByCustomer, true);
  assert.equal(seed[17].sortOrder, 17);
});

/* ── ขอบเขตหมวด ───────────────────────────────────────────────────── */

test('ใบสเปคใช้กับหมวด 01 และ 02 ทุกชนิด — 03/04 ไม่ใช้', () => {
  assert.equal(productSpecUsedForCategory('01-002'), true);
  assert.equal(productSpecUsedForCategory('02-001'), true);  // ระบบกระจายกลิ่น — เจ้าของยืนยันให้รวม
  assert.equal(productSpecUsedForCategory('02-024'), true);
  assert.equal(productSpecUsedForCategory('03-002'), false);
  assert.equal(productSpecUsedForCategory('04-001'), false);
});

test('อ่านหมวดจากรหัส FG ได้ตรงกัน', () => {
  assert.equal(productSpecUsedForFgCode('FG-0903-01-002-10043'), true);
  assert.equal(productSpecUsedForFgCode('FG-0903-03-002'), false);
});

test('เหตุผลที่ไม่มีใบเป็นข้อความบอกเหตุ ไม่ใช่ boolean เปล่า', () => {
  assert.equal(productSpecScopeReason({ fgCode: 'FG-0903-01-002-10043' }), null);
  assert.match(productSpecScopeReason({ fgCode: 'FG-0903-03-002' }), /หมวด 03/);
  assert.match(productSpecScopeReason({}), /ไม่มีรหัสหมวด/);
});

/* ── ด่านของฉบับ ──────────────────────────────────────────────────── */

const draft = { id: 'R1', revNo: 1, status: 'draft' };
const atAe = { id: 'R1', revNo: 1, status: 'pending_ae' };
const atSup = { id: 'R1', revNo: 1, status: 'pending_ae_supervisor' };
const approved = { id: 'R1', revNo: 2, status: 'approved' };

test('ฉบับที่อนุมัติแล้วแก้ไม่ได้ ต้องออกฉบับใหม่', () => {
  assert.match(productSpecEditBlock(approved, { role: 'ac' }), /ออกฉบับใหม่/);
  assert.equal(productSpecEditBlock(draft, { role: 'ac' }), null);
});

test('คนนอกฝ่ายขายแก้/ส่ง/อนุมัติไม่ได้', () => {
  assert.match(productSpecEditBlock(draft, { role: 'rd' }), /AC หรือฝ่ายขาย/);
  assert.match(productSpecSubmitBlock(draft, { role: 'wh' }), /AC หรือฝ่ายขาย/);
  assert.match(productSpecApproveBlock(atSup, { role: 'ae' }), /AE Supervisor/);
});

test('สามขั้นเดินตามลำดับ ข้ามขั้นไม่ได้', () => {
  assert.equal(productSpecSubmitBlock(draft, { role: 'ac' }), null);
  assert.match(productSpecSubmitBlock(atAe, { role: 'ac' }), /ส่งซ้ำไม่ได้/);
  assert.equal(productSpecReviewBlock(atAe, { role: 'ae' }), null);
  assert.match(productSpecReviewBlock(draft, { role: 'ae' }), /ยังไม่ได้ส่งมา/);
  assert.equal(productSpecApproveBlock(atSup, { role: 'ae_supervisor' }), null);
  assert.match(productSpecApproveBlock(atAe, { role: 'ae_supervisor' }), /ยังไม่ผ่านขั้น AE/);
});

test('ใบที่ถูกตีกลับส่งใหม่ได้ — ไม่ใช่ทางตัน', () => {
  assert.equal(productSpecSubmitBlock({ revNo: 1, status: 'rejected' }, { role: 'ac' }), null);
});

test('แอดมินผ่านทุกด่านของฉบับ', () => {
  assert.equal(productSpecEditBlock(draft, { role: 'admin' }), null);
  assert.equal(productSpecReviewBlock(atAe, { role: 'admin' }), null);
  assert.equal(productSpecApproveBlock(atSup, { role: 'admin' }), null);
});

test('มีฉบับที่ยังไม่จบอยู่ = ออกฉบับใหม่ไม่ได้ และบอกว่าค้างที่ไหน', () => {
  const blocked = productSpecNewRevisionBlock({ id: 'S1' }, atSup, { role: 'ac' });
  assert.match(blocked, /Rev\.01/);
  assert.match(blocked, /รอ AE Sup/);
  assert.equal(productSpecNewRevisionBlock({ id: 'S1' }, approved, { role: 'ac' }), null);
});

/* ── ด่านการออกเอกสาร ─────────────────────────────────────────────── */

const approvedOrder = { id: 'SO1', status: 'approved' };

test('SO ที่ยังไม่อนุมัติ = ออกเอกสารไม่ได้ และบอกเหตุ', () => {
  const reason = productSpecIssueBlock({ id: 'S1' }, approved, {
    role: 'ac', salesOrder: { id: 'SO1', status: 'pending_approval' },
  });
  assert.match(reason, /ยังไม่ผ่านการอนุมัติ/);
});

test('ฉบับร่างออกเอกสารได้ (พิมพ์เป็นฉบับร่าง) แต่ฉบับที่ถูกตีกลับออกไม่ได้', () => {
  assert.equal(productSpecIssueBlock({ id: 'S1' }, draft, { role: 'ac', salesOrder: approvedOrder }), null);
  assert.match(
    productSpecIssueBlock({ id: 'S1' }, { revNo: 1, status: 'rejected' }, { role: 'ac', salesOrder: approvedOrder }),
    /ถูกตีกลับ/,
  );
});

/* ── สถานะรายบรรทัดบนหน้า SO ──────────────────────────────────────── */

test('บรรทัดนอกขอบเขตขึ้น "ไม่ต้องใช้" พร้อมเหตุ ไม่ใช่หายไปเงียบ ๆ', () => {
  const state = productSpecLineState({
    line: { id: 'L1' }, scopeReason: 'หมวด 03 ไม่ใช้ใบสเปคสินค้า',
  });
  assert.equal(state.kind, 'out_of_scope');
  assert.equal(state.action, null);
  assert.match(state.reason, /หมวด 03/);
});

test('สินค้ายังไม่มีใบ = ปุ่มสร้าง · มีใบแล้วยังไม่ออกรอบนี้ = ปุ่มออกเอกสาร', () => {
  const noSpec = productSpecLineState({
    line: { id: 'L1' }, spec: null, latestRevision: null, salesOrder: approvedOrder, role: 'ac',
  });
  assert.equal(noSpec.kind, 'no_spec');
  assert.equal(noSpec.action, 'create');

  const notIssued = productSpecLineState({
    line: { id: 'L1' }, spec: { id: 'S1' }, latestRevision: approved, salesOrder: approvedOrder, role: 'ac',
  });
  assert.equal(notIssued.kind, 'not_issued');
  assert.equal(notIssued.action, 'issue');
  assert.equal(notIssued.revLabel, 'Rev.02');
  assert.equal(notIssued.reason, null);
});

test('ออกรอบนี้แล้ว = ปุ่มเปิดใบ และถือ Rev. ณ ตอนออก ไม่ใช่ Rev. วันนี้', () => {
  const state = productSpecLineState({
    line: { id: 'L1' },
    spec: { id: 'S1' },
    latestRevision: { revNo: 3, status: 'approved' },
    issue: { id: 'I1', docNo: 'FM-SA-04-150969-004', revNo: 2, status: 'issued' },
    salesOrder: approvedOrder,
    role: 'ac',
  });
  assert.equal(state.kind, 'issued');
  assert.equal(state.action, 'open');
  assert.equal(state.docNo, 'FM-SA-04-150969-004');
  assert.equal(state.revLabel, 'Rev.02');
});

test('ใบที่ถูกยกเลิกไม่นับว่าออกแล้ว — ออกใหม่ได้', () => {
  const state = productSpecLineState({
    line: { id: 'L1' },
    spec: { id: 'S1' },
    latestRevision: approved,
    issue: { id: 'I1', docNo: 'FM-SA-04-150969-004', revNo: 2, status: 'void' },
    salesOrder: approvedOrder,
    role: 'ac',
  });
  assert.equal(state.kind, 'not_issued');
  assert.equal(state.action, 'issue');
});

test('บรรทัดที่ SO ยังไม่อนุมัติ: ปุ่มยังอยู่ แต่มีเหตุกำกับ (ไม่ซ่อน)', () => {
  const state = productSpecLineState({
    line: { id: 'L1' },
    spec: { id: 'S1' },
    latestRevision: approved,
    salesOrder: { id: 'SO1', status: 'draft' },
    role: 'ac',
  });
  assert.equal(state.action, 'issue');
  assert.match(state.reason, /ยังไม่ผ่านการอนุมัติ/);
});

/* ── เลขที่เอกสาร ─────────────────────────────────────────────────── */

test('ชิ้นส่วนเลขที่เอกสาร: month เป็น YYMM ค.ศ. · prefix เป็น DDMMYY พ.ศ.', () => {
  const parts = productSpecDocNoParts(new Date('2026-09-15T04:00:00Z'));
  assert.equal(parts.month, '2609');
  assert.equal(parts.prefix, 'FM-SA-04-150969-');
  assert.equal(parts.like, 'FM-SA-04-__0969-%');
  assert.equal(parts.width, 3);
});

test('like ปิดตาช่องวัน — ไม่งั้นตัวนับที่หายจะเริ่มนับ 1 ใหม่ทับเลขเดิม', () => {
  const a = productSpecDocNoParts(new Date('2026-09-01T04:00:00Z'));
  const b = productSpecDocNoParts(new Date('2026-09-28T04:00:00Z'));
  assert.notEqual(a.prefix, b.prefix);
  assert.equal(a.like, b.like);
  assert.equal(a.month, b.month);
});

test('เลขข้ามวันในเดือนเดียวกันใช้คีย์ตัวนับเดียวกัน (ตัดรอบเดือน)', () => {
  const sep = productSpecDocNoParts(new Date('2026-09-30T16:30:00Z')); // 30/09 23:30 ไทย
  const oct = productSpecDocNoParts(new Date('2026-09-30T17:30:00Z')); // 01/10 00:30 ไทย
  assert.equal(sep.month, '2609');
  assert.equal(oct.month, '2610');
});

test('อ่านเลขที่เอกสารกลับเป็นชิ้นส่วนได้ และของที่ไม่ใช่รูปแบบนี้คืน null', () => {
  assert.deepEqual(parseProductSpecDocNo('FM-SA-04-150969-004'), {
    day: '15', month: '09', beYear: '69', running: 4, dateText: '15/09/2569',
  });
  assert.equal(parseProductSpecDocNo('FM-SA-07-150969-004'), null);
  assert.equal(parseProductSpecDocNo('FM-SA-04-150969-4'), null);
  assert.equal(parseProductSpecDocNo(''), null);
});

/* ── เอกสารที่ขอได้ ───────────────────────────────────────────────── */

test('เอกสารที่ขอได้มีสี่แถวตามกระดาษ และสถานะมีสองค่า', () => {
  assert.equal(PRODUCT_SPEC_CERTIFICATIONS.length, 4);
  assert.deepEqual(Object.keys(PRODUCT_SPEC_CERT_STATUS_LABELS), ['ready', 'in_progress']);
});

test('แถว อย. ใช้คำของตัวเอง "อยู่ระหว่างยื่น" — ไม่ใช่สถานะที่สาม', () => {
  assert.equal(productSpecCertPendingLabel('fda'), 'อยู่ระหว่างยื่น');
  assert.equal(productSpecCertPendingLabel('coa'), 'อยู่ระหว่างจัดเตรียม');
  assert.equal(productSpecCertPendingLabel('ไม่มีคีย์นี้'), 'อยู่ระหว่างจัดเตรียม');
});

test('ฉบับใหม่ได้สี่แถวที่ยังไม่ตอบ — สถานะว่าง ไม่ใช่ "อยู่ระหว่างจัดเตรียม"', () => {
  const seed = productSpecCertSeed();
  assert.equal(seed.length, 4);
  assert.equal(seed[0].status, '');
});

test('ออก Rev. ใหม่ยกสถานะเอกสารมาด้วย รวมแถวที่พิมพ์ชื่อเอง', () => {
  const seed = productSpecCertSeed([
    { key: 'fda', status: 'ready', note: 'เลข 10-1-68' },
    { key: null, label: 'ผลทดสอบความคงตัว', status: 'in_progress', note: '' },
  ]);
  assert.equal(seed.find((row) => row.key === 'fda').status, 'ready');
  assert.equal(seed.find((row) => row.key === 'fda').note, 'เลข 10-1-68');
  assert.equal(seed.length, 5);
  assert.equal(seed[4].label, 'ผลทดสอบความคงตัว');
});

/* ── ด่านของใบสั่งขายแยกจากด่าน "ยังไม่มีใบสเปค" ──────────────────── */

test('🪤 ปุ่มสร้างใบต้องไม่ติดด้วยเหตุ "ยังไม่มีใบสเปค" — นั่นคือสิ่งที่ปุ่มมีไว้แก้', async () => {
  const { productSpecOrderGate } = await import('./productSpecWorkflow.js');
  const approvedOrder2 = { id: 'SO1', status: 'approved' };
  // ใบอนุมัติแล้ว + เป็นฝ่ายขาย ⇒ ไม่มีเหตุติดปุ่มสร้าง แม้สินค้ายังไม่มีใบ
  assert.equal(productSpecOrderGate({ role: 'ac', salesOrder: approvedOrder2 }), null);
  const state = productSpecLineState({
    line: { id: 'L1' }, spec: null, latestRevision: null, salesOrder: approvedOrder2, role: 'ac',
  });
  assert.equal(state.kind, 'no_spec');
  assert.equal(state.reason, null);
  // แต่ปุ่ม "ออกเอกสาร" ของบรรทัดที่มีใบแล้วยังใช้ด่านเต็มเหมือนเดิม
  assert.match(
    productSpecIssueBlock(null, null, { role: 'ac', salesOrder: approvedOrder2 }),
    /ยังไม่มีใบสเปค/,
  );
});

test('ด่านของใบสั่งขายยังติดตามเดิมเมื่อใบยังไม่อนุมัติหรือคนไม่มีสิทธิ์', async () => {
  const { productSpecOrderGate } = await import('./productSpecWorkflow.js');
  assert.match(productSpecOrderGate({ role: 'ac', salesOrder: { status: 'draft' } }), /ยังไม่ผ่านการอนุมัติ/);
  assert.match(productSpecOrderGate({ role: 'rd', salesOrder: { status: 'approved' } }), /AC หรือฝ่ายขาย/);
  assert.match(productSpecOrderGate({ role: 'ac' }), /ไม่พบใบสั่งขาย/);
});
