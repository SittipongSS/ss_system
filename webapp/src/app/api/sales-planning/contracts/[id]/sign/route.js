import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { SIGNED_CONTRACT_DOC_TYPE } from '@/lib/master/attachmentTypes';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import { canSignContract, contractKindLabel } from '@/lib/sales/contracts';

export const dynamic = 'force-dynamic';

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

// POST /api/sales-planning/contracts/[id]/sign — บันทึกว่าลูกค้าเซ็นกลับมาแล้ว
//
// ⭐ การลงนามเกิดบนกระดาษ (มติผู้ใช้ 2026-08-20) — ระบบเก็บ **หลักฐาน** ไม่ใช่ลายเซ็น:
//    ไฟล์ที่สแกนกลับ + วันที่ลงนาม · ไม่มีไฟล์ = ไม่ให้ปิดสถานะ เพราะสถานะ "ลงนามแล้ว"
//    คือคำตอบของคำถาม "สัญญาฉบับเซ็นอยู่ไหน" ถ้าตอบไม่ได้ก็ยังไม่ใช่ลงนามแล้ว
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: before, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;
  if (!canSignContract(before)) return fail('บันทึกการลงนามได้เฉพาะสัญญาที่รอลงนามอยู่', 409);

  const body = await req.json();
  const signedDate = String(body?.signedDate || '').trim();
  if (!isDate(signedDate)) return badRequest('ระบุวันที่ลงนามให้ถูกต้อง (ปี-เดือน-วัน)');
  if (!body?.signedFileId) return badRequest('แนบไฟล์สัญญาที่ลงนามแล้วก่อนบันทึก');

  // ไฟล์ต้องเป็นไฟล์แนบของสัญญาใบนี้จริง — ไม่ใช่ id ไฟล์ใบอื่นที่ยิงมาตรง ๆ
  const { data: file, error: fileError } = await supabase
    .from('attachments').select('id, "entityType", "entityId", "docType"').eq('id', body.signedFileId).maybeSingle();
  if (fileError) return fail(fileError.message, 500);
  if (!file || file.entityType !== 'contract' || file.entityId !== id) {
    return badRequest('ไฟล์ที่อ้างถึงไม่ใช่ไฟล์แนบของสัญญาใบนี้');
  }
  /* 🪤 **ชนิดของไฟล์ก็ต้องถูก** (คู่กับด่านเดียวกันที่ `/approve-external`) — โมดัลลงนาม
     เสนอเฉพาะ `signed_contract` อยู่แล้ว แต่จอไม่ใช่ด่าน · คำขอที่ยิงตรงส่งไฟล์ชนิดไหน
     ก็ได้ที่แนบอยู่กับใบนี้ แล้ว "ฉบับที่ลูกค้าเซ็น" ก็ชี้ไปที่ของอย่างอื่น
     ⚠️ วัดก่อนรัด (2026-09-02): ทั้งฐานยังไม่มีสัญญาที่มี `signedFileId` สักใบ
        ⇒ ด่านนี้ไม่ตีกลับของเก่าที่ทำไปแล้วเลย */
  if (file.docType !== SIGNED_CONTRACT_DOC_TYPE) {
    return badRequest('ไฟล์ที่เลือกไม่ได้ถูกแนบเป็น “สัญญาที่ลงนามแล้ว” — แนบใหม่ด้วยชนิดนั้นก่อน');
  }

  if (body.effectiveDate && !isDate(body.effectiveDate)) return badRequest('วันที่เริ่มมีผลไม่ถูกต้อง');
  if (body.expiryDate && !isDate(body.expiryDate)) return badRequest('วันที่สิ้นสุดไม่ถูกต้อง');

  const patch = {
    /* ⭐ **ไม่ใช่ `signed` แล้ว** (mig 0323 · มติผู้ใช้ 2026-08-31) — การกดนี้คือ
       *บันทึกว่าลูกค้าเซ็นกลับมา* ซึ่งเป็นงานธุรการของฝ่ายขาย · ใบจะ "ใช้งานได้"
       ต่อเมื่อ **AE Supervisor รับรอง** อีกที (`/approve-signed`)
       ⇒ ของเดิมคนที่ออกสัญญากับคนที่ปิดสถานะเป็นคนเดียวกัน = ไม่มีด่านที่สองเลย */
    status: 'awaiting_approval',
    signedDate,
    signedAt: new Date().toISOString(),
    signedFileId: body.signedFileId,
    // วันเริ่มมีผลตั้งต้น = วันที่ลงนาม (สัญญาออกแบบกลิ่นนับอายุจากวันเซ็น — ข้อ 2.2)
    effectiveDate: body.effectiveDate || signedDate,
    expiryDate: body.expiryDate || null,
    updatedAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('sales_contracts').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: id,
    before, after: data,
    summary: `บันทึกการลงนาม${contractKindLabel(data.kind)} ${data.contractNo} (${signedDate}) — รอ AE Supervisor รับรอง`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});
