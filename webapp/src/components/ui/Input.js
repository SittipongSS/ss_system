"use client";

import { forwardRef } from "react";

/* ช่องกรอกกลางของระบบ — ที่เดียวที่ได้รับอนุญาตให้เขียนคลาส `premium-input`

   ปุ่มมี primitive ตั้งแต่ #762 แต่ช่องกรอกไม่เคยมี ทั้งที่เป็นตัวควบคุมที่ใช้เยอะ
   พอ ๆ กัน — ตรวจ 2026-07-29 พบเขียนคลาสดิบ 224 จุด และ **ไม่มีอะไรกันไม่ให้เพิ่ม**
   (ratchet มีแค่ metric ของปุ่ม) อาการที่ตามมาจากการไม่มีที่รวม:

   - 50 จุดเติม `w-full` ทั้งที่ `.premium-input` ตั้ง `width: 100%` ไว้อยู่แล้ว
   - บางจุดเติม `text-[12px]` / `h-[32px]` / `h-[30px]` ทับความสูงมาตรฐาน (`--ctl-h`)
     และทับชั้นพิมพ์ — utility ของ Tailwind แบบนี้ตัวตรวจ font-size มองไม่เห็น
   - `.search-glass` ที่เป็นคลาสของ *กล่องครอบ* เคยถูกใส่ที่ <input> ตรง ๆ
     จนไอคอนแว่นขยายหายไปทั้งหน้า (ผู้ใช้ส่งภาพมา 2026-07-28)

   เหมือน Button: **ไม่เปลี่ยนหน้าตาของเดิม** แค่ย้ายการประกอบคลาสมาไว้ที่เดียว
   จะเปลี่ยนดีไซน์ช่องกรอกจริง ๆ ให้แก้ `.premium-input` ใน globals.css แล้วดูผล
   พร้อมกันทั้งระบบที่ /settings/design-preview

   ⚠️ อย่าเอาไปแทน `.textarea-premium` — คนละงานกัน ตัวนั้นเป็นกล่อง *วางข้อมูลดิบ*
   (ฟอนต์ mono, สูง 100px, ห้ามลากขยาย) ไม่ใช่ช่องกรอกของฟอร์ม
   ตั้งแต่ 2026-07-30 ทั้งสองงานมีที่รวมแล้วที่ `Textarea.js` (`variant="form" | "data"`)
   ซึ่งฝั่ง form ส่งต่อมาที่นี่ — <textarea> ดิบจึงไม่ควรมีเหลือในหน้าไหนอีก
   ⚠️ ช่องที่มีกติกาการพิมพ์ของตัวเอง (MoneyInput · PhoneInput · NationalIdInput ·
   DateInput · TimeInput) ใช้ตัวนั้นต่อไป — พวกนั้นใส่คลาสให้เองอยู่แล้ว */

const Input = forwardRef(function Input({
  /* `as` รับได้แค่ "input" | "textarea" — <select> มี primitive ของตัวเองแล้ว
     (components/ui/Select.js) ซึ่งไม่ใช่ <select> จริงด้วยซ้ำ แต่เป็นแผงลอยที่
     คุมพื้นผิว/คีย์บอร์ดเอง จึงห้ามหลอมเข้ามาที่นี่ */
  as: Component = "input",
  // ตัวเลข/รหัสเอกสาร — ฟอนต์ mono + ตัวเลขความกว้างเท่ากัน (ไม่ขยับตอนพิมพ์)
  mono = false,
  // ช่องพิมพ์อิสระที่คู่กับ <datalist> — วาดลูกศรแบบเดียวกับดรอปดาวน์
  combo = false,
  // สถานะกรอกผิด — เดิมหน้าต้นแบบเขียน `premium-input error` ซึ่ง **ไม่มี selector
  // อยู่จริง** ช่อง "ที่ผิดพลาด" บนหน้าต้นแบบจึงหน้าตาเหมือนช่องปกติมาตลอด
  invalid = false,
  className = "",
  ...props
}, ref) {
  const classes = [
    "premium-input",
    mono ? "mono" : null,
    combo ? "combo" : null,
    invalid ? "is-invalid" : null,
    className,
  ].filter(Boolean).join(" ").trim();

  /* บอกเบราว์เซอร์/โปรแกรมอ่านหน้าจอด้วย ไม่ใช่แค่ทำให้ขอบแดง — ช่องที่ผิดต้อง
     "ผิด" ในเชิงความหมายด้วย ไม่งั้นคนที่ใช้ screen reader ไม่รู้เลยว่าช่องไหนพลาด */
  const invalidProp = invalid && props["aria-invalid"] === undefined ? { "aria-invalid": "true" } : {};

  return <Component ref={ref} className={classes} {...invalidProp} {...props} />;
});

export default Input;
