"use client";
/* ── แถบ "หน้าที่คุณกดเปิดไม่ได้" ─────────────────────────────────────────
 *
 * 🐞 proxy เด้งคนที่สิทธิ์ไม่ถึงไป /home (หรือ /settings) มาตลอด **โดยไม่บอกอะไรเลย**
 * ผู้ใช้เห็นแค่หน้าที่ตัวเองไม่ได้กด แล้วเดาเองว่าลิงก์เสีย — เคยกลายเป็นใบแจ้งปัญหา
 * จริงสองรอบ (`/rd` และ `/notifications` ตกจาก OPEN_PAGES) กว่าจะรู้ว่าเป็นเรื่องสิทธิ์
 *
 * ตอนนี้ proxy พก `?denied=<path>` มาด้วย หน้าปลายทางจึงบอกได้ว่าเด้งมาเพราะอะไร
 * (กฎ: docs/ui-visibility-rule.md — ติดด่านแล้วต้องแจ้ง ห้ามเงียบ)
 *
 * ⚠️ อ่านจาก `window.location` ใน useEffect ไม่ใช่ `useSearchParams()` — ฮุกนั้น
 * บังคับให้หน้าที่เรียกต้องมี <Suspense> ครอบ ซึ่งหน้าแรก/หน้าตั้งค่าไม่มี
 */
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";

export default function DeniedNotice() {
  const [path, setPath] = useState("");
  useEffect(() => {
    try {
      const denied = new URLSearchParams(window.location.search).get("denied");
      // รับเฉพาะ path ในระบบเดียวกัน — กัน `?denied=https://…` ที่พาคนไปอ่านชื่อโดเมนอื่น
      if (denied && denied.startsWith("/") && !denied.startsWith("//")) setPath(denied);
    } catch { /* ไม่มี search string ก็ไม่ต้องขึ้นแถบ */ }
  }, []);
  if (!path) return null;
  return (
    <AlertBanner tone="warning" icon={ShieldAlert}>
      เปิดหน้า <strong>{path}</strong> ไม่ได้ — บัญชีนี้ไม่มีสิทธิ์เข้าถึง
      จึงพากลับมาหน้านี้แทน · ติดต่อผู้ดูแลระบบถ้าคิดว่าควรเข้าได้
    </AlertBanner>
  );
}
