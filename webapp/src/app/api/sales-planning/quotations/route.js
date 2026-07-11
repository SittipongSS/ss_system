import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/quotations — ลิสต์ใบเสนอราคาทุกใบ (เมนูแยก เฟส D:
// ค้นหาด้วยเลข QT / ลูกค้า / ดีล). scope ตามดีลแม่ (ทีม/เจ้าของ) เหมือนหน้า pipeline.
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const status = params.get('status');

  let query = supabase
    .from('quotations')
    .select('*, lines:quotation_lines(id), deal:sales_deals(id, title, stage, dealType, team, ownerId, ownerName, customerName, metadata)')
    .order('createdAt', { ascending: false })
    .limit(500);
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const rows = (data || [])
    .filter((q) => q.deal && inSalesViewScope(user, q.deal))
    .map((q) => ({ ...q, lineCount: (q.lines || []).length, lines: undefined }));
  return ok(rows);
});
