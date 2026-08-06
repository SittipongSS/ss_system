// System-wide interaction rules. Keep data semantics here so forms do not
// independently decide whether a selector should expose search.
export const ENTITY_SELECT_RULES = Object.freeze({
  customer: Object.freeze({ searchable: true }),
  // คน: ค้นได้เสมอ — ต้องพิมพ์นามสกุลหาได้ ไม่ใช่ไล่หาในรายชื่อยาว ๆ
  person: Object.freeze({ searchable: true }),
  product: Object.freeze({ searchable: true }),
  // โครงการ/ดีล: ค้นได้เสมอ (มติผู้ใช้ 2026-08-06) — คนจำ "ชื่อดีล" ได้ แต่จำไม่ได้ว่า
  // อยู่โครงการไหน · ลิสต์ยาวเป็นร้อยแถว การไล่ดูทีละบรรทัดจึงไม่ใช่ทางเลือกจริง
  project: Object.freeze({ searchable: true }),
  deal: Object.freeze({ searchable: true }),
  brand: Object.freeze({ searchable: false }),
  // หมวดสินค้ายุบสองชั้นเป็นช่องเดียวแล้ว (ProductCategorySelect) — prod มี 105 หมวด
  // ⇒ ค้นได้เสมอ · สองคีย์ล่างเป็นของเดิม เผื่อมีที่เรียกตรงหลงเหลือ
  productCategory: Object.freeze({ searchable: true }),
  mainCategory: Object.freeze({ searchable: true }),
  subCategory: Object.freeze({ searchable: true }),
});

export const searchableForEntity = (entity, fallback = true) =>
  entity && ENTITY_SELECT_RULES[entity]
    ? ENTITY_SELECT_RULES[entity].searchable
    : fallback;

// แถวที่รู้ URL ปลายทางกดได้จากพื้นที่ที่ไม่ใช่ตัวควบคุม — ปุ่ม/ลิงก์/ช่องกรอกข้างในยังทำงาน
// ของตัวเองตามเดิม
//
// 🐞 `boundary` เพิ่มมาแก้บั๊กที่ทำให้ **คลิกแถวไม่ทำงานเลยทุกหน้า**: `DetailRow` ใส่
// `role="link"` ไว้บน `<tr>` เอง แล้วฟังก์ชันนี้ไล่ `closest()` ขึ้นไปเจอ `<tr>` ตัวนั้น
// → คืน true ทุกครั้งไม่ว่าจะกดตรงไหน → เงื่อนไข `!isInteractiveTarget(...)` เป็นเท็จเสมอ
// → `navigate()` ไม่เคยถูกเรียก ทั้งคลิกและกด Enter (หน้าดีล/โครงการ/QT/SO โดนหมด)
// ตัวมันเองไม่นับว่าเป็น "ตัวควบคุมข้างใน" — ส่ง boundary มาเพื่อหยุดการไล่ขึ้นที่ตรงนั้น
export const isInteractiveTarget = (target, boundary) => {
  const found = target?.closest?.("a,button,input,select,textarea,[role='button'],[role='link'],[data-no-row-navigation]");
  return Boolean(found) && found !== boundary;
};
