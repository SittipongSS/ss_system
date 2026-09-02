// รับเครื่องเข้าคลังเป็นชุด — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECEIVE,
  nextSerialNumber,
  plannedSerials,
  receiveError,
  receiveRows,
  serialPrefixOf,
  serialSequence,
} from './assetReceive.js';

const wh = { id: 'WH', name: 'คลัง', kind: 'warehouse' };
const ctx = (over = {}) => ({ canEdit: true, site: wh, takenSerials: [], ...over });
const input = (over = {}) => ({
  model: 'OV-08', count: 3, startNumber: 369, receivedAt: '2026-09-02', ...over,
});

// ── รูปแบบรหัส ─────────────────────────────────────────────────────────

/* 🔑 ทะเบียนเก่าทั้ง 1,221 ตัวใช้รูปเดียวกันหมด — ตัวตัดขีดต้องตรงกับของจริง
   ไม่งั้นรหัสที่ออกใหม่จะไม่ต่อกับของเดิม แล้วเลขจะเริ่มที่ 1 ใหม่ทุกครั้ง */
test('ส่วนหน้าของรหัส = รุ่นที่ตัดขีดและช่องว่างออก', () => {
  assert.equal(serialPrefixOf('OV-08'), 'OV08');
  assert.equal(serialPrefixOf('O-800'), 'O800');
  assert.equal(serialPrefixOf('7KG'), '7KG');
  assert.equal(serialPrefixOf('SA300 F-V3'), 'SA300FV3');
  assert.equal(serialPrefixOf('ลำโพง'), 'ลำโพง', 'รุ่นภาษาไทยต้องไม่ถูกแปลง');
  assert.equal(serialPrefixOf(''), '');
});

test('เดินเลขต่อกัน เติมศูนย์ 4 หลัก', () => {
  assert.deepEqual(serialSequence('OV08', 369, 3), ['OV08-0369', 'OV08-0370', 'OV08-0371']);
  // เลขล้นความกว้าง ต้องยาวขึ้น ไม่ใช่ถูกตัด — รหัสที่ถูกตัดคือรหัสซ้ำ
  assert.deepEqual(serialSequence('OV08', 9999, 2), ['OV08-9999', 'OV08-10000']);
});

// ── เดาเลขถัดไป ────────────────────────────────────────────────────────

/* อ่านจากของจริงในตาราง ไม่ใช่ตัวนับแยก — ตัวนับที่เดินคู่ขนานกับข้อมูลจริงจะเพี้ยน
   ทันทีที่มีคนพิมพ์รหัสเองหรือลบเครื่องทิ้ง */
test('เลขถัดไปมาจากรหัสสูงสุดของรุ่นนั้น', () => {
  const serials = ['OV08-0001', 'OV08-0368', 'OV05-0999', 'OV08-0012'];
  assert.equal(nextSerialNumber('OV08', serials), 369);
  assert.equal(nextSerialNumber('OV05', serials), 1000);
  assert.equal(nextSerialNumber('MAX', serials), 1, 'รุ่นที่ยังไม่มีเครื่องเริ่มที่ 1');
});

test('เลขถัดไปไม่สนตัวพิมพ์ใหญ่เล็ก (unique index เทียบด้วย lower)', () => {
  assert.equal(nextSerialNumber('ov08', ['OV08-0007']), 8);
  assert.equal(nextSerialNumber('OV08', ['ov08-0007']), 8);
});

/* 🪤 รุ่นที่ชื่อขึ้นต้นเหมือนกันต้องไม่ปนกัน — `OV08` กับ `OV08Mini` เป็นคนละรุ่น
   ถ้าเทียบด้วย startsWith เลขจะกระโดดข้ามกัน */
test('รุ่นที่ชื่อขึ้นต้นเหมือนกันไม่ปนกัน', () => {
  const serials = ['O800-0050', 'O800Mini-0005'];
  assert.equal(nextSerialNumber('O800', serials), 51);
  assert.equal(nextSerialNumber('O800Mini', serials), 6);
});

test('รหัสรูปแบบอื่นถูกข้าม ไม่ทำให้เลขเพี้ยน', () => {
  assert.equal(nextSerialNumber('OV08', ['OV08-0003', 'OV08', 'OV08-abc', '', null]), 4);
});

// ── ด่านก่อนบันทึก ─────────────────────────────────────────────────────

test('ไม่มีสิทธิ์ / ไม่มีคลัง = ทำไม่ได้', () => {
  assert.match(receiveError(input(), ctx({ canEdit: false })), /สิทธิ์/);
  assert.match(receiveError(input(), ctx({ site: null })), /คลัง/);
});

/* 🔴 เครื่องใหม่ต้องเกิดที่คลังเสมอ — ปล่อยให้สร้างที่ไซต์ลูกค้าตรง ๆ แปลว่า
   เครื่องโผล่มาโดยไม่เคยผ่านคลัง ซึ่งทำให้ตัวเลขสต๊อกเชื่อไม่ได้ */
test('สร้างเครื่องใหม่ที่ไซต์ลูกค้าไม่ได้', () => {
  const err = receiveError(input(), ctx({ site: { id: 'S1', name: 'สาขาเอ', kind: 'customer' } }));
  assert.match(err, /คลัง/);
});

test('คลังที่ปิดใช้งานอยู่ รับเข้าไม่ได้', () => {
  assert.match(receiveError(input(), ctx({ site: { ...wh, isActive: false } })), /ปิดใช้งาน/);
});

test('รุ่น · จำนวน · วันที่ ต้องครบและถูกรูป', () => {
  assert.match(receiveError(input({ model: '' }), ctx()), /รุ่น/);
  assert.match(receiveError(input({ count: 0 }), ctx()), /จำนวน/);
  assert.match(receiveError(input({ count: 2.5 }), ctx()), /จำนวน/);
  assert.match(receiveError(input({ receivedAt: '' }), ctx()), /วันที่/);
  assert.match(receiveError(input({ receivedAt: '02/09/2026' }), ctx()), /วันที่/);
  assert.equal(receiveError(input(), ctx()), null);
});

test(`รับเข้าครั้งละไม่เกิน ${MAX_RECEIVE} ตัว`, () => {
  assert.equal(receiveError(input({ count: MAX_RECEIVE }), ctx()), null);
  assert.match(receiveError(input({ count: MAX_RECEIVE + 1 }), ctx()), /ไม่เกิน/);
});

/* 🔴 ด่านที่สำคัญที่สุดของใบนี้ — ไม่มีทรานแซกชันในชั้น API ⇒ ถ้าปล่อยให้ unique
   index ตีกลับกลางทาง จะได้สภาพ "บางตัวเข้าไปแล้ว บางตัวไม่เข้า" ที่ตามเก็บยาก */
test('รหัสซ้ำต้องถูกจับตั้งแต่ก่อนกด พร้อมบอกว่าตัวไหนซ้ำ', () => {
  const err = receiveError(input(), ctx({ takenSerials: ['OV08-0370'] }));
  assert.match(err, /OV08-0370/);
  assert.match(err, /ถูกใช้แล้ว/);
});

test('รหัสซ้ำเทียบแบบไม่สนตัวพิมพ์ (ตรงกับ unique index)', () => {
  assert.ok(receiveError(input(), ctx({ takenSerials: ['ov08-0369'] })));
});

test('ซ้ำหลายตัวบอกสามตัวแรกแล้วสรุปที่เหลือ', () => {
  const err = receiveError(input({ count: 5 }), ctx({
    takenSerials: ['OV08-0369', 'OV08-0370', 'OV08-0371', 'OV08-0372'],
  }));
  assert.match(err, /และอีก 1 ตัว/);
});

// ── แถวที่จะสร้าง ──────────────────────────────────────────────────────

/* จอกับ API ต้องใช้ตัวเดียวกัน — ไม่งั้นพรีวิวที่คนเห็นกับของที่เข้าฐานเป็นคนละชุด */
test('พรีวิวกับแถวจริงใช้รหัสชุดเดียวกัน', () => {
  const rows = receiveRows(input(), { site: wh });
  assert.deepEqual(rows.map((r) => r.serial), plannedSerials(input()));
  assert.deepEqual(rows.map((r) => r.serial), ['OV08-0369', 'OV08-0370', 'OV08-0371']);
});

test('เครื่องที่รับเข้าอยู่ในคลัง สภาพปกติ และมีวันรับเข้า', () => {
  const [row] = receiveRows(input({ colour: 'ขาว' }), { site: wh });
  assert.equal(row.siteId, 'WH');
  assert.equal(row.status, 'in_stock');
  assert.equal(row.condition, 'ok');
  assert.equal(row.receivedAt, '2026-09-02');
  assert.equal(row.colour, 'ขาว');
  // label เป็น NOT NULL — ตั้งเท่ากับ serial เพราะทะเบียนเก่าไม่มีชื่อเรียกแยก
  assert.equal(row.label, row.serial);
  // ⚠️ ห้ามตั้ง installedAt — เครื่องยังไม่ได้ติดตั้ง อายุใช้งานต้องยังไม่เริ่มนับ
  assert.equal(row.installedAt, undefined);
});

test('รับเข้าซ้ำด้วย input เดิม ต้องได้ค่าเดิมเป๊ะ (ไม่มีเลขรันของตัวเอง)', () => {
  const a = receiveRows(input(), { site: wh });
  const b = receiveRows(input(), { site: wh });
  assert.deepEqual(a, b);
});
