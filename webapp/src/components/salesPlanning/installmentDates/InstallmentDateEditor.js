"use client";
// ── ตัวแก้วันของงวดหนึ่งงวด (ป๊อปโอเวอร์ข้างแถว · กางใต้แถว · แผ่นล่างบนมือถือ · หน้าสร้าง SO ใช้ตัวเดียวกัน) ──
//
// ⭐ รุ่นสี่ (มติเจ้าของ 29/09 · แบบ A "ต้องวางบิลไหม") — วิธีตั้งวันของงวดมาจาก `mode.rowMode(row)` (`dateModeOf` ของ billingRule.js):
//   · มีรอบ (rounds)          [ตามรอบ | วันอื่น | รอเหตุการณ์] — รอบเริ่มต่อจากวันวางบิลของงวดก่อน · ไทล์ ○ → ● เห็นทั้งสองวันก่อนแตะ
//   · ทุกวัน (cadence)         [ต่อจากงวดก่อน | วันอื่น | รอเหตุการณ์] — เครดิต N / ชำระวันวางบิล · ยึดกำหนดชำระของงวดก่อน (AR-015)
//   · ยังไม่ระบุ/ยังไม่ตั้งรอบ/**รูปเดิม { credit:false }** (free)  [วันวางบิล | กำหนดชำระ | รอเหตุการณ์] เปิดที่กำหนดชำระ —
//     วันวางบิลไม่บังคับ (รูปเดิม: ใส่วันวางบิลแล้วกำหนดชำระ = วันเดียวกันถ้ายังว่าง) ⇒ ไม่มีวันวางบิลปลอม (รอบกรรมการ 29/09)
//   · ไม่ต้องวางบิล (dueOnly)  [กำหนดชำระ | รอเหตุการณ์] — ช่องวันวางบิลบอก "ไม่ต้องวางบิล" · รอเหตุการณ์คุมกำหนดชำระ
//   · งวดยกเว้น "งวดนี้ต้องวางบิล…" (exception) [วันวางบิล | กำหนดชำระ | รอเหตุการณ์] — สองช่องไม่ผูกกัน
//   · งวดที่ติ๊ก "งวดนี้ไม่ต้องวางบิล" (dueOnly + skip) — เหมือนไม่ต้องวางบิล เฉพาะงวดนั้น
//   ลำดับปุ่มคงวันวางบิล → กำหนดชำระเสมอ (เจ้าของ 28/09 ข้อ 4) — ช่องนำบอกด้วย `start` ไม่ใช่ตำแหน่ง
// ⭐ กำหนดชำระเป็นช่องที่เห็นและแก้ได้เสมอทุกแบบ (ช่องหลัก) + ป้ายที่มา (ตามรอบ · ตามเครดิต N วัน · แก้ทับ · ใส่เอง) + "ใช้วันตามรอบ"
// ⭐ ทับกำหนดชำระที่บันทึกไว้ = บอกทันทีใต้ช่อง (ป้ายเลยกำหนด/ด่านนัดช่างนับจากวันใหม่) · ลำดับเทียบงวดก่อน/ถัดไป = เตือน ไม่กั้น
// ⭐ แตะไทล์/ชิป (เห็นผลก่อนแตะ) = ลงร่างแล้วไปงวดถัดไปที่ว่างเอง · แตะวันจากปฏิทินวันวางบิล = อยู่ที่งวดเดิมให้เห็นกำหนดชำระก่อน
//   (บนจอสัมผัสไม่มี hover — ข้อ 3 ของกรรมการ)
// ⭐ แผ่นล่างบนมือถือ: ช่องคู่ ○ วันวางบิล → ● กำหนดชำระ บนหัว (แตะช่อง = ไปวิธีตั้งของช่องนั้น) + ชิปงวดทั้งใบ
// ⚠️ ไม่มี "เสร็จ" ในตัวแก้ — บันทึกมีที่เดียว (แถบล่าง / ท้ายแผ่นบนมือถือ) · Segmented สลับวิธีเฉย ๆ ไม่ล้างค่า
// ⚠️ รอเหตุการณ์ = ไม่มีกำหนดชำระ (ด่านเขียนรุ่นสี่ตีกลับคู่นี้) — เลือกเหตุการณ์ล้างกำหนดชำระ · พิมพ์กำหนดชำระล้างเหตุการณ์
// ⭐ รอบห้า (มติเจ้าของ 29/09 · ปฏิทินรายปีของลูกค้า) — ลูกค้าตามปฏิทินใช้ "ตามรอบ" ตัวเดิม: ไทล์ ○ วันวางบิล (= วันตัดรอบ ·
//   เครดิต N = วันทำงานสุดท้ายที่ทันรอบ) → ● วันจ่าย + คำ "ตามปฏิทินลูกค้า · ส่งก่อน 16:00 น." · ชิปหมดที่ปีที่ยังไม่มีปฏิทิน =
//   "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" (หยุด — ไม่มีชิปประมาณการ) · วันวางบิลในปีนั้นไม่มีกำหนดชำระคิดให้ ช่องกำหนดชำระพิมพ์เองได้
import { useEffect, useRef, useState } from "react";
import {
  CalendarCheck, CalendarDays, CalendarX, ChevronDown, ChevronLeft, ChevronRight, CornerDownRight, Eraser, HandCoins, Hourglass, Info,
  Receipt, RotateCcw, Tag, TriangleAlert, Undo2, X,
} from "lucide-react";
import Button from "@/components/ui/Button";
import ChoiceChips from "@/components/ui/ChoiceChips";
import DateInput from "@/components/ui/DateInput";
import Input from "@/components/ui/Input";
import Segmented from "@/components/ui/Segmented";
import StatusBadge from "@/components/ui/StatusBadge";
import { NA, fmtMoney, fmtPercent } from "@/lib/format";
import {
  BILLING_EVENT_MAX, BILLING_EVENT_PRESETS, MONTH_END_DAY, NO_BILLING_TEXT, SKIP_TEXT, billingNeed, billingRounds, calendarGapFor,
  dueDateForBilling, formatBillingDate, installmentLabelMonth, needExceptionActions, ruleOf,
} from "@/lib/sales/billingRule";
import {
  VIEW_LABELS, billingCutoffNote, calendarGapHead, calendarMonthFor, clearedDates, continueChoiceFor, datesEmpty, datesOf, dueSourceOf,
  isCalendarRule, keepDueChoiceFor, openViewOf, pickBillingDate, quickDueChoices, roundChoicesFor, roundTileNote, sameDates, splitsFields,
} from "@/lib/sales/installmentDateDrafts";
import InstallmentCalendar from "./InstallmentCalendar";
import { BillNode, DateLegend, DatePair, DateText, DateTile, DueNode, WeekendBadge, pairLabel } from "./InstallmentDateParts";
import styles from "./InstallmentDates.module.css";

const MONTHS_LONG = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const monthWord = (month) => {
  const [y, m] = String(month).split("-").map(Number);
  return m ? `${MONTHS_LONG[m - 1]} ${y}` : "";
};
const dayWord = (day) => (day === MONTH_END_DAY ? "สิ้นเดือน" : `วันที่ ${day}`);
const VIEW_ICONS = {
  round: CalendarCheck, other: CalendarDays, follow: CornerDownRight, bill: CalendarCheck, due: CalendarDays, event: Hourglass,
};

/* ป้ายสั้นของงวดในแถบงวดทั้งใบ — ล็อก · รอเหตุการณ์ · วัน (กำหนดชำระก่อน) · ว่าง */
function stripText(mode, row) {
  if (mode.isLocked(row)) return "ล็อก";
  const v = mode.current(row);
  if (v.billingEvent) return "รอเหตุการณ์";
  const day = v.dueDate || v.billingDate;
  return day ? formatBillingDate(day, { withYear: false }).replace(/^\S+\s/, "") : "ว่าง";
}

export default function InstallmentDateEditor({ mode, row, variant = "popover" }) {
  const { ruleValue, rows, current, todayIso, creditDays } = mode;
  const v = current(row);
  const saved = datesOf(row);
  const changed = !sameDates(v, row);
  const multi = rows.length > 1;
  const [months, setMonths] = useState({});
  const [more, setMore] = useState(0);
  const titleRef = useRef(null);
  const dueRef = useRef(null);
  /* ตัวแก้ของงวดนี้ (ข้อยกเว้นรายงวด) — ติ๊ก/ล้างวันวางบิลในร่างเปลี่ยนชุดวิธีทันที · ชุดที่ไม่มีวิธีเก่าถอยไป `defaultView` */
  const rm = mode.rowMode(row);
  const split = splitsFields(rm);
  const need = billingNeed(ruleValue);
  const legacy = Boolean(ruleOf(ruleValue)?.legacyNoCredit);
  const actions = needExceptionActions({ ...row, ...v }, ruleValue);

  /* เปิด/เลื่อนมางวดนี้ = โฟกัสหัวของตัวแก้ (คนใช้คีย์บอร์ด/เสียงอ่านรู้ว่าอยู่งวดไหน) · ป๊อปโอเวอร์ไม่เลื่อนหน้า */
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: variant !== "inline" });
  }, [mode.focusTick, variant]);

  const isRoundDay = (bill) => Boolean(bill) && billingRounds(ruleValue, bill, 1)[0]?.billingDate === bill;
  const follow = rm.kind === "cadence" ? continueChoiceFor(ruleValue, rows, current, row) : null;
  const keep = rm.kind === "cadence" ? keepDueChoiceFor(ruleValue, row) : null;
  /* เปิดทีละช่อง: ช่องที่แตะชนะ (เซลล์วันวางบิล = ปฏิทินวันวางบิล) · ไม่ได้มาจากเซลล์ = รอเหตุการณ์/ช่องนำ (`openViewOf`
     ตัวเดียวกับที่โหมดจำไว้ตอนเปิด — ปกติวิธีที่จำไว้ชนะอยู่แล้ว ตัวนี้เป็นทางถอย) */
  const defaultView = split ? openViewOf(mode.openField, v, rm)
    : v.billingEvent ? "event"
      : rm.kind === "rounds" ? (!v.billingDate || isRoundDay(v.billingDate) ? "round" : "other")
        : (follow || keep) && (!v.billingDate || [follow, keep].some((c) => c?.billingDate === v.billingDate)) ? "follow" : "other";
  /* วิธีที่เปิดขึ้นมา **ตัดสินครั้งเดียวตอนเปิดงวดนี้** (ผู้เรียกผูก key={`${row.id}:${mode.kind}`} ⇒ เปลี่ยนงวด/ชนิดของกติกา = เปิดใหม่)
     🐞 review R-UI: เดิมคิดจากร่างทุกครั้งที่วาด ⇒ ลบชื่อเหตุการณ์จนว่าง = ช่องพิมพ์หายกลางคำ (สลับไปตามรอบ) ·
        แตะวันตรงรอบในปฏิทิน "วันอื่น" = สลับไป "ตามรอบ" เอง — วิธีเปลี่ยนเมื่อคนแตะ Segmented เท่านั้น
     🐞 review 28/09: ค่าที่จำไว้/ที่ตัดสินตอนเปิดไม่อยู่ในชุดของงวดตอนนี้ (กติกาเพิ่งเปลี่ยน · เพิ่งติ๊ก) = ถอยไป `defaultView` (`mode.view`) */
  const [openedView] = useState(defaultView);
  const view = mode.view(row, openedView, defaultView);
  /* ช่อง "หรือพิมพ์เอง" ถือข้อความของมันเอง — ร่างเก็บค่าที่ตัดช่องว่างแล้วใช้เทียบ ถ้าช่องอ่านจากร่างตรง ๆ:
     · "รอ " ถูกตัดเหลือ "รอ" ⇒ พิมพ์ต่อได้ "รอPO" (ช่องว่างหาย)
     · พิมพ์ถึง "หลังติดตั้ง" = ตรงชื่อสำเร็จรูป ⇒ ช่องว่างทันที ปุ่มถัดไปทับทั้งคำ (ชื่อที่ขึ้นต้นด้วยชื่อสำเร็จรูปพิมพ์ไม่ได้เลย)
     ⇒ ตรงชื่อสำเร็จรูป = ชิปติดสีเฉย ๆ ช่องไม่ว่าง · ค่าในร่างเปลี่ยนจากทางอื่น (ชิป · ล้างวัน · คืนค่า) = ช่องตามค่านั้น */
  const [own, setOwn] = useState(() => (BILLING_EVENT_PRESETS.includes(v.billingEvent) ? "" : v.billingEvent));
  const views = rm.views.map((value) => ({
    value,
    label: VIEW_LABELS[value],
    icon: VIEW_ICONS[value],
    ...(value === "follow" ? {
      disabled: !follow && !keep,
      title: !follow && !keep ? "ยังไม่มีงวดก่อนที่มีกำหนดชำระ — เลือกที่ “วันอื่น”" : undefined,
    } : {}),
  }));

  const marksOf = (field) => new Map(rows
    .filter((x) => x.id !== row.id)
    .map((x) => [current(x)[field], x.seq])
    .filter(([iso]) => Boolean(iso))
    .reverse());
  const monthFor = (field) => months[field] || calendarMonthFor(row, rows, current, field, todayIso);
  const setMonth = (field) => (next) => setMonths((m) => ({ ...m, [field]: next }));
  const editableIndex = mode.editable.findIndex((x) => x.id === row.id);
  const prevRow = mode.editable[editableIndex - 1] || null;
  const nextRow = mode.editable[editableIndex + 1] || null;
  const context = `งวดที่ ${row.seq}`;
  /* ชื่องวดที่เป็นแค่ "งวดที่ N" ไม่ต่อท้ายหัวซ้ำ ("งวดที่ 3 จาก 12 · งวดที่ 3") — กติกาเดียวกับหัวโมดัลรายงวดเดิม */
  const rowLabel = String(row.label || "").trim();
  const namedLabel = rowLabel && !/^งวด(ที่)?\s*\d+$/.test(rowLabel) ? rowLabel : "";
  /* กำหนดชำระที่พิมพ์/แตะเอง — ล้างรอเหตุการณ์ (รอเหตุการณ์ = ไม่มีกำหนดชำระ · ด่านเขียนรุ่นสี่) · วันวางบิล/ติ๊กคงเดิม */
  const withDue = (dueDate) => ({ ...v, billingEvent: dueDate ? "" : v.billingEvent, dueDate: dueDate || "" });
  const skipped = rm.override === "skip";
  const dueOnly = rm.kind === "dueOnly";
  /* ไม่รู้กติกา/ฐานยังไม่รัน 0389 (หน้าสร้าง) — กำหนดชำระอย่างเดียว ไม่พูดเรื่องวันวางบิลเลย (ไม่รู้ ≠ ไม่ต้องวางบิล) */
  const billingOff = rm.billingColumn === "off";

  /* ── เนื้อของแต่ละวิธี ── */
  let body = null;
  if (view === "round") {
    /* 4 รอบถัดไป (สเปก 28/09 `billingRounds(rule, from, 4)`) — "ดูรอบถัดไปอีก" เพิ่มทีละ 3 */
    const count = 4 + more;
    const { followSeq, list, missing } = roundChoicesFor(ruleValue, rows, current, row, todayIso, count, { holidays: mode.holidays });
    const tiles = v.billingDate && isRoundDay(v.billingDate) && !list.some((x) => x.billingDate === v.billingDate)
      ? [{
        billingDate: v.billingDate, dueDate: dueDateForBilling(ruleValue, v.billingDate), usedBySeq: null, current: true,
        note: roundTileNote(ruleValue, { billingDate: v.billingDate }),
      }, ...list]
      : list;
    const prevBill = followSeq ? rows.find((x) => x.seq === followSeq) : null;
    body = (
      <>
        <p className={styles.lead}>
          {prevBill ? `รอบถัดจากงวด ${followSeq} (${formatBillingDate(current(prevBill).billingDate, { withYear: false })})` : "รอบถัดไปของลูกค้า"}
          {" · "}<DateLegend />
        </p>
        {tiles.length ? (
          <div className={styles.tiles} role="radiogroup" aria-label={`รอบวางบิล ${context}`}>
            {tiles.map((round, index) => {
              const tags = [];
              if (round.current) tags.push(<StatusBadge key="cur" size="sm" tone="neutral" label="ที่ตั้งไว้" />);
              if (index === 0 && followSeq && !round.current) {
                tags.push(<StatusBadge key="follow" size="sm" tone="info" icon={CornerDownRight} iconSize={11} label={`ต่อจากงวด ${followSeq}`} />);
              }
              if (saved.billingDate === round.billingDate && !round.current) tags.push(<StatusBadge key="saved" size="sm" tone="neutral" label="บันทึกไว้" />);
              if (round.usedBySeq) tags.push(<StatusBadge key="used" size="sm" tone="warning" label={`งวด ${round.usedBySeq} ใช้รอบนี้`} />);
              /* ⭐ รอบห้า: คำบนไทล์ = ที่มา "ตามปฏิทินลูกค้า" + "ส่งก่อน 16:00 น." (ชำระรอบเดียวกัน) / "ทันรอบตัด …" (เครดิต N) */
              if (round.note) tags.push(<span key="note" className={styles.tileMeta}>{round.note}</span>);
              return (
                <DateTile key={round.billingDate} role="radio" billingDate={round.billingDate} dueDate={round.dueDate}
                  tags={tags.length ? tags : null} on={!v.billingEvent && v.billingDate === round.billingDate}
                  ariaLabel={pairLabel(round.billingDate, round.dueDate, [round.note, round.usedBySeq ? `งวด ${round.usedBySeq} ใช้รอบนี้` : ""].filter(Boolean).join(" · "))}
                  onClick={() => mode.choose(row, pickBillingDate(ruleValue, round.billingDate, v))} />
              );
            })}
          </div>
        ) : null}
        {missing ? (
          /* ⭐ ปีถัดไปยังไม่มีปฏิทิน (มติ 29/09 "หยุดรอปฏิทินใหม่") — ชิปหยุดตรงนี้ ไม่มีชิปประมาณการ · ทางที่ยังทำได้:
             วันวางบิลที่ "วันอื่น" (กำหนดชำระไม่คิดให้) หรือพิมพ์กำหนดชำระเองในช่องข้างล่าง */
          <p className={styles.hint} role="note">
            <CalendarX size={14} aria-hidden="true" />
            <span>
              <b>{missing.text}</b>
              {tiles.length ? " — รอบหลังจากนี้ยังไม่มี" : ""}
              {" · เลือกวันวางบิลที่ “วันอื่น” หรือพิมพ์กำหนดชำระในช่องข้างล่าง"}
            </span>
          </p>
        ) : list.length >= count ? (
          /* ได้ไม่ครบ count = สุดขอบฟ้าของตัวคิดแล้ว (48 เดือน) — ไม่มีรอบให้ดูเพิ่ม ปุ่มหายไป ไม่กดแล้วได้แผงเดิม */
          <Button size="sm" variant="quiet" className={styles.more} icon={<ChevronDown size={14} aria-hidden="true" />}
            onClick={() => setMore((n) => n + 3)}>ดูรอบถัดไปอีก</Button>
        ) : null}
      </>
    );
  } else if (view === "follow") {
    body = (
      <>
        <p className={styles.lead}><DateLegend /></p>
        {follow || keep ? (
          <div className={styles.tiles} role="radiogroup" aria-label={`ต่อจากงวดก่อน ${context}`}>
            {follow ? (
              <DateTile role="radio" billingDate={follow.billingDate} dueDate={follow.dueDate}
                cap={creditDays !== null
                  ? `ต่อจากงวด ${follow.fromSeq} · กำหนดชำระ${dayWord(follow.dueDay)}`
                  : `ต่อจากงวด ${follow.fromSeq} · วางบิลเดือนถัดไป`}
                on={!v.billingEvent && v.billingDate === follow.billingDate && v.dueDate === follow.dueDate}
                ariaLabel={pairLabel(follow.billingDate, follow.dueDate, `ต่อจากงวด ${follow.fromSeq}`)}
                onClick={() => mode.choose(row, { billingDate: follow.billingDate, billingEvent: "", dueDate: follow.dueDate, billingSkip: false })} />
            ) : null}
            {keep ? (
              <DateTile role="radio" billingDate={keep.billingDate} dueDate={keep.dueDate}
                cap={creditDays ? `ย้อนจากกำหนดชำระ − ${creditDays} วัน` : "ตามกำหนดชำระเดิม"}
                on={!v.billingEvent && v.billingDate === keep.billingDate && v.dueDate === keep.dueDate}
                ariaLabel={pairLabel(keep.billingDate, keep.dueDate, "ตามกำหนดชำระเดิม")}
                onClick={() => mode.choose(row, { billingDate: keep.billingDate, billingEvent: "", dueDate: keep.dueDate, billingSkip: false })} />
            ) : null}
          </div>
        ) : (
          <p className={styles.hint}><Info size={14} aria-hidden="true" />ยังไม่มีงวดก่อนที่มีกำหนดชำระ — เลือกวันวางบิลที่ “วันอื่น”</p>
        )}
      </>
    );
  } else if (view === "other") {
    body = (
      <>
        <p className={styles.lead}>
          {rm.kind === "rounds"
            /* ปฏิทินของลูกค้า: ปีที่ยังไม่มีปฏิทินไม่มีวันคิดให้ (มติ 29/09 หยุด) — บอกตั้งแต่ก่อนแตะ */
            ? (isCalendarRule(ruleValue)
              ? "วันวางบิลนอกรอบ — ระบบคิดกำหนดชำระตามปฏิทินลูกค้าให้ · ปีที่ยังไม่มีปฏิทิน ใส่กำหนดชำระเอง"
              : "วันวางบิลนอกรอบ — ระบบคิดกำหนดชำระตามรอบให้")
            /* ชำระวันวางบิล = "ชำระวันวางบิล" ไม่ใช่ "+0 วัน" (มติ 28/09 — ห้ามพูดเครดิต 0 วัน) */
            : creditDays === 0 ? "วันวางบิล — ชำระวันวางบิล (กำหนดชำระวันเดียวกัน)"
              : creditDays !== null ? `วันวางบิล — กำหนดชำระ = +${creditDays} วัน` : "วันวางบิล — ระบบคิดกำหนดชำระตามรอบให้"}
        </p>
        <InstallmentCalendar month={monthFor("billingDate")} onMonth={setMonth("billingDate")} selected={v.billingDate}
          todayIso={todayIso} marks={marksOf("billingDate")} ariaLabel={`วันวางบิล ${context}`}
          peekOf={(iso) => {
            /* ⭐ รอบห้า: วันที่ปฏิทินยังไม่ครอบ = บอกเหตุแทนกำหนดชำระ (ไม่มีวันคิดให้ · หยุด) · วันตัดรอบที่มีเวลา = "ส่งก่อน 16:00 น." */
            const gap = calendarGapFor(ruleValue, iso);
            const cut = billingCutoffNote(ruleValue, iso);
            return (
              <>
                <DatePair billingDate={iso} dueDate={dueDateForBilling(ruleValue, iso)} />
                {cut ? <span className={styles.tileMeta}>{cut}</span> : null}
                {gap ? <span className={styles.gapNote}><CalendarX size={13} aria-hidden="true" />{gap.text}</span> : null}
              </>
            );
          }}
          onPick={(iso) => mode.setValue(row, pickBillingDate(ruleValue, iso, v))} />
      </>
    );
  } else if (view === "event") {
    const preset = BILLING_EVENT_PRESETS.includes(v.billingEvent) ? v.billingEvent : null;
    const ownText = own.trim() === v.billingEvent ? own : (preset ? "" : v.billingEvent);
    /* เลือกเหตุการณ์ = ไม่มีวันทั้งสองช่อง (ระบบไม่เดาวันให้งวดที่ผูกเหตุการณ์ · รอเหตุการณ์ = ไม่มีกำหนดชำระ) · ติ๊กคงเดิม */
    const waitFor = (name) => ({ ...clearedDates(v), billingEvent: name });
    body = (
      <>
        <ChoiceChips ariaLabel={`เหตุการณ์ที่รอ ${context}`} value={preset}
          options={BILLING_EVENT_PRESETS.map((name) => ({ value: name, label: name }))}
          onChange={(name) => { setOwn(""); mode.choose(row, waitFor(name)); }} />
        <label className={styles.eventOwn}>
          <span>หรือพิมพ์เอง</span>
          <Input autoComplete="off" maxLength={BILLING_EVENT_MAX} value={ownText}
            placeholder="เช่น หลังลูกค้าตรวจรับ" aria-label={`เหตุการณ์ที่รอ (พิมพ์เอง) ${context}`}
            onChange={(event) => {
              setOwn(event.target.value);
              mode.setValue(row, waitFor(event.target.value));
            }} />
        </label>
        <p className={styles.hint}>
          <Hourglass size={14} aria-hidden="true" />
          {dueOnly
            ? "กำหนดชำระรอเหตุการณ์ — ระบบไม่เดาวันให้ · ไม่มีกระดิ่งจนกว่าจะมีวัน · กลับมาเลือกวันได้เมื่อรู้วัน"
            : "งวดผูกเหตุการณ์ยังไม่มีวัน — ระบบไม่เดาให้ · กลับมาเลือกวันได้เมื่อรู้วัน"}
        </p>
      </>
    );
  } else if (view === "bill") {
    /* เปิดทีละช่อง (free · งวดยกเว้น) — กำหนดชำระคงเดิม (`pickBillingDate` · ว่างอยู่ถึงเติมเมื่อกติกาคิดได้ = รูปเดิมเท่านั้น) */
    const lead = rm.kind === "exception"
      ? "วันวางบิลของงวดนี้ (ข้อยกเว้น — ลูกค้าไม่ต้องวางบิล) · กำหนดชำระไม่ผูกกับวันวางบิล"
      : legacy
        ? "วันวางบิล (ไม่บังคับ) — ใส่แล้วกำหนดชำระเป็นวันเดียวกันถ้ายังว่าง (รูปเดิม ไม่มีเครดิต)"
        : need === "required"
          ? "วันวางบิล — ลูกค้าต้องวางบิลแต่ยังไม่ตั้งรอบ ระบบไม่คิดกำหนดชำระให้"
          : "วันวางบิล (ไม่บังคับ) — ลูกค้ายังไม่ระบุว่าต้องวางบิลไหม ระบบไม่คิดกำหนดชำระให้";
    body = (
      <>
        <p className={styles.lead}>{lead}</p>
        <InstallmentCalendar month={monthFor("billingDate")} onMonth={setMonth("billingDate")} selected={v.billingDate}
          todayIso={todayIso} marks={marksOf("billingDate")} ariaLabel={`วันวางบิล ${context}`}
          peekOf={(iso) => <DateText iso={iso} node="bill" />}
          onPick={(iso) => mode.setValue(row, pickBillingDate(ruleValue, iso, v))} />
      </>
    );
  } else {
    /* กำหนดชำระ (ช่องนำของ free · dueOnly) — วันวางบิลที่เลือกไว้คงเดิม · สองช่องแยกกัน */
    const quick = quickDueChoices(rows, current, row);
    const clue = installmentLabelMonth(row.label);
    body = (
      <>
        {clue ? (
          <p className={styles.hint}>
            <Tag size={14} aria-hidden="true" />
            ชื่องวดบอก {monthWord(clue)} · ปฏิทินเปิดเดือนนั้นให้ วันยังต้องเลือกเอง
          </p>
        ) : null}
        {quick.length ? (
          <ChoiceChips ariaLabel={`ทางลัดกำหนดชำระ ${context}`} value={quick.some((q) => q.dueDate === v.dueDate) ? v.dueDate : null}
            options={quick.map((q) => ({
              value: q.dueDate,
              label: <span>{q.label} <small>{formatBillingDate(q.dueDate, { withYear: false })}</small></span>,
            }))}
            onChange={(dueDate) => mode.choose(row, withDue(dueDate))} />
        ) : null}
        <InstallmentCalendar month={monthFor("dueDate")} onMonth={setMonth("dueDate")} selected={v.dueDate}
          todayIso={todayIso} marks={marksOf("dueDate")} ariaLabel={`กำหนดชำระ ${context}`}
          peekOf={(iso) => <DateText iso={iso} node="due" />}
          onPick={(iso) => mode.choose(row, withDue(iso))} />
        <p className={styles.hint}>
          <Info size={14} aria-hidden="true" />
          {billingOff ? "แตะวัน = กำหนดชำระ"
            : dueOnly ? (skipped ? "งวดนี้ไม่ต้องวางบิล — ตั้งกำหนดชำระอย่างเดียว" : "ลูกค้าไม่ต้องวางบิล — แตะวัน = กำหนดชำระทันที")
            : rm.kind === "exception" ? "งวดยกเว้น — กำหนดชำระไม่ผูกกับวันวางบิล"
              : `กำหนดชำระตั้งเดี่ยวได้ วันวางบิล${rm.billingColumn === "expected" ? "ใส่ทีหลังได้" : "ไม่บังคับ"}`}
          {" · ตรงเสาร์/อาทิตย์ = เตือน ไม่เลื่อนเอง"}
        </p>
      </>
    );
  }

  /* ── ผล: วันวางบิล + ช่องกำหนดชำระ (เห็นและแก้ได้เสมอ) ── */
  const source = dueSourceOf(ruleValue, v);
  const dueWarn = saved.dueDate && saved.dueDate !== v.dueDate
    ? (v.dueDate
      ? `ทับกำหนดชำระเดิม ${formatBillingDate(saved.dueDate)} — ป้ายเลยกำหนดและด่านนัดช่างนับจากวันใหม่ทันที`
      : `กำหนดชำระเดิม ${formatBillingDate(saved.dueDate)} จะถูกล้าง — งวดนี้ไม่มีกำหนดชำระให้ป้ายเลยกำหนดนับ`)
    : "";
  const rowWarns = mode.warnings[row.id] || [];
  /* งวดยกเว้นที่มีวันวางบิลแต่ไม่มีกำหนดชำระ — ระบบไม่คิดจากวันวางบิลให้ (ลูกค้าไม่ต้องวางบิล) · ไม่ตั้ง = ไม่มีกระดิ่งครบกำหนด */
  const exceptionNoDue = rm.kind === "exception" && v.billingDate && !v.dueDate
    ? "งวดยกเว้นยังไม่มีกำหนดชำระ — ระบบไม่คิดจากวันวางบิลให้ (ลูกค้าไม่ต้องวางบิล) · ตั้งกำหนดชำระ ไม่งั้นงวดนี้ไม่มีกระดิ่งครบกำหนด"
    : "";
  /* ช่องวันวางบิลของแบบไม่ต้องวางบิล — คำ ไม่ใช่ช่องว่างที่ชวนกรอก · ทางเดียวที่ได้วันวางบิล = "งวดนี้ต้องวางบิล…" (โมดัลขอบเขต) */
  const askRequire = mode.askRequireBilling && actions.requireBilling && dueOnly ? (
    <Button size="sm" variant="quiet" icon={<Receipt size={13} aria-hidden="true" />} onClick={() => mode.askRequireBilling(row)}>
      งวดนี้ต้องวางบิล…
    </Button>
  ) : null;
  const billSlotView = rm.views.includes("bill") ? "bill" : rm.views.includes("round") ? "round" : rm.views.includes("follow") ? "follow" : null;

  return (
    /* `inert` ระหว่างบันทึก — แตะ/พิมพ์ตอนคำขอยังไม่กลับ แล้วบันทึกสำเร็จ = ร่างถูกล้างทิ้งเงียบ ๆ (review R-UI)
       · ปุ่มบันทึกอยู่นอกกล่องนี้เสมอ (แถบล่าง · ท้ายแผ่น) ⇒ โฟกัสไม่หลุด */
    <div className={styles.editor} inert={mode.busy} aria-busy={mode.busy || undefined}>
      <div className={styles.edHead}>
        <div ref={titleRef} className={styles.edTitle} tabIndex={-1}>
          <b>{multi ? `งวดที่ ${row.seq} จาก ${rows.length}` : "งวดนี้"}{namedLabel ? ` · ${namedLabel}` : ""}</b>
          <small>{fmtMoney(row.amount)}{multi ? ` · ${fmtPercent(row.percent)}` : ""}</small>
        </div>
        <span className={styles.edNav}>
          {mode.editable.length > 1 ? (
            <>
              <Button iconOnly size="sm" variant="quiet" aria-label="งวดก่อนหน้า" disabled={!prevRow}
                icon={<ChevronLeft size={16} aria-hidden="true" />} onClick={() => prevRow && mode.open(prevRow.id)} />
              <Button iconOnly size="sm" variant="quiet" aria-label="งวดถัดไป" disabled={!nextRow}
                icon={<ChevronRight size={16} aria-hidden="true" />} onClick={() => nextRow && mode.open(nextRow.id)} />
            </>
          ) : null}
          {variant === "sheet" ? null : (
            <Button iconOnly size="sm" variant="quiet" aria-label="ปิดตัวแก้วันของงวดนี้"
              icon={<X size={16} aria-hidden="true" />} onClick={mode.close} />
          )}
        </span>
      </div>

      {multi && variant !== "inline" ? (
        <div className={styles.strip} role="group" aria-label="งวดของใบ">
          {mode.rows.map((x) => (
            <button key={x.id} type="button" className={styles.stripItem}
              aria-current={x.id === row.id ? "true" : undefined}
              data-lock={mode.isLocked(x) ? "yes" : undefined}
              data-changed={mode.changedIds.has(x.id) ? "yes" : undefined}
              aria-label={`งวดที่ ${x.seq} · ${stripText(mode, x)}${mode.changedIds.has(x.id) ? " · แก้แล้ว" : ""}`}
              onClick={() => mode.open(x.id)}>
              <b>งวด {x.seq}</b>
              <span>{stripText(mode, x)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* แผ่นล่างบนมือถือ: ช่องคู่ ○ วันวางบิล → ● กำหนดชำระ (ม็อกแบบแนะนำ · ของดีจากแบบ B) — แตะช่อง = ไปวิธีตั้งของช่องนั้น
          · ไม่ต้องวางบิลไม่มีปุ่มช่องวันวางบิล (คำ + ทางไป "งวดนี้ต้องวางบิล…") · กำหนดชำระของแบบมีรอบ/ทุกวัน = ช่องพิมพ์ในผลด้านล่าง */}
      {variant === "sheet" && !billingOff ? (
        <div className={styles.slots} role="group" aria-label={`สองช่องของ${context}`}>
          {dueOnly || !billSlotView ? (
            <div className={styles.slot} data-off="yes">
              <small><BillNode />วันวางบิล</small>
              <b>{v.billingDate ? formatBillingDate(v.billingDate) : NO_BILLING_TEXT}</b>
              <span>{skipped ? "ติ๊กไว้เฉพาะงวดนี้" : "ตามทะเบียนลูกค้า"}</span>
              {askRequire}
            </div>
          ) : (
            <button type="button" className={styles.slot} aria-pressed={view === billSlotView || view === "other"}
              onClick={() => mode.setView(row, billSlotView)}>
              <small><BillNode />วันวางบิล{rm.billingColumn === "optional" ? " · ไม่บังคับ" : ""}</small>
              <b>{v.billingDate ? formatBillingDate(v.billingDate) : v.billingEvent ? "รอเหตุการณ์" : NA}</b>
              <span>
                {v.billingDate ? (billingCutoffNote(ruleValue, v.billingDate) || "ตั้งแล้ว")
                  : v.billingEvent || (rm.billingColumn === "optional" ? "ไม่ใส่ก็ได้" : "แตะเพื่อตั้ง")}
              </span>
            </button>
          )}
          <ChevronRight size={16} aria-hidden="true" className={styles.slotArrow} />
          <button type="button" className={styles.slot} aria-pressed={view === "due"}
            onClick={() => (rm.views.includes("due") ? mode.setView(row, "due") : dueRef.current?.querySelector("input")?.focus())}>
            <small><DueNode />กำหนดชำระ</small>
            <b>{v.dueDate ? formatBillingDate(v.dueDate) : v.billingEvent && dueOnly ? "รอเหตุการณ์" : NA}</b>
            <span>
              {v.dueDate ? (source.label || "ตั้งแล้ว") : v.billingEvent && dueOnly ? v.billingEvent
                : source.key === "calendarMissing" ? source.label : "แตะเพื่อตั้ง"}
            </span>
          </button>
        </div>
      ) : null}

      {views.length > 1 ? (
        <Segmented ariaLabel={`ตั้งวันแบบไหน ${context}`} options={views} value={view} onChange={(next) => mode.setView(row, next)} />
      ) : null}
      {body}

      <div className={styles.result} aria-live="polite">
        {/* วันวางบิลขึ้นทุกแบบ (มติ 28/09 ข้อ 17 — ทุกใบมีสองช่อง) · ไม่ต้องวางบิล = คำ · ยังไม่ระบุ/รูปเดิม = ว่างได้ ("ไม่บังคับ") */}
        {billingOff ? null : <div className={styles.resLine}>
          <span className={styles.resKey}>วันวางบิล</span>
          <span className={styles.resValue}>
            {dueOnly && !v.billingDate ? <><b>{NO_BILLING_TEXT}</b>{skipped ? " · เฉพาะงวดนี้" : ""}</>
              : v.billingEvent ? <b>รอ “{v.billingEvent}”</b>
                : v.billingDate ? <DateText iso={v.billingDate} node="bill" />
                  : <span>{rm.billingColumn === "optional" ? "ยังไม่มีวัน (ไม่บังคับ)" : "ยังไม่มีวัน"}</span>}
          </span>
          {/* ⭐ รอบห้า: เวลาตัดรอบของรอบที่เลือก (วันวางบิล = วันตัดรอบ · ชำระรอบเดียวกัน) — เครดิต N ไม่พูดเวลา */}
          {v.billingDate && billingCutoffNote(ruleValue, v.billingDate) ? (
            <span className={styles.tileMeta}>{billingCutoffNote(ruleValue, v.billingDate)}</span>
          ) : null}
          {split && v.billingDate ? (
            /* เปิดทีละช่อง — ล้างวันวางบิลอย่างเดียวได้ (กำหนดชำระคงเดิม) · ไม่งั้นต้อง "ล้างวัน" ทั้งคู่ */
            <Button size="sm" variant="quiet" icon={<Eraser size={13} aria-hidden="true" />}
              onClick={() => mode.setValue(row, { ...v, billingDate: "" })}>ล้างวันวางบิล</Button>
          ) : null}
          {variant === "sheet" ? null : askRequire}
        </div>}
        <div className={styles.resLine} ref={dueRef}>
          <span className={styles.resKey}>กำหนดชำระ</span>
          <DateInput weekday value={v.dueDate} className={styles.dueInput} ariaLabel={`กำหนดชำระ ${context}`}
            onChange={(iso) => mode.setValue(row, withDue(iso))} />
          <WeekendBadge iso={v.dueDate} />
          {/* ⭐ รอบห้า: 'calendarMissing' = มีวันวางบิลแต่ปีนั้นยังไม่มีปฏิทิน — ป้าย "ยังไม่มีปฏิทิน 2027 · ใส่วันเองได้" (ช่องนี้พิมพ์ได้เลย) ·
              ใส่เองในปีที่ยังไม่มี = "ใส่เอง" + ปีที่ขาด (ใส่ปฏิทินแล้วระบบเสนอวันจริงให้ยืนยัน — planRuleChange `typedInGap`) */}
          {source.label ? (
            <StatusBadge size="sm" tone={source.key === "override" || source.key === "calendarMissing" ? "warning" : "neutral"}
              icon={source.key === "calendarMissing" ? CalendarX : undefined} iconSize={11} label={source.label} />
          ) : null}
          {source.key === "manual" && source.gap ? <span className={styles.tileMeta}>{calendarGapHead(source.gap)}</span> : null}
          {/* แตะเดียวกลับไปวันที่กติกาคิดได้ — แก้ทับไว้ ("แก้ทับ") หรือยังไม่มีกำหนดชำระทั้งที่มีวันวางบิล ('missing' · review 28/09:
              ใบที่มีวันวางบิลแต่กำหนดชำระว่าง เดิมไม่มีทางเติมแตะเดียว) */}
          {(source.key === "override" || source.key === "missing") && source.computed ? (
            <Button size="sm" variant="quiet" icon={<RotateCcw size={13} aria-hidden="true" />}
              onClick={() => mode.setValue(row, { ...v, dueDate: source.computed })}>
              {/* ชำระวันวางบิล: วันที่คิดได้ = วันวางบิลเอง ⇒ คำว่า "ตามรอบ" ผิดความหมาย */}
              {creditDays === 0 ? "ใช้วันวางบิล" : "ใช้วันตามรอบ"} ({formatBillingDate(source.computed, { withYear: false })})
            </Button>
          ) : null}
        </div>
        {dueWarn || exceptionNoDue || rowWarns.length ? (
          <ul className={styles.warns}>
            {dueWarn ? <li className={styles.warn}><TriangleAlert size={13} aria-hidden="true" />{dueWarn}</li> : null}
            {exceptionNoDue ? <li className={styles.warn}><TriangleAlert size={13} aria-hidden="true" />{exceptionNoDue}</li> : null}
            {rowWarns.map((w) => (
              <li key={w.text} className={styles.warn} data-tone={w.tone}>
                {w.tone === "warn" ? <TriangleAlert size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
                {w.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* ⭐ "งวดนี้ไม่ต้องวางบิล" (รอบกรรมการ 29/09 · กลุ่ม K2 มัดจำโอนก่อน) — ลูกค้าต้องวางบิลจริงเท่านั้น (รูปเดิม/ยังไม่ระบุไม่ชวน) ·
          งวดที่ไม่มีวันวางบิลและไม่รอเหตุการณ์ · ฐานต้องรัน 0393 แล้ว (`skipReady` — คีย์นี้ลงฐานไม่ได้ก่อนนั้น) */}
      {mode.skipReady && (actions.skip || actions.unskip) ? (
        <label className={styles.skipCheck}>
          <input type="checkbox" checked={v.billingSkip} onChange={() => mode.setValue(row, { ...v, billingSkip: !v.billingSkip })} />
          <span>
            <b><HandCoins size={13} aria-hidden="true" /> {SKIP_TEXT} (เช่น โอนก่อน)</b>
            <small>ทะเบียนการชำระเลิกชวน “ยังไม่มีวันวางบิล” ของงวดนี้ · ลงประวัติของใบ</small>
          </span>
        </label>
      ) : null}

      <div className={styles.foot}>
        {datesEmpty(v) ? null : (
          <Button size="sm" variant="quiet" icon={<Eraser size={13} aria-hidden="true" />}
            onClick={() => mode.setValue(row, clearedDates(v))}>ล้างวัน</Button>
        )}
        {/* หน้าสร้าง SO ยังไม่มีค่าที่บันทึก — "ล้างวัน" ทำงานเดียวกันแล้ว */}
        {changed && !mode.create ? (
          <Button size="sm" variant="quiet" icon={<Undo2 size={13} aria-hidden="true" />} onClick={() => mode.revert(row)}>
            คืนค่าที่บันทึกไว้
          </Button>
        ) : null}
        {nextRow ? (
          <Button size="sm" tone="neutral" className={styles.footNext} icon={<ChevronRight size={14} aria-hidden="true" />}
            onClick={() => mode.open(nextRow.id)}>
            งวดถัดไป · งวด {nextRow.seq}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
