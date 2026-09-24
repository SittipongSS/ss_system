"use client";
// ── ชิ้นส่วนในเนื้อของโมดัลจัดคิวแบบ A "สองคอลัมน์" (มติเจ้าของ 24/09) ─────────────────────
//
// ⭐ ของที่ **ทั้งสองงาน** (แก้นัด `ServiceVisitModal` · ลงคิวเข้าพื้นที่ `CommitDueDialog`) วาดเหมือนกัน:
//    · `JobFacts`   — กล่อง "งานนี้" (คู่ป้าย–ค่า: งาน · โซน/เรื่อง · ที่ไหน · ผู้ขอ · ที่มา)
//    · `ModalField` — ป้ายช่อง + ข้อความข้างป้าย ("อีก 7 วัน" · "เจ้าของงาน — …") + คำใบ้ใต้ช่อง
//    · `Disclosure` — ส่วนรองที่พับไว้ (ความเคลื่อนไหว · ผลการเข้าจริงของนัดที่ยังไม่ถึงวัน)
//    · `WishChip`   — ชิปความต้องการของผู้ขอ ("ตรงกัน" / ปุ่ม "ใช้ตามผู้ขอ")
//    · `KeepTogether` — ข้อความที่ช่วงเวลา/วันที่ห้ามถูกหั่นกลางบรรทัด (บรรทัดช่วงเข้าไซต์ · เหตุบนแผงด่าน · ผลลัพธ์)
//    · `focusFieldBox` — พาโฟกัสไปช่องหนึ่ง (ลิงก์แก้บนแผงด่าน · ปุ่มบนการ์ด) ตัวเดียวของสองโมดัล
// ⚠️ อยู่เป็นคอมโพเนนต์ ไม่ใช่คลาส CSS ที่สองโฟลเดอร์ import ร่วม — `CommitDueDialog` อยู่คนละโฟลเดอร์
//    (กติกา audit:ui ห้าม import *.module.css ข้ามโฟลเดอร์ · ของที่ใช้ร่วมต้องเป็นคอมโพเนนต์ที่เป็นเจ้าของสไตล์เอง)
// ⚠️ วาดอย่างเดียว — แถว/คำ/การตัดสินมาจาก lib (`visitJobRows` · `commitDueJobRows` · `commitDueWishes`)
import { useEffect, useId, useRef } from "react";
import { Check, ChevronRight, MapPin, UserRound } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { keepTogetherRuns } from "@/lib/service/scheduleModal";
import styles from "./ScheduleModalParts.module.css";

/* ตัวที่รับโฟกัสได้ในกล่องของช่อง — ช่องเป็น component กลาง (SearchableSelect · DateInput · CrewLoadPicker)
   ที่ไม่ส่ง ref ออกมา จึงหาจากกล่องที่ห่อแทน
   🐞 รีวิว UAT 24/09: ตัวเลือกนี้กับตัวพาโฟกัสเคยก๊อปอยู่สองโมดัลคำต่อคำ ⇒ ย้ายมาอยู่ที่เดียว */
export const FIELD_FOCUSABLE = 'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * พาโฟกัสไปช่องในกล่อง — คนที่เลือกไว้ก่อน (radio ที่ติ๊กอยู่) · ไม่มีก็ตัวแรกที่รับโฟกัสได้
 * @returns true เมื่อโฟกัสได้ · false = ช่องยังไม่ขึ้นจอ (ผู้เรียกคงคำขอไว้ลองใหม่)
 */
export function focusFieldBox(box) {
  const target = box?.querySelector('input[type="radio"]:checked') || box?.querySelector(FIELD_FOCUSABLE);
  if (!target) return false;
  box.scrollIntoView({ block: "nearest" });
  target.focus({ preventScroll: true });
  return true;
}

/**
 * ข้อความที่ช่วงเวลา ("14:30–16:30" · "(10:00–20:00)") และวันไทย ("พฤ. 1 ต.ค.") ไม่ถูกหั่นกลางบรรทัด
 * 🐞 รีวิว UAT 24/09: บน 390px บรรทัดช่วงเข้าไซต์ตัดเป็น "(14:30–" / "16:30)" · การแบ่งท่อนอยู่ที่ `keepTogetherRuns`
 */
export function KeepTogether({ text }) {
  return keepTogetherRuns(text).map((run, index) => (
    run.keep ? <span key={index} className={styles.keep}>{run.text}</span> : run.text
  ));
}

/**
 * กล่อง "งานนี้" — คู่ป้าย–ค่า อ่านอย่างเดียว
 * @param rows `[{ key, label, value?, kind?, extra?, sub?, badge?, items? }]`
 *   · `kind` = จุดสีตามชนิดงาน (ชุดสีของเปลือก `data-kind`) · `extra` = ตัวเลขต่อท้าย "· 3 จุด · 2 แพ็ค"
 *   · `badge` = `{ label, tone }` ต่อท้ายค่า (ป้ายขั้น "ขั้น 2/2") · `sub` = บรรทัดรองใต้ค่า
 *   · `items` = รายการหลายบรรทัด (โซน) `[{ key, text, tag? }]` — ใช้แทน `value`
 * @param children ของต่อท้ายกล่อง (ปุ่ม "แก้ไซต์/ชนิดงาน" ของโมดัลนัด)
 */
export function JobFacts({ rows = [], children = null }) {
  const titleId = useId();
  return (
    <section className={styles.job} aria-labelledby={titleId}>
      <h4 className={styles.sectionTitle} id={titleId}>
        <MapPin size={15} aria-hidden="true" className={styles.sectionIcon} />
        งานนี้
      </h4>
      <dl className={styles.facts}>
        {rows.map((row) => (
          <div key={row.key} className={styles.fact}>
            <dt>{row.label}</dt>
            <dd>
              {row.items ? (
                <ul className={styles.items}>
                  {row.items.map((item) => (
                    <li key={item.key}>
                      {item.text}
                      {item.tag ? <StatusBadge size="sm" tone="warning" label={item.tag} className={styles.inlineBadge} /> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <span className={styles.value} data-kind={row.kind || undefined}>{row.value}</span>
                  {row.extra ? <span className={styles.extra}> · {row.extra}</span> : null}
                  {row.badge ? (
                    <StatusBadge size="sm" tone={row.badge.tone || "neutral"} label={row.badge.label} className={styles.inlineBadge} />
                  ) : null}
                  {row.sub ? <span className={styles.sub}>{row.sub}</span> : null}
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

/**
 * ช่องหนึ่งช่อง — ป้าย (+ ดอกจัน) · ข้อความข้างป้าย · ตัวคอนโทรล · คำใบ้
 * @param htmlFor  id ของช่องกรอกตัวเดียว ⇒ ป้ายเป็น `<label>` · ไม่ส่ง = ป้ายเป็น `<span id={labelId}>`
 *                 (กลุ่ม radio/ปุ่มหลายตัวอ้างป้ายด้วย `aria-labelledby` — label ห่อหลายช่องไม่ได้)
 * @param fieldRef ref ของกล่อง — โมดัลพาโฟกัสมาที่ช่องนี้ได้ (ลิงก์แก้ของแผงด่าน · ปุ่มบนการ์ด)
 */
export function ModalField({
  label, htmlFor, labelId, required = false, aside = null, asideTone, hint = null, hintId, fieldRef, children,
}) {
  const mark = required ? <span className={styles.req} aria-hidden="true"> *</span> : null;
  return (
    <div className={styles.field} ref={fieldRef}>
      <div className={styles.labelRow}>
        {htmlFor ? (
          <label htmlFor={htmlFor} id={labelId} className={styles.label}>{label}{mark}</label>
        ) : (
          <span id={labelId} className={styles.label}>{label}{mark}</span>
        )}
        {aside ? <span className={styles.aside} data-tone={asideTone || undefined}>{aside}</span> : null}
      </div>
      {children}
      {hint ? <p className={styles.hint} id={hintId}>{hint}</p> : null}
    </div>
  );
}

/**
 * ส่วนรองที่พับไว้ — หัวเป็นปุ่ม (`aria-expanded`) · บรรทัดย่อบอกว่าข้างในมีอะไรโดยไม่ต้องกาง
 * ⭐ ตัวเนื้อ **เมานต์อยู่เสมอ** แค่ `hidden` — เธรดโหลดและมาร์คแจ้งเตือนว่าอ่านแล้วตอนเปิดโมดัล
 *    เหมือนเดิมทุกจังหวะ (ถอดออกตอนพับ = ไม่โหลดจนกว่าจะกาง = เปลี่ยนพฤติกรรมเงียบ ๆ)
 * @param count ตัวเลขข้างหัว · null = ไม่มีป้าย (ยังไม่รู้ ≠ 0)
 */
export function Disclosure({ title, count = null, summary = "", open = false, onToggle, children }) {
  const panelId = useId();
  return (
    <div className={styles.disclosure} data-open={open ? "yes" : undefined}>
      <button type="button" className={styles.discButton} aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <ChevronRight size={15} aria-hidden="true" className={styles.discIcon} />
        <span className={styles.discText}>
          <span className={styles.discTitle}>
            {title}
            {count != null ? <StatusBadge size="sm" tone="neutral" label={String(count)} /> : null}
          </span>
          {summary && !open ? <span className={styles.discSummary}>{summary}</span> : null}
        </span>
      </button>
      <div id={panelId} className={styles.discPanel} hidden={!open}>{children}</div>
    </div>
  );
}

/**
 * ชิปความต้องการของผู้ขอ — ตรง = "✓ ตรงกัน" (ข้อมูล ไม่ใช่ปุ่ม) · ไม่ตรง = ปุ่มกดเดียวใช้ค่าของผู้ขอ
 * (pain 14: เดิมซ่อนเป็นประโยคคำใบ้ที่ซ้ำค่าในช่องเมื่อเท่ากัน และจมเมื่อไม่เท่า)
 * @param wish ผลของ `commitDueWishes(...).visit|result` — null = ผู้ขอไม่ได้ระบุ ⇒ ไม่มีชิป
 * @param sameText/applyText คำจาก lib (`WISH_SAME_TEXT` · `WISH_APPLY_TEXT`)
 * 🐞 รีวิว UAT 24/09: กด "ใช้ตามผู้ขอ" แล้วปุ่ม (ที่โฟกัสอยู่) ถูกแทนด้วยชิปข้อความ ⇒ โฟกัสหล่นไป body
 *    ⇒ ชิป "ตรงกัน" รับโฟกัสด้วยสคริปต์ได้ (`tabIndex={-1}` · ไม่อยู่ในลำดับ Tab) แล้วโฟกัสย้ายไปที่นั่น
 */
export function WishChip({ wish, onApply, sameText, applyText }) {
  const sameRef = useRef(null);
  const applied = useRef(false);
  /* หลังกดใช้ค่าของผู้ขอ — รอบที่ชิปกลายเป็น "ตรงกัน" พาโฟกัสตามไป (ไม่มี deps: เช็กทุกเรนเดอร์ ถูกกว่าพลาดรอบ) */
  useEffect(() => {
    if (applied.current && wish?.same) {
      applied.current = false;
      sameRef.current?.focus();
    }
  });
  if (!wish) return null;
  const body = (
    <>
      <UserRound size={14} aria-hidden="true" className={styles.wishIcon} />
      <span>{wish.lead} <b>{wish.value}</b></span>
    </>
  );
  if (wish.same) {
    return (
      <span className={styles.wish} ref={sameRef} tabIndex={-1}>
        {body}
        <span className={styles.wishSame}><Check size={13} aria-hidden="true" />{sameText}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`${styles.wish} ${styles.wishApply}`}
      onClick={() => {
        applied.current = true;
        onApply?.(wish.patch);
      }}
    >
      {body}
      <span className={styles.wishAction}>{applyText}</span>
    </button>
  );
}
