"use client";
// ── แป้นพิมพ์บนจอขึ้น = แถบติดขอบล่างหลบ — ตัวต่อสายกับเบราว์เซอร์ (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.5) ──
//
// ⭐ **สัญญาของทั้งแอป**: ตัวนี้ติดธง `<html data-osk="up">` ตอนแป้นบนจอน่าจะขึ้นอยู่ · ของที่ต้องหลบประกาศ
//   `data-osk-hide` เอง แล้ว `globals.css` ซ่อนให้ (พร้อมเมนูล่างมือถือ และ `--mobile-nav-h` = 0)
//   ⇒ คอมโพเนนต์ไม่ต้องรู้เรื่องแป้นเลย · หน้าที่อยากได้พฤติกรรมนี้เรียก hook ตัวนี้ **ครั้งเดียว**
//   🐞 แบบที่ถูกตีกลับ 16/09: แถบ 140px ค้างอยู่ตอนแป้นขึ้น บีบช่องที่กำลังพิมพ์จนมองไม่เห็น
//   ⚠️ ต่อแป้นพิมพ์จริง (iPad) แถบ **อยู่** (มติเจ้าของ 25/09) — แป้นจริงไม่ทำให้ส่วนที่เห็นเตี้ยลง 120px
//
// 🔑 ตัวตัดสินทั้งหมดอยู่ที่ `onScreenKeyboard.js` (`oskStep` · `isTextEntry` · `oskOrientationKey`) ⇒ ที่นี่แค่
//   อ่านค่าจากเบราว์เซอร์ ส่งเข้าไป แล้วเขียนผลออก (เทสต์ยามว่าไม่มีเส้นตัดสินของตัวเองงอกขึ้นที่นี่)
// ⚠️ ธงอยู่ที่ `<html>` ตัวเดียวทั้งหน้า — เรียกซ้อนสองที่ แล้วตัวหนึ่งเลิกใช้ ธงจะถูกถอดทั้งที่อีกตัวยังฟังอยู่
//    (วันนี้มีผู้เรียกที่เดียวคือจอหน้างาน)
import { useEffect, useState } from "react";
import { OSK_START, isTextEntry, oskOrientationKey, oskStep } from "@/lib/ui/onScreenKeyboard";

/**
 * @param {{ enabled?: boolean }} [options] `enabled: false` = ไม่ฟัง และถอดธงที่ติดไว้
 * @returns {boolean} แป้นบนจอน่าจะขึ้นอยู่ไหม (ธงเดียวกับที่ `<html>`)
 */
export function useOnScreenKeyboard({ enabled = true } = {}) {
  const [up, setUp] = useState(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const root = document.documentElement;
    const viewport = window.visualViewport || null;
    let state = OSK_START;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const { state: next, rose } = oskStep(state, {
        editableFocused: isTextEntry(document.activeElement),
        orientation: oskOrientationKey({
          orientationType: window.screen?.orientation?.type,
          width: window.innerWidth,
          height: window.innerHeight,
        }),
        layoutHeight: window.innerHeight,
        visualHeight: viewport ? viewport.height : null,
        visualScale: viewport ? viewport.scale : 1,
      });
      state = next;
      if (next.up) root.dataset.osk = "up";
      else delete root.dataset.osk;
      setUp(next.up);
      if (rose) {
        /* แถบเพิ่งหลบ = เลย์เอาต์ขยับ · รอหนึ่งเฟรมให้หน้าจัดใหม่ก่อน แล้วพาช่องที่พิมพ์ให้พ้นขอบ
           `nearest` = ช่องที่เห็นอยู่แล้วไม่ถูกเลื่อน (เลื่อนเฉพาะที่จมอยู่) */
        requestAnimationFrame(() => document.activeElement?.scrollIntoView?.({ block: "nearest" }));
      }
    };
    /* โฟกัสย้ายช่อง = focusout แล้ว focusin ติดกัน · วัดทันทีทั้งสองจังหวะแล้วแถบกะพริบหนึ่งเฟรม
       ⇒ รวมทุกเหตุการณ์ไว้วัดครั้งเดียวในเฟรมถัดไป */
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    // ไม่มี visualViewport ก็ยังจำฐานได้ (ตัวตัดสินตอบ "แถบอยู่" เสมอในกรณีนั้น)
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      // ออกจากหน้าตอนแป้นยังขึ้น (กด "ย้อนกลับ" ระหว่างพิมพ์) — หน้าถัดไปต้องได้แถบคืน
      delete root.dataset.osk;
      setUp(false);
    };
  }, [enabled]);

  return up;
}

export default useOnScreenKeyboard;
