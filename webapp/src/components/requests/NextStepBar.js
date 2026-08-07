"use client";
// ── ก้าวถัดไปของทุกแถว — วางท้ายเธรด (P3a · ม-36 ก) ──────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-07**: *"มันจะเป็นตามขั้นตอน และตอบโต้ได้หากมีอะไรเพิ่มเติม …
// หรือหากสงสัย จะมีระบบถามตอบ เธรด **แต่สถานะก็รวมในเธรดด้วย**"*
//
// ⇒ เธรดเป็นแกนของหน้า และ **ปุ่มของก้าวถัดไปอยู่ท้ายเธรด** เหมือนกล่องพิมพ์ —
// คนอ่านไล่เรื่องจากบนลงล่างแล้วเจอ "แล้วต้องทำอะไรต่อ" ตรงที่สายตาหยุดพอดี
//
// ⚠️ **เลิกใช้รางแนวตั้งรายแถว** (`RowStageRail`) — รางเป็นแหล่งความจริงที่สอง
// สำหรับ "ผ่านอะไรมาแล้ว" ซึ่งเธรดเล่าอยู่แล้ว · สองที่เมื่อไรก็เพี้ยนกันเมื่อนั้น
//
// ⚠️ ขั้น/เจ้าของก้าว อ่านจาก `rowStage.js` + `hops.js` ที่เดียว — ตัวเดียวกับที่คิว
// ใช้ ⇒ ปุ่มที่นี่กับคอลัมน์ "ก้าวถัดไป" บนคิวขัดกันไม่ได้เชิงโครงสร้าง
import Button from "@/components/ui/Button";
import { ROW_STAGE_LABELS, rowStage } from "@/lib/requests/rowStage";
import { HOP_OWNER, ROW_OUTCOMES, hopLabel } from "@/lib/requests/hops";
import styles from "./NextStepBar.module.css";

// ขั้นของแถว → ก้าวที่เดินได้จากขั้นนั้น
//
// ⚠️ `awaiting_price` ไม่ได้อยู่ใน `ROW_HOPS` — ใส่ราคาเป็น endpoint ของตัวเอง
// (`/items/[itemId]/price`) ไม่ใช่ hop · แต่บนจอมันคือ "ก้าวถัดไป" เหมือนกัน
const HOP_AT_STAGE = {
  awaiting_ack: "ack",
  developing: "ready",
  ready: "pickup",
  picked_up: "send",
  sent: "outcome",
  awaiting_price: "price",
};

const OWNER_OF = { ...HOP_OWNER, price: "dept" };

// คอนเฟิร์มเป็นทางหลัก · อีกสองทางเป็นเส้นขอบ — เห็นครบแต่ไม่แย่งน้ำหนักกัน
const OUTCOME_BUTTON = {
  confirmed: { tone: "primary", variant: "filled" },
  revise: { tone: undefined, variant: "outline" },
  rejected: { tone: "danger", variant: "outline" },
};

const WAITING_TEXT = { dept: "รอฝ่ายปลายทาง", requester: "รอฝ่ายขาย" };

export default function NextStepBar({
  rows = [], canDept = false, canRequester = false, busy = false,
  onHop, onPrice,
  // ⭐ **ก้าวของ "ใบ" สำหรับหัวข้อที่ไม่มีแถว** (P6 · สอบถามข้อมูล) — หัวข้อพวกนี้
  // ทั้งหน้าคือเธรด · ปุ่มอยู่บนหัวใบอย่างเดียวแปลว่าคนอ่านเธรดจนจบแล้วต้องเงยหน้า
  // กลับขึ้นไปหาปุ่ม ⇒ ขัดกับ ม-49 ที่ให้เธรดเป็นแกน
  //
  // ⚠️ **รับ object เดียวกับที่หัวใบใช้** ไม่ประกอบเอง — สองที่ประกอบเองเมื่อไรก็
  // เพี้ยนกันเมื่อนั้น · หน้าแม่เป็นคนตัดสินว่าจะโชว์ที่ไหน (ดู `primaryAction`)
  requestStep = null,
}) {
  const pending = rows
    .map((row) => ({ row, stage: rowStage(row) }))
    .map(({ row, stage }) => ({ row, stage, hop: HOP_AT_STAGE[stage] }))
    .filter((r) => r.hop);

  // ใบที่ไม่มีแถว (สอบถามข้อมูล) — ก้าวถัดไปเป็นของทั้งใบ ไม่ใช่ของแถวไหน
  if (!pending.length && requestStep) {
    return (
      <div className={styles.bar}>
        <div className="toolbar-label">ก้าวถัดไป</div>
        <div className={styles.row}>
          <div className={styles.label}><strong>{requestStep.hint}</strong></div>
          <div className={styles.actions}>
            <Button tone="primary" disabled={busy} onClick={requestStep.onClick}>
              {requestStep.label}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!pending.length) return null;

  return (
    <div className={styles.bar}>
      <div className="toolbar-label">ก้าวถัดไป</div>
      {pending.map(({ row, stage, hop }) => {
        const owner = OWNER_OF[hop];
        const isMine = owner === "dept" ? canDept : canRequester;
        return (
          <div key={row.id} className={styles.row}>
            <div className={styles.label}>
              <strong>{row.label}</strong>
              <span className={styles.stage}>{ROW_STAGE_LABELS[stage]}</span>
            </div>
            {/* ⚠️ ฝั่งที่ไม่ใช่ตาตัวเอง **เห็นป้ายว่ารอใคร ไม่ใช่ปุ่มจาง ๆ** — ปุ่มที่
                กดไม่ได้โดยไม่บอกเหตุผลคือสิ่งที่ทำให้คนคิดว่าระบบพัง (กับดักที่แผน
                บันทึกไว้ และแบบหน้าจอ §03 ย้ำอีกรอบ) */}
            {!isMine ? (
              <span className={styles.waiting}>{WAITING_TEXT[owner]}</span>
            ) : hop === "outcome" ? (
              <div className={styles.actions}>
                {ROW_OUTCOMES.map((outcome) => (
                  <Button
                    key={outcome} disabled={busy}
                    tone={OUTCOME_BUTTON[outcome].tone}
                    variant={OUTCOME_BUTTON[outcome].variant}
                    onClick={() => onHop?.(row, "outcome", outcome)}
                  >
                    {hopLabel("outcome", outcome)}
                  </Button>
                ))}
              </div>
            ) : (
              <div className={styles.actions}>
                <Button
                  tone="primary" disabled={busy}
                  onClick={() => (hop === "price" ? onPrice?.(row) : onHop?.(row, hop))}
                >
                  {hop === "price" ? "ใส่ราคา" : hopLabel(hop)}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
