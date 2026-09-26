import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { sanitizeEvidenceAttachments } from '@/lib/sales/orderConfirmationDocs';
import {
  PRIVATE_EVIDENCE_BUCKET, privateEvidencePrefix,
} from '@/lib/upload/privateEvidence';
import {
  findLinkedTaxInvoiceItem, mirrorTaxInvoiceToRequestItem, taxInvoiceClearPatch,
  taxInvoiceConflict, taxInvoicePatch,
} from '@/lib/sales/taxInvoice';
import { notifyTaxInvoice } from '@/lib/sales/taxInvoiceNotify';
import { orderHasServiceRounds } from '@/lib/sales/serviceOrders';
import {
  INSTALLMENT_STALE_MESSAGE, billingFillCheck, billingFillStoppedMessage, billingRedateCheck, billingRedateRows,
  billingRedateStoppedMessage, billingRequestedIds, installmentActionError, installmentReportOutcome,
  installmentScheduleAllowed, installmentStale, installmentStartBlock, openingCoverageEnd, pipelineInstallmentLock,
  withLiveAmounts,
} from '@/lib/sales/salesOrderPayments';
import {
  INSTALLMENT_BILLING_SCHEMA_MISSING, carryInstallments, ensureInstallments, installmentBillingSchemaError,
  installmentRefundSchemaError, loadInstallment, loadInstallments, replanInstallments, updateInstallment, writeBillingFill,
} from '@/lib/sales/salesOrderInstallmentsStore';
import { normalizeInstallmentBilling } from '@/lib/sales/billingRule';
import { businessDate } from '@/lib/businessDate';
import {
  REPLAN_STALE_MESSAGE, buildReplanRows, installmentReplanBlocker, replanAuditSummary, replanReasonError, replanStale,
} from '@/lib/sales/installmentReplan';
import {
  CARRY_FORBIDDEN, CARRY_STALE_MESSAGE, applyCarryIn, canCarryInstallments, carryAuditSummary, carryBlocker,
  carrySourceError, carrySourcesFrom, carryStale,
} from '@/lib/sales/installmentCarry';
import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';
import { documentWorkflowError } from '@/lib/sales/documentWorkflowErrors';
import {
  OPENING_INSTALLMENT_LABEL, historicalInstallmentLock, isHistoricalOrder, isOpeningInstallment,
} from '@/lib/sales/historicalOrders';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { loadScoped } from '@/lib/scopedRow';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v));

/* ยอดของงวดที่ส่งกลับให้จอ — งวดร่างของใบปกติเดินตามแผนของ QT สด ๆ (B-4 · write-on-read ไม่เขียนทับใน DB)
   ⛔ **ใบย้อนหลังไม่ทับ** (0374) — ไม่มีใบเสนอราคา ⇒ แผนว่างกลายเป็น "ชำระเต็มจำนวน" 100% ทับงวดที่คีย์
      และงวดของใบนี้ยังไม่หยุดยอดจน AE Sup อนุมัติ ⇒ ตัวทับจะเห็นทุกแถวเป็นร่าง (ตัวเดียวกับที่ loadOrder ของหน้าใบข้าม) */
const installmentsForScreen = (order, rows) => (isHistoricalOrder(order)
  ? rows
  : withLiveAmounts(rows, order.quotation?.paymentPlan, order.totalAmount));

/* สิทธิ์ **อ่าน** ของงวด = สิทธิ์อ่านใบสั่งขายใบนั้น (view-scope ของดีลเจ้าของ)
   ⚠️ ฝ่ายบัญชีถือ `salesplan:view` แบบ scope กว้าง จึงเห็นทุกใบตามที่ควรเป็น —
   ด่านที่แคบคือ **คำสั่ง** ไม่ใช่การอ่าน (installmentActionError คุมอีกชั้น) */
async function loadOrderForUser(supabase, user, id) {
  const { data: order, error } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!order) return { error: notFound('ไม่พบใบสั่งขาย') };

  const { data: deal, error: dealError } = await supabase
    .from('sales_deals').select('*').eq('id', order.dealId).maybeSingle();
  if (dealError) throw dealError;
  if (!deal || !inSalesViewScope(user, deal)) return { error: forbidden() };

  const { data: quotation, error: quoteError } = await supabase
    .from('quotations')
    .select('id, quoteNumber, status, paymentPlan, wonDocType, wonDocDate, wonAttachments')
    .eq('id', order.quotationId)
    .maybeSingle();
  if (quoteError) throw quoteError;

  /* ⭐ บรรทัดของใบ + ดีล — ด่านรับรองงวดต้องรู้ว่า **ใบนี้เป็นงานบริการไหม**
     (ดีลสาย SERVICE + บรรทัดหมวด 02-001 ≥1 ⇒ ทั้งใบ) เพราะใบบริการต้องมีช่วงครอบ
     ก่อนบัญชีจะรับรองได้ (มติผู้ใช้ 2026-08-31)
     ⚠️ เอาเฉพาะ `fgCode` — เกณฑ์อ่านแค่หมวดของรหัส ไม่ต้องลากราคามาทั้งแถว */
  const { data: lines, error: lineError } = await supabase
    .from('sales_order_lines').select('id, fgCode').eq('salesOrderId', order.id);
  if (lineError) throw lineError;

  /* 🐞 **โครงการหายไปจากก้อนที่ส่งให้ด่านเงิน** — ตัวตัดสินสายธุรกิจอ่าน "โครงการก่อน
     แล้วดีล" แต่ที่นี่แนบมาแต่ดีล ⇒ ใบที่สายมาจากโครงการถูกอ่านว่า "ไม่ใช่ใบบริการ"
     แล้วด่าน "ต้องมีช่วงครอบก่อนรับรอง" ถูกข้ามเงียบ ๆ (fail-open)
     ⚠️ ผู้เรียกเคยส่ง `{ project: order.project }` เข้า ctx ซึ่ง **ตัวรับไม่เคยอ่านคีย์นี้**
       (มันรับ `projectsById`) ⇒ อ่านโค้ดแล้วเข้าใจว่าแก้แล้ว ทั้งที่ไม่เคยมีผล
       ⇒ ทางแก้คือ **แนบของจริงมาให้** แล้วปล่อยตัวถอยของฟังก์ชันอ่าน `order.project` เอง
     ⚠️ วัดบนฐานจริง 08/09: ไม่มีใบไหนที่พลิกเข้าด่านเงินจากการแก้นี้ (0 ใบ)
       ⇒ ไม่มีใครถูกแช่แข็งการรับเงิน · แต่รูปิดไว้ก่อนใบถัดไปจะมา */
  let project = null;
  if (order.projectId) {
    const { data, error: projectError } = await supabase
      .from('projects').select('id, line').eq('id', order.projectId).maybeSingle();
    if (projectError) throw projectError;
    project = data || null;
  }

  /* ⭐ **เอกสารแทนสัญญาของใบย้อนหลัง (0374)** — ด่านช่วงครอบของงวดยกมาต้องรู้วันสิ้นสุดสัญญา
     🐞 **review 23/09: ปุ่มกับ API เคยกั้นคนละวัน** — แผงงวดบนใบมีสัญญาติดมากับใบอยู่แล้ว
       (route ของใบโหลดให้) แล้วส่ง `contractEnd` เข้าด่าน ส่วนที่นี่ไม่เคยโหลด ⇒ ด่านถอยไปอ่าน
       จากงวดอื่นของใบ ซึ่งไม่เท่ากับสัญญาเมื่อบัญชีเคยหดช่วงของงวดปกติงวดสุดท้ายลงมาก่อน
       ⇒ แถบบันทึกบนจอเงียบ ปุ่มเปิดให้กด แล้ว API ตีกลับด้วยวันคนละวัน
     ⚠️ อ่านเฉพาะใบย้อนหลังที่ผูกสัญญาไว้จริง — อ่านด้วย PK คอลัมน์เดียว (ใบ pipeline ไม่ยิง query เพิ่มเลย)
     ⚠️ **"ไม่พบแถว" กับ "ถามไม่สำเร็จ" คนละเรื่อง** — สัญญากำพร้า (ไม่พบ) = `null` แล้วปล่อยให้
       `openingCoverageEnd` ถอยไปอ่านจากงวดอื่นของใบตามกติกาเดียวกับจอ · แต่ **อ่านพลาดต้องดัง**
       (`throw` → 500) ห้ามกลืน ไม่งั้นด่านเงินเปลี่ยนวันที่กั้นเองเงียบ ๆ ตามความล้มเหลวของ query
     ⚠️ ด่านสิทธิ์ของแถวนี้คือด่านของใบที่ผ่านไปแล้วข้างบน (ดีลเดียวกัน) — ratchet กฎ 6 ที่
       systemRules.test.mjs มีบันทึกว่าทำไม `loadScoped` แทนตรงนี้ไม่ได้ */
  let serviceContract = null;
  if (isHistoricalOrder(order) && order.serviceContractId) {
    const { data, error: contractError } = await supabase
      .from('sales_contracts').select('id, "expiryDate"').eq('id', order.serviceContractId).maybeSingle();
    if (contractError) throw contractError;
    serviceContract = data || null;
  }

  /* ⭐ ใบที่ถูกออก Rev. ทับ (PR0) — ล็อกทั้งใบต้องบอกเลขใบ Rev. ที่งวดย้ายไป ด้วยประโยคเดียวกับแผงงวดบนใบ
     ⇒ อ่าน `revisionHistory` **รูปเดียวกับที่ route ของหน้าใบโหลดให้แผง** (ใบทั้งสายโซ่ของเลขฐานเดียวกัน)
       แล้ว `pipelineInstallmentLock` หาเลขจากชุดนั้นทั้งสองฝั่ง · ยิงเฉพาะใบ revised (ใบอื่นไม่มี query เพิ่ม)
     ⚠️ อ่านพลาดต้องดัง (supabase ไม่ throw เอง) — กลืนแล้วข้อความล็อกแค่ขาดเลข แต่ห้ามปิดเงียบเป็นนิสัย */
  let revisionHistory = [];
  if (order.status === 'revised' && order.supersededById) {
    const { data, error: historyError } = await fetchAllResult(() => supabase
      .from('sales_orders').select('id, "orderNumber"')
      .eq('baseNumber', order.baseNumber || order.orderNumber)
      .order('id', { ascending: true }));
    if (historyError) throw historyError;
    revisionHistory = data || [];
  }

  return {
    order: {
      ...order, quotation: quotation || null, deal, project, lines: lines || [], serviceContract, revisionHistory,
    },
  };
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    /* ยอดของงวดร่างมาจากแผนของ QT สด ๆ (B-4) — ที่เก็บไว้เป็นค่าตอนกด "เริ่มติดตาม"
       ซึ่งอาจไม่ตรงกับแผนวันนี้ · ทับตอนอ่าน ไม่ใช่เขียนทับใน DB (write-on-read) · ใบย้อนหลังไม่ทับ */
    return ok({ installments: installmentsForScreen(order, await loadInstallments(supabase, order.id)) });
  } catch (loadError) {
    return fail(loadError.message, 500);
  }
});

/* POST — เริ่มติดตามการชำระของใบนี้
   ⭐ **ทางปกติไม่ผ่านที่นี่แล้ว** (มติผู้ใช้ 2026-08-19) — งวดเกิดตอนออกใบจาก QT
   เส้นนี้เหลือเป็น **ทางกู้**: ใบเก่าที่อนุมัติไปก่อนมีระบบนี้ · ใบที่ตอนออกยังไม่มีแผน
   ชำระใน QT แล้วมาเพิ่มทีหลัง · และใบที่การสร้างตอนออกใบล้ม (ตรงนั้นกลืน error ไว้)
   (มติผู้ใช้ 2026-08-13: ไม่ generate ย้อนหลังทั้งระบบ ให้เปิดทีละใบ) */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;

    /* ⛔ ใบย้อนหลัง (0374): งวดทั้งชุดมาจากฟอร์มคีย์ใบ (แก้ได้ตอนร่าง/ตีกลับ · หยุดยอดตอน AE Sup อนุมัติ) — ไม่มีทางเพิ่มงวดทีหลัง
       · ทาง "คีย์งวดเพิ่ม" (append · RPC append_historical_installments ของ 0360) ถูกถอดพร้อม DROP ใน 0374
       · ⚠️ ของเดิมตกไปที่ "ใบเสนอราคาต้นทางไม่มีแผนการชำระให้ยกมา" ซึ่งพาไปหาใบเสนอราคาที่ไม่มีอยู่จริง */
    if (isHistoricalOrder(order)) {
      return badRequest('งวดของใบย้อนหลังมาจากฟอร์มคีย์ใบ — แก้งวดในฟอร์มตอนใบยังเป็นร่างหรือถูกตีกลับ');
    }

    /* ⭐ **ด่าน "ต้องอนุมัติก่อน" ถูกถอดแล้ว** (B-4 · มติผู้ใช้ 2026-08-15) —
       เหตุผลเดิม ("ยอดยังเปลี่ยนได้") ย้ายไปอยู่ที่ `freezeInstallments` ซึ่งเขียนยอด
       ทับครั้งสุดท้ายตอนอนุมัติ · แถวที่สร้างตอนนี้ยังไม่ freeze ⇒ ยังแจ้งชำระไม่ได้
       และยังไม่เข้าทะเบียนของบัญชี · สิ่งที่ได้คือ **ช่องกำหนดชำระให้ SA กรอกตอนที่
       กำลังคุยเงื่อนไขกับลูกค้าอยู่พอดี** แทนที่จะต้องรอใบผ่านอนุมัติแล้วย้อนกลับมา
       ⚠️ ใบที่ยกเลิก/ตีกลับไม่มีอะไรให้ติดตาม · ใบที่ถูกออก Rev. ทับ (PR0) งวดไปอยู่กับใบ Rev. แล้ว —
         สร้างชุดใหม่ให้ใบเก่า = เงินก้อนเดียวมีสองแถว · ปุ่มบนแผงถามตัวเดียวกัน (`installmentStartBlock`) */
    const startBlock = installmentStartBlock(order);
    if (startBlock) return badRequest(startBlock);

    const { rows, created } = await ensureInstallments(supabase, { order, user });
    if (!rows.length) return badRequest('ใบเสนอราคาต้นทางไม่มีแผนการชำระให้ยกมา');
    if (created) {
      await recordAudit({
        user,
        action: 'create',
        entityType: 'sales_order_installments',
        entityId: order.id,
        summary: `เริ่มติดตามการชำระ ${order.orderNumber} — ${rows.length} งวด`,
        request: req,
      });
    }
    return ok({ installments: rows, created });
  } catch (postError) {
    return fail(postError.message, 500);
  }
});

/* รอบวางบิลของลูกค้าของใบ (mig 0389) — อ่านสดจากทะเบียน ไม่เชื่อรอบที่จอส่งมา
   ⚠️ ก่อนรัน 0389 ไม่มีคอลัมน์ (42703) ⇒ 503 บอกให้รันมิก · อ่านพลาดอย่างอื่นต้องดัง (supabase ไม่ throw เอง)
   ⚠️ ด่านสิทธิ์ของแถวนี้คือด่านของใบที่ผ่านมาแล้ว (ลูกค้าของใบที่คนนี้เห็น) — ส่งกลับแค่รอบ ไม่ส่งแถวลูกค้า */
async function loadCustomerBillingRule(supabase, order) {
  if (!order.customerId) return { rule: null };
  const { data, error } = await supabase
    .from('customers').select('id, "billingRule"').eq('id', order.customerId).maybeSingle();
  if (error?.code === '42703') return { error: INSTALLMENT_BILLING_SCHEMA_MISSING, status: 503 };
  if (error) throw error;
  return { rule: data?.billingRule ?? null };
}

/* คำร้องขอใบวางบิลที่งวดผูกอยู่ (0260) → id ของงวดที่ "ขอใบวางบิลแล้ว" (billingRequestedIds → billingRequestLive ตัวเดียว)
   ⚠️ อ่านสดทุกครั้ง · เอาแค่ id + สถานะ · ไล่หน้า + ซอยก้อน (dept_requests อยู่ใน check:rowcap · ท่าเดียวกับทะเบียน FN)
   ⚠️ อ่านพลาด = โยน (→ 500) ห้ามถือว่า "ยังไม่ขอ" — ไม่งั้นงวดที่บัญชีออกใบตามวันเดิมไปแล้วถูกย้ายวันเงียบ ๆ
   ⚠️ ไม่กรองสถานะที่ query — ยกเลิกคำร้องไม่ล้างลิงก์บนงวด ตัวตัดสินต้องเห็นสถานะจริงเอง
   ⚠️ กรอง `kind` ชุดเดียวกับที่หน้าใบโหลดให้แผง (route ของใบ: คำร้อง billing_doc เท่านั้น) — แผนที่จอส่งมาคิดจากชุดนั้น
     ต่างชุดกันเมื่อไร = 409 วนไม่จบ */
async function loadBillingRequestedIds(supabase, rows) {
  const ids = [...new Set((rows || []).map((row) => row.billingRequestId).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await fetchInChunks(ids, (chunk) => fetchAllResult(() => supabase
    .from('dept_requests').select('id, status').in('id', chunk).eq('kind', 'billing_doc')
    .order('id', { ascending: true })));
  if (error) throw error;
  return billingRequestedIds(rows, new Map((data || []).map((request) => [request.id, request])));
}

/* ── จัดวันใหม่ตามรอบปัจจุบัน (กำหนดวางบิลรอบสอง · มติเจ้าของ 26/09 "ลูกค้าเปลี่ยนฉุกเฉิน หรือเปลี่ยนรอบเลย") ──────────
   ลูกค้าเปลี่ยนรอบถาวร ⇒ วันวางบิล **และ** กำหนดชำระของงวดที่ยังเปิดอยู่ผิดทั้งคู่ — จัดใหม่ทั้งใบในครั้งเดียว
   ⭐ พี่น้องของ `fill-billing` ทุกข้อ (ด่าน · ผู้มีสิทธิ์ · เขียนแบบมีเงื่อนไข · audit · 409 เมื่อจอเก่า) ต่างกันสามข้อ:
     · ตัวคิดคือ `planRedate` — รวมงวดที่มีวันแล้ว และ **ไม่คงกำหนดชำระเดิม** (billingRedateRows เขียนทั้งสองช่อง)
     · งวดที่ขอใบวางบิลแล้ว / รอเหตุการณ์ / แจ้งชำระแล้ว / งวดยกมา ไม่ถูกแตะ — "ขอแล้ว" อ่านคำร้องสดที่ server
       (`loadBillingRequestedIds`) ไม่เชื่อจอ · คำร้องเปลี่ยนสถานะระหว่างเปิดหน้าต่าง = ชุดเปลี่ยน = 409
     · กำหนดชำระใหม่แทนวันเดิม ⇒ ป้าย "เลยกำหนด" และด่านนัดช่าง (overdueUnconfirmed) อ่านวันใหม่ทันที — โมดัลบอกก่อนกด
   ⭐ body `{ action:'redate-billing', plan:[{ id, billingDate, dueDate }] }` = ตารางที่พรีวิวแสดง
   ⭐ ผู้มีสิทธิ์ = ด่าน `schedule` ทีละงวด (ฝ่ายขายที่แก้ใบได้ · ฝ่ายบัญชี — มติข้อ 4) · ล็อกทั้งใบชนะก่อน
   🔴 ไม่ใช่สิ่งที่ระบบทำเองตอนแก้รอบของลูกค้า — คนกดบนใบเดียว เห็นตาราง "เดิม → ใหม่" ครบก่อนยืนยันเสมอ
   ⚠️ เขียนทีละงวดด้วย `writeBillingFill` ตัวเดียวกับเติมตามรอบ (มีเงื่อนไข updatedAt) — หยุดกลางทาง = งวดที่เขียนแล้วลง audit
     แล้วตอบ 409 · กดซ้ำปลอดภัย (งวดที่จัดแล้วตรงรอบ `planRedate` ตัดทิ้งเอง) */
async function redateBillingDates({ user, supabase, req, id, body }) {
  /* สิทธิ์ก่อนโหลด (ท่าเดียวกับ replan/carry) — proxy ปล่อย PATCH ของ route นี้ให้ทุกคนที่ถือ payments:confirm ⇒ คนที่ไม่ได้อยู่ FN
     และแก้ใบไม่ได้ต้องได้ 403 ตั้งแต่ตรงนี้ ไม่ใช่ "ยังไม่ตั้งรอบวางบิล" / 409 จอเก่า ก่อนจะถูกด่านรายงวดตีกลับ
     (review รอบสอง 26/09 — ด่านรายงวดข้างล่างยังอยู่ นี่แค่ตอบเหตุจริงให้เร็ว) · ตัวตัดสินเดียวกับที่แผงใช้ซ่อนปุ่ม */
  if (!installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้กำหนดชำระ');
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    const billing = await loadCustomerBillingRule(supabase, order);
    if (billing.error) return fail(billing.error, billing.status);
    /* ⚠️ อ่านสดแบบโยน error — กลืนเป็น [] แล้วแผนถูกคิดจากงวดที่ไม่มีอยู่จริง */
    const live = await loadInstallments(supabase, order.id);
    const requestedIds = await loadBillingRequestedIds(supabase, live);
    const built = billingRedateCheck(billing.rule, live, body.plan, businessDate(), { requestedIds });
    if (built.error) return fail(built.error, built.status);

    const byId = new Map(live.map((row) => [row.id, row]));
    const orderLock = historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'schedule');
    for (const planned of built.rows) {
      /* ตัวเลือกชุดเดียวกับที่แผงส่งให้ `gate()` และกับ fill-billing */
      const gate = installmentActionError(byId.get(planned.id), 'schedule', user, {
        rows: live, orderTotal: order.totalAmount,
        serviceRounds: orderHasServiceRounds(order, order.lines),
        orderLock, historical: isHistoricalOrder(order),
        contractEnd: openingCoverageEnd(order, live),
        orderCancelled: order.status === 'cancelled' && !isHistoricalOrder(order),
      });
      if (gate) return badRequest(built.rows.length > 1 ? `งวดที่ ${planned.seq}: ${gate}` : gate);
    }

    const failMessage = (writeError) => installmentBillingSchemaError(writeError)
      || documentWorkflowError(writeError, { context: `installment redate-billing ${order.id}` }).message
      || writeError.message;
    let written;
    try {
      written = await writeBillingFill(supabase, live, billingRedateRows(built.rows));
    } catch (writeError) {
      const billingSchema = installmentBillingSchemaError(writeError);
      if (billingSchema) return fail(billingSchema, 503);
      const mapped = documentWorkflowError(writeError, { context: `installment redate-billing ${order.id}` });
      if (mapped.code) return fail(mapped.message, mapped.status);
      throw writeError;
    }
    const { before, after } = written;
    const stopped = written.stopped
      ? { seq: written.stopped.seq, message: written.stopped.error ? failMessage(written.stopped.error) : INSTALLMENT_STALE_MESSAGE }
      : null;
    if (!after.length) return fail(stopped?.message || INSTALLMENT_STALE_MESSAGE, 409);

    /* audit before/after ทุกงวดที่เขียนจริง + รอบที่ใช้คิด — ทางกู้ทางเดียวของระบบนี้ (ไม่มีถังขยะ) */
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order_installments',
      entityId: order.id,
      before: { installments: before },
      after: { installments: after, redate: 'billing-rule', billingRule: billing.rule },
      summary: `redate-billing ${after.length} งวด ของ ${order.orderNumber}`
        + (stopped ? ` (หยุดที่งวด ${stopped.seq})` : ''),
      request: req,
    });
    if (stopped) return fail(billingRedateStoppedMessage(after.length, stopped), 409);
    return ok({
      redated: after.length,
      installments: installmentsForScreen(order, await loadInstallments(supabase, order.id)),
    });
  } catch (redateError) {
    return fail(redateError.message, 500);
  }
}

/* ── เติมวันวางบิลตามรอบ เดือนละงวด (กำหนดวางบิล · mig 0389 · มติเจ้าของ 26/09 ข้อ 3 "เอา") ─────────────────
   ⭐ คำสั่งของ **ทั้งใบ** ⇒ PATCH ส่งมาที่นี่ก่อนด่าน `installmentId` (proxy ให้ FN ผ่านเฉพาะ PATCH ของ route นี้ ·
     มติข้อ 4 ให้ FN แก้วันงวดได้ ⇒ คำสั่งที่ FN กดได้ต้องอยู่ที่นี่ ไม่ใช่ sub-route ใหม่ที่ proxy ตัด 403)
   ⭐ body `{ action:'fill-billing', plan:[{ id, billingDate, dueDate }] }` = แผนที่พรีวิวแสดง ·
     server คิดชุดเองด้วย `planMonthlyFill` จากงวดสด + รอบสดของลูกค้า + วันนี้ (นาฬิกาไทย) — ไม่ตรงกับที่จอเห็น = 409
     (`billingFillCheck` · ห้ามเขียนชุดใหม่ทับไปเงียบ ๆ = ยืนยันวันที่คนกดไม่เคยเห็น)
   ⭐ ด่านเดียวกับ `schedule` ทีละงวด (installmentActionError · ตัวเดียวกับที่แผงใช้ซ่อนปุ่ม) — ล็อกทั้งใบชนะก่อน
   ⭐ เขียนเฉพาะ `billingDate` (+ `dueDate` ของงวดที่ยังไม่มี) — งวดที่มีกำหนดชำระแล้วคงวันเดิม (keptDue)
   🔴 ใบเก่าไม่ถูกเติมเอง (มติข้อ 10) — ทางนี้เกิดจากคนกดปุ่มบนใบเดียว เห็นพรีวิวครบก่อนยืนยันเสมอ
   ⚠️ เขียนทีละงวดแบบมีเงื่อนไข updatedAt ของแถวที่ด่านเพิ่งตัดสิน (ไม่มี RPC — ไม่ต้องมี migration เพิ่ม)
     ⇒ อีกหน้าต่างเขียนแทรกกลางทาง = หยุดที่งวดนั้น · งวดที่เขียนไปแล้วลง audit ครบ · กดใหม่เติมต่อเฉพาะงวดที่ยังว่าง
     (`installmentBillingFillable` ข้ามงวดที่มีวันวางบิลแล้ว) */
async function fillBillingDates({ user, supabase, req, id, body }) {
  /* สิทธิ์ก่อนโหลด — เหตุผลเดียวกับ redate-billing ข้างบน (403 ของจริง ไม่ใช่เหตุของแผน/รอบที่มาก่อนด่านรายงวด) */
  if (!installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้กำหนดชำระ');
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    const billing = await loadCustomerBillingRule(supabase, order);
    if (billing.error) return fail(billing.error, billing.status);
    /* ⚠️ อ่านสดแบบโยน error — กลืนเป็น [] แล้วแผนถูกคิดจากงวดที่ไม่มีอยู่จริง */
    const live = await loadInstallments(supabase, order.id);
    const built = billingFillCheck(billing.rule, live, body.plan, businessDate());
    if (built.error) return fail(built.error, built.status);

    const byId = new Map(live.map((row) => [row.id, row]));
    const orderLock = historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'schedule');
    for (const planned of built.rows) {
      /* ตัวเลือกชุดเดียวกับที่แผงส่งให้ `gate()` — ด่านของ schedule อ่านแค่ล็อกทั้งใบ · งวดยกมา · สิทธิ์ · สถานะ */
      const gate = installmentActionError(byId.get(planned.id), 'schedule', user, {
        rows: live, orderTotal: order.totalAmount,
        serviceRounds: orderHasServiceRounds(order, order.lines),
        orderLock, historical: isHistoricalOrder(order),
        contractEnd: openingCoverageEnd(order, live),
        orderCancelled: order.status === 'cancelled' && !isHistoricalOrder(order),
      });
      if (gate) return badRequest(built.rows.length > 1 ? `งวดที่ ${planned.seq}: ${gate}` : gate);
    }

    /* เขียนทีละงวด (writeBillingFill — มีเทสต์พฤติกรรมด้วยฐานปลอม) · พังตั้งแต่งวดแรก = ยังไม่มีอะไรลง ⇒ แปลแบบงวดเดียว */
    const failMessage = (writeError) => installmentBillingSchemaError(writeError)
      || documentWorkflowError(writeError, { context: `installment fill-billing ${order.id}` }).message
      || writeError.message;
    let written;
    try {
      written = await writeBillingFill(supabase, live, built.rows);
    } catch (writeError) {
      const billingSchema = installmentBillingSchemaError(writeError);
      if (billingSchema) return fail(billingSchema, 503);
      const mapped = documentWorkflowError(writeError, { context: `installment fill-billing ${order.id}` });
      if (mapped.code) return fail(mapped.message, mapped.status);
      throw writeError;
    }
    const { before, after } = written;
    const stopped = written.stopped
      ? { seq: written.stopped.seq, message: written.stopped.error ? failMessage(written.stopped.error) : INSTALLMENT_STALE_MESSAGE }
      : null;
    if (!after.length) return fail(stopped?.message || INSTALLMENT_STALE_MESSAGE, 409);

    /* audit before/after ทุกงวดที่เขียนจริง — ทางกู้ทางเดียวของระบบนี้ (ไม่มีถังขยะ) */
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order_installments',
      entityId: order.id,
      before: { installments: before },
      after: { installments: after, fill: 'billing-monthly' },
      summary: `fill-billing ${after.length} งวด ของ ${order.orderNumber}`
        + (stopped ? ` (หยุดที่งวด ${stopped.seq})` : ''),
      request: req,
    });
    if (stopped) return fail(billingFillStoppedMessage(after.length, stopped), 409);
    return ok({
      filled: after.length,
      installments: installmentsForScreen(order, await loadInstallments(supabase, order.id)),
    });
  } catch (fillError) {
    return fail(fillError.message, 500);
  }
}

/* ── ปรับแผนงวดของใบที่อนุมัติแล้ว (PR2 · mig 0377 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D1/D5) ─────────
   ⭐ คำสั่งของ **ทั้งใบ** ไม่ใช่งวดเดียว ⇒ PATCH ส่งมาที่นี่ก่อนด่าน `installmentId`
     · proxy ให้ FN ผ่านเฉพาะ PATCH ของ route นี้อยู่แล้ว — แต่ด่าน D1 (AE Sup/admin) ตัดก่อนแตะข้อมูล
   ⭐ ลำดับ: สิทธิ์ → ใบ (view-scope) → งวดสด (โยน error) → ด่านเดียวกับปุ่ม → เหตุผล → ข้อมูลเก่า → ชุดสุดท้ายจาก lib → RPC → audit
   ⭐ body `{ action:'replan', rows:[แถวเปิด {id|null,label,amount,dueDate,coversFrom,coversTo,note}], expected:[{id,updatedAt}], reason }`
     — บาทเสมอ (จอโหมด % แปลงด้วย buildReplanRows ตัวเดียวกันก่อนส่ง) · แถวล็อกยกมาจากฐานเอง ไม่เชื่อจอ
   🔴 ทางเขียนทางเดียวคือ RPC 0377 (ไม่แตะตัวใบ ⇒ Actual/เดือน Actual ไม่ขยับ) — ห้ามเขียนงวดทีละแถวที่นี่
   ⚠️ `body.expected` ส่งต่อให้ RPC ตามที่จอส่ง — RPC ตรวจซ้ำใต้ล็อก (ตัวที่นี่ตอบ 409 เร็วเท่านั้น) */
async function replanOrderInstallments({ user, supabase, req, id, body }) {
  if (!isSalesOrderReviewer(user?.role)) return forbidden();
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    /* ⚠️ อ่านสดแบบโยน error — กลืนเป็น [] แล้ว "ไม่มีงวดเปิด" ถูกอ่านเป็นแผนที่ต้องลบทุกงวด */
    const live = await loadInstallments(supabase, order.id);
    const gate = installmentReplanBlocker(order, live, user);
    if (gate.blocker) return fail(gate.blocker, 409);
    const reasonError = replanReasonError(body.reason);
    if (reasonError) return badRequest(reasonError);
    // ไม่ส่งแผนมา ≠ แผนที่ลบทุกงวดเปิด (อาเรย์ว่างเป็นคำขอที่ตั้งใจได้ — ใบที่งวดล็อกครบยอดแล้ว)
    if (!Array.isArray(body.rows)) return badRequest('ไม่ได้ส่งแผนงวดมา — โหลดหน้าใหม่แล้วลองอีกครั้ง');
    if (replanStale(live, body.expected)) return fail(REPLAN_STALE_MESSAGE, 409);
    const built = buildReplanRows(order, live, body.rows, {
      unit: 'amount', serviceRounds: orderHasServiceRounds(order, order.lines),
    });
    if (built.error) return badRequest(built.error);
    const reason = String(body.reason).trim();
    const result = await replanInstallments(supabase, {
      orderId: order.id, rows: built.rows, expected: body.expected, reason, user,
    });
    if (result.error) return fail(result.error, result.status);
    /* audit before/after ทุกแถว — ทางกู้ทางเดียวของระบบนี้ (ไม่มีถังขยะ) · งวดเปิดที่ถูกลบอยู่ใน before ครบ */
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order_installments',
      entityId: order.id,
      before: { installments: result.before },
      after: { installments: result.after, reason },
      summary: replanAuditSummary({
        orderNumber: order.orderNumber, beforeCount: result.before.length, afterCount: result.after.length, reason,
      }),
      request: req,
    });
    return ok({ installments: installmentsForScreen(order, await loadInstallments(supabase, order.id)) });
  } catch (replanError) {
    return fail(replanError.message, 500);
  }
}

/* ── ยกเงินค้างจากใบที่ยกเลิกเข้าใบนี้ (PR3 · mig 0378 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D4) ──────────
   ⭐ คำสั่งของ **ทั้งใบ** (ใบปลายทาง = ใบของ route นี้) ⇒ PATCH ส่งมาที่นี่ก่อนด่าน `installmentId`
     · proxy ให้ FN ผ่านเฉพาะ PATCH ของ `/sales-orders/[id]` และ `/installments` ⇒ คำสั่งที่ FN กดได้ต้องอยู่ที่นี่
   ⭐ ลำดับ: สิทธิ์ (AE Sup/admin/บัญชี) → ใบปลายทาง (view-scope) → ใบต้นทาง (ดีลเดียวกัน = scope เดียวกัน) → งวดสดทั้งสองใบ
     (โยน error) → ด่านเดียวกับปุ่ม → เหตุผล → ข้อมูลเก่า → ชุดสุดท้ายจาก lib → RPC → audit ทั้งสองใบ
   ⭐ body `{ action:'carry', sourceOrderId, installmentIds:[…], expected:[{id,updatedAt}], reason }` — แผนที่เหลือคิดที่นี่เอง
     (applyCarryIn · หักงวดเปิดแรก ๆ ก่อน) ไม่เชื่อแผนจากจอ · จอพรีวิวด้วยตัวเดียวกัน
   🔴 ทางเขียนทางเดียวคือ RPC 0378 (ไม่แตะตัวใบ ⇒ Actual ไม่ขยับ) — ห้ามย้ายแถวเองทีละแถวที่นี่ */
async function carryIntoOrder({ user, supabase, req, id, body }) {
  if (!canCarryInstallments(user)) return forbidden(CARRY_FORBIDDEN);
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    const sourceId = String(body.sourceOrderId || '').trim();
    const ids = Array.isArray(body.installmentIds)
      ? [...new Set(body.installmentIds.map((v) => String(v || '').trim()).filter(Boolean))]
      : [];
    if (!sourceId || !ids.length) return badRequest('เลือกใบที่ยกเลิกและงวดที่จะยกมาก่อน');
    /* ใบต้นทาง — โหลดพร้อมด่านขอบเขตการเห็นตามดีล (loadScoped · กฎ 6 ของ systemRules) · ไม่พบ = 404 · อ่านพลาด = 500
       ⚠️ ด่านดีลเดียวกัน (carrySourceError) มาก่อนแตะงวดของใบนั้น */
    const { row: source, response: sourceResponse } = await loadScoped(supabase, 'sales_orders', sourceId, user, 'view');
    if (sourceResponse) return sourceResponse;
    const sourceError = carrySourceError(order, source);
    if (sourceError) return fail(sourceError, 409);
    /* ⚠️ อ่านสดแบบโยน error ทั้งสองใบ — กลืนเป็น [] แล้วแผนที่เหลือถูกคิดจากงวดที่ไม่มีอยู่จริง */
    const live = await loadInstallments(supabase, order.id);
    const sourceRows = await loadInstallments(supabase, source.id);
    const gate = carryBlocker(order, live, user, carrySourcesFrom([source], sourceRows));
    if (gate.blocker) return fail(gate.blocker, 409);
    const reasonError = replanReasonError(body.reason);
    if (reasonError) return badRequest(reasonError);
    const carried = ids.map((rowId) => sourceRows.find((r) => r.id === rowId) || null);
    if (carried.some((r) => !r)) return fail('งวดที่เลือกไม่อยู่กับใบที่ยกเลิกแล้ว (อาจถูกยกไปก่อน) — โหลดหน้าใหม่', 409);
    if (carryStale(live, carried, body.expected)) return fail(CARRY_STALE_MESSAGE, 409);
    const built = applyCarryIn(order, live, carried);
    if (built.error) return badRequest(built.error);
    const reason = String(body.reason).trim();
    const result = await carryInstallments(supabase, {
      sourceId: source.id, targetId: order.id, ids, rows: built.rows, expected: body.expected, reason, user,
    });
    if (result.error) return fail(result.error, result.status);
    const summary = carryAuditSummary({
      fromNumber: source.orderNumber, toNumber: order.orderNumber, carried: result.carried, reason,
    });
    /* audit before/after ทั้งสองใบ — ทางกู้ทางเดียวของระบบนี้ (ไม่มีถังขยะ) · งวดเปิดที่ถูกหักจนหมดอยู่ใน before ครบ */
    await recordAudit({
      user, action: 'update', entityType: 'sales_order_installments', entityId: order.id,
      before: { installments: result.before }, after: { installments: result.after, carried: result.carried, reason },
      summary, request: req,
    });
    await recordAudit({
      user, action: 'update', entityType: 'sales_order_installments', entityId: source.id,
      before: { installments: carried }, after: { movedTo: order.id, carried: result.carried, reason },
      summary, request: req,
    });
    return ok({ installments: installmentsForScreen(order, await loadInstallments(supabase, order.id)) });
  } catch (carryError) {
    return fail(carryError.message, 500);
  }
}

/* PATCH — เดินสถานะของงวดเดียว (+ `replan` / `carry` / `fill-billing` / `redate-billing` ของทั้งใบ — ดูข้างบน)
   pending/rejected ──report──> reported ──confirm──> confirmed
                        ↑                    └─reject──> rejected
                        └────── withdraw ────┘
   ⭐ ด่านทั้งหมดอยู่ที่ `installmentActionError` ตัวเดียวกับที่หน้าเว็บใช้ซ่อน/จางปุ่ม
      ⇒ ปุ่มกับ API ขัดกันไม่ได้ */
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '').trim();
  if (action === 'replan') return replanOrderInstallments({ user, supabase, req, id, body });
  if (action === 'carry') return carryIntoOrder({ user, supabase, req, id, body });
  if (action === 'fill-billing') return fillBillingDates({ user, supabase, req, id, body });
  if (action === 'redate-billing') return redateBillingDates({ user, supabase, req, id, body });
  const installmentId = String(body.installmentId || '').trim();
  if (!installmentId) return badRequest('ไม่ได้ระบุงวดที่ต้องการ');

  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;

    const row = await loadInstallment(supabase, installmentId);
    if (!row || row.salesOrderId !== order.id) return notFound('ไม่พบงวดในใบสั่งขายนี้');
    /* ⭐ optimistic lock ชั้นแรก (PR0) — จอส่ง `updatedAt` ของแถวที่ **ตาเห็น** มา · ต่างจากแถวสด = คนกดตัดสินจาก
       ของเก่า ⇒ 409 ก่อนด่าน (ด่านข้างล่างตัดสินจากแถวสด ซึ่งคนกดไม่เคยเห็น) · ไม่ส่งมา = ข้ามชั้นนี้ */
    if (installmentStale(row, body.expectedUpdatedAt)) return fail(INSTALLMENT_STALE_MESSAGE, 409);

    const paidOn = body.paidOn || null;
    if (paidOn && !isDate(paidOn)) return badRequest('รูปแบบวันที่ชำระไม่ถูกต้อง');
    const reason = String(body.reason || '').trim();

    const billingRequestId = String(body.billingRequestId || '').trim();
    // ใบกำกับภาษีของงวด (mig 0348) — ด่านค่าอยู่ที่ `taxInvoiceActionError` (เรียกผ่าน gate ข้างล่าง)
    const taxInvoiceNo = String(body.taxInvoiceNo || '').trim();
    const taxInvoiceDate = String(body.taxInvoiceDate || '').trim();
    /* บันทึกคืนเงินของงวดใบที่ยกเลิก (PR3 · mig 0378) — ด่านค่าอยู่ที่ installmentActionError (refund) */
    const refundedOn = String(body.refundedOn || '').trim();
    const creditNoteNo = String(body.creditNoteNo || '').trim();
    /* งวดอื่นของใบเดียวกัน — ด่าน "ไล่ลำดับงวด" ต้องเห็นทั้งใบ ไม่ใช่แค่แถวที่กด
       (อ่านสดที่นี่ ไม่เชื่อค่าที่ client ส่งมา) */
    const siblings = await loadInstallments(supabase, order.id);
    /* ช่วงบริการที่งวดนี้ครอบ (mig 0320) — อ่านก่อนด่าน เพราะด่านต้องตรวจว่าช่วงกลับหัวไหม */
    const coversFrom = body.coversFrom || null;
    const coversTo = body.coversTo || null;
    /* ⚠️ ต้องส่ง `serviceRounds` เสมอ — ด่านรับรองงวดใช้ตัดสินว่าต้องมีช่วงครอบก่อนไหม
       (ไม่ส่ง = ไม่บล็อก ⇒ ใบบริการรับรองได้ทั้งที่ช่วงครอบว่าง ซึ่งคือกับดักเดิม)
       ⭐ ใบย้อนหลัง (0374) — สองตัวต้องส่งคู่กันเสมอ (ตัวเดียวกับที่แผงงวดบนจอส่ง ⇒ ปุ่มกับ API ตอบคำเดียวกัน):
         · `orderLock` — ใบที่ยังไม่อนุมัติ/ยกเลิกแล้ว งวดขยับไม่ได้ทั้งใบ (PATCH นี้ไม่ตรวจสถานะใบเองเลย ·
           งวดร่างของใบย้อนหลังยังไม่หยุดยอด ⇒ ถ้าไม่ล็อก ฝ่ายขายแจ้งชำระ/ตั้งวันได้ก่อน AE Sup อนุมัติ)
         · `historical` — งวดยกมาตั้งวันครบกำหนด/ถอนไม่ได้ · ช่วงครอบแก้ได้เฉพาะฝ่ายบัญชี (ไม่งั้นชน CHECK
           sales_order_installments_opening_shape เป็น 500 ดิบ หรือทำลายช่วงบริการต่อเนื่องที่ AE Sup รับรองไว้)
         · `contractEnd` — ปลายช่วงที่งวดยกมาครอบได้ · **คิดด้วย `openingCoverageEnd` ตัวเดียวกับที่แผงงวด
           บนใบเรียก** ด้วยสัญญาที่ `loadOrderForUser` โหลดมาให้ ⇒ ปุ่มกับ API กั้นด้วยวันเดียวกันเสมอ
           (ด่านไม่มีทางถอยของตัวเองแล้ว — ไม่ส่งค่านี้ = ไม่กั้นเลย)
       ⭐ **ใบ pipeline (PR0)** — `orderLock` ต่อด้วย `pipelineInstallmentLock(order, action)` (รายคำสั่ง):
         ใบยกเลิกเหลือทางของบัญชี + ดึงกลับ · ใบที่ถูกออก Rev. ทับบล็อกทุกคำสั่ง · สถานะอื่นไม่ล็อก (มติ D3)
         🐞 SO-26080039-0: PATCH นี้เคยไม่ดูสถานะใบ pipeline เลย ⇒ เงินก้อนเดียวถูกรับรองบนสองใบ
       🛡️ ใบย้อนหลังที่ยกเลิก: ฐานกันซ้ำอีกชั้น (trigger sales_order_installments_historical_cancelled_guard · mig 0387 · มติ 24/09)
         — `order` ข้างบนอ่านก่อนเขียน ถ้าผู้จัดการยกเลิกใบแทรกกลางทาง ล็อกนี้ไม่เห็น ฐานตอบ historical_so_installment_order_cancelled
         (409 ไทย ผ่าน documentWorkflowError ตอนเขียนข้างล่าง) แทนที่จะปล่อยงวดที่มีเงินค้างบนใบที่ยกเลิกโดยไม่มีทางออก */
    const gate = installmentActionError(row, action, user, {
      paidOn, reason, billingRequestId, coversFrom, coversTo,
      taxInvoiceNo, taxInvoiceDate,
      rows: siblings, orderTotal: order.totalAmount,
      serviceRounds: orderHasServiceRounds(order, order.lines),
      orderLock: historicalInstallmentLock(order) || pipelineInstallmentLock(order, action),
      historical: isHistoricalOrder(order),
      contractEnd: openingCoverageEnd(order, siblings),
      /* ⭐ PR3: คืนเงินได้เฉพาะงวดของใบ pipeline ที่ยกเลิก — แผงงวดส่งค่าเดียวกันจากใบเดียวกัน */
      orderCancelled: order.status === 'cancelled' && !isHistoricalOrder(order),
      refundedOn, creditNoteNo,
    });
    if (gate) return badRequest(gate);

    const now = new Date().toISOString();
    const actorName = user.name || user.email || null;
    let patch = null;

    if (action === 'schedule') {
      const dueDate = body.dueDate || null;
      if (dueDate && !isDate(dueDate)) return badRequest('รูปแบบกำหนดชำระไม่ถูกต้อง');
      patch = { dueDate };
      /* ⭐ วันวางบิล / รอเหตุการณ์ของงวด (กำหนดวางบิล · mig 0389 · ม็อก C "กำหนดวันงวด")
         **แตะเฉพาะเมื่อจอส่งคีย์มา** — โมดัลแบบเดิม (ลูกค้าที่ยังไม่ตั้งรอบ · แท็บเก่าก่อน deploy) ส่งแค่ `dueDate`
         ⇒ ไม่ส่ง = คงวันวางบิล/เหตุการณ์เดิมไว้ (ไม่ใช่ล้าง) · ส่ง `null` = ล้างตั้งใจ ("ล้างที่เลือก" ของตัวเลือกรอบ)
         ⭐ ตรวจรูปด้วย `normalizeInstallmentBilling` ตัวเดียวกับตัวเลือกบนจอ (วันหรือเหตุการณ์อย่างเดียว · ปี 2000–2100 ·
           ชื่อเหตุการณ์ ≤120) — ไม่ปล่อยให้ CHECK ของ 0389 เด้งเป็น 500 ภาษาอังกฤษ
         ⚠️ งวดยกมาไม่มีวันวางบิล (มติข้อ 10 · CHECK ของ 0389) — ด่านของใบย้อนหลังตีกลับ `schedule` ของงวดยกมาก่อนถึงนี่แล้ว
           ข้อนี้กันอีกชั้นเผื่อแถวทรงยกมาที่หลุดมาทางอื่น (ห้ามปล่อยถึงฐาน)
         ⚠️ "เลยรอบวางบิล" ไม่แตะด่านเงินใด ๆ — ด่านช่าง/ป้ายแดงอ่าน `dueDate` ช่องเดียวเหมือนเดิม */
      if (Object.hasOwn(body, 'billingDate') || Object.hasOwn(body, 'billingEvent')) {
        if (isOpeningInstallment(row)) return badRequest(`${OPENING_INSTALLMENT_LABEL}ไม่มีวันวางบิล — เงินเก็บไปแล้วก่อนเข้าระบบ`);
        const billing = normalizeInstallmentBilling({
          billingDate: body.billingDate ?? null, billingEvent: body.billingEvent ?? null,
        });
        if (billing.error) return badRequest(billing.error);
        patch = { ...patch, ...billing.value };
      }
    } else if (action === 'coverage') {
      /* ⭐ ช่วงบริการที่งวดนี้จ่ายค่าให้ (mig 0320 · มติผู้ใช้ 2026-08-30 "จ่ายก่อนบริการเสมอ")
         max(coversTo) ของงวดที่ confirmed = ค่า "จ่ายถึง" ที่ด่านเข้าไซต์ใช้ตัดสิน
         ⚠️ ล้างช่องได้ (ส่ง null ทั้งคู่) — ใบที่ไม่ใช่สายบริการไม่ควรถูกบังคับให้มีค่าค้าง */
      if (coversFrom && !isDate(coversFrom)) return badRequest('รูปแบบวันเริ่มช่วงครอบไม่ถูกต้อง');
      if (coversTo && !isDate(coversTo)) return badRequest('รูปแบบวันสิ้นสุดช่วงครอบไม่ถูกต้อง');
      patch = { coversFrom, coversTo };
    } else if (action === 'report') {
      // หลักฐานผ่าน sanitize ตัวเดียวกับหลักฐาน Won — รับเฉพาะ ref ที่อัปผ่าน /api/upload แล้ว
      const evidence = sanitizeEvidenceAttachments(body.evidence);
      if (!evidence.length) return badRequest('ต้องแนบหลักฐานการชำระอย่างน้อย 1 ไฟล์');
      /* ⭐ ปลายทางขึ้นกับว่าใครกด (มติผู้ใช้ 2026-08-18 — ทางเลือก ก.)
         ฝ่ายขายแจ้ง → `reported` เข้าคิวบัญชี · **บัญชีแจ้งเอง → `confirmed` เลย**
         ⇒ คิว `reported` เหลือเฉพาะของที่ฝ่ายขายแจ้ง = บัญชีรู้ทันทีว่าอันไหนต้องมาตรวจ
         ⚠️ เก็บ `reportedBy*` ไว้ด้วยแม้บัญชีจะกดเอง — ต้องรู้ว่าใครเป็นคนบันทึก
         ไม่ใช่เห็นแต่ชื่อผู้รับรองแล้วเดาว่าหลักฐานมาจากไหน

         ⭐ **งวดร่างจอดที่ `pending`** (มติผู้ใช้ 2026-08-19) — วันจ่ายและสลิปถูกเก็บ
         ครบเหมือนกัน ต่างแค่ยังไม่เข้าคิวบัญชี เพราะงานถึงบัญชีต่อเมื่อ AE Supervisor
         อนุมัติใบแล้วเท่านั้น · `freezeInstallments` เลื่อนให้เป็น `reported` ตอนอนุมัติ
         ⇒ ไม่มีใครต้องถือสลิปไว้เองอีก และกติกาของบัญชีไม่ถูกแตะ */
      const outcome = installmentReportOutcome(user, row);
      /* 🐞 **UAT 2026-09-01: ช่วงครอบที่ส่งมากับการแจ้งชำระเคยหายเงียบ** — ด่านยอมให้ผ่าน
         เพราะเห็นค่าใน payload แต่ patch ไม่เคยเก็บมันลงแถว ⇒ งวดกลายเป็น `confirmed`
         โดย `coversFrom/To` ยังว่าง = "จ่ายถึง" ไม่ขยับ ซึ่งเป็นอาการเดียวกับกับดักที่
         ด่านนี้เกิดมาปิดพอดี · บัญชีที่แจ้งเองจบในก้าวเดียว จึงไม่มีจังหวะไหนให้กรอกอีก
         ⚠️ รับเฉพาะตอนส่งมาจริง — ไม่ส่ง = ไม่แตะค่าเดิม (ฝ่ายขายอาจกรอกไว้ก่อนแล้ว) */
      if (coversFrom && !isDate(coversFrom)) return badRequest('รูปแบบวันเริ่มช่วงครอบไม่ถูกต้อง');
      if (coversTo && !isDate(coversTo)) return badRequest('รูปแบบวันสิ้นสุดช่วงครอบไม่ถูกต้อง');
      patch = {
        status: outcome,
        paidOn,
        evidence,
        ...(coversFrom || coversTo ? { coversFrom, coversTo } : {}),
        reportedById: user.id,
        reportedByName: actorName,
        reportedAt: now,
        ...(outcome === 'confirmed'
          ? { confirmedById: user.id, confirmedByName: actorName, confirmedAt: now }
          : {}),
        // เคลียร์ร่องรอยการตีกลับรอบก่อน — งวดนี้กลับเข้าคิวตรวจใหม่แล้ว
        rejectedById: null, rejectedByName: null, rejectedAt: null, rejectedReason: null,
      };
    } else if (action === 'withdraw') {
      patch = {
        status: 'pending',
        reportedById: null, reportedByName: null, reportedAt: null, paidOn: null, evidence: [],
      };
    } else if (action === 'confirm') {
      patch = {
        status: 'confirmed',
        confirmedById: user.id, confirmedByName: actorName, confirmedAt: now,
      };
    } else if (action === 'reject') {
      patch = {
        status: 'rejected',
        rejectedById: user.id, rejectedByName: actorName, rejectedAt: now, rejectedReason: reason,
      };
    } else if (action === 'unconfirm') {
      /* ถอนคำรับรองของบัญชี (มติผู้ใช้ 2026-08-13)
         ⭐ กลับไป `reported` ไม่ใช่ `pending` — คำแจ้งของฝ่ายขายและหลักฐานยังอยู่ครบ
         สิ่งที่ถูกถอนคือคำรับรองของบัญชี งวดจึงกลับไปอยู่ในคิวตรวจของบัญชีเอง
         ⚠️ CHECK ของ mig 0245 ยังผ่าน: `reported` ต้องมี `reportedAt` ซึ่งไม่ถูกแตะ
         ⇒ **ไม่ต้องมี migration ใหม่**
         ⚠️ เหตุผลลง `note` ให้เห็นบนการ์ด — audit เก็บอีกชั้นพร้อม before/after */
      patch = {
        status: 'reported',
        confirmedById: null, confirmedByName: null, confirmedAt: null,
        note: `ถอนคำรับรอง (${actorName || 'บัญชี'}): ${reason}`,
      };
    } else if (action === 'unlink') {
      patch = { billingRequestId: null };
    } else if (action === 'link') {
      /* ── ผูกงวดเข้ากับคำร้องขอเอกสารการเงิน (B-5) ────────────────────────
         ⚠️ ตรวจจาก **แถวจริงของคำร้อง** ไม่ใช่เชื่อ id ที่ส่งมา — สามข้อนี้ถ้าไม่ตรวจ
         จะได้ใบวางบิลของลูกค้าอีกรายไปแขวนบนงวดนี้โดยไม่มีอะไรทัก */
      const { data: request, error: reqError } = await supabase
        .from('dept_requests')
        .select('id, kind, "docNo", "quotationId"')
        .eq('id', billingRequestId).maybeSingle();
      if (reqError) return fail(reqError.message, 500);
      if (!request) return badRequest('ไม่พบคำร้องที่เลือก');
      if (request.kind !== 'billing_doc') return badRequest('ผูกได้เฉพาะคำร้องขอเอกสารการเงิน');
      /* ⭐ **ต้องเป็นคำร้องของใบเสนอราคาเดียวกับใบสั่งขายนี้** — ทั้งสองฝั่งยึด QT
         เป็นต้นทางอยู่แล้ว (ม-ค) ⇒ นี่คือเส้นเดียวที่พิสูจน์ได้ว่าเป็นงานเดียวกัน
         ⚠️ ใบสั่งขายที่ไม่ได้มาจาก QT ผูกไม่ได้ — บอกให้ตรงว่าเพราะอะไร */
      if (!order.quotationId) {
        return badRequest('ใบสั่งขายนี้ไม่ได้อ้างใบเสนอราคา — ผูกคำร้องขอเอกสารการเงินไม่ได้');
      }
      if (request.quotationId !== order.quotationId) {
        return badRequest('คำร้องนี้เป็นของใบเสนอราคาคนละใบกับใบสั่งขายนี้');
      }
      /* ⚠️ คำร้องใบเดียวแขวนได้งวดเดียว — ของจริงหนึ่งคำร้องคือการวางบิลหนึ่งรอบ
         (ยอดอยู่ที่ใบคำร้อง ไม่ใช่รายบรรทัด · ดู 0257) ⇒ แขวนสองงวดแปลว่ายอดถูก
         นับซ้ำตอนตอบว่า "งวดนี้ขอเอกสารไปหรือยัง" */
      const { data: taken, error: takenError } = await supabase
        .from('sales_order_installments')
        .select('id, seq').eq('billingRequestId', request.id).neq('id', installmentId);
      if (takenError) return fail(takenError.message, 500);
      if (taken?.length) {
        return badRequest(`คำร้อง ${request.docNo || ''} ถูกผูกกับงวดที่ ${taken[0].seq} ไปแล้ว`);
      }
      patch = { billingRequestId: request.id };
    } else if (action === 'tax-invoice') {
      /* ── บันทึกใบกำกับภาษีของงวดนี้ (mig 0348 · มติผู้ใช้ 2026-09-07) ───────
         โปรเซสหลัก: FN ออกใบแล้วมาบันทึกที่นี่ **ไม่ต้องมีคำร้อง** · ถ้างวดนี้ผูก
         คำร้องไว้อยู่แล้ว (ลูกค้าขอไฟล์ก่อน) เลขจะถูกเขียนลงบรรทัดคำร้องด้วย
         ⇒ เลขมีบ้านเดียวเสมอ ไม่มีสองที่ที่ไม่ตรงกัน
         ⚠️ กันเลขซ้ำที่นี่ ไม่ใช่ที่ UNIQUE ของ DB (ดูเหตุผลใน lib/sales/taxInvoice.js) */
      const conflict = await taxInvoiceConflict(supabase, { installmentId, no: taxInvoiceNo });
      if (conflict) return badRequest(conflict);
      /* ⚠️ **ต้องส่ง options ให้ sanitize** — ต่างจากที่เรียกเปล่าตอน `report`
         ไม่ส่ง = รับ ref ที่ชี้ไฟล์ไหนก็ได้ใน bucket มาเป็นใบกำกับของงวดนี้ */
      const file = sanitizeEvidenceAttachments(
        body.taxInvoiceFile ? [body.taxInvoiceFile] : [],
        {
          allowedStorageBucket: PRIVATE_EVIDENCE_BUCKET,
          allowedStoragePathPrefix: privateEvidencePrefix('sales_order_tax_invoice', order.id),
        },
      )[0]
        /* ⚠️ ไม่ส่งไฟล์มา = **เก็บไฟล์เดิมไว้** ไม่ใช่ล้าง — จอไม่เคยได้ ref ของไฟล์เดิม
           (ทะเบียนส่งมาแค่ชื่อไฟล์) ⇒ ถ้าล้างตามที่ payload ว่างมา การแก้แค่เลขจะลบ
           ไฟล์ใบกำกับทิ้งเงียบ ๆ · ทางลบคือ action `tax-invoice-clear` */
        || row.taxInvoiceFile || null;
      const linkedItem = await findLinkedTaxInvoiceItem(supabase, row.billingRequestId);
      patch = taxInvoicePatch({
        no: taxInvoiceNo, date: taxInvoiceDate, file,
        requestId: linkedItem ? row.billingRequestId : null,
        itemId: linkedItem?.id || null,
        user, now,
      });
    } else if (action === 'tax-invoice-clear') {
      /* ล้างของที่แนบผิดใบ — ร่องรอยอยู่ที่ audit (before/after ทั้งแถว)
         ⚠️ ล้างสำเนาบนบรรทัดคำร้องด้วย ไม่งั้นเลขที่ถอนแล้วยังค้างให้ผู้ขอเห็น */
      patch = taxInvoiceClearPatch();
    } else if (action === 'refund') {
      /* ── บัญชีบันทึกคืนเงินเต็มจำนวน (PR3 · mig 0378 · มติ D4) — ทางออกที่สองของเงินค้างจากใบที่ยกเลิก
         ⭐ สถานะคง `confirmed` (เงินเคยเข้าจริง) · CHECK refund_shape บังคับ: confirmed · วันคืน · เหตุผล ≥ 10 ·
           มีใบกำกับต้องมีเลขใบลดหนี้ · ระหว่างที่คืนแล้วถอนคำรับรอง/ยกไปใบใหม่ไม่ได้ */
      patch = {
        refundedAt: now, refundedOn, refundedById: user.id, refundedByName: actorName,
        refundReason: reason, refundCreditNoteNo: creditNoteNo || null,
      };
    } else if (action === 'refund-clear') {
      /* ถอนการบันทึกคืนเงิน (บันทึกผิดงวด/ผิดยอด) — ล้างครบทุกช่อง (CHECK ห้ามเหลือเศษ) · ร่องรอยอยู่ที่ audit */
      patch = {
        refundedAt: null, refundedOn: null, refundedById: null, refundedByName: null,
        refundReason: null, refundCreditNoteNo: null,
      };
    }

    /* CHECK ของงวด (0245 · 0320 · 0374) ที่หลุดด่านข้างบนมา — แปลเป็นไทยผ่านตารางกลาง แทน 500 ภาษาอังกฤษของ Postgres
       ⚠️ รหัสที่ตารางไม่รู้จักโยนต่อให้ catch ท้ายเราต์ตามเดิม (พฤติกรรมเดิมของ error อื่น)
       ⭐ optimistic lock ชั้นสอง (PR0) — เขียนเฉพาะเมื่อแถวยังเป็นรุ่นที่ด่านข้างบนเพิ่งตัดสิน (`row.updatedAt`)
         ⇒ อีกหน้าต่างเขียนแทรกระหว่างด่านกับการเขียน = ไม่มีแถวโดน = 409 (ไม่ลง audit · ไม่ยิงกระดิ่ง) */
    let updated;
    try {
      updated = await updateInstallment(supabase, installmentId, patch, { expectedUpdatedAt: row.updatedAt });
    } catch (writeError) {
      /* ฐานยังไม่ได้รัน 0389 (ไม่มีคอลัมน์วันวางบิล) — ถามก่อนตัวของ 0378 ซึ่งเหมารหัสเดียวกันทุกคอลัมน์ */
      const billingSchema = installmentBillingSchemaError(writeError);
      if (billingSchema) return fail(billingSchema, 503);
      /* ฐานยังไม่ได้รัน 0378 (ไม่มีคอลัมน์คืนเงิน) — บอกให้รันมิก ไม่ใช่ 500 ดิบ */
      const refundSchema = installmentRefundSchemaError(writeError);
      if (refundSchema) return fail(refundSchema, 503);
      const mapped = documentWorkflowError(writeError, { context: `installment ${action} ${installmentId}` });
      if (mapped.code) return fail(mapped.message, mapped.status);
      throw writeError;
    }
    if (!updated) return fail(INSTALLMENT_STALE_MESSAGE, 409);
    /* สำเนาบนบรรทัดคำร้อง — เขียน **หลัง** ของหลักสำเร็จเสมอ และล้มเงียบได้
       (ของหลักเก็บแล้ว ถ้าโยน error ที่นี่ ผู้ใช้จะเห็น "บันทึกไม่สำเร็จ" ทั้งที่เก็บแล้ว) */
    if (action === 'tax-invoice' && patch.taxInvoiceItemId) {
      await mirrorTaxInvoiceToRequestItem(supabase, {
        itemId: patch.taxInvoiceItemId, no: patch.taxInvoiceNo,
      });
    }
    if (action === 'tax-invoice-clear' && row.taxInvoiceItemId) {
      await mirrorTaxInvoiceToRequestItem(supabase, { itemId: row.taxInvoiceItemId, no: null });
    }
    await recordAudit({
      user,
      action: 'update',
      entityType: 'sales_order_installments',
      entityId: installmentId,
      before: row,
      after: updated,
      summary: `${action} งวด ${row.seq} ของ ${order.orderNumber}`,
      request: req,
    });
    /* ── กระดิ่งแจ้งฝ่ายขาย (มติผู้ใช้ 2026-09-09) ─────────────────────────
       ⭐ ยิงที่นี่จุดเดียวพอ — ทั้งทะเบียนของบัญชีและการ์ดงวดบนใบ SO ลง PATCH ตัวนี้
       ตัวเดียวกัน (`/api/finance/payments` มีแต่ GET)
       ⚠️ **ไม่ await และห้ามให้ throw หลุด** — `catch` ท้ายเราต์จะเปลี่ยนการบันทึกที่
       สำเร็จไปแล้วให้เป็น 500 แล้ว FN เห็น "บันทึกไม่สำเร็จ" ทั้งที่เก็บแล้ว
       (กติกาเดียวกับ mirror ข้างบน) */
    if (action === 'tax-invoice' || action === 'tax-invoice-clear') {
      notifyTaxInvoice(supabase, {
        order,
        // ถอนใบแล้วแถวไม่มีเลขอีก ⇒ ข้อความรอบถอนอ่านจากแถว **ก่อน** แก้
        installment: action === 'tax-invoice' ? updated : row,
        actor: user,
        cleared: action === 'tax-invoice-clear',
      });
    }
    return ok({
      installment: updated,
      installments: installmentsForScreen(order, await loadInstallments(supabase, order.id)),
    });
  } catch (patchError) {
    return fail(patchError.message, 500);
  }
});
