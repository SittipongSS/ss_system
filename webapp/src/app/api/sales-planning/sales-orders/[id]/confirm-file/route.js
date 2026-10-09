// Proxy แสดง/ดาวน์โหลด "เอกสารยืนยันคำสั่งซื้อ" ของใบสั่งขาย (sales_orders.confirmAttachments)
//
// ⭐ ฝาแฝดของ quotations/[id]/file (หลักฐานปิด Won ของใบเก่า) และ
// sales-orders/[id]/payment-file (หลักฐานรายงวด) — ด่านเดียวกัน: view-scope ของดีล
// เจ้าของใบ แล้ว stream ไบต์จาก private bucket
//
// 🔴 เส้นนี้ส่งได้ **เฉพาะไฟล์ใน private bucket** — ทาง Drive (stream ตาม `driveFileId`) กับทางลิงก์ล้วน (redirect ตาม
// `fileUrl`) ถูกถอดออก: สองค่านั้นเป็นค่าที่ client ส่งมาตอนบันทึก ⇒ ใส่ id ไฟล์ Drive ของใครก็ได้แล้วให้เส้นนี้
// stream ออกมาด้วยสิทธิ์ของระบบ · วัดจริง 09/10/2569: confirmAttachments 220 ref อยู่ใน bucket ทั้งหมด ไม่มี Drive id /
// fileUrl สักใบ ⇒ ไม่มีไฟล์จริงใบไหนเปิดไม่ได้เพราะการถอดนี้ · ref ที่ไม่มี storagePath = ตอบเหมือนไม่มีไฟล์
//
// ⚠️ path ต้องอยู่ใต้โฟลเดอร์ของ **ใบเสนอราคาต้นทาง** เพราะไฟล์ถูกอัปตั้งแต่ตอนที่ใบ
// สั่งขายยังไม่เกิด (เลขที่ใบใช้ซ้ำไม่ได้ ⇒ ฟอร์มสร้างใบยิงคำขอเดียวตอนกดสร้าง)
// ?i=<index> ชี้ไฟล์ในอาเรย์ (default 0)
import { loadScoped } from '@/lib/scopedRow';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { DEFAULT_EVIDENCE_BUCKET } from '@/lib/sales/orderConfirmationDocs';
import { attachmentFileHeaders } from '@/lib/master/attachmentTypes';
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
  if (!att || !att.storagePath) {
    return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
  }

  const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_EVIDENCE_BUCKET;
  /* ⚠️ ใบเก่า (ก่อน mig 0285) หลักฐานอยู่ในโฟลเดอร์ `won/` ของใบเสนอราคาต้นทาง —
     พอโหมดแก้ยกไฟล์เหล่านั้นตามเข้าใบ (ดู sales-orders/[id]/page.js) ref ที่บันทึก
     จึงเป็น path ของ `won/` ไม่ใช่ `order-confirmation/` · ถามทะเบียนเดียวกับ
     payment-file แทนการเขียนชื่อโฟลเดอร์เองอีกชุด ซึ่งเป็นต้นเหตุของ #1404 พอดี */
  // ⚠️ ใบสั่งขายย้อนหลัง (mig 0360) ไม่มีใบเสนอราคา — id ว่างทำให้ตัวตรวจ path ถอยเป็นตัวจับทุกใบ ⇒ ต้องมี id จริงก่อน
  if (att.storageBucket !== privateBucket
    || !(order.quotationId && isQuotationEvidencePath(att.storagePath, order.quotationId))) {
    return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
  }
  const { data, error } = await supabase.storage.from(privateBucket).download(att.storagePath);
  if (error || !data) {
    console.error('[sales-orders/confirm-file] private storage download failed:', error);
    return Response.json({ error: 'ดึงไฟล์เอกสารยืนยันไม่สำเร็จ' }, { status: 502 });
  }
  /* ⚠️ header จากตัวกลาง ไม่ใช่ `att.mimeType` — ค่านั้น client ประกาศมาเองตอนบันทึก ⇒ `text/html` + inline =
     หน้าเว็บที่รันสคริปต์บนโดเมนของระบบ · ชนิดคิดจากนามสกุล + nosniff + ชนิดที่ไม่ปลอดภัยบังคับดาวน์โหลด
     · คง no-store ของหลักฐานในถังส่วนตัวไว้ (ตัวกลางตั้ง max-age=60) */
  return new Response(data, {
    headers: { ...attachmentFileHeaders(att), 'Cache-Control': 'private, no-store' },
  });
}
