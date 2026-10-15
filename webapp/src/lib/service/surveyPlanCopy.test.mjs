// ── คัดลอกไฟล์ของฝ่ายขายเป็นภาพแบบของพื้นที่จากแบบ (ประเมินจากแบบ · งวด S2b §2.4) ───────────────────────
//
// ⭐ สิ่งที่ไฟล์นี้ล็อก: ลำดับด่านสิบเอ็ดข้อพร้อมข้อความไทยตรงตัว · **ไม่มีอะไรถูกคัดลอกก่อนด่านครบ** (ข้อ 1–9 รวม 8b) ·
//    ที่มาของไฟล์เธรด (ใบรับการอัปของผู้โพสต์) · การอ่านที่พังไม่เปิดด่านไหน · ออกใบรับไม่ได้ = ลบไฟล์ที่เพิ่งคัดลอก ·
//    ไฟล์ใหม่เป็นคนละใบกับไฟล์ต้นทาง (ลบแถวใดแถวหนึ่งไม่แตะไฟล์ของอีกแถว)
// ⚠️ supabase ปลอมจำแถว (`crew/routeTestKit.mjs`) · Drive เป็นตัวปลอมที่จดทุกการเรียก — ไม่มีอะไรถึงฐานจริงหรือ Drive จริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { fakeDb, callRoute, tech, planner } from './crew/routeTestKit.mjs';
import { SURVEY_PLAN_COPY_ERRORS, copySalesFileToZonePlan, surveyPlanCopySource } from './surveyPlanCopy.js';
import { SALES_REUSE_BLOCKED } from './surveyFieldView.js';
import { UPLOAD_RECEIPT_TTL_MS } from '../upload/receipts.js';
import { deleteAttachmentRows, releaseAttachmentFile } from '../master/attachments.js';

const { POST } = await import('../../app/api/service/surveys/[id]/zones/[zoneId]/plan-from-sales/route.js');

/* ข้อความที่ผู้ใช้เห็น — เขียนตรงตัวที่นี่โดยตั้งใจ (สเปก S2b §2.4 · §7.1) · แก้คำในโค้ดแล้วเทสต์ต้องแดง */
const N1 = 'ใช้ไฟล์จากฝ่ายขายเป็นภาพแบบได้เฉพาะหัวหน้าฝ่ายบริการ';
const N2 = 'ไฟล์ที่เลือกไม่ถูกต้อง';
const N3 = 'พื้นที่นี้ถูกตัดออกแล้ว — เอากลับเข้าใบก่อน';
const N4 = 'ใช้ไฟล์จากฝ่ายขายเป็นภาพแบบได้เฉพาะพื้นที่ที่ประเมินจากแบบ';
const N5 = 'ไม่พบไฟล์นี้ในคำร้อง';
const N6 = 'ไม่พบไฟล์นี้ในเธรดของคำร้อง';
const N7 = 'ตรวจไฟล์กับ Google Drive ไม่สำเร็จ — ลองอีกครั้ง';
const N8 = 'คัดลอกไฟล์ไม่สำเร็จ — ลองอีกครั้ง';
const N28 = 'ใช้ไฟล์นี้จากเธรดไม่ได้ — เปิดไฟล์ บันทึกลงเครื่อง แล้วแนบที่ช่องภาพแบบเอง';
const N29 = 'ตรวจที่มาของไฟล์ไม่สำเร็จ — ลองอีกครั้ง';
const BLOCKED = 'ไฟล์นี้ลงเอกสารไม่ได้ — แคปหน้าที่ต้องการเป็น PNG แล้วแนบ';
const NO_SHEET = 'ไม่พบใบประเมินพื้นที่';
const NO_ZONE = 'ไม่พบพื้นที่นี้ในใบประเมิน';

const head = { id: 'U-HEAD', name: 'หัวหน้าฝ่าย', role: 'ts_manager', department: 'TS' };
const admin = { id: 'U-ADMIN', name: 'แอดมิน', role: 'admin' };
const cd = { id: 'U-CD', name: 'CD', role: 'commercial_director', department: 'SA' };
const cm = { id: 'U-CM', name: 'CM', role: 'commercial_manager', department: 'SA' };
const sales = { id: 'U-AE', name: 'ฝ่ายขาย', role: 'ae', department: 'SA' };

const NOW = Date.parse('2026-10-09T05:00:00Z');
const T0 = '2026-10-09T03:00:00+00:00';
const request = (o = {}) => ({
  id: 'REQ1', kind: 'site_survey', dept: 'TS', docNo: 'RQ-AS-26100001', status: 'acknowledged',
  requestedById: 'U-AE', answeredAt: null, cancelledAt: null, closedAt: null, createdAt: T0, ...o,
});
const zone = (o = {}) => ({ id: 'SZ1', requestId: 'REQ1', zoneName: 'Lobby', status: 'ok', method: 'drawing', ...o });
const salesRow = (o = {}) => ({
  id: 'ATT-1', entityType: 'dept_request', entityId: 'REQ1', docType: 'other', fileName: 'plan-1.png', mimeType: 'image/png',
  sizeBytes: 2048, driveFileId: 'SRC-REQ-1', fileUrl: 'https://drive.google.com/file/d/SRC-REQ-1/view', metadata: null, uploadedBy: 'U-AE', ...o,
});
const threadRow = (o = {}) => ({
  id: 'EU-1', entityType: 'dept_request', entityId: 'REQ1', kind: 'comment', authorId: 'U-AE', authorName: 'ฝ่ายขาย', deletedAt: null,
  attachments: [
    { fileUrl: 'https://drive.google.com/file/d/SRC-THR-0/view', driveFileId: 'SRC-THR-0', fileName: 'floor.jpg', mimeType: 'image/jpeg', sizeBytes: 900 },
    { fileUrl: 'https://drive.google.com/file/d/SRC-THR-1/view', driveFileId: 'SRC-THR-1', fileName: 'floor-2.png', mimeType: 'image/png', sizeBytes: 901 },
  ],
  ...o,
});
const receipt = (driveFileId, userId = 'U-AE', createdAt = T0) => ({ driveFileId, userId, entityType: 'dept_request', entityId: 'REQ1', createdAt, claimedBy: null, claimedAt: null });

const REQ_SOURCE = { kind: 'request', attachmentId: 'ATT-1' };
const THR_SOURCE = { kind: 'thread', updateId: 'EU-1', index: 1 };

function world({ req = {}, zones = [zone()], files = [salesRow()], updates = [threadRow()], receipts = [receipt('SRC-THR-1')], hook = null } = {}) {
  return fakeDb({
    dept_requests: [request(req)],
    service_survey_zones: zones,
    attachments: files,
    entity_updates: updates,
    upload_receipts: receipts,
  }, { hook });
}

/* Drive ปลอม — จดทุกการเรียก · `meta` ตอบตาม id ของไฟล์ต้นทาง */
function fakeDrive({ meta = {}, metaError = null, streamError = null, uploadError = null, uploadResult = undefined, deleteError = null } = {}) {
  const calls = { meta: [], stream: [], upload: [], deleted: [] };
  return {
    calls,
    deps: {
      now: NOW,
      getFileMeta: async (id, fields) => {
        calls.meta.push([id, fields]);
        if (metaError) throw metaError;
        return { id, mimeType: 'image/png', size: '2048', trashed: false, ...(meta[id] || meta['*'] || {}) };
      },
      getFileStream: async (id) => {
        calls.stream.push(id);
        if (streamError) throw streamError;
        return Readable.from([Buffer.from('PNG-'), Buffer.from(`bytes-of-${id}`)]);
      },
      uploadForEntity: async (args) => {
        calls.upload.push(args);
        if (uploadError) throw uploadError;
        return uploadResult === undefined ? { id: 'COPY-1', webViewLink: 'https://drive.google.com/file/d/COPY-1/view' } : uploadResult;
      },
      deleteFile: async (id) => {
        calls.deleted.push(id);
        if (deleteError) throw deleteError;
      },
    },
  };
}
const nothingCopied = (drive, label) => {
  assert.deepEqual(drive.calls.stream, [], `${label}: ไม่อ่านไบต์`);
  assert.deepEqual(drive.calls.upload, [], `${label}: ไม่คัดลอก`);
  assert.deepEqual(drive.calls.deleted, [], `${label}: ไม่มีอะไรให้ลบ`);
};
const noDriveAtAll = (drive, label) => {
  assert.deepEqual(drive.calls.meta, [], `${label}: ไม่ถาม Drive`);
  nothingCopied(drive, label);
};
const writesOf = (db) => db.calls.filter((q) => q.write).map((q) => `${q.write} ${q.table}`);

async function run({ db = world(), user = head, source = REQ_SOURCE, drive = fakeDrive(), req, zoneRow, deps = {} } = {}) {
  const requestRow = req === undefined ? db.tables.dept_requests[0] : req;
  const z = zoneRow === undefined ? db.tables.service_survey_zones[0] : zoneRow;
  const out = await copySalesFileToZonePlan(db, { request: requestRow, zone: z, source, user }, { ...drive.deps, ...deps });
  return { ...out, db, drive };
}
async function quiet(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

/* ══ ข้อความ ═══════════════════════════════════════════════════════════════════════════════ */

test('ข้อความของเส้นคัดลอกตรงตัวตามสเปก · ประโยค "ลงเอกสารไม่ได้" เป็นค่าคงที่ตัวเดียวกับปุ่มบนแผงแบบจากฝ่ายขาย', () => {
  assert.deepEqual(SURVEY_PLAN_COPY_ERRORS, {
    role: N1, shape: N2, cut: N3, onsite: N4, requestFile: N5, threadFile: N6, notPrintable: BLOCKED,
    driveCheck: N7, copy: N8, receipt: N28, receiptCheck: N29, read: 'อ่านข้อมูลไฟล์ไม่สำเร็จ — ลองอีกครั้ง',
  });
  assert.equal(SALES_REUSE_BLOCKED, BLOCKED);
  assert.equal(SURVEY_PLAN_COPY_ERRORS.notPrintable, SALES_REUSE_BLOCKED);
});

/* ══ ด่าน 1 — สิทธิ์ ═════════════════════════════════════════════════════════════════════════ */

test('🔴 ด่าน 1: ช่าง · ผู้วางคิว · ฝ่ายขาย · ไม่ได้ล็อกอิน = 403 พร้อมข้อความ — ไม่แตะฐาน ไม่แตะ Drive', async () => {
  for (const user of [tech, planner, sales, null]) {
    const out = await run({ user });
    assert.equal(out.status, 403, user?.id);
    assert.deepEqual(out.body, { error: N1 });
    assert.deepEqual(out.db.calls, [], 'ไม่มีคำสั่งอ่านสักคำสั่ง');
    noDriveAtAll(out.drive, user?.id);
  }
});

test('⭐ ด่าน 1: หัวหน้า · แอดมิน · CD · CM ผ่านและคัดลอกได้', async () => {
  for (const user of [head, admin, cd, cm]) {
    const out = await run({ user });
    assert.equal(out.status, 201, `${user.id}: ${out.body.error}`);
    assert.equal(out.body.driveFileId, 'COPY-1');
  }
});

/* ══ ด่าน 2 — รูปของ body ═══════════════════════════════════════════════════════════════════ */

test('ด่าน 2: รูปของไฟล์ที่เลือกผิด = 400 — ชนิดไม่รู้จัก · id ไม่ใช่สตริง/ว่าง · ลำดับไม่ใช่จำนวนเต็มไม่ติดลบ', async () => {
  const bad = [
    null, undefined, 'request', [], {}, { kind: 'other', attachmentId: 'A' },
    { kind: 'request' }, { kind: 'request', attachmentId: '' }, { kind: 'request', attachmentId: '   ' }, { kind: 'request', attachmentId: 12 },
    { kind: 'request', attachmentId: { a: 1 } }, { kind: 'request', attachmentId: 'x'.repeat(201) },
    { kind: 'thread', updateId: 'EU-1' }, { kind: 'thread', updateId: 'EU-1', index: -1 }, { kind: 'thread', updateId: 'EU-1', index: 1.5 },
    { kind: 'thread', updateId: 'EU-1', index: '1' }, { kind: 'thread', updateId: '', index: 0 }, { kind: 'thread', updateId: 7, index: 0 },
    { kind: 'thread', updateId: 'EU-1', index: Number.NaN }, { kind: 'thread', updateId: 'EU-1', index: 1e9 },
  ];
  for (const source of bad) {
    assert.equal(surveyPlanCopySource(source), null, JSON.stringify(source));
    // `undefined` ผ่านค่าตั้งต้นของตัวช่วยไม่ได้ — เรียกตัวจริงตรง ๆ
    const db = world();
    const drive = fakeDrive();
    const out = { ...(await copySalesFileToZonePlan(db, { request: request(), zone: zone(), source, user: head }, drive.deps)), db, drive };
    assert.equal(out.status, 400, JSON.stringify(source));
    assert.deepEqual(out.body, { error: N2 });
    assert.deepEqual(out.db.calls, []);
    noDriveAtAll(out.drive, 'shape');
  }
  assert.deepEqual(surveyPlanCopySource({ kind: 'request', attachmentId: ' ATT-1 ', extra: 1 }), { kind: 'request', attachmentId: 'ATT-1' });
  assert.deepEqual(surveyPlanCopySource({ kind: 'thread', updateId: 'EU-1', index: 0, attachmentId: 'x' }), { kind: 'thread', updateId: 'EU-1', index: 0 });
});

/* ══ ด่าน 3–7 — ใบ · สภาพใบ · พื้นที่ ═════════════════════════════════════════════════════════ */

test('ด่าน 3: ไม่มีใบ / ไม่ใช่ใบประเมินพื้นที่ = 404 · ใบของฝ่ายอื่น = 403 "ตอบได้เฉพาะฝ่าย …"', async () => {
  for (const req of [null, request({ kind: 'info' })]) {
    const out = await run({ req });
    assert.equal(out.status, 404);
    assert.deepEqual(out.body, { error: NO_SHEET });
    noDriveAtAll(out.drive, 'ด่าน 3');
  }
  const other = await run({ req: request({ dept: 'RD' }) });
  assert.equal(other.status, 403);
  assert.deepEqual(other.body, { error: 'ตอบได้เฉพาะฝ่าย RD' });
  noDriveAtAll(other.drive, 'ด่าน 3 ฝ่ายอื่น');
});

test('ด่าน 4: ใบที่ส่งผลแล้ว · ยกเลิก · ปิด = 409 ด้วยข้อความของตัวล็อกใบ — ไม่มีอะไรถูกคัดลอก', async () => {
  const { surveyEditLockError } = await import('./survey.js');
  for (const over of [{ answeredAt: T0, status: 'answered' }, { cancelledAt: T0, status: 'cancelled' }, { status: 'closed' }]) {
    const req = request(over);
    const out = await run({ req });
    assert.equal(out.status, 409, JSON.stringify(over));
    assert.equal(out.body.error, surveyEditLockError(req));
    assert.ok(out.body.error);
    noDriveAtAll(out.drive, 'ด่าน 4');
  }
});

test('ด่าน 5–7: ไม่มีแถวพื้นที่ / แถวของใบอื่น = 404 · ถูกตัด = 409 · ลงหน้างาน = 409 (กติกา 29/08 ยังอยู่) — ตามลำดับนี้', async () => {
  for (const zoneRow of [null, zone({ requestId: 'REQ-OTHER' })]) {
    const out = await run({ zoneRow });
    assert.equal(out.status, 404);
    assert.deepEqual(out.body, { error: NO_ZONE });
    noDriveAtAll(out.drive, 'ด่าน 5');
  }
  const cut = await run({ zoneRow: zone({ status: 'cut' }) });
  assert.equal(cut.status, 409);
  assert.deepEqual(cut.body, { error: N3 });
  // ถูกตัดมาก่อนวิธี — พื้นที่ลงหน้างานที่ถูกตัดได้ข้อความ "ถูกตัด"
  assert.deepEqual((await run({ zoneRow: zone({ status: 'cut', method: 'onsite' }) })).body, { error: N3 });
  for (const method of ['onsite', null, undefined, 'Drawing', '']) {
    const out = await run({ zoneRow: zone({ method }) });
    assert.equal(out.status, 409, String(method));
    assert.deepEqual(out.body, { error: N4 });
    noDriveAtAll(out.drive, 'ด่าน 7');
  }
  // ลำดับ: ใบล็อกมาก่อนพื้นที่ — ใบที่ส่งแล้ว + พื้นที่ลงหน้างาน ได้ข้อความของใบ
  const locked = await run({ req: request({ answeredAt: T0 }), zoneRow: zone({ method: 'onsite' }) });
  assert.notEqual(locked.body.error, N4);
});

/* ══ ด่าน 8 — แถวต้นทาง + ด่านอ่าน ═══════════════════════════════════════════════════════════ */

test('ด่าน 8 · ไฟล์ของคำร้อง: ไม่มีแถว · แถวของ entity อื่น · แถวของใบอื่น = 404 เดียวกัน · ด่านอ่านไม่ผ่าน = 404 เดียวกัน (ไม่บอกว่ามีไฟล์)', async () => {
  const cases = [
    world({ files: [] }),
    world({ files: [salesRow({ entityType: 'service_survey_zone', entityId: 'SZ1' })] }),
    world({ files: [salesRow({ entityId: 'REQ-OTHER' })] }),
  ];
  for (const db of cases) {
    const out = await run({ db });
    assert.equal(out.status, 404);
    assert.deepEqual(out.body, { error: N5 });
    noDriveAtAll(out.drive, 'ด่าน 8 request');
  }
  const blind = await run({ deps: { canViewRequestFiles: async () => false } });
  assert.equal(blind.status, 404);
  assert.deepEqual(blind.body, { error: N5 });
  noDriveAtAll(blind.drive, 'ด่านอ่าน');
  // ด่านอ่านถูกถามด้วยใบและคนกดจริง
  const seen = [];
  await run({ deps: { canViewRequestFiles: async (_s, req, user) => { seen.push([req.id, user.id]); return true; } } });
  assert.deepEqual(seen, [['REQ1', 'U-HEAD']]);
});

test('ด่าน 8 · ไฟล์เธรด: ไม่มีข้อความ · ข้อความของใบอื่น · ถูกลบ · ไม่มีรายการลำดับนั้น · ไม่มีที่อยู่ไฟล์ = 404 · ด่านอ่านเธรดไม่ผ่าน = 404 เดียวกัน', async () => {
  const cases = [
    [world({ updates: [] }), THR_SOURCE],
    [world({ updates: [threadRow({ entityId: 'REQ-OTHER' })] }), THR_SOURCE],
    [world({ updates: [threadRow({ entityType: 'deal' })] }), THR_SOURCE],
    [world({ updates: [threadRow({ deletedAt: T0 })] }), THR_SOURCE],
    [world(), { kind: 'thread', updateId: 'EU-1', index: 5 }],
    [world({ updates: [threadRow({ attachments: [{ fileName: 'a.png' }, { fileUrl: '  ', driveFileId: 'SRC-THR-1', fileName: 'b.png' }] })] }), THR_SOURCE],
    [world({ updates: [threadRow({ attachments: null })] }), THR_SOURCE],
  ];
  for (const [db, source] of cases) {
    const out = await run({ db, source });
    assert.equal(out.status, 404, JSON.stringify(source));
    assert.deepEqual(out.body, { error: N6 });
    noDriveAtAll(out.drive, 'ด่าน 8 thread');
    assert.equal(out.db.calls.filter((q) => q.table === 'upload_receipts').length, 0, 'ยังไม่ถึงด่านที่มา');
  }
  const blind = await run({ source: THR_SOURCE, deps: { canViewThread: async () => false } });
  assert.equal(blind.status, 404);
  assert.deepEqual(blind.body, { error: N6 });
  noDriveAtAll(blind.drive, 'ด่านอ่านเธรด');
});

test('🔴 การอ่านที่พังไม่เปิดด่านไหน: อ่านแถวต้นทางไม่ได้ / ด่านอ่านโยน = 500 — ไม่ถาม Drive ไม่คัดลอก', async () => {
  await quiet(async () => {
    for (const [table, source] of [['attachments', REQ_SOURCE], ['entity_updates', THR_SOURCE]]) {
      const db = world({ hook: (q) => (q.table === table && !q.write ? { data: null, error: { message: 'boom' } } : null) });
      const out = await run({ db, source });
      assert.equal(out.status, 500, table);
      assert.deepEqual(out.body, { error: SURVEY_PLAN_COPY_ERRORS.read });
      noDriveAtAll(out.drive, table);
    }
    for (const [dep, source] of [['canViewRequestFiles', REQ_SOURCE], ['canViewThread', THR_SOURCE]]) {
      const out = await run({ source, deps: { [dep]: async () => { throw new Error('gate down'); } } });
      assert.equal(out.status, 500, dep);
      noDriveAtAll(out.drive, dep);
    }
  });
});

/* ══ ด่าน 8b — ที่มาของไฟล์เธรด ═══════════════════════════════════════════════════════════════ */

test('🔴 ด่าน 8b: ไฟล์เธรดที่ไม่มีใบรับการอัป / ใบรับของคนอื่น = 409 — ไม่ถาม Drive ไม่อ่านไบต์ ไม่คัดลอก', async () => {
  for (const receipts of [[], [receipt('SRC-THR-1', 'U-SOMEONE')], [receipt('SRC-THR-0')]]) {
    const out = await run({ db: world({ receipts }), source: THR_SOURCE });
    assert.equal(out.status, 409);
    assert.deepEqual(out.body, { error: N28 });
    noDriveAtAll(out.drive, 'ด่าน 8b');
  }
  // ข้อความที่ไม่มีผู้โพสต์ (แถวระบบ) = ไม่มีใครให้เทียบใบรับ ⇒ ปฏิเสธ
  const anon = await run({ db: world({ updates: [threadRow({ authorId: null })] }), source: THR_SOURCE });
  assert.deepEqual([anon.status, anon.body.error], [409, N28]);
  noDriveAtAll(anon.drive, 'ไม่มีผู้โพสต์');
});

test('🔴 ด่าน 8b: id ไฟล์ที่ผิดรูป (มีจุลภาค/วงเล็บ · ยาว 201 ตัว) ถูกปฏิเสธก่อนยิงคำถามใบรับ', async () => {
  for (const driveFileId of ['a,b)', 'x'.repeat(201), 'ab.cd', 'a b']) {
    const db = world({
      updates: [threadRow({ attachments: [{ fileUrl: 'https://drive.google.com/x', driveFileId, fileName: 'a.png', mimeType: 'image/png' }] })],
    });
    const out = await run({ db, source: { kind: 'thread', updateId: 'EU-1', index: 0 } });
    assert.equal(out.status, 409, driveFileId.slice(0, 10));
    assert.deepEqual(out.body, { error: N28 });
    assert.equal(db.calls.filter((q) => q.table === 'upload_receipts').length, 0, 'ค่าที่ผิดรูปไม่ถึงตัวกรองของฐาน');
    noDriveAtAll(out.drive, 'id ผิดรูป');
  }
});

test('⭐ ด่าน 8b: ใบรับของผู้โพสต์ที่หมดอายุแล้วยังผ่าน (อายุไม่เกี่ยว — แค่ต้องพิสูจน์ว่าเขาอัปเอง) · ข้อความที่คนอื่นแก้ทีหลังตัดสินจากผู้โพสต์', async () => {
  const old = new Date(NOW - UPLOAD_RECEIPT_TTL_MS - 60_000).toISOString();
  const expired = await run({ db: world({ receipts: [receipt('SRC-THR-1', 'U-AE', old)] }), source: THR_SOURCE });
  assert.equal(expired.status, 201, expired.body.error);
  assert.deepEqual(expired.drive.calls.stream, ['SRC-THR-1']);
  // ใบรับเทียบกับผู้โพสต์ (authorId) ไม่ใช่คนกด และไม่ใช่คนแก้ข้อความ
  const edited = await run({
    db: world({ updates: [threadRow({ authorId: 'U-AE', editedById: 'U-OTHER' })], receipts: [receipt('SRC-THR-1', 'U-AE')] }),
    source: THR_SOURCE,
  });
  assert.equal(edited.status, 201);
  const byEditor = await run({
    db: world({ updates: [threadRow({ authorId: 'U-AE', editedById: 'U-OTHER' })], receipts: [receipt('SRC-THR-1', 'U-OTHER')] }),
    source: THR_SOURCE,
  });
  assert.deepEqual([byEditor.status, byEditor.body.error], [409, N28]);
});

test('🔴 ด่าน 8b: ตรวจใบรับไม่ได้ (query ล้ม · เวลาในแถวอ่านไม่ออก) = 503 ปิดไว้ก่อน — ไม่คัดลอก', async () => {
  const down = world({ hook: (q) => (q.table === 'upload_receipts' && !q.write ? { data: null, error: { message: 'relation missing' } } : null) });
  const out = await run({ db: down, source: THR_SOURCE });
  assert.equal(out.status, 503);
  assert.deepEqual(out.body, { error: N29 });
  noDriveAtAll(out.drive, 'unverifiable');
  const garbled = await run({ db: world({ receipts: [receipt('SRC-THR-1', 'U-AE', 'ไม่ใช่เวลา')] }), source: THR_SOURCE });
  assert.deepEqual([garbled.status, garbled.body.error], [503, N29]);
  noDriveAtAll(garbled.drive, 'เวลาอ่านไม่ออก');
});

test('ไฟล์ของคำร้องไม่ผ่านด่าน 8b — แถวไฟล์แนบเขียนได้ทางเดียวซึ่งตรวจใบรับตอนแนบแล้ว (ไม่มีคำถามใบรับเพิ่ม)', async () => {
  const out = await run({ db: world({ receipts: [] }) });
  assert.equal(out.status, 201, out.body.error);
  assert.equal(out.db.calls.filter((q) => q.table === 'upload_receipts' && !q.write).length, 0);
});

/* ══ ด่าน 9 — ลงเอกสารได้ไหม ═══════════════════════════════════════════════════════════════ */

test('ด่าน 9: เอกสาร Google · PDF · TIFF ที่ตั้งชื่อ .png (Drive บอก image/tiff) · ไฟล์ในถังขยะ · ใหญ่เกินเพดาน = 400 ข้อความของปุ่ม — ไม่คัดลอก', async () => {
  const refuse = async (opts, label, { asksDrive }) => {
    const out = await run(opts);
    assert.equal(out.status, 400, label);
    assert.deepEqual(out.body, { error: BLOCKED }, label);
    nothingCopied(out.drive, label);
    assert.equal(out.drive.calls.meta.length, asksDrive ? 1 : 0, `${label}: ถาม Drive`);
  };
  // เอกสาร Google: แถวไม่มีไบต์ให้คัดลอก (kind) หรือไม่มี id ไฟล์
  await refuse({ db: world({ files: [salesRow({ metadata: { kind: 'gdoc' }, fileName: 'แบบ.png' })] }) }, 'gdoc', { asksDrive: false });
  await refuse({ db: world({ files: [salesRow({ driveFileId: null })] }) }, 'ไม่มี id ไฟล์', { asksDrive: false });
  await refuse({
    db: world({ updates: [threadRow({ attachments: [{ fileUrl: 'https://docs.google.com/document/d/1' , fileName: 'spec' }] })] }),
    source: { kind: 'thread', updateId: 'EU-1', index: 0 },
  }, 'ลิงก์เอกสาร Google ในเธรด', { asksDrive: false });
  // ชนิดของแถวบอกเองว่าไม่ใช่ JPG/PNG — ไม่ต้องถาม Drive
  await refuse({ db: world({ files: [salesRow({ fileName: 'plan.pdf', mimeType: 'application/pdf' })] }) }, 'pdf', { asksDrive: false });
  await refuse({ db: world({ files: [salesRow({ fileName: 'plan.tiff', mimeType: 'image/tiff' })] }) }, 'tiff', { asksDrive: false });
  // แถวบอกว่า PNG แต่ Drive บอกอย่างอื่น — คำตอบของ Drive ชนะ
  await refuse({ drive: fakeDrive({ meta: { '*': { mimeType: 'image/tiff' } } }) }, 'tiff ชื่อ .png', { asksDrive: true });
  await refuse({ drive: fakeDrive({ meta: { '*': { mimeType: 'application/vnd.google-apps.folder' } } }) }, 'โฟลเดอร์', { asksDrive: true });
  await refuse({ drive: fakeDrive({ meta: { '*': { trashed: true } } }) }, 'ถังขยะ', { asksDrive: true });
  await refuse({ drive: fakeDrive({ meta: { '*': { size: '4096' } } }), deps: { maxBytes: 4095 } }, 'ใหญ่เกิน', { asksDrive: true });
  await refuse({ drive: fakeDrive({ meta: { '*': { size: undefined } } }) }, 'Drive ไม่บอกขนาด', { asksDrive: true });
  // ถาม Drive ด้วยช่องที่ต้องใช้เท่านั้น
  const ok = await run();
  assert.deepEqual(ok.drive.calls.meta, [['SRC-REQ-1', 'id, mimeType, size, trashed']]);
});

test('ด่าน 9: ถาม Drive ไม่ได้ = 502 — ไม่เดาว่าไฟล์ใช้ได้ ไม่คัดลอก', async () => {
  await quiet(async () => {
    const out = await run({ drive: fakeDrive({ metaError: new Error('File not found') }) });
    assert.equal(out.status, 502);
    assert.deepEqual(out.body, { error: N7 });
    nothingCopied(out.drive, 'driveCheck');
    // Drive ตอบค่าว่าง = ตรวจไม่ได้เหมือนกัน
    const empty = await run({ deps: { getFileMeta: async () => null } });
    assert.deepEqual([empty.status, empty.body.error], [502, N7]);
  });
});

/* ══ ด่าน 10–11 + สำเร็จ ═════════════════════════════════════════════════════════════════════ */

test('⭐ สำเร็จ · ไฟล์ของคำร้อง: ไบต์ถูกคัดลอกเป็นไฟล์ใหม่ในโฟลเดอร์ของพื้นที่ · ใบรับออกให้คนกดด้วย id ของไฟล์ใหม่ · แถวต้นทางไม่ถูกเขียน', async () => {
  const out = await run();
  assert.equal(out.status, 201, out.body.error);
  assert.deepEqual(out.body, {
    url: 'https://drive.google.com/file/d/COPY-1/view', driveFileId: 'COPY-1', fileName: 'plan-1.png', mimeType: 'image/png',
    sizeBytes: Buffer.byteLength('PNG-bytes-of-SRC-REQ-1'),
  });
  assert.notEqual(out.body.driveFileId, 'SRC-REQ-1');
  assert.deepEqual(out.drive.calls.stream, ['SRC-REQ-1']);
  assert.equal(out.drive.calls.upload.length, 1);
  const up = out.drive.calls.upload[0];
  assert.deepEqual({ ...up, buffer: up.buffer.toString() }, {
    entityType: 'service_survey_zone', entityId: 'SZ1', buffer: 'PNG-bytes-of-SRC-REQ-1', name: 'plan-1.png', mimeType: 'image/png',
  });
  // เขียนอย่างเดียว: ใบรับของไฟล์ใหม่ — ไม่มีแถวไฟล์แนบ ไม่แก้แถวต้นทาง ไม่แตะเธรด
  assert.deepEqual(writesOf(out.db), ['insert upload_receipts']);
  const issued = out.db.tables.upload_receipts.find((r) => r.driveFileId === 'COPY-1');
  assert.deepEqual([issued.userId, issued.entityType, issued.entityId], ['U-HEAD', 'service_survey_zone', 'SZ1']);
  assert.deepEqual(out.db.tables.attachments, [salesRow()]);
  assert.deepEqual(out.drive.calls.deleted, []);
});

test('⭐ สำเร็จ · ไฟล์เธรด: หยิบรายการตามลำดับในข้อความนั้น · ชนิดของไฟล์ใหม่เป็นคำตอบของ Drive · ข้อความเธรดไม่ถูกเขียน', async () => {
  const before = threadRow();
  const out = await run({ source: { kind: 'thread', updateId: 'EU-1', index: 0 }, db: world({ receipts: [receipt('SRC-THR-0')] }), drive: fakeDrive({ meta: { '*': { mimeType: 'image/jpeg' } } }) });
  assert.equal(out.status, 201, out.body.error);
  assert.deepEqual([out.body.fileName, out.body.mimeType, out.body.driveFileId], ['floor.jpg', 'image/jpeg', 'COPY-1']);
  assert.deepEqual(out.drive.calls.stream, ['SRC-THR-0']);
  assert.notEqual(out.body.driveFileId, 'SRC-THR-0');
  assert.deepEqual(writesOf(out.db), ['insert upload_receipts']);
  assert.deepEqual(out.db.tables.entity_updates, [before]);
  // ไฟล์ที่ไม่มีชื่อ = ชื่อกลางตามชนิด
  const unnamed = await run({
    db: world({ updates: [threadRow({ attachments: [{ fileUrl: 'https://drive.google.com/x', driveFileId: 'SRC-THR-0', fileName: null, mimeType: 'image/png' }] })], receipts: [receipt('SRC-THR-0')] }),
    source: { kind: 'thread', updateId: 'EU-1', index: 0 },
  });
  assert.equal(unnamed.body.fileName, 'ภาพแบบ.png');
});

test('ด่าน 10: อ่านไบต์ไม่ได้ / อัปขึ้น Drive ไม่ได้ / Drive ไม่คืน id = 502 — ไม่ออกใบรับ', async () => {
  await quiet(async () => {
    for (const drive of [
      fakeDrive({ streamError: new Error('stream down') }),
      fakeDrive({ uploadError: new Error('quota') }),
      fakeDrive({ uploadResult: {} }),
      fakeDrive({ uploadResult: null }),
    ]) {
      const out = await run({ drive });
      assert.equal(out.status, 502);
      assert.deepEqual(out.body, { error: N8 });
      assert.deepEqual(writesOf(out.db), [], 'ไม่มีใบรับ');
    }
    // ไบต์จริงใหญ่เกินเพดาน (Drive บอกขนาดเล็กกว่าจริง) — หยุดอ่าน ไม่คัดลอก
    const big = await run({ deps: { maxBytes: 5 } , drive: fakeDrive({ meta: { '*': { size: '4' } } }) });
    assert.deepEqual([big.status, big.body.error], [400, BLOCKED]);
    assert.deepEqual(big.drive.calls.upload, []);
  });
});

test('🔴 ด่าน 11: ออกใบรับไม่สำเร็จ = ลบไฟล์ที่เพิ่งคัดลอก แล้วตอบ 503 — ลบไม่ได้ก็ยังตอบ 503 (ไม่โยน)', async () => {
  await quiet(async () => {
    const failing = () => world({ hook: (q) => (q.table === 'upload_receipts' && q.write === 'insert' ? { data: null, error: { message: 'insert failed' } } : null) });
    const out = await run({ db: failing(), deps: { wait: async () => {} } });
    assert.equal(out.status, 503);
    assert.deepEqual(out.body, { error: N8 });
    assert.deepEqual(out.drive.calls.deleted, ['COPY-1'], 'ลบไฟล์ใหม่ ไม่ใช่ไฟล์ต้นทาง');
    assert.equal(out.db.tables.upload_receipts.some((r) => r.driveFileId === 'COPY-1'), false);

    const stuck = await run({ db: failing(), drive: fakeDrive({ deleteError: new Error('drive down') }), deps: { wait: async () => {} } });
    assert.deepEqual([stuck.status, stuck.body.error], [503, N8]);
    // ตัวออกใบรับโยนเอง (สร้าง client ไม่ได้) = ทางเดียวกัน
    const thrown = await run({ deps: { recordUploadReceipt: async () => { throw new Error('no client'); } } });
    assert.deepEqual([thrown.status, thrown.body.error], [503, N8]);
    assert.deepEqual(thrown.drive.calls.deleted, ['COPY-1']);
  });
});

/* ══ ไฟล์ใหม่เป็นอิสระจากไฟล์ต้นทาง ══════════════════════════════════════════════════════════ */

/* supabase ปลอมของเทสต์นี้ — ตัวกลางของชุดไม่รู้จัก `.or` / `.neq` / `.contains` ที่ด่าน "มีที่อื่นถือไฟล์นี้ไหม" ใช้
   ⇒ ตัวนี้ตอบตัวกรองพวกนั้นจริง และจด **ทุกค่าที่ถูกเอ่ยถึง** ไว้ให้ถามย้อนหลัง */
function heldDb(rows) {
  const table = { attachments: rows.map((r) => ({ ...r })) };
  const said = [];
  const from = (name) => {
    const q = { name, tests: [], del: false };
    const run = () => {
      const list = table[name] || [];
      const hit = list.filter((row) => q.tests.every((t) => t(row)));
      if (q.del) table[name] = list.filter((row) => !hit.includes(row));
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const b = {
      select: () => b,
      delete: () => { q.del = true; return b; },
      limit: () => b,
      eq: (col, v) => { said.push(String(v)); q.tests.push((r) => String(r[col]) === String(v)); return b; },
      neq: (col, v) => { said.push(String(v)); q.tests.push((r) => String(r[col]) !== String(v)); return b; },
      in: (col, vs) => { said.push(...vs.map(String)); q.tests.push((r) => vs.map(String).includes(String(r[col]))); return b; },
      or: (expr) => {
        said.push(expr);
        const ids = [...expr.matchAll(/\.eq\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
        q.tests.push((r) => ids.includes(r.driveFileId) || ids.includes(r.metadata?.googleFileId));
        return b;
      },
      contains: (col, needle) => { said.push(String(needle)); q.tests.push(() => false); return b; },
      then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    return b;
  };
  return { from, table, said };
}

test('⭐ สองแถวสองไฟล์: ลบแถวของฝ่ายขาย (ไฟล์ X) หรือแถวภาพแบบ (ไฟล์ Y) ไม่เอ่ยถึง id ไฟล์ของอีกแถวเลย', async () => {
  const sale = salesRow({ id: 'ATT-SALE', driveFileId: 'FILE-X' });
  const plan = { id: 'ATT-PLAN', entityType: 'service_survey_zone', entityId: 'SZ1', docType: 'survey_plan', driveFileId: 'FILE-Y', fileName: 'plan-1.png', mimeType: 'image/png', metadata: null };
  for (const [victim, other] of [[sale, plan], [plan, sale]]) {
    const db = heldDb([sale, plan]);
    const drive = { meta: [], deleted: [] };
    const driveDeps = {
      getFileMeta: async (id) => { drive.meta.push(id); return { id, mimeType: 'image/png', trashed: false }; },
      deleteFile: async (id) => { drive.deleted.push(id); },
    };
    const released = [];
    const res = await deleteAttachmentRows(db, [victim], {
      release: async (att) => { released.push(att.driveFileId); await releaseAttachmentFile(att, { supabase: db, drive: driveDeps }); },
    });
    assert.deepEqual([res.count, res.error], [1, null]);
    assert.deepEqual(released, [victim.driveFileId]);
    assert.deepEqual(drive.deleted, [victim.driveFileId], 'ทิ้งเฉพาะไฟล์ของแถวที่ลบ');
    assert.equal(drive.meta.includes(other.driveFileId), false);
    assert.deepEqual(db.table.attachments.map((r) => r.id), [other.id], 'อีกแถวยังอยู่');
    assert.ok(db.said.some((v) => v.includes(victim.driveFileId)), 'ด่านถามถึงไฟล์ของแถวที่ลบจริง');
    assert.equal(db.said.some((v) => v.includes(other.driveFileId)), false, 'ไม่มีคำสั่งไหนเอ่ยถึงไฟล์ของอีกแถว');
  }
  // ตัวเทียบ: ถ้าสองแถวชี้ไฟล์ใบเดียวกัน (สิ่งที่เส้นคัดลอกทำให้ไม่เกิด) ไฟล์จะไม่ถูกทิ้ง — ด่านนี้คือเหตุที่ต้องคัดลอก
  const shared = heldDb([sale, { ...plan, driveFileId: 'FILE-X' }]);
  const gone = [];
  await quiet(() => deleteAttachmentRows(shared, [sale], { release: async (att) => { gone.push(att.driveFileId); } }));
  assert.deepEqual(gone, []);
});

/* ══ เส้น route ตัวจริง ═════════════════════════════════════════════════════════════════════ */

const call = (db, user, body, params = { id: 'REQ1', zoneId: 'SZ1' }) => callRoute(POST, {
  user, db, method: 'POST', path: `/api/service/surveys/${params.id}/zones/${params.zoneId}/plan-from-sales`, params, body,
});

test('route: ช่าง · ผู้วางคิว = 403 ก่อนแตะฐาน · body ผิดรูป = 400 ก่อนแตะฐาน · ไม่พบใบ / ไม่พบพื้นที่ = 404 · พื้นที่ลงหน้างาน = 409', async () => {
  for (const user of [tech, planner, null]) {
    const db = world();
    const out = await call(db, user, { source: REQ_SOURCE });
    assert.deepEqual([out.status, out.json.error], [403, N1]);
    assert.deepEqual(db.calls, []);
  }
  const shape = world();
  for (const body of [undefined, {}, { source: null }, { source: { kind: 'thread', updateId: 'EU-1', index: -1 } }, []]) {
    const out = await call(shape, head, body);
    assert.deepEqual([out.status, out.json.error], [400, N2], JSON.stringify(body));
  }
  assert.deepEqual(shape.calls, []);
  const missing = await call(world(), head, { source: REQ_SOURCE }, { id: 'NOPE', zoneId: 'SZ1' });
  assert.deepEqual([missing.status, missing.json.error], [404, NO_SHEET]);
  const noZone = await call(world(), head, { source: REQ_SOURCE }, { id: 'REQ1', zoneId: 'NOPE' });
  assert.deepEqual([noZone.status, noZone.json.error], [404, NO_ZONE]);
  // สวิตช์ปิด = ไม่มีแถวไหนเป็นจากแบบ ⇒ ด่าน 7 ปฏิเสธเอง (เส้นนี้ไม่ถามสวิตช์)
  const onsite = await call(world({ zones: [zone({ method: 'onsite' })] }), head, { source: REQ_SOURCE });
  assert.deepEqual([onsite.status, onsite.json.error], [409, N4]);
  const sent = await call(world({ req: { answeredAt: T0, status: 'answered' } }), head, { source: REQ_SOURCE });
  assert.equal(sent.status, 409);
});

test('🔴 route: อ่านใบหรืออ่านแถวพื้นที่ไม่ได้ = 500 ไม่ใช่ 404 และไม่เดินต่อ', async () => {
  for (const table of ['dept_requests', 'service_survey_zones']) {
    const db = world({ hook: (q) => (q.table === table ? { data: null, error: { message: `${table} down` } } : null) });
    const out = await call(db, head, { source: REQ_SOURCE });
    assert.equal(out.status, 500, table);
    assert.equal(db.calls.some((q) => q.table === 'attachments'), false);
  }
});

test('route: เส้นเบา — runtime nodejs · ดึง Drive แบบ dynamic · ไม่เขียนแถวไฟล์แนบ · ด่านสิทธิ์เป็นข้อแรกของ handler', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const route = strip(readFileSync(new URL('../../app/api/service/surveys/[id]/zones/[zoneId]/plan-from-sales/route.js', import.meta.url), 'utf8'));
  assert.match(route, /export const runtime = 'nodejs';/);
  assert.match(route, /export const POST = withUser\(/);
  assert.doesNotMatch(route, /from '@\/lib\/drive'/, 'ห้าม import แบบ static');
  const lib = strip(readFileSync(new URL('./surveyPlanCopy.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(lib, /^import[^\n]*['"]@\/lib\/drive['"]/m);
  assert.match(lib, /await import\('@\/lib\/drive'\)/);
  for (const code of [route, lib]) {
    assert.doesNotMatch(code, /from\('attachments'\)\s*\.\s*(insert|update|upsert|delete)/);
    assert.doesNotMatch(code, /surveyDrawingMethodEnabled|process\.env\.SURVEY/);
  }
  const body = route.slice(route.indexOf('export const POST'));
  assert.ok(body.indexOf('canSendSurveyResult(user)') > 0);
  assert.ok(body.indexOf('canSendSurveyResult(user)') < body.indexOf('.from('), 'สิทธิ์ก่อนแตะฐาน');
  // id ของใบรับมาจากผลของ Drive เสมอ — ไม่ใช่จากคำขอ
  assert.match(lib, /driveFileId: copy\.id, userId: user\.id,/);
});
