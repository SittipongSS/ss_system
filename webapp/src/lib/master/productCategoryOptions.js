// ── ตัวเลือกหมวดสินค้า — ที่เดียวของระบบ (logic ล้วน ไม่แตะ React) ────────
//
// ⭐ **ช่องเดียว สองชั้นอยู่ข้างใน** — เดิมเป็นดรอปดาวน์สองช่องวางคู่กัน ซึ่งลงเซลล์
// ตารางไม่ได้ (ตารางบรรทัดคำร้อง "พัฒนาผลิตภัณฑ์" ต้องเลือกหมวดในเซลล์เดียว)
// ⇒ ยุบเป็นรายการเดียวที่มี **หัวกลุ่ม = หมวดหลัก** คั่น · ยังเป็นสองชั้นเหมือนเดิม
// แต่ไม่ต้องมีสองเวอร์ชันให้ดูแล
//
// ⚠️ ทำไมไม่ใช่รายการแบนล้วน: prod มีหมวดรอง **105 แถว** (ซีด 0007) — รายการแบน
// 105 บรรทัดไล่หาด้วยตาไม่ไหว และหัวกลุ่มคือสิ่งเดียวที่บอกว่ากำลังอยู่ตรงไหน
//
// ⚠️ **บางหมวดชื่อว่างทั้งสองภาษา** (prod = 5 แถว · ซีด 0007 มีของจริงเช่น
// `('01','ODM','001','','','')`) ⇒ ถอยไปแสดงรหัส **ห้ามขึ้นบรรทัดว่าง** ไม่งั้น
// ผู้ใช้เห็นตัวเลือกเปล่า ๆ ที่กดได้แต่ไม่รู้ว่าคืออะไร
import { isProductCategorySelectable, productCategoryCode } from '@/lib/master/productCategory';

// ชื่อหมวดรองที่เอาไปโชว์ — ไทยก่อน อังกฤษรอง ไม่มีทั้งคู่ = ไม่มีชื่อ (คืน '')
export function categoryName(row) {
  return String(row?.nameTh ?? '').trim() || String(row?.nameEn ?? '').trim() || '';
}

export function mainCategoryName(row) {
  return String(
    row?.mainCategoryName ?? row?.mainCategoryNameTh ?? row?.mainCategoryNameEn ?? '',
  ).trim();
}

// ป้ายของหมวดรอง = "รหัส ชื่อ" · ไม่มีชื่อ = เหลือแค่รหัส (ไม่ใช่บรรทัดว่าง)
export function categoryOptionLabel(row) {
  const code = productCategoryCode(row);
  const name = categoryName(row);
  const base = name ? `${code} ${name}` : code;
  return row?.isActive === false ? `${base} (พักใช้งาน)` : base;
}

// ── ตัวเลือกทั้งชุด: หัวกลุ่ม + หมวดรอง เรียงตามรหัส ─────────────────────
//
// `currentCode` = ค่าที่ถืออยู่ตอนนี้ — หมวดที่ถูกพักใช้งานแต่เป็นค่าปัจจุบันต้องยัง
// อยู่ในลิสต์ ไม่งั้นแค่เปิดฟอร์มมาแก้ช่องอื่น ค่าเดิมจะหายไปเงียบ ๆ
//
// หัวกลุ่มมี `group: true` และ **ไม่มี value ที่เลือกได้** · `search: ''` ไม่ได้แปลว่า
// ค้นแล้วหาย — ตัวควบคุมกันหัวกลุ่มไว้เองแล้วค่อยตัดหัวที่ไม่เหลือลูก
export function productCategoryOptions(categories = [], { currentCode = '' } = {}) {
  const rows = (categories || []).filter((row) => isProductCategorySelectable(row, currentCode));

  const groups = new Map();
  for (const row of rows) {
    if (!row?.mainCategoryCode || !row?.typeCode) continue;
    if (!groups.has(row.mainCategoryCode)) groups.set(row.mainCategoryCode, []);
    groups.get(row.mainCategoryCode).push(row);
  }

  const out = [];
  for (const mainCode of [...groups.keys()].sort((a, b) => String(a).localeCompare(String(b)))) {
    const children = groups.get(mainCode)
      .slice()
      .sort((a, b) => String(a.typeCode).localeCompare(String(b.typeCode)));
    const headName = mainCategoryName(children[0]);
    out.push({
      group: true,
      value: `__main_${mainCode}`,
      label: headName ? `${mainCode} ${headName}` : mainCode,
      search: '',
    });
    for (const row of children) {
      out.push({
        value: productCategoryCode(row),
        label: categoryOptionLabel(row),
        // ⭐ ค้นได้ทั้งไทย อังกฤษ และรหัส — พิมพ์ `candle` ต้องเจอ "เทียนหอม"
        // ชื่อหมวดหลักอยู่ในสายค้นด้วย ⇒ พิมพ์ `ODM` ได้ลูกทั้งกลุ่ม
        search: [
          productCategoryCode(row), row.nameTh, row.nameEn, headName, mainCode,
        ].filter(Boolean).join(' '),
      });
    }
  }
  return out;
}

// แถวหมวดจากรหัส "MM-TTT" — ผู้เรียกต้องได้แถวเต็มกลับไป (ฟอร์มโครงการเอา
// nameTh/nameEn ไปเก็บเป็น snapshot ของโครงการ)
export function findCategoryByCode(categories = [], code = '') {
  if (!code) return null;
  return (categories || []).find((row) => productCategoryCode(row) === code) || null;
}
