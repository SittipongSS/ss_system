"use client";
// ── แถบ "ระบบอัปเดตแล้ว" + รีโหลดเต็มหน้าเมื่อเปลี่ยนหน้า — กติกาอยู่ lib/ui/versionWatch.js ──────────
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/apiFetch";
import {
  VERSION_MIN_GAP_MS,
  VERSION_POLL_MS,
  canAutoReload,
  isNewVersion,
  markAutoReload,
} from "@/lib/ui/versionWatch";

/* ฝังตอน build (next.config.mjs → env) = VERCEL_GIT_COMMIT_SHA ของ deploy ที่แท็บนี้โหลดมา
   ⚠️ เครื่อง dev/พรีวิวที่ไม่มีค่า = ปิดทั้งตัว (ไม่ถาม ไม่มีแถบ) — /api/version ก็ตอบ null อยู่แล้ว */
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "";

function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export default function VersionWatcher() {
  const pathname = usePathname();
  const [latest, setLatest] = useState(null);
  // หน้าที่อยู่ตอนรู้ว่ามีเวอร์ชันใหม่ — ออกจากหน้านี้เมื่อไรค่อยรีโหลด
  const seenOn = useRef(null);

  useEffect(() => {
    if (!BUILD_SHA) return undefined;
    let alive = true;
    let lastAt = 0;
    const check = async () => {
      if (document.hidden) return; // แท็บซ่อน = ไม่ยิง · กลับมาดูเมื่อไรค่อยถาม
      const now = Date.now();
      if (now - lastAt < VERSION_MIN_GAP_MS) return;
      lastAt = now;
      try {
        const res = await apiFetch("/api/version", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (alive && isNewVersion(BUILD_SHA, data?.sha)) setLatest(data.sha);
      } catch {
        // เน็ตสะดุด — รอบหน้าค่อยถามใหม่ · ไม่ขึ้น error ให้คนใช้เห็น (ไม่ใช่งานของเขา)
      }
    };
    check();
    const timer = window.setInterval(check, VERSION_POLL_MS);
    const onBack = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, []);

  useEffect(() => {
    if (!latest) return;
    if (seenOn.current === null) {
      seenOn.current = pathname;
      return;
    }
    if (pathname === seenOn.current) return;
    /* เปลี่ยนหน้าแล้ว = ตัวกันงานหายของหน้าเดิมปล่อยให้ออกแล้ว ⇒ โหลดหน้าที่เพิ่งมาถึงใหม่ทั้งหน้า (ได้โค้ดชุดใหม่)
       ⚠️ จดก่อนรีโหลด — จดไม่ได้ (storage ถูกบล็อก) = ไม่รีโหลดเอง เหลือแถบให้กด (กันรีโหลดวน) */
    const storage = sessionStore();
    if (!canAutoReload(latest, storage) || !markAutoReload(latest, storage)) return;
    window.location.reload();
  }, [latest, pathname]);

  if (!latest) return null;
  return (
    <AlertBanner
      tone="warning"
      icon={RefreshCw}
      action={<Button size="sm" onClick={() => window.location.reload()}>รีเฟรช</Button>}
    >
      ระบบอัปเดตเป็นเวอร์ชันใหม่แล้ว — กดรีเฟรช หรือเปิดหน้าอื่น ระบบจะโหลดเวอร์ชันใหม่ให้เอง
    </AlertBanner>
  );
}
