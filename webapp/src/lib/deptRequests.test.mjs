// คำร้องข้ามฝ่าย (mig 0173) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
// (ต่อยอดจาก materialAsks.test.mjs เดิม — เคสของเคสขอราคาต้องผ่านเหมือนเดิมทุกข้อ
//  เพราะผู้ใช้ที่ใช้อยู่ต้องไม่รู้สึกว่าอะไรเปลี่ยนหลังรวมระบบ)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_OPEN_STATUSES,
  acknowledgeRequestError,
  rescheduleRequestError,
  bounceRequestError,
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
  canReadRequestRow,
  requestsByStepKey,
  stepPinSummary,
  requestSummaryText,
  submitRequestError,
} from './deptRequests.js';
import { followUpRowFrom } from './requests/hops.js';
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
  requestHasTiers,
  requestNeeds,
  requestKindLabel,
  legacyKindError,
  requestNeedsRef,
  requestDocScope,
  requestHasItems,
  requestShapeError,
  requestStepKey,
  PLANNED_REQUEST_DEPTS,
  REQUEST_DEPTS,
  REQUEST_DEPT_LABELS,
  requestKindFamily,
  requestStepLabel,
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

test('สิ่งที่ต้องผูกต่างกันตามหัวข้อ (มติ 2026-08-03 รอบสอง)', () => {
  // ⭐ รอบแรกบังคับโครงการ+ดีลทุกหัวข้อเท่ากันหมด · รอบสองผู้ใช้แก้ให้ตรงงานจริง:
  //   ขอราคา = ไม่ผูกดีล (กลิ่น/สูตรผูกลูกค้าอยู่แล้ว · วัสดุเป็นราคากลาง)
  //   บรีฟกลิ่น = ผูก SO (ค่าบริการ — ยืนยันกับ SCENT_TEMPLATE ขั้น 4 → 6)
  //   Mock-up = ผูกโครงการ+ดีล+กลิ่น
  // ⚠️ เคยผูก "หมวดสินค้า" ด้วย — mig 0204 DROP `dept_requests.productTypeId` ทิ้ง
  // ค่าที่กรอกจึงไม่มีที่เก็บ ⇒ ถอดออก (บังคับกรอกของที่เก็บไม่ได้ = หลอกผู้ใช้)
  // หมวดสินค้ากลับมาเป็น **รายแถว** ตอนหัวข้อ "พัฒนาผลิตภัณฑ์" มาแทน Mock-up
  assert.deepEqual(requestNeeds('price_f'), ['scent']);
  assert.deepEqual(requestNeeds('price_fb'), ['formula']);
  assert.deepEqual(requestNeeds('price_pm'), []);
  assert.deepEqual(requestNeeds('scent_brief'), ['salesOrder']);
  assert.deepEqual(requestNeeds('mockup'), ['project', 'deal', 'scent']);
  assert.deepEqual(requestNeeds('info'), ['project', 'deal']);
  // ⚠️ ขอราคาต้องไม่บังคับดีลอีกแล้ว — regression ที่สำคัญที่สุดของรอบนี้
  for (const kind of ['price_f', 'price_fb', 'price_pm']) {
    assert.equal(requestNeedsRef(kind, 'deal'), false, `${kind} ต้องไม่ผูกดีล`);
  }
});

test('ด่านตอนสร้าง: ขอราคาส่งได้โดยไม่มีดีล · บรีฟกลิ่นส่งไม่ได้ถ้าไม่มี SO', () => {
  // ขอราคา PM = ราคากลาง ไม่ต้องผูกอะไรเลยนอกจากชื่อเรื่อง+บรรทัด
  assert.equal(requestShapeError('price_pm', {
    title: 'ขอราคาขวด 30ml', items: [{ kind: 'PM' }],
  }), null);
  assert.equal(requestShapeError('price_f', {
    title: 'ขอราคาหัวน้ำหอม', scentId: 'SCT-1', items: [{ kind: 'RM_F' }],
  }), null);
  // บรีฟกลิ่น: ไม่มี SO = ตก และข้อความต้องบอกเหตุผล (ค่าบริการ) ไม่ใช่แค่ "ต้องเลือก"
  assert.match(requestShapeError('scent_brief', { title: 'บรีฟ' }), /ใบสั่งขาย/);
  assert.equal(requestShapeError('scent_brief', { title: 'บรีฟ', salesOrderId: 'SO-1' }), null);
  // Mock-up ต้องครบทั้งสาม — ไล่ทีละข้อว่าข้อความตรงกับของที่ขาด
  const mock = { title: 'ขอ Mock-up', projectId: 'PRJ-1', dealId: 'D-1', scentId: 'SCT-1' };
  assert.equal(requestShapeError('mockup', mock), null);
  assert.match(requestShapeError('mockup', { ...mock, scentId: '' }), /กลิ่น/);
  assert.match(requestShapeError('mockup', { ...mock, projectId: '' }), /โครงการ/);
});

test('ด่านตอนสร้าง: ชื่อเรื่องบังคับทุกหัวข้อ รวมหัวข้อขอราคา', () => {
  // หัวข้อขอราคาสื่อความด้วยบรรทัดวัสดุ แต่บนคิวรวมและในเธรดดีล บรรทัดมองไม่เห็น
  assert.match(requestShapeError('price_pm', { items: [{ kind: 'PM' }] }), /ชื่อเรื่อง/);
  assert.match(requestShapeError('info', { projectId: 'P1', dealId: 'D1' }), /ชื่อเรื่อง/);
});

test('ชั้นจำนวน (MOQ) มีเฉพาะวัสดุ — ขอราคา F/FB เป็นราคาเดียว', () => {
  assert.equal(requestHasTiers('price_pm'), true);
  assert.equal(requestHasTiers('price_f'), false);
  assert.equal(requestHasTiers('price_fb'), false);
  // ชั้นที่หลุดมากับ payload ของหัวข้อไม่มีชั้น ต้องถูกทิ้งเงียบ ๆ ไม่ error
  const { items, error } = normalizeRequestItems(
    [{ kind: 'RM_F', label: 'Forest night', tiers: [500, 1000] }],
    { dept: 'RD', hasTiers: false },
  );
  assert.equal(error, null);
  assert.deepEqual(items[0].tiers, [], 'หัวข้อไม่มีชั้นจำนวน = ทิ้งชั้นที่ส่งมา');
  // ฝั่งวัสดุยังเก็บชั้นตามเดิม
  const pm = normalizeRequestItems(
    [{ kind: 'PM', label: 'ขวด 30ml', tiers: [1000, 500] }],
    { dept: 'PC', hasTiers: true },
  );
  assert.deepEqual(pm.items[0].tiers, [500, 1000], 'ชั้นจำนวนเรียงจากน้อยไปมาก');
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
  assert.ok(rd.includes('scent_dev') && rd.includes('product_dev') && rd.includes('price_f'));
  assert.ok(!rd.includes('price_pm') && !rd.includes('material_eta'));
  assert.ok(pc.includes('price_pm') && pc.includes('material_eta'));
  assert.ok(!pc.includes('scent_dev'));
  // ⭐ หัวข้อที่เลิกใช้แล้วต้องหายจากลิสต์ "เปิดใบใหม่" ของทุกฝ่าย…
  assert.ok(!rd.includes('scent_brief') && !pc.includes('scent_brief'));
  // Mock-up ถูกแทนด้วย "พัฒนาผลิตภัณฑ์" — หมวดกับกลิ่นย้ายไปอยู่รายแถวแล้ว
  assert.ok(!rd.includes('mockup') && !pc.includes('mockup'));
  assert.match(legacyKindError('mockup'), /เลิกใช้แล้ว/);
  // …แต่ป้ายชื่อต้องยังอ่านได้ ไม่งั้นใบเก่าบน prod จะโชว์ key ดิบบนหน้าจอ
  assert.match(requestKindLabel('scent_brief'), /บรีฟ/);
  assert.match(legacyKindError('scent_brief'), /เลิกใช้แล้ว/);
  assert.equal(legacyKindError('scent_dev'), null);
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
  assert.match(requestShapeError('price_pm', { title: 'ขอราคาขวด' }), /อย่างน้อย 1 รายการ/);
  assert.equal(requestShapeError('price_pm', { title: 'ขอราคาขวด', items: [{ kind: 'PM' }] }), null);
  assert.equal(requestShapeError('info', {
    projectId: 'P1', dealId: 'D1', title: 'ขอสเปกขวด',
  }), null);
});

test('ด่านตอนสร้าง: ขอราคา F ต้องเลือกกลิ่น · FB ต้องเลือกสูตร', () => {
  const f = { title: 'ขอราคาหัวน้ำหอม', items: [{ kind: 'RM_F' }] };
  const fb = { title: 'ขอราคาเนื้อสาร', items: [{ kind: 'RM_FB' }] };
  assert.match(requestShapeError('price_f', f), /กลิ่น/);
  assert.match(requestShapeError('price_fb', fb), /สูตร/);
  assert.equal(requestShapeError('price_f', { ...f, scentId: 'SCT-1' }), null);
  assert.equal(requestShapeError('price_fb', { ...fb, formulaId: 'FM-1' }), null);
});

test('ด่านของฟอร์มกับ payload ที่โมดัลในใบขอราคาผลิตส่งจริงต้องตรงกัน', () => {
  // 🔴 regression: payload ชุดเดิม (ไม่มี title/scentId) ผ่านด่านฝั่งฟอร์มแต่ตายที่
  // server ทุกครั้ง — เทสต์นี้ยิงด้วย "ของที่หน้าจอส่งจริง" ไม่ใช่ของสมมุติ
  // ⚠️ ไม่มี dealId โดยเจตนา: เปิดจากใบขอราคาผลิตที่ไม่ผูกดีลก็ต้องผ่าน (มติรอบสอง)
  const payload = (materialKind, over = {}) => ({
    title: 'ขอราคา X — จากใบขอราคาผลิต CR-1',
    items: [{ kind: materialKind, materialId: null, label: 'X', componentId: 'CMP-1', tiers: [1000] }],
    ...over,
  });
  assert.equal(requestShapeError('price_pm', payload('PM')), null);
  assert.equal(requestShapeError('price_f', payload('RM_F', { scentId: 'SCT-1' })), null);
  assert.equal(requestShapeError('price_fb', payload('RM_FB', { formulaId: 'FM-1' })), null);
  // ขาดชื่อเรื่อง = ตกทันที (ทั้งฟอร์มและ server อ่านกฎเดียวกัน)
  assert.match(requestShapeError('price_pm', payload('PM', { title: '' })), /ชื่อเรื่อง/);
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
  const items = [{ answerStatus: 'done' }, { answerStatus: 'declined' }];
  assert.deepEqual(requestProgress(items), { done: 2, total: 2, complete: true });
  assert.equal(deriveRequestStatusAfterAnswer(items, 'acknowledged'), 'answered');
  assert.equal(deriveRequestStatusAfterAnswer([{ answerStatus: 'pending' }], 'acknowledged'), 'acknowledged');
});

test('ยกเลิก/ปิดแล้ว สถานะไม่ถูก derive ทับ', () => {
  const items = [{ answerStatus: 'done' }];
  assert.equal(deriveRequestStatusAfterAnswer(items, 'cancelled'), 'cancelled');
  assert.equal(deriveRequestStatusAfterAnswer(items, 'closed'), 'closed');
});

// ── ด่าน action ──────────────────────────────────────────────────────────
test('ชนิดที่ไม่มีบรรทัดส่งได้โดยไม่ต้องมีรายการ', () => {
  assert.equal(submitRequestError(req({ kind: 'info', status: 'draft' }), []), null);
  assert.match(submitRequestError(req({ kind: 'price_pm', status: 'draft' }), []), /อย่างน้อย 1 รายการ/);
});

test('ปิดเรื่อง: ใบที่มีแถวต้องจบครบ · ใบที่ไม่มีแถวผู้ขอตัดสินเอง', () => {
  assert.match(closeRequestError(req({ kind: 'price_pm' }), [{ answerStatus: 'pending' }]), /ยังเดินไม่จบ/);
  assert.equal(closeRequestError(req({ kind: 'price_pm' }), [{ answerStatus: 'done' }]), null);
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
  // ขอราคา F ไม่ผูกดีลแล้ว (มติรอบสอง) — ฟอร์มต้องปล่อยผ่านโดยไม่มีโครงการ/ดีล
  const base = {
    dept: 'RD', kind: 'price_f',
    title: 'ขอราคาหัวน้ำหอม', scentId: 'SCT-1',
    items: [{ kind: 'RM_F', material: { materialId: 'MAT-1', label: 'Forest night' }, tiers: [] }],
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
  assert.match(requestFormBlocker({ ...base, title: '' }), /ชื่อเรื่อง/);
  assert.equal(requestFormBlocker(null), 'ยังไม่มีข้อมูล');

  // หัวข้อที่ผูกของ ต้องได้ข้อความของ "ของที่ขาด" ตัวนั้น ไม่ใช่ข้อความรวม ๆ
  const brief = { dept: 'RD', kind: 'scent_brief', title: 'บรีฟกลิ่นชุดใหม่' };
  assert.match(requestFormBlocker(brief), /ใบสั่งขาย/);
  assert.equal(requestFormBlocker({ ...brief, salesOrderId: 'SO-1' }), null);
  const mock = {
    dept: 'RD', kind: 'mockup', title: 'ขอ Mock-up ขวด 30ml',
    projectId: 'PRJ-1', dealId: 'D-1', scentId: 'SCT-1',
  };
  assert.equal(requestFormBlocker(mock), null);
  assert.match(requestFormBlocker({ ...mock, dealId: '' }), /ดีล/);
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

test('canReadRequestRow: เปิดตรงด้วย id ต้องดูแถว ไม่ใช่แค่ถือ cap (P0c′)', () => {
  // 🐞 รูเดิม: GET /api/sa/requests กรองแถวให้เห็นเฉพาะของตัวเอง + คิวของฝ่ายตน
  // แต่ GET /api/sa/requests/[id] กั้นด้วย canViewCosting ล้วน ⇒ รายการซ่อนใบของ
  // คนอื่น แต่รู้ id เมื่อไรก็เปิดอ่านได้หมดพร้อมบรรทัดและสเปกข้างใน
  const req = { dept: 'RD', requestedById: 'u-sa', status: 'pending' };

  // ผู้เปิดคำร้องเอง
  assert.equal(canReadRequestRow({ id: 'u-sa', role: 'ae' }, req), true);
  // ฝ่ายที่ต้องตอบ
  assert.equal(canReadRequestRow({ id: 'u-rd', role: 'rd', department: 'RD' }, req), true);
  // admin break-glass
  assert.equal(canReadRequestRow({ id: 'u-admin', role: 'admin' }, req), true);
  // ผู้สังเกตการณ์ทั้งระบบ — ต้องไม่เสียสิทธิ์ที่เคยมี
  assert.equal(canReadRequestRow({ id: 'u-ex', role: 'executive' }, req), true);

  // ⭐ ของจริงที่ปิด: เซลคนอื่นที่ถือ costing:view เหมือนกัน แต่ไม่ใช่เจ้าของใบ
  // และไม่ได้อยู่ฝ่ายที่ต้องตอบ
  assert.equal(canReadRequestRow({ id: 'u-other', role: 'ae' }, req), false);
  // ฝ่ายอื่นที่ไม่ใช่ปลายทางของใบนี้
  assert.equal(canReadRequestRow({ id: 'u-pc', role: 'staff', department: 'PC' }, req), false);
});


// ── ตีกลับ (mig 0208) ────────────────────────────────────────────────────
//
// ⭐ `pending → draft` ไม่ใช่สถานะใหม่ — ร่างคือสถานะที่ผู้ขอแก้แล้วส่งซ้ำได้อยู่แล้ว
// และ trigger ทำให้ `docNo` แก้ไม่ได้ ⇒ เลขที่ไม่เปลี่ยน (คำร้องใบเดิม ไม่ใช่ใบใหม่)
test('ตีกลับได้เฉพาะใบที่ส่งแล้วแต่ยังไม่รับเรื่อง', () => {
  const at = (status) => ({ id: 'DR-1', status, dept: 'RD' });
  assert.equal(bounceRequestError(at('pending'), { reason: 'ยังไม่แนบไฟล์' }), null);
  assert.match(bounceRequestError(at('draft'), { reason: 'x' }), /ยังไม่ถูกส่ง/);
  // ⚠️ รับเรื่องแล้วห้ามตีกลับ — ฝ่ายรับงานไปแล้ว ของที่ขาดถามในเธรดได้
  // ผลักใบกลับทั้งใบตอนนั้นคือทำให้ผู้ขอเสียบริบทที่คุยกันไปแล้ว
  assert.match(bounceRequestError(at('acknowledged'), { reason: 'x' }), /ยังไม่รับเรื่อง/);
  assert.match(bounceRequestError(at('answered'), { reason: 'x' }), /ยังไม่รับเรื่อง/);
  assert.match(bounceRequestError(at('cancelled'), { reason: 'x' }), /ยังไม่รับเรื่อง/);
});

test('ตีกลับต้องบอกเหตุผลเสมอ — ไม่งั้นผู้ขอส่งใบเดิมกลับมาอีกรอบ', () => {
  const pending = { id: 'DR-1', status: 'pending', dept: 'RD' };
  assert.match(bounceRequestError(pending, {}), /ต้องบอกว่าต้องแก้อะไร/);
  assert.match(bounceRequestError(pending, { reason: '   ' }), /ต้องบอกว่าต้องแก้อะไร/);
  assert.match(bounceRequestError(pending, { reason: 'ก'.repeat(2001) }), /ยาวเกิน/);
});

// ── ฟอร์มเปิดคำร้องรอบใหม่: ฝ่ายเป็นปุ่ม · หัวข้อมีหัวกลุ่ม · ช่องที่เติมให้ ──────

test('ฝ่ายที่ยังไม่เปิดต้องอยู่นอก REQUEST_DEPTS — โผล่ในฟอร์มได้ แต่ส่งไม่ได้', () => {
  // ⚠️ ด่านนี้มีไว้กันการ "เปิดที่เมนู" ก่อน "ปิดที่เนื้อ" — ย้าย FN เข้า
  // REQUEST_DEPTS ก่อน P7 ผ่อน CHECK ของ dept_requests.dept เมื่อไร ฟอร์มจะยอมให้
  // ส่งแล้วไปตายที่ constraint ด้วย error ดิบ
  for (const dept of PLANNED_REQUEST_DEPTS) {
    assert.ok(!REQUEST_DEPTS.includes(dept), `${dept} ยังส่งไม่ได้`);
    assert.ok(REQUEST_DEPT_LABELS[dept], `${dept} ต้องมีป้ายชื่อให้แสดงแบบจาง`);
    assert.equal(kindsForDept(dept).length, 0);
    assert.ok(requestDeptError(dept));
  }
});

test('ทุกฝ่ายที่ส่งได้ต้องมีป้ายชื่อ — ไม่งั้นปุ่มจะขึ้นเป็นรหัสดิบ', () => {
  for (const dept of REQUEST_DEPTS) {
    assert.ok(REQUEST_DEPT_LABELS[dept]?.code);
    assert.ok(REQUEST_DEPT_LABELS[dept]?.name);
  }
});

test('หัวข้อทุกตัวมีตระกูลไว้เป็นหัวกลุ่ม — ไม่มีตัวไหนตกไปเป็นกลุ่มเปล่า', () => {
  for (const kind of REQUEST_KIND_LIST) {
    const family = requestKindFamily(kind);
    assert.equal(typeof family, 'string');
    assert.ok(family.length > 0, `${kind} ต้องมีหัวกลุ่ม`);
  }
  // งานพัฒนากับขอราคาอยู่ฝ่าย RD ทั้งคู่ — ต้องแยกกลุ่มกันได้ ไม่งั้นหัวกลุ่มไร้ประโยชน์
  assert.notEqual(requestKindFamily('scent_dev'), requestKindFamily('price_f'));
});

test('requestStepLabel อ่านชื่อขั้นจากแม่แบบ ไม่ใช่ข้อความที่ก๊อปมาเก็บ', () => {
  // 'scent-06' → SCENT_TEMPLATE ขั้น 6 = "ออกแบบกลิ่น" · แก้ชื่อขั้นในแม่แบบแล้ว
  // ป้ายในฟอร์มต้องเปลี่ยนตามเอง
  assert.equal(requestStepLabel('scent_dev'), 'ออกแบบกลิ่น (SCENT 6)');
  assert.equal(requestStepKey('product_dev'), 'npd-15');
  assert.ok(requestStepLabel('product_dev')?.includes('(NPD 15)'));
  // หัวข้อที่ไม่ปักหมุดขั้นไหนต้องคืน null — ห้ามเดาขั้นให้
  assert.equal(requestStepLabel('info'), null);
  assert.equal(requestStepLabel('ไม่มีหัวข้อนี้'), null);
});

test('⭐ พัฒนากลิ่นบังคับใส่วันกำหนดส่งตอนรับเรื่อง — รายชนิด ไม่ใช่ทั้งระบบ', () => {
  // มติผู้ใช้ 2026-08-06 · รับเรื่องโดยไม่ผูกวัน = รับปากว่า "จะทำ" โดยไม่บอกว่าเมื่อไร
  // และเป็นวันที่ใช้นับว่าเลยกำหนดหรือยัง ⇒ ไม่มีวัน = ไม่มีทางรู้ว่าใบไหนช้า
  const scent = { kind: 'scent_dev', status: 'pending' };
  assert.match(acknowledgeRequestError(scent), /วันกำหนดส่ง/);
  assert.match(acknowledgeRequestError(scent, { committedDueDate: '  ' }), /วันกำหนดส่ง/);
  assert.equal(acknowledgeRequestError(scent, { committedDueDate: '2569-08-20' }), null);

  // ⚠️ หัวข้อที่มีผู้ใช้จริงอยู่แล้ว (ขอราคา/สอบถาม) ต้องไม่ถูกบังคับ — บังคับทั้งระบบ
  // จะเปลี่ยนขั้นตอนของคนที่ใช้อยู่โดยไม่ได้ตกลงกัน
  for (const kind of ['price_pm', 'price_f', 'info', 'document', 'product_dev']) {
    assert.equal(acknowledgeRequestError({ kind, status: 'pending' }), null, kind);
  }
});

// ── เลื่อนวันกำหนดส่ง ────────────────────────────────────────────────────
test('⭐ เลื่อนวันกำหนดส่งได้หลังรับเรื่อง — แต่ต้องรับเรื่องก่อน', () => {
  // มติผู้ใช้ 2026-08-06: RD ขอให้แก้วันได้ เผื่อตอนรับเรื่องเลือกไปก่อนแล้วเจอของจริง
  const ack = { kind: 'scent_dev', status: 'acknowledged', acknowledgedAt: '2026-08-06T00:00:00Z', committedDueDate: '2026-08-20' };
  assert.equal(rescheduleRequestError(ack, { committedDueDate: '2026-08-27' }), null);

  // ⚠️ **ไม่ใช่ทางลัดของการรับเรื่อง** — ไม่งั้นจะผูกวันได้โดยข้ามด่านของ acknowledge
  assert.match(
    rescheduleRequestError({ kind: 'scent_dev', status: 'pending' }, { committedDueDate: '2026-08-27' }),
    /ยังไม่ได้รับเรื่อง/,
  );
});

test('เลื่อนวันต้องมีวันใหม่จริง และต้องไม่ใช่วันเดิม', () => {
  const ack = { kind: 'scent_dev', status: 'acknowledged', acknowledgedAt: '2026-08-06T00:00:00Z', committedDueDate: '2026-08-20' };
  // ⚠️ ล้างวันทิ้งไม่ได้ — "เลื่อน" ที่แปลว่าถอนคำสัญญาต้องไปยกเลิกใบ ไม่ใช่ล้างช่อง
  assert.match(rescheduleRequestError(ack), /ระบุวันกำหนดส่งใหม่/);
  assert.match(rescheduleRequestError(ack, { committedDueDate: '   ' }), /ระบุวันกำหนดส่งใหม่/);
  assert.match(rescheduleRequestError(ack, { committedDueDate: '20/08/2026' }), /ระบุวันกำหนดส่งใหม่/);
  // วันเดิม = ไม่มีอะไรเลื่อน · ปล่อยผ่านจะได้บรรทัดเธรด "20 → 20" ที่ไม่มีความหมาย
  assert.match(rescheduleRequestError(ack, { committedDueDate: '2026-08-20' }), /วันเดิม/);
});

test('ใบที่จบไปแล้วเลื่อนวันไม่ได้', () => {
  const base = { kind: 'scent_dev', acknowledgedAt: '2026-08-06T00:00:00Z', committedDueDate: '2026-08-20' };
  const next = { committedDueDate: '2026-08-27' };
  assert.match(rescheduleRequestError({ ...base, status: 'closed' }, next), /ปิดไปแล้ว/);
  assert.match(rescheduleRequestError({ ...base, status: 'cancelled' }, next), /ยกเลิกไปแล้ว/);
  // ⚠️ `answered` ก็เลื่อนไม่ได้ — ตอบไปแล้วจะเลื่อนวันส่งย้อนหลังไม่ได้
  assert.match(rescheduleRequestError({ ...base, status: 'answered' }, next), /ปิดไปแล้ว/);
});

// ── เดินครึ่งหลังของวง: RD ส่งกลิ่น → SA รับของ → ส่งลูกค้า → ลูกค้าตอบ → ใส่ราคา ──
//
// ⚠️ สามเทสต์นี้เกิดจากการ **เดินวงจริง** ไม่ใช่เดาจากโค้ด — ทั้งสามข้อ CI เขียวมาตลอด
// เพราะไม่มีใครเคยเดินถึงครึ่งหลัง
const flowRow = (over = {}) => ({
  id: 'DRI-1', requestId: 'DR-1', lineKind: 'scent_dev', label: 'A', briefId: 'BRF-1',
  answerStatus: 'pending', ackAt: '2026-08-01', readyAt: '2026-08-01',
  pickedUpAt: '2026-08-02', sentAt: '2026-08-03', ...over,
});

test('🐞 แถวที่ลูกค้าขอให้แก้ต้องนับว่าจบ — ไม่งั้นใบล็อกถาวรปิดไม่ได้', () => {
  // `hopPatch` จงใจไม่ปิด answerStatus ของแถวรอบแก้ (งานย้ายไปแถวใหม่ ไม่ใช่แถวนี้
  // ตอบเสร็จ) ⇒ ตัวนับที่อ่าน answerStatus ตรง ๆ จะได้ complete:false ตลอดกาล
  const revised = flowRow({ outcome: 'revise', outcomeAt: '2026-08-05', outcomeNote: 'ขอหวานขึ้น' });
  const priced = flowRow({ id: 'DRI-2', answerStatus: 'done' });
  assert.equal(requestProgress([revised, priced]).complete, true);
  assert.equal(deriveRequestStatusAfterAnswer([revised, priced], 'acknowledged'), 'answered');
});

test('🐞 แถวที่ยังเดินอยู่กลางทางต้องกันไม่ให้ปิดใบ — ทุกขั้น ไม่ใช่แค่ตอนยังไม่ตอบ', () => {
  // ห้าขั้นกลางทางไม่มีขั้นไหนแตะ answerStatus เลย ⇒ ด่านที่อ่าน answerStatus อย่างเดียว
  // มองไม่เห็นว่ายังมีของค้างอยู่ที่ลูกค้า
  for (const mid of [
    flowRow({ pickedUpAt: null, sentAt: null }),         // เสร็จแล้ว รอ SA ไปรับ
    flowRow({ sentAt: null }),                            // รับของแล้ว รอส่งลูกค้า
    flowRow(),                                            // ส่งลูกค้าแล้ว รอลูกค้าตอบ
    flowRow({ outcome: 'confirmed', outcomeAt: '2026-08-05', confirmedQty: 25 }), // รอใส่ราคา
  ]) {
    assert.match(closeRequestError(req({ kind: 'scent_dev', status: 'acknowledged' }), [mid]), /ยังเดินไม่จบ/);
  }
  // จบจริงแล้วค่อยปิดได้
  assert.equal(
    closeRequestError(req({ kind: 'scent_dev', status: 'acknowledged' }), [flowRow({ answerStatus: 'done' })]),
    null,
  );
});

test('🐞 ด่านปิดใบต้องดู "ใบนี้มีแถวไหม" ไม่ใช่ "ชนิดนี้สร้างแถวตอนเปิดไหม"', () => {
  // พัฒนากลิ่นมี hasItems:false (แถวเกิดตอน RD ส่งของ) ⇒ ด่านเดิมข้ามทั้งก้อน
  const open = req({ kind: 'scent_dev', status: 'acknowledged' });
  assert.match(closeRequestError(open, [flowRow()]), /ยังเดินไม่จบ/);
  // ยังไม่มีใครส่งอะไรมาเลย = ไม่มีแถวให้ค้าง ⇒ ผู้ขอปิดเองได้ (พฤติกรรมเดิม)
  assert.equal(closeRequestError(open, []), null);
});

test('🐞 แถวรอบแก้ต้องพาบรีฟตามไปด้วย — "กลิ่นย้อนกลับได้ว่ามาจากบรีฟไหน"', () => {
  const next = followUpRowFrom(flowRow({ outcome: 'revise' }), 2);
  assert.equal(next.briefId, 'BRF-1');
  assert.equal(next.derivedFromItemId, 'DRI-1');
  // ของที่เกิดขึ้นแล้วต้องไม่ตามไป — แถวใหม่เริ่มที่รอรับเรื่องอีกครั้ง
  assert.equal(next.answerStatus, 'pending');
  assert.equal(next.ackAt, undefined);
  assert.equal(next.outcome, undefined);
});
