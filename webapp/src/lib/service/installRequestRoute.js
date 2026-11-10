// ── API คำขอคิวติดตั้งของใบสั่งขาย (ขั้นเข้าติดตั้ง PR-2b · mig 0425) ────────────────────────────────
//
//   GET  ภาพรวมรายไซต์ (การ์ด "ติดตั้ง · เข้าบริการ") — ทุกคนที่อ่านใบได้
//   PUT  เลือกโหมดรายไซต์ `{ siteId, mode: 'install'|'none' }`
//   POST ขอคิว/แก้คำขอ `{ siteId, zoneIds, requestedDate, requestedStartTime?, requestedEndTime?, contactName?, contactPhone?, note? }`
//
// ⭐ ตรรกะทั้งหมดอยู่ที่นี่ (route เป็นตัวส่งต่อ) · ตัวเขียน audit / กระดิ่ง รับเป็นพารามิเตอร์ ⇒ เทสต์ด้วย supabase ปลอม
//    ไม่แตะฐานจริง (กติกา AGENTS.md "เทสต์ห้ามต่อฐานข้อมูลจริง")
// ⭐ ด่านมาจาก `installRequest.js` ตัวเดียวกับการ์ดบนจอ · สวิตช์ส่งเข้ามาจาก route (ตัวอ่านสวิตช์ import ได้เฉพาะใต้ api/)
// ⚠️ proxy: เส้นนี้อยู่ใต้ /api/sales-planning ⇒ เขียนได้เฉพาะคนที่ถือ salesplan:edit
import { randomUUID } from 'node:crypto';
import { recordAudit } from '@/lib/audit';
import { businessDate } from '@/lib/businessDate';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { loadScoped } from '@/lib/scopedRow';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { loadServiceSetupContext } from '@/lib/sales/serviceSetupRepo';
import { notifyInstallRequested } from './installNotify';
import {
  INSTALL_REQUEST_TEXT, installContractView, installModeError, installOrderError, installRequestInput, installSitesView,
} from './installRequest';

const reply = (status, body) => ({ status, body });
const failWith = (status, error, extra = {}) => reply(status, { error, ...extra });
const text = (value) => String(value ?? '').trim();

const VISIT_COLUMNS = 'id, code, status, kind, "siteId", "installRequestId", "scheduledDate", "startTime", "endTime", '
  + '"assigneeId", "assigneeName", "tsConfirmedAt", "tsConfirmedByName", "customerConfirmedAt", "customerConfirmedByName", "dateChangeReason", '
  + '"actualDate", "actualEndTime"';
const ASSET_COLUMNS = 'id, code, label, model, colour, status, "siteId", "zoneId", spot';

async function scopedOrder(supabase, user, id) {
  const { row, response } = await loadScoped(supabase, 'sales_orders', id, user, 'view');
  if (!response) return { order: row };
  let body;
  try { body = await response.json(); } catch { body = { error: 'ไม่พบใบสั่งขาย' }; }
  return { failure: reply(response.status, body) };
}

const canEditOrder = (user, order) => canEditSalesPlanning(user) && inSalesEditScope(user, order?.deal);

/* ⭐ จุดโหลดเดียว: บริบทงานบริการของใบ + คำขอ + โซนที่ขอ + นัดติดตั้ง + โซนของนัด + โซนที่ติดตั้งได้แล้ว
   ⚠️ อ่านพัง = throw (ผู้เรียกตอบ 500 ไทย) — ห้ามคืนก้อนว่างที่อ่านเป็น "ยังไม่มีคำขอ" */
export async function loadInstallState(supabase, order) {
  const ctx = await loadServiceSetupContext(supabase, order, { withFgOptions: false });
  const { data: requests, error: requestError } = await supabase
    .from('service_install_requests').select('*').eq('salesOrderId', order.id);
  if (requestError) throw new Error(`อ่านคำขอติดตั้งไม่สำเร็จ: ${requestError.message}`);
  const requestIds = (requests || []).map((r) => r.id);
  let requestZones = [];
  let visits = [];
  const visitZonesByVisitId = {};
  const doneZonesByVisitId = {};
  const installedAssets = [];
  if (requestIds.length) {
    const [zonesRes, visitsRes] = await Promise.all([
      supabase.from('service_install_request_zones').select('"requestId", "zoneId"').in('requestId', requestIds),
      // ⚠️ ไล่ทีละหน้า (check:rowcap) — นัดของคำขอสะสมได้ตามรอบเลื่อน/ทำไม่ครบ
      fetchAllResult(() => supabase.from('service_visits').select(VISIT_COLUMNS).in('installRequestId', requestIds)
        .order('scheduledDate', { ascending: true }).order('id', { ascending: true })),
    ]);
    if (zonesRes.error) throw new Error(`อ่านโซนที่ขอติดตั้งไม่สำเร็จ: ${zonesRes.error.message}`);
    if (visitsRes.error) throw new Error(`อ่านนัดติดตั้งไม่สำเร็จ: ${visitsRes.error.message}`);
    requestZones = zonesRes.data || [];
    visits = visitsRes.data || [];
    const visitIds = visits.map((v) => v.id);
    if (visitIds.length) {
      const [vzRes, plannedRes, outcomeRes] = await Promise.all([
        supabase.from('service_visit_zones').select('"visitId", "zoneId"').in('visitId', visitIds),
        supabase.from('service_visit_planned_assets').select('"visitId", "zoneId", "assetId"').in('visitId', visitIds),
        supabase.from('service_visit_assets').select('"visitId", "assetId", outcome').in('visitId', visitIds),
      ]);
      for (const res of [vzRes, plannedRes, outcomeRes]) {
        if (res.error) throw new Error(`อ่านโซน/เครื่องของนัดติดตั้งไม่สำเร็จ: ${res.error.message}`);
      }
      for (const row of vzRes.data || []) (visitZonesByVisitId[row.visitId] ||= []).push(row.zoneId);
      const zoneOfPlanned = new Map((plannedRes.data || []).map((p) => [`${p.visitId}|${p.assetId}`, p.zoneId]));
      for (const row of outcomeRes.data || []) {
        if (row.outcome !== 'done') continue;
        const zoneId = zoneOfPlanned.get(`${row.visitId}|${row.assetId}`);
        if (zoneId) {
          (doneZonesByVisitId[row.visitId] ||= []).push(zoneId);
          installedAssets.push({ visitId: row.visitId, zoneId, assetId: row.assetId });
        }
      }
    }
  }

  /* ⭐ PR-5c (ม็อก A3/A6): เครื่องที่ติดตั้งแล้ว (รหัส · รุ่น · สี) + เครื่องที่อยู่แล้วของไซต์ Service (จากทะเบียนเครื่อง)
     — การ์ดผลติดตั้งในแท็บสัญญาใช้ประกอบการออกสัญญา (สัญญาเป็นราย SO ⇒ ครอบไซต์ Service ด้วย) */
  const serviceSiteIds = (requests || []).filter((r) => r.mode === 'none').map((r) => r.siteId);
  const assetIds = [...new Set(installedAssets.map((a) => a.assetId))];
  const [assetRes, siteAssetRes] = await Promise.all([
    assetIds.length
      ? fetchAllResult(() => supabase.from('service_assets').select(ASSET_COLUMNS).in('id', assetIds).order('id', { ascending: true }))
      : { data: [], error: null },
    serviceSiteIds.length
      ? fetchAllResult(() => supabase.from('service_assets').select(ASSET_COLUMNS).in('siteId', serviceSiteIds)
        .eq('status', 'active').order('id', { ascending: true }))
      : { data: [], error: null },
  ]);
  if (assetRes.error) throw new Error(`อ่านทะเบียนเครื่องที่ติดตั้งไม่สำเร็จ: ${assetRes.error.message}`);
  if (siteAssetRes.error) throw new Error(`อ่านเครื่องของไซต์ Service ไม่สำเร็จ: ${siteAssetRes.error.message}`);
  const assetsById = new Map((assetRes.data || []).map((a) => [a.id, a]));
  return {
    ctx, requests: requests || [], requestZones, visits, visitZonesByVisitId, doneZonesByVisitId,
    installedAssets: installedAssets.map((a) => ({ ...a, ...(assetsById.get(a.assetId) || {}), assetId: a.assetId })),
    siteAssets: siteAssetRes.data || [],
  };
}

const siteZoneIdsOf = (view, siteId) => (view.sites.find((s) => s.siteId === siteId)?.zones || []).map((z) => z.zoneId);

/* ── GET ── */
/* ⭐ ตัวโหลดส่งเข้ามาได้ (เทสต์ใส่โลกย่อส่วนแทนการไล่ตาราง 10 ตัวของบริบทงานบริการ) */
export const DEFAULT_DEPS = Object.freeze({ scope: scopedOrder, load: loadInstallState });

export async function installGet({ supabase, user, id, enabled = false, deps = DEFAULT_DEPS }) {
  if (!user) return failWith(401, 'unauthorized');
  if (!canViewSalesPlanning(user)) return failWith(403, 'forbidden');
  const { order, failure } = await deps.scope(supabase, user, id);
  if (failure) return failure;
  try {
    const state = await deps.load(supabase, order);
    const view = installSitesView(state.ctx, state);
    const canEdit = canEditOrder(user, order);
    return reply(200, {
      enabled,
      canEdit,
      blocker: installOrderError(state.ctx.order, { canEdit, enabled }),
      todayIso: businessDate(),
      ...view,
      /* การ์ดผลติดตั้งในแท็บสัญญา (PR-5c · A6) — ก้อนเดียวกัน ไม่ยิงเส้นที่สอง */
      contract: installContractView(view),
    });
  } catch (error) {
    return failWith(500, `โหลดงานติดตั้งไม่สำเร็จ: ${error?.message || error}`);
  }
}

/* ด่านร่วมของ PUT/POST (และคำตอบของลูกค้า PR-4) — ใบ · สิทธิ์ · สวิตช์ · ไซต์อยู่ในใบ */
export async function prepareWrite({ supabase, user, id, enabled, siteId, deps = DEFAULT_DEPS }) {
  if (!user) return { failure: failWith(401, 'unauthorized') };
  if (!canViewSalesPlanning(user)) return { failure: failWith(403, 'forbidden') };
  const { order, failure } = await deps.scope(supabase, user, id);
  if (failure) return { failure };
  let state;
  try { state = await deps.load(supabase, order); }
  catch (error) { return { failure: failWith(500, `โหลดงานติดตั้งไม่สำเร็จ: ${error?.message || error}`) }; }
  const blocker = installOrderError(state.ctx.order, { canEdit: canEditOrder(user, order), enabled });
  if (blocker) return { failure: failWith(blocker === INSTALL_REQUEST_TEXT.noRight ? 403 : 409, blocker) };
  const view = installSitesView(state.ctx, state);
  const site = view.sites.find((s) => s.siteId === siteId) || null;
  if (!site) return { failure: failWith(400, INSTALL_REQUEST_TEXT.siteNotInOrder) };
  return { order: state.ctx.order, state, view, site };
}

/* ── PUT: เลือกโหมดรายไซต์ ── */
export async function installModePut({
  supabase, user, id, body, enabled = false, request = null, audit = recordAudit, now = () => new Date().toISOString(), deps = DEFAULT_DEPS,
}) {
  const siteId = text(body?.siteId);
  const mode = text(body?.mode);
  const prep = await prepareWrite({ supabase, user, id, enabled, siteId, deps });
  if (prep.failure) return prep.failure;
  const before = prep.site.request;
  const error = installModeError({ mode, request: before, visits: prep.state.visits, siteInOrder: true });
  if (error) return failWith(error === INSTALL_REQUEST_TEXT.modeLocked ? 409 : 400, error);
  if (before?.mode === mode) return reply(200, { request: before, unchanged: true });

  const stamp = now();
  const actor = { decidedAt: stamp, decidedById: user.id ?? null, decidedByName: user.name || user.email || null, updatedAt: stamp };
  let saved;
  if (before) {
    /* Service ไม่มีคำขอคิว (CHECK ของ 0425) ⇒ เปลี่ยนเป็น none ต้องล้างวันที่ขอ/เวลาที่ขอคู่กันเสมอ
       ⚠️ โซนที่ขอไว้ลบทิ้งด้วย — ไม่งั้นกลับมาเลือกติดตั้งแล้วโซนเก่าโผล่เป็นคำขอที่ไม่มีใครกด */
    const patch = mode === 'none'
      ? { mode, requestedDate: null, requestedStartTime: null, requestedEndTime: null, requestedAt: null,
        requestedById: null, requestedByName: null, changeReason: null, ...actor }
      : { mode, ...actor };
    const { data, error: writeError } = await supabase.from('service_install_requests')
      .update(patch).eq('id', before.id).eq('updatedAt', before.updatedAt).select('*').maybeSingle();
    if (writeError) return failWith(500, `บันทึกไม่สำเร็จ: ${writeError.message}`);
    if (!data) return failWith(409, 'ไซต์นี้เพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่');
    if (mode === 'none') {
      const { error: zoneError } = await supabase.from('service_install_request_zones').delete().eq('requestId', before.id);
      if (zoneError) return failWith(500, `ล้างโซนที่ขอไม่สำเร็จ: ${zoneError.message}`);
    }
    saved = data;
  } else {
    const row = { id: `SIR-${randomUUID()}`, salesOrderId: prep.order.id, siteId, mode, createdAt: stamp, ...actor };
    const { data, error: writeError } = await supabase.from('service_install_requests').insert(row).select('*').maybeSingle();
    if (writeError) {
      if (writeError.code === '23505') return failWith(409, 'ไซต์นี้เพิ่งถูกเลือกจากอีกหน้าต่าง — โหลดใหม่');
      return failWith(500, `บันทึกไม่สำเร็จ: ${writeError.message}`);
    }
    saved = data;
  }
  await audit({
    user, action: before ? 'update' : 'create', entityType: 'service_install_requests', entityId: saved.id,
    before, after: saved,
    summary: `เลือก${mode === 'install' ? 'ติดตั้ง' : ' Service'} · ${prep.site.siteCode || siteId} ของ ${prep.order.orderNumber || prep.order.id}`,
    request,
  });
  return reply(200, { request: saved });
}

/* ── POST: ขอคิว / แก้คำขอ ── */
export async function installRequestPost({
  supabase, user, id, body, enabled = false, request = null, audit = recordAudit, notify = notifyInstallRequested,
  now = () => new Date().toISOString(), todayIso = businessDate(), deps = DEFAULT_DEPS,
}) {
  const siteId = text(body?.siteId);
  const prep = await prepareWrite({ supabase, user, id, enabled, siteId, deps });
  if (prep.failure) return prep.failure;
  const before = prep.site.request;
  /* ยังไม่เคยตอบโหมด = ขอคิวคือการเลือก "ติดตั้ง" ไปด้วยในตัว (ปุ่มขอคิวอยู่ข้างตัวเลือกบนการ์ด) */
  const { value, error } = installRequestInput(body, {
    siteZoneIds: siteZoneIdsOf(prep.view, siteId), todayIso, request: before, visits: prep.state.visits,
  });
  if (error) return failWith(error === INSTALL_REQUEST_TEXT.tsConfirmed ? 409 : 400, error);

  const stamp = now();
  const fields = {
    mode: 'install',
    requestedDate: value.requestedDate,
    requestedStartTime: value.requestedStartTime,
    requestedEndTime: value.requestedEndTime,
    contactName: value.contactName,
    contactPhone: value.contactPhone,
    note: value.note,
    requestedAt: stamp,
    requestedById: user.id ?? null,
    requestedByName: user.name || user.email || null,
    updatedAt: stamp,
    ...(before?.mode === 'install' ? {} : { decidedAt: stamp, decidedById: user.id ?? null, decidedByName: user.name || user.email || null }),
  };
  let saved;
  if (before) {
    const { data, error: writeError } = await supabase.from('service_install_requests')
      .update(fields).eq('id', before.id).eq('updatedAt', before.updatedAt).select('*').maybeSingle();
    if (writeError) return failWith(500, `บันทึกคำขอไม่สำเร็จ: ${writeError.message}`);
    if (!data) return failWith(409, 'คำขอนี้เพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่');
    saved = data;
  } else {
    const row = { id: `SIR-${randomUUID()}`, salesOrderId: prep.order.id, siteId, createdAt: stamp, ...fields };
    const { data, error: writeError } = await supabase.from('service_install_requests').insert(row).select('*').maybeSingle();
    if (writeError) {
      if (writeError.code === '23505') return failWith(409, 'ไซต์นี้เพิ่งถูกขอคิวจากอีกหน้าต่าง — โหลดใหม่');
      return failWith(500, `บันทึกคำขอไม่สำเร็จ: ${writeError.message}`);
    }
    saved = data;
  }

  /* โซนที่ขอ — เพิ่มที่ขาด แล้วลบที่ไม่ได้เลือกแล้ว (ไม่ลบทั้งชุดก่อน: พังกลางทางต้องไม่เหลือคำขอเปล่า) */
  const want = new Set(value.zoneIds);
  const had = new Set((prep.state.requestZones || []).filter((r) => r.requestId === saved.id).map((r) => String(r.zoneId)));
  const add = [...want].filter((zoneId) => !had.has(zoneId)).map((zoneId) => ({ requestId: saved.id, zoneId }));
  const drop = [...had].filter((zoneId) => !want.has(zoneId));
  if (add.length) {
    const { error: addError } = await supabase.from('service_install_request_zones').insert(add);
    if (addError) return failWith(500, `บันทึกโซนที่ขอไม่สำเร็จ: ${addError.message}`);
  }
  if (drop.length) {
    const { error: dropError } = await supabase.from('service_install_request_zones')
      .delete().eq('requestId', saved.id).in('zoneId', drop);
    if (dropError) return failWith(500, `ล้างโซนที่ไม่ได้เลือกไม่สำเร็จ: ${dropError.message}`);
  }

  await audit({
    user, action: before ? 'update' : 'create', entityType: 'service_install_requests', entityId: saved.id,
    before: before ? { ...before, zoneIds: [...had] } : null, after: { ...saved, zoneIds: [...want] },
    summary: `${before?.requestedAt ? 'แก้คำขอคิวติดตั้ง' : 'ขอคิวติดตั้ง'} · ${prep.site.siteCode || siteId} · ${want.size} โซน · ${saved.requestedDate} ของ ${prep.order.orderNumber || prep.order.id}`,
    request,
  });
  notify(supabase, {
    request: saved, order: prep.order, site: { code: prep.site.siteCode, name: prep.site.siteName },
    zoneCount: want.size, actor: { id: user.id ?? null, name: user.name || user.email || null },
    changed: Boolean(before?.requestedAt),
  });
  return reply(200, { request: { ...saved, zoneIds: [...want] } });
}
