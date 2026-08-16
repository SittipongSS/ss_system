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
