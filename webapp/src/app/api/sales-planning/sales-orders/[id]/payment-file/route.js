// Proxy แสดง/ดาวน์โหลดหลักฐานการชำระรายงวดของใบสั่งขาย (mig 0245).
// สิทธิ์คุมด้วย view-scope ของดีลเจ้าของ — แพตเทิร์นเดียวกับ quotations/[id]/file
// ⚠️ ฝ่ายบัญชีต้องเปิดไฟล์นี้ได้ (scope 'all' ของ role finance) ไม่งั้นคอนเฟิร์มโดยไม่เห็นสลิป
// ?installment=<id>&i=<index> ชี้ไฟล์ในอาเรย์ evidence ของงวดนั้น (default 0).
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { loadScoped } from '@/lib/scopedRow';
import { getCurrentUser } from '@/lib/authUser';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { DEFAULT_EVIDENCE_BUCKET } from '@/lib/sales/orderConfirmationDocs';
import { isQuotationEvidencePath } from '@/lib/upload/privateEvidence';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !canViewSalesPlanning(user)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { row: order, response } = await loadScoped(supabase, 'sales_orders', id, user, 'view');
  if (response) return response;

  const url = new URL(request.url);
  const installmentId = url.searchParams.get('installment');
  if (!installmentId) return Response.json({ error: 'ไม่ได้ระบุงวด' }, { status: 400 });

  const { data: row, error: rowError } = await supabase
    .from('sales_order_installments')
    .select('id, salesOrderId, evidence')
    .eq('id', installmentId)
    .maybeSingle();
  if (rowError) return Response.json({ error: rowError.message }, { status: 500 });
  // ⚠️ ต้องเช็คว่างวดนี้เป็นของใบนี้จริง — ไม่งั้นเดา id งวดของใบที่ตัวเองไม่มีสิทธิ์ได้
  if (!row || row.salesOrderId !== order.id) return Response.json({ error: 'ไม่พบงวด' }, { status: 404 });

  const list = Array.isArray(row.evidence) ? row.evidence : [];
  const att = list[Number(url.searchParams.get('i')) || 0];
  if (!att?.storagePath) return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });

  const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_EVIDENCE_BUCKET;
  const safeOrderId = String(order.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
  // ⚠️ งวดแรกอาจ **ยืมไฟล์มาจากหลักฐานที่แนบไว้ใต้ใบเสนอราคาต้นทาง** (สลิปโอนเงินตอน
  //    ปิด Won หรือเอกสารยืนยันคำสั่งซื้อ) ⇒ path จะขึ้นต้นด้วย `quotations/…` ไม่ใช่
  //    โฟลเดอร์ของใบสั่งขาย · ยอมรับทั้งสองแหล่ง แต่ไม่ยอมรับ path อื่นเลย เพื่อไม่ให้
  //    ค่าใน jsonb ชี้ไปไฟล์ของใครก็ได้ใน bucket
  //
  // 🐞 เดิมเขียนรายการโฟลเดอร์ไว้เองในบรรทัดนี้ (`won` อย่างเดียว) แล้ว #1391 เพิ่ม
  //    `order-confirmation` โดยไม่มีใครกลับมาแก้ที่นี่ ⇒ งวดที่ยืมไฟล์ยืนยันคำสั่งซื้อมา
  //    ตอบ "ไม่พบไฟล์แนบ" ทุกใบ · ตอนนี้ถามจากทะเบียนเดียวกับที่ใช้ตอนเขียนไฟล์
  const allowed = String(att.storagePath).startsWith(`sales-orders/${safeOrderId}/payments/`)
    || isQuotationEvidencePath(att.storagePath);
  if (att.storageBucket !== privateBucket || !allowed) {
    return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
  }

  const { data, error } = await supabase.storage.from(privateBucket).download(att.storagePath);
  if (error || !data) {
    console.error('[sales-orders/payment-file] private storage download failed:', error);
    return Response.json({ error: 'ดึงไฟล์หลักฐานไม่สำเร็จ' }, { status: 502 });
  }
  return new Response(data, {
    headers: {
      'Content-Type': att.mimeType || data.type || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.fileName || 'file')}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
