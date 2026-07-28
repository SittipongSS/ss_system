// ── "รอจัดระเบียบ" (mig 0171) — สินค้าที่มีชื่อสูตรแต่ยังไม่ผูกทะเบียน ────
//
// ทำไมต้องมี endpoint นี้: บน prod มี 10 แถวที่กรอก "ชื่อสูตร" ไว้แต่ไม่มีรหัส
// และชื่อพวกนั้นคือ *ชื่อกลิ่น* (Walk on beach 01 · Forest night · …) เพราะเมื่อก่อน
// ไม่มีที่เก็บกลิ่น → migration ตั้งใจ **ไม่ backfill** กลุ่มนี้ เพราะระบบเดาแทน RD
// ไม่ได้ว่าแถวไหนเป็นกลิ่น แถวไหนเป็นสูตร (สร้าง master data ผิดแย่กว่าไม่สร้าง —
// ของผิดจะถูกอ้างต่อไปเรื่อย ๆ โดยไม่มีใครกลับมาตรวจ)
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { canViewFormulas, isFormulaRegistrar, unsortedFormulaRows } from '@/lib/master/formulas';
import {
  createFormula, createScent, linkProductToRegistry, loadUnsortedProducts,
} from '@/lib/master/scentFormulaAdmin';

export const dynamic = 'force-dynamic';

// GET /api/master/formulas/unsorted
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canViewFormulas(user)) return forbidden();
  try {
    return ok(unsortedFormulaRows(await loadUnsortedProducts(supabase)));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/master/formulas/unsorted
// { productId, as: 'scent' | 'formula', name?, code?, customerId?, formulaDate? }
// สร้างของในทะเบียนจากแถวที่ค้างอยู่ แล้วผูกสินค้ากลับไปหาในจังหวะเดียวกัน
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  // ตัดสินว่าอะไรเป็นกลิ่น/สูตร = งานของ RD ล้วน ๆ (ฝ่ายขายเดาแทนไม่ได้เหมือนกัน)
  if (!isFormulaRegistrar(user)) return forbidden('เฉพาะ RD เท่านั้นที่จัดระเบียบทะเบียนได้');

  const body = await req.json().catch(() => ({}));
  if (!body.productId) return badRequest('ต้องระบุสินค้า');
  if (!['scent', 'formula'].includes(body.as)) return badRequest('ต้องเลือกว่าเป็นกลิ่นหรือสูตร');

  let rows;
  try {
    rows = unsortedFormulaRows(await loadUnsortedProducts(supabase));
  } catch (e) {
    return fail(e.message, 500);
  }
  const row = rows.find((r) => r.productId === body.productId);
  if (!row) return notFound('สินค้านี้ไม่อยู่ในรายการรอจัดระเบียบแล้ว');

  const name = String(body.name ?? row.formulaName).trim();
  const customerId = String(body.customerId ?? row.customerId ?? '').trim();

  try {
    if (body.as === 'scent') {
      // กลิ่นบังคับมีลูกค้าเสมอ (มติ 9) — สินค้าที่ยังไม่ผูกลูกค้าจึงจัดเป็นกลิ่นไม่ได้
      if (!customerId) return badRequest('สินค้านี้ยังไม่มีลูกค้า — ระบุลูกค้าเจ้าของกลิ่นก่อน');
      const scent = await createScent(supabase, {
        name,
        code: body.code,
        customerId,
        customerName: body.customerName ?? row.customerName,
        note: `ย้ายมาจากช่อง "ชื่อสูตร" ของสินค้า ${row.fgCode || row.productName}`,
      }, user, { accepted: !!String(body.code ?? '').trim() });
      await linkProductToRegistry(supabase, row.productId, { scentId: scent.id });
      await recordAudit({
        user, action: 'create', entityType: 'scent', entityId: scent.id, after: scent, request: req,
        summary: `จัดระเบียบ: "${name}" เป็นกลิ่น (จากสินค้า ${row.fgCode || row.productId})`,
      });
      return ok({ kind: 'scent', row: scent }, 201);
    }

    const formula = await createFormula(supabase, {
      name,
      code: body.code,
      formulaDate: body.formulaDate ?? row.formulaDate,
      customerId: customerId || null,
      customerName: body.customerName ?? row.customerName,
    }, user, { accepted: !!String(body.code ?? '').trim() });
    await linkProductToRegistry(supabase, row.productId, { formulaId: formula.id });
    await recordAudit({
      user, action: 'create', entityType: 'formula', entityId: formula.id, after: formula, request: req,
      summary: `จัดระเบียบ: "${name}" เป็นสูตร (จากสินค้า ${row.fgCode || row.productId})`,
    });
    return ok({ kind: 'formula', row: formula }, 201);
  } catch (e) {
    return badRequest(e.message);
  }
});
