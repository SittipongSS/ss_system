// ── ทะเบียนภาค/ตัวย่อจังหวัด — ยามของรหัสไซต์ ST ──────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROVINCE_CODES, REGIONS, provinceAbbr, provinceRegion, regionLabel,
} from './thaiProvinces.js';

// อ่านทะเบียนจังหวัดจริงของระบบ (ไฟล์ generate 650KB) — ไม่ import เพราะหนัก
// และเป็นค่าคงที่ที่แกะด้วย regex ได้ตรง ๆ
function provincesFromRegistry() {
  const src = readFileSync('src/data/thaiAdmin.js', 'utf8');
  const json = JSON.parse(src.slice(src.indexOf('export default ') + 15).trim().replace(/;\s*$/, ''));
  return json.map((p) => ({ code: p.code, th: p.th }));
}

test('🔴 ทุกจังหวัดในทะเบียนต้องมีทั้งภาคและตัวย่อ — ขาดใบเดียวคือลูกค้าจังหวัดนั้นสร้างไซต์ไม่ได้', () => {
  const missing = provincesFromRegistry()
    .filter((p) => !provinceAbbr(p.code) || !provinceRegion(p.code))
    .map((p) => `${p.code} ${p.th}`);
  assert.deepEqual(missing, [], `จังหวัดที่ยังไม่มีในทะเบียนภาค: ${missing.join(' · ')}`);
});

test('ทะเบียนต้องไม่มีจังหวัดเกินจากที่มีจริง — รหัสที่ไม่มีจริงคือรหัสไซต์ที่ตามกลับไม่ได้', () => {
  const real = new Set(provincesFromRegistry().map((p) => String(Number(p.code))));
  const extra = PROVINCE_CODES.filter((code) => !real.has(String(Number(code))));
  assert.deepEqual(extra, []);
});

test('🔴 ตัวย่อห้ามซ้ำ — ซ้ำเมื่อไรรหัสไซต์ของสองจังหวัดอ่านเหมือนกัน', () => {
  const seen = new Map();
  for (const code of PROVINCE_CODES) {
    const abbr = provinceAbbr(code);
    assert.match(abbr, /^[A-Z]{3}$/, `${code}: ตัวย่อต้องเป็นอักษรอังกฤษพิมพ์ใหญ่ 3 ตัว`);
    assert.equal(seen.has(abbr), false, `ตัวย่อ ${abbr} ซ้ำ (${seen.get(abbr)} กับ ${code})`);
    seen.set(abbr, code);
  }
});

test('ภาคต้องอยู่ในชุด 01–07 ที่ประกาศไว้ และทุกภาคต้องมีจังหวัดจริง', () => {
  const used = new Set();
  for (const code of PROVINCE_CODES) {
    const region = provinceRegion(code);
    assert.ok(REGIONS[region], `${code}: ภาค ${region} ไม่อยู่ในทะเบียน`);
    used.add(region);
  }
  assert.deepEqual([...used].sort(), Object.keys(REGIONS).sort());
});

test('รับรหัสที่มีศูนย์นำและตัวเลขล้วนเหมือนกัน — ทะเบียนเก็บเป็นสตริง จอส่งมาได้ทั้งสองแบบ', () => {
  assert.equal(provinceAbbr('10'), 'BKK');
  assert.equal(provinceAbbr(10), 'BKK');
  assert.equal(provinceRegion('10'), '01');
  assert.equal(provinceAbbr('  50 '), 'CNX');
});

test('ค่าที่ไม่ใช่รหัสจังหวัดต้องคืน null ไม่ใช่เดา', () => {
  for (const bad of ['', null, undefined, 'BKK', '999', '0', 'ก']) {
    assert.equal(provinceAbbr(bad), null, `${bad}`);
    assert.equal(provinceRegion(bad), null, `${bad}`);
  }
  // 0 กับ 99 เป็นตัวเลขที่รูปถูกแต่ไม่มีจังหวัดจริง
  assert.equal(provinceAbbr('99'), null);
});

test('ปริมณฑลอยู่ภาค 01 ไม่ใช่ภาคกลาง (มติผู้ใช้ 2026-08-29)', () => {
  for (const code of ['10', '11', '12', '13', '73', '74']) {
    assert.equal(provinceRegion(code), '01', code);
  }
  assert.equal(provinceRegion('14'), '02');   // อยุธยา = ภาคกลาง
  assert.equal(regionLabel('01'), 'กรุงเทพฯ และปริมณฑล');
  assert.equal(regionLabel('09'), null);
});
