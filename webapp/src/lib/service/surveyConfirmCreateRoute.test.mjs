// ── ใบยืนยันหน้างาน (ประเมินจากแบบ งวด S5 กลุ่ม A) — POST สร้างร่าง + GET ค่าตั้งต้นของฟอร์มล็อก ───────────────
//
// ⭐ ล็อกห้าเรื่อง:
//   ① POST ที่มี `confirmsRequestId` — server ประกอบดีล ลูกค้า สถานที่ ชุดพื้นที่ และวิธีเองจากใบต้นทาง
//      (ของที่โพสต์มาถูกทิ้ง) · วิธีเก็บ 'standard' เสมอ ⇒ แถวพื้นที่ไม่มีคีย์ method · ลิงก์เขียนตอนสร้างเท่านั้น
//   ② ทางเลี้ยวของใบยืนยันวิ่ง **ก่อน** ส่วนวิธีประเมินของ S4 (R1) — ทุกเคสวิ่งทั้งสวิตช์ `SURVEY_DRAWING_METHOD`
//      เปิดและปิด (production เปิดอยู่ตั้งแต่ 27/10 · ตัวตั้งวิธีที่มาช้าจะโผล่ให้เห็นเฉพาะตอนเปิด)
//   ③ ทุกด่านของแผน (N1 · N2 · N4 · N5 · N7 · N11) ตอบก่อนเขียนอะไร · ไม่มีคำตอบไหนบอกให้ "เอารายการนี้ออก"
//      (ฟอร์มล็อกพื้นที่ไว้ — ผู้ใช้ทำตามไม่ได้)
//   ④ insert ล้มทีละจุด (หัว · แถวพื้นที่ · อ่านกลับ) แล้วกดซ้ำ = ร่างใบเดียว ไม่มีหัวกำพร้าที่ถือลิงก์
//   ⑤ GET `/api/sa/requests/[id]/confirm-plan` — รูป §2.3 · ตรวจสถานที่ซ้ำแบบเดียวกับ POST (R13) ก่อนให้ฟอร์ม · อ่านอย่างเดียว
//
// ⚠️ เรียก handler **ตัวจริง** ผ่าน supabase ปลอมของ `crew/routeTestKit.mjs` (ถอดตัวอ่านผู้ใช้/client จริงด้วย hook และลบ env
//    ของ Supabase ก่อน import · dev DB = prod DB) ⇒ ไม่มีอะไรถึงฐานจริง · audit ลงตาราง `audit_logs` ของตัวปลอม
// ⚠️ `withFlag` ลอกมาจาก `surveyIntakeCreateRoute.test.mjs` (ตัวนั้นไม่ export — ห้ามไป export จากไฟล์นั้น · F10)
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, fakeDb } from './crew/routeTestKit.mjs';
import { canUser, canViewRequests } from '../permissions.js';
import { canManageRequest } from '../requests/access.js';
import {
  SURVEY_CONFIRM_KIND_ERROR, SURVEY_CONFIRM_NO_ORIGINAL, surveyConfirmAuditSuffix, surveyConfirmForbiddenText,
  surveyConfirmPreviousRoundText, surveyConfirmTitle,
} from './surveyConfirmLink.js';

mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-27T03:00:00Z') });

const { POST } = await import('../../app/api/sa/requests/route.js');
const { GET: confirmPlanGet } = await import('../../app/api/sa/requests/[id]/confirm-plan/route.js');

/* ── สวิตช์ (ลอกจาก surveyIntakeCreateRoute.test.mjs) ───────────────────────────────────────── */
async function withFlag(on, run) {
  const had = Object.prototype.hasOwnProperty.call(process.env, 'SURVEY_DRAWING_METHOD');
  const old = process.env.SURVEY_DRAWING_METHOD;
  if (on) process.env.SURVEY_DRAWING_METHOD = 'on';
  else delete process.env.SURVEY_DRAWING_METHOD;
  try {
    return await run();
  } finally {
    if (had) process.env.SURVEY_DRAWING_METHOD = old;
    else delete process.env.SURVEY_DRAWING_METHOD;
  }
}
/* ทุกเคสวิ่งสองรอบ — เปิดก่อน (production วันนี้) แล้วปิด (ทางถอยของ S4/S2b) */
async function bothFlags(run) {
  for (const on of [true, false]) await withFlag(on, () => run(on));
}

/* ── คน ──────────────────────────────────────────────────────────────────────────────────────── */
const SALES = { id: 'sa-1', name: 'เซลเอ', role: 'ae', team: 'KA' };          // ผู้ขอของใบต้นทาง
const MATE = { id: 'sa-2', name: 'เซลบี', role: 'ae', team: 'KA' };            // เพื่อนร่วมทีม — จัดการใบได้
const STRANGER = { id: 'sa-9', name: 'เซลทีมอื่น', role: 'ae', team: 'KB' };   // ทีมอื่น — จัดการใบไม่ได้

/* ── ของตั้งต้น ─────────────────────────────────────────────────────────────────────────────────
   ใบต้นทาง DR-O ส่งผลแล้ว · หัวหน้าตอบ "ต้องยืนยันหน้างาน" · พื้นที่จากแบบสองแถว (Z-B มาก่อน Z-A ตาม sortOrder)
   + แถวลงหน้างานหนึ่งแถว (Z-C — ไม่ถูกยก) · ดีล/สถานที่/โซนของลูกค้าอีกรายไว้ยิงค่าหลอก */
const ORIG_DOC = 'RQ-AS-26100001';
const ORIGINAL = {
  id: 'DR-O', kind: 'site_survey', dept: 'TS', docNo: ORIG_DOC, title: 'ประเมินพื้นที่ โรงแรมทดสอบ', status: 'answered',
  requestedById: 'sa-1', team: 'KA', dealId: 'D-1', siteId: 'SITE-1', customerId: 'C-1', customerName: 'บริษัท ทดสอบ จำกัด',
  variant: 'drawing', createdAt: '2026-10-01T03:00:00.000Z', answeredAt: '2026-10-05T03:00:00.000Z',
  surveyConfirm: 'needed', surveyConfirmOfId: null, committedDueDate: '2026-10-05', closedAt: null,
};
const DEALS = [
  { id: 'D-1', code: 'DL-0001', title: 'ติดตั้งเครื่องหอม โรงแรมทดสอบ', projectId: null, customerId: 'C-1', customerName: 'บริษัท ทดสอบ จำกัด', team: 'KA' },
  { id: 'D-2', code: 'DL-0002', title: 'ดีลของลูกค้าอีกราย', projectId: null, customerId: 'C-2', customerName: 'บริษัท อื่น จำกัด', team: 'KB' },
];
const SITES = [
  { id: 'SITE-1', code: 'SS-0001', name: 'โรงแรมทดสอบ', customerId: 'C-1' },
  { id: 'SITE-2', code: 'SS-0002', name: 'สาขาของลูกค้าอีกราย', customerId: 'C-2' },
];
const ZONES = [
  { id: 'Z-A', siteId: 'SITE-1', code: 'ZN-0001', name: 'โซนล็อบบี้', floor: 'G', building: null, isActive: true },
  { id: 'Z-B', siteId: 'SITE-1', code: 'ZN-0002', name: 'โซนสปา', floor: '2', building: null, isActive: true },
  { id: 'Z-C', siteId: 'SITE-1', code: 'ZN-0003', name: 'โซนครัว', floor: '1', building: null, isActive: true },
  { id: 'Z-F', siteId: 'SITE-2', code: 'ZN-0009', name: 'โซนของสาขาอื่น', floor: '1', building: null, isActive: true },
];
const part = (w, l) => ({ widthM: w, lengthM: l, heightM: 3 });
const SURVEYED = '2026-10-04T03:00:00.000Z';
const originalRows = () => [
  { id: 'SV-O1', requestId: 'DR-O', zoneId: 'Z-B', zoneName: 'โซนสปา', sortOrder: 0, status: 'done', method: 'drawing',
    parts: [part(6, 8)], packageSize: 'SM', packageQty: 1, surveyedAt: SURVEYED },
  { id: 'SV-O2', requestId: 'DR-O', zoneId: 'Z-A', zoneName: 'โซนล็อบบี้', sortOrder: 1, status: 'done', method: 'drawing',
    parts: [part(5, 4)], packageSize: 'ST', packageQty: 2, surveyedAt: SURVEYED },
  { id: 'SV-O3', requestId: 'DR-O', zoneId: 'Z-C', zoneName: 'โซนครัว', sortOrder: 2, status: 'done',
    parts: [part(3, 3)], packageSize: 'SM', packageQty: 1, surveyedAt: SURVEYED },
];
/* ชุดที่ยก = แถวจากแบบที่ยังรอยืนยัน เรียงตาม sortOrder */
const CARRY = ['Z-B', 'Z-A'];

function world({ original = {}, sites = SITES, extraRequests = [], extraRows = [], hook = null } = {}) {
  return fakeDb({
    dept_requests: [{ ...ORIGINAL, ...original }, ...extraRequests],
    service_survey_zones: [...originalRows(), ...extraRows],
    sales_deals: DEALS,
    service_sites: sites,
    service_zones: ZONES,
    entity_updates: [],
    audit_logs: [],
  }, { hook });
}

const VISIT = '2026-11-03';
const RESULT = '2026-11-06';
/* body ที่หน้า `/requests/new?confirms=` ส่ง — ค่าล็อก (§2.3 / D-4) + ที่ผู้ใช้กรอก · `confirmsRequestId` มาทาง `extra` */
const pageBody = (over = {}) => ({
  kind: 'site_survey',
  variant: 'standard',
  dealId: 'D-1',
  siteId: 'SITE-1',
  title: surveyConfirmTitle(ORIGINAL),
  zones: [{ zoneId: 'Z-B', name: 'โซนสปา' }, { zoneId: 'Z-A', name: 'โซนล็อบบี้' }],
  body: 'ขอเข้าวัดจริงก่อนติดตั้ง',
  requestedDueDate: VISIT,
  requestedDueTime: '10:00',
  requestedResultDate: RESULT,
  confirmsRequestId: 'DR-O',
  ...over,
});

/* ทุกคำตอบของ POST ที่มี `confirmsRequestId` — ไม่มีวันบอกให้ "เอารายการนี้ออก" (ฟอร์มล็อกพื้นที่ไว้ · ประโยคของด่านล็อกพื้นที่เดิม) */
const NO_REMOVE_ADVICE = /หรือเอารายการนี้ออก/;
async function post(db, body, user = SALES) {
  const res = await callRoute(POST, { user, db, method: 'POST', path: '/api/sa/requests', body });
  if (body && body.confirmsRequestId != null) {
    assert.doesNotMatch(JSON.stringify(res.json), NO_REMOVE_ADVICE, 'คำตอบของใบยืนยันห้ามบอกให้เอารายการออก');
  }
  return res;
}
const getPlan = (db, id = 'DR-O', user = SALES) => callRoute(confirmPlanGet, {
  user, db, path: `/api/sa/requests/${encodeURIComponent(id)}/confirm-plan`, params: { id },
});

const headInserts = (db) => db.writes('dept_requests').filter((c) => c.write === 'insert');
const zoneRowsOf = (db, requestId) => db.tables.service_survey_zones.filter((r) => r.requestId === requestId);
const drafts = (db) => db.tables.dept_requests.filter((r) => r.id !== 'DR-O' && r.surveyConfirmOfId === 'DR-O');
const anyWrites = (db) => db.calls.filter((c) => c.write);

/* ═══ fixture ══════════════════════════════════════════════════════════════════════════════════ */

test('fixture: ผู้ขอกับเพื่อนร่วมทีมจัดการใบต้นทางได้ · ทีมอื่นไม่ได้ · ทุกคนเปิดคำร้องได้', () => {
  for (const user of [SALES, MATE, STRANGER]) {
    assert.equal(canViewRequests(user), true, user.id);
    assert.equal(canUser(user, 'costing:edit'), true, user.id);
  }
  assert.equal(canManageRequest(SALES, ORIGINAL), true);
  assert.equal(canManageRequest(MATE, ORIGINAL), true);
  assert.equal(canManageRequest(STRANGER, ORIGINAL), false);
});

/* ═══ ① สร้างร่างจากใบต้นทาง ═════════════════════════════════════════════════════════════════════ */

test('⭐ POST ใบยืนยัน = 201 ร่าง · ลิงก์ · ลงหน้างาน · ดีล/ลูกค้า/สถานที่ของใบต้นทาง · พื้นที่ = ชุดที่ยกตามลำดับ', async () => {
  await bothFlags(async (on) => {
    const db = world();
    const res = await post(db, pageBody());
    assert.equal(res.status, 201, `flag ${on}: ${JSON.stringify(res.json)}`);
    const [head] = headInserts(db).map((c) => c.payload);
    assert.equal(head.status, 'draft');
    assert.equal(head.kind, 'site_survey');
    assert.equal(head.surveyConfirmOfId, 'DR-O');
    assert.equal(head.variant, 'standard');
    assert.equal(head.dealId, 'D-1');
    assert.equal(head.siteId, 'SITE-1');
    assert.equal(head.customerId, 'C-1');
    assert.equal(head.customerName, 'บริษัท ทดสอบ จำกัด');
    assert.equal(head.title, surveyConfirmTitle(ORIGINAL));
    assert.equal(head.requestedDueDate, VISIT);
    assert.equal(head.requestedDueTime, '10:00');
    assert.equal(head.requestedResultDate, RESULT);
    assert.equal('docNo' in head, false, 'ร่างยังไม่มีเลขที่');
    assert.equal(res.json.surveyConfirmOfId, 'DR-O', 'คำตอบคือใบที่อ่านกลับ (select *)');

    const rows = zoneRowsOf(db, head.id);
    assert.deepEqual(rows.map((r) => r.zoneId), CARRY);
    assert.deepEqual(rows.map((r) => r.sortOrder), [0, 1]);
    assert.deepEqual(rows.map((r) => r.zoneName), ['โซนสปา', 'โซนล็อบบี้']);
    for (const row of rows) {
      assert.equal('method' in row, false, 'แถวลงหน้างานไม่มีคีย์ method');
      assert.equal('methodChangedAt' in row, false);
    }
    // ไม่มีบรรทัดเธรดตอนสร้าง — ร่างยังไม่มีเลขและอาจถูกทิ้ง (V3)
    assert.equal(db.writes('entity_updates').length, 0);
    // ใบต้นทางไม่ถูกแตะ
    assert.equal(db.writes('dept_requests').filter((c) => c.write === 'update').length, 0);
  });
});

test('ชื่อเรื่อง: ที่พิมพ์มาคงไว้ · ว่าง = ชื่อของแผน', async () => {
  await bothFlags(async (on) => {
    const typed = world();
    assert.equal((await post(typed, pageBody({ title: '  ขอเข้าวัดสองโซน  ' }))).status, 201, `flag ${on}`);
    assert.equal(headInserts(typed)[0].payload.title, 'ขอเข้าวัดสองโซน');
    const blank = world();
    assert.equal((await post(blank, pageBody({ title: '' }))).status, 201, `flag ${on}`);
    assert.equal(headInserts(blank)[0].payload.title, surveyConfirmTitle(ORIGINAL));
  });
});

test('🔴 ชุดพื้นที่ที่โพสต์มา (เกิน · ขาด · ของสถานที่อื่น · พื้นที่ใหม่) ถูกทิ้ง — แถวที่ insert = ชุดที่ยก ตามลำดับของแผน', async () => {
  await bothFlags(async (on) => {
    for (const zones of [
      [{ zoneId: 'Z-A' }, { zoneId: 'Z-C' }, { zoneId: 'Z-F' }, { name: 'โซนใหม่', floor: '1' }],
      [{ zoneId: 'Z-A' }],
      [],
      undefined,
      [{ zoneId: 'Z-A', sortOrder: 9 }, { zoneId: 'Z-B', sortOrder: 3 }],
    ]) {
      const db = world();
      const res = await post(db, pageBody({ zones }));
      assert.equal(res.status, 201, `flag ${on} ${JSON.stringify(zones)}: ${JSON.stringify(res.json)}`);
      const rows = zoneRowsOf(db, headInserts(db)[0].payload.id);
      assert.deepEqual(rows.map((r) => r.zoneId), CARRY, JSON.stringify(zones));
      assert.deepEqual(rows.map((r) => r.sortOrder), [0, 1], 'sortOrder นับตาม index ของอาร์เรย์');
    }
  });
});

test('🔴 ดีล/สถานที่ที่โพสต์มาเป็นของลูกค้าอีกราย = ถูกทิ้ง · เก็บดีล/สถานที่/ลูกค้าของใบต้นทาง', async () => {
  await bothFlags(async (on) => {
    const db = world();
    const res = await post(db, pageBody({ dealId: 'D-2', siteId: 'SITE-2', kind: 'site_survey' }));
    assert.equal(res.status, 201, `flag ${on}: ${JSON.stringify(res.json)}`);
    const [head] = headInserts(db).map((c) => c.payload);
    assert.equal(head.dealId, 'D-1');
    assert.equal(head.siteId, 'SITE-1');
    assert.equal(head.customerId, 'C-1');
    assert.equal(head.customerName, 'บริษัท ทดสอบ จำกัด');
  });
});

test('⭐ R1: โพสต์ variant "drawing" หรือไม่ส่ง variant เลย = เก็บ standard ทั้งคู่ · แถวพื้นที่ไม่มีคีย์ method', async () => {
  await bothFlags(async (on) => {
    for (const variant of ['drawing', ' drawing ', undefined, '', null]) {
      const db = world();
      const body = pageBody();
      if (variant === undefined) delete body.variant;
      else body.variant = variant;
      const res = await post(db, body);
      assert.equal(res.status, 201, `flag ${on} variant ${JSON.stringify(variant)}: ${JSON.stringify(res.json)}`);
      const [head] = headInserts(db).map((c) => c.payload);
      assert.equal(head.variant, 'standard', `flag ${on} variant ${JSON.stringify(variant)}`);
      const rows = zoneRowsOf(db, head.id);
      assert.equal(rows.length, 2);
      for (const row of rows) assert.equal('method' in row, false, `flag ${on} variant ${JSON.stringify(variant)}`);
      // ใบลงหน้างานถามวันเข้าพื้นที่ — วันของใบไม่ถูกแทนด้วยวันรับผลแบบใบจากแบบ
      assert.equal(head.requestedDueDate, VISIT);
      assert.equal(head.requestedDueTime, '10:00');
    }
  });
});

test('ลงหน้างาน = ถามวันเข้าพื้นที่เหมือนใบปกติ — ไม่ส่งวันเข้า = 400 ไม่มีอะไรถูกเขียน', async () => {
  await bothFlags(async (on) => {
    const db = world();
    const res = await post(db, pageBody({ requestedDueDate: '', variant: 'drawing' }));
    assert.equal(res.status, 400, `flag ${on}: ${JSON.stringify(res.json)}`);
    assert.deepEqual(anyWrites(db), []);
  });
});

test('audit ของการสร้าง: สรุปลงท้าย " · ใบยืนยันหน้างานของ {RQ}" · after มีลิงก์', async () => {
  await bothFlags(async (on) => {
    const db = world();
    const res = await post(db, pageBody());
    assert.equal(res.status, 201, `flag ${on}`);
    const audits = db.tables.audit_logs.filter((a) => a.entityType === 'dept_request');
    assert.equal(audits.length, 1);
    const [row] = audits;
    assert.equal(row.action, 'create');
    assert.equal(row.entityId, res.json.id);
    assert.ok(row.summary.endsWith(surveyConfirmAuditSuffix(ORIGINAL)), row.summary);
    assert.ok(row.summary.endsWith(` · ใบยืนยันหน้างานของ ${ORIG_DOC}`), row.summary);
    assert.equal(row.after.surveyConfirmOfId, 'DR-O');
  });
});

test('🔴 POST ใบปกติ (ไม่มี confirmsRequestId) = ไม่มีคีย์ surveyConfirmOfId ในก้อน insert เลย (บทเรียน PostgREST ของ quotationId) · ไม่อ่านใบอื่น', async () => {
  await bothFlags(async (on) => {
    const db = world();
    const body = pageBody({ title: 'ประเมินพื้นที่ใหม่' });
    delete body.confirmsRequestId;
    const res = await post(db, body);
    assert.equal(res.status, 201, `flag ${on}: ${JSON.stringify(res.json)}`);
    const [head] = headInserts(db).map((c) => c.payload);
    assert.equal('surveyConfirmOfId' in head, false);
    assert.equal(head.title, 'ประเมินพื้นที่ใหม่');
    assert.ok(!db.tables.audit_logs.some((a) => /ใบยืนยันหน้างานของ/.test(a.summary || '')));
    // ไม่มีคำสั่งอ่านลูกของใบไหน (ทางปกติไม่จ่ายค่าใบยืนยัน)
    assert.ok(!db.calls.some((c) => c.filters.some(([, col]) => col === 'surveyConfirmOfId')));
  });
});

/* ═══ ③ ด่าน — ตอบก่อนเขียนอะไร ═════════════════════════════════════════════════════════════════ */

test('N7: confirmsRequestId กับหัวข้ออื่น = 400 ก่อนอ่าน/เขียนอะไรทั้งนั้น', async () => {
  await bothFlags(async (on) => {
    for (const kind of ['info', 'document', undefined]) {
      const db = world();
      const res = await post(db, { kind, dept: 'RD', title: 'สอบถาม', dealId: 'D-1', requestedDueDate: VISIT, confirmsRequestId: 'DR-O' });
      assert.equal(res.status, 400, `flag ${on} ${kind}`);
      assert.equal(res.json.error, SURVEY_CONFIRM_KIND_ERROR);
      assert.deepEqual(db.calls, [], `flag ${on} ${kind}: ไม่มีแม้แต่คำสั่งอ่าน`);
    }
  });
});

test('N4: id ที่ไม่มีจริง · ใบที่ไม่ใช่ประเมินพื้นที่ · id รูปแปลก = 404 · ไม่มีอะไรถูกเขียน', async () => {
  await bothFlags(async (on) => {
    const info = { id: 'DR-I', kind: 'info', dept: 'RD', status: 'answered', requestedById: 'sa-1', team: 'KA', answeredAt: SURVEYED };
    for (const id of ['DR-NOPE', 'DR-I', '../x', '', 42, { id: 'DR-O' }]) {
      const db = world({ extraRequests: [info] });
      const res = await post(db, pageBody({ confirmsRequestId: id }));
      assert.equal(res.status, 404, `flag ${on} ${JSON.stringify(id)}: ${JSON.stringify(res.json)}`);
      assert.equal(res.json.error, SURVEY_CONFIRM_NO_ORIGINAL);
      assert.equal(res.json.code, 'confirm_no_original');
      assert.deepEqual(anyWrites(db), []);
    }
  });
});

test('N5: คนที่จัดการใบต้นทางไม่ได้ = 403 ประโยคบอกเลขใบ · ไม่มีอะไรถูกเขียน', async () => {
  await bothFlags(async (on) => {
    const db = world();
    const res = await post(db, pageBody(), STRANGER);
    assert.equal(res.status, 403, `flag ${on}`);
    assert.equal(res.json.error, surveyConfirmForbiddenText(ORIGINAL));
    assert.match(res.json.error, new RegExp(ORIG_DOC));
    assert.deepEqual(anyWrites(db), []);
  });
});

test('N2: ใบต้นทางถูกดึงผลกลับระหว่างโหลดหน้ากับกดบันทึก = 409 confirm_not_sent · ไม่มีอะไรถูกเขียน', async () => {
  await bothFlags(async (on) => {
    const db = world({ original: { answeredAt: null, status: 'acknowledged', surveyConfirm: null } });
    const res = await post(db, pageBody());
    assert.equal(res.status, 409, `flag ${on}`);
    assert.equal(res.json.code, 'confirm_not_sent');
    assert.match(res.json.error, /ยังไม่มีผลที่ส่งแล้ว/);
    assert.deepEqual(anyWrites(db), []);
  });
});

test('N3: หัวหน้าตอบ "ไม่ต้องยืนยันหน้างาน" = 409 confirm_not_needed', async () => {
  await bothFlags(async (on) => {
    const db = world({ original: { surveyConfirm: 'not_needed' } });
    const res = await post(db, pageBody());
    assert.equal(res.status, 409, `flag ${on}`);
    assert.equal(res.json.code, 'confirm_not_needed');
    assert.deepEqual(anyWrites(db), []);
  });
});

test('⭐ N1: เพื่อนร่วมทีมบันทึกร่างที่สอง = 409 confirm_open ประโยคร่าง + open ชี้ร่างแรก · ร่างยังเหลือใบเดียว', async () => {
  await bothFlags(async (on) => {
    const db = world();
    const first = await post(db, pageBody());
    assert.equal(first.status, 201, `flag ${on}`);
    const second = await post(db, pageBody(), MATE);
    assert.equal(second.status, 409, `flag ${on}: ${JSON.stringify(second.json)}`);
    assert.equal(second.json.code, 'confirm_open');
    assert.equal(second.json.error, 'มีร่างใบยืนยันหน้างานที่ยังไม่ส่งอยู่แล้ว — เปิดร่างนั้นเพื่อส่ง หรือลบร่างก่อน');
    assert.equal(second.json.open.id, first.json.id);
    assert.equal(second.json.open.docNo, null);
    assert.equal(drafts(db).length, 1);
    assert.equal(headInserts(db).length, 1);
  });
});

test('ใบยืนยันที่ยื่นแล้วยังเปิดอยู่ = 409 confirm_open บอกเลขที่และสถานะ', async () => {
  await bothFlags(async (on) => {
    const child = {
      id: 'DR-C1', kind: 'site_survey', docNo: 'RQ-AS-26100361', status: 'pending', surveyConfirmOfId: 'DR-O',
      createdAt: '2026-10-20T03:00:00.000Z', requestedById: 'sa-1', team: 'KA',
    };
    const db = world({ extraRequests: [child] });
    const res = await post(db, pageBody());
    assert.equal(res.status, 409, `flag ${on}`);
    assert.equal(res.json.code, 'confirm_open');
    assert.match(res.json.error, /RQ-AS-26100361/);
    assert.equal(res.json.open.id, 'DR-C1');
    assert.deepEqual(anyWrites(db), []);
  });
});

test('⭐ N11: พื้นที่ที่ยกถูกใบลงหน้างานที่ไม่ผูก (ยังเปิด) ถืออยู่ = 409 confirm_zone_busy · open = ใบนั้น · ไม่มีอะไรถูกเขียน', async () => {
  await bothFlags(async (on) => {
    const holder = {
      id: 'DR-U', kind: 'site_survey', docNo: 'RQ-AS-26100009', status: 'pending', surveyConfirmOfId: null,
      createdAt: '2026-10-28T03:00:00.000Z', requestedById: 'sa-3', team: 'KB',
    };
    const db = world({
      extraRequests: [holder],
      extraRows: [{ id: 'SV-U1', requestId: 'DR-U', zoneId: 'Z-A', zoneName: 'โซนล็อบบี้', sortOrder: 0, status: 'pending', parts: [], surveyedAt: null }],
    });
    const res = await post(db, pageBody());
    assert.equal(res.status, 409, `flag ${on}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.code, 'confirm_zone_busy');
    assert.equal(res.json.open.id, 'DR-U');
    assert.equal(res.json.open.docNo, 'RQ-AS-26100009');
    assert.match(res.json.error, /RQ-AS-26100009/);
    assert.deepEqual(anyWrites(db), []);
  });
});

test('อ่านใบต้นทาง / อ่านบริบทพัง = 500 ไม่มีอะไรถูกเขียน (อ่านไม่ได้ ≠ ไม่มี)', async () => {
  const isOriginalRead = (q) => q.table === 'dept_requests' && !q.write && q.single === 'maybe';
  const isContextRead = (q) => q.table === 'service_survey_zones' && !q.write && q.filters.some(([op, col]) => op === 'in' && col === 'zoneId');
  await bothFlags(async (on) => {
    for (const pick of [isOriginalRead, isContextRead]) {
      const db = world({ hook: (q) => (pick(q) ? { data: null, error: { message: 'อ่านไม่ได้' } } : undefined) });
      const res = await post(db, pageBody());
      assert.equal(res.status, 500, `flag ${on}: ${JSON.stringify(res.json)}`);
      assert.deepEqual(anyWrites(db), []);
    }
  });
});

/* ═══ ④ insert ล้ม แล้วกดซ้ำ ═════════════════════════════════════════════════════════════════════ */

function failOnce(pick) {
  let failed = false;
  return (q) => {
    if (failed || !pick(q)) return undefined;
    failed = true;
    return { data: null, error: { message: 'ล้มกลางทาง' } };
  };
}

test('🔴 insert หัวล้ม = 500 ไม่มีหัวค้าง · กดซ้ำ = ร่างใบเดียวที่ถือลิงก์', async () => {
  await bothFlags(async (on) => {
    const db = world({ hook: failOnce((q) => q.table === 'dept_requests' && q.write === 'insert') });
    const first = await post(db, pageBody());
    assert.equal(first.status, 500, `flag ${on}`);
    assert.equal(drafts(db).length, 0);
    assert.equal(db.tables.service_survey_zones.length, originalRows().length);
    const again = await post(db, pageBody());
    assert.equal(again.status, 201, `flag ${on}: ${JSON.stringify(again.json)}`);
    assert.equal(drafts(db).length, 1);
    assert.deepEqual(zoneRowsOf(db, again.json.id).map((r) => r.zoneId), CARRY);
  });
});

test('🔴 insert แถวพื้นที่ล้ม = ลบหัวทิ้ง 500 · กดซ้ำ = ร่างใบเดียว ชุดพื้นที่ชุดเดียว (ไม่ติด N1 เพราะร่างแรกถูกลบแล้ว)', async () => {
  await bothFlags(async (on) => {
    const db = world({ hook: failOnce((q) => q.table === 'service_survey_zones' && q.write === 'insert') });
    const first = await post(db, pageBody());
    assert.equal(first.status, 500, `flag ${on}`);
    assert.equal(drafts(db).length, 0, 'ไม่มีหัวกำพร้าที่ถือลิงก์');
    assert.equal(db.writes('dept_requests').filter((c) => c.write === 'delete').length, 1);
    const again = await post(db, pageBody());
    assert.equal(again.status, 201, `flag ${on}: ${JSON.stringify(again.json)}`);
    assert.equal(drafts(db).length, 1);
    const rows = db.tables.service_survey_zones.filter((r) => r.requestId !== 'DR-O');
    assert.deepEqual(rows.map((r) => r.zoneId), CARRY);
    assert.ok(rows.every((r) => r.requestId === again.json.id));
  });
});

test('🔴 อ่านกลับ (findRequest) ล้มหลังเขียนครบ = 500 · ร่างที่ครบถูกเก็บ · กดซ้ำ = N1 ชี้ร่างนั้น ⇒ ร่างเดียว', async () => {
  const isReadBack = (q) => q.table === 'dept_requests' && !q.write && Array.isArray(q.range)
    && q.filters.some(([op, col, val]) => op === 'eq' && col === 'id' && val !== 'DR-O');
  await bothFlags(async (on) => {
    const db = world({ hook: failOnce(isReadBack) });
    const first = await post(db, pageBody());
    assert.equal(first.status, 500, `flag ${on}: ${JSON.stringify(first.json)}`);
    const [draft] = drafts(db);
    assert.ok(draft, 'หัวกับแถวพื้นที่ลงครบแล้ว');
    assert.deepEqual(zoneRowsOf(db, draft.id).map((r) => r.zoneId), CARRY);
    const again = await post(db, pageBody());
    assert.equal(again.status, 409, `flag ${on}: ${JSON.stringify(again.json)}`);
    assert.equal(again.json.code, 'confirm_open');
    assert.equal(again.json.open.id, draft.id);
    assert.equal(drafts(db).length, 1);
  });
});

/* ═══ ⑤ GET ค่าตั้งต้นของฟอร์มล็อก ═══════════════════════════════════════════════════════════════ */

test('⭐ GET confirm-plan: 200 รูป §2.3 — ใบต้นทาง (ป้ายดีล/สถานที่) · ชื่อเรื่อง · พื้นที่ที่ยกตามลำดับพร้อมรอบจากแบบ · ไม่เขียนอะไร', async () => {
  await bothFlags(async (on) => {
    const db = world();
    const res = await getPlan(db);
    assert.equal(res.status, 200, `flag ${on}: ${JSON.stringify(res.json)}`);
    assert.deepEqual(Object.keys(res.json).sort(), ['original', 'title', 'zones']);
    assert.deepEqual(res.json.original, {
      id: 'DR-O', docNo: ORIG_DOC, title: ORIGINAL.title, dept: 'TS',
      dealId: 'D-1', dealLabel: 'DL-0001 — ติดตั้งเครื่องหอม โรงแรมทดสอบ',
      customerId: 'C-1', customerName: 'บริษัท ทดสอบ จำกัด',
      siteId: 'SITE-1', siteLabel: 'SS-0001 · โรงแรมทดสอบ',
    });
    assert.equal(res.json.title, surveyConfirmTitle(ORIGINAL));
    const [spa, lobby] = originalRows();
    assert.deepEqual(res.json.zones, [
      { zoneId: 'Z-B', name: 'โซนสปา', code: 'ZN-0002', floor: '2', previous: surveyConfirmPreviousRoundText(spa, ORIG_DOC) },
      { zoneId: 'Z-A', name: 'โซนล็อบบี้', code: 'ZN-0001', floor: 'G', previous: surveyConfirmPreviousRoundText(lobby, ORIG_DOC) },
    ]);
    for (const zone of res.json.zones) assert.ok(zone.previous.startsWith(`รอบจากแบบ (${ORIG_DOC}): `), zone.previous);
    assert.deepEqual(anyWrites(db), []);
  });
});

test('GET confirm-plan: ไม่มีสิทธิ์ดูคำร้อง = 403 forbidden · ไม่แตะฐาน', async () => {
  const db = world();
  const res = await getPlan(db, 'DR-O', null);
  assert.equal(res.status, 403);
  assert.deepEqual(db.calls, []);
});

test('GET confirm-plan: 404 N4 (ไม่มีจริง · ไม่ใช่ประเมินพื้นที่ · id รูปแปลก) — original เป็น null', async () => {
  const info = { id: 'DR-I', kind: 'info', dept: 'RD', status: 'answered', requestedById: 'sa-1', team: 'KA', answeredAt: SURVEYED };
  for (const id of ['DR-NOPE', 'DR-I', '..%2Fx', 'DR-O/../x']) {
    const db = world({ extraRequests: [info] });
    const res = await getPlan(db, id);
    assert.equal(res.status, 404, id);
    assert.deepEqual(res.json, { error: SURVEY_CONFIRM_NO_ORIGINAL, code: 'confirm_no_original', open: null, original: null }, id);
    assert.deepEqual(anyWrites(db), []);
  }
});

test('GET confirm-plan: 403 N5 พร้อม original ให้ลิงก์ย้อนกลับ', async () => {
  const db = world();
  const res = await getPlan(db, 'DR-O', STRANGER);
  assert.equal(res.status, 403);
  assert.deepEqual(res.json, { error: surveyConfirmForbiddenText(ORIGINAL), original: { id: 'DR-O', docNo: ORIG_DOC } });
});

test('GET confirm-plan: ทุก 409 ของแผนพก { error, code, open, original } — ไม่มีข้อมูลฟอร์ม', async () => {
  const child = {
    id: 'DR-C1', kind: 'site_survey', docNo: null, status: 'draft', surveyConfirmOfId: 'DR-O',
    createdAt: '2026-10-20T03:00:00.000Z', requestedById: 'sa-1', team: 'KA',
  };
  const holder = { id: 'DR-U', kind: 'site_survey', docNo: 'RQ-AS-26100009', status: 'acknowledged', createdAt: '2026-10-28T03:00:00.000Z' };
  const cases = [
    ['confirm_open', { extraRequests: [child] }, 'DR-C1'],
    ['confirm_zone_busy', {
      extraRequests: [holder],
      extraRows: [{ id: 'SV-U1', requestId: 'DR-U', zoneId: 'Z-B', zoneName: 'โซนสปา', sortOrder: 0, status: 'pending', parts: [] }],
    }, 'DR-U'],
    ['confirm_not_sent', { original: { answeredAt: null } }, null],
    ['confirm_not_needed', { original: { surveyConfirm: 'not_needed' } }, null],
  ];
  for (const [code, setup, openId] of cases) {
    const db = world(setup);
    const res = await getPlan(db);
    assert.equal(res.status, 409, code);
    assert.deepEqual(Object.keys(res.json).sort(), ['code', 'error', 'open', 'original'], code);
    assert.equal(res.json.code, code);
    assert.deepEqual(res.json.original, { id: 'DR-O', docNo: ORIG_DOC }, code);
    assert.equal(res.json.open?.id ?? null, openId, code);
    assert.doesNotMatch(res.json.error, NO_REMOVE_ADVICE, code);
    assert.deepEqual(anyWrites(db), [], code);
  }
});

test('GET confirm-plan: พื้นที่จากแบบถูกยืนยันครบแล้ว = 409 confirm_none_left', async () => {
  const onsite = { id: 'DR-M', kind: 'site_survey', docNo: 'RQ-AS-26100100', status: 'answered', answeredAt: '2026-10-10T03:00:00.000Z', createdAt: '2026-10-08T03:00:00.000Z' };
  const measured = (id, zoneId) => ({ id, requestId: 'DR-M', zoneId, zoneName: zoneId, sortOrder: 0, status: 'done', parts: [part(4, 4)], surveyedAt: '2026-10-09T03:00:00.000Z' });
  const db = world({ extraRequests: [onsite], extraRows: [measured('SV-M1', 'Z-A'), measured('SV-M2', 'Z-B')] });
  const res = await getPlan(db);
  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'confirm_none_left');
});

test('⭐ R13: สถานที่ของใบต้นทางถูกย้ายไปลูกค้าอีกราย = 409 confirm_site_customer ประโยคของ loadSurveySite · ไม่มีข้อมูลฟอร์ม', async () => {
  const moved = SITES.map((s) => (s.id === 'SITE-1' ? { ...s, customerId: 'C-2' } : s));
  await bothFlags(async (on) => {
    const db = world({ sites: moved });
    const res = await getPlan(db);
    assert.equal(res.status, 409, `flag ${on}`);
    assert.deepEqual(res.json, {
      error: 'สถานที่ SS-0001 เป็นของลูกค้ารายอื่น',
      code: 'confirm_site_customer',
      open: null,
      original: { id: 'DR-O', docNo: ORIG_DOC },
    });
    // POST พูดประโยคเดียวกัน (ด่านเดิมของ POST — ไม่ใช่ของใหม่)
    const created = await post(world({ sites: moved }), pageBody());
    assert.equal(created.status, 400);
    assert.equal(created.json.error, res.json.error);
  });
});

test('GET confirm-plan: อ่านใบต้นทาง / บริบท / ดีล / ทะเบียนโซนพัง = 500 · ไม่ตอบข้อมูลครึ่งเดียว', async () => {
  const picks = [
    (q) => q.table === 'dept_requests' && q.single === 'maybe',
    (q) => q.table === 'service_survey_zones' && q.filters.some(([op, col]) => op === 'eq' && col === 'requestId'),
    (q) => q.table === 'sales_deals',
    (q) => q.table === 'service_sites',
    (q) => q.table === 'service_zones',
  ];
  for (const [index, pick] of picks.entries()) {
    const db = world({ hook: (q) => (pick(q) ? { data: null, error: { message: 'อ่านไม่ได้' } } : undefined) });
    const res = await getPlan(db);
    assert.equal(res.status, 500, `จุดที่ ${index + 1}: ${JSON.stringify(res.json)}`);
    assert.equal('zones' in res.json, false);
    assert.deepEqual(anyWrites(db), []);
  }
});
