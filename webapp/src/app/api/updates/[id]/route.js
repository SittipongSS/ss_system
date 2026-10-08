// ── แก้ / ลบ ข้อความในเธรดอัปเดต (mig 0163) ──────────────────────────────
// PATCH  { action: 'edit', body?, attachments? } | { action: 'acknowledge' }
//        `attachments` ตอนแก้ = เลือกจากไฟล์ที่ข้อความถืออยู่เท่านั้น (ถอดไฟล์ได้ เพิ่มไฟล์ไม่ได้)
// DELETE soft delete (แถวไม่หาย — เหลือรอยว่าเคยมีข้อความ)
//
// ด่านทั้งหมดมาจาก lib/master/updateAccess.js (canMutateUpdate): เจ้าของข้อความ
// เท่านั้น + ต้องยังโพสต์ในเธรดนั้นได้อยู่ + ข้อความที่ระบบเขียนแก้ไม่ได้เลย
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import {
  canMutateUpdate, canViewUpdates, loadUpdateParent, updateEntityConfig,
} from '@/lib/master/updateAccess';
import { isAuthorableKind, kindAcceptsDueDate } from '@/lib/master/updateTypes';
import { findUpdate } from '@/lib/master/updates';
import { recordAudit } from '@/lib/audit';
import { FILE_REF_ERROR_CODE, REF_SHAPE_TEXT } from '@/lib/upload/driveRefGate';

export const dynamic = 'force-dynamic';

// โหลดข้อความ + entity แม่ของมัน (ใช้ร่วมทั้ง PATCH/DELETE)
async function loadContext(supabase, id) {
  const row = await findUpdate(supabase, id);
  if (!row) return { row: null, parent: null };
  const parent = await loadUpdateParent(supabase, row.entityType, row.entityId);
  return { row, parent };
}

/* 🔴 ไฟล์ของข้อความตอนแก้ = **ชุดย่อยของไฟล์ที่แถวถืออยู่** (รอบสองของมติเจ้าของ 08/10/2569)
   🐞 เดิมรับ `attachments` จาก client ทั้งชุดแล้วเขียนทับ ⇒ แก้ข้อความของตัวเองให้ชี้ `driveFileId` ของไฟล์คนอื่น
      แล้วเปิดอ่านผ่าน /api/updates/[id]/file ได้ (ช่องเดียวกับตอนโพสต์)
   · จับคู่ด้วย `driveFileId` · ตัวที่แถวเก็บไว้โดยไม่มี id (รุ่นเก่า) จับคู่ด้วย `fileUrl` ที่ตรงกันทุกตัวอักษร
   · ของที่เขียนกลับคือ **ตัวที่แถวเก็บไว้ทั้งก้อน** เรียงตามที่ส่งมา — ไม่มีช่องไหนของคำขอถูกเก็บ
   · ตัวที่แถวเก็บไว้หนึ่งตัวถูกเลือกได้ครั้งเดียว ⇒ ส่งซ้ำ / ส่งตัวที่แถวไม่มี / ส่งที่ไม่ใช่ array = null (ตีกลับทั้งคำขอ)
   ⚠️ ไม่ถามใบรับ — ไม่มีไฟล์ใหม่เข้ามาทางนี้ ไฟล์เดิมที่อายุเกิน 24 ชั่วโมงจึงไม่ถูกตีกลับ */
function keptAttachments(stored, incoming) {
  if (!Array.isArray(incoming)) return null;
  const left = Array.isArray(stored) ? [...stored] : [];
  const kept = [];
  for (const item of incoming) {
    if (!item || typeof item !== 'object') return null;
    const at = left.findIndex((have) => {
      if (!have || typeof have !== 'object') return false;
      if (have.driveFileId) return have.driveFileId === item.driveFileId;
      return typeof have.fileUrl === 'string' && !!have.fileUrl && have.fileUrl === item.fileUrl;
    });
    if (at < 0) return null;
    kept.push(...left.splice(at, 1));
  }
  return kept;
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
        ? keptAttachments(row.attachments, body.attachments)
        : (row.attachments || []);
      if (!attachments) {
        return Response.json({ error: REF_SHAPE_TEXT, code: FILE_REF_ERROR_CODE }, { status: 400 });
      }
      if (!text && !attachments.length) {
        return Response.json({ error: 'ต้องมีข้อความหรือไฟล์แนบ' }, { status: 400 });
      }
      patch = { body: text || null, attachments, editedAt: nowIso };

      // เปลี่ยนชนิดตอนแก้ได้ (โพสต์ผิดช่องแล้วอยากย้ายจาก "บันทึก" เป็น "โทร") แต่
      // ต้องเป็นชนิดที่คนเลือกได้เท่านั้น — แก้ให้กลายเป็นเหตุการณ์ระบบไม่ได้
      if ('kind' in body) {
        const nextKind = String(body.kind ?? '');
        if (!isAuthorableKind(row.entityType, nextKind)) {
          return Response.json({ error: 'ชนิดอัปเดตไม่ถูกต้อง' }, { status: 400 });
        }
        patch.kind = nextKind;
      }
      // กำหนดวันเดินตามชนิดสุดท้ายเสมอ: ย้ายไปชนิดที่ไม่รับวันแล้ววันต้องหายตาม
      // ไม่ใช่ค้างใน meta แบบมองไม่เห็น
      if ('kind' in body || 'dueDate' in body) {
        const finalKind = patch.kind || row.kind;
        const due = String(body.dueDate ?? row.meta?.dueDate ?? '').trim();
        const meta = { ...(row.meta || {}) };
        if (due && kindAcceptsDueDate(row.entityType, finalKind)) meta.dueDate = due.slice(0, 10);
        else delete meta.dueDate;
        patch.meta = meta;
      }
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
