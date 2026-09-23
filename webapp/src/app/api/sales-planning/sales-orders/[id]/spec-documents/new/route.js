/* ── หน้า "ออกเอกสาร" FM-SA-04 — เอกสารที่จะออกจากบรรทัด SO หนึ่งบรรทัด + ด่าน (อ่านอย่างเดียว) ──
 *
 * GET /api/sales-planning/sales-orders/[id]/spec-documents/new?line=<salesOrderLineId>
 *   ⇒ { order, line, product, quantity, dealOwner, spec, illustrationCount, scopeReason, gate, existingDocument, canEditSpec }
 *
 * ⭐ **มติเจ้าของ 23/09/2569** "การสร้างเอกสาร ยังไม่ต้องรันอะไร จนกว่าจะบันทึก เอาแบบ คำร้อง แบบใบเสนอราคา"
 *   การ์ดบนหน้า SO พาไปหน้า `/sales-planning/spec-documents/new` (ยังไม่บันทึก) · หน้านั้นอ่านเส้นนี้เส้นเดียว
 *   แล้วเลขที่ถูกใช้ตอนกด "บันทึก" (`POST .../spec-documents`) เท่านั้น
 * 🔴 **เส้นนี้ห้ามเขียนอะไรเลย** — ไม่ insert/update/rpc (เปิดหน้าแล้วกดยกเลิกต้องไม่เหลืออะไรในฐาน ·
 *    เทสต์ซอร์สล็อกไว้ใน specDocumentRoutes.test.mjs)
 * ⚠️ **ด่านชุดเดียวกับการออกเลขจริง** — ตัวโหลดใบ/บรรทัด (`loadSpecDocOrder`) · สเปค (`loadSpecRecord`) ·
 *    เอกสารเดิมของบรรทัด (`loadLiveDocumentForLine`) · ตัวตัดสิน (`documentCreateGate` พร้อม scopeReason รูปเดียวกับ
 *    POST) ⇒ หน้าบอกว่า "บันทึกได้" เมื่อไร POST ก็รับเมื่อนั้น (ต่างกันได้แค่ของที่เปลี่ยนระหว่างเปิดหน้ากับกดบันทึก)
 * ⚠️ ขอบเขตโหมด view (อ่าน) — คนที่ผ่านด่านออกเอกสารได้ (AC · admin) มีขอบเขตดู = ขอบเขตแก้ของใบสั่งขาย
 *    (`salesPlanningViewScope`/`EditScope`: ac = team ทั้งคู่ · admin = all) ⇒ ไม่มีกรณี "หน้าบอกออกได้ แต่ POST 403"
 * ⚠️ คอลัมน์ที่ตอบออกไปเลือกเองทุกช่อง — ไม่ส่งแถว SO ทั้งแถว (ยอดเงิน · metadata) ให้จอ
 */
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { productSpecScopeReason } from '@/lib/sales/productSpecScope';
import { documentCreateGate } from '@/lib/sales/productSpecDocWorkflow';
import { SPEC_CONTENT_FIELDS, canEditProductSpec } from '@/lib/sales/productSpecWorkflow';
import { loadSpecDocOrder, specDocLineView } from '@/lib/sales/productSpecDocOrder';
import {
  loadDealOwner, loadDocumentQuantity, loadLiveDocumentForLine, loadOrderQuotation, loadProductPrintFields,
  loadSpecIllustrations, loadSpecRecord, specDocQuotationNumber,
} from '@/lib/sales/productSpecStore';
import { formatSpecDocNo } from '@/lib/sales/productSpecDocNo';

export const dynamic = 'force-dynamic';

const SPEC_ITEM_FIELDS = ['id', 'sortOrder', 'itemKey', 'itemLabel', 'detail', 'preparedByS', 'preparedByCustomer', 'note'];

/* สเปคในรูปที่ `docContentSummary` อ่าน (ช่องเนื้อหา · ใบรับรอง · checklist) — ไม่ส่งคอลัมน์ระบบอื่น */
const specView = (spec) => ({
  id: spec.id,
  productId: spec.productId,
  updatedAt: spec.updatedAt || null,
  updatedByName: spec.updatedByName || null,
  ...Object.fromEntries(SPEC_CONTENT_FIELDS.map((field) => [field, spec[field] ?? null])),
  certifications: Array.isArray(spec.certifications) ? spec.certifications : [],
  items: (spec.items || []).map((row) => Object.fromEntries(SPEC_ITEM_FIELDS.map((field) => [field, row[field] ?? null]))),
});

const productView = (product) => ({
  id: product.id,
  fgCode: product.fgCode || null,
  productDescription: product.productDescription || null,
  productDescriptionEn: product.productDescriptionEn || null,
  brandName: product.brandName || null,
  brandNameEn: product.brandNameEn || null,
  categoryName: product.categoryName || null,
  volumeText: product.volumeText || null,
});

export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  /* ด่านหยาบก่อนแตะฐาน — ขอบเขตใบสั่งขาย 'none' ผ่าน loadScoped ไม่ได้อยู่แล้ว · ⚠️ ไม่แคบกว่าหน้าใบสั่งขาย
     (ทุก role ที่เห็นใบถือ cap นี้) · สิทธิ์ออกเอกสารจริงตัดสินที่ `documentCreateGate` ข้างล่าง */
  if (!canViewSalesPlanning(user)) return forbidden('คุณไม่มีสิทธิ์เปิดใบสั่งขายนี้');
  const { id } = await ctx.params;
  const lineId = String(new URL(req.url).searchParams.get('line') || '').trim();
  if (!lineId) return badRequest('กรุณาระบุบรรทัดสินค้า');

  const loaded = await loadSpecDocOrder(supabase, id, user, 'view');
  if (loaded.response) return loaded.response;
  if (loaded.error) return fail(`อ่านบรรทัดใบสั่งขายไม่สำเร็จ: ${loaded.error}`, 500);
  if (loaded.blocked) return badRequest(loaded.blocked);
  const { order } = loaded;
  const line = order.lines.find((row) => row.id === lineId);
  if (!line) return notFound('ไม่พบบรรทัดสินค้านี้ในใบสั่งขาย — ใบอาจออก Rev. ใหม่แล้ว กลับไปเปิดจากหน้าใบสั่งขาย');

  let spec = null;
  if (line.productId) {
    const specRes = await loadSpecRecord(supabase, line.productId);
    if (specRes.error) return fail(`อ่านสเปคสินค้าไม่สำเร็จ: ${specRes.error}`, 500);
    spec = specRes.spec;
  }
  const existingRes = await loadLiveDocumentForLine(supabase, line.id);
  if (existingRes.error) return fail(`ตรวจเอกสารเดิมของบรรทัดไม่สำเร็จ: ${existingRes.error}`, 500);
  const existing = existingRes.document;

  // scopeReason รูปเดียวกับ POST (หมวดสินค้าอย่างเดียว) — บรรทัดไม่ผูกสินค้าเป็นเหตุของ documentCreateGate เอง
  const scopeReason = productSpecScopeReason({ fgCode: line.fgCode });
  const gate = documentCreateGate({
    user, salesOrder: order, line, spec, existingDocument: existing, scopeReason,
  });

  const orderView = {
    id: order.id,
    orderNumber: order.orderNumber || null,
    status: order.status || null,
    quotationId: order.quotationId || null,
    quotationNumber: order.metadata?.quoteNumber || null,
    customerId: order.customerId || null,
    customerName: order.customerName || null,
    deliveryDueDate: order.deliveryDueDate || null,
    docLanguage: order.docLanguage === 'en' ? 'en' : 'th',
  };
  // ไม่มีสิทธิ์ออก = จอขึ้นแค่คำบอก (ui-visibility-rule) ⇒ ไม่ต้องอ่านของที่จอไม่วาด
  if (!gate.visible) {
    return ok({ order: orderView, line: specDocLineView(line), gate, existingDocument: null, spec: null });
  }

  /* ของที่กระดาษจะพิมพ์ — ตัวอ่านชุดเดียวกับภาพนิ่ง (`buildDocumentSnapshot`) ⇒ จอกับกระดาษร่างพูดเลขเดียวกัน
     ⚠️ อ่านล้ม = 500 ไม่ใช่ขีด — จอที่บอก "จำนวนผลิต —" ทั้งที่มีจำนวนจริง คือจอที่โกหกก่อนกดบันทึก */
  let product = null;
  if (line.productId) {
    const printed = await loadProductPrintFields(supabase, line.productId);
    if (printed.error && printed.status !== 404) return fail(`อ่านสินค้าไม่สำเร็จ: ${printed.error}`, 500);
    product = printed.product ? productView(printed.product) : null;
  }
  const quote = order.metadata?.quoteNumber ? { quotation: null } : await loadOrderQuotation(supabase, order);
  if (quote.error) return fail(quote.error, 500);
  const quantity = await loadDocumentQuantity(supabase, { order, line, productId: line.productId });
  if (quantity.error) return fail(quantity.error, 500);
  const owner = await loadDealOwner(supabase, order);
  if (owner.error) return fail(`อ่าน AE เจ้าของดีลไม่สำเร็จ: ${owner.error}`, 500);
  /* จำนวนภาพที่จะถูกถ่ายลงเอกสารตอนยื่น — ตัวอ่านเดียวกับภาพนิ่ง (`loadSpecIllustrations`) ⇒ จอนับชุดเดียวกับกระดาษ
     🐞 ผลตรวจสด 23/09: การ์ด "ภาพประกอบ" บนจอเขียนแค่ "อยู่ที่หน้าสเปคของสินค้า" ขณะที่กระดาษร่างพิมพ์ครบ 5 ภาพ
        ⇒ คนที่อ่านแต่จอแล้วกดบันทึก ไม่เคยรู้ว่ามีภาพอะไรจะไปอยู่บนเอกสาร (จอนี้เป็นจุดตัดสินใจ ไม่ใช่จอรายงาน) */
  let illustrationCount = null;
  if (spec && line.productId) {
    const ill = await loadSpecIllustrations(supabase, line.productId);
    if (ill.error) return fail(`อ่านภาพประกอบของสเปคไม่สำเร็จ: ${ill.error}`, 500);
    illustrationCount = ill.illustrations.length;
  }

  return ok({
    order: { ...orderView, quotationNumber: specDocQuotationNumber(order, quote.quotation) },
    line: specDocLineView(line),
    product,
    quantity: { qty: quantity.qty ?? null, unit: quantity.unit || null, source: quantity.source || null },
    dealOwner: owner.dealOwner ? { id: owner.dealOwner.id, name: owner.dealOwner.name || null } : null,
    spec: spec ? specView(spec) : null,
    illustrationCount,
    scopeReason,
    gate,
    existingDocument: existing
      ? { id: existing.id, docNo: existing.docNo || null, docNoText: existing.docNo ? formatSpecDocNo(existing.docNo, null) : null, status: existing.status }
      : null,
    canEditSpec: canEditProductSpec(user.role),
  });
});
