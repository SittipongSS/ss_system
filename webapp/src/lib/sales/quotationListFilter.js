// ตัวตัดสินของตารางรายการใบเสนอราคา (/sa/quotations) — ตัวเดียวที่ทั้งตารางและแถบ "Won ยังไม่ออก SO" ใช้
//
// ตรวจตัวเลข M16 (2026-10-20): เลขบนแถบ "ใบเสนอราคา Won n ใบยังไม่ได้ออก ใบสั่งขาย" ต้องเท่าแถวที่กด
// "ดูเฉพาะใบที่ค้าง" แล้วได้ · เดิมเงื่อนไขทั้งหมดเขียนในหน้า เทสต์ได้แค่จับข้อความในซอร์ส/ลอกเงื่อนไขไปไว้ในเทสต์
// ⇒ ย้ายมาเป็นฟังก์ชันบริสุทธิ์ที่หน้าเรียกตรง ๆ แล้วเทสต์พฤติกรรมกับตัวจริง (ไม่แตะ DB)
import { quotesAwaitingSalesOrder } from '@/lib/sales/handoffQueue';
import { dealTypeOf } from '@/lib/salesPlanning';

/**
 * ใบ Won ที่ยังไม่มี SO ที่ใช้งานอยู่ (id) — ตัวตัดสินกลาง `quotesAwaitingSalesOrder` (ตรง migration 0169)
 * 🔴 `salesOrders` ที่ไม่ใช่อาร์เรย์ (null = กำลังโหลด / โหลดพัง / ได้ของแปลก) = **ยังไม่รู้** ⇒ ชุดว่าง
 *    🐞 M16c เดิมตั้งต้นเป็น `[]` แล้วตัดสินเลย ⇒ แถบนับใบ Won ทุกใบ (วูบทุกครั้งที่เปิดหน้า · ค้างถาวรเมื่อโหลด SO พัง)
 *    `[]` ที่โหลดสำเร็จ = รู้แล้วว่าไม่มี SO สักใบ ⇒ ใบ Won ทุกใบค้างจริง
 */
export function awaitingSalesOrderIdSet(quotations, salesOrders) {
  if (!Array.isArray(salesOrders)) return new Set();
  return new Set(
    quotesAwaitingSalesOrder({ quotations: quotations || [], salesOrders }).map((quote) => quote.id),
  );
}

/** ตัวกรองว่างทั้งชุด — รูปเดียวกับที่หน้าส่งเข้า `quotationPassesListFilters` */
export const EMPTY_QUOTATION_FILTERS = Object.freeze({
  query: '', status: Object.freeze([]), type: Object.freeze([]), owner: Object.freeze([]),
  waitingOnMe: false, pendingSo: false,
});

/**
 * ปุ่ม "ดูเฉพาะใบที่ค้าง" บนแถบ = ตัวกรองชุดนี้ **ทั้งชุด** (แทนที่ ไม่ใช่เติม · ล้างคำค้น + "รอฉันลงมือ" ด้วย)
 * 🐞 M16a เดิมสลับธงอย่างเดียว — มาจากป้ายเมนู (`?count=quotations` = "รอฉันลงมือ") แล้วกด ได้ 0 แถวทุกครั้ง
 *    (ใบ accepted ไม่มีวันรอใครลงมือ) · สถานะ/ประเภท/ผู้ดูแล/คำค้นที่ค้างก็ทำให้เหลือน้อยกว่าเลขบนแถบ
 */
export const QUOTATION_AWAITING_SO_PICK = Object.freeze({ ...EMPTY_QUOTATION_FILTERS, pendingSo: true });

/**
 * แถวนี้ผ่านตัวกรองของตารางไหม — ลำดับและเงื่อนไขเดียวกับที่ตารางใช้ (หน้าเรียกตัวนี้ตรง ๆ)
 * @param filters { query, status[], type[], owner[] (ownerId), waitingOnMe, pendingSo }
 * @param ctx { awaitingIds: Set (จาก awaitingSalesOrderIdSet), ownerNameOf(row) — ชื่อผู้ดูแลที่ตาเห็นบนแถว }
 */
export function quotationPassesListFilters(row, filters = EMPTY_QUOTATION_FILTERS, { awaitingIds, ownerNameOf } = {}) {
  const f = { ...EMPTY_QUOTATION_FILTERS, ...(filters || {}) };
  if (f.waitingOnMe && !row._waitingOnMe) return false;
  if (f.pendingSo && !(awaitingIds && awaitingIds.has(row.id))) return false;
  if (f.status.length && !f.status.includes(row.status)) return false;
  if (f.type.length && !f.type.includes(dealTypeOf(row.deal))) return false;
  if (f.owner.length && !f.owner.includes(row.deal?.ownerId || '')) return false;
  const q = String(f.query || '').trim().toLowerCase();
  if (!q) return true;
  /* ⚠️ ค้นจากสิ่งที่ตาเห็นบนแถว — รหัส AR โผล่บนจอแล้ว จึงต้องค้นเจอด้วย
     ⭐ ข้อยกเว้นเดียว: `referenceNote` (เอกสารอ้างอิง · mig 0267) ไม่ได้อยู่บนแถว
     แต่ต้องค้นเจอ — มันคือที่ที่เลข PO ของลูกค้าถูกพิมพ์ลงไป และคำถามที่เข้ามาจริง
     คือ "อ้างถึง PO นี้ ใบไหน" (กติกาเดียวกับตารางรายการ SO · IS-26080017) */
  const ownerName = typeof ownerNameOf === 'function' ? ownerNameOf(row) : row.deal?.ownerName;
  return [row.quoteNumber, row.customerName, row.customerArCode, row.deal?.title, ownerName, row.referenceNote]
    .some((v) => String(v || '').toLowerCase().includes(q));
}
