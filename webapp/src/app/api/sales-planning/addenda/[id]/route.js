import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { ADDENDUM_DOC_TITLE, canDeleteAddendum, isAddendumEditable } from '@/lib/sales/contractAddenda';
import { purgeAttachments } from '@/lib/master/attachments';

export const dynamic = 'force-dynamic';

// ช่องที่แก้ได้ตอนเป็นร่าง — ที่เหลือขยับผ่าน action ของตัวเอง (issue / sign / cancel)
const EDITABLE_KEYS = new Set(['addendumDate', 'fields', 'notes']);

const CONTRACT_COLUMNS = 'id, "contractNo", "contractDate", "effectiveDate", "signedDate", kind, status,'
  + ' "customerName", fields, metadata';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row, response } = await loadScoped(supabase, 'sales_contract_addenda', id, user, 'view');
  if (response) return response;

  const [{ data: contract }, { data: signedFile }] = await Promise.all([
    supabase.from('sales_contracts').select(CONTRACT_COLUMNS).eq('id', row.contractId).maybeSingle(),
    row.signedFileId
      ? supabase.from('attachments').select('id, "fileName", "mimeType", "sizeBytes", "createdAt"')
        .eq('id', row.signedFileId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { issuedHtml, ...rest } = row;
  return ok({
    ...rest,
    hasIssuedDocument: !!issuedHtml,
    contract: contract || null,
    signedFile: signedFile || null,
    canEdit: canEditSalesPlanning(user) && inSalesEditScope(user, row),
  });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contract_addenda', id, user, 'edit');
  if (response) return response;
  // ⭐ ออกเลขแล้ว = กระดาษที่คู่สัญญาถืออยู่ — แก้ไม่ได้ ต้องยกเลิกแล้วออกฉบับใหม่
  if (!isAddendumEditable(before)) {
    return fail('บันทึกที่ออกเลขแล้วแก้ไม่ได้ — ยกเลิกแล้วออกฉบับใหม่แทน', 409);
  }

  const body = await req.json();
  const patch = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (EDITABLE_KEYS.has(key)) patch[key] = value;
  }
  if (!Object.keys(patch).length) return badRequest('ไม่มีช่องที่แก้ได้ในคำขอนี้');
  patch.updatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('sales_contract_addenda').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract_addendum', entityId: id,
    before, after: data,
    summary: `แก้ร่าง${ADDENDUM_DOC_TITLE} ${data.docNo || data.id}`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row, response } = await loadScoped(supabase, 'sales_contract_addenda', id, user, 'edit');
  if (response) return response;
  if (!canDeleteAddendum(row)) {
    return fail('ลบได้เฉพาะร่างที่ยังไม่ออกเลขที่ — ฉบับที่ออกแล้วให้กดยกเลิก', 409);
  }

  // ไฟล์ที่แนบกับบันทึกเพิ่มเติม — เหตุผลเดียวกับตัวสัญญา
  await purgeAttachments('contract_addendum', id);
  const { error } = await supabase.from('sales_contract_addenda').delete().eq('id', id);
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'delete', entityType: 'sales_contract_addendum', entityId: id, before: row,
    summary: `ลบร่าง${ADDENDUM_DOC_TITLE} ของสัญญา ${row.metadata?.contractNo || row.contractId}`,
    request: req,
  });
  return ok({ ok: true });
});
