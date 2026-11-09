// ── ขั้นเข้าติดตั้ง PR-3a: TS ยืนยันวันติดตั้ง (ตัวตัดสิน + API ด้วยฐานในหน่วยความจำ) + บริบทด่านของนัดติดตั้ง ──────
//
// ⭐ มติเจ้าของ 09/11/2026: TS ยืนยันวันได้เมื่อมัดจำผ่าน · ปรับวันได้แต่ต้องมีเหตุ · แยกโซนเป็นหลายนัดได้ ·
//    ผล = นัดติดตั้งร่าง (ช่างยังไม่เห็นจนกว่า SA คอนเฟิร์มลูกค้า)
// ⚠️ ไม่มีอะไรต่อฐานจริง — ตัวโหลดถูกแทนด้วยโลกย่อส่วน · ตัวเขียนเป็นอาร์เรย์ในหน่วยความจำ
import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_CONFIRM_TEXT, installBusyZoneIds, installConfirmInput } from './installConfirm.js';
import { installConfirmPost } from './installConfirmRoute.js';
import { evaluateVisitGate, gatePassed } from './visitGate.js';
import { gateContextForSite, loadVisitGateContext } from './gateContext.js';

const TODAY = '2027-01-02';
const REQUEST = { id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-12-15T03:00:00Z', requestedDate: '2027-01-06', note: 'เข้าทาง B1' };
const OK = { state: 'ok' };
const ASSETS = new Map([['A1', { id: 'A1', status: 'in_stock' }], ['A2', { id: 'A2', status: 'in_stock' }], ['A3', { id: 'A3', status: 'active' }]]);
const base = {
  zoneIds: ['Z1', 'Z2'], scheduledDate: '2027-01-05', startTime: '09:00', endTime: '12:00', assigneeId: 'U-NATE', assigneeName: 'นที ใจดี',
  assistantIds: ['U-PK', 'U-NATE'], plannedAssets: [{ zoneId: 'Z1', assetId: 'A1' }, { zoneId: 'Z2', assetId: 'A2' }],
  dateChangeReason: 'ช่างทีมนทีเต็มวันที่ 06/01',
};
const ctx = (over = {}) => ({
  request: REQUEST, requestZoneIds: ['Z1', 'Z2', 'Z3'], busyZoneIds: new Set(), deposit: OK, todayIso: TODAY,
  assetsById: ASSETS, plannedElsewhere: new Set(), ...over,
});

test('ยืนยันวัน: ค่าครบ = ผ่าน · ตัดผู้ช่วยที่ซ้ำหัวหน้างาน', () => {
  const { value, error } = installConfirmInput(base, ctx());
  assert.equal(error, undefined);
  assert.deepEqual(value.assistantIds, ['U-PK']);
  assert.equal(value.dateChangeReason, 'ช่างทีมนทีเต็มวันที่ 06/01');
});

test('ยืนยันวัน: มัดจำไม่ผ่าน = ยืนยันไม่ได้ (บอกเหตุของงวด) · คำขอยังไม่ขอคิว = ไม่ได้', () => {
  const r = installConfirmInput(base, ctx({ deposit: { state: 'blocked', reason: 'งวดก่อนติดตั้ง มัดจำ 30% — แจ้งชำระแล้ว รอบัญชีรับรอง' } }));
  assert.match(r.error, /มัดจำก่อนติดตั้งยังไม่ผ่าน.*รอบัญชีรับรอง/);
  assert.equal(installConfirmInput(base, ctx({ request: { ...REQUEST, requestedAt: null } })).error, INSTALL_CONFIRM_TEXT.notRequested);
});

test('ยืนยันวัน: วันไม่ตรงที่ขอ = ต้องมีเหตุ ≥5 ตัว · วันตรง = ไม่ต้องมี · วันย้อน = ไม่ได้', () => {
  assert.equal(installConfirmInput({ ...base, dateChangeReason: '' }, ctx()).error, INSTALL_CONFIRM_TEXT.reasonRequired);
  assert.equal(installConfirmInput({ ...base, scheduledDate: '2027-01-06', dateChangeReason: '' }, ctx()).error, undefined);
  assert.equal(installConfirmInput({ ...base, scheduledDate: '2027-01-01' }, ctx()).error, INSTALL_CONFIRM_TEXT.datePast);
});

test('ยืนยันวัน: โซน — ต้องอยู่ในคำขอ · ห้ามโซนที่มีนัดแล้ว · แยกโซนเป็นอีกนัดได้', () => {
  assert.equal(installConfirmInput({ ...base, zoneIds: ['Z9'] }, ctx()).error, INSTALL_CONFIRM_TEXT.zoneNotRequested);
  assert.equal(installConfirmInput(base, ctx({ busyZoneIds: new Set(['Z2']) })).error, INSTALL_CONFIRM_TEXT.zoneBusy);
  const split = installConfirmInput({ ...base, zoneIds: ['Z3'], plannedAssets: [{ zoneId: 'Z3', assetId: 'A1' }] }, ctx({ busyZoneIds: new Set(['Z1', 'Z2']) }));
  assert.equal(split.error, undefined);
});

test('ยืนยันวัน: เครื่อง — ทุกโซนต้องมี · ต้องอยู่คลัง · ห้ามซ้ำ · ห้ามถูกวางให้นัดอื่น', () => {
  assert.equal(installConfirmInput({ ...base, plannedAssets: [{ zoneId: 'Z1', assetId: 'A1' }] }, ctx()).error, INSTALL_CONFIRM_TEXT.assetsRequired);
  assert.equal(installConfirmInput({ ...base, plannedAssets: [{ zoneId: 'Z1', assetId: 'A3' }, { zoneId: 'Z2', assetId: 'A2' }] }, ctx()).error, INSTALL_CONFIRM_TEXT.assetNotInStock);
  assert.equal(installConfirmInput({ ...base, plannedAssets: [{ zoneId: 'Z1', assetId: 'A1' }, { zoneId: 'Z2', assetId: 'A1' }] }, ctx()).error, INSTALL_CONFIRM_TEXT.assetDuplicate);
  assert.equal(installConfirmInput(base, ctx({ plannedElsewhere: new Set(['A2']) })).error, INSTALL_CONFIRM_TEXT.assetPlannedElsewhere);
  assert.equal(installConfirmInput({ ...base, plannedAssets: [...base.plannedAssets, { zoneId: 'Z3', assetId: 'A9' }] }, ctx()).error, INSTALL_CONFIRM_TEXT.assetZone);
});

test('ยืนยันวัน: ไม่มีหัวหน้างาน · เวลาไม่ครบคู่ = ไม่ได้', () => {
  assert.equal(installConfirmInput({ ...base, assigneeId: '' }, ctx()).error, INSTALL_CONFIRM_TEXT.assigneeRequired);
  assert.equal(installConfirmInput({ ...base, endTime: '' }, ctx()).error, INSTALL_CONFIRM_TEXT.timePair);
});

test('โซนที่ไม่ว่าง: นัดร่าง/นัดไว้ครอบ = ไม่ว่าง · ปิดแล้วติดตั้งได้ = ไม่ว่าง · ปิดแล้วติดไม่ได้/ยกเลิก = ว่าง', () => {
  const busy = installBusyZoneIds({
    requestId: 'R1',
    visits: [
      { id: 'V1', installRequestId: 'R1', status: 'draft' }, { id: 'V2', installRequestId: 'R1', status: 'partial' },
      { id: 'V3', installRequestId: 'R1', status: 'cancelled' }, { id: 'V4', installRequestId: 'R9', status: 'scheduled' },
    ],
    visitZonesByVisitId: { V1: ['Z1'], V2: ['Z2', 'Z4'], V3: ['Z3'], V4: ['Z5'] },
    doneZonesByVisitId: { V2: ['Z2'] },
  });
  assert.deepEqual([...busy].sort(), ['Z1', 'Z2']);
});

// ── API ──────────────────────────────────────────────────────────────────────────────
const TS_HEAD = { id: 'U-TSM', role: 'ts_manager', department: 'TS', name: 'หัวหน้า TS', teams: [] };
const CREW = { id: 'U-NATE', role: 'ts', department: 'TS', name: 'นที ใจดี', teams: [] };

function memoryDb() {
  const tables = { service_visits: [], service_visit_zones: [], service_visit_planned_assets: [] };
  const from = (table) => {
    const st = { op: 'select', preds: [], values: null };
    const b = {
      select() { return b; },
      insert(rows) { st.op = 'insert'; st.values = Array.isArray(rows) ? rows : [rows]; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(col, v) { st.preds.push((r) => r[col] === v); return b; },
      then(resolve, reject) {
        const rows = (tables[table] ||= []);
        if (st.op === 'insert') rows.push(...st.values);
        if (st.op === 'delete') tables[table] = rows.filter((r) => !st.preds.every((p) => p(r)));
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return b;
  };
  return { client: { from }, tables };
}

function harness(over = {}) {
  const db = memoryDb();
  const audits = [];
  const notices = [];
  const state = {
    request: REQUEST,
    order: { id: 'SO1', orderNumber: 'SO-26110012-0', status: 'approved', totalAmount: 108000, supersededById: null },
    installments: [{ id: 'I1', seq: 1, label: 'มัดจำ 30%', status: 'confirmed', beforeInstall: true }],
    requestZoneIds: ['Z1', 'Z2', 'Z3'], visits: [], visitZonesByVisitId: {}, doneZonesByVisitId: {},
    assetsById: ASSETS, plannedElsewhere: new Set(), ...over,
  };
  return {
    db, audits, notices,
    run: (user, body = base) => installConfirmPost({
      supabase: db.client, user, requestId: 'R1', body, todayIso: TODAY, now: () => '2027-01-02T03:00:00.000Z',
      load: async () => state, audit: async (e) => { audits.push(e); }, notify: (_s, args) => notices.push(args),
      insertVisit: async (_c, row) => { db.tables.service_visits.push({ ...row, code: 'SV-27010007' }); return { data: { ...row, code: 'SV-27010007' }, error: null }; },
    }),
  };
}

test('API ยืนยันวัน: สร้างนัดร่าง + โซน + เครื่อง · ร่องรอย TS · audit · กระดิ่ง', async () => {
  const h = harness();
  const res = await h.run(TS_HEAD);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [visit] = h.db.tables.service_visits;
  assert.equal(visit.status, 'draft');
  assert.equal(visit.kind, 'install');
  assert.equal(visit.installRequestId, 'R1');
  assert.equal(visit.tsConfirmedById, 'U-TSM');
  assert.equal(visit.dateChangeReason, 'ช่างทีมนทีเต็มวันที่ 06/01');
  assert.equal(visit.note, 'เข้าทาง B1');
  assert.deepEqual(h.db.tables.service_visit_zones.map((z) => z.zoneId), ['Z1', 'Z2']);
  assert.deepEqual(h.db.tables.service_visit_planned_assets.map((p) => p.assetId), ['A1', 'A2']);
  assert.equal(h.audits.length, 1);
  assert.match(h.audits[0].summary, /ปรับจาก 2027-01-06/);
  assert.equal(h.notices.length, 1);
});

test('API ยืนยันวัน: ช่าง (service:work) ยืนยันไม่ได้ = 403 · มัดจำยังไม่ผ่าน = 409 · ใบไม่อนุมัติ = 409', async () => {
  assert.equal((await harness().run(CREW)).status, 403);
  const blocked = await harness({ installments: [{ id: 'I1', seq: 1, label: 'มัดจำ 30%', status: 'reported', beforeInstall: true }] }).run(TS_HEAD);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /มัดจำ/);
  assert.equal((await harness({ order: { id: 'SO1', status: 'cancelled' } }).run(TS_HEAD)).status, 409);
});

test('API ยืนยันวัน: ไม่พบคำขอ = 404 · ค่าผิด = 400 ไม่เขียนอะไร', async () => {
  assert.equal((await harness({ request: null }).run(TS_HEAD)).status, 404);
  const h = harness();
  const res = await h.run(TS_HEAD, { ...base, assigneeId: '' });
  assert.equal(res.status, 400);
  assert.equal(h.db.tables.service_visits.length, 0);
});

// ── ด่าน + บริบทด่านของนัดติดตั้ง ───────────────────────────────────────────────────────────
test('บริบทด่าน: โหลดคำขอของไซต์ + โซนของนัดติดตั้ง + งวดพร้อมธง (ไม่ดึงยอดเงิน) ⇒ ร่างที่ยืนยันแล้วติดแค่ข้อคอนเฟิร์มลูกค้า', async () => {
  const tables = {
    service_zones: [{ id: 'Z1', siteId: 'S1', name: 'ทางเข้าหลัก', isActive: true }],
    service_zone_terms: [],
    service_install_requests: [{ id: 'R1', salesOrderId: 'SO1', siteId: 'S1', mode: 'install', requestedAt: '2026-12-15T03:00:00Z', requestedDate: '2027-01-06' }],
    service_visits: [{ id: 'V1', installRequestId: 'R1' }],
    service_visit_zones: [{ visitId: 'V1', zoneId: 'Z1' }],
    sales_orders: [{ id: 'SO1', status: 'approved', supersededById: null, serviceContractId: null, origin: 'pipeline', totalAmount: 108000 }],
    sales_order_installments: [{ id: 'I1', salesOrderId: 'SO1', status: 'confirmed', seq: 1, label: 'มัดจำ 30%', beforeInstall: true }],
  };
  const selects = [];
  const fake = {
    from(table) {
      const q = { preds: [] };
      const chain = {
        select(cols) { selects.push([table, cols]); return chain; },
        in(col, vals) { q.preds.push((r) => vals.includes(r[col])); return chain; },
        eq(col, v) { q.preds.push((r) => r[col] === v); return chain; },
        order() { return chain; }, range() { return chain; },
        then(resolve, reject) {
          return Promise.resolve({ data: (tables[table] || []).filter((r) => q.preds.every((p) => p(r))), error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const gateCtx = await loadVisitGateContext(fake, ['S1']);
  assert.equal(gateCtx.installRequestsById.R1.salesOrderId, 'SO1');
  assert.deepEqual(gateCtx.visitZonesByVisitId, { V1: ['Z1'] });
  assert.equal(gateCtx.installmentsByOrderId.SO1[0].beforeInstall, true);
  const installmentSelect = selects.find(([t]) => t === 'sales_order_installments')[1];
  assert.doesNotMatch(installmentSelect, /amount/, '🔒 ฝ่ายบริการไม่เห็นยอดงวด');
  const visit = { id: 'V1', kind: 'install', status: 'draft', installRequestId: 'R1', siteId: 'S1', scheduledDate: '2027-01-05', assigneeId: 'U-NATE', tsConfirmedAt: '2027-01-02T03:00:00Z' };
  const items = evaluateVisitGate(visit, gateContextForSite(gateCtx, 'S1', { site: { id: 'S1' } }));
  assert.deepEqual(items.filter((i) => i.state === 'blocked').map((i) => i.key), ['appointment']);
  assert.equal(gatePassed(evaluateVisitGate({ ...visit, customerConfirmedAt: '2027-01-03T03:20:00Z' }, gateContextForSite(gateCtx, 'S1', { site: { id: 'S1' } }))), true);
});

// ── กระดิ่งถึงฝ่ายขาย ──────────────────────────────────────────────────────────────────────
import { INSTALL_DATE_CONFIRMED_KIND, installDateConfirmedNotice } from './installNotify.js';
import { NOTIFICATION_BOXES, SERVICE_BELL_KINDS } from '../notifications.js';

test('กระดิ่ง SA: คนขอคิว + คนเลือกติดตั้ง · บอกวันและเหตุที่ปรับ · ไม่เด้งใส่คนกด · ลงกล่องกระดิ่ง', () => {
  const notice = installDateConfirmedNotice({
    request: { ...REQUEST, requestedById: 'U-SA', decidedById: 'U-SA2' },
    order: { id: 'SO1', orderNumber: 'SO-26110012-0' },
    visit: { id: 'V1', scheduledDate: '2027-01-05', startTime: '09:00', endTime: '12:00', dateChangeReason: 'ช่างทีมนทีเต็มวันที่ 06/01', tsConfirmedAt: '2027-01-02T03:00:00Z' },
    site: { code: 'ST-0412-01', name: 'สาขา FASHION' }, zoneCount: 2, actor: { id: 'U-SA2' },
  });
  assert.deepEqual(notice.userIds, ['U-SA']);
  assert.equal(notice.kind, INSTALL_DATE_CONFIRMED_KIND);
  assert.match(notice.body, /05\/01\/2027 09:00–12:00 · 2 โซน \(ปรับจาก 06\/01\/2027 เพราะ ช่างทีมนทีเต็มวันที่ 06\/01\)/);
  assert.equal(notice.href, '/sales-planning/sales-orders/SO1#install');
  assert.ok(SERVICE_BELL_KINDS.includes(INSTALL_DATE_CONFIRMED_KIND));
  assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(INSTALL_DATE_CONFIRMED_KIND));
});
