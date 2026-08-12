// ── API สูตรรายตัว (mig 0171) — แก้ / รับเข้าทะเบียน / เลิกใช้ / ลบ ───────
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import {
  acceptFormulaError, archiveFormulaError, canEditFormula, canViewFormulas,
  deleteFormulaError, formulaTransitionError, isFormulaRegistrar, normalizeFormulaInput,
} from '@/lib/master/formulas';
import {
  countProductsUsingFormula, countRegistryRefs, editFormula, findFormula, findFormulaDetail, updateFormula,
} from '@/lib/master/scentFormulaAdmin';
import { canForceDelete, formulaForcePreview, unlinkRegistryRefs, isDryRun, isForceRequest } from '@/lib/forceDelete';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewFormulas(user)) return forbidden();
  const { id } = await ctx.params;
  try {
    // ⚠️ ต่อ "ที่มา" และ "ราคา" ชุดเดียวกับหน้ารายการ — เปิดใบเดียวกันจากสองทาง
    // แล้วเห็นข้อมูลไม่เท่ากันคือโรคเดียวกับที่ AGENTS.md ห้ามเรื่องฟอร์ม
    const formula = await findFormulaDetail(supabase, id);
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
      /* ⭐ **แก้รหัสได้แล้ว** (มติผู้ใช้ 2026-08-10) — เดิมรหัสเปลี่ยนผ่าน action
         'accept' เท่านั้น ⇒ พิมพ์รหัสผิดตอนรับเข้าทะเบียนแล้วแก้ไม่ได้เลย ต้องลบ
         ทั้งแถวแล้วสร้างใหม่ ซึ่งช่วงย้ายระบบที่พิมพ์รหัสเป็นร้อยตัวคือกำแพงจริง
         ⚠️ **เฉพาะคนที่รับสูตรเข้าทะเบียนได้** — รหัสคือตัวตนที่ระบบอื่นอ้างถึง
         (ใบขอราคา · สินค้า · เอกสาร) ไม่ใช่ข้อความทั่วไปที่ใครก็แก้ได้
         ⚠️ สถานะยังเปลี่ยนผ่าน action เฉพาะทางเหมือนเดิม — กันหน้าจอส่งมาเงียบ ๆ */
      const { code, ...editable } = value;
      if (code !== undefined && code !== (formula.code ?? null)) {
        if (!isFormulaRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่แก้รหัสได้');
        /* 🐞 **ล้างรหัสของสูตรที่รับเข้าทะเบียนแล้วไม่ได้** — DB มี CHECK
           `status = 'draft' OR code IS NOT NULL` อยู่แล้ว แต่ปล่อยให้ชนที่ฐานจะได้
           error ดิบของ Postgres ที่คนอ่านไม่ออก · ตอบเป็นภาษาไทยตั้งแต่ที่นี่
           ⚠️ ร่างยังล้างได้ — ร่างที่ยังไม่มีรหัสคือสถานะปกติของมัน */
        if (!code && formula.status !== 'draft') {
          return badRequest('สูตรที่รับเข้าทะเบียนแล้วต้องมีรหัสเสมอ — แก้เป็นรหัสใหม่ หรือเก็บเข้ากรุแทน');
        }
        editable.code = code;
      }
      // ⚠️ ต้อง derive ลูกค้าใหม่ **ทุกครั้งที่แก้** ไม่ใช่เฉพาะตอนสร้าง — เปลี่ยนกลิ่น
      // ที่สูตรใช้แล้วลูกค้าไม่ตามไปด้วย = สูตรของลูกค้า A ที่ใช้กลิ่นของลูกค้า B
      // ซึ่งคือรูที่ 0207 ตั้งใจปิด
      const data = await editFormula(supabase, id, editable);
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
      // ⚠️ ด่านเส้นทางย้ายไปอยู่ที่ `formulaTransitionError` แล้ว (0207) — เดิมเป็น
      // allow-list สองค่าเขียนตรงนี้ ซึ่งกัน 'developing' ที่เพิ่งเปิดใช้ออกไปด้วย
      // และเป็นกฎคนละชุดกับทะเบียนกลิ่นทั้งที่สองทะเบียนเดินคู่กันในสายงานเดียว
      // เคส archive ตรวจก่อนเพื่อให้ได้ข้อความที่ตรงกว่า (แพตเทิร์นเดียวกับ scents)
      const error = (next === 'archived' ? archiveFormulaError(formula) : null)
        || formulaTransitionError(formula, next);
      if (error) return badRequest(error);
      if (formula.status === 'draft') {
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
    /* ปลด pointer ที่เป็น RESTRICT ก่อน (mig 0231) — เหตุผลเดียวกับฝั่งกลิ่น:
       คำร้อง/บรรทัดคำร้อง/ทะเบียนราคา ไม่ยอมให้ลบสูตรที่ถูกอ้างอยู่ */
    try {
      await unlinkRegistryRefs(supabase, 'formula', id);
    } catch (unlinkError) {
      return fail(unlinkError.message, 500);
    }
    const { error: delError } = await supabase.from('formulas').delete().eq('id', id);
    if (delError) return fail(delError.message, 500);
    await recordAudit({
      user, action: 'delete', entityType: 'formula', entityId: id, before: formula, request: req,
      summary: `[admin force] ลบสูตร ${formula.code || formula.name} (สถานะ ${formula.status})`,
    });
    return ok({ ok: true, forced: true });
  }

  if (!canEditFormula(user, formula)) return forbidden('ไม่มีสิทธิ์ลบสูตรนี้');

  const error = deleteFormulaError(formula, {
    productCount,
    // pointer ที่เป็น RESTRICT หลัง mig 0231 — คำร้อง/บรรทัด/ทะเบียนราคา
    linkedCount: await countRegistryRefs(supabase, 'formula', id),
  });
  if (error) return badRequest(error);

  const { error: delError } = await supabase.from('formulas').delete().eq('id', id);
  if (delError) return fail(delError.message, 500);
  await recordAudit({
    user, action: 'delete', entityType: 'formula', entityId: id, before: formula, request: req,
  });
  return ok({ ok: true });
});
