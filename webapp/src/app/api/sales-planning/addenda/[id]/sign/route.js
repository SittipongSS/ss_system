import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { SIGNED_ADDENDUM_DOC_TYPE } from '@/lib/master/attachmentTypes';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { ADDENDUM_DOC_TITLE, canSignAddendum } from '@/lib/sales/contractAddenda';

export const dynamic = 'force-dynamic';

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

// POST /api/sales-planning/addenda/[id]/sign — บันทึกว่าลูกค้าเซ็นกลับมาแล้ว
// กติกาเดียวกับสัญญา: ไม่มีไฟล์ = ปิดสถานะไม่ได้ (สถานะ "ลงนามแล้ว" คือคำตอบของ
// คำถาม "ฉบับเซ็นอยู่ไหน" — ตอบไม่ได้ก็ยังไม่ใช่ลงนามแล้ว)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contract_addenda', id, user, 'edit');
  if (response) return response;
  if (!canSignAddendum(before)) return fail('บันทึกการลงนามได้เฉพาะฉบับที่รอลงนามอยู่', 409);

  const body = await req.json();
  const signedDate = String(body?.signedDate || '').trim();
  if (!isDate(signedDate)) return badRequest('ระบุวันที่ลงนามให้ถูกต้อง (ปี-เดือน-วัน)');
  if (!body?.signedFileId) return badRequest('แนบไฟล์บันทึกที่ลงนามแล้วก่อนบันทึก');

  const { data: file, error: fileError } = await supabase
    .from('attachments').select('id, "entityType", "entityId", "docType"').eq('id', body.signedFileId).maybeSingle();
  if (fileError) return fail(fileError.message, 500);
  if (!file || file.entityType !== 'contract_addendum' || file.entityId !== id) {
    return badRequest('ไฟล์ที่อ้างถึงไม่ใช่ไฟล์แนบของบันทึกฉบับนี้');
  }
  // เหตุผลเดียวกับด่านของสัญญา — จอเสนอชนิดเดียว แต่จอไม่ใช่ด่าน
  if (file.docType !== SIGNED_ADDENDUM_DOC_TYPE) {
    return badRequest('ไฟล์ที่เลือกไม่ได้ถูกแนบเป็น “บันทึกที่ลงนามแล้ว” — แนบใหม่ด้วยชนิดนั้นก่อน');
  }

  const { data, error } = await supabase.from('sales_contract_addenda').update({
    status: 'signed',
    signedDate,
    signedAt: new Date().toISOString(),
    signedFileId: body.signedFileId,
    updatedAt: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract_addendum', entityId: id,
    before, after: data,
    summary: `บันทึกการลงนาม${ADDENDUM_DOC_TITLE} ${data.docNo} (${signedDate})`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});
