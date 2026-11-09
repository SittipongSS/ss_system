// ── API "TS ยืนยันวันติดตั้ง" (ขั้นเข้าติดตั้ง PR-3a · ม็อก B2 · mig 0425) ──────────────────────────────────
//
//   POST /api/service/install-requests/[id]/confirm
//     body `{ zoneIds, scheduledDate, startTime?, endTime?, assigneeId, assigneeName?, assistantIds?, plannedAssets, dateChangeReason? }`
//     → 201 `{ visit }` · 400 ค่าผิด · 403 · 404 · 409 มัดจำยังไม่ผ่าน/โซนมีนัดแล้ว/เครื่องถูกวางแล้ว
//
// ⭐ ผล = นัดติดตั้ง **ร่าง** (`kind: install` · `installRequestId` · `tsConfirmed*` · `dateChangeReason`)
//    + โซนของนัด + เครื่องที่วาง · ช่างยังไม่เห็นจนกว่า SA คอนเฟิร์มลูกค้า (ด่าน "นัดยืนยันกับลูกค้าแล้ว")
// ⭐ ตรรกะอยู่ที่นี่ (route เป็นตัวส่งต่อ) · ตัวโหลด/ตัวเขียน/audit/กระดิ่ง ส่งเข้ามาได้ ⇒ เทสต์ไม่แตะฐานจริง
// ⚠️ เขียนสามตาราง (นัด → โซน → เครื่อง) — PostgREST ไม่มีทรานแซกชันคร่อม ⇒ ขั้นหลังพัง = ลบนัดที่เพิ่งสร้างทิ้ง
//    (นัดที่ไม่มีโซนติดด่านอยู่แล้ว แต่ไม่ควรค้างเป็นขยะในคิว)
import { recordAudit } from '@/lib/audit';
import { appendUpdate } from '@/lib/master/updates';
import { fmtDate } from '@/lib/format';
import { businessDate } from '@/lib/businessDate';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { genId } from '@/lib/id';
import { canEditService } from '@/lib/permissions';
import { installDepositGate } from './installDeposit';
import { INSTALL_CONFIRM_TEXT, installBusyZoneIds, installConfirmInput, installReconfirmInput } from './installConfirm';
import { notifyInstallDateConfirmed } from './installNotify';
import { isDraftVisit, isOpenVisit } from './visitStatus';
// ใบย้อนหลัง — ตัวตัดสินเดียว (ยาม historicalMoneyGuards: โหลดใบเดียวต้องตัดสินใบย้อนหลัง)
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';

const reply = (status, body) => ({ status, body });
const failWith = (status, error, extra = {}) => reply(status, { error, ...extra });
const CONFLICT_ERRORS = new Set([
  INSTALL_CONFIRM_TEXT.zoneBusy, INSTALL_CONFIRM_TEXT.assetNotInStock, INSTALL_CONFIRM_TEXT.assetPlannedElsewhere,
  INSTALL_CONFIRM_TEXT.notRequested, INSTALL_CONFIRM_TEXT.notReasked,
]);

const orThrow = (label, res) => {
  if (res.error) throw new Error(`${label}ไม่สำเร็จ: ${res.error.message}`);
  return res.data || [];
};

/* ⭐ จุดโหลดเดียวของการยืนยัน — คำขอ · ใบ · ไซต์ (ชื่อบนกระดิ่ง) · งวด · โซนที่ขอ · นัดของคำขอ (+ โซน/เครื่อง/ผล) · เครื่องที่จะวาง */
export async function loadConfirmState(supabase, requestId, assetIds = []) {
  const { data: request, error } = await supabase.from('service_install_requests').select('*').eq('id', requestId).maybeSingle();
  if (error) throw new Error(`อ่านคำขอติดตั้งไม่สำเร็จ: ${error.message}`);
  if (!request) return { request: null };
  const [orderRes, installmentRes, zonesRes, visitsRes, siteRes] = await Promise.all([
    supabase.from('sales_orders').select('id, "orderNumber", "customerName", status, origin, "totalAmount", "dealId", "supersededById"')
      .eq('id', request.salesOrderId).maybeSingle(),
    supabase.from('sales_order_installments').select('id, seq, label, status, "beforeInstall"').eq('salesOrderId', request.salesOrderId),
    supabase.from('service_install_request_zones').select('"zoneId"').eq('requestId', request.id),
    fetchAllResult(() => supabase.from('service_visits')
      .select('id, code, status, "installRequestId", "scheduledDate", "startTime", "endTime", "assigneeId", "assigneeName", "tsConfirmedAt", "customerConfirmedAt", "dateChangeReason"')
      .eq('installRequestId', request.id).order('id', { ascending: true })),
    supabase.from('service_sites').select('id, code, name').eq('id', request.siteId).maybeSingle(),
  ]);
  if (orderRes.error) throw new Error(`อ่านใบสั่งขายไม่สำเร็จ: ${orderRes.error.message}`);
  const installments = orThrow('อ่านงวดชำระ', installmentRes);
  const requestZoneIds = orThrow('อ่านโซนที่ขอ', zonesRes).map((z) => z.zoneId);
  const visits = orThrow('อ่านนัดติดตั้ง', visitsRes);
  const visitIds = visits.map((v) => v.id);
  const visitZonesByVisitId = {};
  const doneZonesByVisitId = {};
  if (visitIds.length) {
    const [vz, planned, outcomes] = await Promise.all([
      supabase.from('service_visit_zones').select('"visitId", "zoneId"').in('visitId', visitIds),
      supabase.from('service_visit_planned_assets').select('"visitId", "zoneId", "assetId"').in('visitId', visitIds),
      supabase.from('service_visit_assets').select('"visitId", "assetId", outcome').in('visitId', visitIds),
    ]);
    for (const row of orThrow('อ่านโซนของนัด', vz)) (visitZonesByVisitId[row.visitId] ||= []).push(row.zoneId);
    const zoneOf = new Map(orThrow('อ่านเครื่องที่วาง', planned).map((p) => [`${p.visitId}|${p.assetId}`, p.zoneId]));
    for (const row of orThrow('อ่านผลรายเครื่อง', outcomes)) {
      const zoneId = row.outcome === 'done' ? zoneOf.get(`${row.visitId}|${row.assetId}`) : null;
      if (zoneId) (doneZonesByVisitId[row.visitId] ||= []).push(zoneId);
    }
  }
  /* เครื่องที่จะวาง: สถานะในทะเบียน + ถูกวางไว้ให้นัดติดตั้งอื่นที่ยังมีชีวิตไหม */
  const assetsById = new Map();
  const plannedElsewhere = new Set();
  if (assetIds.length) {
    const [assetRes, otherRes] = await Promise.all([
      // ⚠️ ไล่ทีละหน้า (check:rowcap) — ชุดเครื่องมาจากจอ ขนาดไม่การันตี
      fetchAllResult(() => supabase.from('service_assets').select('id, code, status, "siteId"').in('id', assetIds).order('id', { ascending: true })),
      supabase.from('service_visit_planned_assets').select('"visitId", "assetId"').in('assetId', assetIds),
    ]);
    for (const a of orThrow('อ่านทะเบียนเครื่อง', assetRes)) assetsById.set(a.id, a);
    const others = orThrow('อ่านเครื่องที่วางไว้แล้ว', otherRes);
    const otherVisitIds = [...new Set(others.map((o) => o.visitId))];
    if (otherVisitIds.length) {
      const live = orThrow('อ่านสถานะนัดอื่น', await fetchAllResult(() => supabase.from('service_visits').select('id, status')
        .in('id', otherVisitIds).order('id', { ascending: true })));
      const liveIds = new Set(live.filter((v) => isDraftVisit(v) || isOpenVisit(v)).map((v) => v.id));
      for (const o of others) if (liveIds.has(o.visitId)) plannedElsewhere.add(o.assetId);
    }
  }
  return {
    request, order: orderRes.data || null, site: siteRes.error ? null : (siteRes.data || null), installments, requestZoneIds, visits,
    visitZonesByVisitId, doneZonesByVisitId, assetsById, plannedElsewhere,
  };
}

export async function installConfirmPost({
  supabase, user, requestId, body, request = null, audit = recordAudit, notify = notifyInstallDateConfirmed, thread = appendUpdate,
  now = () => new Date().toISOString(), todayIso = businessDate(), load = loadConfirmState,
  insertVisit = (client, row) => insertRowWithEntityCode(client, 'SV', row),
}) {
  if (!user) return failWith(401, 'unauthorized');
  if (!canEditService(user)) return failWith(403, 'ไม่มีสิทธิ์ยืนยันวันติดตั้ง');
  const assetIds = [...new Set((Array.isArray(body?.plannedAssets) ? body.plannedAssets : [])
    .map((p) => String(p?.assetId ?? '').trim()).filter(Boolean))];
  let state;
  try { state = await load(supabase, requestId, assetIds); }
  catch (error) { return failWith(500, error?.message || 'โหลดคำขอติดตั้งไม่สำเร็จ'); }
  if (!state.request) return failWith(404, 'ไม่พบคำขอติดตั้ง');
  if (!state.order || state.order.status !== 'approved' || state.order.supersededById) {
    return failWith(409, 'ใบสั่งขายของคำขอนี้ไม่ได้อยู่ในสถานะอนุมัติแล้ว — ให้ฝ่ายขายตรวจใบก่อน');
  }
  /* ใบย้อนหลังไม่มีขั้นเข้าติดตั้ง (ติดตั้งไปแล้วก่อนเข้าระบบ) — ด่านเดียวกับฝั่งฝ่ายขาย (installOrderError) */
  if (isHistoricalOrder(state.order)) return failWith(409, 'ใบสั่งขายย้อนหลังไม่มีขั้นเข้าติดตั้ง');

  const deposit = installDepositGate(state.order, state.installments);
  /* ⭐ ลูกค้าขอเปลี่ยนวันหลัง TS ยืนยัน (PR-4) — ยืนยันวันใหม่บนนัดร่างเดิม (`visitId`) แทนการสร้างนัดใหม่ */
  const reconfirmId = String(body?.visitId ?? '').trim();
  if (reconfirmId) {
    return reconfirmVisit({ supabase, user, state, deposit, visitId: reconfirmId, body, request, audit, notify, thread, now, todayIso });
  }
  const busyZoneIds = installBusyZoneIds({ requestId: state.request.id, ...state });
  const { value, error } = installConfirmInput(body || {}, {
    request: state.request, requestZoneIds: state.requestZoneIds, busyZoneIds, deposit, todayIso,
    assetsById: state.assetsById, plannedElsewhere: state.plannedElsewhere,
  });
  if (error) {
    const conflict = CONFLICT_ERRORS.has(error) || error.startsWith(INSTALL_CONFIRM_TEXT.depositBlocked);
    return failWith(conflict ? 409 : 400, error);
  }

  const stamp = now();
  const actorName = user.name || user.email || null;
  /* ⭐ สถานะ = ร่างเสมอ — ด่านนัดติดตั้งข้อ "นัดยืนยันกับลูกค้าแล้ว" ยังติดจนกว่า SA คอนเฟิร์ม (ไม่ต้องถามด่านซ้ำที่นี่) */
  const row = {
    id: genId('SVV'),
    siteId: state.request.siteId,
    kind: 'install',
    status: 'draft',
    installRequestId: state.request.id,
    scheduledDate: value.scheduledDate,
    startTime: value.startTime,
    endTime: value.endTime,
    assigneeId: value.assigneeId,
    assigneeName: value.assigneeName,
    assistantIds: value.assistantIds,
    dateChangeReason: value.dateChangeReason,
    tsConfirmedAt: stamp,
    tsConfirmedById: user.id ? String(user.id) : null,
    tsConfirmedByName: actorName,
    note: state.request.note || null,
    createdById: user.id ? String(user.id) : null,
    createdByName: actorName,
  };
  const { data: visit, error: insertError } = await insertVisit(supabase, row);
  if (insertError || !visit) return failWith(500, `สร้างนัดติดตั้งไม่สำเร็จ: ${insertError?.message || 'ไม่ทราบสาเหตุ'}`);

  const rollback = async (message) => {
    const { error: cleanupError } = await supabase.from('service_visits').delete().eq('id', visit.id);
    /* ลบนัดที่เพิ่งสร้างไม่สำเร็จ = นัดร่างไม่มีโซนค้าง (ด่านกันขึ้นตารางอยู่แล้ว) — บอกในข้อความให้ตามลบ */
    return failWith(500, cleanupError ? `${message} · นัด ${visit.code || visit.id} ค้างเป็นร่าง ให้ TS ลบทิ้ง` : message);
  };
  const { error: zoneError } = await supabase.from('service_visit_zones')
    .insert(value.zoneIds.map((zoneId) => ({ visitId: visit.id, zoneId })));
  if (zoneError) return rollback(`บันทึกโซนของนัดไม่สำเร็จ: ${zoneError.message}`);
  const { error: assetError } = await supabase.from('service_visit_planned_assets')
    .insert(value.plannedAssets.map((p, i) => ({ visitId: visit.id, zoneId: p.zoneId, assetId: p.assetId, sortOrder: i })));
  if (assetError) return rollback(`บันทึกเครื่องที่วางไม่สำเร็จ: ${assetError.message}`);

  await audit({
    user, action: 'create', entityType: 'service_visit', entityId: visit.id,
    after: { ...visit, zoneIds: value.zoneIds, plannedAssets: value.plannedAssets },
    summary: `TS ยืนยันวันติดตั้ง ${visit.code || visit.id} · ${value.scheduledDate}`
      + `${value.dateChangeReason ? ` (ปรับจาก ${state.request.requestedDate}: ${value.dateChangeReason})` : ''}`
      + ` · ${value.zoneIds.length} โซน ${value.plannedAssets.length} เครื่อง · ${state.order.orderNumber || state.order.id}`,
    request,
  });
  notify(supabase, {
    request: state.request, order: state.order, visit, site: state.site || null,
    zoneCount: value.zoneIds.length, actor: { id: user.id ?? null, name: actorName },
  });
  return reply(201, { visit: { ...visit, zoneIds: value.zoneIds, plannedAssets: value.plannedAssets } });
}

/* ── ยืนยันวันใหม่บนนัดร่างเดิม (ลูกค้าขอเปลี่ยนวัน · PR-4) ──────────────────────────────────────────────────
   ⭐ เขียนนัดเดียว: วัน · เวลา · หัวหน้างาน · เหตุ · ร่องรอย TS ใหม่ · **ล้างคอนเฟิร์มลูกค้า** (ฝ่ายขายคอนเฟิร์มอีกรอบ · N4)
   ⭐ โซน/เครื่องที่วางคงเดิม · CAS ด้วยสถานะร่าง + `tsConfirmedAt` เดิม (TS สองคนกดพร้อมกัน = 409) */
async function reconfirmVisit({ supabase, user, state, deposit, visitId, body, request, audit, notify, thread, now, todayIso }) {
  const visit = (state.visits || []).find((v) => v.id === visitId) || null;
  const { value, error } = installReconfirmInput(body || {}, { request: state.request, visit, deposit, todayIso });
  if (error) {
    const conflict = CONFLICT_ERRORS.has(error) || error.startsWith(INSTALL_CONFIRM_TEXT.depositBlocked);
    return failWith(conflict ? 409 : 400, error);
  }
  const stamp = now();
  const actorName = user.name || user.email || null;
  const patch = {
    scheduledDate: value.scheduledDate,
    startTime: value.startTime,
    endTime: value.endTime,
    assigneeId: value.assigneeId,
    assigneeName: value.assigneeName,
    assistantIds: value.assistantIds,
    dateChangeReason: value.dateChangeReason,
    tsConfirmedAt: stamp,
    tsConfirmedById: user.id ? String(user.id) : null,
    tsConfirmedByName: actorName,
    customerConfirmedAt: null,
    customerConfirmedById: null,
    customerConfirmedByName: null,
    updatedAt: stamp,
  };
  const { data: saved, error: writeError } = await supabase.from('service_visits').update(patch)
    .eq('id', visit.id).eq('status', 'draft').eq('tsConfirmedAt', visit.tsConfirmedAt).select('*').maybeSingle();
  if (writeError) return failWith(500, `ยืนยันวันใหม่ไม่สำเร็จ: ${writeError.message}`);
  if (!saved) return failWith(409, 'นัดนี้เพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่');

  const zoneCount = (state.visitZonesByVisitId?.[saved.id] || []).length;
  /* เลื่อนนัดต้องมีเหตุในเธรด (S-5) — เหตุของลูกค้าอยู่บนคำขอ · เหตุของ TS (ถ้าปรับจากวันที่ลูกค้าขอ) ต่อท้าย */
  await thread(supabase, {
    entityType: 'service_visit', entityId: saved.id, kind: 'reschedule', user,
    body: `TS ยืนยันวันใหม่ ${fmtDate(visit.scheduledDate)} → ${fmtDate(value.scheduledDate)} · ลูกค้าขอเปลี่ยนเพราะ ${state.request.changeReason || 'ไม่ระบุ'}`
      + `${value.dateChangeReason ? ` · TS ปรับจากวันที่ลูกค้าขอเพราะ ${value.dateChangeReason}` : ''} — รอฝ่ายขายคอนเฟิร์มลูกค้าอีกครั้ง`,
  });
  await audit({
    user, action: 'update', entityType: 'service_visit', entityId: saved.id, before: visit, after: saved,
    summary: `TS ยืนยันวันใหม่ ${saved.code || saved.id} · ${visit.scheduledDate} → ${value.scheduledDate}`
      + ` (ลูกค้าขอ ${state.request.requestedDate}${value.dateChangeReason ? ` · ปรับเพราะ ${value.dateChangeReason}` : ''})`
      + ` · ${state.order.orderNumber || state.order.id}`,
    request,
  });
  notify(supabase, {
    request: state.request, order: state.order, visit: saved, site: state.site || null,
    zoneCount, actor: { id: user.id ?? null, name: actorName },
  });
  return reply(200, { visit: saved });
}
