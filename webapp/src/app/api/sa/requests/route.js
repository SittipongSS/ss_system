// ── API คำร้องข้ามฝ่าย (mig 0173) — รายการ + เปิดคำร้อง ─────────────────
// GET  : ผู้ขอเห็นของตัวเอง · RD/PC เห็นคิวของฝ่ายตน · admin เห็นทั้งหมด
// POST : เปิดเป็น "ร่าง" (ยังไม่ออกเลข — ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง)
//
// ⚠️ ชนิดคำร้องคุมทุกกฎ (lib/master/requestTypes.js): ชนิดไหนมีบรรทัด ชนิดไหน
// บังคับดีล ชนิดไหนต้องอ้างกลิ่น/สูตร — handler ไม่ตัดสินเอง เรียก requestShapeError
//
// ⚠️ ชนิดขอราคา: ทุกรายการผูก materialId เสมอ — ของใหม่จะสร้างวัสดุ "ร่าง" ใน
// ทะเบียนให้ก่อนแล้วผูก id (จุดที่ปิดบั๊ก "ตอบคำขอทีไรก็เกิดวัสดุตัวใหม่")
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser, canViewCosting, isSuperuser } from '@/lib/permissions';
import { canQuoteMaterial } from '@/lib/materialPrices';
import { normalizeRequestItems } from '@/lib/deptRequests';
import {
  deptForRequest, requestHasItems, requestKindLabel, requestShapeError, requestStepKey,
} from '@/lib/master/requestTypes';
import { ensureMaterial, findRequest, loadRequests } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sa/requests?status=pending,acknowledged&dealId=D-1
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const status = statusParam ? statusParam.split(',').filter(Boolean) : null;
    const dealId = url.searchParams.get('dealId');

    // _mine: ฝั่ง client ไม่รู้ user id ของตัวเอง (roleContext มีแค่ role/team/ฝ่าย)
    // จึงติดธงมาจาก server ให้แท็บ "คำร้องของฉัน" แยกได้โดยไม่ต้องเดาจากชื่อ
    const decorate = (rows) => rows
      .filter((r) => !dealId || r.dealId === dealId)
      .map((r) => ({ ...r, _mine: r.requestedById === user?.id }));

    // ขอบเขตที่เห็น: admin ทั้งหมด · RD/PC คิวของฝ่ายตน + ของที่ตัวเองเปิด ·
    // ผู้ขอเฉพาะของตัวเอง (คำร้องเป็นงานปฏิบัติของคนเปิด ไม่ใช่ของทั้งทีม)
    if (isSuperuser(user?.role)) {
      return Response.json(decorate(await loadRequests(supabase, { status })),
        { headers: { 'Cache-Control': 'no-store' } });
    }
    const mine = await loadRequests(supabase, { status, requestedById: user?.id || '—' });
    const dept = ['RD', 'PC'].find((d) => canQuoteMaterial(user, d));
    if (!dept) return Response.json(decorate(mine), { headers: { 'Cache-Control': 'no-store' } });

    const queue = await loadRequests(supabase, { status, dept });
    const byId = new Map([...queue, ...mine].map((r) => [r.id, r]));
    // ร่างของคนอื่นยังไม่ถูกส่ง = ยังไม่ใช่งานของฝ่าย ไม่ควรโผล่ในคิว
    const rows = [...byId.values()]
      .filter((r) => r.status !== 'draft' || r.requestedById === user?.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return Response.json(decorate(rows), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sa/requests
// { kind, dept?, title?, body?, urgent?, dealId?, projectId?, scentId?, formulaId?,
//   customerId?, customerName?, productId?, costingRequestId?, requestedDueDate?, note,
//   items?: [{ kind, materialId?, label, spec?, componentId?, tiers: [qty…] }] }
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!canUser(user, 'costing:edit') && !canQuoteMaterial(user, 'RD') && !canQuoteMaterial(user, 'PC')) {
    return Response.json({ error: 'ไม่มีสิทธิ์เปิดคำร้อง' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const kind = body.kind;

  // ด่านตามชนิด — ที่เดียวของระบบ (หัวเรื่อง/ดีล/กลิ่น/สูตร/บรรทัด)
  const shapeError = requestShapeError(kind, body);
  if (shapeError) return Response.json({ error: shapeError }, { status: 400 });

  // ฝ่ายผู้ตอบ: ชนิดที่ล็อกไว้ใช้ค่านั้น · ชนิดที่ไม่ล็อกอนุมานจากรายการ/ที่ผู้ขอเลือก
  const dept = deptForRequest(kind, { dept: body.dept, items: body.items });
  if (!dept) return Response.json({ error: 'ต้องระบุฝ่ายที่ต้องการให้ตอบ' }, { status: 400 });

  let items = [];
  if (requestHasItems(kind)) {
    const normalized = normalizeRequestItems(body.items, { dept });
    if (normalized.error) return Response.json({ error: normalized.error }, { status: 400 });
    items = normalized.items;
  }

  const requestId = `DR-${randomUUID()}`;
  const customerId = body.customerId || null;

  try {
    // 1) ชนิดขอราคา: ทุกรายการต้องมีวัสดุในทะเบียน — ของใหม่เข้าเป็นร่างรอ RD/PC รับ
    const resolved = [];
    for (const item of items) {
      if (item.materialId) { resolved.push(item); continue; }
      const { material } = await ensureMaterial(supabase, {
        kind: item.kind,
        label: item.label,
        customerId,
        customerName: body.customerName || null,
        // ผู้ขอเสนอได้แต่ตัววัสดุ (ร่าง); ถ้าคนเปิดเป็น RD/PC ของฝ่ายนั้นเองก็รับเข้าเลย
        status: canQuoteMaterial(user, item.kind) ? 'active' : 'draft',
        user,
      });
      resolved.push({ ...item, materialId: material.id });
    }

    // 2) หัวคำร้อง — stepKey มาจากชนิด ไม่ใช่จาก client (กันปักหมุดผิดขั้น)
    const { error: headError } = await supabase.from('dept_requests').insert({
      id: requestId,
      kind,
      dept,
      status: 'draft',
      title: body.title ? String(body.title).trim().slice(0, 200) : null,
      body: body.body ? String(body.body).trim().slice(0, 4000) : null,
      urgent: !!body.urgent,
      dealId: body.dealId || null,
      projectId: body.projectId || null,
      stepKey: requestStepKey(kind),
      scentId: body.scentId || null,
      formulaId: body.formulaId || null,
      customerId,
      customerName: body.customerName || null,
      productId: body.productId || null,
      productName: body.productName || null,
      formulaCode: body.formulaCode || null,
      formulaName: body.formulaName || null,
      formulaDate: body.formulaDate || null,
      costingRequestId: body.costingRequestId || null,
      requestedById: user?.id ?? null,
      requestedByName: user?.name ?? null,
      requestedDueDate: body.requestedDueDate || null,
      team: user?.team ?? null,
      note: body.note ? String(body.note).trim().slice(0, 2000) : null,
    });
    if (headError) throw headError;

    // 3) รายการ + ชั้นจำนวนที่ขอ (เฉพาะชนิดที่มีบรรทัด)
    if (resolved.length) {
      const itemRows = resolved.map((item) => ({
        id: `DRI-${randomUUID()}`,
        requestId,
        sortOrder: item.sortOrder,
        kind: item.kind,
        materialId: item.materialId,
        label: item.label,
        spec: item.spec,
        componentId: item.componentId,
      }));
      const { error: itemError } = await supabase.from('dept_request_items').insert(itemRows);
      if (itemError) {
        await supabase.from('dept_requests').delete().eq('id', requestId);
        throw itemError;
      }

      const tierRows = resolved.flatMap((item, idx) => item.tiers.map((qty) => ({
        id: `DRT-${randomUUID()}`,
        requestItemId: itemRows[idx].id,
        qty,
      })));
      if (tierRows.length) {
        const { error: tierError } = await supabase.from('dept_request_item_tiers').insert(tierRows);
        if (tierError) {
          await supabase.from('dept_requests').delete().eq('id', requestId);
          throw tierError;
        }
      }
    }

    const created = await findRequest(supabase, requestId);
    await recordAudit({
      user, action: 'create', entityType: 'dept_request', entityId: requestId, after: created,
      summary: `เปิดคำร้อง "${requestKindLabel(kind)}" ถึงฝ่าย ${dept} (ร่าง)`, request,
    });
    return Response.json(created, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
