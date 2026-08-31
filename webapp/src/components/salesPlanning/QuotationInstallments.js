"use client";
import { TableScroll } from "@/components/ui/Table";

import { CalendarClock, Plus, Trash2 } from "lucide-react";
import {
  MAX_INSTALLMENTS,
  computeInstallments,
  evenPercents,
  paymentScheduleRows,
} from "@/lib/sales/paymentPlan";
import ReadableText from "@/components/ui/ReadableText";
import { fmtMoney, fmtNumber, fmtPercent, NA } from "@/lib/format";
import styles from "./QuotationPaymentTerms.module.css";

// คอลัมน์ "%" มีสัญลักษณ์อยู่ที่หัวตารางแล้ว ⇒ ในเซลล์พิมพ์ตัวเลขเปล่า 2 ตำแหน่ง
const pctText = (value) => fmtNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DEFAULT_INSTALLMENTS = () => evenPercents(2).map((percent, index) => ({
  label: index === 0 ? "มัดจำ" : "งวดสุดท้าย",
  percent,
  note: "",
}));

export default function QuotationInstallments({
  value,
  onChange,
  totalAmount,
  disabled = false,
}) {
  const payment = {
    type: value?.type === "installment" ? "installment" : "full",
    paymentMethod: value?.paymentMethod || "",
    paymentTerms: value?.paymentTerms || "",
    installments: Array.isArray(value?.installments) ? value.installments : [],
    presetVersionId: value?.presetVersionId || null,
  };
  const split = payment.type === "installment";
  const rows = paymentScheduleRows(payment);
  // ⚠️ เก็บเป็น "ตัวเลขดิบ" — ตัวนี้เป็นตัวตัดสินสี/ข้อความเตือนด้านล่าง (Math.abs(pctSum - 100))
  // การปัดตรงนี้คือกันขยะทศนิยมของ float ไม่ใช่การจัดรูปแบบ · จัดรูปแบบเฉพาะตอนพิมพ์
  const pctSum = split
    ? Math.round(rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0) * 100) / 100
    : 100;
  const amounts = computeInstallments(totalAmount, rows);

  const update = (patch) => {
    if (!disabled) onChange?.({ ...payment, ...patch });
  };
  const updateInstallment = (index, patch) => update({
    installments: payment.installments.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )),
  });
  const switchType = () => update(split
    ? { type: "full", installments: [] }
    : { type: "installment", installments: DEFAULT_INSTALLMENTS() });
  const addInstallment = () => update({
    installments: payment.installments.length >= MAX_INSTALLMENTS
      ? payment.installments
      : [...payment.installments, { label: "", percent: 0, note: "" }],
  });
  const removeInstallment = (index) => update({
    installments: payment.installments.length <= 2
      ? payment.installments
      : payment.installments.filter((_, rowIndex) => rowIndex !== index),
  });
  const recalcEven = () => {
    const percents = evenPercents(payment.installments.length);
    update({
      installments: payment.installments.map((row, index) => ({
        ...row,
        percent: percents[index],
      })),
    });
  };

  return (
    <>
      <div className={styles.paymentHeading}>
        <div className={styles.paymentTitle}>
          <CalendarClock size={17} aria-hidden="true" />
          <h2>งวดการชำระ</h2>
        </div>
        <div className="spacer" />
        <button
          type="button"
          role="switch"
          aria-checked={split}
          className={`${styles.installmentToggle} ${split ? styles.installmentOn : ""}`.trim()}
          disabled={disabled}
          onClick={switchType}
        >
          <span className={styles.toggleTrack}><span /></span>
          <span><strong>แบ่งชำระเป็นงวด</strong><small>{split ? "เปิดใช้งาน" : "ปิด · ชำระเต็มจำนวน"}</small></span>
        </button>
      </div>

      <div className={styles.installmentPanel}>
        <div className="toolbar" style={{ gap: 8 }}>
          {split && !disabled && (
            <>
              <button type="button" className="btn ghost sm" disabled={rows.length >= MAX_INSTALLMENTS} onClick={addInstallment}><Plus size={13} aria-hidden="true" /> เพิ่มงวด</button>
              <button type="button" className="btn ghost sm" onClick={recalcEven}>เกลี่ย % เท่ากัน</button>
            </>
          )}
          <div className="spacer" />
          <span className="ui-badge" style={{ color: Math.abs(pctSum - 100) < 0.01 ? "var(--green)" : "var(--red)" }}>
            รวม {fmtPercent(pctSum)}{Math.abs(pctSum - 100) < 0.01 ? "" : " (ต้อง 100%)"}
          </span>
        </div>
        <div className="premium-glass-table table-responsive">
          <TableScroll surface="embedded" family="editable" className={styles.installmentScroll}><table className="w-full text-sm">
            <thead>
              <tr>
                <th style={{ width: 40 }}>งวด</th>
                <th>รายละเอียด</th>
                <th style={{ width: 90 }}>%</th>
                <th className="num" style={{ width: 120 }}>จำนวนเงิน</th>
                <th>หมายเหตุ</th>
                {split && !disabled && <th style={{ width: 40 }}></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="premium-row">
                  <td className={styles.rowNumber}>{index + 1}</td>
                  <td>{split
                    ? disabled
                      ? <div className="readable-field is-compact"><ReadableText text={row.label} lines={2} empty={<span className="readable-field-empty">งวดที่ {index + 1}</span>} /></div>
                      : <input className="premium-input" value={row.label} placeholder={`งวดที่ ${index + 1}`} onChange={(event) => updateInstallment(index, { label: event.target.value })} />
                    : <span className={styles.readonlyValue}>{row.label}</span>}</td>
                  <td>{split
                    ? disabled
                      ? <span className={`${styles.readonlyValue} mono`}>{pctText(row.percent)}</span>
                      /* ⚠️ ช่องกรอกต้องได้ค่าดิบ — จัดรูปแบบใน value แล้วผู้ใช้พิมพ์ต่อไม่ได้ */
                      : <input type="number" min="0" max="100" step="0.01" className="premium-input mono" value={row.percent} onChange={(event) => updateInstallment(index, { percent: event.target.value })} />
                    : <span className={`${styles.readonlyValue} mono`}>{pctText(100)}</span>}</td>
                  <td className="num mono">{fmtMoney(amounts[index]?.amount || 0)}</td>
                  <td>{split
                    ? disabled
                      ? <div className="readable-field is-compact"><ReadableText text={row.note} lines={3} empty={<span className="readable-field-empty">{NA}</span>} /></div>
                      : <input className="premium-input" value={row.note} placeholder="เช่น ก่อนเริ่มงาน" onChange={(event) => updateInstallment(index, { note: event.target.value })} />
                    : <span className={styles.readonlyValue}>{NA}</span>}</td>
                  {split && !disabled && (
                    <td><button type="button" className="btn-icon danger" disabled={rows.length <= 2} onClick={() => removeInstallment(index)} aria-label={`ลบงวด ${index + 1}`}><Trash2 size={14} aria-hidden="true" /></button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></TableScroll>
        </div>
      </div>
    </>
  );
}
