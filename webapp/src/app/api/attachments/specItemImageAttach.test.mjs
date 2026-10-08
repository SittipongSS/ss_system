// ── รูปประจำแถว checklist ของใบสเปคสินค้า (mig 0405 · มติเจ้าของ 08/10/2569 — ใช้ในระบบเท่านั้น) ─────────────────────────
// ⭐ ตรึง: docType `spec_item_image` อยู่ในทะเบียนของสินค้า (ไม่ตกเป็น 'other') แต่ไม่เป็นการ์ดและไม่ขึ้นแผงเอกสารของสินค้า ·
//    รับเฉพาะรูปไม่เกิน 5 MB · ช่องแคบแนบ/ลบ/แก้ = ด่านเดียวกับแก้สเปค (ฝ่ายขายทุกตำแหน่ง + admin) แคบเฉพาะสินค้า + docType นี้
// 🔴 ไฟล์ชนิดนี้ **ระบบลบเอง** เมื่อไม่มีแถวชี้ ⇒ POST ต้องไม่รับ driveFileId ที่มีแถวอื่นถืออยู่ (ไม่งั้นชี้ไฟล์ของคนอื่นแล้วปล่อยให้
//    ตัวเก็บกวาดทิ้งได้) และต้องถามชนิดจริงของไฟล์จาก Drive · DELETE ตรง ๆ ต้องไม่ผ่านขณะแถวยังชี้ (FK SET NULL = แถวเสียรูปเงียบ
//    ไม่มี audit) และต้องไม่ทิ้งไฟล์ที่แถวอื่นถืออยู่ · "มีแถวอื่นถือไหม" ถามผ่าน `driveFileHeld` ตัวเดียวทั้งสามจุด
//    (ตัวฟังก์ชันเทสต์ที่ productSpec.test.mjs — ที่นี่ตรึงว่าสามจุดเรียกมันจริงและเรียงด่านถูก)
// ⚠️ ส่วนของเราต์อ่านจาก source — route.js ของ Next import ใต้ raw Node ไม่ได้ (แพตเทิร์นเดียวกับ billingCalendarAttach.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ATTACHMENT_TYPES, SPEC_ILLUSTRATION_DOC_TYPE, SPEC_ITEM_IMAGE_DOC_TYPE, SPEC_ITEM_IMAGE_MAX_BYTES,
  attachmentTypeLabel, isPersonalDoc, productDocTypes,
} from '@/lib/master/attachmentTypes';
import { canAttachBillingCalendar, canAttachSpecItemImage, canViewAttachmentRow } from '@/lib/master/attachmentAccess';
import { SPEC_EDIT_ROLES } from '@/lib/sales/productSpecWorkflow';
import { ROLES } from '@/lib/permissions';
import { apiWriteAllowed } from '@/proxy';

test('docType อยู่ในทะเบียนของสินค้า (ไม่ตกเป็น "other") · มีป้าย · ไม่บังคับ · ไม่เป็นการ์ดของทะเบียนสินค้า · ไม่ใช่เอกสารส่วนบุคคล', () => {
  assert.equal(SPEC_ITEM_IMAGE_DOC_TYPE, 'spec_item_image');
  const entry = ATTACHMENT_TYPES.product.find((t) => t.key === SPEC_ITEM_IMAGE_DOC_TYPE);
  assert.ok(entry, 'POST ตีคีย์ที่ไม่รู้จักเป็น other แล้วรูปหลุดจากรายการของแถว');
  assert.equal(entry.required, false);
  assert.ok(attachmentTypeLabel('product', SPEC_ITEM_IMAGE_DOC_TYPE).includes('checklist'));
  for (const record of [{ categoryCode: '01-002' }, { categoryCode: '03-001' }, {}]) {
    assert.equal(productDocTypes(record).some((t) => t.key === SPEC_ITEM_IMAGE_DOC_TYPE), false, JSON.stringify(record));
  }
  // 🔴 คนละคีย์กับภาพประกอบของกระดาษ — ใช้คีย์เดียวกันเมื่อไร รูปของแถวจะไปโผล่บนกระดาษที่ลูกค้าเซ็น
  assert.notEqual(SPEC_ITEM_IMAGE_DOC_TYPE, SPEC_ILLUSTRATION_DOC_TYPE);
  assert.equal(isPersonalDoc('product', SPEC_ITEM_IMAGE_DOC_TYPE), false);
  assert.equal(canViewAttachmentRow({ entityType: 'product', docType: SPEC_ITEM_IMAGE_DOC_TYPE }, { id: 'P-1' }, { id: 'U', role: 'ae', teams: ['KA'] }), true);
  assert.equal(SPEC_ITEM_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
});

test('⭐ ช่องแคบ = ด่านแก้สเปค: ฝ่ายขายทุกตำแหน่ง + admin ได้ ไม่ว่าทีมไหน · RD/FN/ผู้ดูไม่ได้ · เฉพาะสินค้า + docType นี้', () => {
  for (const role of SPEC_EDIT_ROLES) {
    assert.equal(canAttachSpecItemImage('product', SPEC_ITEM_IMAGE_DOC_TYPE, { id: 'U', role, teams: ['ทีมอื่น'] }), true, role);
  }
  for (const role of ROLES.filter((r) => !SPEC_EDIT_ROLES.includes(r))) {
    assert.equal(canAttachSpecItemImage('product', SPEC_ITEM_IMAGE_DOC_TYPE, { id: 'U', role }), false, role);
  }
  assert.equal(canAttachSpecItemImage('product', SPEC_ITEM_IMAGE_DOC_TYPE, { role: 'rd' }), false, 'RD เห็นสเปคได้แต่แก้ไม่ได้');
  assert.equal(canAttachSpecItemImage('product', SPEC_ITEM_IMAGE_DOC_TYPE, null), false);
  assert.equal(canAttachSpecItemImage('product', SPEC_ITEM_IMAGE_DOC_TYPE, undefined), false);
  // แคบเป๊ะ: ไฟล์อื่นของสินค้า / entity อื่น = ไม่ได้ช่องนี้
  const AE = { id: 'U', role: 'ae', teams: ['KA'] };
  for (const docType of ['artwork', 'other', SPEC_ILLUSTRATION_DOC_TYPE, undefined, null, '']) {
    assert.equal(canAttachSpecItemImage('product', docType, AE), false, String(docType));
  }
  for (const entityType of ['customer', 'order', 'registration', 'deal', 'sales_order', undefined]) {
    assert.equal(canAttachSpecItemImage(entityType, SPEC_ITEM_IMAGE_DOC_TYPE, AE), false, String(entityType));
  }
  // ช่องแคบของรูปปฏิทินวางบิลไม่เปิดให้ docType นี้ และกลับกัน
  assert.equal(canAttachBillingCalendar('product', SPEC_ITEM_IMAGE_DOC_TYPE, { id: 'P-1' }, { role: 'finance', department: 'FN' }), false);
});

test('proxy ปล่อยคนที่แก้สเปคได้ทุกตำแหน่งถึง handler (แนบ · ลบ · แก้รายละเอียด) — ด่านจริงอยู่ที่ handler', () => {
  for (const role of SPEC_EDIT_ROLES) {
    for (const [method, path] of [['POST', '/api/attachments'], ['POST', '/api/master/attachments'], ['DELETE', '/api/attachments/ATT-1'], ['PATCH', '/api/master/attachments/ATT-1']]) {
      assert.equal(apiWriteAllowed(method, path, role, []), true, `${role} ${method} ${path}`);
    }
  }
});

const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const POST = strip(readFileSync(fileURLToPath(new URL('./route.js', import.meta.url)), 'utf8'));
const BY_ID = strip(readFileSync(fileURLToPath(new URL('./[id]/route.js', import.meta.url)), 'utf8'));
const post = POST.slice(POST.indexOf('export async function POST'));

test('POST: ช่องแคบเป็นประโยคแยกต่อจากด่านเดิม (ด่านเดิมอยู่ครบทั้งประโยค) · ถามด้วย docType ที่จะเก็บจริง · ก่อน Drive และก่อนเขียนแถว', () => {
  // ด่านเดิมที่ billingCalendarAttach.test.mjs ตรึงไว้ ต้องไม่ถูกแตะ
  assert.match(post, /const allowedEdit = await canEditAttachmentParent\(supabase, entityType, parent, user\)\s*\n\s*\|\| canAttachBillingCalendar\(entityType, docType, parent, user\);/);
  assert.match(post, /const allowedWrite = allowedEdit \|\| canAttachSpecItemImage\(entityType, safeDocType, user\);\s*if \(!allowedWrite\) \{\s*return Response\.json\(\{ error: 'forbidden' \}, \{ status: 403 \}\);/);
  assert.doesNotMatch(post, /if \(!allowedEdit\)/, 'ด่าน 403 ต้องอ่านผลรวม ไม่ใช่ด่านเดิมอย่างเดียว');
  // 🔴 `safeDocType` ต้องคัดเสร็จก่อนถึงช่องแคบ — ถามด้วยค่าดิบ = ส่ง docType นี้กับ entity ที่ไม่มีในทะเบียนแล้วได้สิทธิ์
  const safeAt = post.indexOf('const safeDocType = allowed.includes(docType) ? docType : \'other\';');
  const lane = post.indexOf('canAttachSpecItemImage(');
  assert.ok(safeAt > 0 && safeAt < lane);
  assert.equal((post.match(/const safeDocType =/g) || []).length, 1);
  assert.ok(lane < post.indexOf('buildGoogleAttachment('), 'ด่านสิทธิ์ก่อนสร้างไฟล์บน Drive');
  assert.ok(lane < post.indexOf('.insert('), 'ด่านสิทธิ์ก่อนเขียนแถว');
  // สินค้าต้องมีจริงก่อนถึงด่าน (ช่องแคบไม่รับแถวแม่)
  assert.ok(post.indexOf("if (!parent) return Response.json({ error: 'ไม่พบระเบียนที่จะแนบเอกสาร' }, { status: 404 });") < lane);
  // import แยกบรรทัด — บล็อก import เดิมของ attachmentAccess ไม่ถูกแตะ
  assert.match(POST, /^import \{ canAttachSpecItemImage \} from '@\/lib\/master\/attachmentAccess';$/m);
});

test('🔴 POST รูปของแถว: ไม่รับเอกสาร Google · ต้องมี driveFileId · id ผิดรูป = 400 · ตรวจไม่ได้ = 500 · มีแถวอื่นถืออยู่ = 400 · ทั้งหมดก่อนเขียนแถว', () => {
  const start = post.indexOf('if (safeDocType === SPEC_ITEM_IMAGE_DOC_TYPE) {');
  assert.ok(start > 0, 'หาด่านของรูปประจำแถวไม่เจอ');
  const block = post.slice(start, post.indexOf('const spotUpload', start));
  assert.match(block, /if \(google\) return Response\.json\(\{ error: '[^']+' \}, \{ status: 400 \}\);/);
  assert.match(block, /if \(typeof driveFileId !== 'string' \|\| !driveFileId\.trim\(\)\) \{\s*return Response\.json\(\{ error: '[^']+' \}, \{ status: 400 \}\);/);
  // 🔴 ถามผ่าน `driveFileHeld` (สองช่อง: driveFileId + metadata.googleFileId) — ห้ามกลับไปถามช่องเดียวเองที่นี่
  assert.match(block, /const held = await driveFileHeld\(supabase, driveFileId\);/);
  assert.doesNotMatch(block, /\.eq\('driveFileId'/, 'ถามแค่ช่อง driveFileId = มองไม่เห็นเอกสาร Google ที่แถวอื่นถืออยู่');
  assert.match(POST, /^import \{ driveFileHeld \} from '@\/lib\/master\/attachments';$/m);
  const invalidAt = block.indexOf('if (held.invalid) {');
  const errorAt = block.indexOf('if (held.error) return Response.json({ error: held.error.message }, { status: 500 });');
  const heldAt = block.indexOf('if (held.held) {');
  assert.ok(invalidAt > 0 && errorAt > invalidAt && heldAt > errorAt,
    'id ผิดรูป (400) → ตรวจไม่ได้ (500) → มีคนถือ (400) — error ต้องมาก่อนตัดสินว่ามีคนถือ ไม่งั้นฐานล่มตอบว่า "ถูกแนบไว้แล้ว"');
  assert.match(block.slice(invalidAt, errorAt), /status: 400/);
  assert.match(block.slice(heldAt, block.indexOf('let driveMeta')), /error: 'ไฟล์นี้ถูกแนบไว้กับเอกสารอื่นแล้ว[^']*' \}, \{ status: 400 \}/);
  assert.ok(start < post.indexOf('buildGoogleAttachment('), 'ก่อนคุยกับ Drive');
  assert.ok(start < post.indexOf(".from('attachments').insert("), 'ก่อนเขียนแถว');
  // ด่านสิทธิ์มาก่อน — คนที่ไม่มีสิทธิ์ต้องไม่ได้ใช้เส้นนี้ถามว่า driveFileId ไหนมีอยู่ในระบบ
  assert.ok(post.indexOf('if (!allowedWrite)') < start);
  // เพดานขนาดของ docType ถูกบังคับที่ server ด้วย (ขนาดจากคำขอ)
  assert.match(post, /attachmentFileRuleError\(safeDocType, \{ mimeType, fileName, sizeBytes \}\)/);
});

test('🔴 POST รูปของแถว: ถามชนิดจริงของไฟล์จาก Drive หลังด่านสิทธิ์ + ด่าน "มีแถวอื่นถือ" และก่อนเขียนแถว — ถังขยะ/ของ Google/ไม่ใช่รูป = 400 · ถามไม่ได้ = 502', () => {
  const start = post.indexOf('if (safeDocType === SPEC_ITEM_IMAGE_DOC_TYPE) {');
  const block = post.slice(start, post.indexOf('const spotUpload', start));
  // ชั้นฐานมองไม่เห็นโฟลเดอร์/ไฟล์ที่ไม่มีแถว attachments และ mimeType ในคำขอเป็นค่าที่ client ประกาศเอง ⇒ ต้องถาม Drive
  const metaAt = block.indexOf("driveMeta = await getFileMeta(driveFileId, 'id, mimeType, trashed');");
  assert.ok(metaAt > 0, 'หาการถาม Drive ไม่เจอ');
  assert.match(block, /const \{ getFileMeta \} = await import\('@\/lib\/drive'\);/);
  assert.doesNotMatch(POST, /^import [^\n]*from '@\/lib\/drive';$/m, 'lib/drive ลาก googleapis — โหลดเฉพาะเมื่อถึงเส้นนี้');
  // ลำดับ: สิทธิ์ → ไม่มีแถวอื่นถือ → Drive → เขียนแถว (คนไม่มีสิทธิ์ต้องไม่ได้ใช้เส้นนี้ถามว่า id ไหนมีอยู่บน Drive)
  assert.ok(post.indexOf('if (!allowedWrite)') < start);
  assert.ok(block.indexOf('if (held.held) {') < metaAt, 'ด่านฐานก่อนคุยกับ Drive');
  assert.ok(start + metaAt < post.indexOf(".from('attachments').insert("), 'ก่อนเขียนแถว');
  // 🔴 ถามไม่ได้ (Drive ล่ม · ไม่พบไฟล์ · ไม่มีสิทธิ์) = 502 — ห้ามตกไปเขียนแถว: catch ต้องไม่ return ผ่าน และด่าน `!driveMeta?.id` ต้องตามมา
  const failAt = block.indexOf('if (!driveMeta?.id) {');
  assert.ok(failAt > metaAt, 'ต้องมีด่าน "ถามไม่ได้" ต่อจากการถาม');
  assert.match(block.slice(failAt), /^if \(!driveMeta\?\.id\) \{\s*return Response\.json\(\{ error: '[^']+' \}, \{ status: 502 \}\);/);
  assert.match(block, /let driveMeta = null;\s*try \{/);
  assert.doesNotMatch(block.slice(block.indexOf('} catch (err) {', metaAt), failAt), /return|driveMeta =/, 'catch ห้ามตั้งค่าให้ผ่านหรือ return สำเร็จ');
  // เงื่อนไขปฏิเสธสามข้อในประโยคเดียว = 400 · ชนิดที่รับมาจากกติกาของ docType (ตัวเดียวกับด่านของคำขอ)
  const ruleAt = block.indexOf('if (driveMeta.trashed', failAt);
  assert.ok(ruleAt > failAt);
  const rule = block.slice(ruleAt);
  assert.match(rule, /^if \(driveMeta\.trashed \|\| driveMime\.startsWith\('application\/vnd\.google-apps\.'\) \|\| !\(fileRule\?\.mime \|\| \[\]\)\.includes\(driveMime\)\) \{\s*return Response\.json\(\{ error: `[^`]+` \}, \{ status: 400 \}\);/);
  assert.match(block, /const driveMime = String\(driveMeta\.mimeType \|\| ''\)\.toLowerCase\(\);/);
  assert.match(post, /const fileRule = docTypeFileRule\(safeDocType\);/);
});

test('ลบ/แก้ (guardAttachmentWrite): ช่องแคบเดียวกัน อ่าน docType ของแถว · ประโยคของรูปปฏิทินและ import เดิมไม่ถูกแตะ', () => {
  assert.match(BY_ID, /\|\| canAttachBillingCalendar\(att\.entityType, att\.docType, parent, user\);/);
  assert.match(BY_ID, /import \{ canAttachBillingCalendar \} from '@\/lib\/master\/attachmentAccess';/);
  assert.match(BY_ID, /^import \{ canAttachSpecItemImage \} from '@\/lib\/master\/attachmentAccess';$/m);
  const guard = BY_ID.slice(BY_ID.indexOf('async function guardAttachmentWrite'), BY_ID.indexOf('const SPEC_ILLUSTRATION_RETIRED_MESSAGE'));
  assert.match(guard, /const canEditSpecImage = canAttachSpecItemImage\(att\.entityType, att\.docType, user\);\s*if \(parent && !\(canEditParent \|\| canEditSpecImage\)\) \{\s*return Response\.json\(\{ error: 'forbidden' \}, \{ status: 403 \}\);/);
  assert.doesNotMatch(guard, /canAttachSpecItemImage\([^)]*(body|request)/, 'ห้ามอ่าน docType จากคำขอ');
});

test('🔴 DELETE รูปของแถวที่ยังมีแถว checklist ชี้อยู่ = 409 บอกทางที่ถูก · ตรวจไม่ได้ = 500 · มาก่อนคำสั่งลบแถวและก่อนปล่อยไฟล์', () => {
  const del = BY_ID.slice(BY_ID.indexOf('export async function DELETE('), BY_ID.indexOf('export async function PATCH('));
  const gate = del.indexOf("if (att.entityType === 'product' && att.docType === SPEC_ITEM_IMAGE_DOC_TYPE) {");
  assert.ok(gate > 0, 'หาด่านของรูปประจำแถวไม่เจอ');
  const block = del.slice(gate, del.indexOf(".from('attachments').delete()"));
  assert.match(block, /const used = await isSpecItemImageReferenced\(supabase, att\.id\);/);
  const errorAt = block.indexOf('if (used.error) {');
  const usedAt = block.indexOf('if (used.referenced) {');
  assert.ok(errorAt > 0 && usedAt > errorAt, 'ต้องเช็ค error ก่อนตัดสินว่าไม่มีใครชี้');
  assert.match(block.slice(errorAt, usedAt), /status: 500/);
  assert.match(block.slice(usedAt), /error: 'รูปนี้ผูกกับแถว checklist ของใบสเปค — เอารูปออกที่หน้าสเปคแล้วกดบันทึก' \}, \{ status: 409 \}/);
  assert.ok(gate > del.indexOf('await guardAttachmentWrite('), 'ด่านสิทธิ์มาก่อน');
  assert.ok(gate < del.indexOf('releaseAttachmentFile(att)'));
  // อ่าน docType ของแถวที่เก็บอยู่ (att มาจาก getAttachment) — ไม่ใช่ค่าจากคำขอ
  assert.match(del, /const att = await getAttachment\(id\);/);
});

test('🔴 DELETE รูปของแถว: ลบแถวแล้ว **ก่อนทิ้งไฟล์** ถามว่ามีแถวอื่นถือไฟล์เดียวกันไหม — มี/ตรวจไม่ได้ = เก็บไฟล์ไว้ (ลบแค่แถว)', () => {
  const del = BY_ID.slice(BY_ID.indexOf('export async function DELETE('), BY_ID.indexOf('export async function PATCH('));
  const rowDelete = del.indexOf(".from('attachments').delete().eq('id', id)");
  const release = del.indexOf('await releaseAttachmentFile(att);');
  assert.ok(rowDelete > 0 && release > rowDelete);
  assert.equal((del.match(/releaseAttachmentFile\(/g) || []).length, 1, 'ทางทิ้งไฟล์ต้องมีทางเดียว — ทางที่สองคือทางลัดข้ามด่าน');
  const between = del.slice(rowDelete, release);
  // 🐞 เดิมเส้นนี้ทิ้งไฟล์เลย ทั้งที่ driveFileId ของแถวมาจาก client ตอนแนบ ⇒ แนบแล้วกดลบเอง = ทิ้งไฟล์ของคนอื่นได้ทันที
  assert.match(between, /if \(att\.entityType === 'product' && att\.docType === SPEC_ITEM_IMAGE_DOC_TYPE && att\.driveFileId\) \{\s*const shared = await driveFileHeld\(supabase, att\.driveFileId, \{ excludeId: att\.id \}\);\s*if \(shared\.held\) \{/);
  // `held` เป็นจริงทั้งตอนมีคนถือ · query ล้ม · id ผิดรูป (driveFileHeld) ⇒ ด่านเดียวพอ และต้องออกก่อนถึงตัวทิ้งไฟล์
  const guard = between.slice(between.indexOf('if (shared.held) {'));
  assert.match(guard, /return Response\.json\(\{ success: true \}\);\s*\}\s*\}/);
  assert.doesNotMatch(guard, /releaseAttachmentFile|deleteFile/);
  assert.match(BY_ID, /^import \{ driveFileHeld \} from '@\/lib\/master\/attachments';$/m);
  // import เดิมของบรรทัดบนไม่ถูกแตะ
  assert.match(BY_ID, /^import \{ getAttachment, releaseAttachmentFile \} from '@\/lib\/master\/attachments';$/m);
});

test('🔴 ตัวเก็บกวาด (deleteAttachmentRows) ถาม "มีแถวอื่นถือไหม" ผ่าน driveFileHeld ตัวเดียวกัน — ไม่มีจุดไหนถามช่อง driveFileId ช่องเดียวเองอีก', () => {
  const LIB = strip(readFileSync(fileURLToPath(new URL('../../../lib/master/attachments.js', import.meta.url)), 'utf8'));
  const fn = LIB.slice(LIB.indexOf('export async function deleteAttachmentRows('));
  assert.match(fn, /const shared = await driveFileHeld\(supabase, att\.driveFileId\);\s*if \(shared\.held\) \{[\s\S]*?continue;/);
  assert.ok(fn.indexOf(".delete().in('id', ids)") < fn.indexOf('driveFileHeld('), 'ลบแถวก่อน แล้วค่อยถาม (แถวที่เพิ่งลบต้องไม่นับเป็นผู้ถือ)');
  for (const [name, text] of [['lib', LIB], ['POST', POST], ['DELETE', BY_ID]]) {
    assert.doesNotMatch(text, /\.eq\('driveFileId'/, `${name}: ถามช่องเดียว = มองไม่เห็นเอกสาร Google ที่แถวอื่นถืออยู่`);
  }
  // ตัวช่วย: id ผิดรูปออกก่อนต่อสตริงเข้าตัวกรอง · error = held
  const helper = LIB.slice(LIB.indexOf('export async function driveFileHeld('), LIB.indexOf('export async function deleteAttachmentRows('));
  assert.ok(helper.indexOf('DRIVE_FILE_ID_PATTERN.test(fileId)') < helper.indexOf('.or(`driveFileId.eq.${fileId},metadata->>googleFileId.eq.${fileId}`)'));
  assert.match(LIB, /const DRIVE_FILE_ID_PATTERN = \/\^\[A-Za-z0-9_-\]\+\$\/;/);
  assert.match(helper, /if \(error\) return \{ held: true, error, invalid: false \};/);
});
