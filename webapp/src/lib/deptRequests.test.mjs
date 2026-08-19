// คำร้องข้ามฝ่าย (mig 0173) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
// (ต่อยอดจาก materialAsks.test.mjs เดิม — เคสของเคสขอราคาต้องผ่านเหมือนเดิมทุกข้อ
//  เพราะผู้ใช้ที่ใช้อยู่ต้องไม่รู้สึกว่าอะไรเปลี่ยนหลังรวมระบบ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REQUEST_OPEN_STATUSES,
  acknowledgeRequestError,
  commitDueRequestError,
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
import { OUTCOME_REGISTRY_BY_KIND } from './requests/outcomes.js';
import { requestFormBlocker, requestPayload } from './master/requestCreate.js';
import {
  REQUEST_KIND_LIST,
  defaultRequestDept,
  deptForRequest,
  isRequestKind,
  kindsForDept,
  requestDeptError,
  requestNeeds,
  requestKindLabel,
  legacyKindError,
  requestNeedsRef,
  REQUEST_KINDS,
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
  id: 'DR-1', kind: 'formula_dev', dept: 'RD', status: 'acknowledged',
  requestedById: 'u-sale', ...over,
});

// ── ชนิดคำร้อง ───────────────────────────────────────────────────────────
test('🔴 ทุกหัวข้อต้องประกาศ scope เอง — ไม่มีค่าเดาจากฝ่ายแล้ว (ม-135)', () => {
  /* 🐞 เดิม `requestDocScope` เดา `RM-`/`PM-` จากฝ่ายเมื่อหัวข้อไม่ประกาศ (ซากจากยุค
     คำร้องขอราคาวัสดุ) ⇒ หัวข้อใหม่ที่ลืมใส่จะได้คำนำหน้าผิดเงียบ ๆ แล้ว **เลขที่ออกไป
     แล้วแก้ไม่ได้** เพราะ trigger ล็อก `docNo` ⇒ ถอดค่าเดาทิ้ง */
  for (const kind of Object.keys(REQUEST_KINDS)) {
    const scope = requestDocScope(kind);
    assert.ok(scope, `หัวข้อ ${kind} ต้องมี scope`);
    // รูปแบบเดียวกับที่ SQL ตรวจ (`next_request_running_no` · mig 0243)
    assert.match(scope, /^[A-Z]{2,4}$/, `scope ของ ${kind} ผิดรูปแบบ`);
  }
  // หัวข้อที่ไม่มีในทะเบียน = ไม่มี scope ให้เดา (เดิมคืน 'RM')
  assert.equal(requestDocScope('ไม่มีหัวข้อนี้'), null);
});

test('เลขที่: SB- · FD- · DC- · DF- แยกกัน · RQ- เหลือของสอบถาม', () => {
  // ⚠️ `RM`/`PM` หายไปกับหัวข้อขอราคา (0219 · ม-28) · `MU`/`scent_brief` หายไปกับ
  // หัวข้อเก่าของ RD (0220) ⇒ เหลือสาม scope ที่มีหัวข้อจริงใช้อยู่
  assert.equal(requestDocScope('scent_dev'), 'SB');
  assert.equal(requestDocScope('formula_dev'), 'FD');
  assert.equal(requestDocScope('info'), 'RQ');
  // ⭐ แยกจากสอบถาม (มติผู้ใช้ 2026-08-18) — เดิมทั้งคู่เป็น RQ- จนแยกไม่ออกในคิว
  assert.equal(requestDocScope('document'), 'DC');
  // ⚠️ ขอเอกสารสองสายใช้คนละ scope โดยตั้งใจ — ตัวนับแยกของใครของมัน (ม-135)
  assert.equal(requestDocScope('billing_doc'), 'DF');
  assert.equal(requestDocScope('material_eta'), 'RQ');
});

test('ฝ่ายผู้ตอบ: หัวข้อที่ล็อกไว้ใช้ค่านั้น · ที่ไม่ล็อกให้ผู้ขอเลือก', () => {
  assert.equal(deptForRequest('scent_dev'), 'RD');
  assert.equal(deptForRequest('formula_dev'), 'RD');
  assert.equal(deptForRequest('material_eta'), 'PC');
  // สอบถาม/ขอเอกสารไม่ล็อกฝ่าย — ผู้ขอเลือกเอง แต่ต้องเป็นฝ่ายที่รับคำร้องได้
  assert.equal(deptForRequest('info', { dept: 'RD' }), 'RD');
  assert.equal(deptForRequest('info', { dept: 'SA' }), null);
  // ⚠️ เดิมมีสาขาอนุมานฝ่ายจากชนิดวัสดุของบรรทัดแรก — ถอดพร้อมบรรทัดวัสดุ (ม-28)
  assert.equal(deptForRequest('info', {}), null);
});

test('ชนิดที่มีบรรทัด = พัฒนาสูตร · ขอเอกสาร', () => {
  assert.equal(requestHasItems('formula_dev'), true);
  assert.equal(requestHasItems('document'), true);
  assert.equal(requestHasItems('scent_dev'), false);   // แถวเกิดตอน RD ส่ง
  assert.equal(requestHasItems('info'), false);
});

test('สิ่งที่ต้องผูกต่างกันตามหัวข้อ (มติ 2026-08-03 รอบสอง · ม-40)', () => {
  //   พัฒนากลิ่น = ผูก SO (ค่าบริการ — ยืนยันกับ SCENT_TEMPLATE ขั้น 4 → 6)
  //   พัฒนาสูตร  = ผูกโครงการ+ดีล **ไม่ต้องมี SO** (ม-40: ขอตัวอย่างจากกลิ่นที่มีอยู่)
  assert.deepEqual(requestNeeds('scent_dev'), ['salesOrder']);
  assert.deepEqual(requestNeeds('formula_dev'), ['project', 'deal']);
  assert.deepEqual(requestNeeds('info'), ['project', 'deal']);
  assert.equal(requestNeedsRef('formula_dev', 'salesOrder'), false, 'พัฒนาสูตรต้องไม่บังคับ SO');
});

test('ด่านตอนสร้าง: พัฒนากลิ่นส่งไม่ได้ถ้าไม่มี SO · พัฒนาสูตรขอแค่โครงการ+ดีล', () => {
  // ไม่มี SO = ตก และข้อความต้องบอกเหตุผล (ค่าบริการ) ไม่ใช่แค่ "ต้องเลือก"
  assert.match(requestShapeError('scent_dev', { title: 'บรีฟ' }), /ใบสั่งขาย/);
  assert.equal(requestShapeError('scent_dev', {
    title: 'บรีฟ', salesOrderId: 'SO-1', requestedDueDate: '2569-08-20',
  }), null);
  const dev = {
    title: 'ขอตัวอย่างเทียนหอม', projectId: 'PRJ-1', dealId: 'D-1',
    requestedDueDate: '2569-08-20',
    items: [{ categoryCode: '01-002', scentId: 'SCT-1' }],
  };
  assert.equal(requestShapeError('formula_dev', dev), null);
  // ⚠️ **โครงการมาจากดีล** — ไม่มี projectId แต่มีดีลถือว่าผ่านด่านนี้ แล้วไปตกที่
  // handler ถ้าดีลนั้นไม่ผูกโครงการจริง (ข้อความละเอียดกว่า) · ตกที่นี่เมื่อไม่มีทั้งคู่
  // และตอนไม่มีทั้งคู่ต้องบอก **ดีล** ซึ่งเป็นช่องที่กดได้จริง (ช่องโครงการบนจอ
  // เป็นช่องอ่านอย่างเดียว "เติมจากดีลที่เลือก")
  assert.equal(requestShapeError('formula_dev', { ...dev, projectId: '' }), null);
  assert.match(requestShapeError('formula_dev', { ...dev, projectId: '', dealId: '' }), /ดีล/);
});

test('ด่านตอนสร้าง: ขอเอกสารการเงินถามใบเสนอราคาก่อน แล้วยอด แล้วค่อยชื่อเรื่อง', () => {
  // ⚠️ ลำดับสำคัญ — ทั้งใบเสนอราคาและยอดอยู่แท็บ "งาน" ส่วนชื่อเรื่องอยู่แท็บถัดไป
  // ตอบชื่อเรื่องก่อนแปลว่าผู้ใช้ถูกส่งไปแก้ผิดแท็บ
  assert.match(requestShapeError('billing_doc', {}), /ต้องเลือกใบเสนอราคา/);
  assert.match(requestShapeError('billing_doc', { quotationId: 'QT-1' }), /ต้องระบุยอดที่ขอวางบิล/);
  assert.match(
    requestShapeError('billing_doc', { quotationId: 'QT-1', billAmount: 90508.125 }),
    /ชื่อเรื่อง/,
  );
  // ⚠️ ยอด 0 หรือติดลบไม่นับว่ากรอกแล้ว
  for (const billAmount of [0, -1, null, '']) {
    assert.match(
      requestShapeError('billing_doc', { quotationId: 'QT-1', billAmount }),
      /ต้องระบุยอดที่ขอวางบิล/,
    );
  }
  // ⚠️ หัวข้ออื่นต้องไม่โดนด่านยอดติดมาด้วย
  assert.match(requestShapeError('info', { dealId: 'D1', projectId: 'P1' }), /ชื่อเรื่อง/);
});

test('ด่านตอนสร้าง: ชื่อเรื่องบังคับทุกหัวข้อ รวมหัวข้อที่มีบรรทัด', () => {
  // หัวข้อที่มีบรรทัดสื่อความด้วยแถว แต่บนคิวรวมและในเธรดดีล แถวมองไม่เห็น
  assert.match(requestShapeError('formula_dev', {
    projectId: 'P1', dealId: 'D1', items: [{ categoryCode: '01-002', scentId: 'SCT-1' }],
  }), /ชื่อเรื่อง/);
  assert.match(requestShapeError('info', { projectId: 'P1', dealId: 'D1' }), /ชื่อเรื่อง/);
});

test('ฝ่ายที่เลือกต้องเข้ากับหัวข้อ — ไม่ override เงียบ ๆ', () => {
  assert.equal(requestDeptError('scent_dev', 'RD'), null);
  // ⭐ ขอเอกสารล็อกที่ RD แล้ว (มติผู้ใช้ 2026-08-08) — เดิมส่งถึงฝ่ายไหนก็ได้
  assert.equal(requestDeptError('document', 'RD'), null);
  // ⭐ FN เปิดแล้ว (ม-ก) — หัวข้อของบัญชีส่งถึงบัญชีได้
  assert.equal(requestDeptError('billing_doc', 'FN'), null);
  // ⚠️ ฝ่ายที่ปิดเก็บไว้ก่อน (PC) ตกที่ด่านแรก — "ต้องระบุฝ่าย" ไม่ใช่ "เป็นงานของ
  // ฝ่าย RD" เพราะมันไม่ใช่ฝ่ายที่เปิดใบได้เลย ไม่ใช่แค่ฝ่ายผิด
  assert.match(requestDeptError('scent_dev', 'PC'), /ต้องระบุฝ่าย/);
  // ⚠️ ฝ่ายที่เปิดแล้วแต่ **ผิดหัวข้อ** ต้องได้ข้อความที่บอกฝ่ายที่ถูก ไม่ใช่ "ต้องระบุฝ่าย"
  // ซึ่งอ่านเหมือนยังไม่ได้เลือกทั้งที่เลือกแล้ว
  assert.match(requestDeptError('document', 'FN'), /เป็นงานของฝ่าย RD/);
  assert.match(requestDeptError('billing_doc', 'RD'), /เป็นงานของฝ่าย FN/);
  // หัวข้อที่ไม่ล็อกฝ่ายยังต้องเลือกฝ่ายเสมอ
  assert.equal(requestDeptError('info', 'RD'), null);
  assert.match(requestDeptError('info', ''), /ต้องระบุฝ่าย/);
  assert.match(requestDeptError('info', 'PD'), /ต้องระบุฝ่าย/);
});

/* 🐞 **ลิงก์ที่เติมหัวข้อมาให้ต้องได้ฝ่ายมาด้วย** (เจอตอน UAT ของ B-5)
   เดิมฟอร์มพึ่ง "มีฝ่ายเดียวก็เลือกให้เลย" ล้วน ⇒ พอ B-1 เปิด FN เป็นฝ่ายที่สอง
   ลิงก์เติมค่าทุกอันพังพร้อมกัน รวม "เปิดคำร้องพัฒนากลิ่น" จากหน้าใบสั่งขาย:
   ฟอร์มกางครบ กรอกได้หมด แต่ปุ่มบันทึกค้างที่ "เลือกฝ่ายและหัวข้อก่อน" */
test('ฝ่ายตั้งต้นมาจากหัวข้อที่ล็อกฝ่ายไว้ ไม่ต้องให้ลิงก์ส่งมา', () => {
  assert.equal(defaultRequestDept('billing_doc'), 'FN');
  assert.equal(defaultRequestDept('scent_dev'), 'RD');
  assert.equal(defaultRequestDept('document'), 'RD');
  // ⚠️ หัวข้อของกลางห้ามเดาให้ — เดาเมื่อไรใบไปโผล่คิวฝ่ายที่ผู้ขอไม่ได้ตั้งใจส่งถึง
  assert.equal(defaultRequestDept('info'), '');
  assert.equal(defaultRequestDept(''), '');
  assert.equal(defaultRequestDept('ไม่มีหัวข้อนี้'), '');
});

test('หัวข้อถูกกรองด้วยฝ่าย — ฟอร์มถามฝ่ายก่อนหัวข้อ (มติ 2026-08-03)', () => {
  const rd = kindsForDept('RD');
  // ⚠️ PC ยังปิดเก็บไว้ (ม-87) ⇒ ลิสต์ว่าง · FN เปิดแล้ว (ม-ก) ⇒ ต้องมีหัวข้อของตัวเอง
  const pc = kindsForDept('PC');
  const fn = kindsForDept('FN');
  assert.ok(rd.includes('scent_dev') && rd.includes('formula_dev'));
  assert.ok(!rd.includes('material_eta'));
  assert.deepEqual(pc, []);
  assert.ok(fn.includes('billing_doc'));
  // ⚠️ หัวข้อของกลาง (`info`) อยู่ทุกฝ่ายที่เปิด — แต่หัวข้อที่ล็อกฝ่ายห้ามข้ามฝ่าย
  assert.ok(!fn.includes('document') && !rd.includes('billing_doc'));
  // ⚠️ ม-28: หัวข้อขอราคาไม่มีอยู่ในทะเบียนอีกแล้ว ไม่ใช่แค่ซ่อนจากลิสต์
  for (const gone of ['price_f', 'price_fb', 'price_pm']) {
    assert.equal(isRequestKind(gone), false, `${gone} ต้องหายจากทะเบียนทั้งตัว`);
  }

  // ⭐ หัวข้อที่เลิกใช้แล้วต้องหายจากลิสต์ "เปิดใบใหม่" ของทุกฝ่าย…
  // ⭐ `scent_brief` · `mockup` ถูกลบทั้งหัวข้อใน 0220 — เหตุผลที่เคยเก็บไว้คือ
  // "ใบเก่าต้องมีป้ายชื่ออ่านได้" ซึ่งหมดอายุแล้วเพราะทั้งคู่มี 0 แถวบน prod
  for (const gone of ['scent_brief', 'mockup']) {
    assert.equal(isRequestKind(gone), false, `${gone} ต้องหายจากทะเบียน`);
  }
  // ⭐ กลไก `legacy` ยังอยู่ให้หัวข้อที่จะเลิกใช้ในอนาคต — แค่ไม่มีสมาชิกวันนี้
  assert.equal(legacyKindError('scent_dev'), null);
  // หัวข้อที่ RD ต้องมีครบ — `document` ล็อกมาที่ RD แล้ว (ม-87)
  for (const kind of ['info', 'document']) {
    assert.ok(rd.includes(kind), `${kind} ต้องอยู่ในลิสต์ของ RD`);
  }
  assert.deepEqual(kindsForDept('PD'), []);
});

test('หมุดไทม์ไลน์ตรงกับขั้นจริงใน lib/pm/templates.js (มติ 3 + 6)', () => {
  assert.equal(requestStepKey('scent_dev'), 'scent-06');     // ออกแบบกลิ่น
  assert.equal(requestStepKey('formula_dev'), 'npd-15');     // ขึ้นตัวอย่าง
  assert.equal(requestStepKey('material_eta'), 'npd-38');    // กำหนดของเข้า
  assert.equal(requestStepKey('info'), null);
});

test('ด่านตอนสร้าง: หัวข้อที่มีบรรทัดต้องมีรายการ', () => {
  const doc = {
    projectId: 'P1', dealId: 'D1', title: 'ขอ COA', requestedDueDate: '2569-08-20',
  };
  assert.match(requestShapeError('document', doc), /อย่างน้อย 1 รายการ/);
  assert.equal(requestShapeError('document', { ...doc, items: [{ docType: 'coa' }] }), null);
  assert.equal(requestShapeError('info', {
    projectId: 'P1', dealId: 'D1', title: 'ขอสเปกขวด', requestedDueDate: '2569-08-20',
  }), null);
});

test('ชนิดที่ไม่รู้จักถูกปฏิเสธ (client ส่ง kind มั่วไม่ได้)', () => {
  assert.equal(isRequestKind('formula_dev'), true);
  assert.equal(isRequestKind('อะไรก็ไม่รู้'), false);
  assert.match(requestShapeError('อะไรก็ไม่รู้', { title: 'x' }), /ชนิดคำร้อง/);
});

// ── ความคืบหน้า/สถานะ ───────────────────────────────────────────────────
test('ตอบครบทุกรายการ → answered เอง (ชนิดที่มีบรรทัด)', () => {
  const items = [{ answerStatus: 'done' }, { answerStatus: 'declined' }];
  assert.deepEqual(requestProgress(items), { done: 2, total: 2, complete: true });
  assert.equal(deriveRequestStatusAfterAnswer(items, 'acknowledged'), 'answered');
  assert.equal(deriveRequestStatusAfterAnswer([{ answerStatus: 'pending' }], 'acknowledged'), 'acknowledged');
});

/* ── ส่งของเพิ่มหลังใบขึ้น "ตอบแล้ว" (ผลตรวจ 2026-08-18) ────────────────────
   🐞 `answered` เป็นสถานะที่ระบบ **derive เอง** เมื่อทุกแถวเดินจบ ไม่ใช่คำประกาศของ
   ฝ่ายว่างานจบ ⇒ พัฒนากลิ่นที่ RD ส่ง 2 กลิ่น · ลูกค้าคอนเฟิร์ม 1 ปฏิเสธ 1 จะกลาย
   เป็น answered ทันที แล้ว POST /items ปฏิเสธเพราะสถานะไม่อยู่ในชุด "ใบเปิดอยู่"
   ⇒ RD ส่งกลิ่นตัวใหม่ไม่ได้อีกเลย · ที่นี่ล็อกครึ่งหลังของทางแก้: เพิ่มแถวแล้ว
   สถานะต้องถอยกลับเอง ไม่ค้างเป็น "ตอบแล้ว" ทั้งที่มีแถวใหม่รอเดิน */
test('เพิ่มแถวใหม่ในใบที่ตอบแล้ว → สถานะถอยกลับเป็น acknowledged', () => {
  const settled = [{ answerStatus: 'done' }, { answerStatus: 'declined' }];
  assert.equal(deriveRequestStatusAfterAnswer(settled, 'acknowledged'), 'answered');
  assert.equal(
    deriveRequestStatusAfterAnswer([...settled, { answerStatus: 'pending' }], 'answered'),
    'acknowledged',
  );
});

test('ยกเลิก/ปิดแล้ว สถานะไม่ถูก derive ทับ', () => {
  const items = [{ answerStatus: 'done' }];
  assert.equal(deriveRequestStatusAfterAnswer(items, 'cancelled'), 'cancelled');
  assert.equal(deriveRequestStatusAfterAnswer(items, 'closed'), 'closed');
});

// ── ด่าน action ──────────────────────────────────────────────────────────
test('ชนิดที่ไม่มีบรรทัดส่งได้โดยไม่ต้องมีรายการ', () => {
  assert.equal(submitRequestError(
    req({ kind: 'info', status: 'draft', requestedDueDate: '2569-08-20' }), [],
  ), null);
  // ⭐ ร่างเก่าที่ไม่มีวันที่ต้องการรับงาน (เกิดก่อนมติ 2026-08-08) ต้องไม่หลุดตอนกดส่ง
  assert.match(submitRequestError(req({ kind: 'info', status: 'draft' }), []), /วันที่ต้องการรับงาน/);
  assert.match(submitRequestError(req({ kind: 'formula_dev', status: 'draft' }), []), /อย่างน้อย 1 รายการ/);
});

test('ปิดเรื่อง: ใบที่มีแถวต้องจบครบ · ใบที่ไม่มีแถวผู้ขอตัดสินเอง', () => {
  assert.match(closeRequestError(req({ kind: 'formula_dev' }), [{ answerStatus: 'pending' }]), /ยังเดินไม่จบ/);
  assert.equal(closeRequestError(req({ kind: 'formula_dev' }), [{ answerStatus: 'done' }]), null);
  // สอบถามที่รับเรื่องแล้ว ผู้ขอปิดเองได้แม้ยังไม่ answered
  assert.equal(closeRequestError(req({ kind: 'info', status: 'acknowledged' }), []), null);
  // แต่ที่ยังไม่มีใครรับเลย ให้ยกเลิกแทน (ปิดทั้งที่ไม่มีใครแตะ = ซ่อนงานที่ไม่ได้ทำ)
  assert.match(closeRequestError(req({ kind: 'info', status: 'pending' }), []), /ยกเลิกแทน/);
});

test('⭐ ปิดใบไม่ได้จนลูกค้าคอนเฟิร์มครบตามจำนวนใน SO (มติผู้ใช้ 2026-08-18)', () => {
  // SO สั่ง 3 · ส่งไป 1 · ลูกค้าคอนเฟิร์ม 1 ⇒ ทุกแถวจบแล้วก็จริง แต่ของยังขาด 2
  const so = { salesOrderLines: [{ qty: 3 }] };
  const oneConfirmed = [{ answerStatus: 'done', outcome: 'confirmed', confirmedQty: 1 }];
  assert.match(
    closeRequestError(req({ kind: 'scent_dev', status: 'acknowledged', ...so }), oneConfirmed),
    /คอนเฟิร์ม 1 จาก 3/,
  );
  // ครบตามจำนวน ⇒ ปิดได้
  assert.equal(
    closeRequestError(req({ kind: 'scent_dev', status: 'acknowledged', ...so }),
      [{ answerStatus: 'done', outcome: 'confirmed', confirmedQty: 3 }]),
    null,
  );
  // ส่งเกิน (แถมให้ลูกค้าเลือก) ไม่ใช่เหตุให้ปิดไม่ได้ — มติเดิม "เกินได้จริง"
  assert.equal(
    closeRequestError(req({ kind: 'scent_dev', status: 'acknowledged', ...so }),
      [{ answerStatus: 'done', outcome: 'confirmed', confirmedQty: 4 }]),
    null,
  );
  // ⚠️ ลูกค้าไม่เอาสักตัว = ปิดไม่ได้โดยตั้งใจ ทางออกคือยกเลิก
  assert.match(
    closeRequestError(req({ kind: 'scent_dev', status: 'acknowledged', ...so }),
      [{ answerStatus: 'declined', outcome: 'rejected' }]),
    /ยกเลิกใบ/,
  );
  // ใบที่ไม่ผูก SO (พัฒนาสูตร/ขอเอกสาร) ไม่มีอะไรให้เทียบ ⇒ ด่านเดิมล้วน
  assert.equal(closeRequestError(req({ kind: 'formula_dev' }), [{ answerStatus: 'done' }]), null);
});

test('🐞 ปิดร่างที่ยังไม่ส่งไม่ได้ — ปิดแล้วลบไม่ได้ตลอดกาล (รอบ 12 · ค-1)', () => {
  // `deleteRequestError` บังคับ `status === 'draft'` ⇒ ร่างที่ถูกปิดจะลบไม่ได้อีกเลย
  // ทางออกเหลือแค่ RPC ของ service role · ยิงได้ทาง API เท่านั้น (ปุ่มบนจอไม่โผล่)
  // แต่ API คือขอบเขต ไม่ใช่ปุ่ม
  assert.match(closeRequestError(req({ kind: 'info', status: 'draft' }), []), /ร่างที่ยังไม่ส่ง/);
  assert.match(closeRequestError(req({ kind: 'formula_dev', status: 'draft' }), []), /ร่างที่ยังไม่ส่ง/);
  // ทางที่ถูกยังเปิดอยู่ทั้งสองทาง — ลบร่าง หรือยกเลิกใบ
  assert.equal(deleteRequestError(req({ status: 'draft', submittedAt: null })), null);
  assert.equal(cancelRequestError(req({ status: 'draft' })), null);
});

test('รับเรื่องได้ครั้งเดียว และต้องส่งก่อน', () => {
  // ⚠️ ใบตัวอย่างกลางเป็น `formula_dev` ซึ่งบังคับวันกำหนดส่ง (Q39) ⇒ ส่งวันมาด้วย
  // ไม่งั้นเทสต์นี้จะวัดด่านวันที่แทนที่จะวัดด่านสถานะ
  const due = { committedDueDate: '2569-08-20' };
  assert.match(acknowledgeRequestError(req({ status: 'draft' }), due), /ยังไม่ถูกส่ง/);
  assert.equal(acknowledgeRequestError(req({ status: 'pending' }), due), null);
  assert.match(acknowledgeRequestError(req({ status: 'acknowledged' }), due), /รับเรื่องไปแล้ว/);
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
  assert.equal(requestSummaryText(req({ kind: 'formula_dev' }), [{}, {}]), 'พัฒนาสูตร · 2 รายการ');
  assert.equal(requestSummaryText(req({ kind: 'scent_dev' })), 'พัฒนากลิ่น');
});

// ── หมุดไทม์ไลน์ ─────────────────────────────────────────────────────────
const pinReq = (over = {}) => ({
  id: 'DR-1', kind: 'formula_dev', status: 'pending', stepKey: 'npd-15',
  projectId: 'PRJ-1', dealId: 'D-1', createdAt: '2026-07-01T00:00:00Z', ...over,
});

test('หมุด: จัดกลุ่มตาม stepKey และไม่นับคำร้องที่ไม่มี stepKey', () => {
  const byStep = requestsByStepKey([
    pinReq({ id: 'A', stepKey: 'npd-15' }),
    pinReq({ id: 'B', stepKey: 'npd-25', kind: 'material_eta' }),
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

// ── ผลลัพธ์ตอนปิดเรื่อง ───────────────────────────────────────────────────
//
// ⭐ **ทะเบียนผลลัพธ์ว่างแล้ว** — สมาชิกตัวเดียวคือ `scent_brief` ที่ถูกลบใน 0220 ·
// ในโมเดลใหม่กลิ่นเข้าทะเบียนตอน RD กดส่ง ไม่ใช่ตอนปิดเรื่อง ⇒ ไม่มีหัวข้อไหน
// ต้องถามผลลัพธ์ตอนปิด · กลไกอยู่ต่อในฐานะตาข่ายสำหรับหัวข้อในอนาคต
test('ทุกหัวข้อวันนี้ปิดได้เลยไม่ต้องถามผลลัพธ์', () => {
  for (const kind of REQUEST_KIND_LIST) {
    assert.equal(requestNeedsOutcome(kind), false, kind);
    assert.equal(closeOutcomeError({ kind }, undefined), null, kind);
  }
});

// ⭐ **กฎข้างในตาข่ายยังต้องถูกทดสอบ ทั้งที่ไม่มีหัวข้อไหนเรียกมันวันนี้** — ถ้าปล่อย
// ให้ไม่มีเทสต์เลย วันที่มีหัวข้อใหม่มาลงทะเบียน กฎพวกนี้จะไม่เคยถูกรันมาก่อนเลย
// ⇒ ลงทะเบียนหัวข้อสมมุติชั่วคราวเพื่อเปิดด่าน แล้วถอนออกท้ายบล็อก
const outcomeKind = '__test_outcome';
const brief = (over = {}) => ({
  id: 'DR-9', kind: outcomeKind, status: 'answered',
  customerId: 'CUS-1', customerName: 'ลูกค้า A', dealId: 'D-1', scentId: null, ...over,
});

test('กฎของผลลัพธ์ตอนปิดเรื่อง (ตาข่ายที่ยังไม่มีหัวข้อไหนใช้)', (t) => {
  OUTCOME_REGISTRY_BY_KIND[outcomeKind] = 'scent';
  t.after(() => { delete OUTCOME_REGISTRY_BY_KIND[outcomeKind]; });

  // ผูกกลิ่นไว้แล้วไม่ต้องถามซ้ำ
  assert.equal(closeOutcomeError(brief({ scentId: 'SCT-1' }), undefined), null);
  // ไม่ระบุอะไรเลย = ตก
  assert.equal(closeOutcomeError(brief(), undefined), 'ต้องระบุว่าบรีฟนี้ได้กลิ่นตัวไหน');
  // "ไม่ได้กลิ่น" เป็นคำตอบที่ถูกต้อง — ของที่ลูกค้าไม่เอาต้องปิดได้
  assert.equal(closeOutcomeError(brief(), { mode: 'none' }), null);
  // ผูกกลิ่นเดิมต้องเลือกตัวจริง · สร้างใหม่ต้องมีชื่อ
  assert.equal(closeOutcomeError(brief(), { mode: 'link' }), 'ต้องเลือกกลิ่นจากทะเบียน');
  assert.equal(closeOutcomeError(brief(), { mode: 'link', scentId: 'SCT-1' }), null);
  assert.equal(closeOutcomeError(brief(), { mode: 'create', scentName: '  ' }), 'ต้องระบุชื่อกลิ่นที่จะเพิ่มเข้าทะเบียน');
  assert.equal(closeOutcomeError(brief(), { mode: 'create', scentName: 'Well sleep' }), null);
  assert.equal(closeOutcomeError(brief(), { mode: 'create', scentName: 'x'.repeat(201) }), 'ชื่อกลิ่นยาวเกิน 200 ตัวอักษร');
  // กลิ่นผูกลูกค้าเสมอ (มติ 9) — ใบที่ไม่มีลูกค้าสร้างกลิ่นใหม่ไม่ได้
  assert.equal(
    closeOutcomeError(brief({ customerId: null }), { mode: 'create', scentName: 'Well sleep' }),
    'คำร้องนี้ไม่มีลูกค้า จึงเพิ่มกลิ่นเข้าทะเบียนไม่ได้',
  );
  assert.equal(closeOutcomeError(brief({ customerId: null }), { mode: 'none' }), null);
});

// ── ด่านฝั่งจอ: ปุ่มส่งกับข้อความต้องพูดตรงกันเสมอ ──────────────────────
test('requestFormBlocker: ปุ่มส่งกับข้อความเหตุผลใช้ตัวเดียวกัน', () => {
  const base = {
    dept: 'RD', kind: 'formula_dev', title: 'ขอตัวอย่างเทียนหอม',
    projectId: 'PRJ-1', dealId: 'D-1', requestedDueDate: '2569-08-20',
    items: [{ categoryCode: '01-002', scentId: 'SCT-1' }],
  };
  assert.equal(requestFormBlocker(base), null);

  // ยังไม่เลือกฝ่าย/หัวข้อ = ข้อความแรกสุด ไม่ใช่ "ชนิดคำร้องไม่ถูกต้อง" ที่อ่านไม่รู้เรื่อง
  assert.match(requestFormBlocker({ ...base, kind: '', dept: '' }), /เลือกฝ่ายและหัวข้อ/);
  assert.match(requestFormBlocker({ ...base, dept: '' }), /เลือกฝ่ายและหัวข้อ/);
  assert.match(requestFormBlocker({ ...base, title: '' }), /ชื่อเรื่อง/);
  assert.equal(requestFormBlocker(null), 'ยังไม่มีข้อมูล');

  // หัวข้อที่ผูกของ ต้องได้ข้อความของ "ของที่ขาด" ตัวนั้น ไม่ใช่ข้อความรวม ๆ
  const brief = {
    dept: 'RD', kind: 'scent_dev', title: 'บรีฟกลิ่นชุดใหม่', requestedDueDate: '2569-08-20',
  };
  assert.match(requestFormBlocker(brief), /ใบสั่งขาย/);
  assert.equal(requestFormBlocker({ ...brief, salesOrderId: 'SO-1' }), null);
  // ⭐ วันที่ต้องการรับงานบังคับทุกหัวข้อ (มติผู้ใช้ 2026-08-08 · คำใหม่ 2026-08-19)
  assert.match(requestFormBlocker({ ...base, requestedDueDate: '' }), /วันที่ต้องการรับงาน/);
  assert.match(requestFormBlocker({ ...base, dealId: '' }), /ดีล/);
});

// 🐞 บั๊กที่ปิดใน ม-28: payload เคย map ทุกแถวเป็นโครงของบรรทัด*วัสดุ* ⇒ หมวด/กลิ่น
// ของพัฒนาสูตร และชนิดเอกสารของขอเอกสาร หายระหว่างทาง แล้ว server ตีกลับว่า
// "ต้องเลือกหมวดสินค้า" ทั้งที่ผู้ใช้เลือกแล้ว ⇒ สองหัวข้อนั้นเปิดใบไม่ได้เลย
test('🐞 payload ส่งแถวตามรูปร่างของหัวข้อ ไม่ตีความใหม่เป็นบรรทัดวัสดุ', () => {
  const dev = requestPayload({
    dept: 'RD', kind: 'formula_dev', title: 'ขอตัวอย่าง', dealId: 'D-1',
    items: [{ categoryCode: '01-002', scentId: 'SCT-1', qty: 3, unit: 'ชิ้น' }],
  });
  assert.equal(dev.items[0].categoryCode, '01-002');
  assert.equal(dev.items[0].scentId, 'SCT-1');

  const doc = requestPayload({
    dept: 'RD', kind: 'document', title: 'ขอ COA', dealId: 'D-1',
    items: [{ docType: 'coa', spec: 'ล็อตเดือนนี้' }],
  });
  assert.equal(doc.items[0].docType, 'coa');
});

test('requestPayload: ไม่ส่งของที่ server ตัดสินเอง และไม่ส่ง items ให้หัวข้อที่ไม่มีบรรทัด', () => {
  const form = {
    projectId: 'PRJ-1', dealId: 'D-1', dept: 'RD', kind: 'info',
    title: 'สอบถามโทนกลิ่น', body: 'โทนไม้', urgent: true,
    items: [{ categoryCode: '01-002', scentId: 'SCT-1' }],
    files: [], mentions: [{ id: 'u-1', name: 'ก' }],
  };
  const p = requestPayload(form);
  assert.equal('items' in p, false, 'หัวข้อที่ไม่มีบรรทัดต้องไม่ส่ง items');
  // projectId/customerId/customerName เป็นของ server (ดึงจากแถวดีล) · note เลิกใช้
  for (const banned of ['projectId', 'customerId', 'customerName', 'note']) {
    assert.equal(banned in p, false, `payload ต้องไม่มี ${banned}`);
  }
  assert.equal(p.dealId, 'D-1');
  assert.equal(p.title, 'สอบถามโทนกลิ่น');
  // หัวข้อที่มีบรรทัดต้องส่ง items ตามรูปร่างของหัวข้อนั้น
  const dev = requestPayload({ ...form, kind: 'formula_dev' });
  assert.equal(dev.items.length, 1);
  assert.equal(dev.items[0].scentId, 'SCT-1');
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
  assert.notEqual(requestKindFamily('scent_dev'), requestKindFamily('info'));
});

test('requestStepLabel อ่านชื่อขั้นจากแม่แบบ ไม่ใช่ข้อความที่ก๊อปมาเก็บ', () => {
  // 'scent-06' → SCENT_TEMPLATE ขั้น 6 = "ออกแบบกลิ่น" · แก้ชื่อขั้นในแม่แบบแล้ว
  // ป้ายในฟอร์มต้องเปลี่ยนตามเอง
  assert.equal(requestStepLabel('scent_dev'), 'ออกแบบกลิ่น (SCENT 6)');
  assert.equal(requestStepKey('formula_dev'), 'npd-15');
  assert.ok(requestStepLabel('formula_dev')?.includes('(NPD 15)'));
  // หัวข้อที่ไม่ปักหมุดขั้นไหนต้องคืน null — ห้ามเดาขั้นให้
  assert.equal(requestStepLabel('info'), null);
  assert.equal(requestStepLabel('ไม่มีหัวข้อนี้'), null);
});

/* ⭐ **รับเรื่อง = ตัดรอบ · แจ้งกำหนดส่ง = ก้าวที่สอง** (มติผู้ใช้ 2026-08-19) —
   ทับมติ 2026-08-08 ที่บังคับวันตอนกดรับเรื่องทุกหัวข้อ
   🐞 เหตุผลที่มติเดิมพัง: ฝ่ายรับเรื่องบ่อยครั้งยังตอบวันไม่ได้จริง (รอวัตถุดิบ ·
   รอฝ่ายอื่น) ⇒ เดาวันไปก่อนแล้วเลื่อนทีหลัง หรือไม่กดรับเลย — แย่ทั้งคู่
   ⚠️ **วันยังบังคับอยู่ แค่ย้ายก้าว** — ใบที่ยังไม่แจ้งวันขึ้นสถานะ "รอกำหนดส่ง"
   ซึ่งคิว/ราง/ป้ายทวงให้เห็น (ดู `requestAwaitingDue`) */
test('⭐ รับเรื่องไม่ต้องมีวันกำหนดส่ง — วันย้ายไปก้าว "แจ้งกำหนดส่ง" (มติผู้ใช้ 2026-08-19)', () => {
  for (const kind of ['scent_dev', 'formula_dev', 'info', 'document', 'material_eta']) {
    assert.equal(acknowledgeRequestError({ kind, status: 'pending' }), null, kind);
  }

  const acked = { kind: 'scent_dev', status: 'acknowledged', acknowledgedAt: '2026-08-19T00:00:00Z' };
  // ยังไม่รับเรื่อง = ยังไม่มีสิทธิ์รับปากวัน
  assert.match(
    commitDueRequestError({ kind: 'scent_dev', status: 'pending' }, { committedDueDate: '2026-08-25' }),
    /ยังไม่ได้รับเรื่อง/,
  );
  assert.match(commitDueRequestError(acked), /ต้องระบุวันกำหนดส่ง/);
  assert.match(commitDueRequestError(acked, { committedDueDate: '25/08/2026' }), /ต้องระบุวันกำหนดส่ง/);
  assert.equal(commitDueRequestError(acked, { committedDueDate: '2026-08-25' }), null);
  // ⚠️ ครั้งแรกเท่านั้น — แจ้งไปแล้วต้องไปทาง `reschedule` ที่ลงเธรดว่าเลื่อนจาก/เป็น
  assert.match(
    commitDueRequestError({ ...acked, committedDueDate: '2026-08-25' }, { committedDueDate: '2026-08-27' }),
    /แจ้งกำหนดส่งไปแล้ว/,
  );
  // และทางกลับกัน: ใบที่ยังไม่เคยแจ้งวัน เลื่อนไม่ได้ (ไม่มีคำสัญญาให้เลื่อน)
  assert.match(rescheduleRequestError(acked, { committedDueDate: '2026-08-27' }), /ยังไม่ได้แจ้งกำหนดส่ง/);
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
});

/* ⚠️ **กลับมติเดิม** (2026-08-17) — เทสต์ข้อนี้เคยยืนยันว่า `scent_dev` ที่ยังไม่มีแถว
   เลย "ผู้ขอปิดเองได้ (พฤติกรรมเดิม)" · เดินฟังก์ชันจริงแล้วเห็นว่านั่นแปลว่า
   **ผู้ขอกดปิดได้ตั้งแต่วันที่ RD เพิ่งรับเรื่อง** ซึ่งเป็นสถานะของใบ SB ทั้ง 9 ใบ
   ในระบบตอนนั้น

   ที่กลับมติเพราะหัวข้อนี้ฝ่ายปลายทาง **รับปากว่าจะส่งของ** (`deliversRows`) —
   ปิดโดยไม่มีของสักชิ้นไม่ใช่ "พอใจกับคำตอบแล้ว" แต่คือเรื่องที่ไม่ได้เกิดขึ้น
   ทางออกที่ถูกคือ **ยกเลิก** ซึ่งเป็นคำเดียวกับที่ด่าน `pending` บอกอยู่แล้ว

   ⚠️ ไม่ใช่ว่าเดิม "เงียบสนิท" — `closeOutcomeError` บังคับให้ระบุกลิ่นที่ได้ก่อนปิด
   อยู่แล้ว · แต่ผลคือผู้ขอต้องไปหยิบ/สร้างกลิ่นที่ RD ไม่เคยส่งมาให้ตรงกับใบ
   ซึ่งแย่กว่าเดิม: ทะเบียนได้กลิ่นที่ไม่มีที่มา */
test('⭐ หัวข้อที่ฝ่ายรับปากส่งของ ปิดไม่ได้จนกว่าจะมีของสักรายการ', () => {
  const open = req({ kind: 'scent_dev', status: 'acknowledged' });
  assert.match(closeRequestError(open, []), /ยังไม่ได้ส่งงานสักรายการ/);
  // ส่งมาแล้วและเดินจบ = ปิดได้ตามปกติ
  assert.equal(closeRequestError(open, [flowRow({ answerStatus: 'done' })]), null);

  // ฝ่ายกด "ตอบแล้ว" เอง = ประกาศว่าจบงานของตัวแล้ว (ตอบในเธรดจนพอ ไม่มีของต้องส่ง)
  // ⚠️ ไม่ยกเว้นตรงนี้ ใบพวกนั้นจะปิดไม่ลงตลอดกาล — กับดักเดียวกับด่าน `draft`
  assert.equal(closeRequestError(req({ kind: 'scent_dev', status: 'answered' }), []), null);

  // หัวข้อที่ไม่มีแถวในสายอยู่แล้ว (สอบถาม/ขอเอกสาร) ไม่กระทบ — ผู้ขอยังตัดสินเอง
  assert.equal(closeRequestError(req({ kind: 'info', status: 'acknowledged' }), []), null);
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

// ── ส่วนหัว PDR ต้องเดินทางครบจากฟอร์มถึงคอลัมน์ ─────────────────────────
//
// 🐞 ของจริงที่ผู้ใช้เจอบนจอ: กรอกส่วนหัว PDR ครบ กดบันทึก แล้วหน้ารายละเอียดขึ้น
// "ยังไม่ได้กรอกส่วนนี้" ทุกใบ — `requestPayload` ไม่เคยส่ง `form.pdr` เลย และ POST
// ก็ไม่เคยอ่าน · คอมเมนต์เดิมเขียนไว้ว่า "รอ migration ส่วนหัวก่อน" ซึ่งคือ 0214
// ที่ออกและรันไปแล้ว แต่ไม่มีใครกลับมาถอดคำว่า "ยังไม่ส่ง" ออก
test('🐞 requestPayload ส่งส่วนหัว PDR ไปด้วย — ไม่งั้น 21 ช่องหายเงียบทุกใบ', () => {
  const form = {
    dept: 'RD', kind: 'scent_dev', title: 'พัฒนากลิ่น', body: 'x',
    pdr: { customerBrand: 'แบรนด์ก', targetCost: '1200', moq: '50' },
    briefs: [{ label: 'กลิ่นที่ 1', brief: 'โทนไม้' }],
  };
  const p = requestPayload(form);
  assert.deepEqual(p.pdr, form.pdr);
  assert.equal(p.briefs.length, 1);

  // หัวข้อที่ไม่ได้ใช้ PDR ต้องไม่ส่งทั้งสองก้อน — ของที่ไม่มีความหมายไม่ควรถูกส่ง
  const info = requestPayload({ ...form, kind: 'info' });
  assert.equal('pdr' in info, false);
  assert.equal('briefs' in info, false);
});

test('🐞 POST /api/sa/requests ต้องอ่าน body.pdr จริง — ratchet กันฟอร์มส่งแล้ว server ทิ้ง', () => {
  // ⚠️ ด่านฝั่งจอส่งของถูกแล้วก็ไม่พอ ถ้าปลายทางไม่มีใครรับ — ค่าจะหายเงียบ
  // ระหว่างทางเหมือนเดิมเป๊ะ · ตรวจที่ซอร์สเพราะ route แตะ DB จึงเรียกในเทสต์ไม่ได้
  const src = readFileSync('src/app/api/sa/requests/route.js', 'utf8');
  assert.match(src, /normalizePdr\(body\.pdr\)/, 'POST ต้องเรียก normalizePdr(body.pdr)');
  assert.match(src, /\.\.\.pdrColumns,/, 'คอลัมน์ที่ได้ต้องถูกใส่ลง insert จริง');
});

// ── 🐞 หัวข้อที่ผูกโครงการเปิดใบไม่ได้เลย (ผู้ใช้เจอเอง 2026-08-07) ───────
//
// ผู้ใช้รายงาน: *"เหมือนมีบั๊กในการเลือกโครงการ เลือกแล้ว บอกว่าไม่เลือก"*
// ต้นเหตุ: `requestPayload` จงใจไม่ส่ง `projectId` (server ดึงจากแถวดีลเสมอ) แต่
// `requestShapeError` เช็ค `body.projectId` ตรง ๆ ⇒ ตกทุกครั้งที่ POST
test('🐞 โครงการเป็นของที่ server เติมจากดีล — ด่านต้องถามดีล ไม่ใช่ถามโครงการ', () => {
  const payload = requestPayload({
    kind: 'formula_dev', dept: 'RD', title: 'ขอตัวอย่าง',
    projectId: 'PRJ-1', dealId: 'D-1', requestedDueDate: '2569-08-20',
    items: [{ categoryCode: '01-002', scentId: 'SCT-1' }],
  });
  // payload ไม่มี projectId โดยเจตนา — แต่ต้องผ่านด่าน เพราะดีลมาแล้ว
  assert.equal('projectId' in payload, false);
  assert.equal(requestShapeError('formula_dev', payload), null);
  // ไม่มีทั้งคู่ = ยังตก แต่ต้องบอก **ต้นทาง** ที่ผู้ใช้กดได้ ไม่ใช่ปลายทางที่
  // ไม่มีช่องให้กรอก (เดิมคืน "ต้องเลือกโครงการ" — ดูเทสต์ฟอร์มเปล่าข้างล่าง)
  assert.match(
    requestShapeError('formula_dev', { ...payload, dealId: null }),
    /ดีล/,
  );
});

test('ฟอร์มบอกให้ตรงว่าติดอะไร — ไม่สั่งให้เลือกช่องที่ไม่มีอยู่บนจอ', () => {
  // ⚠️ ฟอร์มไม่มีช่อง "โครงการ" (โครงการมาจากดีล) ⇒ "ต้องเลือกโครงการ" คือคำสั่งที่
  // ทำตามไม่ได้ · prod มี 122/136 ดีลที่ยังไม่ผูกโครงการ ⇒ เจอบ่อยที่สุด
  const form = {
    kind: 'formula_dev', dept: 'RD', title: 'ขอตัวอย่าง',
    dealId: 'D-1', projectId: '', requestedDueDate: '2569-08-20',
    items: [{ categoryCode: '01-002', scentId: 'SCT-1' }],
  };
  assert.match(requestFormBlocker(form), /ดีลนี้ยังไม่ผูกโครงการ/);
  assert.equal(requestFormBlocker({ ...form, projectId: 'PRJ-1' }), null);
});

test('ฟอร์มเปล่าบอกให้เลือกดีล ไม่ใช่โครงการ — ทุกหัวข้อที่โครงการมาจากดีล', () => {
  // 🐞 อาการเดียวกับเทสต์ข้างบน แต่มาอีกครึ่ง: **ยังไม่เลือกดีลเลย**
  // (สิ่งแรกที่ทุกคนเจอตอนเปิดฟอร์ม) — เดิมขึ้น "ต้องเลือกโครงการ" ทั้งที่ช่อง
  // โครงการบนจอเป็นช่องอ่านอย่างเดียวเขียนว่า "เติมจากดีลที่เลือก"
  // ตรวจในเบราว์เซอร์แล้วเจอจริงทั้ง พัฒนาสูตร · ขอเอกสาร · สอบถามข้อมูล
  for (const kind of ['formula_dev', 'document']) {
    const blocker = requestFormBlocker({
      kind, dept: 'RD', title: 'ทดสอบ', dealId: '', projectId: '',
      requestedDueDate: '2569-08-20',
      items: [{ categoryCode: '01-002', scentId: 'SCT-1', docType: 'IFRA' }],
    });
    assert.match(blocker, /ดีล/, `${kind}: ต้องบอกให้เลือกดีล`);
    assert.doesNotMatch(blocker, /ต้องเลือกโครงการ/,
      `${kind}: ห้ามสั่งให้เลือกโครงการ — ฟอร์มไม่มีช่องให้เลือก`);
  }
});

// ── 🐞 ปุ่มค้างจางเมื่อ fetch โยน (ผู้ใช้เจอเอง 2026-08-07) ──────────────
//
// *"บันทึกร่าง ปุ่มจาง ไม่มีข้อความบอก"* — `saveDraft` ไม่มี try/catch ⇒ ถ้า
// `createRequestDraft` โยน (เน็ตหลุด · เซิร์ฟเวอร์ตอบ HTML แทน JSON · deploy กำลัง
// สลับ) `setSaving(false)` ไม่เคยถูกเรียก ⇒ **ปุ่มค้างจางตลอดกาลโดยไม่มีเหตุผล**
test('🔴 ทุกปุ่มที่ตั้ง saving ต้องคืนค่าเสมอ — finally ไม่ใช่ตัวเลือก', () => {
  for (const file of [
    'src/app/requests/new/page.js',
    'src/app/requests/[id]/page.js',
  ]) {
    const src = readFileSync(file, 'utf8');
    const setsSaving = (src.match(/setSaving\(true\)/g) || []).length;
    const finallys = (src.match(/finally \{\s*setSaving\(false\)/g) || []).length;
    assert.ok(
      finallys >= setsSaving,
      `${file}: setSaving(true) ${setsSaving} จุด แต่มี finally คืนค่าแค่ ${finallys}`,
    );
  }
});

// ── ด่านของ "ใบ" ต้องครอบทุกทางเข้าที่แตะใบ (ผลตรวจรอบ 12) ──────────────
//
// ⭐ **รูปแบบเดียวกันทั้งสองข้อ: กฎถูกข้ามที่ทางเข้าที่สอง ไม่ใช่กฎผิด** — route
// ระดับแถวสองตัวอยู่ข้างกัน แต่ด่านไม่เท่ากัน · เขียนเป็นเทสต์เพราะมันเป็นเรื่องของ
// **การเดินสาย** ไม่ใช่ตรรกะ ⇒ unit test ของฟังก์ชันจับไม่ได้เลย
const ITEM_ROUTE = 'src/app/api/sa/requests/[id]/items/[itemId]/route.js';
const PRICE_ROUTE = 'src/app/api/sa/requests/[id]/items/[itemId]/price/route.js';

test('🔴 รับเรื่องเป็นก้าวของ "ใบ" — ก้าวรายแถวต้องรอให้ใบถูกรับเรื่องก่อน', () => {
  /* ⭐ มติผู้ใช้ 2026-08-20: *"ปุ่มรับเรื่องมันเป็นระดับใบนะ ไม่ใช่ระดับรายการ"*
     🐞 เดิมก้าว `ack` รายแถวเขียน `headPatch.status = 'acknowledged'` เอง ⇒ มีสองทาง
     ที่รับเรื่องได้ และทางรายแถวเคยข้ามด่านของใบมาแล้ว (ค-2) */
  const src = readFileSync(ITEM_ROUTE, 'utf8');
  assert.match(src, /before\.status === 'pending'/,
    'ก้าวรายแถวต้องถูกปิดจนกว่าใบจะถูกรับเรื่อง');
  assert.doesNotMatch(src, /headPatch\.status = 'acknowledged'/,
    'ก้าวรายแถวต้องไม่รับเรื่องแทนใบ — ปุ่มรับเรื่องอยู่ที่ใบที่เดียว');
  /* ⚠️ **ห้ามเขียน `committedDueDate` จากก้าวรายแถว** (มติผู้ใช้ 2026-08-19) — วันที่
     รับปากของใบมาจาก action `commit-due` ทางเดียว ซึ่งลงแถว `commitDue` ในเธรดเสมอ ·
     เขียนผ่านทางนี้เมื่อไร ใบได้วันโดยที่ฝ่ายขายไม่เห็นอะไรเลย (โรคเดียวกับที่
     `reschedule` เคยเป็น: แก้จริงแต่เธรดเงียบ) */
  assert.doesNotMatch(src, /headPatch\.committedDueDate/,
    'ก้าวรายแถวต้องไม่ผูกวันกำหนดส่งของใบ — ใช้ action commit-due ที่ลงเธรด');
});

test('🔴 route รายแถวสองตัวต้องมีด่านสถานะใบเท่ากัน (ค-5)', () => {
  // 🐞 `price/route.js` เคยไม่มีด่านนี้ ⇒ ใบที่ปิด/ยกเลิกไปแล้วยังยิงราคาเข้าได้
  // และ route นั้น **สร้างวัสดุ `RM_F` เข้าทะเบียนกลาง** ⇒ ของกลางได้แถวจากใบที่ยกเลิก
  // ⚠️ `canPriceRow` ไม่ช่วย — มันอ่าน `rowStage(row)` จากแถวล้วน ไม่รู้จักสถานะใบเลย
  for (const file of [ITEM_ROUTE, PRICE_ROUTE]) {
    const src = readFileSync(file, 'utf8');
    assert.match(src, /if \(!REQUEST_OPEN_STATUSES\.includes\(before\.status\)\)/,
      `${file}: ขาดด่าน "ใบต้องเปิดอยู่"`);
  }
});
