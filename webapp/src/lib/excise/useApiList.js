"use client";
import { useCallback, useEffect, useState } from "react";
import { apiCache, primeCache } from "@/lib/apiCache";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";

// Cache-first list fetch (stale-while-revalidate): paints instantly from
// apiCache, then refreshes in the background. `reload()` forces a refetch and is
// returned for use after mutations. Each URL fetches independently so one
// failure doesn't blank the others.
//
// ⭐ **สัญญาณ "กลับมามองแท็บ" ติดที่นี่ ไม่ใช่ทีละหน้า** (2026-08-28) — ทุกหน้าของ
// โมดูลภาษีอ่านข้อมูลผ่านฮุกตัวนี้ตัวเดียว ⇒ ติดที่นี่ครั้งเดียวได้ครบทั้งโมดูล และ
// หน้าใหม่ที่ใช้ฮุกนี้ได้สัญญาณฟรีโดยไม่ต้องจำ (ทะเบียนหน้าใน revalidateWiring.test.mjs
// บังคับไว้ว่าไฟล์นี้ต้องมีสัญญาณ)
// อาการที่ปิด: คิวขึ้นทะเบียนเปิดค้างไว้ทั้งวันแล้วไม่รู้ว่ามีใบใหม่เข้ามา — ฝ่าย RA
// ต้อง F5 เอง ซึ่งไม่มีอะไรบอกให้ทำ
//
// ⚠️ `url` เป็น falsy = **ไม่ยิงเลย** (ไม่ใช่ยิง URL ว่าง) — ใช้กับข้อมูลที่ต้องการ
// เฉพาะตอนเปิดโมดัล เช่นลิสต์สินค้า/ลูกค้าของ picker ที่ไม่ควรโหลดตอนเปิดหน้า
export function useApiList(url) {
  const [data, setData] = useState(() => (url ? apiCache.get(url) : null) ?? []);
  const [loading, setLoading] = useState(() => !!url && !apiCache.has(url));
  const [error, setError] = useState(null);

  const reload = useCallback(async (opts) => {
    if (!url) return null;
    // โหมดเบื้องหลังห้ามพาหน้าไปอยู่สถานะโหลด — จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร
    // ถ้าปล่อยให้เข้า loading ตารางจะหายแล้วโผล่ใหม่ทุกครั้งที่สลับแท็บกลับมา
    if (!opts?.background) setLoading(true);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || `โหลดข้อมูลไม่สำเร็จ (${r.status})`);
      const json = await r.json();
      const arr = Array.isArray(json) ? json : [];
      primeCache(url, arr); // อัปเดต timestamp ให้ cachedFetchJson นับว่าสด
      setData(arr);
      setError(null);
      return arr;
    } catch (e) {
      // รอบเบื้องหลังที่ล้ม (เน็ตสะดุดตอนสลับแท็บ) ต้องเงียบ — ผู้ใช้ไม่ได้สั่งอะไรเลย
      // การขึ้นแบนเนอร์ error ทับหน้าที่เขากำลังอ่านอยู่แย่กว่าปล่อยข้อมูลเดิมค้างไว้
      if (!opts?.background) setError(e?.message || "เกิดข้อผิดพลาด");
      return null;
    } finally {
      if (!opts?.background) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) { setData([]); setLoading(false); return; }
    reload();
  }, [reload, url]);

  useRevalidateOnFocus(reload);

  return { data, loading, error, reload, setData };
}
