// ── ขั้นเข้าติดตั้ง PR-2b: คำขอคิวติดตั้งฝั่งฝ่ายขาย (ตัวตัดสิน + ตัวจัดการ API ด้วยฐานปลอม) ───────────────
//
// ⭐ มติเจ้าของ 02/11 + 09/11/2026: SA เลือกรายไซต์ ติดตั้ง/Service · ขอคิวได้หลังใบอนุมัติและงานบริการอนุมัติ ·
//    แก้วันที่ขอเองได้จนกว่า TS ยืนยันวัน · กระดิ่งถึงหัวหน้า TS + Planner
// ⚠️ ไม่มีอะไรต่อฐานจริง — ตัวโหลดบริบทถูกแทนด้วยโลกย่อส่วน (deps) · ตัวเขียนเป็นอาร์เรย์ในหน่วยความจำ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INSTALL_REQUEST_TEXT, installModeError, installOrderError, installRequestInput, installSitesView,
} from './installRequest.js';
import { installModePut, installRequestPost, installGet } from './installRequestRoute.js';
import { INSTALL_REQUESTED_KIND, installRequestedNotice } from './installNotify.js';
import { NOTIFICATION_BOXES, SERVICE_BELL_KINDS } from '../notifications.js';

const TODAY = '2026-11-20';
const ORDER = {
  id: 'SO1', orderNumber: 'SO-26110012-0', status: 'approved', origin: 'pipeline', supersededById: null,
  serviceTermsOpenedAt: '2026-11-19T03:00:00Z', totalAmount: 108000, customerName: 'บริษัท เซ็นทรัล ฟู้ด รีเทล จำกัด',
};
const ctxOf = (order = ORDER, installments = [{ id: 'I1', seq: 1, label: 'มัดจำ 30%', amount: 32400, status: 'reported', beforeInstall: true }]) => ({
  order,
  installments,
  allocations: [
    { zoneId: 'Z1', packsPerRound: 2, sortOrder: 1 }, { zoneId: 'Z2', packsPerRound: 1, sortOrder: 2 },
    { zoneId: 'Z3', packsPerRound: 1, sortOrder: 3 }, { zoneId: 'Z9', packsPerRound: 1, sortOrder: 4 },
  ],
  zonesById: new Map([
    ['Z1', { id: 'Z1', code: 'ZN-01', name: 'ทางเข้าหลัก', siteId: 'S1' }],
    ['Z2', { id: 'Z2', code: 'ZN-02', name: 'โซนผักผลไม้', siteId: 'S1' }],
    ['Z3', { id: 'Z3', code: 'ZN-03', name: 'แคชเชียร์', siteId: 'S1' }],
    ['Z9', { id: 'Z9', code: 'ZN-91', name: 'ล็อบบี้', siteId: 'S2' }],
  ]),
  sitesById: new Map([['S1', { id: 'S1', code: 'ST-0412-01', name: 'สาขา FASHION' }], ['S2', { id: 'S2', code: 'ST-0412-03', name: 'สาขา สีลม' }]]),
});

// ── ด่านระดับใบ ──────────────────────────────────────────────────────────────────────
test('ด่านใบ: สวิตช์ · สิทธิ์ · ย้อนหลัง · ถูก Rev. ทับ · ยังไม่อนุมัติ · งานบริการยังไม่อนุมัติ', () => {
  const on = { canEdit: true, enabled: true };
  assert.equal(installOrderError(ORDER, on), null);
  assert.equal(installOrderError(ORDER, { canEdit: true }), INSTALL_REQUEST_TEXT.off);
  assert.equal(installOrderError(ORDER, { enabled: true }), INSTALL_REQUEST_TEXT.noRight);
  assert.equal(installOrderError({ ...ORDER, origin: 'historical' }, on), INSTALL_REQUEST_TEXT.historical);
  assert.equal(installOrderError({ ...ORDER, supersededById: 'SO2' }, on), INSTALL_REQUEST_TEXT.superseded);
  assert.equal(installOrderError({ ...ORDER, status: 'pending' }, on), INSTALL_REQUEST_TEXT.notApproved);
  assert.equal(installOrderError({ ...ORDER, serviceTermsOpenedAt: null }, on), INSTALL_REQUEST_TEXT.termsClosed);
});

test('โหมด: ติดตั้ง/Service เท่านั้น · มีนัดติดตั้งที่ยังมีชีวิต = เปลี่ยนเป็น Service ไม่ได้', () => {
  const req = { id: 'R1', mode: 'install' };
  assert.equal(installModeError({ mode: 'install' }), null);
  assert.equal(installModeError({ mode: 'x' }), INSTALL_REQUEST_TEXT.modeInvalid);
  assert.equal(installModeError({ mode: 'none', request: req, visits: [{ id: 'V1', installRequestId: 'R1', status: 'draft' }] }), INSTALL_REQUEST_TEXT.modeLocked);
  assert.equal(installModeError({ mode: 'none', request: req, visits: [{ id: 'V1', installRequestId: 'R1', status: 'cancelled' }] }), null);
});

test('ค่าที่ขอคิว: โซนต้องอยู่ในไซต์ · วันห้ามย้อน · เวลาคู่และเรียง · ตัดช่องว่าง', () => {
  const opts = { siteZoneIds: ['Z1', 'Z2', 'Z3'], todayIso: TODAY };
  const ok = installRequestInput({ zoneIds: ['Z1', 'Z2', 'Z1'], requestedDate: '2026-11-24', requestedStartTime: '09:00', requestedEndTime: '12:00', contactName: '  คุณวิภาวดี  ' }, opts);
  assert.deepEqual(ok.value.zoneIds, ['Z1', 'Z2']);
  assert.equal(ok.value.contactName, 'คุณวิภาวดี');
  assert.equal(installRequestInput({ zoneIds: [], requestedDate: '2026-11-24' }, opts).error, INSTALL_REQUEST_TEXT.zonesRequired);
  assert.equal(installRequestInput({ zoneIds: ['Z9'], requestedDate: '2026-11-24' }, opts).error, INSTALL_REQUEST_TEXT.zoneNotInSite);
  assert.equal(installRequestInput({ zoneIds: ['Z1'], requestedDate: '2026-11-19' }, opts).error, INSTALL_REQUEST_TEXT.datePast);
  assert.equal(installRequestInput({ zoneIds: ['Z1'], requestedDate: '24/11/2026' }, opts).error, INSTALL_REQUEST_TEXT.dateInvalid);
  assert.equal(installRequestInput({ zoneIds: ['Z1'], requestedDate: '2026-11-24', requestedStartTime: '09:00' }, opts).error, INSTALL_REQUEST_TEXT.timePair);
  assert.equal(installRequestInput({ zoneIds: ['Z1'], requestedDate: '2026-11-24', requestedStartTime: '13:00', requestedEndTime: '12:00' }, opts).error, INSTALL_REQUEST_TEXT.timeOrder);
  assert.equal(installRequestInput({ zoneIds: ['Z1'], requestedDate: '2026-11-24', requestedStartTime: '25:00', requestedEndTime: '26:00' }, opts).error, INSTALL_REQUEST_TEXT.timeInvalid);
});

test('ค่าที่ขอคิว: TS ยืนยันวันแล้ว = แก้เองไม่ได้ · ไซต์ Service = ต้องเปลี่ยนเป็นติดตั้งก่อน', () => {
  const opts = { siteZoneIds: ['Z1'], todayIso: TODAY };
  const req = { id: 'R1', mode: 'install' };
  const confirmed = [{ id: 'V1', installRequestId: 'R1', status: 'draft', tsConfirmedAt: '2026-11-21T02:00:00Z' }];
  assert.equal(installRequestInput({ zoneIds: ['Z1'], requestedDate: '2026-11-24' }, { ...opts, request: req, visits: confirmed }).error, INSTALL_REQUEST_TEXT.tsConfirmed);
  assert.equal(installRequestInput({ zoneIds: ['Z1'], requestedDate: '2026-11-24' }, { ...opts, request: { id: 'R1', mode: 'none' } }).error, INSTALL_REQUEST_TEXT.modeNotInstall);
});

test('ภาพรวมไซต์: ยังไม่เลือก · Service · ขอคิวบางโซน (โซนที่ไม่ได้ขอไม่มีขั้น) · มัดจำ · พร้อมทำสัญญา', () => {
  const requests = [
    { id: 'R1', siteId: 'S1', mode: 'install', requestedAt: '2026-11-20T03:42:00Z', requestedDate: '2026-11-24' },
    { id: 'R2', siteId: 'S2', mode: 'none', requestedAt: null },
  ];
  const view = installSitesView(ctxOf(), { requests, requestZones: [{ requestId: 'R1', zoneId: 'Z1' }, { requestId: 'R1', zoneId: 'Z2' }] });
  assert.equal(view.deposit.state, 'blocked');
  const s1 = view.sites.find((s) => s.siteId === 'S1');
  assert.equal(s1.stage, 'awaiting_deposit');
  assert.deepEqual(s1.zones.map((z) => [z.zoneId, z.requested, z.stage]), [['Z1', true, 'awaiting_deposit'], ['Z2', true, 'awaiting_deposit'], ['Z3', false, null]]);
  assert.equal(s1.zones[0].packsPerRound, 2);
  assert.equal(view.sites.find((s) => s.siteId === 'S2').stage, 'service');
  assert.deepEqual(view.readiness, { ready: false, done: 0, total: 1, undecided: 0 });

  const fresh = installSitesView(ctxOf(ORDER, []), {});
  assert.ok(fresh.sites.every((s) => s.stage === 'undecided'));
  assert.equal(fresh.deposit.state, 'ok', 'ไม่มีงวดก่อนติดตั้ง = ผ่าน');
});

// ── กระดิ่ง ─────────────────────────────────────────────────────────────────────────────
test('กระดิ่ง: หัวหน้า TS + Planner ได้ · ช่าง/คนกดเอง/บัญชีปิด ไม่ได้ · ลงกล่องกระดิ่ง', () => {
  const users = [
    { id: 'U1', role: 'ts_manager' }, { id: 'U2', role: 'ts_planner' }, { id: 'U3', role: 'ts' },
    { id: 'U4', role: 'ts_senior', disabled: true }, { id: 'U5', role: 'ts_audit' },
  ];
  const notice = installRequestedNotice({
    request: { id: 'R1', requestedAt: '2026-11-20T03:42:00Z', requestedDate: '2026-11-24', requestedStartTime: '09:00', requestedEndTime: '12:00' },
    order: ORDER, site: { code: 'ST-0412-01', name: 'สาขา FASHION' }, zoneCount: 3, users, actor: { id: 'U5', name: 'กมลรัตน์' },
  });
  assert.deepEqual(notice.userIds.sort(), ['U1', 'U2']);
  assert.equal(notice.kind, INSTALL_REQUESTED_KIND);
  assert.match(notice.body, /3 โซน · ต้องการ 24\/11\/2026 09:00–12:00/);
  assert.ok(SERVICE_BELL_KINDS.includes(INSTALL_REQUESTED_KIND));
  assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(INSTALL_REQUESTED_KIND));
});

// ── ตัวจัดการ API ด้วยฐานปลอม ──────────────────────────────────────────────────────────────
const ADMIN = { id: 'U-ADM', role: 'admin', name: 'แอดมิน', teams: [] };
const FN = { id: 'U-FN', role: 'finance', department: 'FN', name: 'บัญชี', teams: [] };

function memoryDb(seed = {}) {
  const tables = { service_install_requests: [], service_install_request_zones: [], ...structuredClone(seed) };
  const from = (table) => {
    const st = { op: 'select', preds: [], values: null, single: false };
    const b = {
      select() { return b; }, order() { return b; },
      insert(rows) { st.op = 'insert'; st.values = Array.isArray(rows) ? rows : [rows]; return b; },
      update(patch) { st.op = 'update'; st.values = patch; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(col, v) { st.preds.push((r) => r[col] === v); return b; },
      in(col, vs) { st.preds.push((r) => vs.includes(r[col])); return b; },
      maybeSingle() { st.single = true; return b; },
      then(resolve, reject) {
        const rows = (tables[table] ||= []);
        const hit = rows.filter((r) => st.preds.every((p) => p(r)));
        let out = hit;
        if (st.op === 'insert') {
          for (const row of st.values) {
            if (table === 'service_install_requests' && rows.some((r) => r.salesOrderId === row.salesOrderId && r.siteId === row.siteId)) {
              return Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }).then(resolve, reject);
            }
          }
          rows.push(...st.values.map((r) => ({ ...r })));
          out = st.values;
        } else if (st.op === 'update') {
          for (const r of hit) Object.assign(r, st.values);
          out = hit;
        } else if (st.op === 'delete') {
          tables[table] = rows.filter((r) => !hit.includes(r));
          out = hit;
        }
        const data = st.single ? (out[0] ? { ...out[0] } : null) : out.map((r) => ({ ...r }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return b;
  };
  return { client: { from }, tables };
}

function harness({ order = ORDER, visits = [], seed = {} } = {}) {
  const db = memoryDb(seed);
  const audits = [];
  const notices = [];
  const deps = {
    scope: async () => ({ order }),
    load: async () => ({
      ctx: ctxOf(order),
      requests: db.tables.service_install_requests.filter((r) => r.salesOrderId === order.id),
      requestZones: db.tables.service_install_request_zones,
      visits, visitZonesByVisitId: {}, doneZonesByVisitId: {},
    }),
  };
  const common = {
    supabase: db.client, id: order.id, enabled: true, deps,
    audit: async (e) => { audits.push(e); }, now: () => '2026-11-20T03:42:00.000Z',
  };
  return { db, audits, notices, common, notify: (_s, args) => notices.push(args) };
}

test('API ขอคิว: ครั้งแรก = สร้างคำขอโหมดติดตั้ง + โซน + audit + กระดิ่ง', async () => {
  const h = harness();
  const res = await installRequestPost({
    ...h.common, user: ADMIN, notify: h.notify, todayIso: TODAY,
    body: { siteId: 'S1', zoneIds: ['Z1', 'Z2', 'Z3'], requestedDate: '2026-11-24', requestedStartTime: '09:00', requestedEndTime: '12:00', contactName: 'คุณวิภาวดี', contactPhone: '081-234-5678' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [row] = h.db.tables.service_install_requests;
  assert.equal(row.mode, 'install');
  assert.equal(row.requestedAt, '2026-11-20T03:42:00.000Z');
  assert.equal(row.decidedById, ADMIN.id);
  assert.deepEqual(h.db.tables.service_install_request_zones.map((z) => z.zoneId).sort(), ['Z1', 'Z2', 'Z3']);
  assert.equal(h.audits.length, 1);
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].changed, false);
  assert.equal(h.notices[0].zoneCount, 3);
});

test('API ขอคิว: แก้คำขอ = เพิ่ม/ลบโซนตามที่เลือกใหม่ · กระดิ่งบอกว่าแก้ · updatedAt ไม่ตรง = 409', async () => {
  const seed = {
    service_install_requests: [{ id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-11-19T01:00:00Z', requestedDate: '2026-11-24', updatedAt: 'T0' }],
    service_install_request_zones: [{ requestId: 'R1', zoneId: 'Z1' }, { requestId: 'R1', zoneId: 'Z3' }],
  };
  const h = harness({ seed });
  const res = await installRequestPost({ ...h.common, user: ADMIN, notify: h.notify, todayIso: TODAY, body: { siteId: 'S1', zoneIds: ['Z1', 'Z2'], requestedDate: '2027-01-06' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(h.db.tables.service_install_request_zones.map((z) => z.zoneId).sort(), ['Z1', 'Z2']);
  assert.equal(h.db.tables.service_install_requests[0].requestedDate, '2027-01-06');
  assert.equal(h.notices[0].changed, true);

  const stale = harness({ seed });
  stale.db.tables.service_install_requests[0].updatedAt = 'T-other';
  const loader = stale.common.deps.load;
  stale.common.deps = { ...stale.common.deps, load: async () => { const s = await loader(); return { ...s, requests: [{ ...s.requests[0], updatedAt: 'T0' }] }; } };
  const res2 = await installRequestPost({ ...stale.common, user: ADMIN, notify: stale.notify, todayIso: TODAY, body: { siteId: 'S1', zoneIds: ['Z1'], requestedDate: '2027-01-06' } });
  assert.equal(res2.status, 409);
});

test('API ขอคิว: TS ยืนยันวันแล้ว = 409 · สวิตช์ปิด = 409 · ไม่มีสิทธิ์ = 403 · ไซต์ไม่อยู่ในใบ = 400', async () => {
  const seed = { service_install_requests: [{ id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-11-19T01:00:00Z', requestedDate: '2026-11-24', updatedAt: 'T0' }] };
  const h = harness({ seed, visits: [{ id: 'V1', installRequestId: 'R1', status: 'draft', tsConfirmedAt: '2026-11-20T01:00:00Z' }] });
  const body = { siteId: 'S1', zoneIds: ['Z1'], requestedDate: '2027-01-06' };
  assert.equal((await installRequestPost({ ...h.common, user: ADMIN, notify: h.notify, todayIso: TODAY, body })).status, 409);
  assert.equal((await installRequestPost({ ...h.common, enabled: false, user: ADMIN, notify: h.notify, todayIso: TODAY, body })).status, 409);
  assert.equal((await installRequestPost({ ...h.common, user: FN, notify: h.notify, todayIso: TODAY, body })).status, 403);
  assert.equal((await installRequestPost({ ...h.common, user: ADMIN, notify: h.notify, todayIso: TODAY, body: { ...body, siteId: 'S-x' } })).status, 400);
  assert.equal(h.notices.length, 0);
});

test('API โหมด: เลือก Service ครั้งแรก = สร้างแถว none · เปลี่ยนติดตั้ง → Service ล้างวัน/โซน · มีนัดค้าง = 409', async () => {
  const h = harness();
  const r1 = await installModePut({ ...h.common, user: ADMIN, body: { siteId: 'S2', mode: 'none' } });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(h.db.tables.service_install_requests[0].mode, 'none');

  const seed = {
    service_install_requests: [{ id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-11-19T01:00:00Z', requestedDate: '2026-11-24', updatedAt: 'T0' }],
    service_install_request_zones: [{ requestId: 'R1', zoneId: 'Z1' }],
  };
  const h2 = harness({ seed });
  const r2 = await installModePut({ ...h2.common, user: ADMIN, body: { siteId: 'S1', mode: 'none' } });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  const row = h2.db.tables.service_install_requests[0];
  assert.equal(row.mode, 'none');
  assert.equal(row.requestedAt, null);
  assert.equal(row.requestedDate, null);
  assert.equal(h2.db.tables.service_install_request_zones.length, 0);

  const h3 = harness({ seed, visits: [{ id: 'V1', installRequestId: 'R1', status: 'scheduled' }] });
  assert.equal((await installModePut({ ...h3.common, user: ADMIN, body: { siteId: 'S1', mode: 'none' } })).status, 409);
});

test('API GET: ส่งสวิตช์ · สิทธิ์ · เหตุที่ทำไม่ได้ · ภาพรวมไซต์', async () => {
  const h = harness();
  const res = await installGet({ ...h.common, user: FN });
  assert.equal(res.status, 200);
  assert.equal(res.body.enabled, true);
  assert.equal(res.body.canEdit, false);
  assert.equal(res.body.blocker, INSTALL_REQUEST_TEXT.noRight);
  assert.equal(res.body.sites.length, 2);
});

test('สายไฟ: route อ่านสวิตช์ส่งเข้าทุกเมธอด · ตัวจัดการไม่ import ตัวอ่านสวิตช์เอง', () => {
  const route = readFileSync(new URL('../../app/api/sales-planning/sales-orders/[id]/install/route.js', import.meta.url), 'utf8');
  assert.equal((route.match(/enabled: installStepEnabled\(\)/g) || []).length, 3);
  const lib = readFileSync(new URL('./installRequestRoute.js', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /installStepFlag|SERVICE_INSTALL_STEP/);
});
