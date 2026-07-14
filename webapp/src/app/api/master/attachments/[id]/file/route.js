// Proxy ดาวน์โหลด/แสดงไฟล์แนบ (Drive backend, ระดับ A — ไฟล์ private).
// เช็กสิทธิ์ผ่าน entity แม่ (canViewRecord) ก่อน stream bytes จาก Drive.
// ไฟล์เก่า (driveFileId == null) → redirect ไป Supabase public URL เดิม (hybrid).
//
// gating: proxy.js ปล่อย GET /api/(master/)attachments ให้ผู้ล็อกอินทุกคน —
// การคุมสิทธิ์จริงคือ canViewRecord ในนี้ (เหมือน GET /api/attachments เดิม).
import { Readable } from 'node:stream';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord } from '@/lib/permissions';
import { getAttachment, loadAttachmentParent, ATTACHMENT_RESOURCE } from '@/lib/master/attachments';
import { canViewPersonalTask } from '@/lib/pm/personalTaskAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  // สิทธิ์ดูไฟล์ = สิทธิ์ดู entity แม่ (team/role scope เดิม).
  const parent = await loadAttachmentParent(att);
  const allowed = att.entityType === 'personal_task'
    ? await canViewPersonalTask(getSupabaseAdmin(), parent, user)
    : canViewRecord(user, ATTACHMENT_RESOURCE[att.entityType], parent);
  if (!parent || !allowed) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // ไฟล์เก่าบน Supabase (ก่อนย้าย Drive) — redirect ไป public URL เดิม.
  if (!att.driveFileId) {
    if (!att.fileUrl) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
    return Response.redirect(att.fileUrl, 307);
  }

  // Drive: stream bytes ผ่าน server (ไฟล์ private — เปิดตรงไม่ได้).
  try {
    const { getFileStream } = await import('@/lib/drive');
    const stream = await getFileStream(att.driveFileId);
    return new Response(Readable.toWeb(stream), {
      headers: {
        'Content-Type': att.mimeType || 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(att.fileName || 'file')}`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    console.error('[attachments/file] drive stream failed:', err);
    return Response.json({ error: 'ดึงไฟล์จาก Google Drive ไม่สำเร็จ' }, { status: 502 });
  }
}
