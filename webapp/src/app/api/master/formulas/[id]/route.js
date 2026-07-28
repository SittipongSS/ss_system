// ── API สูตรรายตัว (mig 0171) — แก้ / รับเข้าทะเบียน / เลิกใช้ / ลบ ───────
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import {
  acceptFormulaError, archiveFormulaError, canEditFormula, canViewFormulas,
  deleteFormulaError, isFormulaRegistrar, normalizeFormulaInput,
} from '@/lib/master/formulas';
import {
  countProductsUsingFormula, findFormula, updateFormula,
} from '@/lib/master/scentFormulaAdmin';
import { canForceDelete, formulaForcePreview, isDryRun, isForceRequest } from '@/lib/forceDelete';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewFormulas(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    const formula = await findFormula(supabase, id);
    if (!formula) return notFound('ไม่พบสูตร');
    return ok(formula);
  } catch (e) {
    return fail(e.message, 500);
  }
});

// PATCH  { action: 'edit' | 'accept' | 'status' }
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let formula;
  try {
    formula = await findFormula(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (!formula) return notFound('ไม่พบสูตร');

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'edit';

  try {
    if (action === 'edit') {
      if (!canEditFormula(user, formula)) return forbidden('ไม่มีสิทธิ์แก้สูตรนี้');
      const { value, error } = normalizeFormulaInput({ ...formula, ...body });
      if (error) return badRequest(error);
      const { code, ...editable } = value;   // รหัสเปลี่ยนผ่าน action 'accept' เท่านั้น
      const data = await updateFormula(supabase, id, editable);
      await recordAudit({
        user, action: 'update', entityType: 'formula', entityId: id,
        before: formula, after: data, request: req,
      });
      return ok(data);
    }

    if (action === 'accept') {
      if (!isFormulaRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่รับสูตรเข้าทะเบียนได้');
      const error = acceptFormulaError(formula, body);
      if (error) return badRequest(error);
      const data = await updateFormula(supabase, id, {
        code: String(body.code).trim(),
        status: 'active',
        acceptedById: user.id,
        acceptedByName: user.name || null,
        acceptedAt: new Date().toISOString(),
      });
      await recordAudit({
        user, action: 'update', entityType: 'formula', entityId: id,
        before: formula, after: data, request: req,
      });
      return ok(data);
    }

    if (action === 'status') {
      if (!isFormulaRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่เปลี่ยนสถานะสูตรได้');
      const next = body.status;
      if (!['active', 'archived'].includes(next)) return badRequest('สถานะไม่ถูกต้อง');
      const error = next === 'archived' ? archiveFormulaError(formula) : null;
      if (error) return badRequest(error);
      if (next === 'active' && formula.status === 'draft') {
        return badRequest('ร่างต้องรับเข้าทะเบียนพร้อมรหัสก่อน');
      }
      const data = await updateFormula(supabase, id, { status: next });
      await recordAudit({
        user, action: 'update', entityType: 'formula', entityId: id,
        before: formula, after: data, request: req,
      });
      return ok(data);
    }

    return badRequest('action ไม่ถูกต้อง');
  } catch (e) {
    return badRequest(e.message);
  }
});

// DELETE — ปกติลบได้เฉพาะร่างที่ยังไม่มีสินค้าอ้างถึง
// ?dryRun=1 / ?force=1 = break-glass ของผู้ดูแลระบบ (ดู lib/forceDelete.js)
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;

  let formula;
  let productCount = 0;
  try {
    formula = await findFormula(supabase, id);
    if (formula) productCount = await countProductsUsingFormula(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  if (!formula) return notFound('ไม่พบสูตร');

  if (isDryRun(req) || isForceRequest(req)) {
    if (!canForceDelete(user)) return forbidden('บังคับลบต้องเป็นผู้ดูแลระบบ (admin)');
    const preview = await formulaForcePreview(supabase, formula);
    if (isDryRun(req)) return ok(preview);
    const { error: delError } = await supabase.from('formulas').delete().eq('id', id);
    if (delError) return fail(delError.message, 500);
    await recordAudit({
      user, action: 'delete', entityType: 'formula', entityId: id, before: formula, request: req,
      summary: `[admin force] ลบสูตร ${formula.code || formula.name} (สถานะ ${formula.status})`,
    });
    return ok({ ok: true, forced: true });
  }

  if (!canEditFormula(user, formula)) return forbidden('ไม่มีสิทธิ์ลบสูตรนี้');

  const error = deleteFormulaError(formula, { productCount });
  if (error) return badRequest(error);

  const { error: delError } = await supabase.from('formulas').delete().eq('id', id);
  if (delError) return fail(delError.message, 500);
  await recordAudit({
    user, action: 'delete', entityType: 'formula', entityId: id, before: formula, request: req,
  });
  return ok({ ok: true });
});
