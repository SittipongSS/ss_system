// ── PATCH การผูกรูปกับจุด (`metadata.spotId`) — ตัวรันของ /api/attachments/[id] (PR-S) ──────
//
// ⭐ ลำดับด่าน: พื้นที่ของรูปต้องมีจริง (404) → สิทธิ์ (403 · ใบส่งแล้ว = หัวหน้าเท่านั้น) → รูปร่าง/ชนิดรูป (400)
//   → จุดต้องมีอยู่ในพื้นที่ที่บันทึกแล้ว (409 — รายการจุดเปลี่ยนจากที่อื่นได้) → เขียน metadata คีย์เดียว
// ⭐ ผ่านด้วยข้อยกเว้นของใบที่ส่งผลแล้ว (Q1a) = ลง audit ทุกครั้ง · ใบเปิด = ไม่ลง (งานปกติของช่าง)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSurveySpotLink } from './surveySpotLink.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CREW = { id: 'U-TS1', name: 'ช่างหนึ่ง', role: 'ts', department: 'TS' };
const HEAD = { id: 'U-TSM', name: 'หัวหน้า', role: 'ts_manager', department: 'TS' };

const OPEN = {
  id: 'DR-S1', docNo: 'RQ-AS-26090186', status: 'acknowledged', kind: 'site_survey', dept: 'TS',
  requestedById: 'U-AE', answeredAt: null, cancelledAt: null,
};
const SENT = { ...OPEN, status: 'answered', answeredAt: '2026-09-20T00:00:00Z' };
const ZONE = {
  id: 'SVZ-1', requestId: 'DR-S1', zoneName: 'ล็อบบี้',
  spots: [{ id: 'SPT-a', label: 'หน้าลิฟต์', selected: true }, { id: 'SPT-b', label: 'ข้างเคาน์เตอร์', selected: false }],
};
const VISIT = { id: 'SV-1', kind: 'survey', requestId: 'DR-S1', status: 'in_progress', assigneeId: 'U-TS1', assistantIds: [] };
const ATT = {
  id: 'ATT-1', entityType: 'service_survey_zone', entityId: 'SVZ-1', docType: 'survey_spot',
  fileName: 'IMG_1.jpg', metadata: { caption: 'เดิม' },
};

/* ฐานปลอม — จดทุกการเขียนไว้ให้เทสต์ตรวจ · ⚠️ chain ของนัดต้องครบ (findSurveyVisit ใช้ order/limit) */
function fakeDb({ request = OPEN, zone = ZONE, zoneError = null, updateError = null, updated = 'echo' } = {}) {
  const writes = [];
  const one = (data, error = null) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) });
  return {
    writes,
    from(table) {
      if (table === 'dept_requests') return one(request);
      if (table === 'service_survey_zones') return one(zone, zoneError);
      if (table === 'attachments') {
        return {
          update: (patch) => ({
            eq: (col, id) => ({
              select: () => ({
                maybeSingle: async () => {
                  writes.push({ table, patch, col, id });
                  if (updateError) return { data: null, error: updateError };
                  return { data: updated === 'echo' ? { ...ATT, ...patch } : updated, error: null };
                },
              }),
            }),
          }),
        };
      }
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, order: () => chain,
        limit: async () => ({ data: [VISIT], error: null }),
      };
      return chain;
    },
  };
}

const run = (db, { att = ATT, spotId = 'SPT-b', user = CREW } = {}) => {
  const audits = [];
  return runSurveySpotLink({ supabase: db, att, spotId, user, audit: async (row) => { audits.push(row); } })
    .then((res) => ({ ...res, audits }));
};

test('🔑 ช่างบนนัด ผูกรูปจากถาดเข้าจุดที่บันทึกแล้ว — เขียน spotId คีย์เดียว คีย์อื่นคงเดิม · ไม่ลง audit', async () => {
  const db = fakeDb();
  const res = await run(db);
  assert.equal(res.status, 200);
  assert.deepEqual(db.writes, [{ table: 'attachments', patch: { metadata: { caption: 'เดิม', spotId: 'SPT-b' } }, col: 'id', id: 'ATT-1' }]);
  assert.equal(res.body.metadata.spotId, 'SPT-b');
  assert.deepEqual(res.audits, [], 'ใบเปิด = งานปกติของช่าง ไม่ใช่ข้อยกเว้น');
});

test('ถอดการผูก (spotId null) = ลบคีย์ทิ้ง รูปกลับลงถาด', async () => {
  const db = fakeDb();
  const res = await run(db, { att: { ...ATT, metadata: { caption: 'เดิม', spotId: 'SPT-a' } }, spotId: null });
  assert.equal(res.status, 200);
  assert.deepEqual(db.writes[0].patch, { metadata: { caption: 'เดิม' } });
});

test('ผูกซ้ำจุดเดิม = ไม่เขียน ไม่ลง audit (กดสองแท็บ)', async () => {
  const db = fakeDb({ request: SENT });
  const res = await run(db, { att: { ...ATT, metadata: { spotId: 'SPT-b' } }, user: HEAD });
  assert.equal(res.status, 200);
  assert.deepEqual(db.writes, []);
  assert.deepEqual(res.audits, []);
});

test('🔑 Q1(a) ใบส่งผลแล้ว: หัวหน้าผูกได้ + ลง audit ที่ใบคำร้อง (ก่อน/หลัง = spotId)', async () => {
  const db = fakeDb({ request: SENT });
  const res = await run(db, { att: { ...ATT, metadata: { spotId: 'SPT-a' } }, user: HEAD });
  assert.equal(res.status, 200);
  assert.equal(db.writes.length, 1);
  assert.equal(res.audits.length, 1);
  const [a] = res.audits;
  assert.equal(a.action, 'update');
  assert.equal(a.entityType, 'dept_request');
  assert.equal(a.entityId, 'DR-S1');
  assert.deepEqual(a.before, { attachmentId: 'ATT-1', zoneId: 'SVZ-1', spotId: 'SPT-a' });
  assert.deepEqual(a.after, { attachmentId: 'ATT-1', zoneId: 'SVZ-1', spotId: 'SPT-b' });
  assert.match(a.summary, /RQ-AS-26090186/);
  assert.match(a.summary, /ส่งผลแล้ว/);
  assert.match(a.summary, /หน้าลิฟต์ → ข้างเคาน์เตอร์/);
  assert.equal(a.user, HEAD);
});

test('🔴 ใบส่งผลแล้ว: ช่างผูกไม่ได้ (403 พร้อมเหตุ) · ไม่มีการเขียน', async () => {
  const db = fakeDb({ request: SENT });
  const res = await run(db);
  assert.equal(res.status, 403);
  assert.match(res.body.error, /หัวหน้า/);
  assert.deepEqual(db.writes, []);
});

test('ชนิดรูปผิด / รูปร่าง spotId ผิด = 400 · จุดไม่อยู่ในพื้นที่ (ลบไปแล้ว/ยังไม่บันทึก) = 409', async () => {
  const wide = await run(fakeDb(), { att: { ...ATT, docType: 'survey_wide' } });
  assert.equal(wide.status, 400);
  assert.match(wide.body.error, /เฉพาะภาพจุดติดตั้ง/);
  assert.equal((await run(fakeDb(), { spotId: 'a b' })).status, 400);
  const gone = await run(fakeDb(), { spotId: 'new-unsaved' });
  assert.equal(gone.status, 409);
  assert.match(gone.body.error, /ไม่พบจุดนี้/);
});

test('พื้นที่ของรูปไม่มีแล้ว = 404 · อ่านพื้นที่พัง = 500 (ไม่ถือว่า "ไม่มี" แล้วข้ามด่าน)', async () => {
  assert.equal((await run(fakeDb({ zone: null }))).status, 404);
  const broken = await run(fakeDb({ zone: null, zoneError: new Error('boom') }));
  assert.equal(broken.status, 500);
});

test('เขียนพัง = 500 · แถวหายระหว่างทาง = 404 · ไม่ลง audit ทั้งคู่', async () => {
  const fail = await run(fakeDb({ request: SENT, updateError: new Error('x') }), { user: HEAD });
  assert.equal(fail.status, 500);
  assert.deepEqual(fail.audits, []);
  const vanished = await run(fakeDb({ request: SENT, updated: null }), { user: HEAD });
  assert.equal(vanished.status, 404);
  assert.deepEqual(vanished.audits, []);
});

/* ── ยามผูกกับซอร์สจริงของ route ─────────────────────────────────────────── */

test('🔴 PATCH: เส้นผูกจุดรับเฉพาะคำขอ spotId คีย์เดียวของผลวัดพื้นที่ · คำขอผสม spotId ถูกตีกลับ', () => {
  const route = code('../../app/api/attachments/[id]/route.js');
  assert.match(route, /att\.entityType === 'service_survey_zone' && isSpotLinkPatch\(metadata\)/);
  assert.match(route, /runSurveySpotLink\(\{ supabase, att, spotId: metadata\.spotId, user, request \}\)/);
  // spotId ปนกับคีย์อื่น = ไม่ใช่คำขอผูกจุด ⇒ ห้ามไหลไป merge ทั่วไปแล้วเขียน spotId ข้ามด่านจุด
  assert.match(route, /'spotId' in metadata/);
  // เส้นทั่วไปยังผ่านด่านเขียนตัวเดิม (ข้อยกเว้นของใบที่ส่งแล้วไม่รั่วไปที่ลบ/แก้คีย์อื่น)
  assert.equal((route.match(/await guardAttachmentWrite\(supabase, att, user,/g) || []).length, 2);
});

test('🔴 POST: spotId ของผลวัดพื้นที่ถูกตรวจก่อนสร้างอะไรบน Drive และก่อนเขียนแถว', () => {
  const route = code('../../app/api/attachments/route.js');
  const check = route.indexOf('surveySpotUploadMetadata(entityType, safeDocType, metadata)');
  assert.ok(check > 0, 'POST ต้องเรียกตัวตรวจ spotId');
  assert.ok(check < route.indexOf('buildGoogleAttachment('), 'ต้องมาก่อนคุยกับ Drive');
  assert.match(route, /\.\.\.stripDriveMetadata\(spotUpload\.metadata\)/, 'แถวต้องเขียนจาก metadata ที่ตรวจแล้ว');
});

test('🔴 ลบจุดที่ PATCH พื้นที่ ไม่แตะไฟล์แนบเลย — รูปตกถาดเอง (ไม่มีไฟล์หาย)', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
  const patch = route.slice(route.indexOf('export const PATCH'), route.indexOf('export const PUT'));
  assert.ok(patch.length > 100, 'หา PATCH ไม่เจอ');
  assert.doesNotMatch(patch, /attachments|purge|releaseAttachmentFile/);
});
