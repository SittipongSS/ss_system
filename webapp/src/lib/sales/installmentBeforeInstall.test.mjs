// ── ธง "ก่อนติดตั้ง" ของงวด (mig 0425 · ขั้นเข้าติดตั้ง PR-2a) ─────────────────────────────────────
//
// ⭐ มติเจ้าของ 09/11/2026: ก่อนติดตั้งมีด่านเดียว = งวด "ก่อนติดตั้ง" ที่บัญชีรับรองแล้ว · ฝ่ายขายเป็นเจ้าของธง
//    แก้ได้จนบัญชีรับรอง (ฐานกันอีกชั้นด้วย trigger) · ทั้งเส้นอยู่หลังสวิตช์ SERVICE_INSTALL_STEP
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installmentActionError } from './salesOrderPayments.js';
import { installStepEnabled } from '../service/installStepFlag.js';

const SA = { id: 'u-sa', role: 'ae' };
const FN = { id: 'u-fn', role: 'finance', department: 'FN' };
const ORDER = { id: 'SO-1', status: 'approved', totalAmount: 108000, origin: 'pipeline' };
const ROW = { id: 'I1', seq: 1, label: 'มัดจำ 30%', amount: 32400, status: 'pending', beforeInstall: false };
const ON = { installStepEnabled: true, serviceRounds: true, order: ORDER, orderTotal: ORDER.totalAmount };
const gate = (row, user, over = {}) => installmentActionError(row, 'before-install', user, { ...ON, ...over });

test('ตั้งงวดก่อนติดตั้ง: ฝ่ายขายตั้ง/เอาออกได้จนบัญชีรับรอง (reported ยังแก้ได้)', () => {
  assert.equal(gate(ROW, SA), null);
  assert.equal(gate({ ...ROW, status: 'reported' }, SA), null);
  assert.equal(gate({ ...ROW, beforeInstall: true }, SA), null);
  assert.match(gate({ ...ROW, status: 'confirmed', beforeInstall: true }, SA), /บัญชีรับรองแล้ว/);
});

test('ตั้งงวดก่อนติดตั้ง: สวิตช์ปิด/ไม่ส่ง = ปิด · ใบย้อนหลัง · ใบไม่ใช่สายบริการ · ยังไม่อนุมัติ · ยอด 0', () => {
  assert.match(gate(ROW, SA, { installStepEnabled: false }), /ยังไม่เปิดใช้/);
  assert.match(installmentActionError(ROW, 'before-install', SA, { serviceRounds: true, order: ORDER }), /ยังไม่เปิดใช้/);
  assert.match(gate(ROW, SA, { historical: true }), /ย้อนหลัง/);
  assert.match(gate(ROW, SA, { serviceRounds: false }), /สายบริการ/);
  assert.match(gate(ROW, SA, { order: { ...ORDER, status: 'pending' } }), /หลังใบสั่งขายอนุมัติ/);
  assert.match(gate(ROW, SA, { orderTotal: 0, order: { ...ORDER, totalAmount: 0 } }), /0 บาท/);
});

test('ตั้งงวดก่อนติดตั้ง: ล็อกทั้งใบชนะก่อน (ใบยกเลิก/ถูกออก Rev. ทับ)', () => {
  assert.equal(gate(ROW, SA, { orderLock: 'ใบนี้ถูกยกเลิก' }), 'ใบนี้ถูกยกเลิก');
});

test('ตั้งงวดก่อนติดตั้ง: ฝ่ายบัญชีไม่ใช่เจ้าของธง (ไม่มี salesplan:edit)', () => {
  assert.match(gate(ROW, FN), /ไม่มีสิทธิ์/);
});

test('สวิตช์ SERVICE_INSTALL_STEP: เปิดด้วย "on" คำเดียว — ค่าอื่นทุกค่า = ปิด', () => {
  const before = process.env.SERVICE_INSTALL_STEP;
  try {
    for (const [value, expected] of [['on', true], [' ON ', true], ['1', false], ['true', false], ['', false]]) {
      process.env.SERVICE_INSTALL_STEP = value;
      assert.equal(installStepEnabled(), expected, JSON.stringify(value));
    }
    delete process.env.SERVICE_INSTALL_STEP;
    assert.equal(installStepEnabled(), false);
  } finally {
    if (before === undefined) delete process.env.SERVICE_INSTALL_STEP; else process.env.SERVICE_INSTALL_STEP = before;
  }
});

/* ยามสายไฟ — ปุ่มบนแผงกับ API ต้องส่งสวิตช์ตัวเดียวกันเข้าด่าน · ตัวอ่านสวิตช์ห้ามหลุดไปฝั่งจอ */
const src = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('สายไฟ: route PATCH งวด + GET ใบสั่งขายอ่านสวิตช์ · แผงงวดส่งค่าจาก payload เข้าด่านเดียวกัน', () => {
  const route = src('app/api/sales-planning/sales-orders/[id]/installments/route.js');
  assert.match(route, /installStepEnabled: installStepEnabled\(\),/);
  assert.match(route, /action === 'before-install'[\s\S]{0,400}typeof body\.beforeInstall !== 'boolean'/);
  assert.match(route, /patch = \{ beforeInstall: body\.beforeInstall \};/);
  const get = src('app/api/sales-planning/sales-orders/[id]/route.js');
  assert.match(get, /installStepEnabled: installStepEnabled\(\),/);
  const panel = src('components/salesPlanning/SalesOrderPaymentPanel.js');
  assert.match(panel, /installStepEnabled: order\?\.installStepEnabled === true,/);
  assert.match(panel, /!gate\(row, "before-install"\) && \{/);
  assert.doesNotMatch(panel, /installStepFlag|SERVICE_INSTALL_STEP/, 'ตัวอ่านสวิตช์ import ได้เฉพาะใต้ api/');
});
