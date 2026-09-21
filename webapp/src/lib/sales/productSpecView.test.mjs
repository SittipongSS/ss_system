import assert from 'node:assert/strict';
import test from 'node:test';
import {
  revLabel, specControlActions, specDeletePrompt, specFormBlocker, specLineAction,
  specReadiness, specStatusColor, specStatusHeadline, specWorkflowSteps,
} from './productSpecView.js';

const rev = (over = {}) => ({ id: 'R1', revNo: 1, status: 'draft', items: [], ...over });
const spec = { id: 'S1', currentRevNo: 0 };

test('ป้าย Rev. เติมศูนย์สองหลัก และไม่มีฉบับ = ขีด', () => {
  assert.equal(revLabel(1), 'Rev.01');
  assert.equal(revLabel(12), 'Rev.12');
  assert.equal(revLabel(null), '—');
  assert.equal(revLabel(undefined), '—');
});

test('สีสถานะมาจากโทเคน ไม่ใช่ค่าดิบ', () => {
  for (const status of ['draft', 'pending', 'approved', 'rejected', 'superseded']) {
    assert.match(specStatusColor(status), /^var\(--[a-z0-9-]+\)$/, status);
  }
  assert.match(specStatusColor('อะไรไม่รู้'), /^var\(--/);
});

test('รางสามขั้นเท่ากับใบเสนอราคา — ขั้นก่อนเป็น done ขั้นปัจจุบันเป็น current', () => {
  const steps = specWorkflowSteps(rev({ status: 'pending' }));
  assert.deepEqual(steps.map((s) => s.id), ['draft', 'pending', 'approved']);
  assert.deepEqual(steps.map((s) => s.state), ['done', 'current', 'pending']);
});

test('รางบอกชื่อคนที่ทำแต่ละขั้น — ใบไม่มีบล็อกผู้รับผิดชอบ รางคือที่เดียว', () => {
  const steps = specWorkflowSteps(rev({
    status: 'pending', createdByName: 'ชลิตา', submittedByName: 'ชลิตา',
  }));
  assert.equal(steps[0].hint, 'ชลิตา');
  assert.equal(steps[1].hint, 'ชลิตา');
  assert.equal(steps[2].hint, 'รออนุมัติ');
});

test('🪤 ตีกลับไม่งอกจุดใหม่ — ระบายขั้นแรกเป็น rejected ไม่ใช่เดินหน้าต่อ', () => {
  const steps = specWorkflowSteps(rev({ status: 'rejected' }));
  assert.deepEqual(steps.map((s) => s.state), ['rejected', 'pending', 'pending']);
  assert.match(steps[1].hint, /แก้ตามเหตุผลที่ตีกลับ/);
});

test('พาดหัวบอกทั้ง Rev. และสถานะ พร้อมคนที่ลงมือล่าสุด', () => {
  const head = specStatusHeadline(spec, rev({ revNo: 2, status: 'approved', approvedByName: 'พัชราภิชญ์' }));
  assert.equal(head.status, 'Rev.02 · อนุมัติแล้ว');
  assert.equal(head.sub, 'อนุมัติโดย พัชราภิชญ์');
});

test('ใบที่ถูกตีกลับพาดหัวบอกเหตุผล ไม่ใช่แค่คำว่าตีกลับ', () => {
  const head = specStatusHeadline(spec, rev({ status: 'rejected', rejectionReason: 'ขวดยังไม่ตรงกับตัวอย่าง' }));
  assert.equal(head.sub, 'ขวดยังไม่ตรงกับตัวอย่าง');
});

test('ยังไม่มีใบ = ปุ่มหลักคือสร้างใบ และคนที่ไม่ใช่ฝ่ายขายไม่เห็นปุ่ม', () => {
  const asAc = specControlActions({ spec: null, revision: null, role: 'ac' });
  assert.equal(asAc.primaryAction.id, 'create');
  assert.equal(asAc.primaryAction.visible, true);
  const asRd = specControlActions({ spec: null, revision: null, role: 'rd' });
  assert.equal(asRd.primaryAction.visible, false);
});

test('ปุ่มหลักเดินตามขั้น: ยื่นอนุมัติ → อนุมัติ (ไม่มีขั้นตรวจคั่นแล้ว)', () => {
  const submit = specControlActions({ spec, revision: rev(), role: 'ac' }).primaryAction;
  assert.equal(submit.id, 'submit');
  assert.equal(submit.label, 'ยื่นอนุมัติ');
  assert.equal(specControlActions({ spec, revision: rev({ status: 'pending' }), role: 'ae_supervisor' }).primaryAction.id, 'approve');
  // AE ที่ไม่ใช่หัวหน้าไม่มีก้าวให้ทำ — ปุ่มยังอยู่แต่บอกเหตุ
  assert.equal(specControlActions({ spec, revision: rev({ status: 'pending' }), role: 'ae' }).primaryAction.disabled, true);
});

test('อนุมัติแล้ว = ปุ่มหลักคือออกฉบับใหม่ พร้อมเลข Rev. ถัดไปบนปุ่ม', () => {
  const actions = specControlActions({ spec, revision: rev({ revNo: 2, status: 'approved' }), role: 'ac' });
  assert.equal(actions.primaryAction.id, 'new-revision');
  assert.match(actions.primaryAction.label, /Rev\.03/);
});

test('🪤 ไม่มีก้าวที่ทำได้ = ปุ่มยังอยู่แต่บอกเหตุ ไม่ใช่หายไป', () => {
  // AC มองใบที่ยื่นไปแล้ว: ยื่นซ้ำไม่ได้ · อนุมัติไม่ได้ · ออกฉบับใหม่ไม่ได้
  const actions = specControlActions({ spec, revision: rev({ status: 'pending' }), role: 'ac' });
  assert.equal(actions.primaryAction.disabled, true);
  assert.ok(actions.primaryAction.disabledReason, 'ต้องมีเหตุผลติดปุ่ม');
  assert.notEqual(actions.primaryAction.visible, false);
});

test('มีของที่ยังไม่บันทึก = ส่งไม่ได้ และบอกว่าให้บันทึกก่อน', () => {
  const actions = specControlActions({ spec, revision: rev(), role: 'ac', dirty: true });
  assert.equal(actions.primaryAction.id, 'submit');
  assert.equal(actions.primaryAction.disabled, true);
  assert.match(actions.primaryAction.disabledReason, /บันทึกก่อน/);
});

test('ปุ่มดึงกลับโผล่เฉพาะตอนใบรออนุมัติ · ปุ่มตีกลับเฉพาะผู้อนุมัติ', () => {
  const atSup = specControlActions({ spec, revision: rev({ status: 'pending' }), role: 'ae_supervisor' });
  assert.equal(atSup.secondaryActions.find((a) => a.id === 'withdraw').visible, true);
  assert.equal(atSup.dangerActions.find((a) => a.id === 'reject').visible, true);

  const onDraft = specControlActions({ spec, revision: rev(), role: 'ac' });
  assert.equal(onDraft.secondaryActions.find((a) => a.id === 'withdraw').visible, false);
  assert.equal(onDraft.dangerActions.find((a) => a.id === 'reject').visible, false);

  // AE ที่ไม่ใช่หัวหน้าไม่ใช่ผู้อนุมัติแล้ว ⇒ ไม่มีปุ่มตีกลับ
  const aeAtPending = specControlActions({ spec, revision: rev({ status: 'pending' }), role: 'ae' });
  assert.equal(aeAtPending.dangerActions.find((a) => a.id === 'reject').visible, false);
});

test('ปุ่มลบอยู่ในช่องอันตราย โชว์เสมอสำหรับฝ่ายขาย และป้ายบอกขอบเขตจริง', () => {
  const single = specControlActions({ spec, revision: rev(), revisions: [rev()], role: 'ac' })
    .dangerActions.find((a) => a.id === 'delete');
  assert.equal(single.visible, true);
  assert.equal(single.label, 'ลบใบสเปคสินค้า');
  assert.equal(single.disabled, false);

  const rev2 = rev({ id: 'R2', revNo: 2 });
  const second = specControlActions({
    spec, revision: rev2, revisions: [rev2, rev({ status: 'approved' })], role: 'ac',
  }).dangerActions.find((a) => a.id === 'delete');
  assert.equal(second.label, 'ลบฉบับร่าง (Rev.02)');
});

test('🪤 ลบไม่ได้ = ปุ่มยังอยู่แต่บอกเหตุ (ui-visibility-rule)', () => {
  const issued = specControlActions({
    spec,
    revision: rev(),
    revisions: [rev()],
    issues: [{ id: 'PSD1', revisionId: 'R1', docNo: 'FM-SA-04-210969-001', status: 'issued' }],
    role: 'ac',
  }).dangerActions.find((a) => a.id === 'delete');
  assert.equal(issued.visible, true);
  assert.equal(issued.disabled, true);
  assert.match(issued.disabledReason, /FM-SA-04-210969-001/);

  const asRd = specControlActions({ spec, revision: rev(), revisions: [rev()], role: 'rd' })
    .dangerActions.find((a) => a.id === 'delete');
  assert.equal(asRd.visible, false, 'คนนอกฝ่ายขายไม่ต้องรู้ว่ามีปุ่มนี้');
});

test('ลำดับปุ่มคงที่ ไม่สลับตามสถานะ', () => {
  const ids = (status, role) => specControlActions({ spec, revision: rev({ status }), role })
    .secondaryActions.map((a) => a.id);
  assert.deepEqual(ids('draft', 'ac'), ['print', 'withdraw']);
  assert.deepEqual(ids('pending', 'ae_supervisor'), ['print', 'withdraw']);
  assert.deepEqual(ids('approved', 'ae_supervisor'), ['print', 'withdraw']);
});

test('ความพร้อมนับจากช่องที่คนกรอกเท่านั้น และบอกตัวเลข checklist', () => {
  const ready = specReadiness(rev({
    texture: 'เหลว', standardPackaging: 'ขวดแก้ว',
    items: [
      { itemKey: 'a', detail: 'น้ำหอม', preparedByS: true },
      { itemKey: 'b', detail: '', preparedByS: false, preparedByCustomer: false },
    ],
  }));
  assert.equal(ready.find((r) => r.id === 'spec').ready, true);
  assert.equal(ready.find((r) => r.id === 'market').ready, false);
  assert.equal(ready.find((r) => r.id === 'checklist').ready, false);
  assert.match(ready.find((r) => r.id === 'checklist').detail, /1\/2/);
});

test('ติ๊กผู้จัดเตรียมอย่างเดียวก็นับว่าแถวนั้นกรอกแล้ว (บางแถวไม่มีรายละเอียดให้เขียน)', () => {
  const ready = specReadiness(rev({ items: [{ itemKey: 'a', detail: '', preparedByCustomer: true }] }));
  assert.match(ready.find((r) => r.id === 'checklist').detail, /1\/1/);
});

test('ไม่มีฉบับ = ไม่มีรายการความพร้อม (ไม่ใช่รายการที่ว่างทุกข้อ)', () => {
  assert.deepEqual(specReadiness(null), []);
});

test('ตัวห้ามแก้ฟอร์มเป็นตัวเดียวกับด่านของ API', () => {
  assert.equal(specFormBlocker(rev(), 'ac'), null);
  assert.match(specFormBlocker(rev({ status: 'approved' }), 'ac'), /ออกฉบับใหม่/);
  assert.match(specFormBlocker(null, 'ac'), /ยังไม่มีฉบับ/);
});

/* ── ปุ่มรายบรรทัดบนหน้าใบสั่งขาย ─────────────────────────────────── */

test('บรรทัดนอกขอบเขตไม่มีปุ่ม — ไม่มีงานให้ทำเลย ไม่ใช่ปุ่มที่กดไม่ได้', () => {
  assert.equal(specLineAction({ kind: 'out_of_scope', reason: 'หมวด 03' }, { canEdit: true }), null);
  assert.equal(specLineAction(null, { canEdit: true }), null);
});

test('สามหน้าตามสถานะ: สร้างใบ · ออกเอกสารรอบนี้ · เปิดใบ', () => {
  assert.equal(specLineAction({ kind: 'no_spec' }, { canEdit: true }).kind, 'create');
  assert.equal(specLineAction({ kind: 'not_issued' }, { canEdit: true }).kind, 'issue');
  assert.equal(specLineAction({ kind: 'issued' }, { canEdit: true }).kind, 'open');
});

test('ติดด่าน = ปุ่มยังอยู่แต่กดไม่ได้ พร้อมเหตุที่ API ส่งมา', () => {
  const action = specLineAction({ kind: 'not_issued', reason: 'ใบสั่งขายยังไม่ผ่านการอนุมัติ' }, { canEdit: true });
  assert.equal(action.disabled, true);
  assert.match(action.reason, /ยังไม่ผ่านการอนุมัติ/);
});

test('คนที่ไม่มีสิทธิ์แก้ยังเห็นปุ่มพร้อมเหตุ — และเปิดใบที่ออกแล้วได้เสมอ', () => {
  const blocked = specLineAction({ kind: 'no_spec' }, { canEdit: false });
  assert.equal(blocked.disabled, true);
  assert.match(blocked.reason, /AC หรือฝ่ายขาย/);
  assert.equal(specLineAction({ kind: 'issued' }, { canEdit: false }).disabled, false);
});

/* ── กล่องยืนยันตอนลบ ─────────────────────────────────────────────── */

/* คีย์ที่ `ConfirmDialog` อ่านจริง — ตัวสร้างข้อความต้องไม่คืนคีย์นอกลิสต์นี้
   🐞 21/09 บน production: จอสร้างก้อนยืนยันด้วยคีย์ `action` (ลอกหน้าใบเสนอราคา)
      แต่กล่องของหน้านี้อ่าน `onConfirm` ⇒ กดยืนยันแล้วได้ `E.onConfirm is not a function` */
const DIALOG_KEYS = ['title', 'description', 'message', 'detail', 'confirmLabel', 'danger'];

test('กล่องลบคืนเฉพาะคีย์ที่กล่องยืนยันอ่าน — คีย์นอกลิสต์คือของที่หายเงียบ', () => {
  const prompt = specDeletePrompt({ productName: 'Eau de Tea Valley', revisions: [rev()], revision: rev() });
  for (const key of Object.keys(prompt)) assert.ok(DIALOG_KEYS.includes(key), `คีย์เกิน: ${key}`);
  assert.ok(!('action' in prompt), 'ห้ามใช้คีย์ action ของหน้าใบเสนอราคา');
  assert.ok(!('onConfirm' in prompt), 'ตัวลงมือเป็นของจอ ไม่ใช่ของตัวสร้างข้อความ');
});

test('ลบใบทั้งใบ: บอกว่าสินค้ากลับไปเป็น "ยังไม่มีใบสเปค" และกู้ไม่ได้', () => {
  const prompt = specDeletePrompt({ productName: 'Eau de Tea Valley', revisions: [rev()], revision: rev() });
  assert.equal(prompt.title, 'ลบใบสเปคสินค้า');
  assert.match(prompt.description, /Eau de Tea Valley/);
  assert.match(prompt.detail, /ยังไม่มีใบสเปค/);
  assert.match(prompt.detail, /กู้จากหน้าจอนี้ไม่ได้/);
  assert.equal(prompt.danger, true);
});

test('ลบเฉพาะฉบับร่าง: บอก Rev. ที่ลบ และ Rev. ที่ยังใช้อยู่', () => {
  const rev2 = rev({ id: 'R2', revNo: 2 });
  const prompt = specDeletePrompt({
    productName: 'Eau de Tea Valley',
    revisions: [rev2, rev({ revNo: 1, status: 'approved' })],
    revision: rev2,
  });
  assert.equal(prompt.title, 'ลบฉบับร่าง Rev.02');
  assert.match(prompt.description, /Rev\.02/);
  assert.match(prompt.detail, /Rev\.01 ยังเป็นสเปกที่ใช้อยู่/);
  assert.equal(prompt.confirmLabel, 'ลบฉบับร่าง');
});

test('ไม่มีชื่อสินค้าก็ยังเป็นประโยคที่อ่านรู้เรื่อง', () => {
  const prompt = specDeletePrompt({ revisions: [rev()], revision: rev() });
  assert.equal(prompt.description, 'ยืนยันลบใบสเปค หรือไม่');
});
