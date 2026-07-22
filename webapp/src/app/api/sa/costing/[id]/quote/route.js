// RD/PC ตอบราคาบรรทัดของฝ่ายตน (costing:quote — proxy กันชั้นแรกที่ /quote แล้ว)
//
// ด่านสำคัญ: proxy เห็นแค่ role จึงกันได้แค่ "ถือ cap ไหม" — ฝ่ายเจ้าของบรรทัดจริง
// ต้องเช็คที่นี่รายบรรทัด (canQuoteComponent) ไม่งั้น RD กรอกราคาบรรจุภัณฑ์ของ PC ได้
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import {
  canQuoteComponent, canQuoteOnRequest, canViewCostingRequest,
  deriveRequestStatusAfterQuote, pricingProgress,
} from '@/lib/costing';
import { findCostingRequest } from '@/lib/costingAdmin';
import { chatCard, sendChat } from '@/lib/chat';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

function priceFieldFor(component, value) {
  // ราคาต้องลงช่องที่ตรงกับหน่วยของบรรทัด (CHECK ใน 0141 บังคับซ้ำอีกชั้น)
  return component.unitBasis === 'per_kg'
    ? { pricePerKg: value, pricePerUnit: null }
    : { pricePerUnit: value, pricePerKg: null };
}

export async function PATCH(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!canViewCostingRequest(user, before)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!canQuoteOnRequest(before)) {
    return Response.json({ error: 'ใบนี้ไม่อยู่ในขั้นตอนที่ตอบราคาได้' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const entries = Array.isArray(body.prices) ? body.prices : [];
  if (!entries.length) return Response.json({ error: 'ไม่มีราคาที่จะบันทึก' }, { status: 400 });

  const components = new Map(
    (before.items || []).flatMap((item) => (item.components || []).map((c) => [c.id, c])),
  );

  // ตรวจให้ผ่านทั้งชุดก่อนเขียน — กันบันทึกได้ครึ่งเดียวแล้วอีกครึ่งโดนปฏิเสธ
  const updates = [];
  for (const entry of entries) {
    const component = components.get(entry?.componentId);
    if (!component) return Response.json({ error: 'ไม่พบบรรทัดต้นทุนที่ระบุ' }, { status: 404 });
    if (!canQuoteComponent(user, component)) {
      return Response.json({
        error: `ไม่มีสิทธิ์ตอบราคาบรรทัด "${component.label}" — เป็นของฝ่าย ${component.sourceDept || 'ภายใน'}`,
      }, { status: 403 });
    }
    if (entry.price == null || entry.price === '') {
      return Response.json({ error: `บรรทัด "${component.label}": ต้องระบุราคา` }, { status: 400 });
    }
    const price = Number(entry.price);
    if (!Number.isFinite(price) || price < 0) {
      return Response.json({ error: `บรรทัด "${component.label}": ราคาต้องเป็นตัวเลขไม่ติดลบ` }, { status: 400 });
    }
    updates.push({ component, price });
  }

  const nowIso = new Date().toISOString();
  for (const { component, price } of updates) {
    const { error } = await supabase.from('costing_item_components').update({
      ...priceFieldFor(component, price),
      priceStatus: 'quoted',
      quotedById: user?.id ?? null,
      quotedByName: user?.name ?? null,
      quotedAt: nowIso,
      updatedAt: nowIso,
    }).eq('id', component.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // ราคาครบทุกบรรทัดที่ต้องถาม → ใบพร้อมให้ฝ่ายขายประกอบต้นทุน (คำนวณจากของจริง
  // หลังเขียนเสร็จ ไม่ใช่เดาจาก payload)
  const afterWrite = await findCostingRequest(supabase, id);
  const allComponents = (afterWrite.items || []).flatMap((i) => i.components || []);
  const nextStatus = deriveRequestStatusAfterQuote(allComponents, afterWrite.status);
  if (nextStatus !== afterWrite.status) {
    const { error } = await supabase.from('costing_requests')
      .update({ status: nextStatus, updatedAt: nowIso }).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const after = await findCostingRequest(supabase, id);
  const progress = pricingProgress(allComponents);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ตอบราคา ${updates.length} บรรทัดในใบ ${after.docNo || id} (ครบ ${progress.quoted}/${progress.total})`,
    request,
  });

  // แจ้งฝ่ายขายเมื่อราคาครบแล้วเท่านั้น — ตอบทีละบรรทัดไม่ต้องเด้งทุกครั้ง
  if (nextStatus === 'assembling' && afterWrite.status !== 'assembling') {
    sendChat('sales', chatCard({
      title: `ราคาต้นทุนครบแล้ว ${after.docNo || ''}`,
      subtitle: after.customerName || '',
      rows: [
        { label: 'สินค้า', value: `${(after.items || []).length} รายการ` },
        { label: 'ผู้ขอ', value: after.requestedByName || '' },
      ],
      linkPath: `/sa/costing/${id}`,
      linkLabel: 'ประกอบต้นทุน',
    }));
  }

  return Response.json(after);
}
