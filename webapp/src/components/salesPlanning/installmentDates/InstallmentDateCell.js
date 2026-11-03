"use client";
// ── ช่องวันวางบิล / กำหนดชำระ ของงวด — ช่องวันธรรมดาสองช่องแยกกัน (มติเจ้าของ 02/11 · ม็อก mockups/billing-cycle/split-v6) ──
//
// ⭐ "กดแยกส่วน แบบวันอื่นๆ": แต่ละช่องคือ `DateInput` ตัวเดียวกับทั้งระบบ — พิมพ์ DD/MM/YYYY หรือกดไอคอนเปิดปฏิทิน ·
//   เลือกแล้วปฏิทินปิด **ไม่เด้งไปช่องอื่น ไม่เด้งไปงวดอื่น** · Tab ไล่ตามตาราง (วันวางบิล → กำหนดชำระ → งวดถัดไป)
//   แทนป๊อปโอเวอร์ตัวแก้รายงวดเดิม ([ตามรอบ | วันอื่น | รอเหตุการณ์] · เลือกแล้วไปงวดถัดไปที่ว่างเอง — งวดถัดไปเปิดที่กำหนดชำระ
//   ⇒ วันวางบิลถูกข้าม · เจ้าของ: "กดวางบิลแล้วเด้งไปกำหนดชำระ กดกำหนดชำระแล้วไปงวดถัดไป ไม่เรียง วางบิล > ชำระ")
// ⭐ มติ 02/11 แบบ ข — **เลือกวันวางบิลไม่แตะกำหนดชำระเลย** (ไม่เติม ไม่ทับ) · กติกาคิดกำหนดชำระได้ = ชิป "ตามรอบ: ใช้ …" ใต้ช่อง
//   ให้กดเอง · ขึ้นเฉพาะงวดที่เพิ่งแก้วันวางบิลในร่างนี้ หรือกำหนดชำระยังว่าง (มติข้อ 3: ข้อมูลเดิมที่ไม่ตรงรอบอยู่เงียบ)
// ⭐ ระบบช่วยเป็นของในปฏิทิน ไม่ใช่โหมด: จุดใต้วันรอบของลูกค้า · เลขงวดอื่นที่มุมช่อง · ชิปรอบถัดไป/ต่อจากงวดก่อน/ทันกำหนดชำระเดิม ·
//   ปฏิทินเปิดที่เดือนที่เดาได้ (ชื่องวด · งวดก่อน) — ชิปที่คนแตะเท่านั้น ระบบไม่เลือกให้
// ⭐ รอเหตุการณ์ (มติข้อ 1) = ลิงก์ "ยังไม่รู้วัน…" ท้ายปฏิทินกำหนดชำระ · เลือกแล้วไม่มีวันทั้งสองช่อง (CHECK · ด่านเขียนรุ่นสี่)
// ⭐ "งวดนี้ไม่ต้องวางบิล" / "งวดนี้ต้องวางบิล…" อยู่เมนู ⋯ ของแถว (มติข้อ 2) — ช่องนี้แค่บอกผล
// ⚠️ ค่าทุกช่องเป็น **ร่าง** ของ useInstallmentDateMode — บันทึกครั้งเดียวที่แถบล่าง (`schedule-many`) · หน้าสร้าง SO ร่างไปกับใบ
// ⚠️ งวดที่ล็อก/ผู้ไม่มีสิทธิ์ — ผู้เรียกวาดตัวหนังสือเดิม (`mode.canEdit(row)` เท็จ) · ที่นี่กันอีกชั้นเป็นตัวหนังสือพร้อมเหตุ
import { useState } from "react";
import { CalendarX, Hourglass, Info, Lock, RotateCcw, Tag, TriangleAlert, X } from "lucide-react";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import { NA } from "@/lib/format";
import {
  BILLING_EVENT_MAX, BILLING_EVENT_PRESETS, NO_BILLING_TEXT, billingRounds, calendarGapFor, dueDateForBilling, formatBillingDate,
  formatRoundChip, installmentLabelMonth, weekendNote,
} from "@/lib/sales/billingRule";
import {
  billingCutoffNote, billingForDueChoice, calendarMonthFor, clearedDates, continueChoiceFor, datesOf, dueSourceOf, isCalendarRule,
  quickDueChoices, roundChoicesFor, rowCalendarGap,
} from "@/lib/sales/installmentDateDrafts";
import styles from "./InstallmentDates.module.css";

const FIELD_WORD = { bill: "วันวางบิล", due: "กำหนดชำระ" };
const MONTHS_LONG = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const monthWord = (month) => {
  const [y, m] = String(month).split("-").map(Number);
  return m ? `${MONTHS_LONG[m - 1]} ${y}` : "";
};
const short = (iso) => formatBillingDate(iso, { withYear: false });
const monthOf = (iso) => (iso ? String(iso).slice(0, 7) : "");

/* คำเล็กใต้ช่อง — โทนเตือนเป็นสีเหลือง (ไม่แดง: ระบบไม่กั้น แค่บอก) */
function Note({ tone, icon: Icon, children }) {
  return (
    <span className={styles.fieldNote} data-tone={tone || undefined}>
      {Icon ? <Icon size={12} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* ชิปในปฏิทิน — แตะ = เลือกวันนั้น (เหมือนแตะในตาราง · ปฏิทินปิด) · ค่าที่ซ้ำวันกันถูกตัด */
function CalendarChips({ ariaLabel, options, value, pick }) {
  const seen = new Set();
  const list = options.filter((option) => option.value && !seen.has(option.value) && seen.add(option.value));
  if (!list.length) return null;
  return <ChoiceChips ariaLabel={ariaLabel} value={list.some((o) => o.value === value) ? value : null} options={list} onChange={pick} />;
}

/**
 * @param field  "bill" | "due"
 */
export default function InstallmentDateCell({ mode, row, field }) {
  const [eventOpen, setEventOpen] = useState(false);
  const [own, setOwn] = useState("");
  const { ruleValue, rows, current, todayIso } = mode;
  const context = `งวดที่ ${row.seq}`;
  const saved = datesOf(row);

  const lock = mode.lock(row);
  if (lock) {
    const text = field === "bill"
      ? (saved.billingDate ? formatBillingDate(saved.billingDate) : saved.billingEvent || NA)
      : (saved.dueDate ? formatBillingDate(saved.dueDate) : NA);
    return (
      <span className={styles.cellStatic} data-date-field={`${row.id}:${field}`}>
        <span>{text}</span>
        <Note icon={Lock}>{lock.reason}</Note>
      </span>
    );
  }

  const v = current(row);
  const rm = mode.rowMode(row);
  const warns = (mode.warnings[row.id] || []).filter((w) => w.field === field);
  const key = field === "bill" ? "billingDate" : "dueDate";
  /* วันของงวดอื่นในใบ — เลขงวดที่มุมช่องของปฏิทิน (เห็นเพื่อนบ้านระหว่างเลือก) */
  const others = new Map();
  rows.forEach((x) => {
    const day = x.id === row.id ? "" : current(x)[key];
    if (day && !others.has(day)) others.set(day, x.seq);
  });
  const notes = [];

  if (field === "bill") {
    /* ไม่ต้องวางบิล (ลูกค้า · หรือติ๊กงวดนี้จากเมนูแถว) = คำ ไม่ใช่ช่อง — ทางได้วันวางบิลคือเมนู ⋯ "งวดนี้ต้องวางบิล…" */
    if (rm.kind === "dueOnly" && !v.billingDate) {
      return (
        <span className={styles.cellStatic} data-date-field={`${row.id}:bill`}>
          <span>{NA}</span>
          {rm.override === "skip" ? <small>{NO_BILLING_TEXT} · เฉพาะงวดนี้</small> : null}
          <span className="sr-only">{`วันวางบิล ${context} — ${NO_BILLING_TEXT}`}</span>
        </span>
      );
    }
    const rounds = rm.kind === "rounds";
    const choices = rounds ? roundChoicesFor(ruleValue, rows, current, row, todayIso, 3, { holidays: mode.holidays }) : null;
    const follow = rm.kind === "cadence" ? continueChoiceFor(ruleValue, rows, current, row) : null;
    const keep = billingForDueChoice(ruleValue, v);
    const computes = Boolean(dueDateForBilling(ruleValue, v.billingDate || todayIso));
    const options = [];
    if (keep) options.push({ value: keep, label: <span>ทันกำหนดชำระ {short(v.dueDate)} <small>{short(keep)}</small></span> });
    (choices?.list || []).forEach((c) => options.push({
      value: c.billingDate,
      label: <span>{short(c.billingDate)} <small>→ ชำระ {short(c.dueDate)}{c.usedBySeq ? ` · งวด ${c.usedBySeq}` : ""}</small></span>,
    }));
    if (follow) options.push({ value: follow.billingDate, label: <span>ต่อจากงวด {follow.fromSeq} <small>{short(follow.billingDate)}</small></span> });
    const startMonth = monthOf(keep || choices?.list?.[0]?.billingDate || follow?.billingDate)
      || calendarMonthFor(row, rows, current, "billingDate", todayIso);
    const lead = [];
    if (rounds) lead.push(<Note key="mark"><span className="dayrange-dot" aria-hidden="true" />{isCalendarRule(ruleValue) ? "วันตัดรอบในปฏิทินลูกค้า" : "วันวางบิลตามรอบของลูกค้า"}</Note>);
    if (rm.kind === "exception") lead.push(<Note key="exc" icon={Info}>ข้อยกเว้น — ลูกค้าไม่ต้องวางบิล · เฉพาะงวดนี้</Note>);
    if (computes) lead.push(<Note key="due" icon={Info}>กำหนดชำระไม่ขยับตาม — ตั้งที่ช่องกำหนดชำระ</Note>);
    const isRoundDay = (iso) => rounds && billingRounds(ruleValue, iso, 1)[0]?.billingDate === iso;
    const dayInfo = (iso) => {
      const mark = isRoundDay(iso);
      const badge = others.get(iso);
      if (!mark && !badge) return null;
      const due = mark ? dueDateForBilling(ruleValue, iso) : "";
      const gap = mark && !due ? calendarGapFor(ruleValue, iso) : null;
      const title = [mark ? (due ? `รอบนี้ชำระ ${short(due)}` : gap?.text || "") : "", badge ? `งวด ${badge}` : ""].filter(Boolean).join(" · ");
      return { mark, badge, title };
    };
    const extra = options.length || choices?.missing ? ({ pick }) => (
      <>
        <CalendarChips ariaLabel={`ทางลัดวันวางบิล ${context}`} options={options} value={v.billingDate} pick={pick} />
        {/* ปีถัดไปยังไม่มีปฏิทิน (มติ 29/09 หยุด) — ชิปหมดตรงนี้ ไม่มีชิปประมาณการ · เลือกวันในตารางเองได้ */}
        {choices?.missing ? <Note tone="warn" icon={CalendarX}>{choices.missing.text}</Note> : null}
      </>
    ) : null;

    const cut = v.billingDate ? billingCutoffNote(ruleValue, v.billingDate) : "";
    if (cut) notes.push(<Note key="cut">{cut}</Note>);
    if (weekendNote(v.billingDate)) notes.push(<Note key="we" tone="warn" icon={TriangleAlert}>{weekendNote(v.billingDate)}</Note>);
    if (!mode.create && v.billingDate !== saved.billingDate && saved.billingDate) {
      notes.push(<Note key="was">เดิม <s>{formatRoundChip(saved.billingDate)}</s></Note>);
    }
    if (rm.kind === "exception" && v.billingDate) notes.push(<Note key="exc">ต้องวางบิล · เฉพาะงวดนี้</Note>);
    if (!v.billingDate && rounds) {
      const gap = rowCalendarGap(ruleValue, rows, current, row, todayIso, { holidays: mode.holidays });
      if (gap) notes.push(<Note key="gap" tone="warn" icon={CalendarX}>{gap.text}</Note>);
    }
    warns.forEach((w) => notes.push(<Note key={w.text} tone={w.tone === "warn" ? "warn" : ""} icon={w.tone === "warn" ? TriangleAlert : null}>{w.text}</Note>));

    return (
      <span className={styles.field} data-date-field={`${row.id}:bill`}
        data-changed={!mode.create && v.billingDate !== saved.billingDate ? "yes" : undefined}>
        <DateInput compact weekday value={v.billingDate} disabled={mode.busy} ariaLabel={`วันวางบิล ${context}`}
          calendarMonth={startMonth} dayInfo={dayInfo}
          calendarLead={lead.length ? lead : null} calendarExtra={extra}
          onChange={(iso) => mode.setValue(row, {
            /* แบบ ข: กำหนดชำระไม่ถูกแตะ · มีวันวางบิล = ไม่รอเหตุการณ์/ไม่ติ๊ก "งวดนี้ไม่ต้องวางบิล" (ด่านเขียนตีกลับคู่นั้น) */
            ...v, billingDate: iso || "", billingEvent: iso ? "" : v.billingEvent, billingSkip: iso ? false : v.billingSkip,
          })} />
        {notes.length ? <span className={styles.fieldNotes}>{notes}</span> : null}
      </span>
    );
  }

  /* ── กำหนดชำระ ── */
  const computed = v.billingDate ? dueDateForBilling(ruleValue, v.billingDate) : "";
  const word = computed ? dueSourceOf(ruleValue, { ...v, dueDate: computed }).label || "ตามรอบ" : "";
  const billChanged = v.billingDate !== saved.billingDate;
  const setDue = (iso) => mode.setValue(row, { ...v, dueDate: iso || "", billingEvent: iso ? "" : v.billingEvent });
  const waitFor = (name) => mode.setValue(row, { ...clearedDates(v), billingEvent: name });
  const options = [];
  if (computed && computed !== v.dueDate) options.push({ value: computed, label: <span>{word} <small>{short(computed)}</small></span> });
  if (v.billingDate && !computed && v.billingDate !== v.dueDate) {
    options.push({ value: v.billingDate, label: <span>วันเดียวกับวางบิล <small>{short(v.billingDate)}</small></span> });
  }
  quickDueChoices(rows, current, row).forEach((q) => options.push({ value: q.dueDate, label: <span>{q.label} <small>{short(q.dueDate)}</small></span> }));
  const clue = installmentLabelMonth(row.label);
  const lead = clue && !v.dueDate ? [<Note key="clue" icon={Tag}>ชื่องวดบอก {monthWord(clue)} — วันยังต้องเลือกเอง</Note>] : null;
  const preset = BILLING_EVENT_PRESETS.includes(v.billingEvent) ? v.billingEvent : null;
  const extra = ({ pick, close }) => (
    <>
      <CalendarChips ariaLabel={`ทางลัดกำหนดชำระ ${context}`} options={options} value={v.dueDate} pick={pick} />
      {eventOpen ? (
        <span className={styles.eventBox}>
          <Note icon={Hourglass}>ยังไม่รู้วัน — รออะไร? ระบบไม่เดาวันให้ · ไม่มีกระดิ่งจนกว่าจะใส่วัน</Note>
          <ChoiceChips ariaLabel={`เหตุการณ์ที่รอ ${context}`} value={preset}
            options={BILLING_EVENT_PRESETS.map((name) => ({ value: name, label: name }))}
            onChange={(name) => { setOwn(""); setEventOpen(false); waitFor(name); close(); }} />
          <span className={styles.eventOwn}>
            <Input autoComplete="off" maxLength={BILLING_EVENT_MAX} value={own} placeholder="หรือพิมพ์เอง เช่น หลังลูกค้าตรวจรับ"
              aria-label={`เหตุการณ์ที่รอ (พิมพ์เอง) ${context}`} onChange={(event) => setOwn(event.target.value)} />
            <Button size="sm" tone="neutral" disabled={!own.trim()}
              onClick={() => { waitFor(own.trim()); setOwn(""); setEventOpen(false); close(); }}>ใช้</Button>
          </span>
        </span>
      ) : (
        <Button size="sm" variant="quiet" icon={<Hourglass size={13} aria-hidden="true" />} onClick={() => setEventOpen(true)}>
          ยังไม่รู้วัน…
        </Button>
      )}
    </>
  );

  if (v.billingEvent) {
    notes.push(
      <Note key="event" icon={Hourglass}>
        รอ “{v.billingEvent}” · ใส่วันเมื่อรู้
        <button type="button" className={styles.fieldLink} aria-label={`เลิกรอเหตุการณ์ ${context}`}
          onClick={() => mode.setValue(row, { ...v, billingEvent: "" })}><X size={11} aria-hidden="true" /></button>
      </Note>,
    );
  }
  /* แบบ ข + มติข้อ 3: ชิป "ตามรอบ: ใช้ …" เฉพาะงวดที่เพิ่งแก้วันวางบิล หรือกำหนดชำระยังว่าง — ข้อมูลเดิมที่ไม่ตรงรอบอยู่เงียบ */
  if (computed && computed !== v.dueDate && !v.billingEvent && (billChanged || !v.dueDate)) {
    notes.push(
      <Note key="offer">
        {word}:
        <button type="button" className={styles.fieldFix} onClick={() => setDue(computed)}>
          <RotateCcw size={11} aria-hidden="true" />ใช้ {short(computed)}
        </button>
      </Note>,
    );
  }
  /* ⭐ รอบห้า: วันวางบิลตกปีที่ปฏิทินยังไม่มี = ไม่มีวันคิดให้ (หยุด ไม่ประมาณ) · พิมพ์กำหนดชำระเองได้ */
  if (v.billingDate && !computed && !v.dueDate) {
    const gap = calendarGapFor(ruleValue, v.billingDate);
    if (gap) notes.push(<Note key="gap" tone="warn" icon={CalendarX}>{gap.text}</Note>);
  }
  if (!mode.create && saved.dueDate && v.dueDate !== saved.dueDate) {
    notes.push(<Note key="was">เดิม <s>{formatRoundChip(saved.dueDate)}</s></Note>);
    notes.push(<Note key="replace" tone="warn" icon={TriangleAlert}>
      {v.dueDate ? "ป้ายเลยกำหนด/ด่านนัดช่างนับจากวันใหม่" : "กำหนดชำระเดิมจะถูกล้าง"}
    </Note>);
  }
  if (rm.kind === "exception" && v.billingDate && !v.dueDate) {
    notes.push(<Note key="exc" tone="warn" icon={TriangleAlert}>ตั้งกำหนดชำระด้วย — ไม่งั้นงวดนี้ไม่มีกระดิ่งครบกำหนด</Note>);
  }
  if (weekendNote(v.dueDate)) notes.push(<Note key="we" tone="warn" icon={TriangleAlert}>{weekendNote(v.dueDate)}</Note>);
  warns.forEach((w) => notes.push(<Note key={w.text} tone={w.tone === "warn" ? "warn" : ""} icon={w.tone === "warn" ? TriangleAlert : null}>{w.text}</Note>));

  return (
    <span className={styles.field} data-date-field={`${row.id}:due`}
      data-changed={!mode.create && (v.dueDate !== saved.dueDate || v.billingEvent !== saved.billingEvent) ? "yes" : undefined}>
      <DateInput compact weekday value={v.dueDate} disabled={mode.busy} ariaLabel={`กำหนดชำระ ${context}`}
        calendarMonth={monthOf(computed) || calendarMonthFor(row, rows, current, "dueDate", todayIso)}
        dayInfo={(iso) => (others.has(iso) ? { badge: others.get(iso), title: `งวด ${others.get(iso)}` } : null)}
        calendarLead={lead} calendarExtra={extra} onChange={setDue} />
      {notes.length ? <span className={styles.fieldNotes}>{notes}</span> : null}
    </span>
  );
}
