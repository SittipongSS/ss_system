"use client";
// ── หน้าต่างบังคับรีเฟรชเมื่อแอดมินกด "บังคับรีเฟรชทุกคน" — กติกาอยู่ lib/ui/forceRefresh.js ─────────
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/apiFetch";
import {
  FORCE_REFRESH_ISSUED_EVENT,
  FORCE_REFRESH_MIN_GAP_MS,
  FORCE_REFRESH_POLL_MS,
  isNewerSignal,
} from "@/lib/ui/forceRefresh";

export default function ForceRefreshWatcher() {
  const [forced, setForced] = useState(false);
  // เวลาสั่งล่าสุดที่แท็บนี้รู้ตอนเปิด — undefined = ยังถามไม่สำเร็จ (ครั้งแรกที่ถามได้คือเส้นตั้งต้น ไม่เด้ง)
  const baseline = useRef(undefined);

  useEffect(() => {
    let alive = true;
    let lastAt = 0;
    const check = async () => {
      if (document.hidden) return; // แท็บซ่อน = ไม่ยิง · กลับมาดูเมื่อไรค่อยถาม
      const now = Date.now();
      if (now - lastAt < FORCE_REFRESH_MIN_GAP_MS) return;
      lastAt = now;
      try {
        const res = await apiFetch("/api/users/force-refresh", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!alive || !data || !("at" in data)) return;
        if (baseline.current === undefined) {
          baseline.current = data.at ?? null;
          return;
        }
        if (isNewerSignal(baseline.current, data.at)) setForced(true);
      } catch {
        // เน็ตสะดุด — รอบหน้าค่อยถามใหม่ · ไม่ขึ้น error ให้คนใช้เห็น (ไม่ใช่งานของเขา)
      }
    };
    check();
    const timer = window.setInterval(check, FORCE_REFRESH_POLL_MS);
    const onBack = () => {
      if (!document.hidden) check();
    };
    // แท็บของแอดมินที่เพิ่งกดเอง: รู้เวลาใหม่แล้ว ไม่ต้องเด้งหน้าต่างใส่คนกด (แท็บอื่นของแอดมินยังเด้งตามปกติ)
    const onIssued = (event) => {
      if (event?.detail?.at) baseline.current = event.detail.at;
      setForced(false);
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    window.addEventListener(FORCE_REFRESH_ISSUED_EVENT, onIssued);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
      window.removeEventListener(FORCE_REFRESH_ISSUED_EVENT, onIssued);
    };
  }, []);

  /* ⚠️ ปิดไม่ได้ (dismissible={false}: ไม่มีปุ่ม X · Esc/คลิกนอกกล่องไม่ปิด) — ทางเดียวคือรีเฟรช
     (มติเจ้าของ: "บังคับรีเฟรชแบบ modal") · onClose ต้องมีตามสัญญาของ Modal แต่ไม่มีทางถูกเรียก */
  return (
    <Modal
      open={forced}
      onClose={() => {}}
      dismissible={false}
      size="sm"
      title="ต้องรีเฟรชหน้าจอ"
      footer={(
        <Button tone="primary" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={() => window.location.reload()}>
          รีเฟรชตอนนี้
        </Button>
      )}
    >
      <p>ผู้ดูแลระบบสั่งให้ทุกหน้าจอรีเฟรช เพื่อใช้ระบบเวอร์ชันล่าสุดและสิทธิ์ล่าสุด — กดรีเฟรชเพื่อใช้งานต่อ</p>
    </Modal>
  );
}
