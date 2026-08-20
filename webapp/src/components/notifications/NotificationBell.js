"use client";
// ── กระดิ่งแจ้งเตือนบนแถบบน (mig 0185) ───────────────────────────────────
//
// อยู่บน **ทุกหน้า** → กติกาที่ห้ามลืม: อะไรพลาดที่นี่ต้องไม่ทำให้ header พัง
// (API ตอบ `unavailable` ตอนยังไม่รัน migration → กระดิ่งขึ้น 0 เฉย ๆ)
//
// ⭐ **กระดิ่งแสดงเฉพาะกล่อง `bell`** (คำร้องข้ามฝ่าย · เรื่องแจ้งปัญหาระบบ ·
// การมอบหมายงาน — มติผู้ใช้ 2026-08-20) — ทั้งรายการและเลขบนป้ายมาจากกล่องเดียวกันเสมอ ห้ามให้
// ป้ายนับกว้างกว่าที่กล่องแสดง · ชนิดอื่นไม่ได้หายไป อ่านได้ที่ `/notifications`
// ⚠️ ทะเบียนว่ากล่องมีชนิดไหนอยู่ที่ `lib/notifications.js` (`NOTIFICATION_BOXES`)
// ฝั่งนี้ส่งแค่ *ชื่อกล่อง* — ห้ามส่งรายชื่อ entityType มาจากเบราว์เซอร์
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
const BOX = "bell";

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?box=${BOX}`, { cache: "no-store" });
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

  const patch = (body) => fetch("/api/notifications", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  const readAll = async () => {
    setBusy(true);
    try {
      // ส่งชื่อกล่องไปด้วย — ปุ่มนี้ต้องล้างเท่าที่กล่องนี้แสดง ไม่ใช่ทั้งตาราง
      await patch({ action: "read_all", box: BOX });
      await load();
    } catch { /* เงียบ */ } finally { setBusy(false); }
  };

  /* อ่านแล้วทีละแถว — ท่าเดียวกับหน้า /notifications (ของชิ้นเดียวกันต้องทำได้เท่ากัน
     ทั้งสองที่) · จำเป็นเพราะแจ้งเตือนบางชนิดปลายทางไม่มีเธรดให้เปิด (`lead_overdue`
     ชี้ไปหน้าคิว · `service_visit` ชี้ไปตาราง) กดเข้าไปแล้วตัวเลขก็ไม่ลด
     ⚠️ อัปเดตในที่ ไม่โหลดใหม่ทั้งกอง — ไม่งั้นรายการขยับใต้เมาส์ระหว่างที่ยังอ่านอยู่ */
  const readOne = async (id) => {
    setBusyId(id);
    const at = new Date().toISOString();
    try {
      await patch({ action: "read_one", id });
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, readAt: at } : row)));
      setUnread((n) => Math.max(0, n - 1));
    } catch { /* เงียบ */ } finally { setBusyId(null); }
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
            {/* บอกขอบเขตไว้ตรง ๆ — กล่องที่กรองอยู่แต่ไม่บอก จะถูกอ่านว่า "ไม่มีอะไรเลย" */}
            <span className={styles.headText}>
              <strong>แจ้งเตือน</strong>
              <span className={styles.scope}>คำร้อง · แจ้งปัญหา · มอบหมายงาน</span>
            </span>
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
                    {!n.readAt && (
                      <Button
                        variant="quiet"
                        size="sm"
                        iconOnly
                        icon={<Check size={13} />}
                        className={styles.readBtn}
                        disabled={busyId === n.id}
                        onClick={() => readOne(n.id)}
                        aria-label="ทำเครื่องหมายว่าอ่านแล้ว"
                        title="ทำเครื่องหมายว่าอ่านแล้ว"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>ยังไม่มีแจ้งเตือนในกล่องนี้</div>
          )}

          {/* ⭐ ทางออกไปหน้าเต็ม — กล่องนี้แสดงแค่ 30 แถวล่าสุด แต่ตัวเลขบนกระดิ่ง
              นับที่ยังไม่อ่าน**ทั้งหมด** ของจริงเคยต่างกันถึง 173 ต่อ 30
              ⚠️ ต้องอยู่นอกเงื่อนไข `items.length` — คนที่ยังไม่อ่านค้างอยู่หลังแถว
              ที่ 30 จะเห็นกล่องว่างในโหมดกรองไม่ได้ ถ้าลิงก์นี้หายไปด้วยก็ตันสนิท */}
          <Link href="/notifications" className={styles.seeAll} onClick={() => setOpen(false)}>
            ดูแจ้งเตือนทั้งหมด
          </Link>
        </div>
      )}
    </div>
  );
}
