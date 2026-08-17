/* ── มูลค่าคาดการณ์ของดีลแบบรายหมวดสินค้า (mig 0264 — มติผู้ใช้ 2026-08-17) ────
 *
 * คำสั่งตั้งต้น: หมวดสินค้าเลือกได้หลายรายการ · แต่ละรายการมีจำนวนกับราคาต่อหน่วย
 * คาดการณ์ · **มูลค่ารวมคิดอัตโนมัติ** (ช่องยอดรวมล็อก พิมพ์ทับไม่ได้)
 *
 * ไฟล์นี้เป็นสูตรกลางของทั้งสองฝั่ง — ฟอร์มใช้พรีวิวยอดระหว่างพิมพ์ · API ใช้ตอน
 * บันทึกจริง ห้ามคิดผลรวมเองที่อื่น ไม่งั้นเลขบนจอกับเลขในฐานเพี้ยนกันเงียบ ๆ
 * (บทเรียนเดียวกับ quoteTotals ของใบเสนอราคา)
 *
 * ⚠️ ยอดรวมที่คิดได้ต้องไปลง `sales_deals."projectValue"` เสมอ — ทั้งระบบอ่าน
 * คอลัมน์นั้นเป็น "มูลค่าคาดการณ์" (FC · แดชบอร์ด · ความแม่นยำ FC vs Actual)
 */

// จำนวนแถวสูงสุดต่อดีล — กันเพย์โหลดบวมและกันลูปติดในฟอร์ม (แนวเดียวกับ costing
// ที่จำกัด 30 รายการ) · ดีลที่มีมากกว่านี้คือใบเสนอราคา ไม่ใช่ประมาณการดีลแล้ว
export const DEAL_VALUE_ITEMS_MAX = 30;
export const DEAL_VALUE_ITEM_NOTE_MAX = 500;
const CATEGORY_CODE_RE = /^\d{2}-\d{3}$/;
const UNIT_MAX = 20;

// เงินสองตำแหน่ง — ปัดครั้งเดียวต่อแถว แล้วผลรวมค่อยบวกของที่ปัดแล้ว
// (ปัดทีหลังตอนรวม ทำให้ยอดรวมไม่ตรงกับผลบวกของตัวเลขที่ผู้ใช้เห็นรายแถว)
const money2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function dealValueLineAmount(qty, unitPrice) {
  const q = Number(qty);
  const p = Number(unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  return money2(q * p);
}

/* ผลรวมของรายการที่ผ่านการ normalize แล้ว (หรือร่างในฟอร์มที่ยังกรอกไม่ครบ —
   แถวที่อ่านเป็นตัวเลขไม่ได้นับเป็น 0 เพื่อให้ยอดพรีวิวเดินตามที่พิมพ์ไปทีละช่อง)
   ⚠️ ใช้ `amount` ของแถวถ้ามี — คิดใหม่จาก qty × unitPrice ที่ถูกปัดแล้วจะได้คนละ
   ยอดกับที่บันทึกไว้ (ราคาต่อหน่วยมีทศนิยมเกินสองตำแหน่งได้ เช่น 0.335) */
export function dealValueTotal(items = []) {
  return money2((items || []).reduce(
    (sum, item) => sum + (Number.isFinite(Number(item?.amount))
      ? Number(item.amount)
      : dealValueLineAmount(item?.qty, item?.unitPrice)),
    0,
  ));
}

/* แปลงร่างจากฟอร์มเป็นแถวที่บันทึกได้ + ยอดรวม
 *
 * คืน { items, total, error } — `error` เป็นข้อความไทยพร้อมโชว์ (ระบุเลขแถวเสมอ:
 * ฟอร์มหลายแถวถ้าไม่บอกแถว คนหาไม่เจอว่าผิดตรงไหน)
 *
 * ⚠️ ไม่ตรวจว่าหมวด "มีจริง/ยังไม่พักใช้" — นั่นต้องถามฐาน (activeProductTypeError)
 * ผู้เรียกฝั่ง server เป็นคนตรวจต่อ ที่นี่คุมแค่รูปร่างกับตัวเลข
 */
export function normalizeDealValueItems(raw) {
  if (raw == null) return { items: [], total: 0, error: null };
  if (!Array.isArray(raw)) return { items: [], total: 0, error: 'รายการมูลค่าคาดการณ์ต้องเป็นลิสต์' };
  if (raw.length > DEAL_VALUE_ITEMS_MAX) {
    return { items: [], total: 0, error: `รายการมูลค่าคาดการณ์เกิน ${DEAL_VALUE_ITEMS_MAX} แถว` };
  }

  const items = [];
  for (let index = 0; index < raw.length; index += 1) {
    const row = raw[index] || {};
    const at = `แถวที่ ${index + 1}`;
    const categoryCode = String(row.categoryCode ?? '').trim();
    if (!CATEGORY_CODE_RE.test(categoryCode)) return { items: [], total: 0, error: `${at}: กรุณาเลือกหมวดสินค้า` };

    const qty = Number(row.qty);
    if (!Number.isFinite(qty) || qty <= 0) return { items: [], total: 0, error: `${at}: จำนวนต้องมากกว่า 0` };

    const unitPrice = Number(row.unitPrice === '' || row.unitPrice == null ? 0 : row.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { items: [], total: 0, error: `${at}: ราคาต่อหน่วยต้องไม่ติดลบ` };
    }

    const unit = String(row.unit ?? '').trim();
    if (!unit) return { items: [], total: 0, error: `${at}: กรุณาระบุหน่วย` };
    if (unit.length > UNIT_MAX) return { items: [], total: 0, error: `${at}: หน่วยยาวเกิน ${UNIT_MAX} ตัวอักษร` };

    const note = String(row.note ?? '').trim();
    if (note.length > DEAL_VALUE_ITEM_NOTE_MAX) {
      return { items: [], total: 0, error: `${at}: หมายเหตุยาวเกิน ${DEAL_VALUE_ITEM_NOTE_MAX} ตัวอักษร` };
    }

    items.push({
      seq: index + 1,
      categoryCode,
      // ⚠️ ไม่ปัด qty/unitPrice — ราคาต่อหน่วยที่มีทศนิยมเกินสองตำแหน่ง (0.335) เป็น
      // ของจริงในงานกลิ่น · ปัดเฉพาะ `amount` ซึ่งเป็นเงินที่ต้องบวกกันได้ลงตัว
      qty,
      unit,
      unitPrice,
      amount: dealValueLineAmount(qty, unitPrice),
      note: note || null,
    });
  }

  return { items, total: dealValueTotal(items), error: null };
}

/* หมวด "ของดีล" เมื่อมีหลายแถว = หมวดของแถวแรก (มติผู้ใช้ 2026-08-17)
 * ใช้กรองขั้นตอนของ Workflow Template (categoryOnly/categoryExclude/flag:excise)
 * — ตัว template เลือกจาก **ประเภทดีล** ไม่ใช่หมวด (lib/sales/dealTimelineGen.js)
 * จึงไม่มีช่อง "หมวดหลัก" แยกในฟอร์ม: ผู้ใช้จัดลำดับแถวเอาเองได้ */
export function primaryCategoryCode(items = []) {
  return items?.[0]?.categoryCode || null;
}

// รายการที่มาจาก DB → ร่างของฟอร์ม (ตัด id/dealId ที่ฟอร์มไม่ใช้ออก)
export function dealValueItemsToForm(rows = []) {
  return (rows || [])
    .slice()
    .sort((a, b) => (a.seq || 0) - (b.seq || 0))
    .map((row) => ({
      categoryCode: row.categoryCode || '',
      qty: row.qty ?? '',
      unit: row.unit || '',
      unitPrice: row.unitPrice ?? '',
      note: row.note || '',
    }));
}
