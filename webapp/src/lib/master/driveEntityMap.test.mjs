// entity ทุกตัวที่แนบไฟล์ได้ ต้องมีโฟลเดอร์ปลายทางบน Drive จริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ATTACHMENT_ENTITY_TYPES } from './attachmentTypes.js';
import { FOLDER_ENTITY_TYPES, hasFolderBranch, resolveEntityAlias } from './driveEntityMap.js';

const here = dirname(fileURLToPath(import.meta.url));

// อ่านชื่อ entity ของเธรดจากซอร์สโดยตรง (import ไม่ได้ — updateAccess ลากทั้งชั้นสิทธิ์มา)
function threadEntityTypes() {
  const src = readFileSync(join(here, 'updateAccess.js'), 'utf8');
  const body = src.slice(src.indexOf('export const UPDATE_ENTITIES'));
  return [...body.matchAll(/^ {2}([a-z_]+): \{$/gm)].map((m) => m[1]);
}

test('ไฟล์แนบทุก entity มีโฟลเดอร์ปลายทาง', () => {
  for (const entityType of ATTACHMENT_ENTITY_TYPES) {
    assert.ok(hasFolderBranch(entityType), `${entityType} ยังไม่มีสาขาโฟลเดอร์`);
  }
});

// 🐞 นี่คือเทสต์ที่จะจับบั๊กเดิม: เธรดทะเบียนภาษี (excise_registration) แนบรูปได้
// แต่ไฟล์ตกถัง "_รอจัดที่" เพราะชื่อ entity ไม่ตรงกับสายไฟล์แนบ
test('เธรดอัปเดตทุก entity มีโฟลเดอร์ปลายทาง (ชื่อคนละชุดกับไฟล์แนบ)', () => {
  const threads = threadEntityTypes();
  assert.ok(threads.length >= 12, `อ่านชื่อ entity ของเธรดไม่ครบ (ได้ ${threads.length})`);
  assert.ok(threads.includes('excise_registration'), 'ต้องอ่านเจอ excise_registration');
  for (const entityType of threads) {
    assert.ok(hasFolderBranch(entityType), `เธรด ${entityType} ยังไม่มีสาขาโฟลเดอร์`);
  }
});

test('ชื่อพ้อง: ชื่อของเธรดถูกยุบเป็นชื่อของไฟล์แนบ', () => {
  assert.equal(resolveEntityAlias('excise_registration'), 'registration');
  assert.equal(resolveEntityAlias('excise_order'), 'order');
  // ชื่อที่ตรงกันอยู่แล้วต้องไม่ถูกแปลง
  assert.equal(resolveEntityAlias('customer'), 'customer');
  assert.equal(resolveEntityAlias('ของใหม่ที่ยังไม่รู้จัก'), 'ของใหม่ที่ยังไม่รู้จัก');
});

test('ลิสต์สาขาโฟลเดอร์ไม่มีชื่อซ้ำ', () => {
  assert.equal(new Set(FOLDER_ENTITY_TYPES).size, FOLDER_ENTITY_TYPES.length);
});
