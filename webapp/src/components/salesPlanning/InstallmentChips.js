"use client";
/* ── ชิปรายงวดในแถว (รื้อรายการ SO + บัญชี PR-2 · มติเจ้าของ 09/11/2026 "ชิปรายงวดในแถว") ─────────────────────
   หนึ่ง SO หนึ่งแถว · หนึ่งงวดหนึ่งชิป สีบอกสถานะ + ไอคอนบอกซ้ำ (สีไม่ใช่สัญญาณเดียว · WCAG 1.4.1)
   ⭐ ข้อมูลมาจากก้อน `money.installments` ของ server (`salesOrderMoneyCell`) — จอไม่ตัดสินสถานะ/เลยกำหนดเอง
   ⭐ ใบ 7 งวดขึ้นไปใช้ชิปย่อ (เลขอย่างเดียว) — ในระบบมีใบ 9–12 งวด (ตรวจ 09/11) ต้องไม่ดันตารางให้กว้างจนเลื่อนข้าง
   ⭐ คำอธิบายเมื่อชี้ใช้ `data-tip` ของ TooltipHost กลาง · ข้อความเดียวกันอยู่ใน `aria-label` (กล่องลอยเป็นภาพล้วน)
   ⚠️ `onOpen` ส่งมา = ชิปเป็นปุ่ม (เปิดลิ้นชักรายงวด) · DetailRow ไม่พาไปหน้าใบเมื่อกดปุ่มในแถว (isInteractiveTarget) */
import { AlertCircle, Check, Clock3, Undo2, X } from "lucide-react";
import { installmentChipText } from "@/lib/sales/salesOrderMoneyText";
import styles from "./InstallmentChips.module.css";

const ICONS = { confirmed: Check, reported: Clock3, overdue: AlertCircle, rejected: X, refunded: Undo2 };
export const CHIP_COMPACT_AFTER = 6;

export { installmentChipText };

export default function InstallmentChips({ installments = [], onOpen = null, highlightKinds = null, ariaLabel = "สถานะรายงวด" }) {
  const list = Array.isArray(installments) ? installments : [];
  if (!list.length) return null;
  const compact = list.length > CHIP_COMPACT_AFTER;
  return (
    <span className={`${styles.chips} ${compact ? styles.compact : ""}`.trim()} role="list" aria-label={ariaLabel}>
      {list.map((inst) => {
        const Icon = ICONS[inst.kind];
        const { head, note } = installmentChipText(inst, list.length);
        const className = [styles.chip, styles[inst.kind] || styles.pending, highlightKinds?.includes(inst.kind) ? styles.lit : ""]
          .filter(Boolean).join(" ");
        const body = (
          <>
            <span className={styles.seq}>{inst.seq}</span>
            {Icon && !compact ? <Icon size={11} strokeWidth={3} aria-hidden="true" /> : null}
          </>
        );
        return (
          <span key={inst.id || `plan-${inst.seq}`} role="listitem" className={styles.item}>
            {onOpen ? (
              <button type="button" className={className} aria-label={`${head} · ${note}`} data-tip={note} data-tip-label={head}
                onClick={() => onOpen(inst.seq)}>
                {body}
              </button>
            ) : (
              <span className={className} aria-label={`${head} · ${note}`} data-tip={note} data-tip-label={head}>{body}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}
