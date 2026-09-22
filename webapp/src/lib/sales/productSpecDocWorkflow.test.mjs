/* ด่านของเอกสาร FM-SA-04 ที่ออกจาก SO (mig 0370 · มติ 21/09/2569)
 *
 * ตารางใหญ่ข้างล่างคือ "ใครเห็นปุ่มไหน ในสถานะไหน" ทั้งเมทริกซ์ — ไม่ใช่ตัวอย่างไม่กี่ช่อง
 * เพราะด่านนี้พลาดได้สองทางที่เทสต์รายกรณีจับไม่ได้: ปุ่มโผล่ให้คนที่ไม่มีสิทธิ์ (ผิดกฎ
 * ui-visibility) และคนที่มีสิทธิ์ไม่เห็นปุ่ม (ทางตัน)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DOC_ACTION_KEYS, DOC_REASON_MAX, DOC_REASON_MIN, DOC_REVISION_STATUSES, DOC_REVISION_STATUS_LABELS,
  DOC_STATUS_LABELS, DOC_STEPS, OPEN_REVISION_STATUSES,
  canAeApproveProductSpecDocument, canIssueProductSpecDocument, canSupApproveProductSpecDocument,
  docReasonError, docRevisionSteps, documentActions, documentCreateGate, formatRevLabel,
  isRevisionOpen, lineDocumentState, rejectStageOf, revisionPatch, salesOrderApprovedBlock,
} from './productSpecDocWorkflow.js';

/* ── ตัวละคร ───────────────────────────────────────────────────────── */

const U = {
  ac: { id: 'U-AC', role: 'ac', name: 'เอซี ผู้ยื่น' },
  ac2: { id: 'U-AC2', role: 'ac', name: 'เอซี อีกคน' },
  owner: { id: 'U-OWNER', role: 'ae', name: 'เอกี เจ้าของดีล' },
  ae2: { id: 'U-AE2', role: 'ae', name: 'เอกี คนอื่น' },
  senior: { id: 'U-SR', role: 'senior_ae', name: 'ซีเนียร์' },
  sup: { id: 'U-SUP', role: 'ae_supervisor', name: 'หัวหน้าฝ่ายขาย' },
  admin: { id: 'U-ADM', role: 'admin', name: 'แอดมิน' },
  rd: { id: 'U-RD', role: 'rd', name: 'อาร์ดี' },
};

const OWNER_ID = U.owner.id;
const approvedOrder = { id: 'SO1', orderNumber: 'SO-26090001-0', status: 'approved' };
const doc = {
  id: 'PSD1', docNo: 'FM-SA-04-220969-001', status: 'active',
  salesOrderId: 'SO1', salesOrderLineId: 'SOL-1', specId: 'PSP1', productId: 'PRD1',
};
const rev = (status, over = {}) => ({
  id: 'PSDR1', documentId: 'PSD1', revNo: 0, status, submittedBy: U.ac.id, ...over,
});

const ACTIONS = ['submit', 'withdraw', 'aeApprove', 'supApprove', 'reject', 'revise', 'void'];

/* ย่อผลให้อ่านง่าย: ปุ่มที่โชว์ → 'ok' (กดได้) / 'blocked' (โชว์พร้อมเหตุ) · ไม่โชว์ = ไม่อยู่ในก้อน */
function summarize(actions) {
  const out = {};
  for (const key of ACTIONS) {
    const action = actions[key];
    assert.ok(action && typeof action.visible === 'boolean', `${key} ต้องมี visible`);
    assert.ok(action.reason === null || typeof action.reason === 'string', `${key}.reason ต้องเป็น null หรือข้อความ`);
    if (!action.visible) {
      assert.equal(action.reason, null, `${key} ที่ซ่อนอยู่ไม่ควรมีเหตุ`);
      continue;
    }
    out[key] = action.reason ? 'blocked' : 'ok';
  }
  return out;
}

const run = (status, user, over = {}) => summarize(documentActions({
  document: doc,
  latest: rev(status),
  salesOrder: approvedOrder,
  dealOwnerId: OWNER_ID,
  user,
  ...over,
}));

/* ⭐ เมทริกซ์หลัก (SO อนุมัติอยู่ · บรรทัดยังอยู่ · ผู้ยื่นคือ U.ac) */
const MATRIX = {
  draft: {
    ac: { submit: 'ok', void: 'ok' },
    ac2: { submit: 'ok', void: 'ok' },
    owner: { aeApprove: 'blocked', reject: 'blocked' },
    ae2: {},
    senior: {},
    sup: { supApprove: 'blocked', reject: 'blocked' },
    admin: { submit: 'ok', aeApprove: 'blocked', supApprove: 'blocked', reject: 'blocked', void: 'ok' },
    rd: {},
  },
  pending_ae: {
    ac: { withdraw: 'ok', void: 'ok' },
    ac2: { void: 'ok' },
    owner: { aeApprove: 'ok', reject: 'ok' },
    ae2: {},
    senior: {},
    sup: { supApprove: 'blocked', reject: 'blocked' },
    admin: { withdraw: 'ok', aeApprove: 'ok', supApprove: 'blocked', reject: 'ok', void: 'ok' },
    rd: {},
  },
  pending_ae_supervisor: {
    ac: { withdraw: 'ok', void: 'ok' },
    ac2: { void: 'ok' },
    owner: {},
    ae2: {},
    senior: {},
    sup: { supApprove: 'ok', reject: 'ok' },
    admin: { withdraw: 'ok', supApprove: 'ok', reject: 'ok', void: 'ok' },
    rd: {},
  },
  approved: {
    ac: { revise: 'ok', void: 'ok' },
    ac2: { revise: 'ok', void: 'ok' },
    owner: {},
    ae2: {},
    senior: {},
    sup: {},
    admin: { revise: 'ok', void: 'ok' },
    rd: {},
  },
  superseded: {
    ac: { void: 'ok' },
    ac2: { void: 'ok' },
    owner: {},
    ae2: {},
    senior: {},
    sup: {},
    admin: { void: 'ok' },
    rd: {},
  },
};
// ตีกลับ = งานกลับไปอยู่ที่ AC · ปุ่มเหมือนร่างทุกช่อง (ยื่นใหม่ได้ใน Rev เดิม)
MATRIX.rejected = MATRIX.draft;

test('เมทริกซ์ครบทุกสถานะของ Rev', () => {
  assert.deepEqual(Object.keys(MATRIX).sort(), [...DOC_REVISION_STATUSES].sort());
});

for (const [status, byUser] of Object.entries(MATRIX)) {
  for (const [who, expected] of Object.entries(byUser)) {
    test(`ปุ่มของ ${who} เมื่อ Rev เป็น ${status}`, () => {
      assert.deepEqual(run(status, U[who]), expected);
    });
  }
}

/* ── ขั้น AE เป็นของเจ้าของดีลเท่านั้น ────────────────────────────────── */

test('🔴 AE Supervisor ที่ไม่ใช่เจ้าของดีลกดขั้น AE ไม่ได้ — ไม่ใช้ isSuperuser', () => {
  const actions = documentActions({
    document: doc, latest: rev('pending_ae'), salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U.sup,
  });
  assert.equal(actions.aeApprove.visible, false);
  assert.equal(canAeApproveProductSpecDocument(U.sup, OWNER_ID), false);
  // ตีกลับขั้น AE แทนเจ้าของดีลก็ไม่ได้ — โชว์พร้อมเหตุ
  assert.equal(actions.reject.visible, true);
  assert.match(actions.reject.reason, /AE เจ้าของดีล/);
});

test('🔴 ไฟล์ตัวตัดสินไม่เรียก isSuperuser (ae_supervisor นับเป็น superuser)', () => {
  const src = readFileSync(new URL('./productSpecDocWorkflow.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /isSuperuser\s*\(/);
  assert.doesNotMatch(src, /import\s*{[^}]*isSuperuser/);
});

test('AE Sup ที่เป็นเจ้าของดีลเองกดได้ทั้งสองขั้นตามลำดับ', () => {
  const supOwner = { id: OWNER_ID, role: 'ae_supervisor' };
  assert.deepEqual(run('pending_ae', supOwner), { aeApprove: 'ok', supApprove: 'blocked', reject: 'ok' });
  assert.deepEqual(run('pending_ae_supervisor', supOwner), { supApprove: 'ok', reject: 'ok' });
});

test('AE ที่ไม่ใช่เจ้าของดีล (แม้ senior) ไม่เห็นปุ่มอนุมัติเลย', () => {
  assert.deepEqual(run('pending_ae', U.ae2), {});
  assert.deepEqual(run('pending_ae', U.senior), {});
  assert.equal(canAeApproveProductSpecDocument(U.owner, OWNER_ID), true);
  assert.equal(canAeApproveProductSpecDocument(U.owner, null), false);
});

test('SO ไม่ผูกดีล (ไม่มีเจ้าของ) — เหลือแอดมินกดขั้น AE แทนได้คนเดียว', () => {
  assert.deepEqual(run('pending_ae', U.owner, { dealOwnerId: null }), {});
  assert.equal(run('pending_ae', U.admin, { dealOwnerId: null }).aeApprove, 'ok');
});

test('ผู้ใช้ที่ไม่มี id ไม่นับเป็นเจ้าของดีล/ผู้ยื่น แม้ค่าว่างเท่ากัน', () => {
  const ghost = { role: 'ae' };
  assert.equal(canAeApproveProductSpecDocument(ghost, undefined), false);
  assert.deepEqual(run('pending_ae', { role: 'ac' }, { latest: rev('pending_ae', { submittedBy: undefined }) }), { void: 'ok' });
});

/* ── admin = role 'admin' เท่านั้น ─────────────────────────────────── */

test('แอดมินกดแทนได้ทุกขั้น', () => {
  assert.equal(canIssueProductSpecDocument('admin'), true);
  assert.equal(canSupApproveProductSpecDocument(U.admin), true);
  assert.equal(canAeApproveProductSpecDocument(U.admin, OWNER_ID), true);
  assert.equal(run('pending_ae', U.admin).aeApprove, 'ok');
  assert.equal(run('pending_ae_supervisor', U.admin).supApprove, 'ok');
  assert.equal(run('pending_ae_supervisor', U.admin).withdraw, 'ok', 'ดึงกลับแทนผู้ยื่นได้');
});

test('ออกเอกสาร/ยื่น/แก้ไข/ยกเลิก เป็นของ AC (+ admin) เท่านั้น', () => {
  assert.equal(canIssueProductSpecDocument('ac'), true);
  for (const role of ['ae', 'senior_ae', 'ae_supervisor', 'rd', 'viewer', undefined]) {
    assert.equal(canIssueProductSpecDocument(role), false, role);
  }
});

/* ── SO ต้องยังอนุมัติอยู่ ─────────────────────────────────────────── */

const revokedOrder = { id: 'SO1', orderNumber: 'SO-26090001-0', status: 'approval_revoked' };

test('SO ถูกย้อนการอนุมัติ: ยื่น/อนุมัติ/แก้ไข ติดด่านพร้อมเหตุ', () => {
  const blocked = (status, user, key) => documentActions({
    document: doc, latest: rev(status), salesOrder: revokedOrder, dealOwnerId: OWNER_ID, user,
  })[key];
  for (const [status, user, key] of [
    ['draft', U.ac, 'submit'],
    ['rejected', U.ac, 'submit'],
    ['pending_ae', U.owner, 'aeApprove'],
    ['pending_ae_supervisor', U.sup, 'supApprove'],
    ['approved', U.ac, 'revise'],
  ]) {
    const action = blocked(status, user, key);
    assert.equal(action.visible, true, `${key}@${status} ต้องโชว์`);
    assert.match(action.reason, /SO-26090001-0/, `${key}@${status}`);
    assert.match(action.reason, /ย้อนการอนุมัติ/, `${key}@${status}`);
  }
});

test('SO ถูกย้อนการอนุมัติ: ดึงกลับ/ตีกลับ/ยกเลิก ยังทำได้ (ถอย ไม่ใช่เดินหน้า)', () => {
  const at = (status, user) => summarize(documentActions({
    document: doc, latest: rev(status), salesOrder: revokedOrder, dealOwnerId: OWNER_ID, user,
  }));
  assert.equal(at('pending_ae', U.ac).withdraw, 'ok');
  assert.equal(at('pending_ae', U.owner).reject, 'ok');
  assert.equal(at('pending_ae_supervisor', U.sup).reject, 'ok');
  assert.equal(at('approved', U.ac).void, 'ok');
});

test('ไม่พบ SO ต้นเรื่อง = ติดด่านเดินหน้า', () => {
  const actions = documentActions({
    document: doc, latest: rev('draft'), salesOrder: null, dealOwnerId: OWNER_ID, user: U.ac,
  });
  assert.match(actions.submit.reason, /ไม่พบใบสั่งขาย/);
});

test('บรรทัด SO ถูกถอด: เดินหน้าไม่ได้ ทางออกคือยกเลิกเอกสาร', () => {
  const orphan = { ...doc, salesOrderLineId: null };
  const actions = documentActions({
    document: orphan, latest: rev('approved'), salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U.ac,
  });
  assert.match(actions.revise.reason, /ถูกถอด/);
  assert.equal(actions.void.visible, true);
  assert.equal(actions.void.reason, null);
  const draftOrphan = documentActions({
    document: orphan, latest: rev('draft'), salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U.ac,
  });
  assert.match(draftOrphan.submit.reason, /ยกเลิกเอกสาร/);
});

/* ── void / ไม่มี Rev ──────────────────────────────────────────────── */

test('เอกสาร void แล้ว: ทุกปุ่มหายสำหรับทุกคน (เลขที่ปิดถาวร)', () => {
  for (const user of Object.values(U)) {
    for (const status of DOC_REVISION_STATUSES) {
      assert.deepEqual(summarize(documentActions({
        document: { ...doc, status: 'void' }, latest: rev(status), salesOrder: approvedOrder,
        dealOwnerId: OWNER_ID, user,
      })), {}, `${user.role}@${status}`);
    }
  }
});

test('ไม่มีเอกสารหรือไม่มี Rev = ไม่มีปุ่ม', () => {
  assert.deepEqual(summarize(documentActions({ user: U.admin })), {});
  assert.deepEqual(summarize(documentActions({ document: doc, user: U.admin, salesOrder: approvedOrder })), {});
});

/* ── ด่านออกเอกสารจากบรรทัด SO ─────────────────────────────────────── */

const line = { id: 'SOL-1', productId: 'PRD1', fgCode: 'FG-0903-01-002-10043' };
const spec = { id: 'PSP1', productId: 'PRD1' };
const gate = (over = {}) => documentCreateGate({
  user: U.ac, salesOrder: approvedOrder, line, spec, existingDocument: null, scopeReason: null, ...over,
});

test('ออกเอกสารได้เมื่อครบทุกเงื่อนไข', () => {
  assert.deepEqual(gate(), { visible: true, reason: null });
  assert.deepEqual(gate({ user: U.admin }), { visible: true, reason: null });
});

test('ไม่ใช่ AC = ไม่เห็นปุ่มออกเอกสาร (ไม่ใช่ปุ่มจาง)', () => {
  for (const user of [U.owner, U.sup, U.senior, U.rd]) {
    assert.deepEqual(gate({ user }), { visible: false, reason: null }, user.role);
  }
});

test('ด่านออกเอกสารบอกเหตุทุกกรณี', () => {
  assert.match(gate({ scopeReason: 'หมวด 03 ไม่ใช้ใบสเปคสินค้า' }).reason, /หมวด 03/);
  assert.match(gate({ line: null }).reason, /ไม่พบบรรทัด/);
  assert.match(gate({ line: { ...line, productId: null } }).reason, /ไม่ได้ผูกสินค้า/);
  assert.match(gate({ salesOrder: { ...approvedOrder, origin: 'historical' } }).reason, /ย้อนหลัง/);
  assert.match(gate({ salesOrder: { ...approvedOrder, status: 'pending_approval' } }).reason, /รออนุมัติ/);
  assert.match(gate({ salesOrder: null }).reason, /ไม่พบใบสั่งขาย/);
  assert.match(gate({ spec: null }).reason, /ยังไม่มีสเปค/);
  assert.match(gate({ existingDocument: { docNo: 'FM-SA-04-220969-001', status: 'active' } }).reason, /FM-SA-04-220969-001/);
});

test('เอกสารเดิมที่ void แล้วไม่ขวางการออกใบใหม่ (เลขใหม่)', () => {
  assert.equal(gate({ existingDocument: { docNo: 'FM-SA-04-220969-001', status: 'void' } }).reason, null);
});

/* ── สถานะรายบรรทัดบนหน้า SO ──────────────────────────────────────── */

test('บรรทัดนอกขอบเขต = "ไม่ต้องใช้" พร้อมเหตุ ไม่มีปุ่ม', () => {
  const state = lineDocumentState({ line, scopeReason: 'หมวด 03 ไม่ใช้ใบสเปคสินค้า', user: U.ac });
  assert.equal(state.kind, 'out_of_scope');
  assert.equal(state.action, null);
  assert.match(state.reason, /หมวด 03/);
});

test('ยังไม่มีสเปค: ลิงก์ไปสร้างสำหรับคนที่แก้สเปคได้ · คนอื่นไม่เห็นลิงก์', () => {
  const forAc = lineDocumentState({ line, spec: null, salesOrder: approvedOrder, user: U.ac });
  assert.equal(forAc.kind, 'no_spec');
  assert.equal(forAc.action, 'create_spec');
  assert.equal(forAc.reason, null, 'ลิงก์สร้างสเปคต้องไม่ติดเหตุ "ยังไม่มีสเปค" ซึ่งเป็นสิ่งที่มันมีไว้แก้');
  assert.equal(lineDocumentState({ line, spec: null, salesOrder: approvedOrder, user: U.owner }).action, 'create_spec');
  assert.equal(lineDocumentState({ line, spec: null, salesOrder: approvedOrder, user: U.rd }).action, null);
});

test('มีสเปคแล้วยังไม่ออก: AC ได้ปุ่มออกเอกสาร · AE เห็นสถานะอย่างเดียว', () => {
  const forAc = lineDocumentState({ line, spec, salesOrder: approvedOrder, user: U.ac });
  assert.equal(forAc.kind, 'not_issued');
  assert.equal(forAc.action, 'issue');
  assert.equal(forAc.reason, null);
  const forAe = lineDocumentState({ line, spec, salesOrder: approvedOrder, user: U.owner });
  assert.equal(forAe.kind, 'not_issued');
  assert.equal(forAe.action, null);
  assert.equal(forAe.reason, null);
});

test('SO ยังไม่อนุมัติ: ปุ่มออกเอกสารยังอยู่ แต่มีเหตุกำกับ (ไม่ซ่อน)', () => {
  const state = lineDocumentState({
    line, spec, salesOrder: { ...approvedOrder, status: 'draft' }, user: U.ac,
  });
  assert.equal(state.action, 'issue');
  assert.match(state.reason, /ฉบับร่าง/);
});

test('ออกแล้ว: ลิงก์เปิดเอกสาร พร้อมเลขที่ · Rev ล่าสุด · สถานะ', () => {
  const state = lineDocumentState({
    line, spec, document: doc, latest: rev('pending_ae', { revNo: 1 }), salesOrder: approvedOrder, user: U.owner,
  });
  assert.deepEqual(state, {
    kind: 'issued',
    label: 'ออกแล้ว',
    reason: null,
    action: 'open',
    documentId: 'PSD1',
    docNo: 'FM-SA-04-220969-001',
    docNoText: '220969-001-01',
    revLabel: 'Rev.01',
    statusLabel: 'รอ AE อนุมัติ',
    revStatus: 'pending_ae',
  });
});

test('เอกสาร void บนบรรทัด = นับว่ายังไม่ออก (ออกใบใหม่ได้)', () => {
  const state = lineDocumentState({
    line, spec, document: { ...doc, status: 'void' }, latest: rev('approved'), salesOrder: approvedOrder, user: U.ac,
  });
  assert.equal(state.kind, 'not_issued');
  assert.equal(state.action, 'issue');
});

test('ทุกสถานะคืนคีย์ครบชุดเดียวกัน (จออ่านได้ไม่ต้องเช็คทีละคีย์)', () => {
  const keys = ['kind', 'label', 'reason', 'action', 'documentId', 'docNo', 'docNoText', 'revLabel', 'statusLabel', 'revStatus'].sort();
  for (const state of [
    lineDocumentState({ line, scopeReason: 'x', user: U.ac }),
    lineDocumentState({ line, spec: null, user: U.ac }),
    lineDocumentState({ line, spec, salesOrder: approvedOrder, user: U.ac }),
    lineDocumentState({ line, spec, document: doc, latest: rev('draft'), user: U.ac }),
  ]) {
    assert.deepEqual(Object.keys(state).sort(), keys, state.kind);
  }
});

/* ── ก้อนที่เขียนลง Rev ต้องผ่าน CHECK ของ 0370 เสมอ ─────────────────── */

/* ตัวจำลอง CHECK ของ product_spec_document_revisions (mig 0370 ⑦) — เดินเส้นสถานะจริงด้วย
   `revisionPatch` แล้วตรวจทุกก้าว · ลืมช่องเดียวในก้อน = ฐานตอบ 500 ภาษาอังกฤษ */
function violatesChecks(row) {
  if (!DOC_REVISION_STATUSES.includes(row.status)) return 'status';
  if (row.rejectedStage && !['ae', 'ae_supervisor'].includes(row.rejectedStage)) return 'rejectedStage';
  if (!['draft', 'rejected'].includes(row.status) && (!row.snapshot || !row.submittedAt)) return 'submitted';
  if (['pending_ae_supervisor', 'approved', 'superseded'].includes(row.status) && !row.aeApprovedAt) return 'ae';
  if (['approved', 'superseded'].includes(row.status) && !row.supApprovedAt) return 'sup';
  if (row.status === 'rejected' && (!row.rejectionReason || !row.rejectedStage)) return 'rejected';
  if (row.revNo > 0 && !String(row.reason || '').trim()) return 'reason';
  return null;
}

function step(row, action, extra = {}) {
  const built = revisionPatch(action, {
    user: U.admin, now: '2026-09-22T03:00:00.000Z', snapshot: { spec: {} }, illustrationIds: ['ATT1'], ...extra,
  });
  assert.ok(built, `${action} ต้องมีก้อน`);
  assert.ok(built.from.includes(row.status), `${action} เริ่มจาก ${row.status} ไม่ได้`);
  const next = { ...row, ...built.patch };
  assert.equal(violatesChecks(next), null, `${action}: ${violatesChecks(next)}`);
  return next;
}

test('เส้นปกติ ร่าง → ยื่น → AE → AE Sup ผ่าน CHECK ทุกก้าว', () => {
  let row = { revNo: 0, status: 'draft', snapshot: null };
  row = step(row, 'submit');
  assert.equal(row.status, 'pending_ae');
  assert.deepEqual(row.illustrationIds, ['ATT1']);
  row = step(row, 'ae_approve');
  assert.equal(row.status, 'pending_ae_supervisor');
  row = step(row, 'sup_approve');
  assert.equal(row.status, 'approved');
  assert.equal(row.supApprovedByName, 'แอดมิน');
});

test('ตีกลับแล้วยื่นใหม่ใน Rev เดิม — รอยตีกลับถูกล้าง ตราประทับเก่าไม่ค้าง', () => {
  let row = { revNo: 1, reason: 'ลูกค้าขอเปลี่ยนฝา', status: 'draft', snapshot: null };
  row = step(row, 'submit');
  row = step(row, 'ae_approve');
  row = step(row, 'reject', { reason: 'ขนาดบรรจุไม่ตรงกับ SO', stage: rejectStageOf(row) });
  assert.equal(row.status, 'rejected');
  assert.equal(row.rejectedStage, 'ae_supervisor');
  row = step(row, 'submit');
  assert.equal(row.status, 'pending_ae');
  assert.equal(row.rejectionReason, null);
  assert.equal(row.rejectedStage, null);
  assert.equal(row.aeApprovedAt, null, 'ยื่นใหม่ต้องเดิน AE ใหม่');
});

test('ดึงกลับ/ถอยเป็นร่าง: ภาพนิ่ง รูป และตราประทับยื่น/AE ถูกล้าง', () => {
  let row = { revNo: 0, status: 'draft', snapshot: null };
  row = step(row, 'submit');
  row = step(row, 'ae_approve');
  for (const action of ['withdraw', 'reset_to_draft']) {
    const next = step(row, action);
    assert.equal(next.status, 'draft');
    assert.equal(next.snapshot, null);
    assert.deepEqual(next.illustrationIds, []);
    assert.equal(next.submittedAt, null);
    assert.equal(next.aeApprovedAt, null);
  }
});

test('ก้อนแต่ละการกระทำเริ่มได้จากสถานะที่ถูกเท่านั้น', () => {
  assert.deepEqual(revisionPatch('submit').from, ['draft', 'rejected']);
  assert.deepEqual(revisionPatch('withdraw').from, ['pending_ae', 'pending_ae_supervisor']);
  assert.deepEqual(revisionPatch('ae_approve').from, ['pending_ae']);
  assert.deepEqual(revisionPatch('sup_approve').from, ['pending_ae_supervisor']);
  assert.deepEqual(revisionPatch('reject').from, ['pending_ae', 'pending_ae_supervisor']);
  assert.equal(revisionPatch('revise'), null, 'revise เปิด Rev ใหม่ ไม่ใช่แก้ Rev เดิม');
  assert.equal(revisionPatch('ไม่มีจริง'), null);
});

test('ขั้นที่ตีกลับอ่านจากสถานะของ Rev', () => {
  assert.equal(rejectStageOf({ status: 'pending_ae' }), 'ae');
  assert.equal(rejectStageOf({ status: 'pending_ae_supervisor' }), 'ae_supervisor');
  assert.equal(rejectStageOf({ status: 'draft' }), null);
});

test('คีย์ action ของ API ชี้ปุ่มที่มีจริงใน documentActions', () => {
  const keys = Object.keys(documentActions({
    document: doc, latest: rev('draft'), salesOrder: approvedOrder, user: U.admin,
  }));
  for (const target of Object.values(DOC_ACTION_KEYS)) assert.ok(keys.includes(target), target);
  assert.deepEqual(Object.keys(DOC_ACTION_KEYS).sort(),
    ['ae_approve', 'reject', 'revise', 'submit', 'sup_approve', 'void', 'withdraw']);
});

/* ── ราง 3 ขั้น ───────────────────────────────────────────────────── */

test('รางสามขั้นตามสถานะ', () => {
  const states = (status, over = {}) => docRevisionSteps({ status, ...over }).map((s) => s.state);
  assert.deepEqual(states('draft'), ['current', 'todo', 'todo']);
  assert.deepEqual(states('pending_ae'), ['done', 'current', 'todo']);
  assert.deepEqual(states('pending_ae_supervisor'), ['done', 'done', 'current']);
  assert.deepEqual(states('approved'), ['done', 'done', 'done']);
  assert.deepEqual(states('superseded'), ['done', 'done', 'done']);
  assert.deepEqual(DOC_STEPS.map((s) => s.id), ['submit', 'ae', 'ae_supervisor']);
});

test('ตีกลับ: งานกลับไปที่ AC และป้ายตีกลับติดที่ขั้นของคนตีกลับ', () => {
  const atAe = docRevisionSteps({ status: 'rejected', rejectedStage: 'ae' });
  assert.equal(atAe[0].state, 'current');
  assert.deepEqual(atAe.map((s) => s.rejected), [false, true, false]);
  const atSup = docRevisionSteps({ status: 'rejected', rejectedStage: 'ae_supervisor' });
  assert.deepEqual(atSup.map((s) => s.rejected), [false, false, true]);
});

test('รางบอกชื่อคนทำแต่ละขั้น', () => {
  const steps = docRevisionSteps({
    status: 'approved',
    submittedByName: 'เอซี', submittedAt: '2026-09-22T01:00:00Z',
    aeApprovedByName: 'เอกี', supApprovedByName: 'หัวหน้า',
  });
  assert.deepEqual(steps.map((s) => s.byName), ['เอซี', 'เอกี', 'หัวหน้า']);
  assert.equal(steps[0].at, '2026-09-22T01:00:00Z');
});

/* ── ของเล็ก ──────────────────────────────────────────────────────── */

test('ป้าย Rev สองหลัก · ค่าว่างเป็นขีด', () => {
  assert.equal(formatRevLabel(0), 'Rev.00');
  assert.equal(formatRevLabel(3), 'Rev.03');
  assert.equal(formatRevLabel(12), 'Rev.12');
  assert.equal(formatRevLabel('2'), 'Rev.02');
  assert.equal(formatRevLabel(null), '—');
  assert.equal(formatRevLabel(undefined), '—');
});

test('Rev ที่ยังไม่จบ = ร่าง · รออนุมัติสองขั้น · ตีกลับ', () => {
  for (const status of OPEN_REVISION_STATUSES) assert.equal(isRevisionOpen({ status }), true, status);
  assert.equal(isRevisionOpen({ status: 'approved' }), false);
  assert.equal(isRevisionOpen({ status: 'superseded' }), false);
  assert.equal(isRevisionOpen(null), false);
});

test('ป้ายสถานะครบทุกค่า', () => {
  for (const status of DOC_REVISION_STATUSES) assert.ok(DOC_REVISION_STATUS_LABELS[status], status);
  assert.deepEqual(Object.keys(DOC_STATUS_LABELS).sort(), ['active', 'void']);
});

test('เหตุผล 10–500 ตัวอักษร', () => {
  assert.match(docReasonError(''), new RegExp(`${DOC_REASON_MIN}`));
  assert.match(docReasonError('สั้นไป'), /อย่างน้อย/);
  assert.equal(docReasonError('ลูกค้าขอเปลี่ยนสีฝาเป็นสีทอง'), null);
  assert.match(docReasonError('ก'.repeat(DOC_REASON_MAX + 1)), /ยาวเกิน/);
  assert.match(docReasonError('', { label: 'เหตุผลที่ยกเลิก' }), /เหตุผลที่ยกเลิก/);
});

test('ด่าน SO อนุมัติบอกเลขที่และสถานะเป็นภาษาคน', () => {
  assert.equal(salesOrderApprovedBlock(approvedOrder), null);
  assert.match(salesOrderApprovedBlock({ orderNumber: 'SO-1', status: 'cancelled' }), /SO-1.*ยกเลิก/);
  assert.match(salesOrderApprovedBlock(null), /ไม่พบใบสั่งขาย/);
});
