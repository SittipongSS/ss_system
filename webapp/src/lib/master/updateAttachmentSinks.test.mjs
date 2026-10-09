// ── ไฟล์ในเธรดอัปเดต: ทุกทางที่เขียน `entity_updates.attachments` ต้องผ่านด่านที่มาของไฟล์ (รอบสองของมติเจ้าของ 08/10/2569) ──
//
// 🐞 POST /api/updates กับ PATCH /api/updates/[id] เคยเก็บ `driveFileId` ที่ client ส่งมาทั้งดุ้น แล้ว /api/updates/[id]/file
//    สตรีมไฟล์ตาม id นั้นด้วยบัญชีของระบบ ⇒ ใครโพสต์ในเธรดไหนได้สักเธรด (เช่นใบแจ้งปัญหาของตัวเอง) อ่านไฟล์ Drive ใบไหนก็ได้
// ⚠️ สอง route นี้ไม่มีฮาร์เนสรันจริง ⇒ ล็อก **ลำดับและรูปของด่าน** จากซอร์ส · ตัวช่วยในไฟล์ route (ส่งออกไม่ได้) ถูกดึงมารันจริง ·
//    ตรรกะของด่านเองรันจริงที่ lib/upload/driveRefGate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sanitizeUpdateAttachments } from './updateTypes.js';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = (rel) => strip(readFileSync(path.join(SRC, rel), 'utf8'));
const walk = (dir) => readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
  const rel = `${dir}/${entry.name}`;
  if (entry.isDirectory()) return walk(rel);
  return /\.js$/.test(entry.name) && !/\.test\./.test(entry.name) ? [rel] : [];
});
const order = (text, needles, label) => {
  const at = needles.map((n) => text.indexOf(n));
  at.forEach((i, k) => assert.ok(i >= 0, `${label}: ไม่พบ ${needles[k]}`));
  for (let k = 1; k < at.length; k += 1) assert.ok(at[k - 1] < at[k], `${label}: ${needles[k - 1]} ต้องมาก่อน ${needles[k]}`);
};
// อาร์กิวเมนต์ของการเรียกหนึ่งครั้ง (นับวงเล็บ) — ใช้ดูว่าการเรียกนั้นส่งคีย์อะไรบ้าง
const callArgs = (text, from) => {
  let depth = 0;
  for (let i = text.indexOf('(', from); i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') { depth -= 1; if (depth === 0) return text.slice(from, i + 1); }
  }
  return text.slice(from);
};

const POST_ROUTE = 'app/api/updates/route.js';
const PATCH_ROUTE = 'app/api/updates/[id]/route.js';
const API_FILES = walk('app/api');
const SERVER_FILES = [...API_FILES, ...walk('lib')];
const postSource = code(POST_ROUTE);
const post = postSource.slice(postSource.indexOf('export async function POST'));
const patchSource = code(PATCH_ROUTE);
const patch = patchSource.slice(patchSource.indexOf('export async function PATCH'), patchSource.indexOf('export async function DELETE'));

const ID = '1AbCdEfGhIjKlMnOpQrStUvWx';
const ref = (id = ID, extra = {}) => ({
  fileUrl: `https://drive.google.com/file/d/${id}/view`, driveFileId: id, fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10, ...extra,
});

// ── ทะเบียนทางเข้า ───────────────────────────────────────────────────────────────────────────────────────────────

/* route ที่รับไฟล์ของเธรดจาก client (เรียก `sanitizeUpdateAttachments`) — เพิ่มทางใหม่ต้องมาลงที่นี่พร้อมด่าน */
const SANITIZER_ROUTES = { [POST_ROUTE]: 'verifyDriveRefs(' };

test('🔴 ทะเบียน: route ที่เรียก sanitizeUpdateAttachments ต้องอยู่ในทะเบียน และเรียกด่านที่มาของไฟล์', () => {
  const callers = API_FILES.filter((rel) => code(rel).includes('sanitizeUpdateAttachments('));
  assert.deepEqual(callers.sort(), Object.keys(SANITIZER_ROUTES).sort(),
    'route ที่รับไฟล์ของเธรดเปลี่ยนไป — ทางใหม่ต้องเรียก verifyDriveRefs แล้วลงทะเบียน · ทางที่เลิกแล้วต้องถอดออก');
  for (const [rel, gate] of Object.entries(SANITIZER_ROUTES)) assert.ok(code(rel).includes(gate), `${rel}: ไม่เรียก ${gate}`);
});

/* ที่ที่ส่งคีย์ `attachments` ให้ `appendUpdate` — ผู้เรียกฝั่ง server ที่เหลือ (ราว 60 จุด) ไม่ส่งไฟล์ จึงไม่ต้องผ่านด่าน */
const APPEND_WITH_FILES = [POST_ROUTE, 'lib/master/updates.js'];

test('🔴 ทะเบียน: มีแต่ POST /api/updates ที่ส่งไฟล์ให้ appendUpdate — ที่อื่นส่งไฟล์เข้าเธรด = ข้ามด่าน', () => {
  const found = SERVER_FILES.filter((rel) => {
    const text = code(rel);
    for (let at = text.indexOf('appendUpdate('); at >= 0; at = text.indexOf('appendUpdate(', at + 1)) {
      if (/\battachments\b/.test(callArgs(text, at))) return true;
    }
    return false;
  });
  assert.deepEqual(found.sort(), [...APPEND_WITH_FILES].sort());
  // ใน route เอง: เรียกสองครั้ง ครั้งที่ส่งไฟล์คือข้อความของคนพิมพ์ครั้งเดียว (อีกครั้งคือบรรทัด "ตราหลุด" ของระบบ)
  const withFiles = [...post.matchAll(/appendUpdate\(/g)].filter((m) => /\battachments\b/.test(callArgs(post, m.index)));
  assert.equal(withFiles.length, 1);
});

/* ที่ที่เขียนตาราง entity_updates ตรง ๆ (ไม่ผ่าน appendUpdate) — แต่ละที่ต้องไม่เขียนไฟล์ที่มาจากคำขอ */
const DIRECT_WRITERS = {
  'lib/master/updates.js': 'insert ของ appendUpdate (ไฟล์มาจากผู้เรียก — ดูทะเบียนข้างบน)',
  [PATCH_ROUTE]: 'แก้ข้อความ: ไฟล์มาจากแถวเดิมเท่านั้น · ลบ: ไม่แตะไฟล์',
  'app/api/pm/personal-tasks/route.js': 'ประทับรับทราบ — ไม่มีคีย์ attachments',
};

test('🔴 ทะเบียน: ที่เขียนตาราง entity_updates ตรง ๆ ต้องอยู่ในทะเบียน และไม่เขียน attachments จากคำขอ', () => {
  const WRITE = /from\('entity_updates'\)\s*\.(insert|update|upsert)\(/g;
  const writers = SERVER_FILES.filter((rel) => code(rel).search(WRITE) >= 0);
  assert.deepEqual(writers.sort(), Object.keys(DIRECT_WRITERS).sort());
  const ack = code('app/api/pm/personal-tasks/route.js');
  for (const m of ack.matchAll(WRITE)) assert.doesNotMatch(callArgs(ack, m.index), /attachments/);
});

// ── POST /api/updates ───────────────────────────────────────────────────────────────────────────────────────────

test('🔴 POST ลำดับ: เห็นเธรด (404) → โพสต์ได้ (403) → sanitize → ต้องมี id+ลิงก์ → ด่านใบรับ → ตีกลับ → appendUpdate', () => {
  order(post, [
    'if (!parent || !(await canViewUpdates(supabase, entityType, parent, user))) {',
    'if (!(await canPostUpdate(supabase, entityType, parent, user))) {',
    '? sanitizeUpdateAttachments(payload.attachments)',
    'if (attachments.some(incompleteFileRef)) {',
    'const refGate = await verifyDriveRefs(supabase, {',
    'if (refGate.error) {',
    'const { row, error } = await appendUpdate(supabase, {',
  ], 'POST');
  // 🔴 คนโพสต์ไม่ได้ต้องไม่ได้ใช้เส้นนี้ถามว่า id ไหนมีใบรับ — ไม่มีคำถามใบรับก่อนด่านสิทธิ์
  const beforeGate = post.slice(0, post.indexOf('if (!(await canPostUpdate('));
  assert.doesNotMatch(beforeGate, /verifyDriveRefs|uploadReceiptStatus|requireUploadReceipt|upload_receipts/);
  // ด่านมีที่เดียว และไม่มีอะไรเขียนฐานคั่นระหว่างด่านกับด่านสิทธิ์
  assert.equal(postSource.split('verifyDriveRefs(').length - 1, 1);
  const between = post.slice(post.indexOf('if (!(await canPostUpdate('), post.indexOf('const refGate ='));
  assert.doesNotMatch(between, /\.(insert|update|upsert|delete)\(|appendUpdate\(/);
});

test('🔴 POST: ตัวที่ไม่มี driveFileId หรือไม่มีลิงก์ = 400 พร้อม code (ไม่รับไฟล์ที่มีแต่ลิงก์) — รันเงื่อนไขจริง', () => {
  const block = postSource.slice(postSource.indexOf('function incompleteFileRef('), postSource.indexOf('export async function GET'));
  const incompleteFileRef = new Function(`${block}\nreturn incompleteFileRef;`)();
  for (const bad of [
    { fileUrl: 'https://drive.google.com/file/d/x/view', driveFileId: null },
    { fileUrl: 'https://drive.google.com/file/d/x/view' },
    { fileUrl: 'https://drive.google.com/file/d/x/view', driveFileId: '' },
    { fileUrl: 'https://drive.google.com/file/d/x/view', driveFileId: 42 },
    { driveFileId: ID, fileUrl: null },
    { driveFileId: ID, fileUrl: '' },
    { driveFileId: ID },
  ]) assert.equal(incompleteFileRef(bad), true, JSON.stringify(bad));
  assert.equal(incompleteFileRef(ref()), false);
  // 🔴 ของจริงที่ผ่านตัวกรองรูปมาแล้ว: ไฟล์ที่มีแต่ลิงก์ (รูปที่รอบแรกยังรับ) ต้องตกที่นี่
  const urlOnly = sanitizeUpdateAttachments([{ fileUrl: 'https://drive.google.com/file/d/x/view', fileName: 'a.pdf' }]);
  assert.equal(urlOnly.length, 1);
  assert.equal(urlOnly.some(incompleteFileRef), true);
  assert.equal(sanitizeUpdateAttachments([ref()]).some(incompleteFileRef), false);
  // บล็อกของด่านต้องเป็น "เงื่อนไข → return 400 พร้อม code" เท่านั้น
  assert.match(post.slice(post.indexOf('if (attachments.some(incompleteFileRef)) {'), post.indexOf('const refGate =')),
    /^if \(attachments\.some\(incompleteFileRef\)\) \{\s*return Response\.json\(\{ error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE \}, \{ status: 400 \}\);\s*\}\s*$/);
});

test('🔴 POST: ด่านรับไฟล์ชุดเดียวกับที่จะเขียน · ไม่มีไฟล์เดิม · ไม่ตีกลับใบรับที่ประทับแล้ว · ไม่ประทับ · ตอบตามที่ด่านบอก', () => {
  const call = callArgs(post, post.indexOf('verifyDriveRefs('));
  assert.match(call, /^verifyDriveRefs\(supabase, \{\s*refs: attachments\.map\(\(\{ driveFileId, fileUrl \}\) => \(\{ driveFileId, fileUrl \}\)\),/);
  assert.match(call, /userId: user\?\.id,/);
  assert.match(call, /storedIds: new Set\(\),/);
  assert.match(call, /refuseClaimed: false,/);
  assert.match(call, /route: 'POST \/api\/updates',/);
  assert.match(call, /logContext: \{ entityType, entityId, rule: 'thread-file' \},/);
  assert.doesNotMatch(call, /ownClaim/);
  // ตีกลับ: status กับข้อความของด่าน · `code` ติดเฉพาะเมื่อด่านให้มา (400) — 503 ไม่มี code จอจึงไม่ลืมไฟล์ที่จำไว้
  assert.match(post.slice(post.indexOf('if (refGate.error) {'), post.indexOf('const kind =')),
    /^if \(refGate\.error\) \{\s*const \{ status, error: refError, code \} = refGate\.error;\s*return Response\.json\(\{ error: refError, \.\.\.\(code \? \{ code \} : \{\}\) \}, \{ status \}\);\s*\}\s*$/);
  // เธรดไม่ประทับใบรับ
  assert.doesNotMatch(postSource, /claimDriveRefs|claimUploadReceipt/);
  // 🔴 ของที่เขียนคือ `attachments` ตัวเดียวกับที่ด่านตรวจ — ประกาศครั้งเดียว ไม่ถูกกำหนดค่าใหม่ และส่งให้ appendUpdate ตรง ๆ
  assert.equal(post.split('const attachments =').length - 1, 1);
  assert.doesNotMatch(post.replace('const attachments =', ''), /(^|[^.\w])attachments\s*=[^=>]|attachments\.(push|unshift|splice)\(/m);
  assert.match(post, /await appendUpdate\(supabase, \{\s*entityType, entityId, kind, body: text \|\| null, meta, attachments, user,\s*\}\);/);
  assert.doesNotMatch(post.replace('sanitizeUpdateAttachments(payload.attachments)', ''), /payload\.attachments/);
});

test('🔴 appendUpdate กรองซ้ำแล้วได้ชุดเดิม — ไม่มีตัวไหนถูกเติมกลับหลังผ่านด่าน', () => {
  // ชุดที่ผ่านด่านแล้วเข้า `sanitizeUpdateAttachments` อีกรอบใน appendUpdate: ต้องได้ของเดิมทุกช่อง
  const once = sanitizeUpdateAttachments([
    ref(), ref('2AbCdEfGhIjKlMnOpQrStUvWx', { evil: 1, sizeBytes: 'x' }), { fileName: 'no-url.pdf', driveFileId: ID }, null, 'x',
  ]);
  assert.equal(once.length, 2);
  assert.deepEqual(sanitizeUpdateAttachments(once), once);
  assert.deepEqual(sanitizeUpdateAttachments(once).map((a) => a.driveFileId), [ID, '2AbCdEfGhIjKlMnOpQrStUvWx']);
  // appendUpdate เขียนไฟล์จากอาร์กิวเมนต์ของผู้เรียกทางเดียว และ insert แถวที่เพิ่งประกอบ
  const lib = code('lib/master/updates.js');
  const append = lib.slice(lib.indexOf('export async function appendUpdate('), lib.indexOf('export async function', lib.indexOf('export async function appendUpdate(') + 1));
  assert.equal(append.split('attachments').length - 1, 3, 'appendUpdate: attachments ต้องมีแค่พารามิเตอร์กับบรรทัดกรอง');
  assert.match(append, /attachments: sanitizeUpdateAttachments\(attachments\),/);
  assert.match(append, /from\('entity_updates'\)\.insert\(row\)/);
});

// ── PATCH /api/updates/[id] (action 'edit') ──────────────────────────────────────────────────────────────────────

// ดึงตอนเทสต์รัน (ไม่ใช่ตอนโหลดไฟล์) — ตัวช่วยหายไปต้องล้มเฉพาะเทสต์ของ PATCH ไม่ใช่ทั้งไฟล์
const loadKeptAttachments = () => {
  const block = patchSource.slice(patchSource.indexOf('function keptAttachments('), patchSource.indexOf('export async function PATCH'));
  return new Function(`${block}\nreturn keptAttachments;`)();
};

test('🔴 PATCH: ไฟล์ตอนแก้ = ชุดย่อยของไฟล์ที่แถวถืออยู่ — คืนตัวที่แถวเก็บไว้ทั้งก้อน เรียงตามที่ส่งมา', () => {
  const keptAttachments = loadKeptAttachments();
  const a = ref('1AAAAAAAAAAAAAAAAAAAAAAAA');
  const b = ref('1BBBBBBBBBBBBBBBBBBBBBBBB');
  const legacy = { fileUrl: 'https://docs.google.com/document/d/1CCCCCCCCCCCCCCCCCCCCCCCCC/edit', driveFileId: null, fileName: 'old.doc' };
  const stored = [a, b, legacy];

  assert.deepEqual(keptAttachments(stored, []), []);
  const same = keptAttachments(stored, [{ driveFileId: a.driveFileId }, { driveFileId: b.driveFileId }, { fileUrl: legacy.fileUrl }]);
  assert.deepEqual(same, stored);
  same.forEach((item, i) => assert.equal(item, stored[i], 'ต้องเป็นตัวที่แถวเก็บไว้ ไม่ใช่ของที่ประกอบจากคำขอ'));
  // เรียงตามที่ส่งมา · ถอดไฟล์ได้
  assert.deepEqual(keptAttachments(stored, [{ driveFileId: b.driveFileId }, { driveFileId: a.driveFileId }]), [b, a]);
  // 🔴 ช่องอื่นของคำขอไม่ถูกเก็บ — ลิงก์/ชื่อ/ชนิดที่ส่งมาคู่กับ id เดิมถูกทิ้ง
  const tampered = keptAttachments(stored, [{ driveFileId: a.driveFileId, fileUrl: 'https://evil.example/x', fileName: 'x.exe', mimeType: 'text/html', evil: 1 }]);
  assert.deepEqual(tampered, [a]);
  assert.equal(tampered[0], a);
  // แถวไม่ถูกแก้ระหว่างตรวจ
  assert.deepEqual(stored, [a, b, legacy]);
});

test('🔴 PATCH: ไฟล์ที่แถวไม่มี · ส่งซ้ำ · ไม่ใช่ array · ตัวที่ไม่ใช่ object = null (ตีกลับทั้งคำขอ)', () => {
  const keptAttachments = loadKeptAttachments();
  const a = ref('1AAAAAAAAAAAAAAAAAAAAAAAA');
  const legacy = { fileUrl: 'https://docs.google.com/document/d/1CCCCCCCCCCCCCCCCCCCCCCCCC/edit', driveFileId: null };
  const stored = [a, legacy];
  // 🔴 ช่องเดิม: id ของไฟล์คนอื่น — ทั้งส่งเดี่ยวและส่งปนกับไฟล์เดิม
  assert.equal(keptAttachments(stored, [ref('1VICTIMVICTIMVICTIMVICTIM')]), null);
  assert.equal(keptAttachments(stored, [{ driveFileId: a.driveFileId }, ref('1VICTIMVICTIMVICTIMVICTIM')]), null);
  assert.equal(keptAttachments([], [a]), null);
  assert.equal(keptAttachments(null, [a]), null);
  // ตัวที่แถวเก็บไว้พร้อม id จับคู่ด้วย id เท่านั้น — ลิงก์ตรงแต่ id ไม่ตรง/ไม่ส่ง id ไม่นับ
  assert.equal(keptAttachments(stored, [{ fileUrl: a.fileUrl }]), null);
  assert.equal(keptAttachments(stored, [{ fileUrl: a.fileUrl, driveFileId: '1VICTIMVICTIMVICTIMVICTIM' }]), null);
  // ตัวรุ่นเก่า (ไม่มี id) จับคู่ด้วยลิงก์ที่ตรงทุกตัวอักษร
  assert.equal(keptAttachments(stored, [{ fileUrl: `${legacy.fileUrl}?x=1` }]), null);
  // ส่งซ้ำ: ตัวที่แถวเก็บไว้หนึ่งตัวเลือกได้ครั้งเดียว
  assert.equal(keptAttachments(stored, [{ driveFileId: a.driveFileId }, { driveFileId: a.driveFileId }]), null);
  assert.equal(keptAttachments(stored, [{ fileUrl: legacy.fileUrl }, { fileUrl: legacy.fileUrl }]), null);
  // รูปผิด
  for (const bad of [null, undefined, 'x', 0, {}, { 0: a, length: 1 }]) assert.equal(keptAttachments(stored, bad), null, JSON.stringify(bad));
  for (const bad of [null, undefined, 'x', 7, a.driveFileId]) assert.equal(keptAttachments(stored, [bad]), null, JSON.stringify(bad));
  // ตัวที่แถวเก็บไว้แบบไม่มีทั้ง id และลิงก์ (รูปเก่ามาก) ต้องไม่จับคู่กับคำขอที่ไม่ส่งอะไรเลย
  assert.equal(keptAttachments([{ name: 'old', url: 'u' }], [{}]), null);
  assert.equal(keptAttachments([null, 'x'], [{}]), null);
});

test('🔴 PATCH ลำดับ: เห็นเธรด → แก้ได้ (403) → ชุดย่อยของแถวเดิม → 400 พร้อม code → เขียน · ไม่รับไฟล์จากคำขอ ไม่ถามใบรับ', () => {
  order(patch, [
    'if (!(await canViewUpdates(supabase, row.entityType, parent, user))) {',
    "} else if (body.action === 'edit') {",
    'if (!(await canMutateUpdate(supabase, row.entityType, parent, user, row))) {',
    "const attachments = updateEntityConfig(row.entityType)?.attachments && 'attachments' in body",
    'if (!attachments) {',
    'patch = { body: text || null, attachments, editedAt: nowIso };',
    ".from('entity_updates').update(patch).eq('id', id).select().single();",
  ], 'PATCH');
  // ไฟล์ที่เขียนมีสองที่มาเท่านั้น: ชุดย่อยที่เลือกจากแถว หรือแถวเดิมทั้งชุด (ไม่ส่งคีย์มา)
  assert.match(patch, /const attachments = updateEntityConfig\(row\.entityType\)\?\.attachments && 'attachments' in body\s*\? keptAttachments\(row\.attachments, body\.attachments\)\s*: \(row\.attachments \|\| \[\]\);/);
  assert.match(patch.slice(patch.indexOf('if (!attachments) {'), patch.indexOf('if (!text && !attachments.length) {')),
    /^if \(!attachments\) \{\s*return Response\.json\(\{ error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE \}, \{ status: 400 \}\);\s*\}\s*$/);
  // `body.attachments` ถูกอ่านที่เดียว (ส่งให้ตัวเลือกชุดย่อย) · ไม่มีการกำหนด attachments ลง patch ทางอื่น
  assert.equal(patch.split('body.attachments').length - 1, 1);
  const others = patch.split(/const attachments =|'attachments' in body|keptAttachments\(row\.attachments, body\.attachments\)|\(row\.attachments \|\| \[\]\)|if \(!attachments\) \{|!attachments\.length|\?\.attachments|, attachments, editedAt/).join('');
  assert.doesNotMatch(others, /attachments/, 'PATCH: มีการใช้ attachments นอกรูปที่ล็อกไว้');
  // ทั้งไฟล์: ไม่กรองไฟล์จากคำขอ ไม่เขียนผ่าน appendUpdate ไม่ถามใบรับ
  assert.doesNotMatch(patchSource, /sanitizeUpdateAttachments|appendUpdate\(|verifyDriveRefs|uploadReceiptStatus|requireUploadReceipt|claimDriveRefs|claimUploadReceipt/);
});
