"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/* เปลี่ยนหน้าจากเมนู (หรือลิงก์ใด ๆ ที่ข้าม pathname) แล้วพาจอกลับขึ้นบนสุด
 *
 * 🐞 Next ไม่ได้เลื่อนขึ้นให้เองในแอปนี้ — วัดจริง 2026-08-13: ไถหน้า `/sa/deals`
 * ลงไป 1200px กดเมนู "ลีด" แล้ว pathname เปลี่ยนเป็น `/sa/leads` แต่ `scrollY`
 * ยังเป็น 1200 คนอ่านจึงโผล่กลางตารางของหน้าใหม่ทุกครั้ง
 *
 * ⚠️ ผูกกับ **pathname** ไม่ใช่ทั้ง URL — เปลี่ยนเฉพาะ query (เช่น `?tab=…` ของ
 * แดชบอร์ด หรือตัวกรองที่เขียนลง URL) ไม่ใช่การเปลี่ยนหน้า ตรงนั้นมีตัวเลื่อนของ
 * `Tabs`/`Pager` ดูแลอยู่แล้ว (lib/ui/scrollToTopOf.js) และเลื่อนคนละจุดกัน
 *
 * ⚠️ ต้องไม่แย่งงานปุ่ม back/forward — เบราว์เซอร์คืนตำแหน่งเดิมของหน้าเก่าให้
 * ถ้าเราเลื่อนขึ้นทับ กดย้อนกลับทีไรก็เด้งไปหัวหน้าเสมอ จึงตั้งธงตอน `popstate`
 * แล้วข้ามการเลื่อนรอบนั้นไปหนึ่งครั้ง
 *
 * ⚠️ ข้ามเมื่อ URL มี hash — ผู้ใช้ (หรือลิงก์) ชี้ไปที่ตำแหน่งในหน้าไว้แล้ว
 */
export default function useScrollTopOnNavigate() {
  const pathname = usePathname();
  const skipNextRef = useRef(false);

  useEffect(() => {
    const markHistoryNavigation = () => { skipNextRef.current = true; };
    window.addEventListener("popstate", markHistoryNavigation);
    return () => window.removeEventListener("popstate", markHistoryNavigation);
  }, []);

  useEffect(() => {
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
}
