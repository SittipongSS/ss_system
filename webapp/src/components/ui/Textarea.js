"use client";

import { forwardRef } from "react";
import Input from "./Input";

/* ช่องข้อความหลายบรรทัดของระบบ — ที่เดียวที่ได้รับอนุญาตให้เขียนคลาส `textarea-premium`

   ตรวจ 2026-07-30: มี <textarea> 53 จุด **ไม่มี primitive เลย** ผลคือแตกเป็น 3 แบบ
   ที่ไม่มีใครตั้งใจให้ต่างกัน:
   - 36 จุดเขียน `premium-input` เอง (ทั้งที่ Input.js เป็นที่เดียวที่ควรเขียนคลาสนั้น)
   - 14 จุดใช้ `textarea-premium` (กล่องวางข้อมูลดิบ — mono, สูง 100px, ห้ามลากขยาย)
   - 🐛 **3 จุดไม่มีคลาสเลย** วัดจริงทั้งสองธีม: `border: 0` · พื้นโปร่งใส · ไม่มี
     padding/radius · `color: rgb(23,29,41)` **ตายตัว ไม่เปลี่ยนตามธีม** = บนพื้นมืด
     เป็นตัวหนังสือดำบนพื้นดำ และมองไม่ออกด้วยซ้ำว่าตรงนั้นเป็นช่องกรอก
     (sales-planning/leads/[id] · settings/workflow-templates ×2)

   สองงานนี้ห้ามสลับกัน จึงแยกด้วย `variant` ไม่ใช่แยกไฟล์:
     variant="form" (ค่าตั้งต้น) → ช่องกรอกของฟอร์ม ส่งต่อให้ Input as="textarea"
                                   เพื่อไม่ให้มีที่ประกอบคลาส premium-input สองแห่ง
     variant="data"              → กล่องวางข้อมูลดิบ (JSON/ล็อก/ข้อความที่ก๊อปมาวาง)

   ⚠️ **`variant="data"` = ข้อมูลดิบเท่านั้น ไม่ใช่ "กล่องที่ใหญ่กว่า"** — ตรวจ
   2026-08-12 พบมันถูกใช้ 21 จุดกับ *ข้อความไทย* (เหตุผลที่ยกเลิก · สิ่งที่ลูกค้าบอก ·
   บรีฟกลิ่น · รายละเอียดคำร้อง) เพราะเดิมมันสูง 100px ส่วนฝั่งฟอร์มสูง 80px
   ⇒ ประโยคภาษาไทยไปอยู่ในฟอนต์ mono ทั่วระบบโดยไม่มีใครตั้งใจ · แก้แล้วสองกล่องสูง
   เท่ากัน (ดู globals.css) เหลือต่างกันแค่ฟอนต์ ซึ่งเป็นเกณฑ์เดียวที่ควรใช้เลือก

   เหมือน Button/Input: **ไม่เปลี่ยนหน้าตาของเดิม** แค่ย้ายการประกอบคลาสมาที่เดียว
   ยกเว้น 3 จุดที่ไม่มีคลาส ซึ่งเดิมพังอยู่แล้ว — พวกนั้นจะได้หน้าตาช่องกรอกมาตรฐาน */

const Textarea = forwardRef(function Textarea({
  variant = "form",
  /* 🐞 เดิม `rows` **ไม่มีผลเลย** เพราะ CSS ตั้ง `height` ตายตัวทับทุกครั้ง — 20 จุด
     ที่เขียน `rows={2..8}` ได้ความสูงเท่ากันหมด · ตอนนี้ส่งค่าเดียวกันสองทาง:
     attribute `rows` (ทางถอยของเบราว์เซอร์ที่ยังไม่มี `field-sizing`) และตัวแปร
     `--ta-rows` ที่ globals.css เอาไปคิดเป็นความสูงขั้นต่ำจริง
     ค่าตั้งต้น 3 = ความสูงเดิม (80px) พอดี ⇒ จุดที่ไม่เคยระบุ rows ไม่ขยับ */
  rows = 3,
  className = "",
  style,
  ...props
}, ref) {
  const sizing = { "--ta-rows": rows, ...style };

  if (variant === "data") {
    return (
      <textarea
        ref={ref}
        rows={rows}
        style={sizing}
        className={["textarea-premium", className].filter(Boolean).join(" ").trim()}
        {...props}
      />
    );
  }

  /* `mono` / `invalid` ไหลผ่านไปถึง Input ได้เอง (Input เป็นคนถอด prop พวกนั้น)
     จึงไม่ต้องประกาศซ้ำที่นี่ — ประกาศซ้ำเมื่อไหร่ก็เริ่มเพี้ยนจากกันเมื่อนั้น */
  return <Input as="textarea" ref={ref} rows={rows} style={sizing} className={className} {...props} />;
});

export default Textarea;
