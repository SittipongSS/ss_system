// ── แท็บ "รอติดตั้ง" ของ TS (ขั้นเข้าติดตั้ง PR-3b) — แถวจากข้อมูลดิบ ───────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_QUEUE_GROUP_LABELS, INSTALL_QUEUE_STAGES, installQueueRows } from './installQueueView.js';

const order = (id, over = {}) => ({ id, orderNumber: `SO-${id}`, customerName: 'ลูกค้า', status: 'approved', totalAmount: null, supersededById: null, serviceTermsOpenedAt: '2026-11-19T03:00:00Z', ...over });
const base = () => ({
  orders: new Map([['SO1', order('SO1')], ['SO2', order('SO2')], ['SO3', order('SO3', { status: 'cancelled' })]]),
  sites: new Map([['S1', { id: 'S1', code: 'ST-01', name: 'FASHION' }], ['S2', { id: 'S2', code: 'ST-02', name: 'เซ็นทรัลเวิลด์' }], ['S9', { id: 'S9', code: 'ST-09', name: 'บางนา' }]]),
  zones: new Map([
    ['Z1', { id: 'Z1', code: 'ZN-1', name: 'ทางเข้าหลัก', siteId: 'S1' }], ['Z2', { id: 'Z2', code: 'ZN-2', name: 'โซนผัก', siteId: 'S1' }],
    ['Z3', { id: 'Z3', code: 'ZN-3', name: 'ทางเข้า', siteId: 'S2' }], ['Z9', { id: 'Z9', code: 'ZN-9', name: 'โถง', siteId: 'S9' }],
  ]),
  allocations: [
    { salesOrderId: 'SO1', zoneId: 'Z1', packsPerRound: 2 }, { salesOrderId: 'SO1', zoneId: 'Z2', packsPerRound: 1 },
    { salesOrderId: 'SO1', zoneId: 'Z3', packsPerRound: 2 }, { salesOrderId: 'SO1', zoneId: 'Z9', packsPerRound: 1 },
  ],
  installments: [{ id: 'I1', salesOrderId: 'SO1', seq: 1, label: 'มัดจำ 30%', status: 'confirmed', beforeInstall: true }],
});

test('แถว: รอ TS ยืนยันวัน · รอ SA คอนเฟิร์ม · รอฝ่ายขายเลือก (ไซต์ที่ยังไม่ตอบ) · เรียงตามขั้น', () => {
  const data = base();
  const rows = installQueueRows({
    ...data,
    requests: [
      { id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-12-15T03:00:00Z', requestedDate: '2027-01-06', requestedStartTime: '09:00:00', requestedEndTime: '12:00:00', requestedByName: 'กมลรัตน์' },
      { id: 'R2', salesOrderId: 'SO1', siteId: 'S2', mode: 'install', requestedAt: '2026-12-16T03:00:00Z', requestedDate: '2027-01-19' },
    ],
    requestZones: [{ requestId: 'R1', zoneId: 'Z1' }, { requestId: 'R1', zoneId: 'Z2' }, { requestId: 'R2', zoneId: 'Z3' }],
    visits: [{ id: 'V2', installRequestId: 'R2', status: 'draft', tsConfirmedAt: '2027-01-02T03:00:00Z', scheduledDate: '2027-01-19' }],
    visitZonesByVisitId: { V2: ['Z3'] },
  });
  assert.deepEqual(rows.map((r) => [r.siteCode, r.stage]), [['ST-01', 'awaiting_ts'], ['ST-02', 'awaiting_customer'], ['ST-09', 'undecided']]);
  const r1 = rows[0];
  assert.equal(r1.requestedStartTime, '09:00');
  assert.deepEqual(r1.zones.map((z) => [z.name, z.packsPerRound]), [['ทางเข้าหลัก', 2], ['โซนผัก', 1]]);
  assert.equal(r1.deposit.state, 'ok');
  assert.equal(rows[1].visits[0].id, 'V2');
  assert.equal(rows[2].requestId, null);
});

test('แถว: มัดจำยังไม่รับรอง = รอมัดจำ (ข้อความไม่มียอดเงิน) · Service/ใบยกเลิก/นัดยืนยันแล้ว ไม่อยู่ในแท็บ', () => {
  const data = base();
  data.installments = [{ id: 'I1', salesOrderId: 'SO1', seq: 1, label: 'มัดจำ 30%', status: 'reported', beforeInstall: true }];
  const rows = installQueueRows({
    ...data,
    requests: [
      { id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-12-15T03:00:00Z', requestedDate: '2027-01-06' },
      { id: 'R2', salesOrderId: 'SO1', siteId: 'S2', mode: 'install', requestedAt: '2026-12-16T03:00:00Z', requestedDate: '2027-01-19' },
      { id: 'R9', salesOrderId: 'SO1', siteId: 'S9', mode: 'none', requestedAt: null },
      { id: 'R3', salesOrderId: 'SO3', siteId: 'S1', mode: 'install', requestedAt: '2026-12-16T03:00:00Z', requestedDate: '2027-01-19' },
    ],
    requestZones: [{ requestId: 'R1', zoneId: 'Z1' }, { requestId: 'R2', zoneId: 'Z3' }, { requestId: 'R3', zoneId: 'Z1' }],
    visits: [{ id: 'V2', installRequestId: 'R2', status: 'scheduled' }],
    visitZonesByVisitId: { V2: ['Z3'] },
  });
  assert.deepEqual(rows.map((r) => [r.siteCode, r.stage]), [['ST-01', 'awaiting_deposit']]);
  assert.match(rows[0].deposit.text, /มัดจำ 30% — แจ้งชำระแล้ว รอบัญชีรับรอง/);
  assert.doesNotMatch(rows[0].deposit.text, /฿|\d{2},\d{3}/, '🔒 ไม่มียอดเงิน');
});

test('แถว: เลือกติดตั้งแต่ยังไม่ขอวัน = รอฝ่ายขายขอคิว · ทุกขั้นในแท็บมีป้ายกลุ่ม', () => {
  const data = base();
  const rows = installQueueRows({ ...data, requests: [{ id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: null }] });
  assert.equal(rows.find((r) => r.siteCode === 'ST-01').stage, 'not_requested');
  for (const s of INSTALL_QUEUE_STAGES) assert.ok(INSTALL_QUEUE_GROUP_LABELS[s], s);
});
