import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canManageProductCategories } from '@/lib/permissions';
import { normalizeProductCategoryInput, productCategoryCode } from '@/lib/master/productCategory';
import { invalidateCache } from '@/lib/serverCache';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!canManageProductCategories(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: current, error: findError } = await supabase
    .from('product_types').select('*').eq('id', id).maybeSingle();
  if (findError) return Response.json({ error: findError.message }, { status: 500 });
  if (!current) return Response.json({ error: 'ไม่พบหมวดสินค้านี้' }, { status: 404 });

  const body = await request.json();
  if (body.mainCategoryCode !== undefined || body.typeCode !== undefined) {
    return Response.json({ error: 'รหัสหมวดถูกใช้อ้างอิงในระบบและไม่สามารถแก้ไขได้' }, { status: 400 });
  }

  const lifecycleOnly = body.isActive !== undefined &&
    Object.keys(body).every((key) => key === 'isActive');
  const now = new Date().toISOString();
  let patch;
  if (lifecycleOnly) {
    if (typeof body.isActive !== 'boolean') {
      return Response.json({ error: 'สถานะหมวดสินค้าไม่ถูกต้อง' }, { status: 400 });
    }
    patch = {
      isActive: body.isActive,
      deactivatedAt: body.isActive ? null : now,
      updatedAt: now,
    };
  } else {
    const { value, errors } = normalizeProductCategoryInput(body, { partial: true });
    if (errors.length) return Response.json({ error: errors[0], errors }, { status: 400 });
    patch = { ...value, updatedAt: now };
    delete patch.mainCategoryCode;
    delete patch.typeCode;
    if (body.isActive !== undefined) {
      return Response.json({ error: 'กรุณาเปลี่ยนสถานะแยกจากการแก้ไขข้อมูล' }, { status: 400 });
    }
  }

  // The main name is shared by every sub-category row in the group. Keep all
  // rows aligned when the Sales head renames it.
  if (patch.mainCategoryName && patch.mainCategoryName !== current.mainCategoryName) {
    const { error: groupError } = await supabase
      .from('product_types')
      .update({ mainCategoryName: patch.mainCategoryName, updatedAt: now })
      .eq('mainCategoryCode', current.mainCategoryCode);
    if (groupError) return Response.json({ error: groupError.message }, { status: 500 });
  }

  const { data: updated, error } = await supabase
    .from('product_types').update(patch).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  invalidateCache('product-types');
  const statusVerb = lifecycleOnly ? (updated.isActive ? 'เปิดใช้งาน' : 'พักใช้งาน') : 'แก้ไข';
  await recordAudit({
    user, action: 'update', entityType: 'product_category', entityId: updated.id,
    before: current, after: updated,
    summary: `${statusVerb}หมวดสินค้า ${productCategoryCode(updated)} ${updated.nameTh || updated.nameEn || ''}`.trim(), request,
  });
  return Response.json(updated);
}
