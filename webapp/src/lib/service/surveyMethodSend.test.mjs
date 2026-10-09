// ── เส้นส่งผลที่รู้จักวิธีประเมินรายพื้นที่ (ประเมินจากแบบ · งวด S1 · mig 0408) ─────────────
//
// ⭐ ล็อกหกเรื่อง:
//   ① `surveySendVisitStep` ต้องได้ `needsVisit` เสมอ (ลืมส่ง = โยน) · ใบงานโต๊ะ (ไม่ต้องมีนัด) ไม่ปิดนัดที่ยังไม่มีใครไป
//   ② `surveySendWrites` ตอบใบแบบมีเงื่อนไข `updatedAt` — วิธีประเมินถูกสลับระหว่าง "อ่านด่าน" กับ "ตอบใบ" = 409 ไม่ใช่ตอบด้วยด่านเก่า
//   ③ ด่านแถว 17a (`surveySendSiteVisitError`) — พื้นที่ลงหน้างานต้องมีนัดที่เข้าพื้นที่จริง
//   ④ route ส่งผล: ด่าน 17a ทำงานเฉพาะตอนเปิดสวิตช์ `SURVEY_DRAWING_METHOD` · ปิด = ไม่อ่านอะไรเพิ่มเลย
//   ⑤ สวิตช์เปิดได้ด้วยคำเดียว (`on`)
//   ⑥ การ์ดควบคุมถามตัวตัดสินตัวเดียวกับ route — และใบลงหน้างานล้วนได้ผลเท่าเดิมทุกคีย์
//
// 🔴 เทสต์ของ route **เรียก handler POST ตัวจริง** กับของปลอมทั้งหมด (ท่าเดียวกับ `surveySendRoute.test.mjs`) —
//    ตัวอ่านผู้ใช้ · client · `lib/drive` ถูกแทนด้วย hook และ env ของ Supabase ถูกลบก่อน import (dev DB = prod DB)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { surveyControlView as controlView } from './surveyControl.js';
import { surveyDrawingMethodEnabled } from './surveyDrawingFlag.js';
import { surveyMethodMix, surveyNeedsVisit } from './surveyMethod.js';
import { surveySendSiteVisitError, surveySendVisitStep, surveySendWrites } from './surveySendClose.js';
import { surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';

for (const key of [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_ENV', 'SURVEY_REPORT_ISSUE_AT_SEND', 'SURVEY_DRAWING_METHOD',
]) delete process.env[key];

const WEBAPP = process.cwd();
const dataUrl = (src) => `data:text/javascript,${encodeURIComponent(src)}`;

/* โมดูลปลอมของ route — อ่านของปลอมจาก `globalThis.__methodSendTest` (hook นี้ถูกเรียกก่อนตัวแปลง `@/` ของ test-loader)
   ⚠️ `lib/drive` โยนเสมอ: เทสต์ชุดนี้ไม่เปิดสวิตช์ออกเอกสารตอนส่งผล ⇒ ไม่มีเส้นไหนควรไปถึง Drive */
const STUBS = {
  '@/lib/authUser': dataUrl('export async function getCurrentUser() { return globalThis.__methodSendTest?.user ?? null; }'),
  '@/lib/supabaseAdmin': dataUrl(`export function getSupabaseAdmin() {
    const s = globalThis.__methodSendTest?.supabase;
    if (!s) throw new Error('fake supabase missing');
    return s;
  }`),
  '@/lib/drive': dataUrl('export async function getFileStream() { throw new Error("fake drive: not expected in this suite"); }'),
};
register(dataUrl(`
  const STUBS = ${JSON.stringify(STUBS)};
  export async function resolve(s, c, n) {
    if (Object.hasOwn(STUBS, s)) return { url: STUBS[s], shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));
const { POST } = await import('../../app/api/service/surveys/[id]/send/route.js');

const TODAY = '2026-09-24';
const NOW = '2026-09-24T08:00:00.000Z';
const visit = (over = {}) => ({
  id: 'SVV-1', code: 'SV-2609001', requestId: 'DR-1', kind: 'survey', status: 'in_progress',
  scheduledDate: '2026-09-22', actualDate: '2026-09-22', actualStartTime: '14:05:00', actualEndTime: null,
  ...over,
});
const DRAFT_TEXT = 'นัด SV-2609001 ยังเป็นร่าง (ยังไม่ขึ้นตารางช่าง) — ปล่อยขึ้นตารางหรือยกเลิกนัดที่หน้าจัดคิวก่อน แล้วค่อยส่งผล';
const deskText = (code) => `ใบนี้ประเมินจากแบบทั้งใบ แต่นัด ${code} ยังเปิดอยู่ — กด “เปลี่ยนวิธีประเมิน” แล้วยืนยันยกเลิกนัดก่อนส่งผล (ระบบจะไม่ปิดนัดที่ยังไม่มีใครไปเป็น “เข้าแล้ว” ให้)`;
const CHANGED_TEXT = 'วิธีประเมินของใบเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วตรวจอีกครั้ง';
const ANSWERED_TEXT = 'ใบนี้ถูกส่งผลไปแล้ว — โหลดหน้าใหม่เพื่อดูผลล่าสุด';

/* ══ 1. สวิตช์ ═══════════════════════════════════════════════════════════════ */

test('สวิตช์ SURVEY_DRAWING_METHOD เปิดได้ด้วยคำว่า on คำเดียว — ค่าอื่น/ว่าง/ไม่ตั้ง = ปิด', () => {
  const before = process.env.SURVEY_DRAWING_METHOD;
  try {
    for (const [value, expected] of [
      ['on', true], [' ON ', true], ['On', true],
      ['1', false], ['true', false], ['yes', false], ['off', false], ['onn', false], ['', false], ['   ', false],
    ]) {
      process.env.SURVEY_DRAWING_METHOD = value;
      assert.equal(surveyDrawingMethodEnabled(), expected, JSON.stringify(value));
    }
    delete process.env.SURVEY_DRAWING_METHOD;
    assert.equal(surveyDrawingMethodEnabled(), false, 'ไม่ตั้ง = ปิด');
  } finally {
    if (before === undefined) delete process.env.SURVEY_DRAWING_METHOD;
    else process.env.SURVEY_DRAWING_METHOD = before;
  }
});

/* ══ 2. ตัวตัดสิน "ส่งผลแล้วนัดเป็นยังไง" ═════════════════════════════════════════════ */

test('🔑 surveySendVisitStep: needsVisit × สถานะนัด — ใบต้องมีนัด = เหมือนเดิม · ใบงานโต๊ะไม่ปิดนัดที่ยังไม่มีใครไป', () => {
  const CLOSE_STARTED = { status: 'done', actualDate: '2026-09-22' };
  const table = [
    // [needsVisit, สถานะนัด (null = ไม่มีนัด), action, ข้อความตีกลับ]
    [true, null, 'none', null],
    [true, 'draft', 'block', DRAFT_TEXT],
    [true, 'scheduled', 'close', null],
    [true, 'in_progress', 'close', null],
    [true, 'done', 'none', null],
    [true, 'partial', 'none', null],
    [true, 'unable', 'none', null],
    [true, 'cancelled', 'none', null],
    [true, 'rescheduled', 'none', null],
    [false, null, 'none', null],
    [false, 'draft', 'block', deskText('SV-2609001')],
    [false, 'scheduled', 'block', deskText('SV-2609001')],
    [false, 'in_progress', 'close', null],
    [false, 'done', 'none', null],
    [false, 'partial', 'none', null],
    [false, 'unable', 'none', null],
    [false, 'cancelled', 'none', null],
    [false, 'rescheduled', 'none', null],
  ];
  for (const [needsVisit, status, action, error] of table) {
    const row = status ? visit({ status }) : null;
    const step = surveySendVisitStep(row, { today: TODAY, needsVisit });
    const label = `needsVisit=${needsVisit} · ${status}`;
    assert.equal(step.action, action, label);
    assert.equal(step.error ?? null, error, label);
    if (action === 'none') assert.deepEqual(step, { action: 'none', visit: row }, label);
    if (action === 'block') assert.deepEqual(Object.keys(step).sort(), ['action', 'error', 'visit'], label);
    if (action === 'close') assert.deepEqual(step, { action: 'close', visit: row, patch: CLOSE_STARTED }, label);
  }
});

test('ใบงานโต๊ะ + นัดกำลังทำ: ปิดด้วย patch ชุดเดียวกับใบที่ต้องมีนัด (ช่างไปถึงไซต์แล้วจริง)', () => {
  const cases = [
    visit(),
    visit({ actualDate: null, actualStartTime: null, scheduledDate: '2026-09-20' }),
    visit({ actualDate: null, actualStartTime: null, scheduledDate: '2026-09-30' }),
  ];
  for (const row of cases) {
    assert.deepEqual(
      surveySendVisitStep(row, { today: TODAY, needsVisit: false }),
      surveySendVisitStep(row, { today: TODAY, needsVisit: true }),
    );
  }
});

test('ข้อความตีกลับของใบงานโต๊ะบอกรหัสนัด — ไม่มีรหัส = id · ไม่มีทั้งคู่ = "นัด"', () => {
  const noCode = surveySendVisitStep(visit({ status: 'scheduled', code: null }), { today: TODAY, needsVisit: false });
  assert.equal(noCode.error, deskText('SVV-1'));
  const bare = surveySendVisitStep({ status: 'draft' }, { today: TODAY, needsVisit: false });
  assert.equal(bare.error, deskText('นัด'));
});

test('🔴 ลืมส่ง needsVisit = โยน TypeError ทันที (ผู้เรียกที่ลืมต้องแดงในเทสต์ ไม่ใช่เดาเป็น "ต้องมีนัด")', () => {
  const calls = [
    () => surveySendVisitStep(visit()),
    () => surveySendVisitStep(visit(), {}),
    () => surveySendVisitStep(visit(), { today: TODAY }),
    () => surveySendVisitStep(visit(), { today: TODAY, needsVisit: undefined }),
    () => surveySendVisitStep(visit(), { today: TODAY, needsVisit: null }),
    () => surveySendVisitStep(visit(), { today: TODAY, needsVisit: 'true' }),
    () => surveySendVisitStep(visit(), { today: TODAY, needsVisit: 1 }),
    // ไม่มีนัดก็ยังต้องส่ง — ตรวจก่อนอ่านนัด ไม่งั้นผู้เรียกที่ลืมจะเขียวจนวันที่มีนัดค้าง
    () => surveySendVisitStep(null, { today: TODAY }),
    () => surveySendVisitStep(null),
  ];
  for (const call of calls) assert.throws(call, (e) => e instanceof TypeError && /needsVisit/.test(e.message));
});

/* ══ 3. ลำดับการเขียนของปุ่มส่งผล ═══════════════════════════════════════════════════ */

/* supabase ปลอม — จดทุกคำสั่งพร้อม **ตัวกรองที่ผู้เรียกใส่** (เนื้อของเทสต์ชุดนี้คือ "คำสั่งตอบใบมีเงื่อนไข updatedAt ไหม")
   · `failReadOn` ทำให้คำสั่งอ่านของตารางนั้นล้ม (supabase ไม่ throw — คืน `{ error }`) */
function fakeSupabase(seed, { failReadOn = [] } = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  const calls = [];
  const from = (table) => {
    const state = { op: 'select', cols: null, filters: [], patch: null, returning: false, single: false };
    const keep = (row) => state.filters.every(([op, col, val]) => {
      if (op === 'eq') return row[col] === val;
      if (op === 'in') return val.includes(row[col]);
      return (row[col] ?? null) === val;
    });
    const run = () => {
      const hit = (tables[table] || []).filter(keep);
      calls.push({ table, op: state.op, cols: state.cols, patch: state.patch, filters: state.filters.map((f) => [...f]) });
      if (state.op === 'select' && failReadOn.includes(table)) return { data: null, error: { message: `boom read ${table}` } };
      if (state.op === 'update') {
        for (const row of hit) Object.assign(row, state.patch);
        const out = hit.map((r) => ({ ...r }));
        if (state.single) return { data: out[0] || null, error: null };
        return { data: state.returning ? out : null, error: null };
      }
      if (state.single) return { data: hit[0] ? { ...hit[0] } : null, error: null };
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const builder = {
      select(cols) { state.returning = true; if (state.op === 'select') state.cols = cols ?? null; return builder; },
      update(patch) { state.op = 'update'; state.patch = patch; return builder; },
      eq(col, v) { state.filters.push(['eq', col, v]); return builder; },
      in(col, vs) { state.filters.push(['in', col, vs]); return builder; },
      is(col, v) { state.filters.push(['is', col, v]); return builder; },
      maybeSingle() { state.single = true; return builder; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return builder;
  };
  return { from, calls, tables };
}
const updates = (calls) => calls.filter((c) => c.op === 'update');
const UPDATED = '2026-09-24T07:30:00.123456+00:00';
const answerPatch = { answeredAt: NOW, answeredById: 'U-1', answeredByName: 'หัวหน้า', status: 'answered', updatedAt: NOW };
const requestRow = (over = {}) => ({
  id: 'DR-1', status: 'acknowledged', answeredAt: null, closedAt: null, updatedAt: UPDATED, ...over,
});
const sendArgs = (over = {}) => ({
  requestId: 'DR-1', open: null, closeVisitId: null, answerPatch, today: TODAY, nowIso: NOW, needsVisit: true, ...over,
});

test('🔴 ใบงานโต๊ะ + นัดยังนัดไว้/ร่าง = 409 พร้อมทางออก · ไม่เขียนอะไรเลย (ไม่ปิดนัดเป็น "เข้าแล้ว" ให้)', async () => {
  for (const status of ['scheduled', 'draft']) {
    const open = visit({ status, actualDate: null, actualStartTime: null });
    const db = fakeSupabase({ service_visits: [open], dept_requests: [requestRow()] });
    const out = await surveySendWrites(db, sendArgs({ open, closeVisitId: 'SVV-1', needsVisit: false, expectUpdatedAt: UPDATED }));
    assert.deepEqual(out, { error: deskText('SV-2609001'), status: 409 }, status);
    assert.deepEqual(db.calls, [], 'ตีกลับก่อนแตะฐาน');
    assert.equal(db.tables.service_visits[0].status, status);
    assert.equal(db.tables.dept_requests[0].answeredAt, null);
  }
});

const CLAIM_FILTERS = [['eq', 'id', 'DR-1'], ['is', 'answeredAt', null], ['eq', 'updatedAt', UPDATED]];
const ANSWER_FILTERS = [['eq', 'id', 'DR-1'], ['is', 'answeredAt', null], ['eq', 'updatedAt', NOW]];

test('ใบงานโต๊ะ + นัดกำลังทำ: จองแถว → ปิดนัด → ตอบใบ', async () => {
  const db = fakeSupabase({ service_visits: [visit()], dept_requests: [requestRow()] });
  const threads = [];
  const out = await surveySendWrites(db, sendArgs({
    open: visit(), closeVisitId: 'SVV-1', needsVisit: false, expectUpdatedAt: UPDATED,
    onVisitClosed: (closed) => { threads.push(`${closed.id} ${closed.status}`); },
  }));
  assert.equal(out.error, undefined);
  assert.equal(out.closedVisit.id, 'SVV-1');
  assert.equal(out.request.answeredAt, NOW);
  assert.deepEqual(updates(db.calls).map((c) => c.table), ['dept_requests', 'service_visits', 'dept_requests']);
  assert.deepEqual(threads, ['SVV-1 done']);
  assert.equal(db.tables.service_visits[0].status, 'done');
});

test('🔑 expectUpdatedAt ตรงกับแถว: จองแถว (แตะ updatedAt อย่างเดียว) แล้วตอบใบที่ผูกกับค่าที่เพิ่งจอง', async () => {
  const db = fakeSupabase({ service_visits: [], dept_requests: [requestRow()] });
  const out = await surveySendWrites(db, sendArgs({ expectUpdatedAt: UPDATED }));
  assert.equal(out.request.status, 'answered');
  assert.equal(out.closedVisit, null);
  assert.deepEqual(db.calls.map((c) => [c.table, c.op]), [['dept_requests', 'update'], ['dept_requests', 'update']], 'ไม่อ่านซ้ำ');
  const [claim, answer] = db.calls;
  assert.deepEqual(claim.patch, { updatedAt: NOW }, 'การจองไม่เปลี่ยนคอลัมน์อื่นของใบ');
  assert.deepEqual(claim.filters, CLAIM_FILTERS);
  assert.deepEqual(answer.patch, answerPatch);
  assert.deepEqual(answer.filters, ANSWER_FILTERS);
});

test('🔴 แถวคำร้องถูกแตะหลังอ่าน (วิธีประเมินถูกสลับ) และยังไม่มีใครตอบ = 409 "วิธีประเมินของใบเปลี่ยนไปแล้ว" · ไม่เขียนรอบสอง', async () => {
  const db = fakeSupabase({ service_visits: [], dept_requests: [requestRow({ updatedAt: '2026-09-24T07:59:59.000000+00:00' })] });
  const out = await surveySendWrites(db, sendArgs({ expectUpdatedAt: UPDATED }));
  assert.deepEqual(out, { error: CHANGED_TEXT, status: 409 });
  assert.deepEqual(db.calls.map((c) => [c.table, c.op]), [['dept_requests', 'update'], ['dept_requests', 'select']]);
  assert.deepEqual(db.calls[0].patch, { updatedAt: NOW });
  // อ่านซ้ำเบา ๆ เฉพาะสองคอลัมน์ของใบนี้
  assert.equal(db.calls[1].cols, 'id, "answeredAt"');
  assert.deepEqual(db.calls[1].filters, [['eq', 'id', 'DR-1']]);
  assert.equal(db.tables.dept_requests[0].answeredAt, null, 'ใบยังไม่ถูกตอบ');
  assert.equal(db.tables.dept_requests[0].status, 'acknowledged');
  assert.equal(db.tables.dept_requests[0].updatedAt, '2026-09-24T07:59:59.000000+00:00', 'จองไม่ติด = แถวไม่ถูกแตะ');
});

test('แถวถูกแตะหลังอ่านเพราะหัวหน้าอีกคนส่งผลไปก่อน = ประโยคเดิม "ถูกส่งผลไปแล้ว" (ไม่ใช่เรื่องวิธีประเมิน)', async () => {
  const db = fakeSupabase({
    service_visits: [],
    dept_requests: [requestRow({ answeredAt: '2026-09-24T07:59:00.000Z', status: 'answered', updatedAt: '2026-09-24T07:59:00.000000+00:00' })],
  });
  const out = await surveySendWrites(db, sendArgs({ expectUpdatedAt: UPDATED }));
  assert.deepEqual(out, { error: ANSWERED_TEXT, status: 409 });
  assert.equal(updates(db.calls).length, 1);
  assert.equal(db.tables.dept_requests[0].answeredAt, '2026-09-24T07:59:00.000Z');
});

test('อ่านซ้ำไม่สำเร็จ / ใบหายไปแล้ว = ประโยคเดิม (ไม่กล่าวหาว่าวิธีประเมินเปลี่ยนตอนที่ไม่รู้)', async () => {
  const unread = fakeSupabase(
    { service_visits: [], dept_requests: [requestRow({ updatedAt: 'อื่น' })] }, { failReadOn: ['dept_requests'] },
  );
  assert.deepEqual(await surveySendWrites(unread, sendArgs({ expectUpdatedAt: UPDATED })),
    { error: ANSWERED_TEXT, status: 409 });
  assert.equal(updates(unread.calls).length, 1);

  const gone = fakeSupabase({ service_visits: [], dept_requests: [] });
  assert.deepEqual(await surveySendWrites(gone, sendArgs({ expectUpdatedAt: UPDATED })),
    { error: ANSWERED_TEXT, status: 409 });
});

test('🔑 ไม่ส่ง expectUpdatedAt / ว่าง / ไม่ใช่สตริง = ไม่จอง และคำสั่งตอบใบไม่มีเงื่อนไข updatedAt (เส้นเดิมทุกคำสั่ง)', async () => {
  for (const expectUpdatedAt of [undefined, null, '', 0, 1759000000000, {}]) {
    // แถวถือ updatedAt อีกค่า — ถ้ามีเงื่อนไขหลุดเข้าไป การตอบจะไม่ติดแถว
    const db = fakeSupabase({ service_visits: [], dept_requests: [requestRow({ updatedAt: 'ค่าอะไรก็ได้' })] });
    const args = sendArgs();
    if (expectUpdatedAt !== undefined) args.expectUpdatedAt = expectUpdatedAt;
    const out = await surveySendWrites(db, args);
    assert.equal(out.request?.status, 'answered', String(expectUpdatedAt));
    assert.deepEqual(db.calls.length, 1);
    assert.deepEqual(db.calls[0].filters, [['eq', 'id', 'DR-1'], ['is', 'answeredAt', null]], String(expectUpdatedAt));
  }
  // ใบที่ตอบไปแล้ว + ไม่มีเงื่อนไข updatedAt = ประโยคเดิม **โดยไม่อ่านซ้ำ** (คำสั่งชุดเดียวกับก่อน S1)
  const answered = fakeSupabase({ service_visits: [], dept_requests: [requestRow({ answeredAt: NOW, status: 'answered' })] });
  assert.deepEqual(await surveySendWrites(answered, sendArgs()), { error: ANSWERED_TEXT, status: 409, closedVisit: null });
  assert.deepEqual(answered.calls.map((c) => c.op), ['update']);
});

test('🔴 แถวถูกแตะก่อนกดส่ง ขณะมีนัดที่ส่งผลจะปิด: ตีกลับที่การจอง — นัดยังเปิด ไม่มีบรรทัดเธรด ไม่มีคำสั่งใดแตะ service_visits', async () => {
  /* 🐞 เดิมผูกเฉพาะคำสั่งตอบใบ ⇒ นัดถูกปิดเป็น "เข้าแล้ว" ไปก่อนแล้วค่อยตีกลับ — บนใบที่เพิ่งพลิกเป็นงานโต๊ะ
     คือนัดที่บันทึกว่าเข้าแล้วทั้งที่ไม่มีใครไป (ผิดแผน §2 แถว 17) และเส้นสลับวิธียกเลิกนัดนั้นไม่เจออีก */
  for (const status of ['scheduled', 'in_progress']) {
    const open = visit({ status });
    const db = fakeSupabase({ service_visits: [open], dept_requests: [requestRow({ updatedAt: 'ถูกแตะแล้ว' })] });
    const threads = [];
    const out = await surveySendWrites(db, sendArgs({
      open, closeVisitId: 'SVV-1', expectUpdatedAt: UPDATED, onVisitClosed: (closed) => { threads.push(closed.id); },
    }));
    assert.deepEqual(out, { error: CHANGED_TEXT, status: 409 }, status);
    assert.deepEqual(db.calls.filter((c) => c.table === 'service_visits'), [], status);
    assert.deepEqual(threads, [], status);
    assert.equal(db.tables.service_visits[0].status, status);
    assert.equal(db.tables.dept_requests[0].answeredAt, null);
  }
});

test('จองแถวแล้วคำสั่งจองล้ม (ฐานตอบ error) = 500 ก่อนปิดนัด', async () => {
  const db = fakeSupabase({ service_visits: [visit()], dept_requests: [requestRow()] });
  const from = db.from;
  db.from = (table) => {
    const builder = from(table);
    if (table !== 'dept_requests') return builder;
    const update = builder.update;
    builder.update = (patch) => {
      update(patch);
      builder.then = (resolve) => Promise.resolve({ data: null, error: { message: 'boom claim' } }).then(resolve);
      return builder;
    };
    return builder;
  };
  const out = await surveySendWrites(db, sendArgs({ open: visit(), closeVisitId: 'SVV-1', expectUpdatedAt: UPDATED }));
  assert.deepEqual(out, { error: 'boom claim', status: 500 });
  assert.equal(db.tables.service_visits[0].status, 'in_progress');
});

test('จองได้ ปิดนัดได้ แต่แถวถูกแตะก่อนตอบใบ (หน้าต่างที่เหลือ): คำตอบยังพก closedVisit — สภาพ "นัดปิด ใบยังไม่ตอบ" แบบเดิม', async () => {
  const db = fakeSupabase({ service_visits: [visit()], dept_requests: [requestRow()] });
  const out = await surveySendWrites(db, sendArgs({
    open: visit(), closeVisitId: 'SVV-1', expectUpdatedAt: UPDATED,
    // แทรกหลังปิดนัด ก่อนตอบใบ — จุดเดียวที่ผู้เรียกมีมือแทรกได้
    onVisitClosed: () => { db.tables.dept_requests[0].updatedAt = 'ถูกแตะหลังจอง'; },
  }));
  assert.equal(out.status, 409);
  assert.equal(out.error, CHANGED_TEXT);
  assert.equal(out.closedVisit.id, 'SVV-1');
  assert.equal(db.tables.service_visits[0].status, 'done');
  assert.equal(db.tables.dept_requests[0].answeredAt, null);
});

test('🔴 surveySendWrites ก็ต้องได้ needsVisit — ลืมส่ง = โยน ไม่ใช่ตอบใบไปเงียบ ๆ', async () => {
  const db = fakeSupabase({ service_visits: [], dept_requests: [requestRow()] });
  const { needsVisit: _dropped, ...args } = sendArgs();
  await assert.rejects(() => surveySendWrites(db, args), TypeError);
  assert.deepEqual(db.calls, []);
});

/* ══ 4. ด่านแถว 17a — พื้นที่ลงหน้างานต้องมีนัดที่เข้าพื้นที่ ═══════════════════════════════════ */

const zone = (id, zoneName, over = {}) => ({ id, zoneName, status: 'ok', ...over });
const siteText = (names) => `ใบนี้มีพื้นที่ลงหน้างาน (${names}) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ`;

test('🔑 surveySendSiteVisitError: ชื่อเฉพาะพื้นที่ลงหน้างานที่ยังใช้อยู่ · มีนัดที่เข้าพื้นที่/ส่งผลนี้ปิดนัด = ผ่าน', () => {
  const A = zone('A', 'ล็อบบี้');
  const B = zone('B', 'ห้องประชุม', { method: 'onsite' });
  const C = zone('C', 'ฟิตเนส');
  const D = zone('D', 'สปา');
  const DRAW = zone('X', 'ห้องจากแบบ', { method: 'drawing' });
  const CUT = zone('Y', 'ห้องที่ตัด', { status: 'cut' });
  const CUT_DRAW = zone('Z', 'ห้องจากแบบที่ตัด', { status: 'cut', method: 'drawing' });
  const table = [
    // [แถว, ตัวเลือก, ผล]
    ['จากแบบทั้งใบ', [DRAW], {}, null],
    ['จากแบบทั้งใบ + แถวที่ตัดเป็นจากแบบ', [DRAW, CUT_DRAW], {}, null],
    ['ตัดหมดและทุกแถวเป็นจากแบบ', [CUT_DRAW], {}, null],
    ['ลงหน้างานล้วน ไม่มีนัด', [A], {}, siteText('ล็อบบี้')],
    ['ไม่ส่งตัวเลือก', [A], undefined, siteText('ล็อบบี้')],
    ['ผสม — เอ่ยเฉพาะพื้นที่ลงหน้างาน', [A, DRAW, B], {}, siteText('ล็อบบี้ · ห้องประชุม')],
    ['พื้นที่ลงหน้างานที่ถูกตัดไม่ถูกเอ่ย', [A, CUT, DRAW], {}, siteText('ล็อบบี้')],
    ['สามพื้นที่พอดี ไม่มีหาง', [A, B, C], {}, siteText('ล็อบบี้ · ห้องประชุม · ฟิตเนส')],
    ['สี่พื้นที่ = สามชื่อ + และอีก 1 พื้นที่', [A, B, C, D], {}, siteText('ล็อบบี้ · ห้องประชุม · ฟิตเนส และอีก 1 พื้นที่')],
    ['หกพื้นที่', [A, B, C, D, zone('E', 'ห้องอาหาร'), zone('F', 'ทางเดิน')], {}, siteText('ล็อบบี้ · ห้องประชุม · ฟิตเนส และอีก 3 พื้นที่')],
    ['พื้นที่ไม่มีชื่อ', [zone('N', '  ')], {}, siteText('พื้นที่ไม่มีชื่อ')],
    ['มีนัดที่เข้าพื้นที่แล้ว', [A, DRAW], { reachedSite: true }, null],
    ['ส่งผลนี้ปิดนัดที่ยังเปิด', [A, DRAW], { closesVisit: true }, null],
    ['ทั้งสองอย่าง', [A], { reachedSite: true, closesVisit: true }, null],
    // ต้องมีนัด (ตัดหมด · ลงหน้างาน) แต่ไม่เหลือพื้นที่ลงหน้างานให้ไปวัด ⇒ ด่านนี้ไม่มีอะไรจะบอก
    ['ตัดหมดทั้งใบ (ลงหน้างาน)', [CUT], {}, null],
    ['ไม่มีแถวเลย', [], {}, null],
    ['ไม่ได้ส่งอาร์เรย์', null, {}, null],
  ];
  for (const [name, rows, opts, expected] of table) {
    assert.equal(surveySendSiteVisitError(rows, opts), expected, name);
  }
});

test('ด่าน 17a ไม่อ่านสวิตช์เอง — ผู้เรียกเป็นคนเลือกว่าจะถามหรือไม่', () => {
  const before = process.env.SURVEY_DRAWING_METHOD;
  try {
    const rows = [zone('A', 'ล็อบบี้')];
    delete process.env.SURVEY_DRAWING_METHOD;
    const off = surveySendSiteVisitError(rows);
    process.env.SURVEY_DRAWING_METHOD = 'on';
    assert.equal(surveySendSiteVisitError(rows), off);
    assert.equal(off, siteText('ล็อบบี้'));
  } finally {
    if (before === undefined) delete process.env.SURVEY_DRAWING_METHOD;
    else process.env.SURVEY_DRAWING_METHOD = before;
  }
});

/* ══ 5. การ์ดควบคุม — ถามตัวตัดสินตัวเดียวกับ route ═════════════════════════════════════════ */

const SIZES = [
  { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false },
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true },
  { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true },
];
const HEAD_VIEWER = { canWrite: true, canDecide: true };
/* พื้นที่ที่ครบทุกด่าน **ทั้งชุดลงหน้างานและชุดจากแบบ** (ผังเป็น JPG) — เทสต์ของการ์ดชุดนี้ถามเรื่องนัดอย่างเดียว
   ไม่ผูกกับว่าด่านรายหัวข้อของพื้นที่จากแบบมีกี่ข้อ */
const readyZone = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok',
  parts: [{ widthM: 4, lengthM: 5, heightM: 3, label: null }],
  spots: [{ id: 's1', label: 'มุมโซฟา', selected: true }],
  packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageNote: '', note: '', ...extra,
});
const READY_FILES = [
  { docType: 'survey_wide', fileName: 'wide.jpg', mimeType: 'image/jpeg' },
  { docType: 'survey_plan', fileName: 'plan.jpg', mimeType: 'image/jpeg' },
  { docType: 'survey_spot', fileName: 'spot.jpg', mimeType: 'image/jpeg', metadata: { spotId: 's1' } },
];
const cardRequest = () => ({
  id: 'DR-1', docNo: 'RQ-AS-26090106', title: 'S&S ประเมินพื้นที่', kind: 'site_survey', dept: 'TS',
  status: 'acknowledged', siteId: 'SS-1', customerId: 'CU-1', committedDueDate: '2026-09-14', requestedByName: 'Admin S&S',
});
const card = (zones, visitRow, extra = {}) => controlView({
  packageSizes: SIZES, request: cardRequest(), zones,
  filesByZone: Object.fromEntries(zones.map((z) => [z.id, READY_FILES])),
  visit: visitRow, viewer: HEAD_VIEWER, today: TODAY, ...extra,
});

test('🔴 การ์ด: จากแบบทั้งใบ + นัดยังนัดไว้ = ไม่สัญญาว่าจะปิดนัด และกดส่งไม่ได้ด้วยประโยคเดียวกับ route', () => {
  const rows = [readyZone('z1', 'Studio 01', { method: 'drawing' }), readyZone('z2', 'Studio 02', { method: 'drawing' })];
  const scheduled = { id: 'SVV-1', code: 'SV-2609001', status: 'scheduled', scheduledDate: '2026-09-23' };
  assert.equal(surveyNeedsVisit(rows), false);
  const v = card(rows, scheduled);
  assert.equal(v.send.closesVisit, null, 'นัดที่ยังไม่มีใครไปจะไม่ถูกปิดเป็น "เข้าแล้ว"');
  assert.equal(v.send.show, true);
  assert.equal(v.send.allowed, false);
  assert.equal(v.send.reason.text, deskText('SV-2609001'));
  assert.equal(v.send.reason.detail, deskText('SV-2609001'));
  assert.equal(v.send.reason.text, surveySendVisitStep(scheduled, { today: TODAY, needsVisit: false }).error);

  // ร่างก็ประโยคของงานโต๊ะ (ไม่ใช่ "ปล่อยขึ้นตาราง" — ใบนี้ไม่ต้องมีนัด)
  const draft = card(rows, { ...scheduled, status: 'draft' });
  assert.equal(draft.send.reason.text, deskText('SV-2609001'));
  assert.equal(draft.send.allowed, false);
});

test('การ์ด: จากแบบทั้งใบ — นัดกำลังทำ = ปิดให้เหมือนเดิม · ไม่มีนัด = ส่งได้ ไม่แตะนัด', () => {
  const rows = [readyZone('z1', 'Studio 01', { method: 'drawing' })];
  const started = card(rows, {
    id: 'SVV-1', code: 'SV-2609001', status: 'in_progress', scheduledDate: '2026-09-22',
    actualDate: '2026-09-22', actualStartTime: '14:05:00',
  });
  assert.equal(started.send.allowed, true);
  assert.deepEqual(started.send.closesVisit, {
    id: 'SVV-1', code: 'SV-2609001', status: 'in_progress', statusLabel: 'กำลังทำ', actualDate: '2026-09-22', startTime: '14:05',
  });
  const none = card(rows, null);
  assert.equal(none.send.allowed, true);
  assert.equal(none.send.closesVisit, null);
});

test('การ์ด: ใบผสม (ยังมีพื้นที่ลงหน้างาน) + นัดยังนัดไว้ = ส่งผลปิดนัดให้เหมือนใบลงหน้างาน', () => {
  const rows = [readyZone('z1', 'Studio 01'), readyZone('z2', 'Studio 02', { method: 'drawing' })];
  assert.equal(surveyMethodMix(rows).mode, 'mixed');
  const v = card(rows, { id: 'SVV-1', code: 'SV-2609001', status: 'scheduled', scheduledDate: '2026-09-23' });
  assert.equal(v.send.allowed, true);
  assert.equal(v.send.closesVisit.id, 'SVV-1');
});

test('⭐ การ์ด: ใบลงหน้างานล้วน — แถวที่ไม่มีคีย์ method กับแถวที่ method = onsite ได้ผลเท่ากันทุกคีย์ ทุกสถานะนัด', () => {
  const bare = [
    readyZone('z1', 'Studio 01'),
    readyZone('z2', 'Studio 02', { spots: [{ id: 's1', label: 'มุมโซฟา', selected: false }], packageQty: null }),
    readyZone('z3', 'Studio 03', { status: 'cut' }),
  ];
  const tagged = bare.map((z) => ({ ...z, method: 'onsite' }));
  const nulled = bare.map((z) => ({ ...z, method: null, methodReason: null, methodChangedAt: null, methodChangedByName: null }));
  const visits = [
    null,
    ...['draft', 'scheduled', 'in_progress', 'done', 'partial', 'unable', 'cancelled', 'rescheduled'].map((status) => ({
      id: 'SVV-1', code: 'SV-2609001', status, scheduledDate: '2026-09-23', actualDate: null, actualStartTime: null,
    })),
  ];
  for (const visitRow of visits) {
    for (const viewer of [HEAD_VIEWER, { canWrite: true, canDecide: false }]) {
      const base = card(bare, visitRow, { viewer });
      assert.deepEqual(card(tagged, visitRow, { viewer }), base, `onsite · ${visitRow?.status}`);
      assert.deepEqual(card(nulled, visitRow, { viewer }), base, `null · ${visitRow?.status}`);
    }
  }
  // ใบที่ครบทุกด่าน: นัดร่างยังได้ประโยคเดิมของร่าง (ไม่ใช่ประโยคงานโต๊ะ)
  const ready = card([readyZone('z1', 'Studio 01', { method: 'onsite' })], {
    id: 'SVV-1', code: 'SV-2609001', status: 'draft', scheduledDate: '2026-09-26',
  });
  assert.equal(ready.send.reason.key, 'visit-draft');
  assert.equal(ready.send.reason.text, DRAFT_TEXT);
});

test('ซอร์ส: การ์ดและ route ส่ง needsVisit จาก surveyNeedsVisit ของแถวพื้นที่ — ไม่มีผู้เรียกไหนเดาเอง', () => {
  const code = (rel) => fs.readFileSync(path.join(WEBAPP, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const control = code('src/lib/service/surveyControl.js');
  assert.match(control, /surveySendVisitStep\(visit, \{ today, needsVisit: surveyNeedsVisit\(rows\) \}\)/);
  // รางของการ์ดได้ค่าตัวเดียวกัน (ขั้นของใบงานโต๊ะไม่เดินตามนัด — กติกาอยู่ที่ `requestRail`)
  assert.match(control, /requestRailSteps\(request \|\| \{\}, \{ visit: visit \|\| null, needsVisit \}\)/);
  assert.match(control, /step: stepOf\(request, \{[^}]*\bvisit, needsVisit: surveyNeedsVisit\(rows\) \}\)/);

  const route = code('src/app/api/service/surveys/[id]/send/route.js');
  assert.match(route, /const needsVisit = surveyNeedsVisit\(zones\);/);
  assert.match(route, /const closesVisit = surveySendVisitStep\(open, \{ today, needsVisit \}\)\.action === 'close';/);
  assert.match(route, /expectUpdatedAt: surveyDrawingMethodEnabled\(\) \? \(request\.updatedAt \?\? null\) : null,/);
  // ทุกการเรียกในสองไฟล์นี้กับลำดับกลางส่ง needsVisit ในวงเล็บเดียวกัน
  for (const rel of [
    'src/lib/service/surveyControl.js', 'src/app/api/service/surveys/[id]/send/route.js', 'src/lib/service/surveySendClose.js',
  ]) {
    const calls = [...code(rel).matchAll(/(?<!function )surveySendVisitStep\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map((m) => m[1]);
    assert.ok(calls.length > 0, rel);
    for (const args of calls) assert.match(args, /needsVisit/, `${rel}: surveySendVisitStep(${args})`);
  }
  // ด่าน 17a อยู่ใต้สวิตช์ · หลังด่านรูปจุด · ก่อนคำสั่งเขียน · สวิตช์ถูกอ่านผ่านตัวช่วยตัวเดียว
  const handler = route.slice(route.indexOf('export const POST'));
  const at = (text) => handler.indexOf(text);
  assert.ok(at('surveySpotSendError(') > 0 && at('surveySpotSendError(') < at('surveyDrawingMethodEnabled()'));
  assert.ok(at('surveyDrawingMethodEnabled()') < at('surveySendSiteVisitError('));
  assert.ok(at('surveySendSiteVisitError(') < at('surveySendWrites('));
  // สองจุดเท่านั้น: ด่าน 17a กับการผูก `expectUpdatedAt` (ทั้งคู่ปิดอยู่ = เส้นเดิม)
  assert.equal(route.split('surveyDrawingMethodEnabled()').length - 1, 2);
  assert.equal(route.split('surveySendSiteVisitError(').length - 1, 1);
  for (const rel of ['src/app/api/service/surveys/[id]/send/route.js', 'src/lib/service/surveySendClose.js', 'src/lib/service/surveyControl.js']) {
    assert.doesNotMatch(code(rel), /process\.env\.SURVEY_DRAWING_METHOD/, rel);
  }
  // โมดูลที่จอ import (การ์ด · โมดัลยืนยัน) ห้ามดึงตัวอ่านสวิตช์ของ server เข้ามา
  for (const rel of ['src/lib/service/surveySendClose.js', 'src/lib/service/surveyControl.js']) {
    assert.doesNotMatch(code(rel), /surveyDrawingFlag/, rel);
  }
});

/* ══ 6. route ส่งผล — ด่าน 17a ใต้สวิตช์ ═══════════════════════════════════════════════════ */

const WRITE_OPS = ['insert', 'update', 'upsert', 'delete', 'rpc'];
/* ฐานข้อมูลปลอมของ route — กรอง/เรียง/ตัดจริง · เขียนจริงลงตารางในหน่วยความจำ · จดทุกคำสั่งตามลำดับ (`events`)
   `failWhen(q)` คืน true = คำสั่งนั้นตอบ `{ error }` (supabase ไม่ throw) */
function fakeDb(tables, { failWhen = null } = {}) {
  const events = [];
  const db = {
    events,
    tables,
    async rpc(name, args) {
      events.push({ op: 'rpc', name, args });
      return { data: null, error: { code: 'PGRST202', message: `function ${name} does not exist` } };
    },
    auth: { admin: { async getUserById() { return { data: { user: null }, error: { status: 404, message: 'User not found' } }; } } },
    from(table) {
      const q = { op: 'select', table, select: null, filters: [], orders: [], limit: null, values: null };
      const matches = (row) => q.filters.every(([op, col, val]) => {
        if (op === 'eq') return row[col] === val;
        if (op === 'neq') return row[col] !== val;
        if (op === 'in') return val.includes(row[col]);
        if (op === 'is') return (row[col] ?? null) === val;
        return true;
      });
      let done = null;
      const run = () => {
        if (done) return done;
        events.push(q);
        if (failWhen?.(q)) { done = { data: null, error: { message: `${table} ล่ม` } }; return done; }
        if (q.op === 'insert' || q.op === 'upsert') {
          const rows = (Array.isArray(q.values) ? q.values : [q.values]).map((row) => structuredClone(row));
          tables[table] = [...(tables[table] || []), ...rows];
          done = { data: rows.map((row) => structuredClone(row)), error: null };
          return done;
        }
        let rows = (tables[table] || []).filter(matches);
        if (q.op === 'update') {
          rows.forEach((row) => Object.assign(row, structuredClone(q.values)));
          done = { data: rows.map((row) => structuredClone(row)), error: null };
          return done;
        }
        if (q.op === 'delete') {
          tables[table] = (tables[table] || []).filter((row) => !rows.includes(row));
          done = { data: rows, error: null };
          return done;
        }
        for (const [col, asc] of [...q.orders].reverse()) {
          rows = [...rows].sort((a, b) => {
            const x = a[col]; const y = b[col];
            if (x === y) return 0;
            return (x < y ? -1 : 1) * (asc ? 1 : -1);
          });
        }
        if (q.limit != null) rows = rows.slice(0, q.limit);
        done = { data: rows.map((row) => structuredClone(row)), error: null };
        return done;
      };
      const one = () => Promise.resolve().then(run).then(({ data, error }) => (
        error ? { data: null, error } : { data: data[0] || null, error: null }
      ));
      const known = {
        select(cols) { if (q.op === 'select') q.select = cols; return chain; },
        insert(values) { q.op = 'insert'; q.values = values; return chain; },
        upsert(values) { q.op = 'upsert'; q.values = values; return chain; },
        update(values) { q.op = 'update'; q.values = values; return chain; },
        delete() { q.op = 'delete'; return chain; },
        eq(col, val) { q.filters.push(['eq', col, val]); return chain; },
        neq(col, val) { q.filters.push(['neq', col, val]); return chain; },
        in(col, val) { q.filters.push(['in', col, val]); return chain; },
        is(col, val) { q.filters.push(['is', col, val]); return chain; },
        order(col, opts = {}) { q.orders.push([col, opts.ascending !== false]); return chain; },
        limit(n) { q.limit = n; return chain; },
        maybeSingle() { return one(); },
        single() { return one(); },
        then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
      };
      // ตัวกรองที่ของปลอมไม่รู้จัก = ปล่อยผ่าน — เส้นของกระดิ่งใช้ตัวกรองที่เทสต์ชุดนี้ไม่ได้ตัดสิน
      const chain = new Proxy(known, { get: (target, prop) => (prop in target ? target[prop] : () => chain) });
      return chain;
    },
  };
  return db;
}

const HEAD = { id: 'U-head-now', name: 'Head Presser', role: 'ts_manager', department: 'TS', team: 'TS', teams: ['TS'] };
const REQUEST_ID = 'DR-synthetic-0001';
const VISIT_ID = 'SVV-1';
const VISIT_SHAPES = {
  scheduled: { status: 'scheduled', actualDate: null, actualStartTime: null, actualEndTime: null },
  unable: { status: 'unable', unableReason: 'หน้างานยังไม่พร้อม', actualEndTime: null },
  partial: { status: 'partial' },
  done: {},
};

/* โลกปลอมจากแฝดสังเคราะห์ของเอกสารประเมิน — ใบลงหน้างานสองพื้นที่ที่ผ่านทุกด่านเดิม · ยังไม่ส่งผล */
function makeWorld({ visit: visitShape = 'none', options = {}, zonePatch = null } = {}) {
  const source = surveyReportInputsFromFixture(syntheticSurveyFixture());
  const request = {
    ...source.request,
    dept: 'TS', status: 'acknowledged', requestedById: 'U-sale',
    answeredAt: null, answeredById: null, answeredByName: null,
    siteId: 'SITE-1', customerId: 'CUS-1', dealId: 'DEAL-1',
  };
  const visitRow = {
    id: VISIT_ID, requestId: request.id, kind: 'survey', createdAt: '2026-09-24T02:00:00.000+00:00', unableReason: null,
    ...source.visit, assistantIds: [], ...(VISIT_SHAPES[visitShape] || {}),
  };
  const tables = {
    dept_requests: [request],
    service_survey_zones: source.zones.map(({ zoneCode: _zoneCode, ...z }) => ({ ...z, requestId: request.id, ...(zonePatch || {}) })),
    attachments: source.zones.flatMap((z) => (source.filesByZone[z.id] || [])
      .map((f) => ({ ...f, entityType: 'service_survey_zone', entityId: z.id, driveFileId: `drv-${f.id}` }))),
    service_visits: visitShape === 'none' ? [] : [visitRow],
    service_package_sizes: source.sizes.map((s) => ({ ...s })),
    entity_updates: [],
    audit_logs: [],
    notifications: [],
  };
  const db = fakeDb(tables, options);
  return {
    db, tables,
    request: () => tables.dept_requests[0],
    visit: () => tables.service_visits[0] || null,
    writes: () => db.events.filter((e) => WRITE_OPS.includes(e.op)),
    // การอ่าน "นัดที่เข้าพื้นที่แล้ว" ของด่าน 17a — แยกจากการหานัดที่ยังค้าง (`findSurveyVisit` กรองสถานะอีกชุด)
    reachedReads: () => db.events.filter((e) => e.table === 'service_visits' && e.op === 'select'
      && e.filters.some(([op, col, val]) => op === 'in' && col === 'status' && Array.isArray(val)
        && val.includes('done') && !val.includes('scheduled'))),
  };
}

async function send(world, { user = HEAD, body = {} } = {}) {
  globalThis.__methodSendTest = { user, supabase: world.db };
  const req = new Request(`http://localhost/api/service/surveys/${REQUEST_ID}/send`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ id: REQUEST_ID }) });
  return { status: res.status, json: await res.json() };
}
const drawingOn = () => { process.env.SURVEY_DRAWING_METHOD = 'on'; };
const drawingOff = () => { delete process.env.SURVEY_DRAWING_METHOD; };

test.beforeEach((t) => {
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'info', () => {});
});
test.afterEach(() => { drawingOff(); delete globalThis.__methodSendTest; });

test('🔴 route · สวิตช์ปิด: ใบลงหน้างานที่ไม่มีนัดยังส่งได้เหมือนเดิม และไม่มีการอ่านนัดที่เข้าพื้นที่เลย', async () => {
  for (const value of [undefined, '', 'off', '1', 'true']) {
    if (value === undefined) drawingOff(); else process.env.SURVEY_DRAWING_METHOD = value;
    for (const shape of ['none', 'unable']) {
      const world = makeWorld({ visit: shape });
      const { status, json } = await send(world);
      assert.equal(status, 200, `${value} · ${shape} · ${json.error}`);
      assert.equal(world.request().status, 'answered');
      assert.equal(json.closedVisit, null);
      assert.deepEqual(world.reachedReads(), [], 'สวิตช์ปิด = ไม่อ่าน ไม่ตรวจ');
      // นัดถูกอ่านครั้งเดียว — ตัวหานัดที่ยังค้างตัวเดิม
      assert.equal(world.db.events.filter((e) => e.table === 'service_visits').length, 1);
    }
  }
});

test('🔴 route · สวิตช์เปิด: พื้นที่ลงหน้างานแต่ไม่มีนัดที่เข้าพื้นที่ (ไม่มีนัด · มีแต่ "ทำไม่ได้") = 409 ก่อนเขียนอะไร', async () => {
  for (const shape of ['none', 'unable']) {
    const world = makeWorld({ visit: shape });
    const expected = surveySendSiteVisitError(world.tables.service_survey_zones);
    assert.match(expected, /^ใบนี้มีพื้นที่ลงหน้างาน \(.+\) แต่ยังไม่มีนัดที่เข้าพื้นที่ — ลงคิวก่อน หรือเปลี่ยนพื้นที่นั้นเป็นประเมินจากแบบ$/);
    for (const z of world.tables.service_survey_zones) assert.ok(expected.includes(z.zoneName), z.zoneName);
    drawingOn();
    const { status, json } = await send(world);
    assert.equal(status, 409, shape);
    assert.equal(json.error, expected, shape);
    assert.deepEqual(world.writes(), [], 'ยังไม่ได้เขียนอะไร');
    assert.equal(world.request().answeredAt, null);
    assert.equal(world.request().status, 'acknowledged');
    if (shape === 'unable') assert.equal(world.visit().status, 'unable');
    // อ่านเบา ๆ ครั้งเดียว: ของใบนี้ · สองสถานะ · แถวเดียวพอ
    const [read, ...rest] = world.reachedReads();
    assert.deepEqual(rest, []);
    assert.equal(read.select, 'id, status');
    assert.equal(read.limit, 1);
    assert.deepEqual(read.filters, [['eq', 'requestId', REQUEST_ID], ['in', 'status', ['done', 'partial']]]);
  }
});

test('route · สวิตช์เปิด: มีนัดที่เข้าพื้นที่แล้ว (เข้าแล้ว · ทำไม่ครบ) = ส่งได้ ไม่แตะนัด', async () => {
  for (const shape of ['done', 'partial']) {
    const world = makeWorld({ visit: shape });
    const before = world.visit().status;
    drawingOn();
    const { status, json } = await send(world);
    assert.equal(status, 200, `${shape} · ${json.error}`);
    assert.equal(world.request().status, 'answered');
    assert.equal(json.closedVisit, null);
    assert.equal(world.visit().status, before);
    assert.equal(world.reachedReads().length, 1);
  }
});

test('route · สวิตช์เปิด: ส่งผลที่ปิดนัดที่ยังนัดไว้ = ผ่านด่าน 17a (นัดนั้นกำลังจะเป็น "เข้าแล้ว") และปิดนัดให้', async () => {
  const world = makeWorld({ visit: 'scheduled' });
  drawingOn();
  const { status, json } = await send(world, { body: { closeVisitId: VISIT_ID } });
  assert.equal(status, 200, json.error);
  assert.equal(json.closedVisit.id, VISIT_ID);
  assert.equal(world.visit().status, 'done');
  assert.equal(world.request().status, 'answered');
});

test('route · สวิตช์เปิด: จากแบบทั้งใบ ไม่มีนัดเลย = ส่งได้ — ด่าน 17a ไม่ถามใบที่ไม่ต้องมีนัด', async () => {
  const world = makeWorld({ visit: 'none', zonePatch: { method: 'drawing' } });
  assert.equal(surveyNeedsVisit(world.tables.service_survey_zones), false);
  drawingOn();
  const { status, json } = await send(world);
  assert.equal(status, 200, json.error);
  assert.equal(world.request().status, 'answered');
  assert.equal(json.closedVisit, null);
});

test('🔴 route: จากแบบทั้งใบ + นัดยังนัดไว้ค้างอยู่ = 409 ประโยคของงานโต๊ะ ก่อนเขียนอะไร — นัดไม่ถูกปิดเป็น "เข้าแล้ว" (สวิตช์เปิดหรือปิดก็ตาม)', async () => {
  for (const on of [false, true]) {
    const world = makeWorld({ visit: 'scheduled', zonePatch: { method: 'drawing' } });
    if (on) drawingOn(); else drawingOff();
    const { status, json } = await send(world, { body: { closeVisitId: VISIT_ID } });
    assert.equal(status, 409, String(on));
    assert.equal(json.error, deskText(world.visit().code || VISIT_ID), String(on));
    assert.deepEqual(world.writes(), [], 'ยังไม่ได้เขียนอะไร');
    assert.equal(world.visit().status, 'scheduled');
    assert.equal(world.request().answeredAt, null);
  }
});

test('🔴 route · สวิตช์เปิด: อ่านนัดที่เข้าพื้นที่ไม่สำเร็จ = 500 ก่อนเขียนอะไร (ไม่ปล่อยผ่านตอนไม่รู้ · ไม่ตอบ 409 ที่ไม่จริง)', async () => {
  const world = makeWorld({
    visit: 'done',
    options: {
      failWhen: (q) => q.table === 'service_visits' && q.op === 'select'
        && q.filters.some(([op, col, val]) => op === 'in' && col === 'status' && val.includes('partial')),
    },
  });
  drawingOn();
  const { status, json } = await send(world);
  assert.equal(status, 500);
  assert.equal(json.error, 'service_visits ล่ม');
  assert.deepEqual(world.writes(), []);
  assert.equal(world.request().answeredAt, null);
});

test('🔴 route · สวิตช์ปิด: การส่งผลไม่ผูกกับ updatedAt เลย — ไม่จอง · คำสั่งตอบใบชุดเดิม · แถวถูกแตะระหว่างส่งก็ยังตอบได้เหมือนเดิม', async () => {
  for (const value of [undefined, '', 'off']) {
    if (value === undefined) drawingOff(); else process.env.SURVEY_DRAWING_METHOD = value;
    const world = makeWorld({ visit: 'scheduled' });
    world.request().updatedAt = '2026-09-24T07:30:00.123456+00:00';
    // คำสั่งเขียนอื่นแตะใบระหว่างที่ route ตรวจด่าน (ผู้จัดคิวกดมอบหมาย · ซิงก์วันจากนัด) — ก่อน S1 ไม่ทำให้การส่งผลล้ม
    const from = world.db.from.bind(world.db);
    let touched = false;
    world.db.from = (table) => {
      if (table === 'service_package_sizes' && !touched) {
        touched = true;
        world.request().updatedAt = '2026-09-24T08:00:01.000000+00:00';
      }
      return from(table);
    };
    const { status, json } = await send(world, { body: { closeVisitId: VISIT_ID } });
    assert.equal(touched, true);
    assert.equal(status, 200, `${value} · ${json.error}`);
    assert.equal(world.request().status, 'answered');
    assert.equal(world.visit().status, 'done');
    const requestWrites = world.db.events.filter((e) => e.table === 'dept_requests' && e.op === 'update');
    assert.equal(requestWrites.length, 1, 'คำสั่งเดียว = ตอบใบ (ไม่มีคำสั่งจอง)');
    assert.deepEqual(requestWrites[0].filters, [['eq', 'id', REQUEST_ID], ['is', 'answeredAt', null]]);
  }
});

test('route · สวิตช์เปิด: จองแถวด้วย updatedAt ที่อ่านมาตอนต้น ก่อนปิดนัด แล้วตอบใบที่ผูกกับค่าที่จอง — แถวที่ไม่มี updatedAt ไม่ถูกผูก', async () => {
  drawingOn();
  const stamped = makeWorld({ visit: 'scheduled' });
  stamped.request().updatedAt = '2026-09-24T07:30:00.123456+00:00';
  const sent = await send(stamped, { body: { closeVisitId: VISIT_ID } });
  assert.equal(sent.status, 200, sent.json.error);
  const writes = stamped.writes().filter((e) => e.op === 'update' && ['dept_requests', 'service_visits'].includes(e.table));
  assert.deepEqual(writes.map((e) => e.table), ['dept_requests', 'service_visits', 'dept_requests']);
  const [claim, , answer] = writes;
  assert.deepEqual(Object.keys(claim.values), ['updatedAt']);
  assert.deepEqual(claim.filters, [
    ['eq', 'id', REQUEST_ID], ['is', 'answeredAt', null], ['eq', 'updatedAt', '2026-09-24T07:30:00.123456+00:00'],
  ]);
  assert.deepEqual(answer.filters, [['eq', 'id', REQUEST_ID], ['is', 'answeredAt', null], ['eq', 'updatedAt', claim.values.updatedAt]]);
  assert.equal(answer.values.updatedAt, claim.values.updatedAt);

  const bare = makeWorld({ visit: 'done' });
  delete bare.request().updatedAt;
  assert.equal((await send(bare)).status, 200);
  const plain = bare.db.events.filter((e) => e.table === 'dept_requests' && e.op === 'update');
  assert.equal(plain.length, 1);
  assert.deepEqual(plain[0].filters, [['eq', 'id', REQUEST_ID], ['is', 'answeredAt', null]]);
});

test('🔴 route · สวิตช์เปิด: แถวคำร้องถูกแตะระหว่างอ่านด่านกับส่งผล ขณะนัดยังนัดไว้ = 409 "วิธีประเมินของใบเปลี่ยนไปแล้ว" · ศูนย์คำสั่งเขียนลง service_visits · ใบไม่ถูกตอบ ไม่มีกระดิ่ง', async () => {
  drawingOn();
  const world = makeWorld({ visit: 'scheduled' });
  world.request().updatedAt = '2026-09-24T07:30:00.000000+00:00';
  /* จำลองเส้นสลับวิธีประเมิน (S2a) ที่แตะ `updatedAt` ของใบเป็นก้าวแรก — ลงมือหลัง route อ่านผลวัดไปแล้ว */
  const from = world.db.from.bind(world.db);
  let touched = false;
  world.db.from = (table) => {
    if (table === 'service_package_sizes' && !touched) {
      touched = true;
      world.request().updatedAt = '2026-09-24T08:00:01.000000+00:00';
    }
    return from(table);
  };
  const { status, json } = await send(world, { body: { closeVisitId: VISIT_ID } });
  assert.equal(touched, true);
  assert.equal(status, 409);
  assert.equal(json.error, CHANGED_TEXT);
  assert.equal(world.request().answeredAt, null);
  assert.equal(world.request().status, 'acknowledged');
  assert.equal(world.request().updatedAt, '2026-09-24T08:00:01.000000+00:00', 'จองไม่ติด = แถวไม่ถูกแตะ');
  assert.equal(world.visit().status, 'scheduled', 'นัดไม่ถูกปิดเป็น "เข้าแล้ว"');
  assert.deepEqual(world.writes().filter((e) => e.table === 'service_visits'), []);
  assert.deepEqual(world.writes().filter((e) => e.op === 'insert'), [], 'ไม่มีบรรทัดเธรด ไม่มี audit ไม่มีกระดิ่ง');
});
