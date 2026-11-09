// ── ตัวโหลดคิว "รอติดตั้ง" ของ TS (ขั้นเข้าติดตั้ง PR-3b · mig 0425) ────────────────────────────────────────
//
// ⭐ ประกอบข้อมูลดิบให้ `installQueueRows` (ตัวตัดสินล้วน) — คำขอ · ใบ · ไซต์ · โซน · รายการโซนของใบ · งวด · นัดติดตั้ง
// 🔒 **ไม่ดึงเงิน** — ใบเลือกแค่ช่องที่คิวใช้ · ยอดใบแปลงเป็น 0/null แบบเดียวกับบริบทด่าน · งวดไม่ดึงยอด
// ⚠️ ใบสั่งขายอ่านผ่าน `pipelineRowsOnly` เสมอ — ใบย้อนหลังไม่มีขั้นเข้าติดตั้ง (ยาม historicalMoneyGuards)
// ⚠️ ไล่ทีละหน้า + ซอยก้อน (check:rowcap · PostgREST 16 KB) · อ่านพัง = โยน (ห้ามตอบคิวว่างที่อ่านเป็น "ไม่มีงาน")
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { businessDate } from '@/lib/businessDate';
import { addDaysIso } from './scheduleQueue';
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';
import { pipelineRowsOnly } from '@/lib/sales/historicalOrders';
import { INSTALL_UNDECIDED_WINDOW_DAYS } from './installQueueView';

const ORDER_COLUMNS = 'id, "orderNumber", "customerName", status, origin, "totalAmount", "supersededById", "serviceTermsOpenedAt"';
const must = (label, res) => {
  if (res.error) throw new Error(`${label}ไม่สำเร็จ: ${res.error.message}`);
  return res.data || [];
};
const uniq = (list) => [...new Set(list.filter(Boolean))];

export async function loadInstallQueue(supabase, { todayIso = businessDate() } = {}) {
  const requests = must('อ่านคำขอติดตั้ง', await fetchAllResult(() => supabase.from('service_install_requests')
    .select('*').order('id', { ascending: true })));
  const requestIds = requests.map((r) => r.id);

  /* ใบของคำขอ + ใบที่เพิ่งเปิดรอบขาย (ผู้สมัคร "รอฝ่ายขายเลือก") */
  const since = addDaysIso(todayIso, -INSTALL_UNDECIDED_WINDOW_DAYS);
  const [requestOrders, freshOrders] = await Promise.all([
    fetchInChunks(uniq(requests.map((r) => r.salesOrderId)), (chunk) => fetchAllResult(() => pipelineRowsOnly(supabase
      .from('sales_orders').select(ORDER_COLUMNS).in('id', chunk)).order('id', { ascending: true }))),
    fetchAllResult(() => pipelineRowsOnly(supabase.from('sales_orders').select(ORDER_COLUMNS)
      .eq('status', 'approved').is('supersededById', null).gte('serviceTermsOpenedAt', since))
      .order('id', { ascending: true })),
  ]);
  const orders = new Map();
  for (const o of [...must('อ่านใบสั่งขายของคำขอ', requestOrders), ...must('อ่านใบที่เปิดรอบขาย', freshOrders)]) {
    orders.set(o.id, { ...o, totalAmount: paymentNotRequired(o.totalAmount) ? 0 : null });
  }
  const orderIds = [...orders.keys()];

  const [allocRes, installmentRes, zoneRowsRes, visitRes] = await Promise.all([
    fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase.from('sales_order_line_zones')
      .select('id, "salesOrderId", "zoneId", "packsPerRound"').in('salesOrderId', chunk).order('id', { ascending: true }))),
    fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase.from('sales_order_installments')
      .select('id, "salesOrderId", seq, label, status, "beforeInstall"').in('salesOrderId', chunk).order('id', { ascending: true }))),
    fetchInChunks(requestIds, (chunk) => fetchAllResult(() => supabase.from('service_install_request_zones')
      .select('"requestId", "zoneId"').in('requestId', chunk).order('requestId', { ascending: true }).order('zoneId', { ascending: true }))),
    fetchInChunks(requestIds, (chunk) => fetchAllResult(() => supabase.from('service_visits')
      .select('id, code, status, "installRequestId", "scheduledDate", "startTime", "endTime", "assigneeId", "assigneeName", "tsConfirmedAt", "customerConfirmedAt"')
      .in('installRequestId', chunk).order('id', { ascending: true }))),
  ]);
  const allocations = must('อ่านโซนของใบ', allocRes);
  const installments = must('อ่านงวดชำระ', installmentRes);
  const requestZones = must('อ่านโซนที่ขอ', zoneRowsRes);
  const visits = must('อ่านนัดติดตั้ง', visitRes);

  const zoneIds = uniq([...allocations.map((a) => a.zoneId), ...requestZones.map((z) => z.zoneId)]);
  const zoneList = must('อ่านโซน', await fetchInChunks(zoneIds, (chunk) => fetchAllResult(() => supabase.from('service_zones')
    .select('id, code, name, "siteId"').in('id', chunk).order('id', { ascending: true }))));
  const siteIds = uniq([...zoneList.map((z) => z.siteId), ...requests.map((r) => r.siteId)]);
  const siteList = must('อ่านไซต์', await fetchInChunks(siteIds, (chunk) => fetchAllResult(() => supabase.from('service_sites')
    .select('id, code, name').in('id', chunk).order('id', { ascending: true }))));

  const visitIds = visits.map((v) => v.id);
  const visitZonesByVisitId = {};
  const doneZonesByVisitId = {};
  if (visitIds.length) {
    const [vzRes, plannedRes, outcomeRes] = await Promise.all([
      fetchInChunks(visitIds, (chunk) => fetchAllResult(() => supabase.from('service_visit_zones')
        .select('"visitId", "zoneId"').in('visitId', chunk).order('visitId', { ascending: true }).order('zoneId', { ascending: true }))),
      fetchInChunks(visitIds, (chunk) => fetchAllResult(() => supabase.from('service_visit_planned_assets')
        .select('"visitId", "zoneId", "assetId"').in('visitId', chunk).order('visitId', { ascending: true }).order('assetId', { ascending: true }))),
      fetchInChunks(visitIds, (chunk) => fetchAllResult(() => supabase.from('service_visit_assets')
        .select('id, "visitId", "assetId", outcome').in('visitId', chunk).order('id', { ascending: true }))),
    ]);
    for (const row of must('อ่านโซนของนัด', vzRes)) (visitZonesByVisitId[row.visitId] ||= []).push(row.zoneId);
    const zoneOf = new Map(must('อ่านเครื่องที่วาง', plannedRes).map((p) => [`${p.visitId}|${p.assetId}`, p.zoneId]));
    for (const row of must('อ่านผลรายเครื่อง', outcomeRes)) {
      const zoneId = row.outcome === 'done' ? zoneOf.get(`${row.visitId}|${row.assetId}`) : null;
      if (zoneId) (doneZonesByVisitId[row.visitId] ||= []).push(zoneId);
    }
  }
  return {
    requests, requestZones, orders,
    sites: new Map(siteList.map((s) => [s.id, s])), zones: new Map(zoneList.map((z) => [z.id, z])),
    allocations, installments, visits, visitZonesByVisitId, doneZonesByVisitId,
  };
}
