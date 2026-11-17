// GET /api/ext/v1/sales-orders/{orderNumber} — ใบเดียวพร้อมบรรทัด (ตรวจทาน/แก้ซิงก์หลุด)
// ใบที่ไม่ใช่ใบที่ API ส่ง (ร่าง · ใบย้อนหลัง · ใบค่าสรรพสามิต · ไม่มีบรรทัด 01/02) = 404 เหมือนไม่มี — ไม่บอกเหตุ
import { extApiGet } from '@/lib/extApi/handler';
import { loadOneOrder } from '@/lib/extApi/salesOrderFeed';

export const dynamic = 'force-dynamic';

export const GET = extApiGet(async ({ supabase, params }) => {
  const orderNumber = String(params?.orderNumber || '').trim();
  if (!orderNumber || orderNumber.length > 64) return { status: 400, body: { error: 'bad_request', message: 'เลขที่ใบไม่ถูกต้อง' } };
  const order = await loadOneOrder(supabase, orderNumber);
  if (!order) return { status: 404, body: { error: 'not_found', message: 'ไม่พบใบสั่งขายนี้' } };
  return { body: { data: order }, rowCount: 1 };
});
