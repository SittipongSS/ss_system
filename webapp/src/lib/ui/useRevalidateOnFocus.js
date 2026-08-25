"use client";
import { useEffect, useRef } from "react";
import { DEFAULT_MIN_GAP_MS, shouldRevalidate } from "./revalidateSignal";

/**
 * ดึงข้อมูลของหน้าใหม่เมื่อผู้ใช้กลับมามองแท็บนี้
 *
 * ```js
 * const load = useCallback(async (opts) => {
 *   if (!opts?.background) setLoading(true);   // ← โหมดเบื้องหลังห้ามพาหน้าไปอยู่สถานะโหลด
 *   ...
 * }, [month]);
 * useEffect(() => { load(); }, [load]);
 * useRevalidateOnFocus(load);
 * ```
 *
 * ⚠️ **ต้องเรียก `load` แบบ `{ background: true }` เสมอ** — จอมีของอยู่แล้วและผู้ใช้
 * ไม่ได้สั่งอะไร ถ้าปล่อยให้เข้าสถานะ `loading` ตารางจะหายไปแล้วโผล่ใหม่ทุกครั้งที่
 * สลับแท็บกลับมา ⇒ แก้เรื่อง "ข้อมูลเก่า" แล้วได้เรื่อง "จอกระพริบ" มาแทน
 *
 * ⚠️ **จับ `load` ไว้ใน ref ไม่ใช่ deps** — หน้ารายการสร้าง `load` ตัวใหม่ทุกครั้งที่
 * ตัวกรองขยับ ถ้าเอาเข้า deps ตัวจับสัญญาณจะถูกถอด/ติดตั้งใหม่ทุกรอบ และ `lastAt`
 * จะถูกรีเซ็ตไปด้วย (คอกกั้นกลายเป็นไม่มีผล)
 *
 * ⚠️ ตัวนับ `lastAt` เริ่มที่ "ตอนนี้" — หน้าเพิ่ง mount = เพิ่งโหลดไป ยังไม่ต้องยิงซ้ำ
 */
export default function useRevalidateOnFocus(load, { minGapMs = DEFAULT_MIN_GAP_MS } = {}) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const lastAt = useRef(null);

  useEffect(() => {
    if (lastAt.current === null) lastAt.current = Date.now();
    const tick = () => {
      const now = Date.now();
      if (!shouldRevalidate(document.visibilityState, lastAt.current, now, minGapMs)) return;
      lastAt.current = now;
      loadRef.current?.({ background: true });
    };
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [minGapMs]);
}
