// ── ไฟล์แนบของคำร้อง บนจอใบประเมิน — อ่านอย่างเดียว (PR-S · แผน crew Q6) ─────────────────
//
// 🐞 ก่อนนี้ GET ใบประเมินโหลดแต่ไฟล์ของพื้นที่ · ไฟล์ที่ SA แนบมากับคำร้อง (ผังอาคาร · รูปหน้าร้าน) ช่างไม่เห็นเลย
//   และถ้าแค่ลิสต์ให้เห็น proxy ก็ตอบ 403 (บันไดคำร้อง) ⇒ ลิงก์ตายทุกอัน
// ⭐ ลิสต์ = เปิดได้: ตัวโหลดถามด่านอ่านตัวเดียวกับ proxy (`canViewCostingAttachment`) ก่อนอ่าน
// ⭐ อ่านพัง = `unknown.requestFiles` ไม่ใช่ 500 — ผลวัดซึ่งเป็นเนื้อหลักของจออ่านได้แล้ว (กติกาของไฟล์ route)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSurveyRequestFiles, surveyRequestFileRows } from './surveyRequestFiles.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CREW = { id: 'U-TS1', role: 'ts', department: 'TS' };
const REQ = { id: 'DR-S1', kind: 'site_survey', dept: 'TS', status: 'acknowledged', requestedById: 'U-AE' };
const ROW = {
  id: 'ATT-9', entityType: 'dept_request', entityId: 'DR-S1', docType: 'other', fileName: 'ผังชั้น1.pdf',
  mimeType: 'application/pdf', sizeBytes: 1200, driveFileId: 'drv-1', fileUrl: 'https://drive.google.com/x',
  createdAt: '2026-09-27T01:00:00+00:00', uploadedBy: 'U-AE', uploadedByName: 'เซลส์',
  metadata: { kind: 'gdoc', googleFileId: 'g-1', accessGranted: ['someone@scentandsense.co.th'] },
};

test('🔑 ช่างได้รายการไฟล์ของคำร้องประเมินพื้นที่ — ช่องเท่าที่จอแบบอ่านอย่างเดียวต้องใช้', async () => {
  const calls = [];
  const list = async (...args) => { calls.push(args.slice(0, 2)); return [ROW]; };
  const res = await loadSurveyRequestFiles({}, REQ, CREW, { list });
  assert.deepEqual(calls, [['dept_request', 'DR-S1']]);
  assert.equal(res.unknown, false);
  assert.deepEqual(res.files, [{
    id: 'ATT-9', docType: 'other', fileName: 'ผังชั้น1.pdf', mimeType: 'application/pdf', sizeBytes: 1200,
    driveFileId: 'drv-1', fileUrl: 'https://drive.google.com/x', createdAt: '2026-09-27T01:00:00+00:00',
    uploadedByName: 'เซลส์', kind: 'gdoc',
  }]);
});

test('🔴 ไม่ส่ง metadata ดิบออกไป — รายชื่ออีเมลที่ได้สิทธิ์ Drive / id ของ Google ต้องไม่ถึงจอช่าง', () => {
  const [row] = surveyRequestFileRows([ROW]);
  assert.equal('metadata' in row, false);
  assert.doesNotMatch(JSON.stringify(row), /accessGranted|googleFileId|someone@/);
  assert.deepEqual(surveyRequestFileRows(null), []);
  assert.equal(surveyRequestFileRows([{ id: 'x', metadata: null }])[0].kind, null);
});

test('อ่านพัง = unknown (ไม่ใช่ว่าง ไม่ใช่ 500)', async () => {
  const res = await loadSurveyRequestFiles({}, REQ, CREW, { list: async () => { throw new Error('boom'); } });
  assert.deepEqual(res, { files: [], unknown: true });
});

test('🔴 คนที่ proxy ไม่ให้เปิด = ไม่ลิสต์เลย (ไม่ยิงอ่านด้วย) — ลิสต์ต้องเท่ากับที่เปิดได้', async () => {
  let called = false;
  const list = async () => { called = true; return [ROW]; };
  const notSurvey = await loadSurveyRequestFiles({}, { ...REQ, kind: 'install' }, CREW, { list });
  assert.deepEqual(notSurvey, { files: [], unknown: false });
  const otherDept = await loadSurveyRequestFiles({}, { ...REQ, dept: 'RD' }, CREW, { list });
  assert.deepEqual(otherDept, { files: [], unknown: false });
  assert.equal(called, false);
  assert.deepEqual(await loadSurveyRequestFiles({}, null, CREW, { list }), { files: [], unknown: false });
});

/* ── ยามผูกกับซอร์สจริงของ GET ใบประเมิน ───────────────────────────────────── */

test('GET ใบประเมิน: ไฟล์ของคำร้องยิงขนานในรอบเดียวกับชิ้นอื่น · พัง = unknown.requestFiles', () => {
  const route = code('../../app/api/service/surveys/[id]/route.js');
  assert.match(route, /Promise\.all\(\[[\s\S]*?loadSurveyRequestFiles\(supabase, request, user\)[\s\S]*?\]\)/);
  assert.match(route, /if \(requestFiles\.unknown\) context\.unknown\.requestFiles = true;/);
  assert.match(route, /requestFiles: requestFiles\.files,/);
});

test('GET ใบประเมิน: ธงผูกรูปกับจุดมาจากตัวตัดสินตัวเดียวกับด่าน PATCH (จอไม่รู้ role/ล็อกเอง)', () => {
  const route = code('../../app/api/service/surveys/[id]/route.js');
  assert.match(route, /canLinkSpotPhotos: surveySpotLinkDecision\(request, \{[\s\S]*?canWrite: access\.ok === true,[\s\S]*?canDecide,[\s\S]*?isAdmin: user\?\.role === 'admin',[\s\S]*?\}\)\.ok,/);
  const gate = code('../master/costingAttachmentAccess.js');
  assert.match(gate, /surveySpotLinkDecision\(req, \{ canWrite, canDecide: canSendSurveyResult\(user\), isAdmin \}\)/);
});
