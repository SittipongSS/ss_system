// ── ส่วนหัวของแบบฟอร์ม PDR (mig 0214) ──────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdr } from './pdr.js';

test('ชื่อช่องในฟอร์มถูกแปลงเป็นชื่อคอลัมน์ที่ prefix แล้ว', () => {
  const { columns, error } = normalizePdr({ customerBrand: 'แบรนด์ ก', moodTone: 'อบอุ่น' });
  assert.equal(error, null);
  assert.equal(columns.pdrCustomerBrand, 'แบรนด์ ก');
  assert.equal(columns.pdrMoodTone, 'อบอุ่น');
  // ช่องที่ไม่ได้กรอกเป็น null ไม่ใช่หายไป — update ต้องล้างค่าเก่าได้ด้วย
  assert.equal(columns.pdrMoq, null);
});

test('ไม่มีช่องไหนบังคับ — ใบเปล่ายังบันทึกได้', () => {
  const { columns, error } = normalizePdr({});
  assert.equal(error, null);
  // ⚠️ ช่องติ๊กหลายตัวคืน `[]` ไม่ใช่ null — คอลัมน์เป็น NOT NULL DEFAULT '{}' (0218)
  // ส่ง null ไปจะโดน constraint ตีกลับด้วย error ดิบจาก Postgres
  // ⚠️ ข้อความเขียนต่อ (jsonb NOT NULL DEFAULT '{}' · 0352) คืน `{}` ด้วยเหตุผลเดียวกัน
  for (const [column, v] of Object.entries(columns)) {
    const empty = Array.isArray(v) ? v.length === 0
      : v && typeof v === 'object' ? Object.keys(v).length === 0 : v === null;
    assert.equal(empty, true, column);
  }
  assert.equal(normalizePdr(null).error, null);
});

test('1.7.1 สวิตช์ที่อยู่จัดส่ง: สามสถานะ · เปิดแล้วล้างที่อยู่ที่พิมพ์ค้าง', () => {
  // ⚠️ ค่าที่อ่านไม่ออกเป็น NULL ไม่ใช่ false — "ไม่รู้" ต้องไม่กลายเป็น "ตอบว่าไม่"
  assert.equal(normalizePdr({}).columns.pdrShipToSameAsCustomer, null);
  assert.equal(normalizePdr({ shipToSameAsCustomer: '' }).columns.pdrShipToSameAsCustomer, null);
  assert.equal(normalizePdr({ shipToSameAsCustomer: 'yes' }).columns.pdrShipToSameAsCustomer, null);
  assert.equal(normalizePdr({ shipToSameAsCustomer: 'false' }).columns.pdrShipToSameAsCustomer, false);
  assert.equal(normalizePdr({ shipToSameAsCustomer: false }).columns.pdrShipToSameAsCustomer, false);

  const off = normalizePdr({ shipToSameAsCustomer: 'false', shipTo: 'โกดังบางนา' });
  assert.equal(off.columns.pdrShipTo, 'โกดังบางนา');
  // 🔴 เปิดสวิตช์ = ไม่มีที่อยู่จัดส่งของตัวเอง — ข้อความค้างต้องหาย ไม่งั้นเอกสารพิมพ์
  // คนละที่กับที่จอบอก และปิดสวิตช์วันหลังที่อยู่เก่าจะโผล่กลับมาเหมือนเพิ่งพิมพ์
  const on = normalizePdr({ shipToSameAsCustomer: 'true', shipTo: 'โกดังบางนา' });
  assert.equal(on.columns.pdrShipToSameAsCustomer, true);
  assert.equal(on.columns.pdrShipTo, null);
});

test('1.15 Archetype: ข้อความเขียนต่อเก็บเฉพาะตัวที่ยังติ๊ก · ว่างได้ · มีเพดาน', () => {
  const r = normalizePdr({
    archetypes: ['caregiver', 'sage'],
    archetypeNotes: { caregiver: '  ดูแลแขกเหมือนคนในบ้าน ', sage: '', hero: 'ติ๊กออกไปแล้ว' },
  });
  assert.equal(r.error, null);
  assert.deepEqual(r.columns.pdrArchetypes, ['caregiver', 'sage']);
  // ติ๊กออกแล้ว (hero) ข้อความต้องหายตาม · เว้นว่าง (sage) ไม่ต้องเก็บ key ว่าง
  assert.deepEqual(r.columns.pdrArchetypeNotes, { caregiver: 'ดูแลแขกเหมือนคนในบ้าน' });
  assert.deepEqual(normalizePdr({ archetypeNotes: 'ไม่ใช่ object' }).columns.pdrArchetypeNotes, {});
  assert.match(
    normalizePdr({ archetypes: ['hero'], archetypeNotes: { hero: 'ก'.repeat(201) } }).error,
    /Archetype.*ยาวเกิน 200/,
  );
  assert.match(normalizePdr({ archetypes: Array(13).fill(0).map((_, i) => `a${i}`) }).error, /ไม่เกิน 12/);
});

test('ช่องติ๊กหลายตัว: ตัดค่าซ้ำ · กันจำนวนเกิน · ไม่ตรวจว่าอยู่ในชุดตัวเลือกไหม', () => {
  const ok = normalizePdr({ documents: ['coa', 'coa', ' msds ', ''] });
  assert.equal(ok.error, null);
  assert.deepEqual(ok.columns.pdrDocuments, ['coa', 'msds']);
  assert.deepEqual(normalizePdr({ packagingForms: 'ไม่ใช่ array' }).columns.pdrPackagingForms, []);
  assert.match(normalizePdr({ documents: Array(21).fill(0).map((_, i) => `d${i}`) }).error, /ไม่เกิน 20/);
});

test('ตัวเลขติดลบหรืออ่านไม่ออกต้องตีกลับ ไม่ใช่กลืนเป็น null เงียบ ๆ', () => {
  assert.match(normalizePdr({ targetCost: '-1' }).error, /ไม่ติดลบ/);
  assert.match(normalizePdr({ projectValue: 'หนึ่งล้าน' }).error, /ตัวเลข/);
  // คั่นหลักพันด้วยลูกน้ำเป็นเรื่องปกติที่คนพิมพ์ — รับได้
  assert.equal(normalizePdr({ projectValue: '1,250,000' }).columns.pdrProjectValue, 1250000);
  assert.equal(normalizePdr({ targetCost: '420.50' }).columns.pdrTargetCost, 420.5);
  assert.equal(normalizePdr({ targetCost: '' }).columns.pdrTargetCost, null);
});

test('วันที่ต้องเป็น ISO · เว้นว่างได้', () => {
  assert.equal(normalizePdr({ wantedAt: '2569-08-06' }).columns.pdrWantedAt, '2569-08-06');
  assert.equal(normalizePdr({ sellFrom: '' }).columns.pdrSellFrom, null);
  assert.match(normalizePdr({ wantedAt: '06/08/2569' }).error, /วันที่/);
});

test('ความยาวต้องไม่หลวมกว่า CHECK ของ 0214', () => {
  assert.match(normalizePdr({ specialRequirements: 'ก'.repeat(2001) }).error, /ยาวเกิน 2000/);
  assert.match(normalizePdr({ customerBrand: 'ก'.repeat(201) }).error, /ยาวเกิน 200/);
  assert.match(normalizePdr({ moq: 'ก'.repeat(101) }).error, /ยาวเกิน 100/);
});

// ⭐ ผู้ใช้เจอเอง 2026-08-10 — กดบันทึกแล้วได้ toast "ราคาและมูลค่าต้องเป็นตัวเลข
// ไม่ติดลบ" ซึ่ง **ไม่บอกว่าช่องไหน** ทั้งที่ฟอร์มมี ~48 ช่องและช่องเงินมีสามช่อง
// อยู่คนละลิ้นชักกัน ⇒ ตกด่านแล้วหาไม่เจอว่าต้องแก้ตรงไหน
test('ข้อความตีกลับต้องบอกชื่อช่องและค่าที่พิมพ์มา', () => {
  const cost = normalizePdr({ targetCost: '1,200.-' }).error;
  assert.match(cost, /Target Cost \/ KG/);
  assert.match(cost, /1,200\.-/);

  assert.match(normalizePdr({ projectValue: 'หนึ่งล้าน' }).error, /มูลค่าโปรเจกต์ทั้งหมด/);
  assert.match(normalizePdr({ targetPrice: '-5' }).error, /Target Price \/ Unit/);
  assert.match(normalizePdr({ wantedAt: '06/08/2569' }).error, /วันที่ต้องการสินค้า/);
  assert.match(normalizePdr({ moq: 'ก'.repeat(101) }).error, /MOQ ที่คาดหวัง/);
  assert.match(normalizePdr({ documents: Array(21).fill('d') }).error, /เอกสาร/);

  // ค่ายาวต้องถูกตัด ไม่งั้น toast บังทั้งจอ
  const long = normalizePdr({ targetCost: 'x'.repeat(300) }).error;
  assert.equal(long.includes('…'), true);
  assert.equal(long.length < 120, true, long);
});
