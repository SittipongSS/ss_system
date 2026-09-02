"use client";

import { useRouter } from "next/navigation";
import { isInteractiveTarget } from "@/lib/uiRules";

/* แถวตารางที่ทั้งแถวคลิกได้ — ⚠️ อ่านสองข้อนี้ก่อนใช้
   1) `onClick` บน <tr> คือ **ทางลัดของเมาส์** ไม่ใช่ทางเข้าของฟังก์ชัน
   2) ทางเข้าจริงคือ <Link href={ตัวเดียวกับ href ของแถว}> ที่ต้องอยู่ **ในเซลล์**
      (ปกติเซลล์แรก) — คีย์บอร์ด · โปรแกรมอ่านหน้าจอ · คลิกขวาเปิดแท็บใหม่ อยู่ที่นั่น
   ด่าน ROW_MIRROR ใน `npm run audit:ui` บังคับข้อ 2 กับ **ทุกที่เรียก** (hard-zero)
   ⇒ href เป็น prop บังคับ · แถวที่ไม่พาไปไหนให้ใช้ <tr className="premium-row"> ธรรมดา

   ── 🚫 ห้ามคืน role/tabIndex/onKeyDown กลับมาบน <tr> (ของเดิมถึง 2026-09-02 เป็นแบบนั้น) ──
   `role="link"` ทับ `role="row"` ทิ้ง ⇒ แถวหลุดจากโครงตารางใน accessibility tree:
   ผ่าน 2.1.1 จริง แต่แลกด้วย 1.3.1 ทั้งที่ลิงก์ในเซลล์ให้ทั้งสองข้อฟรี ๆ
   และแลกด้วย tab stop เกินมาแถวละ 1 จุด (ตาราง 50 แถว = 50 จุดที่กด Enter แล้วได้ผล
   เหมือนลิงก์ที่อยู่ถัดไป 1 tab พอดี) · Space บนลิงก์ก็กลับไปเลื่อนหน้าตามมาตรฐาน
   (ตัวรับคีย์เดิม preventDefault ทิ้งทุกครั้ง)

   ── ทำไมถอดออกแล้วยังเข้าถึงด้วยคีย์บอร์ดได้ (วัดเองซ้ำ 2026-09-02) ──────────────
   ไล่ผู้เรียกครบทั้ง **10 จุด** แล้วเทียบ *ข้อความนิพจน์ href ตรงตัว* ไม่ใช่แค่
   "ไปหน้าเดียวกัน": **8 จุดเป็นแถวที่พาไปหน้าอื่นจริง และทั้ง 8 มี <Link> ที่ href
   เหมือนกันเป๊ะทุกตัวอักษรอยู่ในเซลล์แรกอยู่แล้ว** (finance · rd/sales-orders ·
   sa/projects · sales-planning/contracts · deals · leads · quotations · sales-orders)
   ⇒ ถอด role/tabIndex/onKeyDown ออกไม่ได้ตัดทางเข้าของใครเลยสักหน้า
   อีก 2 จุดไม่ใช่แถวที่พาไปไหน และแก้พร้อมกันในคอมมิตนี้:
     · settings/design-preview เคยส่ง href="#" โดยไม่มีลิงก์เลย → ใส่ลิงก์ให้ตรงปลายทาง
     · salesPlanning/RenewalsPanel เรียกโดย **ไม่ส่ง href** → เปลี่ยนเป็น <tr> ธรรมดา
       (แถวหมายถึงไซต์ ส่วนลิงก์ข้างในไปที่ใบ SO = คนละปลายทาง จึงยกเว้นให้ไม่ได้)
   🪤 กติกาการยกเว้นผูกกับ **ปลายทางที่ตรงกัน** ไม่ใช่ "มีอะไรโฟกัสได้ก็พอ" — แถวที่มี
      แค่ปุ่มลบข้างในยังเข้าถึง *การเปิดรายละเอียด* ด้วยคีย์บอร์ดไม่ได้ ต้องตกเหมือนเดิม */
export default function DetailRow({ href, children, className = "", onClick, ...props }) {
  const router = useRouter();
  return (
    <tr
      className={`detail-row ${className}`.trim()}
      /* ส่ง currentTarget (= <tr> ตัวนี้) เป็นขอบเขตเสมอ — วันนี้ <tr> ไม่มี role แล้ว
         จึงไม่ชนบั๊กเดิมของ uiRules อีก แต่ยังต้องส่ง เพราะผู้เรียก spread
         `data-no-row-navigation` ลงมาบนแถวเองได้ผ่าน {...props} แล้วแถวจะบล็อกตัวเอง */
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && href && !isInteractiveTarget(event.target, event.currentTarget)) {
          router.push(href);
        }
      }}
      {...props}
    >
      {children}
    </tr>
  );
}
