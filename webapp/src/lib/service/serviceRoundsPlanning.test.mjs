// ── จำนวนรอบที่ขายไว้ ↔ ความถี่ที่ TS ตั้ง (PR-D · mig 0326) ─────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateVisitCount } from './rounds.js';
import { planQueue } from './intake.js';
import { serviceRoundsSold } from '@/lib/sales/serviceOrders.js';

test('ผลรวมรอบที่ขาย: null = ยังไม่ระบุ ไม่ใช่ศูนย์', () => {
  assert.equal(serviceRoundsSold([]), null);
  assert.equal(serviceRoundsSold([{ serviceRounds: null }, { serviceRounds: null }]), null);
  assert.equal(serviceRoundsSold([{ serviceRounds: 12 }, { serviceRounds: 6 }]), 18);
  // บรรทัดที่ยังไม่กรอกปนอยู่ = บวกเฉพาะที่กรอก ไม่ทำให้ทั้งใบกลายเป็นยังไม่ระบุ
  assert.equal(serviceRoundsSold([{ serviceRounds: 12 }, { serviceRounds: null }]), 12);
  // ค่าเพี้ยนที่หลุดมาจากฐานเก่า/มือ = ไม่นับ (DB มี CHECK แต่โค้ดต้องไม่ระเบิด)
  assert.equal(serviceRoundsSold([{ serviceRounds: 0 }, { serviceRounds: -3 }]), null);
});

test('ประมาณจำนวนนัด: นับรวมนัดแรกที่วันเริ่มรอบ', () => {
  // 1 ม.ค. – 31 ธ.ค. ทุก 30 วัน = 365 วัน / 30 = 12 ครบ + นัดแรก = 13
  assert.equal(estimateVisitCount({ startDate: '2026-01-01', endDate: '2026-12-31', everyDays: 30 }), 13);
  assert.equal(estimateVisitCount({ startDate: '2026-01-01', endDate: '2026-01-01', everyDays: 30 }), 1);
  assert.equal(estimateVisitCount({ startDate: '2026-01-01', endDate: '2026-06-30', everyDays: 30 }), 7);  // 180 วัน / 30 = 6 ครบ + นัดแรก
});

test('ไม่มีวันสิ้นสุด/ความถี่ผิด = ตอบ null ไม่ใช่เดาให้เป็นหนึ่งปี', () => {
  // ⚠️ ตัวเลขที่เดาให้จะดูเหมือนจริงทันที — รอบปลายเปิดต้องไม่มีตัวเลขประมาณ
  assert.equal(estimateVisitCount({ startDate: '2026-01-01', endDate: '', everyDays: 30 }), null);
  assert.equal(estimateVisitCount({ startDate: '', endDate: '2026-12-31', everyDays: 30 }), null);
  assert.equal(estimateVisitCount({ startDate: '2026-01-01', endDate: '2026-12-31', everyDays: 0 }), null);
  // ปลายก่อนต้น = ข้อมูลผิด ไม่ใช่ศูนย์นัด
  assert.equal(estimateVisitCount({ startDate: '2026-12-31', endDate: '2026-01-01', everyDays: 30 }), null);
});

test('คิววางรอบ: รวมรอบเฉพาะ term ที่ใบแม่ยังมีผล', () => {
  const zones = [{ id: 'ZN1', siteId: 'ST1', name: 'Lobby' }];
  const sites = [{ id: 'ST1', name: 'ไซต์ A' }];
  const ordersById = new Map([
    ['SO1', { id: 'SO1', status: 'approved', supersededById: null }],
    // ใบที่ถูก Rev. ทับ — term ยังค้างในฐาน (ตารางไม่มีคอลัมน์สถานะโดยเจตนา)
    ['SO0', { id: 'SO0', status: 'approved', supersededById: 'SO1' }],
  ]);
  const terms = [
    { id: 'T1', zoneId: 'ZN1', salesOrderId: 'SO1', salesOrderLineId: 'L1' },
    { id: 'T0', zoneId: 'ZN1', salesOrderId: 'SO0', salesOrderLineId: 'L0' },
  ];
  const linesById = new Map([
    ['L1', { id: 'L1', serviceRounds: 12 }],
    ['L0', { id: 'L0', serviceRounds: 99 }],
  ]);
  const rows = planQueue({ zones, terms, plans: [], sites, ordersById, linesById, todayIso: '2026-08-31' });
  assert.equal(rows.length, 1);
  // ⚠️ 111 = บวกใบที่ถูก Rev. ทับเข้ามาด้วย ซึ่งคือการนับรอบซ้ำของสัญญาที่ต่อกัน
  assert.equal(rows[0].roundsSold, 12);
});

test('คิววางรอบ: ไม่ส่ง linesById = ยังไม่ระบุ (null) ไม่ใช่ศูนย์', () => {
  const zones = [{ id: 'ZN1', siteId: 'ST1', name: 'Lobby' }];
  const rows = planQueue({
    zones,
    terms: [{ id: 'T1', zoneId: 'ZN1', salesOrderId: 'SO1', salesOrderLineId: 'L1' }],
    plans: [], sites: [{ id: 'ST1', name: 'ไซต์ A' }],
    ordersById: new Map([['SO1', { id: 'SO1', status: 'approved', supersededById: null }]]),
    todayIso: '2026-08-31',
  });
  assert.equal(rows[0].roundsSold, null);
});
