// ตอบแบบยกคำพูดในเธรดอัปเดต
//
// จุดที่ต้องล็อกไว้:
//   1) ยกข้าม entity ไม่ได้ — กล่อง quote แสดงเนื้อความต้นทาง ปล่อยผ่าน = ช่องอ่าน
//      ข้อความของเอกสารที่ตัวเองไม่มีสิทธิ์ (เธรด polymorphic ไม่มี FK กันให้)
//   2) `extraItems` ยกไม่ได้ (อยู่คนละตาราง id คนละชุด)
//   3) ต้นทางหาย vs ต้นทางถูกลบ ต้องแยกกัน — เขียนรวมเป็น "—" ผู้อ่านไม่รู้ว่าเกิดอะไร
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  QUOTE_SNIPPET_MAX, canQuoteItem, quoteSnippet, quoteTargetError, quoteView, quotedIdOf,
} from './updateQuote.js';

const row = (extra = {}) => ({
  id: 'EUP-1', entityType: 'quotation', entityId: 'QT-1', kind: 'comment',
  body: 'ลูกค้าขอปรับเงื่อนไขชำระ', authorName: 'พนักงานขาย A', ...extra,
});

test('ยกข้ามเธรดไม่ได้ — ทั้งข้าม entityType และข้าม entityId', () => {
  const target = { entityType: 'quotation', entityId: 'QT-1' };
  assert.equal(quoteTargetError(row(), target), null);
  assert.match(quoteTargetError(row({ entityId: 'QT-2' }), target), /ข้ามเธรด/);
  assert.match(quoteTargetError(row({ entityType: 'sales_order' }), target), /ข้ามเธรด/);
  // id เป็นตัวเลขจาก DB vs สตริงจาก client ต้องไม่ทำให้พลาด
  assert.equal(quoteTargetError(row({ entityId: 1 }), { entityType: 'quotation', entityId: '1' }), null);
});

test('ยก id ที่ไม่มีจริง / ข้อความที่ถูกลบแล้ว = ตีกลับ ไม่ใช่บันทึกผ่าน', () => {
  const target = { entityType: 'quotation', entityId: 'QT-1' };
  assert.match(quoteTargetError(null, target), /ไม่พบข้อความ/);
  assert.match(quoteTargetError(row({ deletedAt: '2026-07-01T00:00:00Z' }), target), /ถูกลบแล้ว/);
});

test('ยกได้เฉพาะรายการที่อยู่ใน entity_updates จริง — extraItems ยกไม่ได้', () => {
  assert.equal(canQuoteItem({ kind: 'own', row: row() }), true);
  // เหตุการณ์ระบบยกได้ (ตอบเรื่องที่ถูกตีกลับคือเคสหลัก)
  assert.equal(canQuoteItem({ kind: 'own', row: row({ kind: 'returned' }) }), true);
  assert.equal(canQuoteItem({ kind: 'extra', id: 'ev-1', body: 'คัดกรอง' }), false);
  assert.equal(canQuoteItem({ kind: 'own', row: row({ deletedAt: 'x' }) }), false);
  assert.equal(canQuoteItem(null), false);
});

test('quoteView แยกสามสถานะ: ปกติ / ต้นทางหาย / ต้นทางถูกลบ', () => {
  const ok = quoteView(row());
  assert.equal(ok.state, 'ok');
  assert.equal(ok.author, 'พนักงานขาย A');
  assert.equal(ok.text, 'ลูกค้าขอปรับเงื่อนไขชำระ');

  const missing = quoteView(undefined);
  assert.equal(missing.state, 'missing');
  assert.match(missing.text, /ไม่อยู่ในเธรดนี้แล้ว/);

  const deleted = quoteView(row({ deletedAt: 'x' }), { deletedText: 'ข้อความนี้ถูกลบแล้ว' });
  assert.equal(deleted.state, 'deleted');
  assert.equal(deleted.text, 'ข้อความนี้ถูกลบแล้ว');
  // คนพูดยังต้องรู้ว่าใคร แม้ข้อความหาย
  assert.equal(deleted.author, 'พนักงานขาย A');
});

test('แถวที่แนบไฟล์ล้วน (ไม่มีข้อความ) ยกได้ โดยขึ้นว่า "ไฟล์แนบ"', () => {
  assert.equal(quoteSnippet(row({ body: null })), null);
  assert.equal(quoteView(row({ body: '   ' })).text, 'ไฟล์แนบ');
});

test('quote ยาวถูกตัด — quote ยาวกว่าคำตอบคือเสียงรบกวน', () => {
  const long = 'ก'.repeat(400);
  const snippet = quoteSnippet(row({ body: long }));
  assert.equal(snippet.length, QUOTE_SNIPPET_MAX + 1); // +1 = อักษร …
  assert.ok(snippet.endsWith('…'));
  // ขึ้นบรรทัดใหม่/ช่องว่างซ้อนถูกยุบ ไม่ให้ quote สูงเท่าข้อความจริง
  assert.equal(quoteSnippet(row({ body: 'บรรทัด 1\n\n   บรรทัด 2' })), 'บรรทัด 1 บรรทัด 2');
});

test('quotedIdOf อ่านจาก meta และคืน null เมื่อไม่มี (ไม่ใช่ undefined ปน)', () => {
  assert.equal(quotedIdOf({ meta: { quotedId: 'EUP-9' } }), 'EUP-9');
  assert.equal(quotedIdOf({ meta: {} }), null);
  assert.equal(quotedIdOf({}), null);
  assert.equal(quotedIdOf(null), null);
});
