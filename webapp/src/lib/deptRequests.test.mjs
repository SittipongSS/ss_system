// คำร้องข้ามฝ่าย (mig 0173) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
// (ต่อยอดจาก materialAsks.test.mjs เดิม — เคสของเคสขอราคาต้องผ่านเหมือนเดิมทุกข้อ
//  เพราะผู้ใช้ที่ใช้อยู่ต้องไม่รู้สึกว่าอะไรเปลี่ยนหลังรวมระบบ)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_OPEN_STATUSES,
  acknowledgeRequestError,
  answerRequestError,
  canAnswerRequest,
  canManageRequest,
  cancelRequestError,
  closeOutcomeError,
  closeRequestError,
  compareRequestUrgency,
  deleteRequestError,
  deriveRequestStatusAfterAnswer,
  normalizeRequestItems,
  normalizeRequestTiers,
  requestDueTone,
  requestNeedsOutcome,
  requestProgress,
  requestsByStepKey,
  stepPinSummary,
  requestSummaryText,
  submitRequestError,
} from './deptRequests.js';
import { MATERIAL_KINDS } from './materialPrices.js';
import { requestFormBlocker, requestPayload } from './master/requestCreate.js';
import {
  REQUEST_KIND_LIST,
  deptForRequest,
  isRequestKind,
  kindForMaterial,
  kindsForDept,
  materialKindForRequest,
  requestDeptError,
  requestDocScope,
  requestHasItems,
  requestShapeError,
  requestStepKey,
} from './master/requestTypes.js';

const rd = { id: 'u-rd', role: 'rd', department: 'RD' };
const pc = { id: 'u-pc', role: 'staff', department: 'PC' };
const sale = { id: 'u-sale', role: 'ae', team: 'KA' };
const admin = { id: 'u-admin', role: 'admin' };

const req = (over = {}) => ({
  id: 'DR-1', kind: 'price_pm', dept: 'PC', status: 'acknowledged',
  requestedById: 'u-sale', ...over,
});

// ── ชนิดคำร้อง ───────────────────────────────────────────────────────────
test('เลขที่: RM-/PM- คงเดิม · บรีฟกลิ่นกับ mockup แยกของตัวเอง · ที่เหลือรวม RQ-', () => {
  assert.equal(requestDocScope('price_f'), 'RM');
  assert.equal(requestDocScope('price_fb'), 'RM');
  assert.equal(requestDocScope('price_pm'), 'PM');
  assert.equal(requestDocScope('scent_brief'), 'SB');
  assert.equal(requestDocScope('mockup'), 'MU');
  assert.equal(requestDocScope('info'), 'RQ');
  assert.equal(requestDocScope('document'), 'RQ');
  assert.equal(requestDocScope('material_eta'), 'RQ');
});

test('ฝ่ายผู้ตอบ: ชนิดที่ล็อกไว้ใช้ค่านั้น · ชนิดขอราคาอนุมานจากชนิดวัสดุ', () => {
  assert.equal(deptForRequest('scent_brief'), 'RD');
  assert.equal(deptForRequest('price_pm'), 'PC');
  // สอบถาม/ขอเอกสารไม่ล็อกฝ่าย — ผู้ขอเลือกเอง แต่ต้องเป็น RD/PC
  assert.equal(deptForRequest('info', { dept: 'RD' }), 'RD');
  assert.equal(deptForRequest('info', { dept: 'SA' }), null);
  // อนุมานจากรายการแรก (พฤติกรรมเดิมของเคสขอราคา)
  assert.equal(deptForRequest('info', { items: [{ kind: 'RM_F' }] }), 'RD');
  assert.equal(deptForRequest('info', { items: [{ kind: 'PM' }] }), 'PC');
});

test('ชนิดที่มีบรรทัด = ชนิดขอราคาเท่านั้น', () => {
  assert.equal(requestHasItems('price_pm'), true);
  assert.equal(requestHasItems('price_f'), true);
  assert.equal(requestHasItems('scent_brief'), false);
  assert.equal(requestHasItems('info'), false);
});

test('บังคับผูกดีล **ทุกหัวข้อ** ไม่มีข้อยกเว้น (มติ 2026-08-03 กลับมติ 5)', () => {
  // ⭐ เทสต์นี้แทนของเดิมที่ล็อกไว้ว่า "ชนิดขอราคาไม่บังคับดีล" — ผู้ใช้กลับมติเอง
  // หลังทราบผลกระทบแล้ว (ราคากลางที่ไม่ผูกดีลเปิดจากคำร้องไม่ได้อีก) · เทสต์เดิม
  // ไม่ได้ผิดตอนนั้น มันเลิกเป็นกฎแล้วเท่านั้น
  for (const kind of REQUEST_KIND_LIST) {
    const body = { title: 'เรื่อง', scentId: 'SCT-1', formulaId: 'FM-1', items: [{ kind: 'PM' }] };
    assert.match(requestShapeError(kind, body), /โครงการและดีล/, `${kind} ต้องบังคับดีล`);
  }
});

test('ด่านตอนสร้าง: ชื่อเรื่องบังคับทุกหัวข้อ รวมชนิดขอราคา', () => {
  // เดิมชนิดขอราคายกเว้นไว้เพราะสื่อความด้วยบรรทัดวัสดุ — แต่บนคิวรวมและในเธรดดีล
  // บรรทัดวัสดุมองไม่เห็น เหลือแต่ช่องว่าง
  assert.match(requestShapeError('price_pm', { dealId: 'D1', items: [{ kind: 'PM' }] }), /ชื่อเรื่อง/);
  assert.match(requestShapeError('info', { dealId: 'D1' }), /ชื่อเรื่อง/);
});

test('ฝ่ายที่เลือกต้องเข้ากับหัวข้อ — ไม่ override เงียบ ๆ', () => {
  assert.equal(requestDeptError('scent_brief', 'RD'), null);
  assert.match(requestDeptError('scent_brief', 'PC'), /ฝ่าย RD/);
  assert.match(requestDeptError('price_pm', 'RD'), /ฝ่าย PC/);
  // หัวข้อที่ไม่ล็อกฝ่ายส่งถึงใครก็ได้ แต่ต้องเลือก
  assert.equal(requestDeptError('info', 'RD'), null);
  assert.equal(requestDeptError('info', 'PC'), null);
  assert.match(requestDeptError('info', ''), /ต้องระบุฝ่าย/);
  assert.match(requestDeptError('info', 'PD'), /ต้องระบุฝ่าย/);
});

test('หัวข้อถูกกรองด้วยฝ่าย — ฟอร์มถามฝ่ายก่อนหัวข้อ (มติ 2026-08-03)', () => {
  const rd = kindsForDept('RD');
  const pc = kindsForDept('PC');
  assert.ok(rd.includes('scent_brief') && rd.includes('price_f') && rd.includes('mockup'));
  assert.ok(!rd.includes('price_pm') && !rd.includes('material_eta'));
  assert.ok(pc.includes('price_pm') && pc.includes('material_eta'));
  assert.ok(!pc.includes('scent_brief'));
  // หัวข้อที่ไม่ล็อกฝ่ายต้องอยู่ทั้งสองฝ่าย ไม่งั้นเลือกฝ่ายแล้วหาหัวข้อไม่เจอ
  for (const shared of ['info', 'document']) {
    assert.ok(rd.includes(shared) && pc.includes(shared), `${shared} ต้องเลือกได้ทั้งสองฝ่าย`);
  }
  assert.deepEqual(kindsForDept('PD'), []);
});

test('ชนิดวัสดุของบรรทัด derive จากหัวข้อได้เสมอ (ปิดบั๊กเปิดคำร้อง F/FB จากใบขอราคาผลิต)', () => {
  // 🔴 บั๊กจริง: โมดัลในใบขอราคาผลิตตั้งหัวข้อเป็น price_pm ตายตัวแล้วยัดบรรทัด
  // RM_F ทับ · payload ส่ง kind=price_f ซึ่งบังคับ scentId แต่ฟอร์มไม่เคยถาม
  // → 400 ทุกครั้ง แก้ด้วยการให้หัวข้อเป็นตัวตั้งแล้ว derive ชนิดวัสดุลงมา
  assert.equal(materialKindForRequest('price_f'), 'RM_F');
  assert.equal(materialKindForRequest('price_fb'), 'RM_FB');
  assert.equal(materialKindForRequest('price_pm'), 'PM');
  assert.equal(materialKindForRequest('info'), null);
  // ไป-กลับต้องปิดวง ไม่งั้นเพิ่มชนิดวัสดุใหม่แล้วสองทิศทางไม่ตรงกันเงียบ ๆ
  for (const mk of MATERIAL_KINDS) {
    assert.equal(materialKindForRequest(kindForMaterial(mk)), mk);
  }
});

test('หมุดไทม์ไลน์ตรงกับขั้นจริงใน lib/pm/templates.js (มติ 3 + 6)', () => {
  assert.equal(requestStepKey('scent_brief'), 'scent-06');   // ออกแบบกลิ่น
  assert.equal(requestStepKey('mockup'), 'npd-15');          // ขึ้น Mock-up
  assert.equal(requestStepKey('price_pm'), 'npd-25');        // หาบรรจุภัณฑ์
  assert.equal(requestStepKey('material_eta'), 'npd-38');    // กำหนดของเข้า
  assert.equal(requestStepKey('info'), null);
});

test('ด่านตอนสร้าง: หัวข้อที่มีบรรทัดต้องมีรายการ', () => {
  const base = { dealId: 'D1', title: 'ขอราคาขวด' };
  assert.match(requestShapeError('price_pm', base), /อย่างน้อย 1 รายการ/);
  assert.equal(requestShapeError('price_pm', { ...base, items: [{ kind: 'PM' }] }), null);
  assert.equal(requestShapeError('info', { dealId: 'D1', title: 'ขอสเปกขวด' }), null);
});

test('ด่านตอนสร้าง: ขอราคา F ต้องเลือกกลิ่น · FB ต้องเลือกสูตร', () => {
  const f = { dealId: 'D1', title: 'ขอราคาหัวน้ำหอม', items: [{ kind: 'RM_F' }] };
  const fb = { dealId: 'D1', title: 'ขอราคาเนื้อสาร', items: [{ kind: 'RM_FB' }] };
  assert.match(requestShapeError('price_f', f), /กลิ่น/);
  assert.match(requestShapeError('price_fb', fb), /สูตร/);
  assert.equal(requestShapeError('price_f', { ...f, scentId: 'SCT-1' }), null);
  assert.equal(requestShapeError('price_fb', { ...fb, formulaId: 'FM-1' }), null);
});

test('ด่านของฟอร์มกับ payload ที่โมดัลในใบขอราคาผลิตส่งจริงต้องตรงกัน', () => {
  // 🔴 regression: payload ชุดเดิม (ไม่มี dealId/title/scentId) ผ่านด่านฝั่งฟอร์ม
  // แต่ตายที่ server ทุกครั้ง — เทสต์นี้ยิงด้วย "ของที่หน้าจอส่งจริง" ไม่ใช่ของสมมุติ
  const payload = (materialKind, over = {}) => ({
    dealId: 'D1',
    title: `ขอราคา X — จากใบขอราคาผลิต CR-1`,
    items: [{ kind: materialKind, materialId: null, label: 'X', componentId: 'CMP-1', tiers: [1000] }],
    ...over,
  });
  assert.equal(requestShapeError('price_pm', payload('PM')), null);
  assert.equal(requestShapeError('price_f', payload('RM_F', { scentId: 'SCT-1' })), null);
  assert.equal(requestShapeError('price_fb', payload('RM_FB', { formulaId: 'FM-1' })), null);
  // ไม่มีดีล = ตกทันที (ทั้งฟอร์มและ server อ่านกฎเดียวกัน)
  assert.match(requestShapeError('price_pm', payload('PM', { dealId: null })), /โครงการและดีล/);
});

test('ชนิดวัสดุทุกตัวต้องมีชนิดคำร้องคู่กัน — ไม่งั้นปุ่ม "ขอราคา" ในใบขอราคาผลิตพัง', () => {
  // ⚠️ regression: ตอนขึ้น mig 0173 ทำให้ kind บังคับ แต่ปุ่มขอราคาจากบรรทัดในใบ
  // ยังส่ง payload เดิมที่ไม่มี kind → API ตอบ "ชนิดคำร้องไม่ถูกต้อง" ทุกครั้ง
  // เทสต์นี้กันเคสที่เพิ่มชนิดวัสดุใหม่แล้วลืมแมป (kindForMaterial คืน null เงียบ ๆ)
  for (const materialKind of MATERIAL_KINDS) {
    const kind = kindForMaterial(materialKind);
    assert.ok(kind, `ชนิดวัสดุ ${materialKind} ยังไม่มีชนิดคำร้องคู่กัน`);
    assert.ok(isRequestKind(kind), `${kind} ไม่อยู่ในทะเบียนชนิดคำร้อง`);
    assert.equal(requestHasItems(kind), true, `${kind} ต้องเป็นชนิดที่มีบรรทัด`);
  }
});

test('ชนิดที่ไม่รู้จักถูกปฏิเสธ (client ส่ง kind มั่วไม่ได้)', () => {
  assert.equal(isRequestKind('price_pm'), true);
  assert.equal(isRequestKind('อะไรก็ไม่รู้'), false);
  assert.match(requestShapeError('อะไรก็ไม่รู้', { title: 'x' }), /ชนิดคำร้อง/);
});

// ── รายการ + ชั้นจำนวน (พฤติกรรมเดิมของเคสขอราคา) ───────────────────────
test('รายการต้องเป็นของฝ่ายเดียวกับหัวคำร้อง', () => {
  const { error } = normalizeRequestItems([{ kind: 'PM', label: 'ขวด' }], { dept: 'RD' });
  assert.match(error, /ฝ่าย PC/);
});

test('ถามวัสดุตัวเดียวกันซ้ำในคำร้องเดียวไม่ได้', () => {
  const { error } = normalizeRequestItems(
    [{ kind: 'PM', label: 'ขวด 30ml' }, { kind: 'PM', label: 'ขวด 30ml' }], { dept: 'PC' },
  );
  assert.match(error, /ซ้ำ/);
});

test('ชั้นจำนวนเรียงน้อย→มาก และห้ามซ้ำ', () => {
  assert.deepEqual(normalizeRequestTiers([5000, 1000, 3000]).tiers, [1000, 3000, 5000]);
  assert.match(normalizeRequestTiers([1000, 1000]).error, /ซ้ำ/);
  assert.match(normalizeRequestTiers([0]).error, /มากกว่า 0/);
  assert.deepEqual(normalizeRequestTiers([]).tiers, []);   // ว่าง = ไม่แบ่งชั้น
});

// ── ความคืบหน้า/สถานะ ───────────────────────────────────────────────────
test('ตอบครบทุกรายการ → answered เอง (ชนิดที่มีบรรทัด)', () => {
  const items = [{ priceStatus: 'quoted' }, { priceStatus: 'no_quote' }];
  assert.deepEqual(requestProgress(items), { done: 2, total: 2, complete: true });
  assert.equal(deriveRequestStatusAfterAnswer(items, 'acknowledged'), 'answered');
  assert.equal(deriveRequestStatusAfterAnswer([{ priceStatus: 'pending' }], 'acknowledged'), 'acknowledged');
});

test('ยกเลิก/ปิดแล้ว สถานะไม่ถูก derive ทับ', () => {
  const items = [{ priceStatus: 'quoted' }];
  assert.equal(deriveRequestStatusAfterAnswer(items, 'cancelled'), 'cancelled');
  assert.equal(deriveRequestStatusAfterAnswer(items, 'closed'), 'closed');
});

// ── ด่าน action ──────────────────────────────────────────────────────────
test('ชนิดที่ไม่มีบรรทัดส่งได้โดยไม่ต้องมีรายการ', () => {
  assert.equal(submitRequestError(req({ kind: 'info', status: 'draft' }), []), null);
  assert.match(submitRequestError(req({ kind: 'price_pm', status: 'draft' }), []), /อย่างน้อย 1 รายการ/);
});

test('ปิดเรื่อง: ชนิดมีบรรทัดต้องตอบครบ · ชนิดไม่มีบรรทัดผู้ขอตัดสินเอง', () => {
  assert.match(closeRequestError(req({ kind: 'price_pm' }), [{ priceStatus: 'pending' }]), /ยังไม่ได้ตอบ/);
  assert.equal(closeRequestError(req({ kind: 'price_pm' }), [{ priceStatus: 'quoted' }]), null);
  // สอบถามที่รับเรื่องแล้ว ผู้ขอปิดเองได้แม้ยังไม่ answered
  assert.equal(closeRequestError(req({ kind: 'info', status: 'acknowledged' }), []), null);
  // แต่ที่ยังไม่มีใครรับเลย ให้ยกเลิกแทน (ปิดทั้งที่ไม่มีใครแตะ = ซ่อนงานที่ไม่ได้ทำ)
  assert.match(closeRequestError(req({ kind: 'info', status: 'pending' }), []), /ยกเลิกแทน/);
});

test('รับเรื่องได้ครั้งเดียว และต้องส่งก่อน', () => {
  assert.match(acknowledgeRequestError(req({ status: 'draft' })), /ยังไม่ถูกส่ง/);
  assert.equal(acknowledgeRequestError(req({ status: 'pending' })), null);
  assert.match(acknowledgeRequestError(req({ status: 'acknowledged' })), /รับเรื่องไปแล้ว/);
});

test('ตอบได้เฉพาะคำร้องที่ยังเดินอยู่', () => {
  assert.deepEqual(REQUEST_OPEN_STATUSES, ['pending', 'acknowledged']);
  assert.equal(answerRequestError(req({ status: 'pending' })), null);
  assert.match(answerRequestError(req({ status: 'closed' })), /ปิดไปแล้ว/);
});

test('ตอบแล้วให้ปิด ไม่ใช่ยกเลิก · ลบได้เฉพาะร่างที่ยังไม่ส่ง', () => {
  assert.match(cancelRequestError(req({ status: 'answered' })), /ปิดเรื่องแทน/);
  assert.equal(cancelRequestError(req({ status: 'pending' })), null);
  assert.equal(deleteRequestError(req({ status: 'draft', submittedAt: null })), null);
  assert.match(deleteRequestError(req({ status: 'draft', submittedAt: '2026-07-28' })), /หลักฐาน/);
});

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
test('ตอบได้เฉพาะฝ่ายเจ้าของคำร้อง + admin', () => {
  assert.equal(canAnswerRequest(pc, req({ dept: 'PC' })), true);
  assert.equal(canAnswerRequest(rd, req({ dept: 'PC' })), false);
  assert.equal(canAnswerRequest(rd, req({ dept: 'RD' })), true);
  assert.equal(canAnswerRequest(admin, req({ dept: 'RD' })), true);
  assert.equal(canAnswerRequest(sale, req({ dept: 'PC' })), false);
});

test('จัดการคำร้องได้เฉพาะผู้เปิด + admin (หัวหน้าทีมไม่เกี่ยว)', () => {
  assert.equal(canManageRequest(sale, req({ requestedById: 'u-sale' })), true);
  assert.equal(canManageRequest(sale, req({ requestedById: 'u-other' })), false);
  assert.equal(canManageRequest(admin, req({ requestedById: 'u-other' })), true);
  assert.equal(canManageRequest({ id: 'x', role: 'senior_ae' }, req()), false);
});

// ── คิว/กำหนดวัน (ยกมาจากระบบสอบถามเดิม) ────────────────────────────────
test('เรื่องที่ยังไม่มีใครรับมาก่อนเสมอ แล้วค่อยเรียงตามวันที่รับปาก', () => {
  const noOwnerOld = { submittedAt: '2026-07-01' };
  const noOwnerNew = { submittedAt: '2026-07-20' };
  const takenSoon = { acknowledgedAt: 'x', committedDueDate: '2026-07-29' };
  const takenLate = { acknowledgedAt: 'x', committedDueDate: '2026-08-30' };
  const sorted = [takenLate, noOwnerNew, takenSoon, noOwnerOld].sort(compareRequestUrgency);
  assert.deepEqual(sorted, [noOwnerOld, noOwnerNew, takenSoon, takenLate]);
});

test('ป้ายกำหนดตอบ: ยังไม่รับ / เลยกำหนด / ครบวันนี้', () => {
  const today = '2026-07-28';
  assert.equal(requestDueTone(req({ status: 'pending' }), today).label, 'ยังไม่รับเรื่อง');
  assert.equal(requestDueTone(req({ committedDueDate: '2026-07-27' }), today).label, 'เลยกำหนด');
  assert.equal(requestDueTone(req({ committedDueDate: '2026-07-28' }), today).label, 'ครบกำหนดวันนี้');
  assert.equal(requestDueTone(req({ committedDueDate: '2026-08-10' }), today), null);
  // ปิดแล้วไม่ต้องเตือนอีก
  assert.equal(requestDueTone(req({ status: 'closed', committedDueDate: '2020-01-01' }), today), null);
});

test('ป้ายสรุปหนึ่งบรรทัด: ใช้หัวเรื่องถ้ามี ไม่มีก็บอกจำนวนรายการ', () => {
  assert.equal(requestSummaryText(req({ kind: 'info', title: 'ขอสเปกขวด' })), 'สอบถามข้อมูล · ขอสเปกขวด');
  assert.equal(requestSummaryText(req({ kind: 'price_pm' }), [{}, {}]), 'ขอราคาบรรจุภัณฑ์ (PM) · 2 รายการ');
  assert.equal(requestSummaryText(req({ kind: 'mockup' })), 'ขอ Mock-up');
});

// ── หมุดไทม์ไลน์ ─────────────────────────────────────────────────────────
const pinReq = (over = {}) => ({
  id: 'DR-1', kind: 'mockup', status: 'pending', stepKey: 'npd-15',
  projectId: 'PRJ-1', dealId: 'D-1', createdAt: '2026-07-01T00:00:00Z', ...over,
});

test('หมุด: จัดกลุ่มตาม stepKey และไม่นับคำร้องที่ไม่มี stepKey', () => {
  const byStep = requestsByStepKey([
    pinReq({ id: 'A', stepKey: 'npd-15' }),
    pinReq({ id: 'B', stepKey: 'npd-25', kind: 'price_pm' }),
    pinReq({ id: 'C', stepKey: null, kind: 'info' }),
  ]);
  assert.deepEqual([...byStep.keys()].sort(), ['npd-15', 'npd-25']);
  assert.equal(byStep.get('npd-15').length, 1);
});

test('หมุด: ร่างยังไม่ถูกส่ง = ยังไม่ใช่งานของทีม ไม่โผล่บนไทม์ไลน์', () => {
  const byStep = requestsByStepKey([pinReq({ status: 'draft' })]);
  assert.equal(byStep.size, 0);
});

test('หมุด: คำร้องของโครงการอื่นไม่มาปนไทม์ไลน์นี้', () => {
  const rows = [pinReq({ id: 'A' }), pinReq({ id: 'B', projectId: 'PRJ-2' })];
  const byStep = requestsByStepKey(rows, { projectId: 'PRJ-1' });
  assert.deepEqual(byStep.get('npd-15').map((r) => r.id), ['A']);
});

test('หมุด: คำร้องที่ยังไม่ผูกโครงการ (ดีลยังไม่มีโครงการ) ยังนับให้', () => {
  // ดีลส่วนใหญ่บน prod ยังไม่มีโครงการ — ถ้าตัดทิ้งหมุดจะว่างเปล่าเกือบทั้งระบบ
  const byStep = requestsByStepKey([pinReq({ projectId: null })], { projectId: 'PRJ-1' });
  assert.equal(byStep.get('npd-15').length, 1);
});

test('หมุด: เรื่องที่ยังค้างขึ้นก่อนเรื่องที่ปิดแล้วเสมอ', () => {
  const byStep = requestsByStepKey([
    pinReq({ id: 'ปิดแล้ว', status: 'closed', createdAt: '2026-07-20T00:00:00Z' }),
    pinReq({ id: 'ค้าง', status: 'acknowledged', createdAt: '2026-07-01T00:00:00Z' }),
  ]);
  assert.deepEqual(byStep.get('npd-15').map((r) => r.id), ['ค้าง', 'ปิดแล้ว']);
});

test('สรุปหมุด: นับรวม/นับค้าง และคืน null เมื่อขั้นนั้นไม่มีอะไรผูก', () => {
  const byStep = requestsByStepKey([
    pinReq({ id: 'A', status: 'pending' }),
    pinReq({ id: 'B', status: 'closed' }),
  ]);
  const sum = stepPinSummary(byStep, 'npd-15');
  assert.equal(sum.total, 2);
  assert.equal(sum.open, 1);
  assert.equal(sum.first.id, 'A');
  assert.equal(stepPinSummary(byStep, 'npd-25'), null);
  // task เก่าที่ไม่มี stepKey (165 จาก 282 แถวบน prod) ต้องไม่ระเบิด
  assert.equal(stepPinSummary(byStep, null), null);
});

// ── ผลลัพธ์ตอนปิดบรีฟกลิ่น ────────────────────────────────────────────────
const brief = (over = {}) => ({
  id: 'DR-9', kind: 'scent_brief', status: 'answered',
  customerId: 'CUS-1', customerName: 'ลูกค้า A', dealId: 'D-1', scentId: null, ...over,
});

test('ชนิดที่ไม่มีผลลัพธ์ ปิดได้เลยไม่ต้องถามอะไร', () => {
  for (const kind of ['info', 'mockup', 'document', 'material_eta', 'price_pm']) {
    assert.equal(requestNeedsOutcome(kind), false, kind);
    assert.equal(closeOutcomeError({ kind }, undefined), null, kind);
  }
});

test('บรีฟกลิ่นต้องระบุผลลัพธ์ก่อนปิด — ปิดเงียบ ๆ ไม่ได้', () => {
  assert.equal(requestNeedsOutcome('scent_brief'), true);
  assert.equal(closeOutcomeError(brief(), undefined), 'ต้องระบุว่าบรีฟนี้ได้กลิ่นตัวไหน');
  assert.equal(closeOutcomeError(brief(), { mode: 'อะไรก็ไม่รู้' }), 'ต้องระบุว่าบรีฟนี้ได้กลิ่นตัวไหน');
});

test('บรีฟที่ผูกกลิ่นไว้แล้วไม่ต้องถามซ้ำ', () => {
  assert.equal(closeOutcomeError(brief({ scentId: 'SCT-1' }), undefined), null);
});

test('"ไม่ได้กลิ่น" เป็นคำตอบที่ถูกต้อง — บรีฟที่ลูกค้าไม่เอาต้องปิดได้', () => {
  assert.equal(closeOutcomeError(brief(), { mode: 'none' }), null);
});

test('ผูกกลิ่นเดิมต้องเลือกตัวจริง · สร้างใหม่ต้องมีชื่อ', () => {
  assert.equal(closeOutcomeError(brief(), { mode: 'link' }), 'ต้องเลือกกลิ่นจากทะเบียน');
  assert.equal(closeOutcomeError(brief(), { mode: 'link', scentId: 'SCT-1' }), null);
  assert.equal(closeOutcomeError(brief(), { mode: 'create', scentName: '  ' }), 'ต้องระบุชื่อกลิ่นที่จะเพิ่มเข้าทะเบียน');
  assert.equal(closeOutcomeError(brief(), { mode: 'create', scentName: 'Well sleep' }), null);
  assert.equal(closeOutcomeError(brief(), { mode: 'create', scentName: 'x'.repeat(201) }), 'ชื่อกลิ่นยาวเกิน 200 ตัวอักษร');
});

test('กลิ่นผูกลูกค้าเสมอ (มติ 9) — บรีฟที่ไม่มีลูกค้าสร้างกลิ่นใหม่ไม่ได้', () => {
  assert.equal(
    closeOutcomeError(brief({ customerId: null }), { mode: 'create', scentName: 'Well sleep' }),
    'คำร้องนี้ไม่มีลูกค้า จึงเพิ่มกลิ่นเข้าทะเบียนไม่ได้',
  );
  // แต่ผูกกับกลิ่นที่มีอยู่แล้ว/ไม่ได้กลิ่น ยังปิดได้ (ด่านข้ามลูกค้าอยู่ฝั่ง server)
  assert.equal(closeOutcomeError(brief({ customerId: null }), { mode: 'none' }), null);
});

// ── ด่านฝั่งจอ: ปุ่มส่งกับข้อความต้องพูดตรงกันเสมอ ──────────────────────
test('requestFormBlocker: ปุ่มส่งกับข้อความเหตุผลใช้ตัวเดียวกัน', () => {
  const base = {
    projectId: 'PRJ-1', dealId: 'D-1', dept: 'RD', kind: 'price_f',
    title: 'ขอราคาหัวน้ำหอม', scentId: 'SCT-1',
    items: [{ kind: 'RM_F', material: { materialId: 'MAT-1', label: 'Forest night' }, tiers: [1000] }],
  };
  assert.equal(requestFormBlocker(base), null);

  // 🐞 เคสที่เจอตอนกดจริงในเบราว์เซอร์: ผ่าน requestShapeError หมดแล้ว แต่บรรทัด
  // ยังไม่ได้เลือกวัสดุ → เดิมปุ่มจางลงโดย **ไม่มีข้อความบอก** เพราะเงื่อนไขนี้อยู่ที่
  // ผู้เรียก ไม่ได้อยู่ในตัวที่ฟอร์มเอาไปแสดง
  const noMaterial = { ...base, items: [{ kind: 'RM_F', material: { materialId: null, label: '  ' }, tiers: [] }] };
  assert.match(requestFormBlocker(noMaterial), /วัสดุของทุกรายการ/);

  // ยังไม่เลือกฝ่าย/หัวข้อ = ข้อความแรกสุด ไม่ใช่ "ชนิดคำร้องไม่ถูกต้อง" ที่อ่านไม่รู้เรื่อง
  assert.match(requestFormBlocker({ ...base, kind: '', dept: '' }), /เลือกฝ่ายและหัวข้อ/);
  assert.match(requestFormBlocker({ ...base, dept: '' }), /เลือกฝ่ายและหัวข้อ/);
  // ไม่มีดีล / ไม่มีชื่อเรื่อง ต้องได้ข้อความของตัวเอง
  assert.match(requestFormBlocker({ ...base, dealId: '' }), /โครงการและดีล/);
  assert.match(requestFormBlocker({ ...base, title: '' }), /ชื่อเรื่อง/);
  assert.equal(requestFormBlocker(null), 'ยังไม่มีข้อมูล');
});

test('requestPayload: ไม่ส่งของที่ server ตัดสินเอง และไม่ส่ง items ให้หัวข้อที่ไม่มีบรรทัด', () => {
  const form = {
    projectId: 'PRJ-1', dealId: 'D-1', dept: 'RD', kind: 'scent_brief',
    title: 'บรีฟกลิ่น', body: 'โทนไม้', urgent: true,
    items: [{ kind: 'RM_F', material: { label: 'x' } }],
    files: [], mentions: [{ id: 'u-1', name: 'ก' }],
  };
  const p = requestPayload(form);
  assert.equal('items' in p, false, 'หัวข้อที่ไม่มีบรรทัดต้องไม่ส่ง items');
  // projectId/customerId/customerName เป็นของ server (ดึงจากแถวดีล) · note เลิกใช้
  for (const banned of ['projectId', 'customerId', 'customerName', 'note']) {
    assert.equal(banned in p, false, `payload ต้องไม่มี ${banned}`);
  }
  assert.equal(p.dealId, 'D-1');
  assert.equal(p.title, 'บรีฟกลิ่น');
  // หัวข้อที่มีบรรทัดต้องส่ง items และ kind ของบรรทัดต้องมาจากฟอร์ม
  const priced = requestPayload({ ...form, kind: 'price_f' });
  assert.equal(priced.items.length, 1);
  assert.equal(priced.items[0].kind, 'RM_F');
});
