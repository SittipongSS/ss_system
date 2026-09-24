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
  canAeApproveProductSpecDocument, canIssueProductSpecDocument, canReviseProductSpecDocument,
  canSupApproveProductSpecDocument, canVoidProductSpecDocument, hasApprovedRevision, isProductSpecDocumentApprover,
  DRAFT_EXIT_MISMATCH, FRESH_DRAFT_VOID_BLOCK, SUBMIT_TRACE_FIELDS,
  docReasonError, docRevisionSteps, documentActions, documentCreateGate, documentExitKey, draftDeleteBlock,
  formatRevLabel, isDeletableDraft, isRevisionOpen, lineDocumentState, lineRemovedBlock, rejectStageOf,
  revisionPatch, salesOrderApprovedBlock,
} from './productSpecDocWorkflow.js';

/* ── ตัวละคร ───────────────────────────────────────────────────────── */

const U = {
  ac: { id: 'U-AC', role: 'ac', name: 'เอซี ผู้ยื่น' },
  ac2: { id: 'U-AC2', role: 'ac', name: 'เอซี อีกคน' },
  owner: { id: 'U-OWNER', role: 'ae', name: 'เอกี เจ้าของดีล' },
  ae2: { id: 'U-AE2', role: 'ae', name: 'เอกี คนอื่น' },
  senior: { id: 'U-SR', role: 'senior_ae', name: 'ซีเนียร์' },
  sup: { id: 'U-SUP', role: 'ae_supervisor', name: 'หัวหน้าฝ่ายขาย' },
  // CD/CM อนุมัติขั้น AE Sup ได้เท่า AE Sup (ผังตำแหน่ง 24/09) ⇒ ได้สิทธิ์ย้อน/ยกเลิกชุดเดียวกัน
  cd: { id: 'U-CD', role: 'commercial_director', name: 'ซีดี' },
  cm: { id: 'U-CM', role: 'commercial_manager', name: 'ซีเอ็ม' },
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

const ACTIONS = ['submit', 'withdraw', 'aeApprove', 'supApprove', 'reject', 'revise', 'void', 'remove'];

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
  /* ⭐ ร่างที่ยังไม่เคยยื่น = สถานะเดียวที่มีปุ่ม "ลบร่าง" (มติ 23/09/2569 · mig 0375)
     และ **ไม่มีปุ่มยกเลิก** (มติเจ้าของ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง") — ปุ่มปลายทางทีละตัว */
  draft: {
    ac: { submit: 'ok', remove: 'ok' },
    ac2: { submit: 'ok', remove: 'ok' },
    owner: { aeApprove: 'blocked', reject: 'blocked' },
    ae2: {},
    senior: {},
    sup: { supApprove: 'blocked', reject: 'blocked' },
    cd: { supApprove: 'blocked', reject: 'blocked' },
    cm: { supApprove: 'blocked', reject: 'blocked' },
    admin: { submit: 'ok', aeApprove: 'blocked', supApprove: 'blocked', reject: 'blocked', remove: 'ok' },
    rd: {},
  },
  pending_ae: {
    ac: { withdraw: 'ok', void: 'ok' },
    ac2: { void: 'ok' },
    owner: { aeApprove: 'ok', reject: 'ok' },
    ae2: {},
    senior: {},
    sup: { supApprove: 'blocked', reject: 'blocked' },
    cd: { supApprove: 'blocked', reject: 'blocked' },
    cm: { supApprove: 'blocked', reject: 'blocked' },
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
    cd: { supApprove: 'ok', reject: 'ok' },
    cm: { supApprove: 'ok', reject: 'ok' },
    admin: { withdraw: 'ok', supApprove: 'ok', reject: 'ok', void: 'ok' },
    rd: {},
  },
  /* ⭐ มติเจ้าของ 24/09/2569 "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ" — ผู้อนุมัติทั้งสองขั้น
     (AE เจ้าของดีล · CD/CM/AE Sup) ได้ "แก้ไขเอกสาร" + "ยกเลิกเอกสาร" บนใบที่อนุมัติแล้ว เพิ่มจากสาย AC
     ⚠️ AE คนอื่น/Senior AE ที่ไม่ใช่เจ้าของดีล · RD ยังไม่ได้อะไร */
  approved: {
    ac: { revise: 'ok', void: 'ok' },
    ac2: { revise: 'ok', void: 'ok' },
    owner: { revise: 'ok', void: 'ok' },
    ae2: {},
    senior: {},
    sup: { revise: 'ok', void: 'ok' },
    cd: { revise: 'ok', void: 'ok' },
    cm: { revise: 'ok', void: 'ok' },
    admin: { revise: 'ok', void: 'ok' },
    rd: {},
  },
  superseded: {
    ac: { void: 'ok' },
    ac2: { void: 'ok' },
    owner: { void: 'ok' },
    ae2: {},
    senior: {},
    sup: { void: 'ok' },
    cd: { void: 'ok' },
    cm: { void: 'ok' },
    admin: { void: 'ok' },
    rd: {},
  },
};
/* ตีกลับ = งานกลับไปอยู่ที่ AC · ปุ่มเหมือนร่างทุกช่อง (ยื่นใหม่ได้ใน Rev เดิม)
   ⚠️ **ยกเว้นปุ่มปลายทาง** — ใบที่ถูกตีกลับผ่านตาผู้อนุมัติมาแล้ว ลบไม่ได้ (มติ 23/09 · ทางออกคือยกเลิก)
      ⇒ ทุกคนที่เห็น "ลบร่าง" บนร่าง ได้ "ยกเลิกเอกสาร" แทนที่ตรงนี้ (ปุ่มปลายทางคู่สลับ — ไม่หายทั้งคู่) */
const exitSwapped = (buttons) => Object.fromEntries(Object.entries(buttons).map(([key, value]) => (
  key === 'remove' ? ['void', value] : [key, value]
)));
MATRIX.rejected = Object.fromEntries(Object.entries(MATRIX.draft).map(([who, buttons]) => [who, exitSwapped(buttons)]));
/* ⭐ ร่างที่ "เคยยื่นแล้วดึงกลับ" (Rev กลับเป็น draft แต่มี `firstSubmittedAt`) — ปุ่มเหมือนร่างทุกช่อง
   ยกเว้นปุ่มปลายทาง: **ยกเลิกกลับมาเหมือนเดิม** ลบหาย (มติ 23/09/2569 — เคยยื่นแล้วแม้ครั้งเดียว = void) */
const WITHDRAWN_DRAFT = Object.fromEntries(Object.entries(MATRIX.draft).map(([who, buttons]) => [who, exitSwapped(buttons)]));

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

for (const [who, expected] of Object.entries(WITHDRAWN_DRAFT)) {
  test(`ปุ่มของ ${who} บนร่างที่เคยยื่นแล้วดึงกลับ — ยกเลิกกลับมา ลบหาย`, () => {
    assert.deepEqual(run('draft', U[who], {
      latest: rev('draft', { submittedBy: null, firstSubmittedAt: '2026-09-23T02:00:00.000Z' }),
    }), expected);
  });
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

test('ออกเอกสาร/ยื่น/ลบร่าง เป็นของ AC (+ admin) เท่านั้น — แก้ไข/ยกเลิกเพิ่มผู้อนุมัติ (มติ 24/09)', () => {
  assert.equal(canIssueProductSpecDocument('ac'), true);
  for (const role of ['ae', 'senior_ae', 'ae_supervisor', 'commercial_director', 'commercial_manager', 'rd', 'viewer', undefined]) {
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

test('บรรทัด SO ถูกถอด: เดินหน้าไม่ได้ ทางออกคือปุ่มปลายทางที่ใบนั้นมีจริง', () => {
  const orphan = { ...doc, salesOrderLineId: null };
  const actions = documentActions({
    document: orphan, latest: rev('approved'), salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U.ac,
  });
  assert.match(actions.revise.reason, /ถูกถอด/);
  assert.match(actions.revise.reason, /ยกเลิกเอกสาร/);
  assert.deepEqual(actions.void, { visible: true, reason: null });
  assert.equal(actions.remove.visible, false);

  /* ⭐ ร่างที่ไม่เคยยื่น: ปุ่มยกเลิกถูกซ่อน (มติ 23/09) ⇒ เหตุบนปุ่มยื่นต้องชี้ "ลบร่าง" ไม่ใช่ปุ่มที่ไม่มีอยู่ */
  const draftOrphan = documentActions({
    document: orphan, latest: rev('draft'), salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U.ac,
  });
  assert.match(draftOrphan.submit.reason, /ถูกถอด/);
  assert.match(draftOrphan.submit.reason, /ลบร่าง/);
  assert.doesNotMatch(draftOrphan.submit.reason, /ยกเลิก/);
  assert.equal(draftOrphan.void.visible, false);
  assert.deepEqual(draftOrphan.remove, { visible: true, reason: null });

  // ร่างที่เคยยื่นแล้วดึงกลับ = กลับไปชี้ "ยกเลิก" (ปุ่มนั้นกลับมาแล้ว)
  const withdrawnOrphan = documentActions({
    document: orphan,
    latest: rev('draft', { submittedBy: null, firstSubmittedAt: '2026-09-23T02:00:00.000Z' }),
    salesOrder: approvedOrder,
    dealOwnerId: OWNER_ID,
    user: U.ac,
  });
  assert.match(withdrawnOrphan.submit.reason, /ยกเลิกเอกสาร/);
  assert.deepEqual(withdrawnOrphan.void, { visible: true, reason: null });
  assert.equal(withdrawnOrphan.remove.visible, false);
});

test('lineRemovedBlock ชี้ปุ่มเดียวกับ documentExitKey ทุกกรณี', () => {
  const orphan = { ...doc, salesOrderLineId: null };
  for (const status of DOC_REVISION_STATUSES) {
    for (const trace of [{}, { firstSubmittedAt: '2026-09-23T02:00:00.000Z' }]) {
      const latest = rev(status, { submittedBy: null, ...trace });
      const text = lineRemovedBlock(orphan, latest);
      if (documentExitKey(orphan, latest) === 'remove') {
        assert.match(text, /ลบร่าง/, status);
        assert.doesNotMatch(text, /ยกเลิก/, status);
      } else {
        assert.match(text, /ยกเลิกเอกสาร/, status);
      }
    }
  }
});

/* ── ย้อน/ยกเลิกโดยผู้อนุมัติ (มติเจ้าของ 24/09/2569) ─────────────────────────────
 *
 * ⭐ "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ" — **เพิ่ม** สิทธิ์ ไม่ถอดของใคร
 *   · ผู้อนุมัติทั้งสองขั้น (AE เจ้าของดีล · CD/CM/AE Sup) + admin: "แก้ไขเอกสาร" (Rev+1) และ "ยกเลิกเอกสาร"
 *     บนใบที่ **อนุมัติครบมาแล้วอย่างน้อยหนึ่งฉบับ** · สาย AC คงทุกสิทธิ์เดิม
 *   · ใบที่ไม่เคยอนุมัติ: ผู้อนุมัติใช้ "ตีกลับ" ไม่ใช่ยกเลิก
 *   · Rev+1 เปิดค้างอยู่บนฉบับที่อนุมัติแล้ว = ยังยกเลิกได้ (ฉบับที่อนุมัติยังเป็นฉบับที่ใช้)
 *   · Rev ที่ผู้อนุมัติเปิด สาย AC ยังเป็นคนยื่น (ปุ่มยื่นไม่ขยับ)
 */
const APPROVERS = ['owner', 'sup', 'cd', 'cm'];

test('ผู้อนุมัติ = ขั้น AE (เจ้าของดีล) หรือขั้น AE Sup (CD/CM/AE Sup) หรือ admin — ถามตัวตัดสินเดิมสองตัว', () => {
  for (const who of [...APPROVERS, 'admin']) {
    assert.equal(isProductSpecDocumentApprover(U[who], OWNER_ID), true, who);
  }
  for (const who of ['ac', 'ac2', 'ae2', 'senior', 'rd']) {
    assert.equal(isProductSpecDocumentApprover(U[who], OWNER_ID), false, who);
  }
  // เจ้าของดีลนับตาม `sales_deals.ownerId` ปัจจุบัน — เปลี่ยนเจ้าของ = สิทธิ์ย้ายตาม (เหมือนขั้นอนุมัติ)
  assert.equal(isProductSpecDocumentApprover(U.owner, U.ae2.id), false);
  assert.equal(isProductSpecDocumentApprover(U.ae2, U.ae2.id), true);
  assert.equal(isProductSpecDocumentApprover(U.owner, null), false);
});

test('เคยอนุมัติแล้ว = currentRevNo มีค่า · Rev ล่าสุด approved/superseded · หรือมี Rev>0 (เกิดจากฉบับอนุมัติเท่านั้น)', () => {
  assert.equal(hasApprovedRevision(doc, rev('approved')), true);
  assert.equal(hasApprovedRevision(doc, rev('superseded')), true);
  assert.equal(hasApprovedRevision({ ...doc, currentRevNo: 0 }, rev('draft', { revNo: 1 })), true);
  // 🪤 อนุมัติขั้นสุดท้ายแล้วแต่ `applyFinalApproval` ล้ม (currentRevNo ยังว่าง) แล้วมี Rev.01 เปิดต่อ
  assert.equal(hasApprovedRevision({ ...doc, currentRevNo: null }, rev('pending_ae', { revNo: 1 })), true);
  for (const status of ['draft', 'pending_ae', 'pending_ae_supervisor', 'rejected']) {
    assert.equal(hasApprovedRevision(doc, rev(status)), false, status);
    assert.equal(hasApprovedRevision({ ...doc, currentRevNo: null }, rev(status)), false, status);
  }
  assert.equal(hasApprovedRevision(null, null), false);
});

test('ตัวตัดสินแก้ไข/ยกเลิก: สาย AC ได้ทุกกรณีเหมือนเดิม · ผู้อนุมัติยกเลิกได้เฉพาะใบที่เคยอนุมัติ', () => {
  const approvedLatest = rev('approved');
  const pendingLatest = rev('pending_ae');
  for (const who of ['ac', 'ac2', 'admin']) {
    assert.equal(canReviseProductSpecDocument(U[who], OWNER_ID), true, who);
    for (const latest of [approvedLatest, pendingLatest]) {
      assert.equal(canVoidProductSpecDocument({ user: U[who], dealOwnerId: OWNER_ID, document: doc, latest }), true, who);
    }
  }
  for (const who of APPROVERS) {
    assert.equal(canReviseProductSpecDocument(U[who], OWNER_ID), true, who);
    assert.equal(canVoidProductSpecDocument({ user: U[who], dealOwnerId: OWNER_ID, document: doc, latest: approvedLatest }), true, who);
    assert.equal(canVoidProductSpecDocument({ user: U[who], dealOwnerId: OWNER_ID, document: doc, latest: pendingLatest }), false, who);
  }
  for (const who of ['ae2', 'senior', 'rd']) {
    assert.equal(canReviseProductSpecDocument(U[who], OWNER_ID), false, who);
    assert.equal(canVoidProductSpecDocument({ user: U[who], dealOwnerId: OWNER_ID, document: doc, latest: approvedLatest }), false, who);
  }
  assert.equal(canVoidProductSpecDocument({}), false);
});

/* Rev.01 ที่เปิดค้างอยู่บนฉบับที่อนุมัติแล้ว — ผู้อนุมัติได้ยกเลิกเพิ่มจากปุ่มอนุมัติ/ตีกลับเดิม
   ปุ่มปลายทางของใบนี้คือยกเลิก (Rev>0 ลบไม่ได้) ⇒ ไม่มีใครเห็น "ลบร่าง" */
for (const currentRevNo of [0, null]) {
  for (const status of ['draft', 'pending_ae', 'pending_ae_supervisor', 'rejected']) {
    for (const [who, user] of Object.entries(U)) {
      const label = currentRevNo === null ? 'currentRevNo ว่าง (ปิดการอนุมัติไม่สำเร็จ)' : `currentRevNo ${currentRevNo}`;
      test(`ปุ่มของ ${who} เมื่อ Rev.01 เป็น ${status} บนฉบับที่อนุมัติแล้ว · ${label}`, () => {
        const expected = {
          ...exitSwapped(MATRIX[status][who]),
          ...(APPROVERS.includes(who) ? { void: 'ok' } : {}),
        };
        const actual = run(status, user, {
          document: { ...doc, currentRevNo },
          latest: rev(status, { revNo: 1 }),
        });
        assert.deepEqual(actual, expected);
        assert.equal(actual.remove, undefined, 'Rev.01 ลบไม่ได้ — ปุ่มปลายทางคือยกเลิก');
      });
    }
  }
}

test('🔴 ผู้อนุมัติยกเลิกใบที่ไม่เคยอนุมัติไม่ได้ — ใบที่รออนุมัติใช้ "ตีกลับ" (มติ 24/09)', () => {
  const traces = [{}, { firstSubmittedAt: '2026-09-23T02:00:00.000Z' }];
  for (const status of ['draft', 'pending_ae', 'pending_ae_supervisor', 'rejected']) {
    for (const trace of traces) {
      for (const who of APPROVERS) {
        const actions = documentActions({
          document: doc, latest: rev(status, trace), salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U[who],
        });
        assert.equal(actions.void.visible, false, `${who}@${status}`);
        assert.equal(actions.revise.visible, false, `${who}@${status}`);
        assert.equal(actions.remove.visible, false, `${who}@${status}`);
      }
    }
  }
});

test('ผู้อนุมัติ: SO ถูกย้อนการอนุมัติ = แก้ไขเอกสารติดด่านพร้อมเหตุ · ยกเลิกยังทำได้ (ถอย ไม่ใช่เดินหน้า)', () => {
  for (const who of APPROVERS) {
    const actions = documentActions({
      document: doc, latest: rev('approved'), salesOrder: revokedOrder, dealOwnerId: OWNER_ID, user: U[who],
    });
    assert.equal(actions.revise.visible, true, who);
    assert.match(actions.revise.reason, /ย้อนการอนุมัติ/, who);
    assert.deepEqual(actions.void, { visible: true, reason: null }, who);
  }
});

test('ผู้อนุมัติ: บรรทัด SO ถูกถอดบนใบที่อนุมัติแล้ว = แก้ไขติดด่าน ชี้ "ยกเลิก" ซึ่งเป็นปุ่มที่ตัวเองมีจริง', () => {
  const orphan = { ...doc, salesOrderLineId: null, currentRevNo: 0 };
  for (const who of APPROVERS) {
    const actions = documentActions({
      document: orphan, latest: rev('approved'), salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U[who],
    });
    assert.match(actions.revise.reason, /ถูกถอด/, who);
    assert.match(actions.revise.reason, /ยกเลิกเอกสาร/, who);
    assert.deepEqual(actions.void, { visible: true, reason: null }, who);
  }
});

test('ผู้อนุมัติที่เปิด Rev+1 แล้ว ยื่นเองไม่ได้ — ยื่นยังเป็นของสาย AC', () => {
  for (const who of APPROVERS) {
    const actions = documentActions({
      document: { ...doc, currentRevNo: 0 }, latest: rev('draft', { revNo: 1, submittedBy: null, createdBy: U[who].id }),
      salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U[who],
    });
    assert.equal(actions.submit.visible, false, who);
    assert.equal(actions.revise.visible, false, `${who}: มี Rev ค้างอยู่แล้ว เปิดซ้ำไม่ได้`);
  }
  assert.equal(documentActions({
    document: { ...doc, currentRevNo: 0 }, latest: rev('draft', { revNo: 1, submittedBy: null }),
    salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U.ac,
  }).submit.visible, true);
});

test('SO ไม่ผูกดีล (ไม่มีเจ้าของ): เหลือผู้อนุมัติขั้น AE Sup + admin ที่แก้ไข/ยกเลิกใบที่อนุมัติแล้วได้', () => {
  assert.deepEqual(run('approved', U.owner, { dealOwnerId: null }), {});
  assert.deepEqual(run('approved', U.sup, { dealOwnerId: null }), { revise: 'ok', void: 'ok' });
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

/* ── ลบร่างที่ยังไม่เคยยื่น (มติเจ้าของ 23/09/2569 · mig 0375) ────────────────
 *
 * 🪤 กับดักของเรื่องนี้: "ดึงกลับ" ล้าง `submittedAt/By/ByName` + `snapshot` จนหมด ⇒ ร่างที่
 *    เคยยื่นหน้าตาเหมือนร่างที่ไม่เคยยื่นทุกช่อง · รอยที่แยกได้คือ `firstSubmittedAt` ซึ่ง
 *    trigger ของ 0375 ประทับตอนเข้า `pending_ae` และลบไม่ได้ — เทสต์ชุดนี้ยืนบนช่องนั้น
 */

const draftRev = (over = {}) => ({
  id: 'PSDR1', documentId: 'PSD1', revNo: 0, status: 'draft',
  firstSubmittedAt: null, submittedAt: null, submittedBy: null, submittedByName: null,
  aeApprovedAt: null, supApprovedAt: null, rejectedAt: null, frozenAt: null, ...over,
});

test('⭐ ร่าง Rev.00 ที่ไม่เคยยื่น = ลบได้ · AC/admin เห็นปุ่ม คนอื่นไม่เห็น', () => {
  const fresh = draftRev();
  assert.equal(draftDeleteBlock(doc, fresh), null);
  assert.equal(isDeletableDraft(doc, fresh), true);
  for (const who of ['ac', 'ac2', 'admin']) {
    assert.deepEqual(documentActions({
      document: doc, latest: fresh, salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U[who],
    }).remove, { visible: true, reason: null }, who);
  }
  for (const who of ['owner', 'ae2', 'senior', 'sup', 'rd']) {
    assert.deepEqual(documentActions({
      document: doc, latest: fresh, salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U[who],
    }).remove, { visible: false, reason: null }, who);
  }
});

test('🔴 ร่างที่ "ยื่นแล้วดึงกลับ" ลบไม่ได้ — ตราประทับถูกล้างหมดแล้ว เหลือแต่ firstSubmittedAt', () => {
  // สภาพหลัง revisionPatch('withdraw'): status กลับเป็น draft · submittedAt/By/ByName = null · snapshot = null
  const withdrawn = draftRev({ firstSubmittedAt: '2026-09-23T02:00:00.000Z' });
  assert.match(draftDeleteBlock(doc, withdrawn), /เคยยื่นให้ผู้อนุมัติดูแล้ว/);
  assert.equal(isDeletableDraft(doc, withdrawn), false);
  for (const who of ['ac', 'admin']) {
    assert.equal(documentActions({
      document: doc, latest: withdrawn, salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U[who],
    }).remove.visible, false, who);
  }
});

test('รอยการยื่นช่องไหนก็ตามที่ยังเหลืออยู่ = ลบไม่ได้ (ไม่ได้ดูแค่ firstSubmittedAt ช่องเดียว)', () => {
  for (const field of ['firstSubmittedAt', 'submittedAt', 'aeApprovedAt', 'supApprovedAt', 'rejectedAt', 'frozenAt']) {
    const stamped = draftRev({ [field]: '2026-09-23T02:00:00.000Z' });
    assert.match(draftDeleteBlock(doc, stamped), /เคยยื่นให้ผู้อนุมัติดูแล้ว/, field);
  }
  // `submittedBy` ที่ค้างอยู่โดยไม่มีเวลา ไม่ใช่รอยการยื่น (ดึงกลับล้างทั้งคู่อยู่แล้ว)
  assert.equal(draftDeleteBlock(doc, draftRev({ submittedBy: U.ac.id })), null);
});

test('🔴 ทุกสถานะที่ไม่ใช่ร่าง ลบไม่ได้ และบอกเหตุเป็นภาษาคน (ไม่ใช่ "สถานะเปลี่ยนแล้ว")', () => {
  for (const status of DOC_REVISION_STATUSES.filter((s) => s !== 'draft')) {
    const block = draftDeleteBlock(doc, draftRev({ status }));
    assert.ok(block, status);
    assert.match(block, /ไม่ใช่ร่างที่ยังไม่ได้ยื่น|ยกเลิกเอกสาร/, status);
    assert.equal(documentActions({
      document: doc, latest: draftRev({ status }), salesOrder: approvedOrder, dealOwnerId: OWNER_ID, user: U.admin,
    }).remove.visible, false, status);
  }
});

test('🔴 เอกสารที่อนุมัติแล้ว (currentRevNo มีค่า) / มี Rev.01 / ถูก void — ลบไม่ได้ทั้งหมด', () => {
  assert.match(draftDeleteBlock({ ...doc, currentRevNo: 0 }, draftRev()), /ผ่านการอนุมัติแล้ว \(Rev\.00\)/);
  assert.match(draftDeleteBlock({ ...doc, currentRevNo: 1 }, draftRev()), /ผ่านการอนุมัติแล้ว \(Rev\.01\)/);
  assert.match(draftDeleteBlock(doc, draftRev({ revNo: 1 })), /มี Rev\.01 แล้ว/);
  assert.match(draftDeleteBlock({ ...doc, status: 'void' }, draftRev()), /ยกเลิกแล้ว/);
  // ใบที่ void แล้วไม่มีปุ่มอะไรเลยอยู่แล้ว (documentActions ตัดตั้งแต่ต้น) — รวมปุ่มลบ
  assert.equal(documentActions({
    document: { ...doc, status: 'void' }, latest: draftRev(), salesOrder: approvedOrder, user: U.admin,
  }).remove.visible, false);
});

test('ลบร่างไม่ผูกกับสถานะของ SO — ถอย ไม่ใช่เดินหน้า (เหมือนดึงกลับ/ยกเลิก)', () => {
  for (const salesOrder of [{ ...approvedOrder, status: 'draft' }, null]) {
    assert.deepEqual(documentActions({
      document: doc, latest: draftRev(), salesOrder, dealOwnerId: OWNER_ID, user: U.ac,
    }).remove, { visible: true, reason: null });
  }
  // บรรทัด SO ถูกถอด = ยังเก็บกวาดร่างที่ออกค้างไว้ได้
  assert.equal(documentActions({
    document: { ...doc, salesOrderLineId: null }, latest: draftRev(), salesOrder: approvedOrder, user: U.ac,
  }).remove.visible, true);
});

test('draftDeleteBlock ทนกับก้อนที่ไม่ครบ — ไม่มีเอกสาร/ไม่มี Rev ต้องไม่บอกว่าลบได้', () => {
  assert.ok(draftDeleteBlock(null, draftRev()));
  assert.ok(draftDeleteBlock(doc, null));
  assert.equal(isDeletableDraft(undefined, undefined), false);
});

/* ── ปุ่มปลายทาง: "ซ่อนปุ่มยกเลิกช่วงร่าง" (มติเจ้าของ 23/09/2569) ─────────────────
 *
 * 🔴 ข้อที่ห้ามพังที่สุดของมติข้อนี้คือ **ทางตัน** — ซ่อนยกเลิกบนใบที่ลบไม่ได้ = ใบค้างตลอดกาล
 *    ⇒ เดินทุกสถานะ × ทุกรอยการยื่น × ใบปกติ/บรรทัดถูกถอด × SO อนุมัติ/ถูกย้อน/หาย × ทุกคน
 *    แล้วบังคับว่า AC/admin ได้ปุ่มปลายทาง **หนึ่งตัวพอดี** (ไม่ใช่ศูนย์ ไม่ใช่สอง) ส่วนคนอื่นไม่ได้เลย
 * ⭐ มติ 24/09/2569: ผู้อนุมัติ (เจ้าของดีล · CD/CM/AE Sup) ได้ "ยกเลิก" หนึ่งตัวพอดีบนใบที่เคยอนุมัติแล้ว
 *    และไม่เคยได้ "ลบร่าง" · คนที่ไม่ใช่ทั้งสองกลุ่มยังได้ศูนย์ตัว
 */
test('🔴 ไม่มีทางตัน: ใบ active ทุกใบ AC/admin ได้ยกเลิกหรือลบ ตัวใดตัวหนึ่งพอดี · ผู้อนุมัติได้ยกเลิกเฉพาะใบที่เคยอนุมัติ', () => {
  const traces = [{}, ...SUBMIT_TRACE_FIELDS.map((field) => ({ [field]: '2026-09-23T02:00:00.000Z' }))];
  const documents = [
    doc, { ...doc, salesOrderLineId: null }, { ...doc, currentRevNo: 0 },
  ];
  let checked = 0;
  for (const document of documents) {
    for (const status of DOC_REVISION_STATUSES) {
      for (const revNo of [0, 1]) {
        for (const trace of traces) {
          for (const salesOrder of [approvedOrder, revokedOrder, null]) {
            for (const [who, user] of Object.entries(U)) {
              const latest = rev(status, { revNo, submittedBy: null, ...trace });
              const actions = documentActions({ document, latest, salesOrder, dealOwnerId: OWNER_ID, user });
              const exits = [actions.void.visible, actions.remove.visible].filter(Boolean).length;
              const where = `${who} · ${status} · Rev.${revNo} · ${Object.keys(trace)[0] || 'ไม่มีรอย'} · ${salesOrder?.status || 'ไม่มี SO'}`;
              if (canIssueProductSpecDocument(user.role)) {
                assert.equal(exits, 1, `${where}: ต้องมีปุ่มปลายทางหนึ่งตัวพอดี`);
                const key = documentExitKey(document, latest);
                assert.equal(actions[key].visible, true, `${where}: ปุ่มที่โชว์ต้องตรงกับ documentExitKey`);
                // ปุ่มปลายทางไม่เคยติดด่าน — ถอย ไม่ใช่เดินหน้า
                assert.equal(actions[key].reason, null, where);
              } else if (isProductSpecDocumentApprover(user, OWNER_ID) && hasApprovedRevision(document, latest)) {
                /* ⭐ มติ 24/09: ผู้อนุมัติได้ "ยกเลิก" บนใบที่เคยอนุมัติแล้ว — ใบแบบนี้ลบไม่ได้เสมอ
                   (`hasApprovedRevision` ⇒ `draftDeleteBlock` ไม่ว่าง) ⇒ ปุ่มปลายทางหนึ่งตัวพอดีคือยกเลิก */
                assert.equal(exits, 1, `${where}: ผู้อนุมัติบนใบที่เคยอนุมัติต้องมียกเลิกหนึ่งตัวพอดี`);
                assert.equal(documentExitKey(document, latest), 'void', where);
                assert.deepEqual(actions.void, { visible: true, reason: null }, where);
              } else {
                assert.equal(exits, 0, `${where}: คนที่ไม่ใช่ AC/admin (และผู้อนุมัติบนใบที่ไม่เคยอนุมัติ) ต้องไม่เห็นทั้งสองปุ่ม`);
              }
              // 🔴 ลบร่างเป็นของสาย AC/admin เท่านั้น — ผู้อนุมัติไม่เคยเห็นปุ่มลบ
              if (!canIssueProductSpecDocument(user.role)) {
                assert.equal(actions.remove.visible, false, `${where}: ลบร่างต้องไม่โผล่ให้คนนอกสาย AC`);
              }
              checked += 1;
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 2000, `ต้องเดินครบทั้งตาราง (เดินไป ${checked})`);
});

test('ยกเลิกถูกซ่อนเฉพาะร่างที่ลบได้จริง — ตัวตัดสินเดียวกับปุ่มลบ (isDeletableDraft)', () => {
  const fresh = draftRev();
  assert.equal(documentExitKey(doc, fresh), 'remove');
  for (const field of SUBMIT_TRACE_FIELDS) {
    assert.equal(documentExitKey(doc, draftRev({ [field]: '2026-09-23T02:00:00.000Z' })), 'void', field);
  }
  assert.equal(documentExitKey({ ...doc, currentRevNo: 0 }, fresh), 'void');
  assert.equal(documentExitKey(doc, draftRev({ revNo: 1 })), 'void');
  assert.equal(documentExitKey({ ...doc, status: 'void' }, fresh), null, 'ใบที่ void แล้วไม่มีปุ่มปลายทาง');
  assert.equal(documentExitKey(doc, null), null);
  assert.equal(documentExitKey(null, fresh), null);
});

test('ข้อความตอบ void บนร่างที่ไม่เคยยื่น บอกทางที่ใช้ได้จริง (ไม่ใช่ "สถานะเปลี่ยนแล้ว")', () => {
  assert.match(FRESH_DRAFT_VOID_BLOCK, /ลบร่างเอกสารถาวร/);
  assert.doesNotMatch(FRESH_DRAFT_VOID_BLOCK, /สถานะเปลี่ยนแล้ว/);
});

test('ตัวตัดสินกับ RPC เห็นไม่ตรงกัน: ข้อความชี้ผู้ดูแลระบบ ไม่ชี้ปุ่มยกเลิก/ลบ (ไม่ส่งคนวน)', () => {
  assert.match(DRAFT_EXIT_MISMATCH, /แจ้งผู้ดูแลระบบ/);
  assert.doesNotMatch(DRAFT_EXIT_MISMATCH, /ใช้ยกเลิกเอกสารแทน|ใช้ "ลบร่าง/);
});

/* 🔴 ตัวตัดสินอ่านรอยการยื่นจาก `latest` — ชุดคอลัมน์ Rev ที่ขาดช่องไหน ช่องนั้นเป็น undefined = "ไม่เคยยื่น"
   ⇒ การ์ดหน้า SO (ชุดย่อ) จะเสนอ "ลบ" บนใบที่ยื่นแล้วดึงกลับ **และซ่อน "ยกเลิก" ที่เป็นทางออกจริง** = ทางตัน */
test('🔴 ชุดคอลัมน์ Rev ทั้งสองชุดมีรอยการยื่นครบ (ทุกทางที่ประกอบ latest)', () => {
  const store = readFileSync(new URL('./productSpecStore.js', import.meta.url), 'utf8');
  for (const name of ['REVISION_COLUMNS', 'REVISION_SUMMARY_COLUMNS']) {
    const start = store.indexOf(`const ${name} = [`);
    assert.ok(start !== -1, `ไม่พบ ${name}`);
    const block = store.slice(start, store.indexOf('].join', start));
    for (const field of SUBMIT_TRACE_FIELDS) {
      assert.match(block, new RegExp(`'${field}'`), `${name} ขาด ${field}`);
    }
  }
});

/* มติ 23/09 "ซ่อนปุ่มยกเลิกช่วงร่าง": ใบที่ถูกย้ายไป SO ใบใหม่แบบไม่มีบรรทัดอาจเป็นร่างที่ไม่เคยยื่น (ปุ่ม = ลบ)
   ⇒ คำเตือนตอน SO ออก Rev ห้ามสัญญาปุ่ม "ยกเลิก" ตายตัว — ชี้ที่ที่ปุ่มอยู่แทน */
test('คำเตือนย้ายเอกสารแบบไม่มีบรรทัด ไม่ชี้ปุ่มยกเลิกตายตัว', () => {
  const store = readFileSync(new URL('./productSpecStore.js', import.meta.url), 'utf8');
  const start = store.indexOf('export async function moveDocumentsToRevisedOrder');
  const body = store.slice(start, store.indexOf('\n}\n', start));
  const line = body.match(/warn\(doc, `ไม่พบบรรทัดเดียวกัน[^`]*`\)/);
  assert.ok(line, 'ไม่พบคำเตือนบรรทัดหาย');
  assert.doesNotMatch(line[0], /ยกเลิกได้ที่/);
  assert.match(line[0], /ลบร่าง\/ยกเลิก/);
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
