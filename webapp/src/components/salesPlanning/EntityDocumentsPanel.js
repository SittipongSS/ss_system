"use client";
// ── แท็บเอกสารของดีล — รวม 6 แหล่งไว้ที่เดียว (P5b) ──────────────────────
//
// ⭐ ไฟล์ของดีลวันนี้กระจายอยู่หลายที่โดยไม่มีหน้าไหนเห็นครบ — คนที่ถามว่า
// "เอกสารของดีลนี้มีอะไรบ้าง" ต้องเปิด 4–5 จอแล้วจำเอาเอง
//
// ⚠️ วางใน `components/salesPlanning/` **ไม่ใช่ dir ใหม่** — scripts/uiLegacyBudget.mjs
// map dir → module ⇒ dir ใหม่จะได้งบชั้นเก่าของตัวเองที่ไม่มีใครดูแล
import { useEffect, useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import { DOCUMENT_SOURCES } from "@/lib/sales/entityDocuments";
import { fmtDate } from "@/lib/format";
import styles from "./entityDocuments.module.css";

export default function EntityDocumentsPanel({ dealId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dealId) return;
    setLoading(true); setError("");
    fetch(`/api/sales-planning/documents/all?dealId=${encodeURIComponent(dealId)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || "โหลดเอกสารไม่สำเร็จ");
        return d;
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [dealId]);

  if (loading) return <SkeletonRows rows={4} />;
  if (error) return <StatusNotice tone="error">{error}</StatusNotice>;

  const rows = data?.rows || [];
  const progress = data?.progress || { arrived: 0, waiting: 0 };

  if (!rows.length) {
    return <EmptyState icon={FileText}>ดีลนี้ยังไม่มีเอกสารและไม่มีรายการที่รออยู่</EmptyState>;
  }

  return (
    <div className={styles.wrap}>
      {/* ⭐ ตัวเลขนี้เป็นไปได้ก็เพราะระบบรู้จัก "ของที่ยังไม่มา" — นับแต่ไฟล์ที่มีแล้ว
          จะได้ 100% เสมอ ซึ่งอ่านแล้วเหมือนครบทั้งที่ไม่ครบ */}
      <div className={styles.progress}>
        มาแล้ว <strong>{progress.arrived}</strong>
        {progress.waiting > 0 && <> · รอ <strong className={styles.waiting}>{progress.waiting}</strong></>}
      </div>

      <ul className={styles.list}>
        {rows.map((row) => (
          <li key={row.id} className={styles.row} data-awaiting={row.source === "awaiting" ? "" : undefined}>
            <div className={styles.main}>
              <div className={styles.title}>{row.title}</div>
              <div className={styles.meta}>
                {DOCUMENT_SOURCES[row.source]?.label || row.source}
                {row.note ? ` · ${row.note}` : ""}
                {row.at ? ` · ${fmtDate(row.at)}` : ""}
              </div>
            </div>
            {row.href && (
              <Button
                as="a" href={row.href} size="sm" variant="quiet"
                target={row.source === "awaiting" ? undefined : "_blank"}
                icon={<ExternalLink size={13} aria-hidden="true" />}
              >
                {/* ⚠️ ฉบับที่ออกจริงเป็น HTML ไม่ใช่ PDF — ห้ามเขียน "ดาวน์โหลด"
                    ผู้ใช้จะรอไฟล์ที่ไม่มีวันมา · ของที่ยังไม่มาพาไปดูคำร้อง
                    ไม่ใช่ให้เปิดใบใหม่ (คำร้องเปิดไปแล้ว จะได้ใบซ้ำ) */}
                {row.source === "awaiting" ? "ดูคำร้อง" : "เปิดดู"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
