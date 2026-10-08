// ── ทิ้งไฟล์บน Drive อย่างปลอดภัย (มติเจ้าของ 08/10/2569 · คู่กับทะเบียนใบรับ mig 0406) ───────────────────────────
//
// 🐞 `driveFileId` ของแถวไฟล์แนบมาจาก client ตอนแนบ และแถวเก่าไม่เคยถูกตรวจที่มา ⇒ ตัวปล่อยไฟล์ (`releaseAttachmentFile`)
//    ต้องกันเองทุกเส้น: มีแถวอื่นถือ = เก็บ · ตรวจไม่ได้ = เก็บ · โฟลเดอร์/ไฟล์ของ Google = เก็บ · ถาม Drive ไม่ได้ = เก็บ
//    และเส้นถอยการอัป (DELETE /api/upload) ต้องรู้ว่าไฟล์ถูกอ้างจากที่ไหนในระบบ (`driveFileReferenced`) — ตัวปล่อยไฟล์
//    ถามรายชื่อแหล่งเดียวกัน (แถว attachments อื่น · ไฟล์ในเธรด · หลักฐาน Won รุ่นเก่า)
// ⚠️ supabase และ Drive ปลอมล้วน — ไม่แตะฐานจริง ไม่แตะ Drive จริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  driveFileHeld, driveFileReferenced, driveFileTrashable, purgeAttachments, releaseAttachmentFile,
  revokeTwinDocGrants,
} from './attachments.js';

const PDF = 'application/pdf';

/* Drive ปลอม — `files` = id → metadata · จดทุกการถามและทุกการทิ้ง */
function fakeDrive(files = {}, { metaError = null } = {}) {
  const calls = { meta: [], trashed: [] };
  return {
    calls,
    async getFileMeta(id, fields) {
      calls.meta.push([id, fields]);
      if (metaError) throw metaError;
      if (!files[id]) { const err = new Error('File not found'); err.code = 404; throw err; }
      return { id, ...files[id] };
    },
    async deleteFile(id) { calls.trashed.push(id); if (files[id]) files[id].trashed = true; },
  };
}

/* ฐานปลอม — เฉพาะรูปคำถามที่โค้ดใช้จริง: attachments (.or สองช่อง · .neq · .limit · อ่านทั้ง entity · ลบทั้ง entity)
   กับ jsonb `.contains(col, '<สตริง JSON ของ [{ driveFileId }]>').limit(1)` ของ quotations / entity_updates
   🔴 ค่าของ `.contains` ต้องเป็น **สตริง JSON** — array ของ JS ถูก postgrest-js ประกอบเป็น array literal ของ Postgres
      (`cs.{[object Object]}`) แล้วฐานจริงตอบ 22P02 ทุกครั้ง · ตัวปลอมนี้จึงไม่รับรูป array เลย */
function fakeDb({ attachments = [], quotations = [], updates = [], errors = {} } = {}) {
  const calls = [];
  const state = { attachments: attachments.map((r) => ({ ...r })) };
  const jsonb = (table, rows, column) => ({
    select: () => ({
      contains(col, value) {
        assert.equal(col, column);
        assert.equal(typeof value, 'string', `ค่าของ .contains บนช่อง jsonb ต้องเป็นสตริง JSON ไม่ใช่ ${Array.isArray(value) ? 'array' : typeof value}`);
        const parsed = JSON.parse(value);
        assert.ok(Array.isArray(parsed) && parsed.length === 1, 'รูปที่ถาม: array ของ object ใบเดียว');
        assert.deepEqual(Object.keys(parsed[0]), ['driveFileId']);
        const id = parsed[0].driveFileId;
        return {
          limit(n) {
            calls.push({ table, op: 'contains', id, limit: n });
            if (errors[table]) return Promise.resolve({ data: null, error: errors[table] });
            const hit = rows.filter((r) => (r[column] || []).some((a) => a?.driveFileId === id)).slice(0, n);
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
          },
        };
      },
    }),
  });
  return {
    calls,
    state,
    from(table) {
      if (table === 'quotations') return jsonb(table, quotations, 'wonAttachments');
      if (table === 'entity_updates') return jsonb(table, updates, 'attachments');
      assert.equal(table, 'attachments');
      return {
        select() {
          const f = { eq: {}, neq: null, or: null };
          const q = {
            eq(col, v) { f.eq[col] = v; return q; },
            order() {
              calls.push({ table, op: 'list', ...f.eq });
              return Promise.resolve({ data: state.attachments.filter((r) => r.entityType === f.eq.entityType && r.entityId === f.eq.entityId), error: null });
            },
            or(expr) {
              const m = /^driveFileId\.eq\.([A-Za-z0-9_-]+),metadata->>googleFileId\.eq\.\1$/.exec(expr);
              assert.ok(m, `รูปตัวกรองที่ไม่รู้จัก: ${expr}`);
              f.or = m[1];
              return q;
            },
            neq(col, v) { assert.equal(col, 'id'); f.neq = v; return q; },
            limit(n) {
              calls.push({ table, op: 'held', id: f.or, neq: f.neq, limit: n });
              if (errors.attachments) return Promise.resolve({ data: null, error: errors.attachments });
              const hit = state.attachments
                .filter((r) => r.driveFileId === f.or || r.metadata?.googleFileId === f.or)
                .filter((r) => r.id !== f.neq)
                .slice(0, n);
              return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
            },
          };
          return q;
        },
        delete() {
          const f = {};
          const q = {
            eq(col, v) { f[col] = v; return q; },
            then(resolve) {
              calls.push({ table, op: 'delete', ...f });
              state.attachments = state.attachments.filter((r) => !(r.entityType === f.entityType && r.entityId === f.entityId));
              return resolve({ error: null });
            },
          };
          return q;
        },
      };
    },
  };
}

/* ตัวปล่อยไฟล์ log ดังโดยเจตนาเมื่อเก็บไฟล์ไว้ — เก็บข้อความไว้ตรวจ ไม่ให้รกผลเทสต์ */
async function quiet(fn) {
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try { return { result: await fn(), logged }; } finally { console.error = original; }
}
const att = (over = {}) => ({ id: 'ATT-1', entityType: 'deal', entityId: 'D-1', driveFileId: 'FILE_one-1', ...over });

test('ด่านชนิดไฟล์ (driveFileTrashable): ไฟล์ธรรมดา = ทิ้งได้ · โฟลเดอร์/ไฟล์ของ Google = ไม่ทิ้ง · ถามไม่ได้ = ไม่ทิ้ง · อยู่ในถังขยะแล้ว = ไม่ต้องทำ', async () => {
  const drive = fakeDrive({
    pdf: { mimeType: PDF, trashed: false },
    img: { mimeType: 'IMAGE/PNG', trashed: false },
    folder: { mimeType: 'application/vnd.google-apps.folder', trashed: false },
    sheet: { mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false },
    doc: { mimeType: 'Application/Vnd.Google-Apps.Document', trashed: false },
    gone: { mimeType: PDF, trashed: true },
    noMime: { trashed: false },
  });
  assert.deepEqual(await driveFileTrashable('pdf', { drive }), { ok: true, reason: null, error: null });
  assert.deepEqual(drive.calls.meta[0], ['pdf', 'id, mimeType, trashed'], 'ถามแค่สามช่องที่ต้องใช้');
  assert.equal((await driveFileTrashable('img', { drive })).ok, true);
  for (const id of ['folder', 'sheet', 'doc']) {
    assert.deepEqual(await driveFileTrashable(id, { drive }), { ok: false, reason: 'native', error: null }, id);
  }
  assert.deepEqual(await driveFileTrashable('gone', { drive }), { ok: false, reason: 'trashed', error: null });
  // 🔴 โฟลเดอร์ที่อยู่ในถังขยะก็ยังเป็น "ของ Google" — เหตุต้องไม่กลายเป็นเรื่องเงียบ
  const trashedFolder = fakeDrive({ f: { mimeType: 'application/vnd.google-apps.folder', trashed: true } });
  assert.equal((await driveFileTrashable('f', { drive: trashedFolder })).reason, 'native');
  assert.equal((await driveFileTrashable('noMime', { drive })).reason, 'unverifiable', 'ไม่บอกชนิด = ไม่รู้ว่าเป็นอะไร');
  const missing = await driveFileTrashable('nope', { drive });
  assert.deepEqual([missing.ok, missing.reason, missing.error.message], [false, 'unverifiable', 'File not found']);
  const down = await driveFileTrashable('pdf', { drive: fakeDrive({}, { metaError: new Error('drive down') }) });
  assert.deepEqual([down.ok, down.reason], [false, 'unverifiable']);
  const empty = await driveFileTrashable('pdf', { drive: { getFileMeta: async () => null } });
  assert.deepEqual([empty.ok, empty.reason], [false, 'unverifiable']);
});

test('ปล่อยไฟล์: ไฟล์ธรรมดาที่ไม่มีที่ไหนอ้าง = ทิ้งหนึ่งครั้ง (ถามฐานสามแหล่ง → ถาม Drive → ทิ้ง)', async () => {
  const db = fakeDb();
  const drive = fakeDrive({ 'FILE_one-1': { mimeType: PDF, trashed: false } });
  const { logged } = await quiet(() => releaseAttachmentFile(att(), { supabase: db, drive }));
  assert.deepEqual(db.calls, [
    { table: 'attachments', op: 'held', id: 'FILE_one-1', neq: 'ATT-1', limit: 1 },
    { table: 'quotations', op: 'contains', id: 'FILE_one-1', limit: 1 },
    { table: 'entity_updates', op: 'contains', id: 'FILE_one-1', limit: 1 },
  ], 'ไม่นับแถวของตัวเอง · ไฟล์หนึ่งใบ = สามคำถาม มีเพดานทุกคำถาม');
  assert.deepEqual(drive.calls.meta, [['FILE_one-1', 'id, mimeType, trashed']]);
  assert.deepEqual(drive.calls.trashed, ['FILE_one-1']);
  assert.deepEqual(logged, []);
});

test('🔴 ปล่อยไฟล์: มีแถวอื่นถือไฟล์เดียวกัน (ช่อง driveFileId หรือ metadata.googleFileId) = เก็บไฟล์ไว้ ไม่ถาม Drive เลย', async () => {
  for (const other of [
    { id: 'ATT-OTHER', entityType: 'customer', entityId: 'C-1', driveFileId: 'FILE_one-1' },
    { id: 'ATT-GDOC', entityType: 'deal', entityId: 'D-9', driveFileId: null, metadata: { kind: 'gsheet', googleFileId: 'FILE_one-1' } },
  ]) {
    const db = fakeDb({ attachments: [other] });
    const drive = fakeDrive({ 'FILE_one-1': { mimeType: PDF, trashed: false } });
    const { logged } = await quiet(() => releaseAttachmentFile(att(), { supabase: db, drive }));
    assert.deepEqual(drive.calls.trashed, [], other.id);
    assert.deepEqual(drive.calls.meta, [], 'แถวอื่นถืออยู่ = ไม่ต้องคุยกับ Drive');
    assert.equal(logged.length, 1);
    assert.match(logged[0], /เก็บไฟล์บน Drive ไว้/);
  }
});

// 🐞 เดิมตัวปล่อยถามแค่แถว attachments ⇒ แนบไฟล์ที่โพสต์ไว้ในเธรดเป็นไฟล์แนบ แล้วลบแถว = ไฟล์ของเธรดลงถังขยะ Drive
//    ทั้งที่เส้นถอยการอัปปฏิเสธไฟล์ใบเดียวกัน (409) · แถวที่ปลูกไว้ก่อนมีทะเบียนใบรับก็ทิ้งไฟล์ในเธรดของคนอื่นได้ทางเดียวกัน
test('🔴 ปล่อยไฟล์: ไฟล์ที่เธรดอัปเดต หรือหลักฐาน Won รุ่นเก่า ยังอ้างอยู่ = เก็บไฟล์ไว้ ไม่ถาม Drive เลย · ถามสองแหล่งนั้นไม่ได้ = เก็บ', async () => {
  const cases = [
    ['เธรด', { updates: [{ id: 'U1', attachments: [{ driveFileId: 'other' }, { driveFileId: 'FILE_one-1', fileName: 'a.pdf' }] }] }, /entity_updates\.attachments/],
    ['หลักฐาน Won', { quotations: [{ id: 'Q1', wonAttachments: [{ driveFileId: 'FILE_one-1' }] }] }, /quotations\.wonAttachments/],
    ['ถามเธรดไม่ได้', { errors: { entity_updates: { message: 'updates down' } } }, /updates down/],
    ['ถามหลักฐาน Won ไม่ได้', { errors: { quotations: { message: 'won down' } } }, /won down/],
  ];
  for (const [name, data, where] of cases) {
    const db = fakeDb(data);
    const drive = fakeDrive({ 'FILE_one-1': { mimeType: PDF, trashed: false } });
    const { logged } = await quiet(() => releaseAttachmentFile(att(), { supabase: db, drive }));
    assert.deepEqual(drive.calls.trashed, [], name);
    assert.deepEqual(drive.calls.meta, [], `${name}: ยังมีที่อ้าง = ไม่ต้องคุยกับ Drive`);
    assert.equal(logged.length, 1, name);
    assert.match(logged[0], /เก็บไฟล์บน Drive ไว้/);
    assert.match(logged[0], where, `${name}: log ต้องบอกว่าติดที่แหล่งไหน`);
  }
  // ไฟล์ใบอื่นในเธรดเดียวกันไม่ทำให้ไฟล์นี้ค้าง
  const db = fakeDb({ updates: [{ id: 'U1', attachments: [{ driveFileId: 'other' }] }], quotations: [{ id: 'Q1', wonAttachments: null }] });
  const drive = fakeDrive({ 'FILE_one-1': { mimeType: PDF, trashed: false } });
  await quiet(() => releaseAttachmentFile(att(), { supabase: db, drive }));
  assert.deepEqual(drive.calls.trashed, ['FILE_one-1']);
});

test('🔴 ปล่อยไฟล์: ตรวจไม่ได้ว่ามีแถวอื่นถือไหม (query ล้ม · client โยน error · id ผิดรูป) = เก็บไฟล์ไว้', async () => {
  const drive = fakeDrive({ 'FILE_one-1': { mimeType: PDF, trashed: false } });
  await quiet(() => releaseAttachmentFile(att(), { supabase: fakeDb({ errors: { attachments: { message: 'timeout' } } }), drive }));
  await quiet(() => releaseAttachmentFile(att(), { supabase: { from() { throw new Error('boom'); } }, drive }));
  const odd = fakeDb();
  await quiet(() => releaseAttachmentFile(att({ driveFileId: 'a,b)or(id.neq.x' }), { supabase: odd, drive }));
  assert.equal(odd.calls.length, 0, 'id ผิดรูปต้องไม่ถึงตัวกรองของฐาน');
  assert.deepEqual(drive.calls.trashed, []);
  assert.deepEqual(drive.calls.meta, []);
});

test('🔴 ปล่อยไฟล์: โฟลเดอร์ / เอกสาร Google / ถาม Drive ไม่ได้ / ไม่พบไฟล์ = ไม่ทิ้ง (log) · อยู่ในถังขยะแล้ว = ไม่ทิ้งซ้ำ (เงียบ)', async () => {
  const cases = [
    ['โฟลเดอร์ลูกค้า', { 'FILE_one-1': { mimeType: 'application/vnd.google-apps.folder', trashed: false } }, undefined, 1],
    ['Google Sheet', { 'FILE_one-1': { mimeType: 'application/vnd.google-apps.spreadsheet', trashed: false } }, undefined, 1],
    ['ไม่พบไฟล์', {}, undefined, 1],
    ['Drive ล่ม', { 'FILE_one-1': { mimeType: PDF, trashed: false } }, { metaError: new Error('drive down') }, 1],
    ['อยู่ในถังขยะแล้ว', { 'FILE_one-1': { mimeType: PDF, trashed: true } }, undefined, 0],
  ];
  for (const [name, files, opts, logs] of cases) {
    const drive = fakeDrive(files, opts);
    const { logged } = await quiet(() => releaseAttachmentFile(att(), { supabase: fakeDb(), drive }));
    assert.deepEqual(drive.calls.trashed, [], name);
    assert.equal(drive.calls.meta.length, 1, name);
    assert.equal(logged.length, logs, `${name}: ${logged.join(' | ')}`);
  }
});

test('ปล่อยไฟล์: แถวที่ไม่มีไฟล์บน Drive ไม่ยิงอะไรออกนอกเครื่อง · excludeIds = แถวที่ถูกลบพร้อมกันไม่นับเป็น "แถวอื่น"', async () => {
  const db = fakeDb();
  const drive = fakeDrive();
  await quiet(() => releaseAttachmentFile(att({ driveFileId: null }), { supabase: db, drive }));
  await quiet(() => releaseAttachmentFile(null, { supabase: db, drive }));
  assert.deepEqual([db.calls.length, drive.calls.meta.length, drive.calls.trashed.length], [0, 0, 0]);

  const twin = { id: 'ATT-2', entityType: 'deal', entityId: 'D-1', driveFileId: 'FILE_one-1' };
  const outsider = { id: 'ATT-X', entityType: 'customer', entityId: 'C-1', driveFileId: 'FILE_one-1' };
  // แถวคู่อยู่ในชุดที่ถูกลบ = ทิ้งได้
  const db1 = fakeDb({ attachments: [att(), twin] });
  const drive1 = fakeDrive({ 'FILE_one-1': { mimeType: PDF, trashed: false } });
  await quiet(() => releaseAttachmentFile(att(), { supabase: db1, drive: drive1, excludeIds: ['ATT-1', 'ATT-2'] }));
  assert.deepEqual(drive1.calls.trashed, ['FILE_one-1']);
  assert.deepEqual(db1.calls[0], { table: 'attachments', op: 'held', id: 'FILE_one-1', neq: null, limit: 3 },
    'คัดออกหลังอ่าน (ไม่ต่อ id แถวเข้าตัวกรอง) — อ่านจำนวนที่คัดออก + 1');
  // 🔴 มีแถวนอกชุดถืออยู่ด้วย = เก็บไฟล์ไว้ แม้แถวในชุดจะมาก่อนในผลอ่าน
  const db2 = fakeDb({ attachments: [att(), twin, outsider] });
  const drive2 = fakeDrive({ 'FILE_one-1': { mimeType: PDF, trashed: false } });
  await quiet(() => releaseAttachmentFile(att(), { supabase: db2, drive: drive2, excludeIds: ['ATT-1', 'ATT-2'] }));
  assert.deepEqual(drive2.calls.trashed, []);
  // ไม่ส่ง excludeIds = แถวคู่นับเป็นแถวอื่น (เส้นลบทีละแถว: ไฟล์ต้องอยู่ต่อให้แถวที่เหลือ)
  const db3 = fakeDb({ attachments: [att(), twin] });
  const drive3 = fakeDrive({ 'FILE_one-1': { mimeType: PDF, trashed: false } });
  await quiet(() => releaseAttachmentFile(att(), { supabase: db3, drive: drive3 }));
  assert.deepEqual(drive3.calls.trashed, []);
});

test('driveFileHeld + excludeIds: คัดออกหลังอ่าน · ผลเดิมของ excludeId ตัวเดียวไม่เปลี่ยน · อ่านเต็มเพดานของฐานแล้วตัดสินไม่ได้ = ถือว่ามีคนถือ', async () => {
  const rows = [
    { id: 'A', driveFileId: 'F1' }, { id: 'B', driveFileId: 'F1' }, { id: 'C', driveFileId: null, metadata: { googleFileId: 'F1' } },
  ];
  const free = { held: false, error: null, invalid: false };
  const taken = { held: true, error: null, invalid: false };
  assert.deepEqual(await driveFileHeld(fakeDb({ attachments: rows }), 'F1', { excludeIds: ['A', 'B', 'C'] }), free);
  assert.deepEqual(await driveFileHeld(fakeDb({ attachments: rows }), 'F1', { excludeIds: ['A', 'B'] }), taken, 'C (เอกสาร Google) ยังถืออยู่');
  assert.deepEqual(await driveFileHeld(fakeDb({ attachments: rows }), 'F1', { excludeId: 'C', excludeIds: ['A', 'B'] }), free, 'excludeId รวมเข้าชุดเดียวกัน');
  assert.deepEqual(await driveFileHeld(fakeDb({ attachments: rows }), 'F1', { excludeIds: [] }), taken, 'ลิสต์ว่าง = ไม่คัดใครออก');
  assert.deepEqual(await driveFileHeld(fakeDb({ attachments: rows }), 'F1', { excludeIds: [null, undefined, ''] }), taken);
  assert.deepEqual(await driveFileHeld(fakeDb({ attachments: [rows[0]] }), 'F1', { excludeId: 'A' }), free);
  const db = fakeDb({ attachments: rows });
  await driveFileHeld(db, 'F1', { excludeId: 'A' });
  assert.deepEqual(db.calls[0], { table: 'attachments', op: 'held', id: 'F1', neq: 'A', limit: 1 }, 'ทางเดิม (excludeId ตัวเดียว) ยังกรองที่ฐานและอ่านแถวเดียว');
  // ตรวจไม่ได้ / id ผิดรูป ยังเป็น "ถือว่ามีคนถือ" แม้ส่ง excludeIds
  assert.deepEqual(await driveFileHeld(fakeDb({ errors: { attachments: { message: 'down' } } }), 'F1', { excludeIds: ['A'] }), { held: true, error: { message: 'down' }, invalid: false });
  assert.deepEqual(await driveFileHeld(fakeDb(), 'a,b', { excludeIds: ['A'] }), { held: true, error: null, invalid: true });
  // ชุดที่คัดออกใหญ่กว่าเพดานอ่านของฐาน (1,000) และผลอ่านเต็มเพดาน = ไม่รู้ว่ามีแถวอื่นไหม ⇒ เก็บไฟล์ไว้
  const many = Array.from({ length: 1200 }, (_, i) => ({ id: `R${i}`, driveFileId: 'F1' }));
  const big = fakeDb({ attachments: many });
  assert.deepEqual(await driveFileHeld(big, 'F1', { excludeIds: many.map((r) => r.id) }), taken);
  assert.equal(big.calls[0].limit, 1000, 'ไม่ขอเกินเพดานอ่านของฐาน');
});

test('🔴 ลบทั้ง entity (purgeAttachments): สองแถวชี้ไฟล์ใบเดียว = ทิ้งหนึ่งครั้ง ไม่ค้างเพราะเห็นกันเองเป็น "แถวอื่น" · ไฟล์ที่ entity อื่นถืออยู่ = เก็บ', async () => {
  const rows = [
    { id: 'ATT-1', entityType: 'deal', entityId: 'D-1', driveFileId: 'SHARED_twin' },
    { id: 'ATT-2', entityType: 'deal', entityId: 'D-1', driveFileId: 'SHARED_twin' },
    { id: 'ATT-3', entityType: 'deal', entityId: 'D-1', driveFileId: 'OWN_file' },
    { id: 'ATT-4', entityType: 'deal', entityId: 'D-1', driveFileId: 'ELSEWHERE_file' },
    { id: 'ATT-5', entityType: 'deal', entityId: 'D-1', driveFileId: null },
    { id: 'ATT-9', entityType: 'customer', entityId: 'C-1', driveFileId: 'ELSEWHERE_file' },
  ];
  const files = {
    SHARED_twin: { mimeType: PDF, trashed: false },
    OWN_file: { mimeType: 'image/png', trashed: false },
    ELSEWHERE_file: { mimeType: PDF, trashed: false },
  };
  const db = fakeDb({ attachments: rows });
  const drive = fakeDrive(files);
  const { result, logged } = await quiet(() => purgeAttachments('deal', 'D-1', db, { drive }));
  assert.deepEqual(result, { count: 5, error: null });
  assert.deepEqual(drive.calls.trashed, ['SHARED_twin', 'OWN_file'], 'ไฟล์ที่สองแถวชี้ร่วมกันถูกทิ้งครั้งเดียว · ไฟล์ที่ entity อื่นถืออยู่ไม่ถูกแตะ');
  assert.equal(logged.length, 1, `log เฉพาะไฟล์ที่ถูกเก็บไว้เพราะ entity อื่นถือ: ${logged.join(' | ')}`);
  assert.match(logged[0], /ATT-4/);
  assert.deepEqual(db.state.attachments.map((r) => r.id), ['ATT-9'], 'แถวของ entity นี้ถูกลบทั้งชุด · แถวของ entity อื่นอยู่ครบ');
  // ทุกคำถาม "ใครถือ" ของเส้นนี้คัดออกหลังอ่าน (ไม่ต่อ id แถวเข้าตัวกรอง) และอ่านไม่เกินจำนวนแถวของชุด + 1
  const held = db.calls.filter((c) => c.op === 'held');
  assert.equal(held.length, 4, 'ถามเฉพาะแถวที่มีไฟล์บน Drive');
  for (const call of held) assert.deepEqual([call.neq, call.limit], [null, 6]);
  // ไฟล์ใบที่สองของคู่: อยู่ในถังขยะแล้ว ⇒ ไม่ทิ้งซ้ำ
  assert.equal(drive.calls.meta.filter(([id]) => id === 'SHARED_twin').length, 2);
  // ราคาของเส้นนี้: แถวที่ไม่มีแถวอื่นถือ ถามสองแหล่ง jsonb ต่อ (ใบละครั้ง) · แถวที่ติดตั้งแต่ attachments ไม่ถามต่อ
  const jsonb = db.calls.filter((c) => c.op === 'contains').map((c) => [c.table, c.id]);
  assert.deepEqual(jsonb, [
    ['quotations', 'SHARED_twin'], ['entity_updates', 'SHARED_twin'],
    ['quotations', 'SHARED_twin'], ['entity_updates', 'SHARED_twin'],
    ['quotations', 'OWN_file'], ['entity_updates', 'OWN_file'],
  ]);
});

test('🔴 ลบทั้ง entity (purgeAttachments): ไฟล์ที่เธรดหรือหลักฐาน Won ยังอ้าง = เก็บ · ไฟล์ที่ไม่มีที่ไหนอ้างยังถูกทิ้งตามเดิม · แถวหายครบ', async () => {
  const rows = [
    { id: 'ATT-1', entityType: 'deal', entityId: 'D-1', driveFileId: 'IN_thread' },
    { id: 'ATT-2', entityType: 'deal', entityId: 'D-1', driveFileId: 'IN_won' },
    { id: 'ATT-3', entityType: 'deal', entityId: 'D-1', driveFileId: 'FREE_file' },
  ];
  const db = fakeDb({
    attachments: rows,
    updates: [{ id: 'U1', attachments: [{ driveFileId: 'IN_thread' }] }],
    quotations: [{ id: 'Q1', wonAttachments: [{ driveFileId: 'IN_won' }] }],
  });
  const drive = fakeDrive({
    IN_thread: { mimeType: PDF, trashed: false }, IN_won: { mimeType: PDF, trashed: false }, FREE_file: { mimeType: PDF, trashed: false },
  });
  const { result, logged } = await quiet(() => purgeAttachments('deal', 'D-1', db, { drive }));
  assert.deepEqual(result, { count: 3, error: null });
  assert.deepEqual(drive.calls.trashed, ['FREE_file']);
  assert.deepEqual(drive.calls.meta.map(([id]) => id), ['FREE_file'], 'ไฟล์ที่ยังมีที่อ้างไม่ถูกถามกับ Drive');
  assert.equal(logged.length, 2, logged.join(' | '));
  assert.match(logged[0], /ATT-1.*entity_updates\.attachments/);
  assert.match(logged[1], /ATT-2.*quotations\.wonAttachments/);
  assert.deepEqual(db.state.attachments, [], 'เก็บไฟล์ไว้ไม่ได้แปลว่าเก็บแถวไว้');
});

test('purgeAttachments ส่งบริบทของทั้งชุดให้ตัวปล่อย (client ตัวเดียวกัน + id ทุกแถว) · ไม่ throw · ลบแถวหลังปล่อยไฟล์', async () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(readFileSync('src/lib/master/attachments.js', 'utf8'));
  const purge = src.slice(src.indexOf('export async function purgeAttachments('), src.indexOf('const DRIVE_FILE_ID_PATTERN'));
  assert.match(purge, /const purging = \{ drive: deps\.drive, supabase, excludeIds: list\.map\(\(row\) => row\.id\) \};\s*const releaseAttachmentFile = \(att\) => releaseOwnedFile\(att, purging\);\s*for \(const att of list\) await releaseAttachmentFile\(att\);/);
  assert.match(src, /const releaseOwnedFile = releaseAttachmentFile;/);
  assert.ok(purge.indexOf('await releaseAttachmentFile(att);') < purge.indexOf(".from('attachments').delete()"));
  // ตัวปล่อย: ไม่ส่ง client = ใช้ admin client (ไม่ใช่ "ตรวจไม่ได้") · ลำดับ ถอนสิทธิ์ → ด่านไม่มีไฟล์ → ใครถือ → ชนิดไฟล์ → ทิ้ง
  const release = src.slice(src.indexOf('export async function releaseAttachmentFile('), src.indexOf('export async function driveFileTrashable('));
  assert.match(release, /^export async function releaseAttachmentFile\(att, deps = \{\}\) \{/);
  const at = ['revokeAttachmentGrants(att)', 'if (!att?.driveFileId) return;', 'const supabase = deps.supabase || getSupabaseAdmin();',
    'await driveFileReferenced(supabase, att.driveFileId, { excludeId: att.id, excludeIds: deps.excludeIds });',
    'await driveFileTrashable(att.driveFileId, deps);', 'await deleteFile(att.driveFileId);'].map((needle) => release.indexOf(needle));
  at.forEach((i, k) => assert.ok(i >= 0, `ไม่พบขั้นที่ ${k + 1}`));
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'ลำดับของตัวปล่อยไฟล์เปลี่ยน');
  assert.equal((release.match(/deleteFile\(/g) || []).length, 1, 'ทิ้งไฟล์ทางเดียว');
  // ตัวปล่อยถามผ่านตัวช่วยตัวเดียว (สามแหล่ง) — ไม่ถามแค่แถว attachments เอง และไม่ถามฐานตรง ๆ
  assert.doesNotMatch(release, /driveFileHeld\(|supabase\s*\.from\(/);
  assert.match(release, /if \(shared\.referenced\) \{\s*console\.error\([^;]*\);\s*return;\s*\}/);

  // รันจริง: entity ที่ไม่มีไฟล์บน Drive — ไม่ยิงอะไรนอกจากอ่านรายการกับลบแถว
  const rows = [
    { id: 'ATT-1', entityType: 'dept_request_item', entityId: 'DRI-1', driveFileId: null },
    { id: 'ATT-2', entityType: 'dept_request_item', entityId: 'DRI-1', driveFileId: null },
  ];
  const db = fakeDb({ attachments: rows });
  assert.deepEqual(await purgeAttachments('dept_request_item', 'DRI-1', db), { count: 2, error: null });
  assert.deepEqual(db.calls.map((c) => c.op), ['list', 'delete']);
  assert.equal(db.state.attachments.length, 0);
});

test('🔴 driveFileReferenced: แถว attachments (สองช่อง) · หลักฐาน Won รุ่นเก่า · ไฟล์ในเธรด = ถูกอ้างอยู่ · ไม่มีที่ไหนอ้าง = ไม่ถูกอ้าง', async () => {
  const data = {
    attachments: [
      { id: 'A1', driveFileId: 'IN_attachments' },
      { id: 'A2', driveFileId: null, metadata: { googleFileId: 'IN_gdoc' } },
    ],
    quotations: [{ id: 'Q1', wonAttachments: [{ driveFileId: 'IN_won', fileName: 'po.pdf' }] }, { id: 'Q2', wonAttachments: null }],
    updates: [{ id: 'U1', attachments: [{ driveFileId: 'x' }, { driveFileId: 'IN_thread' }] }],
  };
  const ask = (id) => driveFileReferenced(fakeDb(data), id);
  assert.deepEqual(await ask('IN_attachments'), { referenced: true, where: 'attachments', error: null });
  assert.deepEqual(await ask('IN_gdoc'), { referenced: true, where: 'attachments', error: null });
  assert.deepEqual(await ask('IN_won'), { referenced: true, where: 'quotations.wonAttachments', error: null });
  assert.deepEqual(await ask('IN_thread'), { referenced: true, where: 'entity_updates.attachments', error: null });
  assert.deepEqual(await ask('NOBODY_refs'), { referenced: false, where: null, error: null });
  // ถามแบบมีเพดานทุกคำถาม
  const db = fakeDb(data);
  await driveFileReferenced(db, 'NOBODY_refs');
  assert.deepEqual(db.calls.map((c) => [c.table, c.limit]), [['attachments', 1], ['quotations', 1], ['entity_updates', 1]]);
  // แถว attachments ถืออยู่แล้ว = ไม่ต้องถามต่อ
  const short = fakeDb(data);
  await driveFileReferenced(short, 'IN_attachments');
  assert.deepEqual(short.calls.map((c) => c.table), ['attachments']);
  // excludeId / excludeIds ส่งต่อถึงคำถามแถว attachments (ตัวปล่อยไฟล์ไม่นับแถวของตัวเอง) — สองแหล่ง jsonb ยังถูกถามต่อ
  assert.deepEqual(await driveFileReferenced(fakeDb(data), 'IN_attachments', { excludeId: 'A1' }), { referenced: false, where: null, error: null });
  assert.deepEqual(await driveFileReferenced(fakeDb(data), 'IN_gdoc', { excludeIds: ['A1', 'A2'] }), { referenced: false, where: null, error: null });
  assert.deepEqual(await driveFileReferenced(fakeDb(data), 'IN_attachments', { excludeId: 'A2' }), { referenced: true, where: 'attachments', error: null });
  const own = fakeDb({ ...data, updates: [{ id: 'U9', attachments: [{ driveFileId: 'IN_attachments' }] }] });
  assert.deepEqual(await driveFileReferenced(own, 'IN_attachments', { excludeId: 'A1' }), { referenced: true, where: 'entity_updates.attachments', error: null });
  assert.deepEqual(own.calls[0], { table: 'attachments', op: 'held', id: 'IN_attachments', neq: 'A1', limit: 1 });
});

// 🐞 `.contains(col, [{ driveFileId }])` (array ของ JS) ถูก postgrest-js ประกอบเป็น `cs.{[object Object]}` — ฐานจริงตอบ 22P02
//    "invalid input syntax for type json" ทั้งสองตาราง (ลองอ่านอย่างเดียว 08/10/2569) ⇒ ทุกคำถามตกเป็น "ตรวจไม่ได้" ⇒ เส้นถอย
//    การอัปตอบ 409 ทุกครั้ง · ตัวปลอมข้างบนอ่านค่าจาก array ตรง ๆ จึงจับไม่ได้ ⇒ เทสต์นี้ใช้ตัวประกอบคำถามของจริง
//    (supabase-js ตัวเดียวกับที่แอปใช้ = PostgrestClient ใน node_modules · ไม่ออกเครือข่าย — `fetch` ที่ยัดให้จดแค่ URL แล้วตอบแถวว่าง)
test('🔴 driveFileReferenced กับ PostgrestClient ของจริง: ตัวกรอง jsonb ที่ออกไปคือ cs.[{"driveFileId":"<id>"}] ทั้งสองตาราง — ไม่ใช่ array literal', async () => {
  const urls = [];
  const client = createClient('http://postgrest.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input) => {
        urls.push(new URL(String(input?.url || input)));
        return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    },
  });
  const ID = '1AbC_def-123456789';
  assert.deepEqual(await driveFileReferenced(client, ID), { referenced: false, where: null, error: null });
  assert.equal(urls.length, 3, 'สามคำถาม ไม่มีคำขออื่นออกไป');
  const byTable = Object.fromEntries(urls.map((u) => [u.pathname.replace(/^\/rest\/v1\//, ''), u]));
  assert.deepEqual(Object.keys(byTable).sort(), ['attachments', 'entity_updates', 'quotations']);
  const needle = `cs.[{"driveFileId":"${ID}"}]`;
  assert.equal(byTable.quotations.searchParams.get('wonAttachments'), needle);
  assert.equal(byTable.entity_updates.searchParams.get('attachments'), needle);
  for (const table of ['quotations', 'entity_updates']) {
    assert.equal(byTable[table].searchParams.get('limit'), '1', table);
    assert.equal(byTable[table].searchParams.get('select'), 'id', table);
    assert.doesNotMatch(decodeURIComponent(byTable[table].search), /object Object|cs\.\{/, `${table}: ต้องไม่ใช่ array literal ของ Postgres`);
  }
  // คำถามแถว attachments (สองช่อง) ยังเป็นรูปเดิม
  assert.equal(byTable.attachments.searchParams.get('or'), `(driveFileId.eq.${ID},metadata->>googleFileId.eq.${ID})`);
});

test('🔴 driveFileReferenced: ตรวจไม่ได้ = ถือว่ามีคนอ้าง (ทุกคำถาม) · id ผิดรูป = ถือว่ามีคนอ้างโดยไม่ยิงฐาน · ไม่ throw', async () => {
  for (const table of ['attachments', 'quotations', 'entity_updates']) {
    const res = await driveFileReferenced(fakeDb({ errors: { [table]: { message: `${table} down` } } }), 'NOBODY_refs');
    assert.equal(res.referenced, true, table);
    assert.equal(res.error.message, `${table} down`);
  }
  for (const bad of ['', null, undefined, 'a,b', 'x)or(id.neq.1', ['x'], { id: 'x' }, 7]) {
    const db = fakeDb();
    const res = await driveFileReferenced(db, bad);
    assert.equal(res.referenced, true, JSON.stringify(bad));
    assert.equal(db.calls.length, 0, 'id ผิดรูปต้องไม่ถึงตัวกรองของฐาน');
  }
  const thrown = await driveFileReferenced({ from() { throw new Error('no client'); } }, 'NOBODY_refs');
  assert.deepEqual([thrown.referenced, thrown.error.message], [true, 'no client']);
});

// ── ลบทั้ง entity ที่ผูกเอกสาร Google ใบเดียวไว้มากกว่าหนึ่งแถว ────────────────────────────────────────────────────────
//
// 🐞 ตัวถอนสิทธิ์ไม่ถอนอีเมลที่แถวอื่นของไฟล์เดียวกันยังจดอยู่ และ purge ปล่อยของก่อนลบแถว ⇒ สองแถวของระเบียนเดียวกัน
//    เห็นกันเองเป็น "แถวอื่น" แล้วสิทธิ์ค้างบน Drive หลังระเบียนหายไปทั้งใบ ⇒ ถอนซ้ำหลังแถวหายจากฐาน เฉพาะไฟล์ที่ซ้ำในชุด
test('🔴 ลบทั้ง entity: เอกสาร Google ที่ชุดเดียวกันผูกซ้ำ ถูกถอนสิทธิ์อีกรอบหลังแถวหายแล้ว · ไฟล์ที่ผูกแถวเดียวไม่ยิง Drive ซ้ำ', async () => {
  const revoked = [];
  const drive = { revokeFileRole: async (fileId, email) => { revoked.push([fileId, email]); return true; } };
  // แถวของชุดถูกลบไปแล้ว ⇒ ไม่เหลือแถวอื่นของไฟล์นี้ในฐาน
  const supabase = { from: () => ({ select: () => ({ contains: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) };
  const doc = (id, googleFileId, accessGranted) => ({ id, entityType: 'deal', entityId: 'D-1', driveFileId: null, metadata: { kind: 'gdoc', googleFileId, accessGranted } });
  const list = [
    doc('ATT-1', 'DOC_twin-file', ['a@x.co']),
    doc('ATT-2', 'DOC_twin-file', ['a@x.co', 'b@x.co']),
    doc('ATT-3', 'DOC_single-file', ['c@x.co']),
    { id: 'ATT-4', entityType: 'deal', entityId: 'D-1', driveFileId: 'FILE_plain-1', metadata: {} },
    { id: 'ATT-5', entityType: 'deal', entityId: 'D-1', driveFileId: null, metadata: null },
  ];
  assert.equal(await revokeTwinDocGrants(list, { supabase, drive }), 2);
  assert.deepEqual(revoked, [['DOC_twin-file', 'a@x.co'], ['DOC_twin-file', 'a@x.co'], ['DOC_twin-file', 'b@x.co']],
    'ถอนเฉพาะอีเมลของแถวที่ผูกไฟล์ซ้ำ · ไฟล์ที่ผูกแถวเดียวไม่ถูกยิงซ้ำ');

  revoked.length = 0;
  assert.equal(await revokeTwinDocGrants(list.slice(1), { supabase, drive }), 0, 'ไม่มีไฟล์ซ้ำในชุด = ไม่ทำอะไร');
  assert.equal(await revokeTwinDocGrants(null, { supabase, drive }), 0);
  assert.deepEqual(revoked, []);

  // เรียกหลังลบแถวสำเร็จเท่านั้น (ลบพัง = แถวยังอยู่ ยังเห็นกันเอง) และส่ง client ตัวเดียวกับที่ใช้ลบ
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = strip(readFileSync('src/lib/master/attachments.js', 'utf8'));
  const purge = src.slice(src.indexOf('export async function purgeAttachments('), src.indexOf('export async function revokeTwinDocGrants('));
  const deleteAt = purge.indexOf(".from('attachments').delete()");
  const twinAt = purge.indexOf('if (!error) await revokeTwinDocGrants(list, { supabase, drive: deps.drive });');
  assert.ok(deleteAt >= 0 && twinAt > deleteAt, 'ถอนซ้ำต้องอยู่หลังคำสั่งลบแถว และเฉพาะเมื่อไม่มี error');
});
