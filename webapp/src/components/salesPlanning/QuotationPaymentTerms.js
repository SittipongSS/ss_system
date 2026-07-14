"use client";

import { CircleDollarSign, Plus, Trash2 } from "lucide-react";
import {
  MAX_INSTALLMENTS,
  computeInstallments,
  evenPercents,
  paymentPlanSummary,
} from "@/lib/sales/paymentPlan";
import { fmtMoney } from "@/lib/format";
import styles from "./QuotationPaymentTerms.module.css";

const DEFAULT_INSTALLMENTS = () => evenPercents(2).map((percent, index) => ({
  label: index === 0 ? "มัดจำ" : "งวดสุดท้าย",
  percent,
  note: "",
}));

export default function QuotationPaymentTerms({ value, onChange, totalAmount, disabled = false }) {
  const payment = {
    type: value?.type === "installment" ? "installment" : "full",
    paymentMethod: value?.paymentMethod || "",
    paymentTerms: value?.paymentTerms || "",
    installments: Array.isArray(value?.installments) ? value.installments : [],
  };
  const pctSum = Math.round(payment.installments.reduce((sum, row) => sum + (Number(row.percent) || 0), 0) * 100) / 100;
  const amounts = computeInstallments(totalAmount, payment.installments);

  const update = (patch) => {
    if (!disabled) onChange?.({ ...payment, ...patch });
  };
  const updateInstallment = (index, patch) => update({
    installments: payment.installments.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
  });
  const switchType = () => {
    const type = payment.type === "installment" ? "full" : "installment";
    update({
      type,
      installments: type === "installment" && payment.installments.length < 2
        ? DEFAULT_INSTALLMENTS()
        : payment.installments,
    });
  };
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
    update({ installments: payment.installments.map((row, index) => ({ ...row, percent: percents[index] })) });
  };
  const fillTerms = () => update({
    paymentTerms: paymentPlanSummary({ type: "installment", installments: payment.installments }, totalAmount),
  });

  return (
    <>
      <div className={styles.paymentHeading}>
        <div className={styles.paymentTitle}>
          <CircleDollarSign size={17} aria-hidden="true" />
          <h2>เงื่อนไขการชำระเงิน</h2>
        </div>
        <div className="spacer" />
        <button
          type="button"
          role="switch"
          aria-checked={payment.type === "installment"}
          className={`${styles.installmentToggle} ${payment.type === "installment" ? styles.installmentOn : ""}`.trim()}
          disabled={disabled}
          onClick={switchType}
        >
          <span className={styles.toggleTrack}><span /></span>
          <span><strong>แบ่งชำระเป็นงวด</strong><small>{payment.type === "installment" ? "เปิดใช้งาน" : "ชำระเต็มจำนวน"}</small></span>
        </button>
      </div>

      <div className={styles.paymentTermsGrid}>
        <label>วิธีการชำระเงิน
          <input className="premium-input" value={payment.paymentMethod} disabled={disabled} placeholder="เช่น โอนเงินเข้าบัญชีธนาคาร / เช็ค / เงินสด" onChange={(event) => update({ paymentMethod: event.target.value })} />
        </label>
        <label>ข้อความเงื่อนไขชำระ
          <textarea className="premium-input" rows={3} value={payment.paymentTerms} disabled={disabled} placeholder="เช่น มัดจำ 50% ก่อนเริ่มงาน · ส่วนที่เหลือก่อนส่งมอบ" onChange={(event) => update({ paymentTerms: event.target.value })} />
          {!disabled && payment.type === "installment" && <button type="button" className={styles.fillTermsButton} onClick={fillTerms}>สร้างข้อความจากงวด</button>}
        </label>
      </div>

      {payment.type === "installment" && (
        <div className={styles.installmentPanel}>
          <div className="toolbar" style={{ marginBottom: 10, gap: 8 }}>
            {!disabled && <button type="button" className="btn ghost sm" disabled={payment.installments.length >= MAX_INSTALLMENTS} onClick={addInstallment}><Plus size={13} aria-hidden="true" /> เพิ่มงวด</button>}
            {!disabled && <button type="button" className="btn ghost sm" onClick={recalcEven}>เกลี่ย % เท่ากัน</button>}
            <div className="spacer" />
            <span className="ui-badge" style={{ color: Math.abs(pctSum - 100) < 0.01 ? "var(--green)" : "var(--red)" }}>รวม {pctSum}%{Math.abs(pctSum - 100) < 0.01 ? "" : " (ต้อง 100%)"}</span>
          </div>
          <div className="premium-glass-table table-responsive">
            <table className="w-full text-sm">
              <thead><tr><th style={{ width: 40 }}>งวด</th><th>รายละเอียด</th><th style={{ width: 90 }}>%</th><th className="num" style={{ width: 120 }}>จำนวนเงิน</th><th>หมายเหตุ</th>{!disabled && <th style={{ width: 40 }}></th>}</tr></thead>
              <tbody>
                {payment.installments.map((row, index) => (
                  <tr key={index} className="premium-row">
                    <td className={styles.rowNumber}>{index + 1}</td>
                    <td><input className="premium-input" value={row.label} disabled={disabled} placeholder={`งวดที่ ${index + 1}`} onChange={(event) => updateInstallment(index, { label: event.target.value })} /></td>
                    <td><input type="number" min="0" max="100" step="0.01" className="premium-input mono" value={row.percent} disabled={disabled} onChange={(event) => updateInstallment(index, { percent: event.target.value })} /></td>
                    <td className="num mono">{fmtMoney(amounts[index]?.amount || 0)}</td>
                    <td><input className="premium-input" value={row.note} disabled={disabled} placeholder="เช่น ก่อนเริ่มงาน" onChange={(event) => updateInstallment(index, { note: event.target.value })} /></td>
                    {!disabled && <td><button type="button" className="btn-icon danger" disabled={payment.installments.length <= 2} onClick={() => removeInstallment(index)} aria-label={`ลบงวด ${index + 1}`}><Trash2 size={14} aria-hidden="true" /></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
