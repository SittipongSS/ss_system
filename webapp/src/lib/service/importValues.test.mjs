// ── ตัวแปลงค่าจากชีตเก่า (F-8) ─────────────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isBlankCell,
  nameKey,
  normalizeYear,
  packStdEquivalent,
  parseAssetKind,
  parseCount,
  parseGrade,
  parseImportDate,
  parsePacks,
  parseText,
  parseVolumeMl,
  parseWorkPause,
} from './importValues.js';

// ── ปี พ.ศ./ค.ศ. ─────────────────────────────────────────────────────────
test('⭐ ปีสี่หลักแยก พ.ศ. กับ ค.ศ. ที่ 2400', () => {
  assert.equal(normalizeYear(2567), 2024);
  assert.equal(normalizeYear(2024), 2024);
  assert.equal(normalizeYear(2569), 2026);
});

test('⭐ ปีสองหลัก: ≥40 คือ พ.ศ. · <40 คือ ค.ศ.', () => {
  assert.equal(normalizeYear(69), 2026, 'ใบส่งงานจริงเขียน 01/08/69');
  assert.equal(normalizeYear(68), 2025);
  assert.equal(normalizeYear(24), 2024);
  assert.equal(normalizeYear(39), 2039);
});

test('วันที่รับได้ทุกรูปที่เจอในชีต', () => {
  assert.equal(parseImportDate('01/08/69').value, '2026-08-01');
  assert.equal(parseImportDate('1/8/2569').value, '2026-08-01');
  assert.equal(parseImportDate('2024-01-05').value, '2024-01-05');
  assert.equal(parseImportDate('2567-01-05').value, '2024-01-05');
  assert.equal(parseImportDate('5 ม.ค. 68').value, '2025-01-05');
  assert.equal(parseImportDate('5 มกราคม 2568').value, '2025-01-05');
  assert.equal(parseImportDate(new Date(Date.UTC(2026, 7, 1))).value, '2026-08-01');
});

test('⭐ วันที่ที่ไม่มีอยู่จริงต้องตกรายงาน ไม่ใช่เลื่อนวันเงียบ ๆ', () => {
  const result = parseImportDate('31/02/2569');
  assert.equal(result.value, null);
  assert.equal(result.raw, '31/02/2569');
  assert.match(result.issue, /อ่านวันที่ไม่ออก/);
});

test('⭐ ปีนอกช่วงที่ DB ยอมรับตกรายงาน (CHECK service_assets_dates_sane)', () => {
  assert.match(parseImportDate('06/08/2202').issue, /นอกช่วง/);
});

test('serial ของ Excel อ่านได้ · ตัวเลขเล็ก ๆ ไม่ใช่วันที่', () => {
  assert.equal(parseImportDate('45870').value, '2025-08-01');
  assert.match(parseImportDate('8').issue, /ไม่ใช่วันที่/, '“8 เครื่อง” หลงมาช่องวันที่');
});

test('ช่องว่างทุกแบบคืน null โดยไม่ใช่ข้อผิดพลาด', () => {
  for (const blank of ['', '-', '–', 'N/A', 'ไม่มี']) {
    assert.equal(isBlankCell(blank), true, blank);
    assert.deepEqual(parseImportDate(blank), { value: null, issue: null, raw: null });
  }
});

// ── ปริมาตรปนหน่วย ───────────────────────────────────────────────────────
test('⭐ เลขเปล่าในคอลัมน์ลิตร/เดือน = ลิตร', () => {
  assert.equal(parseVolumeMl('1').value, 1000);
  assert.equal(parseVolumeMl('0.5').value, 500);
  assert.equal(parseVolumeMl('2.5').value, 2500);
});

test('⭐ มีหน่วยกำกับให้เชื่อหน่วยที่เขียน', () => {
  assert.equal(parseVolumeMl('500 ML').value, 500);
  assert.equal(parseVolumeMl('300ml').value, 300);
  assert.equal(parseVolumeMl('3 L').value, 3000);
  assert.equal(parseVolumeMl('250 มล.').value, 250);
});

test('🔴 กิโลกรัมแปลงเป็น ml ไม่ได้ — ห้ามเดา 1 kg = 1000 ml', () => {
  const result = parseVolumeMl('2 KG');
  assert.equal(result.value, null);
  assert.equal(result.raw, '2 KG');
  assert.match(result.issue, /ความหนาแน่น/);
});

test('หน่วยที่ไม่รู้จักตกรายงานพร้อมชื่อหน่วยเดิม', () => {
  assert.match(parseVolumeMl('5 กระปุก').issue, /กระปุก/);
});

// ── จำนวนนับ ─────────────────────────────────────────────────────────────
test('⭐ “รอติดตั้ง” ไม่ใช่ข้อผิดพลาด — เป็นสถานะ', () => {
  const result = parseCount('รอติดตั้ง');
  assert.equal(result.value, null);
  assert.equal(result.issue, null);
  assert.equal(result.note, 'รอติดตั้ง');
});

test('จำนวนที่อ่านไม่ออกตกรายงาน', () => {
  assert.equal(parseCount('8').value, 8);
  assert.equal(parseCount('2 KG').value, null);
  assert.match(parseCount('2 KG').issue, /จำนวน/);
  assert.match(parseCount('1200').issue, /เกิน 999/);
});

test('⭐ สูตรแพ็คของหัวชีต: SM 2 = STD 1', () => {
  assert.equal(packStdEquivalent(4, 0), 4);
  assert.equal(packStdEquivalent(3, 2), 4);
  assert.equal(packStdEquivalent(0, 1), 0.5, 'SM เลขคี่ได้ครึ่งแพ็ค ไม่ปัดทิ้ง');
  assert.equal(packStdEquivalent(0, 0), null, 'ไม่มีข้อมูล ≠ 0 แพ็ค');
  assert.equal(parsePacks('1.5').value, 1.5);
});

// ── ค่าตั้งเครื่อง ────────────────────────────────────────────────────────
test('ค่าพ่น/พัก จากใบส่งงาน', () => {
  assert.deepEqual(parseWorkPause('30/225').value, { workSec: 30, pauseSec: 225 });
  assert.deepEqual(parseWorkPause('60 / 180').value, { workSec: 60, pauseSec: 180 });
  assert.match(parseWorkPause('30').issue, /พ่น\/พัก/);
  assert.equal(parseGrade('Grade 5').value, 'Grade 5');
  assert.equal(parseGrade('เกรด 3').value, 'Grade 3');
});

// ── ชนิดอุปกรณ์ ──────────────────────────────────────────────────────────
test('⭐ ชนิดเดาจากข้อความเท่านั้น — เดาไม่ออกต้องบอกว่าเดาไม่ออก', () => {
  assert.equal(parseAssetKind('เครื่องกระจายกลิ่น').value, 'diffuser');
  assert.equal(parseAssetKind('Reed Diffuser').value, 'reed');
  assert.equal(parseAssetKind('เครื่องกดสบู่').value, 'soap');
  assert.equal(parseAssetKind('แอลกอฮอล์').value, 'alcohol');
  assert.equal(parseAssetKind('242').value, null, 'ตัวเลขในคอลัมน์ Reed บอกชนิดไม่ได้');
  assert.match(parseAssetKind('242').issue, /ไม่รู้จักชนิด/);
});

// ── ข้อความ + กุญแจเทียบชื่อ ─────────────────────────────────────────────
test('ข้อความยาวเกินตกรายงาน ไม่ตัดทิ้งเงียบ ๆ', () => {
  assert.equal(parseText('  Jim   Thompson  ').value, 'Jim Thompson');
  assert.match(parseText('ก'.repeat(200), { max: 150, label: 'ชื่อไซต์' }).issue, /ยาวเกิน 150/);
});

test('⭐ กุญแจเทียบชื่อข้ามวงเล็บ/ช่องว่าง — แต่ใช้เทียบเท่านั้น', () => {
  assert.equal(nameKey('Jim Thompson (Outlet 93)'), nameKey('Jim Thompson Outlet 93'));
  assert.equal(nameKey('  CP  LAND '), 'cp land');
  assert.notEqual(nameKey('Jim Thompson 93'), nameKey('Jim Thompson 94'));
});
