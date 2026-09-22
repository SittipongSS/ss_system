/* ตัวประกอบภาพของหน้าเอกสาร FM-SA-04 + การ์ดบนหน้า SO (mig 0370 · มติ 21/09/2569)
 *
 * ด่านจริงอยู่ที่ `documentActions` (มีเมทริกซ์เทสต์ของตัวเอง) — ที่นี่ล็อกว่า:
 *   · ทุกปุ่มที่ตัวตัดสินโชว์ ต้องขึ้นบนการ์ด **ครั้งเดียว** พร้อมเหตุ (ไม่หาย ไม่ซ้ำ)
 *   · ทุกการกระทำมีโมดัลที่บอกผลลัพธ์ (กฎ approval-confirm-modals)
 *   · รางบอกขั้นที่ตีกลับ และงานกลับไปอยู่ที่ AC
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOC_REASON_ACTIONS, docActionDoneMessage, docApiAction, docConfirmPrompt, docContentSource,
  docContentSummary, docControlActions, docHeadline, docPrintHref, docRailSteps, docReasonPrompt,
  docRevisionRows, docRevisionTone, followUpLineView, lineIssuePrompt, liveSpecDocumentCount, productSpecPageHref,
  salesOrderHref, salesOrderSpecDocEffect, specDocumentHref,
} from './productSpecDocView.js';
import { DOC_ACTION_KEYS, DOC_REASON_MIN, documentActions } from './productSpecDocWorkflow.js';

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

test('🔴 ทุกการกระทำมีโมดัลที่บอกผลลัพธ์ — ยืนยันหรือเหตุผล ไม่มีคีย์ไหนหลุด', () => {
  const latest = rev('pending_ae_supervisor', { revNo: 1 });
  for (const key of Object.values(DOC_ACTION_KEYS)) {
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
});

test('🔴 โมดัลออกเอกสารบอกเลขที่ของวันนี้ (เวลาไทย) และว่าคืนเลขไม่ได้', () => {
  // 21/09/2026 23:30 UTC = 22/09/2026 เวลาไทย ⇒ 220969 (พ.ศ. 2569)
  const prompt = lineIssuePrompt({
    line: { fgCode: 'FG-01-0001', description: 'สเปรย์ปรับอากาศ' },
    now: new Date('2026-09-21T23:30:00Z'),
  });
  // เลขที่ที่คนจะเห็นบนกระดาษ/จอ = DDMMYY-XXX-RR · ออกใหม่ = Rev.00
  assert.match(prompt.detail, /220969-XXX-00/);
  assert.match(prompt.detail, /คืนไม่ได้/);
  assert.match(prompt.detail, /ย้อนกลับเองไม่ได้/);
  assert.match(prompt.description, /FG-01-0001/);
  assert.equal(prompt.confirmLabel, 'ออกเอกสาร');
});

test('แถวการ์ดหน้า SO: สี่สถานะ · ปุ่มตามสิทธิ์ · ติดด่านเป็น blocker ไม่ใช่ปุ่มหาย', () => {
  const line = { id: 'SOL-1', productId: 'PRD1', fgCode: 'FG-01-0001' };
  const out = followUpLineView({ line, state: { kind: 'out_of_scope', label: 'ไม่ต้องใช้', reason: 'หมวด 03' } });
  assert.equal(out.action, null);
  assert.equal(out.note, 'หมวด 03');

  const noSpec = followUpLineView({ line, state: { kind: 'no_spec', label: 'ยังไม่มีสเปค', action: 'create_spec' } });
  assert.equal(noSpec.action.href, '/database/products/PRD1/spec');
  assert.equal(followUpLineView({ line, state: { kind: 'no_spec', action: null } }).action, null);

  const ready = followUpLineView({ line, state: { kind: 'not_issued', label: 'ยังไม่ออก', action: 'issue', reason: null } });
  assert.equal(ready.action.kind, 'issue');
  assert.equal(ready.action.blocker, null);
  const blocked = followUpLineView({ line, state: { kind: 'not_issued', action: 'issue', reason: 'ใบสั่งขายยังไม่อนุมัติ' } });
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
