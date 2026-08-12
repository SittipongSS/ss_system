import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/quotations — ลิสต์ใบเสนอราคาทุกใบ (เมนูแยก เฟส D:
// ค้นหาด้วยเลข QT / ลูกค้า / ดีล). scope ตามดีลแม่ (ทีม/เจ้าของ) เหมือนหน้า pipeline.
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const status = params.get('status');

  let query = supabase
    .from('quotations')
    .select('*, lines:quotation_lines(id), deal:sales_deals(id, title, stage, dealType, team, ownerId, ownerName, customerName, metadata)')
    .order('createdAt', { ascending: false })
    .limit(500);
  const { data, error } = await query;
  if (error) return fail(error.message, 500);

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
  return ok(rows.map((q) => ({ ...q, customerArCode: arById.get(q.customerId) ?? null })));
});
