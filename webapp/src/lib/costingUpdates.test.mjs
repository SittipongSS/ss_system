// เหตุการณ์ระบบในเธรดของระบบขอราคา (lib/costingUpdates.js)
//
// ⚠️ ของที่ต้องล็อกจริง ๆ ไม่ใช่ข้อความสวย แต่คือ **เหตุผลต้องไม่หาย**: เหตุผลที่
// ผู้บริหารตีกลับถูกล้างจากคอลัมน์ทุกครั้งที่เซลยื่นใหม่ ถ้าไฟล์นี้ตกเหตุผลไป
// เธรดก็จะบอกแค่ว่า "ถูกตีกลับ" เหมือนเดิมโดยไม่มีใครรู้ว่าขาดอะไรไป
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  askActionUpdate, askAnswerUpdates, costingDecisionUpdate, costingReviseUpdates,
  costingSubmitUpdate,
} from './costingUpdates.js';
import { UPDATE_KINDS } from './master/updateTypes.js';

// kind ที่ไฟล์นี้ผลิตต้องมีป้ายในทะเบียนจริง ไม่งั้นขึ้นจอเป็น "อัปเดต" สีเดียวหมด
const declared = (entityType, kind) => Object.hasOwn(UPDATE_KINDS[entityType] || {}, kind);

test('เคสขอราคา: ทุก action คืน kind ที่ประกาศไว้ในทะเบียน', () => {
  const ask = { dept: 'PC', docNo: 'PM-26070001', items: [{}, {}] };
  for (const action of ['submit', 'acknowledge', 'close', 'cancel']) {
    const u = askActionUpdate(action, ask, { reason: 'ลูกค้าเปลี่ยนใจ' });
    assert.ok(u, `${action} ต้องคืนรายการ`);
    assert.ok(declared('material_ask', u.kind), `kind ${u.kind} ไม่มีป้ายในทะเบียน`);
    assert.ok(u.body, `${action} ต้องมีข้อความ`);
  }
  assert.equal(askActionUpdate('ยิงเล่น', ask), null);
  assert.equal(askActionUpdate('submit', null), null);
});

test('เคสขอราคา: ยกเลิกต้องพาเหตุผลไปด้วย', () => {
  const ask = { dept: 'RD', items: [] };
  assert.match(askActionUpdate('cancel', ask, { reason: 'ลูกค้าถอย' }).body, /ลูกค้าถอย/);
  // ไม่ส่งเหตุผลมาต้องไม่เงียบ — บอกตรง ๆ ว่าไม่ระบุ
  assert.match(askActionUpdate('cancel', ask, {}).body, /ไม่ระบุเหตุผล/);
});

test('เคสขอราคา: คำตอบแยกรายรายการ + "ตอบไม่ได้" ต้องพาเหตุผลไปด้วย', () => {
  const events = askAnswerUpdates([
    { item: { id: 'I1', label: 'ขวด 500ml' }, tiers: [{ qty: 500 }, { qty: 1000 }], note: 'ราคานี้ถึงสิ้นเดือน' },
    { item: { id: 'I2', label: 'ฝาปั๊ม' }, noQuote: true, reason: 'โรงงานเลิกผลิต' },
  ]);
  assert.equal(events.length, 2);
  assert.equal(events[0].kind, 'quoted');
  assert.match(events[0].body, /ขวด 500ml/);
  assert.match(events[0].body, /2 ชั้นจำนวน/);
  assert.match(events[0].body, /ราคานี้ถึงสิ้นเดือน/);
  assert.equal(events[0].meta.itemId, 'I1');
  assert.equal(events[1].kind, 'no_quote');
  assert.match(events[1].body, /โรงงานเลิกผลิต/);
  for (const e of events) assert.ok(declared('material_ask', e.kind));
});

test('เคสขอราคา: รายการที่ไม่มี item ต้องข้าม ไม่ใช่ทำทั้งชุดพัง', () => {
  assert.deepEqual(askAnswerUpdates([null, {}, undefined]), []);
  assert.deepEqual(askAnswerUpdates(), []);
});

test('ใบขอราคาผลิต: ตีกลับต้องเก็บเหตุผลลงเธรด (คอลัมน์เดิมถูกล้างทุกรอบ)', () => {
  const item = { id: 'CRI1', productLabel: 'น้ำหอม 30ml' };
  const returned = costingDecisionUpdate('return', item, { reason: 'ต้นทุนขวดสูงกว่าที่ตกลง' });
  assert.equal(returned.kind, 'returned');
  assert.match(returned.body, /ต้นทุนขวดสูงกว่าที่ตกลง/);
  assert.match(returned.body, /น้ำหอม 30ml/);
  assert.equal(returned.meta.itemId, 'CRI1');
  assert.ok(declared('costing_request', 'returned'));
});

test('ใบขอราคาผลิต: ตีกลับโดยไม่มีเหตุผลต้องไม่เงียบ', () => {
  const u = costingDecisionUpdate('return', { id: 'X', productLabel: 'ก' }, {});
  assert.match(u.body, /ไม่ระบุเหตุผล/);
});

test('ใบขอราคาผลิต: อนุมัติ/ยื่น คืน kind ที่ประกาศไว้', () => {
  const approved = costingDecisionUpdate('approve', { id: 'CRI2', productLabel: 'ครีม 50g' });
  assert.equal(approved.kind, 'approve');
  assert.ok(declared('costing_request', approved.kind));

  const submitted = costingSubmitUpdate({ items: [{}, {}, {}] });
  assert.equal(submitted.kind, 'submit');
  assert.match(submitted.body, /3 รายการ/);
  assert.ok(declared('costing_request', submitted.kind));
  assert.equal(costingSubmitUpdate(null), null);
  assert.equal(costingDecisionUpdate('approve', null), null);
});

test('ออก Rev. เขียนสองเธรด — ใบเก่าต้องไม่จบห้วน', () => {
  const { onBase, onNew } = costingReviseUpdates(
    { id: 'CR-old', docNo: 'CR-26070001' },
    { id: 'CR-new', revisionNo: 2 },
  );
  assert.equal(onBase.kind, 'revise');
  assert.equal(onBase.meta.toId, 'CR-new');       // ใบเก่าชี้ไปใบใหม่
  assert.equal(onNew.meta.fromId, 'CR-old');      // ใบใหม่ชี้กลับใบเก่า
  assert.match(onNew.body, /CR-26070001/);
  assert.ok(declared('costing_request', 'revise'));

  const empty = costingReviseUpdates({ id: 'a' }, null);
  assert.equal(empty.onBase, null);
  assert.equal(empty.onNew, null);
});
