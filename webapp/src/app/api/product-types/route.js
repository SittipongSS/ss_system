import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { listProductTypes } from '@/lib/master/productTypes';

export const dynamic = 'force-dynamic';

// GET — category taxonomy. Readable by any signed-in user (used for the
// product-form dropdown and PM templates). The proxy already blocks anon.
export async function GET() {
  try {
    const data = await listProductTypes();
    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST — add a category. Supervisor-only (master:manage); also gated by proxy.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!can(user?.role, 'master:manage')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();
  if (!body.mainCategoryCode || !body.typeCode || !body.mainCategoryName) {
    return Response.json(
      { error: 'ต้องระบุ mainCategoryCode, mainCategoryName และ typeCode' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('product_types')
    .insert({
      mainCategoryCode: body.mainCategoryCode,
      mainCategoryName: body.mainCategoryName,
      typeCode: body.typeCode,
      nameEn: body.nameEn ?? null,
      nameTh: body.nameTh ?? null,
      note: body.note ?? null,
    })
    .select()
    .single();

  if (error) {
    // Unique violation on (mainCategoryCode, typeCode)
    if (error.code === '23505') {
      return Response.json({ error: 'หมวด/รหัสนี้มีอยู่แล้ว' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data, { status: 201 });
}
