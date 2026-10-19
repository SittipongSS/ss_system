// ── ตัวกรองตารางไปป์ไลน์ดีล + เลขท้ายตัวเลือก "รอเติมข้อมูล" (ตรวจตัวเลข H5 · 2026-10-19) ──────
//
// 🐞 ตัวเลือก "รอเติมข้อมูล (n)" ในแผงกรองของ /sales-planning/deals นับจาก **ชุดที่โหลดตามงวด** (ปีนี้/เดือนนี้)
//    และ **ไม่สนขอบเขต** ของฉัน/ทีม · แต่ติ๊กแล้วหน้าโหลดดีลใหม่แบบ **ไม่จำกัดงวด** แล้วกรองตามขอบเขต ⇒
//    เลขบนตัวเลือกกับแถวที่ได้เป็นคนละชุดกันเสมอ — ดีลที่ต้องเติมข้อมูลส่วนใหญ่ไม่มีเดือน FC (ดีล backfill)
//    จึงไม่อยู่ในงวดไหนเลย ⇒ ตัวเลือกขึ้น 0 หรือไม่ขึ้นเลข ทั้งที่ติ๊กแล้วมีแถว
// ⇒ ตารางกับเลขท้ายตัวเลือกใช้ตัวตัดสินตัวเดียว (`dealPassesListFilters`) · เลขนับจาก **ชุดรอเติมข้อมูลทุกงวด**
//    (`DEAL_REVIEW_LIST_URL` — ชุดเดียวกับที่ตารางได้ตอนติ๊ก) ที่ผ่านตัวกรองอื่นทุกตัว (นับแยกมิติแบบหน้าคิวลีด
//    `lib/sales/leadListFilter.js` #1877) ⇒ "รอเติมข้อมูล (n)" = ติ๊กแล้วตารางเหลือ n แถว
import { forecastDueState } from '@/lib/sales/forecastDue';
import { dealDeliveryState } from '@/lib/sales/dealPeriod';
import { dealTypeOf } from '@/lib/salesPlanning';

/** ดีลที่ผู้ดูแลยังต้องเติมมูลค่า/เดือน (ธงจากงาน backfill โครงการ PM เก่า · ปลดเองเมื่อเติมมูลค่า) */
export const isNeedsReviewDeal = (deal) => !!deal?.metadata?.needsReview;

/** ชุด "รอเติมข้อมูล" ทุกงวด — API คัดที่ฐาน (`?review=1`) ไม่ต้องลากดีลทั้งตารางมานับ */
export const DEAL_REVIEW_LIST_URL = '/api/sales-planning/deals?review=1';

/** API: คำขอนี้ขอเฉพาะดีลรอเติมข้อมูลไหม */
export const wantsReviewOnly = (searchParams) => searchParams?.get?.('review') === '1';

/** ช่องของมิติ "เดือน FC" — ตัวเดียวกับป้ายในแถว (`forecastDueState`) */
export function dealDueKey(deal, currentMonth) {
  const due = forecastDueState(deal, currentMonth);
  return due.overdue ? 'overdue' : (due.missing ? 'missing' : 'ontime');
}

/**
 * ดีลนี้ผ่านตัวกรองของตารางไหม
 * @param filters { review: bool, due: [], delivery: [], stage: [], type: [] } — ว่าง = ไม่กรองมิตินั้น
 * @param ctx     { inScope(deal), matchesSearch(deal), currentMonth } — ขอบเขตกับคำค้นเป็นของหน้า
 *                (อ่านทะเบียนคน/ลูกค้าที่หน้าโหลดไว้) แต่ต้องผ่านตัวนี้ทั้งตารางและตัวนับ
 * @param except  มิติที่ไม่ตรวจ — ใช้นับเลขท้ายตัวเลือกของมิตินั้น (นับแยกมิติ)
 */
export function dealPassesListFilters(deal, filters = {}, ctx = {}, { except = null } = {}) {
  if (ctx.inScope && !ctx.inScope(deal)) return false;
  if (except !== 'review' && filters.review && !isNeedsReviewDeal(deal)) return false;
  if (except !== 'due' && filters.due?.length && !filters.due.includes(dealDueKey(deal, ctx.currentMonth))) return false;
  /* วันรับของ: ดีลแพ้ที่ไม่มีวันรับของไม่อยู่ทั้งสองกลุ่ม (dealDeliveryState = null) */
  if (except !== 'delivery' && filters.delivery?.length && !filters.delivery.includes(dealDeliveryState(deal))) return false;
  if (except !== 'stage' && filters.stage?.length && !filters.stage.includes(deal?.stage)) return false;
  if (except !== 'type' && filters.type?.length && !filters.type.includes(dealTypeOf(deal))) return false;
  if (ctx.matchesSearch && !ctx.matchesSearch(deal)) return false;
  return true;
}

/**
 * เลขท้ายตัวเลือก "รอเติมข้อมูล" = **ติ๊กแล้วตารางจะเหลือกี่แถว**
 * @param reviewRows ชุดรอเติมข้อมูลทุกงวด (ไม่ใช่ชุดที่โหลดตามงวด) · `null` = ยังไม่รู้ ⇒ คืน null (ไม่โชว์เลข)
 */
export function reviewOptionCount(reviewRows, filters = {}, ctx = {}) {
  if (!Array.isArray(reviewRows)) return null;
  return reviewRows.filter((deal) => isNeedsReviewDeal(deal)
    && dealPassesListFilters(deal, filters, ctx, { except: 'review' })).length;
}
