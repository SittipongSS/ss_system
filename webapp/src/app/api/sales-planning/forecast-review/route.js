import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import {
  canViewSalesPlanning, inSalesEditScope, inSalesViewScope, isWonStage,
} from '@/lib/salesPlanning';
import { forecastSourceView } from '@/lib/sales/forecastSource';

export const dynamic = 'force-dynamic';

const DEAL_COLUMNS = 'id,code,title,stage,"customerName","ownerId","ownerName",team,"startDate","endDate","expectedCloseDate","forecastMonth","projectValue","forecastManualValue","forecastSource","forecastQuotationId","forecastPinnedAt","forecastPinnedBy"';
const QUOTATION_COLUMNS = 'id,"dealId","quoteNumber","baseNumber","revisionNo",status,"approvalStatus","totalAmount","vatAmount","createdAt"';

/* GET /api/sales-planning/forecast-review — คิว "FC ยังไม่ตรงใบเสนอราคา"
 *
 * ตอบสองกองที่ต้องใช้คนตัดสิน (mig 0337 · มติผู้ใช้ 2026-09-02 — ไม่ backfill):
 *   mismatch  ใบอนุมัติฉบับเดียว และ **ยอดต่างจาก FC ที่กรอกไว้** ⇒ กดแล้วตัวเลขขยับ
 *   sync      ใบอนุมัติฉบับเดียว และ **ยอดตรงกันอยู่แล้ว** ⇒ กดแล้วตัวเลขไม่ขยับ
 *             เปลี่ยนแค่ "ที่มา" ให้เดินตามใบ (Rev. ถัดไปจะตามเอง ไม่ต้องมากดอีก)
 *   ambiguous ใบอนุมัติหลายเลขที่ ⇒ ระบบไม่เดา ให้เลือกว่าใบไหนคือ FC
 *
 * ⚠️ **สามกองนี้ต้องแยกกันบนจอ** — ตอนวัดของจริง 2026-09-02 กอง sync มี 27 ดีลจาก 50
 *    ถ้าเหมารวมเป็น "FC ไม่ตรงใบ" ทั้งก้อน คนอ่านจะนึกว่ามีตัวเลขต้องแก้ 50 ที่
 *    ทั้งที่จริงมีแค่ 23
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

  /* ── กองที่สาม: ดีลที่ยังไม่มีวันเริ่ม/วันรับของ ─────────────────────────────
     ⭐ **วันสิ้นสุด = วันที่ลูกค้ารับของ** ซึ่งรายงาน FC วางแผนผลิตใช้เป็นแกนเดือน
        ปล่อยว่าง = รายงานเดาเดือนจากวันปิดการขายแทน · ของจริง 2026-09-02: 70 ดีล
        (26,534,973 บาท = 42% ของยอด) ⇒ ต้องมีที่ให้ AE เห็นและไล่กรอก ไม่ใช่รอให้
        บังเอิญเปิดดีลนั้น · ด่านบังคับกรอกกันของใหม่ กองนี้เก็บของเก่า
     ⚠️ นับ **ดีลที่มียอด** เท่านั้น — ดีลยอด 0 ไม่มีผลกับรายงานวางแผนผลิต
        (ดีลแพ้/ปิดแล้วก็ไม่นับ: ของส่งไปแล้วหรือไม่ต้องส่ง) */
  const missingDates = [];
  for (const deal of deals || []) {
    if (isWonStage(deal.stage) || deal.stage === 'lost') continue;
    if (!inSalesViewScope(user, deal)) continue;
    if (!Number(deal.projectValue)) continue;
    const gaps = [
      !String(deal.startDate ?? '').trim() ? 'startDate' : null,
      !String(deal.endDate ?? '').trim() ? 'endDate' : null,
    ].filter(Boolean);
    if (!gaps.length) continue;
    missingDates.push({
      id: deal.id,
      code: deal.code,
      title: deal.title,
      stage: deal.stage,
      customerName: deal.customerName,
      ownerName: deal.ownerName,
      team: deal.team,
      canEdit: inSalesEditScope(user, deal),
      currentValue: Number(deal.projectValue || 0),
      startDate: deal.startDate || null,
      endDate: deal.endDate || null,
      expectedCloseDate: deal.expectedCloseDate || null,
      gaps,
    });
  }
  missingDates.sort((a, b) => b.currentValue - a.currentValue);

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
      kind: view.ambiguous
        ? 'ambiguous'
        : (Math.abs(view.pendingValue - view.value) < 0.005 ? 'sync' : 'mismatch'),
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
    missingDates,
    counts: {
      missingDates: missingDates.length,
      total: rows.length,
      mismatch: rows.filter((row) => row.kind === 'mismatch').length,
      sync: rows.filter((row) => row.kind === 'sync').length,
      ambiguous: rows.filter((row) => row.kind === 'ambiguous').length,
    },
  });
});
