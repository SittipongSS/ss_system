"use client";
// ── แถบ "ช่วงบริการ (ตามสัญญา)" ของทั้งใบ — เหนือตารางรายการ (D6 · มติ r3 B2) ──────────────────────────────
//
// ⭐ หนึ่งใบหนึ่งช่วง · บังคับเมื่อใบมีแพ็คเกจอย่างน้อยหนึ่งรายการ (ข้อ `period_missing` ของตัวตัดสิน)
// ⭐ ชิป "12 เดือน" / "24 เดือน" = วันสิ้นสุด = วันเริ่ม + n เดือนปฏิทิน − 1 วัน (`periodEndFromMonths` ตัวเดียวกับ server)
//   ต้องมีวันเริ่มก่อน — ไม่มีวันเริ่ม = ชิปกดไม่ได้ (ไม่เดาวันเริ่มให้)
// ⚠️ ขอบแดงเฉพาะหลังกด (แผงแดง/บันทึกไม่ผ่าน) — ผู้เรียกส่ง `error` มาเมื่อมีเท่านั้น
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import { periodEndFromMonths } from "@/lib/sales/serviceSetup";
import { PERIOD_FIELD_ID, periodLabel, periodReadout } from "./serviceSetupDraft";
import styles from "./ServiceSetupFields.module.css";

const MONTH_CHIPS = [12, 24];

/**
 * @param period `{ from, to }` (ร่างหรือค่าที่บันทึก) · @param editable โหมดแก้
 * @param backfill ใบที่อนุมัติแล้ว (ตั้งย้อนหลัง) — เพิ่มคำอธิบายเรื่องวันเริ่มรายสาขา
 * @param error ข้อความของช่องนี้หลังกด (null = ไม่แดง) · @param onChange `({ from, to }) => void`
 */
export default function ServicePeriodField({ period, editable = false, backfill = false, error = null, onChange }) {
  const from = period?.from || "";
  const to = period?.to || "";
  const readout = periodReadout({ from, to });

  if (!editable) {
    return (
      <div className={styles.period}>
        <div className={styles.periodRow}>
          <span className={styles.label}>ช่วงบริการ (ตามสัญญา)</span>
          <span className={styles.periodReadout}>{periodLabel({ from, to })}{readout ? ` (${readout})` : ""}</span>
        </div>
      </div>
    );
  }

  const chipValue = MONTH_CHIPS.find((months) => from && to && periodEndFromMonths(from, months) === to) ?? null;
  const set = (next) => onChange?.({ from, to, ...next });
  return (
    <div className={styles.period}>
      <div className={styles.periodRow}>
        <span className={styles.label}>ช่วงบริการ (ตามสัญญา)<span className={styles.req} aria-hidden="true">*</span></span>
        <div className={styles.periodDates}>
          <div className={styles.field}>
            <span className={styles.hint}>วันเริ่มบริการ</span>
            <DateInput id={PERIOD_FIELD_ID} value={from} onChange={(iso) => set({ from: iso || "" })} ariaLabel="วันเริ่มบริการ" invalid={!!error} />
          </div>
          <span aria-hidden="true" className={styles.periodDash} />
          <div className={styles.field}>
            <span className={styles.hint}>วันสิ้นสุดบริการ</span>
            <DateInput value={to} onChange={(iso) => set({ to: iso || "" })} ariaLabel="วันสิ้นสุดบริการ" invalid={!!error} />
          </div>
        </div>
        <ChoiceChips
          value={chipValue}
          onChange={(months) => set({ to: periodEndFromMonths(from, months) || to })}
          options={MONTH_CHIPS.map((months) => ({ value: months, label: `${months} เดือน`, disabled: !from }))}
          ariaLabel="ตั้งวันสิ้นสุดจากจำนวนเดือน"
        />
        {readout ? <span className={styles.periodReadout}>= {readout}</span> : null}
      </div>
      {error ? <span className={styles.fieldError} role="alert">{error}</span> : null}
      <p className={styles.hint}>
        ใช้ตรวจช่วงครอบของงวด และเป็นค่าตั้งต้นของรอบที่ TS วาง · สัญญาผูกทีหลังได้ แต่ช่างเข้าไซต์ไม่ได้จนกว่าจะผูกสัญญาที่ครอบวันนัด
      </p>
      {backfill ? (
        <p className={styles.hint}>สาขาแรกเริ่ม → สาขาสุดท้ายจบ · วันของแต่ละสาขาอยู่ในหมายเหตุ TS ตั้งวันเริ่มรายไซต์ตอนวางรอบ</p>
      ) : null}
    </div>
  );
}
