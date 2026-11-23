// มติเจ้าของ 23/11/2026 (ถามทีละข้อ) — ปุ่มหลัก "อนุมัติ" · โมดัลอนุมัติใบค่าสรรพสามิตโชว์สามแผ่นแบบล็อก
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { EXCISE_ACTUAL_LOCK_REASON, actualModeTileNotes, actualModeTileOptions } from './actualModeTiles.js';

const PAGE = '../../app/sales-planning/sales-orders/[id]/page.js';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('ใบปกติ: สามแผ่นตามลำดับ ไม่นับ · เต็ม · รายงวด · แผ่นที่เลือกไม่ได้ดับพร้อมเหตุ', () => {
  const opts = actualModeTileOptions({ eligibility: { eligible: true }, noneEligibility: { eligible: true } });
  assert.deepEqual(opts.map((o) => o.value), ['none', 'order', 'installment']);
  assert.deepEqual(opts.map((o) => Boolean(o.disabled)), [false, false, false]);
  const blocked = actualModeTileOptions({
    eligibility: { eligible: false, reason: 'ใบนี้มีงวดชำระงวดเดียว' },
    noneEligibility: { eligible: false, reason: 'ใบย้อนหลัง' },
  });
  assert.deepEqual(blocked.map((o) => Boolean(o.disabled)), [true, false, true]);
  assert.deepEqual(actualModeTileNotes({
    eligibility: { eligible: false, reason: 'ใบนี้มีงวดชำระงวดเดียว' },
    noneEligibility: { eligible: false, reason: 'ใบย้อนหลัง' },
  }), ['ใบย้อนหลัง', 'ใบนี้มีงวดชำระงวดเดียว']);
  const countRest = actualModeTileOptions({ eligibility: { eligible: true, countRestDone: true }, noneEligibility: { eligible: true } });
  assert.match(countRest[2].description, /มติข้อ 10/);
});

test('ล็อก (ใบค่าสรรพสามิต): "ไม่นับ" เปิดอยู่ · เต็ม/รายงวดดับ · เหตุบรรทัดเดียว', () => {
  const opts = actualModeTileOptions({ lockedReason: EXCISE_ACTUAL_LOCK_REASON });
  assert.deepEqual(opts.map((o) => o.value), ['none', 'order', 'installment']);
  assert.deepEqual(opts.map((o) => Boolean(o.disabled)), [false, true, true]);
  assert.match(opts[0].description, /ใบค่าสรรพสามิตไม่นับ Actual โดยที่มา — ไม่ต้องใส่เหตุผล/);
  assert.deepEqual(actualModeTileNotes({ lockedReason: EXCISE_ACTUAL_LOCK_REASON }), ['ใบค่าสรรพสามิตไม่นับ Actual — เลือกแบบอื่นไม่ได้']);
});

test('หน้าใบ: ปุ่มหลักบนการ์ดจัดการ = "อนุมัติ" (โมดัลบอกแบบที่เลือกที่ปุ่มยืนยัน)', () => {
  const page = stripComments(read(PAGE));
  assert.match(page, /\{ id: "approve", kind: "approve", label: "อนุมัติ", onClick: \(\) => review\("approve"\) \}/);
  assert.doesNotMatch(page, /label: "อนุมัติและนับ Actual"/);
});

test('หน้าใบ: ใบค่าสรรพสามิตเห็นสามแผ่นล็อก ทั้งโมดัลปกติและ Admin Override · ปุ่มยืนยันพูด "ไม่นับ Actual" · ค่าที่ส่งยังเป็น order', () => {
  const page = stripComments(read(PAGE));
  // ActualModeChoice ใช้ตัวคิดแผ่นกลาง (ไม่เขียนชุดแผ่นซ้ำในหน้า)
  assert.match(page, /options=\{actualModeTileOptions\(\{ eligibility, noneEligibility, lockedReason \}\)\}/);
  assert.match(page, /actualModeTileNotes\(\{ eligibility, noneEligibility, lockedReason \}\)/);
  // โมดัลปกติ: ใบค่าสรรพสามิตได้ actualLocked → วาดแผ่นล็อก + กล่องขนาด md
  assert.match(page, /actualLocked: isExciseOrder\(order\)/);
  assert.match(page, /size=\{confirmState\?\.actualModes \|\| confirmState\?\.actualLocked \? "md" : undefined\}/);
  assert.match(page, /value=\{ACTUAL_MODE_NONE\}\s*lockedReason=\{EXCISE_ACTUAL_LOCK_REASON\}/);
  // ปุ่มยืนยันของใบค่าสรรพสามิต = "อนุมัติ (ไม่นับ Actual)" — เดิมได้ "อนุมัติและนับ Actual" ของแผ่นเต็ม (พูดผิด)
  assert.match(page, /confirmLabel: isExciseOrder\(order\) \|\| mode === ACTUAL_MODE_NONE \? APPROVE_CONFIRM_NONE_LABEL/);
  // Admin Override: ใบค่าสรรพสามิตก็เห็นแผ่นล็อก
  assert.match(page, /overridePlan\?\.choice \? \([\s\S]{0,700}?\) : exciseOrder \? \(\s*<ActualModeChoice value=\{ACTUAL_MODE_NONE\} lockedReason=\{EXCISE_ACTUAL_LOCK_REASON\}/);
  // ค่าที่ส่ง API ของใบค่าสรรพสามิตไม่เปลี่ยน: แผ่นล็อกไม่ได้ผูก onChange / ref ของแบบ (initialMode ของใบค่าสรรพสามิต = order)
  assert.match(page, /choice: !isExciseOrder\(order\)/);
});
