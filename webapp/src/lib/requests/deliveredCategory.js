// ── พัฒนากลิ่น "ส่งเป็นอะไร" (ม-148 · มติผู้ใช้ 2026-09-22) ─────────────────
//
// ⭐ **ที่มา** — RD บางครั้งส่งงานพัฒนากลิ่นเป็นสินค้าสำเร็จเลย (SB-26080011 ส่งเป็น
// EDP · Body Perfume 01-002) แต่ระบบรู้จักแค่ "กลิ่น" ⇒ ราคาที่ RD ใส่ (ราคาเนื้อ EDP)
// เข้าทะเบียนเป็นราคาหัวน้ำหอม `RM_F` · วัดบน prod 2026-09-22: ราคา F 12 จาก 18 ตัว
// เป็นของสินค้าสำเร็จ ราคา FB มีตัวเดียวทั้งระบบ
//
// ⭐ **กติกา** (ถ้อยคำผู้ใช้: *"F คือกลิ่น(หัวน้ำหอม) / B คือเบส / FB คือ เบสที่ใส่กลิ่น"*)
//   · ส่งเป็น **หัวน้ำหอม (02-020)** = กลิ่นเข้าทะเบียนตัวเดียว → ราคา F บนกลิ่น
//   · ส่งเป็น **สินค้าหมวดอื่น** = กลิ่น + **สูตร (หมวดนั้น × กลิ่นนี้)** เกิดพร้อมกัน
//     → ราคา FB บนสูตร (ราคารวมกลิ่นแล้ว · direction เดียวได้ราคาเดียว)
//   · กลิ่นเกิด **เสมอ** — สูตรต้องมีกลิ่นเป็นแม่ (ตัวตนสูตร = หมวด × กลิ่น · mig 0207)
//     และวันหลังทำสินค้าหมวดอื่นจากกลิ่นเดิมต้องมีกลิ่นให้อ้าง
//
// ⚠️ ไฟล์นี้ไม่แตะ DB — จอ (ฟอร์มส่งงาน) กับ server (`normalizeDeliveryRows`) ถามตัวเดียวกัน
import { PDR_FRAGRANCE_OIL_CODE } from '@/lib/requests/pdrFields';
import { productCategoryCode } from '@/lib/master/productCategory';

/** หมวดที่แปลว่า "ส่งเป็นหัวน้ำหอม" — มีตัวเดียว (มติผู้ใช้ 2026-09-22: "02-020 อย่างเดียว") */
export const DELIVERED_FRAGRANCE_CODE = PDR_FRAGRANCE_OIL_CODE;

/** กลุ่มหลักที่ส่งเป็นสินค้าได้ — 01 ODM · 02 ธุรกิจบริการ (ถ้อยคำผู้ใช้: "เลือกได้เฉพาะ หมวด 01 และ 02") */
export const DELIVERY_MAIN_CATEGORIES = Object.freeze(['01', '02']);

/* ⚠️ **หมวดในกลุ่ม 01/02 ที่ไม่ใช่ "สินค้าที่มีสูตร"** — เครื่อง · อุปกรณ์ · ของประกอบชุด
   ส่งเป็นสินค้าพวกนี้ไม่ได้ เพราะไม่มีเนื้อให้ตั้งราคา FB
   · `02-001` ระบบกระจายกลิ่น SDS — มติผู้ใช้ 2026-09-22: **SDS ส่งเป็นหัวน้ำหอม** แล้วค่อยทำ
     สูตร 02-001 ทางพัฒนาสูตรเหมือนเดิม (ของจริงบน prod เดินแบบนี้ทุกใบ)
   ⚠️ ลิสต์นี้คัดจากชื่อหมวดในทะเบียน ณ 2026-09-22 — หมวดใหม่ที่เป็นเครื่อง/อุปกรณ์ต้องมาต่อที่นี่
   (ลืม = RD เลือกได้ แต่ไม่พังอะไร: ได้สูตรที่ไม่มีใครตั้งราคา) */
export const DELIVERY_EXCLUDED_CATEGORIES = Object.freeze([
  '02-001', // ระบบกระจายกลิ่น SDS (แพ็คเกจบริการ) — ส่งเป็นหัวน้ำหอม
  '02-024', // เครื่องกดสบู่ (ห้ามใช้ขายเฉพาะเครื่อง)
  '02-035', // เครื่อง SDS OV-08
  '01-034', // กระดาษทดสอบ (Blotting paper)
  '01-037', // ชุดของขวัญ — ประกอบจากสินค้าอื่นที่มีสูตรของตัวเอง
  '01-043', // ชุดแปรงสีฟัน + ยาสีฟัน
  '01-044', // Cotton bud
  '01-045', // ถุงทิ้งผ้าอนามัย
  '01-046', // หมวกอาบน้ำ
]);

const CATEGORY_CODE = /^\d{2}-\d{3}$/;

export const DELIVERED_AS_LABELS = Object.freeze({
  fragrance: 'หัวน้ำหอม (Fragrance Oil)',
  product: 'สินค้า — เลือกหมวด',
});

/** ส่งเป็นสินค้า (มีสูตร · ราคา FB) ไหม — ว่าง = ยังไม่ได้เลือก (หรือแถวเก่าก่อน ม-148) */
export function isDeliveredAsProduct(categoryCode) {
  const code = String(categoryCode ?? '').trim();
  return !!code && code !== DELIVERED_FRAGRANCE_CODE;
}

/** ทางที่เลือกบนปุ่มสองทาง — 'fragrance' | 'product' | '' (ยังไม่เลือก) */
export function deliveredAsOf(categoryCode, { productPending = false } = {}) {
  const code = String(categoryCode ?? '').trim();
  if (code === DELIVERED_FRAGRANCE_CODE) return 'fragrance';
  if (code || productPending) return 'product';
  return '';
}

/**
 * หมวดที่ให้เลือกเมื่อ "ส่งเป็นสินค้า" — กลุ่ม 01/02 ที่ใช้งานอยู่ ตัดหัวน้ำหอม (อยู่ปุ่มอีกทาง)
 * และเครื่อง/อุปกรณ์ออก · `currentCode` = ค่าที่เลือกไว้แล้ว ต้องยังอยู่ในลิสต์แม้ถูกปิดใช้ทีหลัง
 */
export function deliveryProductCategories(productTypes = [], currentCode = '') {
  return (productTypes || []).filter((row) => {
    const code = productCategoryCode(row);
    if (!code || code === DELIVERED_FRAGRANCE_CODE) return false;
    if (!DELIVERY_MAIN_CATEGORIES.includes(row.mainCategoryCode)) return false;
    if (DELIVERY_EXCLUDED_CATEGORIES.includes(code)) return false;
    return row.isActive !== false || code === currentCode;
  });
}

/**
 * ด่านหมวดที่ส่ง — คืนข้อความไทย หรือ null
 *
 * ⚠️ `productTypes` ว่าง (โหลดทะเบียนหมวดไม่ได้) = ตรวจได้แค่รูปแบบกับกลุ่ม · ไม่ปล่อยผ่านทั้งหมด
 */
export function deliveredCategoryError(categoryCode, productTypes = []) {
  const code = String(categoryCode ?? '').trim();
  if (!code) return 'ต้องเลือกว่าส่งเป็นหัวน้ำหอม หรือเป็นสินค้าหมวดไหน';
  if (code === DELIVERED_FRAGRANCE_CODE) return null;
  if (!CATEGORY_CODE.test(code)) return 'รหัสหมวดสินค้าไม่ถูกต้อง';
  if (!DELIVERY_MAIN_CATEGORIES.includes(code.slice(0, 2))) {
    return `ส่งเป็นสินค้าได้เฉพาะหมวด ${DELIVERY_MAIN_CATEGORIES.join(' และ ')}`;
  }
  if (DELIVERY_EXCLUDED_CATEGORIES.includes(code)) {
    return code === '02-001'
      ? 'ระบบกระจายกลิ่น (SDS) ให้ส่งเป็นหัวน้ำหอม แล้วทำสูตร 02-001 ผ่านคำร้องพัฒนาสูตร'
      : `หมวด ${code} เป็นเครื่อง/อุปกรณ์ ไม่มีสูตรให้ตั้งราคา — เลือกหมวดสินค้าที่มีเนื้อ`;
  }
  if ((productTypes || []).length) {
    const row = productTypes.find((t) => productCategoryCode(t) === code);
    if (!row) return `ไม่พบหมวด ${code} ในทะเบียนหมวดสินค้า`;
    if (row.isActive === false) return `หมวด ${code} ปิดใช้งานแล้ว`;
  }
  return null;
}

/**
 * ค่าตั้งต้นของ "ส่งเป็น" จาก PDR ข้อ 1.11 (`pdrProductKinds`) — เติมให้เฉพาะเมื่อใบขอไว้ **หมวดเดียว**
 *
 * ⭐ PDR เก็บรหัสชุดเดียวกับหมวดของแถว (ดู PdrForm) ⇒ ผู้ขอบอกไว้แล้วว่าอยากได้อะไร RD แค่ยืนยัน
 * (ของจริง: SB-26080011 ขอ 01-002 ไว้ตั้งแต่เปิดใบ แต่ไม่มีใครอ่านตอนส่ง)
 * · ขอ SDS (02-001) = ส่งเป็นหัวน้ำหอม (มติผู้ใช้ 2026-09-22)
 * · ขอหลายหมวด / หมวดที่ส่งเป็นสินค้าไม่ได้ = ไม่เดา ให้ RD เลือกเอง
 */
export function defaultDeliveredCategory(pdrProductKinds = [], productTypes = []) {
  const kinds = [...new Set((pdrProductKinds || []).map((k) => String(k ?? '').trim()).filter(Boolean))];
  if (kinds.length !== 1) return '';
  const [code] = kinds;
  if (code === DELIVERED_FRAGRANCE_CODE || code === '02-001') return DELIVERED_FRAGRANCE_CODE;
  return deliveredCategoryError(code, productTypes) ? '' : code;
}

/**
 * คำเตือนบนปุ่ม "ใส่ราคา F" ของทะเบียนกลิ่น — คืนข้อความ หรือ null เมื่อไม่มีอะไรต้องเตือน
 *
 * ⭐ ปุ่มนี้คือทางที่ราคาเนื้อ EDP เข้ามาเป็นราคาหัวน้ำหอมมากที่สุด (14 จาก 18 ราคา F บน prod) ·
 * **เตือน ไม่บล็อก** — ลูกค้าซื้อหัวน้ำหอมแยกได้จริง และ SDS ตั้งราคา F บนกลิ่นที่มีสูตร 02-001 เป็นปกติ
 * `scent` ต้องผ่าน `findScentDetail` มาแล้ว (มี `deliveredCategoryCode` · `formulas`)
 */
export function scentFPriceNotice(scent) {
  const formulas = (scent?.formulas || []).filter((f) => f && f.status !== 'archived');
  const codes = formulas.map((f) => f.code || f.name).filter(Boolean);
  const tail = 'ราคาเนื้อสินค้า (FB · เบสที่ใส่กลิ่น) ใส่ที่หน้าสูตร — ช่องนี้คือราคาหัวน้ำหอมล้วน (F)';
  if (isDeliveredAsProduct(scent?.deliveredCategoryCode)) {
    return `กลิ่นนี้ RD ส่งให้ลูกค้าเป็นสินค้าหมวด ${scent.deliveredCategoryCode}`
      + `${codes.length ? ` (สูตร ${codes.join(', ')})` : ''} · ${tail}`;
  }
  if (codes.length) return `กลิ่นนี้มีสูตรใช้อยู่ ${codes.length} ตัว (${codes.join(', ')}) · ${tail}`;
  return null;
}
