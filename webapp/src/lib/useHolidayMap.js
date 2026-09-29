"use client";
// ── วันหยุดในระบบ (ตาราง holidays) เป็น Map<iso, ชื่อ> สำหรับจอกำหนดวางบิล (การ์ด/โมดัลลูกค้า · ตัวแก้วันงวด SO) ─────────
//
// ⭐ ใช้ **แค่คำเตือน/ตัวอย่าง** — ปฏิทินเล็กทำเครื่องหมายวันหยุด · ร่างจากรอบประจำให้ตัวเลือกวันทำงานก่อน/หลัง ·
//    วันแรกของกระดิ่งขอปฏิทินปีหน้า · ตัวอย่างกระดิ่งวันตัดรอบ — **ไม่เลื่อนวันที่ลูกค้าประกาศ** (มติ: วันในปฏิทินเป็นวันจริง)
// ⭐ ชิปรอบของ SO (เครดิต N: "วันทำงานสุดท้ายที่ยังทันรอบ") ต้องเห็นวันหยุดชุดเดียวกับการ์ด/กระดิ่ง/ทะเบียน FN —
//    ไม่งั้นชิปเสนอ ศ. 23 ต.ค. (ปิยมหาราช) ที่การ์ดข้ามไป 22 ต.ค. แล้วกระดิ่งวันตัดรอบยิงก่อนวันวางบิลของงวดเอง
//    (ย้ายจาก components/database/billingCalendar มาที่ lib ให้สองโมดูลใช้ตัวเดียว)
// ⚠️ โหลดไม่สำเร็จ = Map ว่าง (เงียบ) — จอยังใช้ได้ครบ แค่ไม่มีเครื่องหมายวันหยุด · ไม่ใช่เหตุให้บันทึกกติกาไม่ได้
// ⚠️ แคชร่วมกับหน้าปฏิทินอื่น (`cachedFetchJson('/api/holidays')`) — เปิดโมดัลซ้ำไม่ยิงซ้ำ
import { useEffect, useState } from "react";
import { cachedFetchJson } from "@/lib/apiCache";

const EMPTY = new Map();

export function holidayMapOf(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const day = String(row?.date || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) map.set(day, String(row?.name || ""));
  }
  return map;
}

export default function useHolidayMap() {
  const [holidays, setHolidays] = useState(EMPTY);
  useEffect(() => {
    let alive = true;
    cachedFetchJson("/api/holidays")
      .then((rows) => { if (alive) setHolidays(holidayMapOf(rows)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return holidays;
}
