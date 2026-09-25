// ── ทุกชนิดไฟล์แนบต้องมีสาขาใดสาขาหนึ่งดักตอนลบ/แก้ ────────────────────────
//
// `guardAttachmentWrite` (attachments/[id]/route.js) แยกเป็นสี่สาขาตามที่มาของสิทธิ์:
//   mgmt (cap ของโมดูล) · ขอราคา/คำร้อง · ดีล/โครงการ/สัญญา · PARENT_TABLE ในไฟล์นั้น
// **ถ้าไม่มีสาขาไหนตรงเลย ฟังก์ชันคืน `null` = ผ่าน** ⇒ ใครที่ผ่านด่านหยาบของ proxy
// ก็ลบไฟล์แนบชนิดนั้นได้โดยไม่มีการตรวจรายใบ
//
// วันนี้ครบ 14/14 — เทสต์นี้มีไว้กันชนิดที่ **15** ที่จะถูกเพิ่มวันหน้า: คนเพิ่มมัก
// เพิ่มที่ ATTACHMENT_TYPES + PARENT_TABLE กลาง + driveEntityMap (เช็กลิสต์ 5 จุด)
// แล้วไม่มีอะไรเตือนว่ายังมีด่านเขียนอีกชุดที่ต้องเพิ่มสาขาด้วย · ความพังของมันคือ
// "ลบได้โดยไม่มีด่าน" ซึ่งเงียบสนิทจนกว่าจะมีคนลบของคนอื่นทิ้ง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ATTACHMENT_ENTITY_TYPES } from '@/lib/master/attachmentTypes';
import { COSTING_ATTACHMENT_TABLE } from '@/lib/master/costingAttachmentAccess';
import { SALES_ATTACHMENT_TABLE } from '@/lib/sales/salesAttachmentAccess';
import { SALES_ORDER_ATTACHMENT_TABLE } from '@/lib/sales/salesOrderAttachmentAccess';

const routeSource = readFileSync(
  fileURLToPath(new URL('./[id]/route.js', import.meta.url)),
  'utf8',
);

/* ⚠️ อ่านจาก source ไม่ใช่ import — route.js ของ Next ห้าม export อะไรนอกจาก handler
   กับ segment config ⇒ แมปในไฟล์นั้นเอาออกมาตรง ๆ ไม่ได้ */
function localMapKeys(name) {
  const block = routeSource.match(new RegExp(`const ${name} = \\{([^}]*)\\}`));
  assert.ok(block, `หาแมป ${name} ในไฟล์ route ไม่เจอ — ชื่อเปลี่ยนหรือย้ายที่แล้ว`);
  return [...block[1].matchAll(/([a-z_]+):/g)].map((m) => m[1]);
}

function mgmtKeys() {
  const line = routeSource.match(/const isMgmt = \(entityType\) =>([^;]*);/);
  assert.ok(line, 'หา isMgmt ไม่เจอ');
  return [...line[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('⭐ ทุก entityType มีสาขาดักตอนลบ/แก้ — ไม่มีตัวไหนหลุดไปเป็น "ผ่านเงียบ ๆ"', () => {
  const covered = new Set([
    ...localMapKeys('PARENT_TABLE'),
    ...Object.keys(COSTING_ATTACHMENT_TABLE),
    ...Object.keys(SALES_ATTACHMENT_TABLE),
    // ใบสั่งขาย: สาขาของตัวเองก่อนบล็อก `if (table)` — ตำแหน่งตรวจใน salesOrderAttachmentAccess.test.mjs
    ...Object.keys(SALES_ORDER_ATTACHMENT_TABLE),
    ...mgmtKeys(),
  ]);
  const uncovered = ATTACHMENT_ENTITY_TYPES.filter((type) => !covered.has(type));
  assert.deepEqual(
    uncovered,
    [],
    `ชนิดที่ไม่มีสาขาไหนดักใน guardAttachmentWrite: ${uncovered.join(', ')}\n`
    + 'เพิ่มสาขาของมันในด่านเขียน ไม่งั้นลบไฟล์แนบของชนิดนั้นได้โดยไม่มีการตรวจรายใบ',
  );
});

test('ชนิดที่เดินเข้าบล็อก PARENT_TABLE ต้องมีคู่ใน RESOURCE หรือมีสาขาของตัวเอง', () => {
  /* บล็อกนั้นเรียก `canEditRecord(user, RESOURCE[type], parent)` — resource ที่เป็น
     undefined จะตกไปใช้กฎรวมของ canEditRecord ซึ่งกว้างกว่าที่ตั้งใจ (เช่น ผู้ถือ
     ra:approve ผ่านทุก resource ที่ไม่ใช่ customers) · วันนี้ไม่มีตัวไหนตก
     เพราะ personal_task มีสาขาของตัวเอง — ล็อกไว้ไม่ให้มีตัวที่สอง */
  const parentTypes = localMapKeys('PARENT_TABLE');
  const resourceTypes = localMapKeys('RESOURCE');
  const special = ['personal_task'];
  const missing = parentTypes.filter((t) => !resourceTypes.includes(t) && !special.includes(t));
  assert.deepEqual(
    missing,
    [],
    `อยู่ใน PARENT_TABLE แต่ไม่มีใน RESOURCE และไม่มีสาขาเฉพาะ: ${missing.join(', ')}`,
  );
});

/* ── ไฟล์ของเอกสารแทนสัญญาตรึงระหว่างรอ AE Sup อนุมัติใบสั่งขายย้อนหลัง (0374) ──────────────
   AE Sup เลือกไฟล์ที่จะเป็น `signedFileId` จากชุดที่เห็นในโมดัล ⇒ **ทุกทางที่ขยับชุดไฟล์** (แนบ · ลบ · แก้)
   ต้องถามด่านเดียวกัน · ขาดทางไหน = ชุดไฟล์เปลี่ยนใต้มือผู้อนุมัติได้ทางนั้นเงียบ ๆ */
const postSource = readFileSync(fileURLToPath(new URL('./route.js', import.meta.url)), 'utf8');

test('⭐ แนบ (POST) และลบ/แก้ (guardAttachmentWrite) ไฟล์ของสัญญา ถามด่านตรึงไฟล์ตัวเดียวกัน', () => {
  assert.match(postSource, /if \(entityType === 'contract'\) \{\s*const frozen = await historicalContractFilesFrozenGate\(supabase, parent\);/);
  // ต้องอยู่หลังด่านสิทธิ์ และก่อนคุยกับ Drive (ไม่งั้นเอกสาร Google ถูกสร้างค้าง) และก่อนเขียนแถว
  const gate = postSource.indexOf('historicalContractFilesFrozenGate(supabase, parent)');
  assert.ok(postSource.indexOf('canEditAttachmentParent(supabase, entityType, parent, user)') < gate);
  assert.ok(gate < postSource.indexOf('buildGoogleAttachment({'));
  assert.ok(gate < postSource.indexOf(".from('attachments').insert("));

  const guard = routeSource.slice(
    routeSource.indexOf('async function guardAttachmentWrite'),
    routeSource.indexOf('const SPEC_ILLUSTRATION_RETIRED_MESSAGE'),
  );
  assert.match(guard, /if \(att\.entityType === 'contract' && deal\) \{\s*const frozen = await historicalContractFilesFrozenGate\(supabase, deal\);/);
  // DELETE และ PATCH ผ่าน guardAttachmentWrite ทั้งคู่ — ด่านอยู่ในตัวกลางจึงครอบสองทางพร้อมกัน
  assert.equal((routeSource.match(/await guardAttachmentWrite\(supabase, att, user,/g) || []).length, 2);
});
