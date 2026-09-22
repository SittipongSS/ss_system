// ── แถวช่องลงนามของเปลือกกลาง (QT · SO · FM-SA-04 ใช้ตัวเดียวกัน) ─────────────────────
//
// 🐞 ตรวจรอบสาม (2026-09-22): `data-columns="N"` เดิมมีกฎ CSS เฉพาะ 4 ⇒ ผู้เรียกที่ส่ง 2 หรือ 5 ช่องได้กริดสามคอลัมน์เงียบ ๆ
//   ⇒ จำนวนคอลัมน์มาจากตัวแปร `--sig-cols` ตัวเดียว
// ⚠️ คอลัมน์ยังเป็น `1fr` (ถ่างได้ตามชื่อที่ไม่มีจุดตัด) โดยตั้งใจ — แบบกว้างเท่ากันบังคับ (minmax(0, 1fr)) ทำให้แถวลงนาม
//    ของ QT/SO สูงเกินที่แบ่งหน้า v4 จองไว้ (วัดแล้ว 157 > 145px) · เหตุผลเต็มอยู่ที่ CSS ของ `.signatures` ในเปลือก
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDocumentHTML, signatureSection } from './documentShell.js';
import { quotationDocLabels } from '../sales/quotationMasterTemplate.js';

const L = quotationDocLabels('th');
const signers = (n) => Array.from({ length: n }, (_, i) => ({ label: `ช่อง ${i + 1}`, role: 'Account Executive' }));
const openTag = (html) => html.match(/<section class="signatures"[^>]*>/)[0];

test('สามช่อง (QT/SO) ไม่ติดอะไรเพิ่ม — HTML ของใบเสนอราคา/ใบสั่งขายเหมือนเดิมทุกตัวอักษร', () => {
  assert.equal(openTag(signatureSection(signers(3), L)), '<section class="signatures" aria-label="ส่วนลงนาม">');
});

test('จำนวนช่องอื่นตั้ง --sig-cols ตามจำนวนจริง — ไม่ใช่เฉพาะ 4', () => {
  for (const n of [2, 4, 5]) {
    const html = signatureSection(signers(n), L);
    assert.equal(openTag(html), `<section class="signatures" style="--sig-cols: ${n}" aria-label="ส่วนลงนาม">`);
    assert.equal((html.match(/<h2>/g) || []).length, n);
  }
});

test('CSS กลาง: คอลัมน์มาจาก --sig-cols (ตั้งต้น 3) · ไม่มีกฎรายจำนวนเหลือ', () => {
  const css = renderDocumentHTML({ title: 't', pages: '' });
  assert.match(css, /\.signatures \{ --sig-cols: 3; display: grid; grid-template-columns: repeat\(var\(--sig-cols\), 1fr\);/);
  assert.doesNotMatch(css, /\.signatures\[data-columns/, 'กฎรายจำนวนเดิมต้องไม่เหลือ');
});
