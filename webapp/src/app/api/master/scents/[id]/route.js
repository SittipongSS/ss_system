// ── API กลิ่นรายตัว (mig 0171) — แก้ / รับเข้าทะเบียน / เปลี่ยนสถานะ / ลบ ──
// action ทั้งหมดมาทาง PATCH ตัวเดียว (body.action) เพื่อให้ด่านสิทธิ์อยู่ที่เดียว
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import {
  acceptScentError, archiveScentError, canEditScent, canViewScents,
  deleteScentError, isScentRegistrar, normalizeScentInput, scentTransitionError,
} from '@/lib/master/scents';
import { findScent, updateScent } from '@/lib/master/scentFormulaAdmin';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewScents(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    const scent = await findScent(supabase, id);
    if (!scent) return notFound('ไม่พบกลิ่น');
    return ok(scent);
  } catch (e) {
    return fail(e.message, 500);
  }
});

// PATCH /api/master/scents/[id]
//   { action: 'edit',   ...ฟิลด์เดียวกับตอนสร้าง }
//   { action: 'accept', code }            — RD รับร่างเข้าทะเบียน
//   { action: 'status', status }          — developing ↔ active ↔ archived
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let scent;
  try {
    scent = await findScent(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (!scent) return notFound('ไม่พบกลิ่น');

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'edit';

  try {
    if (action === 'edit') {
      if (!canEditScent(user, scent)) return forbidden('ไม่มีสิทธิ์แก้กลิ่นนี้');
      const { value, error } = normalizeScentInput({ ...scent, ...body });
      if (error) return badRequest(error);
      // รหัส/สถานะเปลี่ยนผ่าน action เฉพาะทางเท่านั้น — กันหน้าจอส่งมาเงียบ ๆ
      const { code, ...editable } = value;
      const data = await updateScent(supabase, id, editable);
      await recordAudit({
        user, action: 'update', entityType: 'scent', entityId: id,
        before: scent, after: data, request: req,
      });
      return ok(data);
    }

    if (action === 'accept') {
      // มติ 10: ฝ่ายขายเปิดร่างได้ แต่คนรับเข้าทะเบียนคือ RD เท่านั้น
      if (!isScentRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่รับกลิ่นเข้าทะเบียนได้');
      const error = acceptScentError(scent, body);
      if (error) return badRequest(error);
      const data = await updateScent(supabase, id, {
        code: String(body.code).trim(),
        status: 'developing',
        // RD ที่รับเรื่องเป็นเจ้าของกลิ่น ถ้ายังไม่มีใครถือ
        ownerId: scent.ownerId || user.id,
        ownerName: scent.ownerName || user.name || null,
        acceptedById: user.id,
        acceptedByName: user.name || null,
        acceptedAt: new Date().toISOString(),
      });
      await recordAudit({
        user, action: 'update', entityType: 'scent', entityId: id,
        before: scent, after: data, request: req,
      });
      return ok(data);
    }

    if (action === 'status') {
      if (!isScentRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่เปลี่ยนสถานะกลิ่นได้');
      const next = body.status;
      // ตรวจเส้นทางเสมอ · เคส archive ตรวจก่อนเพื่อให้ได้ข้อความที่ตรงกว่า
      // ("ร่างยังไม่ได้เข้าทะเบียน — ลบทิ้งแทน" ดีกว่า "เปลี่ยนสถานะไม่ได้")
      const error = (next === 'archived' ? archiveScentError(scent) : null)
        || scentTransitionError(scent, next);
      if (error) return badRequest(error);
      const data = await updateScent(supabase, id, { status: next });
      await recordAudit({
        user, action: 'update', entityType: 'scent', entityId: id,
        before: scent, after: data, request: req,
      });
      return ok(data);
    }

    return badRequest('action ไม่ถูกต้อง');
  } catch (e) {
    return badRequest(e.message);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let scent;
  try {
    scent = await findScent(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (!scent) return notFound('ไม่พบกลิ่น');
  if (!canEditScent(user, scent)) return forbidden('ไม่มีสิทธิ์ลบกลิ่นนี้');

  const error = deleteScentError(scent, { revisionCount: (scent.revisions || []).length });
  if (error) return badRequest(error);

  const { error: delError } = await supabase.from('scents').delete().eq('id', id);
  if (delError) return fail(delError.message, 500);
  await recordAudit({
    user, action: 'delete', entityType: 'scent', entityId: id, before: scent, request: req,
  });
  return ok({ ok: true });
});
