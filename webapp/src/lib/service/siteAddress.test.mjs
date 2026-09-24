// ── ที่อยู่ไซต์แบบแยกช่อง + ชั้นที่พิมพ์เองได้ (มติผู้ใช้ 2026-09-24 · mig 0384) ──────────
//
// *"การพิมพ์ไซต์อื่น อยากให้ฟอร์มเหมือนที่อยู่ของฐานข้อมูล"* · *"ส่วนโซน ชั้น อยากให้เพิ่มชั้นเองได้
// เผื่อตัวเลือกไม่มี"*
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeSiteInput, siteAddressCarry, siteAddressDrift, siteAddressLegacy, siteAddressText,
  siteAddressUncarry, siteCreateMissing,
} from './sites.js';
import {
  CUSTOM_FLOOR_RE, FLOOR_CHIP_EXTRA_MAX, SPECIAL_FLOORS, ZONE_CODE_RE, floorChipOptions, floorLabel,
  normalizeFloor, parseZoneCode, zoneCodePrefix,
} from './zoneCode.js';

const read = (rel) => readFileSync(`src/${rel}`, 'utf8');

// ── ที่อยู่ไซต์ ───────────────────────────────────────────────────────────────
const bangkok = { provinceCode: '10', province: 'กรุงเทพมหานคร' };
const structured = {
  ...bangkok,
  line1: '35 ซอยพิพัฒน์ 2',
  subdistrict: 'สีลม', subdistrictCode: '100401',
  district: 'บางรัก', districtCode: '1004',
  postcode: '10500',
};
const newSite = {
  customerId: 'C1', name: 'สาขาสีลม', ...structured,
  mapUrl: 'https://maps.example/x', contactName: 'คุณเอ', contactPhone: '081',
  accessFrom: '10:00', accessTo: '20:00',
};

test('⭐ แยกช่องแล้ว = ข้อความเต็มประกอบจากฟิลด์ย่อย (แบบเดียวกับที่อยู่ลูกค้า)', () => {
  assert.equal(siteAddressText(structured), '35 ซอยพิพัฒน์ 2 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500');
});

test('⭐ server ประกอบ `address` เอง — ไม่เชื่อข้อความเก่าที่ฟอร์มส่งติดมา', () => {
  // ฟอร์มไม่อัปเดต `address` ระหว่างพิมพ์บ้านเลขที่ ⇒ ค่าที่ส่งมาอาจเป็นข้อความก่อนแยกช่อง
  const { value, error } = normalizeSiteInput({ ...newSite, address: 'ข้อความเก่าก่อนแยก' });
  assert.equal(error, null);
  assert.equal(value.address, '35 ซอยพิพัฒน์ 2 แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500');
  assert.equal(value.line1, '35 ซอยพิพัฒน์ 2');
  assert.equal(value.districtCode, '1004');
  assert.equal(value.postcode, '10500');
  assert.equal(value.addressOverride, false);
});

test('🔴 ไซต์ยุคก่อน (ข้อความก้อนเดียว) — ข้อความเดิมอยู่ครบ ไม่ถูกประกอบทับด้วยจังหวัด', () => {
  const legacy = { ...bangkok, address: '2nd Floor, Victoria Gardens, Bangkok 10160' };
  assert.equal(siteAddressLegacy(legacy), true);
  assert.equal(siteAddressText(legacy), legacy.address);
  const { value } = normalizeSiteInput({ customerId: 'C1', name: 'A', ...legacy });
  assert.equal(value.address, legacy.address);
});

test('พิมพ์ข้อความเอง = ใช้ตามที่พิมพ์ แม้มีฟิลด์ย่อย (ที่อยู่ที่ไม่เข้าแบบ)', () => {
  const typed = { ...structured, addressOverride: true, address: 'ตึก A ประตู 3 (ฝั่งลานจอด)' };
  assert.equal(siteAddressText(typed), 'ตึก A ประตู 3 (ฝั่งลานจอด)');
  assert.equal(siteAddressLegacy(typed), false);
});

test('🔴 จังหวัดอย่างเดียวไม่ใช่ที่อยู่ — ไซต์ใหม่ที่ยังไม่กรอกอะไรต้องไม่ผ่านด่าน', () => {
  // ของลูกค้านับจังหวัดเป็นแถวมีโครงสร้าง ⇒ ถ้าใช้กติกาเดียวกัน ที่อยู่จะเป็น "กรุงเทพมหานคร"
  const blank = { ...newSite, line1: '', subdistrict: '', subdistrictCode: '', district: '', districtCode: '', postcode: '' };
  assert.equal(siteAddressText(blank), '');
  assert.match(siteCreateMissing(blank), /ต้องมีที่อยู่/);
  assert.equal(normalizeSiteInput(blank).value.address, null);
});

test('🔴 เลือกอำเภอ/ตำบลแล้วแต่ไม่มีบ้านเลขที่ = ไซต์ใหม่ไม่ผ่าน (พาไปได้แค่ระดับแขวง)', () => {
  assert.equal(siteCreateMissing(newSite), null);
  assert.match(siteCreateMissing({ ...newSite, line1: '' }), /บ้านเลขที่/);
  // พิมพ์ข้อความเองไม่ต้องมีช่องบ้านเลขที่
  assert.equal(siteCreateMissing({ ...newSite, line1: '', addressOverride: true, address: 'หลังตลาดสด' }), null);
});

test('⭐ ด่านไซต์ใหม่ถามจากข้อความที่ประกอบแล้ว — ฟอร์มที่แยกช่องไม่มี `address` ดิบก็ผ่าน', () => {
  assert.equal(siteCreateMissing({ ...newSite, address: '' }), null);
});

test('รหัสอำเภอ/ตำบลผิดรูปถูกตีกลับ · ไปรษณีย์ไม่ครบ = ยังไม่ได้กรอก', () => {
  assert.match(normalizeSiteInput({ ...newSite, districtCode: 'บางรัก' }).error, /รหัสอำเภอ/);
  assert.match(normalizeSiteInput({ ...newSite, subdistrictCode: '10-04' }).error, /รหัสตำบล/);
  assert.equal(normalizeSiteInput({ ...newSite, postcode: '105' }).value.postcode, null);
});

test('🔴 เพดาน 500 ตรวจกับข้อความที่ประกอบแล้ว (CHECK ของ mig 0187) ไม่ใช่ท่อนที่พิมพ์', () => {
  // ทุกท่อนอยู่ใต้เพดานของตัวเอง แต่ต่อกันแล้วเกิน — ปล่อยผ่านเมื่อไร update ทั้งแถวล้มที่ฐาน
  const { error } = normalizeSiteInput({
    ...newSite, line1: 'ก'.repeat(400), subdistrict: 'ข'.repeat(60), district: 'ค'.repeat(60),
  });
  assert.equal(error, 'ที่อยู่ยาวเกิน 500 ตัวอักษร');
});

// ── ก๊อปจากทะเบียนลูกค้า ─────────────────────────────────────────────────────
const registryStructured = {
  id: 'ADR-1', label: 'สาขาสีลม', ...structured,
  address: '', mapUrl: 'https://maps.example/reg', contactName: 'คุณบี', contactPhone: '02',
};
const registryLegacy = { id: 'ADR-2', address: '191 ถ.สีลม แขวงสีลม เขตบางรัก กทม. 10500', mapUrl: '' };

test('⭐ ไทล์ทะเบียนที่แยกช่องแล้ว → ฟอร์มไซต์ได้อำเภอ/ตำบลที่เลือกไว้ให้ครบ', () => {
  const carried = siteAddressCarry({}, registryStructured);
  assert.equal(carried.line1, '35 ซอยพิพัฒน์ 2');
  assert.equal(carried.districtCode, '1004');
  assert.equal(carried.subdistrictCode, '100401');
  assert.equal(carried.postcode, '10500');
  assert.equal(carried.addressOverride, false);
  assert.equal(siteAddressText({ ...bangkok, ...carried }), siteAddressText(structured));
});

test('⭐ ไทล์ข้อความก้อนเดียว → ล้างฟิลด์ย่อยเดิมทิ้ง (ไม่งั้นบ้านเลขที่เก่าประกอบทับข้อความใหม่)', () => {
  const carried = siteAddressCarry({ ...structured }, registryLegacy);
  assert.equal(carried.address, registryLegacy.address);
  assert.equal(carried.line1, '');
  assert.equal(carried.districtCode, '');
  assert.equal(siteAddressText({ ...structured, ...carried }), registryLegacy.address);
});

test('🔴 โหมดแก้: ทะเบียนคนละจังหวัดกับรหัสไซต์ → ไม่ก๊อปอำเภอ/ตำบล (ได้ข้อความก้อนเดียวแทน)', () => {
  const chiangMai = { ...registryStructured, provinceCode: '50', province: 'เชียงใหม่' };
  const carried = siteAddressCarry({ ...structured }, chiangMai, { keepProvinceCode: '10' });
  assert.equal(carried.districtCode, '');
  assert.equal(carried.line1, '');
  assert.match(carried.address, /เชียงใหม่/);
});

test('⭐ ทะเบียนว่าง ห้ามล้างที่อยู่ที่กรอกเอง', () => {
  const carried = siteAddressCarry({ ...structured }, { id: 'X', address: '', mapUrl: 'https://m/x' });
  assert.equal(carried.line1, undefined);
  assert.equal(carried.mapUrl, 'https://m/x');
});

test('⭐ ความต่างเทียบข้อความที่ประกอบแล้ว — `address` ดิบที่ค้างในฟอร์มต้องไม่ทำให้เตือนผิด', () => {
  const site = { ...structured, address: 'ข้อความเก่าก่อนแยก', mapUrl: registryStructured.mapUrl, contactName: 'คุณบี', contactPhone: '02' };
  assert.deepEqual(siteAddressDrift(site, registryStructured), []);
});

test('⭐ กด "ที่อยู่อื่น" หลังกดไทล์ → ถอดค่าที่ไทล์เติม แต่ไม่แตะช่องที่คนแก้แล้ว', () => {
  const afterTile = { ...bangkok, ...siteAddressCarry({}, registryStructured) };
  const edited = { ...afterTile, contactPhone: '089-999' };      // พิมพ์เบอร์หน้างานเองแล้ว
  const patch = siteAddressUncarry(edited, registryStructured);
  assert.equal(patch.line1, '');
  assert.equal(patch.districtCode, '');
  assert.equal(patch.provinceCode, '');
  assert.equal(patch.mapUrl, '');
  assert.equal(patch.contactPhone, undefined, 'เบอร์ที่พิมพ์เองต้องอยู่');
  // แก้ที่อยู่ต่อไปแล้ว = ที่อยู่เป็นของคนกรอก ไม่ถอด
  assert.deepEqual(Object.keys(siteAddressUncarry({ ...afterTile, line1: '99 ถนนใหม่' }, registryStructured))
    .filter((k) => k === 'line1'), []);
});

// ── ชั้นที่พิมพ์เองได้ ───────────────────────────────────────────────────────────
test('⭐ ชั้นที่ไม่อยู่ในรายการพิมพ์เองได้ — LG · UG · P1 · 12A · M2', () => {
  for (const [input, expected] of [
    ['LG', 'LG'], ['lg', 'LG'], ['ชั้น UG', 'UG'], ['p1', 'P1'], ['12A', '12A'], ['12a', '12A'],
    ['M2', 'M2'], ['03A', '3A'], ['B10', 'B10'],
  ]) {
    assert.equal(normalizeFloor(input).value, expected, input);
  }
});

test('ชั้นตัวเลขแบบป้ายลิฟต์ (4F · F4 · FL4) = ชั้นตัวเลขเดิม ไม่ใช่ชั้นที่พิมพ์เอง', () => {
  for (const input of ['4F', 'F4', 'FL4', '4', '04']) assert.equal(normalizeFloor(input).value, '04', input);
});

test('🔴 ชั้นที่พิมพ์เองต้องมีตัวอักษร 2–3 ตัว — ตัวเลขล้วน/ตัวเดียว/ไทย/ชั้น 0 ตีกลับ', () => {
  for (const input of ['L', 'B', '100', '0', '0F', 'ชั้นบน', 'LOBBY', '1-2', 'ชั้น 3-4']) {
    assert.ok(normalizeFloor(input).error, input);
  }
  assert.match(normalizeFloor('LOBBY').error, /LG/, 'ข้อความต้องบอกว่าพิมพ์ชั้นเองแบบไหนได้');
});

/* 🔴 ทุกค่าที่ตัวตรวจคืน ต้องผ่าน CHECK ของฐาน (mig 0384) — ไม่งั้นจอบอกผ่านแต่บันทึกล้ม */
const DB_FLOOR = (floor) => /^(0[1-9]|[1-9][0-9])$/.test(floor) || (/^[A-Z0-9]{2,3}$/.test(floor) && /[A-Z]/.test(floor));

test('🔴 ค่าที่ normalizeFloor คืน ผ่าน CHECK ของฐานทุกค่า — และ CHECK ในไฟล์ migration ตรงกับที่นี่', () => {
  const inputs = ['1', '9', '10', '99', 'G', 'M', 'R', 'GF', 'MZ', 'RF', 'B1', 'B9', 'LG', 'UG', 'P1', 'P10',
    '12A', '3a', 'M2', 'G1', 'FL', 'F7', '7F', 'B10', 'ชั้นลอย', 'ดาดฟ้า', 'ground', 'roof'];
  for (const input of inputs) {
    const { value } = normalizeFloor(input);
    assert.ok(value, input);
    assert.ok(DB_FLOOR(value), `${input} → ${value} ไม่ผ่าน CHECK`);
    assert.ok(ZONE_CODE_RE.test(`ZN-1001-${value}-10001`), `${value} ประกอบเป็นรหัสไม่ได้`);
  }
  for (const special of SPECIAL_FLOORS) assert.ok(DB_FLOOR(special.value), special.value);
  const sql = read('../supabase/migrations/0384_site_address_parts_custom_floor.sql');
  assert.match(sql, /floor ~ '\^\(0\[1-9\]\|\[1-9\]\[0-9\]\)\$'/);
  assert.match(sql, /floor ~ '\^\[A-Z0-9\]\{2,3\}\$' AND floor ~ '\[A-Z\]'/);
  assert.ok(CUSTOM_FLOOR_RE.test('LG') && !CUSTOM_FLOOR_RE.test('44') && !CUSTOM_FLOOR_RE.test('ABCD'));
});

test('รหัสโซนที่ชั้นพิมพ์เอง — ประกอบและแกะกลับได้', () => {
  assert.equal(zoneCodePrefix({ siteCode: 'ST-0121-01-BKK-1001', floor: 'lg' }).prefix, 'ZN-1001-LG-');
  assert.equal(zoneCodePrefix({ siteCode: 'ST-0121-01-BKK-1001', floor: '12a' }).prefix, 'ZN-1001-12A-');
  assert.deepEqual(parseZoneCode('ZN-1001-12A-10007'), { site: '1001', floor: '12A', run: '10007' });
  assert.ok(!ZONE_CODE_RE.test('ZN-1001-123-10001'));
  assert.ok(!ZONE_CODE_RE.test('ZN-1001-ABCD-10001'));
  assert.ok(!ZONE_CODE_RE.test('ZN-1001-A-10001'));
});

test('ป้ายชั้นที่พิมพ์เองอ่านว่า "ชั้น …"', () => {
  assert.equal(floorLabel('LG'), 'ชั้น LG');
  assert.equal(floorLabel('12A'), 'ชั้น 12A');
  assert.equal(floorLabel('B10'), 'ชั้นใต้ดิน 10');
});

test('⭐ ชิปลัด = ชั้นพิเศษ + ชั้นที่ไซต์นี้ใช้แล้ว (ไม่ซ้ำ · ค่าผิดรูปไม่ขึ้น · มีเพดาน)', () => {
  const chips = floorChipOptions(['lg', 'LG', '02', 'GF', 'ชั้นบนสุด', null, '12A']);
  const values = chips.map((c) => c.value);
  assert.deepEqual(values.slice(0, SPECIAL_FLOORS.length), SPECIAL_FLOORS.map((f) => f.value));
  assert.deepEqual(values.slice(SPECIAL_FLOORS.length), ['02', '12A', 'LG']);
  assert.equal(chips.find((c) => c.value === 'LG').label, 'ชั้น LG');
  const tall = floorChipOptions(Array.from({ length: 40 }, (_, i) => String(i + 1)));
  assert.equal(tall.length, SPECIAL_FLOORS.length + FLOOR_CHIP_EXTRA_MAX);
});

// ── ยามรูปโค้ด ────────────────────────────────────────────────────────────────
test('🔴 ฟอร์มไซต์ใช้ช่องที่อยู่ตัวเดียวกับทะเบียนลูกค้า — ห้ามกลับไปเป็น textarea ก้อนเดียว/ก๊อปหน้าตา', () => {
  const site = read('components/service/ServiceSiteFields.js');
  assert.match(site, /<ThaiAddressFields\b/);
  assert.doesNotMatch(site, /onChange=\{change\("address"\)\}/, 'ช่องข้อความก้อนเดียวแบบเดิมกลับมา');
  assert.match(read('components/database/AddressesEditor.js'), /<ThaiAddressFields\b/);
});

test('🔴 เส้นเขียนไซต์ทุกเส้นถามคอลัมน์ที่อยู่แยกช่องก่อนเขียน (ตัวออกรหัสทิ้งคอลัมน์เงียบ ๆ)', () => {
  for (const rel of [
    'app/api/service/sites/route.js',
    'app/api/service/sites/[id]/route.js',
    'app/api/service/legacy-sites/route.js',
  ]) {
    assert.match(read(rel), /siteAddressColumnsError\(supabase\)/, rel);
  }
});

test('ช่องชั้นเป็นช่องพิมพ์ + ชิปลัด ไม่ใช่ไทล์ห้าแผ่นที่รับแค่ชุดตายตัว', () => {
  const src = read('components/service/ServiceZoneFields.js');
  assert.match(src, /<ChoiceChips/);
  assert.match(src, /floorChipOptions\(knownFloors\)/);
  assert.doesNotMatch(src, /options=\{SPECIAL_FLOORS\}/);
});
