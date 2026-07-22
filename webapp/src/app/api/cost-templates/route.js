// ── API แม่แบบต้นทุนต่อประเภทสินค้า (mig 0140) ────────────────────────
// อ่าน: ทุกคนที่เห็นระบบขอราคาต้นทุน (ฝ่ายขาย/RD/PC/ผู้บริหาร) — PR3 ใช้ตอนกาง
//       บรรทัดของใบขอราคา และหน้าตั้งค่าใช้แสดงรายการ
// เขียน: ผู้ดูแลระบบเท่านั้น (master:manage) — มติ 2026-07-22 ผู้บริหารมีหน้าที่
//       อนุมัติ ไม่ได้ดูแลข้อมูลหลัก. proxy บล็อกซ้ำอีกชั้นที่ /api/cost-templates
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewCosting } from '@/lib/permissions';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { isValidCategoryCode, normalizeCostTemplateLines } from '@/lib/master/costTemplate';
import { findCostTemplate, loadCostTemplates } from '@/lib/master/costTemplateAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// GET /api/cost-templates?includeHidden=1
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

    const url = new URL(request.url);
    // ประวัติแม่แบบที่ซ่อนแล้วเป็นเรื่องของผู้ดูแล — ฝ่ายอื่นเห็นเฉพาะที่ใช้งานอยู่
    const includeHidden = url.searchParams.get('includeHidden') === '1'
      && can(user?.role, 'master:manage');

    const data = await loadCostTemplates(getSupabaseAdmin(), { includeHidden });
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/cost-templates — สร้างแม่แบบใหม่ให้ประเภทสินค้าหนึ่ง
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const categoryCode = String(body.categoryCode || '').trim();
  if (!isValidCategoryCode(categoryCode)) {
    return Response.json({ error: 'รูปแบบรหัสหมวดสินค้าต้องเป็น MM-TTT' }, { status: 400 });
  }
  // หมวดต้องมีจริงและไม่ถูกพักใช้งาน — กันแม่แบบลอยที่ไม่มีสินค้าประเภทนั้นแล้ว
  const categoryError = await activeProductTypeError(categoryCode);
  if (categoryError) return Response.json({ error: categoryError }, { status: 400 });

  const { lines, error: lineError } = normalizeCostTemplateLines(body.lines);
  if (lineError) return Response.json({ error: lineError }, { status: 400 });

  const templateId = `PTCT-${randomUUID()}`;
  const { data: template, error } = await supabase
    .from('product_type_cost_templates')
    .insert({
      id: templateId,
      categoryCode,
      note: body.note ? String(body.note).trim().slice(0, 500) : null,
      createdById: user?.id ?? null,
      createdByName: user?.name ?? null,
      updatedById: user?.id ?? null,
      updatedByName: user?.name ?? null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'ประเภทสินค้านี้มีแม่แบบที่ใช้งานอยู่แล้ว' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { error: insertError } = await supabase
    .from('product_type_cost_lines')
    .insert(lines.map((l) => ({ id: `PTCL-${randomUUID()}`, templateId, ...l })));
  if (insertError) {
    // แม่แบบลบไม่ได้ (guard) — ซ่อนทิ้งแทน ไม่ให้เหลือใบเปล่าที่กินสิทธิ์ unique
    // ของหมวดนั้นไว้จนสร้างใหม่ไม่ได้
    await supabase
      .from('product_type_cost_templates')
      .update({ isHidden: true, hiddenAt: new Date().toISOString(), hiddenById: user?.id ?? null, hiddenByName: user?.name ?? null })
      .eq('id', templateId);
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  const created = await findCostTemplate(supabase, templateId);
  await recordAudit({
    user, action: 'create', entityType: 'cost_template', entityId: templateId, after: created,
    summary: `สร้างแม่แบบต้นทุนของหมวด ${categoryCode} (${lines.length} บรรทัด)`, request,
  });
  return Response.json(created, { status: 201 });
}
