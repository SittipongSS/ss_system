import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord } from '@/lib/permissions';
import { productRelations } from '@/lib/master/relations';

export const dynamic = 'force-dynamic';

// GET /api/products/[id]/relations — read-only 360-view summary.
// → { registrations[], orders[], sales } (scoped to the viewer · sales = หน้าสินค้าศูนย์รวม S1).
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: product, error: productError } = await supabase
    .from('products').select('*').eq('id', id).maybeSingle();
  if (productError) return Response.json({ error: productError.message }, { status: 500 });
  // 404 (not 403) for out-of-team products so we don't leak their existence.
  if (!product || !canViewRecord(user, 'products', product)) {
    return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  }

  // query พัง = 500 พร้อมข้อความ (ไม่ใช่ลิสต์ว่างที่อ่านเหมือน "ยังไม่เคยขาย") — แบบเดียวกับ route ของลูกค้า
  try {
    return Response.json(await productRelations(supabase, id, user));
  } catch (err) {
    return Response.json({ error: err?.message || 'โหลดข้อมูลที่เกี่ยวข้องไม่สำเร็จ' }, { status: 500 });
  }
}
