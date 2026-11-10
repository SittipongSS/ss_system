"use client";
// ── กลุ่ม "ขอคิวติดตั้ง · รอ TS ยืนยันวัน" ในแท็บรอจัดของหน้าจัดคิว (ขั้นเข้าติดตั้ง PR-3c · ม็อก B1') ──────────────────
//
// ⭐ แผน: การ์ดกลุ่ม "คำขอติดตั้ง" แบบเดียวกับคำร้องประเมินในแท็บรอจัด — ผู้วางคิวเห็นงานที่ต้องเลือกวันจากจอเดียว
//    ไม่ต้องสลับไปงานเข้าใหม่ · ปุ่ม "ยืนยันวัน" เปิดโมดัลตัวเดียวกับแท็บรอติดตั้ง (`InstallConfirmModal` · ไม่มีฟอร์มที่สอง)
// ⚠️ แถวมาจาก GET `/api/service/install-queue` ตัวเดียวกับแท็บรอติดตั้ง (ขั้นคำนวณที่ server) — ที่นี่หยิบเฉพาะขั้นรอ TS
//    · สวิตช์ปิด / ไม่มีงานรอ TS = ไม่มีกลุ่ม · โหลดพัง = บอกว่าไม่รู้ ไม่ใช่ซ่อนเงียบ
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wrench } from "lucide-react";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate } from "@/lib/format";
import InstallConfirmModal from "./InstallConfirmModal";
import styles from "./InstallScheduleGroup.module.css";

const slot = (row) => (row.requestedStartTime && row.requestedEndTime ? `${row.requestedStartTime}–${row.requestedEndTime}` : "ทั้งวัน");

export default function InstallScheduleGroup({ technicians = [], rosterState = "ready", canConfirm = false, onPicking, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [confirmFor, setConfirmFor] = useState(null);
  /* โมดัลเปิด = บอกหน้าแม่ให้โหลดรายชื่อช่าง (หน้าจัดคิวโหลดตอนมีคนต้องเลือกคนเท่านั้น) */
  const picking = Boolean(confirmFor);
  useEffect(() => { onPicking?.(picking); }, [picking, onPicking]);

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await apiJson("/api/service/install-queue", { fallbackError: "โหลดคำขอติดตั้งไม่สำเร็จ" }));
    } catch (e) {
      setError(e?.message || "โหลดคำขอติดตั้งไม่สำเร็จ");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data?.rows || []).filter((r) => r.stage === "awaiting_ts"), [data]);

  if (error) {
    return (
      <StatusNotice tone="warning" title="โหลดคำขอติดตั้งไม่สำเร็จ" action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}>
        {error} — การ์ดคำขอติดตั้งยังไม่ขึ้น ไม่ได้แปลว่าไม่มีคำขอรอ
      </StatusNotice>
    );
  }
  if (!data?.enabled || !rows.length) return null;

  return (
    <section className={styles.group} aria-label="ขอคิวติดตั้ง · รอ TS ยืนยันวัน" id="queue-group-install">
      <div className={styles.head}>
        <strong>ขอคิวติดตั้ง · รอ TS ยืนยันวัน</strong>
        <span className={styles.total}>{rows.length}</span>
        <span className={styles.sub}>มัดจำผ่านแล้ว — เลือกวัน เวลา ช่าง เครื่อง แล้วส่งให้ฝ่ายขายคอนเฟิร์มลูกค้า</span>
        <Link href="/service/intake?tab=install" className={`linklike ${styles.more}`}>ดูทุกขั้นที่งานเข้าใหม่</Link>
      </div>
      <ul className={styles.cards}>
        {rows.map((row) => {
          const reasked = (row.visits || []).filter((v) => v.reasked);
          const openZones = row.zones.filter((z) => z.stage === "awaiting_ts" && !z.visitId);
          return (
            <li key={row.key} className={styles.card}>
              <div className={styles.main}>
                <span className={styles.kind}><Wrench size={13} aria-hidden="true" /> ติดตั้ง</span>
                <b>{row.siteCode || ""} {row.siteName || ""}</b>
                <small>{row.customerName || ""}</small>
              </div>
              <div className={styles.when}>
                <b>ต้องการ {row.requestedDate ? fmtDate(row.requestedDate) : "ไม่ระบุ"}</b>
                <small>{slot(row)}{row.requestedByName ? ` · ผู้ขอ ${row.requestedByName}` : ""}</small>
                {reasked.length && row.changeReason ? <small className={styles.warn}>ลูกค้าขอเปลี่ยนวัน: {row.changeReason}</small> : null}
              </div>
              <div className={styles.zones}>
                <b>{row.zones.length} โซน</b>
                <small>{row.zones.map((z) => z.name || z.code).filter(Boolean).join(" · ")}</small>
              </div>
              <div className={styles.gate}>
                <StatusBadge size="sm" tone="success" label="ผ่าน" />
                <small>{row.deposit?.text || "มัดจำก่อนติดตั้งผ่านแล้ว"}</small>
                <small>ขอคิวจาก {row.orderNumber || ""}</small>
              </div>
              <div className={styles.act}>
                {canConfirm ? (
                  <>
                    {reasked.map((v) => (
                      <Button key={v.id} size="sm" tone="primary" onClick={() => setConfirmFor({ row, visit: v })}>ยืนยันวันใหม่</Button>
                    ))}
                    {openZones.length ? (
                      <Button size="sm" tone={reasked.length ? undefined : "primary"} onClick={() => setConfirmFor({ row, visit: null })}>ยืนยันวัน</Button>
                    ) : null}
                  </>
                ) : <small>ยืนยันวันได้เฉพาะหัวหน้า TS / ผู้วางคิว</small>}
              </div>
            </li>
          );
        })}
      </ul>

      {confirmFor ? (
        <InstallConfirmModal
          key={`${confirmFor.row.key}|${confirmFor.visit?.id || "new"}`}
          row={confirmFor.row}
          visit={confirmFor.visit}
          technicians={technicians}
          rosterState={rosterState}
          todayIso={data.todayIso}
          onClose={() => setConfirmFor(null)}
          onSaved={async () => { setConfirmFor(null); await load(); onChanged?.(); }}
        />
      ) : null}
    </section>
  );
}
