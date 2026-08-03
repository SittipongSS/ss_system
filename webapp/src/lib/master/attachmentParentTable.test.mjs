// ── ทุก entity ที่แนบไฟล์ได้ ต้องมีตารางแม่ในทะเบียนเดียวกัน ──────────────
//
// 🐞 ที่มา: `dept_request` (หัวคำร้อง) ต่อครบ 4 ใน 5 จุดของเช็คลิสต์ใน
// costingAttachmentAccess.js — ขาดจุดที่ 5 คือ PARENT_TABLE ของ lib/master/attachments
// ผลคือ **อัปโหลดสำเร็จ · รายการไฟล์ขึ้นครบ · แต่กดเปิดไฟล์ไหนก็ 403** เพราะ proxy
// /api/master/attachments/[id]/file ตัดที่ `if (!parent || !allowed)` — และเนื่องจาก
// อีก 4 จุดผ่านหมด จึงไม่มีอะไรฟ้องเลยตอนแนบ
//
// เช็คลิสต์ที่เป็นคอมเมนต์ไม่ได้บังคับอะไร เทสต์นี้บังคับจุดที่ 5 ให้จริง: เพิ่ม
// entityType ใหม่ใน ATTACHMENT_TYPES แล้วลืมตารางแม่ = แดงทันที ไม่ต้องรอผู้ใช้เจอเอง
import test from 'node:test';
import assert from 'node:assert/strict';

import { ATTACHMENT_ENTITY_TYPES } from './attachmentTypes.js';
import { PARENT_TABLE } from './attachments.js';

test('ATTACHMENT_ENTITY_TYPES ทุกตัวมีตารางแม่ใน PARENT_TABLE (ไม่งั้น proxy /file ตอบ 403)', () => {
  const missing = ATTACHMENT_ENTITY_TYPES.filter((t) => !PARENT_TABLE[t]);
  assert.deepEqual(
    missing,
    [],
    'entityType ที่แนบไฟล์ได้แต่ไม่มีตารางแม่ — ไฟล์จะอัปขึ้นได้แต่เปิดไม่ได้:\n  '
      + `${missing.join('\n  ')}`,
  );
});

test('PARENT_TABLE ไม่มีชื่อ entityType ที่ไม่มีอยู่ในทะเบียนไฟล์แนบ', () => {
  const known = new Set(ATTACHMENT_ENTITY_TYPES);
  const stray = Object.keys(PARENT_TABLE).filter((t) => !known.has(t));
  assert.deepEqual(stray, [], `ชื่อที่ไม่มีในทะเบียน (สะกดผิด/ของที่เลิกใช้แล้ว):\n  ${stray.join('\n  ')}`);
});
