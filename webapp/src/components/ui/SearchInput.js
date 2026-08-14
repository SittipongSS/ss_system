"use client";

import { forwardRef } from "react";
import { Search } from "lucide-react";
import Input from "@/components/ui/Input";

/* ช่องค้นหากลางของระบบ — ที่เดียวที่ได้รับอนุญาตให้ประกอบคลาส `search-input`

   ⭐ **รื้อจาก `.search-glass` (มติผู้ใช้ 2026-08-14)** เดิมทุกหน้าเขียนมือเองเป็น
   `<div className="search-glass"><Search/><input/></div>` — 25 จุด 20 ไฟล์ ไม่มีที่รวม
   ทั้งที่ปุ่ม (#762) ช่องกรอก (Input.js) ช่องยาว (Textarea.js) ดรอปดาวน์ (Select.js)
   มี primitive หมดแล้ว ช่องค้นหาเป็นตัวเดียวที่ตกสำรวจ

   🐞 **โครงเดิมเป็นสองกล่องและนั่นคือตัวบั๊ก** — `<div>` ครอบถือขอบ/พื้น/ความสูง ส่วน
   `<input>` ข้างในถือข้อความ · `<input>` ที่ไม่ตั้งความสูงจะสูงเท่ากล่องบรรทัดพอดี
   **และคลิปเนื้อในตัวเองเสมอ** ⇒ สระบนไทยเหลือที่ 0.15px แล้วโดนเฉือน ผู้ใช้เห็นเป็น
   "เหมือนมีเลเยอร์บนตัดหัวสระ" ทั้งตอนยังไม่พิมพ์และตอนพิมพ์ · และเพราะขอบที่ตัดคือ
   ขอบของ `<input>` ไม่ใช่กล่องนอก การไล่แก้ `padding` ที่กล่องนอกจึงไม่เคยหาย

   ตอนนี้ `<input>` เป็นตัวควบคุมเอง (ขอบ · พื้น · `--ctl-h` จาก `.premium-input`)
   ส่วน `.search-input` เหลือหน้าที่เดียวคือให้ไอคอนวางทับได้ — ไม่มีกล่องที่สองอีก

   ⚠️ ขนาดไอคอนเดิมกระจาย 15/16/18px แล้วแต่หน้า — รวมเป็น 16px ที่นี่ที่เดียว
   จะเปลี่ยนหน้าตาช่องค้นหาทั้งระบบ ให้แก้ `.search-input` ใน globals.css */

const SearchInput = forwardRef(function SearchInput({
  /* ความกว้าง — เดิมทุกหน้าเขียน `style={{ width: 240 }}` เองซึ่งเป็นหนี้ inline style
     ส่งเป็นตัวเลข (px) หรือสตริง CSS ก็ได้ · ไม่ส่ง = ใช้ค่าปริยาย 300px ที่ยืดเป็น
     340px ตอนโฟกัส (พฤติกรรมเดิมของ .search-glass) */
  width,
  /* ป้ายสำหรับ screen reader — ไม่ส่งจะถอยไปใช้ placeholder ซึ่งอ่านได้อยู่แล้ว
     แต่หายไปทันทีที่ผู้ใช้เริ่มพิมพ์ จึงควรส่งเสมอเมื่อ placeholder เป็นตัวอย่างคำค้น */
  ariaLabel,
  placeholder,
  className = "",
  ...rest
}, ref) {
  /* `min(…, 100%)` ไม่ใช่ของประดับ — เดิมบางหน้าเขียน `maxWidth: "100%"` คู่กับความกว้าง
     ตายตัว บางหน้าลืม ⇒ บนจอแคบช่องที่ลืมจะดันคอลัมน์จนล้น · คุมที่นี่ที่เดียว */
  const style = width == null
    ? undefined
    : { width: typeof width === "number" ? `min(${width}px, 100%)` : width };
  return (
    <div className={`search-input ${className}`.trim()} style={style}>
      <Search className="search-input-icon" size={16} aria-hidden="true" />
      {/* ต่อผ่าน `Input` ไม่ใช่เขียน `premium-input` เอง — ที่รวมคลาสช่องกรอกมีอยู่แล้ว
          ที่เดียว ถ้าเขียนซ้ำที่นี่ ช่องค้นหาจะหลุดจากการแก้ครั้งหน้าของ Input.js */}
      <Input
        ref={ref}
        type="text"
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        {...rest}
      />
    </div>
  );
});

export default SearchInput;
