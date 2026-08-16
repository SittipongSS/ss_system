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

test('⭐ รางชุดเดียว 5 ขั้นทุกหัวข้อ — ไม่มีขั้นแทรกอีกแล้ว (ถอดประตูหัวหน้า 2026-08-16)', () => {
  // ⚠️ ด่านนี้คือสิ่งที่กันไม่ให้ขั้นแทรกกลับมาเงียบ ๆ — ขั้นที่แทรกดัน `index` ของ
  // ทุกขั้นหลังจากนั้น ซึ่งเป็นบั๊ก "จุดไฮไลต์ชี้ผิดช่อง" ที่ผู้ใช้เจอเองมาแล้ว
  for (const kind of ['scent_dev', 'info', 'document', 'product_dev', 'price_pm']) {
    const { steps } = requestRailSteps({ kind, dept: 'RD', status: 'pending' });
    assert.equal(steps.length, 5, `${kind} ต้องมี 5 ขั้น`);
    assert.deepEqual(
      steps.map((s) => s.id),
      ['draft', 'pending', 'acknowledged', 'answered', 'closed'],
      `${kind}: ลำดับขั้นเพี้ยน`,
    );
  }
});

test('index ตรงกับลำดับสถานะทุกหัวข้อ — ไม่มี offset ให้พลาด', () => {
  for (const status of STATUSES) {
    const a = requestRailSteps(scent({ status }));
    const b = requestRailSteps(info({ status }));
    assert.equal(a.index, b.index, `${status}: สองหัวข้อต้องชี้ช่องเดียวกัน`);
    assert.equal(a.steps[a.index].id, status, `${status}: ไฮไลต์ชี้ขั้น ${a.steps[a.index].id}`);
  }
  assert.equal(requestRailSteps(scent({ status: 'draft' })).index, 0);
  assert.equal(requestRailSteps(scent({ status: 'pending' })).index, 1);
  assert.equal(requestRailSteps(scent({ status: 'acknowledged' })).index, 2);
  assert.equal(requestRailSteps(scent({ status: 'answered' })).index, 3);
  assert.equal(requestRailSteps(scent({ status: 'closed' })).index, 4);
});

test('⭐ ขั้นกลางสรุปจากแถว — "รอใส่ราคา" ต้องเห็นเป็นพิเศษ (กับดักข้อ 11)', () => {
  const at = '2026-08-06';
  const base = { status: 'acknowledged' };
  // ยังไม่มีแถว = ยังไม่ได้ส่งงาน — เฉพาะหัวข้อที่ฝ่ายส่งของจริง (deliversRows)
  // ⚠️ คำต้องตรงกับปุ่ม (ม-120: "ส่งงาน" ทุกสาย) — รางเล่าก้าวเดียวกับที่ปุ่มกด
  assert.match(requestRailSteps(scent(base)).steps[2].label, /รอฝ่าย RD ส่งงาน/);
  // ⭐ หัวข้อไม่มีแถวเลย (สอบถามข้อมูล) ไม่มี "ของ" ในสาย — รอ "คำตอบ" (มติผู้ใช้
  // 2026-08-09: "แก้เป็น รอฝ่าย RD ตอบ")
  assert.match(requestRailSteps(info({ status: 'acknowledged' })).steps[2].label,
    /รอฝ่าย RD ตอบ/);
  // คอนเฟิร์มแล้วยังไม่มีราคา — ใบค้างถาวรถ้าไม่มีใครเห็น
  const confirmed = scent({ ...base, items: [{ ackAt: at, readyAt: at, pickedUpAt: at, sentAt: at, outcome: 'confirmed' }] });
  assert.equal(requestRailSteps(confirmed).steps[2].label, 'รอใส่ราคา');
  // ของอยู่ที่ RD
  const atRd = scent({ ...base, items: [{ ackAt: at }] });
  assert.match(requestRailSteps(atRd).steps[2].label, /ฝ่าย RD กำลังทำ/);
  // ของอยู่ที่ฝ่ายขาย
  const atSa = scent({ ...base, items: [{ ackAt: at, readyAt: at }] });
  assert.equal(requestRailSteps(atSa).steps[2].label, 'รอฝ่ายขายทำต่อ');
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
  assert.match(pending.hint, /ส่งถึงฝ่าย RD/);
  // ยื่นแล้วแต่ยังไม่มีใครรับ = โชว์วันที่ยื่น
  const sent = requestRailSteps(scent({ status: 'pending', submittedAt: '2026-08-10T07:44:00Z' }), {});
  assert.match(sent.steps.find((s) => s.id === 'pending').hint, /ยื่นเมื่อ 10\/08\/2026/);
});

// ⚠️ ขั้นกลางเป็นสถานะงานที่กำลังเดิน ไม่ใช่หลักฐานของอดีต — ตัวเลขความคืบหน้า
// ต้องไม่ถูกหลักฐานทับ ไม่งั้น "เสร็จแล้ว 2/5" หายไปจากจอ
test('ขั้นกลางยังเล่าความคืบหน้าของงาน ไม่ถูกชื่อผู้รับเรื่องทับ', () => {
  const request = scent({
    status: 'acknowledged',
    acknowledgedByName: 'Krapook',
    acknowledgedAt: '2026-08-14T02:07:00Z',
    items: [{ ackAt: 'x' }, { ackAt: 'x', readyAt: 'x', outcome: 'confirmed', confirmedQty: 1, pricedAt: 'x' }],
  });
  const middle = requestRailSteps(request, { hasItems: true }).steps[2];
  assert.doesNotMatch(middle.hint, /Krapook/);
  assert.match(middle.hint, /\d+\/\d+|รายการ/);
});
