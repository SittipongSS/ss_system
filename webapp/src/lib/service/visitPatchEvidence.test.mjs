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

/* supabase ปลอม: จดทุก query · แถวนัดตอบจาก `row` · update ตอบแถวที่รวม patch แล้ว · อื่น ๆ = ว่าง */
function fakeSupabase(row) {
  const calls = [];
  const reply = (q) => {
    const op = (name) => q.ops.find(([n]) => n === name);
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
  return { from, calls, visitUpdates };
}

async function patchAs(user, row, body) {
  const supabase = fakeSupabase(row);
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
const PHOTOS = [{ url: 'https://drive.example/photo-1', name: 'ก่อนทำ', kind: 'before', fileId: 'F-1' }];
const visitRow = (o = {}) => ({
  id: 'V1', code: 'SV-26090001', siteId: 'S1', planId: null, requestId: null, kind: 'refill',
  scheduledDate: TODAY, startTime: '09:00', endTime: '10:00',
  assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', assistantIds: [],
  status: 'scheduled', actualDate: null, actualStartTime: null, actualEndTime: null, actualEndDate: null,
  actualTimeEdited: false, unableReason: null, summary: null, note: null,
  attachments: PHOTOS, customerSignatureUrl: 'https://drive.example/sign-1',
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
});

test('แก้ผลของใบที่ปิดแล้ว (ผู้จัดคิว) ไม่ส่งรูปมา = ไม่แตะรูป · ส่งมา = เขียนตามเดิม (แผ่นปิดงานเดิม)', async () => {
  const closed = visitRow({ status: 'done', actualDate: TODAY, actualStartTime: '09:05', actualEndTime: '09:40' });

  const noteOnly = await patchAs(planner, closed, { note: 'ลูกค้าขอเปลี่ยนกลิ่นรอบหน้า' });
  assert.equal(noteOnly.status, 200, noteOnly.json.error);
  const [a] = noteOnly.supabase.visitUpdates();
  assert.equal(a.note, 'ลูกค้าขอเปลี่ยนกลิ่นรอบหน้า');
  assert.equal('attachments' in a, false);
  assert.equal('customerSignatureUrl' in a, false);

  const nextPhotos = [...PHOTOS, { url: 'https://drive.example/photo-2', name: 'หลังทำ', kind: 'after' }];
  const withEvidence = await patchAs(planner, closed, {
    attachments: nextPhotos, customerSignatureUrl: 'https://drive.example/sign-2',
  });
  assert.equal(withEvidence.status, 200, withEvidence.json.error);
  const [b] = withEvidence.supabase.visitUpdates();
  assert.deepEqual(b.attachments.map((f) => f.url), nextPhotos.map((f) => f.url));
  assert.equal(b.customerSignatureUrl, 'https://drive.example/sign-2');

  // ส่งมาเป็นค่าว่าง = ตั้งใจล้าง (ปุ่มลบลายเซ็น) ไม่ใช่ "ไม่ได้ส่ง"
  const cleared = await patchAs(planner, closed, { customerSignatureUrl: '' });
  const [c] = cleared.supabase.visitUpdates();
  assert.equal(c.customerSignatureUrl, null);
  assert.equal('attachments' in c, false);
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
