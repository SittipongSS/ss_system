import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { canDeleteContract, contractKindLabel, isContractEditable } from '@/lib/sales/contracts';

export const dynamic = 'force-dynamic';

// ช่องที่แก้ได้ตอนเป็นร่าง — ทุกอย่างที่เหลือ (สถานะ เลขที่ ฉบับตรึง ผู้ออก) ขยับได้
// เฉพาะผ่าน action ของตัวเอง (issue / sign / cancel)
// ⚠️ allowlist ไม่ใช่ blocklist: ช่องใหม่ที่เพิ่มทีหลังต้องมาเปิดที่นี่โดยตั้งใจ
const EDITABLE_KEYS = new Set(['contractDate', 'fields', 'notes', 'customerName', 'quotationId', 'effectiveDate', 'expiryDate']);

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;

  // ไฟล์ที่เซ็นกลับ + ใบเสนอราคาที่อ้าง — หน้ารายละเอียดต้องการทั้งคู่เสมอ
  const [{ data: signedFile }, { data: quotation }] = await Promise.all([
    row.signedFileId
      // ⚠️ คอลัมน์ของ attachments คือ `uploadedByName` ไม่ใช่ `createdByName` (mig 0028)
      ? supabase.from('attachments').select('id, "fileName", "mimeType", "sizeBytes", "createdAt", "uploadedByName"').eq('id', row.signedFileId).maybeSingle()
      : Promise.resolve({ data: null }),
    row.quotationId
      ? supabase.from('quotations').select('id, "quoteNumber", status, "approvalStatus", "totalAmount"').eq('id', row.quotationId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const { issuedHtml, ...rest } = row;
  return ok({
    ...rest,
    hasIssuedDocument: !!issuedHtml,
    signedFile: signedFile || null,
    quotation: quotation || null,
    canEdit: inSalesEditScope(user, row.deal) && canEditSalesPlanning(user),
  });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;

  // ⭐ ใบที่ออกเลขไปแล้วคือกระดาษที่ลูกค้าถืออยู่ — แก้เนื้อไม่ได้ ต้องยกเลิกแล้วออกใหม่
  if (!isContractEditable(before)) {
    return fail('สัญญาที่ออกเลขแล้วแก้ไม่ได้ — ยกเลิกแล้วออกฉบับใหม่แทน', 409);
  }

  const body = await req.json();
  const patch = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (EDITABLE_KEYS.has(key)) patch[key] = value;
  }
  if (!Object.keys(patch).length) return badRequest('ไม่มีช่องที่แก้ได้ในคำขอนี้');
  if (patch.fields && typeof patch.fields !== 'object') return badRequest('ค่าที่กรอกต้องเป็นอ็อบเจกต์');
  patch.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('sales_contracts').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: id,
    before, after: data,
    summary: `แก้ร่าง${contractKindLabel(data.kind)} ${data.contractNo || data.id}`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});

// DELETE — เฉพาะร่างที่ยังไม่เคยออกเลข (ใบที่มีเลขต้องยกเลิกให้เหลือร่องรอย)
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;
  if (!canDeleteContract(row)) {
    return fail('ลบได้เฉพาะร่างที่ยังไม่ออกเลขที่สัญญา — ใบที่ออกแล้วให้กดยกเลิก', 409);
  }

  const { error } = await supabase.from('sales_contracts').delete().eq('id', id);
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'delete', entityType: 'sales_contract', entityId: id,
    before: row,
    summary: `ลบร่าง${contractKindLabel(row.kind)} ของดีล ${row.deal?.title || row.dealId}`,
    request: req,
  });
  return ok({ ok: true });
});
