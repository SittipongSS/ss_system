import assert from 'node:assert/strict';
import test from 'node:test';
import { ILLUSTRATION_CAPTION_MAX, illustrationCaption, sortIllustrations } from './productSpecIllustrations.js';
import { ATTACHMENT_TYPES, SPEC_ILLUSTRATION_DOC_TYPE, productDocTypes } from '@/lib/master/attachmentTypes';

const row = (id, over = {}) => ({ id, createdAt: '2026-09-17T00:00:00Z', metadata: {}, ...over });

test('ชนิดเอกสารอยู่ใน union ของสินค้า — ไม่งั้น API จะตีเป็น other แล้วรูปหลุดจากลิสต์', () => {
  assert.ok(ATTACHMENT_TYPES.product.some((t) => t.key === SPEC_ILLUSTRATION_DOC_TYPE));
});

test('🪤 แต่ไม่โผล่เป็นการ์ดบนหน้าสินค้า และไม่เข้าด่าน "ยังขาดเอกสาร"', () => {
  for (const record of [{ categoryCode: '01-002' }, { categoryCode: '03-001' }, {}]) {
    const keys = productDocTypes(record).map((t) => t.key);
    assert.ok(!keys.includes(SPEC_ILLUSTRATION_DOC_TYPE), JSON.stringify(record));
  }
  // ของเดิมยังอยู่ครบ
  assert.deepEqual(productDocTypes({ categoryCode: '01-002' }).map((t) => t.key), ['artwork', 'other']);
});

test('ภาพประกอบไม่ใช่เอกสารบังคับ — ไม่มีใบไหนอนุมัติไม่ได้เพราะยังไม่มีรูป', () => {
  const entry = ATTACHMENT_TYPES.product.find((t) => t.key === SPEC_ILLUSTRATION_DOC_TYPE);
  assert.equal(entry.required, false);
});

test('เรียงตาม sortOrder ก่อน', () => {
  const rows = sortIllustrations([
    row('c', { metadata: { sortOrder: 2 } }),
    row('a', { metadata: { sortOrder: 0 } }),
    row('b', { metadata: { sortOrder: 1 } }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b', 'c']);
});

test('ไฟล์เก่าที่ยังไม่มี sortOrder ไปต่อท้าย และเรียงตามวันที่อัป', () => {
  const rows = sortIllustrations([
    row('old-2', { createdAt: '2026-09-02T00:00:00Z' }),
    row('new', { metadata: { sortOrder: 0 } }),
    row('old-1', { createdAt: '2026-09-01T00:00:00Z' }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['new', 'old-1', 'old-2']);
});

test('🪤 ลำดับต้องนิ่ง — วันที่เท่ากันตัดด้วย id ไม่ใช่ปล่อยให้ขึ้นกับลำดับที่ฐานคืนมา', () => {
  const input = [row('b'), row('a'), row('c')];
  const first = sortIllustrations(input).map((r) => r.id);
  const second = sortIllustrations([...input].reverse()).map((r) => r.id);
  assert.deepEqual(first, ['a', 'b', 'c']);
  assert.deepEqual(second, first, 'พิมพ์สองครั้งต้องได้ลำดับเดียวกัน');
});

test('sortOrder ที่เป็นสตริง (มาจาก jsonb) ยังอ่านเป็นตัวเลขได้', () => {
  const rows = sortIllustrations([
    row('b', { metadata: { sortOrder: '1' } }),
    row('a', { metadata: { sortOrder: '0' } }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b']);
});

test('ค่าที่ไม่ใช่ตัวเลขไม่ทำให้ลำดับพัง — ถือว่ายังไม่เคยจัดลำดับ', () => {
  const rows = sortIllustrations([
    row('bad', { metadata: { sortOrder: 'อะไรไม่รู้' } }),
    row('good', { metadata: { sortOrder: 3 } }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['good', 'bad']);
});

test('คำบรรยายตัดช่องว่างและมีเพดานความยาว', () => {
  assert.equal(illustrationCaption({ metadata: { caption: '  กล่องแบบใหม่ เปิดขึ้น  ' } }), 'กล่องแบบใหม่ เปิดขึ้น');
  assert.equal(illustrationCaption({}), '');
  assert.equal(illustrationCaption(null), '');
  assert.equal(illustrationCaption({ metadata: { caption: 'ก'.repeat(300) } }).length, ILLUSTRATION_CAPTION_MAX);
});
