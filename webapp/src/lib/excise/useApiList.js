"use client";
import { useCallback, useEffect, useState } from "react";
import { apiCache, primeCache } from "@/lib/apiCache";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { apiFetch } from "@/lib/apiFetch";
import { httpLoadFailure, thrownLoadFailure } from "@/lib/ui/loadFailure";

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
//
// ⭐ **ความล้มมีสองชั้น** (มติเจ้าของ 23/09/2569 "ไทยนำ + ดิบเป็นบรรทัดเล็ก" · lib/ui/loadFailure.js)
//   · `error` / `staleError` = **ประโยคไทย** ที่ขึ้นเป็นตัวเนื้อของกล่องแจ้ง — ไม่มีข้อความดิบของเซิร์ฟเวอร์อีกแล้ว
//   · `errorDetail` = ข้อความดิบ (`HTTP 500 — column orders.updatedAt does not exist`) ของความล้ม
//     **ตัวที่ `error || staleError` ชี้** ⇒ จอส่งต่อให้ `<StatusNotice detail={…}>` ขึ้นเป็นบรรทัดเล็ก
//     "รายละเอียดสำหรับแจ้งปัญหา: …" · 🔴 จอที่แสดง `error` ต้องส่ง `errorDetail` ด้วยเสมอ ไม่งั้นข้อความ
//     ที่ไขคดี orders.updatedAt ได้ในไม่กี่นาทีจะหายจากจอ (ยาม: lib/ui/apiListErrorVisible.test.mjs)
export function useApiList(url) {
  const [data, setData] = useState(() => (url ? apiCache.get(url) : null) ?? []);
  const [loading, setLoading] = useState(() => !!url && !apiCache.has(url));
  // `{ message, detail }` ของรอบหน้าบ้านที่ล้ม — แตกเป็น `error`/`errorDetail` ตอนคืนค่า
  const [failure, setFailure] = useState(null);
  /* ⭐ **"มีของในมือ" ≠ "ลิสต์ยาวกว่าศูนย์"** — ลิสต์ที่เพิ่งตอบ `200 []` คือ *รู้แล้ว*
     ว่าไม่มีแถว (จอคำนวณต่อได้ถูกต้อง) · ลิสต์ที่ยังไม่เคยโหลดสำเร็จคือ *ไม่รู้*
     🐞 ถ้าวัดด้วย `!list.length` สองอย่างนี้หน้าตาเหมือนกันเป๊ะ แล้วจอที่ตั้งใจกัน
     "เลข 0 ที่มาจากความไม่รู้" จะเผลอซ่อนเนื้อทั้งใบเพราะลิสต์ที่ **ว่างอยู่แล้วตามปกติ**
     ตอบ 500 — ของจริง: `/api/sahamit/coverage` บน prod ตอบ `200 []` ทุกวัน ⇒ 500 ของมัน
     เคยทำให้แดชบอร์ดสหมิตรทั้งจอหาย ทั้งที่ตัวเลขชุดเดียวกันเป๊ะถูกโชว์เต็มใบตอนมันตอบ []
     🪤 แคชอยู่ระดับโมดูล (อายุเท่าแท็บ) ⇒ `apiCache.has(url)` = เคยโหลดสำเร็จมาแล้วในแท็บนี้ */
  const [loaded, setLoaded] = useState(() => !!url && apiCache.has(url));
  /* รอบ **เบื้องหลัง** ที่ล้ม — แยกช่องจาก `error` เพราะจอรายการหลายจอเขียน
     `error ? null : <ตาราง>` ⇒ ยัดลง `error` = ตารางที่ผู้ใช้กำลังอ่านอยู่หายทั้งใบ
     ตอนเน็ตสะดุด · ช่องนี้แปลว่า "ของบนจอเป็นของรอบก่อน" ไม่ใช่ "ไม่มีของ" */
  const [staleFailure, setStaleFailure] = useState(null);

  const reload = useCallback(async (opts) => {
    if (!url) return null;
    // โหมดเบื้องหลังห้ามพาหน้าไปอยู่สถานะโหลด — จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร
    // ถ้าปล่อยให้เข้า loading ตารางจะหายแล้วโผล่ใหม่ทุกครั้งที่สลับแท็บกลับมา
    if (!opts?.background) setLoading(true);
    let fault;
    try {
      const r = await apiFetch(url);
      if (r.ok) {
        const json = await r.json();
        const arr = Array.isArray(json) ? json : [];
        primeCache(url, arr); // อัปเดต timestamp ให้ cachedFetchJson นับว่าสด
        setData(arr);
        setFailure(null);
        setStaleFailure(null);
        setLoaded(true);
        return arr;
      }
      // มี response แต่ไม่ ok — ประโยคไทยตาม status · ข้อความดิบทั้งก้อนไปบรรทัดรอง (ไม่ผ่าซอยสตริง)
      fault = httpLoadFailure(r.status, (await r.json().catch(() => ({})))?.error);
    } catch (e) {
      fault = thrownLoadFailure(e);
    } finally {
      if (!opts?.background) setLoading(false);
    }
    /* รอบเบื้องหลังที่ล้มต้องไม่ **พาจอไปอยู่สถานะโหลดหรือขึ้นแบนเนอร์บล็อก** ทับหน้า
       ที่ผู้ใช้กำลังอ่าน — แต่ "เงียบสนิท" คือบั๊ก 26 วันตัวเดิมที่เข้ามาทางประตูหลัง:
       🐞 แท็บที่เปิดค้างไว้ทั้งวัน (เคสที่ useRevalidateOnFocus มีไว้รับ) จะยืนยันตัวเลข
       ของเมื่อวานเป็นตัวหนา ๆ ต่อไปทั้งที่รอบใหม่ล้มทุกรอบ และไม่มีอะไรบอกเลย จนกว่า
       จะ F5 ⇒ ที่นี่บันทึกไว้คนละช่อง ให้จอเลือกพูดเองว่า "ของที่เห็นเป็นรอบก่อน"
       ⭐ ทั้งสองช่องแยกไทย/ดิบด้วยตัวเดียวกัน — บรรทัด "ของรอบก่อน" ของ #1796 ก็ได้บรรทัดรองครบ */
    if (opts?.background) setStaleFailure(fault); else setFailure(fault);
    return null;
  }, [url]);

  useEffect(() => {
    if (!url) { setData([]); setLoading(false); setLoaded(false); setStaleFailure(null); return; }
    // URL เปลี่ยน = ของที่ถืออยู่เป็นของ URL เดิม ⇒ "เคยโหลดสำเร็จ" ต้องวัดจากแคชของตัวใหม่
    setLoaded(apiCache.has(url));
    setStaleFailure(null);
    reload();
  }, [reload, url]);

  useRevalidateOnFocus(reload);

  // `errorDetail` ตามตัวที่จอแสดงจริง (`error || staleError`) — หน้าบ้านก่อน ไม่มีค่อยเป็นรอบเบื้องหลัง
  const shown = failure || staleFailure;
  return {
    data,
    loading,
    error: failure?.message ?? null,
    staleError: staleFailure?.message ?? null,
    errorDetail: shown?.detail ?? null,
    loaded,
    reload,
    setData,
  };
}
