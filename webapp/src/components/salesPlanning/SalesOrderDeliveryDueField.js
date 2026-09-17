"use client";
import DateInput from "@/components/ui/DateInput";
import { fmtDate } from "@/lib/format";

/**
 * ช่อง "กำหนดส่งสินค้า" ของใบสั่งขาย (0363) — **ตัวเดียวกันทั้งตอนสร้างใบและตอนแก้ใบร่าง**
 * (กฎ AGENTS.md: ฟอร์มสร้างกับฟอร์มแก้ต้องเป็น component เดียว ต่างกันได้แค่โหมด)
 *
 * ⭐ ค่านี้เป็นคำสัญญาเรื่อง **ของ** ไม่ใช่เรื่องเงิน — คนละอันกับ "วันที่ SO"
 * (วันออกใบ แก้ไม่ได้) และ "กำหนดชำระ" (อยู่ที่งวดในการ์ดการชำระ) · ทั้งสามค่าอยู่ใกล้กัน
 * บนจอ จึงต้องมีคำกำกับบอกว่าอันไหนคืออะไร ไม่ใช่ปล่อยให้เดาจากป้าย
 *
 * ⚠️ **ไม่บังคับกรอก** — AE ที่ยังรอลูกค้าเคาะวันส่งต้องตั้งใบร่างไว้ก่อนได้
 * ว่าง = "ยังไม่ตกลงวันส่ง" ซึ่งเป็นข้อเท็จจริง ไม่ใช่ข้อมูลขาด ⇒ โหมดอ่านขึ้นข้อความนั้น
 * ตรง ๆ ไม่ใช่ขีดเปล่า ๆ ที่อ่านแล้วไม่รู้ว่าลืมกรอกหรือยังไม่ตกลง
 */
export default function SalesOrderDeliveryDueField({
  value,
  onChange,
  mode = "edit",     // 'edit' | 'read'
  disabled = false,
  readonlyClassName,
}) {
  if (mode === "read") {
    return (
      <div className={readonlyClassName}>
        <span>กำหนดส่งสินค้า</span>
        <div className="readable-field">
          {value
            ? fmtDate(value)
            : <span className="readable-field-empty">ยังไม่ตกลงวันส่ง</span>}
        </div>
      </div>
    );
  }
  return (
    <label>
      <span>กำหนดส่งสินค้า</span>
      <DateInput
        value={value || ""}
        disabled={disabled}
        ariaLabel="กำหนดส่งสินค้า"
        onChange={(next) => onChange(next || "")}
      />
      <p className="form-note">วันที่ตกลงกับลูกค้าว่าจะส่งของ — ไม่ใช่กำหนดชำระ · ยังไม่ตกลงก็เว้นว่างได้</p>
    </label>
  );
}
