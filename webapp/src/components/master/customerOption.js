import { naText } from "@/lib/format";
import { customerNameIn, customerNameSearchText } from "@/lib/master/customerName";

// มาตรฐาน dropdown ลูกค้าทั้งระบบ: **"รหัส · ชื่อ"** และค้นหาเจอทั้งรหัสและชื่อ
// (มติผู้ใช้ 2026-08-12 — ผู้ใช้กวาดตาหารหัสก่อนชื่อ ดู entity display convention)
//
// 📌 ตอนยกไฟล์นี้ออกมา ระบบมี dropdown ลูกค้าอยู่ 6 จุดที่สะกดกันคนละแบบ:
//   `AR-001 — ชื่อ` (DealFormFields · ProductForm · SalesProjectCreateModal)
//   `AR-001 : ชื่อ` (excise OrderFormModal · RegistrationFormModal)
//   ชื่อเปล่าไม่มีรหัส (หน้าสร้างใบเสนอราคา)
// ทั้งหมดถูกย้ายมาเรียกตัวนี้แล้ว — **dropdown ลูกค้าใหม่ต้องเรียกที่นี่ ห้ามประกอบป้ายเอง**
// แพตเทิร์นเดียวกับ productOption.js ของฝั่งสินค้า
//
// 🐞 สองแบบเดิมยังมีบั๊กร่วมที่หายไปพร้อมกัน: `${c.arCode} : ${c.name}` ของสายสรรพสามิต
// พิมพ์ `undefined : ชื่อ` ถ้าลูกค้ายังไม่มีรหัส และทุกจุดเรียงตามลำดับที่ API ส่งมา
// (createdAt) ไม่ใช่ตามรหัส

// 🐞 2026-09-03: อ่าน `customer.name` ดิบ ⇒ ลูกค้าที่มีแต่ชื่ออังกฤษได้ป้าย `AR-630 · —`
// และพิมพ์ชื่ออังกฤษหาไม่เจอ · ชื่อต้องผ่านกติกาสองภาษา และ **ชุดค้นต้องมีทั้งสองภาษา**
// เสมอ แม้ป้ายจะโชว์ภาษาเดียว (คนพิมพ์หาลูกค้าต่างชาติด้วยชื่ออังกฤษ)
// ⚠️ ผู้เรียกต้อง select `nameEn` มาด้วย — CUSTOMER_PICKER_COLUMNS มีให้แล้ว
export function customerOptionDisplay(customer) {
  const code = String(customer?.arCode || "").trim();
  const name = customerNameIn(customer);
  return {
    // ไม่มีรหัส (ลูกค้าที่ยังไม่ออกรหัส) = โชว์ชื่อเปล่า ไม่ใช่ "— ชื่อ" ที่อ่านเหมือนรหัสหาย
    text: code ? `${code} · ${naText(name)}` : naText(name),
    search: `${code} ${customerNameSearchText(customer)}`.trim(),
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
