// ── ตัวเขียนทางเดียวของใบสั่งขายย้อนหลัง (พรีวิว + บันทึก) — server เท่านั้น ─────────────
//
// route `POST /api/sales-planning/sales-orders/historical` เป็นแค่เปลือก · ตรรกะอยู่ที่นี่เพื่อให้เทสต์
// ยิงด้วย supabase ปลอมได้ (supabase · audit · validateOwner ฉีดเข้ามา)
//
// ลำดับ: ด่านสิทธิ์ → ตรวจว่ารัน 0360 แล้ว → โหลดของประกอบ → ตัวตัดสินเดียว (planHistoricalOrder)
//        → พรีวิวจบตรงนี้ (ไม่แตะ RPC) → ใบที่อาจซ้ำต้องยืนยัน → RPC ในทรานแซกชันเดียว → audit
//
// ⚠️ ห้าม import ตัวหยุดยอดงวดของขั้นอนุมัติ หรือตัวตรึงฉบับเอกสาร — ใบย้อนหลังไม่ผ่านขั้นอนุมัติ
//    (RPC หยุดยอดงวดเอง · ไม่มีหลักฐานลายเซ็น) · เทสต์ตรึงไว้
import { createHash } from 'node:crypto';
import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { businessDate } from '@/lib/businessDate';
import { entityCodeArgs } from '@/lib/entityCode';
import { validateDealOwner } from '@/lib/sales/dealOwner';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { documentWorkflowError, workflowErrorMessage } from '@/lib/sales/documentWorkflowErrors';
import {
  HISTORICAL_DEAL_TITLE, HISTORICAL_SCHEMA_MISSING_MESSAGE, canKeyHistoricalSalesOrder, historicalOrderIdOf,
  historicalRefsOf, historicalRowsOnly, historicalSchemaMissing,
} from '@/lib/sales/historicalOrders';
import {
  historicalIntakeFingerprintSource, historicalRpcPayload, planHistoricalOrder,
} from '@/lib/sales/historicalOrderPlan';

const INTAKE_KEY_MAX = 200;
const md5 = (value) => createHash('md5').update(String(value), 'utf8').digest('hex');
const sha256 = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');
const text = (value) => (value === null || value === undefined ? '' : String(value)).trim();
const reply = (status, body) => ({ status, body });

/* 23505 ของ primary key ใบสั่งขาย = สองคำขอรหัสเดียวกันชนกันพอดี ⇒ ยิงซ้ำหนึ่งครั้งได้ใบเดิม/ชนกัน */
const isOrderPkeyCollision = (error) => String(error?.code || '') === '23505'
  && /sales_orders_pkey/.test(`${error?.message || ''} ${error?.details || ''}`);
const errorText = (error) => `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function commitHistoricalOrder({
  supabase, user, body, audit = recordAudit, now = new Date(), request = null, validateOwner = validateDealOwner,
}) {
  // ① ด่านสิทธิ์ — ก่อนอ่านอะไรทั้งนั้น
  if (!canKeyHistoricalSalesOrder(user)) {
    return reply(403, { error: workflowErrorMessage('historical_so_actor_forbidden'), code: 'historical_so_actor_forbidden' });
  }
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const preview = input.preview === true;
  const intakeKey = text(input.intakeKey);
  if (!preview && (!intakeKey || intakeKey.length > INTAKE_KEY_MAX)) {
    return reply(400, { error: workflowErrorMessage('historical_so_intake_key_required'), code: 'historical_so_intake_key_required' });
  }

  // ② ตรวจว่ารัน 0360 แล้ว — select ชื่อคอลัมน์ใหม่ตรง ๆ (ให้ check:columns มองเห็นด้วย)
  const [orderProbe, lineProbe] = await Promise.all([
    supabase.from('sales_orders').select('origin, "historicalIntakeHash", "paymentGateExemptAt"').limit(1),
    supabase.from('sales_order_lines').select('"installationPoint"').limit(1),
  ]);
  const probeError = orderProbe.error || lineProbe.error;
  if (probeError) {
    if (historicalSchemaMissing(probeError)) return reply(503, { error: HISTORICAL_SCHEMA_MISSING_MESSAGE });
    return reply(500, { error: `ตรวจฐานข้อมูลไม่สำเร็จ: ${probeError.message}` });
  }

  // ③ ของประกอบ — ไม่มีการโหลดแถวเดี่ยวของตารางที่มีทะเบียนขอบเขต (ลูกค้าไม่อยู่ในทะเบียน)
  const customerId = text(input.customerId);
  const ownerId = text(input.ownerId);
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const productIds = [...new Set(lines.map((l) => text(l?.productId)).filter(Boolean))];

  let customer = null;
  let owner = null;
  let products = [];
  let containerDeals = [];
  let existingHistorical = [];
  try {
    if (customerId) {
      const { data, error } = await supabase.from('customers')
        .select('id, name, "nameEn", "approvalStatus", "isActive"').eq('id', customerId).maybeSingle();
      if (error) throw error;
      customer = data || null;
    }
    if (ownerId) owner = await validateOwner(supabase, ownerId, user, text(input.team) || null);
    if (productIds.length) {
      const { data, error } = await fetchInChunks(productIds, (chunk) => fetchAllResult(() => supabase.from('products')
        .select('id, "fgCode", "productDescription", "productDescriptionEn", "saleUnit", "categoryCode"')
        .in('id', chunk).order('id', { ascending: true })));
      if (error) throw error;
      products = data || [];
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
    if (historicalSchemaMissing(loadError)) return reply(503, { error: HISTORICAL_SCHEMA_MISSING_MESSAGE });
    return reply(500, { error: `โหลดข้อมูลประกอบการคีย์ไม่สำเร็จ: ${loadError?.message || loadError}` });
  }

  // ④ ตัวตัดสินเดียว — พรีวิวกับบันทึกจริงได้แผนเดียวกัน
  const replayOrderId = intakeKey ? historicalOrderIdOf(md5(intakeKey)) : null;
  const plan = planHistoricalOrder(input, {
    customer, owner, products, containerDeals, existingHistorical, todayIso: businessDate(now), replayOrderId,
  });
  if (plan.errors.length) return reply(400, { error: plan.errors[0].message, errors: plan.errors });
  if (preview) return reply(200, { preview: true, plan });
  if (plan.duplicates.length && input.acknowledgeDuplicates !== true) {
    return reply(409, {
      error: 'พบใบสั่งขายย้อนหลังของลูกค้านี้ที่วันที่หรือเลขเอกสารเดิมตรงกัน — ตรวจรายการแล้วยืนยันว่าไม่ซ้ำก่อนบันทึก',
      code: 'historical_so_duplicate_unacknowledged',
      duplicates: plan.duplicates,
    });
  }

  // ⑤ RPC — ดีลภาชนะ + เลขใบ + หัวใบ + บรรทัด + งวด ในทรานแซกชันเดียว
  const intakeHash = sha256(historicalIntakeFingerprintSource(plan));
  const args = {
    p_intake_key: intakeKey,
    p_intake_hash: intakeHash,
    p_actor_id: user.id,
    p_actor_name: user.name || user.email || null,
    p_actor_role: user.role,
    ...historicalRpcPayload(plan),
    // ส่งเสมอ — RPC ใช้เฉพาะตอนคู่ (ลูกค้า × AE) ยังไม่มีดีลภาชนะ · ถัง/prefix/ความกว้างจากตัวเดียวกับตัวออกรหัส
    p_new_deal: {
      id: genId('DEAL'),
      historyId: genId('DSH'),
      title: HISTORICAL_DEAL_TITLE(plan.header.customerName),
      ownerName: plan.header.ownerName,
      ...entityCodeArgs('DL', now),
    },
  };
  const call = () => supabase.rpc('create_historical_sales_order', args);
  let { data: result, error } = await call();
  if (error && isOrderPkeyCollision(error)) ({ data: result, error } = await call());
  if (error) {
    if (historicalSchemaMissing(error)) return reply(503, { error: HISTORICAL_SCHEMA_MISSING_MESSAGE });
    const raw = errorText(error);
    if (raw.includes('historical_so_intake_key_conflict')) {
      return reply(409, {
        error: workflowErrorMessage('historical_so_intake_key_conflict'),
        code: 'historical_so_intake_key_conflict',
        existingOrderId: replayOrderId,
      });
    }
    /* 🪤 RPC จับ 23505 ของดีลภาชนะเองแล้ว (0360 ข้อ ⑩) — ถ้าหลุดมาได้ ห้ามตอบข้อความของการย้ายเจ้าของ
       ("มีดีลของ AE คนนั้นอยู่แล้ว") เพราะผู้คีย์ไม่ได้ย้ายอะไร · กดบันทึกอีกครั้งก็ผ่าน */
    if (raw.includes('sales_deals_historical_container_uk')) {
      return reply(409, {
        error: workflowErrorMessage('historical_so_container_deal_race'),
        code: 'historical_so_container_deal_race',
      });
    }
    const mapped = documentWorkflowError(error, { context: `historical sales order ${intakeKey}` });
    return reply(mapped.status, { error: mapped.message, ...(mapped.code ? { code: mapped.code } : {}) });
  }

  const order = result?.order || null;
  const orderLines = result?.lines || [];
  const installments = result?.installments || [];
  const deal = result?.deal || null;
  const dealCreated = result?.dealCreated === true;
  const replayed = result?.replayed === true;
  if (!order?.id) return reply(500, { error: 'บันทึกใบสั่งขายย้อนหลังไม่สำเร็จ — ฐานข้อมูลไม่คืนใบที่สร้าง' });

  // ⑥ audit — ใบใหม่ (+ ดีลภาชนะที่เพิ่งเกิด) · ส่งซ้ำ: เขียนเฉพาะเมื่อรอบแรกยังไม่ได้ลง
  const refsLabel = historicalRefsOf(order).join(' · ') || 'ไม่มีเลขเดิม';
  const orderAudit = (suffix = '') => audit({
    user,
    action: 'create',
    entityType: 'sales_order',
    entityId: order.id,
    after: { order, lines: orderLines, installments, dealId: deal?.id || order.dealId || null, dealCreated },
    summary: `สร้างใบสั่งขายย้อนหลัง ${order.orderNumber} (${refsLabel})${suffix}`,
    request,
  });
  if (!replayed) {
    await orderAudit();
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
    if (logError || !logged) await orderAudit(' (บันทึกจากการส่งซ้ำ)');
  }

  return reply(replayed ? 200 : 201, { order, lines: orderLines, installments, deal, dealCreated, replayed });
}
