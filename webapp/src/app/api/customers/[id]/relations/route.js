import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { customerRelations } from '@/lib/master/relations';

export const dynamic = 'force-dynamic';

// GET /api/customers/[id]/relations — read-only 360-view summary.
// → { products[], registrations[], orders[], projects[], scents[], formulas[] }
//   (scoped to the viewer).
// Customers are a central registry: any signed-in user may view the customer,
// but each relation list is filtered by that module's own view-scope.
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  // เก็บ error ก่อนเช็ค !customer — ไม่งั้น query พังจะกลายเป็น "ไม่พบข้อมูลลูกค้ารายนี้"
  const { data: customer, error: customerError } = await supabase
    .from('customers').select('id').eq('id', id).maybeSingle();
  if (customerError) return Response.json({ error: `อ่านข้อมูลลูกค้าไม่สำเร็จ: ${customerError.message}` }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });

  try {
    return Response.json(await customerRelations(supabase, id, user));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
