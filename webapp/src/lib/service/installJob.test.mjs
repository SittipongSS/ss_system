// ── ขั้นเข้าติดตั้ง PR-5a: หน้างานติดตั้งของช่าง — ตัวตัดสิน + API ด้วยฐานในหน่วยความจำ ──────────────────────────
//
// ⭐ มติเจ้าของ 09/11/2026: โซน › จุด (หนึ่งจุดต่อหนึ่งเครื่องที่วาง) · ติดตั้งแล้ว = รูป + ชื่อจุด · ติดไม่ได้ = เหตุ
//    · ส่งงาน: โซนที่ยังไม่มีผลต้องเลือก ไปทำต่อ / ติดไม่ได้ทั้งโซน · เครื่องที่ติดตั้งขึ้นทะเบียนที่โซนทันที
// ⚠️ ไม่มีอะไรต่อฐานจริง — ตัวโหลดเป็นโลกย่อส่วน · ตัวเขียนเป็นอาร์เรย์ในหน่วยความจำ · คำสั่งย้ายเครื่องถูกแทน
import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_JOB_TEXT, installJobView, installSendInput, installSpotInput, installZoneNoteInput } from './installJob.js';
import { installJobGet, installSendPost, installSpotPut } from './installJobRoute.js';
import { assetMovePatch } from './assetMoves.js';
import { INSTALL_DONE_KIND, installDoneNotice } from './installNotify.js';
import { SERVICE_BELL_KINDS } from '../notifications.js';
import { installZoneStage } from './installQueue.js';

const PHOTO = 'https://drive.google.com/file/d/PHOTO1/view';
const zonesById = new Map([
  ['Z1', { id: 'Z1', code: 'ZN-01', name: 'ทางเข้าหลัก', siteId: 'S1' }],
  ['Z2', { id: 'Z2', code: 'ZN-02', name: 'โซนผักผลไม้', siteId: 'S1' }],
  ['Z3', { id: 'Z3', code: 'ZN-03', name: 'แคชเชียร์', siteId: 'S1' }],
]);
const assetsById = new Map([
  ['A1', { id: 'A1', code: 'MC-0231', label: 'OV-10', colour: 'ขาว', status: 'in_stock', siteId: null }],
  ['A2', { id: 'A2', code: 'MC-0232', label: 'OV-10', colour: 'ขาว', status: 'in_stock', siteId: null }],
  ['A3', { id: 'A3', code: 'MC-0198', label: 'OV-08', colour: 'ดำ', status: 'in_stock', siteId: null }],
]);
const visitZones = [{ zoneId: 'Z1', note: null }, { zoneId: 'Z2', note: null }];
const planned = [
  { zoneId: 'Z1', assetId: 'A2', sortOrder: 1, spotName: null, photoUrl: null },
  { zoneId: 'Z1', assetId: 'A1', sortOrder: 0, spotName: 'ฝั่งซ้าย ข้างเสา A', photoUrl: PHOTO },
  { zoneId: 'Z2', assetId: 'A3', sortOrder: 0 },
];
const viewOf = (results = []) => installJobView({
  visitZones, planned, results, zonesById, assetsById, elsewhere: [{ zoneId: 'Z3', visitCode: 'SV-27010015', scheduledDate: '2027-01-12' }],
});

// ── ตัวตัดสิน ──────────────────────────────────────────────────────────────────────────────
test('ภาพงาน: โซนเรียงตามรหัส · จุดเรียงตามที่ TS วาง · สถานะโซน · โซนที่อยู่นัดอื่น · ตัวนับ', () => {
  const view = viewOf([{ assetId: 'A1', outcome: 'done' }]);
  assert.deepEqual(view.zones.map((z) => [z.name, z.state, `${z.done}/${z.total}`]), [['ทางเข้าหลัก', 'working', '1/2'], ['โซนผักผลไม้', 'not_started', '0/1']]);
  assert.deepEqual(view.zones[0].spots.map((s) => [s.n, s.code, s.spotName]), [[1, 'MC-0231', 'ฝั่งซ้าย ข้างเสา A'], [2, 'MC-0232', null]]);
  assert.deepEqual(view.elsewhere, [{ zoneId: 'Z3', code: 'ZN-03', name: 'แคชเชียร์', visitCode: 'SV-27010015', scheduledDate: '2027-01-12' }]);
  assert.deepEqual([view.total, view.done, view.missing, view.zonesComplete], [3, 1, 2, 0]);
});

test('บันทึกจุด: ติดตั้งแล้ว = ชื่อจุด + รูป (รูปต้องแนบกับงานแล้ว) · ติดไม่ได้ = เหตุ ≥5 · ว่าง = ล้างผล', () => {
  const view = viewOf();
  const photos = new Set([PHOTO]);
  assert.equal(installSpotInput({ assetId: 'A2', outcome: 'done', photoUrl: PHOTO }, { view, photoUrls: photos }).error, INSTALL_JOB_TEXT.nameRequired);
  assert.equal(installSpotInput({ assetId: 'A2', outcome: 'done', spotName: 'ขวา' }, { view, photoUrls: photos }).error, INSTALL_JOB_TEXT.photoRequired);
  assert.equal(installSpotInput({ assetId: 'A2', outcome: 'done', spotName: 'ขวา', photoUrl: 'https://x/other' }, { view, photoUrls: photos }).error, INSTALL_JOB_TEXT.photoNotOnVisit);
  assert.equal(installSpotInput({ assetId: 'A2', outcome: 'unable', reason: 'ไม่' }, { view }).error, INSTALL_JOB_TEXT.reasonRequired);
  assert.equal(installSpotInput({ assetId: 'A9', outcome: 'unable', reason: 'ผนังกระจก' }, { view }).error, INSTALL_JOB_TEXT.spotMissing);
  const ok = installSpotInput({ assetId: 'A2', outcome: 'done', spotName: ' ฝั่งขวา ข้างประตู ', photoUrl: PHOTO }, { view, photoUrls: photos });
  assert.deepEqual(ok.value, { assetId: 'A2', zoneId: 'Z1', spotName: 'ฝั่งขวา ข้างประตู', photoUrl: PHOTO, photoName: 'ฝั่งขวา ข้างประตู', outcome: 'done', reason: null });
  assert.equal(installSpotInput({ assetId: 'A2', spotName: 'ขวา' }, { view }).value.outcome, null, 'กรอกชื่ออย่างเดียวยังไม่ตอบผล');
  assert.equal(installZoneNoteInput({ zoneId: 'Z9', note: 'x' }, { view }).error, INSTALL_JOB_TEXT.zoneMissing);
});

test('ส่งงาน: โซนที่ยังไม่มีผลต้องเลือก · ติดไม่ได้ทั้งโซนต้องมีเหตุ · สถานะนัด done/partial/unable', () => {
  const half = viewOf([{ assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' }]);
  assert.equal(installSendInput({}, { view: half }).error, INSTALL_JOB_TEXT.zoneUnresolved);
  assert.equal(installSendInput({ zones: { Z2: { resolution: 'unable', reason: 'ไม่' } } }, { view: half }).error, INSTALL_JOB_TEXT.zoneReasonRequired);
  const later = installSendInput({ zones: { Z2: { resolution: 'later' } } }, { view: half }).value;
  assert.equal(later.status, 'partial', 'โซนไปทำต่อ = ยังไม่ครบ ไม่ใช่ done');
  assert.deepEqual(later.installs.map((i) => i.assetId), ['A1', 'A2']);
  const unableZone = installSendInput({ zones: { Z2: { resolution: 'unable', reason: 'ลูกค้ากำลังจัดชั้นวาง' } } }, { view: half }).value;
  assert.deepEqual(unableZone.unable, [{ assetId: 'A3', zoneId: 'Z2', reason: 'ลูกค้ากำลังจัดชั้นวาง', saved: false }]);
  assert.equal(unableZone.status, 'partial');
  const all = installSendInput({}, { view: viewOf([{ assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' }, { assetId: 'A3', outcome: 'done' }]) }).value;
  assert.equal(all.status, 'done');
  const none = installSendInput({ zones: { Z1: { resolution: 'unable', reason: 'ห้างปิดโซน' }, Z2: { resolution: 'unable', reason: 'ห้างปิดโซน' } } }, { view: viewOf() }).value;
  assert.equal(none.status, 'unable');
  assert.equal(installSendInput({ zones: { Z1: { resolution: 'later' }, Z2: { resolution: 'later' } } }, { view: viewOf() }).error, INSTALL_JOB_TEXT.nothingToSend);
});

test('คำสั่งย้าย install จากหน้างานเขียนชื่อจุดลงทะเบียนเครื่อง · คำสั่งเดิม (ไม่ส่ง spot) ไม่แตะคอลัมน์', () => {
  const patch = assetMovePatch({ id: 'A1', status: 'in_stock' }, 'install', { movedAt: '2027-01-05', toSiteId: 'S1', toZoneId: 'Z1', spot: ' ฝั่งซ้าย ' });
  assert.deepEqual(patch, { status: 'active', siteId: 'S1', zoneId: 'Z1', installedAt: '2027-01-05', removedAt: null, spot: 'ฝั่งซ้าย' });
  assert.equal('spot' in assetMovePatch({ id: 'A1', status: 'in_stock' }, 'install', { movedAt: '2027-01-05', toSiteId: 'S1' }), false);
});

test('ขั้นของคำขอหลังส่งงาน: นัดปิด + เครื่องผล done = ติดตั้งแล้ว · โซนไปทำต่อ/ติดไม่ได้ = กลับไปรอ TS', () => {
  const request = { id: 'R1', mode: 'install', requestedAt: '2026-12-15T03:00:00Z' };
  const visits = [{ id: 'V1', installRequestId: 'R1', status: 'partial' }];
  const stage = (zoneId) => installZoneStage({ request, zoneId, visits, visitZonesByVisitId: { V1: ['Z1', 'Z2'] }, doneZonesByVisitId: { V1: ['Z1'] }, deposit: { state: 'ok' } });
  assert.equal(stage('Z1'), 'installed');
  assert.equal(stage('Z2'), 'awaiting_ts');
});

// ── API ──────────────────────────────────────────────────────────────────────────────
function memoryDb(seed = {}) {
  const tables = structuredClone(seed);
  const writes = [];
  const from = (table) => {
    const st = { op: 'select', preds: [], values: null, single: false, conflict: null };
    const b = {
      select() { return b; }, order() { return b; }, neq(col, v) { st.preds.push((r) => r[col] !== v); return b; },
      update(patch) { st.op = 'update'; st.values = patch; return b; },
      upsert(rows, opts) { st.op = 'upsert'; st.values = Array.isArray(rows) ? rows : [rows]; st.conflict = opts?.onConflict; return b; },
      delete() { st.op = 'delete'; return b; },
      eq(col, v) { st.preds.push((r) => r[col] === v); return b; },
      in(col, vs) { st.preds.push((r) => vs.includes(r[col])); return b; },
      maybeSingle() { st.single = true; return b; },
      then(resolve, reject) {
        const rows = (tables[table] ||= []);
        let hit = rows.filter((r) => st.preds.every((p) => p(r)));
        if (st.op === 'update') { for (const r of hit) Object.assign(r, st.values); writes.push({ table, op: 'update', patch: st.values, hits: hit.length }); }
        if (st.op === 'upsert') {
          const keys = st.conflict.split(',');
          for (const row of st.values) {
            const prior = rows.find((r) => keys.every((k) => r[k] === row[k]));
            if (prior) Object.assign(prior, row); else rows.push({ ...row });
          }
          writes.push({ table, op: 'upsert', rows: st.values });
          hit = st.values;
        }
        if (st.op === 'delete') { tables[table] = rows.filter((r) => !hit.includes(r)); writes.push({ table, op: 'delete', hits: hit.length }); }
        const data = st.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return b;
  };
  return { client: { from }, tables, writes };
}

const VISIT = {
  id: 'V1', code: 'SV-27010007', kind: 'install', status: 'in_progress', installRequestId: 'R1', siteId: 'S1',
  actualDate: '2027-01-05', actualStartTime: '09:05', actualEndDate: null, attachments: [{ url: PHOTO, name: 'ฝั่งซ้าย', kind: 'after' }],
};
const SITE = { id: 'S1', code: 'ST-0412-01', name: 'สาขา FASHION', siteType: 'customer', isActive: true };
const REQUEST = { id: 'R1', salesOrderId: 'SO1', requestedById: 'U-SA', decidedById: 'U-SA', contactName: 'คุณวิภาวดี', contactPhone: '081-234-5678', note: 'เข้าทาง B1' };
const CREW = { id: 'U-NATE', name: 'นที', role: 'ts' };

function harness({ results = [], visit = VISIT } = {}) {
  const db = memoryDb({
    service_visits: [{ ...visit }],
    service_visit_planned_assets: planned.map((p) => ({ visitId: 'V1', ...p })),
    service_visit_zones: visitZones.map((z) => ({ visitId: 'V1', ...z })),
    service_visit_assets: results.map((r, i) => ({ id: `SVR-${i}`, visitId: 'V1', ...r })),
  });
  const load = async () => {
    const res = db.tables.service_visit_assets.filter((r) => r.visitId === 'V1');
    return {
      request: REQUEST, site: SITE, visitZones, planned, results: res, assetsById, zonesById, elsewhere: [],
      view: installJobView({ visitZones, planned, results: res, zonesById, assetsById }),
    };
  };
  const log = { moves: [], threads: [], audits: [], notices: [] };
  const deps = {
    load, now: () => '2027-01-05T03:50:00.000Z', todayIso: '2027-01-05',
    move: async (_s, args) => { log.moves.push(args); return { asset: { ...args.asset, status: 'active' } }; },
    thread: async (_s, e) => log.threads.push(e), audit: async (e) => log.audits.push(e), notify: (_s, a) => log.notices.push(a),
  };
  return { db, log, deps };
}

test('API GET: ภาพงาน + ผู้ติดต่อ · นัดที่ไม่ใช่งานติดตั้งจากคำขอ = 400', async () => {
  const h = harness();
  const res = await installJobGet({ supabase: h.db.client, visit: VISIT, load: h.deps.load });
  assert.equal(res.status, 200);
  assert.equal(res.body.view.total, 3);
  assert.equal(res.body.request.contactName, 'คุณวิภาวดี');
  assert.equal(res.body.canRecord, true);
  assert.equal((await installJobGet({ supabase: h.db.client, visit: { ...VISIT, installRequestId: null }, load: h.deps.load })).status, 400);
});

test('API PUT จุด: เขียนชื่อจุด/รูป + upsert ผล · ล้างผล = ลบแถว · ยังไม่เริ่มงาน = 409', async () => {
  const h = harness();
  const res = await installSpotPut({ supabase: h.db.client, user: CREW, visit: VISIT, body: { assetId: 'A1', outcome: 'done', spotName: 'ฝั่งซ้าย ข้างเสา A', photoUrl: PHOTO }, ...h.deps });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = h.db.tables.service_visit_planned_assets.find((p) => p.assetId === 'A1');
  assert.equal(row.savedByName, 'นที');
  assert.equal(h.db.tables.service_visit_assets[0].outcome, 'done');
  await installSpotPut({ supabase: h.db.client, user: CREW, visit: VISIT, body: { assetId: 'A1', spotName: 'ฝั่งซ้าย' }, ...h.deps });
  assert.equal(h.db.tables.service_visit_assets.length, 0, 'ไม่มีผล = ยังไม่ตอบ');
  const note = await installSpotPut({ supabase: h.db.client, user: CREW, visit: VISIT, body: { zoneId: 'Z1', note: 'ลูกค้าขอย้ายจุด' }, ...h.deps });
  assert.equal(note.status, 200);
  assert.equal(h.db.tables.service_visit_zones.find((z) => z.zoneId === 'Z1').note, 'ลูกค้าขอย้ายจุด');
  assert.equal((await installSpotPut({ supabase: h.db.client, user: CREW, visit: { ...VISIT, status: 'scheduled' }, body: { assetId: 'A1' }, ...h.deps })).status, 409);
});

test('API ส่งงาน: ผลโซนที่ติดไม่ได้ › ย้ายเครื่องที่ติดตั้ง (พร้อมชื่อจุด) › ปิดนัด partial + เวลาจบ › เธรด · audit · กระดิ่ง', async () => {
  const h = harness({ results: [{ assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' }] });
  const res = await installSendPost({
    supabase: h.db.client, user: CREW, visit: VISIT, ...h.deps,
    body: { zones: { Z2: { resolution: 'unable', reason: 'ลูกค้ากำลังจัดชั้นวาง' } }, note: 'เลื่อนโซนผักผลไม้' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'partial');
  assert.deepEqual(h.log.moves.map((m) => [m.asset.id, m.kind, m.input.toZoneId, m.input.spot]), [['A1', 'install', 'Z1', 'ฝั่งซ้าย ข้างเสา A'], ['A2', 'install', 'Z1', null]]);
  assert.equal(h.db.tables.service_visit_assets.find((r) => r.assetId === 'A3').outcome, 'unable');
  const closed = h.db.tables.service_visits[0];
  assert.equal(closed.status, 'partial');
  assert.ok(closed.actualEndTime, 'ประทับเวลาจบ');
  assert.equal(h.log.threads[0].kind, 'done');
  assert.match(h.log.threads[0].body, /ติดตั้งแล้ว 2\/3 จุด · ติดไม่ได้ 1 — เลื่อนโซนผักผลไม้/);
  assert.equal(h.log.notices[0].installed, 2);
});

test('API ส่งงาน: เครื่องที่ขึ้นไซต์แล้ว (ส่งรอบก่อนค้าง) ข้าม · ย้ายพลาด = 409 ไม่ปิดนัด · ทุกจุดติดไม่ได้ = unable + เหตุ', async () => {
  const again = harness({ results: [{ assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' }, { assetId: 'A3', outcome: 'done' }] });
  assetsById.set('A1', { ...assetsById.get('A1'), status: 'active', siteId: 'S1' });
  try {
    const res = await installSendPost({ supabase: again.db.client, user: CREW, visit: VISIT, body: {}, ...again.deps });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(again.log.moves.map((m) => m.asset.id), ['A2', 'A3']);
    assert.equal(res.body.status, 'done');
  } finally {
    assetsById.set('A1', { ...assetsById.get('A1'), status: 'in_stock', siteId: null });
  }

  const broken = harness({ results: [{ assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' }, { assetId: 'A3', outcome: 'done' }] });
  const res = await installSendPost({
    supabase: broken.db.client, user: CREW, visit: VISIT, body: {}, ...broken.deps,
    move: async () => ({ error: 'สถานะเครื่องเปลี่ยนไปแล้ว', status: 409 }),
  });
  assert.equal(res.status, 409);
  assert.equal(broken.db.tables.service_visits[0].status, 'in_progress', 'ย้ายไม่ครบ = ยังไม่ปิดนัด');

  const none = harness();
  const all = await installSendPost({
    supabase: none.db.client, user: CREW, visit: VISIT, ...none.deps,
    body: { zones: { Z1: { resolution: 'unable', reason: 'ห้างปิดชั้น G' }, Z2: { resolution: 'unable', reason: 'ห้างปิดชั้น G' } } },
  });
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.equal(none.db.tables.service_visits[0].status, 'unable');
  assert.match(none.db.tables.service_visits[0].unableReason, /^ติดตั้งไม่ได้ทุกจุด: ห้างปิดชั้น G$/);
  assert.equal(none.log.moves.length, 0);
});

test('กระดิ่งส่งงานติดตั้ง: ถึงฝ่ายขายที่ขอคิว · บอกส่วนที่เหลือกลับไปรอ TS · ลงทะเบียนกระดิ่ง', () => {
  const notice = installDoneNotice({ visit: { id: 'V1', code: 'SV-27010007' }, request: REQUEST, site: SITE, installed: 2, total: 3, unable: 1, actor: { id: 'U-NATE' } });
  assert.deepEqual(notice.userIds, ['U-SA']);
  assert.equal(notice.kind, INSTALL_DONE_KIND);
  assert.match(notice.body, /ติดตั้งแล้ว 2\/3 จุด · ติดไม่ได้ 1 จุด · ส่วนที่เหลือกลับไปรอ TS ลงคิวใหม่/);
  assert.equal(notice.href, '/sales-planning/sales-orders/SO1#install');
  assert.ok(SERVICE_BELL_KINDS.includes(INSTALL_DONE_KIND));
});
