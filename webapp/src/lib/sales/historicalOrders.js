// ── ใบสั่งขายย้อนหลัง (SO ย้อนหลัง · mig 0360) — ค่าคงที่ + ตัวตัดสินกลาง ────────────
//
// ⭐ มติผู้ใช้ 14/09/2026 ข้อ 1–21 + คำตอบคำถามเปิดของแผน P1 (15/09/2026)
//   · ตารางเดียว + ธง `origin` ('pipeline' | 'historical') บน sales_orders และ sales_deals
//   · เก็บยอดจริงไว้ในใบ แล้ว **กรองที่ตัวคำนวณ** — ใบย้อนหลังไม่นับ Actual / FC / เป้า
//   · ดีลภาชนะ 1 ใบต่อ (ลูกค้า × AE) · AE บังคับ (คำตอบข้อ 1) · ย้ายเจ้าของทีละใบ (คำตอบข้อ 4)
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
export const EXEMPT_REASON_MIN = 10;            // sales_orders_payment_gate_exempt_sane
export const EXEMPT_REASON_MAX = 500;
export const DOC_DATE_MIN = '2000-01-01';       // วันที่ของงวด/ใบ (0245 · 0320)
export const DOC_DATE_MAX = '2100-12-31';

export const ZERO_VALUE_EXEMPT_REASON = 'ใบย้อนหลังยอด 0 บาท — ไม่มีเงินให้เก็บ ยกเว้นด่านเงินอัตโนมัติ';
export const HISTORICAL_STATUS_NOTE = 'ใบสั่งขายย้อนหลัง · ไม่นับ Actual / FC / เป้า';
/* ชื่อดีลภาชนะ — ⚠️ ห้ามคำว่า "ดีลเก่า" (ข้อ 19: คำนั้นเป็นของสวิตช์ในฟอร์มดีล · metadata.legacy) */
export const HISTORICAL_DEAL_TITLE = (customerName) => `งานบริการย้อนหลัง · ${customerName || 'ไม่ระบุลูกค้า'}`;

/* ฐานข้อมูลยังไม่ได้รัน 0360 — ข้อความเดียวทุกเส้นที่แตะคอลัมน์/RPC ของไฟล์นั้น */
export const HISTORICAL_SCHEMA_MISSING_MESSAGE = 'ฐานข้อมูลยังไม่ได้รัน migration 0360 (ใบสั่งขายย้อนหลัง) — แจ้งผู้ดูแลระบบ';

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

/* คีย์ใบย้อนหลัง · ยกเว้นด่านเงิน · คีย์งวดเพิ่ม · ย้ายเจ้าของดีลภาชนะ = AE Supervisor หรือ Admin
   ⚠️ เทียบ role ตรง ๆ ไม่ใช่ isSuperuser (แพตเทิร์น canApproveExternalContract) และตรงกับ literal
      ใน RPC ของ 0360 (`p_actor_role NOT IN ('ae_supervisor', 'admin')`) */
export const canKeyHistoricalSalesOrder = (user) => user?.role === 'ae_supervisor' || user?.role === 'admin';

/* ด่านเงินของนัดบริการ (visitGate ขั้น ②) ยกเว้นให้ใบนี้ไหม — ต้องเป็นใบย้อนหลังด้วยเสมอ
   (CHECK ของ 0360 ห้ามใบ pipeline มีร่องรอยยกเว้นอยู่แล้ว · ตรงนี้กันอีกชั้นเผื่อข้อมูลปลอม) */
export const historicalGateExempt = (order) => isHistoricalOrder(order) && Boolean(order?.paymentGateExemptAt);

/* เลขเอกสารเดิม (ใบเสนอราคาเดิม · Express · ใบกำกับ) — ช่องค้นหา/หัวใบ/audit ใช้ชุดเดียวกัน */
export const historicalRefsOf = (order) => [
  order?.historicalQuoteRef, order?.historicalExpressRef, order?.historicalInvoiceRef,
].map((ref) => String(ref ?? '').trim()).filter(Boolean);

/* id ของใบที่ RPC ออกให้จากรหัสการคีย์ — `'SOR-H' || substr(md5(p_intake_key), 1, 16)` (เทสต์เทียบ SQL)
   ⚠️ รับ md5 hex ที่คำนวณแล้ว — ไฟล์นี้ไม่มี crypto (ฝั่ง client import ได้) */
export const historicalOrderIdOf = (md5Hex) => `SOR-H${String(md5Hex).slice(0, 16)}`;

/* ความยาวแบบ Postgres `length()` = นับตัวอักษร ไม่ใช่หน่วย UTF-16 */
export const charLength = (value) => [...String(value ?? '')].length;

/** เหตุผลยกเว้นด่านเงิน — คืนข้อความไทยเมื่อผิด หรือ null */
export function exemptReasonError(reason) {
  const n = charLength(String(reason ?? '').trim());
  if (n < EXEMPT_REASON_MIN || n > EXEMPT_REASON_MAX) {
    return `กรุณาระบุเหตุผลที่ยกเว้นด่านเงิน ${EXEMPT_REASON_MIN}–${EXEMPT_REASON_MAX} ตัวอักษร`;
  }
  return null;
}

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
 * ⚠️ ทางบังคับลบ (force) ไม่ผ่านตัวนี้ — พรีวิวของ forceDelete นับรอบขายของโซนให้เห็นก่อนแล้ว
 */
export function historicalDeleteBlock({ order, terms = [], plans = [] } = {}) {
  if (!isHistoricalOrder(order)) return null;
  const force = 'ลบแบบปกติไม่ได้: ดูผลกระทบด้วยพรีวิว แล้วใช้บังคับลบ';
  if (terms?.length) return `TS ผูกโซนแล้ว ${terms.length} จุด — ${force}`;
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
