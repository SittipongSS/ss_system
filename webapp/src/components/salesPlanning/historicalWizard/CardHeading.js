"use client";
// ── หัวการ์ดของฟอร์มคีย์ใบย้อนหลัง (ขั้น ① ③ · มติเจ้าของ 25/09) ─────────────────────────────
// ⭐ หัวเดียวกับ `.sectionHeading` ของหน้าสร้างใบเสนอราคา: ไอคอน · h2 · บรรทัดรองเล็ก · ปุ่มชิดขวา (ถ้ามี)
//   ย้ายออกจาก WizardContractStep เมื่อขั้น ③ ต้องใช้ด้วย — สองขั้นจะได้ไม่มีหัวการ์ดสองแบบ
import styles from "./HistoricalOrderWizard.module.css";

/**
 * @param icon    ไอคอน lucide
 * @param note    บรรทัดรองเล็กข้างหัว (ข้อความหรือ node)
 * @param actions ปุ่มชิดขวาของหัว (แบบหัวตารางรายการของขั้น ②)
 */
export default function CardHeading({ icon: Icon, title, note = null, actions = null, id }) {
  return (
    <div className={styles.cardHeading}>
      {Icon ? <Icon size={17} aria-hidden="true" /> : null}
      <h2 id={id}>{title}</h2>
      {note ? <span>{note}</span> : null}
      {actions ? <div className={styles.cardActions}>{actions}</div> : null}
    </div>
  );
}
