"use client";
// ── ความกว้างจอที่ JS ต้องรู้ — อ่านจาก `matchMedia` ผ่าน `useSyncExternalStore` ──────────────────────
//
// ⭐ ใช้เมื่อ **โครงคอมโพเนนต์** เปลี่ยนตามจอ ไม่ใช่แค่หน้าตา (หน้าตาอย่างเดียว = @media ใน CSS พอ) —
//   จอหน้างาน (แผน §10.5 · §3.1) สลับ "สองหน้า ↔ สองบาน" ที่ 1000px และรางหัวหน้าที่ 1200px แต่ต้องเป็น
//   **ต้นไม้เดียวกัน** ⇒ หมุนแท็บเล็ตแล้วหน้าพื้นที่ไม่ถูกสร้างใหม่ ค่าที่ช่างพิมพ์ค้างไม่หาย
// ⚠️ **เส้นตัดใช้ค่าชุดเดียวกับ CSS เท่านั้น** (680 · 1000 · 1200 สำหรับงานใหม่) — เส้นใน JS ที่ต่างจาก @media
//    ไปหนึ่งพิกเซลคือช่วงที่ JS ว่าสองบานแต่ CSS ยังวาดหน้าเดียว (audit:ui นับค่าจุดตัดจอใน CSS ไว้แล้ว)
// ⚠️ ฝั่ง server ตอบ `false` เสมอ — อ่าน matchMedia ตอนวาดตรง ๆ ทำให้ HTML จาก server ไม่ตรงกับตอน hydrate
//    (ท่าเดียวกับ `MobileBottomNav` · `/service/import`) · หน้าที่ใช้ควรโชว์โครงรอข้อมูลก่อน ไม่มีจังหวะกะพริบ
import { useSyncExternalStore } from "react";

const stores = new Map();
const hasMatchMedia = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * ตัวฟัง/ตัวอ่านของหนึ่งเงื่อนไข — **ตัวเดิมทุกครั้ง** ต่อเงื่อนไขเดียวกัน
 * (`useSyncExternalStore` ถอด/ผูกตัวฟังใหม่ทุกครั้งที่ `subscribe` เปลี่ยนตัว = ผูกใหม่ทุกรอบวาด)
 * @param {string} query เช่น `(min-width: 1000px)`
 */
export function mediaQueryStore(query) {
  let store = stores.get(query);
  if (!store) {
    store = {
      subscribe(onChange) {
        if (!hasMatchMedia()) return () => {};
        const list = window.matchMedia(query);
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
      },
      read() {
        return hasMatchMedia() ? window.matchMedia(query).matches : false;
      },
      readOnServer() {
        return false;
      },
    };
    stores.set(query, store);
  }
  return store;
}

/** @param {string} query @returns {boolean} */
export function useMediaQuery(query) {
  const store = mediaQueryStore(query);
  return useSyncExternalStore(store.subscribe, store.read, store.readOnServer);
}

export default useMediaQuery;
