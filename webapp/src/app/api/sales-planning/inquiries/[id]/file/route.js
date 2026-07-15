// Proxy แสดง/ดาวน์โหลดไฟล์แนบของข้อความในเธรดสอบถาม (inquiry_messages.attachments).
// สิทธิ์ = คนที่เห็นเรื่องนั้นได้ (canViewInquiry) — แพตเทิร์นเดียวกับไฟล์แนบ
// ความเคลื่อนไหวดีล. ?m=<messageId>&i=<index> ชี้ไฟล์ (i default 0).
import { Readable } from 'node:stream';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewInquiry } from '@/lib/inquiries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const { data: inquiry } = await supabase.from('inquiries').select('*').eq('id', id).maybeSingle();
  if (!inquiry) return Response.json({ error: 'ไม่พบเรื่องสอบถาม' }, { status: 404 });
  if (!canViewInquiry(user, inquiry)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const sp = new URL(request.url).searchParams;
  const messageId = sp.get('m');
  const { data: message } = await supabase
    .from('inquiry_messages').select('*')
    .eq('id', messageId).eq('inquiryId', id).maybeSingle();
  if (!message) return Response.json({ error: 'ไม่พบข้อความ' }, { status: 404 });

  const list = Array.isArray(message.attachments) ? message.attachments : [];
  const att = list[Number(sp.get('i')) || 0];
  if (!att || !att.fileUrl) return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });

  // ไฟล์บน Supabase (public URL, ไม่มี driveFileId) → redirect ตรง.
  if (!att.driveFileId) return Response.redirect(att.fileUrl, 307);

  // Drive: stream bytes ผ่าน server (ไฟล์ private).
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
    console.error('[inquiries/file] drive stream failed:', err);
    return Response.json({ error: 'ดึงไฟล์จาก Google Drive ไม่สำเร็จ' }, { status: 502 });
  }
}
