"use client";
// ── แถบ "ช่วงบริการ (ตามสัญญา)" ของทั้งใบ — เหนือตารางรายการ (D6 · มติ r3 B2 · สวิตช์โหมด mig 0400 มติเจ้าของ 01/10) ──────────
//
// เจ้าของ 01/10: "ช่วงบริการตามสัญญา ตอนนี้ SO บาง SO แต่ละรายการจะช่วงไม่เหมือนกัน บางใบทั้งใบ บางใบรายรายการ ทำสวิตซ์"
// ⭐ สวิตช์สองทางต่อจากป้าย: [ทั้งใบช่วงเดียว | แยกรายรายการ] — ค่าตั้งต้น = ทั้งใบช่วงเดียว (ใบเดิมทุกใบไม่เปลี่ยน)
//   · ทั้งใบช่วงเดียว: ช่องวัน + ชิป "12 เดือน" / "24 เดือน" เหมือนเดิม — บังคับเมื่อใบมีงานบริการอย่างน้อยหนึ่งรายการ (ข้อ `period_missing`)
//   · แยกรายรายการ: แถบโชว์ "ช่วงรวมของใบ" **อ่านอย่างเดียว** (เริ่มแรกสุด → จบสุดท้ายของรายการบนจอ — ผู้เรียกส่ง `localEnvelope` มา
//     ไม่ใช่ช่วงที่เก็บบนใบ ซึ่งว่างจนกว่ารายการจะมีช่วงครบ) + ตัวนับ "ใส่ช่วงแล้ว x/y รายการ" + ปุ่ม "ใช้ช่วงเดียวกันทุกรายการ…"
//     · ช่วงของแต่ละรายการกรอกที่คอลัมน์ ① ของตาราง (ServiceLinePeriod)
// ⭐ ชิป "12 เดือน" / "24 เดือน" = วันสิ้นสุด = วันเริ่ม + n เดือนปฏิทิน − 1 วัน (`periodEndFromMonths` ตัวเดียวกับ server)
//   ต้องมีวันเริ่มก่อน — ไม่มีวันเริ่ม = ชิปกดไม่ได้ (ไม่เดาวันเริ่มให้)
// ⭐ ลูกศรบนสวิตช์ย้ายโฟกัสอย่างเดียว (`activationMode="manual"`) — สลับโหมดเปลี่ยนสิ่งที่จะบันทึก ห้ามสลับตอนกดลูกศรผ่าน
// ⭐ สวิตช์เป็น radiogroup / radio + aria-checked ตามม็อก (`selection="radio"` — แบบเดียวกับปุ่ม ใช่/ไม่ใช่ ของคอลัมน์ ①):
//   Tab ลงตัวเลือกที่ใช้อยู่ โปรแกรมอ่านจอบอก "1 จาก 2" ⇒ รู้ว่าลูกศรไปอีกตัวเลือก (เดิม role="group" + aria-pressed ไม่บอกอะไรเลย)
// ⚠️ ไม่มีสิทธิ์/ใบล็อก (โหมดอ่าน) = ไม่มีสวิตช์ ไม่มีช่องกรอก — บอกโหมดเป็นคำ + ช่วง
// ⚠️ ขอบแดงเฉพาะหลังกด (แผงแดง/บันทึกไม่ผ่าน) — ผู้เรียกส่ง `error` มาเมื่อมีเท่านั้น
// ⚠️ คำทุกคำมาจาก `SERVICE_PERIOD_TEXT` (serviceSetup.js)
import { CalendarDays, Copy, Layers, ListPlus, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import Segmented from "@/components/ui/Segmented";
import StatusNotice from "@/components/ui/StatusNotice";
import Tag from "@/components/ui/Tag";
import { SERVICE_PERIOD_MODE_LINE, SERVICE_PERIOD_TEXT, periodEndFromMonths } from "@/lib/sales/serviceSetup";
import { PERIOD_FIELD_ID, periodLabel, periodReadout } from "./serviceSetupDraft";
import styles from "./ServiceSetupFields.module.css";

const MONTH_CHIPS = [12, 24];
const MODE_ICONS = Object.freeze({ whole: Layers, line: ListPlus });
const MODE_OPTIONS = SERVICE_PERIOD_TEXT.modes.map((option) => ({ ...option, icon: MODE_ICONS[option.value] }));

/* ช่วงรวมของใบ (แยกรายรายการ) — กล่องเส้นประอ่านอย่างเดียว · เป็นที่หมายของ "ไปแก้" ข้อช่วงของใบ (`svc-period`) */
function Envelope({ period, error }) {
  const has = !!(period?.from && period?.to);
  return (
    <div
      id={PERIOD_FIELD_ID}
      tabIndex={-1}
      className={styles.periodEnvelope}
      role="group"
      aria-label={SERVICE_PERIOD_TEXT.envelopeAria}
      data-invalid={error ? "" : undefined}
    >
      <Lock size={13} aria-hidden="true" />
      <span className={styles.periodEnvelopeLabel}>{SERVICE_PERIOD_TEXT.envelopeLabel}</span>
      <b className={styles.periodEnvelopeValue} data-empty={has ? undefined : ""}>
        {has ? periodLabel(period) : SERVICE_PERIOD_TEXT.envelopeEmpty}
      </b>
      <span className={styles.periodEnvelopeHow}>{SERVICE_PERIOD_TEXT.envelopeHow}</span>
    </div>
  );
}

/**
 * @param mode โหมดบนจอ ('whole' | 'line' — ร่างหรือค่าที่บันทึก)
 * @param period `{ from, to }` — โหมดทั้งใบ: ช่วงของใบ (ร่างหรือค่าที่บันทึก) · แยกรายรายการ: ช่วงรวมของรายการบนจอ (`localEnvelope`)
 * @param editable โหมดแก้ · @param backfill ใบที่อนุมัติแล้ว (ตั้งย้อนหลัง) — เพิ่มคำแนะนำให้สลับเป็นแยกรายรายการเมื่อสาขาเริ่มไม่พร้อมกัน
 * @param error ข้อความของช่องนี้หลังกด (null = ไม่แดง) · @param counter `{ total, filled }` รายการงานบริการ / ที่ใส่ช่วงแล้ว
 * @param pendingClear จำนวนรายการที่ช่วงจะถูกแทนเมื่อบันทึก (ใบที่บันทึกเป็นแยกรายรายการ แล้วร่างสลับกลับทั้งใบ) · 0 = ไม่เตือน
 * @param onModeChange `(mode) => void` · @param onChange `({ from, to }) => void` (ช่วงของทั้งใบ) · @param onApplyAll `() => void`
 */
export default function ServicePeriodField({
  mode = "whole", period, editable = false, backfill = false, error = null, counter = null, pendingClear = 0,
  onModeChange, onChange, onApplyAll,
}) {
  const from = period?.from || "";
  const to = period?.to || "";
  const readout = periodReadout({ from, to });
  const byLine = mode === SERVICE_PERIOD_MODE_LINE;
  const total = Number(counter?.total || 0);
  const counterText = total ? SERVICE_PERIOD_TEXT.counter(Number(counter?.filled || 0), total) : null;

  if (!editable) {
    return (
      <div className={styles.period}>
        <div className={styles.periodRow}>
          <span className={styles.label}>{SERVICE_PERIOD_TEXT.label}</span>
          <Tag>{byLine ? SERVICE_PERIOD_TEXT.readModeLine : SERVICE_PERIOD_TEXT.readModeWhole}</Tag>
          {byLine ? <span className={styles.periodNote}>{SERVICE_PERIOD_TEXT.envelopeLabel}</span> : null}
          <span className={styles.periodReadout}>{periodLabel({ from, to })}{readout ? ` (${readout})` : ""}</span>
          {byLine && counterText ? <span className={styles.periodNote}>{counterText}</span> : null}
        </div>
      </div>
    );
  }

  const chipValue = MONTH_CHIPS.find((months) => from && to && periodEndFromMonths(from, months) === to) ?? null;
  const set = (next) => onChange?.({ from, to, ...next });
  return (
    <div className={styles.period} data-mode={byLine ? "line" : "whole"}>
      <div className={styles.periodTop}>
        <span className={styles.periodTitle}>
          <CalendarDays size={15} aria-hidden="true" />
          <span>{SERVICE_PERIOD_TEXT.label}<span className={styles.req} aria-hidden="true">*</span></span>
        </span>
        <Segmented
          className={styles.periodMode}
          options={MODE_OPTIONS}
          value={byLine ? "line" : "whole"}
          onChange={(next) => onModeChange?.(next)}
          ariaLabel={SERVICE_PERIOD_TEXT.modeAria}
          selection="radio"
          activationMode="manual"
        />
      </div>

      {byLine ? (
        <div className={styles.periodRow}>
          <Envelope period={{ from, to }} error={error} />
          {counterText ? <span className={styles.periodNote}>{counterText}</span> : null}
          <span className={styles.periodGrow} />
          {total ? (
            <Button size="sm" variant="quiet" className={styles.periodSame} icon={<Copy size={13} aria-hidden="true" />} onClick={() => onApplyAll?.()}>
              {SERVICE_PERIOD_TEXT.sameForAll}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className={styles.periodRow}>
          <div className={styles.periodDates}>
            <div className={styles.field}>
              <span className={styles.hint}>{SERVICE_PERIOD_TEXT.startLabel}</span>
              <DateInput
                id={PERIOD_FIELD_ID}
                value={from}
                onChange={(iso) => set({ from: iso || "" })}
                ariaLabel={SERVICE_PERIOD_TEXT.startLabel}
                invalid={!!error}
              />
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
          <span className={styles.periodNote}>{SERVICE_PERIOD_TEXT.wholeNote}</span>
        </div>
      )}

      {error ? <span className={styles.fieldError} role="alert">{error}</span> : null}
      {!byLine && pendingClear > 0 ? (
        <StatusNotice tone="warning">{SERVICE_PERIOD_TEXT.clearNotice(pendingClear)}</StatusNotice>
      ) : null}
      <p className={styles.hint}>{byLine ? SERVICE_PERIOD_TEXT.lineHint : SERVICE_PERIOD_TEXT.wholeHint}</p>
      {backfill && !byLine ? <p className={styles.hint}>{SERVICE_PERIOD_TEXT.backfillHint}</p> : null}
    </div>
  );
}
