// ── ลิงก์ฝังเอกสาร Google ─────────────────────────────────────────────────
// 🐞 กับดักที่เทสต์นี้กันไว้: `fileUrl` ที่ระบบเก็บคือ webViewLink (`/edit`) ซึ่ง
// **ฝัง iframe ไม่ได้** — Google ส่ง X-Frame-Options มาบล็อก และมันล้มแบบเงียบ
// (iframe ข้ามโดเมน หน้าแม่ตรวจไม่ได้เลย) ⇒ ถ้าใครเผลอเอา fileUrl ไปใส่ iframe
// ตรง ๆ จะได้กรอบว่างที่ไม่มีใครรู้ว่าพัง
import test from 'node:test';
import assert from 'node:assert/strict';
import { googleDocKindLabel, googleDocPreviewUrl, isGoogleDoc } from './googleDocView.js';

test('ลิงก์ฝังต้องเป็น /preview และแยก path ตามชนิดเอกสาร', () => {
  assert.equal(
    googleDocPreviewUrl({ metadata: { kind: 'gdoc', googleFileId: 'D1' } }),
    'https://docs.google.com/document/d/D1/preview',
  );
  assert.equal(
    googleDocPreviewUrl({ metadata: { kind: 'gsheet', googleFileId: 'S1' } }),
    'https://docs.google.com/spreadsheets/d/S1/preview',
  );
});

test('ไม่ใช่เอกสาร Google หรือไม่มี id = ไม่มีลิงก์ฝัง (จอต้องไม่โชว์ปุ่มดู)', () => {
  assert.equal(googleDocPreviewUrl({ metadata: { kind: 'file' } }), null);
  assert.equal(googleDocPreviewUrl({ metadata: { kind: 'gdoc' } }), null);
  assert.equal(googleDocPreviewUrl({}), null);
  assert.equal(googleDocPreviewUrl(null), null);
});

test('kind ที่ไม่ใช่ gdoc/gsheet ไม่นับเป็นเอกสารมีชีวิต', () => {
  // 'link' คือไฟล์ Drive ธรรมดาที่ผูกมา — เปิดได้ แต่ฝังแบบ Doc ไม่ได้
  assert.equal(isGoogleDoc({ metadata: { kind: 'gdoc' } }), true);
  assert.equal(isGoogleDoc({ metadata: { kind: 'gsheet' } }), true);
  assert.equal(isGoogleDoc({ metadata: { kind: 'link' } }), false);
  assert.equal(isGoogleDoc({ metadata: {} }), false);
  assert.equal(isGoogleDoc(undefined), false);
});

test('id ที่มีอักขระพิเศษถูก encode — ไม่หลุดออกนอก path', () => {
  assert.equal(
    googleDocPreviewUrl({ metadata: { kind: 'gdoc', googleFileId: 'a/../b' } }),
    'https://docs.google.com/document/d/a%2F..%2Fb/preview',
  );
});

test('ป้ายชนิดอ่านออกสำหรับคน', () => {
  assert.equal(googleDocKindLabel({ metadata: { kind: 'gsheet' } }), 'Sheet');
  assert.equal(googleDocKindLabel({ metadata: { kind: 'gdoc' } }), 'Doc');
});
