// ── ไฟล์ที่แนบในเธรดของคำร้อง บนจอใบประเมิน — อ่านอย่างเดียว (ประเมินจากแบบ · งวด S2a กลุ่ม C) ─────────
//
// ⭐ ฝ่ายขายส่งแบบแปลนตามมาในเธรดของใบได้ — หัวหน้าที่ประเมินจากแบบต้องเห็นบนจอใบประเมิน
// ⭐ ลิสต์ = เปิดได้: ตัวโหลดถามด่านอ่านเธรดตัวเดียวกับ proxy `/api/updates/[id]/file` (`canViewUpdates`) ก่อนอ่าน
//   · ไม่ผ่านด่าน = ลิสต์ว่างและไม่ยิงอ่านเลย · อ่านพัง = `unknown` ไม่ใช่ 500 และไม่ใช่ลิสต์ว่างเงียบ ๆ
// 🔴 ผลลัพธ์ไม่มีที่อยู่ไฟล์ — ไล่คีย์ทุกชั้น: ไม่มี `fileUrl` / `driveFileId` แม้แถวที่ฐานคืนมาจะมีครบ
// ⚠️ supabase ปลอมที่จดทุกคำสั่ง — ไม่มี client จริงในไฟล์นี้ (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSurveyThreadFiles, surveyThreadFileRows } from './surveyThreadFiles.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HEAD = { id: 'U-HEAD', name: 'หัวหน้าฝ่าย', role: 'ts_manager', department: 'TS' };
const CREW = { id: 'U-TS1', name: 'ช่างเอ', role: 'ts', department: 'TS' };
const REQUESTER = { id: 'U-AE', name: 'ฝ่ายขาย', role: 'ae', team: 'ODM' };
const OTHER_AE = { id: 'U-AE2', name: 'ฝ่ายขายอีกคน', role: 'ae', team: 'KA' };
const REQ = { id: 'DR-S1', kind: 'site_survey', dept: 'TS', status: 'acknowledged', requestedById: 'U-AE' };

const file = (n, o = {}) => ({
  fileUrl: `https://drive.google.com/file/d/${n}`, driveFileId: `drv-${n}`, fileName: `plan-${n}.png`,
  mimeType: 'image/png', sizeBytes: 1000 + n, ...o,
});
const update = (id, attachments, o = {}) => ({
  id, attachments, createdAt: '2026-10-02T03:00:00+00:00', authorName: 'ฝ่ายขาย', deletedAt: null, ...o,
});
const UPDATES = [
  update('EU-1', [file(1), file(2, { fileName: 'floor.pdf', mimeType: 'application/pdf' })]),
  update('EU-2', [], { createdAt: '2026-10-02T04:00:00+00:00' }),
  update('EU-3', [file(3)], { createdAt: '2026-10-03T03:00:00+00:00', deletedAt: '2026-10-03T05:00:00+00:00' }),
  update('EU-4', [file(4)], { createdAt: '2026-10-04T03:00:00+00:00', authorName: 'หัวหน้าฝ่าย' }),
];

/* supabase ปลอม — จดทุกคำสั่งของทุกตาราง แล้วตอบตามที่เทสต์ตั้ง */
function fakeSupabase({ data = UPDATES, error = null, explode = false } = {}) {
  const calls = [];
  const from = (table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          return (resolve, reject) => (explode
            ? Promise.reject(new Error('socket hang up'))
            : Promise.resolve(error ? { data: null, error } : { data, error: null })
          ).then(resolve, reject);
        }
        return (...args) => { q.ops.push([prop, ...args]); return builder; };
      },
    });
    return builder;
  };
  return { from, calls };
}

async function quiet(run) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.map(String).join(' ')); };
  try {
    return { result: await run(), lines };
  } finally {
    console.error = original;
  }
}

/** คีย์ทุกชั้นของค่า (อ็อบเจกต์/อาร์เรย์ซ้อน) — ใช้ยืนยันว่าไม่มีคีย์ต้องห้ามหลุดออกไป */
function allKeys(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((item) => allKeys(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) { out.add(key); allKeys(inner, out); }
  }
  return out;
}

/* ══ ตัวแปลงแถว (ล้วน) ════════════════════════════════════════════════════════════════════ */

test('🔑 หนึ่งรายการต่อหนึ่งไฟล์แนบ — index คือตำแหน่งในข้อความของตัวเอง (ค่า ?i= ของ proxy) · ข้อความที่ลบแล้วไม่ลิสต์', () => {
  assert.deepEqual(surveyThreadFileRows(UPDATES), [
    { updateId: 'EU-1', index: 0, fileName: 'plan-1.png', mimeType: 'image/png', sizeBytes: 1001, createdAt: '2026-10-02T03:00:00+00:00', authorName: 'ฝ่ายขาย' },
    { updateId: 'EU-1', index: 1, fileName: 'floor.pdf', mimeType: 'application/pdf', sizeBytes: 1002, createdAt: '2026-10-02T03:00:00+00:00', authorName: 'ฝ่ายขาย' },
    { updateId: 'EU-4', index: 0, fileName: 'plan-4.png', mimeType: 'image/png', sizeBytes: 1004, createdAt: '2026-10-04T03:00:00+00:00', authorName: 'หัวหน้าฝ่าย' },
  ]);
});

test('รายการที่ไม่มี fileUrl ถูกข้าม แต่เลข index ของรายการถัดไปไม่เลื่อน — proxy ชี้ไฟล์ด้วยตำแหน่งเดิมในแถว', () => {
  const rows = surveyThreadFileRows([
    update('EU-1', [file(1, { fileUrl: '' }), null, file(3), { fileName: 'ไม่มีที่อยู่.png' }, file(5, { fileUrl: '   ' }), file(6)]),
  ]);
  assert.deepEqual(rows.map((row) => [row.updateId, row.index, row.fileName]), [
    ['EU-1', 2, 'plan-3.png'],
    ['EU-1', 5, 'plan-6.png'],
  ]);
});

test('ค่าที่ขาดเป็น null ไม่ใช่ undefined · อินพุตแปลก ๆ ไม่ล้ม', () => {
  const [row] = surveyThreadFileRows([{ id: 'EU-1', attachments: [{ fileUrl: 'https://drive.google.com/x' }] }]);
  assert.deepEqual(row, {
    updateId: 'EU-1', index: 0, fileName: null, mimeType: null, sizeBytes: null, createdAt: null, authorName: null,
  });
  assert.deepEqual(surveyThreadFileRows(null), []);
  assert.deepEqual(surveyThreadFileRows(undefined), []);
  assert.deepEqual(surveyThreadFileRows('x'), []);
  assert.deepEqual(surveyThreadFileRows([null, {}, { id: 'EU-2', attachments: 'x' }, { id: 'EU-3', attachments: null }]), []);
});

test('🔴 ไม่มีที่อยู่ไฟล์ในผลลัพธ์ — ไล่คีย์ทุกชั้น: ไม่มี fileUrl / driveFileId · ไม่มีค่าของมันหลุดไปในคีย์อื่น', () => {
  const rows = surveyThreadFileRows(UPDATES);
  const keys = allKeys(rows);
  assert.deepEqual([...keys].sort(), ['authorName', 'createdAt', 'fileName', 'index', 'mimeType', 'sizeBytes', 'updateId']);
  assert.equal(keys.has('fileUrl'), false);
  assert.equal(keys.has('driveFileId'), false);
  assert.doesNotMatch(JSON.stringify(rows), /drive\.google\.com|drv-/);
});

/* ══ ตัวโหลด ══════════════════════════════════════════════════════════════════════════════ */

test('🔑 หัวหน้าฝ่ายบริการได้ไฟล์ในเธรดของใบ — อ่านคำขอเดียว กรองที่ใบนี้ เรียงเก่าไปใหม่', async () => {
  const s = fakeSupabase();
  const res = await loadSurveyThreadFiles(s, REQ, HEAD);
  assert.equal(res.unknown, false);
  assert.deepEqual(res.files, surveyThreadFileRows(UPDATES));
  assert.equal(allKeys(res).has('fileUrl'), false);
  assert.equal(allKeys(res).has('driveFileId'), false);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].table, 'entity_updates');
  assert.deepEqual(s.calls[0].ops, [
    ['select', 'id, attachments, "createdAt", "authorName", "deletedAt"'],
    ['eq', 'entityType', 'dept_request'],
    ['eq', 'entityId', 'DR-S1'],
    ['order', 'createdAt', { ascending: true }],
    ['order', 'id', { ascending: true }],
  ]);
  // ผู้ขอของใบก็ผ่านด่านอ่านเธรด (ตัวโหลดไม่ตัดสินเองว่าใครควรได้ — ถามด่านของ proxy ตัวเดียว)
  assert.equal((await loadSurveyThreadFiles(fakeSupabase(), REQ, REQUESTER)).files.length, 3);
});

test('🔴 คนที่ proxy ไม่ให้เปิด = ไม่ลิสต์เลย และไม่ยิงอ่าน — ลิสต์ต้องเท่ากับที่เปิดได้', async () => {
  const s = fakeSupabase();
  // ช่างไม่ถือสิทธิ์อ่านเธรดของคำร้อง · ฝ่ายขายคนอื่นที่ไม่ใช่เจ้าของใบ · ใบของฝ่ายอื่น · ไม่รู้ว่าใคร
  assert.deepEqual(await loadSurveyThreadFiles(s, REQ, CREW), { files: [], unknown: false });
  assert.deepEqual(await loadSurveyThreadFiles(s, REQ, OTHER_AE), { files: [], unknown: false });
  assert.deepEqual(await loadSurveyThreadFiles(s, { ...REQ, dept: 'RD' }, HEAD), { files: [], unknown: false });
  assert.deepEqual(await loadSurveyThreadFiles(s, REQ, null), { files: [], unknown: false });
  // ไม่มีใบ = ไม่มีอะไรให้อ่าน
  assert.deepEqual(await loadSurveyThreadFiles(s, null, HEAD), { files: [], unknown: false });
  assert.deepEqual(await loadSurveyThreadFiles(s, {}, HEAD), { files: [], unknown: false });
  assert.deepEqual(s.calls, []);
});

test('อ่านพัง = unknown (ไม่ใช่ลิสต์ว่างเงียบ ๆ ไม่ใช่ 500) — ทั้ง { error } ของ supabase และคำสั่งที่โยน', async () => {
  const failed = await quiet(() => loadSurveyThreadFiles(fakeSupabase({ error: { message: 'permission denied' } }), REQ, HEAD));
  assert.deepEqual(failed.result, { files: [], unknown: true });
  assert.ok(failed.lines.some((line) => line.includes('DR-S1') && line.includes('permission denied')), 'ต้องมี log บอกใบและเหตุ');

  const thrown = await quiet(() => loadSurveyThreadFiles(fakeSupabase({ explode: true }), REQ, HEAD));
  assert.deepEqual(thrown.result, { files: [], unknown: true });
  assert.ok(thrown.lines.some((line) => line.includes('DR-S1')));

  // เธรดว่าง / ฐานคืน null = ไม่มีไฟล์ ไม่ใช่อ่านพัง
  assert.deepEqual(await loadSurveyThreadFiles(fakeSupabase({ data: [] }), REQ, HEAD), { files: [], unknown: false });
  assert.deepEqual(await loadSurveyThreadFiles(fakeSupabase({ data: null }), REQ, HEAD), { files: [], unknown: false });
});

/* ── ยามผูกกับซอร์สจริง ──────────────────────────────────────────────────────────────── */

test('ด่านของตัวโหลด = ด่านเดียวกับ proxy ของไฟล์ในเธรด · ถามก่อนอ่านเสมอ', () => {
  const loader = code('./surveyThreadFiles.js');
  const gate = loader.indexOf("canViewUpdates(supabase, THREAD_ENTITY, request, user)");
  const read = loader.indexOf(".from('entity_updates')");
  assert.ok(gate > 0 && read > gate, 'ด่านมาก่อนคำสั่งอ่าน');
  assert.match(loader, /const THREAD_ENTITY = 'dept_request';/);
  assert.match(loader, /import \{ canViewUpdates \} from '@\/lib\/master\/updateAccess';/);
  const proxy = code('../../app/api/updates/[id]/file/route.js');
  assert.match(proxy, /canViewUpdates\(supabase, row\.entityType, parent, user\)/);
  assert.match(proxy, /if \(row\.deletedAt\) return Response\.json\(/, 'proxy ไม่เปิดไฟล์ของข้อความที่ลบแล้ว — ตัวแปลงแถวจึงไม่ลิสต์');
  assert.match(proxy, /searchParams\.get\('i'\)/, 'proxy ชี้ไฟล์ด้วยตำแหน่งในแถว');
});

test('GET ใบประเมิน: ไฟล์ในเธรดยิงขนานในรอบเดียวกับชิ้นอื่น เฉพาะหัวหน้าตามเงื่อนไข · พัง = unknown.threadFiles', () => {
  const route = code('../../app/api/service/surveys/[id]/route.js');
  assert.match(route, /Promise\.all\(\[[\s\S]*?loadSurveyRequestFiles\(supabase, request, user\)[\s\S]*?loadSurveyThreadFiles\(supabase, request, user\)[\s\S]*?\]\)/);
  assert.match(route, /const wantsThreadFiles = canDecide && \(drawingMethodEnabled \|\| surveyMethodMix\(zones\)\.drawing > 0\);/);
  assert.match(route, /wantsThreadFiles \? loadSurveyThreadFiles\(supabase, request, user\) : NO_THREAD_FILES,/);
  assert.match(route, /if \(threadFiles\.unknown\) context\.unknown\.threadFiles = true;/);
  assert.match(route, /threadFiles: threadFiles\.files,/);
});
