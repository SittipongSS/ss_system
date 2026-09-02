import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import {
  canViewSalesPlanning, inSalesEditScope, inSalesViewScope, isWonStage,
} from '@/lib/salesPlanning';
import { forecastSourceView } from '@/lib/sales/forecastSource';

export const dynamic = 'force-dynamic';

const DEAL_COLUMNS = 'id,code,title,stage,"customerName","ownerId","ownerName",team,"forecastMonth","projectValue","forecastManualValue","forecastSource","forecastQuotationId","forecastPinnedAt","forecastPinnedBy"';
const QUOTATION_COLUMNS = 'id,"dealId","quoteNumber","baseNumber","revisionNo",status,"approvalStatus","totalAmount","vatAmount","createdAt"';

/* GET /api/sales-planning/forecast-review — คิว "FC ยังไม่ตรงใบเสนอราคา"
 *
 * ตอบสองกองที่ต้องใช้คนตัดสิน (mig 0337 · มติผู้ใช้ 2026-09-02 — ไม่ backfill):
 *   mismatch  **ยอดต่างจาก FC ที่กรอกไว้** ⇒ กดแล้วตัวเลขขยับ
 *   sync      **ยอดตรงกันอยู่แล้ว** ⇒ กดแล้วตัวเลขไม่ขยับ เปลี่ยนแค่ "ที่มา" ให้เดินตามใบ
 *             (Rev. ถัดไปจะตามเอง ไม่ต้องมากดอีก)
 *
 * ⚠️ **สองกองนี้ต้องแยกกันบนจอ** — ตอนวัดของจริง 2026-09-02 กอง sync มี 27 ดีลจาก 50
 *    ถ้าเหมารวมเป็น "FC ไม่ตรงใบ" ทั้งก้อน คนอ่านจะนึกว่ามีตัวเลขต้องแก้ 50 ที่
 *    ทั้งที่จริงมีแค่ 23
 *
 * ⚠️ **ไม่มีกอง "มีหลายฉบับ" แล้ว** (มติผู้ใช้ 2026-09-02 รอบสาม) — ดีลที่มีใบอนุมัติ
 *    หลายเลขที่ ระบบเดินตามใบยอดต่ำสุดให้เอง จึงตกอยู่ในสองกองข้างบนตามส่วนต่างของมัน
 *
 * ⚠️ ตัวนี้ **อ่านอย่างเดียว** — ไม่เขียน projectValue ให้ใครทั้งนั้น การเปิดหน้านี้
 *    ต้องไม่ขยับตัวเลข FC ของบริษัทแม้แต่บาทเดียว (นั่นคือทั้งหมดของคำว่า "ไม่ backfill")
 */
export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  /* ⚠️ ไล่ทีละหน้าทั้งสองตาราง — เพดาน 1,000 แถวตัดเงียบ ๆ ไม่มี error · คิวที่ขาด
     ครึ่งอ่านไม่ออกว่าขาด เพราะมันดูเหมือนรายการที่จบแล้ว (บทเรียน project_tasks 16/08) */
  const [{ data: deals, error: dealError }, { data: quotations, error: quoteError }] = await Promise.all([
    fetchAllResult(() => supabase.from('sales_deals').select(DEAL_COLUMNS).order('id', { ascending: true })),
    fetchAllResult(() => supabase.from('quotations').select(QUOTATION_COLUMNS).order('id', { ascending: true })),
  ]);
  if (dealError) return fail(dealError.message, 500);
  if (quoteError) return fail(quoteError.message, 500);

  const byDeal = new Map();
  for (const quotation of quotations || []) {
    if (!quotation.dealId) continue;
    if (!byDeal.has(quotation.dealId)) byDeal.set(quotation.dealId, []);
    byDeal.get(quotation.dealId).push(quotation);
  }

  const rows = [];
  for (const deal of deals || []) {
    if (isWonStage(deal.stage) || deal.stage === 'lost') continue;
    if (!inSalesViewScope(user, deal)) continue;
    const dealQuotations = byDeal.get(deal.id) || [];
    if (!dealQuotations.length) continue;
    const view = forecastSourceView(deal, dealQuotations);
    if (!view.needsDecision) continue;
    rows.push({
      id: deal.id,
      code: deal.code,
      title: deal.title,
      stage: deal.stage,
      customerName: deal.customerName,
      ownerName: deal.ownerName,
      team: deal.team,
      forecastMonth: deal.forecastMonth,
      kind: Math.abs(view.pendingValue - view.value) < 0.005 ? 'sync' : 'mismatch',
      // ดีลที่มีใบหลายเลขที่ — ไม่ใช่งานที่รอตัดสิน แต่หน้าจอควรเตือนว่าระบบเลือกใบต่ำสุดให้
      multiple: view.multiple,
      canEdit: inSalesEditScope(user, deal),
      source: view.source,
      currentValue: view.value,
      manualValue: view.manualValue,
      pendingValue: view.pendingValue,
      pendingQuotationId: view.pendingQuotationId,
      pinned: view.pinned,
      reason: view.reason,
      candidates: view.candidates.map((quotation) => ({
        id: quotation.id,
        quoteNumber: quotation.quoteNumber,
        revisionNo: quotation.revisionNo,
        value: Math.max(0, Number(quotation.totalAmount || 0) - Number(quotation.vatAmount || 0)),
      })),
    });
  }

  // เรียงตามขนาดของส่วนต่างก่อน — ดีลที่ทำให้ตัวเลขบริษัทเพี้ยนมากที่สุดต้องถูกเห็นก่อน
  rows.sort((a, b) => Math.abs(b.pendingValue - b.currentValue) - Math.abs(a.pendingValue - a.currentValue));

  return ok({
    rows,
    counts: {
      total: rows.length,
      mismatch: rows.filter((row) => row.kind === 'mismatch').length,
      sync: rows.filter((row) => row.kind === 'sync').length,
      multiple: rows.filter((row) => row.multiple).length,
    },
  });
});
