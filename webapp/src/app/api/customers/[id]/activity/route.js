import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import {
  ACTIVITY_PAGE_SIZE, ACTIVITY_SOURCES, activityCounts, activityParents, activitySources, loadActivityPage,
} from '@/lib/master/customerActivity';

export const dynamic = 'force-dynamic';

// GET /api/customers/[id]/activity?source=all|customer|deal|dept_request|lead|excise_registration&before=<cursor>
// ความเคลื่อนไหวรวมของลูกค้า (หน้าลูกค้าศูนย์รวม H3) — เรียงใหม่ไปเก่า หน้าละ 50
// → { items[], nextCursor, sources: { "<type>:<id>": {type, code, title, href} }, counts (หน้าแรกเท่านั้น · หน้าถัดไป = null) }
// ⚠️ GET อ่านอย่างเดียว — ไม่มาร์คแจ้งเตือนว่าอ่านแล้ว (ต่างจากการเปิดเธรดรายใบ) · สิทธิ์รายเธรดมาจากทะเบียนเธรดกลาง
export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'ต้องเข้าสู่ระบบ' }, { status: 401 });
  const supabase = getSupabaseAdmin();

  const { data: customer, error: customerError } = await supabase
    .from('customers').select('*').eq('id', id).maybeSingle();
  if (customerError) return Response.json({ error: `อ่านข้อมูลลูกค้าไม่สำเร็จ: ${customerError.message}` }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });

  const url = new URL(request.url);
  const source = url.searchParams.get('source') || 'all';
  if (source !== 'all' && !ACTIVITY_SOURCES.includes(source)) {
    return Response.json({ error: 'แหล่งความเคลื่อนไหวไม่ถูกต้อง' }, { status: 400 });
  }
  const before = url.searchParams.get('before');

  try {
    const parents = await activityParents(supabase, customer, user);
    const page = await loadActivityPage(supabase, parents, { source, before, limit: ACTIVITY_PAGE_SIZE });
    return Response.json({
      ...page,
      sources: activitySources(parents),
      counts: before ? null : await activityCounts(supabase, parents),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
