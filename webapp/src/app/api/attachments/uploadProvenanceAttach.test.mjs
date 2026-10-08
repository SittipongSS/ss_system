// ── POST /api/attachments (สาขาไฟล์ธรรมดา): ที่มาของไฟล์ต้องพิสูจน์ได้ก่อนเขียนแถว (mig 0406 · มติเจ้าของ 08/10/2569) ──────
//
// 🐞 `driveFileId` มาจาก client และแถวที่ได้คือกุญแจเปิดอ่าน + กุญแจทิ้งไฟล์ใบนั้น · เดิมตรวจให้เฉพาะรูปของแถว checklist ⇒
//    คนที่แก้ระเบียนไหนได้สักใบ แนบแถวที่ชี้ไฟล์ของคนอื่นแล้วเปิดอ่านหรือกดลบเพื่อทิ้งไฟล์นั้นได้
// ⚠️ route นี้ไม่มีฮาร์เนสรันจริง ⇒ ล็อก **ลำดับและรูปของด่าน** ที่นี่ · ตรรกะของใบรับรันจริงที่ lib/upload/receipts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const ROUTE = strip(readFileSync(fileURLToPath(new URL('./route.js', import.meta.url)), 'utf8'));
const post = ROUTE.slice(ROUTE.indexOf('export async function POST'));
const start = post.indexOf('if (!google) {\n    if (typeof driveFileId');
const end = post.indexOf('if (safeDocType === SPEC_ITEM_IMAGE_DOC_TYPE) {', start);
const gate = post.slice(start, end);
const order = (text, needles, label) => {
  const at = needles.map((n) => text.indexOf(n));
  at.forEach((i, k) => assert.ok(i >= 0, `${label}: ไม่พบ ${needles[k]}`));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${label}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
};

test('🔴 ลำดับ: ด่านสิทธิ์ → กติกาชนิดไฟล์ → ต้องมี id → รูปร่าง → ลิงก์ตรงไฟล์ → ใบรับ → มีแถวอื่นถือ → เขียนแถว → ประทับใบรับ', () => {
  assert.ok(start > 0 && end > start, 'หาบล็อกที่มาของไฟล์ไม่เจอ (ต้องอยู่ก่อนบล็อกรูปของแถว checklist)');
  order(post, [
    'if (!allowedWrite) {',
    'const fileRule = docTypeFileRule(safeDocType);',
    'if (ruleError) return Response.json({ error: ruleError }, { status: 400 });',
    "if (!google) {\n    if (typeof driveFileId !== 'string' || !driveFileId) {",
    'if (!DRIVE_FILE_ID_PATTERN.test(driveFileId)) {',
    'const urlFileId = parseDriveId(fileUrl);',
    'if (urlFileId && urlFileId !== driveFileId) {',
    'const receiptStatus = await uploadReceiptStatus(supabase, { driveFileId, userId: user?.id });',
    'const receiptError = await requireUploadReceipt(supabase, {',
    'if (receiptError) return Response.json({ error: receiptError.error }, { status: receiptError.status });',
    'if (receiptStatus.receipt?.claimedBy) {',
    'const holder = await driveFileReferenced(supabase, driveFileId);',
    'if (holder.error) return Response.json({ error: holder.error.message }, { status: 500 });',
    'if (holder.referenced) {',
    'if (safeDocType === SPEC_ITEM_IMAGE_DOC_TYPE) {',
    'const spotUpload = surveySpotUploadMetadata(',
    "googleFile = await buildGoogleAttachment({",
    ".from('attachments').insert(row)",
    'const claim = await claimUploadReceipt(supabase, { driveFileId, claimedBy: `attachments:${data.id}` });',
    'return Response.json(data, { status: 201 });',
  ], 'POST');
  // 🔴 คนไม่มีสิทธิ์ต้องไม่ได้ใช้เส้นนี้ถามว่า id ไหนมีใบรับ/มีคนถือ — ไม่มีคำถามใบรับหรือ "ใครถือ" ก่อนด่านสิทธิ์
  const beforeGate = post.slice(0, post.indexOf('if (!allowedWrite) {'));
  assert.doesNotMatch(beforeGate, /uploadReceiptStatus|requireUploadReceipt|driveFileHeld|driveFileReferenced|claimUploadReceipt|upload_receipts/);
  // ด่านระเบียนถูกล็อก (ทะเบียนอนุมัติแล้ว · สัญญาตรึงไฟล์ · ใบสั่งขายยกเลิก) ก็มาก่อนเช่นกัน
  order(post, ["if (entityType === 'sales_order' && user?.role !== 'admin') {", "if (!google) {\n    if (typeof driveFileId"], 'ด่านระเบียน');
});

test('🔴 ต้องมี driveFileId เป็นตัวหนังสือ — null/undefined/ว่าง/ตัวเลข/array/object = 400 · id ผิดรูป = 400 · ลิงก์ไม่ตรงไฟล์ = 400', () => {
  const required = gate.slice(0, gate.indexOf('if (!DRIVE_FILE_ID_PATTERN.test(driveFileId)) {'));
  assert.match(required, /^if \(!google\) \{\s*if \(typeof driveFileId !== 'string' \|\| !driveFileId\) \{\s*return Response\.json\(\{ error: '[^']+' \}, \{ status: 400 \}\);\s*\}\s*$/);
  // เงื่อนไขเดียวกันรันจริง: ทุกค่าที่ไม่ใช่ตัวหนังสือที่มีเนื้อ ต้องตกด่านแรก
  const rejected = (driveFileId) => typeof driveFileId !== 'string' || !driveFileId;
  for (const bad of [null, undefined, '', 0, 42, ['1AbC'], { id: '1AbC' }, true]) assert.equal(rejected(bad), true, JSON.stringify(bad));
  assert.equal(rejected('1AbC_def-123456789'), false);
  // 🔴 ทั้งบล็อกของแต่ละด่านต้องเป็น "เงื่อนไข → return 400" เท่านั้น — เดิมดูแค่ว่ามีคำว่า `status: 400` อยู่ในช่วงนั้น
  //    ⇒ ถอด `return` ออก (ด่านไม่หยุดคำขอ) เทสต์ยังเขียว
  const REJECT_400 = String.raw`\{\s*return Response\.json\(\{ error: '[^']+' \}, \{ status: 400 \}\);\s*\}\s*$`;
  assert.match(gate.slice(gate.indexOf('if (!DRIVE_FILE_ID_PATTERN.test(driveFileId)) {'), gate.indexOf('const urlFileId')),
    new RegExp(String.raw`^if \(!DRIVE_FILE_ID_PATTERN\.test\(driveFileId\)\) ${REJECT_400}`));
  assert.match(gate.slice(gate.indexOf('if (urlFileId && urlFileId !== driveFileId) {'), gate.indexOf('const receiptStatus')),
    new RegExp(String.raw`^if \(urlFileId && urlFileId !== driveFileId\) ${REJECT_400}`));
  // id ที่เทียบกับลิงก์ต้องมาจาก fileUrl ของคำขอ บรรทัดเดียว ไม่มีอะไรคั่นก่อนด่าน
  assert.match(gate.slice(gate.indexOf('const urlFileId'), gate.indexOf('const receiptStatus')),
    /^const urlFileId = parseDriveId\(fileUrl\);\s*if \(urlFileId && urlFileId !== driveFileId\) \{/);
  assert.match(ROUTE, /^import \{ parseDriveId \} from '@\/lib\/driveId';$/m);
  // 🪤 แถวที่มีแต่ fileUrl ต้องไม่มีทางลงตารางจากสาขานี้อีก — ค่าที่เก็บยังเป็น id ที่ผ่านด่านแล้ว
  assert.match(post, /driveFileId: googleFile \? googleFile\.driveFileId : \(driveFileId \|\| null\),/);
});

test('🔴 ใบรับ: ถามด้วย id ผู้ใช้จาก session · ปฏิเสธด้วยสถานะ/ข้อความของตัวช่วย · ใบรับถูกประทับแล้ว = 400 · สวิตช์อยู่ในตัวช่วยเท่านั้น', () => {
  assert.match(gate, /const receiptError = await requireUploadReceipt\(supabase, \{\s*driveFileId,\s*userId: user\?\.id,\s*status: receiptStatus,\s*route: 'POST \/api\/attachments',\s*logContext: \{ entityType, entityId, docType: safeDocType \},\s*\}\);/);
  const claimed = gate.slice(gate.indexOf('if (receiptStatus.receipt?.claimedBy) {'), gate.indexOf('if (safeDocType !== SPEC_ITEM_IMAGE_DOC_TYPE) {'));
  assert.match(claimed, /^if \(receiptStatus\.receipt\?\.claimedBy\) \{\s*return Response\.json\(\{ error: 'ไฟล์นี้ถูกแนบไว้กับเอกสารอื่นแล้ว — อัปไฟล์ใหม่แล้วแนบอีกครั้ง' \}, \{ status: 400 \}\);\s*\}\s*$/);
  // 🔴 ผลของใบรับถูกอ่านอย่างเดียว — ไม่มีบรรทัดไหนเขียนทับ (`receiptStatus.receipt = null` = ด่าน "ถูกประทับแล้ว" หายเงียบ)
  const DECLARE = /\bconst (receiptStatus|receiptError|holder) = /g;
  assert.equal((gate.match(DECLARE) || []).length, 3, 'ประกาศครั้งเดียวต่อตัว');
  assert.doesNotMatch(gate.replace(DECLARE, ''), /\b(receiptStatus|receiptError|holder)(\??\.\w+)*\s*=[^=]/);
  // ระหว่างคำถามใบรับ กับด่าน "ถูกประทับแล้ว" มีแค่บรรทัดปฏิเสธของตัวช่วย — ไม่มีอะไรแทรก
  const callEnd = gate.indexOf('});', gate.indexOf('const receiptError = await requireUploadReceipt(supabase, {')) + 3;
  assert.match(gate.slice(callEnd, gate.indexOf('if (receiptStatus.receipt?.claimedBy) {')),
    /^\s*if \(receiptError\) return Response\.json\(\{ error: receiptError\.error \}, \{ status: receiptError\.status \}\);\s*$/);
  assert.match(gate.slice(gate.indexOf('const receiptStatus'), gate.indexOf('const receiptError')),
    /^const receiptStatus = await uploadReceiptStatus\(supabase, \{ driveFileId, userId: user\?\.id \}\);\s*$/);
  // route ไม่อ่านโหมดเอง — ถ้าอ่าน วันหนึ่งจะมีคนเอาไปครอบด่านอื่น (รูปร่าง · ลิงก์ · มีแถวอื่นถือ) ที่สวิตช์ต้องไม่ผ่อน
  assert.doesNotMatch(ROUTE, /uploadReceiptMode|UPLOAD_RECEIPT_MODE|observe/);
  assert.doesNotMatch(gate, /userId: body|body\.userId|userId: uploadedBy/);
  assert.match(ROUTE, /^import \{\s*DRIVE_FILE_ID_PATTERN, claimUploadReceipt, requireUploadReceipt, uploadReceiptStatus,\s*\} from '@\/lib\/upload\/receipts';$/m);
});

// 🐞 เดิมบล็อกนี้ถามแค่แถว attachments (`driveFileHeld`) ⇒ ไฟล์ที่โพสต์ไว้ในเธรด (ใบรับยังไม่ถูกประทับ) แนบเป็นไฟล์แนบได้ แล้ว
//    ลบแถว = ทิ้งไฟล์ของเธรด — ต้องถามรายชื่อแหล่งเดียวกับเส้นถอยการอัปและตัวปล่อยไฟล์ (`driveFileReferenced`)
test('🔴 "มีที่อื่นอ้างไฟล์นี้" บังคับทุก docType: ทั่วไปถามสามแหล่งที่บล็อกนี้ (ตรวจไม่ได้ = 500 ก่อนตัดสิน) · รูปของแถว checklist ถามที่บล็อกของตัวเอง', () => {
  const heldPart = gate.slice(gate.indexOf('if (safeDocType !== SPEC_ITEM_IMAGE_DOC_TYPE) {'));
  assert.match(heldPart, /^if \(safeDocType !== SPEC_ITEM_IMAGE_DOC_TYPE\) \{\s*const holder = await driveFileReferenced\(supabase, driveFileId\);\s*if \(holder\.error\) return Response\.json\(\{ error: holder\.error\.message \}, \{ status: 500 \}\);\s*if \(holder\.referenced\) \{\s*return Response\.json\(\{ error: 'ไฟล์นี้ถูกแนบไว้กับเอกสารอื่นแล้ว — อัปไฟล์ใหม่แล้วแนบอีกครั้ง' \}, \{ status: 400 \}\);\s*\}\s*\}\s*\}\s*$/);
  const spec = post.slice(end, post.indexOf('const spotUpload', end));
  assert.match(spec, /const held = await driveFileHeld\(supabase, driveFileId\);/);
  assert.equal((post.match(/driveFileHeld\(supabase, driveFileId\)/g) || []).length, 1, 'เหลือที่บล็อกรูปของแถว checklist จุดเดียว');
  assert.equal((post.match(/driveFileReferenced\(/g) || []).length, 1);
  assert.match(ROUTE, /^import \{ driveFileReferenced \} from '@\/lib\/master\/attachments';$/m);
  // ไม่ถามทะเบียนใบรับซ้ำเพื่อด่านนี้ — คำถามใบรับยังมีครั้งเดียวทั้ง handler
  assert.equal((post.match(/uploadReceiptStatus\(/g) || []).length, 1);
});

test('🔴 สาขาเอกสาร Google ไม่ผ่านด่านใบรับ (id ของสาขานั้นมาจาก Drive) · ประทับใบรับเฉพาะสาขาไฟล์ธรรมดา หลังเขียนแถวสำเร็จ', () => {
  // ทุกการเรียกเรื่องใบรับอยู่ใต้ `if (!google)` — นับจากตัวหนังสือ: สองบล็อก (ด่าน · ประทับ) และไม่มีที่อื่น
  assert.equal((post.match(/if \(!google\) \{/g) || []).length, 2);
  assert.equal((post.match(/uploadReceiptStatus\(/g) || []).length, 1);
  assert.equal((post.match(/requireUploadReceipt\(/g) || []).length, 1);
  assert.equal((post.match(/claimUploadReceipt\(/g) || []).length, 1);
  assert.ok(post.indexOf('uploadReceiptStatus(') > start && post.indexOf('requireUploadReceipt(') < end);
  const afterInsert = post.slice(post.indexOf(".from('attachments').insert(row)"));
  assert.match(afterInsert, /if \(error\) return Response\.json\(\{ error: error\.message \}, \{ status: 500 \}\);\s*if \(!google\) \{\s*const claim = await claimUploadReceipt\(supabase, \{ driveFileId, claimedBy: `attachments:\$\{data\.id\}` \}\);\s*if \(claim\.error\) console\.error\(/);
  // ประทับพัง = log อย่างเดียว — แถวเขียนสำเร็จแล้ว ห้ามตอบ error
  const claimBlock = afterInsert.slice(afterInsert.indexOf('if (!google) {'), afterInsert.indexOf('if (isMgmt(entityType)) {'));
  assert.doesNotMatch(claimBlock, /return/);
  // สาขา Google: เรียกสร้าง/ผูกเอกสารแบบเดิม ไม่มีอะไรเรื่องใบรับคั่น
  const googleBranch = post.slice(post.indexOf('let googleFile = null;'), post.indexOf('const row = {'));
  assert.doesNotMatch(googleBranch, /Receipt|driveFileHeld/);
  // lib/drive ยังโหลดแบบ dynamic เท่านั้น
  assert.doesNotMatch(ROUTE, /^import [^\n]*from '@\/lib\/drive';$/m);
});
