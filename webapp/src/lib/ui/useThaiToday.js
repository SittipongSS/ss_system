"use client";
// ── "วันนี้" ของจอ = วันไทย ตัวเดียวทุกจอ (งวด 2 · docs/due-overdue-system.md) ─────────────────────────────
//
// 🐞 ก่อนงวดนี้ราว 30 จอเรียก `businessDate()` ในตัวคอมโพเนนต์ (หรือ `useMemo(() => businessDate(), [])`) และ 4 จอใช้นาฬิกาเครื่อง
//    ⇒ แท็บที่เปิดค้างข้ามคืนยังพูด "ครบกำหนดวันนี้" / "เลยกำหนด n วัน" ของเมื่อวาน จนกว่าจะรีโหลด
// ⭐ แพตเทิร์นเดียวกับ `app/service/page.js` — เก็บใน state · อ่านใหม่เมื่อกลับมาที่แท็บ (ข้ามเที่ยงคืนแล้วตัวเลขขยับเอง)
//
// สองโหมด:
//   · ค่าตั้งต้น — เฟรมแรกได้ `null` (อ่านใน effect ไม่ใช่ตอนเรนเดอร์) · ใช้กับจอที่ผู้เรียกทุกตัวรับ null ได้
//     (ตัวกลาง `dueState` ตอบ `none` = ไม่ตัดสิน)
//   · `{ seed: true }` — เฟรมแรกได้วันไทยเลย (อ่านครั้งเดียวใน initializer ของ useState) · ใช้กับจอที่ "วันนี้" เป็นแกนของหน้า
//     (สัปดาห์ของตาราง · ช่วงที่โหลด) ซึ่งค่าว่างหนึ่งเฟรมจะพาไปคำนวณผิด · ⚠️ ข้อแลก: SSR กับ client อ่านคนละวินาที —
//     ต่างวันได้เฉพาะช่วงข้ามเที่ยงคืน (เท่ากับพฤติกรรมเดิมของจอพวกนี้) แต่แท็บที่ค้างข้ามคืนหายค้างแล้ว
import { useEffect, useState } from "react";
import { businessDate } from "@/lib/businessDate";

export default function useThaiToday({ seed = false } = {}) {
  const [today, setToday] = useState(() => (seed ? businessDate() : null));
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
