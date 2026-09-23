"use client";
import { useEffect, useState } from "react";
import { cachedFetchJson } from "@/lib/apiCache";

const DIRECTORY_URL = "/api/pm/assignable-users?includeDisabled=1";

/* สถานะตั้งต้น = **กำลังโหลด** ไม่ใช่ "ไม่มีใคร" — จอที่ต้องแยกสองอย่างนี้ (โมดัลลงคิว) อ่านธงนี้ */
export const PEOPLE_DIRECTORY_LOADING = Object.freeze({ users: [], loading: true, error: false });

/**
 * ผลของการโหลดทะเบียนคนหนึ่งรอบ — ตรรกะล้วน (เทสต์ได้โดยไม่มี React)
 * @param fetcher `() => Promise<rows>`
 * @param prev    รายชื่อที่มีอยู่ก่อน — โหลดพังแล้ว **ไม่ทิ้ง** (ผู้เรียกเดิมถอยไปชื่อที่เก็บไว้เอง)
 * @returns `{ users, loading: false, error }` · ไม่ใช่อาร์เรย์ = ว่าง (ไม่ใช่พัง)
 */
export async function loadPeopleDirectory(fetcher, prev = []) {
  try {
    const rows = await fetcher();
    return { users: Array.isArray(rows) ? rows : [], loading: false, error: false };
  } catch {
    return { users: prev, loading: false, error: true };
  }
}

/**
 * ทะเบียนคนพร้อมสถานะ — `{ users, loading, error }`
 *
 * 🐞 รีวิว 24/09: โมดัลลงคิวกลาง (`CommitDueDialog`) แยก "ยังโหลด" · "โหลดพัง" · "ไม่มีใครเลย" แต่หน้าใบ
 *    คำร้องส่งได้แค่รายชื่อ (ตัวเดิมกลืน error และไม่มีธงกำลังโหลด) ⇒ ทะเบียนช้า/พัง = โมดัลบอกเด็ดขาดว่า
 *    ยังไม่มีบัญชีฝ่าย TS ซึ่งไม่จริง · จอที่ต้องแยกสามสถานะใช้ตัวนี้ · ที่เหลือใช้ `usePeopleDirectory`
 */
export function usePeopleDirectoryState() {
  const [state, setState] = useState(() => ({ ...PEOPLE_DIRECTORY_LOADING, users: [] }));
  useEffect(() => {
    let alive = true;
    loadPeopleDirectory(() => cachedFetchJson(DIRECTORY_URL))
      .then((next) => {
        if (!alive) return;
        // พังแล้วคงรายชื่อเดิมไว้ (อาร์เรย์ตัวเดิม — ผู้เรียกที่ memo ด้วยรายชื่อไม่ต้องคำนวณใหม่)
        setState((prev) => (next.error ? { ...next, users: prev.users } : next));
      });
    return () => { alive = false; };
  }, []);
  return state;
}

/**
 * รายชื่อผู้ใช้สำหรับแปลง id → **ชื่อปัจจุบัน** บนหน้าจอ (คู่กับ `livePersonName`)
 *
 * ⭐ `includeDisabled=1` โดยตั้งใจ — คนที่ลาออกแล้วยังต้องอ่านชื่อออกจากดีล/ลีดเก่า
 * ถ้าไม่รวมมาด้วยจะถอยไปใช้ชื่อ snapshot ที่ค้างอยู่ ซึ่งคือปัญหาที่กำลังแก้พอดี
 * (ต่างจาก dropdown มอบหมายงานที่ต้องซ่อนคนออกแล้ว จึงไม่ใช้ hook นี้)
 *
 * ยิงไม่ผ่าน (role ที่ไม่มี `pm:view`) → คืน [] แล้วผู้เรียกถอยไปชื่อที่เก็บไว้เอง
 * ไม่ใช่จอว่าง. ตัว fetch มี cache ทั้งฝั่ง browser (apiCache) และ server (5 นาที)
 * ⚠️ ต้องแยก "ยังโหลด/พัง" ออกจาก "ไม่มีใคร" ⇒ ใช้ `usePeopleDirectoryState`
 */
export default function usePeopleDirectory() {
  return usePeopleDirectoryState().users;
}
