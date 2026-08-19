// ── รางของใบ — ชั้นที่ไม่เคยมีเทสต์ครอบ ─────────────────────────────────
//
// ⭐ **เทสต์ชุดนี้เกิดเพราะบั๊กสองตัวที่ผู้ใช้เจอเองบนจอ** ทั้งที่ CI เขียว 2121 ข้อ:
//   1 "รอหัวหน้ายืนยัน" ขึ้นสองบรรทัดติดกัน (พูดทั้งขั้นแยกและขั้นกลาง)
//   2 จุดไฮไลต์ชี้ผิดไปหนึ่งช่อง (index map จากสถานะดิบ ไม่ใช่รางที่เรนเดอร์จริง)
// ทั้งคู่เป็นตรรกะการประกอบราง ซึ่งตอนนั้นฝังอยู่ใน JSX ⇒ ไม่มีเทสต์ไหนแตะได้
//
// ⚠️ ขั้น "รอหัวหน้ายืนยัน" ถูกถอดออกทั้งขั้นแล้ว (มติผู้ใช้ 2026-08-16) — เทสต์
// ที่เหลือจึงคุม **รางชุดเดียว 5 ขั้นทุกหัวข้อ** และคุมว่าไม่มีขั้นแทรกกลับมาอีก
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRailSteps } from './requestRail.js';

const scent = (over = {}) => ({ kind: 'scent_dev', dept: 'RD', status: 'pending', ...over });
const info = (over = {}) => ({ kind: 'info', dept: 'RD', status: 'pending', ...over });

// สถานะทุกค่าที่ราง (ไม่รวม cancelled ซึ่งเป็นสถานะขนาน ไม่ใช่ขั้น)
const STATUSES = ['draft', 'pending', 'acknowledged', 'answered', 'closed'];

test('🐞 ป้ายในรางห้ามซ้ำกัน — บั๊กที่ผู้ใช้เห็นคือสองบรรทัดเขียนเหมือนกันติดกัน', () => {
  const cases = [
    scent(), scent({ status: 'acknowledged' }),
    scent({ status: 'acknowledged', items: [{ ackAt: 'x', readyAt: 'x' }] }),
    scent({ status: 'answered' }), scent({ status: 'closed' }),
    info(), info({ status: 'acknowledged' }),
  ];
  for (const request of cases) {
    const { steps } = requestRailSteps(request, { hasItems: false });
    const labels = steps.map((s) => s.label);
    assert.equal(new Set(labels).size, labels.length, `ป้ายซ้ำ: ${labels.join(' · ')}`);
    const ids = steps.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `id ซ้ำ: ${ids.join(' · ')}`);
  }
});

test('🐞 index ต้องชี้ขั้นที่มีอยู่จริงเสมอ — ทุกหัวข้อ ทุกสถานะ', () => {
  for (const kind of ['scent_dev', 'info', 'document', 'product_dev']) {
    for (const status of STATUSES) {
      const { steps, index } = requestRailSteps({ kind, dept: 'RD', status }, { hasItems: false });
      assert.ok(
        index >= 0 && index < steps.length,
        `${kind}/${status}: index ${index} อยู่นอกราง ${steps.length} ขั้น`,
      );
    }
  }
});

/* ⭐ **รางชุดเดียวทุกหัวข้อ** — ขั้นแทรกรายหัวข้อ (ประตูหัวหน้า) ถอดไปแล้ว 2026-08-16
   ⚠️ ด่านนี้คือสิ่งที่กันไม่ให้ขั้นแทรกกลับมาเงียบ ๆ — ขั้นที่แทรกดัน `index` ของทุกขั้น
   หลังจากนั้น ซึ่งเป็นบั๊ก "จุดไฮไลต์ชี้ผิดช่อง" ที่ผู้ใช้เจอเองมาแล้ว
   ⭐ 6 ขั้นตั้งแต่ 2026-08-19 — "กำหนดส่ง" เป็นขั้นของตัวเอง **ทุกหัวข้อเท่ากัน**
   (ชุดเดียวกับรางบนตารางรายการ · `queueTrack`) */
test('⭐ รางชุดเดียว 6 ขั้นทุกหัวข้อ — ไม่มีขั้นแทรกรายหัวข้ออีกแล้ว', () => {
  for (const kind of ['scent_dev', 'info', 'document', 'product_dev', 'price_pm']) {
    const { steps } = requestRailSteps({ kind, dept: 'RD', status: 'pending' });
    assert.equal(steps.length, 6, `${kind} ต้องมี 6 ขั้น`);
    assert.deepEqual(
      steps.map((s) => s.id),
      ['draft', 'pending', 'commitDue', 'acknowledged', 'answered', 'closed'],
      `${kind}: ลำดับขั้นเพี้ยน`,
    );
  }
});

/* ⚠️ **index ต้องนับขั้นที่เรนเดอร์จริง ไม่ใช่ลำดับของสถานะ** — ขั้น "กำหนดส่ง"
   (2026-08-19) แทรกที่ตำแหน่ง 2 ⇒ ใบ `acknowledged` หยุดที่ 2 ตราบใดที่ยังไม่แจ้งวัน
   แล้วค่อยเดินต่อไปขั้นกลางที่ 3 · นี่คือจุดที่เคยเกิดบั๊ก "ไฮไลต์ชี้ผิดช่อง" มาแล้ว */
test('index ชี้ขั้นที่เรนเดอร์จริงทุกหัวข้อ — ไม่มี offset ให้พลาด', () => {
  const withDue = (over) => ({ committedDueDate: '2026-08-25', ...over });
  for (const status of STATUSES) {
    const a = requestRailSteps(scent(withDue({ status })));
    const b = requestRailSteps(info(withDue({ status })));
    assert.equal(a.index, b.index, `${status}: สองหัวข้อต้องชี้ช่องเดียวกัน`);
    assert.equal(a.steps[a.index].id, status, `${status}: ไฮไลต์ชี้ขั้น ${a.steps[a.index].id}`);
  }
  assert.equal(requestRailSteps(scent({ status: 'draft' })).index, 0);
  assert.equal(requestRailSteps(scent({ status: 'pending' })).index, 1);
  // รับเรื่องแล้วแต่ยังไม่แจ้งวัน = ค้างที่ขั้น "กำหนดส่ง"
  assert.equal(requestRailSteps(scent({ status: 'acknowledged' })).index, 2);
  assert.equal(requestRailSteps(scent(withDue({ status: 'acknowledged' }))).index, 3);
  assert.equal(requestRailSteps(scent(withDue({ status: 'answered' }))).index, 4);
  assert.equal(requestRailSteps(scent(withDue({ status: 'closed' }))).index, 5);
});

test('⭐ ขั้นกลางสรุปจากแถว — "รอใส่ราคา" ต้องเห็นเป็นพิเศษ (กับดักข้อ 11)', () => {
  const at = '2026-08-06';
  /* ⚠️ ใบที่รับเรื่องแล้วต้องมีวันกำหนดส่งในเคสพวกนี้ (มติผู้ใช้ 2026-08-19) — ใบที่
     ยังไม่แจ้งวันค้างที่ขั้น "กำหนดส่ง" ซึ่งเป็นขั้นของตัวเอง (เทสต์แยกข้างล่าง)
     ⚠️ **ขั้นกลางคือ `steps[3]` แล้ว** ไม่ใช่ `[2]` — ขั้น "กำหนดส่ง" แทรกก่อนหน้า */
  const base = { status: 'acknowledged', committedDueDate: '2026-08-25' };
  // ยังไม่มีแถว = ยังไม่ได้ส่งงาน — เฉพาะหัวข้อที่ฝ่ายส่งของจริง (deliversRows)
  // ⚠️ คำต้องตรงกับปุ่ม (ม-120: "ส่งงาน" ทุกสาย) — รางเล่าก้าวเดียวกับที่ปุ่มกด
  assert.match(requestRailSteps(scent(base)).steps[3].label, /รอ RD ส่งงาน/);
  // ⭐ หัวข้อไม่มีแถวเลย (สอบถามข้อมูล) ไม่มี "ของ" ในสาย — รอ "คำตอบ" (มติผู้ใช้
  // 2026-08-09: "แก้เป็น รอฝ่าย RD ตอบ")
  /* ⭐ หัวข้อเธรดล้วน — ป้ายพลิกตามคนโพสต์ล่าสุด (มติผู้ใช้ 2026-08-20) · ยังไม่มี
     ใครพิมพ์ = ตาฝ่าย · คำเดียวกับคิว (`requestReplyTurn` ก้อนเดียว) */
  assert.match(requestRailSteps(info({ ...base, kind: 'info' })).steps[3].label,
    /รอ RD ตอบ/);
  assert.match(
    requestRailSteps(info({ ...base, kind: 'info', requesterDept: 'SA', lastReplySide: 'dept' })).steps[3].label,
    /รอ SA ตอบ/,
  );
  // คอนเฟิร์มแล้วยังไม่มีราคา — ใบค้างถาวรถ้าไม่มีใครเห็น
  const confirmed = scent({ ...base, items: [{ ackAt: at, readyAt: at, pickedUpAt: at, sentAt: at, outcome: 'confirmed' }] });
  assert.equal(requestRailSteps(confirmed).steps[3].label, 'รอใส่ราคา');
  // ของอยู่ที่ RD
  const atRd = scent({ ...base, items: [{ ackAt: at }] });
  assert.match(requestRailSteps(atRd).steps[3].label, /^RD กำลังทำ$/);
  // ของอยู่ที่ฝ่ายขาย
  const atSa = scent({ ...base, items: [{ ackAt: at, readyAt: at }] });
  assert.equal(requestRailSteps(atSa).steps[3].label, 'รอผู้ขอทำต่อ');
  assert.equal(
    requestRailSteps(scent({ ...atSa, requesterDept: 'SA' })).steps[3].label,
    'รอ SA ทำต่อ',
  );
});

/* ⭐ **รับเรื่องแล้วแต่ยังไม่แจ้งกำหนดส่ง** (มติผู้ใช้ 2026-08-19) — รับเรื่องคือการ
   ตัดรอบเข้าฝ่าย ส่วนวันที่รับปากเป็นก้าวของตัวเอง ⇒ ตราบใดที่ยังไม่แจ้ง ใบนี้ยังไม่มี
   คำสัญญาให้ใครนับ · ขั้นกลางต้องพูดเรื่องนั้นก่อนเรื่องงาน */
test('⭐ ขั้น "กำหนดส่ง" — ยังไม่แจ้ง = ไฮไลต์ค้างที่ขั้นนี้ · แจ้งแล้ว = พกวันจริง', () => {
  const at = '2026-08-06';
  const undated = scent({
    status: 'acknowledged', acknowledgedAt: '2026-08-05T00:00:00Z', items: [{ ackAt: at }],
  });
  const before = requestRailSteps(undated);
  assert.equal(before.steps[2].id, 'commitDue');
  assert.equal(before.index, 2, 'ยังไม่แจ้งวัน = ไฮไลต์ต้องค้างที่ขั้นกำหนดส่ง');
  assert.match(before.steps[2].hint, /รอ RD แจ้งวัน/);

  // แจ้งวันแล้ว — ขั้นนี้พกวันจริง แล้วไฮไลต์เดินต่อไปขั้นกลางที่เล่าเรื่องงาน
  const after = requestRailSteps(scent({ ...undated, committedDueDate: '2026-08-25' }));
  assert.equal(after.steps[2].hint, '25/08/2026');
  assert.equal(after.index, 3);
  assert.match(after.steps[3].label, /^RD กำลังทำ$/);
});

// ── บรรทัดใต้ชื่อขั้น = หลักฐานของใบนี้ ไม่ใช่นิยามของกระบวนการ ──────────
//
// 🐞 ผลตรวจ 2026-08-17: ทุกขั้นเขียนคำอธิบายตายตัว ("ระบุเรื่องที่ต้องการ" ·
// "ส่งถึงฝ่าย RD" · "ผู้ตอบยืนยันว่าตอบครบ") ⇒ รางบอกว่าขั้นนี้แปลว่าอะไร แต่ไม่บอก
// อะไรเกี่ยวกับ *ใบนี้* เลย ทั้งที่ชื่อคนและวันที่อยู่บนแถวแล้ว
// เทียบกับรางของใบสั่งขายที่ทุกขั้นพกค่าจริง (ผู้จัดทำ · วันที่ยื่น · ผู้อนุมัติ · ยอด)
test('⭐ ขั้นที่เกิดขึ้นแล้วต้องพกชื่อคน/วันที่ ไม่ใช่คำอธิบายลอย ๆ', () => {
  const request = scent({
    status: 'closed',
    requestedByName: 'Supisara',
    submittedAt: '2026-08-10T07:44:00Z',
    acknowledgedByName: 'Krapook',
    acknowledgedAt: '2026-08-14T02:07:00Z',
    answeredAt: '2026-08-20T03:00:00Z',
    closedByName: 'Supisara',
    closedAt: '2026-08-21T04:00:00Z',
  });
  const by = Object.fromEntries(
    requestRailSteps(request, { hasItems: false }).steps.map((s) => [s.id, s.hint]),
  );
  assert.match(by.draft, /Supisara/);
  // ขั้น "รอรับเรื่อง" จบลงตอนมีคนรับ ⇒ หลักฐานคือใครรับ เมื่อไร
  assert.match(by.pending, /Krapook/);
  assert.match(by.pending, /14\/08\/2026/);
  assert.match(by.answered, /20\/08\/2026/);
  assert.match(by.closed, /Supisara/);
});

test('ขั้นที่ยังไม่ถึงต้องบอกว่ารออะไร — ห้ามว่างเปล่า', () => {
  // ใบร่างยังไม่ยื่น: ไม่มีหลักฐานของขั้นไหนเลยนอกจากผู้เปิดใบ
  const { steps } = requestRailSteps(scent({ status: 'draft', requestedByName: 'Supisara' }), {});
  for (const step of steps) assert.ok(step.hint, `ขั้น ${step.id} ไม่มีบรรทัดรอง`);
  const pending = steps.find((s) => s.id === 'pending');
  assert.match(pending.hint, /ส่งถึง RD/);
  // ยื่นแล้วแต่ยังไม่มีใครรับ = โชว์วันที่ยื่น
  const sent = requestRailSteps(scent({ status: 'pending', submittedAt: '2026-08-10T07:44:00Z' }), {});
  assert.match(sent.steps.find((s) => s.id === 'pending').hint, /ยื่นเมื่อ 10\/08\/2026/);
});

// ⚠️ ขั้นกลางเป็นสถานะงานที่กำลังเดิน ไม่ใช่หลักฐานของอดีต — ตัวเลขความคืบหน้า
// ต้องไม่ถูกหลักฐานทับ ไม่งั้น "เสร็จแล้ว 2/5" หายไปจากจอ
test('ขั้นกลางยังเล่าความคืบหน้าของงาน ไม่ถูกชื่อผู้รับเรื่องทับ', () => {
  const request = scent({
    status: 'acknowledged',
    committedDueDate: '2026-08-25',
    acknowledgedByName: 'Krapook',
    acknowledgedAt: '2026-08-14T02:07:00Z',
    items: [{ ackAt: 'x' }, { ackAt: 'x', readyAt: 'x', outcome: 'confirmed', confirmedQty: 1, pricedAt: 'x' }],
  });
  const middle = requestRailSteps(request, { hasItems: true }).steps[2];
  assert.doesNotMatch(middle.hint, /Krapook/);
  assert.match(middle.hint, /\d+\/\d+|รายการ/);
});
