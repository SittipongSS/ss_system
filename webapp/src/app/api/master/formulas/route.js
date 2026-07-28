// ── API ทะเบียนสูตร (mig 0171) — ค้นหา + เสนอสูตรใหม่ ─────────────────────
// แพตเทิร์นเดียวกับทะเบียนกลิ่น: ฝ่ายขายเสนอร่าง · RD รับเข้าทะเบียน
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import {
  canEditFormula, canProposeFormula, canViewFormulas, isFormulaRegistrar,
} from '@/lib/master/formulas';
import { createFormula, loadFormulas } from '@/lib/master/scentFormulaAdmin';

export const dynamic = 'force-dynamic';

// GET /api/master/formulas?status=active&customerId=CUS-1
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewFormulas(user)) return forbidden();

  const sp = new URL(req.url).searchParams;
  const statusParam = sp.get('status');
  try {
    const rows = await loadFormulas(supabase, {
      status: statusParam ? statusParam.split(',').filter(Boolean) : null,
      customerId: sp.get('customerId') || null,
    });
    // ธงสิทธิ์มากับแถว — หน้าจอไม่มี user id ให้เทียบเอง (ดูหมายเหตุใน scents/route.js)
    return ok(rows.map((f) => ({ ...f, _canEdit: canEditFormula(user, f) })));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/master/formulas
// { name, code?, formulaDate?, scentId?, customerId?, customerName?, note? }
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canProposeFormula(user)) return forbidden('ไม่มีสิทธิ์เพิ่มสูตรเข้าทะเบียน');

  const body = await req.json().catch(() => ({}));
  const accepted = isFormulaRegistrar(user) && !!String(body.code ?? '').trim();

  try {
    const data = await createFormula(supabase, body, user, { accepted });
    await recordAudit({
      user, action: 'create', entityType: 'formula', entityId: data.id, after: data, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return badRequest(e.message);
  }
});
