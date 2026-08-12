// ── แก้ PDR แล้วเธรดต้องบอกว่า "เดิมเป็นอะไร" (IS-26080021) ────────────────
//
// 🐞 ที่มา: พอฝ่ายปลายทางรับเรื่อง สิทธิ์แก้ PDR ย้ายไปเป็นของเขา **ทั้งใบ**
// (`pdrEdit.js`) ⇒ RD แก้บรีฟที่ SA เขียนมาได้ทุกช่อง แต่เธรดขึ้นแค่
// "แก้แบบฟอร์ม PDR" ⇒ ค่าที่หายไปไม่มีร่องรอย · เทสต์นี้ล็อกว่ามีร่องรอยจริง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdrChangeLines, pdrChangeSummary } from './pdrChanges.js';
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
