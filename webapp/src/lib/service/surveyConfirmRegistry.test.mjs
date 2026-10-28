// ── ใบยืนยันหน้างาน × ทะเบียนพื้นที่ · ตัวเลือกพื้นที่เดิม · ตัวนับ (ประเมินจากแบบ งวด S5 กลุ่ม C) ──
//
// ⭐ สามชั้นที่ไฟล์นี้ล็อก:
//   1. **ทะเบียน** — สภาพที่สี่ `'confirming'` (มีใบยืนยันหน้างานที่ผูกกับใบต้นทางของผลล่าสุดและยังเปิดอยู่) · ป้าย
//      "ประเมินจากแบบ · กำลังยืนยันหน้างาน" · คีย์ `confirmRequest` · ลิงก์ใช้ตัดสินสภาพเท่านั้น ไม่เคยใช้จัดอันดับผล
//   2. **ตัวเลือกพื้นที่เดิมบนฟอร์มเปิดใบ** — พื้นที่ที่กำลังยืนยันล็อกด้วยประโยคเดิม (เลขใบยืนยัน + นัด) ป้ายใหม่อยู่บนไทล์
//   3. **ตัวนับ** — พื้นที่ที่กำลังยืนยันยังเป็นตัวเลขที่ยังไม่ยืนยัน: นับในคำเตือนของหน้าต่างเพิ่มหลายโซนและยอดของทะเบียน
// 🔴 กฎ R-KEYS: คีย์ใหม่ไม่มีอยู่เลยเมื่อไม่มีอะไรจะบอก (ไม่ใช่ null / []) — เทสต์โกลเดนแฮชทั้งก้อน
// ⚠️ ฟังก์ชันล้วนทั้งไฟล์ — ไม่มี supabase ไม่มี route
import test from 'node:test';
import assert from 'node:assert/strict';
import { customerZoneRegistry, zoneRegistryRow } from './zoneRegistry.js';
import { zonePickState } from './zonePickState.js';
import { SURVEY_ZONE_TAG } from './surveyMethodSwitch.js';
import { zonesBulkAwaitingText, zonesBulkPlan } from '../../components/service/zonesBulkPlan.js';

/* ข้อความที่ผู้ใช้เห็น — เขียนตรงตัวที่นี่โดยตั้งใจ (สเปก S5 C-1) · โค้ดแก้คำเมื่อไร เทสต์ต้องแดง */
const TAG_CONFIRMING = 'ประเมินจากแบบ · กำลังยืนยันหน้างาน';
const TAG_AWAITING = 'ประเมินจากแบบ · รอยืนยันหน้างาน';
const TAG_DRAWING = 'ประเมินจากแบบ';

const zone = { id: 'ZN1', code: 'ZN-AAAA-01-00001', name: 'Studio 01', floor: '01', siteId: 'ST1' };
const PARTS_DRAWING = [{ widthM: 10, lengthM: 10, heightM: 3 }]; // 100 ตร.ม. · 300 ลบ.ม.
const PARTS_ONSITE = [{ widthM: 8, lengthM: 12, heightM: 3 }];   //  96 ตร.ม. · 288 ลบ.ม.

/* ใบต้นทาง (จากแบบ ส่งผลแล้ว ตอบว่าต้องยืนยันหน้างาน) เปิด 07/10 · ใบยืนยันหน้างานเปิด 20/10 ผูกกับใบต้นทาง */
const original = (o = {}) => ({
  id: 'DR-O', docNo: 'RQ-AS-26100007', status: 'answered', surveyConfirm: 'needed', surveyConfirmOfId: null,
  createdAt: '2026-10-07T03:00:00+00:00', answeredAt: '2026-10-08T04:00:00+00:00', committedDueDate: '2026-10-08', ...o,
});
const confirmation = (o = {}) => ({
  id: 'DR-C', docNo: 'RQ-AS-26100031', status: 'acknowledged', surveyConfirm: null, surveyConfirmOfId: 'DR-O',
  createdAt: '2026-10-20T03:00:00.000Z', answeredAt: null, committedDueDate: '2026-10-24', ...o,
});
const drawingRow = (o = {}) => ({
  id: 'S-O', zoneId: 'ZN1', requestId: 'DR-O', status: 'ok', method: 'drawing',
  createdAt: '2026-10-07T03:00:01+00:00', surveyedAt: '2026-10-08T03:30:00+00:00',
  parts: PARTS_DRAWING, packageQty: 2, packageSize: 'ST', ...o,
});
/* แถวของใบยืนยัน — เกิดเป็นลงหน้างาน (ใบยืนยันบังคับ variant 'standard') · ยังไม่วัด */
const confirmRow = (o = {}) => ({
  id: 'S-C', zoneId: 'ZN1', requestId: 'DR-C', status: 'ok', method: 'onsite',
  createdAt: '2026-10-20T03:00:01.000Z', surveyedAt: null, parts: [], packageQty: null, packageSize: null, ...o,
});
/* แถวของใบยืนยันที่ส่งผลลงหน้างานแล้ว */
const measured = (o = {}) => confirmRow({ surveyedAt: '2026-10-24T06:00:00.000Z', parts: PARTS_ONSITE, packageQty: 3, packageSize: 'SM', ...o });
const sentConfirmation = (o = {}) => confirmation({ status: 'answered', answeredAt: '2026-10-25T04:00:00.000Z', ...o });
const byId = (...requests) => new Map(requests.map((r) => [r.id, r]));
const rowOf = (requests, surveys, extra = {}) => zoneRegistryRow(zone, { surveys, requestsById: byId(...requests), ...extra });

/* ══ 1. ทะเบียน — ตารางเดียว (แผน §7 แถว S5) ═══════════════════════════════════════════════════════════
   `want.request` = ใบของผลล่าสุด (`surveyRequestId`) · `want.pending` = ใบที่ถือพื้นที่ไว้ (`pendingRequest.id`) ไม่มี = null
   `want.confirmRequest` = ใบยืนยันที่ป้ายอ้างถึง (มีเฉพาะ 'confirming') · `want.area` = ตัวเลขของแถวเดียวกับป้าย */
const CASES = [
  {
    name: 'ใบต้นทางอย่างเดียว',
    requests: [original()], surveys: [drawingRow()],
    want: { confirm: 'awaiting', tag: TAG_AWAITING, request: 'DR-O', pending: null, area: 100 },
  },
  {
    name: 'ใบยืนยันผูกแล้ว รอรับเรื่อง (pending)',
    requests: [original(), confirmation({ status: 'pending', committedDueDate: null })], surveys: [drawingRow(), confirmRow()],
    want: { confirm: 'confirming', tag: TAG_CONFIRMING, request: 'DR-O', pending: 'DR-C', area: 100,
      confirmRequest: { id: 'DR-C', docNo: 'RQ-AS-26100031' } },
  },
  {
    name: 'ใบยืนยันผูกแล้ว รับเรื่องแล้ว (acknowledged)',
    requests: [original(), confirmation()], surveys: [drawingRow(), confirmRow()],
    want: { confirm: 'confirming', tag: TAG_CONFIRMING, request: 'DR-O', pending: 'DR-C', area: 100,
      confirmRequest: { id: 'DR-C', docNo: 'RQ-AS-26100031' } },
  },
  {
    name: 'ใบยืนยันผูกแล้วแต่ยังเป็นร่าง — ร่างไม่ใช่ใบที่เปิดอยู่',
    requests: [original(), confirmation({ status: 'draft', docNo: null, committedDueDate: null })], surveys: [drawingRow(), confirmRow()],
    want: { confirm: 'awaiting', tag: TAG_AWAITING, request: 'DR-O', pending: null, area: 100 },
  },
  {
    name: 'ใบยืนยันส่งผลลงหน้างานแล้ว — ผลล่าสุด = ตัวเลขวัดจริง',
    requests: [original(), sentConfirmation()], surveys: [drawingRow(), measured()],
    want: { confirm: 'none', tag: null, request: 'DR-C', pending: null, area: 96 },
  },
  {
    name: 'ใบยืนยันถูกยกเลิก',
    requests: [original(), confirmation({ status: 'cancelled', cancelledAt: '2026-10-21T03:00:00.000Z' })],
    surveys: [drawingRow(), confirmRow()],
    want: { confirm: 'awaiting', tag: TAG_AWAITING, request: 'DR-O', pending: null, area: 100 },
  },
  {
    name: 'ใบยืนยันถูกปิดโดยไม่ได้ประเมิน',
    requests: [original(), confirmation({ status: 'closed', closedAt: '2026-10-22T03:00:00.000Z' })],
    surveys: [drawingRow(), confirmRow()],
    want: { confirm: 'awaiting', tag: TAG_AWAITING, request: 'DR-O', pending: null, area: 100 },
  },
  {
    name: 'ใบยืนยันส่งผลแล้วแต่ตัดพื้นที่นี้ออก',
    requests: [original(), sentConfirmation()], surveys: [drawingRow(), measured({ status: 'cut' })],
    want: { confirm: 'awaiting', tag: TAG_AWAITING, request: 'DR-O', pending: null, area: 100 },
  },
  {
    name: 'ใบยืนยันถูกสลับเป็นจากแบบแล้วส่ง "ต้องยืนยัน" — รอยืนยัน ของใบยืนยันเอง',
    requests: [original(), sentConfirmation({ surveyConfirm: 'needed' })],
    surveys: [drawingRow(), measured({ method: 'drawing', parts: PARTS_ONSITE })],
    want: { confirm: 'awaiting', tag: TAG_AWAITING, request: 'DR-C', pending: null, area: 96 },
  },
  {
    name: 'ใบยืนยันถูกสลับเป็นจากแบบแล้วส่ง "ไม่ต้องยืนยัน"',
    requests: [original(), sentConfirmation({ surveyConfirm: 'not_needed' })],
    surveys: [drawingRow(), measured({ method: 'drawing', parts: PARTS_ONSITE })],
    want: { confirm: 'drawing', tag: TAG_DRAWING, request: 'DR-C', pending: null, area: 96 },
  },
  {
    name: 'ใบต้นทางถูกดึงกลับแล้วส่งใหม่หลังใบยืนยันส่งผล — ผลวัดจริงยังชนะ',
    requests: [original({ answeredAt: '2026-11-02T04:00:00+00:00' }), sentConfirmation()],
    surveys: [drawingRow({ surveyedAt: '2026-11-01T03:30:00+00:00' }), measured()],
    want: { confirm: 'none', tag: null, request: 'DR-C', pending: null, area: 96 },
  },
  {
    name: 'ใบลงหน้างานธรรมดาที่ไม่ผูก เปิดอยู่ — รอยืนยัน + ล็อกแบบเดิม',
    requests: [original(), confirmation({ id: 'DR-U', docNo: 'RQ-AS-26100040', surveyConfirmOfId: null })],
    surveys: [drawingRow(), confirmRow({ id: 'S-U', requestId: 'DR-U' })],
    want: { confirm: 'awaiting', tag: TAG_AWAITING, request: 'DR-O', pending: 'DR-U', area: 100 },
  },
  {
    name: 'ใบเปิดอยู่ผูกกับใบต้นทางอื่น — ไม่ใช่ใบยืนยันของผลนี้',
    requests: [original(), confirmation({ surveyConfirmOfId: 'DR-OTHER' })], surveys: [drawingRow(), confirmRow()],
    want: { confirm: 'awaiting', tag: TAG_AWAITING, request: 'DR-O', pending: 'DR-C', area: 100 },
  },
  {
    name: 'ใบต้นทางถูกดึงกลับแล้วส่งใหม่เป็น "ไม่ต้องยืนยัน" ระหว่างใบยืนยันเปิดอยู่ — ป้ายจากแบบ ล็อกด้วยใบยืนยัน ไม่มี confirmRequest',
    requests: [original({ surveyConfirm: 'not_needed', answeredAt: '2026-10-22T04:00:00+00:00' }), confirmation()],
    surveys: [drawingRow({ surveyedAt: '2026-10-21T03:30:00+00:00' }), confirmRow()],
    want: { confirm: 'drawing', tag: TAG_DRAWING, request: 'DR-O', pending: 'DR-C', area: 100 },
  },
  {
    name: 'แถวไม่มีคีย์ method (ผลลงหน้างานรุ่นเก่า) + ใบยืนยันเปิดอยู่ — ไม่ใช่ผลจากแบบ จัดอันดับเท่าเดิม',
    requests: [original({ surveyConfirm: null }), confirmation()],
    surveys: [drawingRow({ method: undefined, parts: PARTS_ONSITE }), confirmRow({ method: undefined })],
    want: { confirm: 'none', tag: null, request: 'DR-O', pending: 'DR-C', area: 96 },
  },
];

test('ทะเบียน: สภาพยืนยันหน้างานของพื้นที่ทุกกรณีของใบยืนยัน (ตารางเดียว)', () => {
  for (const { name, requests, surveys, want } of CASES) {
    const row = rowOf(requests, surveys);
    assert.equal(row.confirm, want.confirm, `${name}: confirm`);
    assert.equal(row.confirmTag, want.tag, `${name}: confirmTag`);
    assert.equal(row.surveyRequestId, want.request, `${name}: surveyRequestId`);
    assert.equal(row.pendingRequest?.id ?? null, want.pending, `${name}: pendingRequest`);
    assert.equal(row.areaSqm, want.area, `${name}: ตัวเลขของแถวเดียวกับป้าย`);
    if (want.confirmRequest) assert.deepEqual(row.confirmRequest, want.confirmRequest, `${name}: confirmRequest`);
    else assert.equal(Object.keys(row).includes('confirmRequest'), false, `${name}: R-KEYS — ไม่กำลังยืนยัน = ไม่มีคีย์ confirmRequest`);
  }
});

test('ทะเบียน: ป้าย confirming คือค่าคงที่ตัวเดียวกับ SURVEY_ZONE_TAG · สองคีย์เดิมไม่ขยับ', () => {
  assert.deepEqual(SURVEY_ZONE_TAG, { awaiting: TAG_AWAITING, drawing: TAG_DRAWING, confirming: TAG_CONFIRMING });
  const row = rowOf([original(), confirmation()], [drawingRow(), confirmRow()]);
  assert.equal(row.confirmTag, SURVEY_ZONE_TAG.confirming);
  // ป้ายไม่มีเลขใบ — เลขของใบยืนยันพิมพ์อยู่ข้างชิปแล้วบนทั้งสองผิว (เหตุล็อกของไทล์ · "มีใบสั่งวัดค้าง" ของแท็บลูกค้า)
  assert.doesNotMatch(row.confirmTag, /RQ-|\d/);
});

test('ทะเบียน: ลิงก์ใช้ตัดสินสภาพเท่านั้น ไม่เคยใช้จัดอันดับ — ผูกหรือไม่ผูก ตัวเลขและผลล่าสุดเท่ากันทุกกรณี', () => {
  const variants = [
    { label: 'เปิดอยู่', surveys: [drawingRow(), confirmRow()], conf: {} },
    { label: 'ส่งผลลงหน้างานแล้ว', surveys: [drawingRow(), measured()], conf: { status: 'answered', answeredAt: '2026-10-25T04:00:00.000Z' } },
    { label: 'ต้นทางส่งใหม่ทีหลัง', surveys: [drawingRow({ surveyedAt: '2026-11-01T03:30:00+00:00' }), measured()],
      conf: { status: 'answered', answeredAt: '2026-10-25T04:00:00.000Z' }, orig: { answeredAt: '2026-11-02T04:00:00+00:00' } },
  ];
  const RANK_KEYS = ['surveyedAt', 'surveyRequestId', 'assessMethod', 'areaSqm', 'volumeCbm', 'assessedPackages', 'assessedPackageSize',
    'surveyCount', 'onsiteSurveyCount'];
  for (const { label, surveys, conf, orig = {} } of variants) {
    const linked = rowOf([original(orig), confirmation(conf)], surveys);
    const plain = rowOf([original(orig), confirmation({ ...conf, surveyConfirmOfId: null })], surveys);
    for (const key of RANK_KEYS) assert.deepEqual(linked[key], plain[key], `${label}: ${key}`);
  }
});

test('ทะเบียน R-KEYS: pendingRequest ของใบที่ไม่ผูกไม่มีคีย์ confirmOfId · ใบที่ผูกมี (ค่าคือ id ของใบต้นทาง)', () => {
  const plain = rowOf([original(), confirmation({ id: 'DR-U', docNo: 'RQ-AS-26100040', surveyConfirmOfId: null })],
    [drawingRow(), confirmRow({ id: 'S-U', requestId: 'DR-U' })]);
  assert.deepEqual(Object.keys(plain.pendingRequest), ['id', 'docNo', 'status', 'dueDate', 'assessMethod']);
  assert.deepEqual(plain.pendingRequest, {
    id: 'DR-U', docNo: 'RQ-AS-26100040', status: 'acknowledged', dueDate: '2026-10-24', assessMethod: 'onsite',
  });
  // ช่องว่าง / undefined ก็ไม่ใช่ลิงก์
  for (const empty of ['', undefined]) {
    const row = rowOf([original(), confirmation({ surveyConfirmOfId: empty })], [drawingRow(), confirmRow()]);
    assert.equal(Object.keys(row.pendingRequest).includes('confirmOfId'), false, String(empty));
    assert.equal(row.confirm, 'awaiting', String(empty));
  }

  const linked = rowOf([original(), confirmation()], [drawingRow(), confirmRow()]);
  assert.deepEqual(linked.pendingRequest, {
    id: 'DR-C', docNo: 'RQ-AS-26100031', status: 'acknowledged', dueDate: '2026-10-24', assessMethod: 'onsite', confirmOfId: 'DR-O',
  });
  // ไม่เคยประเมิน / ไม่มีใบค้าง — ไม่มีคีย์ใหม่สักตัว
  const never = zoneRegistryRow(zone, {});
  assert.equal(never.pendingRequest, null);
  assert.equal(Object.keys(never).includes('confirmRequest'), false);
});

/* ══ 2. ตัวเลือกพื้นที่เดิมบนฟอร์มเปิดใบ ═══════════════════════════════════════════════════════════════ */

test('ไทล์: พื้นที่ที่กำลังยืนยัน = ล็อก · เหตุคือประโยคเดิมพร้อมเลขใบยืนยันและนัด · ป้ายใหม่ · เหตุไม่ขึ้นต้นด้วยคำของป้าย', () => {
  const row = rowOf([original(), confirmation()], [drawingRow(), confirmRow()]);
  const tile = zonePickState(row);
  assert.equal(tile.kind, 'locked');
  assert.equal(tile.locked, true);
  assert.equal(tile.surveyState, 'pending');
  assert.equal(tile.reason, 'มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100031 · นัด 2026-10-24');
  assert.equal(tile.tag, TAG_CONFIRMING);
  assert.equal(tile.confirm, 'confirming');
  assert.ok(!tile.reason.startsWith(TAG_DRAWING), 'เหตุไม่พูดคำของป้ายซ้ำ (sales-q4)');
  assert.ok(!tile.reason.includes(TAG_CONFIRMING));
  // เลขใบยืนยันพิมพ์ครั้งเดียว
  assert.equal(tile.reason.split('RQ-AS-26100031').length - 1, 1);
  // ใบยืนยันที่ยังไม่รับเรื่อง (ไม่มีวันรับปาก) — เหตุจบที่เลขใบ
  const fresh = zonePickState(rowOf([original(), confirmation({ status: 'pending', committedDueDate: null })], [drawingRow(), confirmRow()]));
  assert.equal(fresh.reason, 'มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100031');
  assert.equal(fresh.tag, TAG_CONFIRMING);
});

test('ไทล์: ใบลงหน้างานที่ไม่ผูกเปิดอยู่ = ล็อกด้วยประโยคเดิม · ป้ายยังเป็น "รอยืนยันหน้างาน"', () => {
  const row = rowOf([original(), confirmation({ id: 'DR-U', docNo: 'RQ-AS-26100040', surveyConfirmOfId: null })],
    [drawingRow(), confirmRow({ id: 'S-U', requestId: 'DR-U' })]);
  const tile = zonePickState(row);
  assert.equal(tile.kind, 'locked');
  assert.equal(tile.reason, 'มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100040 · นัด 2026-10-24');
  assert.equal(tile.tag, TAG_AWAITING);
});

test('ไทล์: ขายแล้ว + กำลังยืนยัน = ล็อกด้วยเหตุเดียวกัน (ไม่มีท้ายประโยค "รอยืนยัน" — ไม่ถึงตัวต่อท้ายของพื้นที่ขายแล้ว)', () => {
  const reg = customerZoneRegistry({
    sites: [{ id: 'ST1', name: 'สำนักงานใหญ่' }],
    zones: [zone],
    surveys: [drawingRow(), confirmRow()],
    requests: [original(), confirmation()],
    terms: [{ id: 'T1', zoneId: 'ZN1', salesOrderId: 'SO1' }],
    orders: [{ id: 'SO1', status: 'approved', orderNumber: 'SO-1' }],
    todayIso: '2026-10-25',
  });
  const row = reg.sites[0].zones[0];
  assert.equal(row.termState, 'active');
  assert.equal(row.confirm, 'confirming');
  const tile = zonePickState(row);
  assert.equal(tile.kind, 'locked');
  assert.equal(tile.reason, 'มีใบสั่งวัดค้างอยู่แล้ว RQ-AS-26100031 · นัด 2026-10-24');
  assert.equal(tile.tag, TAG_CONFIRMING);
});

/* ══ 3. ตัวนับ — กำลังยืนยัน = ยังเป็นตัวเลขที่ยังไม่ยืนยัน ════════════════════════════════════════════════ */

test('หน้าต่างเพิ่มหลายโซน: พื้นที่ที่กำลังยืนยันนับใน awaitingConfirm · ประโยคเตือนเดิม', () => {
  const confirming = rowOf([original(), confirmation()], [drawingRow(), confirmRow()]);
  const awaiting = { ...rowOf([original()], [drawingRow()]), id: 'ZN2' };
  const drawing = { ...rowOf([original({ surveyConfirm: 'not_needed' })], [drawingRow()]), id: 'ZN3' };
  assert.deepEqual([confirming.confirm, awaiting.confirm, drawing.confirm], ['confirming', 'awaiting', 'drawing']);
  const zonesById = new Map([confirming, awaiting, drawing].map((z) => [z.id, z]));
  const plan = zonesBulkPlan({ selectedIds: ['ZN1', 'ZN2', 'ZN3'], zonesById });
  assert.equal(plan.assessed, 3);
  assert.equal(plan.awaitingConfirm, 2);
  assert.equal(zonesBulkAwaitingText(plan), '2 โซนใช้ตัวเลขที่ประเมินจากแบบ ยังไม่ยืนยันหน้างาน');
  // กำลังยืนยันอย่างเดียวก็เตือน
  const only = zonesBulkPlan({ selectedIds: ['ZN1'], zonesById });
  assert.equal(only.awaitingConfirm, 1);
  assert.equal(zonesBulkAwaitingText(only), '1 โซนใช้ตัวเลขที่ประเมินจากแบบ ยังไม่ยืนยันหน้างาน');
  // โหมดเท่ากันทุกโซน — ตัวเลขที่คนพิมพ์เอง ไม่นับ (กติกาเดิม)
  assert.equal(zonesBulkPlan({ selectedIds: ['ZN1'], zonesById, mode: 'equal', equalPacks: '2' }).awaitingConfirm, 0);
});

test('ยอดของทะเบียน: awaitingConfirm นับพื้นที่ที่รอยืนยันและที่กำลังยืนยัน — ระดับสถานที่และระดับลูกค้า', () => {
  const reg = customerZoneRegistry({
    sites: [{ id: 'ST1', name: 'สำนักงานใหญ่' }, { id: 'ST2', name: 'สาขาสอง' }],
    zones: [
      { id: 'ZN1', siteId: 'ST1', name: 'กำลังยืนยัน' },
      { id: 'ZN2', siteId: 'ST1', name: 'รอยืนยัน' },
      { id: 'ZN3', siteId: 'ST2', name: 'ยืนยันแล้ว (วัดจริง)' },
    ],
    surveys: [
      drawingRow(), confirmRow(),
      drawingRow({ id: 'S-O2', zoneId: 'ZN2' }),
      drawingRow({ id: 'S-O3', zoneId: 'ZN3' }), measured({ id: 'S-C3', zoneId: 'ZN3', requestId: 'DR-C3' }),
    ],
    requests: [original(), confirmation(), sentConfirmation({ id: 'DR-C3', docNo: 'RQ-AS-26100032' })],
    todayIso: '2026-10-25',
  });
  const confirmOf = (id) => reg.sites.flatMap((s) => s.zones).find((z) => z.id === id).confirm;
  assert.deepEqual(['ZN1', 'ZN2', 'ZN3'].map(confirmOf), ['confirming', 'awaiting', 'none']);
  assert.equal(reg.sites[0].awaitingConfirm, 2);
  assert.equal(reg.sites[1].awaitingConfirm, 0);
  assert.equal(reg.awaitingConfirm, 2);
});
