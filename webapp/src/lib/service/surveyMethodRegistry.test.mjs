// ── วิธีประเมินรายพื้นที่ × ทะเบียนพื้นที่ของลูกค้า · ตัวเลือกพื้นที่เดิม · GET ใบประเมิน (งวด S2a กลุ่ม C) ──
//
// ⭐ สามชั้นที่ไฟล์นี้ล็อก:
//   1. **ทะเบียน** — ผลจากแบบที่ถูกผลลงหน้างานของใบรุ่นหลังแทนไปแล้ว ไม่กลับมาเป็น "ผลล่าสุด" อีก
//      (ต่อให้ใบจากแบบถูกดึงกลับ บันทึกใหม่ ส่งใหม่) · ป้าย "ประเมินจากแบบ" / "รอยืนยันหน้างาน" · ยอดรอยืนยัน
//   2. **ตัวเลือกพื้นที่เดิมบนฟอร์มเปิดใบ** — ป้ายอยู่ครบทุกชนิดไทล์ · เหตุผลสามแบบ · ใบค้างที่เป็นงานจากแบบไม่มี "นัด"
//      · รอบจากแบบไม่ถูกนับเป็น "วัดมาแล้ว" · สรุปสถานที่แยก วัดหน้างาน / จากแบบ
//   3. **GET ใบประเมิน** — สามคีย์ใหม่ (`drawingMethodEnabled` · `threadFiles` · `siteVisitReached`) ตามคนดูและสวิตช์
//      · ช่าง / ผู้จัดคิว ไม่ทำให้เกิดการอ่านเพิ่มสักคำขอ · ใบจากแบบทั้งใบ เรื่องส่งกลับไม่ค้าง
// 🔴 กติกาที่ทุกเคส **ลงหน้างานล้วน** ต้องยืนยัน: คีย์เดิมทุกตัวได้ค่าเดิม — แถวไม่มีคีย์ `method` · `'onsite'` · null
//    ให้ผลเท่ากันทุกคีย์ และคีย์ใหม่มีแต่ค่าว่าง (`'onsite'`/null · `'none'` · null · 0)
// ⚠️ เส้น GET เรียก handler **ตัวจริง** ผ่าน supabase ปลอมที่จำแถว (`crew/routeTestKit.mjs`) — ไม่มีอะไรถึงฐานจริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fakeDb, callRoute, tech, planner } from './crew/routeTestKit.mjs';
import { customerZoneRegistry, latestSurveyRow, zoneRegistryRow } from './zoneRegistry.js';
import { sitePickSummary, zonePickList, zonePickState } from './zonePickState.js';
import { SURVEY_ZONE_TAG } from './surveyMethodSwitch.js';

const { GET } = await import('../../app/api/service/surveys/[id]/route.js');

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ข้อความที่ผู้ใช้เห็น — เขียนตรงตัวที่นี่โดยตั้งใจ (สเปก S2a กลุ่ม C ข้อ 6) · โค้ดแก้คำเมื่อไร เทสต์ต้องแดง */
const TAG_AWAITING = 'ประเมินจากแบบ · รอยืนยันหน้างาน';
const TAG_DRAWING = 'ประเมินจากแบบ';
const HOT_TODAY = 'วัดแล้วยังไม่ขาย — เสนอราคาได้เลย ไม่ต้องไปวัดใหม่';
const HOT_AWAITING = 'ประเมินจากแบบ · รอยืนยันหน้างาน — เสนอราคาได้ ตัวเลขอาจเปลี่ยนเมื่อวัดจริง';
const HOT_DRAWING = 'ประเมินจากแบบ — เสนอราคาได้เลย';
const AWAITING_TAIL = ' · ตัวเลขจากแบบ รอยืนยันหน้างาน';
const ENDED_TODAY = 'เคยขาย รอบจบแล้ว — วัดซ้ำเพื่อต่ออายุได้';

/* ══ 1. ทะเบียน ═══════════════════════════════════════════════════════════════════════════ */

const zone = { id: 'ZN1', code: 'ZN-AAAA-01-00001', name: 'Studio 01', floor: '01', siteId: 'ST1' };
const PARTS_DRAWING = [{ widthM: 10, lengthM: 10, heightM: 3 }]; // 100 ตร.ม. · 300 ลบ.ม.
const PARTS_ONSITE = [{ widthM: 8, lengthM: 12, heightM: 3 }];   //  96 ตร.ม. · 288 ลบ.ม.

/* ใบจากแบบ (ต้นทาง) เปิด 07/10 · ใบลงหน้างานเปิด 20/10 — เวลาสองรูป (`+00:00` ของ PostgREST · `Z` ของ toISOString)
   ตั้งใจ: ลำดับของใบต้องเทียบเป็นจุดเวลา ไม่ใช่สตริง */
const drawingRequest = (o = {}) => ({
  id: 'REQ-D', docNo: 'RQ-AS-26100007', status: 'closed', surveyConfirm: 'needed',
  createdAt: '2026-10-07T03:00:00+00:00', answeredAt: '2026-10-08T04:00:00+00:00', ...o,
});
const onsiteRequest = (o = {}) => ({
  id: 'REQ-O', docNo: 'RQ-AS-26100020', status: 'closed', surveyConfirm: null,
  createdAt: '2026-10-20T03:00:00.000Z', answeredAt: '2026-10-22T04:00:00.000Z', ...o,
});
const drawingRow = (o = {}) => ({
  id: 'D', zoneId: 'ZN1', requestId: 'REQ-D', status: 'ok', method: 'drawing',
  createdAt: '2026-10-07T03:00:01+00:00', surveyedAt: '2026-10-08T03:30:00+00:00',
  parts: PARTS_DRAWING, packageQty: 2, packageSize: 'ST', ...o,
});
const onsiteRow = (o = {}) => ({
  id: 'O', zoneId: 'ZN1', requestId: 'REQ-O', status: 'ok', method: 'onsite',
  createdAt: '2026-10-20T03:00:01.000Z', surveyedAt: '2026-10-21T06:00:00.000Z',
  parts: PARTS_ONSITE, packageQty: 3, packageSize: 'SM', ...o,
});
const byId = (...requests) => new Map(requests.map((r) => [r.id, r]));

test('🔑 ผลจากแบบ + ผลลงหน้างานของใบรุ่นหลัง: ผลล่าสุด = ลงหน้างาน — ต่อให้ใบจากแบบถูกดึงกลับ บันทึกใหม่ ส่งใหม่', () => {
  /* ผูกกันหรือไม่ผูก (คอลัมน์ผูกใบยืนยันหน้างานเป็นของงวด S5) ผลต้องเท่ากัน — ทะเบียนตัดสินจากวันเปิดใบอย่างเดียว */
  for (const link of [{}, { surveyConfirmOfId: 'REQ-D' }]) {
    const label = Object.keys(link).length ? 'ผูกใบ' : 'ไม่ผูกใบ';
    const requestsById = byId(drawingRequest(), onsiteRequest(link));
    const first = zoneRegistryRow(zone, { surveys: [drawingRow(), onsiteRow()], requestsById });
    assert.equal(first.surveyRequestId, 'REQ-O', label);
    assert.equal(first.assessMethod, 'onsite', label);
    assert.equal(first.confirm, 'none', label);
    assert.equal(first.confirmTag, null, label);

    /* ใบจากแบบถูกดึงกลับ บันทึกทับ แล้วส่งใหม่ — แถวได้ `surveyedAt` ใหม่กว่าของลงหน้างาน · ใบได้ `answeredAt` ใหม่ */
    const resent = byId(drawingRequest({ answeredAt: '2026-11-02T04:00:00+00:00' }), onsiteRequest(link));
    const surveys = [drawingRow({ surveyedAt: '2026-11-01T03:30:00+00:00' }), onsiteRow()];
    const row = zoneRegistryRow(zone, { surveys, requestsById: resent });
    assert.equal(row.surveyRequestId, 'REQ-O', `${label}: ส่งใหม่แล้วก็ยังเป็นผลลงหน้างาน`);
    assert.equal(row.assessMethod, 'onsite', label);
    assert.equal(row.confirm, 'none', label);
    assert.equal(row.confirmTag, null, label);
    // ตัวเลขทั้งแถวเป็นของผลลงหน้างาน ไม่ใช่แค่ป้ายที่เปลี่ยน
    assert.equal(row.areaSqm, 96, label);
    assert.equal(row.volumeCbm, 288, label);
    assert.equal(row.assessedPackages, 3, label);
    assert.equal(row.assessedPackageSize, 'SM', label);
    assert.equal(row.surveyedAt, '2026-10-21T06:00:00.000Z', label);

    /* ตัวจัดอันดับเดิม (ไม่รู้วันเปิดใบ) จะหยิบแถวจากแบบเพราะบันทึกทีหลัง — ตัวกรองคือสิ่งที่กันไว้ ไม่ใช่ความบังเอิญของ fixture */
    const isSent = (r) => !!resent.get(r.requestId)?.answeredAt;
    assert.equal(latestSurveyRow(surveys, { isSent }).id, 'D');
    assert.equal(latestSurveyRow(surveys, { isSent, createdAtOf: (r) => resent.get(r.requestId)?.createdAt }).id, 'O');
  }
});

test('ใบลงหน้างานรุ่นหลังยังไม่ส่งผล: ผลล่าสุดยังเป็นของจากแบบ ป้ายยังอยู่ · และบอกว่ามีใบค้าง', () => {
  const requestsById = byId(drawingRequest(), onsiteRequest({ status: 'acknowledged', answeredAt: null }));
  const row = zoneRegistryRow(zone, { surveys: [drawingRow(), onsiteRow()], requestsById });
  assert.equal(row.surveyRequestId, 'REQ-D');
  assert.equal(row.assessMethod, 'drawing');
  assert.equal(row.confirm, 'awaiting');
  assert.equal(row.confirmTag, TAG_AWAITING);
  assert.equal(row.areaSqm, 100);
  assert.equal(row.assessedPackages, 2);
  assert.deepEqual(row.pendingRequest, {
    id: 'REQ-O', docNo: 'RQ-AS-26100020', status: 'acknowledged', dueDate: null, assessMethod: 'onsite',
  });
});

test('ผลลงหน้างานเก่า + ใบจากแบบรุ่นหลัง (ปรับปรุงพื้นที่แล้วประเมินจากแบบใหม่): ผลล่าสุด = จากแบบ', () => {
  const requestsById = byId(
    onsiteRequest({ createdAt: '2026-08-01T03:00:00.000Z', answeredAt: '2026-08-03T04:00:00.000Z' }),
    drawingRequest({ surveyConfirm: 'not_needed' }),
  );
  const surveys = [onsiteRow({ createdAt: '2026-08-01T03:00:01.000Z', surveyedAt: '2026-08-02T06:00:00.000Z' }), drawingRow()];
  const row = zoneRegistryRow(zone, { surveys, requestsById });
  assert.equal(row.surveyRequestId, 'REQ-D');
  assert.equal(row.assessMethod, 'drawing');
  assert.equal(row.confirm, 'drawing');
  assert.equal(row.confirmTag, TAG_DRAWING);
  assert.equal(row.areaSqm, 100);
});

test('ป้ายยืนยันหน้างาน: needed = รอยืนยัน · not_needed / ยังไม่เลือก = ประเมินจากแบบ · คำเดียวกับ SURVEY_ZONE_TAG', () => {
  assert.deepEqual(SURVEY_ZONE_TAG, { awaiting: TAG_AWAITING, drawing: TAG_DRAWING });
  const cases = [
    ['needed', 'awaiting', TAG_AWAITING],
    ['not_needed', 'drawing', TAG_DRAWING],
    [null, 'drawing', TAG_DRAWING],
    [undefined, 'drawing', TAG_DRAWING],
  ];
  for (const [surveyConfirm, confirm, tag] of cases) {
    const row = zoneRegistryRow(zone, { surveys: [drawingRow()], requestsById: byId(drawingRequest({ surveyConfirm })) });
    assert.equal(row.assessMethod, 'drawing', String(surveyConfirm));
    assert.equal(row.confirm, confirm, String(surveyConfirm));
    assert.equal(row.confirmTag, tag, String(surveyConfirm));
  }
  // ค่าบนใบไม่ทำให้แถวลงหน้างานติดป้าย
  const onsite = zoneRegistryRow(zone, { surveys: [onsiteRow()], requestsById: byId(onsiteRequest({ surveyConfirm: 'needed' })) });
  assert.deepEqual([onsite.assessMethod, onsite.confirm, onsite.confirmTag], ['onsite', 'none', null]);
  // ยังไม่เคยประเมิน = ไม่มีวิธี (ไม่ใช่ 'onsite')
  const never = zoneRegistryRow(zone, {});
  assert.deepEqual([never.assessMethod, never.confirm, never.confirmTag], [null, 'none', null]);
});

test('ยอดของทะเบียน: awaitingConfirm นับเฉพาะพื้นที่ที่รอยืนยันหน้างาน — ระดับสถานที่และระดับลูกค้า', () => {
  const reg = customerZoneRegistry({
    sites: [{ id: 'ST1', name: 'สำนักงานใหญ่' }, { id: 'ST2', name: 'สาขาสอง' }],
    zones: [
      { id: 'ZN1', siteId: 'ST1', name: 'Studio 01' },
      { id: 'ZN2', siteId: 'ST1', name: 'Studio 02' },
      { id: 'ZN3', siteId: 'ST2', name: 'ล็อบบี้' },
      { id: 'ZN4', siteId: 'ST2', name: 'ห้องประชุม' },
    ],
    surveys: [
      drawingRow({ id: 'D1', zoneId: 'ZN1' }),
      drawingRow({ id: 'D2', zoneId: 'ZN2', requestId: 'REQ-N' }),
      drawingRow({ id: 'D3', zoneId: 'ZN3' }),
      onsiteRow({ id: 'O4', zoneId: 'ZN4' }),
    ],
    requests: [drawingRequest(), drawingRequest({ id: 'REQ-N', surveyConfirm: 'not_needed' }), onsiteRequest()],
  });
  assert.equal(reg.awaitingConfirm, 2);
  assert.deepEqual(reg.sites.map((s) => s.awaitingConfirm), [1, 1]);
  assert.deepEqual(reg.sites[0].zones.map((z) => z.confirm), ['awaiting', 'drawing']);
  assert.equal(reg.measuredCount, 4, 'ยอด "ประเมินแล้ว" เดิมไม่ขยับ — พื้นที่จากแบบมีตัวเลขครบ');
  assert.equal(customerZoneRegistry({}).awaitingConfirm, 0);
});

test('รอบที่ประเมิน: surveyCount เท่าเดิม · onsiteSurveyCount ไม่นับรอบจากแบบ · ใบค้างบอกวิธีของแถวที่ค้าง', () => {
  const requestsById = byId(drawingRequest(), onsiteRequest());
  const two = zoneRegistryRow(zone, { surveys: [onsiteRow({ id: 'O1' }), onsiteRow({ id: 'O2' })], requestsById });
  assert.deepEqual([two.surveyCount, two.onsiteSurveyCount], [2, 2]);
  const mixed = zoneRegistryRow(zone, { surveys: [onsiteRow(), drawingRow()], requestsById });
  assert.deepEqual([mixed.surveyCount, mixed.onsiteSurveyCount], [2, 1]);
  const cut = zoneRegistryRow(zone, { surveys: [onsiteRow({ status: 'cut' }), drawingRow({ status: 'cut' }), drawingRow({ id: 'D2' })], requestsById });
  assert.deepEqual([cut.surveyCount, cut.onsiteSurveyCount], [1, 0]);
  assert.deepEqual([zoneRegistryRow(zone, {}).surveyCount, zoneRegistryRow(zone, {}).onsiteSurveyCount], [0, 0]);

  /* ใบค้างที่แถวของพื้นที่นี้เป็นจากแบบ — `dueDate` ยังส่งค่าเดิม (ผู้อ่านอื่นใช้) · จอเลือกเองว่าจะเรียกมันว่านัดไหม */
  const open = drawingRequest({ id: 'REQ-P', docNo: 'RQ-AS-26100031', status: 'acknowledged', answeredAt: null, committedDueDate: '2026-10-30' });
  const pending = zoneRegistryRow(zone, { surveys: [drawingRow({ requestId: 'REQ-P' })], requestsById: byId(open) });
  assert.deepEqual(pending.pendingRequest, {
    id: 'REQ-P', docNo: 'RQ-AS-26100031', status: 'acknowledged', dueDate: '2026-10-30', assessMethod: 'drawing',
  });
  assert.equal(pending.assessMethod, null, 'ใบที่ยังไม่ส่งผลไม่ใช่ผลล่าสุดของพื้นที่');
});

/* ชุดจัดอันดับของ `zoneRegistry.test.mjs` (แถวไม่มีคีย์ method) — ตัวกรองต้องไม่แตะอันดับของวันนี้เลย */
test('🔴 แถวลงหน้างานล้วน (ไม่มีคีย์ method · onsite · null): อันดับเท่าเดิมทุกชุด ทั้งมีและไม่มีวันเปิดใบ', () => {
  const PARTS = [{ widthM: 12, lengthM: 20, heightM: 4 }];
  const sets = [
    [
      { id: 'A', requestId: 'R1', createdAt: '2026-08-01', surveyedAt: '2026-08-20', parts: PARTS, packageQty: 3 },
      { id: 'B', requestId: 'R1', createdAt: '2026-09-01', surveyedAt: null, parts: [], packageQty: null },
    ],
    [
      { id: 'A', requestId: 'R1', createdAt: '2026-08-01', surveyedAt: '2026-08-20', parts: PARTS, packageQty: 3 },
      { id: 'B', requestId: 'R1', createdAt: '2026-09-01', surveyedAt: null, parts: [], packageQty: null },
      { id: 'C', requestId: 'R2', createdAt: '2026-09-02', surveyedAt: '2026-09-05', parts: PARTS, packageQty: 1 },
    ],
    [
      { id: 'A', requestId: 'R1', createdAt: '2026-08-01', surveyedAt: '2026-08-20', parts: PARTS, packageQty: 3 },
      { id: 'B', requestId: 'R2', createdAt: '2026-09-01', surveyedAt: '2026-09-05', status: 'cut', parts: [] },
    ],
    [
      { id: 'A', requestId: 'R1', createdAt: '2026-08-01', surveyedAt: '2026-08-20', parts: PARTS },
      { id: 'B', requestId: 'R3', createdAt: '2026-09-01', surveyedAt: '2026-09-06', parts: [] },
    ],
    [
      { id: 'A', requestId: 'R1', createdAt: '2026-08-01', surveyedAt: '2026-08-20' },
      { id: 'B', requestId: 'R2', createdAt: '2026-08-02', surveyedAt: '2026-08-20' },
    ],
    [],
  ];
  const requests = new Map([
    ['R1', { id: 'R1', answeredAt: '2026-08-21T00:00:00Z', createdAt: '2026-09-30T00:00:00Z' }],
    ['R2', { id: 'R2', answeredAt: '2026-09-06T00:00:00Z', createdAt: '2026-07-01T00:00:00Z' }],
    ['R3', { id: 'R3', answeredAt: null, createdAt: '2026-09-01T00:00:00Z' }],
  ]);
  const isSent = (row) => !!requests.get(row.requestId)?.answeredAt;
  const orders = [
    (row) => requests.get(row.requestId)?.createdAt,
    () => undefined,
    () => 'ไม่ใช่วันที่',
  ];
  const shapes = [{}, { method: 'onsite' }, { method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null }];
  for (const [i, set] of sets.entries()) {
    for (const shape of shapes) {
      const rows = set.map((row) => ({ ...row, ...shape }));
      for (const options of [{}, { isSent }]) {
        const today = latestSurveyRow(rows, options);
        for (const createdAtOf of orders) {
          assert.equal(latestSurveyRow(rows, { ...options, createdAtOf }), today, `ชุด ${i}`);
        }
        assert.equal(latestSurveyRow(rows, { ...options, createdAtOf: null }), today, `ชุด ${i}`);
      }
    }
  }
  assert.equal(latestSurveyRow(sets[1]).id, 'C');
  assert.equal(latestSurveyRow(sets[3], { isSent }).id, 'A');
  assert.equal(latestSurveyRow([], { createdAtOf: () => '2026-10-01' }), null);
});

/* คีย์ของแถวทะเบียน เรียงตามที่ประกอบ — สี่คีย์ใหม่แทรกสองจุด คีย์เดิมอยู่ครบและลำดับเดิม */
const ROW_KEYS = [
  'id', 'code', 'name', 'floor', 'siteId', 'isActive',
  'surveyedAt', 'surveyRequestId', 'assessMethod', 'confirm', 'confirmTag',
  'parts', 'areaSqm', 'volumeCbm', 'spotsTotal', 'spotsSelected', 'registeredSpots',
  'assessedPackages', 'assessedPackageSize', 'surveyCount', 'onsiteSurveyCount', 'pendingRequest',
  'termState', 'sold', 'soldPackages', 'salesOrders', 'termEndDate',
  'soldPerRound', 'soldPerRoundPackages', 'soldLabel', 'pendingOrders', 'pendingLabel',
];
const NEW_ROW_KEYS = ['assessMethod', 'confirm', 'confirmTag', 'onsiteSurveyCount'];
const without = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));

test('🔴 พื้นที่ลงหน้างาน: คีย์เดิมของแถวทะเบียนเท่ากันทุกรูปของแถว/ใบ · คีย์ใหม่มีแต่ค่าว่าง', () => {
  const rowShapes = [{ method: undefined }, { method: 'onsite' }, { method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null }];
  const requestShapes = [{ surveyConfirm: undefined }, { surveyConfirm: null }, { surveyConfirm: 'needed' }];
  const build = (rowShape, requestShape) => zoneRegistryRow(zone, {
    surveys: [onsiteRow({ id: 'O1', ...rowShape }), onsiteRow({ id: 'O2', requestId: 'REQ-O2', surveyedAt: '2026-10-25T06:00:00.000Z', ...rowShape })],
    requestsById: byId(onsiteRequest(requestShape), onsiteRequest({ id: 'REQ-O2', status: 'acknowledged', answeredAt: null, committedDueDate: '2026-10-28', ...requestShape })),
    terms: [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2 }],
    ordersById: new Map([['SO1', { id: 'SO1', orderNumber: 'SO-1', status: 'approved', supersededById: null }]]),
    todayIso: '2026-10-09',
  });
  const base = build(rowShapes[0], requestShapes[0]);
  assert.deepEqual(Object.keys(base), ROW_KEYS);
  assert.deepEqual(
    Object.fromEntries(NEW_ROW_KEYS.map((key) => [key, base[key]])),
    { assessMethod: 'onsite', confirm: 'none', confirmTag: null, onsiteSurveyCount: 2 },
  );
  assert.equal(base.onsiteSurveyCount, base.surveyCount);
  assert.deepEqual(base.pendingRequest, {
    id: 'REQ-O2', docNo: 'RQ-AS-26100020', status: 'acknowledged', dueDate: '2026-10-28', assessMethod: 'onsite',
  });
  for (const rowShape of rowShapes) {
    for (const requestShape of requestShapes) {
      assert.deepEqual(build(rowShape, requestShape), base);
    }
  }
  /* ค่าของคีย์เดิม — ตัวเลขชุดที่ทะเบียนตอบก่อนมีคีย์ใหม่ */
  assert.deepEqual(without(base, [...NEW_ROW_KEYS, 'parts', 'pendingRequest']), {
    id: 'ZN1', code: 'ZN-AAAA-01-00001', name: 'Studio 01', floor: '01', siteId: 'ST1', isActive: true,
    surveyedAt: '2026-10-21T06:00:00.000Z', surveyRequestId: 'REQ-O',
    areaSqm: 96, volumeCbm: 288, spotsTotal: 0, spotsSelected: 0, registeredSpots: 0,
    assessedPackages: 3, assessedPackageSize: 'SM', surveyCount: 2,
    termState: 'active', sold: true, soldPackages: 2, salesOrders: [{ id: 'SO1', orderNumber: 'SO-1' }], termEndDate: null,
    soldPerRound: false, soldPerRoundPackages: null, soldLabel: 'ขายแล้ว (SO-1)', pendingOrders: [], pendingLabel: null,
  });
});

/* ══ 2. ตัวเลือกพื้นที่เดิมบนฟอร์มเปิดใบ ═══════════════════════════════════════════════════════ */

const pick = (over = {}) => ({
  id: 'ZN1', name: 'Studio 01', code: 'ZN-A-01', floor: '01',
  surveyedAt: null, termState: 'none', pendingRequest: null, surveyCount: 0,
  areaSqm: null, assessedPackages: null, ...over,
});
const fromDrawing = (confirm, over = {}) => pick({
  surveyedAt: '2026-10-08T03:30:00+00:00', surveyCount: 1, onsiteSurveyCount: 0, areaSqm: 100, assessedPackages: 2,
  assessMethod: 'drawing', confirm, confirmTag: confirm === 'awaiting' ? TAG_AWAITING : TAG_DRAWING, ...over,
});

test('ป้ายจากแบบอยู่บนไทล์ทุกชนิด — ล็อก · เด่น · ขายอยู่ · รอบจบ (หนี้ข้อมูลไม่มีผลประเมินให้ติดป้าย)', () => {
  const tiles = {
    locked: zonePickState(fromDrawing('awaiting', { pendingRequest: { id: 'R2', docNo: 'RQ-AS-26100031', dueDate: null, assessMethod: 'onsite' } })),
    hot: zonePickState(fromDrawing('awaiting')),
    plainActive: zonePickState(fromDrawing('awaiting', { termState: 'active' })),
    plainEnded: zonePickState(fromDrawing('awaiting', { termState: 'ended' })),
  };
  assert.deepEqual(Object.values(tiles).map((t) => t.kind), ['locked', 'hot', 'plain', 'plain']);
  for (const [name, tile] of Object.entries(tiles)) {
    assert.equal(tile.tag, TAG_AWAITING, name);
    assert.equal(tile.confirm, 'awaiting', name);
    assert.equal(tile.assessMethod, 'drawing', name);
    assert.equal(tile.onsiteSurveyCount, 0, name);
  }
  assert.equal(zonePickState(fromDrawing('drawing')).tag, TAG_DRAWING);
  // ขายแล้วแต่ไม่เคยวัด — ไม่มีแถวผลล่าสุด ⇒ ไม่มีป้าย
  const debt = zonePickState(pick({ termState: 'active', assessMethod: null, confirm: 'none', confirmTag: null }));
  assert.deepEqual([debt.kind, debt.tag, debt.confirm, debt.assessMethod], ['debt', null, 'none', null]);
});

test('เหตุผลของไทล์จากแบบ: เด่นสองแบบ · ขายอยู่/รอบจบ ต่อท้ายเฉพาะตอนรอยืนยัน — พื้นที่ลงหน้างานคำเดิมทุกตัวอักษร', () => {
  assert.equal(zonePickState(fromDrawing('awaiting')).reason, HOT_AWAITING);
  assert.equal(zonePickState(fromDrawing('drawing')).reason, HOT_DRAWING);
  assert.equal(HOT_AWAITING, `${SURVEY_ZONE_TAG.awaiting} — เสนอราคาได้ ตัวเลขอาจเปลี่ยนเมื่อวัดจริง`);
  assert.equal(HOT_DRAWING, `${SURVEY_ZONE_TAG.drawing} — เสนอราคาได้เลย`);

  assert.equal(zonePickState(fromDrawing('awaiting', { termState: 'active' })).reason, `มีเครื่องอยู่${AWAITING_TAIL}`);
  assert.equal(zonePickState(fromDrawing('awaiting', { termState: 'ended' })).reason, `${ENDED_TODAY}${AWAITING_TAIL}`);
  // ไม่ต้องยืนยันหน้างาน = ผลสุดท้าย ⇒ ไม่มีอะไรต่อท้าย
  assert.equal(zonePickState(fromDrawing('drawing', { termState: 'active' })).reason, 'มีเครื่องอยู่');
  assert.equal(zonePickState(fromDrawing('drawing', { termState: 'ended' })).reason, ENDED_TODAY);

  /* ลงหน้างาน — แถวทะเบียนรุ่นเก่า (ไม่มีคีย์ใหม่) กับรุ่นใหม่ (คีย์ใหม่ค่าว่าง) ได้คำเดียวกับวันนี้ */
  for (const extra of [{}, { assessMethod: 'onsite', confirm: 'none', confirmTag: null }]) {
    const measured = { surveyedAt: '2026-08-20', surveyCount: 1, ...(('confirm' in extra) ? { onsiteSurveyCount: 1 } : {}), ...extra };
    assert.equal(zonePickState(pick(measured)).reason, HOT_TODAY);
    assert.equal(zonePickState(pick({ ...measured, termState: 'active' })).reason, 'มีเครื่องอยู่');
    assert.equal(zonePickState(pick({ ...measured, termState: 'ended' })).reason, ENDED_TODAY);
    assert.equal(zonePickState(pick(extra)).reason, 'ยังไม่เคยวัด');
    assert.equal(zonePickState(pick({ termState: 'active', ...extra })).reason, 'ขายแล้วแต่ไม่เคยวัด — วัดเก็บไว้ได้ในรอบนี้');
    const tile = zonePickState(pick(measured));
    assert.deepEqual([tile.tag, tile.confirm, tile.assessMethod], [null, 'none', extra.assessMethod ?? null]);
    assert.equal(tile.onsiteSurveyCount, 1);
  }
});

test('ไทล์ล็อก: ใบค้างลงหน้างานบอกวันนัดเหมือนเดิม · ใบค้างที่เป็นงานจากแบบจบที่เลขใบ (วันบนใบคือวันส่งผล ไม่ใช่นัด)', () => {
  const locked = (pendingRequest) => zonePickState(pick({ pendingRequest })).reason;
  const today = locked({ id: 'R2', docNo: 'RQ-AS-26100031', dueDate: '2026-10-30' });
  assert.equal(today, 'มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100031 · นัด 2026-10-30');
  assert.equal(locked({ id: 'R2', docNo: 'RQ-AS-26100031', dueDate: '2026-10-30', assessMethod: 'onsite' }), today);
  assert.equal(locked({ id: 'R2', docNo: 'RQ-AS-26100031', dueDate: '2026-10-30', assessMethod: 'drawing' }),
    'มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100031');
  assert.equal(locked({ id: 'R2', docNo: 'RQ-AS-26100031', dueDate: null, assessMethod: 'onsite' }),
    'มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100031');
});

test('"วัดมาแล้ว n รอบ" นับเฉพาะรอบลงหน้างาน — รอบจากแบบไม่ใช่การวัด', () => {
  const sold = (over) => zonePickState(pick({ surveyedAt: '2026-08-20', termState: 'active', ...over })).reason;
  assert.equal(sold({ surveyCount: 2, onsiteSurveyCount: 2 }), 'มีเครื่องอยู่ · วัดมาแล้ว 2 รอบ');
  // แถวทะเบียนรุ่นเก่าที่ยังไม่มีคีย์ใหม่ = ใช้ surveyCount เหมือนวันนี้
  assert.equal(sold({ surveyCount: 2 }), 'มีเครื่องอยู่ · วัดมาแล้ว 2 รอบ');
  assert.equal(sold({ surveyCount: 2, onsiteSurveyCount: 1 }), 'มีเครื่องอยู่');
  assert.equal(sold({ surveyCount: 3, onsiteSurveyCount: 0 }), 'มีเครื่องอยู่');
  assert.equal(sold({ surveyCount: 4, onsiteSurveyCount: 3 }), 'มีเครื่องอยู่ · วัดมาแล้ว 3 รอบ');
});

test('สรุประดับสถานที่: วัดหน้างานกับจากแบบแยกกัน — ลงหน้างานล้วนได้ measured เท่าเดิม', () => {
  const mixed = sitePickSummary({
    zones: [
      pick({ id: 'A', surveyedAt: '2026-08-01', assessMethod: 'onsite', termState: 'active' }),
      fromDrawing('awaiting', { id: 'B' }),
      pick({ id: 'C', pendingRequest: { id: 'R', docNo: 'AS-9' } }),
      pick({ id: 'D' }),
    ],
  });
  assert.deepEqual(mixed, { zones: 4, measured: 1, drawing: 1, sold: 1, pending: 1 });
  const onsite = sitePickSummary({
    zones: [pick({ id: 'A', surveyedAt: '2026-08-01' }), pick({ id: 'B', surveyedAt: '2026-08-01', assessMethod: 'onsite' }), pick({ id: 'C' })],
  });
  assert.deepEqual(onsite, { zones: 3, measured: 2, drawing: 0, sold: 0, pending: 0 });
  // วิธีของพื้นที่ที่ยังไม่มีผล (ไม่มี surveyedAt) ไม่ถูกนับทั้งสองช่อง
  assert.deepEqual(sitePickSummary({ zones: [pick({ assessMethod: 'drawing' })] }), { zones: 1, measured: 0, drawing: 0, sold: 0, pending: 0 });
  assert.deepEqual(sitePickSummary({}), { zones: 0, measured: 0, drawing: 0, sold: 0, pending: 0 });
});

test('ทะเบียน → ไทล์ ต่อกันจริง: แถวที่ทะเบียนประกอบ พาป้ายและเหตุผลไปถึงตัวเลือกพื้นที่', () => {
  const reg = customerZoneRegistry({
    sites: [{ id: 'ST1', name: 'สำนักงานใหญ่' }],
    zones: [{ id: 'ZN1', siteId: 'ST1', name: 'Studio 01' }, { id: 'ZN2', siteId: 'ST1', name: 'Studio 02' }],
    surveys: [drawingRow({ id: 'D1', zoneId: 'ZN1' }), onsiteRow({ id: 'O2', zoneId: 'ZN2' })],
    requests: [drawingRequest(), onsiteRequest()],
  });
  const [first, second] = zonePickList(reg.sites[0].zones);
  assert.deepEqual([first.id, first.kind, first.tag, first.reason], ['ZN1', 'hot', TAG_AWAITING, HOT_AWAITING]);
  assert.deepEqual([second.id, second.kind, second.tag, second.reason], ['ZN2', 'hot', null, HOT_TODAY]);
  assert.deepEqual(sitePickSummary(reg.sites[0]), { zones: 2, measured: 1, drawing: 1, sold: 0, pending: 0 });
});

/* ══ 3. GET ใบประเมิน ════════════════════════════════════════════════════════════════════ */

const head = { id: 'U-HEAD', name: 'หัวหน้าฝ่าย', role: 'ts_manager', department: 'TS' };
const T0 = '2026-10-01T00:00:00.000Z';
const sheetRequest = (o = {}) => ({
  id: 'REQ1', kind: 'site_survey', dept: 'TS', docNo: 'RQ-AS-26100001', siteId: null, customerId: null, status: 'acknowledged',
  variant: 'standard', requestedById: 'U-AE', answeredAt: null, cancelledAt: null, closedAt: null, createdAt: T0, ...o,
});
const sheetZone = (id, o = {}) => ({
  id, requestId: 'REQ1', zoneId: `SZN-${id}`, zoneName: `พื้นที่ ${id}`, floor: '1', status: 'ok',
  sortOrder: 1, parts: [], spots: [], updatedAt: T0, ...o,
});
const visit = (status, o = {}) => ({
  id: 'V1', code: 'SV-26100007', kind: 'survey', requestId: 'REQ1', status,
  assigneeId: 'U-TECH', assistantIds: [], createdAt: T0, ...o,
});
const THREAD = [
  {
    id: 'EU-1', entityType: 'dept_request', entityId: 'REQ1', kind: 'comment', body: 'แบบชั้น 1', meta: {},
    authorId: 'U-AE', authorName: 'ฝ่ายขาย', createdAt: '2026-10-02T03:00:00+00:00', deletedAt: null,
    attachments: [{ fileUrl: 'https://drive.google.com/file/d/1', driveFileId: 'drv-1', fileName: 'plan-1.png', mimeType: 'image/png', sizeBytes: 2048 }],
  },
  /* เธรดของใบอื่น — ต้องไม่หลุดเข้ามา */
  {
    id: 'EU-9', entityType: 'dept_request', entityId: 'REQ-OTHER', kind: 'comment', body: 'ของใบอื่น', meta: {},
    authorId: 'U-AE', authorName: 'ฝ่ายขาย', createdAt: '2026-10-02T04:00:00+00:00', deletedAt: null,
    attachments: [{ fileUrl: 'https://drive.google.com/file/d/9', driveFileId: 'drv-9', fileName: 'other.png', mimeType: 'image/png', sizeBytes: 1 }],
  },
];
const SEND_BACK = {
  id: 'EU-SB', entityType: 'dept_request', entityId: 'REQ1', kind: 'send_back', body: 'หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน',
  meta: { note: 'ถ่ายภาพกว้าง', items: ['ถ่ายภาพกว้าง'] }, authorId: 'U-HEAD', authorName: 'หัวหน้าฝ่าย',
  createdAt: '2026-10-03T03:00:00+00:00', deletedAt: null, attachments: [],
};
const sheet = ({ zones = [sheetZone('A')], visits = [], req = {}, updates = THREAD, hook = null } = {}) => fakeDb({
  dept_requests: [sheetRequest(req)],
  service_survey_zones: zones,
  service_visits: visits,
  entity_updates: updates,
}, { hook });
const get = (db, user) => callRoute(GET, { user, db, path: '/api/service/surveys/REQ1', params: { id: 'REQ1' } });

/* คำสั่งอ่านสองตัวของงวดนี้ — แยกจากการอ่านเดิมของเส้นเดียวกันด้วยตัวกรอง:
   เธรดทั้งใบ = `entity_updates` ที่ **ไม่กรอง kind** (ของเดิมสองตัวกรอง recall / send_back)
   นัดที่เข้าพื้นที่แล้ว = `service_visits` ที่กรองสถานะ done · partial (ของเดิมไม่กรอง หรือกรองชุดนัดเปิด) */
const filterOf = (q, column) => q.filters.find(([, col]) => col === column);
const isThreadRead = (q) => q.table === 'entity_updates' && !q.write && !filterOf(q, 'kind');
const isReachedRead = (q) => q.table === 'service_visits' && !q.write
  && JSON.stringify(filterOf(q, 'status')?.[2] || []) === JSON.stringify(['done', 'partial']);
const threadReads = (db) => db.calls.filter(isThreadRead);
const reachedReads = (db) => db.calls.filter(isReachedRead);

async function withFlag(value, run) {
  const before = process.env.SURVEY_DRAWING_METHOD;
  if (value === undefined) delete process.env.SURVEY_DRAWING_METHOD;
  else process.env.SURVEY_DRAWING_METHOD = value;
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.SURVEY_DRAWING_METHOD;
    else process.env.SURVEY_DRAWING_METHOD = before;
  }
}
async function quiet(run) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.map(String).join(' ')); };
  try {
    return { result: await run(), lines };
  } finally {
    console.error = original;
  }
}

test('GET · หัวหน้า + สวิตช์เปิด: ได้สามคีย์ — สวิตช์ · ไฟล์ในเธรดของใบนี้ · มีนัดที่เข้าพื้นที่แล้วไหม', async () => {
  await withFlag('on', async () => {
    const none = sheet();
    const { status, json } = await get(none, head);
    assert.equal(status, 200, json.error);
    assert.equal(json.drawingMethodEnabled, true);
    assert.deepEqual(json.threadFiles, [{
      updateId: 'EU-1', index: 0, fileName: 'plan-1.png', mimeType: 'image/png', sizeBytes: 2048,
      createdAt: '2026-10-02T03:00:00+00:00', authorName: 'ฝ่ายขาย',
    }]);
    assert.equal(json.siteVisitReached, false);
    assert.equal(threadReads(none).length, 1);
    assert.equal(reachedReads(none).length, 1);
    assert.deepEqual(reachedReads(none)[0].filters, [['eq', 'requestId', 'REQ1'], ['in', 'status', ['done', 'partial']]]);
    assert.deepEqual(threadReads(none)[0].filters, [['eq', 'entityType', 'dept_request'], ['eq', 'entityId', 'REQ1']]);
    assert.equal(json.unknown.threadFiles, undefined);

    for (const reached of ['done', 'partial']) {
      const db = sheet({ visits: [visit(reached)] });
      assert.equal((await get(db, head)).json.siteVisitReached, true, reached);
    }
    // นัดที่ยังเปิด · เข้าไม่ได้ · ยกเลิก ไม่ใช่ "เข้าพื้นที่แล้ว"
    for (const other of ['scheduled', 'in_progress', 'unable', 'cancelled']) {
      const db = sheet({ visits: [visit(other)] });
      assert.equal((await get(db, head)).json.siteVisitReached, false, other);
    }
  });
});

test('GET · ช่าง / ผู้จัดคิว: threadFiles ว่าง · siteVisitReached null · ไม่มีการอ่านเพิ่มสักคำขอ (สวิตช์เปิดและมีพื้นที่จากแบบ)', async () => {
  await withFlag('on', async () => {
    for (const user of [tech, planner]) {
      const db = sheet({ zones: [sheetZone('A'), sheetZone('B', { method: 'drawing', sortOrder: 2 })], visits: [visit('done')] });
      const { status, json } = await get(db, user);
      assert.equal(status, 200, json.error);
      assert.equal(json.drawingMethodEnabled, true, user.id);
      assert.deepEqual(json.threadFiles, [], user.id);
      assert.equal(json.siteVisitReached, null, user.id);
      assert.deepEqual(threadReads(db), [], user.id);
      assert.deepEqual(reachedReads(db), [], user.id);
    }
  });
});

test('GET · สวิตช์ปิด: ใบลงหน้างานล้วนไม่อ่านอะไรเพิ่ม · ใบที่มีพื้นที่จากแบบอยู่แล้ว หัวหน้ายังได้ไฟล์ในเธรด', async () => {
  for (const off of [undefined, '', 'true', '1', 'off']) {
    await withFlag(off, async () => {
      for (const shape of [{}, { method: 'onsite' }, { method: null, methodChangedAt: null }]) {
        const db = sheet({ zones: [sheetZone('A', shape)], visits: [visit('done')] });
        const { status, json } = await get(db, head);
        assert.equal(status, 200, json.error);
        assert.equal(json.drawingMethodEnabled, false, String(off));
        assert.deepEqual(json.threadFiles, []);
        assert.equal(json.siteVisitReached, null);
        assert.deepEqual(threadReads(db), []);
        assert.deepEqual(reachedReads(db), []);
      }
    });
  }
  await withFlag(undefined, async () => {
    const db = sheet({ zones: [sheetZone('A'), sheetZone('B', { method: 'drawing', sortOrder: 2 })] });
    const { json } = await get(db, head);
    assert.equal(json.drawingMethodEnabled, false);
    assert.equal(json.threadFiles.length, 1, 'แถวที่เป็นจากแบบไปแล้วต้องเดินต่อได้แม้สวิตช์ถูกปิดทีหลัง');
    assert.equal(json.siteVisitReached, null, 'ด่านแถว 17a อยู่ใต้สวิตช์');
    assert.deepEqual(reachedReads(db), []);
    // พื้นที่จากแบบที่ถูกตัดแล้วไม่นับ — ใบเหลือแต่ลงหน้างาน
    const cut = sheet({ zones: [sheetZone('A'), sheetZone('B', { method: 'drawing', status: 'cut', sortOrder: 2 })] });
    assert.deepEqual((await get(cut, head)).json.threadFiles, []);
    assert.deepEqual(threadReads(cut), []);
  });
});

test('GET · ใบที่ส่งผลแล้ว: ไม่ถามนัดที่เข้าพื้นที่ (ไม่มีอะไรให้ส่งอีก) · ไฟล์ในเธรดยังอ่าน', async () => {
  await withFlag('on', async () => {
    const db = sheet({ req: { status: 'answered', answeredAt: '2026-10-05T03:00:00+00:00' }, visits: [visit('done')] });
    const { status, json } = await get(db, head);
    assert.equal(status, 200, json.error);
    assert.equal(json.siteVisitReached, null);
    assert.deepEqual(reachedReads(db), []);
    assert.equal(json.threadFiles.length, 1);
  });
});

test('GET · อ่านพลาด: เธรด = unknown.threadFiles + ลิสต์ว่าง · นัดที่เข้าพื้นที่ = null — ไม่ใช่ 500 และไม่เดาว่า "ไม่มี"', async () => {
  await withFlag('on', async () => {
    const failing = (match) => (q) => (match(q) ? { data: null, error: { message: 'อ่านไม่สำเร็จ (จำลอง)' } } : undefined);

    const threadDown = sheet({ hook: failing(isThreadRead) });
    const first = await quiet(() => get(threadDown, head));
    assert.equal(first.result.status, 200, first.result.json.error);
    assert.deepEqual(first.result.json.threadFiles, []);
    assert.equal(first.result.json.unknown.threadFiles, true);
    assert.equal(first.result.json.siteVisitReached, false, 'ชิ้นอื่นยังอ่านได้ตามปกติ');
    assert.ok(first.lines.some((line) => line.includes('REQ1')), 'ต้องมี log บอกใบ');

    const visitsDown = sheet({ visits: [visit('done')], hook: failing(isReachedRead) });
    const second = await quiet(() => get(visitsDown, head));
    assert.equal(second.result.status, 200, second.result.json.error);
    assert.equal(second.result.json.siteVisitReached, null, 'อ่านไม่สำเร็จ ≠ ไม่มีนัดที่เข้าพื้นที่ — route ส่งผลเป็นคนตัดสิน');
    assert.equal(second.result.json.threadFiles.length, 1);
    assert.equal(second.result.json.unknown.threadFiles, undefined);
    assert.ok(second.lines.some((line) => line.includes('REQ1')));
  });
});

test('GET · เรื่องส่งกลับ: ใบจากแบบทั้งใบไม่ค้าง (closedByMethod) · ใบที่ยังมีพื้นที่ลงหน้างานค้างตามเดิม — ไม่ขึ้นกับสวิตช์', async () => {
  for (const flag of [undefined, 'on']) {
    await withFlag(flag, async () => {
      const desk = sheet({ zones: [sheetZone('A', { method: 'drawing' }), sheetZone('B', { method: 'drawing', sortOrder: 2 })], updates: [SEND_BACK] });
      const deskJson = (await get(desk, head)).json;
      assert.equal(deskJson.sendBack.pending, false, String(flag));
      assert.equal(deskJson.sendBack.closedByMethod, true, String(flag));
      assert.equal(deskJson.sendBack.sentBack.note, 'ถ่ายภาพกว้าง');

      for (const zones of [[sheetZone('A')], [sheetZone('A'), sheetZone('B', { method: 'drawing', sortOrder: 2 })]]) {
        const json = (await get(sheet({ zones, updates: [SEND_BACK] }), head)).json;
        assert.equal(json.sendBack.pending, true, String(flag));
        assert.equal('closedByMethod' in json.sendBack, false, String(flag));
      }
    });
  }
});

test('GET · คีย์เดิมของคำตอบอยู่ครบและลำดับเดิม — เพิ่มมาสามคีย์เท่านั้น ทุกคนดู ทุกค่าสวิตช์', async () => {
  const keysFor = async (flag, user) => withFlag(flag, async () => Object.keys((await get(sheet(), user)).json));
  const TODAY = [
    'request', 'zones', 'filesByZone', 'visit', 'crew', 'site', 'customer', 'recall', 'sendBack', 'unknown',
    'canWrite', 'canDecide', 'canLinkSpotPhotos', 'requestFiles', 'packageSizes', 'document', 'writeBlockedReason',
    'canOpenRequest', 'onVisit',
  ];
  const NEW = ['drawingMethodEnabled', 'threadFiles', 'siteVisitReached'];
  for (const flag of [undefined, 'on']) {
    for (const user of [head, tech, planner]) {
      const keys = await keysFor(flag, user);
      assert.deepEqual(keys.filter((key) => !NEW.includes(key)), TODAY, `${flag}/${user.id}`);
      assert.deepEqual(keys.filter((key) => NEW.includes(key)), NEW, `${flag}/${user.id}`);
    }
  }
});

/* ── ยามผูกกับซอร์สจริงของ GET ───────────────────────────────────────────────────────── */

test('GET ใบประเมิน: สองคำสั่งอ่านใหม่ยิงขนานในรอบเดียวกับชิ้นอื่น · นัดที่เข้าพื้นที่ถามแถวเดียว · สวิตช์อ่านผ่านตัวอ่านกลาง', () => {
  const route = code('../../app/api/service/surveys/[id]/route.js');
  assert.match(route, /Promise\.all\(\[[\s\S]*?loadSurveySheetContext[\s\S]*?loadSurveyThreadFiles\(supabase, request, user\)[\s\S]*?loadSiteVisitReached\(supabase, id\)[\s\S]*?\]\)/);
  assert.match(route, /\.eq\('requestId', requestId\)\.in\('status', \['done', 'partial'\]\)\.limit\(1\)/);
  assert.match(route, /const drawingMethodEnabled = surveyDrawingMethodEnabled\(\);/);
  assert.doesNotMatch(route, /process\.env/);
  assert.match(route, /const needsVisit = surveyNeedsVisit\(zones\);/);
  assert.match(route, /sendBack: surveySendBackOnSheet\(context\.sendBack, request, \{ needsVisit \}\),/);
  assert.match(route, /if \(threadFiles\.unknown\) context\.unknown\.threadFiles = true;/);
  /* ตัวเดียวกับด่านแถว 17a ของ route ส่งผล — สองที่ถามคนละชุดสถานะเมื่อไร การ์ดบอกอย่าง route ตอบอีกอย่าง */
  const send = code('../../app/api/service/surveys/[id]/send/route.js');
  assert.match(send, /\.eq\('requestId', id\)\.in\('status', \['done', 'partial'\]\)\.limit\(1\)/);
});
