"use client";
// ── "วันนี้" ของจอ = วันไทย อ่านใน effect ไม่ใช่ตอนเรนเดอร์ (งวด 2 · docs/due-overdue-system.md) ────────────
//
// 🐞 ก่อนงวดนี้ราว 30 จอเรียก `businessDate()` ในตัวคอมโพเนนต์ (นาฬิกาไทยถูก แต่อ่านตอนเรนเดอร์) และ 4 จอใช้นาฬิกาเครื่อง
//    ⇒ เรนเดอร์ฝั่ง server กับ client ได้คนละวันช่วงเที่ยงคืน (hydration) · แท็บที่เปิดค้างข้ามคืนยังพูด "ครบกำหนดวันนี้" ของเมื่อวาน
// ⭐ แพตเทิร์นเดียวกับ `app/service/page.js` — เก็บใน state · อ่านใหม่เมื่อกลับมาที่แท็บ (ข้ามเที่ยงคืนแล้วตัวเลขขยับเอง)
// ⚠️ เฟรมแรกได้ `null` — ตัวกลาง `dueState` ตอบ `none` (ไม่ตัดสิน) ไม่ใช่เดาเป็นวันนี้
import { useEffect, useState } from "react";
import { businessDate } from "@/lib/businessDate";

export default function useThaiToday() {
  const [today, setToday] = useState(null);
  useEffect(() => {
    const read = () => setToday((prev) => {
      const next = businessDate();
      return prev === next ? prev : next;
    });
    read();
    const onVisible = () => { if (document.visibilityState === "visible") read(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", read);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", read);
    };
  }, []);
  return today;
}
