// ── แก้ PDR แล้วเธรดต้องบอกว่า "เดิมเป็นอะไร" (IS-26080021) ────────────────
//
// 🐞 ที่มา: พอฝ่ายปลายทางรับเรื่อง สิทธิ์แก้ PDR ย้ายไปเป็นของเขา **ทั้งใบ**
// (`pdrEdit.js`) ⇒ RD แก้บรีฟที่ SA เขียนมาได้ทุกช่อง แต่เธรดขึ้นแค่
// "แก้แบบฟอร์ม PDR" ⇒ ค่าที่หายไปไม่มีร่องรอย · เทสต์นี้ล็อกว่ามีร่องรอยจริง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdrChangeLines, pdrChangeSummary, pdrTargetChangeLines } from './pdrChanges.js';
import { askActionUpdate } from '../costingUpdates.js';

test('ไม่เปลี่ยนอะไร = ไม่มีบรรทัด และ summary เป็น null', () => {
  const row = { pdrMoodTone: 'สดชื่น' };
  assert.deepEqual(pdrChangeLines(row, { pdrMoodTone: 'สดชื่น' }), []);
  assert.equal(pdrChangeSummary(row, { pdrMoodTone: 'สดชื่น' }), null);
});

test('ช่องข้อความเปลี่ยน = บอกทั้งค่าเดิมและค่าใหม่ พร้อมป้ายจากทะเบียนกลาง', () => {
  const lines = pdrChangeLines({ pdrMoodTone: 'สดชื่น' }, { pdrMoodTone: 'สดชื่น โทนซิตรัส' });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Mood & Tone: สดชื่น → สดชื่น โทนซิตรัส$/);
});

/* ⭐ ช่องที่เพิ่งถูกกรอก / เพิ่งถูกล้าง ต้องอ่านออกว่าเกิดอะไรขึ้น — สตริงเปล่า
   ทำให้บรรทัดกลายเป็น "ช่อง:  → ค่า" ซึ่งอ่านเหมือนระบบพัง */
test('ว่าง ↔ มีค่า อ่านออกทั้งสองทาง', () => {
  assert.match(pdrChangeLines({}, { pdrMoodTone: 'สดชื่น' })[0], /\(ว่าง\) → สดชื่น/);
  assert.match(pdrChangeLines({ pdrMoodTone: 'สดชื่น' }, { pdrMoodTone: '' })[0], /สดชื่น → \(ว่าง\)/);
});

test('ช่องหลายค่า (multi) เทียบเป็นชุด ไม่ใช่สตริง', () => {
  const before = { pdrProductKinds: ['A', 'B'] };
  assert.deepEqual(pdrChangeLines(before, { pdrProductKinds: ['A', 'B'] }), []);
  assert.equal(pdrChangeLines(before, { pdrProductKinds: ['A', 'B', 'C'] }).length, 1);
});

/* ⚠️ วนจาก `columns` ไม่ใช่จากทะเบียนทั้งชุด — ผู้เรียกที่แก้แค่บางส่วนส่งมาไม่ครบ
   ทุกช่อง ถ้าวนทะเบียนจะอ่านช่องที่ไม่ได้ส่งมาเป็น "ถูกล้างเป็นว่าง" ทั้งแผง */
test('ช่องที่ไม่ได้ส่งมาต้องไม่ถูกนับว่าเปลี่ยน', () => {
  const before = { pdrMoodTone: 'สดชื่น', pdrShipTo: 'กรุงเทพ' };
  assert.deepEqual(pdrChangeLines(before, { pdrMoodTone: 'สดชื่น' }), []);
});

test('คอลัมน์ที่ไม่อยู่ในทะเบียนถูกข้าม (ไม่ใช่ช่องที่คนกรอก)', () => {
  assert.deepEqual(pdrChangeLines({ updatedAt: 'a' }, { updatedAt: 'b' }), []);
});

/* PDR มี 48 ช่อง — แก้ทีเดียวหลายสิบช่องแล้วเธรดกลายเป็นกำแพงข้อความที่ไม่มีใครอ่าน */
test('เกินเพดานบรรทัด บอกจำนวนที่เหลือแทนการพ่นทั้งหมด', () => {
  const before = {}; const columns = {};
  for (const key of ['pdrMoodTone', 'pdrShipTo', 'pdrBrandDirection', 'pdrCustomerBrand',
    'pdrBrandSample', 'pdrSpecialRequirements', 'pdrExportDocNote', 'pdrTexture', 'pdrCustomerKind']) {
    columns[key] = 'ค่าใหม่';
  }
  const summary = pdrChangeSummary(before, columns);
  assert.equal(summary.split('\n').length, 9);            // 8 บรรทัด + บรรทัดสรุป
  assert.match(summary, /…และอีก 1 ช่อง$/);
});

test('ค่ายาวถูกตัด ไม่ลากบรรทัดเดียวยาวเป็นย่อหน้า', () => {
  const long = 'ก'.repeat(200);
  assert.ok(pdrChangeLines({}, { pdrMoodTone: long })[0].length < 100);
});

/* ── ปลายทาง: ข้อความที่ลงเธรดจริง ────────────────────────────────────────
   ล็อกว่ารายการเปลี่ยนแปลงไปโผล่ในเธรดจริง ไม่ใช่คำนวณแล้วทิ้ง (ซึ่งเป็นอาการที่
   รีโปนี้เคยเจอ: route ประกอบข้อความสวยงามแล้วส่งเข้า recordAudit อย่างเดียว) */
test('askActionUpdate ต่อรายการเปลี่ยนแปลงเข้าไปในเธรด', () => {
  const ask = { dept: 'RD', docNo: 'DR-1' };
  const plain = askActionUpdate('pdr', ask, {});
  assert.equal(plain.body, 'แก้แบบฟอร์ม PDR');

  const withChanges = askActionUpdate('pdr', ask, { pdrChanges: 'Mood & Tone: ก → ข' });
  assert.equal(withChanges.kind, 'pdr');
  assert.match(withChanges.body, /^แก้แบบฟอร์ม PDR\nMood & Tone: ก → ข$/);
});

// ── mig 0352: สวิตช์ · ข้อความเขียนต่อ · แถวสินค้า ──────────────────────────────
test('สวิตช์กับข้อความเขียนต่อต้องอ่านออกในเธรด ไม่ใช่ "true" / "[object Object]"', () => {
  const lines = pdrChangeLines(
    { pdrShipToSameAsCustomer: null, pdrArchetypeNotes: { sage: 'รู้ลึก' } },
    { pdrShipToSameAsCustomer: true, pdrArchetypeNotes: { sage: 'รู้ลึกจริง' } },
  );
  assert.ok(lines.some((l) => /ส่งตัวอย่างไปที่อยู่เดียวกับลูกค้า: \(ว่าง\) → ใช่/.test(l)), lines.join('\n'));
  // 🐞 เทียบด้วย String() แล้ว object ทุกตัวเท่ากัน ⇒ แก้ข้อความแล้วเธรดไม่เคยเห็น
  assert.ok(lines.some((l) => /SAGE: รู้ลึก → SAGE: รู้ลึกจริง/.test(l)), lines.join('\n'));
  assert.deepEqual(pdrChangeLines(
    { pdrArchetypeNotes: { a: 'x', b: 'y' } }, { pdrArchetypeNotes: { b: 'y', a: 'x' } },
  ), [], 'ลำดับ key ต่างกันไม่ใช่การแก้');
});

test('⭐ แก้สเปกรายสินค้าต้องขึ้นเธรด — บอกว่าสินค้าที่เท่าไร ข้อไหน เดิมเป็นอะไร', () => {
  const before = [{ categoryCode: '02-010', sizeValue: 50, sizeUnit: 'ml', texture: 'standard', scentId: 'SC-1' }];
  const next = [
    { categoryCode: '02-010', sizeValue: 100, sizeUnit: 'ml', texture: 'premium', scentId: 'SC-2' },
    { categoryCode: '01-003' },
  ];
  const lines = pdrTargetChangeLines(before, next, {
    scentLabel: (id) => ({ 'SC-1': 'S001 มะลิ', 'SC-2': 'S002 กุหลาบ' })[id] || id,
  });
  assert.ok(lines.includes('สินค้าที่ 1 · 2.7.1 ขนาดบรรจุ: 50 ml → 100 ml'), lines.join('\n'));
  assert.ok(lines.includes('สินค้าที่ 1 · 2.5 ลักษณะเนื้อผลิตภัณฑ์: STANDARD → PREMIUM'), lines.join('\n'));
  assert.ok(lines.includes('สินค้าที่ 1 · 2.1 กลิ่น: S001 มะลิ → S002 กุหลาบ'), lines.join('\n'));
  assert.ok(lines.includes('สินค้าที่ 2: เพิ่มใหม่ (01-003)'), lines.join('\n'));
  assert.deepEqual(pdrTargetChangeLines(before, before), [], 'ไม่ได้แก้ = ไม่มีบรรทัด');
  // บรรทัดแถวต่อท้ายหัวใบในข้อความเดียว
  assert.match(pdrChangeSummary({}, {}, lines), /สินค้าที่ 1/);
  assert.equal(pdrChangeSummary({}, {}, []), null);
});

test('1.11 ในเธรดใช้ชื่อหมวดชุดเดียวกับบรรทัดแถวสินค้า — ไม่ใช่รหัสดิบ', () => {
  const names = { '01-005': 'เทียนหอม', '01-006': 'ก้านหอม' };
  const summary = pdrChangeSummary(
    { pdrProductKinds: ['01-005'] }, { pdrProductKinds: ['01-005', '01-006'] }, [],
    { categoryLabel: (c) => names[c] },
  );
  assert.match(summary, /เทียนหอม → เทียนหอม, ก้านหอม/);
});

test('⭐ เอาสินค้าที่ 1 ออก — เธรดบอกว่าเอาอะไรออก ไม่ใช่เล่าว่าสินค้าที่ 1 เปลี่ยนทุกช่อง (จับคู่ด้วย id)', () => {
  const before = [
    { id: 'DPT-a', categoryCode: '02-020', fOn: true, fPricePerKg: 1200 },
    { id: 'DPT-b', categoryCode: '01-005', sizeValue: 100, sizeUnit: 'ml' },
  ];
  const next = [{ categoryCode: '01-005', sizeValue: 100, sizeUnit: 'ml' }];
  const lines = pdrTargetChangeLines(before, next, { nextIds: ['DPT-b'] });
  assert.deepEqual(lines, ['สินค้าที่ 1 (เดิม): เอาออก (02-020)'], lines.join('\n'));
  // เพิ่มแถวใหม่ + แก้แถวเดิมที่ย้ายตำแหน่ง
  const moved = pdrTargetChangeLines(before, [
    { categoryCode: '01-009' },
    { categoryCode: '01-005', sizeValue: 50, sizeUnit: 'ml' },
    { categoryCode: '02-020', fOn: true, fPricePerKg: 1200 },
  ], { nextIds: [null, 'DPT-b', 'DPT-a'] });
  assert.ok(moved.includes('สินค้าที่ 1: เพิ่มใหม่ (01-009)'), moved.join('\n'));
  assert.ok(moved.includes('สินค้าที่ 2 · 2.7.1 ขนาดบรรจุ: 100 ml → 50 ml'), moved.join('\n'));
  assert.equal(moved.length, 2, 'แถวที่แค่ย้ายตำแหน่งไม่ใช่การแก้');
});

test('ช่องตัวเลือกในเธรดพิมพ์ป้าย ไม่ใช่ key ที่เก็บ', () => {
  const lines = pdrChangeLines({ pdrArchetypes: ['caregiver', 'explorer'] }, { pdrArchetypes: ['explorer'] });
  assert.ok(lines.some((l) => /CAREGIVER, EXPLORER → EXPLORER/.test(l)), lines.join('\n'));
});

test('แทนที่สินค้าทุกแถว — ยังจับคู่ด้วย id (เอาออก + เพิ่มใหม่) ไม่ถอยไปเทียบตามตำแหน่ง', () => {
  const before = [
    { id: 'DPT-a', categoryCode: '02-020', fOn: true, fPricePerKg: 1200 },
    { id: 'DPT-b', categoryCode: '02-010' },
  ];
  assert.deepEqual(
    pdrTargetChangeLines(before, [{ categoryCode: '01-005', sizeValue: 100, sizeUnit: 'ml' }], { nextIds: [null] }),
    ['สินค้าที่ 1 (เดิม): เอาออก (02-020)', 'สินค้าที่ 2 (เดิม): เอาออก (02-010)', 'สินค้าที่ 1: เพิ่มใหม่ (01-005)'],
  );
  assert.deepEqual(pdrTargetChangeLines([], [{ categoryCode: '01-005' }], { nextIds: [null] }), ['สินค้าที่ 1: เพิ่มใหม่ (01-005)']);
});

test('บรรทัด "เอาสินค้าออก" ขึ้นก่อนบรรทัดหัวใบ — เพดานบรรทัดของเธรดต้องไม่กลืนมัน', () => {
  const header = Object.fromEntries(['pdrMoq', 'pdrColor', 'pdrPackSize', 'pdrCustomerBrand', 'pdrMoodTone',
    'pdrBrandDirection', 'pdrShipTo', 'pdrFragranceUse', 'pdrExportDocNote'].map((c) => [c, 'ใหม่']));
  const summary = pdrChangeSummary({}, header, ['สินค้าที่ 2 (เดิม): เอาออก (02-010)']);
  assert.match(summary.split('\n')[0], /เอาออก/);
});
