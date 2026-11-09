// ── ขั้นเข้าติดตั้ง PR-4: ฝ่ายขายคอนเฟิร์มลูกค้า · ลูกค้าขอเปลี่ยนวัน · TS ยืนยันวันใหม่บนนัดเดิม ─────────────────
//
// ⭐ มติเจ้าของ 09/11/2026 (N4): TS ยืนยันวันแล้ว ฝ่ายขายคอนเฟิร์มลูกค้า **ทุกครั้ง** · ลูกค้าขอเปลี่ยน = กลับไปรอ TS
// ⚠️ ไม่มีอะไรต่อฐานจริง — ตัวโหลดถูกแทนด้วยโลกย่อส่วน · ตัวเขียนเป็นอาร์เรย์ในหน่วยความจำ
import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_CUSTOMER_TEXT, installCustomerInput, installCustomerThreadText, installCustomerVisitError } from './installCustomer.js';
import { installCustomerPost } from './installCustomerRoute.js';
import { INSTALL_CONFIRM_TEXT, installReconfirmInput } from './installConfirm.js';
import { installConfirmPost } from './installConfirmRoute.js';
import { installZoneStage } from './installQueue.js';
import { installQueueRows } from './installQueueView.js';
import { installSitesView } from './installRequest.js';
import {
  INSTALL_CUSTOMER_CONFIRMED_KIND, installCustomerConfirmedNotice, installRequestedNotice,
} from './installNotify.js';
import { NOTIFICATION_BOXES, SERVICE_BELL_KINDS } from '../notifications.js';
import { isKnownUpdateKind } from '../master/updateTypes.js';

const TODAY = '2027-01-02';
const REQUEST = {
  id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-12-15T03:00:00Z', requestedDate: '2027-01-06',
  requestedStartTime: '09:00:00', requestedEndTime: '12:00:00', contactName: 'คุณวิภาวดี', contactPhone: '081-234-5678',
  requestedById: 'U-SA', decidedById: 'U-SA', updatedAt: 'T0',
};
const DRAFT = {
  id: 'V1', code: 'SV-27010007', kind: 'install', status: 'draft', siteId: 'S1', installRequestId: 'R1',
  scheduledDate: '2027-01-05', startTime: '09:00:00', endTime: '12:00:00', assigneeId: 'U-NATE', assigneeName: 'นที ใจดี',
  tsConfirmedAt: '2027-01-02T02:00:00.000Z', tsConfirmedByName: 'สุดารัตน์', customerConfirmedAt: null, dateChangeReason: 'ช่างทีมนทีเต็มวันที่ 06/01',
};
const CONFIRM = { action: 'confirm', contactName: 'คุณวิภาวดี', contactPhone: '081-234-5678' };
const RESCHEDULE = {
  action: 'reschedule', contactName: 'คุณวิภาวดี', requestedDate: '2027-01-12', requestedStartTime: '13:00', requestedEndTime: '16:00',
  changeReason: 'ห้างปิดปรับปรุงวันที่ 5',
};

// ── ตัวตัดสิน ──────────────────────────────────────────────────────────────────────────────
test('รับคำตอบได้ไหม: ร่างที่ TS ยืนยัน = ได้ · ขึ้นตารางแล้ว/ยังไม่ยืนยัน/ขอเปลี่ยนไปแล้ว/คนละคำขอ = ไม่ได้', () => {
  assert.equal(installCustomerVisitError(DRAFT, REQUEST, 'confirm'), null);
  assert.equal(installCustomerVisitError(DRAFT, REQUEST, 'reschedule'), null);
  assert.equal(installCustomerVisitError({ ...DRAFT, status: 'scheduled' }, REQUEST, 'confirm'), INSTALL_CUSTOMER_TEXT.notDraft);
  assert.equal(installCustomerVisitError({ ...DRAFT, tsConfirmedAt: null }, REQUEST, 'confirm'), INSTALL_CUSTOMER_TEXT.notTsConfirmed);
  assert.equal(installCustomerVisitError(DRAFT, { ...REQUEST, requestedAt: '2027-01-02T05:00:00Z' }, 'confirm'), INSTALL_CUSTOMER_TEXT.reasked);
  assert.equal(installCustomerVisitError({ ...DRAFT, installRequestId: 'R9' }, REQUEST, 'confirm'), INSTALL_CUSTOMER_TEXT.visitMissing);
  assert.equal(installCustomerVisitError(DRAFT, REQUEST, 'maybe'), INSTALL_CUSTOMER_TEXT.actionInvalid);
});

test('รับคำตอบได้ไหม: คอนเฟิร์มแล้วแต่ติดด่าน = คอนเฟิร์มซ้ำไม่ได้ (TS ปล่อยเอง) · แต่ลูกค้ายังขอเปลี่ยนวันได้', () => {
  const stuck = { ...DRAFT, customerConfirmedAt: '2027-01-03T03:20:00Z' };
  assert.equal(installCustomerVisitError(stuck, REQUEST, 'confirm'), INSTALL_CUSTOMER_TEXT.alreadyConfirmed);
  assert.equal(installCustomerVisitError(stuck, REQUEST, 'reschedule'), null);
});

test('คำตอบ: ไม่เลือก = ไม่ได้ (ไม่มีค่าตั้งต้น) · "คุยกับ" บังคับทั้งสองทาง', () => {
  assert.equal(installCustomerInput({ contactName: 'ก' }).error, INSTALL_CUSTOMER_TEXT.actionInvalid);
  assert.equal(installCustomerInput({ ...CONFIRM, contactName: '  ' }).error, INSTALL_CUSTOMER_TEXT.contactRequired);
  assert.equal(installCustomerInput({ ...RESCHEDULE, contactName: '' }, { visit: DRAFT, todayIso: TODAY }).error, INSTALL_CUSTOMER_TEXT.contactRequired);
  assert.deepEqual(installCustomerInput(CONFIRM).value, { action: 'confirm', contactName: 'คุณวิภาวดี', contactPhone: '081-234-5678', note: null });
});

test('ขอเปลี่ยนวัน: วันบังคับ · ไม่ย้อน · เวลาครบคู่ · เหตุ ≥5 ตัว · ช่องเดิมของ TS = ให้เลือกยืนยันแทน', () => {
  const ctx = { visit: DRAFT, todayIso: TODAY };
  assert.equal(installCustomerInput({ ...RESCHEDULE, requestedDate: '' }, ctx).error, INSTALL_CUSTOMER_TEXT.dateRequired);
  assert.equal(installCustomerInput({ ...RESCHEDULE, requestedDate: '2027-01-01' }, ctx).error, INSTALL_CUSTOMER_TEXT.datePast);
  assert.equal(installCustomerInput({ ...RESCHEDULE, requestedEndTime: '' }, ctx).error, INSTALL_CUSTOMER_TEXT.timePair);
  assert.equal(installCustomerInput({ ...RESCHEDULE, changeReason: 'ไม่' }, ctx).error, INSTALL_CUSTOMER_TEXT.reasonRequired);
  assert.equal(installCustomerInput({ ...RESCHEDULE, requestedDate: '2027-01-05', requestedStartTime: '09:00', requestedEndTime: '12:00' }, ctx).error, INSTALL_CUSTOMER_TEXT.sameSlot);
  /* วันเดิมแต่เปลี่ยนช่วงเวลา = เปลี่ยนวันจริง */
  assert.equal(installCustomerInput({ ...RESCHEDULE, requestedDate: '2027-01-05' }, ctx).error, undefined);
  const { value } = installCustomerInput(RESCHEDULE, ctx);
  assert.equal(value.requestedStartTime, '13:00');
  assert.equal(value.changeReason, 'ห้างปิดปรับปรุงวันที่ 5');
});

test('ข้อความเธรด: ยืนยัน (ขึ้นตาราง/ติดด่าน) · ขอเปลี่ยน — บอกว่าคุยกับใคร', () => {
  assert.match(installCustomerThreadText(installCustomerInput(CONFIRM).value, { scheduled: true }), /ลูกค้ายืนยันวันนัด \(คุยกับ คุณวิภาวดี 081-234-5678\) · ปล่อยขึ้นตาราง — ด่านครบ/);
  assert.match(installCustomerThreadText(installCustomerInput(CONFIRM).value, { blocker: 'ยังขึ้นตารางไม่ได้ — มัดจำ' }), /ยังเป็นร่าง: ยังขึ้นตารางไม่ได้ — มัดจำ/);
  assert.match(installCustomerThreadText(installCustomerInput(RESCHEDULE, { visit: DRAFT, todayIso: TODAY }).value), /ขอเปลี่ยนวันเป็น 12\/01\/2027 13:00–16:00 เพราะ ห้างปิด/);
  assert.ok(isKnownUpdateKind('service_visit', 'customer'));
});

// ── ขั้นของโซน/ไซต์หลังแต่ละคำตอบ ─────────────────────────────────────────────────────────
test('ขั้น: ร่างรอคอนเฟิร์ม → ลูกค้าขอเปลี่ยน = รอ TS · TS ยืนยันใหม่ (ล้างคอนเฟิร์ม) = รอ SA อีกรอบ', () => {
  const at = (request, visit) => installZoneStage({ request, zoneId: 'Z1', visits: [visit], visitZonesByVisitId: { V1: ['Z1'] }, deposit: { state: 'ok' } });
  assert.equal(at(REQUEST, DRAFT), 'awaiting_customer');
  const reasked = { ...REQUEST, requestedAt: '2027-01-03T03:00:00Z', requestedDate: '2027-01-12' };
  assert.equal(at(reasked, DRAFT), 'awaiting_ts');
  assert.equal(at(reasked, { ...DRAFT, tsConfirmedAt: '2027-01-03T05:00:00Z', customerConfirmedAt: null }), 'awaiting_customer');
  assert.equal(at(REQUEST, { ...DRAFT, status: 'scheduled', customerConfirmedAt: '2027-01-03T03:20:00Z' }), 'confirmed');
});

test('การ์ดบนใบ: นัดรอคอนเฟิร์มมีปุ่ม (awaitingCustomer) · ขอเปลี่ยนแล้ว/ติดด่าน ไม่มีปุ่ม · ชื่อโซนของนัด', () => {
  const ctx = {
    order: { id: 'SO1', status: 'approved', origin: 'pipeline', serviceTermsOpenedAt: '2026-11-19T03:00:00Z', totalAmount: 0 },
    installments: [],
    allocations: [{ zoneId: 'Z1', packsPerRound: 2, sortOrder: 1 }, { zoneId: 'Z2', packsPerRound: 1, sortOrder: 2 }],
    zonesById: new Map([['Z1', { id: 'Z1', name: 'ทางเข้าหลัก', siteId: 'S1' }], ['Z2', { id: 'Z2', name: 'แคชเชียร์', siteId: 'S1' }]]),
    sitesById: new Map([['S1', { id: 'S1', code: 'ST-01', name: 'FASHION' }]]),
  };
  const view = (request, visits) => installSitesView(ctx, {
    requests: [request], requestZones: [{ requestId: 'R1', zoneId: 'Z1' }, { requestId: 'R1', zoneId: 'Z2' }],
    visits, visitZonesByVisitId: { V1: ['Z1'], V2: ['Z2'] },
  }).sites[0];
  const site = view(REQUEST, [DRAFT, { ...DRAFT, id: 'V2', code: 'SV-2', customerConfirmedAt: '2027-01-03T03:20:00Z' }]);
  assert.deepEqual(site.visits.map((v) => [v.id, v.awaitingCustomer, v.stuck, v.zoneNames.join('+')]), [['V1', true, false, 'ทางเข้าหลัก'], ['V2', false, true, 'แคชเชียร์']]);
  const reasked = view({ ...REQUEST, requestedAt: '2027-01-03T03:00:00Z' }, [DRAFT]);
  assert.deepEqual(reasked.visits.map((v) => [v.reasked, v.awaitingCustomer]), [[true, false]]);
});

test('คิว TS: นัดที่ลูกค้าขอเปลี่ยน = แถวรอ TS พร้อมนัดเดิม (reasked) · คอนเฟิร์มแล้วติดด่าน = stuck', () => {
  const rows = installQueueRows({
    requests: [{ ...REQUEST, requestedAt: '2027-01-03T03:00:00Z', requestedDate: '2027-01-12', changeReason: 'ห้างปิดปรับปรุงวันที่ 5' }],
    requestZones: [{ requestId: 'R1', zoneId: 'Z1' }],
    orders: new Map([['SO1', { id: 'SO1', status: 'approved', supersededById: null, totalAmount: 0 }]]),
    sites: new Map([['S1', { id: 'S1', code: 'ST-01' }]]), zones: new Map([['Z1', { id: 'Z1', name: 'ทางเข้าหลัก', siteId: 'S1' }]]),
    visits: [DRAFT], visitZonesByVisitId: { V1: ['Z1'] },
  });
  assert.equal(rows[0].stage, 'awaiting_ts');
  assert.equal(rows[0].changeReason, 'ห้างปิดปรับปรุงวันที่ 5');
  assert.deepEqual(rows[0].visits.map((v) => [v.id, v.reasked, v.stuck, v.zoneIds.join()]), [['V1', true, false, 'Z1']]);
});

// ── TS ยืนยันวันใหม่ (ตัวตัดสิน) ──────────────────────────────────────────────────────────────
test('ยืนยันวันใหม่: เฉพาะร่างที่ลูกค้าขอเปลี่ยน · เหตุเทียบกับวันใหม่ที่ลูกค้าขอ · ไม่ถามโซน/เครื่อง', () => {
  const reasked = { ...REQUEST, requestedAt: '2027-01-03T03:00:00Z', requestedDate: '2027-01-12' };
  const ctx = { request: reasked, visit: DRAFT, deposit: { state: 'ok' }, todayIso: TODAY };
  const body = { scheduledDate: '2027-01-12', startTime: '13:00', endTime: '16:00', assigneeId: 'U-NATE' };
  assert.equal(installReconfirmInput(body, ctx).error, undefined);
  assert.equal(installReconfirmInput({ ...body, scheduledDate: '2027-01-13' }, ctx).error, INSTALL_CONFIRM_TEXT.reasonRequiredReask);
  assert.equal(installReconfirmInput(body, { ...ctx, request: REQUEST }).error, INSTALL_CONFIRM_TEXT.notReasked);
  assert.equal(installReconfirmInput(body, { ...ctx, visit: { ...DRAFT, status: 'scheduled' } }).error, INSTALL_CONFIRM_TEXT.notReasked);
  assert.match(installReconfirmInput(body, { ...ctx, deposit: { state: 'blocked', reason: 'รอบัญชี' } }).error, /มัดจำ/);
});

// ── ฐานในหน่วยความจำ ─────────────────────────────────────────────────────────────────────
function memoryDb(seed = {}) {
  const tables = structuredClone(seed);
  const writes = [];
  const from = (table) => {
    const st = { op: 'select', preds: [], values: null, single: false, filters: [] };
    const b = {
      select() { return b; }, order() { return b; },
      update(patch) { st.op = 'update'; st.values = patch; return b; },
      eq(col, v) { st.filters.push(['eq', col, v]); st.preds.push((r) => r[col] === v); return b; },
      is(col, v) { st.filters.push(['is', col, v]); st.preds.push((r) => (r[col] ?? null) === v); return b; },
      in(col, vs) { st.preds.push((r) => vs.includes(r[col])); return b; },
      maybeSingle() { st.single = true; return b; },
      then(resolve, reject) {
        const rows = (tables[table] ||= []);
        const hit = rows.filter((r) => st.preds.every((p) => p(r)));
        if (st.op === 'update') {
          for (const r of hit) Object.assign(r, st.values);
          writes.push({ table, patch: st.values, filters: st.filters, hits: hit.length });
        }
        const data = st.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return b;
  };
  return { client: { from }, tables, writes };
}

const SA = { id: 'U-SA', role: 'admin', name: 'กมลรัตน์', teams: [] };
const ORDER = { id: 'SO1', orderNumber: 'SO-26110012-0', status: 'approved', origin: 'pipeline', supersededById: null, serviceTermsOpenedAt: '2026-11-19T03:00:00Z', totalAmount: 0 };
const SITE_CTX = {
  order: ORDER, installments: [],
  allocations: [{ zoneId: 'Z1', packsPerRound: 2, sortOrder: 1 }],
  zonesById: new Map([['Z1', { id: 'Z1', name: 'ทางเข้าหลัก', siteId: 'S1' }]]),
  sitesById: new Map([['S1', { id: 'S1', code: 'ST-01', name: 'FASHION' }]]),
};

function harness({ gateBlocked = false, visit = DRAFT, request = REQUEST } = {}) {
  const db = memoryDb({ service_install_requests: [request], service_visits: [visit] });
  const log = { audits: [], threads: [], confirmed: [], rescheduled: [] };
  const deps = {
    scope: async () => ({ order: ORDER }),
    load: async () => ({
      ctx: SITE_CTX, requests: [request], requestZones: [{ requestId: 'R1', zoneId: 'Z1' }],
      visits: [visit], visitZonesByVisitId: { V1: ['Z1'] }, doneZonesByVisitId: {},
    }),
    /* โลกของด่าน: ไซต์ไม่มีกติกาเวลาเข้า · ใบไม่มีงวดก่อนติดตั้ง (ผ่าน) · หรือมัดจำค้าง (ติด) */
    gate: async () => ({
      visit: { ...visit },
      site: { id: 'S1' },
      ctx: {
        zonesBySite: { S1: [{ id: 'Z1', siteId: 'S1', name: 'ทางเข้าหลัก', isActive: true }] }, termsBySite: {},
        /* ยอดใบ 0 = ไม่ต้องเก็บเงิน (ผ่านเสมอ) ⇒ โลกที่มัดจำค้างต้องเป็นใบที่มียอด (ฝ่ายบริการเห็นแค่ null) */
        ordersById: { SO1: { ...ORDER, totalAmount: gateBlocked ? null : 0 } }, contractsById: {}, setupOrdersByZone: {},
        installmentsByOrderId: { SO1: gateBlocked ? [{ id: 'I1', seq: 1, label: 'มัดจำ 30%', status: 'reported', beforeInstall: true }] : [] },
        installRequestsById: { R1: request }, visitZonesByVisitId: { V1: ['Z1'] },
      },
    }),
  };
  const run = (body) => installCustomerPost({
    supabase: db.client, user: SA, id: 'SO1', enabled: true, body: { siteId: 'S1', visitId: 'V1', ...body }, deps, todayIso: TODAY,
    now: () => '2027-01-03T03:20:00.000Z',
    audit: async (e) => { log.audits.push(e); }, thread: async (_s, e) => { log.threads.push(e); },
    notifyConfirmed: (_s, a) => log.confirmed.push(a), notifyRescheduled: (_s, a) => log.rescheduled.push(a),
  });
  return { db, log, run };
}

test('API ลูกค้ายืนยัน: ด่านครบ = ประทับ + ขึ้นตาราง (scheduled + queued*) ในคำสั่งเดียว · CAS ร่าง/ยืนยันของ TS/ยังไม่คอนเฟิร์ม', async () => {
  const h = harness();
  const res = await h.run(CONFIRM);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.scheduled, true);
  const [write] = h.db.writes;
  assert.equal(write.table, 'service_visits');
  assert.equal(write.patch.status, 'scheduled');
  assert.equal(write.patch.customerConfirmedById, 'U-SA');
  assert.equal(write.patch.queuedAt, '2027-01-03T03:20:00.000Z');
  assert.deepEqual(write.filters, [['eq', 'id', 'V1'], ['eq', 'status', 'draft'], ['eq', 'tsConfirmedAt', DRAFT.tsConfirmedAt], ['is', 'customerConfirmedAt', null]]);
  assert.equal(h.log.threads[0].kind, 'queue');
  assert.match(h.log.threads[0].body, /คุยกับ คุณวิภาวดี/);
  assert.equal(h.log.confirmed[0].scheduled, true);
});

test('API ลูกค้ายืนยัน: ด่านติด (มัดจำค้าง) = ประทับอย่างเดียว คงร่าง + บอกเหตุ · เธรดชนิด customer', async () => {
  const h = harness({ gateBlocked: true });
  const res = await h.run(CONFIRM);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.scheduled, false);
  assert.match(res.body.blocker, /มัดจำ/);
  assert.equal(h.db.writes[0].patch.status, undefined);
  assert.equal(h.db.tables.service_visits[0].status, 'draft');
  assert.ok(h.db.tables.service_visits[0].customerConfirmedAt);
  assert.equal(h.log.threads[0].kind, 'customer');
  assert.equal(h.log.confirmed[0].scheduled, false);
});

test('API ลูกค้ายืนยัน: นัดเพิ่งถูกแก้ (CAS ไม่โดน) = 409 · ขึ้นตารางแล้ว = 409 · ไม่มีคุยกับ = 400', async () => {
  const raced = harness();
  raced.db.tables.service_visits[0].tsConfirmedAt = '2027-01-03T01:00:00.000Z';
  assert.equal((await raced.run(CONFIRM)).status, 409);
  assert.equal(raced.log.threads.length, 0);
  assert.equal((await harness({ visit: { ...DRAFT, status: 'scheduled' } }).run(CONFIRM)).status, 409);
  assert.equal((await harness().run({ ...CONFIRM, contactName: '' })).status, 400);
});

test('API ลูกค้าขอเปลี่ยนวัน: วันใหม่ + เหตุลงคำขอ (requestedAt เดิน) · ล้างคอนเฟิร์มบนร่าง · กระดิ่งถึง TS แบบขอเปลี่ยน', async () => {
  const h = harness({ visit: { ...DRAFT, customerConfirmedAt: '2027-01-02T09:00:00Z' } });
  const res = await h.run(RESCHEDULE);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [req] = h.db.tables.service_install_requests;
  assert.equal(req.requestedDate, '2027-01-12');
  assert.equal(req.changeReason, 'ห้างปิดปรับปรุงวันที่ 5');
  assert.equal(req.requestedAt, '2027-01-03T03:20:00.000Z');
  assert.equal(h.db.tables.service_visits[0].customerConfirmedAt, null);
  assert.equal(h.db.tables.service_visits[0].status, 'draft');
  assert.deepEqual(h.db.writes[0].filters, [['eq', 'id', 'R1'], ['eq', 'updatedAt', 'T0']]);
  assert.equal(h.log.threads[0].kind, 'reschedule');
  assert.equal(h.log.rescheduled[0].rescheduled, true);
});

test('API ลูกค้าขอเปลี่ยนวัน: คำขอเพิ่งถูกแก้ = 409 ไม่แตะนัด', async () => {
  const h = harness();
  h.db.tables.service_install_requests[0].updatedAt = 'T-other';
  assert.equal((await h.run(RESCHEDULE)).status, 409);
  assert.equal(h.db.writes.filter((w) => w.table === 'service_visits').length, 0);
});

// ── API TS ยืนยันวันใหม่ ─────────────────────────────────────────────────────────────────
test('API ยืนยันวันใหม่: เขียนนัดเดิม (วัน · ช่าง · ร่องรอย TS ใหม่ · ล้างคอนเฟิร์มลูกค้า) · CAS ร่าง + tsConfirmedAt เดิม', async () => {
  const reasked = { ...REQUEST, requestedAt: '2027-01-03T03:00:00Z', requestedDate: '2027-01-12', changeReason: 'ห้างปิดปรับปรุงวันที่ 5' };
  const db = memoryDb({ service_visits: [{ ...DRAFT }] });
  const audits = []; const threads = []; const notices = [];
  const state = {
    request: reasked, order: ORDER, site: { code: 'ST-01' }, installments: [], requestZoneIds: ['Z1'],
    visits: [DRAFT], visitZonesByVisitId: { V1: ['Z1'] }, doneZonesByVisitId: {}, assetsById: new Map(), plannedElsewhere: new Set(),
  };
  const run = (user, body) => installConfirmPost({
    supabase: db.client, user, requestId: 'R1', body, todayIso: TODAY, now: () => '2027-01-03T05:00:00.000Z', load: async () => state,
    audit: async (e) => audits.push(e), thread: async (_s, e) => threads.push(e), notify: (_s, a) => notices.push(a),
    insertVisit: async () => { throw new Error('ต้องไม่สร้างนัดใหม่'); },
  });
  const TS = { id: 'U-TSM', role: 'ts_manager', department: 'TS', name: 'สุดารัตน์', teams: [] };
  const res = await run(TS, { visitId: 'V1', scheduledDate: '2027-01-12', startTime: '13:00', endTime: '16:00', assigneeId: 'U-NATE', assigneeName: 'นที ใจดี' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [write] = db.writes;
  assert.equal(write.patch.scheduledDate, '2027-01-12');
  assert.equal(write.patch.tsConfirmedAt, '2027-01-03T05:00:00.000Z');
  assert.equal(write.patch.customerConfirmedAt, null);
  assert.equal(write.patch.status, undefined, 'ยังเป็นร่าง — ฝ่ายขายต้องคอนเฟิร์มอีกรอบ');
  assert.deepEqual(write.filters, [['eq', 'id', 'V1'], ['eq', 'status', 'draft'], ['eq', 'tsConfirmedAt', DRAFT.tsConfirmedAt]]);
  assert.equal(threads[0].kind, 'reschedule');
  assert.match(threads[0].body, /ลูกค้าขอเปลี่ยนเพราะ ห้างปิด/);
  assert.equal(notices.length, 1);
  /* นัดที่ลูกค้าไม่ได้ขอเปลี่ยน = 409 */
  state.request = REQUEST;
  assert.equal((await run(TS, { visitId: 'V1', scheduledDate: '2027-01-12', assigneeId: 'U-NATE' })).status, 409);
});

// ── กระดิ่ง ──────────────────────────────────────────────────────────────────────────────
test('กระดิ่งลูกค้ายืนยัน: หัวหน้า TS + Planner + หัวหน้างาน · ไม่เด้งคนกด · บอกว่าขึ้นตารางหรือยังเป็นร่าง', () => {
  const users = [
    { id: 'U-TSM', role: 'ts_manager' }, { id: 'U-PLN', role: 'ts_planner' }, { id: 'U-NATE', role: 'ts' },
    { id: 'U-SA', role: 'sales' }, { id: 'U-OLD', role: 'ts_manager', disabled: true },
  ];
  const visit = { ...DRAFT, customerConfirmedAt: '2027-01-03T03:20:00Z' };
  const on = installCustomerConfirmedNotice({ order: ORDER, visit, site: { code: 'ST-01', name: 'FASHION' }, users, actor: { id: 'U-SA' }, scheduled: true });
  assert.deepEqual(on.userIds.sort(), ['U-NATE', 'U-PLN', 'U-TSM']);
  assert.equal(on.kind, INSTALL_CUSTOMER_CONFIRMED_KIND);
  assert.match(on.body, /ขึ้นตารางช่างแล้ว/);
  const off = installCustomerConfirmedNotice({ order: ORDER, visit, users, actor: { id: 'U-SA' }, scheduled: false, blocker: 'ยังขึ้นตารางไม่ได้ — มัดจำ' });
  assert.match(off.body, /ยังเป็นร่าง: ยังขึ้นตารางไม่ได้ — มัดจำ · ปล่อยขึ้นตารางที่หน้าจัดคิว/);
  assert.ok(SERVICE_BELL_KINDS.includes(INSTALL_CUSTOMER_CONFIRMED_KIND));
  assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(INSTALL_CUSTOMER_CONFIRMED_KIND));
});

test('กระดิ่งลูกค้าขอเปลี่ยนวัน: หัวข้อ + เหตุ ถึง TS', () => {
  const notice = installRequestedNotice({
    request: { ...REQUEST, requestedDate: '2027-01-12', changeReason: 'ห้างปิดปรับปรุงวันที่ 5', requestedAt: '2027-01-03T03:20:00Z' },
    order: ORDER, site: { code: 'ST-01' }, users: [{ id: 'U-TSM', role: 'ts_manager' }], actor: { id: 'U-SA', name: 'กมลรัตน์' },
    changed: true, rescheduled: true,
  });
  assert.match(notice.title, /ลูกค้าขอเปลี่ยนวันติดตั้ง/);
  assert.match(notice.body, /วันใหม่ 12\/01\/2027 09:00–12:00 เพราะ ห้างปิดปรับปรุงวันที่ 5/);
});
