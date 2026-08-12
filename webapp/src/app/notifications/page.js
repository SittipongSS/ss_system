"use client";

// ── หน้า "ดูทั้งหมด" ของกล่องแจ้งเตือน (mig 0185) ────────────────────────
//
// ⭐ **ทำไมต้องมีหน้านี้** — กระดิ่งบนแถบบนแสดงได้แค่ 30 แถวล่าสุด แต่ตัวเลขบนกระดิ่ง
// นับ "ยังไม่อ่าน" ทั้งหมดไม่จำกัด ⇒ ตรวจข้อมูลจริง 2026-08-12 พบคนที่มี 173 แถว
// ยังไม่อ่าน กดเข้าไปไล่อ่านได้จริงแค่ 30 ที่เหลือ **เข้าไม่ถึงเลย** เหลือทางเดียวคือ
// กด "อ่านทั้งหมด" ซึ่งล้างของที่ยังไม่ได้อ่านทิ้งไปด้วย
//
// ⚠️ หน้านี้ไม่ได้ตัดสิทธิ์อะไรเอง — API ตัดขอบเขตด้วย user ที่ล็อกอินเสมอ
// (`/api/notifications` ไม่รับพารามิเตอร์ `userId` โดยเจตนา)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, Check } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Segmented from "@/components/ui/Segmented";
import { notifyToast } from "@/lib/feedback";
import { describeResponseError } from "@/lib/fetchError";
import { fmtDate, fmtDateTime } from "@/lib/format";
import styles from "./page.module.css";

const pad = (n) => String(n).padStart(2, "0");
/** คีย์วันตาม **เวลาท้องถิ่น** — ห้ามใช้ toISOString().slice(0,10) (นั่นคือวัน UTC) */
const dayKey = (value) => {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};
const hhmm = (value) => {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? "" : `${pad(at.getHours())}:${pad(at.getMinutes())}`;
};

/* ⚠️ **ห้ามกลืน error เป็นลิสต์ว่าง** — หน้าที่ขึ้นว่า "ไม่มีแจ้งเตือน" ตอน API ล่ม
   อ่านได้ว่า "ไม่มีงานค้าง" ซึ่งตรงข้ามกับความจริง (บทเรียนเดียวกับหน้าแจ้งปัญหา)
   API ตอบ 200 พร้อม `unavailable` ตอนตารางยังไม่ถูกสร้าง — ตรงนั้นก็ไม่ใช่ "ว่าง" */
async function fetchPage({ scope, cursor }) {
  const params = new URLSearchParams();
  if (scope === "unread") params.set("scope", "unread");
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/notifications?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await describeResponseError(res, "โหลดแจ้งเตือนไม่สำเร็จ"));
  const body = await res.json().catch(() => ({}));
  if (body.unavailable) throw new Error("อ่านกล่องแจ้งเตือนไม่ได้ตอนนี้ — ลองใหม่อีกครั้ง");
  return body;
}

// จัดกลุ่มตามวัน — ของมาเรียงใหม่ก่อนอยู่แล้ว กลุ่มจึงเรียงตามไปเอง
function groupByDay(items) {
  const groups = [];
  for (const row of items) {
    const key = dayKey(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, rows: [row] });
  }
  return groups;
}

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState(null);
  const [scope, setScope] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  // วันนี้/เมื่อวานต้องอ่านนาฬิกา — จับใน effect (กฎ react-hooks/purity ห้าม
  // Date.now() ระหว่าง render · แพตเทิร์นเดียวกับ nowMs ในหน้าดีล)
  const [todayKey, setTodayKey] = useState(null);
  useEffect(() => { setTodayKey(dayKey(new Date())); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const body = await fetchPage({ scope });
      setItems(body.items || []);
      setUnread(body.unread || 0);
      setTotal(body.total || 0);
      setCursor(body.hasMore ? body.nextCursor : null);
    } catch (e) {
      setError(e.message);
      setItems([]);
    } finally { setLoading(false); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const body = await fetchPage({ scope, cursor });
      // ต่อท้ายเสมอ — กุญแจหน้าถัดไปผูกกับแถวสุดท้ายที่ได้มาแล้ว จึงไม่ซ้ำของเดิม
      setItems((prev) => [...prev, ...(body.items || [])]);
      setUnread(body.unread || 0);
      setTotal(body.total || 0);
      setCursor(body.hasMore ? body.nextCursor : null);
    } catch (e) { notifyToast.error(e.message); } finally { setLoadingMore(false); }
  };

  const patch = async (payload, fallback) => {
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await describeResponseError(res, fallback));
  };

  const readAll = async () => {
    setBusy(true);
    try {
      await patch({ action: "read_all" }, "ทำเครื่องหมายอ่านแล้วไม่สำเร็จ");
      notifyToast.success("ทำเครื่องหมายว่าอ่านแล้วทั้งหมด");
      await load();
    } catch (e) { notifyToast.error(e.message); } finally { setBusy(false); }
  };

  /* ทีละแถว — จำเป็นเพราะแจ้งเตือนบางชนิดปลายทางไม่มีเธรดให้เปิด (`lead_overdue`
     ชี้ไปหน้าคิว · `service_visit` ชี้ไปตาราง) ⇒ เปิดไปแล้วตัวเลขก็ไม่ลด
     ⚠️ อัปเดตในหน้าเลย ไม่โหลดใหม่ทั้งกอง — ไม่งั้นแถวที่กดกระโดดหายทันทีในโหมด
     "ยังไม่อ่าน" ระหว่างที่ตายังอยู่บรรทัดนั้น (ของหายใต้เมาส์ = อ่านต่อไม่ถูก) */
  const readOne = async (id) => {
    setBusyId(id);
    const at = new Date().toISOString();
    try {
      await patch({ action: "read_one", id }, "ทำเครื่องหมายอ่านแล้วไม่สำเร็จ");
      setItems((prev) => prev.map((row) => (row.id === id ? { ...row, readAt: at } : row)));
      setUnread((n) => Math.max(0, n - 1));
    } catch (e) { notifyToast.error(e.message); } finally { setBusyId(null); }
  };

  const dayLabel = (key) => {
    if (!key) return "";
    if (todayKey && key === todayKey) return "วันนี้";
    if (todayKey) {
      const yesterday = new Date(`${todayKey}T00:00:00`);
      yesterday.setDate(yesterday.getDate() - 1);
      if (key === dayKey(yesterday)) return "เมื่อวาน";
    }
    return fmtDate(`${key}T00:00:00`);
  };

  const groups = groupByDay(items);

  return (
    <Workspace
      icon={<Bell size={22} />}
      title="แจ้งเตือน"
      subtitle={`ทั้งหมด ${total} รายการ · ยังไม่อ่าน ${unread}`}
      headerRight={unread > 0 ? (
        <Button variant="quiet" icon={<Check size={15} />} disabled={busy} onClick={readAll}>
          อ่านทั้งหมด
        </Button>
      ) : null}
      toolbar={(
        <Segmented
          options={[
            { value: "all", label: "ทั้งหมด", count: total },
            { value: "unread", label: "ยังไม่อ่าน", count: unread },
          ]}
          value={scope}
          onChange={setScope}
          ariaLabel="กรองแจ้งเตือน"
        />
      )}
      loading={loading}
    >
      {error && <p className={styles.error} role="alert">{error}</p>}

      {!error && !items.length && (
        <EmptyState icon={BellOff}>
          {scope === "unread" ? "อ่านครบแล้ว ไม่มีรายการค้าง" : "ยังไม่มีแจ้งเตือน"}
        </EmptyState>
      )}

      {groups.map((group) => (
        <section key={group.key} className={styles.group}>
          <h2 className={styles.dayHead}>{dayLabel(group.key)}</h2>
          <ul className={styles.list}>
            {group.rows.map((row) => {
              const body = (
                <>
                  <span className={styles.title}>{row.title}</span>
                  {row.body && <span className={styles.body}>{row.body}</span>}
                  {/* ⚠️ ไม่มีชิปชนิด entity ตรงนี้โดยเจตนา — หัวข้อที่เก็บไว้ในแถว
                      ขึ้นต้นด้วยป้ายชนิดอยู่แล้ว ("อนุมัติ · **ดีล** KA_…") ใส่ชิปอีก
                      = อ่านคำเดิมสองครั้งต่อแถว */}
                  <span className={styles.meta}>
                    {row.actorName ? `${row.actorName} · ` : ""}
                    <time dateTime={row.createdAt} title={fmtDateTime(row.createdAt)}>{hhmm(row.createdAt)}</time>
                  </span>
                </>
              );
              return (
                <li key={row.id} className={`${styles.item} ${row.readAt ? "" : styles.itemUnread}`.trim()}>
                  {/* กดแถว = ไปที่ของจริง · การ mark read ของเธรดยังเกิดที่หน้าปลายทาง
                      (มติ 15) ปุ่มถูกใจด้านขวาจึงมีไว้สำหรับแถวที่ปลายทางไม่มีเธรด */}
                  {row.href
                    ? <Link href={row.href} className={styles.link}>{body}</Link>
                    : <div className={styles.link}>{body}</div>}
                  {!row.readAt && (
                    <Button
                      variant="quiet"
                      size="sm"
                      iconOnly
                      icon={<Check size={15} />}
                      className={styles.readBtn}
                      disabled={busyId === row.id}
                      onClick={() => readOne(row.id)}
                      aria-label="ทำเครื่องหมายว่าอ่านแล้ว"
                      title="ทำเครื่องหมายว่าอ่านแล้ว"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {cursor && (
        <div className={styles.more}>
          <Button disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? "กำลังโหลด…" : "โหลดเพิ่ม"}
          </Button>
        </div>
      )}
    </Workspace>
  );
}
