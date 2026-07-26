// ── API เธรดอัปเดตของกลาง (mig 0163) ─────────────────────────────────────
// GET  /api/updates?entityType=&entityId=   เธรดของ entity หนึ่ง (เก่า→ใหม่)
// POST /api/updates                          โพสต์ข้อความใหม่
//
// ⚠️ ด่านจริงอยู่ที่ทะเบียน lib/master/updateAccess.js ทั้งหมด — proxy เห็นแค่ role
// ไม่รู้จัก entity; route นี้ไม่ตัดสินสิทธิ์เองสักบรรทัด
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import {
  canPostUpdate, canViewUpdates, isUpdateEntity, loadUpdateParent, updateEntityConfig,
} from '@/lib/master/updateAccess';
import { AUTHORABLE_KIND, sanitizeUpdateAttachments } from '@/lib/master/updateTypes';
import { appendUpdate, listUpdates } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const entityType = url.searchParams.get('entityType');
    const entityId = url.searchParams.get('entityId');
    if (!isUpdateEntity(entityType) || !entityId) {
      return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const user = await getCurrentUser();
    const parent = await loadUpdateParent(supabase, entityType, entityId);
    // ไม่มี entity หรือมองไม่เห็น = ตอบเหมือนกัน (ไม่บอกใบ้ว่ามีของอยู่)
    if (!parent || !(await canViewUpdates(supabase, entityType, parent, user))) {
      return Response.json({ error: 'ไม่พบรายการนี้' }, { status: 404 });
    }

    return Response.json({
      items: await listUpdates(supabase, entityType, entityId),
      canPost: await canPostUpdate(supabase, entityType, parent, user),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST { entityType, entityId, body?, attachments? }
// kind บังคับเป็น 'comment' เสมอ — เหตุการณ์ระบบเขียนผ่าน appendUpdate ในฝั่ง server
// ของโมดูลนั้น ๆ เท่านั้น (ปล่อยให้ client ส่ง kind มาเอง = ปลอมไทม์ไลน์ได้)
export async function POST(request) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getCurrentUser();
    const payload = await request.json().catch(() => ({}));
    const { entityType, entityId } = payload;
    if (!isUpdateEntity(entityType) || !entityId) {
      return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
    }

    const parent = await loadUpdateParent(supabase, entityType, entityId);
    if (!parent || !(await canViewUpdates(supabase, entityType, parent, user))) {
      return Response.json({ error: 'ไม่พบรายการนี้' }, { status: 404 });
    }
    if (!(await canPostUpdate(supabase, entityType, parent, user))) {
      return Response.json({ error: 'ไม่มีสิทธิ์โพสต์ในเธรดนี้' }, { status: 403 });
    }

    const text = String(payload.body ?? '').trim();
    const attachments = updateEntityConfig(entityType)?.attachments
      ? sanitizeUpdateAttachments(payload.attachments)
      : [];
    // ข้อความว่างได้ถ้ามีไฟล์ (โพสต์รูปล้วน) แต่ว่างทั้งคู่ไม่ได้
    if (!text && !attachments.length) {
      return Response.json({ error: 'ต้องพิมพ์ข้อความหรือแนบไฟล์' }, { status: 400 });
    }

    // คนกดปุ่มส่ง = ต้องรู้ว่าไม่สำเร็จ ห้ามกลืน error แล้วตอบ 201
    const { row, error } = await appendUpdate(supabase, {
      entityType, entityId, kind: AUTHORABLE_KIND, body: text || null, attachments, user,
    });
    if (error) return Response.json({ error: `บันทึกอัปเดตไม่สำเร็จ: ${error}` }, { status: 500 });

    await recordAudit({
      user, action: 'create', entityType: 'entity_update', entityId: row.id, after: row,
      summary: `โพสต์อัปเดตใน ${entityType} ${entityId}`, request,
    });
    return Response.json(row, { status: 201 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
