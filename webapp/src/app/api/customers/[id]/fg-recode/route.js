import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditRecord } from '@/lib/permissions';
import { customerCodeSegment } from '@/lib/master/masterCodes';
import { loadFgRecodePlan } from '@/lib/master/fgCustomerCode';
import { fetchAll } from '@/lib/supabaseFetchAll';

export const dynamic = 'force-dynamic';

/* GET /api/customers/[id]/fg-recode?arCode=AR-0867 — พรีวิว "ถ้าเปลี่ยนรหัส AR เป็นค่านี้ รหัส FG จะเป็นยังไง"
   ให้โมดัลยืนยันหน้าลูกค้าโชว์ก่อนกด (มติเจ้าของ 12/11/2026) · แผนตัวเดียวกับที่ PATCH ใช้เขียนจริง
   (`loadFgRecodePlan`) ⇒ จอไม่มีทางสัญญาอย่างหนึ่งแล้ว API ทำอีกอย่าง
   → { changes: [{ fgCode, next }], kept: [{ fgCode, reason }] }
   อ่านอย่างเดียว · สิทธิ์เท่าคนที่แก้ลูกค้ารายนี้ได้ (ทาง GET ของ /api/customers เปิดอ่านทุกคน ⇒ ด่านอยู่ที่นี่) */
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const arCode = new URL(request.url).searchParams.get('arCode')?.trim() || '';

  const { data: customer, error: customerError } = await supabase
    .from('customers').select('*').eq('id', id).maybeSingle();
  if (customerError) return Response.json({ error: `อ่านข้อมูลลูกค้าไม่สำเร็จ: ${customerError.message}` }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });
  if (!canEditRecord(user, 'customers', customer)) return Response.json({ error: 'forbidden' }, { status: 403 });
  if (!customerCodeSegment(arCode)) return Response.json({ error: 'รหัส AR ใหม่ไม่ถูกรูปแบบ' }, { status: 400 });

  try {
    const products = await fetchAll(() => supabase.from('products').select('id, fgCode').eq('customerId', id).order('id'));
    const { plan, error } = await loadFgRecodePlan(supabase, { products, arCode });
    if (error) throw error;
    const strip = ({ id: _id, inUse: _inUse, ...row }) => row;
    return Response.json({ changes: plan.changes.map(strip), kept: plan.kept.map(strip) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
