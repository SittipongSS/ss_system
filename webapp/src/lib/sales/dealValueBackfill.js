/* แผนการแก้ยอดดีลย้อนหลังให้ตรงกับใบที่ลูกค้ารับ (มติผู้ใช้ 2026-09-16)
 *
 * ⭐ ตัวตัดสิน **ว่าดีลไหนถูกแก้และแก้เป็นเท่าไหร่** อยู่ที่นี่ ไม่ใช่ในสคริปต์ —
 *    สคริปต์เขียนลงฐานจริง (dev = production) ⇒ ส่วนที่ตัดสินใจต้องมีเทสต์ครอบได้โดยไม่ต้องต่อฐาน
 * ⚠️ ไฟล์นี้ **ห้าม import '@/…'** — สคริปต์ `scripts/backfill-deal-fc-from-accepted-quote.mjs`
 *    รันด้วย node เปล่า ไม่มี loader map ของ '@/'
 */
import { quotationWonAmount } from './quotationWonAmount.js';
import { isKpiDeal } from './historicalOrders.js';

/* ช่องว่างที่ถือว่า "ตรงกันแล้ว" — เงินในระบบเก็บถึงสตางค์ ส่วนต่างต่ำกว่าครึ่งสตางค์คือทศนิยมลอย */
export const VALUE_EPSILON = 0.005;

/* สี่ช่องที่แตะได้ — ⛔ ห้ามเพิ่ม stage / wonValue / metadata เข้ามา:
   ทริกเกอร์ Actual (0353/0360) เฝ้าช่องพวกนั้นอยู่ แตะแล้ว Actual ขยับตาม */
export const BACKFILL_FIELDS = Object.freeze([
  'projectValue', 'forecastSource', 'forecastQuotationId', 'forecastManualValue',
]);

/* ทะเบียนใบเสนอราคาสำหรับค้นด้วย id — คีย์เป็นสตริงเสมอ ไม่งั้น id ที่มาจาก metadata (jsonb)
   กับ id ที่มาจากคอลัมน์ text จะไม่เจอกันเงียบ ๆ */
export const quoteIndexOf = (quotes = []) => new Map(quotes.map((q) => [String(q?.id), q]));

/* ดีลที่ต้องแก้ + ดีลที่ชี้ไปยังใบที่หาไม่เจอ (ต้องรายงาน ไม่ใช่เดาค่าให้)
   ⚠️ ดีลของใบสั่งขายย้อนหลังไม่มี FC ⇒ ไม่แตะ (isKpiDeal — ห้ามเทียบ origin ด้วยมือ) */
export function planDealValueBackfill(deals = [], quotesById = new Map()) {
  const targets = [];
  const missingQuotes = [];
  for (const deal of deals) {
    if (!isKpiDeal(deal)) continue;
    const acceptedId = deal?.metadata?.acceptedQuotationId;
    if (!acceptedId) continue;                       // ไม่มีใบที่ลูกค้ารับ = ไม่มีอะไรให้อ้างอิง ห้ามเดา
    const quote = quotesById.get(String(acceptedId));
    if (!quote) { missingQuotes.push({ deal, acceptedId: String(acceptedId) }); continue; }
    const next = quotationWonAmount(quote);          // ยอดก่อน VAT หลังส่วนลด — สูตรกลางตัวเดียวกับที่แอปใช้
    const now = Number(deal?.projectValue) || 0;
    if (Math.abs(next - now) <= VALUE_EPSILON) continue;
    targets.push({ deal, quote, next, now });
  }
  return { targets, missingQuotes };
}

/* ค่าที่จะเขียนของดีลหนึ่งใบ — กติกาเดียวกับ UPDATE ใน mig 0361 เป๊ะ
   ⚠️ `forecastManualValue` เป็น NOT NULL DEFAULT 0 (0337) ⇒ ใช้ ?? / COALESCE ไม่ได้
      ดีลที่ยังเดินตามเลขกรอกมือ ⇒ ยอดดีลตอนนี้ **คือ** เลขกรอก เก็บลงช่องของมันก่อนทับ */
export function dealValueBackfillPatch(target) {
  const { deal, quote, next, now } = target || {};
  return {
    projectValue: next,
    forecastSource: 'quotation',
    forecastQuotationId: quote?.id ?? null,
    forecastManualValue: deal?.forecastSource === 'manual' ? now : (Number(deal?.forecastManualValue) || 0),
  };
}
