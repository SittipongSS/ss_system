// ข้อความของ "ใบที่ถือโซนไว้แต่ยังไม่เปิดงานบริการ" (PR-C · C-D17/C-D18/C-D19) — ตัวสร้างข้อความล้วน ไม่มี import
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SETUP_ORDER_GROUP,
  pendingOrderTagText,
  setupOrderChipText,
  zoneDeactivateWarning,
} from './zoneSetupOrderText.js';

const draft = { orderId: 'SOR-1', orderNumber: 'SO-26100011-0', status: 'draft', group: 'unapproved', stateLabel: 'ฉบับร่าง', ownerName: 'สมชาย' };
const pending = { orderId: 'SOR-2', orderNumber: 'SO-26100012-0', status: 'pending_approval', group: 'unapproved', stateLabel: 'รออนุมัติ', ownerName: null };
const backfill = { orderId: 'SOR-3', orderNumber: 'SO-26080036-0', status: 'approved', group: 'backfill', stateLabel: 'ฝ่ายขายกำลังตั้ง', ownerName: 'สมหญิง' };
const review = { orderId: 'SOR-4', orderNumber: 'SO-26080040-0', status: 'approved', group: 'backfill', stateLabel: 'รอผู้จัดการตรวจ', ownerName: null };

/* 🔴 ไฟล์นี้ถูกมัดรวมเข้าหน้าจัดคิวและโมดัลโซน (critique L9) — import อะไรเข้ามา = ลากทั้งกราฟ serviceSetup ตามมา */
test('ไฟล์ข้อความไม่มี import เลย', () => {
  const src = readFileSync(new URL('./zoneSetupOrderText.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /^\s*import\b/m);
  assert.doesNotMatch(src, /\bimport\s*\(/);
  assert.doesNotMatch(src, /\brequire\(/);
});

test('กลุ่มมีสามค่า (ยังไม่อนุมัติ · ตั้งย้อนหลัง · แก้หลังอนุมัติของ 0396) และแช่แข็ง', () => {
  assert.deepEqual({ ...SETUP_ORDER_GROUP }, { unapproved: 'unapproved', backfill: 'backfill', reopened: 'reopened' });
  assert.equal(Object.isFrozen(SETUP_ORDER_GROUP), true);
});

/* ตรวจทาน ui-zone-chip-reopened-label: ใบที่เปิดแก้หลังอนุมัติ (mig 0396) ไม่ใช่ "ตั้งย้อนหลัง" — คำเดียวกับแท็บ TS "ฝ่ายขายกำลังแก้ (หลังอนุมัติ)" */
const reopened = { orderId: 'SOR-5', orderNumber: 'SO-26090247-0', status: 'approved', group: 'reopened', stateLabel: 'ฝ่ายขายกำลังแก้', ownerName: 'สมหญิง' };
test('ใบที่เปิดแก้หลังอนุมัติ — ป้ายแถวโซน/คำเตือน/ชิปด่านนัด พูด "แก้หลังอนุมัติ" ไม่ใช่ "ตั้งย้อนหลัง"', () => {
  assert.equal(pendingOrderTagText([reopened]), 'อยู่ในใบที่กำลังแก้งานบริการหลังอนุมัติ: SO-26090247-0 (ฝ่ายขายกำลังแก้)');
  assert.equal(pendingOrderTagText([reopened, draft, backfill]),
    'อยู่ในใบที่ยังไม่อนุมัติ: SO-26100011-0 (ฉบับร่าง)'
    + ' · อยู่ในใบที่กำลังตั้งงานบริการย้อนหลัง: SO-26080036-0 (ฝ่ายขายกำลังตั้ง)'
    + ' · อยู่ในใบที่กำลังแก้งานบริการหลังอนุมัติ: SO-26090247-0 (ฝ่ายขายกำลังแก้)');
  assert.equal(setupOrderChipText(reopened), 'ใบสั่งขาย SO-26090247-0 · แก้หลังอนุมัติ · ฝ่ายขายกำลังแก้ · สมหญิง');
  assert.match(zoneDeactivateWarning([reopened]), /SO-26090247-0 \(แก้หลังอนุมัติ · ฝ่ายขายกำลังแก้\)/);
  for (const t of [pendingOrderTagText([reopened]), setupOrderChipText(reopened), zoneDeactivateWarning([reopened])]) {
    assert.doesNotMatch(t, /ตั้งย้อนหลัง/, t);
  }
});

test('ป้ายบนแถวโซน — กลุ่มใบที่ยังไม่อนุมัติ', () => {
  assert.equal(pendingOrderTagText([draft]), 'อยู่ในใบที่ยังไม่อนุมัติ: SO-26100011-0 (ฉบับร่าง)');
  assert.equal(pendingOrderTagText([draft, pending]),
    'อยู่ในใบที่ยังไม่อนุมัติ: SO-26100011-0 (ฉบับร่าง) · SO-26100012-0 (รออนุมัติ)');
});

test('ป้ายบนแถวโซน — ใบอนุมัติแล้วที่กำลังตั้งย้อนหลังไม่ถูกเรียกว่า "ยังไม่อนุมัติ"', () => {
  assert.equal(pendingOrderTagText([backfill, review]),
    'อยู่ในใบที่กำลังตั้งงานบริการย้อนหลัง: SO-26080036-0 (ฝ่ายขายกำลังตั้ง) · SO-26080040-0 (รอผู้จัดการตรวจ)');
});

test('ป้ายบนแถวโซน — สองกลุ่มปนกัน ต่อกันด้วย " · " กลุ่มยังไม่อนุมัติก่อน', () => {
  assert.equal(pendingOrderTagText([draft, backfill, pending]),
    'อยู่ในใบที่ยังไม่อนุมัติ: SO-26100011-0 (ฉบับร่าง) · SO-26100012-0 (รออนุมัติ)'
    + ' · อยู่ในใบที่กำลังตั้งงานบริการย้อนหลัง: SO-26080036-0 (ฝ่ายขายกำลังตั้ง)');
});

test('ไม่มีใบ = null (ไม่วาดป้าย)', () => {
  assert.equal(pendingOrderTagText([]), null);
  assert.equal(pendingOrderTagText(), null);
  assert.equal(pendingOrderTagText(null), null);
  assert.equal(zoneDeactivateWarning([]), null);
  assert.equal(zoneDeactivateWarning(undefined), null);
});

test('คำเตือนตอนปิดใช้งานโซน — ใบตั้งย้อนหลังมีคำนำ "ตั้งย้อนหลัง ·"', () => {
  assert.equal(zoneDeactivateWarning([draft, backfill]),
    'โซนนี้อยู่ในใบที่ยังไม่เปิดงานบริการ: SO-26100011-0 (ฉบับร่าง) · SO-26080036-0 (ตั้งย้อนหลัง · ฝ่ายขายกำลังตั้ง)'
    + ' — ปิดแล้วใบนั้นจะยื่น/อนุมัติ/ตรวจผ่านไม่ได้จนกว่าฝ่ายขายเปลี่ยนโซน');
  assert.equal(zoneDeactivateWarning([pending]),
    'โซนนี้อยู่ในใบที่ยังไม่เปิดงานบริการ: SO-26100012-0 (รออนุมัติ)'
    + ' — ปิดแล้วใบนั้นจะยื่น/อนุมัติ/ตรวจผ่านไม่ได้จนกว่าฝ่ายขายเปลี่ยนโซน');
});

test('ชิปใบสั่งขาย (ด่านนัด D15) — มี/ไม่มีชื่อ AE · ใบตั้งย้อนหลังมีคำนำ', () => {
  assert.equal(setupOrderChipText(draft), 'ใบสั่งขาย SO-26100011-0 · ฉบับร่าง · สมชาย');
  assert.equal(setupOrderChipText(pending), 'ใบสั่งขาย SO-26100012-0 · รออนุมัติ');
  assert.equal(setupOrderChipText(backfill), 'ใบสั่งขาย SO-26080036-0 · ตั้งย้อนหลัง · ฝ่ายขายกำลังตั้ง · สมหญิง');
  assert.equal(setupOrderChipText(review), 'ใบสั่งขาย SO-26080040-0 · ตั้งย้อนหลัง · รอผู้จัดการตรวจ');
});
