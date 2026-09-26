"use client";
// ── การ์ด "ใบที่อาจซ้ำ" บนหน้าใบสั่งขายย้อนหลัง (มติเจ้าของ 26/09 ข้อ 4 — แท็บภาพรวม ต่อจากการ์ดโซน) ─────────────
//
// ⭐ ผู้อนุมัติ (ผู้จัดการฝ่ายขาย) เห็นว่าผู้คีย์ยืนยันใบไหนว่าไม่ซ้ำ · ใคร · เมื่อไร · เหตุผล — เทียบสถานะตอนยืนยันกับตอนนี้
//   และใบที่ระบบพบเพิ่มตอนเปิดใบ (เตือน ไม่บล็อก — มติข้อ 1)
// ⭐ ข้อความ/การนับมาจาก `historicalDuplicateReviewView` ตัวเดียวกับแถวในหน้าต่างอนุมัติ ⇒ สองที่พูดเรื่องเดียวกันเสมอ
// ⚠️ ขึ้นเฉพาะใบที่มีใบที่อาจซ้ำ (ของผู้คีย์ หรือที่พบเพิ่ม) — ไม่มี = ไม่มีการ์ด (ข้อเท็จจริงเดียว ที่เดียว)
import { Copy } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtNumber } from "@/lib/format";
import {
  historicalDuplicateCardCopy, historicalDuplicateReviewOf, historicalDuplicateReviewView,
} from "@/lib/sales/historicalDuplicates";
import { historicalStatusCopy } from "@/lib/sales/historicalOrderCopy";
import HistoricalDuplicateTable from "./HistoricalDuplicateTable";
import styles from "./HistoricalDuplicateTable.module.css";

/**
 * @param order          ใบ (อ่าน `metadata.historicalIntake.duplicateReview`)
 * @param duplicateCheck ผลตรวจใหม่จากของเสริมของใบ (`{ candidates, statusById }`) · null = ยังไม่รู้/โหลดไม่ขึ้น
 */
export default function HistoricalDuplicateReviewCard({ order, duplicateCheck = null }) {
  const review = historicalDuplicateReviewOf(order);
  const view = historicalDuplicateReviewView(review, duplicateCheck, {
    statusLabel: (status) => historicalStatusCopy(status).label,
  });
  if (!view.show) return null;
  /* ถ้อยคำตามสถานะของบันทึก (ไม่มี / ตอนบันทึกไม่มีใบซ้ำ / ยืนยันรายใบ) และสถานะของใบ — "ก่อนอนุมัติ" เฉพาะใบที่รออนุมัติ */
  const copy = historicalDuplicateCardCopy(view, { status: order?.status });
  const note = review?.note ? String(review.note) : "";

  return (
    <DetailCard icon={Copy} eyebrow="POSSIBLE DUPLICATES" title={`ใบที่อาจซ้ำ ${fmtNumber(view.count)} ใบ`} meta={copy.meta}>
      {note ? <p className={styles.note}>เหตุผลของผู้คีย์: “{note}”</p> : null}
      {review?.basis === "flag" ? (
        <p className={styles.note}>ยืนยันจากฟอร์มรุ่นก่อน — ไม่ได้ระบุรายใบ</p>
      ) : null}
      <HistoricalDuplicateTable rows={view.rows} mode="review" newTag={copy.newTag} />
      {copy.notice ? (
        <StatusNotice tone={copy.notice.tone} title={copy.notice.title}>{copy.notice.body}</StatusNotice>
      ) : null}
    </DetailCard>
  );
}
