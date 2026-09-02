// ── สรุปฝั่งบริการของใบสั่งขาย (PR-F) ────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    plans: [{ id: 'P1', siteId: 'ST1', salesOrderId: 'SO1', isActive: true },
            { id: 'P0', siteId: 'ST2', salesOrderId: 'SO1', isActive: false }],
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
    plans: [{ id: 'P1', siteId: 'ST1', salesOrderId: 'SO1', isActive: true },
            { id: 'P0', siteId: 'ST2', salesOrderId: 'SO1', isActive: false }],
  });
  const byId = new Map(out.allocation.sites.map((row) => [row.siteId, row]));
  assert.equal(byId.get('ST1').hasPlan, true);
  assert.equal(byId.get('ST2').hasPlan, false, 'รอบที่ปิดใช้งานไม่นับว่าวางแล้ว');
  // ยอดรวมกับธงรายแถวต้องมาจากชุดเดียวกัน ไม่ใช่นับคนละรอบ
  assert.equal(out.plans.sitesWithoutPlan, out.allocation.sites.filter((r) => !r.hasPlan).length);
});

test('นัดข้างหน้า: นับผ่าน/ติด และเหตุที่พบบ่อยที่สุด', () => {
  const visits = [
    { id: 'V1', siteId: 'ST1', scheduledDate: '2026-09-01', status: 'scheduled', planId: 'P1' },
    { id: 'V2', siteId: 'ST1', scheduledDate: '2026-09-08', status: 'scheduled', planId: 'P1' },
    { id: 'V3', siteId: 'ST1', scheduledDate: '2026-09-15', status: 'scheduled', planId: 'P1' },
    { id: 'V0', siteId: 'ST1', scheduledDate: '2026-08-01', status: 'done', planId: 'P1' },  // อดีต ไม่นับเป็นนัดข้างหน้า
  ];
  const gateByVisitId = new Map([
    ['V1', { ok: true, blocked: [] }],
    ['V2', { ok: false, blocked: [{ reason: 'ยังไม่ผูกสัญญา' }] }],
    ['V3', { ok: false, blocked: [{ reason: 'ยังไม่ผูกสัญญา' }, { reason: 'ยังไม่มอบหมาย' }] }],
  ]);
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, visits, gateByVisitId,
    plans: [{ id: 'P1', siteId: 'ST1', salesOrderId: 'SO1', isActive: true }], todayIso: TODAY,
  });
  assert.equal(out.visits.ahead, 3);
  assert.equal(out.visits.passed, 1);
  assert.equal(out.visits.blocked, 2);
  assert.deepEqual(out.visits.topReason, { reason: 'ยังไม่ผูกสัญญา', count: 2 });
});

test('กระทบยอดรอบ: นับเฉพาะนัดที่ปิดงานแล้วและเกิดจากรอบ', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
    plans: [{ id: 'P1', siteId: 'ST1', salesOrderId: 'SO1', isActive: true }],
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

/* ── ขอบเขต: ทุกตัวเลขบนแท็บนี้เป็นของ "ใบ" ไม่ใช่ของ "ไซต์" ──────────────────
   🔴 ผู้เรียกโหลดรอบ/นัดมารายไซต์ (repo กลางรับ siteId เดียว) ⇒ ของที่ป้อนเข้ามา
   ปนของทุกใบที่ลงไซต์เดียวกัน · การกรองเป็นงานของฟังก์ชันนี้
   ⚠️ เกณฑ์ต้องตรงกับคอลัมน์ "รอบที่เดิน n/N" บนทะเบียนใบสั่งขาย ซึ่งกรอง
   `.in('salesOrderId', ...)` มาตั้งแต่แรก — ก่อนหน้านี้สองจอชื่อเดียวกันคนละเลข */
const ownP = (over = {}) => ({ id: 'P-own', siteId: 'ST1', salesOrderId: 'SO1', isActive: true, ...over });
const otherP = (over = {}) => ({ id: 'P-other', siteId: 'ST1', salesOrderId: 'SO9', isActive: true, ...over });
const looseP = (over = {}) => ({ id: 'P-loose', siteId: 'ST1', salesOrderId: null, isActive: true, ...over });

test('รอบที่เดินไปแล้ว: นับเฉพาะนัดที่มาจากรอบของใบนี้', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
    plans: [ownP(), otherP(), looseP()],
    visits: [
      { id: 'V1', siteId: 'ST1', scheduledDate: '2026-08-01', status: 'done', planId: 'P-own' },
      { id: 'V2', siteId: 'ST1', scheduledDate: '2026-08-02', status: 'done', planId: 'P-other' },
      { id: 'V3', siteId: 'ST1', scheduledDate: '2026-08-03', status: 'done', planId: 'P-loose' },
    ],
  });
  assert.equal(out.rounds.done, 1, 'นัดของใบอื่นและของรอบที่ไม่ผูกใบ ห้ามนับให้ใบนี้');
});

test('รอบที่ปิดใช้งานแล้วยังนับรอบที่เดินไป แต่ไม่นับว่า "วางแล้ว"', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
    plans: [ownP({ isActive: false })],
    visits: [{ id: 'V1', siteId: 'ST1', scheduledDate: '2026-08-01', status: 'done', planId: 'P-own' }],
  });
  // ประวัติที่เกิดขึ้นจริงไม่หายไปเพราะปิดรอบ — เกณฑ์เดียวกับทะเบียนที่ไม่กรอง isActive
  assert.equal(out.rounds.done, 1);
  // แต่ไซต์นี้ยังต้องวางรอบใหม่ ("ยังต้องวางรอบอีกไหม" เป็นคนละคำถาม)
  assert.equal(out.allocation.sites[0].hasPlan, false);
  assert.equal(out.plans.sitesWithoutPlan, 1);
});

test('นัดข้างหน้าก็เป็นของใบนี้เท่านั้น — ไม่งั้นสองเลขบนการ์ดเดียวกันคนละขอบเขต', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
    plans: [ownP(), otherP()],
    visits: [
      { id: 'V1', siteId: 'ST1', scheduledDate: '2026-09-01', status: 'scheduled', planId: 'P-own' },
      { id: 'V2', siteId: 'ST1', scheduledDate: '2026-09-02', status: 'scheduled', planId: 'P-other' },
      { id: 'V3', siteId: 'ST1', scheduledDate: '2026-09-03', status: 'scheduled', planId: null },
    ],
    gateByVisitId: new Map([['V1', { ok: true, blocked: [] }]]),
  });
  assert.equal(out.visits.ahead, 1, 'นัดของใบอื่น และงานนอกรอบ (planId ว่าง) ไม่ใช่ของใบนี้');
});

/* 🔴 **สภาพที่สาม** — ไซต์ที่มีรอบของ *ใบอื่น* ไม่ใช่ "วางแล้ว" และไม่ใช่ "ยังไม่วาง" เฉย ๆ
   ของเดิมกลืนสภาพนี้เข้ากับ "วางแล้ว" แล้วซ่อนปุ่ม ⇒ ใบที่สอง (ต่อสัญญา/ขายเพิ่มที่ไซต์เดิม)
   วางรอบที่ผูก salesOrderId ของตัวเองจากหน้าใบไม่ได้เลย ต้องไปสร้างที่หน้าไซต์
   ซึ่งได้ salesOrderId = null แล้วไม่ถูกนับให้ใบไหนตลอดกาล */
test('ไซต์ที่มีรอบของใบอื่น: ยังไม่วางสำหรับใบนี้ แต่ต้องบอกว่ามีรอบอื่นอยู่', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
    plans: [otherP()],
  });
  const row = out.allocation.sites[0];
  assert.equal(row.hasPlan, false, 'ใบนี้ยังไม่มีรอบของตัวเอง ⇒ ปุ่มวางรอบต้องไม่หาย');
  assert.equal(row.hasForeignPlan, true, 'ต้องเตือนได้ว่าไซต์นี้มีรอบเดินอยู่แล้ว');
  assert.equal(out.plans.total, 0, 'จำนวนรอบบนหัวการ์ดก็ต้องเป็นของใบนี้');
});

test('มีรอบของใบนี้แล้ว = วางแล้ว ไม่ต้องเตือนเรื่องรอบอื่น', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
    plans: [ownP(), otherP()],
  });
  const row = out.allocation.sites[0];
  assert.equal(row.hasPlan, true);
  assert.equal(row.hasForeignPlan, false, 'สองธงต้องไม่ขึ้นพร้อมกัน ไม่งั้นจอเลือกป้ายไม่ถูก');
  assert.equal(out.plans.total, 1);
});

test('รอบที่ไม่ผูกใบ (วางจากหน้าไซต์) ก็นับเป็น "รอบของใบอื่น"', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line()], terms: [term()], zonesById, sitesById, todayIso: TODAY,
    plans: [looseP()],
  });
  const row = out.allocation.sites[0];
  assert.equal(row.hasPlan, false);
  assert.equal(row.hasForeignPlan, true, 'มีรอบเดินอยู่จริงที่ไซต์ ⇒ ต้องเตือนก่อนสร้างซ้อน');
});

/* 🪤 **ยามของจอ** — ตรรกะข้างบนถูกแล้วไม่พอ ถ้าจอยังตัดสินป้าย/ปุ่มจากธงเดียว
   บั๊กเดิมอยู่ที่จอล้วน ๆ (`canPlan && !row.hasPlan` โดยที่ hasPlan เป็นของไซต์)
   ⇒ ผูกไว้กับซอร์สโดยตรง เพื่อไม่ให้ใครยุบสามสภาพกลับเป็นสองโดยไม่ตั้งใจ */
test('🪤 จอต้องใช้สามสภาพ และปุ่มวางรอบต้องไม่หายเพราะรอบของใบอื่น', () => {
  const tab = readFileSync(
    new URL('../../components/salesPlanning/SalesOrderServiceTab.js', import.meta.url),
    'utf8',
  );
  assert.match(tab, /hasForeignPlan/, 'จอต้องอ่านธงสภาพที่สาม');
  assert.match(tab, /มีรอบของใบอื่น/, 'ป้ายของสภาพที่สามต้องพูดความจริง ไม่ใช่ "วางแล้ว"');
  // เงื่อนไขปุ่มต้องผูกกับ hasPlan (ของใบนี้) เท่านั้น — ห้ามเอา hasForeignPlan ไปซ่อนปุ่ม
  assert.match(tab, /canPlan && !row\.hasPlan &&/);
  assert.doesNotMatch(
    tab, /!row\.hasForeignPlan\s*&&/,
    'รอบของใบอื่นเป็นเหตุให้ "เตือน" ไม่ใช่เหตุให้ "ซ่อนปุ่ม" (กติกา ติดด่าน = โชว์แล้วบอกเหตุ)',
  );
});
