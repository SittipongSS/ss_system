// Proxy แสดง/ดาวน์โหลดไฟล์หลักฐานการปิด Won ของใบเสนอราคา (quotations.wonAttachments).
// สิทธิ์คุมด้วย view-scope ของดีลเจ้าของ (pattern เดียวกับ activities/[id]/file) แล้ว
// stream bytes จาก private Supabase Storage / Google Drive; ref ที่ไม่มีทั้งสองอย่าง
// redirect ได้เฉพาะลิงก์ไฟล์ของ Google (ตรวจปลายทางก่อนเสมอ — ดูในตัว handler).
// ?i=<index> ชี้ไฟล์ในอาเรย์ wonAttachments (default 0).
import { Readable } from 'node:stream';
import { loadScoped } from '@/lib/scopedRow';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import { DEFAULT_EVIDENCE_BUCKET } from '@/lib/sales/orderConfirmationDocs';
import { attachmentFileHeaders } from '@/lib/master/attachmentTypes';
import { attachmentUrlError } from '@/lib/master/attachmentStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !canViewSalesPlanning(user)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  // ⭐ โหลดใบ + ดีลเจ้าของ + ตรวจ view-scope ในคำสั่งเดียว (`loadScoped` join ดีลมาให้)
  // — เดิมยิงสองรอบแล้วตรวจทีหลัง ซึ่งเป็นรูปที่ "โหลดแล้วลืมตรวจ" เขียนออกได้
  const { row: quote, response } = await loadScoped(supabase, 'quotations', id, user, 'view');
  if (response) return response;

  const list = Array.isArray(quote.wonAttachments) ? quote.wonAttachments : [];
  const idx = Number(new URL(request.url).searchParams.get('i')) || 0;
  const att = list[idx];
  if (!att || (!att.fileUrl && !att.storagePath)) {
    return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
  }

  // New Won evidence: private bucket, streamed only after deal-scope auth above.
  if (att.storagePath) {
    const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_EVIDENCE_BUCKET;
    const safeQuoteId = String(quote.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
    if (att.storageBucket !== privateBucket || !String(att.storagePath).startsWith(`quotations/${safeQuoteId}/won/`)) {
      return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
    }
    const { data, error } = await supabase.storage.from(privateBucket).download(att.storagePath);
    if (error || !data) {
      console.error('[quotations/file] private storage download failed:', error);
      return Response.json({ error: 'ดึงไฟล์หลักฐานไม่สำเร็จ' }, { status: 502 });
    }
    /* ⚠️ header จากตัวกลาง ไม่ใช่ `att.mimeType` — ค่านั้น client ประกาศมาเองตอนบันทึก ⇒ `text/html` + inline =
       หน้าเว็บที่รันสคริปต์บนโดเมนของระบบ · ชนิดคิดจากนามสกุล + nosniff + ชนิดที่ไม่ปลอดภัยบังคับดาวน์โหลด
       · คง no-store ของหลักฐานในถังส่วนตัวไว้ (ตัวกลางตั้ง max-age=60) */
    return new Response(data, {
      headers: { ...attachmentFileHeaders(att), 'Cache-Control': 'private, no-store' },
    });
  }

  /* ไม่มี driveFileId = ลิงก์เอกสาร Google เท่านั้น · **ตรวจปลายทางก่อน redirect ทุกครั้ง** — `fileUrl` เป็นค่าที่
     client ส่งมาตอนบันทึก ไม่ตรวจ = open redirect จากโดเมนของแอปเราเอง (ลิงก์หลอกที่หน้าตาเป็นของระบบ)
     · ตัวตรวจเดียวกับ master/attachments/[id]/file · ปลายทางอื่น/ค่ามั่ว = ตอบเหมือนไม่มีไฟล์
     (วัดจริง 08/10/2569: ไม่มี ref แบบ URL ล้วนในช่องนี้เลย ⇒ ไม่มีไฟล์จริงใบไหนเปิดไม่ได้เพราะด่านนี้) */
  if (!att.driveFileId) {
    if (attachmentUrlError(att.fileUrl)) return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });
    return Response.redirect(att.fileUrl, 307);
  }

  // Drive: stream bytes ผ่าน server (ไฟล์ private).
  try {
    const { getFileStream } = await import('@/lib/drive');
    const stream = await getFileStream(att.driveFileId);
    // header ชุดเดียวกับไฟล์แนบ (ชนิดจากนามสกุล · nosniff · private, max-age=60 เท่าเดิม) — ไม่เชื่อ mimeType ที่เก็บในแถว
    return new Response(Readable.toWeb(stream), { headers: attachmentFileHeaders(att) });
  } catch (err) {
    console.error('[quotations/file] drive stream failed:', err);
    return Response.json({ error: 'ดึงไฟล์จาก Google Drive ไม่สำเร็จ' }, { status: 502 });
  }
}
