"use client";
// ── รางขั้นของแถวคำร้อง (mig 0204) ───────────────────────────────────────
//
// ⭐ **แนวตั้ง ไม่ใช่แนวนอน** — สายนี้ยาวและมีหลายแถว รางแนวนอนต้องซ่อนของเก่า
// ⇒ เสียสิ่งที่มีค่าที่สุดของหน้านี้ คือ *อ่านครั้งเดียวรู้ว่าผ่านอะไรมาและช้าตรงไหน*
//
// ⭐ **ปุ่มอยู่ในช่องของก้าวที่มันเดิน ไม่ใช่บน toolbar** ⇒ ทั้งการ์ดมีปุ่มเน้นตัวเดียว
// เสมอ และมันอยู่ตรงจุดที่สายตาไปหยุดพอดี · ฝั่งที่ไม่ใช่ตาตัวเองเห็นป้ายรอ ไม่ใช่
// ปุ่มจาง ๆ ที่กดไม่ได้ (ปุ่มที่กดไม่ได้ไม่บอกว่าทำไม)
//
// ⚠️ ขั้น/เวลา/ก้าวถัดไป อ่านจาก lib/requests/rowStage.js ที่เดียว — ตัวเดียวกับที่
// คิวใช้ ⇒ สองที่นั้นขัดกันไม่ได้เชิงโครงสร้าง
import { fmtDate } from "@/lib/format";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import ReadableText from "@/components/ui/ReadableText";
import {
  ROW_STAGE_LABELS, ROW_STAGE_TONES, rowLeadTimes, rowStage,
} from "@/lib/requests/rowStage";
import { HOP_OWNER, hopLabel } from "@/lib/requests/hops";
import styles from "./RowStageRail.module.css";

// ก้าวที่ต้องวาดบนราง เรียงตามเวลาจริง · `field` = ช่องที่บอกว่าก้าวนี้เกิดแล้ว
const RAIL = [
  { hop: "ack", title: "รับเรื่อง", field: "ackAt", byField: "ackByName" },
  { hop: "ready", title: "ส่งของ", field: "readyAt", byField: "readyByName" },
  { hop: "pickup", title: "รับของ", field: "pickedUpAt", byField: "pickedUpByName" },
  { hop: "send", title: "ส่งให้ลูกค้า", field: "sentAt", byField: "sentByName" },
  { hop: "outcome", title: "ลูกค้าตอบ", field: "outcomeAt", byField: "outcomeByName" },
];

const WAITING = {
  ack: "รอฝ่ายปลายทางรับเรื่อง",
  ready: "รอฝ่ายปลายทางส่งของ",
  pickup: "รอผู้ขอไปรับของ",
  send: "รอผู้ขอส่งให้ลูกค้า",
  outcome: "รอลูกค้าตอบ",
};

// เวลาที่ใช้ของก้าวนั้น — เอามาจาก rowLeadTimes ไม่คำนวณเอง
const ELAPSED_KEY = { ready: "develop", pickup: "pickup", send: "deliver", outcome: "customer" };

export default function RowStageRail({
  row, request, canDept = false, canRequester = false, busy = false, onHop,
}) {
  const stage = rowStage(row);
  const lead = rowLeadTimes(row, { ackFallback: request?.acknowledgedAt?.slice(0, 10) || null });
  // ก้าวปัจจุบัน = ก้าวแรกที่ยังไม่มีวันที่ · ไม่มีเลย = แถวเดินจบแล้ว
  const currentIndex = RAIL.findIndex((s) => !row?.[s.field]);
  const settled = ["done", "declined", "revised"].includes(stage);

  const mineFor = (hop) => (HOP_OWNER[hop] === "dept" ? canDept : canRequester);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <StatusBadge tone={ROW_STAGE_TONES[stage]} label={ROW_STAGE_LABELS[stage]} />
        {lead?.total !== null && <span className={styles.total}>รวม {lead.total} วัน</span>}
        {/* migration จงใจไม่มี CHECK เรียงวันที่ (ผู้ใช้แก้ย้อนหลังเป็นเรื่องปกติ) —
            ติดลบจึงเกิดได้จริง · ต้องไม่โชว์ "-3 วัน" และต้องไม่เงียบ */}
        {lead?.disordered && (
          <span className={styles.warn}>วันที่ไม่เรียงลำดับ — ตัวเลขอาจไม่ตรง</span>
        )}
        {row?.derivedFromItemId && (
          <span className={styles.derived}>แก้มาจากรายการก่อนหน้า</span>
        )}
      </div>

      <ol className={styles.rail}>
        {RAIL.map((step, i) => {
          const at = row?.[step.field];
          const done = !!at;
          const isCurrent = !settled && i === currentIndex;
          const elapsed = ELAPSED_KEY[step.hop] ? lead?.[ELAPSED_KEY[step.hop]] : null;
          const isMine = mineFor(step.hop);

          return (
            <li
              key={step.hop}
              className={`${styles.step} ${done ? styles.stepDone : ""} ${isCurrent ? styles.stepNow : ""}`}
            >
              <span className={styles.dot} aria-hidden="true" />
              <div className={styles.body}>
                <div className={styles.title}>
                  {step.hop === "outcome" && row?.outcome
                    ? hopLabel("outcome", row.outcome)
                    : step.title}
                </div>

                {done ? (
                  <div className={styles.meta}>
                    {fmtDate(at)}
                    {row?.[step.byField] ? ` · ${row[step.byField]}` : ""}
                    {elapsed !== null && elapsed !== undefined ? ` · +${elapsed} วัน` : ""}
                  </div>
                ) : isCurrent ? (
                  <div className={styles.action}>
                    {isMine ? (
                      <Button
                        size="sm" tone="accent" disabled={busy}
                        onClick={() => onHop?.(step.hop)}
                      >
                        {hopLabel(step.hop)}
                      </Button>
                    ) : (
                      // ⚠️ ป้ายรอ ไม่ใช่ปุ่มจาง — ปุ่มที่กดไม่ได้ไม่บอกว่าทำไม
                      <span className={styles.waiting}>{WAITING[step.hop]}</span>
                    )}
                  </div>
                ) : (
                  <div className={styles.pending}>—</div>
                )}

                {step.hop === "ack" && row?.dueAt && (
                  <div className={styles.meta}>รับปากว่าจะส่ง {fmtDate(row.dueAt)}</div>
                )}
                {step.hop === "outcome" && row?.outcomeNote && (
                  <div className={styles.quote}>
                    <ReadableText text={row.outcomeNote} lines={3} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* ราคาเป็นขั้นสุดท้ายของสายนี้ ไม่ใช่คำร้องใบใหม่ — ปุ่มโผล่เฉพาะตอนที่
          ลูกค้าคอนเฟิร์มแล้วเท่านั้น (ครึ่งที่มองเห็นได้ของด่าน canPriceRow) */}
      {stage === "awaiting_price" && (
        <div className={styles.priceBar}>
          <span className={styles.priceText}>
            ลูกค้าคอนเฟิร์มแล้ว
            {row?.confirmedQty ? ` จำนวน ${Number(row.confirmedQty).toLocaleString("th-TH")}` : ""}
            {" — เหลือขั้นใส่ราคา"}
          </span>
          {canDept ? (
            <Button size="sm" tone="accent" disabled={busy} onClick={() => onHop?.("price")}>
              ใส่ราคา
            </Button>
          ) : (
            <span className={styles.waiting}>รอฝ่ายปลายทางใส่ราคา</span>
          )}
        </div>
      )}
    </div>
  );
}
