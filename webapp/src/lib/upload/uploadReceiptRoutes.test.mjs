// ── ยามตัวหนังสือของสองเส้นอัปโหลด + เส้นถอยการอัป (ใบรับการอัปโหลด · mig 0406 · มติเจ้าของ 08/10/2569) ──────────
//
// 🐞 ที่มา: DELETE /api/upload เชื่อ `driveFileId` จากคำขอ ("ใครก็ตามที่ล็อกอินเรียกได้") ⇒ ทิ้งโฟลเดอร์ลูกค้าทั้งโฟลเดอร์ลง
//    ถังขยะ Drive ได้ด้วยคำขอเดียว · และไม่มีที่ไหนจดว่าไฟล์ Drive ใบไหนใครอัป
// ⚠️ สามเส้นนี้คุยกับ Drive จริง (รันในเทสต์ไม่ได้) ⇒ ล็อก **ลำดับและรูปของโค้ด** ที่นี่ · ตรรกะตัดสินอยู่ที่ receipts.test.mjs
//    กับ attachmentSafeRelease.test.mjs (รันจริงด้วยตัวปลอม)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const LEGACY_RAW = read('../../app/api/upload/route.js');
const LEGACY = strip(LEGACY_RAW);
const COMMIT = strip(read('../../app/api/upload/commit/route.js'));
const order = (text, needles, label) => {
  const at = needles.map((n) => text.indexOf(n));
  at.forEach((i, k) => assert.ok(i >= 0, `${label}: ไม่พบ ${needles[k]}`));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${label}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
};

/* ผลของการออกใบรับถูกอ่านที่บล็อก `if (receipt.error) {…}` บล็อกเดียว (log อย่างเดียว) — ระหว่างปลายบล็อกกับขั้นถัดไป
   ต้องว่างเปล่า และไม่มี `receipt.error` ที่อื่นใน handler */
function assertNothingReadsReceiptAfter(text, failAt, nextNeedle, label) {
  const BLOCK_END = '\n    }\n';
  const blockEnd = text.indexOf(BLOCK_END, failAt) + BLOCK_END.length;
  const nextAt = text.indexOf(nextNeedle, blockEnd);
  assert.ok(nextAt > blockEnd, `${label}: ไม่พบขั้นถัดจากบล็อกใบรับ`);
  assert.match(text.slice(blockEnd, nextAt), /^\s*$/, `${label}: มีโค้ดแทรกระหว่างบล็อกใบรับกับขั้นถัดไป`);
  assert.equal((text.match(/if \(receipt\.error\)/g) || []).length, 1, `${label}: อ่านผลใบรับจุดเดียว`);
  const inBlock = (text.slice(failAt, blockEnd).match(/receipt\.error/g) || []).length;
  assert.equal((text.match(/receipt\.error/g) || []).length, inBlock, `${label}: มี receipt.error นอกบล็อก log`);
}

test('🔴 /api/upload/commit: ออกใบรับทันทีหลังไฟล์ขึ้น Drive — id จาก Drive · ผู้ใช้จาก session · ออกไม่สำเร็จ = log แล้วคืน ref ตามเดิม', () => {
  assert.match(COMMIT, /^import \{ recordUploadReceipt \} from '@\/lib\/upload\/receipts';$/m);
  order(COMMIT, [
    'uploaded = await uploadForEntity({',
    'const receipt = await recordUploadReceipt(supabase, {',
    'if (receipt.error) {',
    '.from(UPLOAD_STAGING_BUCKET).remove([storagePath]);\n    if (removeError)',
    'driveFileId: uploaded.id,\n      mimeType: contentType,',
  ], 'commit');
  // 🔴 ค่าที่ลงใบรับ: id ไฟล์จากผลของ Drive · id ผู้ใช้จาก session — ห้ามมาจาก body
  assert.match(COMMIT, /recordUploadReceipt\(supabase, \{\s*driveFileId: uploaded\.id, userId: user\.id, entityType, entityId,\s*\}\);/);
  assert.equal((COMMIT.match(/recordUploadReceipt\(/g) || []).length, 1);
  // ออกไม่สำเร็จ = log อย่างเดียว — ห้าม return/throw (การอัปไม่ล้มเพราะใบรับ · ปลายทางของไฟล์ Drive ทุกที่ตรวจใบรับเอง แล้วตอบ 400/503)
  const failAt = COMMIT.indexOf('if (receipt.error) {');
  const failBlock = COMMIT.slice(failAt, COMMIT.indexOf('\n    }\n', failAt));
  assert.match(failBlock, /console\.error\(/);
  assert.doesNotMatch(failBlock, /return|throw|deleteFile/);
  // 🔴 และ **หลัง** บล็อกนั้นก็ห้ามมีอะไรอ่านผลของใบรับอีก — เดิมดูแค่ข้างในบล็อก ⇒ เติม `if (receipt.error) return …500`
  //    ต่อท้ายบล็อก (การอัปล้มเพราะใบรับ) เทสต์ยังเขียว · ถัดจากบล็อกต้องเป็นขั้นลบที่พักทันที
  assertNothingReadsReceiptAfter(COMMIT, failAt, 'const { error: removeError } = await supabase.storage', 'commit');
  // ออกใบรับอยู่นอก try ของขา Drive — พังแล้วต้องไม่ถูกรายงานว่า "อัปโหลดขึ้น Google Drive ไม่สำเร็จ"
  const driveTry = COMMIT.slice(COMMIT.indexOf('let uploaded;'), COMMIT.indexOf('const receipt = await recordUploadReceipt('));
  assert.match(driveTry, /\} catch \(err\) \{[\s\S]*status: 502[\s\S]*\}\s*$/);
});

test('🔴 /api/upload (ขา Drive): ออกใบรับหลัง uploadForEntity นอก try ของ Drive · ออกไม่สำเร็จ = log แล้วคืน ref · ขา bucket ส่วนตัวไม่ออกใบรับ', () => {
  const post = LEGACY.slice(LEGACY.indexOf('export async function POST('), LEGACY.indexOf('export async function DELETE('));
  assert.match(LEGACY, /^import \{ DRIVE_FILE_ID_PATTERN, recordUploadReceipt, uploadReceiptStatus \} from '@\/lib\/upload\/receipts';$/m);
  order(post, [
    'if (isPrivateEvidence(entityType)) {',
    'storagePath: objectPath,',
    'uploaded = await uploadForEntity({',
    "{ status: 502 },\n      );\n    }",
    'receipt = await recordUploadReceipt(getSupabaseAdmin(), {',
    'if (receipt.error) {',
    'return Response.json({ url: uploaded.webViewLink, driveFileId: uploaded.id, mimeType: contentType });',
  ], 'legacy POST');
  assert.match(post, /recordUploadReceipt\(getSupabaseAdmin\(\), \{\s*driveFileId: uploaded\.id, userId: user\.id, entityType, entityId,\s*\}\);/);
  assert.equal((post.match(/recordUploadReceipt\(/g) || []).length, 1, 'ออกใบรับจุดเดียว — ขาหลักฐาน bucket ส่วนตัวไม่ใช่ไฟล์ Drive');
  const privateBranch = post.slice(post.indexOf('if (isPrivateEvidence(entityType)) {'), post.indexOf('let uploaded;'));
  assert.doesNotMatch(privateBranch, /recordUploadReceipt|upload_receipts/);
  // สร้าง client ไม่ได้ก็ต้องไม่ล้มการอัป — ห่อ try แล้วตกเป็น error ของใบรับ
  assert.match(post, /let receipt;\s*try \{\s*receipt = await recordUploadReceipt\([\s\S]*?\} catch \(err\) \{\s*receipt = \{ error: err \};\s*\}/);
  const failAt = post.indexOf('if (receipt.error) {');
  const failBlock = post.slice(failAt, post.indexOf('\n    }\n', failAt));
  assert.match(failBlock, /console\.error\(/);
  assert.doesNotMatch(failBlock, /return|throw|deleteFile/);
  // ถัดจากบล็อกต้องเป็นบรรทัดคืน ref ทันที (เหตุผลเดียวกับ /api/upload/commit ข้างบน)
  assertNothingReadsReceiptAfter(post, failAt, 'return Response.json({ url: uploaded.webViewLink, driveFileId: uploaded.id, mimeType: contentType });', 'legacy POST');
});

const DEL = LEGACY.slice(LEGACY.indexOf('export async function DELETE('));
const DRIVE = DEL.slice(DEL.indexOf('if (!driveFileId) return Response.json({ ok: true });'));

test('🔴 DELETE /api/upload (ขา Drive): รูปร่าง id → ใบรับของคนเรียก → ใบรับถูกประทับ → มีที่อ้างถึง → ชนิดจริงบน Drive → จึงทิ้งไฟล์', () => {
  order(DRIVE, [
    "if (typeof driveFileId !== 'string' || !DRIVE_FILE_ID_PATTERN.test(driveFileId)) {",
    'const receipt = await uploadReceiptStatus(supabase, { driveFileId, userId: user.id });',
    "if (receipt.reason === 'unverifiable') {",
    'if (!receipt.ok) {',
    'if (receipt.receipt?.claimedBy) {',
    'const ref = await driveFileReferenced(supabase, driveFileId);',
    'if (ref.error || ref.referenced) {',
    'const trashable = await driveFileTrashable(driveFileId);',
    'if (!trashable.ok) {',
    "const { deleteFile } = await import('@/lib/drive');",
    'await deleteFile(driveFileId);',
  ], 'DELETE');
  const slice = (from, to) => DRIVE.slice(DRIVE.indexOf(from), DRIVE.indexOf(to));
  // 🔴 แต่ละด่าน = "เงื่อนไข → return สถานะของมัน" ทั้งบล็อก ไม่มีอย่างอื่น — เดิมดูแค่ว่ามีคำว่า `status: NNN` อยู่ในช่วงนั้น
  //    ⇒ ถอด `return` ออกจากด่านไหนก็ได้ (คำขอไหลต่อไปถึงตัวทิ้งไฟล์) เทสต์ยังเขียวทั้งชุด
  const reject = (status) => String.raw`\{\s*return Response\.json\(\{ error: '[^']+' \}, \{ status: ${status} \}\);\s*\}\s*$`;
  assert.match(slice("if (typeof driveFileId !== 'string'", 'const supabase'),
    new RegExp(String.raw`^if \(typeof driveFileId !== 'string' \|\| !DRIVE_FILE_ID_PATTERN\.test\(driveFileId\)\) ${reject(400)}`));
  assert.match(slice("if (receipt.reason === 'unverifiable') {", 'if (!receipt.ok) {'),
    new RegExp(String.raw`^if \(receipt\.reason === 'unverifiable'\) ${reject(503)}`));
  assert.match(slice('if (!receipt.ok) {', 'if (receipt.receipt?.claimedBy) {'),
    new RegExp(String.raw`^if \(!receipt\.ok\) ${reject(403)}`));
  assert.match(slice('if (receipt.receipt?.claimedBy) {', 'const ref ='),
    new RegExp(String.raw`^if \(receipt\.receipt\?\.claimedBy\) ${reject(409)}`));
  assert.match(slice('if (ref.error || ref.referenced) {', 'const trashable ='),
    /^if \(ref\.error \|\| ref\.referenced\) \{\s*if \(ref\.error\) console\.error\([^;]*\);\s*return Response\.json\(\{ error: '[^']+' \}, \{ status: 409 \}\);\s*\}\s*$/);
  // ด่านชนิดไฟล์ทั้งบล็อก: อยู่ในถังขยะแล้ว = จบ (ok) · ถามไม่ได้ = log + 502 · ที่เหลือ = 409 — ทุกทางออก return ก่อนถึง
  // ตัวทิ้งไฟล์ ไม่มีทางตกผ่าน
  const guard = slice('if (!trashable.ok) {', "const { deleteFile } = await import('@/lib/drive');");
  assert.match(guard, /^if \(!trashable\.ok\) \{\s*if \(trashable\.reason === 'trashed'\) return Response\.json\(\{ ok: true \}\);\s*if \(trashable\.reason === 'unverifiable'\) \{\s*console\.error\([^;]*\);\s*return Response\.json\(\{ error: '[^']+' \}, \{ status: 502 \}\);\s*\}\s*return Response\.json\(\{ error: '[^']+' \}, \{ status: 409 \}\);\s*\}\s*try \{\s*$/);
  // 🔴 ระหว่างคำถามกับด่านของมันไม่มีอะไรแทรก และผลของคำถามถูกอ่านอย่างเดียว — `receipt.ok = true;` หลังคำถามใบรับ
  //    (หรือเขียนทับ ref / trashable) = ทุกด่านข้างล่างผ่านเงียบ
  assert.match(slice('const supabase = getSupabaseAdmin();', "if (receipt.reason === 'unverifiable') {"),
    /^const supabase = getSupabaseAdmin\(\);\s*const receipt = await uploadReceiptStatus\(supabase, \{ driveFileId, userId: user\.id \}\);\s*$/);
  assert.match(slice('const ref = await driveFileReferenced(', 'if (ref.error || ref.referenced) {'),
    /^const ref = await driveFileReferenced\(supabase, driveFileId\);\s*$/);
  assert.match(slice('const trashable = await driveFileTrashable(', 'if (!trashable.ok) {'),
    /^const trashable = await driveFileTrashable\(driveFileId\);\s*$/);
  const DECLARE = /\bconst (receipt|ref|trashable) = /g;
  assert.equal((DRIVE.match(DECLARE) || []).length, 3, 'ประกาศครั้งเดียวต่อตัว');
  assert.doesNotMatch(DRIVE.replace(DECLARE, ''), /\b(receipt|ref|trashable)(\??\.\w+)*\s*=[^=]/);
  // ทิ้งไฟล์เป็นขั้นสุดท้ายจริง: ถัดจากด่านชนิดไฟล์คือ try ของตัวทิ้ง แล้วจบ handler
  assert.match(DRIVE.slice(DRIVE.indexOf("const { deleteFile } = await import('@/lib/drive');")),
    /^const \{ deleteFile \} = await import\('@\/lib\/drive'\);\s*await deleteFile\(driveFileId\);\s*\} catch \{\s*\}\s*return Response\.json\(\{ ok: true \}\);\s*\}\s*$/);
  // id ผู้ใช้มาจาก session ไม่ใช่จาก body
  assert.doesNotMatch(DEL, /userId: body|body\.userId/);
  // ทิ้งไฟล์ทางเดียว และ lib/drive โหลดเฉพาะเมื่อถึงเส้นนี้
  assert.equal((DEL.match(/deleteFile\(/g) || []).length, 1);
  assert.doesNotMatch(LEGACY, /^import [^\n]*from '@\/lib\/drive';$/m);
  assert.match(LEGACY, /^export const runtime = 'nodejs';$/m);
});

test('🔴 DELETE /api/upload: สวิตช์ผ่อนด่านไม่มีผลที่นี่ · ไม่ถามฐานเองในเส้นนี้ (ทุกคำถามผ่านตัวช่วยที่อ่าน error) · ขา storagePath คงเดิม', () => {
  assert.doesNotMatch(DEL, /observe|uploadReceiptMode|requireUploadReceipt|UPLOAD_RECEIPT_MODE/i, 'เส้นถอยการอัปต้องไม่รู้จักสวิตช์เลย');
  // 🐞 เดิมถามสองตารางตรงนี้แล้วทิ้ง `error` (`const [{ data: attRef }, { data: wonRef }]`) ⇒ ฐานล่ม = "ไม่มีใครอ้าง" = ทิ้งไฟล์
  assert.doesNotMatch(DRIVE, /supabase\s*\.from\(/, 'ขา Drive ต้องถามผ่าน uploadReceiptStatus / driveFileReferenced เท่านั้น');
  assert.doesNotMatch(DEL, /\{ data: \w+ \}/, 'อ่าน data โดยไม่รับ error');
  assert.match(LEGACY, /^import \{ driveFileReferenced, driveFileTrashable \} from '@\/lib\/master\/attachments';$/m);
  // ขา bucket ส่วนตัว (หลักฐาน Won ที่ยังเปิดอยู่) ไม่ถูกแตะ
  order(DEL, [
    'if (storagePath) {',
    "if (entityType !== 'quotation_won_evidence' || !entityId || storageBucket !== PRIVATE_EVIDENCE_BUCKET) {",
    'const prefix = privateEvidencePrefix(entityType, entityId);',
    'const scope = await checkPrivateEvidenceScope(user, entityType, entityId);',
    'await supabase.storage.from(PRIVATE_EVIDENCE_BUCKET).remove([storagePath]);',
    'if (!driveFileId) return Response.json({ ok: true });',
  ], 'storagePath');
  // ต้องล็อกอินก่อนเสมอ
  order(DEL, ["if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });", 'if (storagePath) {'], 'auth');
  // หัวคอมเมนต์เดิมที่บอกว่า "ใครก็เรียกได้" ต้องไม่กลับมา
  assert.doesNotMatch(LEGACY_RAW, /ใครก็ตามที่ล็อกอินเรียกได้ \(เป็นการลบไฟล์ที่ตัวเองเพิ่งอัป\)/);
});

test('ตัวช่วยของเส้นถอยการอัป: ทุกคำถามฐานอ่าน error · รายชื่อแหล่งอ้างอิงชี้ไปที่ collectReferencedIds', () => {
  const LIB_RAW = read('../master/attachments.js');
  const LIB = strip(LIB_RAW);
  const fn = LIB.slice(LIB.indexOf('export async function driveFileReferenced('));
  assert.match(fn, /if \(held\.error\) return \{ referenced: true,/);
  assert.match(fn, /if \(won\.error\) return \{ referenced: true,/);
  assert.match(fn, /if \(updates\.error\) return \{ referenced: true,/);
  assert.match(fn, /\} catch \(err\) \{\s*return \{ referenced: true, where: null, error: err \};/);
  // อ่านแบบมีเพดาน คำสั่งเดียวกัน · 🔴 ค่าของ `.contains` บนช่อง jsonb ต้องเป็นสตริง JSON — array ของ JS ถูกประกอบเป็น
  // `cs.{[object Object]}` แล้วฐานจริงตอบ 22P02 ทุกครั้ง (= เส้นถอยการอัปตอบ 409 ทุกคำขอ) · URL จริงตรวจที่ attachmentSafeRelease.test.mjs
  assert.match(fn, /const needle = JSON\.stringify\(\[\{ driveFileId: fileId \}\]\);/);
  assert.match(fn, /supabase\.from\('quotations'\)\.select\('id'\)\.contains\('wonAttachments', needle\)\.limit\(1\)/);
  assert.match(fn, /supabase\.from\('entity_updates'\)\.select\('id'\)\.contains\('attachments', needle\)\.limit\(1\)/);
  assert.doesNotMatch(LIB, /\.contains\([^)]*\[\s*\{/, 'ห้ามส่ง array ของ JS ให้ .contains');
  const doc = LIB_RAW.slice(LIB_RAW.lastIndexOf('/**', LIB_RAW.indexOf('export async function driveFileReferenced(')), LIB_RAW.indexOf('export async function driveFileReferenced('));
  assert.match(doc, /collectReferencedIds/);
  assert.match(doc, /src\/lib\/driveMaintenance\.js/);
  // ตัวกวาดทั้งระบบยังมีอยู่จริง และยังกวาดสามแหล่งเดียวกัน (เพิ่มแหล่งที่นั่น = ต้องมาเพิ่มที่ตัวช่วยด้วย)
  // ข้อยกเว้นเดียว = service_visits: ตัวกวาดอ่าน แต่ตัวช่วยตั้งใจไม่ถาม — ไฟล์ของนัดถูกกันด้วยใบรับที่จองเป็น
  // 'service_visits:<id>' (เหตุผลต้องเขียนอยู่ที่คอมเมนต์ของ driveFileReferenced — ตรึงไว้สองบรรทัดล่าง)
  assert.match(doc, /service_visits:<id>/);
  assert.doesNotMatch(fn, /service_visits/, 'driveFileReferenced ตั้งใจไม่ถาม service_visits — ถ้าจะเพิ่ม แก้คอมเมนต์กับเทสต์นี้พร้อมกัน');
  const maintenance = read('../driveMaintenance.js');
  const collect = maintenance.slice(maintenance.indexOf('async function collectReferencedIds('), maintenance.indexOf('export async function auditOrphanDriveItems('));
  const tables = [...collect.matchAll(/supabase\.from\('([a-z_]+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(tables, ['attachments', 'customers', 'entity_updates', 'products', 'quotations', 'service_visits'],
    'collectReferencedIds กวาดแหล่งใหม่ — เพิ่มที่ driveFileReferenced (lib/master/attachments.js) ด้วย แล้วค่อยแก้ลิสต์นี้');
});
