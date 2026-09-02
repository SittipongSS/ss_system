/* ── ที่มาของยอด FC ของดีล (mig 0337) ────────────────────────────────────────
 *
 * สูตรอยู่ที่เดียว — หน้าจอใช้บอกผู้ใช้ว่า "FC จะเป็นเท่าไร" · route ใช้ตอนเขียนจริง
 * (แพตเทิร์นเดียวกับ lib/sales/dealValueItems.js) ⇒ **ห้ามคิดกติกานี้เองที่อื่น**
 *
 * บันไดมีสองขั้น: `manual` (ยอดที่ AE กรอก) → `quotation` (ยอดก่อน VAT ของใบที่
 * อนุมัติแล้ว) · ดีลที่ปิด Won แล้วไม่มีขั้น เพราะ FC แช่แข็ง (ยอดของดีล Won คือ
 * Actual ที่มาจาก SO อนุมัติ ไม่ใช่ประมาณการ)
 *
 * ⭐ **ตัวนี้ไม่เคยถูกเรียกตอนอ่านเพื่อเขียนทับเงียบ ๆ** — ผู้เรียกที่เขียนฐานมีแค่
 *    เหตุการณ์ที่คนกดจริง (อนุมัติใบ · ลบใบ · AE เลือกที่มาเอง) · ดีลเก่าที่มีใบ
 *    อนุมัติไว้ก่อนไมเกรชันจึงอยู่ที่ manual ต่อไปจนกว่า AE จะกดรับจากคิว
 *    (มติผู้ใช้ 2026-09-02 — ไม่ backfill) · หน้าจอเรียก resolve เพื่อ **ดู** ได้เสมอ
 */
import { isWonStage } from '@/lib/salesPlanning';
import { quotationWonAmount } from '@/lib/sales/quotationWonAmount';

export const FORECAST_SOURCES = ['manual', 'quotation'];

/* ใบที่มีสิทธิ์เป็นแหล่ง FC — **บัญชีขาว ไม่ใช่บัญชีดำ**
 *
 * สองแกนต้องผ่านทั้งคู่ (ดู lib/sales/quotationWorkflow.js): `status` บอกว่าใบยัง
 * มีชีวิตอยู่ในดีลไหม · `approvalStatus` บอกว่ายอดบนใบผ่านสายตาคนอนุมัติหรือยัง
 *
 * ⚠️ ร่างไม่มีสิทธิ์เด็ดขาด แม้จะกรอกยอดครบแล้ว — `save_quotation_content` เขียนยอด
 *    ใหม่ทุกครั้งที่กด save ถ้าผูก FC ไว้กับร่าง ยอด FC ทั้งบริษัทจะกระตุกตามคนที่
 *    กำลังพิมพ์ใบอยู่ (มติผู้ใช้ 2026-09-02: FC ขยับตอน "อนุมัติ" เท่านั้น)
 * ⚠️ `revised` ไม่นับ — แถวนั้นถูกแทนที่ด้วยฉบับแก้ไปแล้วตั้งแต่วินาทีที่กดสร้าง Rev.
 *    (ของจริงในฐาน 2026-09-02: revised/approved 69 ใบ · นับด้วยคือนับซ้ำทุกใบที่เคยแก้)
 */
export const FORECAST_ELIGIBLE_STATUSES = ['sent', 'accepted'];
export const FORECAST_ELIGIBLE_APPROVALS = ['approved', 'not_required'];

export const isForecastEligibleQuotation = (quotation) => Boolean(quotation)
  && FORECAST_ELIGIBLE_STATUSES.includes(quotation.status)
  && FORECAST_ELIGIBLE_APPROVALS.includes(quotation.approvalStatus);

/* เลขที่ฐานของใบ — ฉบับแก้ทุกฉบับใช้เลขเดียวกัน (mig 0161) ⇒ นี่คือตัวที่บอกว่า
 * "เอกสารคนละฉบับ" หรือ "ฉบับแก้ของเอกสารเดียวกัน" ซึ่งเป็นเส้นแบ่งของทั้งไฟล์นี้ */
export const quotationBaseKey = (quotation) => quotation?.baseNumber || quotation?.quoteNumber || null;

/* ยอดที่จะกลายเป็น FC — **ก่อน VAT** ให้เข้าคู่กับ `wonValue` (0284) และ
 * `sales_orders.actualAmount` (0328) ไม่งั้น forecastVariance กลายเป็นเงา VAT
 * ⚠️ ใบที่ vatRate = 0 คือ "ราคารวม VAT แล้ว" (createQuotationDraft.js) ⇒ ตัวนี้จะคืน
 *    ยอดเต็ม · เป็นพฤติกรรมเดียวกับเส้น Won/Actual วันนี้ ไม่ใช่ของใหม่ที่นี่ */
export const forecastValueOfQuotation = (quotation) => quotationWonAmount(quotation);

export const isForecastPinned = (deal) => Boolean(deal?.forecastPinnedAt);

/* ใบที่แข่งกันเป็นแหล่ง FC — หนึ่งรายการต่อหนึ่งเลขที่ฐาน เอาฉบับแก้ล่าสุดเสมอ
 * เรียงจากใหม่ไปเก่าเพื่อให้หน้าจอโชว์ใบล่าสุดก่อน (ไม่ได้แปลว่าใบแรกชนะ) */
export function eligibleForecastQuotations(quotations = []) {
  const latestOfBase = new Map();
  for (const quotation of quotations) {
    if (!isForecastEligibleQuotation(quotation)) continue;
    const key = quotationBaseKey(quotation);
    if (!key) continue;
    const current = latestOfBase.get(key);
    if (!current || Number(quotation.revisionNo || 0) > Number(current.revisionNo || 0)) {
      latestOfBase.set(key, quotation);
    }
  }
  return [...latestOfBase.values()].sort(
    (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  );
}

const manualValueOf = (deal) => {
  const manual = Number(deal?.forecastManualValue ?? 0);
  if (Number.isFinite(manual) && manual > 0) return manual;
  // ดีลก่อน mig 0337 ที่ backfill ยังไม่ถึง — ยอดเดิมบนแถวคือยอดที่ AE กรอกอยู่แล้ว
  const current = Number(deal?.projectValue ?? 0);
  return Number.isFinite(current) && current > 0 ? current : 0;
};

const stateOf = (deal) => ({
  source: FORECAST_SOURCES.includes(deal?.forecastSource) ? deal.forecastSource : 'manual',
  quotationId: deal?.forecastQuotationId || null,
  value: Number(deal?.projectValue ?? 0),
});

const same = (deal, next) => {
  const now = stateOf(deal);
  return now.source === next.source
    && now.quotationId === next.quotationId
    && Math.abs(now.value - next.value) < 0.005;
};

const result = (deal, next, reason, extra = {}) => ({
  ...next,
  reason,
  changed: !same(deal, next),
  ...extra,
});

/* ── ตัวตัดสินเดียวของทั้งเรื่อง ────────────────────────────────────────────
 *
 * คืนสถานะที่ FC "ควรเป็น" พร้อมเหตุผล — ไม่แตะฐาน ผู้เรียกเป็นคนเขียนเอง
 *
 * เหตุผลที่คืนได้:
 *   won_frozen        ดีลปิดแล้ว ไม่ขยับ (RPC 0284 เป็นเจ้าของยอดตั้งแต่จุดนั้น)
 *   no_eligible       ไม่มีใบที่อนุมัติ → manual
 *   single            มีใบเดียว → เดินตามใบนั้น
 *   revision          เดินตามฉบับแก้ล่าสุดของเลขที่เดิม (ตัวชี้ขยับ ยอดตามใบใหม่)
 *   pinned            คนปักไว้ ระบบไม่เลื่อนที่มาให้
 *   ambiguous         หลายเลขที่ ระบบไม่เดา ค้างที่เดิมจนกว่าคนจะเลือก
 *   pointer_gone      ใบที่ชี้อยู่หลุดสิทธิ์ (ถูกยกเลิก/ตีกลับ/แทนที่) → ถอย manual
 */
export function resolveForecastSource(deal, quotations = []) {
  if (isWonStage(deal?.stage)) {
    return result(deal, stateOf(deal), 'won_frozen', { ambiguous: false, candidates: [] });
  }

  const candidates = eligibleForecastQuotations(quotations);
  const manual = { source: 'manual', quotationId: null, value: manualValueOf(deal) };
  const current = stateOf(deal);
  const pointed = current.quotationId
    ? quotations.find((quotation) => quotation.id === current.quotationId)
    : null;
  const pointedBase = pointed ? quotationBaseKey(pointed) : null;

  /* ⭐ ออก Rev. แล้ว FC ต้องไม่ตกกลับ — วินาทีที่กดสร้างฉบับแก้ แถวเดิมพลิกเป็น
     'revised' ทันที (revise/route.js) ส่วนฉบับใหม่ยังเป็นร่าง ⇒ ชั่วขณะนั้นดีลไม่มีใบ
     ที่มีสิทธิ์เลยสักใบ · ถ้าปล่อยให้ตกกลับไปยอดที่ AE กรอก FC ทั้งบริษัทจะแกว่งทุกครั้ง
     ที่มีคนกดแก้ใบ แล้วเด้งกลับตอนอนุมัติ — งานธุรการไม่ควรขยับตัวเลขฝ่ายบริหาร
     ⇒ ค้างยอดเดิมไว้ตราบที่ฉบับแก้ของเลขที่เดียวกันยังเดินอยู่ในระบบ */
  const awaitingRevision = Boolean(pointed)
    && pointed.status === 'revised'
    && quotations.some((quotation) => quotation.id !== pointed.id
      && quotationBaseKey(quotation) === pointedBase
      && Number(quotation.revisionNo || 0) > Number(pointed.revisionNo || 0));

  const sameBase = pointedBase
    ? candidates.find((quotation) => quotationBaseKey(quotation) === pointedBase)
    : null;

  if (!sameBase && awaitingRevision) {
    return result(deal, current, 'awaiting_revision', { ambiguous: false, candidates });
  }

  if (!candidates.length) {
    const reason = current.source === 'quotation' ? 'pointer_gone' : 'no_eligible';
    return result(deal, manual, reason, { ambiguous: false, candidates });
  }

  const follow = (quotation, reason, extra) => result(deal, {
    source: 'quotation',
    quotationId: quotation.id,
    value: forecastValueOfQuotation(quotation),
  }, reason, { ambiguous: false, candidates, ...extra });

  /* ปักไว้ = ปัก "ฉบับนี้" ไม่ใช่ปัก "revisionNo นี้" — ออก Rev. ใหม่แล้วอนุมัติ FC
     ต้องตามไป ไม่งั้นการปักกลายเป็นการแช่แข็งยอดที่ล้าสมัยไปเรื่อย ๆ */

  if (isForecastPinned(deal)) {
    if (current.source === 'manual') {
      return result(deal, manual, 'pinned', { ambiguous: false, candidates });
    }
    if (sameBase) return follow(sameBase, sameBase.id === current.quotationId ? 'pinned' : 'revision');
    // ใบที่ปักไว้หลุดสิทธิ์ไปแล้ว — การปักหมดความหมาย ถอยลงมาให้กติกาปกติตัดสินต่อ
    return candidates.length === 1
      ? follow(candidates[0], 'single', { pinCleared: true })
      : result(deal, manual, 'pointer_gone', { ambiguous: true, candidates, pinCleared: true });
  }

  if (sameBase) return follow(sameBase, sameBase.id === current.quotationId ? 'single' : 'revision');

  if (candidates.length === 1) return follow(candidates[0], 'single');

  /* หลายเลขที่ = ระบบแยกไม่ออกว่า "ทางเลือกแทนกัน" (เสนอ 3 ขนาด ลูกค้าเลือกอันเดียว
     → รวมกัน FC พองสามเท่า) หรือ "ส่วนที่บวกกัน" (ใบออกแบบกลิ่น + ใบผลิต — ดู
     lib/sales/contractQuotationState.js) ⇒ ไม่เดา ไม่รวม ไม่เลือกใบใหม่สุด
     ค้างที่ค่าเดิมแล้วให้คนตัดสิน (มติผู้ใช้ 2026-09-02) */
  return result(deal, current.source === 'quotation' ? current : manual, 'ambiguous', {
    ambiguous: true,
    candidates,
  });
}

/* มุมมองสำหรับหน้าจอ — บอกทั้ง "ตอนนี้เป็นอะไร" และ "ถ้าเดินตามกติกาจะเป็นอะไร"
 * โดยไม่เขียนอะไรลงฐาน · `pendingValue` คือตัวเลขที่ปุ่มในคิวจะกดรับ */
export function forecastSourceView(deal, quotations = []) {
  const resolved = resolveForecastSource(deal, quotations);
  const current = stateOf(deal);
  const pointed = current.quotationId
    ? quotations.find((quotation) => quotation.id === current.quotationId) || null
    : null;
  return {
    source: current.source,
    quotation: pointed,
    value: current.value,
    manualValue: manualValueOf(deal),
    pinned: isForecastPinned(deal),
    pinnedBy: deal?.forecastPinnedBy || null,
    ambiguous: resolved.ambiguous,
    candidates: resolved.candidates,
    needsDecision: resolved.changed || resolved.ambiguous,
    pendingSource: resolved.source,
    pendingQuotationId: resolved.quotationId,
    pendingValue: resolved.value,
    reason: resolved.reason,
  };
}
