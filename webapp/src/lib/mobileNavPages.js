// ── แบ่งเมนูของระบบเป็นหน้า ๆ สำหรับแถบล่างมือถือ ────────────────────────
//
// มติผู้ใช้ 2026-08-02: แถบล่างเป็น **แบบปัดหน้า** — เมนูของระบบต้องอยู่บนแถบ
// ครบทุกตัว ห้ามซ่อนหลังปุ่ม "เพิ่มเติม" (ปุ่มนั้นเหลือไว้สำหรับบัญชี/เครื่องมือ)
//
// ⭐ แบ่ง "สมดุล" ไม่ใช่ "เต็มหน้าแรกก่อน" — วัดจริง 2026-08-02: ฐานข้อมูล 7 เมนู
// ถ้าแบ่ง 5+2 หน้าสองจะโล่ง 3 ช่องซึ่งดูเหมือนแถบพัง · 4+3 เต็มตาทั้งสองหน้า
//
// ⚠️ ทุกหน้าต้องมี "จำนวนช่อง" เท่ากัน (เติมช่องว่างให้หน้าที่สั้นกว่า) ไม่งั้น
// ปุ่มจะเปลี่ยนขนาดตอนปัดข้ามหน้า เพราะแต่ละช่องเป็น flex:1 ของหน้าตัวเอง

export const MOBILE_NAV_SLOTS = 5;

/**
 * คืนอาเรย์ของหน้า แต่ละหน้ามีความยาวเท่ากัน · ช่องที่ไม่มีเมนูเป็น null
 * @param {Array} items เมนูของระบบปัจจุบัน (กรองสิทธิ์มาแล้ว)
 * @param {number} slots ช่องสูงสุดต่อหน้า
 */
export function paginateMobileNav(items, slots = MOBILE_NAV_SLOTS) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  if (list.length <= slots) return [list];

  const pageCount = Math.ceil(list.length / slots);
  const perPage = Math.ceil(list.length / pageCount);

  const pages = [];
  for (let i = 0; i < list.length; i += perPage) {
    const page = list.slice(i, i + perPage);
    // เติมช่องว่างให้ครบ perPage — ช่องว่างไม่ใช่ปุ่ม กดไม่ได้ ไม่มีในลำดับ tab
    while (page.length < perPage) page.push(null);
    pages.push(page);
  }
  return pages;
}

/** หน้าที่มีเมนูซึ่งกำลังเปิดอยู่ — ใช้เลื่อนแถบไปหน้านั้นตอนเข้าหน้าใหม่ */
export function pageIndexOfActive(pages, isActive) {
  for (let p = 0; p < pages.length; p += 1) {
    if (pages[p].some((item) => item && isActive(item))) return p;
  }
  return 0;
}
