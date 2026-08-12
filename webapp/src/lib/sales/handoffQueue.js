// คิว "รอยต่อเอกสาร" — จุดที่ระบบส่งไม้ต่อจากใบหนึ่งไปอีกใบ แล้วไม่มีอะไรคอยทวง
//
//   ใบเสนอราคา Won  ──▶  Sale Order  ──▶  ใบยื่นชำระภาษีสรรพสามิต
//
// สองลูกศรนี้เป็น manual ล้วน: ไม่มีสถานะ "ค้าง" ในตารางไหนเลย ของที่ยังไม่ถูกกด
// จึงไม่ปรากฏในคิวใด ต้องมีคนจำเอง. ไฟล์นี้คือ "ตัวตัดสินกลาง" ที่ทุกจุดต้องใช้ร่วมกัน
// (การ์ดแดชบอร์ด · แถบเตือนหน้ารายการ · การ์ดสรุปเช้าเข้า Google Chat) เพื่อไม่ให้
// ตัวเลขบนแต่ละหน้าเพี้ยนหากัน — ฟังก์ชันทุกตัวในนี้บริสุทธิ์ ไม่แตะ DB
import { countBusinessDays } from '@/lib/pm/dateHelpers';
import { businessDayKey } from '@/lib/datePeriods';

// ── ลูกศรที่ 1: Won → Sale Order ────────────────────────────────────────
// ⚠️ นิยาม "SO ที่ยังมีชีวิต" ต้องตรงกับด่านใน migration 0169 (create_sales_order_draft)
// เป๊ะ ๆ:  status <> 'cancelled' AND "supersededById" IS NULL
//   * cancelled            = ตายแล้ว ออกใบใหม่จาก QT เดิมได้ (นี่คือสิ่งที่ 0169 ปลดล็อก)
//   * supersededById ไม่ว่าง = ถูกแทนที่ด้วย Rev. ถัดไป ตัวที่มีชีวิตคือฉบับ Rev.
// สองที่นี้เพี้ยนกันเมื่อไหร่ คิวจะโกหกทันที: เข้มกว่า DB = ซ่อนใบที่กดได้จริง,
// หลวมกว่า DB = ชวนให้กดแล้วเด้ง 409 "QT ใบนี้มี Sale Order แล้ว"
export const isLiveSalesOrder = (order) => !!order
  && order.status !== 'cancelled'
  && !order.supersededById;

// ใบเสนอราคาที่ลูกค้ารับแล้ว (Won) แต่ยังไม่มี Sale Order ที่ใช้งานอยู่
export function quotesAwaitingSalesOrder({ quotations = [], salesOrders = [] } = {}) {
  const covered = new Set(
    salesOrders.filter(isLiveSalesOrder).map((order) => order?.quotationId).filter(Boolean),
  );
  return quotations.filter((quote) => quote?.status === 'accepted' && !covered.has(quote.id));
}

// ── ลูกศรที่ 2: Sale Order อนุมัติ → ใบยื่นชำระภาษี ──────────────────────
// เงื่อนไขเดียวกับด่านใน POST /api/tax/orders/from-sales-order: ต้องอนุมัติแล้ว และ
// ยังไม่มีแถวใน orders ที่ผูก salesOrderId นี้ (unique index กันไว้ว่า 1 SO = 1 ใบยื่น)
//
// ⚠️ ผู้เรียกต้องกรอง "มีสินค้าสรรพสามิตให้ยื่นจริง" ด้วย resolveSoFiling().eligible
// ก่อนส่งเข้ามา ไม่งั้น SO ที่ขายของไม่ใช่สรรพสามิตจะค้างคิวตลอดกาล (ไม่มีวันเคลียร์)
export function salesOrdersAwaitingFiling({ salesOrders = [], filings = [] } = {}) {
  const filed = new Set(filings.map((filing) => filing?.salesOrderId).filter(Boolean));
  return salesOrders.filter((order) => order?.status === 'approved'
    && !order.supersededById
    && !filed.has(order.id));
}

// ── อายุของงานค้าง (วันทำการ) ───────────────────────────────────────────
// วันที่ตามเวลาไทย — server รันที่ UTC ถ้าตัดสตริงตรง ๆ งานที่กดตอนเย็นวันจันทร์
// (= เช้าวันจันทร์ UTC) จะถูกนับเป็นคนละวันกับที่คนไทยเห็นบนหน้าจอ
/* ⚠️ นาฬิกาเดียวของทั้งระบบคือ `businessDayKey` — ตัวนี้เป็นแค่เปลือกที่คงสัญญาเดิม
   (คืน '' แทน null ให้ผู้เรียกเก่าที่เทียบสตริง) ห้ามคำนวณวันเองซ้ำที่นี่
   ของเดิมใช้ Intl/ICU ซึ่งให้คำตอบเดียวกันก็จริง แต่เป็นนาฬิกาเรือนที่สอง — พอมีสองเรือน
   ก็มีวันที่มันเดินไม่ตรงกัน (เจอมาแล้วรอบนี้: SLA ใช้วัน UTC ส่วนการ์ดค้างคิวใช้วันไทย)
   และ datePeriods เลือกไม่พึ่ง ICU ตั้งแต่แรกเพราะบาง runtime มีข้อมูลโซนไม่ครบ */
export function bangkokDate(value) {
  return businessDayKey(value) || '';
}

// จำนวนวันทำการที่รอมาแล้ว (ข้ามเสาร์-อาทิตย์ + วันหยุดตามปฏิทินที่ตั้งไว้)
// นับจากวันที่เข้าคิว ไม่นับวันนั้น: กด Won บ่ายวันจันทร์ → เช้าวันอังคาร = 1
// ปลูกเป็นวันที่ล้วน (ตัดเวลาทิ้ง) เพราะ countBusinessDays เทียบ Date เต็มดวง —
// ถ้าเหลือเวลาติดมา 10:00 vs 08:30 จะได้ 0 ทั้งที่ข้ามวันไปแล้ว
export function businessDaysWaiting(since, asOf, holidays) {
  const from = bangkokDate(since);
  const to = bangkokDate(asOf);
  if (!from || !to) return 0;
  return countBusinessDays(new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`), holidays);
}

// คัดเฉพาะรายการที่ค้างนานพอจะเตือน — มติผู้ใช้ 2026-07-28: การ์ดสรุปเช้าเตือนเมื่อ
// ค้างเกิน 1 วันทำการ (ปิดดีลวันนี้แล้วพรุ่งนี้เช้ายังไม่โดนทวง) ส่วนการ์ดบนแดชบอร์ด
// แสดงทุกใบไม่มีเกณฑ์อายุ เพราะมันคือคิวงานสด ไม่ใช่คำเตือน
export function agedAtLeast(rows = [], { sinceOf, asOf, holidays, minBusinessDays = 1 } = {}) {
  return rows.filter((row) => businessDaysWaiting(sinceOf(row), asOf, holidays) >= minBusinessDays);
}
