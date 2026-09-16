// กติกากลางของภาพรวมงานขาย — ตัวรวมยอดฝั่ง server (api/sales-planning/dashboard)
// และ drill-down modal ฝั่ง client ต้องใช้ชุดเดียวกัน ไม่งั้นตัวเลขบนการ์ด KPI
// กับรายการดีลที่กดเข้าไปดูไม่ตรงกัน (ผลตรวจระบบขาย 2026-07-16)
import { isOpenStage, isWonStage, monthKey } from '@/lib/salesPlanning';
import { businessDayKey, currentMonth } from '@/lib/datePeriods';
import {
  dealActualFromSalesOrders,
  dealPendingApprovalAmount,
  dealPendingApprovalCount,
} from '@/lib/sales/salesOrderWorkflow';
// ตัวอ่านธงสวิตช์ดีลเก่าตัวเดียวกับด่านสร้างดีล — legacyDealSwitch เป็นสูตรล้วน ไม่ import อะไร (ไม่มีวงวน)
import { hasLegacySwitchFlag } from '@/lib/sales/legacyDealSwitch';
// ดีลของใบสั่งขายย้อนหลัง (mig 0360) — historicalOrders เป็นสูตรล้วน ไม่ import อะไร (ไม่มีวงวน)
import { isHistoricalDeal } from '@/lib/sales/historicalOrders';

/* ดีลที่นับเข้า KPI ได้ — ดีลของใบสั่งขายย้อนหลังเป็น Won มูลค่า 0 ที่ไม่ใช่ยอดขาย (ตัวจริงอยู่ที่ historicalOrders)
   ส่งต่อจากที่นี่ให้จอ/ตัวรวมที่อ่านกติกา KPI จากไฟล์นี้อยู่แล้ว ไม่ต้อง import สองบ้าน */
export { isKpiDeal } from '@/lib/sales/historicalOrders';

// Won นับรวม in_project (ดีลเก่าที่ปิดแล้วแปลงเป็นโครงการ) — กติกาอยู่ที่ isWonStage
// ตัวกลาง สองตัวนี้เป็นแค่รูปที่รับ "ทั้งดีล" ให้เรียกง่ายในตัวกรอง
export const isWonDeal = (d) => isWonStage(d?.stage);
export const isOpenDeal = (d) => isOpenStage(d?.stage);

// ดีล lost "เชิงธุรการ" ของสายสหมิตร — ไม่ใช่แพ้จริง ห้ามปนสถิติแพ้/FC:
// - sahamitMergedIntoDealId: ดีล FC ถูกยุบเข้าดีลรวมของ PO (ขายได้จริง! demand ไป
//   โผล่บนดีลรวมแทน — นับด้วยจะทั้งเพี้ยน lost และนับ FC ซ้ำ)
// - sahamitSupersededByRoundId: ดีลรอบ FC เก่าถูกแทนที่เพราะสหมิตรอัพเดท FC
// ทุกจุดที่นับดีลแพ้ (dashboard + drill-down) ต้องกรองผ่าน isRealLostDeal ตัวเดียวนี้
export const isAdministrativeLoss = (d) => Boolean(
  d?.metadata?.sahamitMergedIntoDealId || d?.metadata?.sahamitSupersededByRoundId,
);
export const isRealLostDeal = (d) => d?.stage === 'lost' && !isAdministrativeLoss(d);

// ยอด Actual ของดีล Won — อ่านผ่าน cache wonValue เฉพาะเมื่อยืนยันว่ามาจาก Approved SO
export const wonAmountOf = (d) => dealActualFromSalesOrders(d);

// ยอด "รออนุมัติ" ของดีล (SO ยื่นแล้ว รอ AE Supervisor · mig 0353) — **แยกจาก Actual เสมอ**
// ⭐ นับเฉพาะดีล Won: ดีลที่ยังเปิดมี FC อยู่ใน FC คงเหลือแล้ว นับซ้ำไม่ได้ (ของจริงแทบ
//    เกิดไม่ได้ — สร้าง SO ได้ต้องมีใบเสนอราคาที่รับแล้ว ซึ่งพาดีลเป็น Won ในจังหวะเดียวกัน)
// ⛔ ห้ามบวกเข้า wonValue / won / actual / เป้า / % / ขาด-เกิน — ส่งเป็นช่องแยกเสมอ
export const pendingApprovalAmountOf = (d) => (isWonDeal(d) ? dealPendingApprovalAmount(d) : 0);
export const pendingApprovalCountOf = (d) => (isWonDeal(d) ? dealPendingApprovalCount(d) : 0);

// เดือนของยอดรออนุมัติ = **เดือนปัจจุบัน (เวลาไทย) เสมอ** (มติผู้ใช้ 2026-09-11)
// อนุมัติย้อนหลังไม่ได้ ถ้าอนุมัติวันนี้ Actual ก็ลงเดือนนี้ (wonMonth = เดือนของ approvedAt)
// ⇒ ใบที่ค้างข้ามเดือนเลื่อนมาอยู่เดือนใหม่เอง · เดือนที่ปิดไปแล้ว/ปีก่อนไม่มีวันเห็นยอดนี้
// ⚠️ ห้ามใช้ wonMonthOf (ดีลรออนุมัติไม่มี wonMonth → ตกไปเดือนที่ปิด Won ตาม confirmedAt ไม่ใช่เดือนปัจจุบัน)
// ⚠️ ห้ามใช้ businessMonthKey ของ lib/businessDate (คืน 'YYMM' สำหรับเลขเอกสาร)
// ⭐ "มีใบรออนุมัติ" = ยอด > 0 **หรือมีใบ** — ใบยอด 0 บาทถูกกฎตั้งแต่ mig 0197 และ trigger
//    ของ mig 0353 เขียนคีย์ทั้งคู่เมื่อ count > 0 · ถ้าดูแค่ยอด ใบพวกนี้หลุดจากแดชบอร์ด/ลิ้นชัก/
//    แดชบอร์ดของฉัน ขณะที่รายงานเป้า หน้า SO และหน้าดีลนับจำนวนใบอยู่ (splitSalesOrderAmounts)
export const pendingApprovalMonthOf = (d, now = new Date()) => (
  pendingApprovalAmountOf(d) > 0 || pendingApprovalCountOf(d) > 0 ? currentMonth(now) : null
);

/* ── "Won รอยื่น SO" (มติผู้ใช้ 2026-09-14) ─────────────────────────────────────
   ดีลที่ปิด Won แล้วแต่ **ยังไม่มี SO ที่อนุมัติ และไม่มียอด SO ที่รออนุมัติ** (ยังไม่ออก SO ·
   มีแค่ร่าง · ถูกตีกลับ/ดึงกลับ · มีแต่ใบยกเลิก · มีแต่ใบที่ยื่นรออนุมัติยอด 0 บาท) · มูลค่าดีล 0 ไม่นับ
   ⛔ ใบที่อนุมัติแล้ว **แม้ยอด 0 บาท = จบ** (ส่วนลด 100% · มติผู้ใช้ 2026-09-16 บ่าย · ข้อ ④ ข้างล่าง)
   🐞 ตรวจซ้ำ 2026-09-14: รับใบเสนอราคา = ดีลเป็น Won ทันที (0284) ⇒ หลุดจาก FC คงเหลือ
      แต่ SO เกิดเป็นร่าง (0285) ⇒ ไม่อยู่ในรออนุมัติ/Actual ⇒ "คาดขาด" พุ่งเต็มมูลค่าดีล
      จนกว่าจะกดยื่น SO — ช่องนี้ปิดรูนั้น ให้ยอดคาดการณ์ไม่วูบทุกช่วงของดีล
   ⭐ ยอด = projectValue (มูลค่าดีลเต็มก้อน — ฐานเดียวกับ FC คงเหลือ ซึ่งไม่ถ่วงโอกาสปิด)
   ⭐ เดือน = wonMonthOf (ถังเดียวกับที่ FC Total ของดีล Won นี้อยู่แล้ว) — ไม่ใช้เดือนปัจจุบัน
      แบบรออนุมัติ เพราะดีลค้างเก่า (Won แต่ไม่เคยออก SO) จะไปกองรวมในเดือนนี้เดือนเดียว
   ⭐ ออกจากกองเมื่อ **มีใบสั่งขายที่อนุมัติ** (dealHasApprovedSalesOrder — wonMonth ที่ trigger เขียนเมื่อมีใบอนุมัติ
      แม้ยอด 0) · 🪤 รอบเช้า 16/09 เคยเปลี่ยนเป็น "Actual > 0" แล้วกลับคืนในวันเดียวกัน — ดูข้อ ① กับ ④ ข้างล่าง
   ⭐ **ไม่นับดีลเก่าที่สร้างเป็น Won** (isLegacyWonAtCreate ข้างล่าง · มติผู้ใช้ 2026-09-15) — ตัดทั้งยอดและ
      จำนวน ทุกจอที่อ่านตัวช่วยชุดนี้ · ดีลแบบนี้ยื่น SO ไม่ได้เลย (ออกใบเสนอราคาให้ดีล Won ไม่ได้ · SO ต้องมี
      ใบเสนอราคาที่รับแล้ว · PATCH เปลี่ยนขั้นของดีล Won ไม่ได้) คำว่า "รอยื่น SO" จึงผิดทุกใบ และยอดของมัน
      ไม่มีวันเป็น Actual ⇒ นับเข้าคาดจบงวดทำให้คาดขาดดูดีเกินจริง
      🐞 ตรวจ prod 2026-09-15: กองนี้ 42 ดีล 2,348,450 เป็นดีลแบบนี้ 35 ดีล 1,645,350 (+24 บรรทัด ฿0)
         เหลือดีลจริง 7 ดีล 703,100
      ⚠️ ตัดเฉพาะกองนี้ — Actual · FC Total · FC คงเหลือ · ยอด Won ในลิ้นชัก · FC Excel · wonCount ·
         projectRollup ไม่เปลี่ยน (บล็อก B ของ mig 0359 ยังอยู่ใน FC จนเจ้าของยืนยัน)
   ⛔ ห้ามบวกเข้า Actual / เป้า / % / ขาด-เกิน — ใช้ได้แค่ยอดคาดการณ์ (projected) กับบรรทัดแสดงผล */
export const WON_AWAITING_SO_LABEL = 'Won รอยื่น SO';
export const dealHasApprovedSalesOrder = (d) => Boolean(d?.metadata?.wonMonth) || wonAmountOf(d) > 0;

/* ดีลเก่าจากระบบเดิมที่ **สร้างเป็น Won ตั้งแต่แรก** (สวิตช์ในฟอร์มสร้าง · มติผู้ใช้ 2026-09-15)
   ⭐ ตัวบ่งชี้เดียวของทั้งระบบ — คำนวณจากแถว ไม่มีธงเก็บในฐาน (ไม่มี migration · ไม่ต้อง backfill)
      ห้ามเขียนเงื่อนไขชุดนี้ซ้ำที่อื่น ให้ import ตัวนี้ (เทสต์ legacyDealSwitch.test.mjs สแกนหาของซ้ำ)
   ตรวจ prod 2026-09-15: จับได้ 35/35 · จับผิด 0 จาก 166 ดีลที่ Won ผ่านใบเสนอราคา
   ทำไมต้องมีทีละข้อ:
   · isWonDeal — กติกา Won กลาง (รวม in_project)
   · metadata.legacy === true — ธงสวิตช์ที่ POST เก็บไว้ในแถว · ขาดข้อนี้ "Won แต่ไม่มีใบเสนอราคา" ไม่ได้แปลว่า
     ดีลสวิตช์เสมอ (ก.ค. 2026 เคยมีดีล Won ที่ wonSource 'manual' 10 ใบ · 'sahamit-po' 1 ใบ โดยไม่มี
     acceptedQuotationId — วันนี้ไม่เหลือแล้ว แต่ทางแบบนั้นเคยมีจริง)
     อ่านผ่าน hasLegacySwitchFlag (lib/sales/legacyDealSwitch) ตัวเดียวกับด่าน POST ⇒ ด่านกับตัวบ่งชี้ตัดสินตรงกัน
     (เคยต่างกัน: ด่าน truthy · ตัวบ่งชี้ === true ⇒ legacy: 1 สร้าง Won ได้แต่หลุดตัวบ่งชี้)
     ⚠️ ห้ามเพิ่ม 'legacy' ลง SERVER_ONLY_DEAL_METADATA_KEYS (lib/sales/legacyDealSwitch) — ด่าน POST อ่านธง
        ก่อนถอดก็จริง แต่แถวที่บันทึกจะไม่มีธง ⇒ ดีลสวิตช์ใหม่ทุกใบหลุดตัวบ่งชี้นี้
   · !metadata.acceptedQuotationId — ใน SQL มีทางเดียวที่พาดีลเป็น Won คือ accept_quotation_atomic (ล่าสุด
     0284) ซึ่งเขียนคีย์นี้ + wonSource 'quotation' เสมอ ⇒ ดีลสวิตช์ที่สร้างขั้นก่อนแล้วปิดผ่านใบเสนอราคา
     (7 ใบ เช่น DL-26080394) ไม่เข้าข่าย และยังเดินกติกา Won รอยื่น SO ตามปกติ · ทางถอยทุกทางที่ถอด
     คีย์นี้ (0116/0138/0168/0170) ย้ายดีลออกจาก Won ไปพร้อมกัน ดีล Won จึงไม่เสียคีย์ทั้งที่ยังเป็น Won
   · wonSource !== 'quotation' — กันเคสพังครึ่งทาง: บังคับลบใบเสนอราคาแล้ว JS ถอด acceptedQuotationId สำเร็จ
     (forceDelete.cleanupQuotationOrphans) แต่ RPC ถอยดีลล้มเหลว ⇒ ดีลยังเป็น Won ที่มาจากใบเสนอราคาจริง
   ⚠️ คำขอที่แต่งเองหลบตัวบ่งชี้ไม่ได้ — ทั้งสามข้อของ metadata ล็อกไว้ที่ route ดีล (lib/sales/legacyDealSwitch):
      · wonSource / acceptedQuotationId — client เขียนไม่ได้ทั้ง POST/PATCH (SERVER_ONLY_DEAL_METADATA_KEYS)
      · legacy — POST เก็บเฉพาะ true จริง (clientDealMetadataOnCreate) · PATCH ไม่รับเลย คงค่าเดิม
        (clientDealMetadataOnPatch) ไม่งั้น PATCH {legacy:false} พาดีลกลับเข้ากองนี้ */
export const isLegacyWonAtCreate = (d) => isWonDeal(d)
  && hasLegacySwitchFlag(d?.metadata)
  && !d?.metadata?.acceptedQuotationId
  && d?.metadata?.wonSource !== 'quotation';

/* ⭐ ไม่นับดีลของใบสั่งขายย้อนหลังด้วย (mig 0360) — Won มูลค่า 0 ที่ไม่มีวันยื่น SO ในสายปกติ (ใบย้อนหลังเกิดเป็น
   อนุมัติแล้วแต่ไม่นับ Actual ⇒ wonMonth ว่างตลอด) · ไม่ตัด = ทุกดีลแบบนี้ค้าง "Won รอยื่น SO" ถาวร
   ⚠️ ต่อท้าย **หลัง** !isLegacyWonAtCreate — legacyDealSwitch.test ตรึงสองบรรทัดแรกไว้ */
/* ⭐ มติผู้ใช้ 2026-09-16 ("SO 0 บาท มีบางดีลออกแล้ว" → ทำเลย) — สองข้อ:
   ① **ยังไม่มี Actual = ยังรอ SO ที่มียอด** แม้มี SO อนุมัติ 0 บาทแล้ว — ใบ 0 บาทบนดีลที่ FC > 0 คือเอกสารขั้นแรก
      (ใบ DEMO · ค่าออกแบบกลิ่นก่อนบรีฟ · ใบแทนใบจริงที่ยกเลิก) ออเดอร์จริงยังจะมา
      🪤 ข้อนี้ **ถูกกลับโดยข้อ ④** ในวันเดียวกัน หลังเจ้าของธุรกิจยืนยันว่าใบ 0 บาท = ส่วนลด 100% ที่ถูกต้อง
         เก็บข้อความไว้เพื่อให้รู้ว่าเคยลองทางนี้แล้ว และเหตุผลที่ทิ้งคืออะไร — ไม่ใช่ลืมแก้
   ② **มูลค่าดีล 0 บาทไม่นับ** ทั้งยอดและจำนวน — บวกคาดการณ์ 0 อยู่แล้ว ได้แค่บรรทัด "฿0.00 · 1 ดีล" รกจอ
      (ของจริง 16/09: 3 ดีลมูลค่า 0 ที่มี SO 0 บาทร่าง/ยกเลิก)
   ④ **มี SO อนุมัติแล้ว = จบ ออกจากกอง แม้ใบยอด 0 บาท** (มติผู้ใช้ 2026-09-16 รอบบ่าย — กลับกติกา ① ข้างบน)
      เจ้าของธุรกิจยืนยันว่า **ใบ 0 บาทถูกต้องและเกิดได้จริง** (ให้ส่วนลด 100%) ⇒ ดีลนั้นจบแล้ว ไม่มีเงินจะเข้าอีก
      การค้างไว้ในกองคือการโชว์เงินที่ไม่มีวันมา · ของจริง 16/09: 8 ดีล 1,468,366 ที่ทั้งใบเสนอราคาที่ลูกค้ารับ
      และ SO ที่อนุมัติเป็น 0 บาททั้งคู่ — เอกสารพูดตรงกันว่าศูนย์ มีแต่ยอดที่กรอกมือที่บอกว่าไม่ศูนย์
   ③ **ตัดกองด้วยยอด ไม่ใช่จำนวนใบ** (ตรวจ 2026-09-16) — เดิมมี `pendingApprovalCountOf(d) <= 0` พ่วงอยู่
      🐞 ใบที่ยื่นแล้วยอด 0 บาท (ถูกกฎตั้งแต่ mig 0197) จึงเตะดีลออกจากกองนี้ ขณะที่กองรออนุมัติได้ 0 บาท
         ⇒ มูลค่าดีลทั้งก้อนหายจากคาดจบงวด และคาดขาดบวมเท่ามูลค่านั้น โดยไม่มีช่องไหนบนจอแสดงมันเลย
      ⇒ เหลือเงื่อนไขยอดอย่างเดียว: มีเงินอยู่ที่กองไหน กองนั้นเอาไป · ไม่มีเงินที่ไหน = ยังรอยื่น SO ที่มียอด
   ⚠️ สามบรรทัดแรกห้ามสลับ — legacyDealSwitch.test / historicalMoneyGuards.test ตรึงลำดับไว้ */
export const isWonAwaitingSo = (d) => isWonDeal(d)
  && !isLegacyWonAtCreate(d)
  && !isHistoricalDeal(d)
  && !dealHasApprovedSalesOrder(d)
  && pendingApprovalAmountOf(d) <= 0
  && (Number(d?.projectValue) || 0) > 0;
export const wonAwaitingSoAmountOf = (d) => (isWonAwaitingSo(d) ? Math.max(0, Number(d?.projectValue) || 0) : 0);
export const wonAwaitingSoCountOf = (d) => (isWonAwaitingSo(d) ? 1 : 0);
export const wonAwaitingSoMonthOf = (d) => (isWonAwaitingSo(d) ? wonMonthOf(d) : null);

// FC Total preserves every forecast made in the period (Open + Won + Lost)
// so forecast misses remain auditable. FC remaining is the Open portion only.
export function forecastAccuracyRollup(openDeals = [], wonDeals = [], lostDeals = []) {
  const fc = (d) => Number(d?.projectValue ?? 0);
  const remainingForecast = openDeals.reduce((sum, d) => sum + fc(d), 0);
  const wonForecastValue = wonDeals.reduce((sum, d) => sum + fc(d), 0);
  const lostForecast = lostDeals.reduce((sum, d) => sum + fc(d), 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + wonAmountOf(d), 0);
  return {
    fullForecast: remainingForecast + wonForecastValue + lostForecast,
    remainingForecast,
    wonForecastValue,
    lostForecast,
    wonValue,
    // Positive means Actual beat the resolved FC; Lost contributes zero Actual.
    forecastVariance: wonValue - wonForecastValue - lostForecast,
  };
}

// เดือนที่นับยอด Won: เดือนที่ผู้ใช้เลือกตอนกด Won ก่อน แล้วค่อย fallback ตามลำดับ
//
// ⭐ มติผู้ใช้ 2026-08-05: ดีลที่ FC ไว้เดือนหนึ่งแต่ปิดได้อีกเดือน ให้ยอด **และ FC
// ของมันเอง** ย้ายไปนับที่เดือนที่ปิด — ไม่ต้องค้างไว้ที่เดือน FC เดิม เพราะเส้นทาง
// ทำงานจริงคือ SA/AE เลื่อนเดือน FC ของดีลตามความเป็นจริงอยู่แล้ว (แก้ "วันที่คาดปิด"
// แล้ว forecastMonth ขยับตาม — PATCH /deals ยอมให้แก้ตราบที่ยังไม่ Won)
// ⇒ เดือน FC กับเดือนที่ปิดจึงควรตรงกันโดยธรรมชาติ ไม่ต้องมีกลไกทบยอดข้ามเดือน
//
// ⭐ มติผู้ใช้ 2026-08-21 (mig 0279): `metadata.wonMonth` ของดีลที่มี SO แล้ว =
// เดือนที่ **อนุมัติใบสั่งขาย** (`sales_orders.approvedAt` เวลาไทย) ไม่ใช่เดือนของ
// วันที่บนหัวใบ — Actual เกิดตอนอนุมัติ เดือนที่ลงยอดจึงต้องเป็นเดือนที่อนุมัติ
// ค่านี้ DB เขียนให้เอง (trigger sync_sales_order_actual) ฝั่ง JS แค่อ่าน
export const wonMonthOf = (d) => monthKey(d?.metadata?.wonMonth)
  /* ⚠️ `confirmedAt` เป็น timestamptz — ต้องแปลงเป็นวันของ **เวลาไทย** ก่อนตัดเดือน (ตรวจ 2026-09-16)
     🐞 เดิมตัดจากสตริง UTC ตรง ๆ ⇒ ดีลที่ปิดช่วง 00:00–06:59 เวลาไทย ตกไปเดือนก่อน ขณะที่ `wonMonth`
        ที่ DB เขียนคิดด้วย Asia/Bangkok (mig 0279) ⇒ ดีลเดียวกันย้ายเดือนตอนใบสั่งขายถูกอนุมัติ/ดึงกลับ */
  || monthKey(businessDayKey(d?.confirmedAt))
  || monthKey(d?.metadata?.poReceivedDate)
  || monthKey(d?.forecastMonth);

export const normalizedOwnerName = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

// จับคู่ดีลกับแถว "รายบุคคล" บนภาพรวม — byOwner รวม "ใคร" ด้วยบัญชีผู้ใช้ปัจจุบัน
// (lib/sales/ownerIdentity) ชื่อบนแถวจึงเป็นชื่อ "ปัจจุบัน" ขณะที่ดีลเก่าเก็บชื่อ
// snapshot เดิมไว้ → ต้องเทียบ id ก่อน (ครอบดีลก่อน/หลังเปลี่ยนชื่อ)
// แล้วค่อยถอยไปชื่อ+ทีม สำหรับแถว legacy ที่ id เก่า stale จับบัญชีไม่ได้
//
// ⭐ มติผู้ใช้ 2026-09-14 "ทีมตามดีล" — แถวคนบนแดชบอร์ดแยกตาม **ทีมที่ประทับบนดีล** (sales_deals.team)
//    คนที่มีดีลหลายทีม/ย้ายทีม จึงมีหลายแถว (lib/sales/ownerBucketKey) · ลิ้นชักของแถวคนหนึ่งต้องส่ง
//    `teamScoped: true` มาด้วย ⇒ ดีลต้องอยู่ทีมเดียวกับแถวก่อน (ทีมว่าง '' / null = ทีมเดียวกัน)
//    ไม่งั้นลิ้นชักของแถว KA โชว์ดีล ODM ของคนเดียวกันด้วย ยอดในลิ้นชักเกินช่องบนตาราง
// ⚠️ เป็นธงเลือกเปิด ไม่ใช่ค่าตั้งต้น — `team: null` แปลได้สองแบบ ("ไม่จำกัดทีม" กับ "ถังไร้ทีม")
//    ผู้เรียกเดิมที่ไม่ส่งธง ทำงานเหมือนเดิมทุกกรณี (id ตรง = ตรง ไม่ดูทีม)
export const dealMatchesOwner = (deal, { ownerId, ownerName, team, teamScoped = false } = {}) => {
  if (teamScoped && (deal?.team || null) !== (team || null)) return false;
  if (ownerId && deal?.ownerId === ownerId) return true;
  /* ⭐ ทั้งสองฝั่งมี id แล้วไม่ตรง = จบ ไม่ต้องถอยไปเทียบชื่อ
     เดิมถอยเสมอ ทำให้ดีลของ "คนที่ชื่อพ้องกันในทีมเดียวกัน" ไหลไปนับให้ผิดคน และ
     ที่เจอบ่อยกว่าคือดีลของคนที่เปลี่ยนชื่อ **หายจากยอด** เพราะชื่อในแถวเป็นชื่อเก่า
     ⚠️ ยังต้องมีทางถอยด้วยชื่อ สำหรับแถวเก่าที่ `ownerId` ว่าง (ยอดย้อนหลัง) */
  if (ownerId && deal?.ownerId) return false;
  if (ownerName) {
    return normalizedOwnerName(deal?.ownerName) === normalizedOwnerName(ownerName)
      && (deal?.team || null) === (team || null);
  }
  if (ownerId) return deal?.ownerId === ownerId;
  return true;
};
