"use client";
// ── กระดิ่งแจ้งเตือนบนแถบบน (mig 0185) ───────────────────────────────────
//
// อยู่บน **ทุกหน้า** → กติกาที่ห้ามลืม: อะไรพลาดที่นี่ต้องไม่ทำให้ header พัง
// (API ตอบ `unavailable` ตอนยังไม่รัน migration → กระดิ่งขึ้น 0 เฉย ๆ)
//
// ⚠️ ไม่มี realtime/polling ถี่ ๆ โดยเจตนา — ดึงตอน mount + ตอนเปิดกล่อง + ทุก 2 นาที
// พอสำหรับงานที่วัดกันเป็นชั่วโมง และไม่เผาโควตา Supabase ทุกแท็บที่เปิดค้างไว้
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";
import Button from "@/components/ui/Button";
import { fmtDateTime } from "@/lib/format";
import styles from "./NotificationBell.module.css";

const POLL_MS = 120_000;

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json().catch(() => null);
      setItems(d?.items || []);
      setUnread(d?.unread || 0);
    } catch { /* กระดิ่งพังต้องไม่ทำ header พัง */ }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const readAll = async () => {
    setBusy(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read_all" }),
      });
      await load();
    } catch { /* เงียบ */ } finally { setBusy(false); }
  };

  return (
    <div className={styles.wrap} ref={boxRef}>
      <button
        type="button"
        className={`topnav-global-action ${styles.trigger}`}
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `แจ้งเตือน ${unread} รายการที่ยังไม่อ่าน` : "แจ้งเตือน"}
      >
        <Bell size={17} aria-hidden="true" />
        {/* ตัวเลขบนกระดิ่ง — เกิน 99 ไม่มีประโยชน์แล้ว ตัดเป็น 99+ ให้ป้ายไม่ยืด */}
        {unread > 0 && <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="แจ้งเตือน">
          <div className={styles.head}>
            <strong>แจ้งเตือน</strong>
            {unread > 0 && (
              <Button variant="quiet" size="sm" disabled={busy} icon={<Check size={13} />} onClick={readAll}>
                อ่านทั้งหมด
              </Button>
            )}
          </div>
          {items.length ? (
            <ul className={styles.list}>
              {items.map((n) => {
                const row = (
                  <>
                    <span className={styles.title}>{n.title}</span>
                    {n.body && <span className={styles.body}>{n.body}</span>}
                    <span className={styles.meta}>
                      {n.actorName ? `${n.actorName} · ` : ""}{fmtDateTime(n.createdAt)}
                    </span>
                  </>
                );
                return (
                  <li key={n.id} className={`${styles.item} ${n.readAt ? "" : styles.itemUnread}`.trim()}>
                    {/* กดแล้วไปหน้าเธรด — การ mark read เกิดตอน "เปิดเธรด" ไม่ใช่ตอนกด
                        ในกล่อง (มติ 15) เพื่อให้ที่เดียวคุมทั้งกดจากกล่องและเปิดหน้าตรง */}
                    {n.href
                      ? <Link href={n.href} className={styles.link} onClick={() => setOpen(false)}>{row}</Link>
                      : <div className={styles.link}>{row}</div>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>ยังไม่มีแจ้งเตือน</div>
          )}
        </div>
      )}
    </div>
  );
}
