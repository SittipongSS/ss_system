import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { ADDENDUM_DOC_TITLE, addendumDocNo, canIssueAddendum } from '@/lib/sales/contractAddenda';
import { ADDENDUM_TEMPLATE } from '@/lib/sales/contractTemplateAddendum';
import { buildAddendumHTML } from '@/lib/sales/addendumDocument';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* POST /api/sales-planning/addenda/[id]/issue — "ออกบันทึก"
   เลขที่ = เลขสัญญาแม่ + `-A` + ครั้งที่ ⇒ **ไม่ต้องมีตัวนับของตัวเอง** (ต่างจากสัญญา)
   ครั้งที่ถูกจองไว้ตั้งแต่ตอนสร้างด้วย UNIQUE (contractId, addendumNo) ของ mig 0282
   ⇒ สองคนกดออกพร้อมกันก็ไม่ได้เลขซ้ำ เพราะเลขผูกกับครั้งที่ ไม่ใช่ลำดับการกด */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: addendum, response } = await loadScoped(supabase, 'sales_contract_addenda', id, user, 'edit');
  if (response) return response;
  if (!canIssueAddendum(addendum)) return fail('ออกได้เฉพาะบันทึกที่ยังเป็นร่าง', 409);
  if (!addendum.lines?.length) return fail('บันทึกนี้ยังไม่มีรายการสูตร — สร้างใหม่จากคำร้องที่มีสูตรแล้ว', 409);

  const { data: contract, error: contractError } = await supabase
    .from('sales_contracts').select('*').eq('id', addendum.contractId).maybeSingle();
  if (contractError) return fail(contractError.message, 500);
  /* ⚠️ สัญญาแม่ต้องยัง "ลงนามแล้ว" ณ วินาทีที่ออกบันทึก ไม่ใช่แค่ตอนสร้างร่าง —
     สัญญาที่ถูกยกเลิก/ออก Rev. ระหว่างนั้นต้องไม่มีบันทึกใหม่แนบท้ายเงียบ ๆ */
  if (!contract || contract.status !== 'signed') {
    return fail('สัญญาแม่ไม่ได้อยู่ในสถานะลงนามแล้ว — ตรวจสัญญาก่อนออกบันทึก', 409);
  }

  const docNo = addendumDocNo(contract.contractNo, addendum.addendumNo);
  if (!docNo) return fail('สัญญาแม่ยังไม่มีเลขที่ — ออกบันทึกไม่ได้', 409);

  const now = new Date().toISOString();
  const issued = {
    ...addendum,
    docNo,
    status: 'awaiting_signature',
    issuedAt: now,
    issuedBy: user.id || null,
    issuedByName: user.name || null,
    templateVersion: ADDENDUM_TEMPLATE.version,
  };

  const company = await getPublishedCompanyProfile(supabase);
  const html = buildAddendumHTML(issued, { contract, company });

  /* เขียนทีเดียวพร้อมเนื้อที่ตรึง — ต่างจากสัญญาที่ต้องออกเลขจาก RPC ก่อน เพราะเลขของ
     บันทึกคำนวณได้เองจากสัญญาแม่ ⇒ ไม่มีจังหวะที่ใบมีเลขแต่ยังไม่มีเนื้อ
     ⚠️ กันกดซ้ำด้วย `.is('docNo', null)` — คำสั่งที่สองจะไม่เจอแถวแล้วตอบ 409 */
  const { data, error } = await supabase.from('sales_contract_addenda')
    .update({
      docNo,
      status: 'awaiting_signature',
      issuedAt: now,
      issuedBy: issued.issuedBy,
      issuedByName: issued.issuedByName,
      issuedHtml: html,
      templateVersion: ADDENDUM_TEMPLATE.version,
      updatedAt: now,
    })
    .eq('id', id).is('docNo', null)
    .select().maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('บันทึกนี้ออกเลขไปแล้ว', 409);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract_addendum', entityId: id,
    before: addendum, after: data,
    summary: `ออก${ADDENDUM_DOC_TITLE} เลขที่ ${docNo}`,
    request: req,
  });

  const { issuedHtml, ...rest } = data;
  return ok({ ...rest, hasIssuedDocument: true });
});
