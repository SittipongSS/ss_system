// ── ด่าน *อ่าน* ไฟล์แนบต้องมีสาขาครบทุกชนิด เหมือนด่าน *เขียน* ────────────
//
// `canViewAttachmentParent` (attachmentAccess.js) แยกสาขาตามที่มาของสิทธิ์ แล้ว
// **ตกท้ายเป็น `canViewRecord(user, RESOURCE[entityType], parent)`** · ชนิดที่ไม่มี
// สาขาและไม่มีคู่ใน RESOURCE จะได้ `resource === undefined` ⇒ ตกไปใช้กฎรวมของ
// `canViewRecord` ซึ่งไม่ได้ออกแบบมาสำหรับ entity นั้น — กว้างหรือแคบเกินก็ผิดทั้งคู่
// (แคบเกิน = คนที่มีสิทธิ์เปิดไฟล์ไม่ได้ · กว้างเกิน = คนนอกเห็นไฟล์ของทีมอื่น)
//
// วันนี้ครบ 14/14 · เทสต์คู่แฝดของ `attachmentWriteGateCoverage.test.mjs` — ด่านอ่าน
// กับด่านเขียนต้องเดินมาด้วยกันเสมอ เพิ่มชนิดใหม่แล้วลืมข้างใดข้างหนึ่งคือของที่
// ไม่มีอะไรฟ้องจนกว่าจะมีคนกดเปิดไฟล์แล้วเจอ 403 (หรือแย่กว่านั้น: ไม่เจอ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ATTACHMENT_ENTITY_TYPES } from './attachmentTypes.js';
import { COSTING_ATTACHMENT_TABLE } from './costingAttachmentAccess.js';
import { SALES_ATTACHMENT_TABLE } from '../sales/salesAttachmentAccess.js';

const accessSource = readFileSync(
  fileURLToPath(new URL('./attachmentAccess.js', import.meta.url)),
  'utf8',
);

function listFromLiteral(name) {
  const block = accessSource.match(new RegExp(`const ${name} = \\{([^}]*)\\}`));
  assert.ok(block, `หา ${name} ใน attachmentAccess.js ไม่เจอ`);
  return [...block[1].matchAll(/([a-z_]+):/g)].map((m) => m[1]);
}

function mgmtEntities() {
  const block = accessSource.match(/const MGMT_ENTITIES = \[([^\]]*)\]/);
  assert.ok(block, 'หา MGMT_ENTITIES ไม่เจอ');
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('⭐ ทุก entityType มีสาขาในด่านอ่าน — ไม่มีตัวไหนตกไป canViewRecord(undefined)', () => {
  const covered = new Set([
    ...listFromLiteral('RESOURCE'),
    ...mgmtEntities(),
    ...Object.keys(COSTING_ATTACHMENT_TABLE),
    ...Object.keys(SALES_ATTACHMENT_TABLE),
    'personal_task', // มีสาขาของตัวเอง (canViewPersonalTask)
  ]);
  const uncovered = ATTACHMENT_ENTITY_TYPES.filter((type) => !covered.has(type));
  assert.deepEqual(
    uncovered,
    [],
    `ชนิดที่ไม่มีสาขาในด่านอ่าน: ${uncovered.join(', ')}\n`
    + 'เพิ่มสาขาใน canViewAttachmentParent หรือใส่คู่ใน RESOURCE พร้อมเหตุผล',
  );
});

test('ด่านอ่านกับด่านเขียนต้องรู้จัก entity ชุดเดียวกัน', () => {
  /* ทั้งสองด่านอยู่ในไฟล์เดียวกันและใช้ตัวช่วยชุดเดียวกัน — ล็อกไว้ว่าใครแก้ข้างหนึ่ง
     แล้วลืมอีกข้างจะเห็นทันที (เช่นเพิ่มสาขาให้ canEdit แต่ไม่เพิ่มให้ canView) */
  for (const helper of ['isMgmtAttachment', 'isPersonalTaskAttachment', 'isCostingAttachment', 'isSalesAttachment']) {
    const uses = accessSource.split(helper).length - 1;
    assert.ok(
      uses >= 2,
      `${helper} ถูกใช้ ${uses} ครั้ง — ด่านอ่านกับด่านเขียนต้องเรียกทั้งคู่`,
    );
  }
});
