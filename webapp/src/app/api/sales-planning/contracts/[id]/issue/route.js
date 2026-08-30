import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { documentNumberSlots } from '@/lib/documentStandards';
import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import {
  CONTRACT_NUMBER_MONTH, canIssueContract, contractKindLabel, contractNumberPattern,
} from '@/lib/sales/contracts';
import { buildContractHTML } from '@/lib/sales/contractDocument';
import { contractTemplate, hasContractTemplate, missingContractFields, MISSING_TEMPLATE_NOTE } from '@/lib/sales/contractTemplates';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/sales-planning/contracts/[id]/issue — "ออกสัญญา"
//
// ออกเลขที่ + ตรึงเนื้อเอกสาร + ดันสถานะเป็น "รอลงนาม" ในทรานแซกชันเดียว (RPC ของ
// mig 0278) · หลังจากนี้เนื้อแก้ไม่ได้ ต้องยกเลิกแล้วออกใบใหม่
//
// ⚠️ **เลขต้องออกพร้อมการบันทึกเสมอ** (บทเรียน mig 0242) — ห้ามแยกเป็นสองคำสั่ง
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: contract, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;
  if (!canIssueContract(contract)) return fail('ออกได้เฉพาะสัญญาที่ยังเป็นร่าง', 409);
  if (!hasContractTemplate(contract.kind)) return fail(MISSING_TEMPLATE_NOTE, 409);

  const missing = missingContractFields(contract.kind, contract.fields);
  if (missing.length) return fail(`กรอกข้อมูลให้ครบก่อนออกสัญญา — ขาด: ${missing.join(' · ')}`, 400);

  // ⚠️ ใบเสนอราคาต้องยัง "อนุมัติอยู่" ณ วินาทีที่ออกสัญญา ไม่ใช่แค่ตอนสร้างร่าง —
  //    ใบที่ถูกถอนอนุมัติ/แก้หลังอนุมัติระหว่างนั้นต้องไม่กลายเป็นสัญญาเงียบ ๆ
  if (contract.quotationId) {
    const { data: quote, error: quoteError } = await supabase
      .from('quotations').select('id, "quoteNumber", status, "approvalStatus"')
      .eq('id', contract.quotationId).maybeSingle();
    if (quoteError) return fail(quoteError.message, 500);
    if (!quote || quote.approvalStatus !== 'approved' || ['cancelled', 'rejected'].includes(quote.status)) {
      return fail('ใบเสนอราคาที่อ้างถึงไม่ได้อยู่ในสถานะอนุมัติแล้ว — ตรวจใบเสนอราคาก่อนออกสัญญา', 409);
    }
  }

  const company = await getPublishedCompanyProfile(supabase);
  const now = new Date();
  /* ⭐ อักษรย่อชนิดสัญญาอยู่ในเลขที่ (มติผู้ใช้ 2026-08-31) ⇒ รูปแบบขึ้นกับ `kind`
     ⚠️ ชนิดที่ไม่รู้จักต้อง **ปฏิเสธ** ไม่ใช่ออกเลขที่มีอักษรย่อมั่ว — เลขที่ออกไปแล้วลบไม่ได้ */
  const pattern = contractNumberPattern(contract.kind);
  if (!pattern) return fail('ชนิดสัญญาของใบนี้ไม่รู้จัก — ออกเลขที่ไม่ได้', 409);
  const { prefix, width } = documentNumberSlots(pattern, { date: now });

  /* ⭐ สองจังหวะโดยเจตนา: **ออกเลขก่อน แล้วค่อยตรึงเนื้อ**
     หัวเอกสารต้องพิมพ์เลขที่จริง ⇒ เรนเดอร์ก่อนรู้เลขไม่ได้ และการเดาเลขจากตัวนับ
     ล่วงหน้าคือเลขที่ชนกันได้เมื่อมีคนกดพร้อมกัน · แพตเทิร์นเดียวกับใบเสนอราคาที่
     ตรึง snapshot หลัง commit การอนุมัติ (CHECK ของ mig 0278 จึงยอมให้เนื้อว่างชั่วคราว)
     ⚠️ เรนเดอร์ล้ม = ใบมีเลขแล้วแต่ยังไม่มีเนื้อตรึง — เส้นทางเปิดเอกสารเรนเดอร์ซ้ำ
     ให้เองได้ (idempotent) ไม่ใช่ใบเสีย */
  const { data: issued, error: issueError } = await supabase.rpc('issue_sales_contract', {
    p_id: id,
    /* 🔴 `YYMM` ที่โผล่ในเลขมาจาก **prefix** (เดือนที่ออกใบ) — ส่วนค่านี้คือ
       **คีย์ตัวนับ** ซึ่งตั้ง `'-'` ให้เลขรันเดินยาวไม่ตัดรอบ · คนละเรื่องกัน */
    p_month: CONTRACT_NUMBER_MONTH,
    p_prefix: prefix,
    p_width: width,
    p_patch: {
      issuedBy: user.id || null,
      issuedByName: user.name || null,
      // รุ่นแม่แบบที่ใช้ออกใบนี้ — ไม่ได้พิมพ์บนกระดาษแล้ว จึงต้องเก็บไว้ที่แถว
      // ไม่งั้นไม่มีทางรู้ย้อนหลังว่าใบไหนออกด้วยข้อความรุ่นไหน
      templateVersion: contractTemplate(contract.kind)?.version || null,
    },
  });
  if (issueError) {
    const message = String(issueError.message || '');
    if (message.includes('contract_already_issued')) return fail('สัญญาใบนี้ออกเลขไปแล้ว', 409);
    if (message.includes('contract_not_draft')) return fail('ออกได้เฉพาะสัญญาที่ยังเป็นร่าง', 409);
    return fail(message || 'ออกเลขที่สัญญาไม่สำเร็จ', 500);
  }

  /* ⚠️ ตรึง **พร้อมแถบเครื่องมือ** (ปุ่มพิมพ์ + ตัวสลับภาษา) — แถบเป็น `no-print`
     จึงไม่ติดไปกับกระดาษที่ลูกค้าได้รับ แต่ทำให้เปิดใบที่ออกแล้วสั่งพิมพ์ได้ทันที
     แพตเทิร์นเดียวกับฉบับตรึงของใบเสนอราคา */
  const html = buildContractHTML(issued, {
    company,
    quotation: contract.quotationId ? { quoteNumber: issued.metadata?.quoteNumber } : null,
  });

  const { data, error } = await supabase
    .from('sales_contracts')
    .update({ issuedHtml: html, updatedAt: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user, action: 'update', entityType: 'sales_contract', entityId: id,
    before: contract, after: data,
    summary: `ออก${contractKindLabel(data.kind)} เลขที่ ${data.contractNo}`,
    request: req,
  });

  const { issuedHtml, ...rest } = data;
  return ok({ ...rest, hasIssuedDocument: true });
});
