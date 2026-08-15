// Proxy ดาวน์โหลด/แสดงไฟล์แนบ (Drive backend, ระดับ A — ไฟล์ private).
// เช็กสิทธิ์ผ่าน entity แม่ + ด่านรายใบ ก่อน stream bytes จาก Drive.
// ไฟล์เก่า (driveFileId == null) → redirect ไป Supabase public URL เดิม (hybrid).
//
// gating: proxy.js ปล่อย GET /api/(master/)attachments ให้ผู้ล็อกอินทุกคน —
// การคุมสิทธิ์จริงคือสองด่านในนี้ ซึ่งเป็นตัวเดียวกับ GET /api/attachments
// (`canViewAttachmentParent` + `canViewAttachmentRow` ใน lib/master/attachmentAccess).
import { Readable } from 'node:stream';
import { getCurrentUser } from '@/lib/authUser';
import { recordAudit } from '@/lib/audit';
import { getAttachment, loadAttachmentParent } from '@/lib/master/attachments';
import { attachmentUrlErrorForEnv } from '@/lib/master/attachmentStorage';
import { attachmentFileHeaders, isPersonalDoc } from '@/lib/master/attachmentTypes';
import { canViewAttachmentParent, canViewAttachmentRow } from '@/lib/master/attachmentAccess';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  /* สิทธิ์ดูไฟล์ = สิทธิ์ดู entity แม่ + ด่านรายใบ (เอกสารส่วนบุคคล)
     ⚠️ **เรียกตัวกลางตัวเดียวกับ GET /api/attachments** — เดิมบันไดสาขาถูกเขียนซ้ำ
     ในไฟล์นี้เป็น ternary ห้าชั้น ทั้งที่ `lib/master/attachmentAccess.js` ถูกยกออกมา
     เพื่อรวมมันไว้ที่เดียวโดยเฉพาะ (คอมเมนต์หัวไฟล์นั้นเตือนไว้เองว่าสองชุดที่ต้องแก้
     พร้อมกันด้วยมือคือของที่เพี้ยนหากันแน่นอน และความเพี้ยนของด่านสิทธิ์ = คนเห็นของ
     ที่ไม่ควรเห็นโดยไม่มีใครสังเกต) · ที่นี่คือด่านที่ **สตรีมไบต์จริง** จึงเป็นชุดที่
     ผิดพลาดไม่ได้ที่สุดในสองชุด */
  const supabase = getSupabaseAdmin();
  const parent = await loadAttachmentParent(att);
  if (!parent || !(await canViewAttachmentParent(supabase, att.entityType, parent, user))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  if (!canViewAttachmentRow(att, parent, user)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  /* ⭐ ลงบันทึกว่าใครเปิดเอกสารส่วนบุคคล (มติผู้ใช้ 2026-08-16) — เฉพาะกลุ่มนี้
     ไม่ใช่ทุกไฟล์ · ก่อนหน้านี้เส้นสตรีมไฟล์ไม่เคยลง audit เลย ⇒ ถ้าข้อมูลรั่ว
     จะสืบไม่ได้ว่าใครเปิด
     ⚠️ best-effort: `recordAudit` กลืน error ในตัวอยู่แล้ว และห้ามให้การบันทึกทำให้
     คนที่มีสิทธิ์เปิดไฟล์ไม่ได้ */
  if (isPersonalDoc(att.entityType, att.docType)) {
    await recordAudit({
      user,
      action: 'view',
      entityType: 'attachment',
      entityId: att.id,
      summary: `เปิดเอกสารส่วนบุคคล ${att.docType} ของลูกค้า ${parent.name || parent.arCode || att.entityId}`,
      request,
    });
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
