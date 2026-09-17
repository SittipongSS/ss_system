import assert from 'node:assert/strict';
import test from 'node:test';
import {
  revLabel, specControlActions, specFormBlocker, specReadiness,
  specStatusColor, specStatusHeadline, specWorkflowSteps,
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
  for (const status of ['draft', 'pending_ae', 'approved', 'rejected', 'superseded']) {
    assert.match(specStatusColor(status), /^var\(--[a-z0-9-]+\)$/, status);
  }
  assert.match(specStatusColor('อะไรไม่รู้'), /^var\(--/);
});

test('รางสี่ขั้นเดินตามสถานะ — ขั้นก่อนเป็น done ขั้นปัจจุบันเป็น current', () => {
  const steps = specWorkflowSteps(rev({ status: 'pending_ae_supervisor' }));
  assert.deepEqual(steps.map((s) => s.state), ['done', 'done', 'current', 'pending']);
});

test('🪤 ตีกลับไม่งอกจุดใหม่ — ระบายขั้นแรกเป็น rejected ไม่ใช่เดินหน้าต่อ', () => {
  const steps = specWorkflowSteps(rev({ status: 'rejected' }));
  assert.deepEqual(steps.map((s) => s.state), ['rejected', 'pending', 'pending', 'pending']);
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

test('ปุ่มหลักเดินตามขั้น: AC ส่ง → AE ตรวจ → AE Sup อนุมัติ', () => {
  assert.equal(specControlActions({ spec, revision: rev(), role: 'ac' }).primaryAction.id, 'submit');
  assert.equal(specControlActions({ spec, revision: rev({ status: 'pending_ae' }), role: 'ae' }).primaryAction.id, 'review');
  assert.equal(specControlActions({ spec, revision: rev({ status: 'pending_ae_supervisor' }), role: 'ae_supervisor' }).primaryAction.id, 'approve');
});

test('อนุมัติแล้ว = ปุ่มหลักคือออกฉบับใหม่ พร้อมเลข Rev. ถัดไปบนปุ่ม', () => {
  const actions = specControlActions({ spec, revision: rev({ revNo: 2, status: 'approved' }), role: 'ac' });
  assert.equal(actions.primaryAction.id, 'new-revision');
  assert.match(actions.primaryAction.label, /Rev\.03/);
});

test('🪤 ไม่มีก้าวที่ทำได้ = ปุ่มยังอยู่แต่บอกเหตุ ไม่ใช่หายไป', () => {
  // AC มองใบที่อยู่ที่หัวหน้า: ส่งซ้ำไม่ได้ · ตรวจไม่ได้ · อนุมัติไม่ได้ · ออกฉบับใหม่ไม่ได้
  const actions = specControlActions({ spec, revision: rev({ status: 'pending_ae_supervisor' }), role: 'ac' });
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

test('ปุ่มดึงกลับโผล่เฉพาะตอนใบอยู่ระหว่างรอ · ปุ่มตีกลับเฉพาะคนที่ตรวจ/อนุมัติได้', () => {
  const atAe = specControlActions({ spec, revision: rev({ status: 'pending_ae' }), role: 'ae' });
  assert.equal(atAe.secondaryActions.find((a) => a.id === 'withdraw').visible, true);
  assert.equal(atAe.dangerActions.find((a) => a.id === 'reject').visible, true);

  const onDraft = specControlActions({ spec, revision: rev(), role: 'ac' });
  assert.equal(onDraft.secondaryActions.find((a) => a.id === 'withdraw').visible, false);
  assert.equal(onDraft.dangerActions.find((a) => a.id === 'reject').visible, false);

  const acAtAe = specControlActions({ spec, revision: rev({ status: 'pending_ae' }), role: 'ac' });
  assert.equal(acAtAe.dangerActions.find((a) => a.id === 'reject').visible, false);
});

test('ลำดับปุ่มคงที่ ไม่สลับตามสถานะ', () => {
  const ids = (status, role) => specControlActions({ spec, revision: rev({ status }), role })
    .secondaryActions.map((a) => a.id);
  assert.deepEqual(ids('draft', 'ac'), ['print', 'withdraw']);
  assert.deepEqual(ids('pending_ae', 'ae'), ['print', 'withdraw']);
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
