// ── API ทะเบียนสูตร (mig 0171) — ค้นหา + เสนอสูตรใหม่ ─────────────────────
// แพตเทิร์นเดียวกับทะเบียนกลิ่น: ฝ่ายขายเสนอร่าง · RD รับเข้าทะเบียน
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import {
  canEditFormula, canOfferFormulaDelete, canProposeFormula, canViewFormulas, isFormulaRegistrar, normalizeFormulaInput,
} from '@/lib/master/formulas';
import { createFormula, loadFormulas } from '@/lib/master/scentFormulaAdmin';
import { canManageRegistryShares, requestedShareIds, shareChangeSummary, SHARE_FORBIDDEN } from '@/lib/master/registryShares';
import { planRegistryShares, saveRegistryShares } from '@/lib/master/registrySharesAdmin';

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
    return ok(rows.map((f) => ({ ...f, _canEdit: canEditFormula(user, f), _canDelete: canOfferFormulaDelete(user, f) })));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/master/formulas
// { name, code?, formulaDate?, scentId?, customerId?, customerName?, note?, sharedCustomerIds? }
//   `sharedCustomerIds` = ช่อง "ลูกค้าอื่นที่ใช้ได้" ของฟอร์ม (มติ 2026-10-05 · `canManageRegistryShares` เท่านั้น)
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canProposeFormula(user)) return forbidden('ไม่มีสิทธิ์เพิ่มสูตรเข้าทะเบียน');

  const body = await req.json().catch(() => ({}));
  const accepted = isFormulaRegistrar(user) && !!String(body.code ?? '').trim();
  const shareIds = requestedShareIds(body);
  if (shareIds && !canManageRegistryShares(user)) return forbidden(SHARE_FORBIDDEN.formula);

  try {
    /* ⚠️ ตรวจรายชื่อแชร์ **ก่อนสร้าง** — สร้างแล้วแชร์ตีกลับ = ฟอร์มค้างให้กดใหม่ แล้วได้สูตรซ้ำ */
    if (shareIds?.length) {
      const owner = normalizeFormulaInput(body).value?.customerId || null;
      await planRegistryShares(supabase, 'formula', { id: null, customerId: owner }, shareIds);
    }
    let data = await createFormula(supabase, body, user, { accepted });
    await recordAudit({
      user, action: 'create', entityType: 'formula', entityId: data.id, after: data, request: req,
    });
    if (shareIds?.length) {
      // แชร์สูตร = แชร์กลิ่นของสูตรให้รายใหม่ด้วย (ดู saveRegistryShares) — คำร้องเลือกกลิ่น ไม่ใช่สูตร
      const result = await saveRegistryShares(supabase, 'formula', data, shareIds, user);
      await recordAudit({
        user, action: 'update', entityType: 'formula', entityId: data.id, request: req,
        before: { ...data, sharedCustomers: result.before }, after: { ...data, sharedCustomers: result.after },
        summary: shareChangeSummary('formula', data, result),
      });
      data = {
        ...data, sharedCustomers: result.after, sharedCustomerIds: result.after.map((c) => c.customerId),
        scentSharedWith: result.scentSharedWith || [],
      };
    }
    return ok(data, 201);
  } catch (e) {
    return e.status ? fail(e.message, e.status) : badRequest(e.message);
  }
});
