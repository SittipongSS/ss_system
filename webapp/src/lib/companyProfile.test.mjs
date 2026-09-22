import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COMPANY_PROFILE_FALLBACK,
  mapPublishedCompany,
  resolveCompanyBlock,
} from './companyProfile.js';

const PUBLISHED_ROW = {
  legalNameTh: 'บริษัท ทดสอบ จำกัด',
  legalNameEn: 'TEST CO., LTD.',
  taxId: '9999999999999',
  branchCode: '00012',
  registeredAddressTh: '99 ถนนทดสอบ กรุงเทพฯ',
  registeredAddressEn: '99 Test Rd, Bangkok',
  phone: '02-111-2222',
  email: 'hello@test.co.th',
  lineId: '@test',
  website: 'www.test.co.th',
};

test('mapPublishedCompany: null row → null', () => {
  assert.equal(mapPublishedCompany(null), null);
  assert.equal(mapPublishedCompany(undefined), null);
});

test('mapPublishedCompany: map ชื่อคอลัมน์ DB → คีย์กลาง (address/line มาจาก registeredAddressTh/lineId)', () => {
  const block = mapPublishedCompany(PUBLISHED_ROW);
  assert.equal(block.legalNameTh, 'บริษัท ทดสอบ จำกัด');
  assert.equal(block.legalNameEn, 'TEST CO., LTD.');
  assert.equal(block.address, '99 ถนนทดสอบ กรุงเทพฯ');
  assert.equal(block.addressEn, '99 Test Rd, Bangkok');
  assert.equal(block.taxId, '9999999999999');
  assert.equal(block.branchCode, '00012');
  assert.equal(block.phone, '02-111-2222');
  assert.equal(block.email, 'hello@test.co.th');
  assert.equal(block.line, '@test');
  assert.equal(block.website, 'www.test.co.th');
});

test('mapPublishedCompany: ช่อง optional ว่าง → null (ไม่ใช่ "")', () => {
  const block = mapPublishedCompany({ ...PUBLISHED_ROW, registeredAddressEn: '', email: '   ' });
  assert.equal(block.addressEn, null);
  assert.equal(block.email, null);
});

test('resolveCompanyBlock: null → fallback constants ล้วน', () => {
  const block = resolveCompanyBlock(null);
  assert.deepEqual(block, { ...COMPANY_PROFILE_FALLBACK });
  // ช่องบังคับต้องไม่ว่าง
  assert.ok(block.legalNameTh);
  assert.ok(block.taxId);
  assert.ok(block.branchCode);
});

test('resolveCompanyBlock: เติมเฉพาะช่องที่ขาด/ว่างจาก fallback, คงค่าที่ส่งมา', () => {
  const block = resolveCompanyBlock({ legalNameTh: 'ชื่อใหม่', phone: null, email: '' });
  assert.equal(block.legalNameTh, 'ชื่อใหม่');
  // phone null / email '' → fallback
  assert.equal(block.phone, COMPANY_PROFILE_FALLBACK.phone);
  assert.equal(block.email, COMPANY_PROFILE_FALLBACK.email);
  assert.equal(block.website, COMPANY_PROFILE_FALLBACK.website);
});

test('resolveCompanyBlock: trim ค่าที่ส่งมา', () => {
  const block = resolveCompanyBlock({ legalNameTh: '  ชื่อ  ', taxId: ' 1234567890123 ' });
  assert.equal(block.legalNameTh, 'ชื่อ');
  assert.equal(block.taxId, '1234567890123');
});

test('pipeline: resolveCompanyBlock(mapPublishedCompany(row)) = ค่าที่เผยแพร่', () => {
  const block = resolveCompanyBlock(mapPublishedCompany(PUBLISHED_ROW));
  assert.equal(block.legalNameTh, 'บริษัท ทดสอบ จำกัด');
  assert.equal(block.legalNameEn, 'TEST CO., LTD.');
  assert.equal(block.address, '99 ถนนทดสอบ กรุงเทพฯ');
  assert.equal(block.taxId, '9999999999999');
  assert.equal(block.branchCode, '00012');
});

test('COMPANY_PROFILE_FALLBACK: ชื่ออังกฤษใช้ & ตรง baseline (ไม่ใช่ AND)', () => {
  assert.equal(COMPANY_PROFILE_FALLBACK.legalNameEn, 'SCENT & SENSE LABORATORY CO., LTD.');
});

/* ── ห้ามอ่านตาราง `company_profile` ─────────────────────────────────────────
   🐞 2026-09-22 route พิมพ์ FM-SA-04 และ PDR อ่าน `supabase.from('company_profile')` ซึ่ง
   **ไม่มีตารางนี้บนฐานจริง** ("Could not find the table 'public.company_profile'") แล้ว
   destructure แค่ `data` ⇒ error ถูกทิ้ง กระดาษพิมพ์ค่าสำรองใน documentBrand.js ทุกใบ
   ไม่เคยเห็นค่าที่เผยแพร่ในหน้าตั้งค่าองค์กร และไม่มีด่านไหนเห็น
   ด่านนี้: ของจริงคือ `organization_setting_versions` ผ่าน `getPublishedCompanyProfile`
   (lib/admin/organizationSettings.js) ⇒ โค้ดใต้ src/ ห้ามเรียก `.from('company_profile')` */
const WEBAPP = process.cwd();
function walkSource(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(WEBAPP, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSource(rel, out);
    else if (/\.(m?js|jsx)$/.test(entry.name) && !/\.test\.m?js$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test('ไม่มีโค้ดใต้ src/ อ่านตาราง company_profile (ไม่มีอยู่จริง — ใช้ getPublishedCompanyProfile)', () => {
  const hits = [];
  for (const file of walkSource('src')) {
    const source = fs.readFileSync(path.join(WEBAPP, file), 'utf8');
    if (/\.from\(\s*['"`]company_profile['"`]\s*\)/.test(source)) hits.push(file);
  }
  assert.deepEqual(hits, [], `อ่านตาราง company_profile ที่ไม่มีอยู่จริง: ${hits.join(', ')}`);
});
