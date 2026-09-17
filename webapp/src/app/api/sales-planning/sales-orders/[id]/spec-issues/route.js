/* ── ออกเอกสารใบสเปคสินค้าตามใบสั่งขาย (mig 0364) ────────────────────────────
 *
 * ⭐ **หน้า SO เป็นด่านปลดล็อก ไม่ใช่บ้านของใบ** (มติผู้ใช้ 2026-09-17)
 * เส้นนี้ตอบสองอย่าง: บรรทัดไหนต้องทำอะไรต่อ (GET) และออกเลขที่เอกสารรอบนี้ (POST)
 *
 * ⚠️ **เลขที่เอกสารออกใหม่ทุกครั้งที่ออกตาม SO · Rev. ขยับเฉพาะตอนสเปกเปลี่ยน**
 * สองเลขคนละแกน (ดูหัวไฟล์ mig 0364) — สลับกันเมื่อไร Rev. จะกลายเป็นตัวนับจำนวน
 * ครั้งที่ขาย แล้วประวัติสเปกหายไปทั้งเส้น
 */
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { loadScoped } from '@/lib/scopedRow';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import { productSpecScopeReason } from '@/lib/sales/productSpecScope';
import { productSpecIssueBlock, productSpecLineState } from '@/lib/sales/productSpecWorkflow';
import { issueProductSpec, latestRevisionOf, loadProductSpec } from '@/lib/sales/productSpecStore';

export const dynamic = 'force-dynamic';

/* โหลด + ตรวจขอบเขตในจังหวะเดียว (`loadScoped` — กฎ 6 ของด่านรายแถว) แล้วค่อยต่อ
   บรรทัดสินค้า · บรรทัดไม่ได้ scope เอง มันสังกัดใบที่ผ่านด่านมาแล้ว
   🛑 **ใบย้อนหลังออกใบสเปคไม่ได้** — ใบที่คีย์จากชีตคือของที่ส่งไปแล้วในอดีต
      ไม่มี "รอบขายที่กำลังจะส่ง" ให้ตกลงสเปก · ปล่อยผ่านเมื่อไรจะกินเลขที่เอกสาร
      ของเดือนนี้ไปกับใบที่ไม่มีใครใช้ (มติข้อ 21 ของสาย SO ย้อนหลัง) */
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
    .from('sales_order_lines').select('*').eq('salesOrderId', id)
    .order('sortOrder', { ascending: true })
    .order('id', { ascending: true }));
  if (lines.error) return { error: lines.error.message };
  return { order: { ...order, lines: lines.data || [] } };
}

/* บรรทัดที่อยู่ในขอบเขต + ใบของสินค้าแต่ละตัว — ตัวเดียวที่ทั้ง GET และ POST ใช้ */
async function specsForOrder(supabase, order) {
  const lines = [...(order.lines || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const issuesRes = await supabase
    .from('product_spec_issues')
    .select('*')
    .eq('salesOrderId', order.id);
  if (issuesRes.error) return { error: issuesRes.error.message };
  const issueByLine = new Map(
    (issuesRes.data || [])
      .filter((row) => row.status !== 'void' && row.salesOrderLineId)
      .map((row) => [row.salesOrderLineId, row]),
  );

  /* ⚠️ ไล่ทีละสินค้า ไม่ยิงรวมด้วย `.in()` — บรรทัดต่อใบเป็นหลักหน่วยถึงหลักสิบ
     และแต่ละใบต้องอ่านฉบับ + checklist ของตัวเองอยู่แล้ว (ไม่มีอะไรให้รวบ) */
  const rows = [];
  for (const line of lines) {
    const scopeReason = productSpecScopeReason({ fgCode: line.fgCode });
    if (scopeReason || !line.productId) {
      rows.push({
        line,
        state: productSpecLineState({
          line,
          scopeReason: scopeReason || 'บรรทัดนี้ไม่ได้ผูกสินค้าในทะเบียน',
        }),
      });
      continue;
    }
    const spec = await loadProductSpec(supabase, line.productId);
    if (spec.error) return { error: spec.error };
    rows.push({
      line,
      spec: spec.spec,
      revisions: spec.revisions,
      state: productSpecLineState({
        line,
        spec: spec.spec,
        latestRevision: latestRevisionOf(spec.revisions),
        issue: issueByLine.get(line.id) || null,
        salesOrder: order,
      }),
    });
  }
  return { rows };
}

/* ── GET: บรรทัดไหนต้องทำอะไรต่อ ──────────────────────────────────────── */
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const loaded = await loadOrder(supabase, id, user, 'view');
  if (loaded.response) return loaded.response;
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.blocked) return badRequest(loaded.blocked);

  const result = await specsForOrder(supabase, loaded.order);
  if (result.error) return fail(`อ่านสถานะใบสเปคไม่สำเร็จ: ${result.error}`, 500);
  return ok({ orderStatus: loaded.order.status, rows: result.rows });
});

/* ── POST: ออกเอกสารรอบนี้ของบรรทัดหนึ่งบรรทัด ────────────────────────── */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const loaded = await loadOrder(supabase, id, user, 'edit');
  if (loaded.response) return loaded.response;
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.blocked) return badRequest(loaded.blocked);
  const order = loaded.order;

  const body = await req.json().catch(() => ({}));
  const lineId = String(body.salesOrderLineId || '').trim();
  if (!lineId) return badRequest('กรุณาระบุบรรทัดสินค้า');
  const line = (order.lines || []).find((row) => row.id === lineId);
  if (!line) return badRequest('ไม่พบบรรทัดสินค้านี้ในใบสั่งขาย');

  const scopeReason = productSpecScopeReason({ fgCode: line.fgCode });
  if (scopeReason) return badRequest(scopeReason);
  if (!line.productId) return badRequest('บรรทัดนี้ไม่ได้ผูกสินค้าในทะเบียน');

  const spec = await loadProductSpec(supabase, line.productId);
  if (spec.error) return fail(spec.error, 500);
  const latest = latestRevisionOf(spec.revisions);
  const blocked = productSpecIssueBlock(spec.spec, latest, { role: user.role, salesOrder: order });
  if (blocked) return badRequest(blocked);

  /* ⚠️ กันกดซ้ำก่อนถึงฐาน — unique index ของ 0364 กันอีกชั้น แต่ error ของ Postgres
     อ่านไม่ออกสำหรับคนกด และการชน constraint **กินเลขจากตัวนับไปแล้ว** */
  const existing = await supabase.from('product_spec_issues')
    .select('id, docNo, status').eq('salesOrderLineId', lineId).neq('status', 'void').maybeSingle();
  if (existing.error) return fail(existing.error.message, 500);
  if (existing.data) return badRequest(`บรรทัดนี้ออกเอกสารไปแล้ว (${existing.data.docNo})`);

  const product = await supabase.from('products')
    .select('productDescription, brandName, fgCode').eq('id', line.productId).maybeSingle();
  if (product.error) return fail(product.error.message, 500);

  const issued = await issueProductSpec(supabase, {
    specId: spec.spec.id,
    user,
    snapshot: {
      salesOrderId: order.id,
      salesOrderLineId: line.id,
      orderNumber: order.orderNumber,
      quotationNumber: order.metadata?.quoteNumber || null,
      qty: line.qty != null ? String(line.qty) : null,
      unit: line.unit || null,
      deliveryDueDate: order.deliveryDueDate || null,
      customerName: order.customerName || null,
      brandName: product.data?.brandName || null,
      productName: product.data?.productDescription || line.description || null,
      fgCode: line.fgCode || product.data?.fgCode || null,
    },
  });
  if (issued.error) return fail(`ออกเอกสารไม่สำเร็จ: ${issued.error}`, 500);

  await recordAudit({
    user, action: 'create', entityType: 'product_spec_issue', entityId: issued.issue?.id,
    before: null, after: issued.issue,
    summary: `issue ${issued.issue?.docNo} for ${order.orderNumber}`, request: req,
  });
  return ok(issued.issue, 201);
});
