"use client";
// ── ช่อง "รอบละกี่แพ็ค *" ของบรรทัดขั้น ② (PR-D · mig 0394 · r2 S12 · IMPL_PLAN_D DD1 · ป้ายตามมติ 29/09) ─────────────
//
// ⭐ มติเจ้าของ 29/09 ("ลำดับนี้ใช้กับ SO ใหม่และ SO ย้อนหลัง"): ป้าย = `SERVICE_PACKS_LABEL` ผ่าน `HISTORICAL_SERVICE_TEXT`
// ⭐ มติเจ้าของ 08/10 รอบสอง (จอฝ่ายขายที่เหลือ — ตามตารางงานบริการของใบใหม่ #1878): ช่องนี้อยู่ **ก่อน** "จำนวนรอบบริการ *"
//   ในแถบผูก (ผู้เรียกวาง: ไซต์ · โซน → ช่องนี้ → จำนวนรอบบริการ) แล้วตามด้วย "รวมทั้งรายการ n แพ็ค"
//
// ⭐ มติ 26/09 (A3/O9): "แพ็คต่อรอบ" เป็น **ช่องของตัวเองต่อโซน** — ไม่ใช่จำนวนของบรรทัด (มติ 23/09 ยังจริง: จำนวน = เงิน
//   1 ชุด × 12 เดือน) ⇒ ฐานเก็บใน `sales_order_line_zones.packsPerRound` (หนึ่งแถวต่อบรรทัด — 0394/P6) แล้วรอบขายของโซน
//   ตอนอนุมัติได้ `packageQty` = แพ็คต่อรอบ (0394/P3 ผ่าน `sales_order_open_service_terms`)
// ⭐ จำนวนเต็ม 1–9999 (ขอบเดียวกับ CHECK ของ 0392 · ZONES_BULK_PACKS_* · HISTORICAL_SERVICE_LIMITS) · หน่วย "แพ็ค"
// ⭐ ชิป "ประเมินไว้ n แพ็ค" + ปุ่ม "ใช้" = ตัวช่วยเติมค่า **ไม่ใช่ด่าน** (สีกลาง ไม่แดง) — ผลประเมินอ่านที่ขั้น ② จากเส้น
//   ทะเบียนของลูกค้า (DD3) · ยังโหลด/อ่านไม่ได้ = ไม่มีชิป (ผู้เรียกส่ง view ที่คิดด้วย null)
// 🔴 แดงหลังกด "ถัดไป" เท่านั้น — `error` มาจากข้อความของแผนที่ผูกกับแถว (ช่องเดียวกับช่องอื่นของบรรทัด)
// ⚠️ คำว่า "แพ็ค" มาจาก `HISTORICAL_SERVICE_TEXT` ที่เดียว (§0.2 ข้อ 14) · ไม่มีตัวตัดสินเงินในไฟล์นี้ (§0.2 ข้อ 13)
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { HISTORICAL_SERVICE_TEXT } from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalOrderWizard.module.css";

const T = HISTORICAL_SERVICE_TEXT;
/* ⚠️ ชื่อคีย์ขึ้นต้นด้วย "use" ⇒ eslint (rules-of-hooks) อ่านการเรียก `T.useAssessedAria(…)` ในเงื่อนไขเป็น hook — ถือเป็นค่าแทน */
const assessedAriaOf = T.useAssessedAria;

/**
 * @param value ค่าในช่อง (ข้อความ — ตามที่พิมพ์) · @param onChange `(text) => void`
 * @param view ผลของ `historicalLineServiceView(row, assessedByZone)` — `{ assessed, canUse, total, totalText }`
 * @param error ข้อความผิดของช่องนี้ (หลังกด "ถัดไป") · @param name ชื่อบรรทัด ("รายการ n") · @param disabled ระหว่างบันทึก
 */
export default function HistoricalLineServiceFields({ value, onChange, view = null, error = null, name = "", disabled = false }) {
  return (
    <div className={styles.lineBindPacks}>
      <span className={styles.lineBindLabel}>{T.packsLabel} <b className={styles.req}>*</b></span>
      <span className={styles.packsField}>
        <Input
          type="number" min="1" max="9999" step="1" inputMode="numeric" placeholder="—" autoComplete="off"
          value={value ?? ""}
          disabled={disabled}
          invalid={!!error}
          aria-required="true"
          onChange={(event) => onChange?.(event.target.value)}
          aria-label={T.packsAria(name)}
        />
        <span className={styles.packsUnit}>{T.packsUnit}</span>
      </span>
      {view?.assessed ? (
        <span className={styles.assessChip}>
          {T.assessed(view.assessed)}
          {view.canUse ? (
            <Button
              size="sm" variant="quiet"
              disabled={disabled}
              onClick={() => onChange?.(String(view.assessed))}
              aria-label={assessedAriaOf(view.assessed, name)}
            >
              {T.useAssessed}
            </Button>
          ) : null}
        </span>
      ) : null}
      {error ? <span className={styles.cellBad}>{error}</span> : null}
    </div>
  );
}

/** "รวมทั้งรายการ n แพ็ค" (รอบละกี่แพ็ค × จำนวนรอบบริการ) — อ่านอย่างเดียว · ขึ้นเมื่อสองช่องถูกทั้งคู่ (ตัวอ่านตัวเดียวกับแผน) */
export function HistoricalLineServiceTotal({ view = null }) {
  return view?.totalText ? <span className={styles.lineBindTotal}>{view.totalText}</span> : null;
}
