// ── ตัวเขียนทางเดียวของใบสั่งขายย้อนหลัง (พรีวิว · สร้างร่าง · แก้ร่าง/ใบที่ถูกตีกลับ) — server เท่านั้น ─────
//
// route สองเส้นเป็นแค่เปลือก · ตรรกะอยู่ที่นี่เพื่อให้เทสต์ยิงด้วย supabase ปลอมได้ (supabase · audit · validateOwner ฉีดเข้ามา)
//   · POST  /api/sales-planning/sales-orders/historical       — พรีวิว / สร้างใบ (ไม่มี orderId)
//   · PATCH /api/sales-planning/sales-orders/historical/[id]  — พรีวิว / แก้ใบร่างหรือใบที่ถูกตีกลับ
//   ⭐ ฟอร์มคีย์หน้าเต็ม **ตัวเดียว** ใช้ทั้งสองเส้น (มติ 22/09 · กฎ "ฟอร์มแก้ = ฟอร์มสร้าง") ⇒ ตัวตัดสินเดียวกัน
//
// ลำดับ: ด่านสิทธิ์ → ตรวจว่ารัน 0374 แล้ว → (แก้ใบ) โหลดใบผ่าน loadScoped + ใบต้องยังแก้ได้ → โหลดของประกอบ
//        → ตัวตัดสินเดียว (planHistoricalServiceOrder — ล็อก AE/Senior AE เป็นตัวเอง + ขอบเขตของดีลที่ใบจะเข้าไปอยู่จริง
//          ตัดสินทั้งตอนพรีวิวและตอนบันทึก) → พรีวิวจบตรงนี้ (ไม่แตะ RPC) → ใบที่อาจซ้ำต้องยืนยัน
//        → (แก้ใบ) กรองหลักฐานงวดยกมา → RPC ในทรานแซกชันเดียว → audit
//
// ⭐ ใบเกิดเป็น **ร่าง** (0374) — ส่งอนุมัติเป็นอีกคำสั่ง · ที่นี่ไม่ส่ง ไม่อนุมัติ ไม่แตะรอบขายของโซน
// ⚠️ ห้าม import ตัวหยุดยอดงวดของขั้นอนุมัติ · ตัวคิดยอดงวดสดตามแผน · ตัวตรึงฉบับเอกสาร — งวดของใบย้อนหลัง
//    หยุดยอดตอน AE Sup อนุมัติ (RPC อนุมัติทำเอง) และไม่มีหลักฐานลายเซ็น · เทสต์ตรึงไว้
import { createHash } from 'node:crypto';
import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { businessDate } from '@/lib/businessDate';
import { entityCodeArgs } from '@/lib/entityCode';
import { loadScoped } from '@/lib/scopedRow';
import { ownerLockedToSelf, validateDealOwner } from '@/lib/sales/dealOwner';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';
import { documentWorkflowError, workflowErrorMessage } from '@/lib/sales/documentWorkflowErrors';
import { externalDocKindLabel } from '@/lib/sales/contracts';
import { sanitizeEvidenceAttachments } from '@/lib/sales/orderConfirmationDocs';
import { PRIVATE_EVIDENCE_BUCKET, missingStoredEvidence, privateEvidencePrefix } from '@/lib/upload/privateEvidence';
import { historicalDuplicateReviewRecord } from '@/lib/sales/historicalDuplicates';
import {
  HISTORICAL_DEAL_TITLE, HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE, canKeyHistoricalSalesOrder, historicalOrderEditable,
  historicalOrderIdOf, historicalRefsOf, historicalRowsOnly, historicalSchemaMissing, isHistoricalOrder,
} from '@/lib/sales/historicalOrders';
import {
  historicalServiceFingerprintSource, historicalServiceRpcArgs, planHistoricalServiceOrder,
} from '@/lib/sales/historicalOrderPlan';

const INTAKE_KEY_MAX = 200;
const md5 = (value) => createHash('md5').update(String(value), 'utf8').digest('hex');
const sha256 = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');
const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const reply = (status, body) => ({ status, body });
const coded = (code, extra = {}) => ({ error: workflowErrorMessage(code), code, ...extra });

/* ── R7 (ครึ่ง server): พรีวิวที่ยังไม่ผ่านต้องคืน "ครึ่งเงิน" ของแผนมาด้วย ───────────────────
 * 🐞 ฟอร์มที่ยังไม่มีงวดสักงวดมี error `installments` เสมอ ⇒ พรีวิวตอบ 400 **เปล่า** ทุกครั้ง
 *   ตลอดรอบคีย์ใบใหม่ ⇒ จอไม่มียอดใบจาก server เลย แล้วต้องคิดยอดเองเพื่อวาดแผ่นแบ่งงวด
 *   ⇒ เลขคู่ขนานสองชุดที่วันหนึ่งจะตอบไม่เท่ากัน (ปัดสตางค์/โหมด VAT) โดยไม่มีอะไรฟ้อง
 * ⇒ คืน `money` มาพร้อม 400 ของ **พรีวิว** · สถานะ 400 กับ `errors[]` คงรูปเดิมเป๊ะ (ผู้เรียก/เทสต์ยึดไว้)
 *
 * ⚠️ **ห้ามตอบยอดที่ยังคิดไม่ได้** — แผนตั้งบล็อกเงินเป็นศูนย์ทั้งก้อนเมื่อด่านเงินไม่ผ่าน
 *   (จำนวนของโซนว่าง/ไม่ใช่จำนวนเต็ม · แพ็คเกจยังไม่ตั้งราคาในทะเบียน · ยังไม่เลือก VAT · ไม่มีโซนเลย) ⇒ ส่งศูนย์ไปให้จอ
 *   = จอพิมพ์ "0 บาท" เป็นยอดใบ ซึ่งเป็นคำตอบผิด · ตัวแยกคือ `zeroValue` ของแผนเอง ซึ่งนิยามว่า
 *   `moneyOk && totalAmount === 0` ⇒ **ยอดเชื่อได้ ⟺ totalAmount > 0 หรือ zeroValue จริง**
 *   (อ่านจากผลของแผนตัวเดียวกัน ไม่ใช่คิดเงื่อนไขใหม่ที่นี่ — เทสต์ยิงแผนจริงตรึงข้อนี้ไว้) */
export function previewPlanMoney(plan) {
  const header = plan?.header || null;
  if (!header) return null;
  const total = Number(header.totalAmount);
  if (!Number.isFinite(total)) return null;
  if (!(total > 0 || plan?.zeroValue === true)) return null;
  return {
    subtotal: header.subtotal,
    discountAmount: header.discountAmount,
    vatAmount: header.vatAmount,
    totalAmount: header.totalAmount,
  };
}

/* 23505 ของ primary key ใบสั่งขาย = สองคำขอรหัสเดียวกันชนกันพอดี ⇒ ยิงซ้ำหนึ่งครั้งได้ใบเดิม/ชนกัน */
const isOrderPkeyCollision = (error) => String(error?.code || '') === '23505'
  && /sales_orders_pkey/.test(`${error?.message || ''} ${error?.details || ''}`);
const errorText = (error) => `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
/* แถวจาก loadScoped พกดีลที่ join มาด้วย — audit เก็บเฉพาะตัวใบ (ดีลมี audit ของมันเอง) */
const withoutJoin = (row) => (row ? Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'deal')) : null);

/**
 * หลักฐานงวดยกมาที่ client อ้างมา → เหลือเฉพาะไฟล์ของใบนี้จริง
 * ⭐ ใช้ทั้งตอนแก้ใบ (ที่นี่) และตอนส่งอนุมัติ (ขั้นส่ง) — ด่านเดียวกันสองทาง
 *   · bucket ส่วนตัว + โฟลเดอร์ `sales-orders/<ใบ>/payments/` ของใบนี้เท่านั้น (ไฟล์ของใบอื่น = ตัดทิ้ง)
 *   · ref แบบ storagePath เท่านั้น — 🪤 ตัวล้างกลางยังปล่อย ref ยุคเก่าแบบ URL/Drive ผ่าน (orderConfirmationDocs)
 *     ซึ่งชี้ไปที่ไหนก็ได้ ⇒ ตัดทิ้ง และล้าง URL ที่ติดมากับ ref ส่วนตัวด้วย
 *   · ไฟล์ต้องมีอยู่จริงใน bucket (path ปลอม/อัปไม่สำเร็จ ห้ามกลายเป็นหลักฐานเงินถาวร)
 * @returns {Promise<{ evidence: object[], error: string|null }>}
 */
export async function sanitizeHistoricalEvidence({ supabase, orderId, refs }) {
  const prefix = privateEvidencePrefix('sales_order_payment_evidence', orderId);
  if (!prefix) return { evidence: [], error: null };
  const evidence = sanitizeEvidenceAttachments(refs, {
    allowedStorageBucket: PRIVATE_EVIDENCE_BUCKET,
    allowedStoragePathPrefix: prefix,
  })
    .filter((ref) => ref.storageBucket && ref.storagePath)
    .map((ref) => ({ ...ref, fileUrl: null, driveFileId: null }));
  const missing = evidence.length ? await missingStoredEvidence(supabase, PRIVATE_EVIDENCE_BUCKET, evidence) : null;
  return { evidence, error: missing };
}

/* รอบขายของใบอื่นบนโซนที่เลือก (คำเตือน "โซนนี้มีรอบขายของ SO-xxx อยู่แล้ว") — zoneId → [{ term, order }]
   ⚠️ term โตสะสม (ไม่มีสถานะ ไม่ถูกลบตอนต่อสัญญา) ⇒ ซอยลิสต์โซน + ไล่หน้าเสมอ · "มีผลไหม" ตัดสินที่ termIsActive
      (planner) จากสถานะใบแม่ ⇒ ต้องโหลดใบแม่มาด้วย (สถานะ · ถูก Rev. ทับ)
   ⭐ ใช้ร่วมกับของเสริมหน้าใบ (historicalOrderWorkflow — คำเตือนเดียวกันในโมดัลอนุมัติของ AE Sup) */
export async function loadLiveTermsByZone(supabase, zoneIds) {
  const byZone = new Map();
  if (!zoneIds.length) return byZone;
  const { data: terms, error } = await fetchInChunks(zoneIds, (chunk) => fetchAllResult(() => supabase
    .from('service_zone_terms').select('id, "zoneId", "salesOrderId", "startDate", "endDate"')
    .in('zoneId', chunk).order('id', { ascending: true })));
  if (error) throw error;
  const orderIds = [...new Set((terms || []).map((term) => term.salesOrderId).filter(Boolean))];
  const { data: orders, error: orderError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_orders').select('id, "orderNumber", status, "supersededById"')
    .in('id', chunk).order('id', { ascending: true })));
  if (orderError) throw orderError;
  const ordersById = new Map((orders || []).map((order) => [order.id, order]));
  for (const term of terms || []) {
    if (!byZone.has(term.zoneId)) byZone.set(term.zoneId, []);
    byZone.get(term.zoneId).push({ term, order: ordersById.get(term.salesOrderId) || null });
  }
  return byZone;
}

/**
 * @param orderId  ว่าง = สร้างใบ (POST) · มีค่า = แก้ใบร่าง/ใบที่ถูกตีกลับ (PATCH)
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function commitHistoricalOrder({
  supabase, user, body, orderId = null, audit = recordAudit, now = new Date(), request = null,
  validateOwner = validateDealOwner,
}) {
  // ① ด่านสิทธิ์ — ก่อนอ่านอะไรทั้งนั้น
  if (!canKeyHistoricalSalesOrder(user)) return reply(403, coded('historical_so_actor_forbidden'));
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const preview = input.preview === true;
  const editing = Boolean(text(orderId));
  const intakeKey = editing ? '' : text(input.intakeKey);
  if (!preview && !editing && (!intakeKey || intakeKey.length > INTAKE_KEY_MAX)) {
    return reply(400, coded('historical_so_intake_key_required'));
  }
  // แก้ใบ = เทียบเวลาที่จอเห็นกับฐานเสมอ (อีกแท็บ/ผู้อนุมัติเพิ่งขยับใบ) — ไม่ส่ง = ตีกลับก่อนอ่านฐาน
  let expected = null;
  if (!preview && editing) {
    expected = resolveExpectedUpdatedAt(input);
    if (!expected.ok) return reply(400, { error: expected.error });
  }

  // ② ตรวจว่ารัน 0374 แล้ว — select ชื่อคอลัมน์ใหม่ตรง ๆ (ให้ check:columns มองเห็นด้วย)
  const [lineProbe, installmentProbe] = await Promise.all([
    supabase.from('sales_order_lines').select('"serviceZoneId"').limit(1),
    supabase.from('sales_order_installments').select('kind').limit(1),
  ]);
  const probeError = lineProbe.error || installmentProbe.error;
  if (probeError) {
    if (historicalSchemaMissing(probeError)) return reply(503, { error: HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE });
    return reply(500, { error: `ตรวจฐานข้อมูลไม่สำเร็จ: ${probeError.message}` });
  }

  const customerId = text(input.customerId);
  const ownerId = text(input.ownerId);

  // ③ แก้ใบ: โหลด + ตรวจขอบเขตในจังหวะเดียว (loadScoped) · ต้องเป็นใบย้อนหลังที่ยังแก้ได้ (ร่าง/ตีกลับ)
  let existing = null;
  if (editing) {
    const { row, response } = await loadScoped(supabase, 'sales_orders', orderId, user, 'edit');
    if (response) return reply(response.status, await response.json().catch(() => ({ error: 'โหลดใบสั่งขายไม่สำเร็จ' })));
    if (!isHistoricalOrder(row)) {
      return reply(409, { error: 'ใบนี้ไม่ใช่ใบสั่งขายย้อนหลัง — แก้ที่หน้าใบสั่งขายตามปกติ' });
    }
    if (!historicalOrderEditable(row)) return reply(409, coded('historical_so_edit_state_invalid'));
    /* ⚠️ **ข้อยกเว้นของ "ฟอร์มแก้ = ฟอร์มสร้าง" (เหตุผลด้านข้อมูล)** — ลูกค้า/AE ล็อกหลังบันทึกครั้งแรก:
       ดีลภาชนะ (ลูกค้า × AE) เลขใบ และทีม/เจ้าของของเอกสารแทนสัญญาผูกกับคู่นี้ไปแล้วตอนสร้าง
       ⇒ เปลี่ยนคู่ = ใบอยู่ผิดดีลเงียบ ๆ · คีย์ผิดคู่ = ลบใบแล้วคีย์ใหม่ (RPC แก้ใบก็ปฏิเสธด้วยรหัสเดียวกัน) */
    if (customerId !== text(row.customerId) || ownerId !== text(row.deal?.ownerId)) {
      return reply(409, coded('historical_so_owner_locked'));
    }
    existing = row;
  }

  // ④ ของประกอบ — ไม่มีการโหลดแถวเดี่ยวของตารางที่มีทะเบียนขอบเขต (ลูกค้า/สินค้า/โซนไม่อยู่ในทะเบียน)
  const rawZones = Array.isArray(input.zones) ? input.zones : [];
  const zoneIds = [...new Set(rawZones.map((row) => text(row?.zoneId)).filter(Boolean))];
  const productIds = [...new Set(rawZones.map((row) => text(row?.productId)).filter(Boolean))];

  let customer = null;
  let owner = null;
  let products = [];
  let zones = [];
  let sites = [];
  let liveTermsByZone = new Map();
  let containerDeals = [];
  let existingHistorical = [];
  try {
    if (customerId) {
      const { data, error } = await supabase.from('customers')
        .select('id, name, "nameEn", "approvalStatus", "isActive"').eq('id', customerId).maybeSingle();
      if (error) throw error;
      customer = data || null;
    }
    // AE/Senior AE เลือกคนอื่น = ตัวตัดสินตีกลับอยู่แล้ว ⇒ ไม่ต้องถาม Auth ให้เปลือง
    const lockedElsewhere = ownerLockedToSelf(user.role) && ownerId !== text(user.id);
    if (ownerId && !lockedElsewhere) owner = await validateOwner(supabase, ownerId, user, text(input.team) || null);
    if (productIds.length) {
      /* ⭐ ราคา/หน่วยของบรรทัดอ่านจากที่นี่ที่เดียว (มติ 23/09 — ราคาของใบเสนอราคา = ราคาผลิตในทะเบียน)
         ⚠️ ไม่ select "costPrice" = แผนตอบ "อ่านราคาไม่ได้" ทุกบรรทัด ไม่ใช่ราคา 0 (แยกสองอย่างนี้โดยเจตนา) */
      const { data, error } = await fetchInChunks(productIds, (chunk) => fetchAllResult(() => supabase.from('products')
        .select('id, "fgCode", "productDescription", "saleUnit", "costPrice"')
        .in('id', chunk).order('id', { ascending: true })));
      if (error) throw error;
      products = data || [];
    }
    if (zoneIds.length) {
      const { data, error } = await fetchInChunks(zoneIds, (chunk) => fetchAllResult(() => supabase
        .from('service_zones').select('id, "siteId", name, code, "isActive"')
        .in('id', chunk).order('id', { ascending: true })));
      if (error) throw error;
      zones = data || [];
      const siteIds = [...new Set(zones.map((zone) => zone.siteId).filter(Boolean))];
      const { data: siteRows, error: siteError } = await fetchInChunks(siteIds, (chunk) => fetchAllResult(() => supabase
        .from('service_sites').select('id, code, name, "customerId", kind, "isActive"')
        .in('id', chunk).order('id', { ascending: true })));
      if (siteError) throw siteError;
      sites = siteRows || [];
      liveTermsByZone = await loadLiveTermsByZone(supabase, zoneIds);
    }
    if (customerId) {
      const [deals, orders] = await Promise.all([
        fetchAllResult(() => historicalRowsOnly(supabase.from('sales_deals')
          .select('id, code, title, stage, line, "projectId", "customerId", "ownerId", "ownerName", team')
          .eq('customerId', customerId)).order('id', { ascending: true })),
        fetchAllResult(() => historicalRowsOnly(supabase.from('sales_orders')
          .select('id, "orderNumber", "orderDate", status, "historicalQuoteRef", "historicalExpressRef", "historicalInvoiceRef"')
          .eq('customerId', customerId)).order('id', { ascending: true })),
      ]);
      if (deals.error) throw deals.error;
      if (orders.error) throw orders.error;
      containerDeals = deals.data || [];
      existingHistorical = orders.data || [];
    }
  } catch (loadError) {
    if (historicalSchemaMissing(loadError)) return reply(503, { error: HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE });
    return reply(500, { error: `โหลดข้อมูลประกอบการคีย์ไม่สำเร็จ: ${loadError?.message || loadError}` });
  }

  // ⑤ ตัวตัดสินเดียว — พรีวิวกับบันทึกจริงได้แผนเดียวกัน (บทเรียน #1685)
  //   ใบของตัวเอง (แก้ใบ = id นี้ · สร้าง = id ที่ RPC จะออกให้รหัสการคีย์นี้) ไม่นับเป็นใบซ้ำ/รอบขายของใบอื่น
  //   ⚠️ `editing` ต้องส่งแยก — `selfOrderId` มีค่าทั้งสองทาง แยกสร้าง/แก้ไม่ได้ (แผนใช้ตัดสินข้อสัญญาสิ้นสุดของมติข้อ 9)
  const selfOrderId = editing ? existing.id : (intakeKey ? historicalOrderIdOf(md5(intakeKey)) : null);
  const plan = planHistoricalServiceOrder(input, {
    actor: user, customer, owner, products, zones, sites, containerDeals, existingHistorical, liveTermsByZone,
    todayIso: businessDate(now), selfOrderId, editing,
  });
  if (plan.errors.length) {
    /* พรีวิวได้ `money` ติดไปด้วย (null = ยังคิดยอดไม่ได้ — ดู `previewPlanMoney`)
       การบันทึกจริงที่ตีกลับไม่พูดเรื่องยอด: จอไม่ได้ขอตรวจ มันขอเขียน */
    const errorBody = { error: plan.errors[0].message, errors: plan.errors };
    if (preview) errorBody.money = previewPlanMoney(plan);
    return reply(400, errorBody);
  }
  if (preview) return reply(200, { preview: true, plan });
  if (plan.duplicates.length && !plan.acknowledgeDuplicates) {
    return reply(409, {
      error: 'พบใบสั่งขายย้อนหลังของลูกค้านี้ที่วันเริ่มสัญญาหรือเลขเอกสารเดิมตรงกัน — ตรวจรายการแล้วยืนยันว่าไม่ซ้ำก่อนบันทึก',
      code: 'historical_so_duplicate_unacknowledged',
      duplicates: plan.duplicates,
    });
  }

  const actor = { p_actor_id: user.id, p_actor_name: user.name || user.email || null, p_actor_role: user.role };
  /* ⭐ มติ 26/09 "บันทึกใบซ้ำที่ผู้คีย์ยืนยัน" — ใบไหน · ใคร · เมื่อไร · เหตุผล ลง `metadata.historicalIntake.duplicateReview`
     ในทรานแซกชันเดียวกับใบ (RPC ของ 0374 เก็บ `p_header.intake` ทั้งก้อน — ไม่ต้องแก้ฐาน) · เขียนทุกครั้งที่บันทึกจริง (แม้ `orders: []`)
     🔴 ต่อท้ายอาร์กิวเมนต์ **หลังประกอบแล้ว** เท่านั้น — ลายนิ้วมือคิดจาก `historicalServiceRpcArgs(plan)` ⇒ บันทึกนี้ไม่เข้าแฮช
        (ใส่ใน historicalServiceRpcArgs/plan.header = เวลา/ผู้คีย์/รายการต่างกันแล้วส่งซ้ำได้ intake_key_conflict ทุกครั้ง) */
  const duplicateReview = historicalDuplicateReviewRecord({ duplicates: plan.duplicates, ack: plan.duplicateAck, user, now });
  const withDuplicateReview = (args) => ({
    ...args, p_header: { ...args.p_header, intake: { ...(args.p_header?.intake || {}), duplicateReview } },
  });
  if (editing) return updateOrder({ supabase, user, existing, plan, expected, actor, audit, request, withDuplicateReview });

  // ⑥ สร้าง — ดีลภาชนะ + เลขใบ + เอกสารแทนสัญญา (ร่าง) + หัวใบ (ร่าง) + บรรทัด + งวด ในทรานแซกชันเดียว
  //   ตอนสร้างยังไม่มีหลักฐานงวดยกมา (ไฟล์ต้องอยู่ใต้โฟลเดอร์ของใบ ซึ่งยังไม่เกิด) — ฟอร์มอัปแล้วแก้ใบเก็บทีหลัง
  const args = withDuplicateReview({
    p_intake_key: intakeKey,
    p_intake_hash: sha256(historicalServiceFingerprintSource(plan)),
    ...actor,
    ...historicalServiceRpcArgs(plan, 'create'),
    // ส่งเสมอ — RPC ใช้เฉพาะตอนคู่ (ลูกค้า × AE) ยังไม่มีดีลภาชนะ · ถัง/prefix/ความกว้างจากตัวเดียวกับตัวออกรหัส
    p_new_deal: {
      id: genId('DEAL'),
      historyId: genId('DSH'),
      title: HISTORICAL_DEAL_TITLE(plan.header.customerName),
      ownerName: plan.header.ownerName,
      ...entityCodeArgs('DL', now),
    },
  });
  const call = () => supabase.rpc('create_historical_sales_order', args);
  let { data: result, error } = await call();
  if (error && isOrderPkeyCollision(error)) ({ data: result, error } = await call());
  if (error) {
    if (historicalSchemaMissing(error)) return reply(503, { error: HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE });
    const raw = errorText(error);
    if (raw.includes('historical_so_intake_key_conflict')) {
      /* ใบของรหัสการคีย์นี้มีอยู่แล้วแต่เนื้อต่างกัน (เช่น กดสร้างแล้วเน็ตหลุด กลับมาแก้ช่องแล้วกดใหม่)
         ⇒ ส่ง id ที่คำนวณฝั่ง server ไปให้ฟอร์มเสนอ "เปิดใบที่สร้างไว้ในฟอร์มแก้ไข" */
      return reply(409, coded('historical_so_intake_key_conflict', { orderId: selfOrderId }));
    }
    /* 🪤 RPC จับ 23505 ของดีลภาชนะเองแล้ว (ข้อ ⑩) — ถ้าหลุดมาได้ ห้ามตอบข้อความของการย้ายเจ้าของ
       ("มีดีลของ AE คนนั้นอยู่แล้ว") เพราะผู้คีย์ไม่ได้ย้ายอะไร · กดบันทึกอีกครั้งก็ผ่าน */
    if (raw.includes('sales_deals_historical_container_uk')) return reply(409, coded('historical_so_container_deal_race'));
    const mapped = documentWorkflowError(error, { context: `historical sales order ${intakeKey}` });
    return reply(mapped.status, { error: mapped.message, ...(mapped.code ? { code: mapped.code } : {}) });
  }

  const order = result?.order || null;
  const lines = result?.lines || [];
  const installments = result?.installments || [];
  const contract = result?.contract || null;
  const deal = result?.deal || null;
  const dealCreated = result?.dealCreated === true;
  const replayed = result?.replayed === true;
  if (!order?.id) return reply(500, { error: 'บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ — ฐานข้อมูลไม่คืนใบที่สร้าง' });

  // ⑦ audit — ใบ + เอกสารแทนสัญญา (+ ดีลภาชนะที่เพิ่งเกิด) · ส่งซ้ำ: เขียนเฉพาะเมื่อรอบแรกยังไม่ได้ลง
  const refsLabel = historicalRefsOf(order).join(' · ') || 'ไม่มีเลขเดิม';
  const writeCreateAudits = async (suffix = '') => {
    await audit({
      user,
      action: 'create',
      entityType: 'sales_order',
      entityId: order.id,
      after: { order, lines, installments, contract, dealId: deal?.id || order.dealId || null, dealCreated },
      summary: `สร้างใบสั่งขายย้อนหลัง (ร่าง) ${order.orderNumber} (${refsLabel})${suffix}`,
      request,
    });
    if (contract?.id) {
      await audit({
        user,
        action: 'create',
        entityType: 'sales_contract',
        entityId: contract.id,
        after: contract,
        summary: `สร้างเอกสารแทนสัญญา (ร่าง) ของใบสั่งขายย้อนหลัง ${order.orderNumber} · `
          + `${externalDocKindLabel(contract.externalDocKind)} ${contract.externalRef || 'ไม่มีเลขที่'}${suffix}`,
        request,
      });
    }
  };
  if (!replayed) {
    await writeCreateAudits();
    if (dealCreated && deal?.id) {
      await audit({
        user,
        action: 'create',
        entityType: 'sales_deal',
        entityId: deal.id,
        after: deal,
        summary: `สร้างดีลของใบสั่งขายย้อนหลัง ${deal.code || deal.id} · ${deal.customerName || '—'} · AE ${deal.ownerName || '—'}`,
        request,
      });
    }
  } else {
    const { data: logged, error: logError } = await supabase.from('audit_logs')
      .select('id').eq('entityType', 'sales_order').eq('entityId', order.id).eq('action', 'create')
      .limit(1).maybeSingle();
    // อ่านไม่ได้ = เขียนไว้ก่อน (audit ซ้ำถูกกว่าหาย — audit_logs คือทางกู้ข้อมูลทางเดียว)
    if (logError || !logged) await writeCreateAudits(' (บันทึกจากการส่งซ้ำ)');
  }

  return reply(replayed ? 200 : 201, { order, lines, installments, contract, deal, dealCreated, replayed });
}

/* ⑥' แก้ใบร่าง/ใบที่ถูกตีกลับ — RPC เขียนบรรทัด+งวดใหม่ทั้งชุด · ใบที่ถูกตีกลับพลิกเป็นร่าง (ด่านอัปหลักฐานไม่รับใบตีกลับ) */
async function updateOrder({ supabase, user, existing, plan, expected, actor, audit, request, withDuplicateReview = (args) => args }) {
  const orderId = existing.id;

  // หลักฐานงวดยกมา: ตัวเขียนของฐานเขียนงวดใหม่ทั้งชุด ⇒ ส่งครบทุกไฟล์เสมอ · กรองให้เหลือไฟล์ของใบนี้จริง
  let opening = plan.opening;
  if (opening) {
    const { evidence, error: evidenceError } = await sanitizeHistoricalEvidence({
      supabase, orderId, refs: opening.evidence,
    });
    if (evidenceError) return reply(400, { error: evidenceError });
    opening = { ...opening, evidence };
  }

  // ของเดิมทั้งชุดก่อนเขียนทับ — ระบบไม่มีถังขยะ กู้ได้จาก audit_logs.before เท่านั้น
  const [beforeLines, beforeInstallments, beforeContract] = await Promise.all([
    fetchAllResult(() => supabase.from('sales_order_lines').select('*')
      .eq('salesOrderId', orderId).order('sortOrder', { ascending: true }).order('id', { ascending: true })),
    fetchAllResult(() => supabase.from('sales_order_installments').select('*')
      .eq('salesOrderId', orderId).order('seq', { ascending: true }).order('id', { ascending: true })),
    existing.serviceContractId
      ? supabase.from('sales_contracts').select('*').eq('id', existing.serviceContractId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const beforeError = beforeLines.error || beforeInstallments.error || beforeContract.error;
  if (beforeError) {
    if (historicalSchemaMissing(beforeError)) return reply(503, { error: HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE });
    return reply(500, { error: `อ่านใบเดิมก่อนแก้ไม่สำเร็จ: ${beforeError.message}` });
  }

  /* ⚠️ RPC แก้ใบแทน `historicalIntake` **ทั้งก้อน** (0374:1054-1056) ⇒ ทุกครั้งที่แก้ต้องแนบบันทึกใหม่ ไม่งั้นบันทึกเดิมหาย */
  const { data: result, error } = await supabase.rpc('update_historical_sales_order', withDuplicateReview({
    p_order_id: orderId,
    p_expected_updated_at: expected.value,
    ...actor,
    ...historicalServiceRpcArgs({ ...plan, opening }, 'update'),
  }));
  if (error) {
    if (historicalSchemaMissing(error)) return reply(503, { error: HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE });
    const mapped = documentWorkflowError(error, { context: `historical sales order update ${orderId}` });
    return reply(mapped.status, { error: mapped.message, ...(mapped.code ? { code: mapped.code } : {}) });
  }
  const order = result?.order || null;
  if (!order?.id) return reply(500, { error: 'บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ — ฐานข้อมูลไม่คืนใบที่แก้' });
  const lines = result?.lines || [];
  const installments = result?.installments || [];
  const contract = result?.contract || null;

  const fromRejected = existing.status === 'rejected';
  await audit({
    user,
    action: 'update',
    entityType: 'sales_order',
    entityId: orderId,
    before: {
      order: withoutJoin(existing), lines: beforeLines.data || [], installments: beforeInstallments.data || [],
      contract: beforeContract.data || null,
    },
    after: { order, lines, installments, contract },
    summary: `แก้ใบสั่งขายย้อนหลัง ${order.orderNumber}${fromRejected ? ' ที่ถูกตีกลับ — กลับเป็นร่าง' : ' (ร่าง)'}`,
    request,
  });

  return reply(200, {
    order, lines, installments, contract, deal: existing.deal || null, dealCreated: false, replayed: false,
  });
}
