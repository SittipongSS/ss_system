// ── รหัสไซต์ ST + รหัสโซน ZN รูปใหม่ (มติผู้ใช้ 2026-08-29) ────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_CODE_RE, SITE_RUN_START, SITE_RUN_WIDTH,
  LEGACY_SITE_CODE_RE, parseSiteCode, siteCodePrefix, siteRunOf,
} from './siteCode.js';
import {
  ZONE_CODE_RE, ZONE_RUN_START, ZONE_RUN_WIDTH,
  floorLabel, normalizeFloor, parseZoneCode, zoneCodePrefix,
} from './zoneCode.js';

test('ประกอบ prefix ของรหัสไซต์จากรหัสลูกค้า + จังหวัด', () => {
  assert.equal(siteCodePrefix({ arCode: 'AR-121', provinceCode: '10' }).prefix, 'ST-0121-01-BKK-');
  // รหัสลูกค้า 4 หลัก (ระบบออกให้) ใช้ตรง ๆ ไม่เติมศูนย์ทับ
  assert.equal(siteCodePrefix({ arCode: 'AR-1001', provinceCode: '50' }).prefix, 'ST-1001-03-CNX-');
  // ⭐ AR-000 มีจริงบน production (บริษัทตัวเอง) — ต้องออกรหัสได้ ไม่ใช่ตกด่าน
  assert.equal(siteCodePrefix({ arCode: 'AR-000', provinceCode: '10' }).prefix, 'ST-0000-01-BKK-');
});

test('🔴 ขาดรหัสลูกค้าหรือจังหวัด ต้องบอกว่าไปแก้ที่ไหน ไม่ใช่คืนค่าว่าง', () => {
  const noAr = siteCodePrefix({ arCode: null, provinceCode: '10' });
  assert.equal(noAr.prefix, null);
  assert.match(noAr.error, /ทะเบียนลูกค้า/);

  const noProvince = siteCodePrefix({ arCode: 'AR-121', provinceCode: '' });
  assert.equal(noProvince.prefix, null);
  assert.match(noProvince.error, /จังหวัด/);

  // จังหวัดที่ไม่มีจริงต้องตกด่านเดียวกัน ไม่ใช่ประกอบรหัสที่ตามกลับไม่ได้
  assert.equal(siteCodePrefix({ arCode: 'AR-121', provinceCode: '99' }).prefix, null);
});

test('รูปแบบรหัสไซต์ + การแกะส่วน', () => {
  assert.ok(SITE_CODE_RE.test('ST-0121-01-BKK-1001'));
  assert.ok(!SITE_CODE_RE.test('ST-121-01-BKK-1001'));       // รหัสลูกค้าต้อง 4 หลัก
  assert.ok(!SITE_CODE_RE.test('ST-0121-01-BK-1001'));       // ตัวย่อต้อง 3 ตัว
  assert.ok(!SITE_CODE_RE.test('ST-0121-01-BKK-10001'));     // เลขรันต้อง 4 หลักพอดี
  assert.ok(LEGACY_SITE_CODE_RE.test('SS-26080005'));

  assert.deepEqual(parseSiteCode('ST-0121-01-BKK-1001'),
    { customer: '0121', region: '01', province: 'BKK', run: '1001' });
  assert.equal(parseSiteCode('SS-26080005'), null);
});

test('🔴 เลขรันของไซต์คือตัวที่รหัสโซนอ้าง — รหัสรูปเก่าต้องคืน null', () => {
  assert.equal(siteRunOf('ST-0121-01-BKK-1042'), '1042');
  assert.equal(siteRunOf('SS-26080005'), null);
  assert.equal(siteRunOf(''), null);
  assert.equal(siteRunOf(null), null);
});

test('ชั้น: ตัวเลขเติมศูนย์ · ชั้นพิเศษแปลงเป็นค่ามาตรฐาน', () => {
  assert.equal(normalizeFloor(4).value, '04');
  assert.equal(normalizeFloor('4').value, '04');
  assert.equal(normalizeFloor('04').value, '04');
  assert.equal(normalizeFloor('12').value, '12');
  assert.equal(normalizeFloor('ชั้น 3').value, '03');
  assert.equal(normalizeFloor('G').value, 'GF');
  assert.equal(normalizeFloor('g').value, 'GF');
  assert.equal(normalizeFloor('ชั้น G').value, 'GF');
  assert.equal(normalizeFloor('M').value, 'MZ');
  assert.equal(normalizeFloor('B1').value, 'B1');
  assert.equal(normalizeFloor('RF').value, 'RF');
});

test('🔴 ชั้นว่างหรือรูปผิดต้องตีกลับ — ชั้นเป็นส่วนหนึ่งของรหัส ไม่ใช่ข้อมูลเสริม', () => {
  assert.match(normalizeFloor('').error, /ต้องระบุชั้น/);
  assert.match(normalizeFloor(null).error, /ต้องระบุชั้น/);
  // ชั้น 0 ไม่มีในโลกจริง — ชั้นล่างคือ G หรือ 01
  assert.ok(normalizeFloor('0').error);
  assert.ok(normalizeFloor('100').error);
  assert.ok(normalizeFloor('ชั้นบน').error);
});

test('ป้ายชั้นที่คนอ่าน', () => {
  assert.equal(floorLabel('04'), 'ชั้น 4');
  assert.equal(floorLabel('GF'), 'ชั้น G');
  assert.equal(floorLabel('MZ'), 'ชั้นลอย');
  assert.equal(floorLabel('B2'), 'ชั้นใต้ดิน 2');
  assert.equal(floorLabel('RF'), 'ดาดฟ้า');
  assert.equal(floorLabel(''), null);
});

test('ประกอบ prefix ของรหัสโซนจากรหัสไซต์ + ชั้น', () => {
  assert.equal(zoneCodePrefix({ siteCode: 'ST-0121-01-BKK-1001', floor: 'G' }).prefix, 'ZN-1001-GF-');
  assert.equal(zoneCodePrefix({ siteCode: 'ST-0121-01-BKK-1001', floor: 4 }).prefix, 'ZN-1001-04-');
});

test('🔴 ไซต์ที่ยังเป็นรหัสเดิมเพิ่มโซนไม่ได้ — ต้องบอกให้ไปออกรหัสไซต์ใหม่ก่อน', () => {
  const legacy = zoneCodePrefix({ siteCode: 'SS-26080005', floor: '4' });
  assert.equal(legacy.prefix, null);
  assert.match(legacy.error, /ST-XXXX-AA-BBB-CCCC/);
  // ชั้นผิดต้องได้ข้อความของชั้น ไม่ใช่ข้อความของไซต์
  assert.match(zoneCodePrefix({ siteCode: 'ST-0121-01-BKK-1001', floor: '' }).error, /ต้องระบุชั้น/);
});

test('รูปแบบรหัสโซน + การแกะส่วน', () => {
  assert.ok(ZONE_CODE_RE.test('ZN-1001-04-10001'));
  assert.ok(ZONE_CODE_RE.test('ZN-1001-GF-10012'));
  assert.ok(ZONE_CODE_RE.test('ZN-1001-B2-99999'));
  assert.ok(!ZONE_CODE_RE.test('ZN-1001-00-10001'));   // ชั้น 00 ไม่มี
  assert.ok(!ZONE_CODE_RE.test('ZN-10001-04-10001')); // เลขไซต์ต้อง 4 หลัก
  assert.ok(!ZONE_CODE_RE.test('ZN-1001-04-001'));    // เลขรันต้อง 5 หลัก

  assert.deepEqual(parseZoneCode('ZN-1001-GF-10007'), { site: '1001', floor: 'GF', run: '10007' });
  assert.equal(parseZoneCode('ZN-26080005'), null);
});

/* 🔴 เพดานของเลขรัน = ความกว้าง — ตัวออกรหัสโยน sequence_exhausted เมื่อเลขเกิน
   `10^width - 1` (0297:150) · ตัวเลขสองตัวนี้จึงไม่ใช่แค่ "รูปแบบสวย ๆ" */
test('🔴 ความกว้างเลขรันต้องพอกับของจริง — ไซต์ 9999 · โซน 99999', () => {
  assert.equal(SITE_RUN_WIDTH, 4);
  assert.equal(ZONE_RUN_WIDTH, 5);
  // เลขเริ่มต้องมีหลักครบตามความกว้าง (ไม่งั้นรหัสใบแรกจะสั้นกว่าใบถัดไป)
  assert.equal(String(SITE_RUN_START + 1).length, SITE_RUN_WIDTH);
  assert.equal(String(ZONE_RUN_START + 1).length, ZONE_RUN_WIDTH);
});
