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
  /* ⭐ สัญญาแม่ต้องยัง "ลงนามแล้ว" ณ ตอนลงนามบันทึก (มติ 24/09/2026 — ผู้อนุมัติยกเลิกสัญญาที่ลงนามแล้วได้) —
     การยกเลิกสัญญาแม่ยกเลิกบันทึกที่ค้างตามในคำสั่งถัดไป (คำขอเดียวกันแต่ไม่ใช่ทรานแซกชันเดียว) ⇒ ด่านนี้กันกรณีที่
     สัญญาถูกยกเลิกแล้วแต่บันทึกยังไม่ถูกยกเลิกตาม (ยังไม่ถึงคำสั่งนั้น หรือคำสั่งนั้นพัง) (กติกาเดียวกับด่านของ /issue)
     ⚠️ ด่านนี้ **ไม่** ปิดช่องที่ยกเลิกตามลงมาหลังด่านผ่าน — นั่นเป็นหน้าที่ของตัวกรองสถานะบนคำสั่งเขียนข้างล่าง
     ⚠️ โหลดผ่าน `loadScoped` แบบ view — คนลงนามบันทึกอยู่บนหน้าสัญญาแม่อยู่แล้ว (การ์ดบันทึกอยู่ที่นั่น) */
  const { row: parent, response: parentResponse } = await loadScoped(supabase, 'sales_contracts', before.contractId, user, 'view');
  if (parentResponse) return parentResponse;
  if (parent.status !== 'signed') {
    return fail('สัญญาแม่ไม่ได้อยู่ในสถานะลงนามแล้ว — บันทึกนี้ลงนามต่อไม่ได้ ตรวจสัญญาก่อน', 409);
  }

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

  /* 🔴 **เขียนเฉพาะแถวที่ยังรอลงนาม** (รีวิว 25/09) — ด่านข้างบนตรวจจากแถวที่อ่านไว้ก่อน ถ้าผู้อนุมัติยกเลิกสัญญาแม่
     (บันทึกถูกยกเลิกตาม) ระหว่างด่านกับคำสั่งนี้ คำสั่งที่กรองแค่ id จะเขียน "ลงนามแล้ว" ทับ "ยกเลิก" แล้วได้บันทึกลงนาม
     ใต้สัญญาที่ยกเลิกไปแล้ว (ที่ยังถือเวลา/เหตุผลยกเลิกของคำสั่งนั้นค้างอยู่) · ฐานไม่มี trigger คุมการเปลี่ยนสถานะของตารางนี้
     ⇒ ไม่เจอแถว = มีคนเปลี่ยนสถานะไปก่อน (ยกเลิก/ลงนามซ้ำ) ตอบ 409 · `maybeSingle` ไม่ใช่ `single` (ไม่งั้นกลายเป็น 500)
     ⚠️ ลำดับกลับกัน (ลงนามก่อน แล้วค่อยยกเลิกตาม) ปลอดภัยอยู่แล้ว — การยกเลิกตามกวาดทุกฉบับที่ยังไม่ยกเลิก รวมฉบับลงนามแล้ว */
  const { data, error } = await supabase.from('sales_contract_addenda').update({
    status: 'signed',
    signedDate,
    signedAt: new Date().toISOString(),
    signedFileId: body.signedFileId,
    updatedAt: new Date().toISOString(),
  }).eq('id', id).eq('status', 'awaiting_signature')
    .select().maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail('บันทึกนี้ไม่ได้รอลงนามแล้ว (ถูกยกเลิกหรือบันทึกการลงนามไปแล้วระหว่างนั้น) — โหลดหน้าใหม่แล้วตรวจอีกครั้ง', 409);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract_addendum', entityId: id,
    before, after: data,
    summary: `บันทึกการลงนาม${ADDENDUM_DOC_TITLE} ${data.docNo} (${signedDate})`,
    request: req,
  });
  const { issuedHtml, ...rest } = data;
  return ok(rest);
});
