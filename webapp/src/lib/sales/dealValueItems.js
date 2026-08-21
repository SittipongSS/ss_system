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
import { SALE_UNITS, VOLUME_UNITS, hasPackagingFields } from '@/lib/master/units';

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

    /* หน่วยขายต้องอยู่ในลิสต์กลาง (lib/master/units) — เดิมรับข้อความอิสระ ≤20 ตัว
       ⇒ ดรอปดาวน์เป็นสิ่งเดียวที่กันไว้ ยิง API ตรงใส่คำอะไรก็ได้ แล้วหน่วยบนดีลกับบน
       ใบเสนอราคาจะหลุดกันเงียบ ๆ (ใบเสนอราคาบังคับจากทะเบียนสินค้าอยู่แล้ว) */
    const unit = String(row.unit ?? '').trim();
    if (!unit) return { items: [], total: 0, error: `${at}: กรุณาระบุหน่วยขาย` };
    if (unit.length > UNIT_MAX) return { items: [], total: 0, error: `${at}: หน่วยขายยาวเกิน ${UNIT_MAX} ตัวอักษร` };
    if (!SALE_UNITS.includes(unit)) {
      return { items: [], total: 0, error: `${at}: หน่วยขาย "${unit}" ไม่อยู่ในลิสต์ (${SALE_UNITS.join(' · ')})` };
    }

    /* ปริมาตร = **ขนาดของหนึ่งหน่วยขาย** ("1 ชิ้น = 100 ml") ไม่เข้าสูตรคิดเงิน
       — คนละช่องกับ `unit` ข้างบนที่เป็นหน่วยนับขาย (กับดักที่ lib/master/units.js เตือน)
       ไม่บังคับ (งานบริการไม่มีปริมาตร) แต่กรอกขนาดแล้วต้องมีหน่วยเสมอ

       ⭐ **หมวดกลุ่ม 03/04 ไม่มีช่องนี้เลย** — กติกาเดียวกับทะเบียนสินค้า (mig 0277)
       แถวดีลถือ categoryCode ของตัวเองอยู่แล้ว จึงตัดสินรายแถวได้ · ล้างเงียบ ๆ ไม่ฟ้อง
       error เพราะแถวเก่าที่บันทึกไว้ก่อนกฎนี้ต้องยังเปิดดีลมาแก้เรื่องอื่นได้ */
    const packaging = hasPackagingFields(categoryCode);
    const volumeRaw = !packaging || row.volume === '' || row.volume == null
      ? null
      : Number(row.volume);
    if (volumeRaw !== null && (!Number.isFinite(volumeRaw) || volumeRaw <= 0)) {
      return { items: [], total: 0, error: `${at}: ปริมาตรต้องมากกว่า 0` };
    }
    const volumeUnit = packaging ? String(row.volumeUnit ?? '').trim() : '';
    if (volumeUnit.length > UNIT_MAX) {
      return { items: [], total: 0, error: `${at}: หน่วยปริมาตรยาวเกิน ${UNIT_MAX} ตัวอักษร` };
    }
    if (volumeUnit && !VOLUME_UNITS.includes(volumeUnit)) {
      return { items: [], total: 0, error: `${at}: หน่วยปริมาตร "${volumeUnit}" ไม่อยู่ในลิสต์ (${VOLUME_UNITS.join(' · ')})` };
    }
    if (volumeRaw !== null && !volumeUnit) {
      return { items: [], total: 0, error: `${at}: กรุณาเลือกหน่วยของปริมาตร` };
    }

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
      volume: volumeRaw,
      // ปริมาตรว่าง = ไม่มีหน่วยด้วย (CHECK ของ mig 0265 บังคับให้ไปด้วยกัน)
      volumeUnit: volumeRaw === null ? null : volumeUnit,
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
      volume: row.volume ?? '',
      volumeUnit: row.volumeUnit || '',
      qty: row.qty ?? '',
      unit: row.unit || '',
      unitPrice: row.unitPrice ?? '',
      note: row.note || '',
    }));
}
