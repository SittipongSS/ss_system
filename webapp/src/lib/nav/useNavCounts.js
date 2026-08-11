"use client";
// ── ตัวเลขบนเมนูหลัก (ฝั่งจอ) ─────────────────────────────────────────────
//
// อยู่บนทุกหน้าเหมือนกระดิ่ง ⇒ กติกาเดียวกัน: **พังที่นี่ต้องไม่ทำ header พัง**
// API ตอบพัง/ยังไม่มีสิทธิ์ = ไม่มีป้ายเฉย ๆ ไม่ใช่ throw ขึ้นไปทั้งเปลือก
//
// จังหวะดึง: ตอน mount · ทุก 2 นาที (เท่ากระดิ่ง) · และ **ตอนเปลี่ยนหน้า** —
// ข้อสุดท้ายจำเป็นเพราะคนตอบคำร้องเสร็จแล้วกดออกจากหน้า ป้ายต้องลดทันที
// ไม่ใช่ค้างอีกสองนาที (ป้ายที่ค้างคือป้ายที่คนเลิกเชื่อ)
// ⚠️ มีคอกกั้น MIN_GAP_MS — หน้าที่เด้ง redirect ต่อกันสองสามทีจะได้ไม่ยิงรัว
import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 120_000;
const MIN_GAP_MS = 10_000;

// href ของเมนู → คีย์ที่ API ส่งมา · เมนูที่ไม่อยู่ในนี้ไม่มีป้าย
export const NAV_COUNT_KEYS = {
  "/requests": "requests",
  "/sa/tasks": "tasks",
  "/rd/requests": "rdRequests",
  "/sa/leads": "leads",
};

export default function useNavCounts(pathname) {
  const [counts, setCounts] = useState({});
  const lastAt = useRef(0);

  const load = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastAt.current < MIN_GAP_MS) return;
    lastAt.current = now;
    try {
      const res = await fetch("/api/nav/counts", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      // ⚠️ แทนที่ทั้งก้อน ไม่ merge — คีย์ที่หายไปแปลว่า "ไม่เหลืออะไรให้ทำแล้ว"
      // การ merge จะทำให้ป้ายเก่าค้างอยู่ตลอดกาล
      setCounts(data && typeof data === "object" ? data : {});
    } catch { /* ป้ายพังต้องไม่ทำ header พัง */ }
  }, []);

  useEffect(() => { load(true); }, [load]);
  useEffect(() => { load(); }, [pathname, load]);
  useEffect(() => {
    const timer = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  return counts;
}

/** จำนวนของเมนูหนึ่งตัว — ไม่มี/ศูนย์ = null (ผู้เรียกไม่ต้องเรนเดอร์ป้าย) */
export function navCountFor(counts, href) {
  const value = counts?.[NAV_COUNT_KEYS[href]];
  return Number(value) > 0 ? Number(value) : null;
}
