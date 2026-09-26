"use client";
// ── เลือกรอบวางบิลของงวด — ชิปรอบ · "วันอื่น…" · "รอเหตุการณ์" (มติเจ้าของ 25–26/09 · ม็อก billing-cycle จอ B + C) ──
//
// ⭐ SA **แตะรอบเดียวได้ทั้งวันวางบิลและกำหนดชำระ** — ไม่ต้องพิมพ์วัน (มติ "คิดให้" = แตะชิป ระบบคิดต่อ)
//   · ลูกค้าวางบิลทุกเดือน = ชิป 3 รอบถัดไป + "วันอื่น…" + "รอเหตุการณ์"
//   · ลูกค้าวางบิลได้ทุกวัน = ไม่มีรอบให้แตะ ⇒ ช่องวันวางบิลขึ้นเลย (คิดกำหนดชำระให้) + "รอเหตุการณ์"
//   · ยังไม่ตั้งรอบ (`rule` ว่าง/รูปผิด) = **ไม่วาดอะไร** ผู้เรียกคงช่องกำหนดชำระแบบเดิมไว้เอง
// ⭐ **ไม่มีค่าตั้งต้น** (ยังไม่เลือก = ว่าง) และ **ไม่บังคับ** (บางที่ไม่มีรอบวาง · มติ 26/09 ข้อ 2)
//   — ผู้เรียกที่อยากกันบันทึกครึ่ง ๆ กลาง ๆ ใช้ `pickerMissing(value)` ของ lib/sales/billingPicker.js
// ⭐ วันวางบิล/กำหนดชำระตรงเสาร์-อาทิตย์ = **ป้ายเตือนอย่างเดียว ไม่เลื่อนวัน** (มติ 26/09 ข้อ 1)
// ⭐ งวดที่ผูกเหตุการณ์ **ไม่เดาวัน** — เลือก "รอเหตุการณ์" แล้วล้างทั้งสองวัน
//
// ⚠️ controlled ล้วน: ค่าอยู่ที่ผู้เรียก (`value`) · ทุกการเลือกวิ่งผ่าน `applyPick` ตัวเดียว (ทดสอบได้โดยไม่เรนเดอร์)
//    ส่ง API ผ่าน `pickerPayload(value)` เท่านั้น · สถานะที่อยู่ในนี้มีแค่ "เปิดช่องแก้กำหนดชำระ" + ตัวย้ายโฟกัส (ไม่ใช่ข้อมูล)
// ⚠️ ห้ามใส่ `min`/`max` ให้ DateInput ที่นี่ — `update()` ของ DateInput กลืนค่าที่พิมพ์หลุดขอบเงียบ ๆ
//    (review 23/09 ที่แผงงวด) · วันผิดลำดับบอกด้วยข้อความเตือนแทน (`pickerDueBeforeBilling`)
// ⚠️ ไม่อ่านนาฬิกาเอง — `todayIso` มาจาก `businessDate()` ของผู้เรียก (นาฬิกาไทย · check:thaitime)
// ⚠️ ปุ่มข้อความหลายตัวหายไปเองหลังกด (แก้กำหนดชำระ · ปิด · ใช้วันที่คิดจากรอบ · ล้างที่เลือก) — โฟกัสต้องมีที่ลง
//    ไม่งั้นหล่นไป <body> คนใช้คีย์บอร์ดหลุดตำแหน่ง (WCAG 2.4.3 · ม็อก B คืนโฟกัสทุกครั้งที่วาดใหม่)
import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, CalendarCheck, CalendarDays, CircleDashed, Hourglass, PencilLine, TriangleAlert } from "lucide-react";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import StatusBadge from "@/components/ui/StatusBadge";
import { NA } from "@/lib/format";
import {
  BILLING_EVENT_MAX, BILLING_EVENT_PRESETS, billingRounds, billingRuleOf, dueDateForBilling,
  formatBillingDate, formatRoundChip, weekendNote,
} from "@/lib/sales/billingRule";
import {
  applyPick, normalizePickerValue, pickerDueBeforeBilling, pickerMissing,
} from "@/lib/sales/billingPicker";
import styles from "./BillingRoundPicker.module.css";

const ROUND_COUNT = 3;

/* ป้ายเตือนวันหยุดสุดสัปดาห์ — ไม่เลื่อนวันให้ (มติ 26/09) */
function WeekendBadge({ iso }) {
  const note = weekendNote(iso);
  return note ? <StatusBadge size="sm" tone="warning" icon={TriangleAlert} iconSize={11} label={note} /> : null;
}

const dayText = (iso) => formatBillingDate(iso) || NA;

/**
 * @param rule        customers."billingRule" (ดิบจากฐานได้ — อ่านผ่าน billingRuleOf)
 * @param todayIso    businessDate() ของผู้เรียก — ตั้งต้นของ 3 รอบถัดไป
 * @param value       `{ mode, billingDate, billingEvent, dueDate, dueOverridden }` (ดู billingPicker.js)
 * @param onChange    (nextValue) => void
 * @param label       บริบทของงวดสำหรับ aria-label เช่น "งวด 1 · มัดจำ" (ตารางหลายงวดต้องแยกกันได้ด้วยเสียง)
 * @param compact     ในเซลล์ตาราง (หน้าสร้าง SO) — ช่องวันแบบย่อ ไม่มีหัว/คำอธิบายใต้ชิป
 * @param savedDueDate กำหนดชำระที่บันทึกอยู่ในฐาน (แผงงวด) — บอกผลก่อนกดบันทึกว่าจะ "แทน" หรือ "ล้าง" วันเดิม
 *                   และเป็นค่าที่ "ล้างที่เลือก" พากลับไป ⇒ **แผงที่แก้แถวในฐานต้องส่งเสมอ** ไม่งั้นล้างแล้ววันเดิมหาย
 */
export default function BillingRoundPicker({
  rule, todayIso, value, onChange, disabled = false, idPrefix, compact = false, label = "", savedDueDate = "",
}) {
  const autoId = useId();
  const [dueOpen, setDueOpen] = useState(false);
  const rootRef = useRef(null);
  /* โฟกัสที่ต้องย้ายไปหลังวาดใหม่ — id ของช่อง/ปุ่ม หรือ "chips" (ชิปตัวแรก) · นับรอบเพื่อให้ effect วิ่งแม้เป้าเดิม
     setState ของที่นี่กับ onChange ของผู้เรียกรวมเป็นรอบวาดเดียว (React batch) ⇒ ตอน effect วิ่ง ค่าใหม่ขึ้นจอแล้ว */
  const focusTarget = useRef("");
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    const target = focusTarget.current;
    if (!target || !rootRef.current) return;
    focusTarget.current = "";
    const chip = rootRef.current.querySelector('[role="radio"]:not(:disabled)');
    const node = target === "chips" ? chip : document.getElementById(target) || chip;
    node?.focus();
  }, [focusTick]);
  const cleanRule = billingRuleOf(rule);
  if (!cleanRule) return null;

  const prefix = idPrefix || autoId;
  const ids = {
    billing: `${prefix}-billing`, due: `${prefix}-due`, dueEdit: `${prefix}-due-edit`, event: `${prefix}-event`,
  };
  const focusAfter = (target) => {
    focusTarget.current = target;
    setFocusTick((tick) => tick + 1);
  };
  const context = label ? ` ${label}` : "";
  /* ชื่อปุ่มข้อความสำหรับเสียงอ่าน — ตารางหลายงวดมีปุ่มชื่อเดียวกันทุกแถว ต่อบริบทงวดท้ายคำที่ตาเห็น (WCAG 2.5.3) */
  const named = (text) => (label ? `${text}${context}` : undefined);
  const monthly = cleanRule.billing.mode === "monthly";
  const rounds = monthly ? billingRounds(cleanRule, todayIso, ROUND_COUNT) : [];
  /* "รอบ" ที่ไม่อยู่ใน 3 รอบถัดไปแล้ว (รอบของลูกค้าเปลี่ยนหลังบันทึก · ผู้เรียกประกอบค่าเอง) = แสดงเป็น "วันอื่น…"
     ไม่งั้นไม่มีชิปติดและไม่มีช่องวัน — ค่าที่ส่ง API เหมือนกันทั้งสองโหมด (pickerPayload) จึงสลับได้ไม่เสียอะไร */
  const raw = normalizePickerValue(value);
  const staleRound = raw.mode === "round" && !rounds.some((round) => round.billingDate === raw.billingDate);
  const v = staleRound ? { ...raw, mode: "other" } : raw;
  const emit = (pick) => onChange?.(applyPick(v, pick, cleanRule));
  const saved = /^\d{4}-\d{2}-\d{2}$/.test(String(savedDueDate || "")) ? savedDueDate : "";
  /* ล้างที่เลือก = กลับไปค่าที่บันทึกอยู่ ไม่ใช่ว่างเปล่า (กำหนดชำระคุม "เลยกำหนด" + ด่านนัดช่าง) */
  const clearPick = { mode: "clear", dueDate: saved };

  const chipValue = v.mode === "round" ? v.billingDate : v.mode;
  const options = [
    ...rounds.map((round) => ({ value: round.billingDate, label: formatRoundChip(round.billingDate) })),
    {
      value: "other",
      ghost: true,
      label: <><CalendarDays size={13} aria-hidden="true" />{monthly ? "วันอื่น…" : "ระบุวันวางบิล"}</>,
    },
    { value: "event", ghost: true, label: <><Hourglass size={13} aria-hidden="true" />รอเหตุการณ์</> },
  ];
  const pickChip = (next) => {
    /* ChoiceChips เรียก onChange แม้แตะชิปที่เลือกอยู่แล้ว — แตะซ้ำต้องไม่ล้างค่าที่แก้ทับไว้ */
    if (next === chipValue) return;
    setDueOpen(false);
    if (next === "other") emit({ mode: "other", billingDate: "" });
    else if (next === "event") emit({ mode: "event" });
    else emit({ mode: "round", billingDate: next });
  };

  /* ลูกค้าวางบิลได้ทุกวัน: ไม่มีรอบให้แตะ ช่องวันวางบิลจึงขึ้นตั้งแต่ยังไม่เลือก (กรอกวัน = เลือก "ระบุวันวางบิล")
     ⚠️ ลบวันในช่องนั้นจนว่าง = กลับเป็นยังไม่เลือก ไม่ใช่ "ระบุวันแล้วแต่ยังไม่กรอก" — จอดูเหมือนไม่ได้แตะอะไร
        แต่ pickerMissing จะกันบันทึกค้างไว้ ขัดมติข้อ 2 (ไม่บังคับเลือก) */
  const showBillingInput = v.mode === "other" || (!monthly && v.mode === null);
  const pickBillingDate = (iso) => emit(!monthly && !iso ? clearPick : { mode: "other", billingDate: iso });
  const hasBilling = (v.mode === "round" || v.mode === "other") && Boolean(v.billingDate);
  const computedDue = hasBilling ? dueDateForBilling(cleanRule, v.billingDate) : "";
  const editing = hasBilling && (dueOpen || v.dueOverridden);
  const missing = pickerMissing(v);
  const eventPreset = BILLING_EVENT_PRESETS.includes(v.billingEvent.trim()) ? v.billingEvent.trim() : null;

  return (
    <div ref={rootRef} className={styles.picker} data-compact={compact ? "yes" : undefined}>
      {compact ? null : (
        <span className={styles.head}>{monthly ? "วางบิลรอบไหน" : "วางบิลวันไหน"}</span>
      )}
      <ChoiceChips
        ariaLabel={`เลือกรอบวางบิล${context}`}
        options={options}
        value={chipValue}
        onChange={pickChip}
        disabled={disabled}
      />
      {!compact && monthly ? (
        <p className={styles.note}>{ROUND_COUNT} รอบถัดไปของลูกค้า · แตะครั้งเดียวได้ทั้งวันวางบิลและกำหนดชำระ</p>
      ) : null}

      {showBillingInput ? (
        <div className={styles.row}>
          <label className={styles.inlineLabel} htmlFor={ids.billing}>วันวางบิล</label>
          <DateInput
            id={ids.billing}
            compact={compact}
            weekday
            value={v.billingDate}
            onChange={pickBillingDate}
            disabled={disabled}
            ariaLabel={`วันวางบิล${context}`}
            className={styles.date}
          />
        </div>
      ) : null}

      {hasBilling ? (
        <div className={styles.result}>
          <span className={styles.part}>
            <CalendarCheck size={14} aria-hidden="true" className={styles.okIcon} />
            วางบิล <b>{dayText(v.billingDate)}</b>
            <WeekendBadge iso={v.billingDate} />
          </span>
          {editing ? null : (
            <>
              <ArrowRight size={14} aria-hidden="true" className={styles.arrow} />
              <span className={styles.part}>
                กำหนดชำระ <b>{dayText(v.dueDate)}</b>
                <WeekendBadge iso={v.dueDate} />
              </span>
              {disabled ? null : (
                <button
                  type="button"
                  id={ids.dueEdit}
                  className={`text-action ${styles.action}`}
                  aria-label={named("แก้กำหนดชำระ")}
                  onClick={() => { setDueOpen(true); focusAfter(ids.due); }}
                >
                  <PencilLine size={12} aria-hidden="true" />แก้กำหนดชำระ
                </button>
              )}
            </>
          )}
        </div>
      ) : null}

      {editing ? (
        <div className={styles.dueEdit}>
          <label className={styles.inlineLabel} htmlFor={ids.due}>กำหนดชำระ</label>
          <DateInput
            id={ids.due}
            compact={compact}
            weekday
            value={v.dueDate}
            onChange={(iso) => emit({ mode: "overrideDue", dueDate: iso })}
            disabled={disabled}
            ariaLabel={`กำหนดชำระ${context}`}
            className={styles.date}
          />
          {v.dueOverridden ? (
            <>
              <StatusBadge size="sm" tone="info" icon={PencilLine} iconSize={11} label="แก้ทับรอบของลูกค้า" />
              {disabled || !computedDue ? null : (
                <button
                  type="button"
                  className={`text-action ${styles.action}`}
                  aria-label={named(`ใช้วันที่คิดจากรอบ (${formatBillingDate(computedDue)})`)}
                  onClick={() => { emit({ mode: "resetDue" }); setDueOpen(false); focusAfter(ids.dueEdit); }}
                >
                  ใช้วันที่คิดจากรอบ ({formatBillingDate(computedDue)})
                </button>
              )}
            </>
          ) : (
            <>
              <WeekendBadge iso={v.dueDate} />
              <span className={styles.muted}>วันที่คิดจากรอบ · เลือกวันใหม่เพื่อแก้ทับ</span>
              {disabled ? null : (
                <button
                  type="button"
                  className={`text-action ${styles.action}`}
                  aria-label={`ปิดช่องแก้กำหนดชำระ${context}`}
                  onClick={() => { setDueOpen(false); focusAfter(ids.dueEdit); }}
                >
                  ปิด
                </button>
              )}
            </>
          )}
        </div>
      ) : null}

      {v.mode === "event" ? (
        <>
          <div className={styles.row}>
            <label className={styles.inlineLabel} htmlFor={ids.event}>เหตุการณ์ที่รอ</label>
            <Input
              id={ids.event}
              autoComplete="off"
              maxLength={BILLING_EVENT_MAX}
              value={v.billingEvent}
              onChange={(event) => emit({ mode: "event", billingEvent: event.target.value })}
              placeholder="เช่น ก่อนส่งสินค้า · หลังติดตั้ง"
              disabled={disabled}
              aria-label={`เหตุการณ์ที่รอ${context}`}
              className={styles.eventInput}
            />
          </div>
          <ChoiceChips
            ariaLabel={`เหตุการณ์ที่ใช้บ่อย${context}`}
            options={BILLING_EVENT_PRESETS.map((preset) => ({ value: preset, label: preset }))}
            value={eventPreset}
            onChange={(preset) => emit({ mode: "event", billingEvent: preset })}
            disabled={disabled}
          />
          <p className={styles.hint}>
            <Hourglass size={14} aria-hidden="true" />
            <span>
              ระบบไม่เดาวันให้งวดที่ผูกเหตุการณ์ · กลับมาเลือกรอบได้เมื่อรู้วัน
              {/* แถวรอเหตุการณ์ที่มีกำหนดชำระค้างในฐาน (ก่อนมีรอบ) — อ่านมาตามแถว ไม่ล้างเองจนกว่าจะแตะเลือกใหม่
                  (applyPick 'event' คงวันไว้ตอนพิมพ์/แตะชื่อ · ล้างเฉพาะตอนสลับเข้ามาจากโหมดอื่น) */}
              {v.dueDate ? ` · กำหนดชำระที่บันทึกไว้ ${dayText(v.dueDate)}` : null}
            </span>
          </p>
        </>
      ) : null}

      {/* ยังไม่เลือก: แถวเดิมที่มีแต่กำหนดชำระกรอกเอง (งวดส่วนใหญ่ก่อนมีรอบ) บอกค่าที่บันทึกอยู่ทุกแบบรอบ (ม็อก C)
          · คำชวนให้แตะรอบมีเฉพาะลูกค้าวางบิลรายเดือน — ลูกค้าวางบิลได้ทุกวันเห็นช่องวันอยู่แล้ว */}
      {v.mode === null && (monthly || v.dueDate) ? (
        <p className={styles.hint}>
          <CircleDashed size={14} aria-hidden="true" />
          <span>
            {v.dueDate
              ? `ที่บันทึกอยู่: วันวางบิล ${NA} · กำหนดชำระ ${dayText(v.dueDate)} (กรอกเอง)`
              : "ยังไม่ได้เลือก — แตะรอบ · วันอื่น… · หรือ รอเหตุการณ์"}
          </span>
        </p>
      ) : null}

      {missing ? <p className={styles.muted}>{missing}</p> : null}
      {pickerDueBeforeBilling(v) ? (
        <p className={styles.warn}><TriangleAlert size={13} aria-hidden="true" />กำหนดชำระอยู่ก่อนวันวางบิล — ตรวจวันอีกครั้ง</p>
      ) : null}
      {saved && !v.dueDate ? (
        <p className={styles.warn}><TriangleAlert size={13} aria-hidden="true" />กำหนดชำระที่บันทึกอยู่ {dayText(saved)} จะถูกล้าง</p>
      ) : null}
      {saved && v.dueDate && v.dueDate !== saved && !v.dueOverridden ? (
        <p className={styles.muted}>แทนกำหนดชำระเดิม {dayText(saved)}</p>
      ) : null}

      {v.mode !== null && !disabled ? (
        <button
          type="button"
          className={`text-action ${styles.action}`}
          aria-label={named("ล้างที่เลือก")}
          onClick={() => { setDueOpen(false); emit(clearPick); focusAfter("chips"); }}
        >
          ล้างที่เลือก
        </button>
      ) : null}
    </div>
  );
}
