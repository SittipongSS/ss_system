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

/* ── ใบที่ประทับแล้ว (mig 0392 · PR-A) — ฝ่ายขายตั้งโซน/แพ็คต่อรอบ/รอบในใบ รอบขายเกิดครบตอนอนุมัติ ──────────────
   ⭐ ไม่มี "ของค้างรอลงโซน" (จำนวนในใบ = ระยะเวลา/แพ็คเกจ ไม่ใช่หน่วยที่ต้องจัดสรร) · ขายไว้ = จำนวนครั้งที่ต้องไปไซต์ (D23) */
const stamped = { ...live, serviceTermsOpenedAt: '2026-09-28T03:00:00Z' };
/* บรรทัดพิมพ์เอง 12 "เดือน" ที่ฝ่ายขายตั้งเป็นแพ็คเกจ — ลง 2 โซนของไซต์ A + 1 โซนของไซต์ B · 12 รอบ */
const manualPackage = line({ id: 'L1', fgCode: null, productId: null, qty: 12, unit: 'เดือน', serviceKind: 'package', serviceProductId: 'P1', serviceFgCode: 'FG-0521-02-001-00012', serviceRounds: 12 });
const zones3 = new Map([...zonesById, ['Z3', { id: 'Z3', siteId: 'ST1', name: 'Hall' }]]);

test('⭐ ใบที่ประทับแล้ว: ไม่มีของค้างรอลงโซน · ครบเมื่อมีไซต์ · ขายไว้ = ครั้งที่ต้องไปไซต์ (ไม่บวกซ้ำรายโซน)', () => {
  const out = salesOrderServiceSummary({
    order: stamped, lines: [manualPackage], zonesById: zones3, sitesById, todayIso: TODAY,
    terms: [
      term({ id: 'T1', zoneId: 'Z1', packageQty: 2 }),
      term({ id: 'T3', zoneId: 'Z3', packageQty: 1 }),
      term({ id: 'T2', zoneId: 'Z2', packageQty: 1 }),
    ],
  });
  assert.equal(out.allocation.remaining, 0, 'จำนวนในใบ 12 เดือน ≠ หน่วยที่ต้องจัดสรร');
  assert.ok(out.allocation.fg.every((g) => g.remaining === 0), 'ตารางต้องไม่โชว์ "ยังไม่ลงโซน" ขัดกับหัวการ์ด');
  assert.equal(out.allocation.complete, true);
  assert.equal(out.allocation.sites.length, 2);
  assert.equal(out.rounds.sold, 24, 'ไซต์ A 12 + ไซต์ B 12 — ไม่ใช่ 36 (บวกรายโซน) และไม่ใช่ 12 (บวกรายบรรทัด)');
});

test('ใบที่ประทับแล้วไม่มีบรรทัดแพ็คเกจเลย = ไม่มีอะไรต้องลง ⇒ ครบ · มีแพ็คเกจแต่ไม่มีไซต์ = ยังไม่ครบ', () => {
  const none = salesOrderServiceSummary({
    order: stamped, lines: [line({ fgCode: 'FG-0521-03-002-00007', serviceRounds: null })], terms: [], zonesById, sitesById, todayIso: TODAY,
  });
  assert.equal(none.allocation.complete, true);
  assert.equal(none.rounds.sold, null, 'ไม่มีไซต์ = ยังไม่ระบุ ไม่ใช่ศูนย์');
  const empty = salesOrderServiceSummary({ order: stamped, lines: [manualPackage], terms: [], zonesById, sitesById, todayIso: TODAY });
  assert.equal(empty.allocation.complete, false);
});

test('ใบที่ยังไม่ประทับ (ใบเดิม) คงตัวนับเดิม — ของค้างนับจากจำนวน · ขายไว้ = Σ รอบรายบรรทัด', () => {
  const out = salesOrderServiceSummary({
    order: live, lines: [line({ qty: 3 }), line({ id: 'L2', serviceRounds: 6 })], zonesById, sitesById, todayIso: TODAY,
    terms: [term({ packageQty: 1 })],
  });
  assert.equal(out.allocation.remaining, 5);
  assert.equal(out.rounds.sold, 18);
});

/* ── เลขแพ็คของบรรทัด (mig 0407 · งวด PR-2 · docs/qt-pack-column.md) ───────────────────────────────────
   ใบเดิม (ยังไม่ประทับ): ของค้าง = หน่วยรวมของบรรทัด (แพ็ค × จำนวน) หน่วย "แพ็ค" · ใบที่ประทับแล้ว: ไม่มีของค้างตามเดิม */
test('⭐ ใบที่ยังไม่ประทับ + บรรทัดที่มีเลขแพ็ค: ขายไว้ 2 × 12 = 24 แพ็ค · ลงโซนไป 5 เหลือ 19 (วันนี้จะบอก 12 เดือน เหลือ 7)', () => {
  const packLine = line({ qty: 12, unit: 'เดือน', packQty: 2 });
  const out = salesOrderServiceSummary({
    order: live, lines: [packLine], terms: [term({ packageQty: 5 })], zonesById, sitesById, todayIso: TODAY,
  });
  assert.deepEqual(out.allocation.fg.map((g) => [g.qty, g.unit, g.remaining]), [[24, 'แพ็ค', 19]]);
  assert.equal(out.allocation.remaining, 19);
  assert.equal(out.allocation.complete, false);
  const full = salesOrderServiceSummary({
    order: live, lines: [packLine], terms: [term({ packageQty: 24 })], zonesById, sitesById, todayIso: TODAY,
  });
  assert.equal(full.allocation.remaining, 0);
  assert.equal(full.allocation.complete, true);
});

test('ใบที่ประทับแล้ว + บรรทัดที่มีเลขแพ็ค: ไม่มีของค้างตามเดิม — แถวสรุปบอก 24 แพ็ค เหลือ 0', () => {
  const out = salesOrderServiceSummary({
    order: stamped, lines: [line({ qty: 12, unit: 'เดือน', packQty: 2, serviceKind: 'package', serviceFgCode: 'FG-0521-02-001-00012' })],
    terms: [term({ packageQty: 2 })], zonesById, sitesById, todayIso: TODAY,
  });
  assert.deepEqual(out.allocation.fg.map((g) => [g.qty, g.unit, g.remaining]), [[24, 'แพ็ค', 0]]);
  assert.equal(out.allocation.remaining, 0);
  assert.equal(out.allocation.complete, true);
});

test('🔴 เลขแพ็คว่าง = สรุปงานบริการเท่ากับวันนี้ทุกคีย์ (ไม่มีคีย์ · packQty: null) — ทั้งใบเดิมและใบที่ประทับแล้ว', () => {
  const lines = [line({ qty: 3 }), line({ id: 'L2', fgCode: 'FG-2-02-001-2', qty: 12, unit: 'เดือน', serviceRounds: 6 })];
  for (const order of [live, stamped]) {
    const args = { order, zonesById, sitesById, todayIso: TODAY, terms: [term({ packageQty: 1 })] };
    const noKey = salesOrderServiceSummary({ ...args, lines });
    const withNull = salesOrderServiceSummary({ ...args, lines: lines.map((l) => ({ ...l, packQty: null })) });
    const strip = (out) => JSON.parse(JSON.stringify(out, (key, value) => (key === 'packQty' ? undefined : value)));
    assert.deepEqual(strip(withNull), strip(noKey));
    // ค่าที่คาด = ลอกจากพฤติกรรมวันนี้
    assert.deepEqual(noKey.allocation.fg.map((g) => [g.key, g.qty, g.unit, g.remaining]),
      order === live ? [['FG-1-02-001-1', 3, 'แพ็คเกจ', 2], ['FG-2-02-001-2', 12, 'เดือน', 12]]
        : [['FG-1-02-001-1', 3, 'แพ็คเกจ', 0], ['FG-2-02-001-2', 12, 'เดือน', 0]]);
  }
});

test('mig 0407: route สรุปงานบริการเลือก "packQty" คู่กับ qty — ไม่มี = บรรทัด 2 × 12 ถูกนับเป็น 12', () => {
  const route = readFileSync(new URL('../../app/api/sales-planning/sales-orders/[id]/service/route.js', import.meta.url), 'utf8');
  const select = route.match(/from\('sales_order_lines'\)\s*\.select\('([^']*)'\)/)?.[1] || '';
  const columns = select.split(',').map((col) => col.trim().replace(/"/g, ''));
  assert.ok(columns.includes('qty') && columns.includes('packQty'), select);
});

test('route สรุปงานบริการเลือกช่องที่ตัวตัดสินของใบที่ประทับแล้วอ่าน (ไม่มีราคา)', () => {
  const route = readFileSync(new URL('../../app/api/sales-planning/sales-orders/[id]/service/route.js', import.meta.url), 'utf8');
  const select = route.match(/from\('sales_order_lines'\)\s*\.select\('([^']*)'\)/)?.[1] || '';
  for (const col of ['"fgCode"', '"productId"', 'metadata', '"serviceKind"', '"serviceProductId"', '"serviceFgCode"', '"serviceRounds"']) {
    assert.ok(select.includes(col), col);
  }
  assert.doesNotMatch(select, /unitPrice|lineTotal|discount/);
});

/* ── C8 (PR-C): รอบขายรายไซต์ในทรงเดียวกับรายละเอียดโซนของคิว TS (IMPL_PLAN_C §3.8 · §4.3) ─────────────
   ⭐ แท็บงานบริการของใบส่งรายการนี้ให้ช่องมาตรฐาน มล./เดือน (`TermStandardMlCell`) ตรง ๆ ไม่แปลงทรง
   ⚠️ รายการต้องเท่ากับ `termDetails` ของคิว TS (C1) สำหรับรอบขายเดียวกัน — ไม่งั้นสองจอเสนอมาตรฐานคนละเลข */
const officeZones = new Map([['SZN-office', { id: 'SZN-office', siteId: 'ST1', name: 'Office', code: 'ZN-1120-10210' }]]);
const asanSites = new Map([['ST1', { id: 'ST1', code: 'ST-0364-01-BKK-1120', name: 'Asan Service' }]]);
/* รูปของ SO-26090247-0 (อ่านจากฐานจริง 29/09): 2 บรรทัด FG เดียวกัน 1 รอบ · ลงโซน Office ทั้งคู่ บรรทัดละ 2 แพ็ค */
const soStamped = {
  id: 'SOR-mum2x0ms1fti', orderNumber: 'SO-26090247-0', status: 'approved', supersededById: null, origin: 'pipeline',
  serviceTermsOpenedAt: '2026-09-29T04:08:11Z', servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21',
};
const soLines = [
  { id: 'SOL-a', sortOrder: 0, fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น · 2 package', qty: 12, unit: 'เดือน', serviceRounds: 1 },
  { id: 'SOL-b', sortOrder: 1, fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น · 2 package', qty: 12, unit: 'เดือน', serviceRounds: 1 },
];
const soTerm = (over = {}) => ({
  id: 'SZT-2', zoneId: 'SZN-office', salesOrderId: 'SOR-mum2x0ms1fti', salesOrderLineId: 'SOL-b',
  fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น · 2 package', packageQty: 2, unit: 'แพ็ค', standardMlPerMonth: null, ...over,
});
const soTerms = [soTerm(), soTerm({ id: 'SZT-1', salesOrderLineId: 'SOL-a' })];
const soSummary = (over = {}) => salesOrderServiceSummary({
  order: soStamped, lines: soLines, terms: soTerms, zonesById: officeZones, sitesById: asanSites, todayIso: '2026-09-29', ...over,
});

test('C8: แถวไซต์พารอบขายในทรง §4.3 (id · โซน · FG · แพ็ค/รอบ · หน่วย · รอบ · เดือน · มาตรฐาน)', () => {
  const out = soSummary();
  assert.equal(out.stamped, true, 'ช่องมาตรฐานเสนอค่าเฉพาะใบที่ประทับ — จอต้องรู้จากตัวสรุป');
  const [row] = out.allocation.sites;
  assert.deepEqual(row.terms, [
    { id: 'SZT-1', zoneId: 'SZN-office', zoneCode: 'ZN-1120-10210', zoneName: 'Office', fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น · 2 package', packageQty: 2, unit: 'แพ็ค', rounds: 1, periodMonths: 12, standardMlPerMonth: null },
    { id: 'SZT-2', zoneId: 'SZN-office', zoneCode: 'ZN-1120-10210', zoneName: 'Office', fgCode: 'FG-364-02-001-1061', description: 'ระบบกระจายกลิ่น · 2 package', packageQty: 2, unit: 'แพ็ค', rounds: 1, periodMonths: 12, standardMlPerMonth: null },
  ], 'เรียงตามโซน แล้วตามลำดับบรรทัดในใบ (รายการ 1 ก่อน 2)');
  // ช่องเดิมของแถวไม่เปลี่ยน (ผู้อ่านเดิม: หน้าใบย้อนหลัง historicalServiceProgress)
  assert.deepEqual(row.zones, [{ id: 'SZN-office', name: 'Office' }]);
  assert.equal(row.packageQty, 4);
});

test('C8: รายการเดียวกับ termDetails ของคิว TS (C1) สำหรับรอบขายเดียวกัน — ใบประทับ และใบเดิมที่ยังไม่ประทับ', async () => {
  const { planRowFacts } = await import('../service/intakePlanFacts.js');
  const byId = (a, b) => a.id.localeCompare(b.id);
  const intakeItems = (order, terms, zones) => planRowFacts(
    { stamped: !!order.serviceTermsOpenedAt, zones, terms, roundsSold: 1, site: asanSites.get('ST1'), orderNumber: order.orderNumber, salesOrderId: order.id },
    { order, linesById: new Map(soLines.map((l) => [l.id, l])), todayIso: '2026-09-29' },
  ).termDetails;
  const zones = [...officeZones.values()];

  assert.deepEqual(
    [...soSummary().allocation.sites[0].terms].sort(byId),
    [...intakeItems(soStamped, soTerms, zones)].sort(byId),
  );
  /* ใบเดิม (ยังไม่ประทับ) ที่มีช่วงร่างของงานตั้งย้อนหลัง: packageQty = จำนวนที่จัดสรร (ไม่ใช่แพ็ค/รอบ) และช่วงร่างยังไม่ผ่านผู้จัดการ
     ⇒ ทั้งสองจอให้ packageQty/periodMonths = null (ไม่มีข้อเสนอ มล. · แก้ค่าได้ตามเดิม) */
  const legacy = { ...soStamped, serviceTermsOpenedAt: null };
  const legacyTerms = soTerms.map((t) => ({ ...t, packageQty: 3, unit: 'เครื่อง', standardMlPerMonth: 1500 }));
  const mine = [...soSummary({ order: legacy, terms: legacyTerms }).allocation.sites[0].terms].sort(byId);
  assert.deepEqual(mine, [...intakeItems(legacy, legacyTerms, zones)].sort(byId));
  assert.equal(mine[0].packageQty, null);
  assert.equal(mine[0].periodMonths, null);
  assert.equal(mine[0].standardMlPerMonth, 1500, 'ค่าที่ตั้งไว้แล้วต้องโชว์ แม้ใบยังไม่ประทับ');
  assert.equal(soSummary({ order: legacy, terms: legacyTerms }).stamped, false);
});

test('C8: ใบย้อนหลังที่ได้ตรา (PR-D · 0394) — รายการตรงกับคิว TS แม้คิวรู้ช่วงจากสัญญา · ไม่มีข้อเสนอ มล. ทั้งสองจอ', async () => {
  const { planRowFacts } = await import('../service/intakePlanFacts.js');
  const { standardMlSuggestion } = await import('../service/termStandardMl.js');
  const { ORIGIN_HISTORICAL } = await import('./historicalOrders.js');
  const byId = (a, b) => a.id.localeCompare(b.id);
  const order = { ...soStamped, origin: ORIGIN_HISTORICAL, servicePeriodFrom: null, servicePeriodTo: null, serviceContractId: 'CT-1' };
  const contract = { id: 'CT-1', contractNo: 'CT-2601-0001', status: 'signed', effectiveDate: '2026-01-01', expiryDate: '2026-12-31' };
  const mine = [...soSummary({ order }).allocation.sites[0].terms].sort(byId);
  const intake = [...planRowFacts(
    { stamped: true, zones: [...officeZones.values()], terms: soTerms, roundsSold: 1, site: asanSites.get('ST1'), orderNumber: order.orderNumber, salesOrderId: order.id },
    { order, contract, linesById: new Map(soLines.map((l) => [l.id, l])), todayIso: '2026-09-29' },
  ).termDetails].sort(byId);
  assert.deepEqual(mine, intake);
  assert.ok(mine.every((t) => standardMlSuggestion(t, { stamped: true }) === null));
});

test('C8: ข้อเสนอ มล. จากรายการของแท็บ = เลขเดียวกับจอคิว (167 มล. · 2 แพ็ค/รอบ × 1 รอบ ÷ 12 เดือน)', async () => {
  const { standardMlSuggestion } = await import('../service/termStandardMl.js');
  const out = soSummary();
  const suggestion = standardMlSuggestion(out.allocation.sites[0].terms[0], { stamped: out.stamped });
  assert.equal(suggestion?.value, 167);
  assert.equal(suggestion?.label, '167 มล. (2 แพ็ค/รอบ × 1 รอบ ÷ 12 เดือน × 1 ลิตร)');
});

test('C8: ใบที่ไม่มีผลแล้ว = ไม่มีรอบขายให้ตั้งมาตรฐาน · โซนที่หาไม่เจอไม่โผล่', () => {
  for (const order of [{ ...soStamped, supersededById: 'SOR-rev' }, { ...soStamped, status: 'cancelled' }, { ...soStamped, status: 'approval_revoked' }]) {
    const out = soSummary({ order });
    assert.deepEqual(out.allocation.sites, [], order.status);
  }
  const ghost = soSummary({ terms: [...soTerms, soTerm({ id: 'SZT-9', zoneId: 'SZN-gone' })] });
  assert.deepEqual(ghost.allocation.sites[0].terms.map((t) => t.id), ['SZT-1', 'SZT-2']);
});

test('C8: ค่าที่ขาด = null ไม่ใช่ 0 (ไม่มีบรรทัด/รอบ/ช่วง/ค่ามาตรฐานไม่ใช่บวก)', () => {
  const out = soSummary({
    order: { ...soStamped, servicePeriodFrom: null, servicePeriodTo: null },
    lines: [{ ...soLines[0], serviceRounds: null }],
    terms: [soTerm({ id: 'SZT-1', salesOrderLineId: 'SOL-a', standardMlPerMonth: 0 }), soTerm({ id: 'SZT-2', salesOrderLineId: 'SOL-x', packageQty: null, unit: null, fgCode: null, description: null })],
  });
  const [a, b] = out.allocation.sites[0].terms;
  assert.equal(a.rounds, null);
  assert.equal(a.periodMonths, null);
  assert.equal(a.standardMlPerMonth, null);
  assert.deepEqual([b.rounds, b.packageQty, b.unit, b.fgCode, b.description], [null, null, null, null, null]);
});

test('C8: ป้ายของรอบขายในเซลล์ — โซนเดียวรอบเดียว = ชื่อโซน · โซนเดียวหลายรอบ = บอก "รายการ n" (ตรงคอลัมน์ # ของตารางรายการ) + FG', () => {
  const lobby = new Map([...officeZones, ['SZN-lobby', { id: 'SZN-lobby', siteId: 'ST1', name: 'Lobby', code: 'ZN-1120-10211' }]]);
  const out = soSummary({
    zonesById: lobby,
    lines: [...soLines, { id: 'SOL-c', sortOrder: 2, fgCode: 'FG-9', serviceRounds: 1 }],
    terms: [...soTerms, soTerm({ id: 'SZT-3', zoneId: 'SZN-lobby', salesOrderLineId: 'SOL-c', fgCode: 'FG-9' })],
  });
  const [row] = out.allocation.sites;
  assert.deepEqual(row.terms.map((t) => t.id), ['SZT-3', 'SZT-1', 'SZT-2'], 'Lobby ก่อน Office (เรียงตามชื่อโซน)');
  assert.deepEqual(row.termLabels, {
    'SZT-3': { zone: 'Lobby', detail: null },
    'SZT-1': { zone: 'Office', detail: 'รายการ 1 · FG-364-02-001-1061' },
    'SZT-2': { zone: 'Office', detail: 'รายการ 2 · FG-364-02-001-1061' },
  });
});

test('C8: ตัวสรุปไม่ดึงไฟล์ของคิว TS (intakePlanFacts) · route เลือกรหัสโซนมาด้วย', () => {
  const lib = readFileSync(new URL('./salesOrderServiceSummary.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /(from|import\()\s*['"][^'"]*intakePlanFacts/, 'ห้าม import ไฟล์ของคิว TS (แผน §3.8)');
  assert.match(lib, /import \{[^}]*\bperiodSpan\b[^}]*\} from '@\/lib\/sales\/serviceSetup'/);
  assert.match(lib, /import \{[^}]*\bservicePeriodOf\b[^}]*\} from '@\/lib\/sales\/serviceSetup'/);
  const route = readFileSync(new URL('../../app/api/sales-planning/sales-orders/[id]/service/route.js', import.meta.url), 'utf8');
  assert.match(route, /from\('service_zones'\)\.select\('id, "siteId", name, code'\)/);
});

/* review 29/09: ป้าย "รายการ n · FG" ของสองจอต้องเท่ากันสำหรับรอบขายชุดเดียวกัน (ตัวช่วยเดียว `termLineLabels`) */
test('🔴 C8: termLabels ของแท็บงานบริการ = termLabels ของแถวคิว TS (SO-26090247-0: รายการ 1/2 บนโซน Office)', async () => {
  const { planRowFacts } = await import('../service/intakePlanFacts.js');
  const out = soSummary();
  const intake = planRowFacts(
    { stamped: true, zones: [...officeZones.values()], terms: soTerms, roundsSold: 1, site: asanSites.get('ST1'), orderNumber: soStamped.orderNumber, salesOrderId: soStamped.id },
    { order: soStamped, linesById: new Map(soLines.map((l) => [l.id, { ...l, salesOrderId: soStamped.id }])), todayIso: '2026-09-29' },
  );
  assert.deepEqual(intake.termLabels, out.allocation.sites[0].termLabels);
  assert.deepEqual(out.allocation.sites[0].termLabels['SZT-1'], { zone: 'Office', detail: 'รายการ 1 · FG-364-02-001-1061' });
  assert.deepEqual(intake.termDetails.map((t) => t.id), out.allocation.sites[0].terms.map((t) => t.id), 'ลำดับเดียวกัน');
});

/* ── ใบแยกรายรายการ (mig 0400): เดือนของรอบขาย = ช่วงของรายการที่รอบขายนั้นมาจาก ─────────────────────────────── */
test('0400: ใบแยกรายรายการ — periodMonths ของแต่ละรอบขายคิดจากช่วงของรายการเอง (ไม่ใช่ช่วงรวมของใบ) · ตรงกับ termDetails ของคิว TS', async () => {
  const { planRowFacts } = await import('../service/intakePlanFacts.js');
  const { withLinePeriods } = await import('../service/terms.js');
  /* ช่วงรวมของใบ 22/10/2026–21/10/2027 (12 เดือน) · รายการ a = 12 เดือน · รายการ b = 6 เดือน */
  const order = { ...soStamped, servicePeriodMode: 'line' };
  const lines = [
    { ...soLines[0], servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21' },
    { ...soLines[1], servicePeriodFrom: '2026-11-01', servicePeriodTo: '2027-04-30' },
  ];
  const out = soSummary({ order, lines });
  const months = Object.fromEntries(out.allocation.sites[0].terms.map((t) => [t.id, t.periodMonths]));
  assert.deepEqual(months, { 'SZT-1': 12, 'SZT-2': 6 });

  const linesById = new Map(lines.map((l) => [l.id, l]));
  const attached = withLinePeriods(soTerms, new Map([[order.id, order]]), linesById);
  const intake = planRowFacts(
    { stamped: true, zones: [...officeZones.values()], terms: attached, roundsSold: 1, site: asanSites.get('ST1'), orderNumber: order.orderNumber, salesOrderId: order.id },
    { order, linesById, todayIso: '2026-09-29' },
  ).termDetails;
  const byId = (a, b) => a.id.localeCompare(b.id);
  assert.deepEqual([...out.allocation.sites[0].terms].sort(byId), [...intake].sort(byId), 'สองจอเสนอมาตรฐาน มล. จากเดือนเดียวกัน');

  /* รายการที่ยังไม่มีช่วง (ไม่ควรเกิดบนใบประทับ — ด่านของ 0400) = null ไม่ใช่เดือนของช่วงรวม */
  const gap = soSummary({ order, lines: [lines[0], { ...lines[1], servicePeriodFrom: null, servicePeriodTo: null }] });
  assert.deepEqual(Object.fromEntries(gap.allocation.sites[0].terms.map((t) => [t.id, t.periodMonths])), { 'SZT-1': 12, 'SZT-2': null });
  /* ใบโหมดทั้งใบ: เดือนของช่วงของใบทุกรายการเหมือนเดิม แม้บรรทัดพกคอลัมน์ช่วง (ว่าง/ค้าง) · ใบ line ที่ยังไม่ประทับ = null */
  assert.deepEqual(soSummary({ order: { ...soStamped, servicePeriodMode: 'whole' }, lines }).allocation.sites[0].terms.map((t) => t.periodMonths), [12, 12]);
  assert.deepEqual(soSummary({ lines }).allocation.sites[0].terms, soSummary().allocation.sites[0].terms);
  assert.deepEqual(soSummary({ order: { ...order, serviceTermsOpenedAt: null }, lines }).allocation.sites[0].terms.map((t) => t.periodMonths), [null, null]);
});

test('0400: route สรุปงานบริการเลือกช่วงของรายการมาด้วย ("servicePeriodFrom"/"servicePeriodTo") — ไม่มี = เดือนของรอบขายเป็น null เงียบ ๆ', () => {
  const route = readFileSync(new URL('../../app/api/sales-planning/sales-orders/[id]/service/route.js', import.meta.url), 'utf8');
  const select = route.match(/from\('sales_order_lines'\)\s*\.select\('([^']*)'\)/)?.[1] || '';
  for (const col of ['"servicePeriodFrom"', '"servicePeriodTo"']) assert.ok(select.includes(col), col);
  assert.doesNotMatch(select, /unitPrice|lineTotal|discount/);
  assert.match(route, /loadScoped\(supabase, 'sales_orders', id, user, 'view'\)/, 'โหมดของใบมากับแถวใบ (อ่าน *) — ไม่เพิ่มคำสั่งอ่านใบ');
});
