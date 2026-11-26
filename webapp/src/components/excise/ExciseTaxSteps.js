/* ขั้นคิดภาษีสรรพสามิตต่อหน่วย (มติเจ้าของ 26/11/2026 · V43) — ตัวเดียวของทุกจอที่โชว์ที่มาของภาษี
   (หน้าสินค้า · ฟอร์มสินค้า · หน้าทะเบียน) · ตัวเลขจาก `exciseTaxSteps` = สูตรเดียวกับที่ระบบคิดเงิน */
import { fmtMoney } from "@/lib/format";
import { exciseTaxSteps } from "@/lib/excise/exciseTaxSteps";
import styles from "./ExciseTaxSteps.module.css";

/**
 * @param base     ฐานภาษีรวม VAT · ไม่มี = ไม่วาด
 * @param unit     หน่วยขาย (ป้ายแถวรวม)
 * @param total    true = มีแถว "ภาษีต่อ{unit} (1 + 2)"
 * @param compact  ตัวเล็ก (ใช้ในฟอร์ม)
 */
export default function ExciseTaxSteps({ base, unit = "ชิ้น", total = true, compact = false }) {
  const steps = exciseTaxSteps(base);
  if (!steps) return null;
  return (
    <dl className={compact ? `${styles.steps} ${styles.compact}` : styles.steps}>
      {steps.rows.map((row) => (
        <div key={row.key} className={styles.row}>
          <dt className={styles.label}>
            {row.marker ? <span className={styles.marker} aria-hidden="true">{row.marker}</span> : null}
            {row.label}
          </dt>
          <dd className={styles.formula}>{`${row.formula} =`}</dd>
          <dd className={styles.amount}>{fmtMoney(row.amount)}</dd>
        </div>
      ))}
      {total ? (
        <div className={`${styles.row} ${styles.totalRow}`}>
          <dt className={styles.label}>{`ภาษีต่อ${unit} (1 + 2)`}</dt>
          <dd className={styles.formula}>{`${fmtMoney(steps.exciseTax)} + ${fmtMoney(steps.localTax)} =`}</dd>
          <dd className={styles.amount}>{fmtMoney(steps.taxPerUnit)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
