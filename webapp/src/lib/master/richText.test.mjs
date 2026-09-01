// ข้อความของผู้ใช้ → ชิ้นส่วนที่ render ได้ (ลิงก์ + รหัสเอกสาร)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRichText, hasRichContent } from './richText.js';
import { DOC_REF_TYPES, docRefHref, parseDocRef } from './docRefs.js';

const kinds = (text) => parseRichText(text).map((p) => p.type).join('|');
const texts = (text) => parseRichText(text).map((p) => p.text).join('');

// ⭐ กติกาข้อแรกของไฟล์นี้: ตัวอักษรทุกตัวที่ผู้ใช้พิมพ์ต้องกลับออกมาครบ ไม่มีหาย
// ไม่มีเพิ่ม — ถ้าเพี้ยนแปลว่าเรากำลังกลืนเนื้อความของคนอื่น
test('ประกอบชิ้นส่วนกลับแล้วต้องได้ข้อความเดิมเป๊ะ', () => {
  for (const sample of [
    'ข้อความธรรมดา',
    'อ้างตาม QT-26070028-0 นะครับ',
    'ดูที่ https://example.com/a?b=1 ได้เลย',
    '(ตามใน PJ-26070027) และ www.example.co.th/x.',
    'ท้ายประโยคมีจุด https://example.com/a.',
    '',
  ]) {
    assert.equal(texts(sample), sample, sample);
  }
});

test('รหัสเอกสารกลายเป็นลิงก์ผ่านเส้นทางกลาง /go', () => {
  const parts = parseRichText('อ้างตาม QT-26070028-0 นะ');
  assert.deepEqual(parts.map((p) => p.type), ['text', 'doc', 'text']);
  assert.equal(parts[1].href, '/go/QT-26070028-0');
  /* ทุกชนิดในทะเบียนต้องจับได้จริง ไม่ใช่ประกาศไว้เฉย ๆ
     ⚠️ ใช้ `example` ของแต่ละชนิด ไม่ใช่เลข 8 หลักชุดเดียวครอบทุกคำนำหน้า — ตั้งแต่
     ทะเบียนถือรูปแบบรายชนิด (2026-09-01) `ST-26070001` ไม่ใช่รหัสไซต์ที่ถูกต้องแล้ว
     การทดสอบด้วยเลขที่ผิดรูปจึงเป็นการยืนยันสิ่งที่ระบบไม่ควรทำตั้งแต่แรก */
  for (const [prefix, ref] of Object.entries(DOC_REF_TYPES)) {
    assert.ok(ref.example, `${prefix}: ต้องมี example ให้เทสต์/เอกสารอ้างได้`);
    assert.equal(kinds(`ดู ${ref.example} ต่อ`), 'text|doc|text', `${prefix} (${ref.example})`);
  }
});

// 🪤 `\b` ของ JS ไม่รู้จักพยัญชนะไทย (ทุกตัวเป็น non-word) → รหัสที่ติดกับคำไทย
// จะถูกจับทั้งที่ไม่ใช่การอ้างเอกสาร ถ้าใช้ขอบเขตมาตรฐาน
test('ไม่จับรหัสที่ติดอยู่กับคำอื่น (ไทยหรืออังกฤษ)', () => {
  assert.equal(kinds('รหัสXQT-26070028'), 'text');
  assert.equal(kinds('QT-26070028ต่อท้าย'), 'text');
  assert.equal(kinds('ABQT-1'), 'text');
  // แต่ติดกับวรรคตอน/วงเล็บ = ยังเป็นการอ้างอิงปกติ
  assert.equal(kinds('(PJ-26070027)'), 'text|doc|text');
  assert.equal(kinds('ดู DL-26070099, และ'), 'text|doc|text');
});

test('URL: รองรับ www. และไม่กินวรรคตอนท้ายประโยค', () => {
  const dot = parseRichText('เปิด https://example.com/a.');
  assert.equal(dot[1].text, 'https://example.com/a');
  assert.equal(dot[2].text, '.');

  const www = parseRichText('เปิด www.example.co.th ได้');
  assert.equal(www[1].type, 'url');
  assert.equal(www[1].href, 'https://www.example.co.th', 'www. ต้องเติม scheme ให้');

  // วงเล็บที่เป็นส่วนหนึ่งของลิงก์ต้องไม่ถูกตัด
  const wiki = parseRichText('ดู https://x.com/a_(b) ต่อ');
  assert.equal(wiki[1].text, 'https://x.com/a_(b)');
});

// ⚠️ ลิงก์ที่มีรหัสอยู่ข้างในต้องไม่ถูกผ่าครึ่ง ไม่งั้น href พัง
test('รหัสที่อยู่ใน URL ไม่ถูกแยกเป็นลิงก์เอกสาร', () => {
  const parts = parseRichText('ไฟล์ https://drive.google.com/QT-26070028-0/view');
  assert.deepEqual(parts.map((p) => p.type), ['text', 'url']);
  assert.equal(parts[1].text, 'https://drive.google.com/QT-26070028-0/view');
});

// 🔴 ตัวป้องกัน XSS: ผู้ใช้พิมพ์อะไรก็ได้ ตัว parse ต้องคืนเป็น "ข้อความ" เสมอ
// (ตัว render ใส่ผ่าน text node) — ห้ามมีชิ้นส่วนชนิดอื่นโผล่จาก markup ที่พิมพ์มา
test('markup ที่ผู้ใช้พิมพ์ยังเป็นข้อความล้วน', () => {
  const evil = '<img src=x onerror=alert(1)> <script>alert(2)</script>';
  assert.equal(kinds(evil), 'text');
  assert.equal(texts(evil), evil);
  // javascript: ไม่ถูกจับเป็นลิงก์ (pattern รับแค่ http/https/www.)
  assert.equal(kinds('javascript:alert(1)'), 'text');
});

test('hasRichContent / parseDocRef / docRefHref', () => {
  assert.equal(hasRichContent('ข้อความเปล่า'), false);
  assert.equal(hasRichContent('มี PJ-26070027 อยู่'), true);
  assert.equal(parseDocRef('pj-26070027')?.table, 'projects', 'พิมพ์เล็กก็ต้องรู้จัก');
  assert.equal(parseDocRef('ZZ-1'), null);
  assert.equal(parseDocRef('QT-'), null);
  assert.equal(docRefHref(' qt-26070028-0 '), '/go/QT-26070028-0');
});
