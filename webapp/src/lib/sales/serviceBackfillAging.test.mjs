// ── "ค้าง n วัน" ของเส้นตั้งงานบริการย้อนหลัง — เลขคณิตของวัน · ระดับ/โทน · คำ · ตัวเรียง (มติเจ้าของ 08/10 "ตามงานค้าง") ──
//
// ⚠️ ไฟล์นี้ต้องผ่านทั้ง `npm test` และ `TZ=UTC npm test` — วันต้องเป็นวันไทยเสมอ ไม่ว่าเครื่องตั้งโซนเวลาอะไร
//   (ทุกเคสส่ง "วันนี้" เข้าไปเอง ไม่มีตัวไหนอ่านนาฬิกาของเครื่อง)
// ตัวตัดสิน "ใครถืองาน · นาฬิกาเริ่มเมื่อไร" (ตาราง 16 แถว) อยู่ที่ serviceSetup.test.mjs — ไฟล์นี้ทดสอบชั้นใบไม้ล้วน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SERVICE_AGING_LONG_DAYS,
  SERVICE_AGING_WARN_DAYS,
  SERVICE_BACKFILL_AGING_TEXT,
  compareLongestWaiting,
  latestTimestamp,
  longestWaitingFirst,
  serviceAgingDays,
  serviceAgingOf,
  serviceAgingSummaryText,
} from './serviceBackfillAging.js';
import { STATUS_TONES } from '../ui/tone.js';

const SOURCE = readFileSync(new URL('./serviceBackfillAging.js', import.meta.url), 'utf8');
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TODAY = '2026-10-08';

/* จุดเวลาเที่ยงวันไทยของวันที่อยู่ก่อน `TODAY` n วัน — เลี่ยงขอบเที่ยงคืนในเคสที่ไม่ได้ทดสอบขอบ */
const daysAgo = (n, today = TODAY) => new Date(Date.parse(`${today}T05:00:00Z`) - n * 86400000).toISOString();

test('จำนวนวัน = ผลต่างของวันในปฏิทินไทย: ข้ามสิ้นเดือน · ข้ามปี (สองฝั่งของเที่ยงคืนไทย) · กุมภาพันธ์ปีอธิกสุรทิน', () => {
  // สิ้นเดือน 30 วัน และ 31 วัน
  assert.equal(serviceAgingDays('2026-09-30T05:00:00Z', '2026-10-01'), 1);
  assert.equal(serviceAgingDays('2026-08-31T05:00:00Z', '2026-10-01'), 31);
  // ข้ามปี: 23:59:59 เวลาไทยของ 31/12 = เมื่อวาน · 00:00:00 เวลาไทยของ 01/01 = วันนี้
  assert.equal(serviceAgingDays('2026-12-31T16:59:59Z', '2027-01-01'), 1);
  assert.equal(serviceAgingDays('2026-12-31T17:00:00Z', '2027-01-01'), 0);
  // 2028 เป็นปีอธิกสุรทิน: 28/02 → 01/03 = 2 วัน (ผ่าน 29/02) · ปีปกติ = 1 วัน
  assert.equal(serviceAgingDays('2028-02-28T05:00:00Z', '2028-03-01'), 2);
  assert.equal(serviceAgingDays('2027-02-28T05:00:00Z', '2027-03-01'), 1);
  // ข้อมูลจริง 08/10: ใบเก่าสุดอนุมัติ 13/08 = 56 วัน · ใบที่เปิดแก้ 01/10 = 7 วัน · ใบที่ยื่นตรวจ 29/09 = 9 วัน
  assert.equal(serviceAgingDays('2026-08-13T03:00:00Z', TODAY), 56);
  assert.equal(serviceAgingDays('2026-10-01T04:00:00Z', TODAY), 7);
  assert.equal(serviceAgingDays('2026-09-29T02:00:00Z', TODAY), 9);
});

test('🔴 เที่ยงคืนไทย ≠ เที่ยงคืน UTC: 00:30 เวลาไทย (ยังเป็นเมื่อวานของ UTC) นับเป็นวันนี้ · 23:59:59 เวลาไทยนับเป็นเมื่อวาน', () => {
  // 2026-10-07T17:30:00Z = 08/10 00:30 น. เวลาไทย — ตัดสตริง ISO จะได้ 07/10 แล้วขึ้น "ค้าง 1 วัน" ทั้งที่เพิ่งมาถึงวันนี้
  assert.equal(serviceAgingDays('2026-10-07T17:30:00Z', TODAY), 0);
  assert.equal(serviceAgingOf({ waitingOn: 'sales', since: '2026-10-07T17:30:00Z' }, TODAY).sinceDay, '2026-10-08');
  // 2026-10-07T16:59:59Z = 07/10 23:59:59 น. เวลาไทย
  assert.equal(serviceAgingDays('2026-10-07T16:59:59Z', TODAY), 1);
  assert.equal(serviceAgingOf({ waitingOn: 'sales', since: '2026-10-07T16:59:59Z' }, TODAY).sinceDay, '2026-10-07');
  // จุดเวลาเดียวกันเขียนสองรูป (ฐานคืน +00:00 · เครื่องมืออื่นคืน +07:00) ได้วันเดียวกัน
  assert.equal(serviceAgingDays('2026-10-08T00:30:00+07:00', TODAY), 0);
  assert.equal(serviceAgingDays('2026-10-07T17:30:00+00:00', TODAY), 0);
  assert.equal(serviceAgingDays('2026-10-07T17:30:00.123456+00:00', TODAY), 0);
});

test('ไม่มีนาฬิกา · ไม่มีวันนี้ · อ่านไม่ออก = null (ไม่เดา) · นาฬิกาที่อยู่หลังวันนี้ = 0 ไม่ติดลบ', () => {
  for (const since of [null, undefined, '', 'not-a-date', 0, 123, {}, new Date(0)]) {
    assert.equal(serviceAgingDays(since, TODAY), null, `since ${String(since)}`);
  }
  for (const today of [null, undefined, '', '08/10/2026', '2026-10-8', '2026-10-08T00:00:00Z', '2026-13-45', 20261008]) {
    assert.equal(serviceAgingDays('2026-08-13T03:00:00Z', today), null, `today ${String(today)}`);
  }
  assert.equal(serviceAgingDays('2026-10-20T03:00:00Z', TODAY), 0, 'นาฬิกาของเครื่องเดินไม่ตรง ไม่ทำให้ติดลบ');
});

test('ระดับ/โทน: 0 = ไม่มีป้าย · 1–6 กลาง · 7–29 เตือน · ≥ 30 เตือน + จุดนำ — เกณฑ์ 7 และ 30', () => {
  assert.equal(SERVICE_AGING_WARN_DAYS, 7);
  assert.equal(SERVICE_AGING_LONG_DAYS, 30);
  const table = [
    [0, 'none', 'neutral', false, null],
    [1, 'fresh', 'neutral', false, 'ค้าง 1 วัน'],
    [6, 'fresh', 'neutral', false, 'ค้าง 6 วัน'],
    [7, 'warn', 'warning', false, 'ค้าง 7 วัน'],
    [29, 'warn', 'warning', false, 'ค้าง 29 วัน'],
    [30, 'long', 'warning', true, 'ค้าง 30 วัน'],
    [56, 'long', 'warning', true, 'ค้าง 56 วัน'],
    [365, 'long', 'warning', true, 'ค้าง 365 วัน'],
  ];
  for (const [days, level, tone, strong, label] of table) {
    const aging = serviceAgingOf({ waitingOn: 'sales', since: daysAgo(days) }, TODAY);
    assert.deepEqual([aging.days, aging.level, aging.tone, aging.strong, aging.label], [days, level, tone, strong, label], `${days} วัน`);
    assert.ok(STATUS_TONES.includes(aging.tone), 'โทนต้องเป็นโทนสถานะที่ระบบมี (ไม่ตั้งสีใหม่)');
    assert.notEqual(aging.tone, 'danger', 'งานค้างไม่ใช้แดงของข้อผิดพลาด');
  }
  // ไม่มีนาฬิกา / ไม่มีวันนี้ = ก้อนที่ไม่มีป้าย (ไม่ใช่ null — ผู้เรียกยังรู้ว่างานอยู่ที่ใคร)
  assert.deepEqual(serviceAgingOf({ waitingOn: 'sales', since: null }, TODAY), {
    waitingOn: 'sales', since: null, sinceDay: null, days: null, level: 'none', tone: 'neutral', strong: false, label: null, title: null,
  });
  const noToday = serviceAgingOf({ waitingOn: 'manager', since: '2026-09-29T02:00:00Z' });
  assert.deepEqual([noToday.days, noToday.level, noToday.label, noToday.sinceDay], [null, 'none', null, '2026-09-29']);
  assert.equal(noToday.title, 'รอผู้จัดการฝ่ายขายตรวจตั้งแต่ 29/09/2026', 'รู้วันเริ่ม = มีคำบอก แม้ไม่รู้วันนี้');
  // ค่าที่ไม่รู้จักของ waitingOn = ฝ่ายขาย (ค่าตั้งต้นของเส้นนี้) · เรียกมือเปล่าไม่พัง
  assert.equal(serviceAgingOf({ waitingOn: 'ts', since: daysAgo(3) }, TODAY).waitingOn, 'sales');
  assert.equal(serviceAgingOf().label, null);
});

test('คำ: ชิป · คำบอกเมื่อชี้ (วันไทย) · คำข้างป้ายบนแถวทะเบียน · บรรทัดสรุป · ตัวเลือกเรียง — ตามแคตตาล็อกทุกตัวอักษร', () => {
  const T = SERVICE_BACKFILL_AGING_TEXT;
  assert.equal(T.chip(56), 'ค้าง 56 วัน');
  assert.equal(T.chip(1200), 'ค้าง 1,200 วัน', 'ตัวเลขผ่าน fmtNumber');
  // 2026-10-07T17:30:00Z = 08/10 เวลาไทย — คำบอกต้องเป็นวันไทย ไม่ใช่ 07/10
  assert.equal(T.title.sales('2026-10-07T17:30:00Z'), 'ยังไม่ยื่นตรวจงานบริการ · นับจาก 08/10/2026');
  assert.equal(T.title.manager('2026-10-07T17:30:00Z'), 'รอผู้จัดการฝ่ายขายตรวจตั้งแต่ 08/10/2026');
  assert.deepEqual(T.rowLabel, { sales: 'งานบริการ · ยังไม่ยื่นตรวจ', manager: 'งานบริการ · รอผู้จัดการตรวจ' });
  assert.equal(T.sortLabel, 'งานบริการค้างนานสุด');
  assert.equal(T.summary(59), 'งานบริการที่ยังไม่ส่ง TS 59 ใบ');
  assert.equal(T.summaryLongest(56), ' · ค้างนานสุด 56 วัน');

  const sales = serviceAgingOf({ waitingOn: 'sales', since: '2026-08-13T03:00:00Z' }, TODAY);
  assert.equal(sales.title, 'ยังไม่ยื่นตรวจงานบริการ · นับจาก 13/08/2026');
  const manager = serviceAgingOf({ waitingOn: 'manager', since: '2026-09-29T02:00:00Z' }, TODAY);
  assert.deepEqual([manager.label, manager.title], ['ค้าง 9 วัน', 'รอผู้จัดการฝ่ายขายตรวจตั้งแต่ 29/09/2026']);

  // บรรทัดสรุป: จำนวนใบของคิว + ใบที่ค้างนานสุด · ไม่มีใบ = null · ไม่มีใบไหนค้างถึง 1 วัน = ไม่มีท่อนหลัง
  const agings = [sales, manager, null, serviceAgingOf({ waitingOn: 'sales', since: null }, TODAY)];
  assert.equal(serviceAgingSummaryText(59, agings), 'งานบริการที่ยังไม่ส่ง TS 59 ใบ · ค้างนานสุด 56 วัน');
  assert.equal(serviceAgingSummaryText(0, agings), null);
  assert.equal(serviceAgingSummaryText(-1, agings), null);
  assert.equal(serviceAgingSummaryText(null, agings), null);
  assert.equal(serviceAgingSummaryText(2, [serviceAgingOf({ waitingOn: 'sales', since: daysAgo(0) }, TODAY)]), 'งานบริการที่ยังไม่ส่ง TS 2 ใบ');
  assert.equal(serviceAgingSummaryText(3, []), 'งานบริการที่ยังไม่ส่ง TS 3 ใบ');
  assert.equal(serviceAgingSummaryText(3, undefined), 'งานบริการที่ยังไม่ส่ง TS 3 ใบ');
  assert.equal(serviceAgingSummaryText(1200, [{ days: 1200 }]), 'งานบริการที่ยังไม่ส่ง TS 1,200 ใบ · ค้างนานสุด 1,200 วัน');
});

/* 🔴 ผลตรวจทาน 08/10: คำของขั้น "ยังไม่ยื่นตรวจ" ต้อง **ไม่ชี้ว่างานอยู่ที่ฝ่ายขาย** — ตัวตัดสินรู้จากแถวใบแค่ว่ายื่นตรวจแล้วหรือยัง
   · ลูกค้าที่ยังไม่มีไซต์ในทะเบียน ฝ่ายขายเลือกโซนไม่ได้จนกว่า TS เพิ่มไซต์ (ข้อมูลจริง 08/10: 11 จาก 58 ใบ — รวม 4 ใน 5 ใบที่ค้างนานสุด)
     คำเดิม "งานบริการ · รอฝ่ายขาย" / "รอฝ่ายขายตั้งงานบริการตั้งแต่ …" จึงพาเจ้าของไปตามผิดคน และขัดกับคำบนแถวเดียวกันของแท็บ TS
   · "ตั้งแต่ <วันอนุมัติ>" ยังอ้างว่ามีคนถูกรอมาตั้งแต่วันนั้น ทั้งที่เส้นตั้งย้อนหลังเพิ่งเปิดใช้ 29/09 (mig 0392) ⇒ ใช้ "นับจาก"
   · ฝั่งผู้จัดการพิสูจน์ได้จากแถวใบ (ยื่นตรวจแล้ว · วันที่ยื่น) — ยังบอกชื่อผู้ถือและ "ตั้งแต่" ได้ */
test('🔴 คำของขั้นยังไม่ยื่นตรวจ บอก "ขั้น" ไม่ชี้ "คน" — ไม่มีคำว่า "ฝ่ายขาย" และไม่อ้าง "ตั้งแต่" · ฝั่งผู้จัดการยังบอกผู้ถือได้', () => {
  const T = SERVICE_BACKFILL_AGING_TEXT;
  for (const text of [T.rowLabel.sales, T.title.sales('2026-08-13T03:00:00Z')]) {
    assert.doesNotMatch(text, /ฝ่ายขาย|รอ/, text);
    assert.doesNotMatch(text, /ตั้งแต่/, text);
    assert.match(text, /ยังไม่ยื่นตรวจ/, text);
  }
  assert.match(T.title.sales('2026-08-13T03:00:00Z'), / · นับจาก 13\/08\/2026$/);
  assert.match(T.rowLabel.manager, /รอผู้จัดการตรวจ$/);
  assert.match(T.title.manager('2026-09-29T02:00:00Z'), /^รอผู้จัดการฝ่ายขายตรวจตั้งแต่ 29\/09\/2026$/);
  /* บรรทัดสรุปและตัวเลือกเรียงไม่ชี้ผู้ถือเหมือนกัน */
  for (const text of [T.summary(59), T.summaryLongest(56), T.sortLabel, T.chip(56)]) assert.doesNotMatch(text, /ฝ่ายขาย|ผู้จัดการ/, text);
});

test('คำของเรื่องนี้ไม่พูด "รอบ" (อายุของงานนับเป็นวัน ไม่เกี่ยวกับจำนวนรอบบริการ) และไม่พูดคำของข้อผิดพลาด', () => {
  const T = SERVICE_BACKFILL_AGING_TEXT;
  const texts = [
    T.chip(56), T.title.sales('2026-08-13T03:00:00Z'), T.title.manager('2026-08-13T03:00:00Z'),
    T.rowLabel.sales, T.rowLabel.manager, T.summary(59), T.summaryLongest(56), T.sortLabel,
  ];
  for (const text of texts) {
    assert.doesNotMatch(text, /รอบ/, text);
    assert.doesNotMatch(text, /ผิดพลาด|เกินกำหนด|เลยกำหนด/, text);
  }
});

test('latestTimestamp: เทียบด้วยจุดเวลา ไม่ใช่ตัวอักษร · คืนสตริงตัวเดิม · ค่าว่าง/อ่านไม่ออกถูกข้าม · ไม่มีเลย = null', () => {
  // 02:00Z < 09:30+07:00 (= 02:30Z) < 03:00+00:00 — เรียงตามตัวอักษร "…+07:00" จะชนะผิด ๆ
  const z = '2026-10-01T02:00:00Z';
  const plusSeven = '2026-10-01T09:30:00+07:00';
  const plusZero = '2026-10-01T03:00:00+00:00';
  assert.equal(latestTimestamp([z, plusSeven, plusZero]), plusZero);
  assert.equal(latestTimestamp([plusZero, plusSeven, z]), plusZero);
  assert.equal(latestTimestamp([z, plusSeven]), plusSeven);
  assert.equal(latestTimestamp([null, undefined, '', 'garbage', 0, z]), z);
  assert.equal(latestTimestamp([null, undefined, '', 'garbage']), null);
  assert.equal(latestTimestamp([]), null);
  assert.equal(latestTimestamp(undefined), null);
  // จุดเวลาเดียวกันสองรูป = ตัวแรกที่เจอ
  assert.equal(latestTimestamp(['2026-10-01T09:00:00+07:00', '2026-10-01T02:00:00Z']), '2026-10-01T09:00:00+07:00');
});

test('compareLongestWaiting: นาฬิกาที่เริ่มก่อนอยู่หน้า · ไม่มีก้อน/ไม่มีนาฬิกา/อ่านไม่ออก อยู่ท้าย · เท่ากัน = 0 · ไม่ต้องรู้วันนี้', () => {
  const at = (since) => serviceAgingOf({ waitingOn: 'sales', since });
  const old = at('2026-08-13T03:00:00Z');
  const recent = at('2026-10-01T04:00:00Z');
  assert.ok(compareLongestWaiting(old, recent) < 0);
  assert.ok(compareLongestWaiting(recent, old) > 0);
  assert.equal(compareLongestWaiting(old, at('2026-08-13T10:00:00+07:00')), 0, 'จุดเวลาเดียวกันคนละรูป');
  for (const missing of [null, undefined, at(null), { since: 'garbage' }, {}]) {
    assert.ok(compareLongestWaiting(old, missing) < 0, 'มีนาฬิกามาก่อน');
    assert.ok(compareLongestWaiting(missing, old) > 0);
    assert.equal(compareLongestWaiting(missing, null), 0);
  }
  // ค้างวันเดียวกัน (ป้ายเท่ากัน) ยังเรียงตามเวลาที่เริ่มจริง
  assert.ok(compareLongestWaiting(at('2026-10-01T02:00:00Z'), at('2026-10-01T08:00:00Z')) < 0);
});

test('longestWaitingFirst: เรียงเฉพาะแถวที่มีก้อนอายุ วางกลับช่องเดิมของแถวพวกนั้น — แถวอื่นไม่ขยับ · ลำดับเดิมคงเมื่อเท่ากัน · ไม่แก้ตัวที่ส่งมา', () => {
  const service = (id, since) => ({ id, review: true, aging: serviceAgingOf({ waitingOn: 'manager', since }, TODAY) });
  const pending = (id) => ({ id, review: false, aging: null });
  // คิวผู้จัดการ: [ใบรออนุมัติ, งานบริการ 9 วัน, ใบรออนุมัติ, งานบริการ 56 วัน, งานบริการไม่มีนาฬิกา]
  const rows = [pending('P1'), service('S9', '2026-09-29T02:00:00Z'), pending('P2'), service('S56', '2026-08-13T03:00:00Z'), service('S0', null)];
  const snapshot = rows.map((row) => row.id);
  const out = longestWaitingFirst(rows, (row) => (row.review ? row.aging : null));
  assert.deepEqual(out.map((row) => row.id), ['P1', 'S56', 'P2', 'S9', 'S0']);
  assert.deepEqual(rows.map((row) => row.id), snapshot, 'ตัวที่ส่งมาไม่ถูกแก้');
  assert.notEqual(out, rows);
  assert.equal(out[1], rows[3], 'แถวเป็นออบเจ็กต์ตัวเดิม (ไม่คัดลอก)');
  // เท่ากัน = ลำดับเดิม
  const tie = [service('A', '2026-09-29T02:00:00Z'), service('B', '2026-09-29T02:00:00Z'), service('C', '2026-09-01T02:00:00Z')];
  assert.deepEqual(longestWaitingFirst(tie, (row) => row.aging).map((row) => row.id), ['C', 'A', 'B']);
  // ไม่มีแถวไหนร่วมเรียง = ลำดับเดิม · ค่าที่ไม่ใช่ array = ว่าง
  assert.deepEqual(longestWaitingFirst(rows, () => null).map((row) => row.id), snapshot);
  assert.deepEqual(longestWaitingFirst(null, () => null), []);
  assert.deepEqual(longestWaitingFirst([], (row) => row.aging), []);
});

test('ยามซอร์ส: ไฟล์ใบไม้ไม่ import serviceSetup.js · ไม่ตัดสตริง ISO เป็นวัน · ไม่อ่านนาฬิกาของเครื่อง · ค่าคงที่ระดับบนสุดเป็น literal', () => {
  assert.doesNotMatch(CODE, /serviceSetup(?:\.js)?['"]/, 'ห้าม import serviceSetup.js (ทะเบียน SO ฝั่งจอดึงไฟล์นี้ · serviceSetup.js import ไฟล์นี้ — ทิศเดียว)');
  assert.deepEqual(
    [...CODE.matchAll(/from\s*'([^']+)'/g)].map((m) => m[1]).sort(),
    ['@/lib/datePeriods', '@/lib/format'],
    'พึ่งแค่ตัวแปลงวันไทยกับตัวจัดรูปกลาง',
  );
  assert.doesNotMatch(SOURCE, /\.slice\(0,\s*10\)/, 'วันของจุดเวลาต้องมาจาก businessDayKey (ตัดสตริง = วันแบบ UTC)');
  assert.doesNotMatch(CODE, /new Date\(\s*\)|Date\.now\(/, 'ไม่อ่านนาฬิกาเอง — "วันนี้" มาจากผู้เรียก (server ส่ง businessDate())');
  assert.match(CODE, /businessDayKey\(clock\)/);
  /* กฎ 16: ค่าคงที่ระดับบนสุดห้ามเรียกชื่อที่ import มา ณ ตอนโหลดโมดูล (อ่านในฟังก์ชันเท่านั้น) */
  const topLevel = CODE.split('\n').filter((line) => /^(?:export\s+)?const\s+[\w$]+\s*=/.test(line));
  for (const line of topLevel) {
    assert.doesNotMatch(line, /=\s*(?:businessDayKey|fmtDate|fmtNumber)\b/, line);
  }
  assert.match(CODE, /chip: \(days\) => `ค้าง \$\{fmtNumber\(days\)\} วัน`/, 'ตัวเลขของชิปผ่าน fmtNumber ในฟังก์ชัน');
});
