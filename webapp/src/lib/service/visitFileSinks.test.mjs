// ── รูปหน้างาน/ลายเซ็นของนัด: ทุกทางที่เขียน `service_visits.attachments` / `customerSignatureUrl` ต้องผ่านด่านที่มาของไฟล์ ──
//    (รอบสองของมติเจ้าของ 08/10/2569 · docs/upload-receipts.md)
//
// 🐞 PATCH ของนัด · `visits/[id]/photos` · POST สร้างนัด เคยเก็บ URL อะไรก็ได้ที่ client ส่งมา แล้ว `visits/[id]/file`
//    สตรีมไฟล์ตาม id ในสตริงนั้นด้วยบัญชีของระบบ ⇒ ช่างที่แก้นัดของตัวเองได้ อ่านไฟล์ Drive ใบไหนก็ได้
// ⭐ ไฟล์นี้คือ **ทะเบียนทางเข้า** + ลำดับของด่านจากซอร์ส · พฤติกรรมของด่านรันผ่าน handler จริงที่
//    visitPatchEvidence.test.mjs (PATCH) กับ crew/visitPhotos.test.mjs (รูปทีละรูป) · ตรรกะของด่านเองที่
//    lib/upload/driveRefGate.test.mjs · เส้นสร้างนัดรันผ่าน handler จริงท้ายไฟล์นี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fakeDb, callRoute, planner } from './crew/routeTestKit.mjs';
import { businessDate } from '../businessDate.js';

const { POST: createVisit } = await import('../../app/api/service/visits/route.js');

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
const count = (text, needle) => text.split(needle).length - 1;
// ตัว handler หนึ่งเมธอดของไฟล์ route — ตั้งแต่ `export const <METHOD>` ถึง export ตัวถัดไป (หรือท้ายไฟล์)
const handler = (text, method) => {
  const from = text.indexOf(`export const ${method} = withUser(`);
  assert.ok(from >= 0, `ไม่พบ handler ${method}`);
  const next = text.indexOf('\nexport const ', from + 1);
  return text.slice(from, next >= 0 ? next : undefined);
};

const PATCH_ROUTE = 'app/api/service/visits/[id]/route.js';
const PHOTOS_ROUTE = 'app/api/service/visits/[id]/photos/route.js';
const CREATE_ROUTE = 'app/api/service/visits/route.js';
const API_FILES = walk('app/api');
const CLAIM = 'service_visits:';

// ── ทะเบียนทางเข้า ───────────────────────────────────────────────────────────────────────────────────────────────

/* route ที่รับรูป/ลายเซ็นของนัดจาก client (เรียกตัวตรวจ `normalizeVisitInput` / `normalizeAttachment`)
   `gate` = ต้องเรียก `verifyDriveRefs` · `empty` = เส้นสร้าง: ทิ้งค่าที่ส่งมา เขียนค่าว่างเสมอ
   เพิ่มทางใหม่ต้องมาลงที่นี่พร้อมด่าน */
const VISIT_FILE_ROUTES = { [PATCH_ROUTE]: 'gate', [PHOTOS_ROUTE]: 'gate', [CREATE_ROUTE]: 'empty' };

test('🔴 ทะเบียน: route ที่เรียก normalizeVisitInput / normalizeAttachment ต้องอยู่ในทะเบียน พร้อมด่านของมัน', () => {
  const callers = API_FILES.filter((rel) => /\bnormalize(VisitInput|Attachment)\(/.test(code(rel)));
  assert.deepEqual(callers.sort(), Object.keys(VISIT_FILE_ROUTES).sort(),
    'route ที่รับรูป/ลายเซ็นของนัดเปลี่ยนไป — ทางใหม่ต้องเรียก verifyDriveRefs (หรือทิ้งค่าที่ส่งมา) แล้วลงทะเบียน · ทางที่เลิกแล้วต้องถอดออก');
  for (const [rel, kind] of Object.entries(VISIT_FILE_ROUTES)) {
    const text = code(rel);
    if (kind === 'gate') {
      assert.ok(text.includes('verifyDriveRefs('), `${rel}: ไม่เรียก verifyDriveRefs`);
      assert.ok(text.includes('claimDriveRefs('), `${rel}: ไม่ประทับใบรับหลังเขียน`);
    } else {
      assert.doesNotMatch(text, /verifyDriveRefs\(|claimDriveRefs\(/, `${rel}: เส้นสร้างไม่รับไฟล์ จึงไม่มีอะไรให้ตรวจ/ประทับ`);
    }
  }
});

/* ที่อื่นที่เขียนแถวนัด (insert/update) — ไม่มีตัวไหนรับไฟล์จาก client ⇒ ต้องไม่เอ่ยถึงสองคอลัมน์นี้เลย
   (นัดที่ระบบออกเอง · ย้ายผู้รับผิดชอบ · ปิดนัดตอนส่งผลประเมิน) · ทางเขียนใหม่ต้องมาลงที่นี่ หรือขึ้นไปอยู่ทะเบียนข้างบนพร้อมด่าน */
const OTHER_VISIT_WRITERS = [
  'app/api/sa/requests/[id]/route.js',
  'app/api/service/plans/[id]/route.js',
  'lib/service/planGen.js',
  'lib/service/renewalRetrieveVisit.js',
  'lib/service/surveySendClose.js',
  'lib/service/surveyVisit.js',
];
const WRITES_VISITS = /\.from\('service_visits'\)\s*\.(insert|update|upsert)\(|insertRows?WithEntityCode\(supabase, 'SV'/;

test('🔴 ทะเบียน: ทางเขียนแถวนัดนอกสาม route นี้ ไม่แตะคอลัมน์รูป/ลายเซ็น — ทางใหม่ที่ไม่ลงทะเบียน = ข้ามด่าน', () => {
  const writers = [...API_FILES, ...walk('lib')].filter((rel) => WRITES_VISITS.test(code(rel)));
  assert.deepEqual(writers.sort(), [...Object.keys(VISIT_FILE_ROUTES), ...OTHER_VISIT_WRITERS].sort());
  for (const rel of OTHER_VISIT_WRITERS) {
    assert.doesNotMatch(code(rel), /\bcustomerSignatureUrl\b|\battachments\s*:/, `${rel}: เขียนรูป/ลายเซ็นของนัดต้องผ่านด่าน`);
  }
});

// ── PATCH ของนัด ─────────────────────────────────────────────────────────────────────────────────────────────────

test('🔴 PATCH: ด่านอยู่หลังด่านสิทธิ์และด่านของงาน ก่อนเขียนแถว · ประทับหลังเขียนสำเร็จ · เขียนแถวนัดที่เดียว', () => {
  const source = code(PATCH_ROUTE);
  const patch = handler(source, 'PATCH');
  order(patch, [
    'await requireVisit({ user, supabase, id, edit: true })',
    'planningFieldsIn(body)',
    'visitMoveDecision(before, body',
    'normalizeVisitInput(stampVisitInput(before, body)',
    "if (!('attachments' in body)) delete patch.attachments;",
    "if (!('customerSignatureUrl' in body)) delete patch.customerSignatureUrl;",
    'stampVisitTimes(patch',
    'const visitFiles = await verifyVisitFiles(supabase, { user, visit: before, patch });',
    'if (visitFiles.response) return visitFiles.response;',
    ".update({ ...patch, updatedAt: nowIso })",
    'if (updateError) {',
    'await claimDriveRefs(supabase, { ids: visitFiles.claimable, claimedBy: visitFileClaim(id) });',
    'await recordAudit(',
  ], 'PATCH');
  // ทางเขียนแถวนัดมีทางเดียว และเขียนจาก `patch` ที่ด่านเพิ่งตรวจ — ไม่มีทางที่สองให้รูปหลุดด่าน
  assert.equal(count(patch, ".from('service_visits')"), 1);
  assert.equal(count(patch, 'verifyVisitFiles('), 1);
  assert.equal(count(patch, 'claimDriveRefs('), 1);
  // ระหว่างด่านกับการเขียน `patch` ต้องไม่ถูกแก้อีก (ค่าที่ตรวจ = ค่าที่เขียน)
  const between = patch.slice(patch.indexOf('if (visitFiles.response)'), patch.indexOf('.update({ ...patch'));
  assert.doesNotMatch(between, /\bpatch\s*=|\bpatch\.\w+\s*=|Object\.assign\(patch/);
  // GET / DELETE ไม่เกี่ยวกับด่านนี้
  for (const method of ['GET', 'DELETE']) assert.doesNotMatch(handler(source, method), /verifyVisitFiles|verifyDriveRefs|claimDriveRefs/);
});

test('🔴 PATCH: ตัวด่าน — URL ที่เก็บอยู่แล้วไม่ถูกถาม · รูปร่างก่อนทั้งชุด · ใบรับใช้ได้กับนัดเดียว · คำตอบพก code', () => {
  const source = code(PATCH_ROUTE);
  const gate = source.slice(source.indexOf('async function verifyVisitFiles('), source.indexOf('export const GET'));
  order(gate, [
    "if ('attachments' in patch) {",
    "if ('customerSignatureUrl' in patch && patch.customerSignatureUrl) {",
    'const stored = storedVisitFileUrls(visit);',
    'const fresh = incoming.filter((file) => !stored.includes(file.url));',
    'if (!fresh.length) return { claimable: [] };',
    'driveFileId: strictDriveId(file.url), fileUrl: file.url',
    'refs.findIndex((ref) => !ref.driveFileId)',
    'await verifyDriveRefs(supabase, {',
    'if (checked.error) {',
    'return { claimable: checked.claimable };',
  ], 'verifyVisitFiles');
  const call = gate.slice(gate.indexOf('await verifyDriveRefs(supabase, {'), gate.indexOf('if (checked.error) {'));
  assert.match(call, /userId: user\?\.id,/);
  assert.match(call, /storedIds: new Set\(stored\.map\(\(url\) => strictDriveId\(url\) \|\| parseDriveId\(url\)\)\.filter\(Boolean\)\),/);
  assert.match(call, /ownClaim: visitFileClaim\(visit\.id\),/);
  assert.match(call, /refuseClaimed: true,/);
  assert.match(source, new RegExp(`const visitFileClaim = \\(id\\) => \`${CLAIM}\\$\\{id\\}\`;`));
  // ลิงก์ที่ไม่ใช่ไฟล์ Drive ใบเดียว ตอบด้วยข้อความและรหัสของด่านกลาง
  assert.match(gate, /status: 400, error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE,/);
  assert.match(source, /return Response\.json\(\{ error: text, \.\.\.\(code \? \{ code \} : \{\}\) \}, \{ status \}\);/);
  assert.match(source, /^import \{\s*FILE_REF_ERROR_CODE, REF_SHAPE_TEXT, claimDriveRefs, strictDriveId, verifyDriveRefs,\s*\} from '@\/lib\/upload\/driveRefGate';$/m);
  // ด่านไม่ประทับเอง ไม่เขียนอะไร
  assert.doesNotMatch(gate, /claimDriveRefs\(|\.update\(|\.insert\(/);
});

// ── รูปทีละรูป ───────────────────────────────────────────────────────────────────────────────────────────────────

test('🔴 photos POST: ด่านอยู่หลัง requireVisit และตัวตรวจรูป ก่อนเขียน · ประทับเฉพาะเมื่อรูปลงแถวจริง · DELETE ไม่เกี่ยว', () => {
  const source = code(PHOTOS_ROUTE);
  const post = handler(source, 'POST');
  order(post, [
    'await requireVisit({ user, supabase, id, edit: true, running: true })',
    'if (access.response) return access.response;',
    'normalizeAttachment(body)',
    'if (!photo) return badRequest(PHOTO_MISSING_ERROR);',
    'photoEditError(access.visit)',
    'const provenance = await verifyPhoto(supabase, { user, visit: access.visit, photo });',
    'if (provenance.response) return provenance.response;',
    'await writePhotos(supabase, access.visit, (list) => addVisitPhoto(list, photo));',
    'if (out.response) return out.response;',
    'if (out.changed) {',
    'await claimDriveRefs(supabase, { ids: provenance.claimable, claimedBy: `service_visits:${id}` });',
  ], 'photos POST');
  assert.equal(count(post, 'writePhotos('), 1);
  assert.doesNotMatch(handler(source, 'DELETE'), /verifyPhoto|verifyDriveRefs|claimDriveRefs/);

  const gate = source.slice(source.indexOf('async function verifyPhoto('), source.indexOf('const reply ='));
  order(gate, [
    'if (stored.includes(photo.url)) return { claimable: [] };',
    'const driveFileId = strictDriveId(photo.url);',
    'if (!driveFileId) return { response: fileRefusal({ status: 400, error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE }) };',
    'await verifyDriveRefs(supabase, {',
  ], 'verifyPhoto');
  assert.match(gate, /refs: \[\{ driveFileId, fileUrl: photo\.url \}\],/);
  assert.match(gate, /userId: user\?\.id,/);
  assert.match(gate, /storedIds: new Set\(stored\.map\(\(url\) => strictDriveId\(url\) \|\| parseDriveId\(url\)\)\.filter\(Boolean\)\),/);
  assert.match(gate, /ownClaim: `service_visits:\$\{visit\.id\}`,/);
  assert.match(gate, /refuseClaimed: true,/);
  assert.match(source, /const fileRefusal = \(\{ status, error, code \}\) => Response\.json\(\{ error, \.\.\.\(code \? \{ code \} : \{\}\) \}, \{ status \}\);/);
});

// ── สร้างนัด ─────────────────────────────────────────────────────────────────────────────────────────────────────

test('🔴 POST สร้างนัด: ค่าว่างของรูป/ลายเซ็นเขียนทับ `...value` เสมอ (ซอร์ส)', () => {
  const post = handler(code(CREATE_ROUTE), 'POST');
  order(post, ['const row = {', '...value,', 'attachments: [],', 'customerSignatureUrl: null,', "insertRowWithEntityCode(supabase, 'SV', row)"], 'POST');
  // หลังค่าว่างต้องไม่มีอะไรกาง value/body ทับกลับ
  const tail = post.slice(post.indexOf('customerSignatureUrl: null,'), post.indexOf("insertRowWithEntityCode(supabase, 'SV', row)"));
  assert.doesNotMatch(tail, /\.\.\.value|\.\.\.body|\battachments\b/);
});

test('🔴 POST สร้างนัด: ส่งรูป/ลายเซ็นมากับคำขอ = ถูกทิ้ง นัดเกิดโดยไม่มีไฟล์ (handler จริง)', async () => {
  const db = fakeDb({ service_sites: [{ id: 'S1', name: 'สาขาทดสอบ', code: 'ST-0001' }] });
  let inserted = null;
  db.rpc = async (name, args) => {
    assert.equal(name, 'create_entity_rows_with_code');
    inserted = args.p_rows;
    return { data: args.p_rows.map((row) => ({ ...row, code: 'SV-26100001' })), error: null };
  };
  const victim = 'https://drive.google.com/file/d/1VictimFileEEEEEEEE/view?usp=drivesdk';
  const { status, json } = await callRoute(createVisit, {
    user: planner, db, method: 'POST', path: '/api/service/visits',
    body: {
      siteId: 'S1', kind: 'repair', scheduledDate: businessDate(), assigneeId: 'U-TECH', assigneeName: 'ช่างเอ',
      attachments: [{ url: victim, name: 'สัญญา.pdf', kind: 'other' }], customerSignatureUrl: victim,
    },
  });
  assert.equal(status, 201, json.error);
  assert.equal(inserted.length, 1);
  assert.deepEqual(inserted[0].attachments, []);
  assert.equal(inserted[0].customerSignatureUrl, null);
  assert.deepEqual(json.attachments, []);
  assert.equal(json.customerSignatureUrl, null);
  assert.equal(db.calls.some((c) => c.table === 'upload_receipts'), false, 'เส้นสร้างไม่ถามทะเบียนใบรับ');
});
