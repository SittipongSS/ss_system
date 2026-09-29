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
  INSTALLMENT_STALE_MESSAGE, installmentActionError, installmentReportOutcome,
  installmentScheduleAllowed, installmentStale, installmentStartBlock, openingCoverageEnd, pipelineInstallmentLock,
  withLiveAmounts,
} from '@/lib/sales/salesOrderPayments';
import {
  carryInstallments, ensureInstallments, installmentBillingSchemaError,
  installmentRefundSchemaError, loadInstallment, loadInstallments, replanInstallments, updateInstallment,
  writeCoverageFill,
} from '@/lib/sales/salesOrderInstallmentsStore';
import { COVERAGE_SPLIT_ERRORS, splitCoverageByPeriod } from '@/lib/sales/paymentCoverage';
import { servicePeriodOf, serviceSetupEditError, serviceSetupFlow } from '@/lib/sales/serviceSetup';
import { normalizeInstallmentBilling, validateInstallmentDates } from '@/lib/sales/billingRule';
import { BILLING_V4_SCHEMA_MISSING, billingV4SchemaError } from '@/lib/sales/billingPolicySchema';
import {
  SCHEDULE_MANY_ROW_STALE, billingFlagShapeError, coveragePlanStale, installmentsAfterWrite, rowSkipped,
  scheduleExceptionSummary, scheduleExceptionText, scheduleExceptionsOf, scheduleManyCheck, scheduleManyShapeError,
  scheduleManyStoppedMessage, writeScheduleMany,
} from '@/lib/sales/installmentScheduleMany';
import { billingSkipReady, loadBillingRequestedIds, loadScheduleRule } from '@/lib/sales/installmentScheduleServer';
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
  /* ใบ `*` = พก "serviceTermsOpenedAt" ให้ตัวตัดสินด่านเงิน (mig 0392 · D13) */
  const { data: order, error } = await supabase
    .from('sales_orders')
    /* money-decider feed */
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
     ⚠️ ไม่ลากราคามาทั้งแถว — เอาแค่ช่องที่ตัวตัดสินอ่าน:
       · `fgCode` + `"serviceFgCode"` = รหัสที่ด่านเงินอ่าน (`effectiveServiceFgCode` · mig 0392 · D13 — แพ็คเกจที่ฝ่ายขาย
         เลือกให้บรรทัดพิมพ์เองนับเมื่อใบประทับแล้วเท่านั้น) · ยาม serviceMoneySelectGuard.test.mjs
       · `"productId"` · `"serviceKind"` · หมวดของบรรทัดพิมพ์เอง = ชนิดของบรรทัด (`serviceLineRole`) ที่ปุ่ม
         "แบ่งช่วงครอบตามช่วงบริการ…" ถามว่าใบต้องตั้งงานบริการย้อนหลังไหม (D25) — หมวดอ่านแค่คีย์เดียวของ metadata */
  const { data: lines, error: lineError } = await supabase
    /* money-decider feed */
    .from('sales_order_lines').select('id, fgCode, "productId", "serviceKind", "serviceFgCode", categoryCode:metadata->>categoryCode').eq('salesOrderId', order.id);
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

/* คำสั่ง "เติมตามรอบ" / "จัดวันใหม่ตามรอบ" ของทั้งใบ (fill-billing · redate-billing) — **ถอดแล้ว** (รุ่นสี่ · system-design §7.5)
   ⭐ ไม่ port: ตัวคิดของสองคำสั่งนี้เป็นรอบรายเดือนรุ่นสอง คิดวันวางบิลฝั่ง server เอง และข้ามด่าน "ไม่ต้องวางบิล"
     (ลูกค้าไม่ต้องวางบิลจะได้วันวางบิลปลอม) · งานของมันย้ายไปแผง "เติมวันงวดที่ว่าง…" ของโหมดตั้งวัน (ร่างบนจอ → schedule-many)
     และจอ "งวดที่วันจะเปลี่ยน" ของกติกาลูกค้า (`/api/customers/[id]/billing-rule/redate`)
   ⚠️ แท็บเก่าที่ยังเปิดค้างได้ 410 พร้อมคำบอกให้โหลดใหม่ — ไม่ใช่ 400 "ไม่ได้ระบุงวด" ที่ชี้ทางผิด */
const RETIRED_BILLING_ACTIONS = Object.freeze(['fill-billing', 'redate-billing']);
const RETIRED_BILLING_MESSAGE = 'คำสั่งนี้เลิกใช้แล้ว — โหลดหน้าใหม่';

/* ── ตั้งวันงวดทีละหลายงวด (แผงงวดแบบ C "โหมดตั้งวัน" · มติเจ้าของ 28/09) ─────────────────────────────────────
   คนร่างวันในตาราง (แตะเซลล์วันวางบิล/กำหนดชำระ · "เติมวันงวดที่ว่าง…") แล้วกด "บันทึก N งวด" ครั้งเดียว — คำขอเดียวพาทุกงวดที่เปลี่ยน
   ⭐ body `{ action:'schedule-many', rows:[{ id, billingDate, billingEvent, dueDate, updatedAt }] }` (≤ SCHEDULE_MANY_MAX)
     = สภาพที่คนเห็นในตารางตอนกด · `null` = ล้างตั้งใจ ("ล้างวัน") · วันวางบิล/รอเหตุการณ์เป็นคู่ (ส่งตัวหนึ่ง = อีกตัวว่าง ·
     กติกาเดียวกับ `schedule`) · ไม่ส่ง dueDate = คงเดิม · งวดที่ค่าตรงฐานแล้วถูกข้ามก่อนทุกด่าน (ส่งทั้งตารางได้ · ไม่ 409 เพราะงวดที่ไม่ได้แก้)
   ⭐ server **ไม่คิดวันเอง** (วันมาจากคนเลือก · เก็บกำหนดชำระตามที่ส่ง) ⇒ ด่านคือ "งวดที่คนเห็นยังเป็นรุ่นเดิมไหม"
     (`updatedAt` ทีละงวด) · ตัวตรวจ/ตัวเขียน/ล็อกของโหมดอยู่ที่ lib/sales/installmentScheduleMany.js (มีเทสต์ · จอถาม `installmentDateLock` ตัวเดียวกันนี้ผ่าน `dateLockView` ของ installmentDateDrafts.js)
   ⭐ รุ่นสี่ (mig 0393 · system-design §7.3): แถวรับ `billingSkip` (ติ๊ก "งวดนี้ไม่ต้องวางบิล") + `billingException` (ยืนยัน
     "งวดนี้ต้องวางบิล…") เพิ่ม · อ่านกติกาของลูกค้าของใบ **ครั้งเดียวต่อคำขอ** แล้วทุกงวดที่เปลี่ยนผ่าน `validateInstallmentDates`
     · อ่านกติกาพลาด = `ruleUnavailable` — ตีกลับเฉพาะงวดที่เปลี่ยนวันวางบิล/ติ๊ก (กำหนดชำระยังบันทึกได้ · ไม่ 500 ทั้งคำขอ)
     · ติ๊กเปลี่ยนก่อนรัน 0393 = 503 "รอรัน migration 0393" (`billingSkipReadyOf` จากงวดสดที่อ่านด้วย select *)
     · ข้อยกเว้นลงประวัติในสรุป audit ก้อนเดียวกัน ("งวดที่ 2 ยกเว้น: งวดนี้ต้องวางบิล โดย …")
   ⭐ ลำดับ: สิทธิ์ (ก่อนโหลด) → รูปคำขอ → ใบ (view-scope) → งวดสด + คำร้องสด (โยน error) → ล็อกทั้งใบ →
     ตรวจ **ทุกงวดก่อนเขียนงวดแรก** (ไม่อยู่ในใบ/รุ่นเก่า/ล็อกโหมดตั้งวัน = 409 พร้อมรายชื่องวด · ด่าน schedule + ค่าวัน = 400 บอกเลขงวด)
     → เขียนทีละงวดแบบมีเงื่อนไข updatedAt → audit ก้อนเดียว (before/after ทุกงวดที่เขียนจริง) → งวดสดกลับไปให้จอ
   ⭐ ผู้มีสิทธิ์ = ด่าน `schedule` (ฝ่ายขายที่แก้ใบได้ · ฝ่ายบัญชี — มติ 26/09 ข้อ 4) · proxy ให้ FN ผ่านเฉพาะ PATCH ของ route นี้
     ⇒ คำสั่งของทั้งใบต้องอยู่ที่นี่ (ก่อนด่าน installmentId) ไม่ใช่ sub-route ใหม่
   ⚠️ ไม่มี RPC ⇒ ไม่มีทรานแซกชัน — อีกหน้าต่างเขียนแทรกกลางทาง = หยุดที่งวดนั้น · งวดที่ลงแล้วคงอยู่และลง audit ก่อนตอบ 409
     "บันทึกแล้ว n งวด หยุดที่งวด k — …" · กดซ้ำปลอดภัย (งวดที่ค่าตรงแล้วถูกข้าม ไม่เขียนซ้ำ)
   ⚠️ 409 พก `conflicts` ([{ id, seq, reason }] = งวดที่เปลี่ยนใต้มือ) + `installments` (งวดสด) — จอรวมร่างที่ยังใช้ได้เข้ากับงวดสด
     โดยไม่ต้องยิง GET ซ้ำ · ท่าเดียวกับ `ok({ error, ...payload }, status)` ของ service/legacy-sites */
async function scheduleManyDates({ user, supabase, req, id, body }) {
  /* สิทธิ์ก่อนโหลด — เหตุผลเดียวกับ redate-billing (คนที่ผ่าน proxy ด้วย payments:confirm แต่ไม่ใช่ FN ต้องได้ 403 ของจริง) */
  if (!installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้กำหนดชำระ');
  const shapeError = scheduleManyShapeError(body.rows);
  if (shapeError) return badRequest(shapeError);
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    /* ⚠️ อ่านสดแบบโยน error ทั้งคู่ — กลืนเป็น [] แล้วทุกงวดกลายเป็น "ไม่อยู่ในใบ" · คำร้องอ่านพลาด ≠ ยังไม่ขอ */
    const live = await loadInstallments(supabase, order.id);
    const requestedIds = await loadBillingRequestedIds(supabase, live);
    /* ล็อกทั้งใบชนะก่อน — ตอบครั้งเดียวไม่ต้องไล่บอกทีละงวด (จอไม่เปิดโหมดตั้งวันบนใบที่ล็อกอยู่แล้ว) */
    const orderLock = historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'schedule');
    if (orderLock) return badRequest(orderLock);
    /* กติกาวางบิลของลูกค้าของใบ (อ่านสด · ไม่โยน — อ่านพลาดปิดแค่วันวางบิล/ติ๊ก) + ฐานรัน 0393 แล้วไหม (ติ๊กเขียนได้ไหม) */
    const billingRule = await loadScheduleRule(supabase, order.customerId);
    const skipReady = await billingSkipReady(supabase, live);
    /* ตัวเลือกชุดเดียวกับที่แผงส่งให้ `gate()` */
    const gateOptions = {
      rows: live, orderTotal: order.totalAmount,
      serviceRounds: orderHasServiceRounds(order, order.lines),
      orderLock, historical: isHistoricalOrder(order),
      contractEnd: openingCoverageEnd(order, live),
      orderCancelled: order.status === 'cancelled' && !isHistoricalOrder(order),
    };
    const built = scheduleManyCheck(live, body.rows, {
      order, requestedIds, gate: (row) => installmentActionError(row, 'schedule', user, gateOptions),
      rule: billingRule.rule, ruleUnavailable: billingRule.ruleUnavailable, skipReady,
    });
    if (built.status === 409) {
      return ok({ error: built.error, conflicts: built.conflicts, installments: installmentsForScreen(order, live) }, 409);
    }
    if (built.error) return fail(built.error, built.status);
    /* ทุกงวดตรงค่าเดิมอยู่แล้ว (กดซ้ำหลังบันทึกสำเร็จ) — ไม่มีอะไรต้องเขียน ไม่ลง audit */
    if (!built.rows.length) return ok({ saved: 0, installments: installmentsForScreen(order, live) });

    /* documentWorkflowError คืนข้อความไทยเสมอ (รหัสที่ไม่รู้จัก = ข้อความกลาง) — ไม่มีทางถอยไป writeError.message ภาษาอังกฤษดิบของฐาน
       ⚠️ ลำดับตัวแปล: 0393 (billingSkip) → 0389 (billingDate/Event) → ตัวกลาง — ตัวของ 0389 ไม่รู้จัก billingSkip */
    const failMessage = (writeError) => billingV4SchemaError(writeError) || installmentBillingSchemaError(writeError)
      || documentWorkflowError(writeError, { context: `installment schedule-many ${order.id}` }).message;
    let written;
    try {
      written = await writeScheduleMany(built.rows, (rowId, patch, expectedUpdatedAt) => updateInstallment(
        supabase, rowId, patch, { expectedUpdatedAt },
      ));
    } catch (writeError) {
      /* พังตั้งแต่งวดแรก = ยังไม่มีอะไรลงฐาน ⇒ แปลแบบเขียนงวดเดียว (มิก 0393 → 0389 ก่อนตัวของ 0378 — ตัวนั้นเหมารหัสเดียวกันทุกคอลัมน์)
         รหัสที่ไม่รู้จัก = ข้อความไทยกลาง (documentWorkflowError ลง console ให้แล้ว) — ไม่โยนต่อให้ catch นอกตอบข้อความดิบของฐาน
         เป็นภาษาอังกฤษ (ทางหยุดกลางทางข้างล่างก็ใช้ข้อความชุดเดียวกัน) */
      const billingSchema = billingV4SchemaError(writeError) || installmentBillingSchemaError(writeError);
      if (billingSchema) return fail(billingSchema, 503);
      const mapped = documentWorkflowError(writeError, { context: `installment schedule-many ${order.id}` });
      return fail(mapped.message, mapped.status);
    }
    const { before, after } = written;
    const stopped = written.stopped
      ? {
        id: written.stopped.id,
        seq: written.stopped.seq,
        message: written.stopped.error ? failMessage(written.stopped.error) : SCHEDULE_MANY_ROW_STALE,
      }
      : null;

    /* audit ก้อนเดียว before/after ทุกงวดที่เขียนจริง — ทางกู้ทางเดียวของระบบนี้ (ไม่มีถังขยะ) · หยุดกลางทางก็ลงก่อนตอบ 409
       ⭐ ข้อยกเว้นรายงวด (รุ่นสี่ · ไม่มีคอลัมน์ของ `billingException`) ลงที่นี่ — เฉพาะงวดที่เขียนจริง */
    if (after.length) {
      const writtenIds = new Set(after.map((row) => row.id));
      const exceptions = built.rows
        .filter((row) => writtenIds.has(row.id) && row.exceptions?.length)
        .map((row) => ({ id: row.id, seq: row.seq, exceptions: row.exceptions }));
      await recordAudit({
        user,
        action: 'update',
        entityType: 'sales_order_installments',
        entityId: order.id,
        before: { installments: before },
        after: { installments: after, schedule: 'many', exceptions },
        summary: `schedule-many ${after.length} งวด ของ ${order.orderNumber}`
          + scheduleExceptionSummary(exceptions, user.name || user.email || '')
          + (stopped ? ` (หยุดที่งวด ${stopped.seq})` : ''),
        request: req,
      });
    }
    if (stopped) {
      /* งวดสดให้จอรวมร่าง — อ่านพลาดตรงนี้ห้ามกลายเป็น 500 (งวดที่ลงแล้วลงจริง + audit แล้ว) · จอโหลดใบใหม่เองเมื่อไม่มีชุดนี้ */
      let fresh = null;
      try {
        fresh = installmentsForScreen(order, await loadInstallments(supabase, order.id));
      } catch {
        fresh = null;
      }
      return ok({
        error: scheduleManyStoppedMessage(after.length, stopped),
        saved: after.length,
        conflicts: [{ id: stopped.id, seq: stopped.seq, reason: stopped.message }],
        ...(fresh ? { installments: fresh } : {}),
      }, 409);
    }
    /* เขียนครบ + audit แล้ว — อ่านงวดสดพลาดตรงนี้ห้ามตกไป catch นอก (500 ข้อความดิบของฐาน = จอบอก "ไม่สำเร็จ" ทั้งที่ลงครบ)
       ⇒ ถอยไปงวดก่อนเขียนที่แทนด้วยแถวที่เพิ่งเขียน (installmentsAfterWrite) · จอได้ `installments` เสมอ ไม่ล้างตาราง */
    let settled;
    try {
      settled = await loadInstallments(supabase, order.id);
    } catch {
      settled = installmentsAfterWrite(live, after);
    }
    return ok({ saved: after.length, installments: installmentsForScreen(order, settled) });
  } catch (scheduleError) {
    return fail(scheduleError.message, 500);
  }
}

/* ── แบ่งช่วงครอบตามช่วงบริการ (งานบริการรายบรรทัด · mig 0392 · แผน §2.5 ข้อ 3 / §2.8) ─────────────────────────────
   ⭐ คำสั่งของ **ทั้งใบ** ⇒ PATCH ส่งมาที่นี่ก่อนด่าน `installmentId` (proxy ให้ FN ผ่านเฉพาะ PATCH ของ route นี้)
   ⭐ body `{ action:'fill-coverage', mode:'monthly'|'proportional', plan:[{ id, coversFrom, coversTo }] }` = พรีวิวที่โมดัลแสดง ·
     server คิดชุดเองด้วย `splitCoverageByPeriod` ตัวเดียวกับโมดัล จากช่วงบริการ + งวดสด — ไม่ตรงกับที่จอเห็น = 409
     (ห้ามเขียนชุดใหม่ทับไปเงียบ ๆ = ยืนยันช่วงที่คนกดไม่เคยเห็น)
   ⭐ ใบต้องอยู่ในจังหวะที่งานบริการแก้ได้ (ร่าง/ถูกตีกลับ · หรือใบเดิมที่ต้องตั้งย้อนหลังและยังไม่ยื่นตรวจ) — ข้อความล็อกคือ
     `serviceSetupEditError` ตัวเดียวกับที่ปุ่มบนแผงงวดโชว์ข้าง ๆ ตอนกดไม่ได้ (ปุ่มกับ API พูดคำเดียวกัน)
     · ใบที่ประทับแล้ว/รออนุมัติ/รอตรวจ แก้ช่วงครอบรายงวดได้ตามเดิม (คำสั่ง `coverage`) — ปิดแค่ปุ่มแบ่งทั้งใบ
   ⭐ ด่านรายงวด `coverage` ตัวเดียวกับเซลล์ช่วงครอบ (installmentActionError) ครบทุกงวดก่อนเขียนงวดแรก — ล็อกทั้งใบชนะก่อน
   ⭐ optimistic lock สองชั้น **ท่าเดียวกับ schedule-many** (คำสั่งทั้งใบพี่น้อง · ไม่ชนกัน: คนละ action คนละช่อง — ช่วงครอบ vs วันงวด ·
     จอเปิดร่างสองชุดพร้อมกันไม่ได้ `coverModeLock`):
     1) รุ่นของงวดที่พรีวิวเห็น (`plan[].updatedAt` · `coveragePlanStale`) — ไม่ตรง = 409 พก `conflicts` + งวดสด · ไม่ส่งรุ่น = 400
        (การแบ่งไม่ขึ้นกับช่วงครอบเดิม ⇒ ตัวเทียบพรีวิวไม่เห็นว่าอีกหน้าต่างแก้งวดหลังเปิดโมดัล — "ครอบเดิม" ที่คนเห็นเป็นของเก่า)
     2) เขียนทีละงวดแบบมีเงื่อนไข updatedAt ของแถวสด (writeCoverageFill · ไม่มี RPC) ⇒ อีกหน้าต่างเขียนแทรก = หยุดที่งวดนั้น
        งวดที่ลงแล้วลง audit ครบ · 409 พกจำนวนที่ลงแล้ว + งวดสด · กดใหม่ได้ชุดเดิม (การแบ่งไม่ขึ้นกับช่วงครอบเดิมของงวดที่ยังไม่รับรอง) */
const COVERAGE_PLAN_STALE = 'งวดหรือช่วงบริการเพิ่งเปลี่ยน — ตรวจพรีวิวใหม่';
const COVERAGE_FILL_NOTHING = 'ใบนี้ไม่มีงานบริการให้ตั้ง — กรอกช่วงครอบรายงวดเองที่แผงงวด';
const coverageFillStoppedMessage = (filled, stopped) => `แบ่งช่วงครอบแล้ว ${filled} งวด แต่หยุดที่งวดที่ ${stopped.seq}`
  + ` — ${stopped.message} · โหลดใหม่แล้วกดแบ่งอีกครั้ง (งวดที่ลงแล้วได้ช่วงเดิม)`;

/* พรีวิวที่จอส่งมาตรงกับชุดที่ server คิดไหม — งวดชุดเดียวกัน (id) และวันตรงกันทุกงวด */
function coveragePlanMatches(rows, plan) {
  if (!Array.isArray(plan) || plan.length !== rows.length) return false;
  const byId = new Map(plan.map((row) => [String(row?.id || ''), row]));
  return rows.every((row) => {
    const seen = byId.get(String(row.id));
    return !!seen && String(seen.coversFrom || '') === row.coversFrom && String(seen.coversTo || '') === row.coversTo;
  });
}

async function fillCoverage({ user, supabase, req, id, body }) {
  /* สิทธิ์ก่อนโหลด — ชุดเดียวกับเซลล์ช่วงครอบของงวดที่ยังไม่รับรอง (ฝ่ายขาย · ฝ่ายบัญชี) */
  if (!installmentScheduleAllowed(user)) return forbidden('ไม่มีสิทธิ์แก้ช่วงครอบบริการ');
  const mode = ['monthly', 'proportional'].includes(body.mode) ? body.mode : null;
  if (!mode) return badRequest('รูปแบบการแบ่งไม่ถูกต้อง — เลือก “เท่ากันรายเดือน” หรือ “ตามสัดส่วนงวด”');
  try {
    const { order, error } = await loadOrderForUser(supabase, user, id);
    if (error) return error;
    /* จังหวะของใบ — `canEdit: true` เพราะสิทธิ์ผ่านด่านบนแล้ว ⇒ เหลือแต่เหตุของสถานะใบ (ข้อความเดียวกับปุ่ม) */
    const flow = serviceSetupFlow(order, { lines: order.lines });
    const lockText = serviceSetupEditError(order, { canEdit: true });
    if (lockText || !['pipeline', 'backfill'].includes(flow)) return fail(lockText || COVERAGE_FILL_NOTHING, 409);
    const period = servicePeriodOf(order);
    if (!period) return fail(COVERAGE_SPLIT_ERRORS.noPeriod, 409);

    /* ⚠️ อ่านสดแบบโยน error — กลืนเป็น [] แล้ว "ไม่มีงวดให้แบ่ง" ปลอมตัวเป็นเหตุของข้อมูล */
    const live = await loadInstallments(supabase, order.id);
    /* ⭐ คิดจาก **ยอดชุดเดียวกับที่จอเห็น** (`installmentsForScreen`) — งวดร่างของใบปกติโชว์ยอดตามแผน QT สด (B-4 · ไม่เขียนลงฐาน)
       ⇒ โหมด "ตามสัดส่วนงวด" คิดจากยอดดิบในฐานเมื่อไร พรีวิวของโมดัลจะไม่ตรงกับ server แล้วได้ 409 ทุกครั้งที่ยอดสองชุดต่างกัน
       · ด่านรายงวดและการเขียนยังใช้แถวสดจากฐาน (`live` — updatedAt จริง) */
    const split = splitCoverageByPeriod(period, installmentsForScreen(order, live), mode);
    if (split.error) return fail(split.error, 409);
    if (!coveragePlanMatches(split.rows, body.plan)) return fail(COVERAGE_PLAN_STALE, 409);
    const stale = coveragePlanStale(live, body.plan);
    if (stale?.status === 409) {
      return ok({ error: stale.error, conflicts: stale.conflicts, installments: installmentsForScreen(order, live) }, 409);
    }
    if (stale) return fail(stale.error, stale.status);

    const byId = new Map(live.map((row) => [row.id, row]));
    const orderLock = historicalInstallmentLock(order) || pipelineInstallmentLock(order, 'coverage');
    for (const planned of split.rows) {
      /* ตัวเลือกชุดเดียวกับที่ PATCH รายงวดส่ง — ด่านของ coverage อ่านล็อกทั้งใบ · สิทธิ์ตามสถานะงวด · ช่วงกลับหัว/ปีเพี้ยน */
      const gate = installmentActionError(byId.get(planned.id), 'coverage', user, {
        coversFrom: planned.coversFrom, coversTo: planned.coversTo,
        rows: live, orderTotal: order.totalAmount,
        serviceRounds: orderHasServiceRounds(order, order.lines),
        orderLock, historical: isHistoricalOrder(order),
        contractEnd: openingCoverageEnd(order, live),
        orderCancelled: order.status === 'cancelled' && !isHistoricalOrder(order),
      });
      if (gate) return badRequest(split.rows.length > 1 ? `งวดที่ ${planned.seq}: ${gate}` : gate);
    }

    let written;
    try {
      written = await writeCoverageFill(supabase, live, split.rows);
    } catch (writeError) {
      const mapped = documentWorkflowError(writeError, { context: `installment fill-coverage ${order.id}` });
      if (mapped.code) return fail(mapped.message, mapped.status);
      throw writeError;
    }
    const { before, after } = written;
    const stopped = written.stopped
      ? {
        seq: written.stopped.seq,
        /* ฐานตีกลับงวดหลัง = ข้อความไทยของรหัสที่รู้จัก หรือข้อความกลาง (ข้อความดิบของ Postgres ไม่ออกจอ) */
        message: written.stopped.error
          ? documentWorkflowError(written.stopped.error, { context: `installment fill-coverage ${order.id}` }).message
          : INSTALLMENT_STALE_MESSAGE,
      }
      : null;
    /* audit before/after ทุกงวดที่เขียนจริง — ทางกู้ทางเดียวของระบบนี้ (ไม่มีถังขยะ) · หยุดกลางทางก็ลงก่อนตอบ 409 */
    if (after.length) {
      await recordAudit({
        user,
        action: 'update',
        entityType: 'sales_order_installments',
        entityId: order.id,
        before: { installments: before },
        after: { installments: after, fill: `coverage-${mode}`, servicePeriod: period },
        summary: `fill-coverage ${after.length} งวด ของ ${order.orderNumber} (${mode})`
          + (stopped ? ` (หยุดที่งวด ${stopped.seq})` : ''),
        request: req,
      });
    }
    if (stopped || !after.length) {
      /* 409 พกจำนวนที่ลงแล้ว + งวดสด (ท่าเดียวกับ schedule-many) — จอวางงวดสดทันทีแล้วดึงใบสด
         · อ่านงวดสดพลาดตรงนี้ห้ามกลายเป็น 500 (งวดที่ลงแล้วลงจริง + audit แล้ว) — ไม่พก = จอดึงใบสดเอง */
      let fresh = null;
      try {
        fresh = installmentsForScreen(order, await loadInstallments(supabase, order.id));
      } catch {
        fresh = null;
      }
      return ok({
        error: after.length ? coverageFillStoppedMessage(after.length, stopped) : (stopped?.message || INSTALLMENT_STALE_MESSAGE),
        filled: after.length,
        ...(fresh ? { installments: fresh } : {}),
      }, 409);
    }
    /* เขียนครบ + audit แล้ว — อ่านงวดสดพลาดห้ามตกไป catch นอก (500 = จอบอก "ไม่สำเร็จ" ทั้งที่ลงครบ) ⇒ ถอยไปงวดก่อนเขียน
       ที่แทนด้วยแถวที่เพิ่งเขียน (installmentsAfterWrite — ตัวเดียวกับ schedule-many) */
    let settled;
    try {
      settled = await loadInstallments(supabase, order.id);
    } catch {
      settled = installmentsAfterWrite(live, after);
    }
    return ok({ filled: after.length, installments: installmentsForScreen(order, settled) });
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

/* PATCH — เดินสถานะของงวดเดียว (+ `replan` / `carry` / `fill-coverage` / `schedule-many` ของทั้งใบ — ดูข้างบน · `fill-billing`/`redate-billing` = 410)
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
  if (RETIRED_BILLING_ACTIONS.includes(action)) return fail(RETIRED_BILLING_MESSAGE, 410);
  if (action === 'fill-coverage') return fillCoverage({ user, supabase, req, id, body });
  if (action === 'schedule-many') return scheduleManyDates({ user, supabase, req, id, body });
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
    /* ข้อยกเว้นรายงวดของ `schedule` (รุ่นสี่) — ลงในสรุป audit ข้างล่าง */
    let scheduleExceptions = [];

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
      /* ⭐ รุ่นสี่ "ต้องวางบิลไหม" (mig 0393 · system-design §7.3) — ด่านเดียวกับ schedule-many (`validateInstallmentDates`)
         · body รับ `billingSkip` (ติ๊ก "งวดนี้ไม่ต้องวางบิล" · ไม่ส่ง = คงเดิม) + `billingException` (ยืนยัน "งวดนี้ต้องวางบิล…" ·
           ของชั่วคราว ไม่เก็บ — ลงประวัติ) · ลูกค้าไม่ต้องวางบิล: วันวางบิลใหม่ที่ไม่มีการยืนยัน = 400
         · กติกาลูกค้าอ่านสดที่นี่ (ไม่โยน) — อ่านพลาดปิดแค่วันวางบิล/ติ๊ก · กำหนดชำระยังบันทึกได้
         · ติ๊กลงฐานเป็น true/null เฉพาะเมื่อเปลี่ยน · ฐานยังไม่รัน 0393 = 503 (ไม่ปล่อยให้ PGRST204 ไปโทษ 0378) */
      const flagError = billingFlagShapeError(body);
      if (flagError) return badRequest(flagError);
      const skipNext = Object.hasOwn(body, 'billingSkip') ? body.billingSkip === true : rowSkipped(row);
      const billingRule = await loadScheduleRule(supabase, order.customerId);
      const next = {
        billingDate: Object.hasOwn(patch, 'billingDate') ? patch.billingDate : row.billingDate,
        billingEvent: Object.hasOwn(patch, 'billingEvent') ? patch.billingEvent : row.billingEvent,
        dueDate,
        billingSkip: skipNext,
        billingException: body.billingException === true,
      };
      const dateError = validateInstallmentDates(row, next, billingRule.rule, { ruleUnavailable: billingRule.ruleUnavailable });
      if (dateError) return badRequest(dateError);
      if (skipNext !== rowSkipped(row)) {
        if (!(await billingSkipReady(supabase, siblings))) return fail(BILLING_V4_SCHEMA_MISSING, 503);
        patch = { ...patch, billingSkip: skipNext ? true : null };
      }
      scheduleExceptions = scheduleExceptionsOf(row, next, billingRule.rule);
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
      /* ฐานยังไม่ได้รัน 0393 (ติ๊ก billingSkip) / 0389 (ไม่มีคอลัมน์วันวางบิล) — ถามก่อนตัวของ 0378 ซึ่งเหมารหัสเดียวกันทุกคอลัมน์ */
      const v4Schema = billingV4SchemaError(writeError);
      if (v4Schema) return fail(v4Schema, 503);
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
      summary: `${action} งวด ${row.seq} ของ ${order.orderNumber}`
        + scheduleExceptions.map((kind) => ` · ${scheduleExceptionText(kind, actorName)}`).join(''),
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
