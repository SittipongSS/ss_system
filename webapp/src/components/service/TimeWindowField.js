"use client";
// ── ช่อง "วัน + เวลา" ของโมดัลจัดคิว (แบบ A · มติเจ้าของ 24/09) — ตัวเดียวของสองงาน ──────────
//
// ⭐ ทรงเดียวทั้งแก้นัดและลงคิวเข้าพื้นที่ (pain 13: เดิมฝั่งหนึ่งมีช่วงเวลา+ปุ่มลัด อีกฝั่งมีเวลาเดียว)
//    · ช่องวันโชว์วันไทยมีวันในสัปดาห์ ("พฤ. 1 ต.ค. 2026" · `DateInput weekday` · pain 10) · ข้างหัวช่องบอกระยะห่าง ("อีก 7 วัน")
//    · แผ่นเวลาเป็น radiogroup จริงที่ **เห็นว่าเลือกอันไหนอยู่** (pain 8) — อ่านจากเวลาในฟอร์ม
//      (`timePresetOf`) ไม่ใช่ค่าที่เก็บ · "กำหนดเอง" ค้างไว้ได้ในจอ (กดแล้วต้องเห็นว่ามันถูกเลือก)
//      · ออกจาก "กำหนดเอง" แล้วกลับมา ได้เวลาที่พิมพ์ไว้คืน (`pickTimePreset` — รีวิว UAT 24/09: ลูกศรเคยทับเวลาที่พิมพ์)
//    · เวลาเริ่ม–จบ · บรรทัดช่วงที่ไซต์ให้เข้าอยู่ **ใต้เวลา** ที่มันจำกัด (pain 9) · อำพันเมื่อชน
// ⚠️ `withEnd={false}` (ลงคิวเข้าพื้นที่) = เก็บได้แค่เวลาเริ่ม (D1 — `committedDueTime`) ⇒ ช่องเวลาจบเป็นช่องจาง
//    "ไม่ระบุ" ตามแบบ A (ไม่ใช่ช่องกรอก) · แผ่นเช้า/บ่ายเติมแค่เวลาเริ่ม · ไม่มี "เต็มวัน" (ซ้ำกับเช้า/ไม่ระบุ)
// ⚠️ `withTime={false}` (แจ้งกำหนดส่งของหัวข้ออื่น) = วันอย่างเดียว — ช่องวันตัวเดียวกันทุกงาน ไม่มีเวลาให้กรอก
// ⚠️ ตรรกะอยู่ที่ `lib/service/scheduleModal.js` — ตัวนี้วาดอย่างเดียว
import { useId, useRef, useState } from "react";
import { AlertTriangle, CircleHelp, ShieldCheck } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import TimeInput from "@/components/ui/TimeInput";
import { nextEnabledIndex } from "@/lib/ui/selectionNavigation";
import { pickTimePreset, timePresetOf, timePresetOptions, TIME_PRESET_CUSTOM } from "@/lib/service/scheduleModal";
import { relDayText } from "@/lib/service/queueWords";
import { KeepTogether } from "./ScheduleModalParts";
import styles from "./TimeWindowField.module.css";

const ACCESS_ICONS = { conflict: AlertTriangle, unknown: CircleHelp };
/* ลูกศรขึ้น-ลงทำงานเหมือนซ้าย-ขวา — แผ่นเรียงแถวเดียวบนจอกว้าง แต่ตัดเป็นสองแถวบนมือถือ */
const ARROW_ALIASES = { ArrowUp: "ArrowLeft", ArrowDown: "ArrowRight" };

/**
 * @param date/onDate          วันนัด 'YYYY-MM-DD'
 * @param startTime/endTime    เวลา 'HH:MM' · `onTime({ startTime, endTime })` ทุกครั้งที่เปลี่ยน
 * @param withEnd              มีเวลาจบไหม (ลงคิวเข้าพื้นที่ = false)
 * @param withTime             มีเวลาไหม (แจ้งกำหนดส่ง = false ⇒ วันอย่างเดียว ไม่มีแผ่นเวลา)
 * @param dateLabel/timeLabel  ป้ายช่อง (ตามงาน: "วันที่นัด" · "วันนัดเข้าพื้นที่")
 * @param todayIso             วันนี้แบบไทย — ป้าย "อีก n วัน" ข้างหัวช่อง
 * @param pastLabel            คำของวันที่ผ่านไปแล้ว ("วันเสนอผ่านไปแล้ว" …)
 * @param access               ผลของ `accessLine(site, …)` — บรรทัดใต้เวลา · null = ไม่มีบรรทัด
 * @param dateRef              ref ของกล่องวัน (โมดัลพาโฟกัสมาที่นี่ตอนกด "แก้วัน/เวลา")
 * @param dateSlot             ของใต้ช่องวัน (เหตุผลที่เลื่อน)
 * @param accessSlot           ของข้างบรรทัดช่วงเข้า (ชิปความต้องการของผู้ขอ)
 */
export default function TimeWindowField({
  date = "",
  onDate,
  startTime = "",
  endTime = "",
  onTime,
  withEnd = true,
  withTime = true,
  dateLabel = "วันที่นัด",
  timeLabel = "เวลานัด",
  required = true,
  todayIso = "",
  pastLabel = "ผ่านมาแล้ว",
  access = null,
  dateRef,
  dateSlot = null,
  accessSlot = null,
  disabled = false,
}) {
  const dateId = useId();
  const timeLabelId = useId();
  const presetLabelId = useId();
  const startRef = useRef(null);
  const tilesRef = useRef(null);
  /* "กำหนดเอง" ค้างไว้ในจอ — กดแล้วเวลาอาจยังตรงปุ่มลัดอยู่ (เช่น 09:00–12:00) แต่คนตั้งใจจะพิมพ์เอง
     ⚠️ ไม่ใช่ค่าที่เก็บ — ปิดโมดัลแล้วหาย · กดแผ่นอื่นแล้วหาย */
  const [pinnedCustom, setPinnedCustom] = useState(false);
  /* เวลาที่พิมพ์เองซึ่งจำไว้ตอนออกจาก "กำหนดเอง" — ไม่ใช่ค่าที่เก็บ (ปิดโมดัลแล้วหาย) */
  const remembered = useRef(null);
  const options = timePresetOptions({ withEnd });
  const selected = pinnedCustom ? TIME_PRESET_CUSTOM : timePresetOf({ startTime, endTime }, { withEnd });
  const rel = todayIso ? relDayText(date, todayIso, pastLabel) : { text: "", tone: "" };
  /* วันไทยอยู่ในช่องแล้ว (`weekday`) — ข้างหัวช่องเหลือแค่ระยะห่าง ไม่พูดวันซ้ำ (แบบ A: "อีก 7 วัน") */
  const dateAside = rel.text;

  const emit = (next) => onTime?.(withEnd ? next : { startTime: next.startTime, endTime: "" });
  const pick = (key, { focusStart = false } = {}) => {
    const step = pickTimePreset(key, { selected, current: { startTime, endTime }, remembered: remembered.current, withEnd });
    remembered.current = step.remembered;
    setPinnedCustom(key === TIME_PRESET_CUSTOM);
    emit(step.times);
    if (focusStart && key === TIME_PRESET_CUSTOM) {
      startRef.current?.querySelector("input")?.focus();
    }
  };
  /* radiogroup แบบ roving — ลูกศรย้ายโฟกัส **และเลือก** (พฤติกรรมของ radio) · Tab เข้าออกทีเดียว */
  const onTileKey = (event, index) => {
    const key = ARROW_ALIASES[event.key] || event.key;
    const next = nextEnabledIndex(options, index, key, "horizontal");
    if (next < 0) return;
    event.preventDefault();
    pick(options[next].key);
    tilesRef.current?.querySelectorAll('[role="radio"]')[next]?.focus();
  };

  const timeBlock = withTime ? (
    <div className={styles.time}>
      <span id={timeLabelId} className={styles.label}>{timeLabel}</span>
      <div className={styles.pair} role="group" aria-labelledby={timeLabelId}>
        <span ref={startRef} className={styles.timeInput}>
          <TimeInput
            value={startTime || ""}
            ariaLabel={withEnd ? "ตั้งแต่" : timeLabel}
            disabled={disabled}
            onChange={(value) => emit({ startTime: value, endTime })}
          />
        </span>
        <span className={styles.dash} aria-hidden="true" />
        <span className={styles.timeInput}>
          {withEnd ? (
            <TimeInput
              value={endTime || ""}
              ariaLabel="ถึง"
              disabled={disabled}
              onChange={(value) => emit({ startTime, endTime: value })}
            />
          ) : (
            /* ลงคิวเข้าพื้นที่เก็บได้แค่เวลาเริ่ม — ช่องจางตามแบบ A (ไม่ใช่ช่องกรอกที่พิมพ์แล้วหายตอนบันทึก) */
            <span className={styles.endNone}>
              ไม่ระบุ<span className={styles.srOnly}> — เวลาจบ ลงคิวเข้าพื้นที่ไม่เก็บเวลาจบ</span>
            </span>
          )}
        </span>
      </div>
    </div>
  ) : null;

  const tiles = withTime ? (
    <>
      <span id={presetLabelId} className={styles.srOnly}>ช่วงเวลานัด</span>
      <div
        ref={tilesRef}
        className={styles.presets}
        data-tiles={options.length}
        role="radiogroup"
        aria-labelledby={`${timeLabelId} ${presetLabelId}`}
      >
        {options.map((option, index) => {
          const on = option.key === selected;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={styles.tile}
              data-on={on ? "1" : undefined}
              disabled={disabled}
              onClick={() => pick(option.key, { focusStart: true })}
              onKeyDown={(event) => onTileKey(event, index)}
            >
              {option.label}
              {option.sub ? <span className={styles.tileSub}>{option.sub}</span> : null}
            </button>
          );
        })}
      </div>
    </>
  ) : null;

  return (
    <div className={styles.field}>
      <div className={styles.when} data-with-end={withEnd ? "yes" : "no"} data-with-time={withTime ? undefined : "no"}>
        <div className={styles.date} ref={dateRef}>
          <div className={styles.labelRow}>
            <label htmlFor={dateId} className={styles.label}>
              {dateLabel}{required ? <span className={styles.req} aria-hidden="true"> *</span> : null}
            </label>
            {dateAside ? <span className={styles.aside} data-tone={rel.tone || undefined}>{dateAside}</span> : null}
          </div>
          <DateInput id={dateId} value={date || ""} onChange={onDate} disabled={disabled} required={required} weekday />
        </div>
        {timeBlock}
      </div>

      {dateSlot}

      {tiles}

      {access || accessSlot ? (
        <div className={styles.constraints}>
          {access ? <AccessLine access={access} /> : null}
          {accessSlot}
        </div>
      ) : null}
    </div>
  );
}

/* บรรทัดช่วงที่ไซต์ให้เข้า — "ไซต์ให้เข้า {ช่วง} — {ผล}" · ชน = อำพัน (เตือน ไม่ห้าม · ด่าน ④ เป็นคนบล็อก) */
function AccessLine({ access }) {
  const Icon = ACCESS_ICONS[access.state] || ShieldCheck;
  return (
    <p className={styles.access} data-state={access.state}>
      <Icon size={14} aria-hidden="true" className={styles.accessIcon} />
      <span>
        {access.windowText ? <>ไซต์ให้เข้า <b><KeepTogether text={access.windowText} /></b>{" — "}</> : null}
        <span className={styles.accessResult}><KeepTogether text={access.text} /></span>
      </span>
    </p>
  );
}
