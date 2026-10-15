// ── PATCH ของนัดต้องไม่เขียนรูป/ลายเซ็นทับจากแถวที่อ่านไว้ตอนต้นคำขอ (แผน operation-crew C5 · R5 · S1) ──
//
// 🐞 ที่มา: route ประกอบค่าจาก `{...before, ...body}` (`stampVisitInput`) แล้ว `normalizeVisitInput` คืน
//    `attachments` กับ `customerSignatureUrl` **ทุกครั้ง** ⇒ กดรับงาน/ส่งงาน (ซึ่งไม่ได้ส่งรูปมา) เขียนรูปชุดที่อ่านไว้
//    ตอนต้นคำขอกลับลงแถว · รูปที่ผู้ช่วยเพิ่งอัปขึ้นระหว่างนั้นหายเงียบ · ช่องที่ normalize ไม่รู้จัก (เช่น fileId) ก็หลุดด้วย
// ⭐ กติกา: ไม่ส่งคีย์มา = ไม่แตะคอลัมน์ · ส่งมา (แผ่นปิดงานเดิมส่งทั้งสองคีย์) = เขียนตามเดิม
//
// ⚠️ เทสต์ชุดนี้ **เรียก handler PATCH ตัวจริง** ผ่าน supabase ปลอม — ถอดตัวอ่านผู้ใช้กับ client จริงออกด้วย hook
//    และลบ env ของ Supabase ทิ้งก่อน import ⇒ ต่อให้ hook พลาด ก็สร้าง client จริงไม่ได้ (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { businessDate } from '../businessDate.js';
import {
  CREW_CLOSE_STAMP_ERROR, CREW_STATUS_ERROR, DEAD_CLOSE_ERRORS, FUTURE_STAMP_ERROR, IN_PROGRESS_STAMP_ERROR,
} from './crew/jobStart.js';

for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[key];
// สวิตช์ผ่อนด่านใบรับต้องไม่ติดมาจากเครื่องที่รันเทสต์ — ชุดนี้ตรวจโหมดบังคับ
delete process.env.UPLOAD_RECEIPT_MODE;

/* ⚠️ route ลาก `@/lib/http` → authUser (`next/headers` · cookies ของคำขอจริง) + supabaseAdmin
   ⇒ แทนสองโมดูลนั้นด้วยตัวปลอมที่อ่านจาก globalThis (hook ถูกเรียกก่อนตัวแปลง `@/` ของ test-loader) */
register('data:text/javascript,' + encodeURIComponent(`
  const mod = (src) => 'data:text/javascript,' + encodeURIComponent(src);
  const AUTH = mod("export async function getCurrentUser() { return globalThis.__visitRouteTest?.user ?? null; }");
  const ADMIN = mod("export function getSupabaseAdmin() { const s = globalThis.__visitRouteTest?.supabase; if (!s) throw new Error('fake supabase missing'); return s; }");
  export async function resolve(s, c, n) {
    if (s === '@/lib/authUser') return { url: AUTH, shortCircuit: true };
    if (s === '@/lib/supabaseAdmin') return { url: ADMIN, shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));
const { PATCH } = await import('../../app/api/service/visits/[id]/route.js');

/* supabase ปลอม: จดทุก query · แถวนัดตอบจาก `row` · update ตอบแถวที่รวม patch แล้ว · อื่น ๆ = ว่าง
   ทะเบียนใบรับ (`upload_receipts`) ตอบจาก `receipts` = `{ <id ไฟล์>: แถวใบรับ }` · `ledgerError` = อ่านทะเบียนไม่ได้ */
function fakeSupabase(row, { receipts = {}, ledgerError = null } = {}) {
  const calls = [];
  const reply = (q) => {
    const op = (name) => q.ops.find(([n]) => n === name);
    if (q.table === 'upload_receipts') {
      if (op('update')) return { data: null, error: null };
      if (ledgerError) return { data: null, error: ledgerError };
      return { data: receipts[op('eq')?.[2]] ?? null, error: null };
    }
    if (q.table === 'service_visits' && op('update')) return { data: { ...row, ...op('update')[1] }, error: null };
    if (q.table === 'service_visits' && op('maybeSingle')) return { data: row, error: null };
    if (op('single') || op('maybeSingle')) return { data: null, error: null };
    return { data: [], error: null, count: 0 };
  };
  const from = (table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const builder = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return (resolve, reject) => Promise.resolve(reply(q)).then(resolve, reject);
        return (...args) => { q.ops.push([prop, ...args]); return builder; };
      },
    });
    return builder;
  };
  const visitUpdates = () => calls
    .filter((c) => c.table === 'service_visits')
    .map((c) => c.ops.find(([n]) => n === 'update')?.[1])
    .filter(Boolean);
  const receiptCalls = () => calls.filter((c) => c.table === 'upload_receipts');
  // ใบรับที่ถูกถาม (id ไฟล์ ตามลำดับ) · ใบรับที่ถูกประทับ (`[id ไฟล์, claimedBy]`)
  const receiptLookups = () => receiptCalls().filter((c) => !c.ops.some(([n]) => n === 'update'))
    .map((c) => c.ops.find(([n]) => n === 'eq')?.[2]);
  const receiptClaims = () => receiptCalls().filter((c) => c.ops.some(([n]) => n === 'update'))
    .map((c) => [c.ops.find(([n]) => n === 'eq')?.[2], c.ops.find(([n]) => n === 'update')[1].claimedBy]);
  return { from, calls, visitUpdates, receiptCalls, receiptLookups, receiptClaims };
}

async function patchAs(user, row, body, ledger) {
  const supabase = fakeSupabase(row, ledger);
  globalThis.__visitRouteTest = { user, supabase };
  const req = new Request(`http://localhost/api/service/visits/${row.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await PATCH(req, { params: Promise.resolve({ id: row.id }) });
  return { status: res.status, json: await res.json(), supabase };
}

const TODAY = businessDate();
const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const tech = { id: 'U-TECH', name: 'ช่างเอ', role: 'ts', department: 'TS' };
const planner = { id: 'U-PLAN', name: 'ผู้จัดคิว', role: 'ts_planner', department: 'TS' };
/* ลิงก์รูปร่างเดียวกับที่ Drive คืนตอนอัป (`webViewLink`) — ด่านที่มาของไฟล์รับเฉพาะลิงก์ที่ชี้ไฟล์ Drive ใบเดียว */
const drive = (fileId) => `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
const ID = {
  photo1: '1PhotoBeforeAAAAAAA', sign1: '1SignStoredBBBBBBBB', photo2: '1PhotoAfterCCCCCCCC', sign2: '1SignFreshDDDDDDDDD',
};
const PHOTOS = [{ url: drive(ID.photo1), name: 'ก่อนทำ', kind: 'before', fileId: 'F-1' }];
const visitRow = (o = {}) => ({
  id: 'V1', code: 'SV-26090001', siteId: 'S1', planId: null, requestId: null, kind: 'refill',
  scheduledDate: TODAY, startTime: '09:00', endTime: '10:00',
  assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', assistantIds: [],
  status: 'scheduled', actualDate: null, actualStartTime: null, actualEndTime: null, actualEndDate: null,
  actualTimeEdited: false, unableReason: null, summary: null, note: null,
  attachments: PHOTOS, customerSignatureUrl: drive(ID.sign1),
  updatedAt: '2026-09-28T01:00:00.000Z',
  ...o,
});

test('🔴 กดรับงาน (ไม่ส่งรูปมา) = ไม่แตะคอลัมน์รูปและลายเซ็นเลย', async () => {
  const { status, json, supabase } = await patchAs(tech, visitRow(), { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 200, json.error);
  const [update] = supabase.visitUpdates();
  assert.ok(update, 'ต้องเขียนแถวนัด');
  assert.equal(update.status, 'in_progress');
  assert.ok(update.actualStartTime, 'ประทับเวลาเริ่มที่ server');
  assert.equal('attachments' in update, false, 'รูปที่ผู้ช่วยอัประหว่างคำขอต้องไม่ถูกทับ');
  assert.equal('customerSignatureUrl' in update, false);
  assert.deepEqual(supabase.receiptCalls(), [], 'คำขอที่ไม่แตะรูป/ลายเซ็นต้องไม่ถามทะเบียนใบรับเลย');
});

test('แก้ผลของใบที่ปิดแล้ว (ผู้จัดคิว) ไม่ส่งรูปมา = ไม่แตะรูป · ส่งมา = เขียนตามเดิม (แผ่นปิดงานเดิม)', async () => {
  const closed = visitRow({ status: 'done', actualDate: TODAY, actualStartTime: '09:05', actualEndTime: '09:40' });

  const noteOnly = await patchAs(planner, closed, { note: 'ลูกค้าขอเปลี่ยนกลิ่นรอบหน้า' });
  assert.equal(noteOnly.status, 200, noteOnly.json.error);
  const [a] = noteOnly.supabase.visitUpdates();
  assert.equal(a.note, 'ลูกค้าขอเปลี่ยนกลิ่นรอบหน้า');
  assert.equal('attachments' in a, false);
  assert.equal('customerSignatureUrl' in a, false);

  const nextPhotos = [...PHOTOS, { url: drive(ID.photo2), name: 'หลังทำ', kind: 'after' }];
  const withEvidence = await patchAs(planner, closed, {
    attachments: nextPhotos, customerSignatureUrl: drive(ID.sign2),
  }, { receipts: { [ID.photo2]: receipt(ID.photo2, planner), [ID.sign2]: receipt(ID.sign2, planner) } });
  assert.equal(withEvidence.status, 200, withEvidence.json.error);
  const [b] = withEvidence.supabase.visitUpdates();
  assert.deepEqual(b.attachments.map((f) => f.url), nextPhotos.map((f) => f.url));
  assert.equal(b.customerSignatureUrl, drive(ID.sign2));

  // ส่งมาเป็นค่าว่าง = ตั้งใจล้าง (ปุ่มลบลายเซ็น) ไม่ใช่ "ไม่ได้ส่ง"
  const cleared = await patchAs(planner, closed, { customerSignatureUrl: '' });
  const [c] = cleared.supabase.visitUpdates();
  assert.equal(c.customerSignatureUrl, null);
  assert.equal('attachments' in c, false);
});

/* ═══ ด่านที่มาของรูป/ลายเซ็น (รอบสองของมติเจ้าของ 08/10/2569 · docs/upload-receipts.md) ═══
   🐞 เดิม PATCH เก็บ URL อะไรก็ได้ แล้ว `visits/[id]/file` สตรีมไฟล์ตาม id ในสตริงนั้น — ทุกเคส "ต้องไม่ผ่าน" ข้างล่างเคยได้ 200 */
const HOUR_MS = 60 * 60 * 1000;
function receipt(driveFileId, owner, o = {}) {
  return {
    driveFileId, userId: owner.id, entityType: 'service_visit', entityId: 'V1',
    createdAt: new Date(Date.now() - HOUR_MS).toISOString(), claimedBy: null, claimedAt: null, ...o,
  };
}
const RETRY_TAIL = ' — ปิดแล้วเปิดแผ่นปิดงานใหม่ แล้วแนบไฟล์นั้นอีกครั้ง';
const SHAPE_HEAD = 'ไฟล์แนบต้องเป็นไฟล์ที่อัปโหลดผ่านระบบ';
const RECEIPT_HEAD = 'ไฟล์นี้ไม่ได้มาจากการอัปโหลดของคุณในช่วง 24 ชั่วโมงที่ผ่านมา';
const IN_USE_HEAD = 'ไฟล์นี้ถูกใช้กับรายการอื่นไปแล้ว';
const NEW_PHOTO = { url: drive(ID.photo2), name: 'หลังทำ.jpg', kind: 'after' };
const running = () => visitRow({ status: 'in_progress', actualDate: TODAY, actualStartTime: '08:55' });
const turnedAway = async (body, ledger, { status = 400, error, code = 'file_ref' }) => {
  const res = await patchAs(tech, running(), body, ledger);
  assert.equal(res.status, status, JSON.stringify(res.json));
  assert.equal(res.json.error, error);
  assert.equal(res.json.code ?? null, code);
  assert.deepEqual(res.supabase.visitUpdates(), [], 'ต้องไม่เขียนแถว');
  assert.deepEqual(res.supabase.receiptClaims(), [], 'ต้องไม่ประทับใบรับ');
  assert.equal(res.supabase.calls.some((c) => c.table === 'audit_logs'), false, 'ต้องไม่ลง audit');
  return res;
};

test('⭐ รูป/ลายเซ็นใหม่ที่มีใบรับของคนเรียกเอง = เขียนได้ แล้วประทับใบรับด้วยนัดนี้ · ตัวที่เก็บอยู่แล้วไม่ถูกถาม', async () => {
  const { status, json, supabase } = await patchAs(tech, running(), {
    attachments: [...PHOTOS, NEW_PHOTO], customerSignatureUrl: drive(ID.sign2),
  }, { receipts: { [ID.photo2]: receipt(ID.photo2, tech), [ID.sign2]: receipt(ID.sign2, tech) } });
  assert.equal(status, 200, json.error);
  const [update] = supabase.visitUpdates();
  assert.deepEqual(update.attachments.map((f) => f.url), [PHOTOS[0].url, NEW_PHOTO.url]);
  assert.equal(update.customerSignatureUrl, drive(ID.sign2));
  assert.deepEqual(supabase.receiptLookups(), [ID.photo2, ID.sign2], 'ถามเฉพาะไฟล์ใหม่ ตัวละครั้ง');
  assert.deepEqual(supabase.receiptClaims(), [[ID.photo2, 'service_visits:V1'], [ID.sign2, 'service_visits:V1']]);
  // ประทับหลังเขียนแถวเท่านั้น
  const order = supabase.calls.map((c) => `${c.table}:${c.ops.some(([n]) => n === 'update') ? 'update' : 'read'}`);
  assert.ok(order.indexOf('service_visits:update') < order.indexOf('upload_receipts:update'));
  assert.ok(order.lastIndexOf('upload_receipts:read') < order.indexOf('service_visits:update'));
});

test('ส่งชุดที่นัดเก็บอยู่แล้วกลับมาทั้งชุด (แผ่นปิดงานกดบันทึกซ้ำ) = ผ่านโดยไม่ถามทะเบียนใบรับ แม้ทะเบียนอ่านไม่ได้', async () => {
  const { status, json, supabase } = await patchAs(tech, running(), {
    attachments: PHOTOS, customerSignatureUrl: drive(ID.sign1), note: 'เติมน้ำหอมครบ',
  }, { ledgerError: { message: 'relation "upload_receipts" does not exist' } });
  assert.equal(status, 200, json.error);
  assert.equal(supabase.visitUpdates()[0].customerSignatureUrl, drive(ID.sign1));
  assert.deepEqual(supabase.receiptCalls(), []);
});

test('🔴 ไม่มีใบรับ · ใบรับของคนอื่น · ใบรับหมดอายุ = 400 บอกช่างว่าไฟล์ไหนและต้องทำอะไร · ไม่เขียนอะไรเลย', async () => {
  const body = { attachments: [...PHOTOS, NEW_PHOTO] };
  const error = `รูป "หลังทำ.jpg": ${RECEIPT_HEAD}${RETRY_TAIL}`;
  await turnedAway(body, {}, { error });
  await turnedAway(body, { receipts: { [ID.photo2]: receipt(ID.photo2, planner) } }, { error });
  const stale = new Date(Date.now() - 25 * HOUR_MS).toISOString();
  await turnedAway(body, { receipts: { [ID.photo2]: receipt(ID.photo2, tech, { createdAt: stale }) } }, { error });
  // ลายเซ็นถูกเรียกด้วยชื่อของมันเอง · รูปที่ผ่านแล้วในคำขอเดียวกันก็ไม่ถูกเขียน/ประทับ
  await turnedAway(
    { attachments: [...PHOTOS, NEW_PHOTO], customerSignatureUrl: drive(ID.sign2) },
    { receipts: { [ID.photo2]: receipt(ID.photo2, tech) } },
    { error: `ลายเซ็นลูกค้า: ${RECEIPT_HEAD}${RETRY_TAIL}` },
  );
});

test('🔴 ใบรับที่ระเบียนอื่นใช้ไปแล้ว = 400 · ใบรับที่นัดนี้ประทับไว้เอง (คำตอบรอบแรกหาย แถวถูกแก้กลับ) = ผ่าน ไม่ประทับซ้ำ', async () => {
  const body = { attachments: [...PHOTOS, NEW_PHOTO] };
  for (const claimedBy of ['service_visits:V2', 'attachments:ATT-1']) {
    await turnedAway(body, { receipts: { [ID.photo2]: receipt(ID.photo2, tech, { claimedBy }) } },
      { error: `รูป "หลังทำ.jpg": ${IN_USE_HEAD}${RETRY_TAIL}` });
  }
  // ประทับโดยนัดนี้: ผ่านแม้ใบรับหมดอายุและเป็นของผู้ช่วยที่อัป
  const stale = new Date(Date.now() - 72 * HOUR_MS).toISOString();
  const own = await patchAs(tech, running(), body, {
    receipts: { [ID.photo2]: receipt(ID.photo2, planner, { claimedBy: 'service_visits:V1', createdAt: stale }) },
  });
  assert.equal(own.status, 200, own.json.error);
  assert.deepEqual(own.supabase.visitUpdates()[0].attachments.map((f) => f.url), [PHOTOS[0].url, NEW_PHOTO.url]);
  assert.deepEqual(own.supabase.receiptClaims(), []);
});

test('🔴 ลิงก์ที่ไม่ใช่ไฟล์ Drive ใบเดียว และนัดนี้ไม่ได้เก็บอยู่ = 400 โดยไม่ถามทะเบียนใบรับสักตัว', async () => {
  const error = `รูป "สัญญา.pdf": ${SHAPE_HEAD}${RETRY_TAIL}`;
  const ledger = { receipts: { [ID.photo2]: receipt(ID.photo2, tech) } };
  for (const url of [
    'https://drive.example/photo-9',
    'https://evil.example/file/d/1VictimFileEEEEEEEE/view',
    `https://drive.google.com/open?id=1VictimFileEEEEEEEE&x=/d/${ID.photo2}`,
    '/api/service/visits/V2/file?h=abc',
  ]) {
    // รูปใหม่ที่มีใบรับถูกต้องมาก่อนในคำขอเดียวกัน — ก็ต้องไม่ถูกถาม
    const res = await turnedAway({ attachments: [NEW_PHOTO, { url, name: 'สัญญา.pdf', kind: 'other' }] }, ledger, { error });
    assert.deepEqual(res.supabase.receiptCalls(), [], url);
  }
  await turnedAway({ customerSignatureUrl: 'https://drive.example/sign-9' }, ledger,
    { error: `ลายเซ็นลูกค้า: ${SHAPE_HEAD}${RETRY_TAIL}` });
  // ไฟล์ใบเดียวกันสองครั้งในคำขอเดียว (รูป + ลายเซ็น) = ใบรับใบเดียวใช้สองที่ไม่ได้
  await turnedAway({ attachments: [NEW_PHOTO], customerSignatureUrl: NEW_PHOTO.url }, ledger,
    { error: `ลายเซ็นลูกค้า: ${SHAPE_HEAD}${RETRY_TAIL}` });
});

test('🔴 อ่านทะเบียนใบรับไม่ได้ = 503 ไม่ติด code (ไฟล์เดิมกดบันทึกซ้ำได้) · ไม่เขียนอะไรเลย', async () => {
  await turnedAway({ attachments: [...PHOTOS, NEW_PHOTO] }, { ledgerError: { message: 'connection reset' } }, {
    status: 503, code: null, error: 'รูป "หลังทำ.jpg": ตรวจที่มาของไฟล์ไม่ได้ในขณะนี้ — ลองแนบอีกครั้ง',
  });
});

/* ═══ ด่านรับงานต่อสายถึง handler จริง (ตรรกะเต็มอยู่ที่ crew/jobStart.test.mjs) ═══ */
test('🔴 รับงานของวันข้างหน้า = 409 และไม่มีการเขียนใด ๆ', async () => {
  const { status, json, supabase } = await patchAs(tech, visitRow({ scheduledDate: addDays(TODAY, 1) }),
    { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 409);
  assert.equal(json.error, FUTURE_STAMP_ERROR);
  assert.deepEqual(supabase.visitUpdates(), []);
});

test('⭐ กดรับงานซ้ำบนใบที่กำลังทำ = 200 พร้อมแถวเดิม · ไม่เขียนแถว ไม่ลง audit', async () => {
  const running = visitRow({ status: 'in_progress', actualDate: TODAY, actualStartTime: '08:55' });
  const { status, json, supabase } = await patchAs(tech, running, { status: 'in_progress', stamp: 'start' });
  assert.equal(status, 200, json.error);
  assert.equal(json.visit.actualStartTime, '08:55', 'เวลาเริ่มของคนแรกต้องคงเดิม');
  assert.deepEqual(supabase.visitUpdates(), []);
  assert.equal(supabase.calls.some((c) => c.table === 'audit_logs'), false);
});

/* ═══ คำขอที่ไม่ส่ง stamp ต้องโดนด่านเดียวกัน (รีวิว S1 28/09) — ทุกเคสเคยได้ 200 ผ่าน handler จริง ═══ */
const refused = async (user, row, body, code, error) => {
  const { status, json, supabase } = await patchAs(user, row, body);
  assert.equal(status, code, `${JSON.stringify(body)} → ${json.error}`);
  assert.equal(json.error, error);
  assert.deepEqual(supabase.visitUpdates(), [], 'ต้องไม่เขียนแถว');
  assert.equal(supabase.calls.some((c) => c.table === 'audit_logs'), false, 'ต้องไม่ลง audit');
};
const AHEAD = addDays(TODAY, 3);

test('🔴 {status:in_progress} ไม่มี stamp = 409 ทุกตำแหน่ง — ของอีกสามวัน · ใบที่ยกเลิกของวันนี้', async () => {
  for (const user of [tech, planner]) {
    await refused(user, visitRow({ scheduledDate: AHEAD }), { status: 'in_progress' }, 409, IN_PROGRESS_STAMP_ERROR);
    await refused(user, visitRow({ status: 'cancelled' }), { status: 'in_progress' }, 409, IN_PROGRESS_STAMP_ERROR);
  }
});

test('🔴 ช่างปิดงานล่วงหน้าโดยไม่ส่ง stamp = 409 (closeFromAssets · ทำไม่ได้) · วันนี้ก็ต้องมาทางปุ่มส่งงาน', async () => {
  const ahead = visitRow({ scheduledDate: AHEAD });
  await refused(tech, ahead, { closeFromAssets: true, status: 'done' }, 409, FUTURE_STAMP_ERROR);
  await refused(tech, ahead, { status: 'unable', unableReason: 'ไปถึงแล้วร้านปิด ไม่มีคนเปิดให้' }, 409, FUTURE_STAMP_ERROR);
  await refused(tech, visitRow(), { status: 'unable', unableReason: 'ไปถึงแล้วร้านปิด ไม่มีคนเปิดให้' }, 409, CREW_CLOSE_STAMP_ERROR);
});

test('🔴 stamp:end + ทำไม่ได้ บนนัดที่เลื่อนแล้วของวันข้างหน้า = 409 (เดิมกิ่ง end ถามแค่ scheduled)', async () => {
  await refused(tech, visitRow({ status: 'rescheduled', scheduledDate: AHEAD }),
    { stamp: 'end', status: 'unable', unableReason: 'ไปถึงแล้วร้านปิด ไม่มีคนเปิดให้' }, 409, DEAD_CLOSE_ERRORS.rescheduled);
});

test('🔴 ช่างตั้งนัดของตัวเองเป็นยกเลิก/เลื่อนแล้ว = 403', async () => {
  for (const status of ['cancelled', 'rescheduled']) {
    await refused(tech, visitRow(), { status }, 403, CREW_STATUS_ERROR);
  }
});

test('ทางที่ต้องใช้ได้ยังได้: ช่างกดส่งงาน "ทำไม่ได้" วันนี้ · ผู้จัดคิวปิด "ทำไม่ได้" ด้วยมือบนนัดวันข้างหน้า', async () => {
  const crewEnd = await patchAs(tech, visitRow(),
    { stamp: 'end', status: 'unable', unableReason: 'ไปถึงแล้วร้านปิด ไม่มีคนเปิดให้' });
  assert.equal(crewEnd.status, 200, crewEnd.json.error);
  const [a] = crewEnd.supabase.visitUpdates();
  assert.equal(a.status, 'unable');
  assert.ok(a.actualEndTime, 'เวลาจบประทับที่ server');

  const manual = await patchAs(planner, visitRow({ scheduledDate: AHEAD }),
    { status: 'unable', unableReason: 'ลูกค้าแจ้งปิดสาขาถาวรแล้ว' });
  assert.equal(manual.status, 200, manual.json.error);
  assert.equal(manual.supabase.visitUpdates()[0].status, 'unable');
});
