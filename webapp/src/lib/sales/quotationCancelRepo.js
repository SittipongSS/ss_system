/* ── ยกเลิกใบเสนอราคา — ฝั่งที่คุยกับฐาน (มติเจ้าของ 24/09) ──────────────────────────────
 *
 * กติกา (ใครยกเลิกได้ · ใบไหน · โมดัลบอกอะไร) อยู่ที่ `quotationWorkflow.js` + `quotationCancel.js`
 * ไฟล์นี้แค่ลงมือตามกติกานั้น · คืน `{ error, status }` หรือ `{ data }` (lib ไม่รู้จัก HTTP — route แปลงเอง)
 *
 * ผู้เรียก: POST /api/sales-planning/quotations/[id]/cancel (ทั้งพรีวิว ?dryRun=1 และกดจริง)
 *
 * ⚠️ **ไม่ตรวจสิทธิ์** — route โหลดใบด้วย `loadScoped(..., 'edit')` แล้วถาม `canCancelQuotation` มาแล้ว
 * ⚠️ **ไม่มี migration / RPC** โดยเจตนา: CHECK ของ status รับ 'cancelled' อยู่แล้ว (0102) · ไม่มี trigger
 *    กั้นการเขียน status อย่างเดียว · RPC ปลายน้ำทุกตัว (save/submit/approve/accept) ปฏิเสธ 'cancelled' อยู่แล้ว
 *    ⇒ เขียนครั้งเดียวแบบมีเงื่อนไข (สถานะที่ยังเดิน + เวอร์ชันจากจอ) พอ
 * ⚠️ ขั้นหลังเขียนสำเร็จ **ห้ามตอบ error** — ใบตายไปแล้ว กดซ้ำจะชน 409 ⇒ ทุกอย่างที่พลาดหลังจากนั้น
 *    เป็น best-effort (สัญญา · เธรด · audit · แจ้งเตือน · FC) และ FC ที่พลาดส่ง `warning` กลับให้จอบอก
 * ⚠️ ผลข้างเคียงทุกตัวฉีดได้ผ่าน `deps` — เทสต์ส่งตัวเก็บมาแทน ไม่งั้นเทสต์ที่รันพร้อม env ของเครื่อง dev
 *    จะเขียน audit_logs ลงฐานจริงผ่าน service-role (dev DB = prod DB)
 */
import { recordAudit } from '@/lib/audit';
import { appendUpdate } from '@/lib/master/updates';
import { notifyUsers } from '@/lib/notifications';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { dealAuditLabel } from '@/lib/salesPlanning';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { syncContractsForQuotation } from '@/lib/sales/contractQuotationSync';
import { previewForecastSource } from '@/lib/sales/forecastSource';
import { applyForecastSource, loadDealQuotations } from '@/lib/sales/forecastSourceRepo';
import {
  QUOTATION_CANCEL_CAUSE,
  buildQuotationCancelPreview,
  cancelForecastSkip,
  quotationCancelBlock,
  quotationCancelMetadata,
  requestsToNotifyOnCancel,
} from '@/lib/sales/quotationCancel';

// สถานะที่ยังเดินอยู่ — ตัวเดียวกับ EDITABLE_QUOTATION_STATUSES (quotationWorkflow.js) ใช้เป็นเงื่อนไขของคำสั่ง update
const LIVE_STATUSES = ['draft', 'sent', 'rejected'];

const STALE_MESSAGE = 'ใบเสนอราคานี้ถูกเปลี่ยนจากอีกหน้าต่าง — โหลดหน้าใหม่แล้วลองอีกครั้ง';

const DEFAULT_DEPS = {
  audit: recordAudit,
  appendEvent: appendDocumentEvent,
  syncContracts: syncContractsForQuotation,
  applyForecast: applyForecastSource,
  notify: notifyUsers,
  appendThread: appendUpdate,
};

/* อ่านไม่ขึ้น ≠ ไม่มี — โยนออกไปให้ route ตอบ 500 (ไม่ใช่ยกเลิกไปทั้งที่ไม่รู้ว่ามีคำร้อง/สัญญา/SO ห้อยอยู่)
   ⚠️ ทุกลิสต์ไล่ทีละหน้า (`fetchAllResult` + ลำดับนิ่ง) — ตารางพวกนี้อยู่ในด่าน check:rowcap
      (กรองด้วยใบเดียวก็จริง แต่เพดาน 1,000 แถวตัดเงียบ และด่านไม่ยอมให้จุดอ่านไร้ขอบเขตเพิ่ม) */
async function must(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`ตรวจ${label}ของใบเสนอราคาไม่สำเร็จ: ${error.message}`);
  return data || [];
}

/**
 * ใบนี้มีหลักฐานลายเซ็นไหม — **นิยามเดียว** ของด่าน DELETE (ลบถาวรไม่ได้ · 409) · ธง `hasSignatureEvidence`
 * ของ GET · และด่านยกเลิกใบ (ร่างที่ถูกดึงกลับ/ตีกลับหลังยื่น) — สามที่ต้องตอบคำเดียวกันเสมอ ไม่งั้นปุ่มลบ/ยกเลิก
 * บนจอกับ API เพี้ยนหากัน
 * ⭐ แถวหลักฐาน (0125 · FK RESTRICT) **หรือ** ตัวชี้บนใบ — ตัวชี้ถูกล้างเมื่อออกจาก approved แต่แถวยังอยู่
 * @returns {{ hasEvidence: boolean } | { error }}  อ่านไม่ขึ้น = error (ผู้เรียกตัดสินเองว่าจะหยุดหรือถอย)
 */
export async function quotationSignatureEvidence(supabase, quote) {
  const { data, error } = await supabase
    .from('document_signature_evidence')
    .select('id')
    .eq('quotationId', quote.id)
    .limit(1)
    .maybeSingle();
  if (error) return { error };
  return { hasEvidence: Boolean(data?.id || quote.signatureEvidenceId) };
}

/**
 * ของที่ห้อยอยู่กับใบ — ใช้ทั้งด่านสิทธิ์ (หลักฐานลายเซ็น) · พรีวิว · การแจ้งเตือนหลังกด
 *
 * ⭐ หลักฐานลายเซ็น = แถวใน `document_signature_evidence` **หรือ** ตัวชี้บนใบ — นิยามเดียวกับด่าน DELETE
 *   (ตัวชี้ถูกล้างเมื่อออกจาก approved แต่แถวหลักฐานยังอยู่ · FK RESTRICT) ⇒ ร่างที่ถูกดึงกลับ/ตีกลับหลังยื่น
 *   ลบไม่ได้ (409) จึงต้องยกเลิกได้
 * ⚠️ ชื่อตาราง dept_requests / dept_request_items (0225 · 0258): คำร้องอ้างใบด้วย `quotationId` ไม่มี FK
 */
export async function loadQuotationCancelContext(supabase, quote) {
  const id = quote.id;
  const evidence = await quotationSignatureEvidence(supabase, quote);
  if (evidence.error) throw new Error(`ตรวจหลักฐานลายเซ็นของใบเสนอราคาไม่สำเร็จ: ${evidence.error.message}`);
  const contracts = await must(fetchAllResult(() => supabase
    .from('sales_contracts').select('id, "contractNo", status')
    .eq('quotationId', id)
    .order('id', { ascending: true })), 'สัญญา');
  const requests = await must(fetchAllResult(() => supabase
    .from('dept_requests')
    .select('id, "docNo", kind, status, title, "dealId", "requestedById", "assigneeId", "assigneeName", "acknowledgedById", "acknowledgedByName"')
    .eq('quotationId', id)
    .order('id', { ascending: true })), 'คำร้อง (dept_requests)');
  // คำร้องที่อ้างใบเดียวมีไม่กี่ใบ ⇒ ลิสต์ id ของ .in() ไม่มีทางชนเพดาน URL 16 KB
  const items = requests.length
    ? await must(fetchAllResult(() => supabase
      .from('dept_request_items').select('id, "requestId", "docNumber"')
      .in('requestId', requests.map((row) => row.id))
      .order('id', { ascending: true })), 'เลขเอกสารการเงินของคำร้อง')
    : [];
  const orders = await must(fetchAllResult(() => supabase
    .from('sales_orders').select('id, "orderNumber", status, "supersededById"')
    .eq('quotationId', id)
    .order('id', { ascending: true })), 'ใบสั่งขาย');
  return {
    hasSignatureEvidence: evidence.hasEvidence,
    contracts,
    requests,
    items,
    orders,
  };
}

/* ใบทั้งหมดของดีลโดยจำลองว่าใบนี้ถูกยกเลิกแล้ว — ตัวคิด FC ต้องเห็นภาพหลังกด ไม่ใช่ก่อนกด */
function withCancelled(quotations, quote) {
  const rows = (quotations || []).map((row) => (row.id === quote.id ? { ...row, status: 'cancelled' } : row));
  return rows.some((row) => row.id === quote.id) ? rows : [...rows, { ...quote, deal: undefined, status: 'cancelled' }];
}

/**
 * พรีวิวให้โมดัล (POST ?dryRun=1) — ไม่เขียนอะไรเลย
 * ⭐ FC ถาม `previewForecastSource` ตัวเดียวกับ `applyForecastSource` ⇒ โมดัลบอก "฿A → ฿B" ตรงกับตอนเขียนจริง
 *   รวมกติกา "ห้ามขึ้นบันไดเอง" ของดีลที่ยังกรอกยอดเอง
 */
export async function previewQuotationCancel(supabase, quote, { context = null, user = null } = {}) {
  const ctx = context || await loadQuotationCancelContext(supabase, quote);
  const deal = quote.deal || null;
  let forecast = null;
  let quotations = [];
  if (!cancelForecastSkip(deal) && quote.dealId) {
    quotations = withCancelled(await loadDealQuotations(supabase, quote.dealId), quote);
    forecast = previewForecastSource(deal, quotations, { cause: QUOTATION_CANCEL_CAUSE });
  }
  return buildQuotationCancelPreview({
    quote,
    deal,
    forecast,
    quotations,
    contracts: ctx.contracts,
    requests: requestsToNotifyOnCancel(ctx.requests, ctx.items, { actorId: user?.id }),
    orders: ctx.orders,
  });
}

function requestThreadBody(quote, request, reason) {
  const issued = request.docNumbers.length
    ? ` · เอกสารการเงินที่ออกแล้ว ${request.docNumbers.join(', ')} ระบบไม่ยกเลิกให้ — ตรวจแล้วจัดการใน Express เอง`
    : '';
  return `ใบเสนอราคา ${quote.quoteNumber} ที่คำร้องนี้อ้างถูกยกเลิก — ${reason}${issued}`;
}

/**
 * ยกเลิกจริง
 *
 * @param expectedUpdatedAt  เวอร์ชันดิบจากจอ (`resolveExpectedUpdatedAt`) — ห้าม toISOString (ไมโครวินาทีหาย
 *                           แล้วไม่มีวันตรงแถว · documentConcurrency.js)
 * @param context            ผลของ `loadQuotationCancelContext` ที่ route อ่านไว้ตอนตรวจสิทธิ์ (ไม่อ่านซ้ำ)
 */
export async function cancelQuotation(supabase, {
  quote, context, user, reason, expectedUpdatedAt, req = null,
  now = new Date().toISOString(), deps = {},
}) {
  const { audit, appendEvent, syncContracts, applyForecast, notify, appendThread } = { ...DEFAULT_DEPS, ...deps };

  const blocked = quotationCancelBlock({ orders: context?.orders });
  if (blocked) return { status: 409, error: blocked };

  /* ⭐ เขียนครั้งเดียวแบบมีเงื่อนไข — สถานะที่ยังเดิน + เวอร์ชันเดียวกับที่จอเห็น
     ไม่มีแถวตรง = มีคนเปลี่ยนใบไปก่อน (ยื่น/อนุมัติ/Rev./ยกเลิกจากอีกแท็บ) ⇒ 409 ให้โหลดใหม่
     ⚠️ ไม่แตะ approvalStatus — ใบตายตอนอยู่ขั้นไหนต้องอ่านย้อนได้ และการเขียนคอลัมน์นั้นปลุก trigger
        0125/0126 ที่ล้างตัวชี้หลักฐานลายเซ็นบนใบ
     ⚠️ ไม่อ่านแถวซ้ำหลังเขียน (`.select()` ต่อท้าย update แทน) — systemRules กฎ 6 */
  const { data: updated, error } = await supabase
    .from('quotations')
    .update({
      status: 'cancelled',
      metadata: quotationCancelMetadata(quote, { reason, user, at: now }),
      updatedAt: now,
    })
    .eq('id', quote.id)
    .in('status', LIVE_STATUSES)
    .eq('updatedAt', expectedUpdatedAt)
    .select('id, status, "approvalStatus", "updatedAt", metadata')
    .maybeSingle();
  if (error) return { status: 500, error: error.message };
  if (!updated) return { status: 409, error: STALE_MESSAGE };

  const { deal, ...quoteRow } = quote;
  const after = { ...quoteRow, ...updated };

  /* ร่างสัญญาปิดตาม · สัญญาที่ออกเลข/ลงนามแล้วแค่แจ้งเจ้าของ (มติ 2026-08-22 — ไม่บล็อก)
     ⚠️ อาร์กิวเมนต์แรกคือ supabase · ต้องส่งใบ "หลังยกเลิก" ไม่งั้น quotationClosure ตอบ null แล้วไม่ทำอะไร */
  let contracts = { cancelled: [], warned: [] };
  try {
    contracts = await syncContracts(supabase, { quotation: { ...quoteRow, status: 'cancelled' }, actor: user });
  } catch (contractError) {
    console.error('[quotation cancel] ไล่ปิดร่างสัญญาไม่สำเร็จ', quote.id, contractError);
  }

  // เหตุผลลงเธรดของดีลแม่ — ที่เดียวที่คนอ่านย้อนได้นอกจาก audit (documentUpdates.js)
  await appendEvent(supabase, { docType: 'quotation', doc: quoteRow, action: 'cancel', opts: { reason }, user });

  await audit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: quote.id,
    before: quote,
    after,
    summary: `ยกเลิกใบเสนอราคา ${quote.quoteNumber} (เหตุผล: ${reason})${deal ? ` (${dealAuditLabel(deal)})` : ''}`,
    request: req,
  });

  /* ⭐ คำร้องที่อ้างใบนี้ (มติ 24/09: เตือน + แจ้ง ไม่บล็อก) — แถวเธรด (quiet) ให้ประวัติคำร้องเล่าครบ
     + กระดิ่งถึงผู้ขอและผู้รับผิดชอบ (FN ที่ถือใบ) ครั้งเดียวต่อใบ (dedupeKey) */
  const notices = requestsToNotifyOnCancel(context?.requests, context?.items, { actorId: user?.id });
  for (const request of notices) {
    const body = requestThreadBody(quote, request, reason);
    try {
      await appendThread(supabase, {
        entityType: 'dept_request',
        entityId: request.id,
        kind: 'quotation_cancelled',
        body,
        meta: { quotationId: quote.id, quoteNumber: quote.quoteNumber, docNumbers: request.docNumbers },
        user,
      });
      await notify(supabase, {
        userIds: request.recipientIds,
        entityType: 'dept_request',
        entityId: request.id,
        kind: 'quotation_cancelled',
        title: `ใบเสนอราคา ${quote.quoteNumber} ถูกยกเลิก · ${request.docNo || request.title || 'คำร้อง'}`,
        body,
        actorName: user?.name || null,
        dedupeKey: `QTCANCEL-${quote.id}-${request.id}`,
      });
    } catch (notifyError) {
      console.error('[quotation cancel] แจ้งคำร้องไม่สำเร็จ', request.id, notifyError);
    }
  }

  /* FC ของดีล — ดีล Lost ไม่คิดใหม่ (มติ 24/09) · ดีลเปิดใช้เหตุ "ดูแลตัวชี้" (ไม่ขึ้นบันได)
     best-effort: ใบยกเลิกไปแล้ว ห้ามพังเพราะยอดเขียนไม่ผ่าน แต่ก็ห้ามเงียบ (forecastSourceRepo) */
  let forecast;
  const skip = cancelForecastSkip(deal);
  if (skip === 'lost') {
    forecast = { changed: false, reason: 'lost_skipped' };
  } else if (!quote.dealId) {
    forecast = null;
  } else {
    try {
      forecast = await applyForecast(supabase, quote.dealId, { cause: QUOTATION_CANCEL_CAUSE });
    } catch (forecastError) {
      console.error('forecast source apply failed after quotation cancel', quote.id, forecastError);
      forecast = { changed: false, warning: forecastError.message };
    }
  }

  return { data: { quotation: after, forecast, contracts, notifiedRequests: notices.length } };
}
