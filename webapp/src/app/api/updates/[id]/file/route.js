// Proxy แสดง/ดาวน์โหลดไฟล์แนบของข้อความในเธรดอัปเดต (entity_updates.attachments).
// ?i=<index> ชี้ไฟล์ (default 0) — แพตเทิร์นเดียวกับไฟล์แนบความเคลื่อนไหวดีล/สอบถาม
//
// ⭐ สิทธิ์ = **สิทธิ์อ่านเธรดเดียวกันเป๊ะ** (ทะเบียนตัวเดียวกับ GET /api/updates)
// จึงไม่มีทางที่ด่านสองที่จะเพี้ยนกันเองแบบไฟล์แนบของ entity ที่กระจาย 5 จุด (PR #733)
import { Readable } from 'node:stream';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewUpdates, loadUpdateParent } from '@/lib/master/updateAccess';
import { findUpdate } from '@/lib/master/updates';
import { attachmentFileHeaders } from '@/lib/master/attachmentTypes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'forbidden' }, { status: 403 });

  const supabase = getSupabaseAdmin();
  const row = await findUpdate(supabase, id);
  if (!row) return Response.json({ error: 'ไม่พบข้อความ' }, { status: 404 });
  // ข้อความที่ลบแล้ว = ไฟล์แนบของมันหมดความหมายตาม ไม่ให้เปิดต่อ
  if (row.deletedAt) return Response.json({ error: 'ข้อความนี้ถูกลบแล้ว' }, { status: 404 });

  const parent = await loadUpdateParent(supabase, row.entityType, row.entityId);
  if (!parent || !(await canViewUpdates(supabase, row.entityType, parent, user))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const list = Array.isArray(row.attachments) ? row.attachments : [];
  const att = list[Number(new URL(request.url).searchParams.get('i')) || 0];
  if (!att?.fileUrl) return Response.json({ error: 'ไม่พบไฟล์แนบ' }, { status: 404 });

  // ไฟล์บน Supabase (public URL, ไม่มี driveFileId) → redirect ตรง
  if (!att.driveFileId) return Response.redirect(att.fileUrl, 307);

  try {
    const { getFileStream } = await import('@/lib/drive');
    const stream = await getFileStream(att.driveFileId);
    return new Response(Readable.toWeb(stream), { headers: attachmentFileHeaders(att) });
  } catch (err) {
    console.error('[updates/file] drive stream failed:', err);
    const detail = String(err?.errors?.[0]?.message || err?.message || '').slice(0, 200);
    return Response.json(
      { error: `ดึงไฟล์จาก Google Drive ไม่สำเร็จ${detail ? ` — ${detail}` : ''}` },
      { status: 502 },
    );
  }
}
