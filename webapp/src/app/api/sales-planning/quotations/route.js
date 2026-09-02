import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope, isClosedStage } from '@/lib/salesPlanning';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';
import { isQuotationAwaitingMyApproval, isQuotationWaitingOnMe } from '@/lib/sales/quotationWorkflow';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/quotations — ลิสต์ใบเสนอราคาทุกใบ (เมนูแยก เฟส D:
// ค้นหาด้วยเลข QT / ลูกค้า / ดีล). scope ตามดีลแม่ (ทีม/เจ้าของ) เหมือนหน้า pipeline.
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const status = params.get('status');

  /* ⚠️ **ระบุคอลัมน์เอง ห้ามกลับไปใช้ `select('*')`** — ลิสต์นี้ 500 ใบ และคอลัมน์
     หนักที่จอไม่ได้ใช้กินเกือบทั้งก้อน (วัด 27/08 บน 213 ใบ: `notes` 152 KB ·
     `paymentTerms` 61 KB · `metadata` 67 KB · ที่อยู่บิล/ส่ง 82 KB · `paymentPlan`
     36 KB · `wonAttachments` 21 KB · `approvalFingerprint` 15 KB) ⇒ `select('*')`
     พร้อม join = 994 KB ต่อการเปิดหน้าหนึ่งครั้ง · เนื้อใบเต็มอยู่ที่ GET รายใบแล้ว
     🪤 เพิ่มช่องใหม่บนจอทะเบียน = ต้องเติมชื่อคอลัมน์ที่นี่ด้วย ไม่งั้นช่องจะว่าง
     เงียบ ๆ (ไม่ error) · จอที่กิน endpoint นี้: /sa/quotations · คำร้อง (สร้าง/แก้) */
  const LIST_COLUMNS = [
    'id', 'dealId', 'quoteNumber', 'status', 'quoteDate', 'validUntil',
    'customerId', 'customerName',
    'subtotal', 'vatRate', 'vatAmount', 'totalAmount',
    'discountType', 'discountValue', 'discountAmount',
    'baseNumber', 'revisionNo', 'revisedFromId', 'docLanguage',
    /* เอกสารอ้างอิง (mig 0267) — ข้อความอิสระที่คนพิมพ์เลข PO ของลูกค้าลงไป
       ทะเบียนใช้ **ค้นอย่างเดียว** ไม่ได้โชว์เป็นคอลัมน์ · ฝ่ายบัญชีถามด้วยเลขนี้ */
    'referenceNote',
    'createdBy', 'createdByName', 'createdAt', 'updatedAt',
    'approvalStatus', 'approvalRequestedBy', 'approvalRequestedByName', 'approvalRequestedAt',
    'approvedBy', 'approvedByName', 'approvedAt',
    'rejectedBy', 'rejectedByName', 'rejectedAt', 'rejectionReason',
    'acceptedAt', 'acceptedBy',
    'wonDocType', 'wonDocNo', 'wonDocDate', 'wonPaymentDueDate',
  ].join(',');
  /* ดีลเอาเท่าที่ด่านขอบเขต + จอใช้ · `metadata` ของดีลทั้งก้อน = 80 KB แต่ที่ใช้จริง
     มีคีย์เดียว (`projectType` — ทางถอยของ `dealTypeOf` เมื่อ `dealType` ว่าง)
     ⇒ ดึงเฉพาะคีย์นั้นแล้วประกอบ `metadata` กลับข้างล่าง ให้จอเห็นทรงเดิมเป๊ะ */
  const DEAL_COLUMNS = 'id,title,stage,dealType,team,ownerId,ownerName,customerName,projectType:metadata->>projectType';

  let query = supabase
    .from('quotations')
    .select(`${LIST_COLUMNS},lines:quotation_lines(id),deal:sales_deals(${DEAL_COLUMNS})`)
    .order('createdAt', { ascending: false })
    .limit(500);
  const { data: rawRows, error } = await query;
  if (error) return fail(error.message, 500);

  // คืนทรง `deal.metadata.projectType` ให้เหมือนตอน select ทั้งก้อน — `dealTypeOf()`
  // ฝั่งจอกับฝั่ง server อ่านที่เดียวกัน จะได้ไม่ต้องมีกติกาสองชุด
  const data = (rawRows || []).map((q) => (q.deal
    ? { ...q, deal: { ...q.deal, projectType: undefined, metadata: { projectType: q.deal.projectType ?? null } } }
    : q));

  const visibleRows = (data || []).filter((q) => q.deal && inSalesViewScope(user, q.deal));
  const rows = latestQuotationRevisions(visibleRows)
    .filter((q) => !status || status === 'all' || q.status === status)
    .map((q) => ({ ...q, lineCount: (q.lines || []).length, lines: undefined }));

  /* ⭐ รหัสลูกค้า (AR) คู่ชื่อกิจการ (มติผู้ใช้ IS-26080003) — ตัวเชื่อมกับรหัสกลิ่น/MU
     ⚠️ อ่านสดจากทะเบียนเสมอ ไม่ใช่ค่าที่ใบประทับไว้ — `customerName` บนใบคือชื่อ ณ วันที่
     ออกใบ (หลักฐานบนเอกสารที่ส่งลูกค้าไปแล้ว) ส่วนรหัสเป็นตัวชี้กลับทะเบียน ต้องเป็นค่าปัจจุบัน
     ⚠️ query เดียวหลังกรองแล้ว — ดึงรายใบ = 500 query ต่อการเปิดหน้าหนึ่งครั้ง */
  const customerIds = [...new Set(rows.map((q) => q.customerId).filter(Boolean))];
  let arById = new Map();
  if (customerIds.length) {
    const { data: customers, error: customerError } = await supabase
      .from('customers').select('id, "arCode"').in('id', customerIds);
    if (customerError) return fail(customerError.message, 500);
    arById = new Map((customers || []).map((c) => [c.id, String(c.arCode || '').trim() || null]));
  }
  /* `_waitingOnMe` = ธงเดียวกับที่ป้ายตัวเลขบนเมนูนับ (ม-114) — ติดที่ **server**
     ด้วย helper ตัวเดียวกัน ไม่ให้จอคำนวณเอง · จอไม่รู้ด้วยซ้ำว่าใครเป็นผู้อนุมัติ
     (ต้องรู้เจ้าของดีล + ว่าดีลปิดยัง) ⇒ ปล่อยให้จอเดา = เลขบนเมนูกับลิสต์ที่กรอง
     แล้วไม่ตรงกัน ซึ่งเป็นบั๊กที่ ม-102/ม-112 เพิ่งไล่ปิดไป */
  /* ⭐ `_awaitingMyApproval` = **ชุดย่อย** ของ `_waitingOnMe` เอาเฉพาะ "รอฉันอนุมัติ"
     ไม่รวม "ใบของฉันที่ถูกตีกลับ" — คิวบนหัวทะเบียนพูดคำว่า *อนุมัติ* จึงต้องนับ
     เฉพาะของที่กดอนุมัติได้จริง (ทรงเดียวกับทะเบียนลูกค้า/สินค้า) */
  return ok(rows.map((q) => {
    const approvalCtx = {
      userId: user.id,
      dealOwnerId: q.deal?.ownerId ?? null,
      dealClosed: isClosedStage(q.deal?.stage),
    };
    return {
      ...q,
      customerArCode: arById.get(q.customerId) ?? null,
      _waitingOnMe: isQuotationWaitingOnMe(q, approvalCtx),
      _awaitingMyApproval: isQuotationAwaitingMyApproval(q, approvalCtx),
    };
  }));
});
