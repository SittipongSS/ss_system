// ── ประกาศว่ามีสาขาโฟลเดอร์ ≠ มีคนเขียนสาขานั้นจริง ────────────────────────
//
// `FOLDER_ENTITY_TYPES` (driveEntityMap.js) เป็นแค่ **คำประกาศ** ว่า entity นี้มี
// โฟลเดอร์ของตัวเอง · ตัวที่สร้าง path จริงคือ `folderPathForEntity` ใน lib/drive.js
// ซึ่งเป็นชุด `if (type === …)` + ทะเบียน `SALES_THREAD_FOLDER`
//
// 🪤 ประกาศไว้แต่ลืมเขียนสาขา = `hasFolderBranch()` ตอบ true (ด่านตอนสร้างเอกสารร่วม
// จึงปล่อยผ่าน) แล้วไฟล์ตกถัง "_รอจัดที่" **เงียบสนิท ไม่มี error** — เป็นอาการที่
// หัวไฟล์ driveEntityMap.js เขียนเตือนตัวเองไว้ว่าเคยเกิดกับเธรดทะเบียนภาษี/ใบยื่น
// มาแล้ว แต่ไม่เคยมีอะไรผูกสองฝั่งเข้าหากัน
//
// วันนี้ตรงกัน 21/21 — เทสต์นี้คือตัวที่ทำให้ entity ที่ 22 ไม่หลุด
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FOLDER_ENTITY_TYPES } from './driveEntityMap.js';

/* ⚠️ อ่านจาก source ไม่ใช่ import — lib/drive.js โหลด googleapis (หนัก + อ่าน OIDC
   token) ⇒ import เข้ามาในเทสต์ไม่ได้ · ตัวที่ต้องพิสูจน์คือ "มีสาขาชื่อนี้ไหม"
   ซึ่งอ่านจากข้อความก็ตอบได้ตรง */
const driveSource = readFileSync(
  fileURLToPath(new URL('../drive.js', import.meta.url)),
  'utf8',
);

function typesHandledByBuilder() {
  const ifCases = [...driveSource.matchAll(/type === '([a-z_]+)'/g)].map((m) => m[1]);
  const threadBlock = driveSource.match(/SALES_THREAD_FOLDER = \{([\s\S]*?)\n\};/);
  const threadCases = threadBlock
    ? [...threadBlock[1].matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1])
    : [];
  return new Set([...ifCases, ...threadCases]);
}

test('⭐ ทุก entity ที่ประกาศว่ามีโฟลเดอร์ ต้องมีสาขาใน folderPathForEntity จริง', () => {
  const handled = typesHandledByBuilder();
  const declaredOnly = FOLDER_ENTITY_TYPES.filter((type) => !handled.has(type));
  assert.deepEqual(
    declaredOnly,
    [],
    `ประกาศไว้แต่ตัวสร้าง path ไม่รู้จัก: ${declaredOnly.join(', ')}\n`
    + 'ไฟล์ของ entity พวกนี้จะตกถัง "_รอจัดที่" โดยไม่มี error — เพิ่มสาขาใน lib/drive.js',
  );
});

test('สาขาที่เขียนไว้ในตัวสร้าง path ต้องถูกประกาศด้วย — ไม่งั้นด่านสร้างเอกสารร่วมปฏิเสธ', () => {
  const handled = [...typesHandledByBuilder()];
  /* ชื่อที่ไม่ใช่ entity ของไฟล์แนบ/เธรด (ค่าภายในของตัวสร้างเอง) ยกเว้นไว้ตรงนี้
     พร้อมเหตุผล — ลิสต์ต้องสั้นเสมอ ถ้ายาวขึ้นแปลว่าตัวสร้างเริ่มมีภาษาของตัวเอง */
  const notEntities = [];
  const builderOnly = handled
    .filter((type) => !FOLDER_ENTITY_TYPES.includes(type))
    .filter((type) => !notEntities.includes(type));
  assert.deepEqual(
    builderOnly,
    [],
    `ตัวสร้าง path รู้จักแต่ไม่ได้ประกาศใน FOLDER_ENTITY_TYPES: ${builderOnly.join(', ')}\n`
    + '`hasFolderBranch()` จะตอบ false แล้วด่านสร้างเอกสารร่วมปฏิเสธทั้งที่โฟลเดอร์มีจริง',
  );
});
