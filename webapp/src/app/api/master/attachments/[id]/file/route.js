// Proxy ดาวน์โหลด/แสดงไฟล์แนบ (Drive backend, ระดับ A — ไฟล์ private).
// เช็กสิทธิ์ผ่าน entity แม่ (canViewRecord) ก่อน stream bytes จาก Drive.
// ไฟล์เก่า (driveFileId == null) → redirect ไป Supabase public URL เดิม (hybrid).
//
// gating: proxy.js ปล่อย GET /api/(master/)attachments ให้ผู้ล็อกอินทุกคน —
// การคุมสิทธิ์จริงคือ canViewRecord ในนี้ (เหมือน GET /api/attachments เดิม).
import { Readable } from 'node:stream';
import { getCurrentUser } from '@/lib/authUser';
import { canUser, canViewRecord } from '@/lib/permissions';
import { getAttachment, loadAttachmentParent, ATTACHMENT_RESOURCE } from '@/lib/master/attachments';
import { attachmentUrlErrorForEnv } from '@/lib/master/attachmentStorage';
import { attachmentFileHeaders } from '@/lib/master/attachmentTypes';
import { canViewCostingAttachment, isCostingAttachment } from '@/lib/master/costingAttachmentAccess';
import { canViewPersonalTask } from '@/lib/pm/personalTaskAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const MGMT_ENTITIES = ['mgmt_task', 'mgmt_meeting'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  // สิทธิ์ดูไฟล์ = สิทธิ์ดู entity แม่ — ต้องตรงกับ GET /api/attachments ทุกสาขา
  // (โมดูลที่คุมด้วย cap ของตัวเอง ไม่ได้คุมด้วยทีมของ customer/product)
  const parent = await loadAttachmentParent(att);
  const allowed = att.entityType === 'personal_task'
    ? await canViewPersonalTask(getSupabaseAdmin(), parent, user)
    : MGMT_ENTITIES.includes(att.entityType)
      ? canUser(user, 'mgmt:view')
      : isCostingAttachment(att.entityType)
        ? await canViewCostingAttachment(getSupabaseAdmin(), att.entityType, parent, user)
        : canViewRecord(user, ATTACHMENT_RESOURCE[att.entityType], parent);
  if (!parent || !allowed) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // ไฟล์เก่าบน Supabase (ก่อนย้าย Drive) + เอกสาร Google native ของงานบริหาร —
  // redirect ไปลิงก์เดิม · **ต้องตรวจที่อยู่ก่อน redirect ทุกครั้ง**: ถ้าไม่ตรวจ endpoint นี้
  // จะเป็น open redirect จากโดเมนของแอปเราเอง ตามค่า fileUrl ที่อยู่ในแถว · ด่านตอน
  // บันทึก (POST /api/attachments) กันแถวใหม่แล้ว ตัวนี้กันแถวเก่า/แถวที่เขียนมาทางอื่น
  if (!att.driveFileId) {
    if (!att.fileUrl) return Response.json({ error: 'ไม่พบไฟล์' }, { status: 404 });
    if (attachmentUrlErrorForEnv(att.fileUrl)) {
      console.error('[attachments/file] ปฏิเสธ redirect ไปที่อยู่ภายนอก:', att.id, att.fileUrl);
      return Response.json({ error: 'ที่อยู่ไฟล์ของเอกสารนี้ไม่ถูกต้อง' }, { status: 400 });
    }
    return Response.redirect(att.fileUrl, 307);
  }

  // Drive: stream bytes ผ่าน server (ไฟล์ private — เปิดตรงไม่ได้).
  try {
    const { getFileStream } = await import('@/lib/drive');
    const stream = await getFileStream(att.driveFileId);
    return new Response(Readable.toWeb(stream), { headers: attachmentFileHeaders(att) });
  } catch (err) {
    console.error('[attachments/file] drive stream failed:', err);
    // บอกสาเหตุจริง — ผู้ใช้ที่กดแล้วไม่ขึ้นต้องรู้ว่าควรแจ้งใคร (ตรวจได้ที่ ตั้งค่า → ที่เก็บไฟล์)
    const detail = String(err?.errors?.[0]?.message || err?.message || '').slice(0, 200);
    return Response.json(
      { error: `ดึงไฟล์จาก Google Drive ไม่สำเร็จ${detail ? ` — ${detail}` : ''}` },
      { status: 502 },
    );
  }
}
