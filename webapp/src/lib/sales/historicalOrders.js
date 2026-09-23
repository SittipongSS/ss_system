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
//
// ⚠️ **ไฟล์นี้ไม่มี import โดยเจตนา** — dashboardMetrics · serviceContractLink · contracts ·
//    จอฝั่ง client import ได้หมดโดยไม่ลากของ server ติดมา
// 🔴 **literal 'historical' และตัวกรอง `.eq('origin', …)` มีบ้านเดียวคือไฟล์นี้** — ตัวอ่านที่อื่น
//    ใช้ `pipelineRowsOnly` / `historicalRowsOnly` / `isHistoricalOrder` / `isHistoricalDeal` เท่านั้น
//    (สะกดผิดที่เดียว = ตัวกรองว่างเงียบ ๆ แล้วยอดย้อนหลังไหลเข้า KPI)

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

/* ทางแก้หลังอนุมัติ (ข้อมูลที่ AE Sup อนุมัติไปแล้วผิด — ยอด · ช่วงครอบ · โซน) — ทุกทางตันพูดประโยคนี้ประโยคเดียว
   (บัญชีตีกลับงวดยกมา · ถอนงวดยกมาไม่ได้ · ล็อกงวด) · ฐานยกเลิกเอกสารแทนสัญญาตามใบเอง (trigger ของ 0374) */
export const HISTORICAL_CORRECTION_PATH = 'ข้อมูลที่อนุมัติแล้วผิด → AE Sup ยกเลิกใบ แล้วฝ่ายขายคีย์ใหม่ (เอกสารแทนสัญญาถูกยกเลิกตาม)';

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
   ⭐ **ผู้คีย์ ≠ ผู้อนุมัติ** — คีย์ = ฝ่ายขายทุกตำแหน่ง + Admin · อนุมัติ = isSalesOrderReviewer (AE Sup/Admin)
   ⚠️ เทียบ role ตรง ๆ ไม่ใช่ isSuperuser (แพตเทิร์น canApproveExternalContract)
   !! ลำดับและสมาชิกต้องตรงกับ literal ใน RPC สร้าง/แก้/ส่ง ของ 0374
      (`p_actor_role NOT IN ('ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin')`) — historicalOrders.test เทียบไฟล์ SQL
   ⚠️ สิทธิ์ต่อใบ (AE/Senior AE คีย์ได้เฉพาะของตัวเอง · ทีมของดีลภาชนะ) ตัดสินที่ planHistoricalServiceOrder */
export const HISTORICAL_KEYER_ROLES = Object.freeze(['ae', 'ac', 'senior_ae', 'ae_supervisor', 'admin']);
export const canKeyHistoricalSalesOrder = (user) => HISTORICAL_KEYER_ROLES.includes(user?.role);

/* ย้ายเจ้าของดีลภาชนะ = AE Supervisor หรือ Admin เท่านั้น (คำตอบข้อ 4) — ดีลภาชนะถือใบย้อนหลังทุกใบของคู่
   (ลูกค้า × AE) ⇒ แคบกว่าผู้คีย์โดยเจตนา · แยกตัวออกมาตอนผู้คีย์ขยายเป็นฝ่ายขายทุกตำแหน่ง */
export const canMoveHistoricalDealOwner = (user) => user?.role === 'ae_supervisor' || user?.role === 'admin';

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
  return 'งวดของใบย้อนหลังขยับได้หลัง AE Sup อนุมัติ';
}

/* ด่านยกเลิกใบย้อนหลังที่มีงวด "แจ้งชำระแล้ว" รอบัญชีรับรอง — คืนข้อความไทย หรือ null
   ⭐ **ปุ่มยกเลิกกับ API ถามตัวเดียวกัน** — สองบ้านนี้เท่านั้น (ยาม source: historicalDetailUi.test.mjs §6A):
      · จอ: `app/sales-planning/sales-orders/[id]/page.js` → `historicalCancelBlocked` = disabledReason ของปุ่ม "ยกเลิก SO"
      · API: `app/api/sales-planning/sales-orders/[id]/route.js` action `cancel` → 400
   ⚠️ **ฝั่งจอเป็นคำใบ้ ไม่ใช่ตัวตัดสิน** — งวดของจอมาจาก `order.installments` ซึ่ง loadOrder กลืนการอ่านพัง
      เป็นรายการว่าง (= ด่านเปิดเงียบ) ส่วน route อ่านงวดสดแบบโยน error ⇒ ห้ามเอาค่าฝั่งจอไปแทนการตรวจที่ route
      และโมดัลยกเลิกต้องโชว์ error ของคำขอเองเสมอ (จอที่เปิดค้างไว้/บัญชีขยับงวดระหว่างนั้น)
   🐞 ยกเลิกทั้งที่งวดยังรอรับรอง = งวดค้างคิว "รอคุณรับรอง" + ป้ายเมนูของบัญชีตลอดไป — ล็อกข้างบนตอบ
      "ใบยกเลิกแล้ว" กับทุกคำสั่งรวมรับรอง/ตีกลับ ส่วนคิวกับป้ายนับจากสถานะงวดล้วน ไม่ดูสถานะใบ ⇒ ต้องแก้ที่ฐานเท่านั้น
   ⭐ ลำดับของทางแก้หลังอนุมัติ (HISTORICAL_CORRECTION_PATH): บัญชีตีกลับงวดก่อน แล้ว AE Sup ค่อยยกเลิกใบ
   ⚠️ งวดที่บัญชีรับรองแล้วเป็นของ paymentLockReason (ด่านเดิมของทุกใบ) ไม่ใช่ตัวนี้ · ใบ pipeline คืน null เสมอ */
export function historicalCancelBlock(order, installments = []) {
  if (!isHistoricalOrder(order)) return null;
  const waiting = (Array.isArray(installments) ? installments : []).filter((row) => row?.status === 'reported');
  if (!waiting.length) return null;
  const what = waiting.length === 1 && isOpeningInstallment(waiting[0])
    ? `${OPENING_INSTALLMENT_LABEL}รอบัญชีรับรองอยู่`
    : `มีงวดรอบัญชีรับรองอยู่ ${waiting.length} งวด`;
  return `${what} — ให้บัญชีตีกลับก่อน แล้วค่อยยกเลิกใบ`;
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
