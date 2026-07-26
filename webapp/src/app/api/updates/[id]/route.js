// ── แก้ / ลบ ข้อความในเธรดอัปเดต (mig 0163) ──────────────────────────────
// PATCH  { action: 'edit', body?, attachments? } | { action: 'acknowledge' }
// DELETE soft delete (แถวไม่หาย — เหลือรอยว่าเคยมีข้อความ)
//
// ด่านทั้งหมดมาจาก lib/master/updateAccess.js (canMutateUpdate): เจ้าของข้อความ
// เท่านั้น + ต้องยังโพสต์ในเธรดนั้นได้อยู่ + ข้อความที่ระบบเขียนแก้ไม่ได้เลย
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import {
  canMutateUpdate, canViewUpdates, loadUpdateParent, updateEntityConfig,
} from '@/lib/master/updateAccess';
import { sanitizeUpdateAttachments } from '@/lib/master/updateTypes';
import { findUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

// โหลดข้อความ + entity แม่ของมัน (ใช้ร่วมทั้ง PATCH/DELETE)
async function loadContext(supabase, id) {
  const row = await findUpdate(supabase, id);
  if (!row) return { row: null, parent: null };
  const parent = await loadUpdateParent(supabase, row.entityType, row.entityId);
  return { row, parent };
}

export async function PATCH(request, { params }) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getCurrentUser();
    const { id } = await params;
    const { row, parent } = await loadContext(supabase, id);
    if (!row || !parent) return Response.json({ error: 'ไม่พบข้อความ' }, { status: 404 });
    if (!(await canViewUpdates(supabase, row.entityType, parent, user))) {
      return Response.json({ error: 'ไม่พบข้อความ' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const nowIso = new Date().toISOString();
    let patch;

    if (body.action === 'acknowledge') {
      // รับทราบ = ใครก็ตามที่อ่านเธรดได้ (ไม่ใช่แค่เจ้าของข้อความ) — เป็นการบอกว่า
      // "เห็นแล้ว" ไม่ใช่การแก้เนื้อหา
      patch = { acknowledgedBy: user?.id ?? null, acknowledgedAt: nowIso };
    } else if (body.action === 'edit') {
      if (!(await canMutateUpdate(supabase, row.entityType, parent, user, row))) {
        return Response.json({ error: 'แก้ข้อความนี้ไม่ได้' }, { status: 403 });
      }
      const text = String(body.body ?? '').trim();
      const attachments = updateEntityConfig(row.entityType)?.attachments && 'attachments' in body
        ? sanitizeUpdateAttachments(body.attachments)
        : (row.attachments || []);
      if (!text && !attachments.length) {
        return Response.json({ error: 'ต้องมีข้อความหรือไฟล์แนบ' }, { status: 400 });
      }
      patch = { body: text || null, attachments, editedAt: nowIso };
    } else {
      return Response.json({ error: 'action ไม่ถูกต้อง' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('entity_updates').update(patch).eq('id', id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await recordAudit({
      user, action: 'update', entityType: 'entity_update', entityId: id, before: row, after: data,
      summary: body.action === 'acknowledge' ? 'รับทราบข้อความในเธรด' : 'แก้ข้อความในเธรด',
      request,
    });
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const supabase = getSupabaseAdmin();
    const user = await getCurrentUser();
    const { id } = await params;
    const { row, parent } = await loadContext(supabase, id);
    if (!row || !parent) return Response.json({ error: 'ไม่พบข้อความ' }, { status: 404 });
    if (!(await canMutateUpdate(supabase, row.entityType, parent, user, row))) {
      return Response.json({ error: 'ลบข้อความนี้ไม่ได้' }, { status: 403 });
    }

    // soft delete: คนอื่นอ่านไปแล้ว การให้หายเงียบทำให้เธรดโกหก — เหลือรอยไว้
    const { error } = await supabase.from('entity_updates').update({
      deletedBy: user?.id ?? null,
      deletedAt: new Date().toISOString(),
    }).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await recordAudit({
      user, action: 'delete', entityType: 'entity_update', entityId: id, before: row,
      summary: 'ลบข้อความในเธรด (soft)', request,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
