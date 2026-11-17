// GET /api/ext/v1/sales-orders?after=<changeSeq>&limit=100 — ใบที่เปลี่ยนหลังเลขที่ส่งมา (เครื่องคุยกับเครื่อง)
// สัญญากับปลายทาง: docs/so-external-api-plan.md หัวข้อ "สัญญากับระบบปลายทาง" · ยืนยันคีย์ใน `extApiGet`
import { extApiGet } from '@/lib/extApi/handler';
import { loadFeedPage, parseFeedParams } from '@/lib/extApi/salesOrderFeed';

export const dynamic = 'force-dynamic';

export const GET = extApiGet(async ({ supabase, request }) => {
  const params = parseFeedParams(new URL(request.url).searchParams);
  if (params.error) return { status: 400, body: { error: 'bad_request', message: params.error } };
  const page = await loadFeedPage(supabase, params);
  return { body: page, rowCount: page.data.length };
});
