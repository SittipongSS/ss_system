// ── ทะเบียนภาค/ตัวย่อจังหวัด — ยามของรหัสไซต์ ST ──────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROVINCE_CODES, REGIONS, provinceAbbr, provinceFromText, provinceRegion, regionLabel,
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

// ── แกะจังหวัดจากข้อความที่อยู่ (มติผู้ใช้ 2026-08-30) ─────────────────────
const SAMPLE = [
  { code: '10', th: 'กรุงเทพมหานคร', en: 'Bangkok' },
  { code: '50', th: 'เชียงใหม่', en: 'Chiang Mai' },
  { code: '80', th: 'นครศรีธรรมราช', en: 'Nakhon Si Thammarat' },
  { code: '60', th: 'นครสวรรค์', en: 'Nakhon Sawan' },
  { code: '20', th: 'ชลบุรี', en: 'Chon Buri' },
];

test('แกะจังหวัดจากที่อยู่ข้อความล้วน — ทางถอยของแถวที่ยังไม่มี provinceCode', () => {
  assert.equal(provinceFromText('45,47 ถนนนราธิวาส แขวงสีลม เขตบางรัก กรุงเทพมหานคร 10500', SAMPLE).code, '10');
  assert.equal(provinceFromText('191 ถ.สีลม เขตบางรัก กทม. 10500', SAMPLE).code, '10');
  assert.equal(provinceFromText('12 ถ.นิมมานเหมินท์ อ.เมือง จ.เชียงใหม่ 50200', SAMPLE).code, '50');
  assert.equal(provinceFromText('99/1 Moo 5, Chon Buri 20150', SAMPLE).code, '20');
});

test('🔴 ชื่อยาวต้องชนะชื่อสั้น — ไม่งั้น "นครศรีธรรมราช" กลายเป็น "นครสวรรค์"', () => {
  assert.equal(provinceFromText('88 ต.ปากพูน อ.เมือง จ.นครศรีธรรมราช 80000', SAMPLE).code, '80');
});

test('🔴 เดาไม่ได้ต้องคืน null — จังหวัดผิดถูกตรึงในรหัสไซต์ถาวร', () => {
  assert.equal(provinceFromText('123 หมู่ 4', SAMPLE), null);
  assert.equal(provinceFromText('', SAMPLE), null);
  assert.equal(provinceFromText(null, SAMPLE), null);
  // จังหวัดที่ไม่อยู่ในทะเบียนภาคของเรา (รหัสมั่ว) ต้องไม่ถูกหยิบมาใช้
  assert.equal(provinceFromText('เมืองสมมติ', [{ code: '99', th: 'เมืองสมมติ' }]), null);
});
