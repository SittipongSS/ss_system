"use client";
// ── โมดัล "ใช้ช่วงเดียวกันทุกรายการ" (โหมดแยกรายรายการ · mig 0400 · ปุ่มบนแถบช่วงบริการ) ────────────────────────────────
//
// ⭐ ใส่ช่วงเดียวให้ **ทุกรายการที่เป็นงานบริการ** ในร่าง (`applyPeriodToAllLines`) — ยังไม่บันทึกจนกด "บันทึกงานบริการ"
//   ค่าตั้งต้น = ช่วงของรายการงานบริการแรกที่มีช่วงแล้ว (`sameSourceOf`) · ไม่มี = ช่องว่าง (ไม่เดาวันให้)
// ⭐ ปุ่มยืนยันกดได้เสมอ — ช่วงยังไม่ครบ/กลับหัว = บอกเหตุตอนกด (กติกา "ปุ่มโชว์เสมอ บอกเหตุตอนกด") ⇒ แดงหลังกดเท่านั้น (กฎ 3)
//   ข้อความเดียวกับที่ server ตีกลับช่วงของรายการ (`service_setup_line_period_invalid`)
// ⚠️ โมดัลถูกวาดเฉพาะตอนเปิด (ผู้เรียก mount/unmount) ⇒ ค่าตั้งต้นอ่านครั้งเดียวตอนเปิด
import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import { SERVICE_PERIOD_TEXT, SERVICE_SETUP_SQL_MESSAGES, periodEndFromMonths, validServicePeriod } from "@/lib/sales/serviceSetup";
import { periodReadout } from "./serviceSetupDraft";
import styles from "./ServiceSetupFields.module.css";

const MONTH_CHIPS = [12, 24];

/**
 * @param initial `{ from, to }` ค่าตั้งต้นของช่อง (หรือ null) · @param count จำนวนรายการที่เป็นงานบริการ (ที่จะถูกแทน)
 * @param onApply `({ from, to }) => void` · @param onClose `() => void`
 */
export default function ServicePeriodApplyAllModal({ initial = null, count = 0, onApply, onClose }) {
  const [period, setPeriod] = useState(() => ({ from: initial?.from || "", to: initial?.to || "" }));
  const [error, setError] = useState("");
  const { from, to } = period;
  const readout = periodReadout(period);
  const chipValue = MONTH_CHIPS.find((months) => from && to && periodEndFromMonths(from, months) === to) ?? null;
  const set = (next) => {
    setPeriod((current) => ({ ...current, ...next }));
    setError("");
  };
  const confirm = () => {
    const valid = validServicePeriod(period);
    if (!valid) {
      setError(SERVICE_SETUP_SQL_MESSAGES.service_setup_line_period_invalid.message);
      return;
    }
    onApply?.(valid);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={SERVICE_PERIOD_TEXT.applyAllTitle}
      footer={(
        <>
          <Button tone="neutral" onClick={onClose}>ยกเลิก</Button>
          <Button tone="primary" onClick={confirm}>{SERVICE_PERIOD_TEXT.applyAllConfirm}</Button>
        </>
      )}
    >
      <div className={styles.applyAll}>
        <div className={styles.periodRow}>
          <div className={styles.periodDates}>
            <div className={styles.field}>
              <span className={styles.hint}>{SERVICE_PERIOD_TEXT.startLabel}</span>
              <DateInput value={from} onChange={(iso) => set({ from: iso || "" })} ariaLabel={SERVICE_PERIOD_TEXT.startLabel} invalid={!!error} />
            </div>
            <span aria-hidden="true" className={styles.periodDash} />
            <div className={styles.field}>
              <span className={styles.hint}>{SERVICE_PERIOD_TEXT.endLabel}</span>
              <DateInput value={to} onChange={(iso) => set({ to: iso || "" })} ariaLabel={SERVICE_PERIOD_TEXT.endLabel} invalid={!!error} />
            </div>
          </div>
          <ChoiceChips
            value={chipValue}
            onChange={(months) => set({ to: periodEndFromMonths(from, months) || to })}
            options={MONTH_CHIPS.map((months) => ({ value: months, label: SERVICE_PERIOD_TEXT.monthChip(months), disabled: !from }))}
            ariaLabel="ตั้งวันสิ้นสุดจากจำนวนเดือน"
          />
          {readout ? <span className={styles.periodReadout}>{SERVICE_PERIOD_TEXT.readout(readout)}</span> : null}
        </div>
        {error ? <span className={styles.fieldError} role="alert">{error}</span> : null}
        <p className={styles.applyAllBody}>{SERVICE_PERIOD_TEXT.applyAllBody(count)}</p>
      </div>
    </Modal>
  );
}
