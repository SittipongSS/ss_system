"use client";
// ── เซลล์วันวางบิล / กำหนดชำระ ของตารางงวด — ทางเข้าโหมดตั้งวัน (ตารางอ่านอย่างเดียว) และเซลล์ร่าง (ในโหมด) ──
//
// ⭐ ตารางอ่านอย่างเดียวคือตารางจริงของระบบ (TableScroll) ตัวเดิม — ไม่มีทรงการ์ดที่สองของตารางเดียวกัน (ข้อ 2 ของกรรมการ)
//   ผู้ใช้ที่ตั้งวันได้: วันในเซลล์กลายเป็นปุ่ม แตะแล้วเข้าโหมดที่งวดนั้น (แทนลิงก์ "เลือกรอบ" เดิม — เซลล์คือทางเข้า)
//   ผู้ใช้ที่ไม่มีสิทธิ์ / งวดที่ล็อก: เซลล์เหมือนเดิมทุกอย่าง (ไม่มีอะไรให้แตะ)
// ⭐ ในโหมด: ร่างมีจุดบอก **หนึ่งจุด** + "เดิม ~~วัน~~" เฉพาะเมื่อแทนค่าที่บันทึกไว้ (ข้อ 6: หลังเติมทั้งชุดต้องไม่เป็นกล่องสีเต็มตาราง)
//   งวดที่ล็อก = อ่านอย่างเดียว + ไอคอนกุญแจ + เหตุในบรรทัด (มือถือแตะ tooltip ไม่ได้) · แตะ = toast บอกเหตุและทางออก
import { CalendarPlus, Hourglass, Lock, PencilLine } from "lucide-react";
import { NA } from "@/lib/format";
import { formatBillingDate, formatRoundChip, weekendNote } from "@/lib/sales/billingRule";
import { datesOf, dueSourceOf } from "@/lib/sales/installmentDateDrafts";
import { BillNode, DueNode } from "./InstallmentDateParts";
import styles from "./InstallmentDates.module.css";

const FIELD_WORD = { bill: "วันวางบิล", due: "กำหนดชำระ" };

/**
 * ทางเข้าจากตารางอ่านอย่างเดียว — ห่อ "ตัววัน" ของเซลล์เดิมเป็นปุ่ม (ป้าย/ปุ่มอื่นในเซลล์คงอยู่ข้างนอก ไม่ซ้อนปุ่ม)
 * ไม่มีสิทธิ์/งวดล็อก/ร่างช่วงครอบค้าง(ปุ่มยังแตะได้ แต่ `enter` บอกเหตุ) — ตามด่านใน `mode`
 */
export function InstallmentDateEntry({ mode, row, field, children }) {
  if (!mode?.available || mode.active || row?.preview || !row?.id || mode.isLocked(row)) return children;
  return (
    <button type="button" className={styles.entry} data-date-cell={field} disabled={mode.busy} onClick={() => mode.enter(row.id, { field })}>
      {children ?? <span className={styles.none}>{NA}</span>}
      <PencilLine size={12} aria-hidden="true" className={styles.entryIcon} />
      <span className="sr-only"> · ตั้ง{FIELD_WORD[field]} งวดที่ {row.seq}</span>
    </button>
  );
}

/**
 * เซลล์ในโหมดตั้งวัน
 * @param field       "bill" | "due"
 * @param billColumn  ตารางมีคอลัมน์วันวางบิลไหม — มีเสมอบนใบที่ยังเดิน (มติ 28/09 ข้อ 17) · เผื่อไว้: ไม่มี = เซลล์กำหนดชำระ
 *                    บอกรอเหตุการณ์/เหตุที่ล็อกเอง
 */
export default function InstallmentDateCell({ mode, row, field, billColumn = true }) {
  const saved = datesOf(row);
  const lock = mode.lock(row);
  const tagHere = field === "bill" || !billColumn;

  if (lock) {
    const value = field === "bill"
      ? (saved.billingDate ? formatBillingDate(saved.billingDate) : saved.billingEvent || NA)
      : (saved.dueDate ? formatBillingDate(saved.dueDate) : NA);
    return (
      <button type="button" className={styles.lockCell} data-date-cell={field} disabled={mode.busy}
        aria-label={`${FIELD_WORD[field]} งวดที่ ${row.seq} ${value} — ${lock.reason} แก้วันไม่ได้`}
        onClick={() => mode.open(row.id)}>
        <span className={styles.cellMain}>{value}</span>
        {tagHere ? <span className={styles.lockTag}><Lock size={12} aria-hidden="true" />{lock.reason}</span> : null}
      </button>
    );
  }

  const v = mode.current(row);
  const changed = mode.changedIds.has(row.id);
  const open = mode.openId === row.id;
  const warns = (mode.warnings[row.id] || []).filter((w) => w.field === field && w.tone === "warn");
  let main;
  const sub = [];
  if (field === "bill") {
    if (v.billingEvent) main = <><Hourglass size={13} aria-hidden="true" /><b>{v.billingEvent}</b></>;
    else if (v.billingDate) main = <><BillNode /><b>{formatBillingDate(v.billingDate)}</b></>;
    else {
      main = <span className={styles.cellEmpty}><CalendarPlus size={13} aria-hidden="true" />{mode.kind === "monthly" ? "เลือกรอบ" : "ตั้งวันวางบิล"}</span>;
      /* ยังไม่ตั้งกำหนดวางบิล — ช่องนี้เลือกได้แต่ไม่บังคับ (มติ 28/09 ข้อ 17: ทุกใบมีสองช่อง · ไม่มีอะไรคิดกำหนดชำระให้) */
      if (mode.kind === "none") sub.push(<span key="opt">ไม่บังคับ</span>);
    }
    const was = saved.billingDate || saved.billingEvent;
    const now = v.billingDate || v.billingEvent;
    if (changed && was && was !== now) {
      sub.push(<span key="was">เดิม <s>{saved.billingDate ? formatRoundChip(saved.billingDate) : saved.billingEvent}</s></span>);
    }
    if (weekendNote(v.billingDate)) sub.push(<span key="we" data-tone="warn">{weekendNote(v.billingDate)}</span>);
  } else {
    if (v.dueDate) main = <><DueNode /><b>{formatBillingDate(v.dueDate)}</b></>;
    else if (v.billingEvent && !billColumn) main = <><Hourglass size={13} aria-hidden="true" /><b>รอเหตุการณ์ · {v.billingEvent}</b></>;
    else if (mode.kind === "none") main = <span className={styles.cellEmpty}><CalendarPlus size={13} aria-hidden="true" />ตั้งกำหนดชำระ</span>;
    else if (dueSourceOf(mode.ruleValue, v).key === "missing") {
      /* มีวันวางบิลแล้วแต่ไม่มีกำหนดชำระ ทั้งที่กติกาคิดให้ได้ — "ได้เองเมื่อเลือกวันวางบิล" ไม่จริง (วันวางบิลมีแล้ว)
         ⇒ บอกตรง ๆ · แตะแล้วตัวแก้มีปุ่มแตะเดียว "ใช้วันตามรอบ"/"ใช้วันวางบิล" (review 28/09) · ป้ายเลยกำหนดไม่มีวันให้นับ = โทนเตือน */
      main = <span>{NA}</span>;
      sub.push(<span key="missing" data-tone="warn">ยังไม่มีกำหนดชำระ</span>);
    } else {
      main = <span>{NA}</span>;
      sub.push(<span key="auto">{v.billingEvent ? "ตามเหตุการณ์" : mode.kind === "monthly" ? "ได้เองเมื่อเลือกรอบ" : "ได้เองเมื่อเลือกวันวางบิล"}</span>);
    }
    if (changed && saved.dueDate && saved.dueDate !== v.dueDate) {
      sub.unshift(<span key="was">เดิม <s>{formatRoundChip(saved.dueDate)}</s></span>);
    }
    if (weekendNote(v.dueDate)) sub.push(<span key="we" data-tone="warn">{weekendNote(v.dueDate)}</span>);
  }
  warns.forEach((w) => sub.push(<span key={w.text} data-tone="warn">{w.text}</span>));

  return (
    /* ระหว่างบันทึก = แตะไม่ได้ (แก้ตอนคำขอยังไม่กลับ แล้วบันทึกสำเร็จ = ร่างนั้นถูกล้างทิ้งเงียบ ๆ · review R-UI)
       แตะ = `mode.tap` — งวดที่เปิดอยู่ปิด เว้นแต่ลูกค้ายังไม่ตั้งแล้วแตะอีกช่อง (สลับไปช่องนั้น · review 28/09) */
    <button type="button" className={styles.cell} data-date-cell={field} disabled={mode.busy}
      aria-haspopup="dialog" aria-expanded={open}
      aria-label={`${FIELD_WORD[field]} งวดที่ ${row.seq}${changed ? " · แก้แล้ว ยังไม่บันทึก" : ""}`}
      onClick={() => mode.tap(row.id, field)}>
      <span className={styles.cellMain}>
        {changed ? <span className={styles.changed} aria-hidden="true" /> : null}
        {main}
      </span>
      {sub.length ? <span className={styles.cellSub}>{sub}</span> : null}
    </button>
  );
}
