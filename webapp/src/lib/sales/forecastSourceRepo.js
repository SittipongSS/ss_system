/* ── ฝั่ง server ของที่มา FC (mig 0337) ──────────────────────────────────────
 *
 * แยกจาก lib/sales/forecastSource.js เพราะไฟล์นั้นเป็นสูตรล้วนที่หน้าจอ import ด้วย
 * — ไฟล์นี้แตะฐานด้วย service-role จึงห้ามหลุดไปฝั่ง client (แพตเทิร์นเดียวกับ
 * dealValueItemsRepo.js)
 *
 * ⭐ **ตัวเดียวที่เขียน `projectValue` ตามเอกสารได้** — route อื่นห้ามคิดกติกาเอง
 *
 * ⚠️ **ไม่มีการไล่ปรับดีลเก่าอัตโนมัติ** (มติผู้ใช้ 2026-09-02) — ดีลที่มีใบอนุมัติ
 *    ไว้ก่อนไมเกรชันจะขึ้นคิว "FC ไม่ตรงใบเสนอราคา" ให้ AE กดรับทีละใบ · เหตุที่ไม่
 *    ปล่อยอัตโนมัติ: วัดของจริง 2026-09-02 แล้วยอดรวมจะกระโดด +6,774,777 และมี 5 ดีล
 *    ที่ FC **ลดลง** โดยไม่มีใครเห็น (ODM_NOURA FC 250,000 → ใบตัวอย่าง 500 บาท)
 *
 * ⚠️ ไม่มีทรานแซกชันข้ามคำสั่งใน PostgREST — ทุกผู้เรียกใช้แบบ best-effort แล้วส่ง
 *    `forecastWarning` กลับให้ผู้ใช้เห็น ห้ามกลืน error เงียบ ๆ (การอนุมัติใบ commit
 *    ไปแล้ว ถ้า FC ไม่ขยับต้องรู้ว่ายังไม่ขยับ)
 */
import { isWonStage } from '@/lib/salesPlanning';
import {
  eligibleForecastQuotations,
  forecastValueOfQuotation,
  resolveForecastSource,
} from '@/lib/sales/forecastSource';

export const FORECAST_DEAL_COLUMNS = 'id,stage,"projectValue","forecastManualValue","forecastSource","forecastQuotationId","forecastPinnedAt","forecastPinnedBy"';

const QUOTATION_COLUMNS = 'id,"dealId","quoteNumber","baseNumber","revisionNo",status,"approvalStatus","totalAmount","vatAmount","createdAt"';

/* ใบทั้งหมดของดีล — ต้องเอามาทั้งชุด ไม่ใช่เฉพาะใบที่มีสิทธิ์ เพราะ resolver ต้องมอง
   เห็นแถวที่ตัวชี้เดิมชี้อยู่ด้วย (ใบที่เพิ่งพลิกเป็น revised) ถึงจะรู้ว่าเลขที่ฐาน
   ตรงกันไหม ⇒ กรองสิทธิ์เป็นงานของ lib ไม่ใช่ของ query */
export async function loadDealQuotations(supabase, dealId) {
  const { data, error } = await supabase
    .from('quotations')
    .select(QUOTATION_COLUMNS)
    .eq('dealId', dealId)
    .order('createdAt', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

/* เหตุที่เรียก — ตัดสินว่าอนุญาตให้ FC "ขึ้นบันได" (manual → quotation) ได้ไหม
 *
 * ⭐ มีเหตุเดียวที่ขึ้นได้เอง: **ใบถูกอนุมัติ** ซึ่งเป็นการกระทำที่มีคนกดและมีหัวหน้า
 *    รับรอง (มติผู้ใช้ 2026-09-02: "FC ขยับตอนใบอนุมัติแล้ว")
 * ⭐ เหตุอื่น (ลบใบ · ออก Rev.) แค่ **ดูแลตัวชี้ที่มีอยู่** — ดีลที่ยังเป็น manual อยู่
 *    ต้องไม่ถูกลากขึ้นบันไดเพราะมีใครไปลบใบอื่นทิ้ง ไม่งั้นคิวที่ให้ AE กดรับก็ไร้ค่า
 */
const CLAIMING_CAUSES = new Set(['quotation_approved']);

/* คิดใหม่แล้วเขียนถ้าเปลี่ยน — คืน { changed, source, value, reason, warning }
 * ปลอดภัยเมื่อกดซ้ำเสมอ (คิดจากสถานะปัจจุบันทั้งหมด ไม่ใช่ส่วนต่าง) */
export async function applyForecastSource(supabase, dealId, { cause } = {}) {
  const { data: deal, error: dealError } = await supabase
    .from('sales_deals').select(FORECAST_DEAL_COLUMNS).eq('id', dealId).maybeSingle();
  if (dealError) return { changed: false, warning: dealError.message };
  if (!deal) return { changed: false, warning: 'ไม่พบดีลของใบนี้' };
  if (isWonStage(deal.stage)) return { changed: false, reason: 'won_frozen' };

  let quotations;
  try {
    quotations = await loadDealQuotations(supabase, dealId);
  } catch (error) {
    return { changed: false, warning: error.message };
  }

  const resolved = resolveForecastSource(deal, quotations);
  const claiming = resolved.source === 'quotation' && deal.forecastSource !== 'quotation';
  if (claiming && !CLAIMING_CAUSES.has(cause)) {
    return { changed: false, reason: 'needs_user_choice', pendingValue: resolved.value };
  }
  if (!resolved.changed) return { changed: false, reason: resolved.reason };

  return writeForecastSource(supabase, deal, resolved, { clearPin: resolved.pinCleared });
}

/* เขียนสถานะที่ resolver ตัดสินแล้วลงแถวดีล
 * ⚠️ แตะได้แค่ 5 คอลัมน์นี้ — ห้ามเผลอ merge metadata/stage/wonValue เข้ามา ไม่งั้น
 *    trigger 0110 (BEFORE UPDATE OF stage/"wonValue"/metadata) จะตีตรา actualSource
 *    ของดีลย้ายระบบใหม่เป็น 'sale_order' แล้ว wonValue ถูกล้างเป็น 0 ถาวร */
async function writeForecastSource(supabase, deal, next, { clearPin, pin, user } = {}) {
  const patch = {
    projectValue: next.value,
    forecastSource: next.source,
    forecastQuotationId: next.source === 'quotation' ? next.quotationId : null,
    updatedAt: new Date().toISOString(),
  };
  if (clearPin) { patch.forecastPinnedAt = null; patch.forecastPinnedBy = null; }
  if (pin === true) {
    patch.forecastPinnedAt = new Date().toISOString();
    patch.forecastPinnedBy = user?.name || user?.id || null;
  }
  if (pin === false) { patch.forecastPinnedAt = null; patch.forecastPinnedBy = null; }

  const { error } = await supabase.from('sales_deals').update(patch).eq('id', deal.id);
  if (error) return { changed: false, warning: error.message };
  return {
    changed: true,
    source: next.source,
    quotationId: patch.forecastQuotationId,
    value: next.value,
    previousValue: Number(deal.projectValue ?? 0),
    reason: next.reason,
  };
}

/* AE เลือกที่มาเอง — ทั้งการกดรับจากคิว การปักใบ และการกลับไปกรอกเอง
 * คืน { error } เมื่อเลือกใบที่ไม่มีสิทธิ์ ไม่ใช่เงียบ ๆ แล้วเขียนค่าที่อ่านไม่ออก */
export async function chooseForecastSource(supabase, dealId, { source, quotationId, pin, user } = {}) {
  const { data: deal, error: dealError } = await supabase
    .from('sales_deals').select(FORECAST_DEAL_COLUMNS).eq('id', dealId).maybeSingle();
  if (dealError) return { error: dealError.message };
  if (!deal) return { error: 'ไม่พบดีล' };
  // ดีลที่ปิดแล้วยอดคือ Actual ไม่ใช่ประมาณการ — ด่านเดียวกับ projectValue ใน PATCH
  if (isWonStage(deal.stage)) return { error: 'ดีลปิดแล้ว แก้ที่มาของ FC ไม่ได้' };

  /* เลือกเองเสมอ = ปักเสมอ เว้นแต่สั่งไม่ปัก — คนที่เพิ่งตัดสินว่าใบไหน (หรือว่าจะ
     กรอกเอง) ไม่ควรถูกระบบเลื่อนทับตอนใบถัดไปอนุมัติ · ปลดล็อกได้ด้วย pin:false */
  const pinning = pin !== false;

  if (source === 'manual') {
    const next = { source: 'manual', quotationId: null, value: Number(deal.forecastManualValue ?? 0) };
    return writeForecastSource(supabase, deal, next, { pin: pinning, user });
  }

  let quotations;
  try {
    quotations = await loadDealQuotations(supabase, dealId);
  } catch (error) {
    return { error: error.message };
  }
  const candidates = eligibleForecastQuotations(quotations);
  const picked = candidates.find((quotation) => quotation.id === quotationId);
  if (!picked) {
    return { error: 'ใบเสนอราคาใบนี้ใช้เป็นที่มาของ FC ไม่ได้ (ต้องเป็นฉบับล่าสุดที่อนุมัติแล้ว)' };
  }
  const next = {
    source: 'quotation',
    quotationId: picked.id,
    value: forecastValueOfQuotation(picked),
  };
  return writeForecastSource(supabase, deal, next, { pin: pinning, user });
}
