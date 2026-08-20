// ── หัวเอกสาร: ภาษาเดียว ทีละภาษา (มติผู้ใช้ 2026-08-21) ─────────────────────
//
// ชื่อเอกสารและชื่อบริษัทบนหัวกระดาษใช้ภาษาของใบนั้นอย่างเดียว — กลับกติกาเดิมที่
// ใบไทยพิมพ์ชื่ออังกฤษเป็นบรรทัดรอง และใบอังกฤษพิมพ์ชื่อไทยเป็นบรรทัดรอง
// "เพราะบริษัทเป็นนิติบุคคลไทย"
//
// ⚠️ กฎนี้อยู่ที่เปลือกกลาง (documentShell) ⇒ ใช้กับ **ทุกเอกสาร** ที่ผ่านเปลือก
// (ใบเสนอราคา · ใบสั่งขาย · ไทม์ไลน์โครงการ · ใบแจ้งภาษี · ใบวางบิล · PDR)
import test from 'node:test';
import assert from 'node:assert/strict';
import { documentHeader } from './documentShell.js';

const COMPANY = { nameTh: 'บริษัท ทดสอบ จำกัด', nameEn: 'TEST CO., LTD.', address: 'ที่อยู่', taxId: '1', phone: '2', line: '3' };
const TITLES = { titleTh: 'ใบเสนอราคา', titleEn: 'QUOTATION' };

test('เอกสารไทย: ชื่อเอกสาร/ชื่อบริษัทเป็นไทยล้วน ไม่มีบรรทัดอังกฤษ', () => {
  const html = documentHeader({ company: COMPANY, ...TITLES });
  assert.ok(html.includes('บริษัท ทดสอบ จำกัด'));
  assert.ok(html.includes('ใบเสนอราคา'));
  assert.ok(!html.includes('TEST CO., LTD.'), 'ชื่อบริษัทอังกฤษต้องไม่ขึ้นบนหัวใบไทย');
  assert.ok(!html.includes('QUOTATION'), 'ชื่อเอกสารอังกฤษต้องไม่ขึ้นบนหัวใบไทย');
});

test('เอกสารอังกฤษ: อังกฤษล้วน ไม่มีบรรทัดไทย', () => {
  const html = documentHeader({ company: COMPANY, ...TITLES, language: 'en' });
  assert.ok(html.includes('TEST CO., LTD.'));
  assert.ok(html.includes('QUOTATION'));
  assert.ok(!html.includes('บริษัท ทดสอบ จำกัด'));
  assert.ok(!html.includes('ใบเสนอราคา'));
});

test('ไม่มีภาษาที่ขอ = ตกไปอีกภาษา ไม่ปล่อยหัวใบว่าง', () => {
  const noEnglish = documentHeader({ company: { ...COMPANY, nameEn: '' }, titleTh: 'ใบเสนอราคา', titleEn: '', language: 'en' });
  assert.ok(noEnglish.includes('บริษัท ทดสอบ จำกัด'));
  assert.ok(noEnglish.includes('ใบเสนอราคา'));
  const noThai = documentHeader({ company: { ...COMPANY, nameTh: '' }, titleTh: '', titleEn: 'QUOTATION' });
  assert.ok(noThai.includes('TEST CO., LTD.'));
  assert.ok(noThai.includes('QUOTATION'));
});

test('ค่าที่มีแต่ช่องว่างนับเป็นไม่มี — ไม่ให้หัวใบเป็นบรรทัดเปล่า', () => {
  const html = documentHeader({ company: { ...COMPANY, nameEn: '   ' }, titleTh: 'ใบเสนอราคา', titleEn: '  ', language: 'en' });
  assert.ok(html.includes('บริษัท ทดสอบ จำกัด'));
  assert.ok(html.includes('ใบเสนอราคา'));
});
