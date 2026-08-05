// สิทธิ์ไฟล์แนบของดีล (P5c) + ด่านกันลืมต่อ 5 จุด
//
// ⚠️ เทสต์ครึ่งหลังอ่านซอร์ส เพราะ handler แตะ DB จึงรันตรงไม่ได้ — และ **การลืม
// ต่อจุดใดจุดหนึ่งคือความพังที่เงียบที่สุด**: build ผ่าน · eslint ผ่าน · เทสต์ผ่าน
// แต่ไฟล์ไม่ขึ้น / อัปไม่ได้ / ใครก็ลบได้ / พรีวิวไม่ขึ้น (เคยหลุดมาแล้วสองรอบ —
// costing_item โดนข้อ 1–3 · หัวคำร้องโดนข้อ 5)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEAL_ATTACHMENT_TABLE, canAttachToDeal, canViewDealAttachment, isDealAttachment,
} from './dealAttachmentAccess.js';

const admin = { id: 'u-admin', role: 'admin' };
const viewer = { id: 'u-viewer', role: 'viewer' };
const deal = { id: 'D-1', ownerId: 'u-admin', team: 'KA' };

test('ดีลถูกจำแนกเป็น entity แนบไฟล์ของสายงานขาย', () => {
  assert.equal(isDealAttachment('deal'), true);
  assert.equal(isDealAttachment('customer'), false);
  assert.equal(DEAL_ATTACHMENT_TABLE.deal, 'sales_deals');
});

test('ดีลที่ไม่มีอยู่ = ไม่มีสิทธิ์ ไม่ใช่ผ่านเพราะไม่มีอะไรให้เทียบ', () => {
  assert.equal(canViewDealAttachment(null, admin), false);
  assert.equal(canAttachToDeal(null, admin), false);
});

test('ผู้อ่านอย่างเดียวแนบไม่ได้ — แนบ = แก้ดีลได้ ไม่ใช่แค่เห็น', () => {
  // คนที่เห็นดีลของทีมอื่นได้ (หัวหน้าสาย/ผู้บริหาร) ต้องอ่านได้แต่ไม่ควรไปเพิ่ม
  // หรือลบเอกสารในดีลที่ไม่ใช่ของตัวเอง
  assert.equal(canAttachToDeal(deal, viewer), false);
});

// ── ⚠️ ด่านกันลืมต่อ 5 จุด ────────────────────────────────────────────────
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('จุด 1–2: GET/POST /api/attachments รู้จัก parent ของดีลและมีด่านของตัวเอง', () => {
  const src = read('../../app/api/attachments/route.js');
  // ขาด → loadParent คืน null → GET ตอบ [] เสมอ · POST 404 "ไม่พบระเบียนที่จะแนบ"
  assert.match(src, /DEAL_ATTACHMENT_TABLE\[entityType\]/);
  assert.match(src, /canViewDealAttachment/);
  assert.match(src, /canAttachToDeal/);
});

test('จุด 3: DELETE ต้องดักดีล **นอก** บล็อก `if (table)` ไม่งั้นใครก็ลบได้', () => {
  const src = read('../../app/api/attachments/[id]/route.js');
  assert.match(src, /isDealAttachment\(att\.entityType\)/);
  // ต้องมาก่อน `const table = PARENT_TABLE[...]` — บล็อกข้างล่างถูกข้ามทั้งก้อน
  // เมื่อ entityType ไม่อยู่ใน PARENT_TABLE ของไฟล์นั้น
  assert.ok(
    src.indexOf('isDealAttachment(att.entityType)') < src.indexOf('const table = PARENT_TABLE'),
    'ด่านของดีลต้องอยู่ก่อนบล็อกที่ถูกข้าม',
  );
});

test('จุด 4: โฟลเดอร์ Drive ของดีล — ขาดแล้วปุ่มอัปโหลดพัง 500 ทั้งปุ่ม', () => {
  assert.match(read('../drive.js'), /type === 'deal'/);
});

test('จุด 5: PARENT_TABLE กลาง — ขาดแล้ว "แนบได้แต่เปิดดูไม่ได้สักไฟล์"', () => {
  // อาการนี้อ่านจากหน้าจอแล้วเหมือนไฟล์เสีย ไม่ใช่เหมือนสิทธิ์ (หัวคำร้องเคยโดน)
  assert.match(read('../master/attachments.js'), /deal: 'sales_deals'/);
});

test('ชนิดเอกสารของดีลตรงกับ sales_deal_documents.kind — ไม่ใช่สองชุดที่ต้องแมปกันเอง', async () => {
  const { ATTACHMENT_TYPES } = await import('../master/attachmentTypes.js');
  const keys = ATTACHMENT_TYPES.deal.map((t) => t.key);
  for (const kind of ['customer_brief', 'quotation', 'deposit_proof', 'po', 'tax_docs', 'other']) {
    assert.ok(keys.includes(kind), `${kind} ต้องมีในชุดของดีล`);
  }
});
