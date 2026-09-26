// ── ขั้นเดินงานของใบสั่งขายย้อนหลัง (ส่งอนุมัติ · AE Sup อนุมัติ) + ของเสริมของหน้าใบ — server เท่านั้น ─────────────
//
// route PATCH /api/sales-planning/sales-orders/[id] เป็นแค่เปลือก — กิ่ง 'submit' / 'approve' ของใบย้อนหลังอยู่ **ก่อน**
// โค้ดของใบปกติเสมอ แล้วส่งต่อมาที่นี่ (ตรรกะอยู่ไฟล์เดียว เทสต์ยิงด้วย supabase ปลอมได้ · แพตเทิร์น historicalOrderCommit)
//   · ส่งอนุมัติ = RPC submit_historical_sales_order — ตรวจไฟล์เอกสารแทนสัญญา · งวด · หลักฐานงวดยกมา (ไม่เก็บลายเซ็น)
//   · อนุมัติ   = RPC approve_historical_sales_order — สัญญา (ออกเลข CT) + ใบ + หยุดยอดงวด + รอบขายของโซน ในทรานแซกชันเดียว
//   · ตีกลับ · ดึงกลับ · ยกเลิก ใช้กิ่งเดิมของ route — ยกเลิก/ลบใบ ฐานยกเลิกเอกสารแทนสัญญาตามเอง
//     (trigger sales_orders_historical_void_contract_* ของ 0374) ⇒ **ไม่มีตัวยกเลิกสัญญาฝั่ง JS** ที่นี่อ่านผลอย่างเดียว
// ⭐ ไม่นับ Actual: ไม่แตะ actualAmount / financeStatus / หลักฐานลายเซ็น · cache ของดีลกรอง origin = 'pipeline' (0360)
// ⭐ กดซ้ำหลังสำเร็จ (เน็ตหลุด) = RPC คืน `replayed` ⇒ ตอบ 200 ด้วยแถวที่เก็บไว้ ไม่ลง audit/เธรดซ้ำ
//   ⚠️ ด่านสถานะฝั่ง JS ต้องปล่อยเคสนี้ถึง RPC (ส่งซ้ำโดยผู้ส่งคนเดิม · อนุมัติซ้ำโดยผู้อนุมัติคนเดิม) — ไม่งั้นคนกดซ้ำ
//      ได้ "ใบนี้ไม่ได้รออนุมัติ" ทั้งที่งานของตัวเองสำเร็จไปแล้ว
// ⚠️ ห้าม import ตัวหยุดยอดงวดของขั้นอนุมัติปกติ · ตัวคิดยอดงวดสดตามแผน · ตัวตรึงฉบับเอกสาร — ใบย้อนหลังไม่มีแผนชำระจาก
//    ใบเสนอราคา (ตัวพวกนั้นสร้าง "ชำระเต็มจำนวน" 100% ทับงวดที่คีย์) และไม่มีหลักฐานลายเซ็นให้ตรึง · เทสต์ตรึงไว้
import { recordAudit } from '@/lib/audit';
import { businessDate } from '@/lib/businessDate';
import { documentNumberSlots } from '@/lib/documentStandards';
import { EXTERNAL_DOC_TYPE } from '@/lib/master/attachmentTypes';
import { canEditSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { termIsActive } from '@/lib/service/terms';
import {
  CONTRACT_NUMBER_MONTH, contractKindLabel, contractNumberPattern, externalDocKindLabel,
} from '@/lib/sales/contracts';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { documentWorkflowError, workflowErrorMessage } from '@/lib/sales/documentWorkflowErrors';
import {
  adminOverrideReasonError, isSalesOrderSelfApproval, normalizeAdminOverrideReason,
} from '@/lib/sales/salesOrderApprovalOverride';
import { canSubmitHistoricalSalesOrder, isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';
import {
  HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE, canKeyHistoricalSalesOrder, historicalOrderEditable,
  historicalRefsOf, historicalRowsOnly, historicalSchemaMissing, isHistoricalOrder, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import { historicalDuplicateMatches } from '@/lib/sales/historicalDuplicates';
import { loadLiveTermsByZone, sanitizeHistoricalEvidence } from '@/lib/sales/historicalOrderCommit';

const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const reply = (status, body) => ({ status, body });
const coded = (code, extra = {}) => ({ error: workflowErrorMessage(code), code, ...extra });
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const actorName = (user) => user?.name || user?.email || null;
const list = (value) => (Array.isArray(value) ? value : []);
/* attachments.id เป็น uuid (0028) — รูปผิดตีกลับเป็นไทยก่อนถึงฐาน (ไม่งั้นได้ 22P02 ดิบ) */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* ไฟล์แนบของเอกสารแทนสัญญาที่หน้าใบโหลดมาโชว์ — ของจริงมีหลักหน่วย · ครบเพดานก็ยังเห็นไฟล์แรก ๆ (ตัวเลือกอยู่ต้นรายการ) */
const CONTRACT_FILES_MAX = 50;

/* เธรดของดีลแม่ — route ส่ง logThread ของมันมา (ตัวเดียวกับทุก action) · ไม่ส่ง = ใช้ตัวเขียนกลางตรง ๆ */
const threadOf = (supabase, user, order) => (action, opts = {}) => appendDocumentEvent(supabase, {
  docType: 'sales_order', doc: order, action, opts, user, dealId: order?.dealId || order?.deal?.id || null,
});

/* error ของ RPC: ยังไม่ได้รัน 0374 = 503 ข้อความเดียวของฟอร์มคีย์ · อื่น ๆ ผ่านตัวแปลกลาง (รหัสที่ไม่รู้จัก = ข้อความกลาง + log) */
function rpcFailure(error, context) {
  if (historicalSchemaMissing(error)) return reply(503, { error: HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE });
  const mapped = documentWorkflowError(error, { context });
  return reply(mapped.status, { error: mapped.message, ...(mapped.code ? { code: mapped.code } : {}) });
}

/* ── ส่งอนุมัติ ───────────────────────────────────────────────────────────────────────────────────
   ด่านเดียวกับปุ่มบนจอ (canSubmitHistoricalSalesOrder) แต่ตอบเหตุทีละข้อ — ปุ่มที่กดไม่ได้ต้องบอกว่าติดอะไร
   ⚠️ `replay` = ส่งซ้ำโดยผู้ส่งคนเดิมหลังสำเร็จแล้ว ⇒ ข้ามด่านสถานะ/เจ้าของ (RPC ตอบผลเดิมโดยไม่เขียนอะไร) */
function submitGateError(user, order, { inScope, replay }) {
  if (!canKeyHistoricalSalesOrder(user)) return reply(403, coded('historical_so_actor_forbidden'));
  if (!inScope) return reply(403, { error: 'ใบนี้อยู่นอกขอบเขตที่คุณดูแล — ให้ผู้ดูแลดีลของใบนี้ส่งอนุมัติ' });
  if (replay) return null;
  if (!historicalOrderEditable(order)) return reply(409, coded('historical_so_submit_state_invalid'));
  if (!canSubmitHistoricalSalesOrder(user, order, { inScope })) {
    // เหลือกรณีเดียว: AE / Senior AE ส่งใบที่ตัวเองไม่ได้เป็นเจ้าของ (คีย์ได้เฉพาะของตัวเอง · ownerLockedToSelf)
    const owner = text(order.deal?.ownerName);
    return reply(403, { error: `AE ส่งอนุมัติได้เฉพาะใบที่ตัวเองเป็นเจ้าของ${owner ? ` — ใบนี้เป็นของ ${owner}` : ''}` });
  }
  return null;
}

/**
 * ส่งใบสั่งขายย้อนหลังเข้าคิว AE Sup (ร่าง/ตีกลับ → รออนุมัติ)
 * @param order  แถวที่ route โหลดแล้ว (`before` ของ loadOrder — มีดีล)
 * @param body   `{ expectedUpdatedAt, openingEvidence? }` — ไม่ส่งหลักฐานมา = ใช้ที่เก็บไว้ตอนแก้ใบ (RPC ตัดสิน)
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function submitHistoricalOrder({
  supabase, user, order, body = {}, audit = recordAudit, thread = null, request = null,
}) {
  if (!isHistoricalOrder(order)) return reply(409, { error: 'ใบนี้ไม่ใช่ใบสั่งขายย้อนหลัง' });
  const input = isPlainObject(body) ? body : {};
  const inScope = canEditSalesPlanning(user) && inSalesEditScope(user, order.deal);
  const replay = order.status === 'pending_approval' && Boolean(user?.id) && order.submittedBy === user.id;
  const gate = submitGateError(user, order, { inScope, replay });
  if (gate) return gate;

  // เวลาที่จอเห็น — ห้ามใช้ของแถวที่ server เพิ่งอ่าน (documentConcurrency)
  const expected = resolveExpectedUpdatedAt(input);
  if (!expected.ok) return reply(400, { error: expected.error });

  /* หลักฐานงวดยกมาที่ฟอร์มเพิ่งอัป (ถ้าส่งมา) — เหลือเฉพาะไฟล์ใต้โฟลเดอร์ของใบนี้ที่มีอยู่จริง (ด่านเดียวกับตอนแก้ใบ)
     ⚠️ ส่งอาร์เรย์ว่างมา = "ไม่มีไฟล์" จริง ⇒ RPC ตีกลับ evidence_missing (ไม่ถอยไปใช้ของเก่าเงียบ ๆ) */
  let openingEvidence = null;
  if (!replay && input.openingEvidence !== undefined && input.openingEvidence !== null) {
    if (!Array.isArray(input.openingEvidence)) return reply(400, { error: 'รูปแบบหลักฐานงวดยกมาไม่ถูกต้อง' });
    const { evidence, error } = await sanitizeHistoricalEvidence({
      supabase, orderId: order.id, refs: input.openingEvidence,
    });
    if (error) return reply(400, { error });
    openingEvidence = evidence;
  }

  const { data: result, error } = await supabase.rpc('submit_historical_sales_order', {
    p_order_id: order.id,
    p_expected_updated_at: expected.value,
    p_actor_id: user.id,
    p_actor_name: actorName(user),
    p_actor_role: user.role || null,
    p_opening_evidence: openingEvidence,
  });
  if (error) return rpcFailure(error, `historical sales order submit ${order.id}`);
  const data = result?.order || null;
  if (!data?.id) return reply(500, { error: 'ส่งอนุมัติใบสั่งขายย้อนหลังไม่สำเร็จ — ฐานข้อมูลไม่คืนใบ' });
  const replayed = result?.replayed === true;

  if (!replayed) {
    await (thread || threadOf(supabase, user, order))('submit');
    await audit({
      user,
      action: 'update',
      entityType: 'sales_order',
      entityId: order.id,
      before: order,
      after: data,
      summary: `ส่งอนุมัติใบสั่งขายย้อนหลัง ${order.orderNumber}${order.status === 'rejected' ? ' (ส่งใหม่หลังถูกตีกลับ)' : ''}`
        + ' · ไม่นับ Actual',
      request,
    });
  }
  return reply(200, { ...data, replayed });
}

/**
 * AE Sup / Admin อนุมัติใบสั่งขายย้อนหลัง — เอกสารแทนสัญญา + ใบ + งวด + รอบขายของโซน จบใน RPC ตัวเดียว
 * @param body  `{ expectedUpdatedAt, signedFileId, overrideReason?, note? }`
 *   · expectedUpdatedAt **บังคับ** (จอทั้งปุ่มปกติและปุ่ม Admin Override ส่งมาเสมอ) — ของใบปกติใช้แถวที่ server อ่าน
 *     ซึ่งจับได้แค่ race ระดับมิลลิวินาที ไม่ใช่ "แท็บค้าง" (documentConcurrency)
 *   · signedFileId **บังคับ** = ไฟล์เอกสารแทนสัญญาที่ AE Sup เห็นในโมดัล (ฐานตรวจว่าเป็น external_doc ของสัญญาใบนี้)
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function approveHistoricalOrder({
  supabase, user, order, body = {}, audit = recordAudit, thread = null, request = null, now = new Date(),
}) {
  if (!isHistoricalOrder(order)) return reply(409, { error: 'ใบนี้ไม่ใช่ใบสั่งขายย้อนหลัง' });
  if (!isSalesOrderReviewer(user?.role)) return reply(403, coded('historical_so_approve_forbidden'));
  const input = isPlainObject(body) ? body : {};
  const replay = order.status === 'approved' && Boolean(user.id) && order.approvedBy === user.id;
  if (!replay && order.status !== 'pending_approval') return reply(400, coded('historical_so_approve_state_invalid'));

  /* ผู้คีย์/ผู้ส่งอนุมัติใบตัวเองไม่ได้ — Admin ได้แบบ admin_override (เหตุผลไม่บังคับ = เท่าสาย pipeline · มติ 2026-07-25)
     ⚠️ RPC ตรวจซ้ำ (historical_so_self_approval) · ที่นี่ตอบก่อนแตะฐาน */
  const selfApproval = isSalesOrderSelfApproval(order, user.id);
  let overrideReason = null;
  if (selfApproval) {
    if (user.role !== 'admin') return reply(403, coded('historical_so_self_approval'));
    const reasonError = adminOverrideReasonError(input.overrideReason);
    if (reasonError) return reply(400, { error: reasonError });
    overrideReason = normalizeAdminOverrideReason(input.overrideReason) || null;
  }

  const expected = resolveExpectedUpdatedAt(input);
  if (!expected.ok) return reply(400, { error: expected.error });
  const signedFileId = text(input.signedFileId);
  if (!UUID.test(signedFileId)) {
    return reply(400, { error: 'ไม่ได้ระบุไฟล์เอกสารแทนสัญญาที่ตรวจแล้ว — โหลดหน้าใหม่แล้วกดอนุมัติอีกครั้ง' });
  }

  /* เลข CT ออกจากบ่อเดียวกับหน้าสัญญา (approve-external) — รูปแบบตามชนิดสัญญา · YYMM = เดือนที่อนุมัติ (เวลาไทย)
     ⚠️ เอกสารแทนสัญญาของใบย้อนหลังเป็นชนิด 'service' เสมอ (RPC สร้างให้) — ไม่รู้ชนิดก็ถอยไปทางนั้น */
  const pattern = contractNumberPattern(order.serviceContract?.kind || 'service');
  if (!pattern) return reply(409, { error: 'ชนิดสัญญาของใบนี้ไม่รู้จัก — ออกเลขที่ไม่ได้' });
  const { prefix, width } = documentNumberSlots(pattern, { date: now });

  const { data: result, error } = await supabase.rpc('approve_historical_sales_order', {
    p_order_id: order.id,
    p_expected_updated_at: expected.value,
    p_actor_id: user.id,
    p_actor_name: actorName(user),
    p_actor_role: user.role,
    p_override_reason: overrideReason,
    p_note: text(input.note) || null,
    p_signed_file_id: signedFileId,
    p_contract_month: CONTRACT_NUMBER_MONTH,
    p_contract_prefix: prefix,
    p_contract_width: width,
  });
  if (error) return rpcFailure(error, `historical sales order approve ${order.id}`);
  const data = result?.order || null;
  if (!data?.id) return reply(500, { error: 'อนุมัติใบสั่งขายย้อนหลังไม่สำเร็จ — ฐานข้อมูลไม่คืนใบ' });
  const contract = result?.contract || null;
  const installments = list(result?.installments);
  const terms = list(result?.terms);
  const replayed = result?.replayed === true;
  const payload = { ...data, replayed, serviceContract: contract, installments, terms };
  if (replayed) return reply(200, payload);

  /* audit แยกตามของที่เปลี่ยน (ใบ · สัญญา · รอบขายของโซน) — ระบบไม่มีถังขยะ กู้ได้จาก audit_logs เท่านั้น
     ⚠️ ห้ามมีคำว่านับ Actual — ใบย้อนหลังไม่เข้า Actual / FC / เป้าทุกสถานะ */
  const contractNo = text(contract?.contractNo) || '—';
  await (thread || threadOf(supabase, user, order))('approve', { overrideReason, note: text(input.note) || null });
  await audit({
    user,
    action: 'update',
    entityType: 'sales_order',
    entityId: order.id,
    before: order,
    after: { ...data, installments },
    summary: `อนุมัติใบสั่งขายย้อนหลัง ${order.orderNumber} · ไม่นับ Actual · สัญญา ${contractNo}`
      + (selfApproval ? ` · Admin Override${overrideReason ? `: ${overrideReason}` : ''}` : ''),
    request,
  });
  if (contract?.id) {
    await audit({
      user,
      action: 'update',
      entityType: 'sales_contract',
      entityId: contract.id,
      before: order.serviceContract || null,
      after: contract,
      summary: `อนุมัติ${externalDocKindLabel(contract.externalDocKind)}ใช้แทน${contractKindLabel(contract.kind)} ${contractNo}`
        + ` พร้อมใบสั่งขายย้อนหลัง ${order.orderNumber} (มีผล ${contract.effectiveDate || '—'} ถึง ${contract.expiryDate || '—'})`,
      request,
    });
  }
  if (terms.length) {
    await audit({
      user,
      action: 'create',
      entityType: 'service_zone_term',
      entityId: order.id,
      after: {
        salesOrderId: order.id,
        historical: true,
        count: terms.length,
        terms: terms.map((term) => ({
          id: term.id, salesOrderLineId: term.salesOrderLineId, zoneId: term.zoneId, packageQty: term.packageQty,
        })),
      },
      summary: `เปิดโซนให้ TS จากการอนุมัติใบสั่งขายย้อนหลัง ${order.orderNumber} — ${terms.length} โซน (รอตั้งรอบ)`,
      request,
    });
  }
  return reply(200, payload);
}

/**
 * ของเสริมของหน้าใบย้อนหลัง (GET ใบ) — โซนของบรรทัด · เอกสารแทนสัญญา + ไฟล์ · หลักฐานงวดยกมา · รอบขายของใบอื่นบนโซนเดียวกัน
 * ⭐ ป้อนโมดัลอนุมัติของ AE Sup (historicalApprovalFacts) — ไฟล์ที่ติด `signedFileCandidate` คือไฟล์ที่จอส่งเป็น signedFileId
 *   (สัญญาที่อนุมัติแล้ว = ไฟล์ที่ผูกจริง · ยังร่าง = external_doc ไฟล์แรกที่แนบ — ชุดไฟล์ถูกตรึงระหว่างรออนุมัติ)
 * ⚠️ ทุกการอ่านไล่หน้า/ซอยลิสต์ หรืออ่านด้วย id · อ่านไม่ขึ้น = **โยน** — ผู้เรียกตั้ง `extrasError` ให้จอบอก "โหลดไม่ขึ้น"
 *   (แถวที่หายเงียบ ๆ อ่านเหมือน "ไม่มีเรื่องต้องตรวจ")
 * @param order  แถวใบพร้อม `lines` · `installments` (ดิบ) · `serviceContract` (ถ้าโหลดมาแล้ว)
 * @returns {Promise<{ lineZones, serviceContract, serviceContractFiles, openingEvidence, liveTermWarnings, duplicateCheck }>}
 *   `duplicateCheck` = `{ candidates, statusById }` — ใบที่อาจซ้ำ **ตอนนี้** + สถานะปัจจุบันของใบย้อนหลังทุกใบของลูกค้า
 *   (มติ 26/09 ข้อ 1: ใบที่เกิดหลังผู้คีย์ยืนยัน = เตือนผู้อนุมัติ ไม่บล็อก · ใบที่ผู้คีย์ยืนยันไว้แล้วถูกยกเลิก/ลบไป = บอกด้วย)
 */
export async function loadHistoricalOrderExtras(supabase, order, { todayIso = businessDate() } = {}) {
  const empty = {
    lineZones: [], serviceContract: order?.serviceContract || null, serviceContractFiles: [],
    openingEvidence: [], liveTermWarnings: [], duplicateCheck: null,
  };
  if (!isHistoricalOrder(order)) return empty;

  // ── โซนของบรรทัด (หนึ่งแถวต่อบรรทัด · เรียงตามลำดับบนใบ) ──
  const lines = list(order.lines).slice().sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const zoneIds = [...new Set(lines.map((line) => line.serviceZoneId).filter(Boolean))];
  const { data: zoneRows, error: zoneError } = await fetchInChunks(zoneIds, (chunk) => fetchAllResult(() => supabase
    .from('service_zones').select('id, "siteId", code, name, "isActive"')
    .in('id', chunk).order('id', { ascending: true })));
  if (zoneError) throw zoneError;
  const zonesById = new Map((zoneRows || []).map((zone) => [zone.id, zone]));
  const siteIds = [...new Set((zoneRows || []).map((zone) => zone.siteId).filter(Boolean))];
  const { data: siteRows, error: siteError } = await fetchInChunks(siteIds, (chunk) => fetchAllResult(() => supabase
    .from('service_sites').select('id, code, name, "isActive"')
    .in('id', chunk).order('id', { ascending: true })));
  if (siteError) throw siteError;
  const sitesById = new Map((siteRows || []).map((site) => [site.id, site]));
  const lineZones = lines.filter((line) => line.serviceZoneId).map((line) => {
    const zone = zonesById.get(line.serviceZoneId) || null;
    const site = zone ? sitesById.get(zone.siteId) || null : null;
    return {
      lineId: line.id,
      zoneId: line.serviceZoneId,
      zoneCode: zone?.code || null,
      zoneName: zone?.name || null,
      zoneActive: zone ? zone.isActive !== false : null,
      siteId: zone?.siteId || null,
      siteCode: site?.code || null,
      siteName: site?.name || null,
      siteActive: site ? site.isActive !== false : null,
      productId: line.productId || null,
      /* บรรทัดแบบใบเสนอราคา (มติ 23/09): จำนวน · หน่วย · ราคา/หน่วย · ส่วนลด · จำนวนเงิน — ไม่มี "แพ็ค" แล้ว
         (จำนวนมีหน่วยของสินค้าตัวเอง · 12 แพ็คเกจ = 1 ชุด × 12 เดือน ไม่ใช่ 12 ชุด) */
      fgCode: line.fgCode || null,
      qty: line.qty ?? null,
      unit: line.unit || null,
      unitPrice: line.unitPrice ?? null,
      discountAmount: line.discountAmount ?? null,
      rounds: line.serviceRounds ?? null,
      lineTotal: line.lineTotal ?? null,
      installationPoint: line.installationPoint || null,
    };
  });

  // ── เอกสารแทนสัญญา (ใช้ของที่ผู้เรียกโหลดมา ถ้าตรงใบ · ไม่มีก็อ่านด้วย id) + ไฟล์แนบ ──
  let serviceContract = order.serviceContract?.id && order.serviceContract.id === order.serviceContractId
    ? order.serviceContract
    : null;
  if (!serviceContract && order.serviceContractId) {
    const { data, error } = await supabase.from('sales_contracts')
      .select('id, "contractNo", kind, status, source, "dealId", "externalDocKind", "externalRef", "contractDate", '
        + '"effectiveDate", "expiryDate", "signedFileId", metadata')
      .eq('id', order.serviceContractId).maybeSingle();
    if (error) throw error;
    serviceContract = data || null;
  }
  let serviceContractFiles = [];
  if (serviceContract?.id) {
    const { data, error } = await supabase.from('attachments')
      .select('id, "docType", "fileName", "mimeType", "sizeBytes", "createdAt", "uploadedByName"')
      .eq('entityType', 'contract').eq('entityId', serviceContract.id)
      .order('createdAt', { ascending: true }).order('id', { ascending: true })
      .limit(CONTRACT_FILES_MAX);
    if (error) throw error;
    const files = data || [];
    const candidate = serviceContract.signedFileId
      || files.find((file) => file.docType === EXTERNAL_DOC_TYPE)?.id
      || null;
    serviceContractFiles = files.map((file) => ({ ...file, signedFileCandidate: Boolean(candidate) && file.id === candidate }));
  }

  // ── หลักฐานงวดยกมา — ชื่อไฟล์ + ตำแหน่ง (ลิงก์ payment-file?installment=&i=) ไม่ส่ง path ของที่เก็บไฟล์ ──
  const opening = list(order.installments).find(isOpeningInstallment) || null;
  const openingEvidence = opening
    ? list(opening.evidence).map((ref, index) => ({
      installmentId: opening.id, index, fileName: ref?.fileName || null, mimeType: ref?.mimeType || null,
    }))
    : [];

  // ── รอบขายที่ยังมีผลของใบอื่นบนโซนเดียวกัน (เตือน ไม่บล็อก — AE Sup ตัดสิน · ตัวเดียวกับพรีวิวของฟอร์มคีย์) ──
  const liveTermsByZone = await loadLiveTermsByZone(supabase, zoneIds);
  const liveTermWarnings = [];
  for (const zoneId of zoneIds) {
    const seen = new Set();
    for (const entry of liveTermsByZone.get(zoneId) || []) {
      const term = entry?.term || null;
      const other = entry?.order || null;
      if (!term || !other?.id || other.id === order.id || seen.has(other.id)) continue;
      if (!termIsActive(term, other, todayIso)) continue;
      seen.add(other.id);
      const zone = zonesById.get(zoneId) || null;
      liveTermWarnings.push({
        zoneId,
        zoneCode: zone?.code || null,
        zoneName: zone?.name || null,
        orderId: other.id,
        orderNumber: other.orderNumber || other.id,
        endDate: term.endDate || null,
      });
    }
  }

  // ── ใบที่อาจซ้ำ — ตรวจใหม่ทุกครั้งที่เปิดใบ (ตัวจับคู่ตัวเดียวกับแผนตอนคีย์ · มติ 26/09) ──
  /* ⭐ ปิดสองช่องที่บันทึกของผู้คีย์ปิดไม่ได้: ใบที่คนอื่นคีย์หลังผู้คีย์ยืนยัน (แข่งกัน) · และสร้างซ้ำที่ได้ใบเดิมคืนโดยไม่เขียนบันทึกใหม่
     วันเริ่มสัญญาของใบย้อนหลัง = `orderDate` (0374:921/1044) · อ่านไม่ขึ้น = โยน (ผู้เรียกตั้ง extrasError) ไม่ใช่ "ไม่มีใบซ้ำ" */
  let duplicateCheck = null;
  if (order.customerId) {
    const { data: siblingRows, error: siblingError } = await fetchAllResult(() => historicalRowsOnly(supabase.from('sales_orders')
      .select('id, "orderNumber", "orderDate", status, "historicalQuoteRef", "historicalExpressRef", "historicalInvoiceRef"')
      .eq('customerId', order.customerId)).order('id', { ascending: true }));
    if (siblingError) throw siblingError;
    const siblings = (siblingRows || []).filter((row) => row.id !== order.id);
    duplicateCheck = {
      candidates: historicalDuplicateMatches({
        rows: siblings, selfOrderId: order.id, startDate: order.orderDate, refs: historicalRefsOf(order),
      }),
      statusById: Object.fromEntries(siblings.map((row) => [row.id, row.status || null])),
    };
  }

  return { lineZones, serviceContract, serviceContractFiles, openingEvidence, liveTermWarnings, duplicateCheck };
}

/**
 * หลังยกเลิก/ลบใบย้อนหลัง — trigger ของ 0374 ยกเลิกเอกสารแทนสัญญาของใบนี้ไปแล้วหรือยัง (อ่านอย่างเดียว ไม่เขียน)
 * ⭐ ใช้บอกผลบนจอ (toast) และลง audit ว่าสัญญาถูกยกเลิกตาม — ตัวยกเลิกจริงอยู่ในฐาน ทรานแซกชันเดียวกับใบ
 * 🔴 **ถามด้วยตัวชี้กลับ ไม่ใช่ลิงก์ `serviceContractId` ของใบ** — ต้องเป็นคำถามเดียวกับที่ trigger ใช้ตามหา
 *   (ข้อ 7e ของ 0374) ไม่งั้นใบที่ถูกถอดสัญญาออกไปก่อนจะเงียบสนิท ทั้งที่ฐานเพิ่งยกเลิกเอกสารให้จริง ๆ
 *   ⇒ คนกดยกเลิกอ่าน toast แล้วเข้าใจว่าเอกสารยังมีผลอยู่ (HISTORICAL_CORRECTION_PATH สัญญาตรงข้าม)
 * ⚠️ นับเฉพาะเอกสารภายนอกที่ชี้กลับมาใบนี้ และยังไม่ยกเลิกก่อนหน้า (ยกเลิกไว้แล้วตั้งแต่รอบก่อน ≠ ถูกยกเลิกตามคราวนี้)
 * ⚠️ อ่านไม่ขึ้น = null (การยกเลิก/ลบใบสำเร็จไปแล้ว ห้ามตอบ error ทับ)
 * @param order  แถวใบ **ก่อน** ยกเลิก/ลบ (serviceContract ของตอนนั้น ถ้าใบยังชี้อยู่)
 * @returns {Promise<object|null>} แถวสัญญาที่ถูกยกเลิกตาม หรือ null
 */
export async function historicalContractVoided(supabase, order) {
  if (!isHistoricalOrder(order) || !order?.id) return null;
  const { data, error } = await supabase.from('sales_contracts')
    .select('id, status, source, metadata, "contractNo", "externalDocKind", "externalRef", "cancelReason"')
    .eq('source', 'external')
    .eq('metadata->>historicalSalesOrderId', order.id)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const own = data.source === 'external' && data.metadata?.historicalSalesOrderId === order.id;
  if (!own || data.status !== 'cancelled') return null;
  /* "ถูกยกเลิกตามคราวนี้" ต้องแยกจาก "ยกเลิกค้างมาก่อนแล้ว" สองทาง เพราะใบอาจไม่มีภาพของเอกสารติดมา
     · ใบยังชี้เอกสารฉบับนั้นอยู่ → ใช้ภาพก่อนยกเลิกตัดสิน (แม่นที่สุด)
     · ใบไม่ได้ชี้อยู่ (ถูกถอดออกไปก่อน) → ดูว่าเหตุผลการยกเลิกอ้างถึงใบนี้ไหม — trigger เขียนเลขใบลงไปเสมอ
       ⚠️ เทียบแค่ "เลขใบ" ไม่ใช่ทั้งประโยค: ถ้อยคำเป็นของ SQL ฝั่งเดียว (ยามข้อความอยู่ที่ historicalApprovalMigration) */
  if (order.serviceContractId === data.id && order.serviceContract) {
    return order.serviceContract.status === 'cancelled' ? null : data;
  }
  const orderNumber = text(order.orderNumber);
  return orderNumber && text(data.cancelReason).includes(orderNumber) ? data : null;
}

/* ป้ายของเอกสารแทนสัญญาที่ถูกยกเลิกตามใบ — "ใบสั่งซื้อของลูกค้า (PO) PO-SPW-2026-0118 (CT-SR-26090007-0)" */
export function voidedContractLabel(contract) {
  if (!contract) return '';
  const kind = externalDocKindLabel(contract.externalDocKind);
  return [kind === '—' ? 'เอกสารแทนสัญญา' : kind, text(contract.externalRef), contract.contractNo ? `(${contract.contractNo})` : '']
    .filter(Boolean).join(' ');
}
