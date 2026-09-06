import test from 'node:test';
import assert from 'node:assert/strict';
import { customerZoneRegistry, latestSurveyRow, zoneRegistryRow } from './zoneRegistry.js';

/* ล็อบบี้ 3 ส่วน = 1,197 ลบ.ม. (ตัวเลขชุดเดียวกับที่ใช้ UAT เฟส 3) */
const PARTS = [
  { widthM: 12, lengthM: 20, heightM: 4 },
  { widthM: 6, lengthM: 8, heightM: 4 },
  { widthM: 3, lengthM: 5, heightM: 3 },
];
const SPOTS = [
  { id: 's1', label: 'เสาซ้าย', selected: true },
  { id: 's2', label: 'หลังเคาน์เตอร์', selected: true },
  { id: 's3', label: 'ช่องแอร์', selected: false },
];

const zone = { id: 'ZN1', code: 'ZN-AAAA-01-00001', name: 'ล็อบบี้', floor: '01', siteId: 'ST1' };

/* ใบที่ TS ส่งผลแล้ว — ตัวตัดว่าแถวผลวัดนับเข้าทะเบียนหรือยัง (แผน §5A) */
const SENT = { id: 'REQ1', docNo: 'AS-1', status: 'closed', answeredAt: '2026-08-21T00:00:00Z' };
const OPEN = { id: 'REQ2', docNo: 'AS-2', status: 'acknowledged', answeredAt: null };
const sentOnly = new Map([[SENT.id, SENT], [OPEN.id, OPEN]]);

test('ไม่เคยประเมิน = ค่าว่าง ไม่ใช่ศูนย์', () => {
  const row = zoneRegistryRow(zone, {});
  assert.equal(row.surveyedAt, null);
  assert.equal(row.areaSqm, null, 'ยังไม่วัด ต้องไม่ใช่ 0 — ศูนย์อ่านว่า "วัดแล้วได้ศูนย์"');
  assert.equal(row.volumeCbm, null);
  assert.equal(row.assessedPackages, null);
  assert.equal(row.sold, false);
  assert.equal(row.soldPackages, null);
});

/* 🔑 มติข้อ 8: ประเมินซ้ำไม่ทับของเดิม ⇒ ขนาดของโซน = แถวที่ใหม่ที่สุด */
test('🔑 ประเมินหลายรอบ — เอาแถวที่วัดล่าสุด ไม่ใช่แถวที่สร้างล่าสุด', () => {
  const rows = [
    { id: 'A', zoneId: 'ZN1', requestId: 'REQ1', createdAt: '2026-08-01', surveyedAt: '2026-08-20', parts: PARTS, packageQty: 3 },
    { id: 'B', zoneId: 'ZN1', requestId: 'REQ1', createdAt: '2026-09-01', surveyedAt: null, parts: [], packageQty: null },
  ];
  assert.equal(latestSurveyRow(rows).id, 'A', 'แถวที่เปิดทีหลังแต่ยังไม่ได้ไปวัด ต้องไม่ชนะ');

  const later = [...rows, { id: 'C', zoneId: 'ZN1', requestId: 'REQ1', createdAt: '2026-09-02', surveyedAt: '2026-09-05', parts: PARTS.slice(0, 1), packageQty: 1 }];
  assert.equal(latestSurveyRow(later).id, 'C');
  assert.equal(zoneRegistryRow(zone, { surveys: later, requestsById: sentOnly }).assessedPackages, 1,
    'ต้องเป็นตัวเลขของรอบล่าสุด');
});

/* ⚠️ ตัดออกในใบหนึ่ง ไม่ได้แปลว่าขนาดที่เคยวัดไว้เป็นโมฆะ */
test('⚠️ แถวที่ถูกตัดออกไม่นับเป็นผลวัดล่าสุด', () => {
  const rows = [
    { id: 'A', zoneId: 'ZN1', requestId: 'REQ1', createdAt: '2026-08-01', surveyedAt: '2026-08-20', parts: PARTS, packageQty: 3 },
    { id: 'B', zoneId: 'ZN1', requestId: 'REQ1', createdAt: '2026-09-01', surveyedAt: '2026-09-05', status: 'cut', cutReason: 'เจ้าของตึกไม่ให้ติด', parts: [] },
  ];
  const row = zoneRegistryRow(zone, { surveys: rows, requestsById: sentOnly });
  assert.equal(row.assessedPackages, 3);
  assert.equal(row.volumeCbm, 1197);
  assert.equal(row.surveyCount, 1, 'แถวที่ตัดออกไม่นับเป็นครั้งที่ประเมิน');
});

test('ขนาด · จุด · สูตร อ่านจากรอบล่าสุดครบ', () => {
  const row = zoneRegistryRow(zone, {
    surveys: [{ id: 'A', zoneId: 'ZN1', requestId: 'REQ1', surveyedAt: '2026-08-20', parts: PARTS, spots: SPOTS, packageQty: 3 }],
    requestsById: sentOnly,
  });
  assert.equal(row.volumeCbm, 1197);
  assert.equal(row.areaSqm, 303);
  assert.equal(row.spotsTotal, 3);
  assert.equal(row.spotsSelected, 2);
  assert.equal(row.assessedPackages, 3);
  assert.equal(row.suggestedPackages, 1, '1,197 ÷ 2400 ปัดรอบเดียว = 1');
  assert.equal(row.surveyRequestId, 'REQ1', 'ต้องบอกได้ว่าประเมินโดยใบไหน');
});

/* 🔑 "ขายแล้ว" ต้องถาม termOrderActive ตัวเดียว — ใบที่ถูก Rev. ตายเอง */
test('🔑 ขายแล้ว/ยังไม่ขาย เดินตามใบสั่งขายแม่', () => {
  const terms = [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2 }];
  const approved = [{ id: 'SO1', status: 'approved', supersededById: null }];

  assert.equal(zoneRegistryRow(zone, { surveys: [], terms, ordersById: new Map(approved.map((o) => [o.id, o])) }).sold, true);
  assert.equal(zoneRegistryRow(zone, { surveys: [], terms, ordersById: new Map(approved.map((o) => [o.id, o])) }).termState, 'active');

  // ใบถูก Rev. ⇒ term เก่าตายเอง โดยไม่ต้องแตะแถว term
  const revised = new Map([['SO1', { id: 'SO1', status: 'approved', supersededById: 'SO2' }]]);
  const row = zoneRegistryRow(zone, { surveys: [], terms, ordersById: revised });
  assert.equal(row.sold, false);
  assert.equal(row.soldPackages, null);

  // ใบร่าง/ยังไม่อนุมัติ ก็ยังไม่ขาย
  const draft = new Map([['SO1', { id: 'SO1', status: 'draft', supersededById: null }]]);
  assert.equal(zoneRegistryRow(zone, { surveys: [], terms, ordersById: draft }).sold, false);

  // ไม่ส่งใบมาเลย = ตอบว่ายังไม่ขาย (fail-closed) ไม่ใช่เดาว่าขายแล้ว
  assert.equal(zoneRegistryRow(zone, { surveys: [], terms }).sold, false);
});

/* ⚠️ สองตัวเลขแพ็คเกจห้ามยุบรวม — ส่วนต่างคือของที่ฝ่ายขายต้องเห็น */
test('⚠️ ประเมิน 3 แต่ซื้อจริง 2 — ต้องเห็นทั้งสองเลข', () => {
  const row = zoneRegistryRow(zone, {
    surveys: [{ id: 'A', zoneId: 'ZN1', requestId: 'REQ1', surveyedAt: '2026-08-20', parts: PARTS, packageQty: 3 }],
    requestsById: sentOnly,
    terms: [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2 }],
    ordersById: new Map([['SO1', { id: 'SO1', status: 'approved', supersededById: null }]]),
  });
  assert.equal(row.assessedPackages, 3);
  assert.equal(row.soldPackages, 2);
});

test('ทะเบียนทั้งของลูกค้า — สถานที่ที่ยังไม่มีพื้นที่ต้องไม่หายไป', () => {
  const reg = customerZoneRegistry({
    sites: [
      { id: 'ST1', code: 'ST-A', name: 'สำนักงานใหญ่' },
      { id: 'ST2', code: 'ST-B', name: 'สาขาใหม่' },   // ยังไม่มีโซนเลย
    ],
    zones: [
      { id: 'ZN1', siteId: 'ST1', name: 'ล็อบบี้', code: 'ZN-A-01' },
      { id: 'ZN2', siteId: 'ST1', name: 'โถงลิฟต์', code: 'ZN-A-02' },
    ],
    surveys: [
      { id: 'A', zoneId: 'ZN1', requestId: 'REQ1', surveyedAt: '2026-08-20', parts: PARTS, packageQty: 3 },
      { id: 'B', zoneId: 'ZN2', requestId: 'REQ1', surveyedAt: '2026-08-20', parts: [{ widthM: 4, lengthM: 5, heightM: 3 }], packageQty: 1 },
      // ร่างที่ยังไม่ส่ง — ไม่มี zoneId ⇒ ยังไม่ใช่ของทะเบียน
      { id: 'C', zoneId: null, requestId: 'REQ2', parts: PARTS, packageQty: 9 },
    ],
    requests: [SENT, OPEN],
    terms: [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2 }],
    orders: [{ id: 'SO1', status: 'approved', supersededById: null }],
  });

  assert.equal(reg.siteCount, 2);
  assert.equal(reg.sites[1].zoneCount, 0, 'สาขาที่ยังไม่มีพื้นที่ต้องยังอยู่ในลิสต์');
  assert.equal(reg.zoneCount, 2, 'ร่างที่ยังไม่ส่งต้องไม่ถูกนับเป็นพื้นที่ในทะเบียน');
  assert.equal(reg.measuredCount, 2);
  assert.equal(reg.soldCount, 1);
  assert.equal(reg.volumeCbm, 1257);
  assert.equal(reg.assessedPackages, 4, 'บวกที่เคาะรายพื้นที่ ไม่ใช่เอาปริมาตรรวมมาหารใหม่');
  assert.equal(reg.soldPackages, 2);
});

/* 🐞 **บั๊กที่กติกา "นับเฉพาะใบที่ส่งผลแล้ว" กันไว้** — `surveyedAt` ถูกประทับซ้ำทุก PATCH
   รวมทั้ง PATCH ที่แค่แก้หมายเหตุ ⇒ แถวเปล่าของใบที่ยังไม่ส่ง จะมีเวลาใหม่กว่าแถวที่มี
   ขนาดจริง · ไม่กรอง = ทะเบียนของลูกค้าว่างลงเฉย ๆ ตอนมีคนเปิดใบประเมินรอบใหม่ */
test('🐞 ใบรอบใหม่ที่ยังไม่ส่งผล ต้องไม่กลบตัวเลขของใบเก่า', () => {
  const surveys = [
    { id: 'A', zoneId: 'ZN1', requestId: 'REQ1', createdAt: '2026-08-01', surveyedAt: '2026-08-20', parts: PARTS, packageQty: 3 },
    // ใบใหม่ ช่างเพิ่งกดบันทึกหมายเหตุ ยังไม่ได้วัด — surveyedAt ใหม่กว่า แต่ parts ว่าง
    { id: 'B', zoneId: 'ZN1', requestId: 'REQ2', createdAt: '2026-09-01', surveyedAt: '2026-09-06', parts: [], packageQty: null },
  ];
  const row = zoneRegistryRow(zone, { surveys, requestsById: sentOnly });
  assert.equal(row.assessedPackages, 3, 'ต้องยังเป็นตัวเลขของใบที่ส่งผลไปแล้ว');
  assert.equal(row.volumeCbm, 1197);
  // แต่ต้องบอกด้วยว่ามีใบสั่งวัดค้างอยู่ — ไม่ใช่เงียบ
  assert.equal(row.pendingRequest?.docNo, 'AS-2');
});

/* ⭐ สามค่า ไม่ใช่สองค่า — ของที่ต่ออายุได้เป็นงานขายคนละชนิดกับของที่ยังไม่เคยเสนอ */
test('⭐ เคยขายแต่รอบจบแล้ว ต้องไม่กลายเป็น "ยังไม่ขาย"', () => {
  const terms = [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2, startDate: '2025-01-01', endDate: '2025-12-31' }];
  const ordersById = new Map([['SO1', { id: 'SO1', status: 'approved', supersededById: null, orderNumber: 'SO-1' }]]);
  const row = zoneRegistryRow(zone, { surveys: [], terms, ordersById, todayIso: '2026-09-06' });
  assert.equal(row.termState, 'ended');
  assert.equal(row.sold, false, 'รอบจบแล้วไม่ใช่ "ขายอยู่"');
  assert.equal(row.termEndDate, '2025-12-31', 'ต้องบอกวันหมดรอบ เพื่อให้ตามต่อได้');
  assert.deepEqual(row.salesOrders, [{ id: 'SO1', orderNumber: 'SO-1' }]);
});
