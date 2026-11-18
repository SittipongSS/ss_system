"use client";
// ── ทะเบียนหมวดสินค้าฝั่งจอ — ที่เดียวที่จอโหลดไว้ "ตั้งชื่อหมวด" ──────────────
//
// ⭐ มติเจ้าของ 18/11/2026: หมวดสินค้าต้องโชว์ **รหัส + ชื่อ** เสมอทั้งระบบ
// จอที่มีแต่รหัสในมือ (เช่น `formula.categoryCode`) เรียก hook นี้แล้วส่งรายการเข้า
// `categoryCodeLabel(code, categories)` (lib/master/productCategoryOptions)
//
// ใช้แคชร่วม (`cachedFetchJson`) — หมวดเป็น master ที่แทบไม่เปลี่ยน หลายจอเปิดพร้อมกันยิงครั้งเดียว
// โหลดพลาด = รายการว่าง ⇒ ป้ายถอยเป็นรหัสดิบ (ไม่ทำให้ทั้งหน้าพัง)
import { useEffect, useState } from "react";
import { apiCache, cachedFetchJson } from "@/lib/apiCache";

export const PRODUCT_CATEGORIES_URL = "/api/master/product-types";

export function useProductCategories() {
  const [categories, setCategories] = useState(() => {
    const cached = apiCache.get(PRODUCT_CATEGORIES_URL);
    return Array.isArray(cached) ? cached : [];
  });
  useEffect(() => {
    let alive = true;
    cachedFetchJson(PRODUCT_CATEGORIES_URL)
      .then((d) => { if (alive && Array.isArray(d)) setCategories(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return categories;
}
