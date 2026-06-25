import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { customerRelations } from '@/lib/master/relations';

export const dynamic = 'force-dynamic';

// GET /api/customers/[id]/relations — read-only 360-view summary.
// → { products[], registrations[], orders[], projects[] } (scoped to the viewer).
// Customers are a central registry: any signed-in user may view the customer,
// but each relation list is filtered by that module's own view-scope.
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: customer } = await supabase
    .from('customers').select('id').eq('id', id).maybeSingle();
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });

  const relations = await customerRelations(supabase, id, user);
  return Response.json(relations);
}
