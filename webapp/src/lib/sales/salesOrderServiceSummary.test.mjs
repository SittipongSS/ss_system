// ── สรุปฝั่งบริการของใบสั่งขาย (PR-F) ────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { salesOrderServiceSummary } from './salesOrderServiceSummary.js';

const TODAY = '2026-08-31';
const live = { id: 'SO1', status: 'approved', supersededById: null };
const line = (over = {}) => ({ id: 'L1', fgCode: 'FG-1-02-001-1', description: 'แพ็คเกจ', qty: 3, unit: 'แพ็คเกจ', serviceRounds: 12, ...over });
const zonesById = new Map([['Z1', { id: 'Z1', siteId: 'ST1', name: 'Lobby' }], ['Z2', { id: 'Z2', siteId: 'ST2', name: 'Cafe' }]]);
const sitesById = new Map([['ST1', { id: 'ST1', name: 'ไซต์ A' }], ['ST2', { id: 'ST2', name: 'ไซต์ B' }]]);
const term = (over = {}) => ({ id: 'T1', zoneId: 'Z1', salesOrderId: 'SO1', salesOrderLineId: 'L1', packageQty: 1, ...over });

test('การจัดสรร: เหลือเท่าไร และครบเมื่อไร', () => {
  const partial = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
  });
  assert.equal(partial.allocation.remaining, 2);          // ขาย 3 ลงโซนไป 1
  assert.equal(partial.allocation.complete, false);
  assert.equal(partial.allocation.sites.length, 1);
  assert.equal(partial.allocation.sites[0].zones[0].name, 'Lobby');

  const full = salesOrderServiceSummary({
    order: live, lines: [line()], zonesById, sitesById, todayIso: TODAY,
    terms: [term({ packageQty: 3 })],
  });
  assert.equal(full.allocation.remaining, 0);
  assert.equal(full.allocation.complete, true);
});

test('ใบที่ถูก Rev./ยกเลิก = รอบขายไม่นับ (ไม่งั้นจัดสรรซ้ำสองเท่า)', () => {
  for (const order of [{ ...live, supersededById: 'SO2' }, { ...live, status: 'cancelled' }]) {
    const out = salesOrderServiceSummary({
      order, lines: [line()], terms: [term({ packageQty: 3 })], zonesById, sitesById, todayIso: TODAY,
    });
    assert.equal(out.allocation.remaining, 3);
    assert.equal(out.allocation.complete, false);
    assert.deepEqual(out.allocation.sites, []);
  }
});

test('ไซต์ที่ลงของแล้วแต่ยังไม่มีรอบ = งานค้างที่ฝ่ายขายต้องเห็น', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], zonesById, sitesById, todayIso: TODAY,
    terms: [term(), term({ id: 'T2', zoneId: 'Z2', salesOrderLineId: 'L1' })],
    plans: [{ id: 'P1', siteId: 'ST1', isActive: true }, { id: 'P0', siteId: 'ST2', isActive: false }],
  });
  assert.equal(out.plans.total, 1);
  assert.equal(out.plans.sitesWithoutPlan, 1);   // ST2 มีแต่รอบที่ปิดไปแล้ว
});

/* 🪤 **ยอดรวมอย่างเดียวตอบไม่ได้ว่าไซต์ไหนคือไซต์ที่ค้าง** — `planSites` คำนวณอยู่แล้ว
   แต่เดิมถูกใช้ครั้งเดียวเพื่อนับ ⇒ คนอ่านตารางต้องไล่เปิดทีละไซต์เอง
   ⚠️ รอบที่ปิดใช้งาน (`isActive: false`) ไม่นับว่าวางแล้ว — ไซต์นั้นยังไม่มีนัดเกิด */
test('แต่ละแถวไซต์ต้องบอกเองว่าวางรอบแล้วหรือยัง', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], zonesById, sitesById, todayIso: TODAY,
    terms: [term(), term({ id: 'T2', zoneId: 'Z2', salesOrderLineId: 'L1' })],
    plans: [{ id: 'P1', siteId: 'ST1', isActive: true }, { id: 'P0', siteId: 'ST2', isActive: false }],
  });
  const byId = new Map(out.allocation.sites.map((row) => [row.siteId, row]));
  assert.equal(byId.get('ST1').hasPlan, true);
  assert.equal(byId.get('ST2').hasPlan, false, 'รอบที่ปิดใช้งานไม่นับว่าวางแล้ว');
  // ยอดรวมกับธงรายแถวต้องมาจากชุดเดียวกัน ไม่ใช่นับคนละรอบ
  assert.equal(out.plans.sitesWithoutPlan, out.allocation.sites.filter((r) => !r.hasPlan).length);
});

test('นัดข้างหน้า: นับผ่าน/ติด และเหตุที่พบบ่อยที่สุด', () => {
  const visits = [
    { id: 'V1', siteId: 'ST1', scheduledDate: '2026-09-01', status: 'scheduled' },
    { id: 'V2', siteId: 'ST1', scheduledDate: '2026-09-08', status: 'scheduled' },
    { id: 'V3', siteId: 'ST1', scheduledDate: '2026-09-15', status: 'scheduled' },
    { id: 'V0', siteId: 'ST1', scheduledDate: '2026-08-01', status: 'done', planId: 'P1' },  // อดีต ไม่นับเป็นนัดข้างหน้า
  ];
  const gateByVisitId = new Map([
    ['V1', { ok: true, blocked: [] }],
    ['V2', { ok: false, blocked: [{ reason: 'ยังไม่ผูกสัญญา' }] }],
    ['V3', { ok: false, blocked: [{ reason: 'ยังไม่ผูกสัญญา' }, { reason: 'ยังไม่มอบหมาย' }] }],
  ]);
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, visits, gateByVisitId,
    plans: [{ id: 'P1', siteId: 'ST1', isActive: true }], todayIso: TODAY,
  });
  assert.equal(out.visits.ahead, 3);
  assert.equal(out.visits.passed, 1);
  assert.equal(out.visits.blocked, 2);
  assert.deepEqual(out.visits.topReason, { reason: 'ยังไม่ผูกสัญญา', count: 2 });
});

test('กระทบยอดรอบ: นับเฉพาะนัดที่ปิดงานแล้วและเกิดจากรอบ', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
    plans: [{ id: 'P1', siteId: 'ST1', isActive: true }],
    visits: [
      { id: 'V1', siteId: 'ST1', scheduledDate: '2026-08-01', status: 'done', planId: 'P1' },
      { id: 'V2', siteId: 'ST1', scheduledDate: '2026-08-10', status: 'done', planId: null },   // งานนอกรอบ
      { id: 'V3', siteId: 'ST1', scheduledDate: '2026-08-20', status: 'cancelled', planId: 'P1' },
    ],
  });
  assert.deepEqual(out.rounds, { sold: 12, done: 1 });
});

test('ยังไม่กรอกจำนวนรอบ = null ไม่ใช่ 0 (จอจะได้ไม่โชว์ n/0)', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line({ serviceRounds: null })], terms: [term()], zonesById, sitesById, todayIso: TODAY,
  });
  assert.equal(out.rounds.sold, null);
});
