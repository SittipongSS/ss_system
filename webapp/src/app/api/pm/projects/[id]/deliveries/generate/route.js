// ── กางรายการของเข้าจากใบขอราคาผลิต (มติ 13, mig 0176) ──────────────────
//
// บรรทัดวัสดุของใบ CR ที่อนุมัติแล้ว = รายการที่ "ต้องสั่งจริง" อยู่แล้ว — ให้ PC
// พิมพ์ซ้ำทีละแถวคือทางที่ข้อมูลจะไม่ตรงกันตั้งแต่วันแรก
//
// ⚠️ กดซ้ำต้องไม่ได้แถวซ้ำ — กันด้วย unique (projectId, componentId) ที่ระดับ DB
//    ที่นี่กรองของที่มีแล้วออกก่อน เพื่อให้กดซ้ำ "เงียบ ๆ แล้วบอกว่าข้ามไปกี่แถว"
//    แทนที่จะเด้ง error ให้ผู้ใช้งงว่าตกลงกางสำเร็จหรือไม่
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { deliveriesFromComponents } from '@/lib/pm/deliveries';
import { requireProject } from '@/lib/pm/deliveriesRepo';

export const dynamic = 'force-dynamic';

// ใบที่ "ของถูกสั่งจริงแน่แล้ว" — ก่อนอนุมัติยังต่อรอง/เปลี่ยนวัสดุได้อยู่
const SOURCE_STATUSES = ['approved', 'linked'];

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  const access = await requireProject({ user, supabase, id, edit: true });
  if (access.response) return access.response;
  const project = access.project;
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);

  try {
    // ใบขอราคาผลิตของโครงการนี้ที่อนุมัติแล้ว (ใบผูก dealId เสมอ แต่ projectId
    // เป็น optional → หาจากทั้งสองทางเพื่อไม่ให้ใบเก่าที่ยังไม่มี projectId ตกหล่น)
    const { data: deals } = await supabase
      .from('sales_deals').select('id').eq('projectId', project.id);
    const dealIds = (deals || []).map((d) => d.id);

    let query = supabase.from('costing_requests')
      .select('id, docNo, dealId, status').in('status', SOURCE_STATUSES);
    query = dealIds.length
      ? query.or(`projectId.eq.${project.id},dealId.in.(${dealIds.join(',')})`)
      : query.eq('projectId', project.id);
    const { data: requests, error: reqError } = await query;
    if (reqError) throw reqError;
    if (!requests?.length) {
      return badRequest('ยังไม่มีใบขอราคาผลิตที่อนุมัติแล้วในโครงการนี้ — กางรายการไม่ได้');
    }

    // บรรทัดวัสดุของใบเหล่านั้น (ผ่าน items → components)
    const { data: items, error: itemError } = await supabase
      .from('costing_request_items').select('id, requestId')
      .in('requestId', requests.map((r) => r.id));
    if (itemError) throw itemError;
    if (!items?.length) return badRequest('ใบขอราคาผลิตยังไม่มีรายการสินค้า');

    const requestByItem = new Map(items.map((i) => [i.id, i.requestId]));
    const { data: components, error: compError } = await supabase
      .from('costing_item_components')
      .select('id, itemId, kind, label, unitBasis')
      .in('itemId', items.map((i) => i.id))
      .order('sortOrder', { ascending: true });
    if (compError) throw compError;

    // แถวที่กางไว้แล้ว — อ่านก่อนเพื่อกดซ้ำได้โดยไม่ชน unique index
    const { data: existing, error: existError } = await supabase
      .from('material_deliveries').select('componentId')
      .eq('projectId', project.id).not('componentId', 'is', null);
    if (existError) throw existError;

    const { rows, skipped } = deliveriesFromComponents(components || [], {
      existingComponentIds: (existing || []).map((r) => r.componentId),
    });
    if (!rows.length) {
      return ok({ created: 0, skipped, message: skipped ? 'กางไว้ครบแล้ว ไม่มีรายการใหม่' : 'ใบขอราคาผลิตไม่มีบรรทัดวัสดุที่ต้องรอของเข้า' });
    }

    const nowIso = new Date().toISOString();
    // ดีลของแถว = ดีลของใบต้นทาง (ใบหนึ่งผูกดีลเดียวเสมอ — costing_requests.dealId NOT NULL)
    const dealByRequest = new Map(requests.map((r) => [r.id, r.dealId]));
    const payload = rows.map((row) => {
      const requestId = requestByItem.get(
        (components || []).find((c) => c.id === row.componentId)?.itemId,
      );
      return {
        id: genId('MDL'),
        projectId: project.id,
        dealId: dealByRequest.get(requestId) || null,
        costingRequestId: requestId || null,
        source: 'costing',
        ...row,
        createdById: user?.id ?? null,
        createdByName: user?.name ?? null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    });

    const { data, error: insertError } = await supabase
      .from('material_deliveries').insert(payload).select();
    if (insertError) return fail(insertError.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'material_delivery', entityId: project.id,
      after: { created: data.length },
      summary: `กางรายการของเข้า ${data.length} รายการจากใบขอราคาผลิต`
        + (skipped ? ` (ข้ามที่มีอยู่แล้ว ${skipped})` : ''),
      request: req,
    });
    return ok({ created: data.length, skipped, rows: data }, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
