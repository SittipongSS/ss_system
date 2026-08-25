// Proxy แสดง/ดาวน์โหลด "เอกสารยืนยันคำสั่งซื้อ" ของใบสั่งขาย (sales_orders.confirmAttachments)
//
// ⭐ ฝาแฝดของ quotations/[id]/file (หลักฐานปิด Won ของใบเก่า) และ
// sales-orders/[id]/payment-file (หลักฐานรายงวด) — ด่านเดียวกัน: view-scope ของดีล
// เจ้าของใบ แล้ว stream ไบต์จาก private bucket / Drive · legacy public URL redirect
//
// ⚠️ path ต้องอยู่ใต้โฟลเดอร์ของ **ใบเสนอราคาต้นทาง** เพราะไฟล์ถูกอัปตั้งแต่ตอนที่ใบ
// สั่งขายยังไม่เกิด (เลขที่ใบใช้ซ้ำไม่ได้ ⇒ ฟอร์มสร้างใบยิงคำขอเดียวตอนกดสร้าง)
// ?i=<index> ชี้ไฟล์ในอาเรย์ (default 0)
import { Readable } from 'node:stream';
import { loadScoped } from '@/lib/scopedRow';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
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

  const list = Array.isArray(order.confirmAttachments) ? order.confirmAttachments : [];
  const idx = Number(new URL(request.url).searchParams.get('i')) || 0;
  const att = list[idx];
  if (!att || (!att.fileUrl && !att.storagePath)) {
    return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
  }

  if (att.storagePath) {
    const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_EVIDENCE_BUCKET;
    /* ⚠️ ใบเก่า (ก่อน mig 0285) หลักฐานอยู่ในโฟลเดอร์ `won/` ของใบเสนอราคาต้นทาง —
       พอโหมดแก้ยกไฟล์เหล่านั้นตามเข้าใบ (ดู sales-orders/[id]/page.js) ref ที่บันทึก
       จึงเป็น path ของ `won/` ไม่ใช่ `order-confirmation/` · ถามทะเบียนเดียวกับ
       payment-file แทนการเขียนชื่อโฟลเดอร์เองอีกชุด ซึ่งเป็นต้นเหตุของ #1404 พอดี */
    if (att.storageBucket !== privateBucket
      || !isQuotationEvidencePath(att.storagePath, order.quotationId)) {
      return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
    }
    const { data, error } = await supabase.storage.from(privateBucket).download(att.storagePath);
    if (error || !data) {
      console.error('[sales-orders/confirm-file] private storage download failed:', error);
      return Response.json({ error: 'ดึงไฟล์เอกสารยืนยันไม่สำเร็จ' }, { status: 502 });
    }
    return new Response(data, {
      headers: {
        'Content-Type': att.mimeType || data.type || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.fileName || 'file')}`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  if (!att.driveFileId) return Response.redirect(att.fileUrl, 307);

  try {
    const { getFileStream } = await import('@/lib/drive');
    const stream = await getFileStream(att.driveFileId);
    return new Response(Readable.toWeb(stream), {
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.fileName || 'file')}`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    console.error('[sales-orders/confirm-file] drive stream failed:', err);
    return Response.json({ error: 'ดึงไฟล์จาก Google Drive ไม่สำเร็จ' }, { status: 502 });
  }
}
