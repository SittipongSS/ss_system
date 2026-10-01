"use client";
// ── ช่วงบริการของรายการ — ใต้คำตอบ ‘งานบริการ?’ ในคอลัมน์ ① (mig 0400 · มติเจ้าของ 01/10 รอบสอง · ม็อก PeriodSwitch) ──────────
//
// เจ้าของ: "ช่วงบริการ เอาไว้ คอลัมน์ 1 งานบริการดีกว่า ถ้าใช่ก็ให้กรอก ไม่ใช่ก็ปิดหรือเทาไป" → อนุมัติ "ไม่ใช่ = ปิดช่วง"
// ⭐ หน้าตาตามคำตอบของรายการ × โหมดของใบ:
//   · ยังไม่ตอบ                         → ไม่วาดอะไร (ยังไม่มีช่วงให้เห็นจนกว่าจะตอบ)
//   · ไม่ใช่งานบริการ (ทั้งสองโหมด)      → บรรทัดเดียว "ไม่มีช่วงบริการ" (ไม่มีช่องสีเทาชวนให้กรอก)
//   · ใช่ + ทั้งใบช่วงเดียว              → ช่วงของทั้งใบ อ่านอย่างเดียว + แม่กุญแจ "ตามช่วงของทั้งใบ" (แก้ที่แถบช่วงบริการด้านบน)
//   · ใช่ + แยกรายรายการ + โหมดแก้       → ช่อง เริ่ม / ถึง ซ้อนกัน + ชิป 12 ด. / 24 ด. + ตัวอ่าน + ปุ่ม "เหมือนรายการ n"
//   · ใช่ + แยกรายรายการ + โหมดอ่าน      → ช่วงของรายการเป็นตัวหนังสือ (ยังไม่ใส่ = "ยังไม่ใส่ช่วง")
// ⭐ ชิป "12 ด." / "24 ด." = วันสิ้นสุด = วันเริ่ม + n เดือนปฏิทิน − 1 วัน (`periodEndFromMonths` ตัวเดียวกับแถบของทั้งใบและ server)
//   ต้องมีวันเริ่มก่อน — ไม่มีวันเริ่ม = ชิปกดไม่ได้ (ไม่เดาวันเริ่มให้)
// 🔴 กฎ 3: ขอบแดงเฉพาะหลังกด — ผู้เรียกส่ง `error` (จาก `highlightOf` / ผลบันทึกไม่ผ่าน) มาเมื่อมีเท่านั้น
// ⚠️ คำทุกคำมาจาก `SERVICE_PERIOD_TEXT` (serviceSetup.js) — ไฟล์นี้ไม่พิมพ์คำของม็อกเอง
import { Copy, Lock } from "lucide-react";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import { NA, fmtDate } from "@/lib/format";
import {
  SERVICE_KIND_NOT_SERVICE, SERVICE_KIND_PACKAGE, SERVICE_PERIOD_MODE_LINE, SERVICE_PERIOD_TEXT, periodEndFromMonths,
} from "@/lib/sales/serviceSetup";
import { lineFieldId, periodReadout } from "./serviceSetupDraft";
import styles from "./ServiceSetupFields.module.css";

const MONTH_CHIPS = [12, 24];

/* "dd/mm/yyyy–" + "dd/mm/yyyy" เป็นสองก้อน — คอลัมน์ ① แคบ ตัดบรรทัดได้หลังขีด ไม่ตัดกลางวัน · ยังไม่ครบ = ขีด */
function PeriodRead({ period }) {
  const from = period?.from || "";
  const to = period?.to || "";
  if (!from || !to) return <span className={styles.linePeriodRead}><span>{NA}</span></span>;
  return (
    <span className={styles.linePeriodRead}>
      <span>{fmtDate(from)}–</span>
      <span>{fmtDate(to)}</span>
    </span>
  );
}

/**
 * @param line บรรทัดที่จอวาด (`mergedLines` — `role` · `lineNo` · `period` ของรายการในโหมดแยกรายรายการ)
 * @param periodMode โหมดบนจอ ('whole' | 'line') · @param editable โหมดแก้
 * @param orderPeriod ช่วงของทั้งใบบนจอ (โหมดทั้งใบ) · @param error ข้อความของช่องนี้หลังกด (null = ไม่แดง)
 * @param sameSource `{ lineId, lineNo, period }` ต้นทางของปุ่ม "เหมือนรายการ n" (`sameSourceOf`) · ไม่มี = null
 * @param onChange `({ from, to }) => void`
 */
export default function ServiceLinePeriod({
  line, periodMode, editable = false, orderPeriod = null, error = null, sameSource = null, onChange,
}) {
  if (!line) return null;
  if (line.role === SERVICE_KIND_NOT_SERVICE) return <span className={styles.linePeriodNone}>{SERVICE_PERIOD_TEXT.none}</span>;
  if (line.role !== SERVICE_KIND_PACKAGE) return null;

  const groupLabel = SERVICE_PERIOD_TEXT.lineGroupAria(line.lineNo);

  /* ทั้งใบช่วงเดียว: ช่วงของใบ อ่านอย่างเดียว (แก้ที่แถบช่วงบริการ) */
  if (periodMode !== SERVICE_PERIOD_MODE_LINE) {
    return (
      <div className={styles.linePeriod} data-state="ro" role="group" aria-label={`${groupLabel} · ${SERVICE_PERIOD_TEXT.followsOrder}`}>
        <PeriodRead period={orderPeriod} />
        <span className={styles.linePeriodCaption}>
          <Lock size={11} aria-hidden="true" />
          {SERVICE_PERIOD_TEXT.followsOrder}
        </span>
      </div>
    );
  }

  const from = line.period?.from || "";
  const to = line.period?.to || "";
  const readout = periodReadout({ from, to });

  if (!editable) {
    return (
      <div className={styles.linePeriod} data-state="ro" role="group" aria-label={groupLabel}>
        {from || to ? <PeriodRead period={{ from, to }} /> : null}
        <span className={styles.linePeriodCaption}>{readout ? SERVICE_PERIOD_TEXT.readout(readout) : SERVICE_PERIOD_TEXT.lineEmpty}</span>
      </div>
    );
  }

  const set = (next) => onChange?.({ from, to, ...next });
  const chipValue = MONTH_CHIPS.find((months) => from && to && periodEndFromMonths(from, months) === to) ?? null;
  const source = sameSource && sameSource.lineId !== line.lineId
    && !(sameSource.period?.from === from && sameSource.period?.to === to) ? sameSource : null;

  return (
    <div className={styles.linePeriod} data-state="open" role="group" aria-label={groupLabel}>
      <span className={styles.linePeriodLabel}>
        {SERVICE_PERIOD_TEXT.lineLabel}
        <span className={styles.req} aria-hidden="true">*</span>
      </span>
      <div className={styles.linePeriodDate}>
        <span className={styles.linePeriodKey} aria-hidden="true">{SERVICE_PERIOD_TEXT.from}</span>
        <DateInput
          compact
          id={lineFieldId(line.lineId, "period")}
          value={from}
          onChange={(iso) => set({ from: iso || "" })}
          ariaLabel={SERVICE_PERIOD_TEXT.lineStartAria(line.lineNo)}
          invalid={!!error}
        />
      </div>
      <div className={styles.linePeriodDate}>
        <span className={styles.linePeriodKey} aria-hidden="true">{SERVICE_PERIOD_TEXT.to}</span>
        <DateInput
          compact
          value={to}
          onChange={(iso) => set({ to: iso || "" })}
          ariaLabel={SERVICE_PERIOD_TEXT.lineEndAria(line.lineNo)}
          invalid={!!error}
        />
      </div>
      <div className={styles.linePeriodChips}>
        <ChoiceChips
          value={chipValue}
          onChange={(months) => set({ to: periodEndFromMonths(from, months) || to })}
          options={MONTH_CHIPS.map((months) => ({ value: months, label: SERVICE_PERIOD_TEXT.monthChipShort(months), disabled: !from }))}
          ariaLabel={`${SERVICE_PERIOD_TEXT.lineEndAria(line.lineNo)} — ${MONTH_CHIPS.map((months) => SERVICE_PERIOD_TEXT.monthChip(months)).join(" / ")}`}
        />
        <span className={styles.linePeriodReadout} data-wait={readout ? undefined : ""}>
          {readout ? SERVICE_PERIOD_TEXT.readout(readout) : SERVICE_PERIOD_TEXT.lineEmpty}
        </span>
      </div>
      {source ? (
        <button
          type="button"
          className={styles.linePeriodSame}
          title={SERVICE_PERIOD_TEXT.sameAsTitle(source.lineNo)}
          onClick={() => onChange?.({ from: source.period.from, to: source.period.to })}
        >
          <Copy size={11} aria-hidden="true" />
          {SERVICE_PERIOD_TEXT.sameAs(source.lineNo)}
        </button>
      ) : null}
      {error ? <span className={styles.fieldError} role="alert">{error}</span> : null}
    </div>
  );
}
