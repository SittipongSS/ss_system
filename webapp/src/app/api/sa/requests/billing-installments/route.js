// ── ตัวเลือกงวดของคำร้องขอเอกสารการเงิน (ขอเอกสารจากหน้า QT · PR-2 · มติเจ้าของ 28/10/2026) ──────────────────────
//
// GET ?quotationId=QT-… → `{ source: 'order' | 'plan' | 'none', orderId, orderNumber, rows }` (lib/requests/billingInstallmentChoices.js)
// ผู้เรียก: ฟอร์มเปิดคำร้อง (ไทล์เลือกงวด) · หน้า QT (การ์ดงวดชำระ: ปุ่มรายแถว + คำร้องที่ขอไปแล้ว)
// ⭐ แหล่งของตัวเลือกตัดสินที่ lib ตัวเดียว — มีแถวงวดบน SO แล้ว = งวดจริง · ยังไม่มี = แผนของ QT
// ⭐ คำร้องของแถว = ชุดตามใบเสนอราคา ∪ ตัวโหลดกลาง (`loadInstallmentRequests` · งวดที่ยกมาจากใบของ QT อื่น) — กติกาเดียวกับแผงงวด SO
// 🔐 ด่านเห็นตามดีลของใบเสนอราคา (`loadScoped` view) — ตัวเลือกพกยอดเงินรายงวด ⇒ คนนอกขอบเขตต้องไม่เห็น
import { withUser } from '@/lib/http';
import { canViewRequests } from '@/lib/permissions';
import { loadScoped } from '@/lib/scopedRow';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { loadInstallments } from '@/lib/sales/salesOrderInstallmentsStore';
import { loadInstallmentRequests } from '@/lib/sales/installmentRequestsStore';
import { billingInstallmentSchemaError } from '@/lib/sales/installmentRequests';
import { billingInstallmentChoices } from '@/lib/requests/billingInstallmentChoices';
import { isLiveSalesOrder } from '@/lib/sales/handoffQueue';

export const dynamic = 'force-dynamic';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const GET = withUser(async ({ user, supabase, req }) => {
  try {
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (!canViewRequests(user)) return json({ error: 'forbidden' }, 403);
    const quotationId = String(new URL(req.url).searchParams.get('quotationId') || '').trim();
    if (!quotationId) return json({ error: 'ต้องระบุใบเสนอราคา' }, 400);

    // แถวที่ตัวโหลดคืนมาเป็น `*` อยู่แล้ว (มี paymentPlan · totalAmount) — ไม่อ่านซ้ำ (กฎ 6 ของ systemRules: ห้ามโหลดตารางที่มีขอบเขตเอง)
    const { row: quotation, response } = await loadScoped(supabase, 'quotations', quotationId, user, 'view');
    if (response) return response;

    /* ใบสั่งขาย **ที่ยังมีชีวิต** ของใบเสนอราคานี้ — UNIQUE ของ quotationId ถูกถอดตั้งแต่ 0161 (สาย Rev.) + 0169 (ออกใบใหม่หลังยกเลิก)
       ⇒ ห้าม maybeSingle · `isLiveSalesOrder` นิยามเดียวกับด่าน 0169 · ไม่มีใบที่มีชีวิต = ตัวเลือกจากแผน QT (ใบใหม่สร้างงวดเมื่อไร
       คำร้องที่เลือกเลขไว้ถูกผูกให้ตอนนั้น) */
    const { data: orders, error: orderError } = await fetchAllResult(() => supabase
      .from('sales_orders').select('id, "orderNumber", status, "supersededById", "createdAt"').eq('quotationId', quotationId)
      .order('createdAt', { ascending: false })
      .order('id', { ascending: true }));
    if (orderError) return json({ error: orderError.message }, 500);
    const order = (orders || []).find(isLiveSalesOrder) || null;
    const installments = order ? await loadInstallments(supabase, order.id) : [];

    /* คำร้องของใบเสนอราคานี้ (ไม่เอาใบที่ยกเลิก — ตัวเลือกบอก "ขอไปแล้ว" ไม่ใช่ประวัติ) + คำร้องที่ผูกงวดของใบ (ตัวโหลดกลาง) */
    const { data: byQuote, error: requestError } = await fetchAllResult(() => supabase
      .from('dept_requests')
      .select('id, "docNo", status, "installmentId", "installmentSeq", "createdAt"')
      .eq('quotationId', quotationId).eq('kind', 'billing_doc')
      .neq('status', 'cancelled')
      .order('createdAt', { ascending: true })
      .order('id', { ascending: true }));
    if (requestError) {
      const schema = billingInstallmentSchemaError(requestError);
      return json({ error: schema || requestError.message }, schema ? 503 : 500);
    }
    const { data: linked, error: linkedError } = await loadInstallmentRequests(supabase, installments, {
      select: 'id, "docNo", status',
      skipIds: (byQuote || []).map((r) => r.id),
    });
    if (linkedError) return json({ error: linkedError.message }, 500);
    const merged = new Map((byQuote || []).map((r) => [r.id, r]));
    (linked || []).filter((r) => r.status !== 'cancelled').forEach((r) => merged.set(r.id, { ...merged.get(r.id), ...r }));

    return json(billingInstallmentChoices({ quotation, order, installments, requests: [...merged.values()] }));
  } catch (e) {
    return json({ error: e.message }, 500);
  }
});
