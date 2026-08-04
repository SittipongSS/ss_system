// ── "รอจัดระเบียบ" (mig 0171) — สินค้าที่มีชื่อสูตรแต่ยังไม่ผูกทะเบียน ────
//
// ทำไมต้องมี endpoint นี้: บน prod มี 10 แถวที่กรอก "ชื่อสูตร" ไว้แต่ไม่มีรหัส
// และชื่อพวกนั้นคือ *ชื่อกลิ่น* (Walk on beach 01 · Forest night · …) เพราะเมื่อก่อน
// ไม่มีที่เก็บกลิ่น → migration ตั้งใจ **ไม่ backfill** กลุ่มนี้ เพราะระบบเดาแทน RD
// ไม่ได้ว่าแถวไหนเป็นกลิ่น แถวไหนเป็นสูตร (สร้าง master data ผิดแย่กว่าไม่สร้าง —
// ของผิดจะถูกอ้างต่อไปเรื่อย ๆ โดยไม่มีใครกลับมาตรวจ)
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import {
  canViewFormulas, findFormulaByCode, isFormulaRegistrar,
  sanitizeInheritedFormulaDate, unsortedFormulaRows,
} from '@/lib/master/formulas';
import { findScentByIdentity } from '@/lib/master/scents';
import {
  createFormula, createScent, linkProductToRegistry, loadFormulas, loadScents,
  loadUnsortedProducts,
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

  const name = String(body.name ?? row.formulaName).trim().replace(/\s+/g, ' ');
  const customerId = String(body.customerId ?? row.customerId ?? '').trim();
  const code = String(body.code ?? '').trim();

  // วันที่เสียที่สืบทอดมาจากสินค้าเก่าต้องไม่บล็อกการจัดระเบียบ (ดูหมายเหตุในตัวฟังก์ชัน)
  const formulaDate = sanitizeInheritedFormulaDate(body.formulaDate, row.formulaDate);

  try {
    if (body.as === 'scent') {
      // กลิ่นบังคับมีลูกค้าเสมอ (มติ 9) — สินค้าที่ยังไม่ผูกลูกค้าจึงจัดเป็นกลิ่นไม่ได้
      if (!customerId) return badRequest('สินค้านี้ยังไม่มีลูกค้า — ระบุลูกค้าเจ้าของกลิ่นก่อน');

      // ⚠️ ของจริงมีชื่อซ้ำข้ามสินค้า (สองสินค้าใช้กลิ่นเดียวกัน) — ถ้าสร้างใหม่ท่าเดียว
      // แถวที่สองจะชน scents_identity_uk แล้ว **ค้างในลิสต์ตลอดไป** เพราะไม่มีทางผูก
      // เข้ากลิ่นที่เพิ่งสร้าง → เจอตัวเดิมให้ผูกเลย ไม่ต้องสร้างซ้ำ
      const existing = findScentByIdentity(
        await loadScents(supabase, { status: null, customerId }), { name, customerId },
      );
      const scent = existing || await createScent(supabase, {
        name,
        code: code || null,
        customerId,
        customerName: body.customerName ?? row.customerName,
        note: `ย้ายมาจากช่อง "ชื่อสูตร" ของสินค้า ${row.fgCode || row.productName}`,
      }, user, { accepted: !!code });
      await linkProductToRegistry(supabase, row.productId, { scentId: scent.id });
      await recordAudit({
        user, action: existing ? 'update' : 'create', entityType: 'scent', entityId: scent.id,
        after: scent, request: req,
        summary: existing
          ? `จัดระเบียบ: ผูกสินค้า ${row.fgCode || row.productId} เข้ากลิ่น "${name}" ที่มีอยู่แล้ว`
          : `จัดระเบียบ: "${name}" เป็นกลิ่น (จากสินค้า ${row.fgCode || row.productId})`,
      });
      return ok({ kind: 'scent', row: scent, reused: !!existing }, existing ? 200 : 201);
    }

    // สูตรก็ซ้ำได้เหมือนกัน — เทียบด้วยรหัสถ้ามี ไม่มีก็เทียบชื่อ+ลูกค้าในกลุ่มร่าง
    // (ทะเบียนสูตรไม่มี unique บนชื่อ ถ้าไม่เช็คเองจะได้สูตรชื่อเดียวกันสองแถวเงียบ ๆ)
    const formulas = await loadFormulas(supabase, { status: null });
    const existing = (code && findFormulaByCode(formulas, code))
      || formulas.find((f) => f.name.trim().replace(/\s+/g, ' ').toLowerCase() === name.toLowerCase()
        && (f.customerId || null) === (customerId || null));
    // ⚠️ ลูกค้าส่งผ่าน `fallbackCustomer` ไม่ใช่ใน body — ตั้งแต่ 0207 ลูกค้าของสูตร
    // มาจากกลิ่นเสมอ และ normalizeFormulaInput ทิ้งค่าที่ client ส่งมา · สูตรที่เกิด
    // จากการจัดระเบียบไม่มีกลิ่น จึงเป็นทางเดียวที่ยังระบุลูกค้าตรง ๆ ได้
    // (ไม่ส่ง = สินค้าของลูกค้ารายหนึ่งกลายเป็นสูตรฐานไร้ลูกค้าเงียบ ๆ)
    const formula = existing || await createFormula(supabase, {
      name,
      code: code || null,
      formulaDate,
      // หมวดสินค้า: ครึ่งหนึ่งของตัวตนสูตร — จัดระเบียบเสร็จแล้วต้องมีตัวตนทันที
      // ไม่ใช่โผล่มาเป็นแถวที่ไม่มีใครเทียบได้ว่าซ้ำกับของเดิมหรือเปล่า
      categoryCode: String(body.categoryCode ?? '').trim() || null,
    }, user, {
      accepted: !!code,
      fallbackCustomer: {
        customerId: customerId || null,
        customerName: body.customerName ?? row.customerName ?? null,
      },
    });
    await linkProductToRegistry(supabase, row.productId, { formulaId: formula.id });
    await recordAudit({
      user, action: existing ? 'update' : 'create', entityType: 'formula', entityId: formula.id,
      after: formula, request: req,
      summary: existing
        ? `จัดระเบียบ: ผูกสินค้า ${row.fgCode || row.productId} เข้าสูตร "${name}" ที่มีอยู่แล้ว`
        : `จัดระเบียบ: "${name}" เป็นสูตร (จากสินค้า ${row.fgCode || row.productId})`,
    });
    return ok({ kind: 'formula', row: formula, reused: !!existing }, existing ? 200 : 201);
  } catch (e) {
    return badRequest(e.message);
  }
});
