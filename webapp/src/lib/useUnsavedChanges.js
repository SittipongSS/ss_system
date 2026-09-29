"use client";

import { useEffect, useRef } from "react";
import { confirmAction } from "@/components/ui/ConfirmDialog";

/* ผู้ใช้ตอบ "ทิ้งแล้วออก" ในกล่องของแอปแล้ว และการออกจะเกิดด้วยทางอื่นที่ไม่ใช่ลิงก์ (ปุ่มย้อนที่ตัวต่อสายประวัติสั่งย้อนเอง) —
   ปล่อยให้การออกครั้งนั้นผ่านโดยเบราว์เซอร์ไม่ถาม "Leave site?" ซ้ำ · มีอายุสั้น ๆ: ออกไม่เกิด (แท็บใหม่ไม่มีหน้าก่อนหน้า)
   ⇒ รีเฟรช/ปิดแท็บทีหลังยังถามตามเดิม · 🐞 review 26/09: ถามสองรอบต่อการออกหนึ่งครั้ง */
let leaveAllowedUntil = 0;
export function allowNextLeave(ms = 3000) {
  leaveAllowedUntil = Date.now() + ms;
}

// กันงานหายเมื่อมีการแก้ไขค้าง (dirty):
//   1. ปิด/รีเฟรชแท็บ — beforeunload (พฤติกรรมเดิม)
//   2. กดลิงก์ภายในแอป (<Link>/<a>) — Next.js นำทางฝั่ง client โดยไม่ยิง beforeunload
//      จึงดัก click ระดับ capture แล้วถามยืนยันก่อนออกจากหน้า (ผลตรวจระบบขาย 2026-07-16)
//
// `confirm` (ไม่บังคับ) = กล่องถามทั้งกล่อง `{ title, description, cancelLabel, confirmLabel, tone }` —
//   หน้าที่มีกล่อง "ทิ้ง…?" ของตัวเองส่งมาให้การออกทางลิงก์ถามด้วยกล่องหน้าตาเดียวกัน
//   (🐞 UAT จอหน้างาน 25/09: ลิงก์ได้กล่องกลาง "ยืนยันการดำเนินการ" + ปุ่มน้ำเงิน "ยืนยัน" ซึ่งกดแล้วทิ้งค่า)
//   ไม่ส่ง = ใช้ `message` เป็นประโยคในกล่องกลางแบบเดิม
export function useUnsavedChanges(dirty, {
  message = "มีการแก้ไขที่ยังไม่ได้บันทึก — ออกจากหน้านี้และทิ้งการแก้ไข?",
  confirm = null,
} = {}) {
  // ⚠️ ถือกล่องล่าสุดไว้ใน ref — `confirm` เป็นออบเจ็กต์ใหม่ทุกเรนเดอร์ ถ้าเข้า deps ตัวดักจะถอด/ผูกใหม่ทุกครั้งที่พิมพ์
  const requestRef = useRef(null);
  requestRef.current = confirm || message;
  useEffect(() => {
    if (!dirty) return;
    // ผู้ใช้ตอบ "ทิ้ง" ในกล่องของแอปแล้ว — ไม่ต้องให้เบราว์เซอร์ถาม "Leave site?" ซ้ำอีกรอบ
    // (🐞 UAT 25/09: Chrome เดสก์ท็อป/Android ถามสองครั้งต่อการออกหนึ่งครั้ง)
    let leaving = false;
    const handleBeforeUnload = (event) => {
      if (leaving || Date.now() < leaveAllowedUntil) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const handleLinkClick = async (event) => {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("#") || href.startsWith("javascript:")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // ลิงก์นอกแอป beforeunload คุมอยู่แล้ว
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      if (await confirmAction(requestRef.current)) {
        leaving = true;
        window.location.assign(url.href);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [dirty]);
}
