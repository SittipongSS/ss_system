"use client";
import { useMemo, useState } from "react";
import {
  CheckCircle2, ClipboardList, CircleAlert, FileText, Handshake, Undo2,
} from "lucide-react";
import Modal from "@/components/Modal";
import { quotationWonEffects } from "@/lib/sales/quotationWonPrompt";
import { quotationWonAmount } from "@/lib/sales/quotationWonAmount";
import { fmtMoney } from "@/lib/format";
import { describeResponseError } from "@/lib/fetchError";
import styles from "./QuotationWonDialog.module.css";
import { apiFetch } from "@/lib/apiFetch";

// โมดัลยืนยันปิด Won (มติผู้ใช้ 2026-08-24)
//
// ⭐ **ไม่มีฟอร์มหลักฐานแล้ว** — สลิป / PO / เอกสารยืนยันการสั่งซื้อ ย้ายไปกรอกที่
// หน้าสร้างใบสั่งขาย (mig 0285) ซึ่งเป็นที่ที่มันถูกใช้จริง · สิ่งที่โมดัลนี้ทำคือ
// บอกผลลัพธ์ให้ครบก่อนกด (กติกาเดียวกับ `approvalPrompt`)
//
// ⭐ **ไม่ถามโครงการแล้ว** (มติเจ้าของ 13/11/2026 · ถอดโครงการทาง ก. รอบ P1 · mig 0434) —
// เดิมดีลที่ยังไม่ผูกโครงการต้องเลือกโครงการที่นี่ก่อนจึงปิด Won ได้ · โครงการไม่มีใครใช้เป็นโครงการ
// (prod 13/11: ปิดแล้ว 0 · ของเข้า 0 · เตรียมส่ง 0) จึงถอดด่านทั้งที่ route และ RPC
/* ไอคอนประจำผลลัพธ์แต่ละข้อ — อ่านเร็วกว่าจุดนำหน้าเปล่า ๆ เวลาแถวยาวหลายบรรทัด
   (ทรงเดียวกับรายการผลลัพธ์บนโมดัลอนุมัติอื่น ๆ ที่มีไอคอนนำ) */
const EFFECT_ICONS = {
  won: Handshake,
  zero: CircleAlert,
  closed: FileText,
  order: ClipboardList,
  undo: Undo2,
};

export default function QuotationWonDialog({ open, onClose, quote, deal: dealProp, customerName, onDone }) {
  const deal = dealProp || quote?.deal || null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const wonAmount = useMemo(() => quotationWonAmount(quote), [quote]);
  const effects = useMemo(() => quotationWonEffects({ quote, deal }), [quote, deal]);

  const close = () => {
    if (busy) return;
    setError("");
    onClose?.();
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/sales-planning/quotations/${quote.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await describeResponseError(res, "ปิด Won ไม่สำเร็จ"));
      const data = await res.json();
      await onDone?.(data);
    } catch (e) {
      setError(e.message || "ปิด Won ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (!quote) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      title="ปิดการขาย (Won) ด้วยใบนี้"
      subtitle={`${quote.quoteNumber || "ใบเสนอราคา"} · ${customerName || quote.customerName || "ไม่ระบุลูกค้า"}`}
      size="md"
      footer={(
        <div className={styles.footer}>
          <button type="button" className="btn ghost" onClick={close} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            <CheckCircle2 size={15} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "ยืนยันปิด Won"}
          </button>
        </div>
      )}
    >
      <div className={styles.body}>
        {error && (
          <div role="alert" className={styles.error}>{error}</div>
        )}

        {/* ยอดที่กำลังจะกลายเป็นมูลค่าปิดของดีล — ตัวเลขที่ต้องอ่านก่อนกด จึงแยกแถวของตัวเอง */}
        <div className={styles.amountRow}>
          <span>ยอด Won (ก่อน VAT)</span>
          <b className="mono">{fmtMoney(wonAmount)}</b>
        </div>

        <div className="form-group">
          <span className="toolbar-label">สิ่งที่จะเกิดขึ้นทันที</span>
          <ul className={styles.effects}>
            {effects.map((effect) => {
              const Icon = EFFECT_ICONS[effect.id] || CheckCircle2;
              return (
                <li key={effect.id}>
                  <Icon size={15} aria-hidden="true" />
                  <span>{effect.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
