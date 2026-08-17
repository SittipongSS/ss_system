import { naText } from "@/lib/format";

// มาตรฐาน dropdown ลูกค้าทั้งระบบ: **"รหัส · ชื่อ"** และค้นหาเจอทั้งรหัสและชื่อ
// (มติผู้ใช้ 2026-08-12 — ผู้ใช้กวาดตาหารหัสก่อนชื่อ ดู entity display convention)
//
// ⚠️ ตอนเขียนไฟล์นี้ ระบบมี dropdown ลูกค้าอยู่ 5 จุดที่สะกดคนละแบบ:
//   `AR-001 — ชื่อ` (DealFormFields · ProductForm · SalesProjectCreateModal)
//   `AR-001 : ชื่อ` (excise OrderFormModal · RegistrationFormModal)
// ทั้งสองแบบไม่ตรงกับมติที่ใช้ตัวคั่น `·` — ที่นี่คือทรงเดียวที่ถูกต้อง ของใหม่ให้เรียก
// ตัวนี้ และถ้าจะไล่แก้ 5 จุดนั้นให้เรียกที่เดียวกัน (ยังไม่ทำในรอบนี้เพราะเปลี่ยนคำ
// บนจอของโมดูลอื่น) แพตเทิร์นเดียวกับ productOption.js ของฝั่งสินค้า

export function customerOptionDisplay(customer) {
  const code = String(customer?.arCode || "").trim();
  const name = String(customer?.name || "").trim();
  return {
    // ไม่มีรหัส (ลูกค้าที่ยังไม่ออกรหัส) = โชว์ชื่อเปล่า ไม่ใช่ "— ชื่อ" ที่อ่านเหมือนรหัสหาย
    text: code ? `${code} · ${naText(name)}` : naText(name),
    search: `${code} ${name}`.trim(),
  };
}

// options ให้ SearchableSelect — เรียงตามรหัสลูกค้า (ตัวไม่มีรหัสไปท้ายลิสต์)
// เรียงตามรหัสเพราะลิสต์นี้ยาว (prod ~76 ราย) และคนกวาดตาหารหัสเป็นหลัก
// ⚠️ ต้องเรียงแบบ `numeric` — รหัส AR มีจำนวนหลักไม่เท่ากัน (AR-078 / AR-1001)
// เรียงแบบตัวอักษรล้วนจะได้ AR-078 → **AR-1001** → AR-109 ซึ่งอ่านเหมือนลิสต์เสีย
export function customerSelectOptions(customers = [], getValue = (c) => c.id) {
  return customers
    .map((customer) => {
      const display = customerOptionDisplay(customer);
      return {
        value: getValue(customer),
        arCode: customer?.arCode || "",
        label: display.text,
        search: display.search,
      };
    })
    .sort((a, b) => (a.arCode || "￿").localeCompare(b.arCode || "￿", "en", { numeric: true })
      || a.label.localeCompare(b.label, "th"));
}
