"use client";
// ── หน้าต่าง "แบ่งงวดอัตโนมัติ" ของขั้น ③ (มติเจ้าของ 25/09 — ม็อก Step3Split) ─────────────────────────
//
// ⭐ แทนไทล์ "ก้อนเดียว / รายเดือน / ราย 3 เดือน" ใต้ตารางเดิม ซึ่ง (1) หน้าตาเหมือนคำถามแต่กดแล้ว **เขียนทับ
//   งวดที่คีย์ไว้เงียบ ๆ** (2) หารจำนวนวันเท่า ๆ กัน ช่วงไม่ตรงเดือน (3) วันครบกำหนดเท่าวันเริ่มงวดเสมอ
//   — SO-26090232-0 ต้องแก้วันครบกำหนดเองทั้ง 12 งวด
// ⭐ รอบการเก็บเงิน (ก้อนเดียว · ทุกเดือน · ทุก 3 · 6 เดือน · ทุกปี) × วันครบกำหนด (วันเริ่มงวด · สิ้นเดือน ·
//   ทุกวันที่ n · กรอกเอง) — **ไม่มีค่าตั้งต้นทั้งคู่** · ตัวเลือกที่แบ่งไม่ลงตัวเห็นแต่กดไม่ได้ พร้อมเหตุ
//   · ดูตัวอย่างก่อนสร้าง · ปุ่มบอกผลก่อนกด · มีงวดอยู่แล้ว = บอกว่าแทนที่กี่งวด (ปุ่มโทนอันตราย)
// ⚠️ ตัวคิดทั้งหมดอยู่ที่ `historicalSplitOptions` / `historicalSplitPreview` (ทดสอบได้โดยไม่เรนเดอร์)
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import Input from "@/components/ui/Input";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { NA, fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import {
  HISTORICAL_DUE_RULES, historicalSplitConsequence, historicalSplitOptions, historicalSplitPreview, historicalSplitRows,
} from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalOrderWizard.module.css";

const PREVIEW_HEAD = 3;

export default function HistoricalSplitModal({
  open, onClose, from = null, to = null, amount = null, todayIso = null, replacing = 0, onCreate, gridStart = null,
}) {
  const [period, setPeriod] = useState(null);
  const [dueRule, setDueRule] = useState(null);
  const [dueDay, setDueDay] = useState("");

  /* เปิดใหม่ = เริ่มใหม่ — ตัวเลือกของรอบก่อนไม่ใช่คำตอบของรอบนี้ (ไม่มีค่าตั้งต้นให้การตัดสินใจ) */
  useEffect(() => {
    if (!open) return;
    setPeriod(null);
    setDueRule(null);
    setDueDay("");
  }, [open]);

  /* `gridStart` = วันเริ่มสัญญา — ช่วงที่เหลือแบ่งบนตารางเดือนของสัญญา (สัญญาเริ่มวันที่ 29–31 · รีวิว 25/09) */
  const { options, note } = historicalSplitOptions({ from, to, gridStart });
  const preview = historicalSplitPreview({ from, to, amount, period, dueRule, dueDay, todayIso, gridStart });
  const consequence = historicalSplitConsequence(preview, { replacing });
  const head = preview.rows.slice(0, PREVIEW_HEAD);
  const hidden = Math.max(0, preview.rows.length - PREVIEW_HEAD - 1);
  const tail = preview.rows.length > PREVIEW_HEAD ? [preview.rows[preview.rows.length - 1]] : [];

  const create = () => {
    if (preview.blocked) return;
    onCreate?.(historicalSplitRows(preview));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      sheetOnPhone
      title="แบ่งงวดที่ยังต้องเก็บ"
      subtitle={`แบ่งช่วง ${from ? fmtDate(from) : NA} – ${to ? fmtDate(to) : NA} · ยอด ${amount === null ? NA : fmtMoney(amount)} — สร้างแล้วแก้ทีละงวดต่อได้ในตาราง · งวดยกมาไม่ถูกแตะ`}
      footer={(
        <div className={styles.bulkFoot}>
          <span className={styles.bulkConsequence} data-blocked={preview.blocked ? "yes" : undefined}>{consequence}</span>
          <Button tone="neutral" variant="quiet" onClick={onClose}>ยกเลิก</Button>
          <Button tone={replacing ? "danger" : "primary"} disabled={Boolean(preview.blocked)} onClick={create}>
            {preview.blocked
              ? "สร้างงวด"
              : (replacing ? `แทนที่ด้วย ${fmtNumber(preview.count)} งวด` : `สร้าง ${fmtNumber(preview.count)} งวด`)}
          </Button>
        </div>
      )}
    >
      <div className={styles.splitBody}>
        <div className={styles.field}>
          <span>เก็บเงินทุก <b className={styles.req}>*</b></span>
          <ChoiceChips
            ariaLabel="รอบการเก็บเงิน"
            options={options.map((option) => ({
              value: option.value,
              label: option.count ? `${option.label} · ${fmtNumber(option.count)} งวด` : option.label,
              disabled: option.disabled,
            }))}
            value={period}
            onChange={setPeriod}
          />
          {note ? <small>{note}</small> : <small>นับตามเดือนปฏิทิน (01/04 – 30/04 · 01/05 – 31/05 …) ไม่ใช่ก้อนละ 30 วัน</small>}
        </div>

        <div className={styles.field}>
          <span>วันครบกำหนด <b className={styles.req}>*</b></span>
          <ChoiceChips
            ariaLabel="วันครบกำหนดของแต่ละงวด"
            options={HISTORICAL_DUE_RULES.map((rule) => ({ value: rule.value, label: rule.label }))}
            value={dueRule}
            onChange={setDueRule}
          />
          {dueRule === "day" ? (
            <div className={styles.splitDay}>
              <Input
                autoComplete="off"
                inputMode="numeric"
                maxLength={2}
                value={dueDay}
                onChange={(event) => setDueDay(event.target.value.replace(/\D/g, ""))}
                aria-label="วันที่ครบกำหนดของทุกงวด (1–31)"
                placeholder="เช่น 25"
              />
              <small>วันแรกที่ตรงวันที่นี้นับจากวันเริ่มของแต่ละงวด · เดือนที่ไม่มีวันนั้นใช้สิ้นเดือน</small>
            </div>
          ) : (
            <small>{dueRule === "manual" ? "งวดที่สร้างมีช่องครบกำหนดว่าง — กรอกเองทีละงวดในตาราง (บังคับทุกงวด)" : "ชีตเดิมใช้วันเริ่มงวด · วันที่คงที่ของเดือน (เช่น 25) หรือสิ้นเดือน"}</small>
          )}
        </div>

        {preview.rows.length ? (
          <TableScroll family="list" surface="embedded" className={styles.splitPreview}>
            <table className="w-full text-sm">
              <thead><tr>
                <th>งวดที่สร้าง</th>
                <th>ครอบคลุมบริการ</th>
                <th>ครบกำหนด</th>
                <th className="num">จำนวนเงิน</th>
              </tr></thead>
              <tbody>
                {head.map((row) => (
                  <tr key={row.coversFrom}>
                    <td>{row.label}</td>
                    <td>{fmtDate(row.coversFrom)} – {fmtDate(row.coversTo)}</td>
                    <td data-overdue={row.overdue ? "yes" : undefined}>{row.dueDate ? fmtDate(row.dueDate) : "กรอกเอง"}</td>
                    <td className="num">{fmtMoney(row.amount)}</td>
                  </tr>
                ))}
                {hidden > 0 ? (
                  <tr className={styles.splitMore}><td colSpan={4}>… อีก {fmtNumber(hidden)} งวด</td></tr>
                ) : null}
                {tail.map((row) => (
                  <tr key={row.coversFrom}>
                    <td>{row.label}</td>
                    <td>{fmtDate(row.coversFrom)} – {fmtDate(row.coversTo)}</td>
                    <td data-overdue={row.overdue ? "yes" : undefined}>{row.dueDate ? fmtDate(row.dueDate) : "กรอกเอง"}</td>
                    <td className="num">{fmtMoney(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        ) : null}

        {preview.overdue > 0 ? (
          <p className={styles.splitWarn}>
            <AlertTriangle size={14} aria-hidden="true" />
            {fmtNumber(preview.overdue)} งวดครบกำหนดก่อนวันนี้{todayIso ? ` (${fmtDate(todayIso)})` : ""} — หลังอนุมัติขึ้นเลยกำหนดทันที
          </p>
        ) : null}

        {replacing && !preview.blocked ? (
          <StatusNotice tone="warning" title={`แทนที่งวดที่คีย์ไว้ ${fmtNumber(replacing)} งวด`}>
            รายละเอียด ยอด วันที่ และหมายเหตุที่พิมพ์ไว้ในงวดพวกนั้นจะหาย — งวดยกมาไม่ถูกแตะ
          </StatusNotice>
        ) : null}
      </div>
    </Modal>
  );
}
