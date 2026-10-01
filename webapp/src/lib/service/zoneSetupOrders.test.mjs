// ตัวติดป้าย "ใบที่ถือโซนไว้แต่ยังไม่เปิดงานบริการ" (PR-C · C-D17) — ตรวจสถานะก่อน ตราประทับทีหลัง
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pendingOrderTagText,
  pendingSetupOrdersByZone,
  setupOrderChipText,
  setupOrderState,
  zoneDeactivateWarning,
} from './zoneSetupOrders.js';
import * as text from './zoneSetupOrderText.js';

const STAMP = '2026-09-29T03:00:00Z';
const so = (id, over = {}) => ({
  id,
  orderNumber: `SO-${id}`,
  status: 'draft',
  supersededById: null,
  serviceTermsOpenedAt: null,
  serviceSetupState: null,
  origin: 'pipeline',
  dealId: null,
  ...over,
});

test('ใบที่ยังไม่อนุมัติ 4 สถานะ → กลุ่ม unapproved ป้ายสถานะของระบบ', () => {
  for (const [status, label] of [
    ['draft', 'ฉบับร่าง'],
    ['pending_approval', 'รออนุมัติ'],
    ['rejected', 'ตีกลับ'],
    ['approval_revoked', 'ย้อนการอนุมัติแล้ว'],
  ]) {
    assert.deepEqual(setupOrderState(so('A', { status })), { group: 'unapproved', key: status, label }, status);
  }
});

/* 🔑 ย้อนการอนุมัติไม่ล้างตราประทับ (คืนร่างเท่านั้นที่ล้าง) — ถามตราก่อน = ใบที่ย้อนแล้วหลุดป้าย */
test('🔑 ย้อนการอนุมัติที่ยังมีตราประทับ → ยังเป็นกลุ่ม unapproved (สถานะมาก่อนตรา)', () => {
  assert.deepEqual(
    setupOrderState(so('A', { status: 'approval_revoked', serviceTermsOpenedAt: STAMP })),
    { group: 'unapproved', key: 'approval_revoked', label: 'ย้อนการอนุมัติแล้ว' },
  );
  assert.equal(setupOrderState(so('A', { status: 'draft', serviceTermsOpenedAt: STAMP })).group, 'unapproved');
});

test('ใบอนุมัติแล้ว ยังไม่ประทับ (ตั้งย้อนหลัง) → กลุ่ม backfill สามสถานะ', () => {
  const approved = { status: 'approved' };
  assert.deepEqual(setupOrderState(so('B', approved)), { group: 'backfill', key: 'editing', label: 'ฝ่ายขายกำลังตั้ง' });
  assert.deepEqual(setupOrderState(so('B', { ...approved, serviceSetupState: 'submitted' })),
    { group: 'backfill', key: 'submitted', label: 'รอผู้จัดการตรวจ' });
  assert.deepEqual(setupOrderState(so('B', { ...approved, serviceSetupState: 'rejected' })),
    { group: 'backfill', key: 'rejected', label: 'ตีกลับ' });
  // มีรายการโซนแล้ว = ฝ่ายขายเริ่มตั้งแล้ว ⇒ ไม่มีวัน "ยังไม่เริ่ม"
  assert.equal(setupOrderState(so('B', { ...approved, serviceSetupState: 'editing' })).key, 'editing');
});

/* ตรวจทาน ui-zone-chip-reopened-label: ใบที่เปิดแก้หลังอนุมัติ (mig 0396) ตกเข้าเส้นตั้งย้อนหลัง (อนุมัติ · ไม่มีตรา) แต่ป้ายต้องบอกว่า "แก้หลังอนุมัติ"
   — คำเดียวกับแท็บ TS "ฝ่ายขายกำลังแก้ (หลังอนุมัติ)" · อนุมัติใหม่แล้ว (มีตรา) คอลัมน์ค้างเป็นประวัติ = ไม่มีป้าย */
test('ใบที่เปิดแก้หลังอนุมัติ → กลุ่ม reopened ป้าย "ฝ่ายขายกำลังแก้" / รอผู้จัดการตรวจ / ตีกลับ · อนุมัติใหม่แล้ว = ไม่มีป้าย', () => {
  const reopened = { status: 'approved', serviceSetupReopenedAt: '2026-09-30T03:15:00Z' };
  assert.deepEqual(setupOrderState(so('R', reopened)), { group: 'reopened', key: 'editing', label: 'ฝ่ายขายกำลังแก้' });
  assert.deepEqual(setupOrderState(so('R', { ...reopened, serviceSetupState: 'submitted' })),
    { group: 'reopened', key: 'submitted', label: 'รอผู้จัดการตรวจ' });
  assert.deepEqual(setupOrderState(so('R', { ...reopened, serviceSetupState: 'rejected' })),
    { group: 'reopened', key: 'rejected', label: 'ตีกลับ' });
  assert.equal(setupOrderState(so('R', { ...reopened, serviceTermsOpenedAt: STAMP })), null, 'อนุมัติงานบริการใหม่แล้ว');
  assert.equal(setupOrderState(so('R', { ...reopened, status: 'approval_revoked' })).group, 'unapproved', 'สถานะมาก่อน');
  // เรียงหลังกลุ่มตั้งย้อนหลัง
  const orders = new Map([['R', so('R', { ...reopened, orderNumber: 'SO-1' })], ['B', so('B', { status: 'approved', orderNumber: 'SO-9' })]]);
  const map = pendingSetupOrdersByZone({ allocations: [{ salesOrderId: 'R', zoneId: 'Z' }, { salesOrderId: 'B', zoneId: 'Z' }], ordersById: orders });
  assert.deepEqual(map.get('Z').map((o) => [o.orderId, o.group]), [['B', 'backfill'], ['R', 'reopened']]);
});

test('ไม่มีป้าย: ประทับแล้ว · ยกเลิก · ถูก Rev. ทับ · ใบย้อนหลังที่อนุมัติแล้ว · ไม่มีใบ', () => {
  assert.equal(setupOrderState(so('C', { status: 'approved', serviceTermsOpenedAt: STAMP })), null);
  assert.equal(setupOrderState(so('C', { status: 'cancelled' })), null);
  assert.equal(setupOrderState(so('C', { status: 'revised', supersededById: 'D' })), null);
  assert.equal(setupOrderState(so('C', { status: 'approved', supersededById: 'D' })), null);
  assert.equal(setupOrderState(so('C', { status: 'approved', origin: 'historical' })), null);
  assert.equal(setupOrderState(null), null);
  assert.equal(setupOrderState(undefined), null);
});

const ORDERS = [
  so('S1', { orderNumber: 'SO-26100011-0', status: 'draft', dealId: 'D1' }),
  so('S2', { orderNumber: 'SO-26080036-0', status: 'approved', dealId: 'D2' }),
  so('S3', { orderNumber: 'SO-26100002-0', status: 'pending_approval', dealId: null }),
  so('S4', { orderNumber: 'SO-26090247-0', status: 'approved', serviceTermsOpenedAt: STAMP }),
  so('S5', { orderNumber: 'SO-26010001-0', status: 'cancelled' }),
];
const ordersById = new Map(ORDERS.map((o) => [o.id, o]));
const dealsById = new Map([['D1', { id: 'D1', ownerName: 'สมชาย' }], ['D2', { id: 'D2', ownerName: null }]]);

test('รวบต่อโซน — หนึ่งแถวต่อ (โซน × ใบ) · เรียงกลุ่มแล้วเลขที่ · ชื่อ AE จากดีล', () => {
  const allocations = [
    { id: 'L1', salesOrderId: 'S1', zoneId: 'Z1' },
    { id: 'L2', salesOrderId: 'S1', zoneId: 'Z1' },   // ใบเดียวกันสองบรรทัด → แถวเดียว
    { id: 'L3', salesOrderId: 'S2', zoneId: 'Z1' },
    { id: 'L4', salesOrderId: 'S3', zoneId: 'Z1' },
    { id: 'L5', salesOrderId: 'S4', zoneId: 'Z1' },   // ประทับแล้ว → ไม่มีป้าย
    { id: 'L6', salesOrderId: 'S5', zoneId: 'Z2' },   // ยกเลิก → ไม่มีป้าย
    { id: 'L7', salesOrderId: 'S1', zoneId: 'Z3' },
    { id: 'L8', salesOrderId: 'MISSING', zoneId: 'Z3' },
  ];
  const map = pendingSetupOrdersByZone({ allocations, ordersById, dealsById });
  assert.ok(map instanceof Map);
  assert.deepEqual([...map.keys()].sort(), ['Z1', 'Z3'], 'โซนที่ไม่มีใบค้างต้องไม่มีคีย์');
  assert.deepEqual(map.get('Z1'), [
    { orderId: 'S3', orderNumber: 'SO-26100002-0', status: 'pending_approval', group: 'unapproved', stateLabel: 'รออนุมัติ', ownerName: null },
    { orderId: 'S1', orderNumber: 'SO-26100011-0', status: 'draft', group: 'unapproved', stateLabel: 'ฉบับร่าง', ownerName: 'สมชาย' },
    { orderId: 'S2', orderNumber: 'SO-26080036-0', status: 'approved', group: 'backfill', stateLabel: 'ฝ่ายขายกำลังตั้ง', ownerName: null },
  ]);
  assert.deepEqual(map.get('Z3').map((o) => o.orderId), ['S1']);
});

test('ไม่ส่งดีลมา = ชื่อ AE เป็น null · รับ Map หรืออ็อบเจกต์ · ไม่มีรายการ = Map ว่าง', () => {
  const allocations = [{ id: 'L1', salesOrderId: 'S1', zoneId: 'Z1' }];
  assert.equal(pendingSetupOrdersByZone({ allocations, ordersById }).get('Z1')[0].ownerName, null);
  const asObject = Object.fromEntries(ordersById);
  assert.equal(pendingSetupOrdersByZone({ allocations, ordersById: asObject }).get('Z1')[0].orderId, 'S1');
  assert.equal(pendingSetupOrdersByZone({}).size, 0);
  assert.equal(pendingSetupOrdersByZone().size, 0);
});

test('ตัวสร้างข้อความส่งต่อจากไฟล์ข้อความตัวเดียวกัน (ผู้เรียกฝั่ง server import ที่เดียว)', () => {
  assert.equal(pendingOrderTagText, text.pendingOrderTagText);
  assert.equal(zoneDeactivateWarning, text.zoneDeactivateWarning);
  assert.equal(setupOrderChipText, text.setupOrderChipText);
});
