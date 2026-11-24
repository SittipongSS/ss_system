// ── การ์ด "สรุปใบนี้" ของพัฒนากลิ่น / พัฒนาสูตร (ม-165) ─────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { childShortName, devRequestSummary } from './devSummary.js';

/* ⭐ RQ-SB-26090014 ตามจริงบน prod 18/11 — SO หลัก 2 กลิ่น + SO แนบ 1 กลิ่น · ยืนยัน 2 · ขอแก้ 1 (แตก #1 #2) · ไม่เอา 5
   ⚠️ ALMOST HERE #2 ไม่มี `derivedFromItemId` ในฐาน (ข้อมูลเก่า) — การ์ดต้องไม่เดาจากรหัสว่าเป็นรอบแก้ */
const scent = (id, name, code, over = {}) => ({
  id, lineKind: 'scent_dev', label: name, refScent: { code, name }, answerStatus: 'pending',
  ackAt: '2026-09-20', readyAt: '2026-09-25', pickedUpAt: '2026-10-01', sentAt: '2026-10-06', ...over,
});
const tip = () => ({
  id: 'R1', kind: 'scent_dev', dept: 'RD', requesterDept: 'SA', status: 'acknowledged',
  salesOrderId: 'SO-MAIN', refSalesOrder: { id: 'SO-MAIN', orderNumber: 'SO-26080132-0' },
  salesOrderLines: [{ fgCode: 'FG-518-03-002', qty: 2 }],
  attachedOrders: [{
    salesOrderId: 'SO-ADD', orderNumber: 'SO-26110385-0', countedOrderId: 'SO-ADD', countedOrderNumber: 'SO-26110385-0',
    createdAt: '2026-11-18T03:30:00Z', lines: [{ fgCode: 'FG-518-03-002', qty: 1 }],
  }],
  scentSlotLines: [{ fgCode: 'FG-518-03-002', qty: 2 }, { fgCode: 'FG-518-03-002', qty: 1 }],
  scentSlots: { slots: 3, mainSlots: 2, attachedSlots: 1, paidRevisions: 0, usedRevisions: 1, attachedCount: 1 },
  briefs: [{ id: 'B1', label: 'ON MY WAY' }, { id: 'B2', label: 'STAY A LITTLE LONGER' }],
  items: [
    scent('i1', '1 NEW MESSAGE', 'PF5181101', { briefId: 'B1', outcome: 'rejected', answerStatus: 'declined' }),
    scent('i2', 'ON YOUR WAY TO ME', 'PF5181102', { briefId: 'B1', outcome: 'rejected', answerStatus: 'declined' }),
    scent('i3', 'ALMOST HERE', 'PF5181103', { briefId: 'B1', outcome: 'revise' }),
    scent('i4', 'BEFORE YOU GO', 'PF5181201', { briefId: 'B2', outcome: 'confirmed', answerStatus: 'done', answeredRevisionId: 'v1' }),
    scent('i5', 'ONE MORE SONG', 'PF5181202', { briefId: 'B2', outcome: 'rejected', answerStatus: 'declined' }),
    scent('i6', 'AFTER YOU LEAVE', 'PF5181203', { briefId: 'B2', outcome: 'rejected', answerStatus: 'declined' }),
    scent('i7', 'ALMOST HERE #1', 'PF518110301', { briefId: 'B1', outcome: 'confirmed', answeredRevisionId: 'v2', derivedFromItemId: 'i3' }),
    scent('i8', 'ALMOST HERE #2', 'PF518110302', { briefId: 'B1', outcome: 'rejected', answerStatus: 'declined' }),
  ],
});

test('⭐ RQ-SB-26090014: SO รายใบ + จำนวน · ยืนยัน 2 / 3 ขาด 1 (ตัวเดียวกับด่านปิด) — ไม่ใช่ "8/8 ลูกค้าตอบแล้ว"', () => {
  const s = devRequestSummary(tip(), 'scent_dev');
  assert.deepEqual(s.orders.map((o) => [o.orderNumber, o.role, o.slots]), [
    ['SO-26080132-0', 'main', 2],
    ['SO-26110385-0', 'attached', 1],
  ]);
  assert.equal(s.orders[1].attachedAt, '2026-11-18T03:30:00Z');
  assert.equal(s.paid, 3);
  assert.equal(s.confirmed.count, 2);
  assert.equal(s.confirmed.total, 3);
  assert.equal(s.confirmed.note, 'ขาด 1');
  assert.equal(s.confirmed.tone, 'warning');
});

test('⭐ ยืนยัน: หนึ่งกลิ่นต่อบรรทัด + ขั้นของแถวท้ายบรรทัด (คำเดียวกับปุ่มของแถว)', () => {
  const s = devRequestSummary(tip(), 'scent_dev');
  assert.deepEqual(s.confirmed.rows.map((r) => [r.name, r.code, r.stageText]), [
    ['BEFORE YOU GO', 'PF5181201', 'เสร็จแล้ว'],
    ['ALMOST HERE #1', 'PF518110301', 'รอ RD ใส่ Ingredient List'],
  ]);
});

test('⭐ ขอแก้: ต้นทาง → รอบแก้ชื่อสั้น · ตัวนับรอบแก้โชว์เสมอ (ใช้ 1 · ซื้อ 0) · ไม่เดารอบแก้จากรหัส', () => {
  const s = devRequestSummary(tip(), 'scent_dev');
  assert.equal(s.revise.count, 1);
  assert.equal(s.revise.rows[0].name, 'ALMOST HERE');
  assert.deepEqual(s.revise.rows[0].children.map((c) => c.short), ['#1']);
  assert.equal(s.revise.used, 1);
  assert.equal(s.revise.paid, 0);
});

test('⭐ ไม่เอา: หนึ่งกลิ่นต่อบรรทัด · ป้ายรอบแก้เฉพาะแถวที่ผูกต้นทางจริง', () => {
  const s = devRequestSummary(tip(), 'scent_dev');
  assert.deepEqual(s.rejected.rows.map((r) => r.name),
    ['1 NEW MESSAGE', 'ON YOUR WAY TO ME', 'ONE MORE SONG', 'AFTER YOU LEAVE', 'ALMOST HERE #2']);
  assert.ok(s.rejected.rows.every((r) => r.fromRevision === false));
  const linked = tip();
  linked.items[7].derivedFromItemId = 'i3';
  const s2 = devRequestSummary(linked, 'scent_dev');
  assert.equal(s2.rejected.rows.find((r) => r.name === 'ALMOST HERE #2').fromRevision, true);
  assert.deepEqual(s2.revise.rows[0].children.map((c) => c.short), ['#1', '#2']);
});

test('รอลูกค้าตอบ / กำลังทำ — แยกแถวที่ส่งแล้วออกจากงานที่ยังอยู่ในมือ · บรีฟที่ยังไม่มี direction เป็นรายการ', () => {
  const req = tip();
  req.items.push(scent('i9', 'NEW ONE', 'PF5181301', { briefId: 'B1' }));
  req.items.push({ id: 'i10', lineKind: 'scent_dev', label: 'ALMOST HERE', briefId: 'B1', derivedFromItemId: 'i3', ackAt: '2026-11-01', answerStatus: 'pending' });
  req.briefs.push({ id: 'B3', label: 'NIGHT DRIVE' });
  const s = devRequestSummary(req, 'scent_dev', { today: '2026-11-18' });
  assert.deepEqual(s.waitingCustomer.map((r) => [r.name, r.sentDays]), [['NEW ONE', 43]]);
  assert.deepEqual(s.working.map((r) => [r.name, r.stageText]), [
    ['ALMOST HERE', 'รอ RD ส่งงาน'],
    ['NIGHT DRIVE', 'รอ RD ส่งงาน'],
  ]);
  // ใบร่าง — บรีฟยังไม่ถูกส่ง ไม่ใช่ "รอ RD"
  const draft = devRequestSummary({ ...tip(), status: 'draft', items: [], briefs: [{ id: 'B1', label: 'ON MY WAY' }] }, 'scent_dev');
  assert.deepEqual(draft.working.map((r) => r.stageText), ['ยังไม่ได้ส่ง']);
});

test('ตัวเลขนำ: ครบ = เขียว · เกินที่แถมรองรับ = เขียว · เกินที่ยังไม่ระบุ = เตือน · ยังไม่มีอะไรยืนยัน = กลาง', () => {
  const req = tip();
  req.items[2].outcome = 'confirmed';                                       // ALMOST HERE ยืนยันด้วย ⇒ 3 / 3
  let s = devRequestSummary(req, 'scent_dev');
  assert.deepEqual([s.confirmed.count, s.confirmed.note, s.confirmed.tone], [3, 'ครบ', 'success']);
  req.items[5] = { ...req.items[5], outcome: 'confirmed', answerStatus: 'pending', freebieReason: 'แถมลูกค้าใหม่' };
  s = devRequestSummary(req, 'scent_dev');
  assert.deepEqual([s.confirmed.note, s.confirmed.tone], ['แถม 1', 'success']);
  assert.equal(s.confirmed.rows.find((r) => r.name === 'AFTER YOU LEAVE').freebie, true);
  req.items[0] = { ...req.items[0], outcome: 'confirmed', answerStatus: 'pending' };
  s = devRequestSummary(req, 'scent_dev');
  assert.deepEqual([s.confirmed.note, s.confirmed.tone], ['แถม 1 · เกิน 1 ยังไม่ระบุ', 'warning']);
  const none = devRequestSummary({ ...tip(), items: [] }, 'scent_dev');
  assert.deepEqual([none.confirmed.count, none.confirmed.total, none.confirmed.note, none.confirmed.tone], [0, 3, 'ยังไม่มีที่ยืนยัน', 'neutral']);
});

test('ใบพัฒนากลิ่นที่ไม่มี SO — ไม่มีก้อน SO และไม่มีตัวหาร', () => {
  const s = devRequestSummary({ ...tip(), salesOrderId: null, refSalesOrder: null, salesOrderLines: [], attachedOrders: [], scentSlotLines: [], scentSlots: null }, 'scent_dev');
  assert.deepEqual(s.orders, []);
  assert.equal(s.paid, null);
  assert.equal(s.confirmed.total, null);
  assert.equal(s.confirmed.note, null);
  assert.equal(s.confirmed.tone, 'neutral');
});

/* ⭐ พัฒนาสูตร WHITE TEA 02 — ไม่มี SO (0 จาก 56 ใบบน prod) · รอบแก้สองตัวรอลูกค้าตอบ */
test('⭐ พัฒนาสูตร: ทรงเดียวกัน ไม่มีก้อน SO · ชื่อจากสูตรที่ออก · รอบแก้ชื่อสั้น · รอลูกค้าตอบนับวันจากวันส่ง', () => {
  const f = (id, over) => ({
    id, lineKind: 'product_dev', label: 'หัวน้ำหอม · PF2810201 WHITE TEA 02', answerStatus: 'pending', ackAt: '2026-09-20', ...over,
  });
  const req = {
    id: 'F1', kind: 'formula_dev', dept: 'RD', requesterDept: 'AD', status: 'acknowledged', salesOrderId: null,
    items: [
      f('a', { refFormula: { code: 'PF281020101', name: 'WHITE TEA 02 #1' }, readyAt: '2026-09-29', pickedUpAt: '2026-09-29', sentAt: '2026-09-30', outcome: 'revise' }),
      f('b', { derivedFromItemId: 'a', refFormula: { code: 'PF28102010201', name: 'WHITE TEA 02 #1.1' }, readyAt: '2026-10-14', pickedUpAt: '2026-10-14', sentAt: '2026-10-14' }),
      f('c', { derivedFromItemId: 'a', directionOfItemId: 'b', refFormula: { code: 'PF28102010202', name: 'WHITE TEA 02 #1.2' }, readyAt: '2026-10-14', pickedUpAt: '2026-10-14', sentAt: '2026-10-14' }),
    ],
  };
  const s = devRequestSummary(req, 'formula_dev', { today: '2026-11-18' });
  assert.equal(s.unit, 'สูตร');
  assert.deepEqual(s.orders, []);
  assert.equal(s.confirmed.total, null);
  assert.equal(s.confirmed.count, 0);
  assert.deepEqual(s.revise.rows.map((r) => [r.name, r.children.map((c) => c.short)]), [['WHITE TEA 02 #1', ['#1.1', '#1.2']]]);
  assert.equal(s.revise.paid, null);
  assert.equal(s.revise.used, 2);
  assert.deepEqual(s.waitingCustomer.map((r) => [r.name, r.sentDays]), [['WHITE TEA 02 #1.1', 35], ['WHITE TEA 02 #1.2', 35]]);
  // แถวที่ยังไม่มีสูตร = ป้ายสิ่งที่ขอ (หมวด · กลิ่น) ตัวเดียวกับตาราง
  const unsent = devRequestSummary({ ...req, items: [f('z', {})] }, 'formula_dev');
  assert.equal(unsent.working[0].name, 'หัวน้ำหอม · PF2810201 WHITE TEA 02');
  assert.equal(unsent.working[0].stageText, 'รอ RD ส่งงาน');
});

/* ⭐ ม-162 (เจ้าของย้ำ 24/11/2026 "รหัส+ชื่อ+วันที่ผลิต เสมอ") — การ์ดโชว์ `label` ครบสามท่อน · `name` ดิบไว้ตัดชื่อรอบแก้ */
test('⭐ ป้ายบนการ์ด = "PF · ชื่อ · วันที่" ของทะเบียน · รอบแก้ได้ป้ายของตัวเอง · ยังไม่ผูก = ชื่อแถว', () => {
  const f = (id, over) => ({ id, lineKind: 'product_dev', label: 'หัวน้ำหอม · PF859010103 THE MOMENT OF TEA TIME #3', answerStatus: 'pending', ...over });
  const req = {
    id: 'F2', kind: 'formula_dev', dept: 'RD', status: 'acknowledged',
    items: [
      f('a', { refFormula: { code: 'PF281020101', name: 'WHITE TEA 02 #1', formulaDate: '2026-09-29' }, readyAt: '2026-09-29', sentAt: '2026-09-30', outcome: 'revise' }),
      f('b', { derivedFromItemId: 'a', refFormula: { code: 'PF28102010201', name: 'WHITE TEA 02 #1.1', formulaDate: '2026-10-14' }, readyAt: '2026-10-14', sentAt: '2026-10-14' }),
      // ม-166 — แถวหัวน้ำหอมที่ส่งเป็นกลิ่น: ป้ายมาจากกลิ่นลูก (วันผลิต)
      f('c', { refProducedScent: { code: 'PF85901010301', name: 'THE MOMENT OF TEA TIME #3.1 REV1', producedAt: '2026-09-10' }, readyAt: '2026-09-10', sentAt: '2026-09-11', outcome: 'confirmed' }),
      f('d', {}),
    ],
  };
  const s = devRequestSummary(req, 'formula_dev', { today: '2026-11-24' });
  assert.equal(s.revise.rows[0].label, 'PF281020101 · WHITE TEA 02 #1 · 29/09/2026');
  assert.deepEqual(s.revise.rows[0].children.map((c) => [c.label, c.short]), [['PF28102010201 · WHITE TEA 02 #1.1 · 14/10/2026', '#1.1']]);
  assert.equal(s.confirmed.rows[0].label, 'PF85901010301 · THE MOMENT OF TEA TIME #3.1 REV1 · 10/09/2026');
  assert.equal(s.working[0].label, 'หัวน้ำหอม · PF859010103 THE MOMENT OF TEA TIME #3');
});

test('ชื่อสั้นของรอบแก้ — ตัดได้เฉพาะชื่อฐานตามด้วย "#" · นอกนั้นชื่อเต็ม', () => {
  assert.equal(childShortName('ALMOST HERE', 'ALMOST HERE #1'), '#1');
  assert.equal(childShortName('WHITE TEA 02 #1', 'WHITE TEA 02 #1.1'), '#1.1');
  assert.equal(childShortName('ALMOST HERE', 'ALMOST HERE AGAIN'), 'ALMOST HERE AGAIN');
  assert.equal(childShortName('ALMOST HERE', 'SOMETHING ELSE'), 'SOMETHING ELSE');
  assert.equal(childShortName('', 'X #1'), 'X #1');
});

test('หัวข้ออื่น = null (ใช้การ์ดทรงเดิม)', () => {
  assert.equal(devRequestSummary(tip(), 'document'), null);
});
