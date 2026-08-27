// ── ใบส่งงานที่ระบบประกอบเอง (F-5) ────────────────────────────────────────
//
// เคสอ้างอิงคือ **ใบส่งงานจริงใน LINE** ของ Jim Thompson Outlet 93 (01/08/69):
// เครื่อง 4 ตัวทำแล้ว · ตัวหนึ่งชำรุดต้องเปลี่ยน · Reed 6 ขวดยังไม่ได้ทำ
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVisitReport, reportFlags, reportHeadline, shouldPushReport } from './visitReport.js';

const site = {
  id: 'S1', code: 'SS-2606008', name: 'Jim Thompson Outlet 93',
  customerName: 'บริษัท จิม ทอมป์สัน จำกัด', routeZone: 'BKK-S',
  accessFrom: '10:00', accessTo: '19:00', accessDays: [1, 2, 3, 4, 5],
};
const zones = [{ id: 'Z1', name: 'ชั้น 1/3/4' }];
const assets = [
  { id: 'A1', label: 'เครื่องที่ 1', kind: 'diffuser', model: 'O800', colour: 'ขาว', serial: 'SN-0412', zoneId: 'Z1', floor: 'ชั้น 1', settings: { workSec: 30, pauseSec: 225, grade: 'Grade 5' } },
  { id: 'A2', label: 'เครื่องที่ 3', kind: 'diffuser', model: 'O800', colour: 'ดำ', serial: 'SN-0417', zoneId: 'Z1' },
  { id: 'A3', label: 'เครื่องสำรอง', kind: 'diffuser', serial: 'SN-0902', zoneId: 'Z1' },
  { id: 'R1', label: 'Reed diffuser', kind: 'reed', qty: 6, zoneId: 'Z1' },
  { id: 'X9', label: 'เครื่องที่ยังไม่ถึงคิว', kind: 'diffuser', zoneId: 'Z1' },
];
const results = [
  { assetId: 'A1', outcome: 'done', reason: null, replacedByAssetId: null },
  { assetId: 'A2', outcome: 'swapped', reason: 'เครื่องชำรุด ไม่พ่น', replacedByAssetId: 'A3' },
  { assetId: 'R1', outcome: 'unable', reason: 'รอ RD ปรับสูตร', replacedByAssetId: null },
];
const items = [
  { id: 'I1', assetId: 'A1', label: 'A Breath of Dream', qty: 300, unit: 'ml' },
  { id: 'I2', assetId: null, label: 'น้ำยาเช็ดเครื่อง', qty: 1, unit: 'ขวด' },
];
const visit = {
  id: 'V1', code: 'SV-2608014', siteId: 'S1', kind: 'refill', status: 'partial',
  scheduledDate: '2026-08-27', actualDate: '2026-08-27',
  actualStartTime: '09:12:00', actualEndTime: '10:41:00',
  assigneeName: 'ต้า', summary: 'นำเครื่องสำรองมาเปลี่ยน ทำงานปกติแล้ว',
  attachments: [{ url: 'u1', kind: 'before' }], customerSignatureUrl: 'sig',
};

const build = (over = {}) => buildVisitReport({
  visit: { ...visit, ...(over.visit || {}) },
  site, zones, assets,
  results: over.results || results,
  items: over.items || items,
});

test('⭐ ใบเอาเฉพาะเครื่องที่นัดนี้แตะจริง ไม่ใช่ทุกเครื่องในไซต์', () => {
  const r = build();
  assert.deepEqual(r.lines.map((l) => l.assetId), ['A1', 'A2', 'R1']);
  // เครื่องที่ยังไม่ถึงคิวต้องไม่โผล่ในใบที่ส่งให้คนอ่าน
  assert.ok(!r.lines.some((l) => l.assetId === 'X9'));
});

test('⭐ ทุกบรรทัดที่ระบบดึงเองต้องมาครบ — นี่คือ 90% ที่ช่างเคยพิมพ์ซ้ำทุกใบ', () => {
  const head = Object.fromEntries(build().head.map((h) => [h.label, h.value]));
  assert.equal(head['วันที่'], '2026-08-27');
  assert.equal(head['เวลา'], '09:12 – 10:41');
  assert.equal(head['ไซต์'], 'Jim Thompson Outlet 93 · BKK-S');
  assert.equal(head['ลูกค้า'], 'บริษัท จิม ทอมป์สัน จำกัด');
  assert.equal(head['งาน'], 'เติมน้ำหอม');
  assert.equal(head['ช่าง'], 'ต้า');
  assert.ok(head['ช่วงเวลาที่เข้าได้']);
});

test('ค่าตั้งเครื่องขึ้นใบ — ของที่เคยอยู่แต่ในรูปถ่ายหน้าจอที่ส่งเข้า LINE', () => {
  const line = build().lines.find((l) => l.assetId === 'A1');
  assert.match(line.spec, /O800/);
  assert.match(line.spec, /\(ขาว\)/);
  assert.match(line.spec, /SN-0412/);
  assert.match(line.spec, /30\/225/);
  assert.match(line.spec, /Grade 5/);
  assert.equal(line.where, 'ชั้น 1/3/4 · ชั้น 1');
});

test('ชนิดแถวรวมโชว์จำนวนจุด · ชนิดรายเครื่องไม่โชว์', () => {
  const reed = build().lines.find((l) => l.assetId === 'R1');
  assert.match(reed.spec, /6 จุด/);
  const unit = build().lines.find((l) => l.assetId === 'A1');
  assert.ok(!/จุด/.test(unit.spec));
});

test('เปลี่ยนเครื่องบอกชื่อตัวแทน ไม่ใช่ id ดิบ', () => {
  const line = build().lines.find((l) => l.assetId === 'A2');
  assert.equal(line.outcomeLabel, 'เปลี่ยนเครื่อง');
  assert.equal(line.replacedBy, 'เครื่องสำรอง');
  assert.equal(line.reason, 'เครื่องชำรุด ไม่พ่น');
});

test('ของที่ใช้แยกเป็นของเครื่อง กับของกลางของไซต์', () => {
  const r = build();
  assert.deepEqual(r.lines.find((l) => l.assetId === 'A1').used, [{ label: 'A Breath of Dream', qty: 300, unit: 'ml' }]);
  assert.deepEqual(r.sharedItems.map((i) => i.label), ['น้ำยาเช็ดเครื่อง']);
});

test('⭐ ใบปกติไม่มีอะไรต้องดู — ถ้าดันทุกใบ หัวหน้าจะปิดแจ้งเตือนภายในสัปดาห์เดียว', () => {
  const clean = build({
    visit: { status: 'done' },
    results: [{ assetId: 'A1', outcome: 'done' }],
  });
  assert.deepEqual(clean.flags, []);
  assert.equal(shouldPushReport(clean.flags), false);
});

test('⭐ ใบที่ผิดปกติบอกครบว่าผิดตรงไหน และเรียงตามที่ต้องรีบอ่าน', () => {
  const r = build();
  const kinds = r.flags.map((f) => f.kind);
  assert.equal(kinds[0], 'partial');
  assert.ok(kinds.includes('swap'));
  assert.ok(kinds.includes('asset_unable'));
  assert.equal(shouldPushReport(r.flags), true);
  const swap = r.flags.find((f) => f.kind === 'swap');
  assert.match(swap.detail, /เครื่องที่ 3 → เครื่องสำรอง/);
});

test('ขาดรูป/ลายเซ็น/แก้เวลาย้อนหลัง = สิ่งที่ต้องดู แต่ไม่บล็อกการปิดงาน', () => {
  const r = build({
    visit: { status: 'done', attachments: [], customerSignatureUrl: null, actualTimeEdited: true },
    results: [{ assetId: 'A1', outcome: 'done' }],
  });
  const kinds = r.flags.map((f) => f.kind);
  assert.deepEqual(kinds, ['no_signature', 'no_photo', 'time_edited']);
});

test('หัวข้อแจ้งเตือนต้องบอกว่าต้องเปิดดูไหม ไม่ใช่ "มีใบส่งงานใหม่"', () => {
  const r = build();
  const head = reportHeadline({ visit, site, flags: r.flags });
  assert.match(head, /Jim Thompson Outlet 93/);
  assert.match(head, /ทำไม่ครบ/);
  const clean = reportHeadline({ visit, site, flags: [] });
  assert.match(clean, /ส่งงานแล้ว/);
});

test('ไปแล้วทำไม่ได้ทั้งใบ — เหตุผลของใบขึ้นเป็นป้ายแรก', () => {
  const flags = reportFlags({
    visit: { status: 'unable', unableReason: 'ห้างปิดปรับปรุงกะทันหัน', attachments: [{ url: 'u' }], customerSignatureUrl: 's' },
    results: [],
  });
  assert.equal(flags[0].kind, 'unable');
  assert.equal(flags[0].detail, 'ห้างปิดปรับปรุงกะทันหัน');
});

test('ใบที่ยังไม่มีนัด/ไม่มีข้อมูล ต้องไม่ระเบิด', () => {
  assert.equal(buildVisitReport({}), null);
  assert.deepEqual(reportFlags({}), []);
  assert.equal(reportHeadline({}), '');
});
