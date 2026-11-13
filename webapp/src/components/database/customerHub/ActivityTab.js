"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessagesSquare, Paperclip } from "lucide-react";
import Segmented from "@/components/ui/Segmented";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import EmptyState from "@/components/ui/EmptyState";
import { DetailCard } from "@/components/ui/DetailPage";
import { apiJson } from "@/lib/apiFetch";
import { updateKindMeta, DELETED_UPDATE_TEXT } from "@/lib/master/updateTypes";
import { fmtDayTime, naText } from "@/lib/format";
import styles from "./customerHub.module.css";

/* ── แท็บความเคลื่อนไหว · รวมทุกเธรดของลูกค้า (งวด H3 · มติเจ้าของ 13/11/2026 ข้อ 7) ─────────────────────────
 *
 * ⭐ ชิปแหล่ง (ทั้งหมด · ดีล · คำร้อง · ลีด · ลูกค้า · ทะเบียน) + โหลดเพิ่มทีละ 50 · เรียงใหม่ไปเก่า
 * ⭐ แถวในสายรวม **อ่านอย่างเดียว** — ตอบ/แก้ข้อความทำที่ใบต้นทาง (ลิงก์บนแถว) ซึ่งมีด่านโพสต์ · @ · ไฟล์แนบ ของใบนั้นครบ
 *    ชิป "ลูกค้า" เปิดเธรดลูกค้าตัวเต็ม (UpdateThread ของหน้า — พิมพ์ · แนบไฟล์ · กล่าวถึงคน ได้เหมือนเดิม)
 * ⚠️ สิทธิ์อ่านรายเธรดตัดสินที่ server ด้วยทะเบียนเธรดกลาง — จอไม่กรองเอง
 * ⚠️ การเปิดแท็บนี้ไม่มาร์คแจ้งเตือนว่าอ่านแล้ว (ต่างจากการเปิดเธรดรายใบ) — ตั้งใจ: เห็นในสายรวม ≠ เปิดอ่านใบนั้น
 */
const SOURCE_LABELS = {
  all: "ทั้งหมด",
  deal: "ดีล",
  dept_request: "คำร้อง",
  lead: "ลีด",
  customer: "ลูกค้า",
  excise_registration: "ทะเบียนสรรพสามิต",
};
const SOURCE_ORDER = ["all", "deal", "dept_request", "lead", "customer", "excise_registration"];

export default function ActivityTab({ customerId, customerThread }) {
  const [source, setSource] = useState("all");
  const [items, setItems] = useState([]);
  const [sources, setSources] = useState({});
  const [counts, setCounts] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* คำขอล่าสุดเท่านั้นที่มีสิทธิ์เขียนผล — สลับชิปเร็ว ๆ แล้วคำขอเก่าตอบทีหลัง = รายการของแหล่งเก่าปนเข้ามา */
  const requestSeq = useRef(0);
  const load = useCallback(async ({ before = null, reset = false } = {}) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ source });
      if (before) params.set("before", before);
      const data = await apiJson(`/api/master/customers/${encodeURIComponent(customerId)}/activity?${params}`, {
        fallbackError: "โหลดความเคลื่อนไหวไม่สำเร็จ",
      });
      if (seq !== requestSeq.current) return;
      setItems((cur) => (reset ? data.items || [] : [...cur, ...(data.items || [])]));
      setSources((cur) => ({ ...cur, ...(data.sources || {}) }));
      if (data.counts) setCounts(data.counts);
      setNextCursor(data.nextCursor || null);
    } catch (e) {
      if (seq === requestSeq.current) setError(e.message || "โหลดความเคลื่อนไหวไม่สำเร็จ");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [customerId, source]);

  useEffect(() => {
    if (source === "customer") return;
    setItems([]);
    setNextCursor(null);
    load({ reset: true });
  }, [source, load]);

  const chips = SOURCE_ORDER
    .filter((key) => key === "all" || key === "customer" || (counts?.[key] || 0) > 0)
    .map((key) => ({ value: key, label: SOURCE_LABELS[key], count: counts ? counts[key] ?? 0 : null }));

  return (
    <div className={styles.tabBody}>
      <div className={styles.activityBar}>
        <Segmented ariaLabel="แหล่งความเคลื่อนไหว" value={source} onChange={setSource} options={chips} />
        {source !== "customer" && (
          <Button size="sm" onClick={() => setSource("customer")}>เขียนถึงลูกค้ารายนี้</Button>
        )}
      </div>

      {source === "customer" ? customerThread() : (
        <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title={`ความเคลื่อนไหว · ${SOURCE_LABELS[source]}`}>
          {error && (
            <StatusNotice tone="error" action={<Button size="sm" variant="ghost" onClick={() => load({ reset: true })}>ลองใหม่</Button>}>
              {error}
            </StatusNotice>
          )}
          {items.length ? (
            <ol className={styles.activityList}>
              {items.map((row) => {
                const origin = sources[`${row.entityType}:${row.entityId}`] || { type: row.entityType };
                const kind = updateKindMeta(row.entityType, row.kind);
                const files = Array.isArray(row.attachments) ? row.attachments.length : 0;
                return (
                  <li key={row.id} className={styles.activityItem}>
                    <time className={styles.feedWhen} dateTime={row.createdAt}>{fmtDayTime(row.createdAt)}</time>
                    <div className={styles.activityBody}>
                      <div className={styles.activityHead}>
                        <span className={styles.activitySource}>{SOURCE_LABELS[origin.type] || origin.type}</span>
                        {origin.href ? (
                          <Link prefetch={false} href={origin.href} className="linklike font-mono">{naText(origin.code || origin.title)}</Link>
                        ) : (
                          <span className="font-mono">{naText(origin.code)}</span>
                        )}
                        {origin.code && origin.title && <span className={styles.activityTitle}>{origin.title}</span>}
                      </div>
                      <strong className={styles.activityKind}>{kind.label}</strong>
                      {row.deletedAt ? (
                        <p className={styles.activityText}>{DELETED_UPDATE_TEXT}</p>
                      ) : row.body ? (
                        <p className={styles.activityText}>{row.body}</p>
                      ) : null}
                      <span className={styles.activityMeta}>
                        {row.authorName || "ระบบ"}
                        {files > 0 && <><Paperclip size={12} aria-hidden="true" />{` แนบไฟล์ ${files} รายการ`}</>}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : !loading && !error ? (
            <EmptyState plain>ยังไม่มีความเคลื่อนไหวที่คุณดูได้</EmptyState>
          ) : null}
          <div className={styles.feedActions}>
            {loading ? <span className={styles.followMeta}>กำลังโหลด…</span> : null}
            {!loading && nextCursor && (
              <Button size="sm" onClick={() => load({ before: nextCursor })}>โหลดเพิ่ม 50 รายการ</Button>
            )}
          </div>
        </DetailCard>
      )}
    </div>
  );
}
