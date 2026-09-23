/* ตัวประกอบภาพของหน้าเอกสาร FM-SA-04 + การ์ดบนหน้า SO (mig 0370 · มติ 21/09/2569)
 *
 * ด่านจริงอยู่ที่ `documentActions` (มีเมทริกซ์เทสต์ของตัวเอง) — ที่นี่ล็อกว่า:
 *   · ทุกปุ่มที่ตัวตัดสินโชว์ ต้องขึ้นบนการ์ด **ครั้งเดียว** พร้อมเหตุ (ไม่หาย ไม่ซ้ำ)
 *   · ทุกการกระทำมีโมดัลที่บอกผลลัพธ์ (กฎ approval-confirm-modals)
 *   · รางบอกขั้นที่ตีกลับ และงานกลับไปอยู่ที่ AC
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DOC_DELETE_KEY, DOC_REASON_ACTIONS, SPEC_DOC_NEW_FOOTER, docActionDoneMessage, docApiAction,
  docConfirmPrompt, docContentSource,
  docContentSummary, docControlActions, docHeadline, docPrintHref, docRailSteps, docReasonPrompt,
  docRevisionRows, docRevisionTone, followUpLineView, lineRemovedNotice, liveIllustrationNote, liveSpecDocumentCount,
  orphanRemoveFailureOutcome, productSpecPageHref,
  salesOrderHref, salesOrderSpecDocEffect, specDocCreateApiPath, specDocDraftPreviewHref, specDocNewApiPath,
  specDocNewLoadProblem, specDocNewOrderFacts, specDocNewView, specDocNextNumberText, specDocSavedMessage,
  specDocumentHref, specDocumentNewHref,
} from './productSpecDocView.js';
import { DOC_ACTION_KEYS, DOC_REASON_MIN, documentActions, documentCreateGate } from './productSpecDocWorkflow.js';

const doc = {
  id: 'PSD1', docNo: 'FM-SA-04-220969-001', status: 'active',
  salesOrderId: 'SO1', salesOrderLineId: 'SOL-1', specId: 'PSP1', productId: 'PRD1',
};
const order = { id: 'SO1', orderNumber: 'SO-26090001-0', status: 'approved' };
const owner = { id: 'U-OWNER', name: 'เอกี เจ้าของดีล' };
const rev = (status, over = {}) => ({
  id: 'PSDR1', documentId: 'PSD1', revNo: 0, status, submittedBy: 'U-AC', ...over,
});
const U = {
  ac: { id: 'U-AC', role: 'ac', name: 'เอซี' },
  owner: { id: 'U-OWNER', role: 'ae', name: 'เอกี เจ้าของดีล' },
  sup: { id: 'U-SUP', role: 'ae_supervisor', name: 'หัวหน้า' },
  admin: { id: 'U-ADM', role: 'admin', name: 'แอดมิน' },
  rd: { id: 'U-RD', role: 'rd', name: 'อาร์ดี' },
};
const STATUSES = ['draft', 'pending_ae', 'pending_ae_supervisor', 'approved', 'rejected'];

test('ลิงก์ทุกปลายทางมาจากที่เดียว — ใบสั่งขายใช้เส้นสั้น /sa', () => {
  assert.equal(specDocumentHref('PSD1'), '/sales-planning/spec-documents/PSD1');
  assert.equal(salesOrderHref('SO1'), '/sa/sales-orders/SO1');
  assert.equal(salesOrderHref(null), null);
  assert.equal(productSpecPageHref('PRD1'), '/database/products/PRD1/spec');
  assert.equal(docPrintHref('PSD1', 0), '/api/sales-planning/spec-documents/PSD1/document?rev=0');
  assert.equal(docPrintHref('PSD1', null), null);
  // หน้า "ออกเอกสาร" (มติ 23/09) — หน้า · เส้นอ่าน · เส้นบันทึก (POST ตัวเดิม) · กระดาษร่าง
  assert.equal(specDocumentNewHref('SO1', 'SOL-1'), '/sales-planning/spec-documents/new?order=SO1&line=SOL-1');
  assert.equal(specDocumentNewHref('SO1', null), null);
  assert.equal(specDocumentNewHref(null, 'SOL-1'), null);
  assert.equal(specDocNewApiPath('SO1', 'SOL-1'), '/api/sales-planning/sales-orders/SO1/spec-documents/new?line=SOL-1');
  assert.equal(specDocNewApiPath('SO1', ''), null);
  assert.equal(specDocCreateApiPath('SO1'), '/api/sales-planning/sales-orders/SO1/spec-documents');
  assert.equal(specDocCreateApiPath(''), null);
  assert.equal(specDocDraftPreviewHref('SO1', 'SOL-1'), '/api/sales-planning/sales-orders/SO1/spec-documents/preview?line=SOL-1');
  assert.equal(specDocDraftPreviewHref('SO1', null), null);
  // id ใน query ถูกห่อ — ลิงก์ต้องไม่พังวันที่ id มีอักขระพิเศษ
  assert.equal(specDocumentNewHref('SO 1', 'L&2'), '/sales-planning/spec-documents/new?order=SO%201&line=L%262');
});

test('คีย์ของตัวตัดสิน → action ของ API ครบทุกตัว (กลับทิศของ DOC_ACTION_KEYS)', () => {
  for (const [api, key] of Object.entries(DOC_ACTION_KEYS)) {
    assert.equal(docApiAction(key), api);
  }
  assert.equal(docApiAction('อะไร'), null);
});

test('🔴 ทุกปุ่มที่ตัวตัดสินโชว์ ขึ้นบนการ์ดครั้งเดียว พร้อมเหตุเดียวกัน — ทุกสถานะ ทุกคน', () => {
  for (const status of STATUSES) {
    for (const user of Object.values(U)) {
      const latest = rev(status);
      const actions = documentActions({
        document: doc, latest, salesOrder: order, dealOwnerId: owner.id, user,
      });
      const card = docControlActions({ actions, document: doc, latest });
      const all = [card.primaryAction, ...card.secondaryActions, ...card.dangerActions].filter(Boolean);
      const ids = all.map((a) => a.id);
      assert.equal(new Set(ids).size, ids.length, `${status}/${user.role}: ปุ่มซ้ำ ${ids}`);
      for (const [key, gate] of Object.entries(actions)) {
        const button = all.find((a) => a.id === key);
        if (!gate.visible) {
          assert.equal(button, undefined, `${status}/${user.role}: ${key} ต้องไม่โชว์`);
          continue;
        }
        assert.ok(button, `${status}/${user.role}: ${key} หายจากการ์ด`);
        assert.equal(button.disabled, Boolean(gate.reason));
        assert.equal(button.disabledReason, gate.reason || null);
      }
    }
  }
});

test('ปุ่มหลักคือก้าวที่กดได้ตัวแรก — ไม่ใช่ปุ่มที่ติดด่าน', () => {
  const latest = rev('draft');
  const asAdmin = docControlActions({
    actions: documentActions({ document: doc, latest, salesOrder: order, dealOwnerId: owner.id, user: U.admin }),
    document: doc, latest,
  });
  assert.equal(asAdmin.primaryAction.id, 'submit');
  // admin เห็นอนุมัติทั้งสองขั้นพร้อมเหตุ "ยังไม่ได้ยื่น"
  const ae = asAdmin.secondaryActions.find((a) => a.id === 'aeApprove');
  assert.equal(ae.disabled, true);

  const pendingSup = rev('pending_ae_supervisor');
  const asSup = docControlActions({
    actions: documentActions({ document: doc, latest: pendingSup, salesOrder: order, dealOwnerId: owner.id, user: U.sup }),
    document: doc, latest: pendingSup,
  });
  assert.equal(asSup.primaryAction.id, 'supApprove');
  assert.equal(asSup.primaryAction.disabled, false);
  assert.ok(asSup.dangerActions.find((a) => a.id === 'reject'));
});

test('SO ถูกย้อนการอนุมัติ = ปุ่มยื่นยังอยู่เป็นปุ่มหลักพร้อมเหตุ', () => {
  const latest = rev('draft');
  const card = docControlActions({
    actions: documentActions({
      document: doc, latest, salesOrder: { ...order, status: 'approval_revoked' }, dealOwnerId: owner.id, user: U.ac,
    }),
    document: doc, latest,
  });
  assert.equal(card.primaryAction.id, 'submit');
  assert.equal(card.primaryAction.disabled, true);
  assert.match(card.primaryAction.disabledReason, /ใบสั่งขาย/);
});

test('ปุ่มพิมพ์ชี้กระดาษของ Rev ล่าสุด เปิดแท็บใหม่ · ปุ่มคลิกส่งคีย์ของตัวตัดสิน', () => {
  const latest = rev('approved', { revNo: 2 });
  const seen = [];
  const card = docControlActions({
    actions: documentActions({ document: doc, latest, salesOrder: order, dealOwnerId: owner.id, user: U.ac }),
    document: doc, latest, onAction: (key) => seen.push(key),
  });
  const print = card.secondaryActions.find((a) => a.id === 'print');
  assert.equal(print.href, '/api/sales-planning/spec-documents/PSD1/document?rev=2');
  assert.equal(print.external, true);
  assert.equal(card.primaryAction.id, 'revise');
  assert.match(card.primaryAction.label, /Rev\.03/);
  card.primaryAction.onClick();
  assert.deepEqual(seen, ['revise']);
});

test('เอกสารที่ยกเลิกแล้ว = ไม่มีปุ่มลงมือ เหลือแค่พิมพ์', () => {
  const latest = rev('draft');
  const voided = { ...doc, status: 'void' };
  const card = docControlActions({
    actions: documentActions({ document: voided, latest, salesOrder: order, dealOwnerId: owner.id, user: U.admin }),
    document: voided, latest,
  });
  assert.equal(card.primaryAction, null);
  assert.deepEqual(card.secondaryActions.map((a) => a.id), ['print']);
  assert.deepEqual(card.dangerActions, []);
});

test('พาดหัว: บอก Rev + สถานะ + คนที่ลงมือล่าสุด', () => {
  const pending = docHeadline({
    document: doc, dealOwner: owner,
    latest: rev('pending_ae', { submittedByName: 'เอซี', submittedAt: '2026-09-22T02:00:00Z' }),
  });
  assert.equal(pending.status, 'Rev.00 · รอ AE อนุมัติ');
  assert.match(pending.sub, /ยื่นโดย เอซี · 22\/09\/2026/);
  assert.match(pending.sub, /รอ เอกี เจ้าของดีล อนุมัติ/);

  const rejected = docHeadline({
    document: doc,
    latest: rev('rejected', { rejectedByName: 'หัวหน้า', rejectionReason: 'ฝาไม่ตรงตัวอย่าง', rejectedStage: 'ae_supervisor' }),
  });
  assert.match(rejected.sub, /ตีกลับโดย หัวหน้า/);
  assert.match(rejected.sub, /ฝาไม่ตรงตัวอย่าง/);
  assert.equal(rejected.tone, 'danger');

  const revised = docHeadline({ document: doc, latest: rev('draft', { revNo: 1, reason: 'ลูกค้าเปลี่ยนฝา' }) });
  assert.match(revised.sub, /ลูกค้าเปลี่ยนฝา/);

  const voided = docHeadline({ document: { ...doc, status: 'void', voidReason: 'ลูกค้ายกเลิก', voidedByName: 'เอซี' } });
  assert.equal(voided.status, 'ยกเลิกแล้ว');
  assert.match(voided.sub, /ลูกค้ายกเลิก/);
  assert.match(docHeadline({ document: doc, latest: rev('approved') }).color, /^var\(--/);
});

test('ราง: สามขั้น AC ยื่น → AE → AE Sup · สถานะที่ WorkflowRail รู้จักเท่านั้น', () => {
  for (const status of [...STATUSES, 'superseded']) {
    const steps = docRailSteps({ document: doc, latest: rev(status), dealOwner: owner });
    assert.deepEqual(steps.map((s) => s.id), ['submit', 'ae', 'ae_supervisor']);
    for (const step of steps) {
      assert.ok(['done', 'current', 'pending'].includes(step.state), `${status}: ${step.state}`);
      assert.ok(step.hint, `${status}/${step.id}: ต้องมีคำใบ้`);
    }
  }
  const pending = docRailSteps({ document: doc, latest: rev('pending_ae', { submittedByName: 'เอซี' }), dealOwner: owner });
  assert.deepEqual(pending.map((s) => s.state), ['done', 'current', 'pending']);
  assert.match(pending[0].hint, /เอซี/);
  assert.match(pending[1].hint, /เอกี เจ้าของดีล/);
});

test('🪤 ตีกลับ: ป้ายติดที่ขั้นของคนตีกลับ ส่วนงานถอยไปที่ AC', () => {
  const atSup = docRailSteps({
    document: doc,
    latest: rev('rejected', { rejectedStage: 'ae_supervisor', rejectedByName: 'หัวหน้า', rejectedAt: '2026-09-22T02:00:00Z' }),
  });
  assert.equal(atSup[0].state, 'current');
  assert.match(atSup[0].hint, /แก้ตามเหตุผล/);
  assert.equal(atSup[2].rejected, true);
  assert.equal(atSup[2].label, 'AE Sup อนุมัติ · ตีกลับ');
  assert.match(atSup[2].hint, /ตีกลับโดย หัวหน้า · 22\/09\/2026/);
  assert.equal(atSup[1].rejected, false);

  const atAe = docRailSteps({ document: doc, latest: rev('rejected', { rejectedStage: 'ae', rejectedByName: 'เอกี' }) });
  assert.equal(atAe[1].rejected, true);
  assert.match(atAe[1].hint, /ตีกลับโดย เอกี/);
});

test('เอกสารยกเลิก = รางจางทั้งเส้น', () => {
  const steps = docRailSteps({ document: { ...doc, status: 'void' }, latest: rev('pending_ae') });
  assert.deepEqual(steps.map((s) => s.state), ['cancelled', 'cancelled', 'cancelled']);
});

/* ⚠️ รวม `remove` (ลบร่าง) ด้วย ทั้งที่ไม่ได้อยู่ใน DOC_ACTION_KEYS — มันเป็น DELETE ไม่ใช่ PATCH
   แต่กฎ approval-confirm-modals ไม่สนว่าเมธอดอะไร: ทุกปุ่มที่ลงมือต้องมีโมดัลที่บอกผลลัพธ์ */
test('🔴 ทุกการกระทำมีโมดัลที่บอกผลลัพธ์ — ยืนยันหรือเหตุผล ไม่มีคีย์ไหนหลุด', () => {
  const latest = rev('pending_ae_supervisor', { revNo: 1 });
  for (const key of [...Object.values(DOC_ACTION_KEYS), DOC_DELETE_KEY]) {
    const confirm = docConfirmPrompt(key, { document: doc, latest, dealOwner: owner });
    const reason = docReasonPrompt(key, { document: doc, latest });
    assert.ok(Boolean(confirm) !== Boolean(reason), `${key}: ต้องมีโมดัลชนิดเดียว`);
    assert.equal(DOC_REASON_ACTIONS.includes(key), Boolean(reason), `${key}: DOC_REASON_ACTIONS ไม่ตรง`);
    const prompt = confirm || reason;
    assert.ok(prompt.title && prompt.description && prompt.confirmLabel, `${key}: ขาดคีย์`);
    assert.match(prompt.detail, /สิ่งที่จะเกิดขึ้นทันที/, `${key}: ต้องบอกผลลัพธ์`);
    // ⭐ เลขที่รูปเดียวกับกระดาษ DDMMYY-XXX-RR (มติ 22/09) — Rev อยู่ในเลข ไม่ใช่เลขที่ดิบในฐาน
    assert.match(prompt.description, /220969-001-01/, `${key}: ต้องเอ่ยเลขที่ (รูปบนกระดาษ)`);
    assert.doesNotMatch(prompt.description, /FM-SA-04-220969-001/, `${key}: ต้องไม่ใช่เลขที่ดิบ`);
    assert.ok(docActionDoneMessage(key, { dealOwner: owner }));
  }
});

test('ยื่น: พูดเรื่องภาพนิ่งและชื่อ AE เจ้าของดีล · ยื่นใหม่หลังตีกลับพูดเรื่องล้างรอย', () => {
  const first = docConfirmPrompt('submit', { document: doc, latest: rev('draft'), dealOwner: owner });
  assert.match(first.detail, /ภาพนิ่ง/);
  assert.match(first.detail, /เอกี เจ้าของดีล/);
  assert.equal(first.confirmLabel, 'ยื่นขออนุมัติ');
  const again = docConfirmPrompt('submit', { document: doc, latest: rev('rejected'), dealOwner: owner });
  assert.match(again.detail, /รอยตีกลับ/);
  assert.equal(again.confirmLabel, 'ยื่นใหม่');
});

test('อนุมัติขั้นสุดท้าย: ถอนไม่ได้ · บอกว่าฉบับเดิมถูกแทน · บอกเลข Rev ถัดไปสำหรับการแก้', () => {
  const latest = rev('pending_ae_supervisor', { id: 'R2', revNo: 2 });
  const revisions = [latest, rev('approved', { id: 'R1', revNo: 1 }), rev('superseded', { id: 'R0', revNo: 0 })];
  const prompt = docConfirmPrompt('supApprove', { document: doc, latest, revisions });
  assert.match(prompt.detail, /ย้อนกลับเองไม่ได้/);
  assert.match(prompt.detail, /Rev\.01 ที่ใช้อยู่เดิม/);
  assert.match(prompt.detail, /Rev\.02 กลายเป็นฉบับที่ใช้/);
  assert.match(prompt.detail, /Rev\.03/);
  const firstTime = docConfirmPrompt('supApprove', { document: doc, latest: rev('pending_ae_supervisor') });
  assert.doesNotMatch(firstTime.detail, /ที่ใช้อยู่เดิม/);
});

/* ── ลบร่างที่ยังไม่เคยยื่น (มติเจ้าของ 23/09/2569 · mig 0375) ──────────────── */

test('⭐ ปุ่ม "ลบร่างเอกสารถาวร" อยู่ช่องอันตรายของการ์ด เฉพาะร่างที่ยังไม่เคยยื่น · ยื่นแล้ว "ยกเลิกเอกสาร" กลับมาแทน', () => {
  const fresh = rev('draft', { submittedBy: null });
  const card = docControlActions({
    actions: documentActions({ document: doc, latest: fresh, salesOrder: order, dealOwnerId: owner.id, user: U.ac }),
    document: doc, latest: fresh,
  });
  const remove = card.dangerActions.find((button) => button.id === DOC_DELETE_KEY);
  assert.ok(remove, 'ปุ่มลบร่างต้องอยู่ช่องอันตราย');
  /* ⚠️ ป้ายต้องบอกทั้งของและความถาวร — ปุ่มนี้ยืนที่เดียวกับที่ "ยกเลิกเอกสาร" เคยยืน ซึ่งในภาษาพูดแปลว่า
     "เอาออก" เหมือนกัน (ทรงเดียวกับ "ลบฉบับร่างถาวร" ของหน้าใบสั่งขาย) */
  assert.equal(remove.label, 'ลบร่างเอกสารถาวร');
  assert.match(remove.label, /ถาวร/, 'ปุ่มลบถาวรต้องบอกความถาวรบนตัวปุ่ม ไม่ใช่เฉพาะในโมดัล');
  assert.equal(remove.kind, 'delete');
  assert.equal(remove.disabled, false);
  /* ⭐ มติเจ้าของ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง" — ร่างที่ยังไม่เคยยื่นโชว์ **แค่** ลบร่าง
     (เดิมยืนคู่กับ "ยกเลิกเอกสาร" ให้คนต้องเลือกระหว่างสองคำที่แปลว่า "เอาออก" เหมือนกัน) */
  assert.deepEqual(card.dangerActions.map((button) => button.id), [DOC_DELETE_KEY]);
  const everyLabel = [card.primaryAction, ...card.secondaryActions, ...card.dangerActions]
    .filter(Boolean).map((button) => button.label);
  assert.ok(!everyLabel.includes('ยกเลิกเอกสาร'), 'ร่างที่ไม่เคยยื่นต้องไม่มีปุ่มยกเลิกที่ไหนบนการ์ดเลย');

  const submitted = rev('pending_ae', { firstSubmittedAt: '2026-09-23T02:00:00.000Z' });
  const afterSubmit = docControlActions({
    actions: documentActions({ document: doc, latest: submitted, salesOrder: order, dealOwnerId: owner.id, user: U.ac }),
    document: doc, latest: submitted,
  });
  assert.deepEqual(afterSubmit.dangerActions.map((button) => button.id), ['void']);

  // ยื่นแล้วดึงกลับ = กลับเป็นร่างหน้าตาเดิมทุกช่อง แต่เคยผ่านตาผู้อนุมัติแล้ว ⇒ ยกเลิกกลับมา ลบหาย
  const withdrawn = rev('draft', { submittedBy: null, firstSubmittedAt: '2026-09-23T02:00:00.000Z' });
  const afterWithdraw = docControlActions({
    actions: documentActions({ document: doc, latest: withdrawn, salesOrder: order, dealOwnerId: owner.id, user: U.ac }),
    document: doc, latest: withdrawn,
  });
  assert.deepEqual(afterWithdraw.dangerActions.map((button) => button.id), ['void']);
});

test('🔴 โมดัลลบร่างบอกสามเรื่องที่คนเข้าใจผิด: กู้ไม่ได้ · เลขที่ถูกเผาถาวร · ใบใหม่ได้เลขใหม่', () => {
  const prompt = docConfirmPrompt(DOC_DELETE_KEY, { document: doc, latest: rev('draft') });
  assert.equal(prompt.title, 'ลบร่างเอกสาร');
  assert.equal(prompt.confirmLabel, 'ลบร่างนี้');
  assert.equal(prompt.tone, 'danger', 'โมดัลของการลบต้องหน้าตาเป็นการลบ');
  assert.match(prompt.description, /ยืนยันลบ 220969-001-00/);
  assert.match(prompt.detail, /ย้อนกลับเองไม่ได้/);
  assert.match(prompt.detail, /ไม่มีถังขยะ/);
  assert.match(prompt.detail, /เลขที่ 220969-001 ถูกเผาทิ้งถาวร/);
  assert.match(prompt.detail, /ตัวนับไม่ถอยกลับ/);
  assert.match(prompt.detail, /ออกเอกสารใบใหม่ได้ทันที และใบใหม่จะได้เลขที่ใหม่/);
  assert.match(prompt.detail, /ยังไม่เคยยื่นให้ใครดู/, 'ต้องมี checklist ให้คนตรวจก่อนกด');
  assert.match(prompt.detail, /ไม่มีการแจ้งเตือนใคร/);
  // ⚠️ ไม่ใช่โมดัลเหตุผล — ลบร่างไม่ต้องเขียนเหตุผล (ต่างจาก "ยกเลิกเอกสาร")
  assert.equal(docReasonPrompt(DOC_DELETE_KEY, { document: doc, latest: rev('draft') }), null);
  assert.equal(DOC_REASON_ACTIONS.includes(DOC_DELETE_KEY), false);
});

test('โมดัลลบร่างของใบที่บรรทัด SO ถูกถอด ต้องไม่สัญญาว่าออกใบใหม่บนบรรทัดนั้นได้', () => {
  const prompt = docConfirmPrompt(DOC_DELETE_KEY, { document: doc, latest: rev('draft'), orphan: true });
  assert.match(prompt.detail, /ไม่มีบรรทัดให้ออกใบใหม่/);
  assert.doesNotMatch(prompt.detail, /ออกเอกสารใบใหม่ได้ทันที/);
});

test('ลบร่างไม่ใช่ action ของ PATCH — docApiAction ต้องไม่รู้จัก (จอจะได้ไม่ยิงผิดเมธอด)', () => {
  assert.equal(docApiAction(DOC_DELETE_KEY), null);
  assert.equal(Object.values(DOC_ACTION_KEYS).includes(DOC_DELETE_KEY), false);
  assert.match(docActionDoneMessage(DOC_DELETE_KEY), /เลขที่เดิมไม่นำกลับมาใช้/);
});

test('toast หลังลบร่างของใบที่บรรทัดถูกถอด ไม่ชวนออกใบใหม่บนบรรทัดที่ไม่มีแล้ว (เรื่องเดียวกับโมดัล)', () => {
  assert.match(docActionDoneMessage(DOC_DELETE_KEY), /ออกใบใหม่บนบรรทัดนี้ได้/);
  const orphan = docActionDoneMessage(DOC_DELETE_KEY, { orphan: true });
  assert.match(orphan, /เลขที่เดิมไม่นำกลับมาใช้/);
  assert.doesNotMatch(orphan, /ออกใบใหม่/);
});

/* ⭐ แถบ "บรรทัดถูกถอด" บนหน้าเอกสารเคยพูดตายตัวว่า "ยกเลิกเอกสารใบนี้แทน" — หลังมติ 23/09 ร่างที่ไม่เคยยื่น
   ไม่มีปุ่มยกเลิกแล้ว ⇒ แถบต้องชี้ปุ่มที่ใบนั้นมีจริง ไม่ส่งคนไปหาปุ่มที่ไม่มีอยู่ */
test('แถบเตือนบรรทัดถูกถอดชี้ปุ่มปลายทางที่มีจริง (ลบร่าง หรือ ยกเลิก)', () => {
  const orphanDoc = { ...doc, salesOrderLineId: null };
  const fresh = lineRemovedNotice({ document: orphanDoc, latest: rev('draft', { submittedBy: null }) });
  assert.match(fresh.title, /ถูกถอดแล้ว/);
  assert.match(fresh.body, /ลบร่าง/);
  assert.doesNotMatch(fresh.body, /ยกเลิก/);
  for (const latest of [rev('approved'), rev('rejected'), rev('draft', { firstSubmittedAt: '2026-09-23T02:00:00.000Z' })]) {
    assert.match(lineRemovedNotice({ document: orphanDoc, latest }).body, /ยกเลิกเอกสารใบนี้/, latest.status);
  }
  assert.equal(lineRemovedNotice({ document: { ...orphanDoc, status: 'void' }, latest: rev('draft') }), null);
});

/* หน้าเอกสารเปิดได้ทุกคนที่เห็น SO แต่ปุ่มปลายทางมีแค่ AC/admin ⇒ คนอื่นต้องได้ "รอ AC …" ไม่ใช่คำสั่งให้กดปุ่มที่ไม่มี */
test('แถบบรรทัดถูกถอด: คนที่ไม่มีปุ่มปลายทางได้ประโยค "รอ AC" · AC/admin ได้ประโยคให้ลงมือ', () => {
  const orphanDoc = { ...doc, salesOrderLineId: null };
  const shapes = [
    ['remove', rev('draft', { submittedBy: null }), /ลบร่าง/],
    ['void', rev('pending_ae'), /ยกเลิกเอกสารใบนี้/],
    ['void', rev('draft', { firstSubmittedAt: '2026-09-23T02:00:00.000Z' }), /ยกเลิกเอกสารใบนี้/],
  ];
  for (const [exit, latest, verb] of shapes) {
    for (const user of Object.values(U)) {
      const actions = documentActions({
        document: orphanDoc, latest, salesOrder: order, dealOwnerId: owner.id, user,
      });
      const notice = lineRemovedNotice({ document: orphanDoc, latest, actions });
      const mine = actions.remove.visible || actions.void.visible;
      assert.match(notice.body, verb, `${exit} · ${user.role}`);
      if (mine) assert.doesNotMatch(notice.body, /รอ AC/, `${exit} · ${user.role} กดเองได้`);
      else assert.match(notice.body, /รอ AC/, `${exit} · ${user.role} ไม่มีปุ่ม`);
      assert.equal(mine, ['ac', 'admin'].includes(user.role), `${exit} · ${user.role}`);
    }
  }
  // ไม่ส่ง actions = ไม่รู้ว่าใครดู ⇒ ทรงเดิม (ประโยคของคนกด)
  assert.doesNotMatch(lineRemovedNotice({ document: orphanDoc, latest: rev('pending_ae') }).body, /รอ AC/);
});

/* 🐞 UAT 23/09: ลบร่างจากการ์ดหน้า SO สำเร็จแต่คำตอบหายกลางทาง ⇒ การ์ดเคยขึ้น "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองอีกครั้ง"
   ทั้งที่แถวหายไปต่อหน้า · ตัวตัดสินอ่านการ์ดชุดใหม่ และเชื่อคำตอบของเซิร์ฟเวอร์ก่อน "แถวหาย" เสมอ */
test('ลบร่างจากการ์ดแล้วไม่ได้คำตอบว่าสำเร็จ: done / moved / retry ตัดสินจากการ์ดชุดใหม่', () => {
  const network = Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'), { name: 'ApiNetworkError' });
  const gateway = Object.assign(new Error('HTTP 504'), { status: 504 });
  const conflict = Object.assign(new Error('ลบร่างไม่ได้ — เคยยื่นแล้ว'), { status: 409 });
  const gone = Object.assign(new Error('ไม่พบเอกสารนี้'), { status: 404 });
  const others = { rows: [], orphans: [{ documentId: 'OTHER', removeAction: { visible: true } }] };
  const stillDeletable = { rows: [], orphans: [{ documentId: 'PSD1', removeAction: { visible: true }, voidAction: { visible: false } }] };
  const nowVoidOnly = { rows: [], orphans: [{ documentId: 'PSD1', removeAction: { visible: false }, voidAction: { visible: true } }] };
  const outcome = (failure, next) => orphanRemoveFailureOutcome({ failure, next, documentId: 'PSD1' });

  // ใบหายจากการ์ด + ไม่มีคำตอบให้เชื่อ (เน็ตหลุด/เกตเวย์) = เซิร์ฟเวอร์ลบไปแล้ว คำตอบแค่หาย
  assert.equal(outcome(network, others), 'done');
  assert.equal(outcome(gateway, others), 'done');
  // มีคำตอบของเซิร์ฟเวอร์ = เชื่อคำตอบ (404 มีคนลบไปก่อน · 409 ใบเปลี่ยนสภาพ) ⇒ ปิดโมดัล เหตุขึ้นแถบ
  assert.equal(outcome(gone, others), 'moved');
  assert.equal(outcome(conflict, others), 'moved');
  assert.equal(outcome(conflict, nowVoidOnly), 'moved');
  assert.equal(outcome(network, nowVoidOnly), 'moved');
  // ยังลบได้ = คำขอไม่ถึง/ล้มจริง ⇒ คงโมดัลให้กดใหม่ · โหลดการ์ดไม่ขึ้น = ไม่รู้ความจริง ห้ามเดา
  assert.equal(outcome(network, stillDeletable), 'retry');
  assert.equal(outcome(gateway, stillDeletable), 'retry');
  assert.equal(outcome(network, null), 'retry');
  assert.equal(outcome(conflict, null), 'retry');
});

test('หน้าเอกสาร: แถบบรรทัดถูกถอดมาจาก lineRemovedNotice · toast ลบรู้ว่าบรรทัดหายแล้ว', () => {
  const page = readFileSync(PAGE, 'utf8');
  assert.match(page, /lineRemovedNotice\(\{ document: specDoc, latest, actions: data\?\.actions \}\)/);
  // บรรทัดถูกถอด = ยื่นไม่ได้แล้ว ⇒ แถบ "แก้ที่หน้าสินค้าแล้วกลับมายื่น" ต้องไม่ขึ้นคู่กับแถบให้ลบ/ยกเลิก
  assert.match(page, /\{liveDraft && !lineRemoved \? \(\s*<StatusNotice\s+tone="info"/);
  assert.doesNotMatch(page, /ยกเลิกเอกสารใบนี้แทนการเดินด่าน/, 'ข้อความตายตัวแบบเดิมต้องไม่กลับมา');
  assert.match(page, /docActionDoneMessage\(DOC_DELETE_KEY, \{ orphan: lineRemoved \}\)/);
});

/* 🪤 กับดักที่เทสต์ข้างบนเปิดไว้: `docApiAction('remove')` เป็น `null` ⇒ ถ้าหน้าเอกสารส่งปุ่มลบ
   เข้าทาง `act()` เหมือนปุ่มอื่น มันจะยิง `PATCH { action: null }` แล้วได้ 400 "ไม่รู้จักการกระทำนี้"
   โดยไม่มีอะไรจับ (จอกับ API ต่างก็ถูกตามสัญญาของตัวเอง) ⇒ ล็อกที่ซอร์สของหน้าเลย */
const PAGE = join(
  dirname(fileURLToPath(import.meta.url)), '..', '..',
  'app', 'sales-planning', 'spec-documents', '[id]', 'page.js',
);

test('🔴 หน้าเอกสารยิงลบร่างด้วยเมธอด DELETE แล้วเด้งออกจากหน้า — ไม่ใช่ PATCH และไม่โหลดใบที่ลบไปแล้วซ้ำ', () => {
  const page = readFileSync(PAGE, 'utf8');
  const start = page.indexOf('const removeDraft');
  assert.ok(start > 0, 'หน้าเอกสารต้องมีทางลบร่างของตัวเอง');
  const body = page.slice(start, page.indexOf('const onAction', start));
  assert.match(body, /method: "DELETE"/);
  assert.doesNotMatch(body, /method: "PATCH"|docApiAction/);
  assert.doesNotMatch(body, /retry: true/, 'DELETE ห้ามลองใหม่เอง — รอบสองได้ 404 ทั้งที่ลบสำเร็จ');
  assert.match(body, /router\.replace\(/, 'ลบแล้วต้องออกจากหน้านี้');
  assert.match(body, /salesOrderHref\(orderId\)/);
  // โมดัลยืนยันต้องแยกทางไปหา removeDraft ไม่ใช่ปล่อยให้ตกลงไปที่ act()
  assert.match(page, /if \(confirmKey === DOC_DELETE_KEY\) \{ await removeDraft\(\); return; \}/);
});

test('🔴 ลบไม่ผ่าน + ใบชุดใหม่ลบไม่ได้แล้ว = ปิดโมดัลทิ้ง — ปุ่มที่การ์ดซ่อนแล้วต้องกดซ้ำไม่ได้', () => {
  /* 🐞 ของจริงที่วัดได้: มีคนกด "ยื่น" แทรกกลาง ⇒ DELETE ได้ 409 ⇒ จอดึงใบใหม่จนปุ่ม "ลบร่าง"
     หายจากการ์ดถูกต้องแล้ว **แต่โมดัลที่ค้างอยู่ยังพิมพ์ผลลัพธ์ของการลบ** ("บรรทัดใบสั่งขายนี้
     ว่างอีกครั้ง…") คร่อมแถบแดงที่บอกว่าลบไม่ได้ และปุ่ม "ลบร่างนี้" ยังกดได้ไม่จำกัด (ยิง DELETE
     เพิ่มใบละคลิก) ⇒ สวนกฎ ui-visibility-rule ที่ productSpecDocWorkflow.js ประกาศไว้เอง */
  const page = readFileSync(PAGE, 'utf8');
  const start = page.indexOf('const removeDraft');
  const body = page.slice(start, page.indexOf('const onAction', start));
  const catchAt = body.indexOf('} catch (deleteError) {');
  assert.ok(catchAt > 0, 'ต้องมีทางล้ม');
  const failure = body.slice(catchAt);
  // ต้องรอใบชุดใหม่ก่อนตัดสิน — `data` บนจอยังเป็นชุดเก่า (setState เป็น async)
  assert.match(failure, /const next = await load\(\{ background: true \}\)/);
  assert.match(failure, /next\.actions\?\.remove\?\.visible === false/);
  assert.match(failure, /setConfirmKey\(null\)/, 'ใบใหม่ลบไม่ได้แล้ว = ปิดโมดัล');
  assert.match(failure, /setWarning\(deleteError\.message/, 'เหตุผลของเซิร์ฟเวอร์ต้องขึ้นแถบของหน้า ไม่หายไปกับโมดัลที่ปิด');
  assert.match(failure, /throw deleteError/, 'กรณีอื่นที่กดใหม่ยังมีความหมาย ยังโยนให้โมดัลพิมพ์');
  // `load` ต้องคืนใบที่โหลดได้จริง ไม่งั้นเงื่อนไขข้างบนอ่านได้แค่ undefined แล้วเงียบ
  const loader = page.slice(page.indexOf('const load = useCallback'), page.indexOf('useEffect(() => { load(); }'));
  assert.match(loader, /return next;/);
  assert.match(loader, /return null;/);
});

test('โมดัลเหตุผลใช้ความยาวเดียวกับ API และพูดผลลัพธ์ตามชนิด', () => {
  const reject = docReasonPrompt('reject', { document: doc, latest: rev('pending_ae') });
  assert.equal(reject.minLength, DOC_REASON_MIN);
  assert.match(reject.description, /ขั้น AE เจ้าของดีล/);
  assert.equal(reject.tone, 'danger');
  const revise = docReasonPrompt('revise', { document: doc, latest: rev('approved', { revNo: 1 }) });
  assert.match(revise.title, /Rev\.02/);
  assert.match(revise.detail, /Rev\.01 ยังเป็นฉบับที่ใช้/);
  const voidIt = docReasonPrompt('void', { document: doc, latest: rev('draft') });
  assert.match(voidIt.detail, /ย้อนกลับเองไม่ได้/);
  assert.match(voidIt.detail, /นำกลับมาใช้ไม่ได้/);
  assert.match(voidIt.detail, /ออกเอกสารใบใหม่ได้/);
  const orphan = docReasonPrompt('void', { document: doc, orphan: true });
  assert.match(orphan.detail, /ถูกถอด/);
  // เอกสารค้าง (บรรทัดถูกถอด): การ์ดส่ง Rev มาด้วย ⇒ โมดัลพูดเลขเดียวกับแถว/toast (DDMMYY-XXX-RR)
  const orphanWithRev = docReasonPrompt('void', { document: doc, latest: { revNo: 2 }, orphan: true });
  assert.match(orphanWithRev.description, /ยกเลิก 220969-001-02 หรือไม่/);
  assert.match(orphanWithRev.detail, /เลขที่ 220969-001 ถูกปิดถาวร/, 'ยกเลิก = เลขที่ทั้งใบ (ทุก Rev) ไม่มี RR');
  assert.equal(docReasonPrompt('submit', { document: doc }), null);
});

test('ประวัติ Rev: ใหม่ก่อน · ตราประทับทุกขั้น · ทุกแถวพิมพ์ได้', () => {
  const rows = docRevisionRows([
    rev('superseded', { id: 'R0', revNo: 0, submittedByName: 'เอซี', supApprovedByName: 'หัวหน้า', supApprovedAt: '2026-09-01T00:00:00Z' }),
    rev('draft', { id: 'R1', revNo: 1, reason: 'ลูกค้าเปลี่ยนฝา' }),
  ], { documentId: 'PSD1' });
  assert.deepEqual(rows.map((r) => r.revLabel), ['Rev.01', 'Rev.00']);
  assert.deepEqual(rows.map((r) => r.docNoText), [null, null], 'ไม่ส่งเลขที่มา = ไม่มีเลขที่รายแถว');
  const numbered = docRevisionRows([rev('draft', { id: 'R1', revNo: 1 }), rev('superseded', { id: 'R0', revNo: 0 })],
    { documentId: 'PSD1', docNo: 'FM-SA-04-220969-001' });
  assert.deepEqual(numbered.map((r) => r.docNoText), ['220969-001-01', '220969-001-00']);
  assert.equal(rows[0].reason, 'ลูกค้าเปลี่ยนฝา');
  assert.equal(rows[0].submitted, null);
  assert.equal(rows[1].supApproved, 'หัวหน้า · 01/09/2026');
  assert.equal(rows[1].printHref, '/api/sales-planning/spec-documents/PSD1/document?rev=0');
  assert.equal(rows[1].statusLabel, 'ถูกแทนด้วย Rev. ใหม่');
  assert.equal(docRevisionTone('approved'), 'success');
});

test('เนื้อบนจอ: ร่าง/ตีกลับแสดงสเปคสด · ยื่นแล้วแสดงภาพนิ่ง', () => {
  assert.equal(docContentSource(rev('draft')), 'live');
  assert.equal(docContentSource(rev('rejected', { snapshot: { spec: {} } })), 'live');
  assert.equal(docContentSource(rev('pending_ae', { snapshot: { spec: {} } })), 'snapshot');
  assert.equal(docContentSource(rev('approved', { snapshot: null })), 'live');
  assert.equal(docContentSource(null), 'live');
});

test('สรุปเนื้อ: ภาพนิ่งกับสเปคสดได้รูปเดียวกัน', () => {
  const snapshot = {
    capturedAt: '2026-09-22T02:00:00Z',
    spec: {
      texture: 'เหลว',
      certifications: [
        { key: 'fda', label: 'เอกสารจดแจ้ง อย.', status: 'in_progress' },
        { key: 'coa', label: 'COA', status: '' },
      ],
    },
    items: [{ itemLabel: 'ฝา', detail: 'ฝาทอง', preparedByS: true, preparedByCustomer: true }],
    illustrations: [{ attachmentId: 'A1', caption: 'กล่องใหม่', fileName: 'a.jpg' }],
    order: { orderNumber: 'SO-26090001-0', qty: 100, unit: 'ขวด', dealOwnerName: 'เอกี' },
  };
  const frozen = docContentSummary({ source: 'snapshot', snapshot });
  assert.equal(frozen.source, 'snapshot');
  assert.equal(frozen.fields.find((f) => f.key === 'texture').value, 'เหลว');
  assert.equal(frozen.fields.length, 7, 'ระดับราคาตัดออก (มติ 22/09)');
  assert.equal(frozen.items[0].preparedBy, 'S&S · ลูกค้า');
  assert.equal(frozen.certifications[0].statusLabel, 'อยู่ระหว่างยื่น', 'แถว อย. ใช้คำของตัวเอง');
  assert.equal(frozen.certifications[1].statusLabel, 'ยังไม่ตอบ');
  assert.equal(frozen.illustrations[0].caption, 'กล่องใหม่');
  assert.equal(frozen.order.qty, 100);

  const live = docContentSummary({
    source: 'live', spec: { texture: 'ครีม', certifications: [], items: [{ itemLabel: 'ฝา' }] },
  });
  assert.equal(live.fields.find((f) => f.key === 'texture').value, 'ครีม');
  assert.equal(live.illustrations, null, 'สเปคสดยังไม่รู้ว่าจะถ่ายรูปไหน — ไม่ใช่ "ไม่มีรูป"');
  assert.equal(live.order, null);
  assert.equal(docContentSummary({ source: 'live', spec: null }), null);

  // หน้า "ออกเอกสาร" ส่งก้อนใบสั่งขายของตัวเองมากับสเปคสด (รูปเดียวกับ snapshot.order) · ภาพนิ่งไม่ยอมให้ทับ
  const withOrder = docContentSummary({
    source: 'live', spec: { certifications: [], items: [] }, order: { orderNumber: 'SO-X', qty: 5, unit: 'ขวด' },
  });
  assert.equal(withOrder.order.orderNumber, 'SO-X');
  assert.equal(withOrder.order.qty, 5);
  assert.equal(docContentSummary({ source: 'snapshot', snapshot, order: { orderNumber: 'SO-X' } }).order.orderNumber,
    'SO-26090001-0', 'ภาพนิ่งใช้ก้อนของตัวเองเสมอ');
});

test('🔴 เลขที่ที่จะได้ตอนบันทึก = เลขของวันนี้ตามเวลาไทย + Rev.00 (XXX รู้ล่วงหน้าไม่ได้)', () => {
  // 21/09/2026 23:30 UTC = 22/09/2026 เวลาไทย ⇒ 220969 (พ.ศ. 2569)
  assert.equal(specDocNextNumberText(new Date('2026-09-21T23:30:00Z')), '220969-XXX-00');
});

/* ── หน้า "ออกเอกสาร" (มติเจ้าของ 23/09/2569 "ยังไม่ต้องรันอะไร จนกว่าจะบันทึก") ─────────────── */

const newOrder = {
  id: 'SO1', orderNumber: 'SO-26090001-0', status: 'approved', origin: 'pipeline', quotationId: 'QT1',
  quotationNumber: 'QT-26090002-0', customerName: 'บริษัท ลูกค้า จำกัด', deliveryDueDate: '2026-10-30', docLanguage: 'th',
};
const newLine = { id: 'SOL-1', productId: 'PRD1', fgCode: 'FG-01-0001', description: 'สเปรย์', qty: null, unit: null };
const newSpec = { id: 'PSP1', productId: 'PRD1', texture: 'เหลว', certifications: [], items: [] };
/* payload รูปเดียวกับ `GET .../spec-documents/new` — ด่านคิดด้วย `documentCreateGate` ตัวจริง (ไม่ปลอม gate เอง)
   ⇒ เทสต์พิสูจน์ว่าหน้าอ่านผลของตัวตัดสินชุดเดียวกับ POST ไม่ใช่ค่าที่เทสต์แต่งขึ้น */
const newPayload = ({
  user = U.ac, order: orderOver = {}, line: lineOver = {}, spec = newSpec, existing = null, scopeReason = null,
  // API นับภาพเฉพาะตอนมีสเปคให้พิมพ์ — ไม่มีสเปค = ไม่ได้นับ (`null` = ไม่รู้ ไม่ใช่ "ไม่มีภาพ")
  canEditSpec = true, illustrationCount = spec ? 5 : null,
} = {}) => {
  const salesOrder = { ...newOrder, ...orderOver };
  const line = { ...newLine, ...lineOver };
  return {
    order: salesOrder,
    line,
    product: { id: 'PRD1', fgCode: 'FG-01-0001', productDescription: 'สเปรย์ปรับอากาศ', brandName: 'แบรนด์' },
    quantity: { qty: 300, unit: 'ขวด', source: 'quotation_line' },
    dealOwner: { id: 'U-OWNER', name: 'เอกี เจ้าของดีล' },
    spec,
    illustrationCount,
    scopeReason,
    gate: documentCreateGate({ user, salesOrder, line, spec, existingDocument: existing, scopeReason }),
    existingDocument: existing,
    canEditSpec,
  };
};
const NEW_NOW = new Date('2026-09-23T03:00:00Z');

test('⭐ หน้าออกเอกสาร: AC + ใบอนุมัติ + มีสเปค = ฟอร์มพร้อมบันทึก · ยกเลิกกลับใบสั่งขาย · เลขที่ออกตอนบันทึก', () => {
  let saved = 0;
  const view = specDocNewView(newPayload(), { onSave: () => { saved += 1; }, now: NEW_NOW });
  assert.equal(view.kind, 'form');
  assert.equal(view.blocker, null);
  const { control } = view;
  assert.equal(control.primaryAction.label, 'บันทึก');
  assert.equal(control.primaryAction.kind, 'save');
  assert.equal(control.primaryAction.disabled, false);
  control.primaryAction.onClick();
  assert.equal(saved, 1, 'ปุ่มบันทึกเรียกตัวบันทึกของหน้า');
  // ยกเลิก = ลิงก์กลับใบสั่งขายเฉย ๆ (ยังไม่มีอะไรถูกบันทึก — ไม่มีโมดัล ไม่มีคำขอ)
  assert.deepEqual(control.dangerActions.map((a) => [a.label, a.href, a.onClick]), [['ยกเลิก', '/sa/sales-orders/SO1', undefined]]);
  // ดูตัวอย่างกระดาษ = กระดาษร่างสด (แท็บใหม่) ไม่ใช่ปุ่มที่สร้างอะไร
  assert.deepEqual(control.secondaryActions.map((a) => [a.id, a.href, a.external]),
    [['preview', '/api/sales-planning/sales-orders/SO1/spec-documents/preview?line=SOL-1', true]]);
  assert.equal(control.footer, SPEC_DOC_NEW_FOOTER);
  assert.match(control.footer, /ออกตอนกดบันทึก/);
  assert.match(control.footer, /ใช้ซ้ำไม่ได้/);
  assert.match(control.footer, /ยังไม่มีอะไรถูกบันทึกจนกว่าจะกด/);
  // รางบอกเลขที่ของวันนี้ (XXX) และเจ้าของดีลที่จะต้องอนุมัติ
  assert.equal(control.workflowSteps[0].state, 'current');
  assert.match(control.workflowSteps[0].hint, /230969-XXX-00/);
  assert.match(control.workflowSteps[2].hint, /เอกี เจ้าของดีล/);
  for (const step of control.workflowSteps) assert.ok(['current', 'pending'].includes(step.state), 'รางรู้จักแค่ done/current/pending/cancelled');
  assert.equal(specDocNewView(newPayload(), { saving: true }).control.primaryAction.label, 'กำลังบันทึก…');
  // แก้สเปคที่หน้าสินค้า — เฉพาะคนที่แก้สเปคได้
  assert.equal(view.editSpecHref, '/database/products/PRD1/spec');
  assert.match(view.liveNotice, /แก้ที่หน้าสินค้า/);
  assert.equal(specDocNewView(newPayload({ canEditSpec: false })).editSpecHref, null);
  assert.doesNotMatch(specDocNewView(newPayload({ canEditSpec: false })).liveNotice, /แก้ที่หน้าสินค้า/);
  assert.equal(view.contentNotice, null);
});

test('หน้าออกเอกสาร: ไม่มีสิทธิ์ออก (ไม่ใช่ AC/admin) = คำบอกแทนฟอร์ม ไม่มีปุ่ม (ui-visibility-rule)', () => {
  for (const user of [U.owner, U.sup, U.rd]) {
    const view = specDocNewView(newPayload({ user }));
    assert.equal(view.kind, 'denied', user.role);
    assert.equal(view.control, null, `${user.role} ต้องไม่มีปุ่มบันทึก`);
    assert.match(view.notice.message, /AC/);
  }
  // admin ออกได้เหมือน AC
  assert.equal(specDocNewView(newPayload({ user: U.admin })).kind, 'form');
  // คำตอบไม่ครบรูป = ไม่ถือว่ามีสิทธิ์ (ด่านต้องไม่เปิดเอง)
  assert.equal(specDocNewView(null).kind, 'denied');
  assert.equal(specDocNewView({ order: newOrder }).kind, 'denied');
});

test('หน้าออกเอกสาร: บรรทัดมีเอกสารอยู่แล้ว = คำบอก + ลิงก์ไปเอกสารใบนั้น (ไม่ใช่ปุ่มบันทึกที่กดแล้ว 409)', () => {
  const view = specDocNewView(newPayload({
    existing: { id: 'PSD9', docNo: 'FM-SA-04-220969-001', docNoText: '220969-001', status: 'active' },
  }));
  assert.equal(view.kind, 'exists');
  assert.equal(view.control, null);
  assert.equal(view.notice.href, '/sales-planning/spec-documents/PSD9');
  assert.match(view.notice.message, /220969-001/);
});

test('🔴 หน้าออกเอกสาร: ติดด่าน = ปุ่มบันทึกอยู่แต่กดไม่ได้ พร้อมเหตุเป็นตัวหนังสือ — เหตุเดียวกับที่ POST ตอบ', () => {
  // ใบสั่งขายถูกย้อนการอนุมัติ
  const revoked = specDocNewView(newPayload({ order: { status: 'pending_approval' } }));
  assert.equal(revoked.kind, 'form');
  assert.equal(revoked.control.primaryAction.disabled, true);
  assert.match(revoked.control.primaryAction.disabledReason, /ยังไม่อยู่สถานะอนุมัติ/);
  assert.equal(revoked.blocker, revoked.control.primaryAction.disabledReason);
  // ยังดูกระดาษร่างได้ (มีสเปค) — การดูไม่บันทึกอะไร
  assert.equal(revoked.control.secondaryActions.length, 1);

  // สินค้ายังไม่มีสเปค ⇒ การ์ดเนื้อบอกเหตุเดียวกัน + ลิงก์ไปสร้างสเปค · ไม่มีกระดาษร่างให้ดู
  const noSpec = specDocNewView(newPayload({ spec: null }));
  assert.equal(noSpec.control.primaryAction.disabled, true);
  assert.match(noSpec.control.primaryAction.disabledReason, /ยังไม่มีสเปค/);
  assert.equal(noSpec.control.secondaryActions.length, 0);
  assert.equal(noSpec.contentNotice.title, 'สินค้านี้ยังไม่มีสเปค');
  assert.equal(noSpec.contentNotice.message, noSpec.blocker);
  assert.equal(noSpec.contentNotice.action.href, '/database/products/PRD1/spec');
  assert.equal(specDocNewView(newPayload({ spec: null, canEditSpec: false })).contentNotice.action, null);

  // นอกหมวด 01/02 — ไม่ใช่ "ยังไม่มีสเปค" และไม่ชวนไปสร้างสเปค
  const scope = specDocNewView(newPayload({ spec: null, scopeReason: 'สินค้าหมวด 03 ไม่มีใบสเปค' }));
  assert.equal(scope.control.primaryAction.disabledReason, 'สินค้าหมวด 03 ไม่มีใบสเปค');
  assert.equal(scope.contentNotice.title, 'บรรทัดนี้ไม่มีเนื้อเอกสารให้แสดง');
  assert.equal(scope.contentNotice.action, null);

  // บรรทัดไม่ผูกสินค้า
  const unlinked = specDocNewView(newPayload({ line: { productId: null }, spec: null }));
  assert.match(unlinked.control.primaryAction.disabledReason, /ไม่ได้ผูกสินค้า/);
  assert.equal(unlinked.control.secondaryActions.length, 0);
  assert.equal(unlinked.contentNotice.title, 'บรรทัดนี้ไม่มีเนื้อเอกสารให้แสดง');

  // ใบย้อนหลัง
  const historical = specDocNewView(newPayload({ order: { origin: 'historical' } }));
  assert.match(historical.control.primaryAction.disabledReason, /ย้อนหลัง/);
});

test('หน้าออกเอกสาร: ก้อนใบสั่งขายของเนื้อ = ของที่กระดาษจะพิมพ์ (จำนวนผลิตจาก quantity ไม่ใช่ line.qty ดิบ)', () => {
  const facts = specDocNewOrderFacts(newPayload());
  assert.deepEqual(facts, {
    orderNumber: 'SO-26090001-0',
    lineDescription: 'สเปรย์',
    qty: 300,
    unit: 'ขวด',
    deliveryDueDate: '2026-10-30',
    customerName: 'บริษัท ลูกค้า จำกัด',
    dealOwnerName: 'เอกี เจ้าของดีล',
  });
  assert.equal(specDocNewOrderFacts(null), null);
  assert.equal(specDocNewOrderFacts({ order: newOrder }).qty, null, 'ไม่รู้จำนวน = null (จอพิมพ์ขีด)');
  // ก้อนนี้ป้อน docContentSummary แล้วได้แถว "ใบสั่งขาย" บนการ์ดเนื้อ
  const summary = docContentSummary({ source: 'live', spec: newSpec, order: facts });
  assert.equal(summary.order.qty, 300);
});

/* 🐞 ผลตรวจสด 23/09: จอเขียนแค่ "ภาพอยู่ที่หน้าสเปคของสินค้า" ขณะที่กระดาษร่างพิมพ์ครบ 5 ภาพ ⇒ คนที่อ่านแต่จอ
   แล้วกดบันทึก ไม่เคยรู้ว่ามีภาพอะไรจะไปอยู่บนเอกสาร · จอนี้เป็นจุดตัดสินใจ ไม่ใช่จอรายงาน */
test('🐞 หน้าออกเอกสาร: บอกจำนวนภาพที่จะถูกถ่ายลงเอกสาร — ไม่ใช่ "ไปดูเอาที่หน้าสินค้า" เฉย ๆ', () => {
  assert.equal(specDocNewView(newPayload()).illustrationCount, 5, 'จำนวนที่ API นับมาต้องถึงการ์ดภาพประกอบ');
  assert.equal(specDocNewView(newPayload({ illustrationCount: 0 })).illustrationCount, 0);
  // ไม่ได้นับมา (ไม่มีสเปค/นอกหมวด) = ไม่รู้ ⇒ ต้องไม่กลายเป็น 0 ("ไม่มีภาพ")
  assert.equal(specDocNewView(newPayload({ illustrationCount: null })).illustrationCount, null);
  assert.equal(specDocNewView(newPayload({ spec: null })).illustrationCount, null);

  assert.match(liveIllustrationNote(5), /5 ภาพ/);
  assert.match(liveIllustrationNote(5), /ถ่ายลงเอกสารตอนยื่น/);
  assert.match(liveIllustrationNote(0), /ยังไม่มีภาพประกอบ/, '0 = บอกว่าเอกสารจะไม่มีภาพ');
  assert.doesNotMatch(liveIllustrationNote(null), /\d/, 'ไม่รู้จำนวน = ไม่เดาเลข');
});

test('หน้าออกเอกสาร: toast หลังบันทึกใช้เลขที่รูปกระดาษ DDMMYY-XXX-00 · อ่านไม่ขึ้น 4xx = กล่องเตือน ไม่ใช่แถบแดง', () => {
  assert.equal(
    specDocSavedMessage({ document: { id: 'PSD1', docNo: 'FM-SA-04-230969-001' }, revision: { revNo: 0 } }),
    'บันทึกเอกสาร 230969-001-00 แล้ว — ยื่นอนุมัติได้ที่หน้านี้',
  );
  assert.match(specDocSavedMessage({ document: { docNo: 'FM-SA-04-230969-001' } }), /230969-001-00/, 'ไม่รู้ Rev = ออกใหม่ Rev.00');
  assert.match(specDocSavedMessage(null), /บันทึกเอกสารแล้ว/);

  assert.deepEqual(specDocNewLoadProblem({ status: 400, message: 'ใบสั่งขายย้อนหลังไม่ออกใบสเปคสินค้า' }),
    { tone: 'warning', message: 'ใบสั่งขายย้อนหลังไม่ออกใบสเปคสินค้า' });
  assert.deepEqual(specDocNewLoadProblem({ status: 403, message: 'forbidden' }),
    { tone: 'warning', message: 'คุณไม่มีสิทธิ์เปิดใบสั่งขายนี้' });
  assert.equal(specDocNewLoadProblem({ status: 500, message: 'db down' }).tone, 'error');
  assert.equal(specDocNewLoadProblem({}).message, 'อ่านข้อมูลเอกสารไม่สำเร็จ');
});

test('แถวการ์ดหน้า SO: สี่สถานะ · ปุ่มตามสิทธิ์ · ติดด่านเป็น blocker ไม่ใช่ปุ่มหาย', () => {
  const line = { id: 'SOL-1', productId: 'PRD1', fgCode: 'FG-01-0001' };
  const out = followUpLineView({ line, state: { kind: 'out_of_scope', label: 'ไม่ต้องใช้', reason: 'หมวด 03' } });
  assert.equal(out.action, null);
  assert.equal(out.note, 'หมวด 03');

  const noSpec = followUpLineView({ line, state: { kind: 'no_spec', label: 'ยังไม่มีสเปค', action: 'create_spec' } });
  assert.equal(noSpec.action.href, '/database/products/PRD1/spec');
  assert.equal(followUpLineView({ line, state: { kind: 'no_spec', action: null } }).action, null);

  const ready = followUpLineView({ line, state: { kind: 'not_issued', label: 'ยังไม่ออก', action: 'issue', reason: null } }, { orderId: 'SO1' });
  assert.equal(ready.action.kind, 'issue');
  assert.equal(ready.action.blocker, null);
  // ⭐ "ออกเอกสาร" = ลิงก์ไปหน้าออกเอกสาร (มติ 23/09) ไม่ใช่ปุ่มที่ออกเลขทันที
  assert.equal(ready.action.href, '/sales-planning/spec-documents/new?order=SO1&line=SOL-1');
  const blocked = followUpLineView({ line, state: { kind: 'not_issued', action: 'issue', reason: 'ใบสั่งขายยังไม่อนุมัติ' } }, { orderId: 'SO1' });
  assert.equal(blocked.action.blocker, 'ใบสั่งขายยังไม่อนุมัติ');
  const notAc = followUpLineView({ line, state: { kind: 'not_issued', label: 'ยังไม่ออก', action: null } });
  assert.equal(notAc.action, null);
  assert.match(notAc.note, /AC/);

  const issued = followUpLineView({
    line,
    state: {
      kind: 'issued', label: 'ออกแล้ว', action: 'open', documentId: 'PSD1',
      docNo: 'FM-SA-04-220969-001', revLabel: 'Rev.00', statusLabel: 'ฉบับร่าง',
    },
  });
  assert.equal(issued.docNo, 'FM-SA-04-220969-001');
  assert.equal(issued.docNoText, '220969-001', 'state เก่าที่ไม่มี docNoText = เลขที่ไม่มี Rev (ไม่เดา Rev)');
  const withText = followUpLineView({ line, state: { kind: 'issued', documentId: 'PSD1', docNo: 'FM-SA-04-220969-001', docNoText: '220969-001-03' } });
  assert.equal(withText.docNoText, '220969-001-03');
  assert.equal(issued.statusLabel, 'ฉบับร่าง');
  assert.equal(issued.action.href, '/sales-planning/spec-documents/PSD1');
});

test('🐞 แถวที่ออกแล้วบนการ์ด SO ใช้สีตามสถานะ Rev ชุดเดียวกับหน้าสเปค — ตีกลับต้องไม่เป็นป้ายเขียว', () => {
  const line = { id: 'SOL-1', productId: 'PRD1' };
  const toneOf = (revStatus) => followUpLineView({
    line, state: { kind: 'issued', documentId: 'PSD1', statusLabel: 'x', revStatus },
  }).tone;
  for (const status of ['draft', 'pending_ae', 'pending_ae_supervisor', 'approved', 'rejected']) {
    assert.equal(toneOf(status), docRevisionTone(status), status);
  }
  assert.equal(toneOf('rejected'), 'danger');
  assert.notEqual(toneOf('draft'), 'success');
  assert.equal(toneOf(null), 'neutral', 'ไม่รู้สถานะ = กลาง ไม่ใช่เขียว');
});

test('⭐ โมดัลยกเลิก/ออก Rev. ของ SO บอกผลกับเอกสาร FM-SA-04 — นับจากคำตอบเส้นเดียวกับการ์ด', () => {
  const payload = {
    rows: [
      { state: { kind: 'issued' } }, { state: { kind: 'issued' } },
      { state: { kind: 'not_issued' } }, { state: { kind: 'out_of_scope' } },
    ],
    orphans: [{ documentId: 'PSD9' }],
  };
  assert.equal(liveSpecDocumentCount(payload), 3);
  assert.equal(liveSpecDocumentCount({ rows: [], orphans: [] }), 0);
  assert.equal(liveSpecDocumentCount(null), null);

  const cancel = salesOrderSpecDocEffect('cancel', 3);
  assert.match(cancel, /3 ใบ/);
  assert.match(cancel, /ยกเลิก/);
  assert.match(cancel, /เลขที่ไม่นำกลับมาใช้/);
  const revise = salesOrderSpecDocEffect('revise', 2);
  assert.match(revise, /2 ใบ/);
  assert.match(revise, /เลขที่เดิม/);
  assert.match(revise, /3 ขั้น/);
  assert.match(revise, /ถอยกลับเป็นร่าง/);
  // ไม่มีเอกสาร = ไม่มีบรรทัด · ไม่รู้ = บอกแบบมีเงื่อนไข (ดีกว่าเงียบ)
  assert.equal(salesOrderSpecDocEffect('cancel', 0), null);
  assert.match(salesOrderSpecDocEffect('cancel', null), /ถ้ามี/);
  assert.match(salesOrderSpecDocEffect('revise', undefined), /ถ้ามี/);
  assert.equal(salesOrderSpecDocEffect('approve', 2), null);
});
