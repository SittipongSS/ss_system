// Proxy แสดง/ดาวน์โหลดไฟล์แนบของความเคลื่อนไหว (sales_deal_activities.attachments).
// สิทธิ์คุมด้วย view-scope ของดีลเจ้าของ (เหมือน GET activities) แล้ว stream bytes
// จาก Google Drive; ไฟล์บน Supabase (ไม่มี driveFileId) → redirect ไป public URL.
// ?i=<index> ชี้ไฟล์ในอาเรย์ attachments (default 0).
import { Readable } from 'node:stream';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !canViewSalesPlanning(user)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data: activity } = await supabase
    .from('sales_deal_activities')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!activity) return Response.json({ error: 'ไม่พบรายการอัปเดต' }, { status: 404 });

  const { data: deal } = await supabase.from('sales_deals').select('*').eq('id', activity.dealId).maybeSingle();
  if (!deal || !inSalesViewScope(user, deal)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const list = Array.isArray(activity.attachments) ? activity.attachments : [];
  const idx = Number(new URL(request.url).searchParams.get('i')) || 0;
  const att = list[idx];
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
    console.error('[activities/file] drive stream failed:', err);
    return Response.json({ error: 'ดึงไฟล์จาก Google Drive ไม่สำเร็จ' }, { status: 502 });
  }
}
