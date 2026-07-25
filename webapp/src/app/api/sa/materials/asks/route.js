// ── API เคสขอราคาวัสดุ (mig 0158) — รายการ + เปิดเคส ────────────────────
// GET  : เซลเห็นเคสของตัวเอง · RD/PC เห็นคิวของฝ่ายตน · admin เห็นทั้งหมด
// POST : เปิดเคสเป็น "ร่าง" (ยังไม่ออกเลข — ร่างที่ถูกทิ้งจะได้ไม่กินเลขจนขาดช่วง)
//
// ⚠️ ทุกรายการในเคสผูก materialId เสมอ: ของใหม่จะสร้างวัสดุ "ร่าง" ในทะเบียนให้ก่อน
// แล้วผูก id — นี่คือจุดที่ปิดบั๊ก "ตอบคำขอทีไรก็เกิดวัสดุตัวใหม่" ที่รากของมัน
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canUser, canViewCosting, isSuperuser } from '@/lib/permissions';
import { canQuoteMaterial, sourceDeptForMaterialKind } from '@/lib/materialPrices';
import { normalizeAskItems } from '@/lib/materialAsks';
import { ensureMaterial, findAsk, loadAsks } from '@/lib/materialPricesAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/sa/materials/asks?status=pending,acknowledged&mine=1
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const status = statusParam ? statusParam.split(',').filter(Boolean) : null;

    // ขอบเขตที่เห็น: admin ทั้งหมด · RD/PC คิวของฝ่ายตน + เคสที่ตัวเองเปิด ·
    // เซลเฉพาะเคสที่ตัวเองเปิด (เคสขอราคาเป็นงานปฏิบัติของคนเปิด ไม่ใช่ของทั้งทีม)
    // _mine: ฝั่ง client ไม่รู้ user id ของตัวเอง (roleContext มีแค่ role/team/ฝ่าย)
    // จึงติดธงมาจาก server ให้แท็บ "เคสของฉัน" แยกได้โดยไม่ต้องเดาจากชื่อ
    const withMine = (rows) => rows.map((a) => ({ ...a, _mine: a.requestedById === user?.id }));

    if (isSuperuser(user?.role)) {
      const all = await loadAsks(supabase, { status });
      return Response.json(withMine(all), { headers: { 'Cache-Control': 'no-store' } });
    }
    const mine = await loadAsks(supabase, { status, requestedById: user?.id || '—' });
    const dept = ['RD', 'PC'].find((d) => canQuoteMaterial(user, d));
    if (!dept) return Response.json(withMine(mine), { headers: { 'Cache-Control': 'no-store' } });

    const queue = await loadAsks(supabase, { status, dept });
    const byId = new Map([...queue, ...mine].map((a) => [a.id, a]));
    // ร่างของคนอื่นยังไม่ถูกส่ง = ยังไม่ใช่งานของฝ่าย ไม่ควรโผล่ในคิว
    const rows = [...byId.values()]
      .filter((a) => a.status !== 'draft' || a.requestedById === user?.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return Response.json(withMine(rows), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sa/materials/asks
// { dept, customerId?, customerName?, productId?, formulaCode?, costingRequestId?, note,
//   items: [{ kind, materialId?, label, spec?, componentId?, tiers: [qty…] }] }
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!canUser(user, 'costing:edit') && !canQuoteMaterial(user, 'RD') && !canQuoteMaterial(user, 'PC')) {
    return Response.json({ error: 'ไม่มีสิทธิ์เปิดเคสขอราคา' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  // ฝ่ายผู้ตอบมาจากชนิดของรายการแรกเสมอ — ไม่ให้ client กำหนดเองแล้วส่งผิดฝ่าย
  const firstKind = body.items?.[0]?.kind;
  const dept = firstKind ? sourceDeptForMaterialKind(firstKind) : null;
  if (!dept) return Response.json({ error: 'ต้องมีรายการอย่างน้อย 1 รายการ' }, { status: 400 });

  const { items, error } = normalizeAskItems(body.items, { dept });
  if (error) return Response.json({ error }, { status: 400 });

  const askId = `MPA-${randomUUID()}`;
  const nowIso = new Date().toISOString();
  const customerId = body.customerId || null;

  try {
    // 1) ทุกรายการต้องมีวัสดุในทะเบียน — ของใหม่เข้าเป็นร่างรอ RD/PC รับ
    const resolved = [];
    for (const item of items) {
      if (item.materialId) { resolved.push(item); continue; }
      const { material } = await ensureMaterial(supabase, {
        kind: item.kind,
        label: item.label,
        customerId,
        customerName: body.customerName || null,
        // เซลเสนอได้แต่ตัววัสดุ (ร่าง); ถ้าคนเปิดเคสเป็น RD/PC ของฝ่ายนั้นเองก็รับเข้าเลย
        status: canQuoteMaterial(user, item.kind) ? 'active' : 'draft',
        user,
      });
      resolved.push({ ...item, materialId: material.id });
    }

    // 2) หัวเคส
    const { error: askError } = await supabase.from('material_price_asks').insert({
      id: askId,
      dept,
      status: 'draft',
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
      team: user?.team ?? null,
      note: body.note ? String(body.note).trim().slice(0, 2000) : null,
    });
    if (askError) throw askError;

    // 3) รายการ + ชั้นจำนวนที่ขอ
    const itemRows = resolved.map((item) => ({
      id: `MAI-${randomUUID()}`,
      askId,
      sortOrder: item.sortOrder,
      kind: item.kind,
      materialId: item.materialId,
      label: item.label,
      spec: item.spec,
      componentId: item.componentId,
    }));
    const { error: itemError } = await supabase.from('material_price_ask_items').insert(itemRows);
    if (itemError) {
      await supabase.from('material_price_asks').delete().eq('id', askId);
      throw itemError;
    }

    const tierRows = resolved.flatMap((item, idx) => item.tiers.map((qty) => ({
      id: `MAT-${randomUUID()}`,
      askItemId: itemRows[idx].id,
      qty,
    })));
    if (tierRows.length) {
      const { error: tierError } = await supabase.from('material_price_ask_tiers').insert(tierRows);
      if (tierError) {
        await supabase.from('material_price_asks').delete().eq('id', askId);
        throw tierError;
      }
    }

    const created = await findAsk(supabase, askId);
    await recordAudit({
      user, action: 'create', entityType: 'material_price_ask', entityId: askId, after: created,
      summary: `เปิดเคสขอราคา ${items.length} รายการ ถึงฝ่าย ${dept} (ร่าง)`, request,
    });
    return Response.json(created, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
