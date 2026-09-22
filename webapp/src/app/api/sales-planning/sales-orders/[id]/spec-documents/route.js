/* ── เอกสาร FM-SA-04 ของใบสั่งขาย — สถานะรายบรรทัด (GET) + ออกเอกสาร (POST) (mig 0370) ──
 *
 * ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md): เอกสาร 1 ใบต่อ **บรรทัด SO**
 *   ออกได้หลัง SO **อนุมัติแล้ว** · ออกโดย **AC** เท่านั้น (+ admin) · ได้เลขที่
 *   `FM-SA-04-DDMMYY-XXX` + Rev.00 ร่าง ตอนกดออก · เลขที่ออกแล้วคืนไม่ได้
 *   เส้นอนุมัติของเอกสารอยู่ที่ `/api/sales-planning/spec-documents/[id]`
 *
 * ⚠️ ด่านทุกตัวถาม `productSpecDocWorkflow` ตัวเดียวกับที่การ์ดบนหน้า SO ใช้
 *   (`lineDocumentState` / `documentCreateGate` / `documentActions`) — คิดซ้ำที่นี่เมื่อไร
 *   ปุ่มจะบอกอย่างหนึ่งแล้วเซิร์ฟเวอร์ทำอีกอย่าง
 */
import { withUser, ok, fail, badRequest, forbidden, conflict, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { loadScoped } from '@/lib/scopedRow';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { productSpecScopeReason } from '@/lib/sales/productSpecScope';
import {
  DOC_REVISION_STATUS_LABELS, canIssueProductSpecDocument, documentActions, documentCreateGate,
  formatRevLabel, lineDocumentState,
} from '@/lib/sales/productSpecDocWorkflow';
import { createSpecDocument, loadDocumentsForOrder, loadSpecRecord } from '@/lib/sales/productSpecStore';
import { formatSpecDocNo } from '@/lib/sales/productSpecDocNo';

export const dynamic = 'force-dynamic';

const NO_PRODUCT_LINK = 'บรรทัดนี้ไม่ได้ผูกสินค้าในทะเบียน — ออกใบสเปคสินค้าไม่ได้';

/* โหลด + ตรวจขอบเขตในจังหวะเดียว (`loadScoped` — กฎ 6 ของด่านรายแถว) แล้วค่อยต่อ
   บรรทัดสินค้า · บรรทัดไม่ได้ scope เอง มันสังกัดใบที่ผ่านด่านมาแล้ว
   ⭐ `loadScoped` join ดีลแม่มาให้แล้ว (`order.deal`) ⇒ `order.deal.ownerId` คือ AE เจ้าของดีล
   (`sales_deals.ownerId`) — คนเดียวกับที่ขั้น AE ของเอกสารเป็นของเขา
   🛑 **ใบย้อนหลังออกใบสเปคไม่ได้** — ใบที่คีย์จากชีตคือของที่ส่งไปแล้วในอดีต
      ไม่มี "รอบขายที่กำลังจะส่ง" ให้ตกลงสเปก · ปล่อยผ่านเมื่อไรจะกินเลขที่เอกสาร
      ของเดือนนี้ไปกับใบที่ไม่มีใครใช้ (มติข้อ 21 ของสาย SO ย้อนหลัง) · RPC กันซ้ำอีกชั้น */
async function loadOrder(supabase, id, user, mode) {
  const scoped = await loadScoped(supabase, 'sales_orders', id, user, mode);
  if (scoped.response) return { response: scoped.response };
  const order = scoped.row;
  if (isHistoricalOrder(order)) {
    return { blocked: 'ใบสั่งขายย้อนหลังไม่ออกใบสเปคสินค้า — ใบนี้คีย์จากเอกสารเดิมที่ส่งของไปแล้ว' };
  }
  // ⚠️ ไล่ทีละหน้า — เพดาน 1,000 แถวของ PostgREST ตัดเงียบ ๆ · ลำดับต้องนิ่ง
  //    ไม่งั้นหน้าที่สองซ้อนหน้าแรก (ด่าน check:rowcap)
  const lines = await fetchAllResult(() => supabase
    .from('sales_order_lines')
    .select('id, salesOrderId, productId, fgCode, description, qty, unit, sortOrder')
    .eq('salesOrderId', id)
    .order('sortOrder', { ascending: true })
    .order('id', { ascending: true }));
  if (lines.error) return { error: lines.error.message };
  return { order: { ...order, lines: lines.data || [] }, dealOwnerId: order.deal?.ownerId || null };
}

/* เหตุที่บรรทัดนี้ไม่เข้าเกณฑ์ใบสเปค — หมวดนอก 01/02 หรือไม่ได้ผูกสินค้า (ไม่มีสเปคให้อ้าง)
   ⚠️ บรรทัด SO แก้ไม่ได้ (เป็น snapshot) ⇒ บรรทัดที่ไม่ผูกสินค้าไม่มีทางออกเอกสาร
      นับเป็น "ไม่ต้องใช้" พร้อมเหตุ ตามกติกาเดิมของการ์ด */
const lineScopeReason = (line) => productSpecScopeReason({ fgCode: line?.fgCode })
  || (line?.productId ? null : NO_PRODUCT_LINK);

const lineView = (line) => ({
  id: line.id,
  fgCode: line.fgCode || null,
  description: line.description || null,
  qty: line.qty ?? null,
  unit: line.unit || null,
  productId: line.productId || null,
  sortOrder: line.sortOrder ?? null,
});

/* สเปคของสินค้าที่บรรทัดอ้าง — ถามแค่ "มีไหม" (ไม่ลาก checklist มาทุกบรรทัด)
   ⚠️ query ล้ม = error ไม่ใช่ "ไม่มีสเปค" — ไม่งั้นการ์ดบอกให้ไปสร้างสเปคที่มีอยู่แล้ว */
async function specsByProduct(supabase, productIds) {
  const res = await fetchInChunks(productIds, (chunk) => supabase
    .from('product_specs').select('id, productId').in('productId', chunk));
  if (res.error) return { error: res.error.message };
  return { specs: new Map((res.data || []).map((row) => [row.productId, row])) };
}

/* ── GET: บรรทัดไหนต้องทำอะไรต่อ + เอกสารที่บรรทัดถูกถอด ───────────────────── */
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const loaded = await loadOrder(supabase, id, user, 'view');
  if (loaded.response) return loaded.response;
  if (loaded.error) return fail(`อ่านบรรทัดใบสั่งขายไม่สำเร็จ: ${loaded.error}`, 500);
  if (loaded.blocked) return badRequest(loaded.blocked);
  const { order, dealOwnerId } = loaded;

  const docsRes = await loadDocumentsForOrder(supabase, order.id);
  if (docsRes.error) return fail(`อ่านเอกสารใบสเปคของใบสั่งขายไม่สำเร็จ: ${docsRes.error}`, 500);
  const documents = docsRes.documents || [];

  const lines = [...order.lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const inScopeProducts = lines.filter((line) => !lineScopeReason(line)).map((line) => line.productId);
  const specRes = await specsByProduct(supabase, inScopeProducts);
  if (specRes.error) return fail(`อ่านสเปคสินค้าไม่สำเร็จ: ${specRes.error}`, 500);

  // เอกสารที่ยังใช้งานของแต่ละบรรทัด — unique index ของ 0370 การันตีไม่เกินหนึ่งใบต่อบรรทัด
  const liveByLine = new Map(documents
    .filter((doc) => doc.status !== 'void' && doc.salesOrderLineId)
    .map((doc) => [doc.salesOrderLineId, doc]));

  const rows = lines.map((line) => {
    const document = liveByLine.get(line.id) || null;
    return {
      line: lineView(line),
      state: lineDocumentState({
        line,
        spec: specRes.specs.get(line.productId) || null,
        document,
        latest: document?.latest || null,
        salesOrder: order,
        user,
        scopeReason: lineScopeReason(line),
      }),
    };
  });

  /* ⭐ เอกสารที่บรรทัดหายไป (ถอดบรรทัดตอน SO ออก Rev · FK SET NULL) — ไม่มีบรรทัดให้ผูก
     แต่เลขที่ยังออกไปแล้ว ⇒ ต้องโผล่บนการ์ดพร้อมปุ่มยกเลิก ไม่งั้นค้างอยู่เงียบ ๆ ตลอดกาล */
  const lineIds = new Set(lines.map((line) => line.id));
  const orphans = documents
    .filter((doc) => doc.status === 'active' && (!doc.salesOrderLineId || !lineIds.has(doc.salesOrderLineId)))
    .map((doc) => ({
      documentId: doc.id,
      docNo: doc.docNo,
      // เลขที่ที่คนอ่าน DDMMYY-XXX-RR (มติ 22/09) — ตัวเดียวกับกระดาษ/แถวที่ออกแล้ว
      docNoText: formatSpecDocNo(doc.docNo, doc.latest?.revNo),
      // Rev ดิบให้โมดัลยกเลิกประกอบเลขรูปเดียวกับแถว (docReasonPrompt ต้องได้ latest.revNo)
      revNo: doc.latest ? doc.latest.revNo : null,
      revLabel: doc.latest ? formatRevLabel(doc.latest.revNo) : null,
      statusLabel: doc.latest ? (DOC_REVISION_STATUS_LABELS[doc.latest.status] || doc.latest.status) : null,
      voidAction: documentActions({
        document: doc, latest: doc.latest, salesOrder: order, dealOwnerId, user,
      }).void,
    }));

  return ok({ orderStatus: order.status, rows, orphans });
});

/* ── POST: ออกเอกสารของบรรทัดหนึ่งบรรทัด (ได้เลขที่ + Rev.00 ร่าง) ─────────────── */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  // ไม่มีสิทธิ์ออก = ปุ่มไม่โชว์อยู่แล้ว (ui-visibility-rule) · ถึงตรงนี้ได้แปลว่ายิงตรง
  if (!canIssueProductSpecDocument(user.role)) return forbidden('ออกใบสเปคสินค้าได้เฉพาะ AC');
  const { id } = await ctx.params;
  const loaded = await loadOrder(supabase, id, user, 'edit');
  if (loaded.response) return loaded.response;
  if (loaded.error) return fail(`อ่านบรรทัดใบสั่งขายไม่สำเร็จ: ${loaded.error}`, 500);
  if (loaded.blocked) return badRequest(loaded.blocked);
  const { order } = loaded;

  const body = await req.json().catch(() => ({}));
  const lineId = String(body?.salesOrderLineId || '').trim();
  if (!lineId) return badRequest('กรุณาระบุบรรทัดสินค้า');
  const line = order.lines.find((row) => row.id === lineId);
  if (!line) return badRequest('ไม่พบบรรทัดสินค้านี้ในใบสั่งขาย');

  let spec = null;
  if (line.productId) {
    const specRes = await loadSpecRecord(supabase, line.productId);
    if (specRes.error) return fail(`อ่านสเปคสินค้าไม่สำเร็จ: ${specRes.error}`, 500);
    spec = specRes.spec;
  }

  /* ⚠️ กันกดซ้ำก่อนถึงฐาน — unique index ของ 0370 กันอีกชั้น แต่ RPC ที่ชนกลางทางอ่านยาก
     และด่านที่อ่านไม่ขึ้นต้องไม่ "เปิดเอง" (query ล้ม = 500 ไม่ใช่ถือว่ายังไม่มีเอกสาร) */
  const existingRes = await supabase.from('product_spec_documents')
    .select('id, docNo, status')
    .eq('salesOrderLineId', lineId)
    .neq('status', 'void')
    .limit(1);
  if (existingRes.error) return fail(`ตรวจเอกสารเดิมของบรรทัดไม่สำเร็จ: ${existingRes.error.message}`, 500);
  const existingDocument = existingRes.data?.[0] || null;

  const gate = documentCreateGate({
    user,
    salesOrder: order,
    line,
    spec,
    existingDocument,
    scopeReason: productSpecScopeReason({ fgCode: line.fgCode }),
  });
  if (!gate.visible) return forbidden('ออกใบสเปคสินค้าได้เฉพาะ AC');
  if (gate.reason) return existingDocument ? conflict(gate.reason) : badRequest(gate.reason);

  const created = await createSpecDocument(supabase, {
    spec,
    product: { id: line.productId },
    order,
    line,
    user,
  });
  if (created.error) return fail(created.error, created.status || 500);

  // ⚠️ after = แถวเต็มทั้งเอกสารและ Rev.00 — เลขที่ออกนอกบริษัทแล้ว ต้องตามรอยได้ว่าใครออกเมื่อไร
  await recordAudit({
    user,
    action: 'create',
    entityType: 'product_spec_document',
    entityId: created.document.id,
    before: null,
    after: { document: created.document, revision: created.revision },
    summary: `issue ${created.document.docNo} Rev.00 for ${order.orderNumber || order.id} line ${line.fgCode || line.id}`,
    request: req,
  });

  return ok({ document: created.document, revision: created.revision }, 201);
});
