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

   เหมือน Button/Input: **ไม่เปลี่ยนหน้าตาของเดิม** แค่ย้ายการประกอบคลาสมาที่เดียว
   ยกเว้น 3 จุดที่ไม่มีคลาส ซึ่งเดิมพังอยู่แล้ว — พวกนั้นจะได้หน้าตาช่องกรอกมาตรฐาน */

const Textarea = forwardRef(function Textarea({ variant = "form", className = "", ...props }, ref) {
  if (variant === "data") {
    return (
      <textarea
        ref={ref}
        className={["textarea-premium", className].filter(Boolean).join(" ").trim()}
        {...props}
      />
    );
  }

  /* `mono` / `invalid` ไหลผ่านไปถึง Input ได้เอง (Input เป็นคนถอด prop พวกนั้น)
     จึงไม่ต้องประกาศซ้ำที่นี่ — ประกาศซ้ำเมื่อไหร่ก็เริ่มเพี้ยนจากกันเมื่อนั้น */
  return <Input as="textarea" ref={ref} className={className} {...props} />;
});

export default Textarea;
