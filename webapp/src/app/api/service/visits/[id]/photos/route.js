// ── API รูปหน้างานทีละรูป (แผน operation-crew C5 · S3) ─────────────────────────────────
// POST   { url, name?, kind: 'before'|'after'|'other' } → เพิ่มรูปหนึ่งรูป (อัปไบต์ขึ้น Drive มาก่อนแล้ว)
// DELETE ?h=<กุญแจของรูป>                               → ถอดรูปหนึ่งรูปออกจากนัด (ไฟล์บน Drive ยังอยู่)
// ทั้งสองทางคืน `{ attachments, updatedAt }` = ชุดรูปล่าสุดของนัด (จอวาดใหม่จากชุดนี้ ไม่ใช่จากที่จำไว้)
//
// ⭐ ทำไมไม่ใช้ PATCH ของนัด — PATCH เขียน `attachments` **ทั้งชุด** จากที่จอถืออยู่ และลากทั้งท่อ (เลื่อนนัด ·
//    ถอนเครื่อง · audit ของทั้งใบ) ⇒ ช่างกับผู้ช่วยถ่ายรูปงานเดียวกันจากสองเครื่อง รูปของคนหนึ่งหายเงียบ
// 🔒 ด่าน `updatedAt` — เขียนเฉพาะเมื่อแถวยังเป็นรุ่นที่อ่านมา · ไม่ตรง (มีคนเขียนแทรก: รูปของอีกเครื่อง · รับงาน ·
//    ส่งงาน) = อ่านใหม่แล้วลองอีก 1 รอบบนชุดล่าสุด · ยังไม่ตรงอีก = 409 ให้กดใหม่ (ไม่เขียนทับ)
// ⚠️ งานที่ส่งแล้ว = 409 **ทุกตำแหน่ง** (หัวหน้าแก้รูปที่ "แก้ผลที่ส่ง") · ช่างบนใบที่ส่งแล้วโดนด่าน requireVisit ก่อน
// 🔒 ช่างแนบ/ลบรูปได้เฉพาะงานที่ **กำลังทำ** (`requireVisit({ running: true })`) — นัดที่ยังไม่รับงานเปิดให้หัวหน้าเท่านั้น
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { findVisit, requireVisit } from '@/lib/service/visitsRepo';
import { ATTACHMENT_KIND_LABELS, normalizeAttachment } from '@/lib/service/rounds';
import { cleanVisitFileKey } from '@/lib/service/visitFiles';
import {
  PHOTO_KEY_ERROR, PHOTO_MISSING_ERROR, PHOTO_RACE_ERROR, addVisitPhoto, photoEditError, removeVisitPhoto,
} from '@/lib/service/crew/visitPhotos';

export const dynamic = 'force-dynamic';

/**
 * เขียนชุดรูปใหม่ภายใต้ด่าน `updatedAt` — `edit(list)` คืน `{ list, changed }` จากชุดล่าสุดของแถว
 * คืน `{ visit, before, changed }` หรือ `{ response }`
 * ⚠️ supabase ไม่ throw — ทุกคำสั่งอ่าน `error` เอง · 0 แถว (`data: null`) = ด่านไม่ตรง ไม่ใช่สำเร็จ
 */
async function writePhotos(supabase, first, edit) {
  let visit = first;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const blocked = photoEditError(visit);
    if (blocked) return { response: conflict(blocked) };
    const { list, changed } = edit(visit.attachments);
    // ไม่มีอะไรเปลี่ยน (ส่งรูปเดิมซ้ำ · ลบรูปที่ไม่อยู่แล้ว) = ไม่เขียน ไม่แตะ updatedAt
    if (!changed) return { visit, before: visit, changed: false };
    const { data, error } = await supabase.from('service_visits')
      .update({ attachments: list, updatedAt: new Date().toISOString() })
      .eq('id', visit.id).eq('updatedAt', visit.updatedAt)
      .select('*').maybeSingle();
    if (error) return { response: fail(error.message, 500) };
    if (data) return { visit: data, before: visit, changed: true };
    visit = await findVisit(supabase, first.id);
    if (!visit) return { response: notFound('ไม่พบนัดเข้าบริการ') };
  }
  return { response: conflict(PHOTO_RACE_ERROR) };
}

const reply = (visit) => ok({ attachments: Array.isArray(visit.attachments) ? visit.attachments : [], updatedAt: visit.updatedAt });

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true, running: true });
    if (access.response) return access.response;

    const body = await req.json().catch(() => ({}));
    // ⭐ ตัวตรวจรูปตัวเดียวกับ PATCH ของนัด (`normalizeAttachment`) — สองทางเขียนรูปต้องได้กติกาเดียวกัน
    const { value: photo, error: invalid } = normalizeAttachment(body);
    if (invalid) return badRequest(invalid);
    if (!photo) return badRequest(PHOTO_MISSING_ERROR);

    const out = await writePhotos(supabase, access.visit, (list) => addVisitPhoto(list, photo));
    if (out.response) return out.response;
    if (out.changed) {
      await recordAudit({
        user, action: 'update', entityType: 'service_visit', entityId: id,
        before: { attachments: out.before.attachments || [] }, after: { attachments: out.visit.attachments || [] },
        summary: `แนบรูปหน้างาน (${ATTACHMENT_KIND_LABELS[photo.kind] || photo.kind}) ในนัด ${access.visit.code || id}`,
        request: req,
      });
    }
    return reply(out.visit);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true, running: true });
    if (access.response) return access.response;

    // กุญแจเดียวกับลิงก์เปิดรูป (`?h=`) — ลำดับในแถวเลื่อนได้เมื่อมีคนลบรูปก่อนหน้า ห้ามชี้ด้วยลำดับ
    const key = cleanVisitFileKey(new URL(req.url).searchParams.get('h'));
    if (!key) return badRequest(PHOTO_KEY_ERROR);

    const out = await writePhotos(supabase, access.visit, (list) => removeVisitPhoto(list, key));
    if (out.response) return out.response;
    if (out.changed) {
      await recordAudit({
        user, action: 'update', entityType: 'service_visit', entityId: id,
        before: { attachments: out.before.attachments || [] }, after: { attachments: out.visit.attachments || [] },
        summary: `ถอดรูปหน้างานออกจากนัด ${access.visit.code || id}`,
        request: req,
      });
    }
    return reply(out.visit);
  } catch (e) {
    return fail(e.message, 500);
  }
});
