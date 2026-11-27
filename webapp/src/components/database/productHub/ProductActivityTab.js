"use client";
import { useMemo } from "react";
import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import Segmented from "@/components/ui/Segmented";
import useStickyState from "@/lib/ui/useStickyState";
import EmptyState from "@/components/ui/EmptyState";
import { DetailCard } from "@/components/ui/DetailPage";
import { fmtDateTime } from "@/lib/format";
import styles from "./productHub.module.css";

/* ── หน้าสินค้าศูนย์รวม · แท็บความเคลื่อนไหว (งวด S3 · มติเจ้าของ 18/11/2026 ข้อ 7) ─────────────────────────
 *
 * ⭐ "ทั้งหมด" = เธรดสินค้าตัวเต็ม (พิมพ์ · แนบไฟล์ · @ ได้เหมือนเดิม) + เหตุการณ์จากวันที่บนใบ QT/SO/ทะเบียน เรียงรวมในสายเดียว
 *    (ผ่าน `extraItems` ของ UpdateThread — แถวจากใบอื่นอ่านอย่างเดียว กดเปิดใบได้)
 * ⭐ ชิปอื่น = กรองตามแหล่ง: "สินค้า" = เธรดสินค้าล้วน · ใบเสนอราคา/ใบสั่งขาย/ทะเบียน = รายการเหตุการณ์ของแหล่งนั้น (อ่านอย่างเดียว)
 * ⚠️ ไม่ดึงความเห็นในเธรดของ QT/SO (มติ 7) — คุยเรื่องใบให้คุยที่ใบ · เหตุการณ์ BOM/อนุมัติอยู่ในเธรดสินค้าเองแล้ว
 * ⚠️ เหตุการณ์ของแหล่งที่ผู้ดูไม่มีสิทธิ์ไม่ถูกส่งมาตั้งแต่ตัวคำนวณ (productDocEvents) — จอไม่ตัดสินสิทธิ์เอง
 */
const SOURCE_LABELS = { all: "ทั้งหมด", product: "สินค้า", quote: "ใบเสนอราคา", order: "ใบสั่งขาย", registration: "ทะเบียนสรรพสามิต" };
const SOURCE_ORDER = ["all", "product", "quote", "order", "registration"];
const SOURCE_COLOR = { quote: "var(--blue)", order: "var(--green)", registration: "var(--amber)" };

/** เหตุการณ์ → รูปของ `extraItems` ใน UpdateThread */
export const docEventsToThreadItems = (events) => events.map((e) => ({
  id: e.key,
  at: e.at,
  label: SOURCE_LABELS[e.source] || "",
  color: SOURCE_COLOR[e.source],
  body: `${e.code} · ${e.text}`,
  href: e.href || null,
  linkLabel: e.href ? "เปิดใบ" : null,
}));

export default function ProductActivityTab({ events = [], productThread, onGo }) {
  // ชิปแหล่งจำไว้ตอนเปิดใบแล้วย้อนกลับ (เนมสเปซหน้าสินค้า)
  const [source, setSource] = useStickyState("pactivity.source", "all");
  const counts = useMemo(() => {
    const out = {};
    for (const e of events) out[e.source] = (out[e.source] || 0) + 1;
    return out;
  }, [events]);
  const chips = SOURCE_ORDER
    .filter((key) => key === "all" || key === "product" || (counts[key] || 0) > 0)
    .map((key) => ({ value: key, label: SOURCE_LABELS[key], count: key === "all" || key === "product" ? null : counts[key] }));
  const current = chips.some((c) => c.value === source) ? source : "all";
  const threadItems = useMemo(() => docEventsToThreadItems(events), [events]);
  const listed = current === "all" || current === "product" ? [] : events.filter((e) => e.source === current);

  return (
    <div className={styles.activity}>
      <Segmented ariaLabel="แหล่งความเคลื่อนไหว" value={current} onChange={setSource} options={chips} />
      {current === "all" || current === "product" ? productThread(current === "all" ? threadItems : []) : (
        <DetailCard icon={MessagesSquare} eyebrow="ACTIVITY" title={`ความเคลื่อนไหว · ${SOURCE_LABELS[current]}`}>
          {listed.length ? (
            <ul className={styles.feed}>
              {listed.map((e) => (
                <li key={e.key} className={styles.feedItem}>
                  <span className={styles.feedWhen}>{fmtDateTime(e.at)}</span>
                  <span className={styles.feedWhat}>
                    {e.href
                      ? <Link prefetch={false} href={e.href} className="linklike font-mono">{e.code}</Link>
                      : <button type="button" className="linklike font-mono" onClick={() => onGo(e.tab)}>{e.code}</button>}
                    <span>{e.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState plain>ยังไม่มีเหตุการณ์จากแหล่งนี้</EmptyState>
          )}
        </DetailCard>
      )}
    </div>
  );
}
