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

test('คำร้อง: ทุก action คืน kind ที่ประกาศไว้ในทะเบียน', () => {
  const ask = { dept: 'PC', docNo: 'PM-26070001', items: [{}, {}] };
  for (const action of ['submit', 'acknowledge', 'close', 'cancel']) {
    const u = askActionUpdate(action, ask, { reason: 'ลูกค้าเปลี่ยนใจ' });
    assert.ok(u, `${action} ต้องคืนรายการ`);
    assert.ok(declared('dept_request', u.kind), `kind ${u.kind} ไม่มีป้ายในทะเบียน`);
    assert.ok(u.body, `${action} ต้องมีข้อความ`);
  }
  assert.equal(askActionUpdate('ยิงเล่น', ask), null);
  assert.equal(askActionUpdate('submit', null), null);
});

// 🐞 หัวข้อที่ **ฝ่ายปลายทางสร้างแถวตอนส่งงาน** (พัฒนากลิ่น) ไม่มีแถวตอนยื่น ⇒ บรรทัด
// แรกของเธรดเคยขึ้นว่า "ส่งเคสถึงฝ่าย RD — 0 รายการ" ทุกใบ ซึ่งอ่านเหมือนข้อมูลหาย
// ไม่ใช่ชนิดที่ยังไม่มีแถวตั้งแต่แรก · หัวข้อที่ผู้ขอกรอกแถวเองต้องยังนับรายการเหมือนเดิม
test('บรรทัดแรกของเธรดต้องเล่าของที่ส่งไปจริง ไม่ใช่ "0 รายการ"', () => {
  const scent = askActionUpdate('submit', {
    dept: 'RD', kind: 'scent_dev', items: [], briefs: [{ brief: 'a' }, { brief: 'b' }],
  });
  assert.match(scent.body, /บรีฟ 2 ก้อน/);
  assert.doesNotMatch(scent.body, /0 รายการ/);

  // ยังไม่มีบรีฟเลย = ไม่ต้องมีเลข ดีกว่าเลขศูนย์
  const bare = askActionUpdate('submit', { dept: 'RD', kind: 'scent_dev', items: [], briefs: [] });
  assert.doesNotMatch(bare.body, /\d/);

  // หัวข้อที่ผู้ขอกรอกแถวเอง (ขอราคาวัสดุ) นับรายการตามเดิม
  const priced = askActionUpdate('submit', { dept: 'PC', kind: 'info', items: [{}, {}, {}] });
  assert.match(priced.body, /3 รายการ/);
});

// ── ทุก action ของ PATCH คำร้องต้องมีที่ลงในเธรด ──────────────────────
//
// 🐞 ตรวจ 2026-08-09: `reschedule` · `approve` · `update` · `pdr` **ไม่มีแถวลงเธรด
// เลย** — route ประกอบข้อความไว้สวยงามแล้วส่งเข้า `recordAudit` อย่างเดียว ซึ่งไม่มี
// ใครเปิดดู และไม่ยิงแจ้งเตือน (แจ้งเตือนรายคนเกาะอยู่กับแถวเธรด) ⇒ เงียบสนิทบนจอ
// ⚠️ เทสต์นี้อ่านรายชื่อ action จาก route จริง ไม่ใช่ลิสต์ที่พิมพ์ไว้เอง — เพิ่ม action
// ใหม่ที่ route แล้วลืมเธรด จะแดงทันทีโดยไม่ต้องมีใครจำได้ว่าต้องมาแก้ที่นี่
test('⭐ ทุก action ที่ route รองรับ ต้องมีแถวลงเธรด (ยกเว้นที่จงใจไม่ลง)', async () => {
  const { readFileSync } = await import('node:fs');
  const routeSrc = readFileSync(
    new URL('../app/api/sa/requests/[id]/route.js', import.meta.url), 'utf8',
  );
  const actions = [...routeSrc.matchAll(/action === '([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(actions.length >= 10, `อ่าน action จาก route ได้แค่ ${actions.length} ตัว — regex น่าจะพัง`);

  const ask = { dept: 'RD', docNo: 'DR-26080001', items: [{}], committedDueDate: '2026-08-20' };
  const missing = [];
  for (const action of new Set(actions)) {
    if (!askActionUpdate(action, ask, { reason: 'เหตุผล', previousDueDate: '2026-08-10' })) {
      missing.push(action);
    }
  }
  assert.deepEqual(missing, [], `action เหล่านี้ยังไม่มีแถวลงเธรด: ${missing.join(', ')}`);
});

test('⭐ แจ้งกำหนดส่งต้องบอกว่าเป็นวันของรอบไหน (เจอตอน UAT 2026-08-27)', () => {
  /* 🐞 ก้าวนี้เกิดซ้ำได้แล้วตั้งแต่รอบแก้เปิดขั้นนี้ใหม่ (#1406) ⇒ เธรดของใบที่เดิน
     สองรอบมี "แจ้งกำหนดส่ง" สองบรรทัดหน้าตาเหมือนกันเป๊ะ อ่านย้อนหลังไม่ออกว่าทำไม
     มีสองครั้ง · วัดของจริงบน FD-26080009 ตอน UAT:
       17:49:44 commitDue  RD แจ้งกำหนดส่ง 10/09/2026
       17:52:23 commitDue  RD แจ้งกำหนดส่ง 30/09/2026   ← แยกไม่ออก
     ⚠️ **#1406 อ้างว่าเธรดบอกรอบอยู่แล้ว ซึ่งผิด** — ข้อความนั้นอยู่ที่ `summary`
     ของ route ซึ่งไปลง audit log ไม่ใช่เธรด */
  const ask = { dept: 'RD', committedDueDate: '2026-09-30' };

  // แจ้งครั้งแรก — ยังไม่มีวันเดิม ⇒ คำเดิมทุกตัวอักษร ไม่มีคำว่า "รอบแก้"
  const first = askActionUpdate('commit-due', { ...ask, committedDueDate: '2026-09-10' }, {});
  assert.equal(first.body, 'RD แจ้งกำหนดส่ง 10/09/2026');

  // แจ้งของรอบแก้ — `previousDueDate` ไม่ null เฉพาะกรณีนี้ (ด่าน commitDueRequestError
  // ปล่อยผ่านแค่สองแบบ: ไม่มีวัน หรือวันที่มีเป็นของรอบที่ส่งไปแล้ว)
  const rework = askActionUpdate('commit-due', ask, { previousDueDate: '2026-09-10' });
  assert.match(rework.body, /แจ้งกำหนดส่งรอบแก้ 30\/09\/2026/);
  assert.match(rework.body, /รอบก่อน 10\/09\/2026/);
  assert.equal(rework.meta.previousDue, '2026-09-10');

  // เหตุผลยังต่อท้ายได้เหมือนเดิมทั้งสองแบบ
  assert.match(
    askActionUpdate('commit-due', ask, { previousDueDate: '2026-09-10', reason: 'รอวัตถุดิบ' }).body,
    /รอวัตถุดิบ/,
  );
});

test('⭐ เลื่อนวันกำหนดส่งต้องบอก "จากวันไหน → วันไหน" ไม่ใช่แค่ "แก้วันแล้ว"', () => {
  const ask = { dept: 'RD', committedDueDate: '2026-08-20' };
  const u = askActionUpdate('reschedule', ask, { previousDueDate: '2026-08-10', reason: 'ตัวอย่างยังไม่นิ่ง' });
  assert.ok(declared('dept_request', u.kind));
  // วันที่บนจอเป็น DD/MM/YYYY เหมือนที่อื่นทั้งระบบ ไม่ใช่ ISO ดิบ
  assert.match(u.body, /10\/08\/2026/);
  assert.match(u.body, /20\/08\/2026/);
  assert.match(u.body, /ตัวอย่างยังไม่นิ่ง/);
  // ใบที่ไม่เคยระบุวันมาก่อนต้องอ่านออกว่าเพิ่งมีวันครั้งแรก ไม่ใช่ช่องว่าง
  assert.match(askActionUpdate('reschedule', ask, {}).body, /ไม่เคยระบุ/);
  // เก็บวันดิบไว้ใน meta ให้จอ/รายงานใช้ต่อได้ โดยไม่ต้องแกะจากข้อความ
  assert.equal(u.meta.from, '2026-08-10');
  assert.equal(u.meta.to, '2026-08-20');
});

test('kind ใหม่ทั้งสี่มีป้ายในทะเบียน — ขาดที่ใดที่หนึ่งเหตุการณ์จะเงียบบนจอ', () => {
  for (const kind of ['reschedule', 'approve', 'update', 'pdr']) {
    assert.ok(declared('dept_request', kind), `kind ${kind} ไม่มีป้ายใน UPDATE_KINDS.dept_request`);
  }
});

test('คำร้อง: ยกเลิกต้องพาเหตุผลไปด้วย', () => {
  const ask = { dept: 'RD', items: [] };
  assert.match(askActionUpdate('cancel', ask, { reason: 'ลูกค้าถอย' }).body, /ลูกค้าถอย/);
  // ไม่ส่งเหตุผลมาต้องไม่เงียบ — บอกตรง ๆ ว่าไม่ระบุ
  assert.match(askActionUpdate('cancel', ask, {}).body, /ไม่ระบุเหตุผล/);
});

test('คำร้อง: คำตอบแยกรายรายการ + "ตอบไม่ได้" ต้องพาเหตุผลไปด้วย', () => {
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
  for (const e of events) assert.ok(declared('dept_request', e.kind));
});

test('คำร้อง: รายการที่ไม่มี item ต้องข้าม ไม่ใช่ทำทั้งชุดพัง', () => {
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
