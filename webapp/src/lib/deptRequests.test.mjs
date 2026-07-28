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
  closeRequestError,
  compareRequestUrgency,
  deleteRequestError,
  deriveRequestStatusAfterAnswer,
  normalizeRequestItems,
  normalizeRequestTiers,
  requestDueTone,
  requestProgress,
  requestSummaryText,
  submitRequestError,
} from './deptRequests.js';
import {
  deptForRequest,
  isRequestKind,
  requestDocScope,
  requestHasItems,
  requestNeedsDeal,
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

test('บังคับผูกดีลเฉพาะงานลูกค้า ไม่ใช่ชนิดขอราคา (มติ 5)', () => {
  assert.equal(requestNeedsDeal('scent_brief'), true);
  assert.equal(requestNeedsDeal('mockup'), true);
  assert.equal(requestNeedsDeal('document'), true);
  assert.equal(requestNeedsDeal('price_f'), false);
  assert.equal(requestNeedsDeal('price_pm'), false);
  assert.equal(requestNeedsDeal('info'), false);
});

test('หมุดไทม์ไลน์ตรงกับขั้นจริงใน lib/pm/templates.js (มติ 3 + 6)', () => {
  assert.equal(requestStepKey('scent_brief'), 'scent-06');   // ออกแบบกลิ่น
  assert.equal(requestStepKey('mockup'), 'npd-15');          // ขึ้น Mock-up
  assert.equal(requestStepKey('price_pm'), 'npd-25');        // หาบรรจุภัณฑ์
  assert.equal(requestStepKey('material_eta'), 'npd-38');    // กำหนดของเข้า
  assert.equal(requestStepKey('info'), null);
});

test('ด่านตอนสร้าง: ชนิดมีบรรทัดต้องมีรายการ · ชนิดไม่มีบรรทัดต้องมีหัวเรื่อง', () => {
  assert.match(requestShapeError('price_pm', {}), /อย่างน้อย 1 รายการ/);
  assert.equal(requestShapeError('price_pm', { items: [{ kind: 'PM' }] }), null);
  assert.match(requestShapeError('info', {}), /หัวเรื่อง/);
  assert.equal(requestShapeError('info', { title: 'ขอสเปกขวด' }), null);
});

test('ด่านตอนสร้าง: บรีฟกลิ่นต้องมีดีล · ขอราคา F ต้องเลือกกลิ่น · FB ต้องเลือกสูตร', () => {
  assert.match(requestShapeError('scent_brief', { title: 'บรีฟ' }), /ดีล/);
  assert.equal(requestShapeError('scent_brief', { title: 'บรีฟ', dealId: 'D1' }), null);
  assert.match(requestShapeError('price_f', { items: [{ kind: 'RM_F' }] }), /กลิ่น/);
  assert.match(requestShapeError('price_fb', { items: [{ kind: 'RM_FB' }] }), /สูตร/);
  assert.equal(requestShapeError('price_f', { items: [{ kind: 'RM_F' }], scentId: 'SCT-1' }), null);
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
