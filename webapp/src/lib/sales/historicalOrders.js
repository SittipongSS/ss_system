// ── ใบสั่งขายย้อนหลัง (SO ย้อนหลัง · mig 0360 → 0374) — ค่าคงที่ + ตัวตัดสินกลาง ────────────
//
// ⭐ มติผู้ใช้ 14/09/2026 ข้อ 1–21 + คำตอบคำถามเปิดของแผน P1 (15/09/2026)
//   · ตารางเดียว + ธง `origin` ('pipeline' | 'historical') บน sales_orders และ sales_deals
//   · เก็บยอดจริงไว้ในใบ แล้ว **กรองที่ตัวคำนวณ** — ใบย้อนหลังไม่นับ Actual / FC / เป้า
//   · ดีลภาชนะ 1 ใบต่อ (ลูกค้า × AE) · AE บังคับ (คำตอบข้อ 1) · ย้ายเจ้าของทีละใบ (คำตอบข้อ 4)
// ⭐ มติเจ้าของ 22/09/2026 (mig 0374) — แทน "เกิดเป็นอนุมัติแล้ว" ของ 0360
//   · ฝ่ายขายทุกตำแหน่ง + Admin คีย์ได้ (ข้อ 15 เดิมให้แค่ AE Sup/Admin) · AE Sup อนุมัติ (ไม่นับ Actual)
//   · ใบเกิดเป็นร่าง → ส่งอนุมัติ → AE Sup อนุมัติ/ตีกลับ · ตีกลับ/ดึงกลับแล้วแก้ในฟอร์มเดิม
//   · โซนเลือกจากทะเบียนตอนคีย์ (แทนข้อ 17) · งวดยกมา = เงินที่เก็บก่อนเข้าระบบ บัญชีรับรองครั้งเดียว
//   · เอกสารแทนสัญญากรอกในฟอร์ม อนุมัติพร้อมใบ · สวิตช์ยกเว้นด่านเงินถูกถอด (ใบ ฿0 ผ่านด่าน ② เอง)
//   · อนุมัติแล้วข้อมูลผิด = AE Sup ยกเลิกใบ แล้วคีย์ใหม่ (ฐานยกเลิกเอกสารแทนสัญญาตามในทรานแซกชันเดียว)
// ⭐ มติเจ้าของ 24/09/2026 (mig 0387) — "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ"
//   · ผู้ยกเลิกใบที่อนุมัติแล้ว = ผู้จัดการฝ่ายขายทุกตำแหน่งที่อนุมัติได้ (isSalesOrderReviewer: CD · CM · AE Sup · Admin)
//   · งวดยกมาไม่บล็อกการยกเลิกแล้ว — เป็นโมฆะตามใบ (ที่รอตรวจ ฐานตีกลับให้ · ที่รับรองแล้ว คงไว้เป็นประวัติ + หมายเหตุบังคับ)
//   · งวดปกติที่รับเงินในระบบหลังอนุมัติ (รับรองแล้ว/รอตรวจ) ยังบล็อก — บัญชีถอนคำรับรอง/ตีกลับก่อน
//
// ⚠️ **ไฟล์นี้ไม่มี import โดยเจตนา** — dashboardMetrics · serviceContractLink · contracts ·
//    จอฝั่ง client import ได้หมดโดยไม่ลากของ server ติดมา
// 🔴 **literal 'historical' และตัวกรอง `.eq('origin', …)` มีบ้านเดียวคือไฟล์นี้** — ตัวอ่านที่อื่น
//    ใช้ `pipelineRowsOnly` / `historicalRowsOnly` / `isHistoricalOrder` / `isHistoricalDeal` เท่านั้น
//    (สะกดผิดที่เดียว = ตัวกรองว่างเงียบ ๆ แล้วยอดย้อนหลังไหลเข้า KPI)

import { isSalesManager, SALES_ROLES } from '@/lib/permissions';

export const ORIGIN_PIPELINE = 'pipeline';
export const ORIGIN_HISTORICAL = 'historical';

/* !! ตัวเลขชุดนี้ต้องตรงกับ CHECK/RPC ของ mig 0360 (historicalOrders.test.mjs อ่านไฟล์ SQL เทียบ) */
export const HISTORICAL_REF_MAX = 200;          // sales_orders_historical_refs_len (= referenceDoc 0235)
export const INSTALLATION_POINT_MAX = 200;      // sales_order_lines_installation_point_len
export const INSTALLMENT_LABEL_MAX = 120;       // sales_order_installments label (0245)
export const INSTALLMENT_NOTE_MAX = 1000;       // sales_order_installments note (0245) = ตัวตรวจงวดของ 0374
export const DOC_DATE_MIN = '2000-01-01';       // วันที่ของงวด/ใบ (0245 · 0320)
export const DOC_DATE_MAX = '2100-12-31';
/* 🚫 สวิตช์ "ยกเว้นด่านเงิน" ของ 0360 ถูกถอดครบแล้ว (มติ 22/09) — ค่าคงที่ · ตัวตรวจเหตุผล · ตัวอ่านธง
   ไม่มีในไฟล์นี้อีก · ใบ ฿0 ผ่านด่าน ② ด้วย `paymentNotRequired` (salesOrderPayments)
   ⚠️ คอลัมน์ `paymentGateExempt*` และ CHECK `payment_gate_exempt_sane` ยังอยู่ในฐาน (0360) แต่ CHECK ของ
      0374 บังคับให้ใบย้อนหลังทุกใบมีค่าว่าง ⇒ ไม่มีทางกลับมามีค่าได้อีก */

export const HISTORICAL_STATUS_NOTE = 'ใบสั่งขายย้อนหลัง · ไม่นับ Actual / FC / เป้า';
/* ชื่อดีลภาชนะ — ⚠️ ห้ามคำว่า "ดีลเก่า" (ข้อ 19: คำนั้นเป็นของสวิตช์ในฟอร์มดีล · metadata.legacy) */
export const HISTORICAL_DEAL_TITLE = (customerName) => `งานบริการย้อนหลัง · ${customerName || 'ไม่ระบุลูกค้า'}`;

/* ฐานข้อมูลยังไม่ได้รัน 0360 — ข้อความเดียวทุกเส้นที่แตะคอลัมน์/RPC ของไฟล์นั้น */
export const HISTORICAL_SCHEMA_MISSING_MESSAGE = 'ฐานข้อมูลยังไม่ได้รัน migration 0360 (ใบสั่งขายย้อนหลัง) — แจ้งผู้ดูแลระบบ';
/* ฐานยังไม่ได้รัน 0374 (โซนบนบรรทัด · งวดยกมา · RPC ร่าง/ส่ง/อนุมัติ) — เส้นของฟอร์มคีย์ใหม่ทุกเส้นใช้คำนี้
   ⚠️ แยกจากข้อความของ 0360: ฐานที่รัน 0360 แล้วแต่ยังไม่รัน 0374 ต้องบอกให้ถูกไฟล์ */
export const HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE = 'ฐานข้อมูลยังไม่ได้รัน migration 0374 (ใบสั่งขายย้อนหลังแบบ AE Sup อนุมัติ) — แจ้งผู้ดูแลระบบ';

/* ⭐ มติเจ้าของ 25/09 (รื้อขั้น ④): ผู้อนุมัติใบย้อนหลังเรียกว่า "ผู้จัดการฝ่ายขาย" — ผู้ที่อนุมัติได้จริงคือ AE Sup · CM ·
   Commercial Director (+ Admin) ไม่ใช่ AE Sup คนเดียว (`isSalesOrderReviewer`) · เปลี่ยนเฉพาะคำของใบย้อนหลัง ใบปกติคงเดิม */
export const HISTORICAL_APPROVER_LABEL = 'ผู้จัดการฝ่ายขาย';
export const HISTORICAL_APPROVER_ROLES_TEXT = 'AE Sup · CM · Commercial Director';

/* ทางแก้หลังอนุมัติ (ข้อมูลที่อนุมัติไปแล้วผิด — ยอด · ช่วงครอบ · โซน) — ทุกทางตันพูดประโยคนี้ประโยคเดียว
   (บัญชีตีกลับงวดยกมา · ถอนงวดยกมาไม่ได้ · ล็อกงวด · ถอดเอกสารแทนสัญญาไม่ได้) · ฐานยกเลิกเอกสารแทนสัญญาตามใบเอง (trigger ของ 0374)
   ⭐ มติ 24/09 (mig 0387): ผู้ยกเลิก = ผู้จัดการฝ่ายขายที่อนุมัติได้ (ไม่ใช่ AE Sup คนเดียว) · งวดยกมาเป็นโมฆะตามใบ ไม่ต้องให้บัญชี
     ตีกลับก่อน (ฐานจัดการในทรานแซกชันเดียวกับการยกเลิก) ⇒ ใบที่คีย์ใหม่ต้องให้บัญชีรับรองงวดยกมาอีกครั้ง */
export const HISTORICAL_CORRECTION_PATH = 'ข้อมูลที่อนุมัติแล้วผิด → ผู้จัดการฝ่ายขายยกเลิกใบ แล้วฝ่ายขายคีย์ใหม่'
  + ' (เอกสารแทนสัญญาถูกยกเลิกตาม · งวดยกมาเป็นโมฆะ บัญชีรับรองใหม่ที่ใบใหม่)';

/* route ยกเลิกอ่านงวดหลังยกเลิกแล้วพบงวดยกมายัง "รอบัญชีรับรอง" = trigger ของ 0387 ไม่ได้ทำงาน ทั้งที่ถามฐานก่อนเขียนแล้วว่าพร้อม
   (historicalCancelSettleBlock · review 25/09 fail closed) ⇒ เกิดได้แค่ trigger ถูกปิด/แก้ระหว่างถามกับเขียน
   ⇒ งวดค้างคิว/ป้ายเมนูบัญชีบนใบที่ยกเลิก และล็อกทั้งใบปิดปุ่มตีกลับ — ต้องดัง (warning ในคำตอบ + audit) ไม่ใช่เงียบ */
export const HISTORICAL_CANCEL_SETTLE_STUCK = 'งวดยกมาของใบนี้ยังค้างคิวบัญชีหลังยกเลิก (trigger ของ migration 0387 ไม่ทำงาน) — แจ้งผู้ดูแลระบบ';

/* ฟอร์มคีย์ใบย้อนหลัง (หน้าเต็ม · สร้าง = แก้ เป็น component ตัวเดียว) — ลิงก์ทุกที่ใช้สองตัวนี้ */
export const HISTORICAL_NEW_PATH = '/sa/sales-orders/historical/new';
export const historicalEditPath = (id) => `/sa/sales-orders/historical/${encodeURIComponent(String(id ?? ''))}/edit`;

/* ดีลของใบสั่งขายย้อนหลังผูก/สร้างโครงการไม่ได้ (มติข้อ 7 · CHECK `"projectId" IS NULL`) — create-project กับ
   link-project (รวมโมดัลปิด Won) ใช้คำเดียวกัน */
export const HISTORICAL_DEAL_NO_PROJECT_MESSAGE = 'ดีลของใบสั่งขายย้อนหลังผูกโครงการไม่ได้ — งานบริการย้อนหลังไม่มีโครงการ';

export const isHistoricalOrder = (order) => order?.origin === ORIGIN_HISTORICAL;
export const isHistoricalDeal = (deal) => deal?.origin === ORIGIN_HISTORICAL;
/* ดีลที่นับเข้า KPI ได้ — ดีลภาชนะเป็น Won มูลค่า 0 ที่ไม่ใช่ยอดขาย */
export const isKpiDeal = (deal) => !isHistoricalDeal(deal);

/* ตัวกรองของ query builder — ต่อท้ายได้ทั้ง select และ update/delete */
export const pipelineRowsOnly = (query) => query.eq('origin', ORIGIN_PIPELINE);
export const historicalRowsOnly = (query) => query.eq('origin', ORIGIN_HISTORICAL);

/* ── ใครทำอะไรกับใบย้อนหลัง (มติ 22/09 · mig 0374) ─────────────────────────────────────
   ⭐ **ผู้คีย์ ≠ ผู้อนุมัติ** — คีย์ = ฝ่ายขายทุกตำแหน่ง + Admin · อนุมัติ = isSalesOrderReviewer
      (ผู้มีอำนาจตัดสิน: CD · CM · AE Sup · Admin)
   ⚠️ ถามลิสต์ตำแหน่ง ไม่ใช่ isSuperuser (แพตเทิร์น canApproveExternalContract)
   !! สมาชิกต้องตรงกับ `public.is_sales_keyer_role()` ของ 0382 ที่ RPC สร้าง/แก้/ส่ง เรียก (เดิมเป็น literal
      ใน 0374 · 0382 เปลี่ยนเป็นฟังก์ชันกลางตอนเพิ่มผังตำแหน่ง 2026-09-24) — salesRoleSqlParity.test เทียบไฟล์ SQL
   ⚠️ สิทธิ์ต่อใบ (AE/Senior AE คีย์ได้เฉพาะของตัวเอง · ทีมของดีลภาชนะ) ตัดสินที่ planHistoricalServiceOrder */
export const HISTORICAL_KEYER_ROLES = Object.freeze([...SALES_ROLES, 'admin']);
export const canKeyHistoricalSalesOrder = (user) => HISTORICAL_KEYER_ROLES.includes(user?.role);

/* ย้ายเจ้าของดีลภาชนะ = ผู้มีอำนาจตัดสิน (CD · CM · AE Sup) หรือ Admin เท่านั้น (คำตอบข้อ 4) — ดีลภาชนะ
   ถือใบย้อนหลังทุกใบของคู่ (ลูกค้า × AE) ⇒ แคบกว่าผู้คีย์โดยเจตนา · แยกตัวออกมาตอนผู้คีย์ขยายเป็นฝ่ายขายทุกตำแหน่ง */
export const canMoveHistoricalDealOwner = (user) => isSalesManager(user?.role);

/* สถานะของใบย้อนหลัง (CHECK sales_orders_origin_shape ของ 0374):
   ร่าง → รออนุมัติ → อนุมัติ · รออนุมัติ → ตีกลับ/ร่าง (ดึงกลับ) · ทุกสถานะ → ยกเลิก
   · แก้ในฟอร์มได้ = ร่าง/ตีกลับ (= ด่านของ RPC update_historical_sales_order)
   · ยังไม่อนุมัติ = ร่าง/รออนุมัติ/ตีกลับ — เอกสารแทนสัญญายังเป็นร่าง ยังไม่มีรอบขายของโซน
     (ย้ายเจ้าของดีลภาชนะ · ล็อกเอกสารแทนสัญญา · ลบแบบปกติ ถามชุดนี้) */
export const HISTORICAL_EDITABLE_STATUSES = Object.freeze(['draft', 'rejected']);
export const HISTORICAL_UNAPPROVED_STATUSES = Object.freeze(['draft', 'pending_approval', 'rejected']);
export const historicalOrderEditable = (order) =>
  isHistoricalOrder(order) && HISTORICAL_EDITABLE_STATUSES.includes(order?.status);

/* ── งวดยกมา (sales_order_installments.kind · 0374) ────────────────────────────────────
   เงินที่เก็บไปแล้วก่อนเข้าระบบ — ใบละไม่เกิน 1 งวด · ครอบตั้งแต่วันเริ่มสัญญา · ไม่มีวันครบกำหนด
   · บัญชีรับรองครั้งเดียว (ขั้นอนุมัติดันเป็น "แจ้งชำระแล้ว" ให้) · ใบกำกับออกในระบบเดิม (Express) */
export const OPENING_INSTALLMENT_KIND = 'opening';
export const OPENING_INSTALLMENT_LABEL = 'งวดยกมา';
export const isOpeningInstallment = (row) => row?.kind === OPENING_INSTALLMENT_KIND;

/* ล็อกงวดของใบย้อนหลังทั้งใบ — คืนข้อความไทย หรือ null (ปุ่มกับ API ถามตัวเดียวกัน)
   ⭐ งวดขยับได้ (แจ้งชำระ · รับรอง · ตั้งวัน) **เฉพาะใบที่อนุมัติแล้ว** — ก่อนนั้นงวดยังไม่หยุดยอด
      บัญชียังไม่เห็น และทั้งชุดแก้ที่ฟอร์มคีย์ใบ · ใบยกเลิก = จบ
   ⚠️ ใบ pipeline คืน null เสมอ (ด่านเดิมของมันจัดการเอง) */
export function historicalInstallmentLock(order) {
  if (!isHistoricalOrder(order)) return null;
  if (order?.status === 'approved') return null;
  if (order?.status === 'cancelled') return 'ใบยกเลิกแล้ว — งวดของใบนี้ขยับไม่ได้';
  return `งวดของใบย้อนหลังขยับได้หลัง${HISTORICAL_APPROVER_LABEL}อนุมัติ`;
}

/* ด่านยกเลิกใบย้อนหลังที่มี **เงินที่รับในระบบหลังอนุมัติ** — คืนข้อความไทย หรือ null
   ⭐ **ปุ่มยกเลิกกับ API ถามตัวเดียวกัน** — สองบ้านนี้เท่านั้น (ยาม source: historicalDetailUi.test.mjs §6A):
      · จอ: `app/sales-planning/sales-orders/[id]/page.js` → `historicalCancelBlocked` = disabledReason ของปุ่ม "ยกเลิก SO"
      · API: `app/api/sales-planning/sales-orders/[id]/route.js` action `cancel` → 400
      · ฐานกันซ้ำอีกชั้น: trigger `sales_orders_historical_cancel_settle` ของ 0387 (RAISE historical_so_cancel_money_held)
   ⭐ มติเจ้าของ 24/09 (mig 0387): **งวดยกมาไม่ใช่ด่านแล้ว** — เป็นโมฆะตามใบ (ใบที่คีย์ใหม่รับรองอีกครั้ง)
      · รอบัญชีรับรอง → ฐานตีกลับให้ในทรานแซกชันเดียวกับการยกเลิก (เหตุบอกว่าเป็นการยกเลิก ไม่ใช่บัญชีตีกลับ)
        🐞 เดิมบล็อก "ให้บัญชีตีกลับก่อน" ⇒ ใบที่เพิ่งอนุมัติ (ขั้นอนุมัติดันงวดยกมาขึ้นคิวบัญชีให้เอง) ไม่มีใครยกเลิกได้เลย
      · รับรองแล้ว → คงแถวไว้เป็นประวัติ · ตัวตัดสินงวดโมฆะ (installmentVoid) ตัดออกจากทะเบียน/ยอดเก็บแล้ว · route บังคับหมายเหตุ
   ⛔ **งวดปกติที่รับรองแล้ว/รอบัญชีตรวจยังบล็อก** — เงินที่รับในระบบหลังอนุมัติ · ใบย้อนหลังไม่มีทางยก/คืนเงิน (0378 เปิดเฉพาะ
      ใบ pipeline) และล็อกทั้งใบ (historicalInstallmentLock) ปิดทุกคำสั่งของใบที่ยกเลิก ⇒ ยกเลิกทับ = เงินค้างถาวร
      · ไม่ใช่ทางตัน: ใบยังอนุมัติอยู่ บัญชีตีกลับได้ตามปกติ แล้วค่อยยกเลิก
      🐞 review 25/09: งวดที่รับรองแล้วต้องบอก **สองขั้น** "ถอนคำรับรองแล้วตีกลับ" — ถอนคำรับรองพาแถวกลับไป "รอตรวจ" (unconfirm →
         reported) ซึ่งยังบล็อก และตีกลับรับเฉพาะแถวที่รอตรวจ ⇒ คำเดิม "ถอนคำรับรองก่อน แล้วค่อยยกเลิก" พาผู้จัดการติดด่านรอบสอง
   ⚠️ **ฝั่งจอเป็นคำใบ้ ไม่ใช่ตัวตัดสิน** — งวดของจอมาจาก `order.installments` ซึ่ง loadOrder กลืนการอ่านพัง
      เป็นรายการว่าง (= ด่านเปิดเงียบ) ส่วน route อ่านงวดสดแบบโยน error ⇒ ห้ามเอาค่าฝั่งจอไปแทนการตรวจที่ route
      และโมดัลยกเลิกต้องโชว์ error ของคำขอเองเสมอ (จอที่เปิดค้างไว้/บัญชีขยับงวดระหว่างนั้น)
   ⚠️ แถวเก่าที่ไม่มี `kind` = งวดปกติ (ค่าตั้งต้นของคอลัมน์ 0374) · ใบ pipeline คืน null เสมอ (เงินค้างอยู่กับใบ → ยก/คืน · PR3) */
export function historicalCancelBlock(order, installments = []) {
  if (!isHistoricalOrder(order)) return null;
  const held = (Array.isArray(installments) ? installments : [])
    .filter((row) => row && !isOpeningInstallment(row) && ['confirmed', 'reported'].includes(row.status));
  if (!held.length) return null;
  const confirmed = held.filter((row) => row.status === 'confirmed').length;
  const reported = held.length - confirmed;
  const counts = [confirmed ? `บัญชีรับรองแล้ว ${confirmed} งวด` : null, reported ? `รอบัญชีตรวจ ${reported} งวด` : null]
    .filter(Boolean).join(' · ');
  const fix = !confirmed ? 'ตีกลับ'
    : !reported ? 'ถอนคำรับรองแล้วตีกลับ'
      : 'ถอนคำรับรองแล้วตีกลับงวดที่รับรองแล้ว และตีกลับงวดที่รอตรวจ';
  return `มีงวดที่รับเงินในระบบหลังอนุมัติ (${counts}) — ให้บัญชี${fix}ก่อน แล้วค่อยยกเลิกใบ`;
}

/* งวดยกมาที่จะเป็นโมฆะเมื่อยกเลิกใบนี้ (มติ 24/09 · mig 0387) — `{ row, status, amount }` หรือ null
   · status 'confirmed' = บัญชีรับรองแล้ว (แถวคงไว้ · โมฆะตามกติกา installmentVoid) · 'reported' = ฐานตีกลับให้ตอนยกเลิก
   · งวดยกมาที่ยังไม่ขึ้นคิว (pending) / ถูกตีกลับไปแล้ว ไม่มีอะไรให้บอก = null
   ⭐ route ใช้ตัดสินหมายเหตุบังคับ + สรุป audit · จอใช้บอกผลก่อนกด (ตัวเดียวกัน) */
export function historicalCancelOpening(order, installments = []) {
  if (!isHistoricalOrder(order)) return null;
  const row = (Array.isArray(installments) ? installments : [])
    .find((item) => isOpeningInstallment(item) && ['confirmed', 'reported'].includes(item?.status));
  return row ? { row, status: row.status, amount: Number(row.amount) || 0 } : null;
}

/* ด่านความพร้อมของฐานก่อนยกเลิกทับงวดยกมาที่มีเงิน (review 25/09 · fail closed) — คืนข้อความไทย หรือ null
   🐞 route ปล่อยงวดยกมาที่รอตรวจให้ trigger ของ 0387 ตีกลับ · โค้ดขึ้น prod ก่อนรันมิกได้ (deploy อัตโนมัติวันละ 3 รอบไม่ถามมิก)
      ⇒ UPDATE ผ่านโดยไม่มีใครตีกลับ = งวดค้าง "รอตรวจ" บนใบที่ยกเลิกถาวร: ล็อกทั้งใบปิดปุ่มตีกลับของบัญชี · ทะเบียนบัญชีตัดแถวทิ้ง
      (installmentVoid) · ป้ายเมนูบัญชีนับ reported ดิบ +1 ตลอดไป · รันมิกทีหลังก็ไม่ซ่อม (trigger ยิงตอนเปลี่ยนสถานะเท่านั้น)
   ⇒ route ถาม RPC historical_so_cancel_settle_ready() ของ 0387 ก่อนเขียน — ฐานไม่ยืนยัน (`ready !== true`) = กติกาเดิมก่อนมติ 24/09
      (งวดยกมาที่มีเงินบล็อก) พร้อมบอกทางออกของบัญชี · งวดยกมาที่รับรองแล้วก็บล็อกด้วย: ด่านหมายเหตุของฐาน + ด่านแข่งกับบัญชี
      อยู่ใน trigger ตัวเดียวกัน — ไม่มี trigger = ไม่มีด่านพวกนั้น
   ⚠️ ไม่มีงวดยกมาที่มีเงิน (opening = null) = ผ่านเสมอ — สิทธิ์ยกเลิกเดิมก่อนมติ ห้ามถอด (มติ 24/09 "เพิ่ม ไม่ถอด")
   @param opening ผลของ historicalCancelOpening · @param ready ต้องเป็น true ตรง ๆ เท่านั้นถึงผ่าน */
export function historicalCancelSettleBlock(opening, ready) {
  if (!opening || ready === true) return null;
  const head = 'ฐานข้อมูลยังไม่ได้รัน migration 0387';
  return opening.status === 'confirmed'
    ? `${head} — ยกเลิกใบที่${OPENING_INSTALLMENT_LABEL}รับรองแล้วยังไม่ได้`
      + ` · แจ้งผู้ดูแลระบบ หรือให้บัญชีถอนคำรับรองแล้วตีกลับ${OPENING_INSTALLMENT_LABEL}ก่อน แล้วค่อยยกเลิกใบ`
    : `${head} — ยกเลิกใบที่${OPENING_INSTALLMENT_LABEL}รอบัญชีรับรองยังไม่ได้ (งวดจะค้างคิวบัญชีบนใบที่ยกเลิก)`
      + ` · แจ้งผู้ดูแลระบบ หรือให้บัญชีตีกลับ${OPENING_INSTALLMENT_LABEL}ก่อน แล้วค่อยยกเลิกใบ`;
}

/* งวดยกมาหลังยกเลิกจริง (review 25/09) — `{ row, status, amount, stuck }` หรือ null · route ใช้สรุป audit + คำตอบ (openingVoided)
   🐞 เดิมสรุปจากงวดที่อ่าน**ก่อน** UPDATE — บัญชีรับรองแทรกระหว่างอ่านกับเขียน = audit เขียน "รอรับรอง — ออกจากคิวบัญชี" ทั้งที่
      เงินที่รับรองแล้วโมฆะ ⇒ ตัดสินจากแถวที่อ่าน**หลัง**ยกเลิก (ค่าที่ trigger ของ 0387 ทิ้งไว้จริง):
      · confirmed → 'confirmed' (รับรองแล้ว — คงเป็นประวัติ · ผู้รับรองจากแถวหลัง) · rejected → 'reported' (อยู่คิวบัญชีตอนยกเลิก แล้วถูกตีกลับตามใบ)
      · ยัง reported → 'reported' + stuck (trigger ไม่ทำงาน — route เตือนดัง)
      · อ่านหลังยกเลิกไม่ขึ้น/หาแถวไม่เจอ → ค่าก่อนเขียน (ไม่เดาว่าค้าง)
   @param opening ผลของ historicalCancelOpening (อ่านก่อนเขียน) · @param afterRows งวดทั้งใบที่อ่านหลังยกเลิก (หรือ null) */
export function historicalOpeningSettled(opening, afterRows) {
  if (!opening) return null;
  const after = (Array.isArray(afterRows) ? afterRows : []).find((row) => row?.id === opening.row?.id) || null;
  if (!after) return { row: opening.row, status: opening.status, amount: opening.amount, stuck: false };
  const amount = Number(after.amount) || 0;
  if (after.status === 'confirmed') return { row: after, status: 'confirmed', amount, stuck: false };
  if (['rejected', 'reported'].includes(after.status)) {
    return { row: after, status: 'reported', amount, stuck: after.status === 'reported' };
  }
  return { row: after, status: opening.status, amount, stuck: false };
}

/* หมายเหตุบังคับเมื่อยกเลิกใบที่งวดยกมารับรองแล้ว (มติ 24/09) — เงินที่บัญชีรับรองออกจากทะเบียนบัญชีโดยไม่มีกระดิ่ง
   ⇒ ต้องมีร่องรอยว่าทำไมในประวัติ (หมายเหตุลง cancelReason ของใบ + audit ของงวด) · นับแบบ Postgres length()
   ⭐ route กับโมดัลถามตัวนี้ตัวเดียว · คืนข้อความไทย หรือ null */
export const HISTORICAL_CANCEL_NOTE_MIN = 10;
export function historicalCancelNoteError(order, installments = [], note = '') {
  if (historicalCancelOpening(order, installments)?.status !== 'confirmed') return null;
  if (charLength(String(note ?? '').trim()) >= HISTORICAL_CANCEL_NOTE_MIN) return null;
  return `ยกเลิกใบที่งวดยกมารับรองแล้วต้องระบุหมายเหตุอย่างน้อย ${HISTORICAL_CANCEL_NOTE_MIN} ตัวอักษร (บัญชีเห็นในประวัติ)`;
}

/* เลขเอกสารเดิม (ใบเสนอราคาเดิม · Express · ใบกำกับ) — ช่องค้นหา/หัวใบ/audit ใช้ชุดเดียวกัน */
export const historicalRefsOf = (order) => [
  order?.historicalQuoteRef, order?.historicalExpressRef, order?.historicalInvoiceRef,
].map((ref) => String(ref ?? '').trim()).filter(Boolean);

/* id ของใบที่ RPC ออกให้จากรหัสการคีย์ — `'SOR-H' || substr(md5(p_intake_key), 1, 16)` (เทสต์เทียบ SQL)
   ⚠️ รับ md5 hex ที่คำนวณแล้ว — ไฟล์นี้ไม่มี crypto (ฝั่ง client import ได้) */
export const historicalOrderIdOf = (md5Hex) => `SOR-H${String(md5Hex).slice(0, 16)}`;

/* ความยาวแบบ Postgres `length()` = นับตัวอักษร ไม่ใช่หน่วย UTF-16 */
export const charLength = (value) => [...String(value ?? '')].length;

/* 🚫 ตัวตรวจ "ชื่อจุดติดตั้ง" ที่คนพิมพ์เองถูกถอดแล้ว (มติ 22/09) — ไม่มีจอไหนให้พิมพ์ชื่อจุดอีก
   ชื่อจุดมาจากทะเบียนไซต์/โซนตอนคีย์ใบ (`zonePointOf` ตัดที่ `INSTALLATION_POINT_MAX` เอง)
   ⚠️ คอลัมน์และ CHECK `sales_order_lines_installation_point_len` ของ 0360 ยังอยู่ในฐาน — ค่าคงที่ข้างบน
      จึงยังต้องตรงกับ SQL (historicalOrders.test.mjs อ่านไฟล์เทียบ) */

/* error จากฐานที่แปลว่า "ยังไม่ได้รัน 0360" — คอลัมน์ไม่มี (42703 · PGRST204) หรือ RPC ไม่มี (PGRST202) */
export function historicalSchemaMissing(error) {
  if (!error) return false;
  const code = String(error.code || '');
  if (['42703', 'PGRST202', 'PGRST204', '42883'].includes(code)) return true;
  const text = `${error.message || ''} ${error.details || ''}`;
  return /Could not find the function|column .* does not exist/i.test(text);
}

/**
 * ด่านลบใบย้อนหลังแบบปกติ (ไม่บังคับ) — ลบได้เฉพาะตอนยังไม่มีอะไรปลายน้ำผูกอยู่ (= ทาง undo ของผู้คีย์)
 * คืนข้อความไทยเมื่อลบไม่ได้ หรือ null · ใบ pipeline คืน null เสมอ (ด่านเดิมของมันจัดการเอง)
 * ⭐ 0374: รอบขายของโซนเกิดตอน AE Sup อนุมัติ (ไม่ใช่ TS ผูกทีหลังแล้ว) ⇒ มี term = เปิดโซนให้ TS แล้ว
 * ⚠️ ทางบังคับลบ (force) ไม่ผ่านตัวนี้ — พรีวิวของ forceDelete นับรอบขายของโซนให้เห็นก่อนแล้ว
 */
export function historicalDeleteBlock({ order, terms = [], plans = [] } = {}) {
  if (!isHistoricalOrder(order)) return null;
  const force = 'ลบแบบปกติไม่ได้: ดูผลกระทบด้วยพรีวิว แล้วใช้บังคับลบ';
  if (terms?.length) return `เปิดโซนให้ TS แล้ว ${terms.length} โซน — ${force}`;
  if (plans?.length) return `มีรอบบริการผูกกับใบนี้ ${plans.length} รอบ — ${force}`;
  const installments = Array.isArray(order.installments) ? order.installments : [];
  const confirmed = installments.filter((row) => row?.status === 'confirmed').length;
  if (confirmed) return `มีงวดที่บัญชีคอนเฟิร์มแล้ว ${confirmed} งวด — ต้องให้บัญชีจัดการก่อน`;
  const invoiced = installments.filter((row) => String(row?.taxInvoiceNo ?? '').trim()).length;
  if (invoiced) return `มีงวดที่บันทึกใบกำกับภาษีแล้ว ${invoiced} งวด — ${force}`;
  return null;
}

/**
 * ด่าน PATCH ของดีลภาชนะ — ช่องที่ CHECK `sales_deals_historical_shape` ตรึงไว้ ตีกลับเป็นไทยก่อนถึงฐาน
 * ⭐ ย้ายเจ้าของ (ownerId) และเปลี่ยนทีมเป็นทีมที่มีจริง **ทำได้** (คำตอบข้อ 4 — ด่านสิทธิ์อยู่ที่ route)
 * คืนข้อความไทย หรือ null · ดีล pipeline คืน null เสมอ
 */
export function historicalDealPatchError(before, body = {}) {
  if (!isHistoricalDeal(before) || !body || typeof body !== 'object') return null;
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  if (has('customerId') && String(body.customerId ?? '').trim() !== String(before.customerId ?? '').trim()) {
    return 'ดีลของใบสั่งขายย้อนหลังเปลี่ยนลูกค้าไม่ได้ — คีย์ใบใหม่กับลูกค้าที่ถูกต้องแทน';
  }
  if (has('line') && String(body.line ?? '').trim() !== '' && String(body.line).trim().toUpperCase() !== 'SERVICE') {
    return 'ดีลของใบสั่งขายย้อนหลังเป็นสายบริการเสมอ — เปลี่ยนสายธุรกิจไม่ได้';
  }
  for (const key of ['dealType', 'projectType']) {
    if (has(key) && String(body[key] ?? '').trim().toUpperCase() !== 'RE-ORDER') {
      return 'ดีลของใบสั่งขายย้อนหลังเป็นประเภท RE-ORDER เสมอ — เปลี่ยนประเภทดีลไม่ได้';
    }
  }
  if (has('team') && !String(body.team ?? '').trim()) {
    return 'ดีลของใบสั่งขายย้อนหลังต้องมีทีมเสมอ';
  }
  return null;
}

/* 409 ของการย้ายเจ้าของดีลภาชนะไปหา AE ที่มีดีลภาชนะของลูกค้ารายเดียวกันอยู่แล้ว (คำตอบข้อ 4)
   ⚠️ P1 ไม่รวมดีล — บอกให้ชัดว่าติดเพราะอะไร ไม่ใช่ "บันทึกไม่สำเร็จ" ลอย ๆ */
export function historicalOwnerTakenMessage(ownerName, dealCode) {
  const who = String(ownerName || '').trim() || 'AE คนนั้น';
  const which = String(dealCode || '').trim();
  return `ลูกค้านี้มีดีลของใบสั่งขายย้อนหลังของ ${who} อยู่แล้ว${which ? ` (${which})` : ''} — `
    + 'ย้ายเจ้าของมารวมกันไม่ได้ (ระบบยังไม่รวมดีล) · เลือก AE คนอื่น หรือแจ้งผู้ดูแลระบบ';
}
