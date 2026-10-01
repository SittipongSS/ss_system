import test from 'node:test';
import assert from 'node:assert/strict';
import { customerZoneRegistry, latestSurveyRow, zoneRegistryRow, zoneSaleFacts } from './zoneRegistry.js';

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

/* ═══ PR-C · C-D16/C-D17 — ป้าย "ขายแล้ว n แพ็ค/รอบ" + ใบที่ยังถือโซนไว้ (R1) ═══════════════════════════
   ⚠️ ฟิลด์เดิม (`termState, sold, soldPackages, salesOrders, termEndDate`) ต้องเท่าเดิมเป๊ะ — แท็บพื้นที่บริการของลูกค้า
      และตัวเลือกโซนของการตั้งงานบริการ (PR-A) อ่านมันอยู่ · ฟิลด์ใหม่อ่าน **ทุกใบที่มีผล** ของโซน (critique L6) */
const STAMP = '2026-09-29T03:00:00Z';
const TODAY = '2026-10-01';
const OLD_KEYS = ['termState', 'sold', 'soldPackages', 'salesOrders', 'termEndDate'];
const oldFields = (row) => Object.fromEntries(OLD_KEYS.map((k) => [k, row[k]]));

test('C2: zoneSaleFacts ส่งออกได้ และแถวทะเบียนกางฟิลด์ของมันครบ', () => {
  const terms = [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2, unit: 'แพ็ค' }];
  const ordersById = new Map([['SO1', { id: 'SO1', orderNumber: 'SO-1', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP }]]);
  const facts = zoneSaleFacts('ZN1', { terms, ordersById, todayIso: TODAY });
  assert.deepEqual(Object.keys(facts).sort(), [
    'pendingLabel', 'pendingOrders', 'salesOrders', 'sold', 'soldLabel', 'soldPackages',
    'soldPerRound', 'soldPerRoundPackages', 'termEndDate', 'termState',
  ]);
  const row = zoneRegistryRow(zone, { terms, ordersById, todayIso: TODAY });
  for (const key of Object.keys(facts)) assert.deepEqual(row[key], facts[key], key);
});

test('C2: ฟิลด์เดิมเท่าเดิมทุกกรณี (ไม่เคยขาย · ขายอยู่ · รอบจบ · ใบถูก Rev. · ใบร่าง)', () => {
  const cases = [
    { name: 'none', terms: [], orders: [], want: { termState: 'none', sold: false, soldPackages: null, salesOrders: [], termEndDate: null } },
    {
      name: 'active',
      terms: [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2, unit: 'ชุด' }],
      orders: [{ id: 'SO1', orderNumber: 'SO-1', status: 'approved', supersededById: null }],
      want: { termState: 'active', sold: true, soldPackages: 2, salesOrders: [{ id: 'SO1', orderNumber: 'SO-1' }], termEndDate: null },
    },
    {
      name: 'ended',
      terms: [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2, startDate: '2025-01-01', endDate: '2025-12-31' }],
      orders: [{ id: 'SO1', orderNumber: 'SO-1', status: 'approved', supersededById: null }],
      want: { termState: 'ended', sold: false, soldPackages: null, salesOrders: [{ id: 'SO1', orderNumber: 'SO-1' }], termEndDate: '2025-12-31' },
    },
    {
      name: 'revised',
      terms: [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2 }],
      orders: [{ id: 'SO1', orderNumber: 'SO-1', status: 'revised', supersededById: 'SO2' }],
      want: { termState: 'ended', sold: false, soldPackages: null, salesOrders: [{ id: 'SO1', orderNumber: 'SO-1' }], termEndDate: null },
    },
    {
      name: 'draft',
      terms: [{ zoneId: 'ZN1', salesOrderId: 'SO1', packageQty: 2 }],
      orders: [{ id: 'SO1', status: 'draft', supersededById: null }],
      want: { termState: 'ended', sold: false, soldPackages: null, salesOrders: [{ id: 'SO1', orderNumber: null }], termEndDate: null },
    },
  ];
  for (const c of cases) {
    const ordersById = new Map(c.orders.map((o) => [o.id, o]));
    assert.deepEqual(oldFields(zoneRegistryRow(zone, { terms: c.terms, ordersById, todayIso: TODAY })), c.want, c.name);
    assert.equal(zoneRegistryRow(zone, { terms: c.terms, ordersById, todayIso: TODAY }).soldLabel,
      c.name === 'active' ? 'ขายแล้ว (SO-1)' : null, `${c.name}: soldLabel`);
  }
});

/* ของจริง 29/09: SO-26090247-0 ลงสองบรรทัดที่โซน Office โซนเดียว · บรรทัดละ 2 แพ็คต่อรอบ */
test('C2: ใบที่ประทับแล้ว หน่วยแพ็ค → "ขายแล้ว 4 แพ็ค/รอบ (SO-26090247-0)"', () => {
  const terms = [
    { id: 'T1', zoneId: 'ZN1', salesOrderId: 'SOR-A', packageQty: 2, unit: 'แพ็ค' },
    { id: 'T2', zoneId: 'ZN1', salesOrderId: 'SOR-A', packageQty: 2, unit: 'แพ็ค' },
  ];
  const ordersById = new Map([['SOR-A', { id: 'SOR-A', orderNumber: 'SO-26090247-0', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP }]]);
  const row = zoneRegistryRow(zone, { terms, ordersById, todayIso: TODAY });
  assert.equal(row.soldPerRound, true);
  assert.equal(row.soldPerRoundPackages, 4);
  assert.equal(row.soldLabel, 'ขายแล้ว 4 แพ็ค/รอบ (SO-26090247-0)');
  assert.equal(row.soldPackages, 4, 'ฟิลด์เดิมยังเป็นผลรวมของใบเดียวกัน');
});

/* 🐞 critique L6: ตัวเดิมหยิบใบแรกใบเดียว (`zoneTermState`) — โซนที่สองใบมีผลพร้อมกันจะขึ้นแพ็คของใบแรกเท่านั้น */
test('C2: สองใบมีผลพร้อมกัน → ป้ายรวมทุกใบ · ฟิลด์เดิมยังเป็นค่าของใบแรก', () => {
  const terms = [
    { id: 'T1', zoneId: 'ZN1', salesOrderId: 'SOR-B', packageQty: 3, unit: 'แพ็ค' },
    { id: 'T2', zoneId: 'ZN1', salesOrderId: 'SOR-A', packageQty: 2, unit: 'แพ็ค' },
  ];
  const ordersById = new Map([
    ['SOR-A', { id: 'SOR-A', orderNumber: 'SO-A', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP }],
    ['SOR-B', { id: 'SOR-B', orderNumber: 'SO-B', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP }],
  ]);
  const row = zoneRegistryRow(zone, { terms, ordersById, todayIso: TODAY });
  assert.equal(row.soldLabel, 'ขายแล้ว 5 แพ็ค/รอบ (SO-A · SO-B)', 'เลขที่ใบเรียง ไม่ใช่ตามลำดับ term');
  assert.equal(row.soldPerRoundPackages, 5);
  assert.equal(row.soldPackages, 3, 'ฟิลด์เดิม = ใบแรกที่ zoneTermState หยิบ');
  assert.deepEqual(row.salesOrders, [{ id: 'SOR-B', orderNumber: 'SO-B' }]);
});

test('C2: ใบที่ประทับปนใบเดิม/หน่วยอื่น → "ขายแล้ว (…)" ไม่มีจำนวนต่อรอบ', () => {
  const ordersById = new Map([
    ['SOR-A', { id: 'SOR-A', orderNumber: 'SO-A', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP }],
    ['SOR-L', { id: 'SOR-L', orderNumber: 'SO-L', status: 'approved', supersededById: null, serviceTermsOpenedAt: null }],
  ]);
  const mixed = zoneRegistryRow(zone, {
    terms: [
      { zoneId: 'ZN1', salesOrderId: 'SOR-A', packageQty: 2, unit: 'แพ็ค' },
      { zoneId: 'ZN1', salesOrderId: 'SOR-L', packageQty: 12, unit: 'แพ็ค' },
    ],
    ordersById,
    todayIso: TODAY,
  });
  assert.equal(mixed.soldPerRound, false);
  assert.equal(mixed.soldPerRoundPackages, null);
  assert.equal(mixed.soldLabel, 'ขายแล้ว (SO-A · SO-L)');

  const otherUnit = zoneRegistryRow(zone, {
    terms: [{ zoneId: 'ZN1', salesOrderId: 'SOR-A', packageQty: 2, unit: 'ชุด' }], ordersById, todayIso: TODAY,
  });
  assert.equal(otherUnit.soldLabel, 'ขายแล้ว (SO-A)');

  // term ของใบที่ตายแล้ว/รอบที่ยังไม่ถึงวันเริ่ม ไม่นับเข้าป้าย
  const future = zoneRegistryRow(zone, {
    terms: [
      { zoneId: 'ZN1', salesOrderId: 'SOR-A', packageQty: 2, unit: 'แพ็ค' },
      { zoneId: 'ZN1', salesOrderId: 'SOR-A', packageQty: 5, unit: 'แพ็ค', startDate: '2027-01-01' },
    ],
    ordersById,
    todayIso: TODAY,
  });
  assert.equal(future.soldLabel, 'ขายแล้ว 2 แพ็ค/รอบ (SO-A)');
});

/* 🐞 review 29/09: term ของใบที่ประทับไม่มีวัน (mig 0392) ⇒ ใบเก่าที่ช่วงบริการจบแล้วยังมีผลตามใบ · ต่อสัญญา = ใบใหม่
   ผูกโซนเดิม ⇒ ป้ายเคยรวมสองใบ ("ขายแล้ว 4 แพ็ค/รอบ (SO-old · SO-new)") ทั้งที่ส่งจริง 2 */
test('🔴 C2: ใบเก่าช่วงจบแล้ว + ใบต่อสัญญา → ป้ายของใบปัจจุบันใบเดียว · ใบต่อสัญญาที่ยังไม่เริ่มไม่รวม · ฟิลด์เดิมไม่ขยับ', () => {
  const orderOf = (id, from, to) => ({ id, orderNumber: id, status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP, servicePeriodFrom: from, servicePeriodTo: to });
  const ordersById = new Map([
    ['SO-OLD', orderOf('SO-OLD', '2025-10-01', '2026-09-30')],
    ['SO-NEW', orderOf('SO-NEW', '2026-10-01', '2027-09-30')],
    ['SO-ADD', orderOf('SO-ADD', '2026-09-15', '2027-09-30')],
    ['SO-REN', orderOf('SO-REN', '2027-10-01', '2028-09-30')],
  ]);
  const t = (salesOrderId, packageQty) => ({ zoneId: 'ZN1', salesOrderId, packageQty, unit: 'แพ็ค' });
  const renewed = zoneRegistryRow(zone, { terms: [t('SO-OLD', 2), t('SO-NEW', 2)], ordersById, todayIso: TODAY });
  assert.equal(renewed.soldLabel, 'ขายแล้ว 2 แพ็ค/รอบ (SO-NEW)');
  assert.equal(renewed.soldPerRoundPackages, 2);
  assert.equal(renewed.termState, 'active', 'ฟิลด์เดิมยังเป็นกติกาใบแรกของ zoneTermState');

  const overlapping = zoneRegistryRow(zone, { terms: [t('SO-NEW', 2), t('SO-ADD', 1), t('SO-REN', 5)], ordersById, todayIso: TODAY });
  assert.equal(overlapping.soldLabel, 'ขายแล้ว 3 แพ็ค/รอบ (SO-ADD · SO-NEW)', 'ขายเพิ่มซ้อนช่วง = รวม · ต่อสัญญาที่ยังไม่เริ่ม = ยังไม่รวม');
});

test('C2: ใบที่ยังถือโซนไว้ — ป้ายสองกลุ่ม · ส่งรายการเดิมกลับไปให้คำเตือนตอนปิดใช้งาน', () => {
  const pendingOrders = [
    { orderId: 'S1', orderNumber: 'SO-26100011-0', status: 'draft', group: 'unapproved', stateLabel: 'ฉบับร่าง', ownerName: null },
    { orderId: 'S2', orderNumber: 'SO-26080036-0', status: 'approved', group: 'backfill', stateLabel: 'รอผู้จัดการตรวจ', ownerName: null },
  ];
  const row = zoneRegistryRow(zone, { pendingOrders });
  assert.deepEqual(row.pendingOrders, pendingOrders);
  assert.equal(row.pendingLabel,
    'อยู่ในใบที่ยังไม่อนุมัติ: SO-26100011-0 (ฉบับร่าง) · อยู่ในใบที่กำลังตั้งงานบริการย้อนหลัง: SO-26080036-0 (รอผู้จัดการตรวจ)');
  const none = zoneRegistryRow(zone, {});
  assert.deepEqual(none.pendingOrders, []);
  assert.equal(none.pendingLabel, null);
});

test('C2: ทะเบียนของลูกค้าส่งใบที่ถือโซนเข้าแถวของโซนนั้นเท่านั้น', () => {
  const chip = { orderId: 'S1', orderNumber: 'SO-26100011-0', status: 'draft', group: 'unapproved', stateLabel: 'ฉบับร่าง', ownerName: null };
  const reg = customerZoneRegistry({
    sites: [{ id: 'ST1', code: 'ST-A', name: 'สำนักงานใหญ่' }],
    zones: [
      { id: 'ZN1', siteId: 'ST1', name: 'ล็อบบี้' },
      { id: 'ZN2', siteId: 'ST1', name: 'โถงลิฟต์' },
    ],
    terms: [{ zoneId: 'ZN2', salesOrderId: 'SOR-A', packageQty: 1, unit: 'แพ็ค' }],
    orders: [{ id: 'SOR-A', orderNumber: 'SO-A', status: 'approved', supersededById: null, serviceTermsOpenedAt: STAMP }],
    pendingOrdersByZone: new Map([['ZN1', [chip]]]),
    todayIso: TODAY,
  });
  const [z1, z2] = reg.sites[0].zones;
  assert.equal(z1.pendingLabel, 'อยู่ในใบที่ยังไม่อนุมัติ: SO-26100011-0 (ฉบับร่าง)');
  assert.equal(z2.pendingLabel, null);
  assert.equal(z2.soldLabel, 'ขายแล้ว 1 แพ็ค/รอบ (SO-A)');
  assert.equal(z2.soldPerRoundPackages, 1);
  // ไม่ส่งมา = ไม่มีป้าย (ผู้เรียกเดิมไม่ต้องแก้)
  const plain = customerZoneRegistry({ sites: [{ id: 'ST1' }], zones: [{ id: 'ZN1', siteId: 'ST1' }] });
  assert.equal(plain.sites[0].zones[0].pendingLabel, null);
});
