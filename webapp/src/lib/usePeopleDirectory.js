"use client";
import { useEffect, useState } from "react";
import { cachedFetchJson } from "@/lib/apiCache";

/**
 * รายชื่อผู้ใช้สำหรับแปลง id → **ชื่อปัจจุบัน** บนหน้าจอ (คู่กับ `livePersonName`)
 *
 * ⭐ `includeDisabled=1` โดยตั้งใจ — คนที่ลาออกแล้วยังต้องอ่านชื่อออกจากดีล/ลีดเก่า
 * ถ้าไม่รวมมาด้วยจะถอยไปใช้ชื่อ snapshot ที่ค้างอยู่ ซึ่งคือปัญหาที่กำลังแก้พอดี
 * (ต่างจาก dropdown มอบหมายงานที่ต้องซ่อนคนออกแล้ว จึงไม่ใช้ hook นี้)
 *
 * ยิงไม่ผ่าน (role ที่ไม่มี `pm:view`) → คืน [] แล้วผู้เรียกถอยไปชื่อที่เก็บไว้เอง
 * ไม่ใช่จอว่าง. ตัว fetch มี cache ทั้งฝั่ง browser (apiCache) และ server (5 นาที)
 */
export default function usePeopleDirectory() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    let alive = true;
    cachedFetchJson("/api/pm/assignable-users?includeDisabled=1")
      .then((rows) => { if (alive) setUsers(Array.isArray(rows) ? rows : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return users;
}
