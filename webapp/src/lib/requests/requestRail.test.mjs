// ── รางของใบ — ชั้นที่ไม่เคยมีเทสต์ครอบ ─────────────────────────────────
//
// ⭐ **เทสต์ชุดนี้เกิดเพราะบั๊กสองตัวที่ผู้ใช้เจอเองบนจอ** ทั้งที่ CI เขียว 2121 ข้อ:
//   1 "รอหัวหน้ายืนยัน" ขึ้นสองบรรทัดติดกัน (พูดทั้งขั้นแยกและขั้นกลาง)
//   2 จุดไฮไลต์ชี้ผิดไปหนึ่งช่อง (index map จากสถานะดิบ ไม่ใช่รางที่เรนเดอร์จริง)
// ทั้งคู่เป็นตรรกะการประกอบราง ซึ่งตอนนั้นฝังอยู่ใน JSX ⇒ ไม่มีเทสต์ไหนแตะได้
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
    scent({ status: 'acknowledged', approvedAt: '2026-08-06T00:00:00Z' }),
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
      for (const approvedAt of [null, '2026-08-06T00:00:00Z']) {
        const request = { kind, dept: 'RD', status, approvedAt };
        const { steps, index } = requestRailSteps(request, { hasItems: false });
        assert.ok(
          index >= 0 && index < steps.length,
          `${kind}/${status}/approved=${!!approvedAt}: index ${index} อยู่นอกราง ${steps.length} ขั้น`,
        );
      }
    }
  }
});

test('⭐ ประตูหัวหน้าแทรกเฉพาะหัวข้อที่ประกาศธง', () => {
  // ใส่ให้ทุกหัวข้อไม่ได้ — คนที่เปิด "สอบถามข้อมูล" จะเห็นขั้นที่ไม่มีวันเกิดขึ้น
  assert.ok(requestRailSteps(scent()).steps.some((s) => s.id === 'approval'));
  for (const kind of ['info', 'document', 'product_dev', 'price_pm']) {
    const { steps } = requestRailSteps({ kind, dept: 'RD', status: 'pending' });
    assert.ok(!steps.some((s) => s.id === 'approval'), `${kind} ไม่ควรมีขั้นประตู`);
    assert.equal(steps.length, 5, `${kind} ต้องเหลือ 5 ขั้นเหมือนเดิม`);
  }
});

test('🐞 รับเรื่องแล้วแต่ยังไม่ยืนยัน = ไฮไลต์อยู่ที่ขั้นประตู · ยืนยันแล้วขยับไปขั้นทำงาน', () => {
  const waiting = requestRailSteps(scent({ status: 'acknowledged' }));
  assert.equal(waiting.steps[waiting.index].id, 'approval');
  assert.equal(waiting.steps[waiting.index].label, 'รอหัวหน้ายืนยัน');

  const approved = requestRailSteps(scent({ status: 'acknowledged', approvedAt: 'x' }));
  assert.equal(approved.steps[approved.index].id, 'acknowledged');
  assert.equal(approved.steps[2].label, 'หัวหน้ายืนยันแล้ว');
});

test('index ของขั้นหลังประตูต้องเลื่อนตามขั้นที่แทรก', () => {
  for (const status of ['answered', 'closed']) {
    const withGate = requestRailSteps(scent({ status, approvedAt: 'x' }));
    const without = requestRailSteps(info({ status }));
    assert.equal(withGate.steps[withGate.index].id, without.steps[without.index].id,
      `${status}: หัวข้อที่มีประตูกับไม่มีประตู ต้องชี้ขั้นความหมายเดียวกัน`);
  }
});

test('⭐ ขั้นกลางสรุปจากแถว — "รอใส่ราคา" ต้องเห็นเป็นพิเศษ (กับดักข้อ 11)', () => {
  const at = '2026-08-06';
  const base = { status: 'acknowledged', approvedAt: 'x' };
  // ยังไม่มีแถว = ยังไม่ได้ส่งของ
  assert.match(requestRailSteps(scent(base)).steps[3].label, /รอฝ่าย RD ส่งของ/);
  // คอนเฟิร์มแล้วยังไม่มีราคา — ใบค้างถาวรถ้าไม่มีใครเห็น
  const confirmed = scent({ ...base, items: [{ ackAt: at, readyAt: at, pickedUpAt: at, sentAt: at, outcome: 'confirmed' }] });
  assert.equal(requestRailSteps(confirmed).steps[3].label, 'รอใส่ราคา');
  // ของอยู่ที่ RD
  const atRd = scent({ ...base, items: [{ ackAt: at }] });
  assert.match(requestRailSteps(atRd).steps[3].label, /ฝ่าย RD กำลังทำ/);
  // ของอยู่ที่ฝ่ายขาย
  const atSa = scent({ ...base, items: [{ ackAt: at, readyAt: at }] });
  assert.equal(requestRailSteps(atSa).steps[3].label, 'รอฝ่ายขายทำต่อ');
});
