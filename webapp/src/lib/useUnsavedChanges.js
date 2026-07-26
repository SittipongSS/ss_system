"use client";

import { useEffect } from "react";
import { confirmAction } from "@/components/ui/ConfirmDialog";

// กันงานหายเมื่อมีการแก้ไขค้าง (dirty):
//   1. ปิด/รีเฟรชแท็บ — beforeunload (พฤติกรรมเดิม)
//   2. กดลิงก์ภายในแอป (<Link>/<a>) — Next.js นำทางฝั่ง client โดยไม่ยิง beforeunload
//      จึงดัก click ระดับ capture แล้วถามยืนยันก่อนออกจากหน้า (ผลตรวจระบบขาย 2026-07-16)
export function useUnsavedChanges(dirty, {
  message = "มีการแก้ไขที่ยังไม่ได้บันทึก — ออกจากหน้านี้และทิ้งการแก้ไข?",
} = {}) {
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event) => {
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
      if (await confirmAction(message)) window.location.assign(url.href);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [dirty, message]);
}
