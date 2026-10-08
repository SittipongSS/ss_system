// ── ข้อเท็จจริงของ PDF ที่ chromium พิมพ์ (สเปก PR-2 §4 · §12) ───────────────────────────────
//
// PDF ในเทสต์เป็นข้อความที่ประกอบเอง ตามรูปที่ Chrome (Skia) เขียน: dictionary ของหน้าและฟอนต์เป็นข้อความเปล่า
// ระหว่างก้อน stream ที่เป็นไบต์ดิบ — ไม่เปิด chromium ในเทสต์
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pdfFonts, pdfInspect, pdfPageCount } from './pdfInspect.js';

const page = (n) => `${n} 0 obj\n<</Type /Page\n/Resources <</Font <</F1 9 0 R>>>>\n/MediaBox [0 0 595.92 842.88]\n/Parent 2 0 R>>\nendobj\n`;
const font = (n, name) => `${n} 0 obj\n<</Type /Font\n/Subtype /Type0\n/BaseFont /${name}\n/Encoding /Identity-H>>\nendobj\n`
  + `${n + 1} 0 obj\n<</Type /FontDescriptor\n/FontName /${name}\n/Flags 4>>\nendobj\n`;

function fakePdf({ pages = 2, fonts = ['AAAAAA+Sarabun-Regular', 'BCDEFG+Sarabun-Bold'], type3 = 0 } = {}) {
  const parts = ['%PDF-1.4\n%Óëéá\n'];
  parts.push(`2 0 obj\n<</Type /Pages\n/Count ${pages}\n/Kids [${Array.from({ length: pages }, (_, i) => `${10 + i} 0 R`).join(' ')}]>>\nendobj\n`);
  for (let i = 0; i < pages; i += 1) parts.push(page(10 + i));
  fonts.forEach((name, i) => parts.push(font(40 + i * 2, name)));
  for (let i = 0; i < type3; i += 1) parts.push(`${80 + i} 0 obj\n<</Type /Font\n/Subtype /Type3\n/FontBBox [0 0 1 1]>>\nendobj\n`);
  // ก้อน stream ไบต์ดิบ (ทุกค่า 0–255) — ต้องไม่ทำให้ตัวอ่านเพี้ยน
  const stream = Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256));
  return Buffer.concat([Buffer.from(parts.join(''), 'latin1'), Buffer.from('90 0 obj\n<</Length 512>>\nstream\n', 'latin1'), stream, Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1')]);
}

test('pdfPageCount: นับ object ชนิด Page — ไม่นับ /Pages (ต้นไม้หน้า)', () => {
  assert.equal(pdfPageCount(fakePdf({ pages: 4 })), 4);
  assert.equal(pdfPageCount(fakePdf({ pages: 1 })), 1);
  assert.equal(pdfPageCount(Buffer.from('<</Type/Page>> <</Type /Pages>> <</Type  /Page /Parent 1 0 R>>', 'latin1')), 2);
});

test('pdfPageCount: นับไม่ได้ = null (ไม่ใช่ 0) — ด่านกระดาษต้องแยก "ไม่รู้" ออกจาก "ไม่มีหน้า"', () => {
  assert.equal(pdfPageCount(Buffer.from('ไม่ใช่ PDF')), null);
  assert.equal(pdfPageCount(Buffer.alloc(0)), null);
  assert.equal(pdfPageCount(null), null);
  assert.equal(pdfPageCount('ข้อความ'), null);
});

test('pdfFonts: ชื่อจาก /BaseFont กับ /FontName ตัดคำนำหน้า subset · ไม่ซ้ำ · เรียงตามตัวอักษร', () => {
  assert.deepEqual(pdfFonts(fakePdf()), { names: ['Sarabun-Bold', 'Sarabun-Regular'], type3: 0 });
  // ตัวเดียวกันสอง subset = ชื่อเดียว
  assert.deepEqual(
    pdfFonts(fakePdf({ fonts: ['AAAAAA+Sarabun-Regular', 'ZZZZZZ+Sarabun-Regular'] })),
    { names: ['Sarabun-Regular'], type3: 0 },
  );
});

test('🔴 pdfFonts: ฟอนต์ที่เครื่องหยิบมาแทน (อักขระที่ Sarabun ไม่มี) โผล่ในรายการ · Type3 ถูกนับแยก', () => {
  const fonts = pdfFonts(fakePdf({ fonts: ['AAAAAA+Sarabun-Regular', 'QWERTY+OpenSans-Regular'], type3: 2 }));
  assert.deepEqual(fonts, { names: ['OpenSans-Regular', 'Sarabun-Regular'], type3: 2 });
  assert.deepEqual(fonts.names.filter((name) => !/^Sarabun-/.test(name)), ['OpenSans-Regular']);
});

test('pdfFonts: อินพุตที่ไม่ใช่ไบต์ = รายการว่าง ไม่ throw', () => {
  assert.deepEqual(pdfFonts(null), { names: [], type3: 0 });
  assert.deepEqual(pdfFonts(undefined), { names: [], type3: 0 });
  assert.deepEqual(pdfFonts({}), { names: [], type3: 0 });
});

test('pdfInspect: { bytes, sha256, pages, fonts } — รูปของแถว audit ต่อฉบับ', () => {
  const pdf = fakePdf({ pages: 3 });
  assert.deepEqual(pdfInspect(pdf), {
    bytes: pdf.length,
    sha256: createHash('sha256').update(pdf).digest('hex'),
    pages: 3,
    fonts: { names: ['Sarabun-Bold', 'Sarabun-Regular'], type3: 0 },
  });
  assert.match(pdfInspect(pdf).sha256, /^[0-9a-f]{64}$/);
});

test('pdfInspect: รับ Uint8Array (puppeteer รุ่นใหม่) ได้ผลเท่ากับ Buffer — รวมมุมมองที่ไม่เริ่มต้นไบต์แรกของ ArrayBuffer', () => {
  const pdf = fakePdf({ pages: 2 });
  assert.deepEqual(pdfInspect(new Uint8Array(pdf)), pdfInspect(pdf));
  const padded = Buffer.concat([Buffer.from('XXXXXXXX /Type /Page '), pdf]);
  const view = new Uint8Array(padded.buffer, padded.byteOffset + 21, pdf.length);
  assert.deepEqual(pdfInspect(view), pdfInspect(pdf));
});

test('pdfInspect: ไบต์เดียวกัน = sha เดียวกัน · ต่างไบต์เดียว = sha ต่าง', () => {
  const a = fakePdf();
  const b = Buffer.from(a);
  assert.equal(pdfInspect(a).sha256, pdfInspect(b).sha256);
  b[b.length - 1] ^= 1;
  assert.notEqual(pdfInspect(a).sha256, pdfInspect(b).sha256);
});

test('pdfInspect: อินพุตที่ไม่ใช่ไบต์ = ค่าว่าง ไม่ throw (audit เป็น best effort)', () => {
  const empty = { bytes: 0, sha256: null, pages: null, fonts: { names: [], type3: 0 } };
  assert.deepEqual(pdfInspect(null), empty);
  assert.deepEqual(pdfInspect(undefined), empty);
  assert.deepEqual(pdfInspect('%PDF-1.4'), empty);
  // ไบต์ที่ไม่ใช่ PDF: มีขนาดกับ sha แต่นับหน้าไม่ได้
  const junk = pdfInspect(Buffer.from('hello'));
  assert.equal(junk.bytes, 5);
  assert.equal(junk.pages, null);
  assert.deepEqual(junk.fonts, { names: [], type3: 0 });
});
