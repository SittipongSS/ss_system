"use client";
// ── ชิ้นร่วมของการ์ด/โมดัล/จอจัดวันใหม่ "วางบิลและกำหนดชำระ" (รุ่นสี่ · แบบ A "ประโยคนโยบาย" · มติเจ้าของ 29/09) ──
//
// ⭐ ตัวคิดวันทั้งหมดอยู่ที่ `lib/sales/billingRule.js` (policyPreview · planRuleChange · sourceLabel) — ไฟล์นี้วาดอย่างเดียว
//    (ห้ามคิดวันวางบิล/กำหนดชำระซ้ำตรงนี้ ไม่งั้นการ์ด/โมดัล/ตัวตั้งวันบนใบ SO จะพูดคนละวัน)
// ⭐ ความหมายสี/รูปทรงผูกกันทุกจอ: วันวางบิล = --blue + วงกลวง ○ · กำหนดชำระ = --green + วงทึบ ● · ลำดับ วันวางบิล → กำหนดชำระ เสมอ
//    (เจ้าของ 28/09 ข้อ 4 — ทุกที่ที่สองช่องอยู่ด้วยกัน)
// ⚠️ ตรงเสาร์/อาทิตย์ = ป้ายเตือนโทน warning **ไม่เลื่อนวัน** · แดงสงวนให้ "เลยกำหนด" (dueDate) เท่านั้น
import { BellOff, BellRing, TriangleAlert } from "lucide-react";
import StatusBadge from "@/components/ui/StatusBadge";
import { NA } from "@/lib/format";
import { NO_CREDIT_TEXT, fmtDate, weekendNote } from "@/lib/sales/billingRule";
import styles from "./CustomerBillingRule.module.css";

/* ป้ายเตือนวันหยุดสุดสัปดาห์ — โทน warning (ไม่ใช่แดง: แดงสงวนให้ "เลยกำหนด" เท่านั้น) */
export function WeekendBadge({ date }) {
  const note = date ? weekendNote(date) : "";
  if (!note) return null;
  return <StatusBadge tone="warning" size="sm" icon={TriangleAlert} iconSize={11} label={note} />;
}

/* ช่องหนึ่งของประโยค — การ์ด = ป้ายอ่านอย่างเดียว · โมดัล = ปุ่มเลื่อนไปข้อนั้น (onGoto) */
function Slot({ n, text, placeholder, tone, onGoto }) {
  const body = text || placeholder;
  if (onGoto) {
    return (
      <button type="button" className={styles.slot} data-tone={tone} data-empty={text ? undefined : "1"} onClick={() => onGoto(n)}>
        <span className={styles.slotNo} aria-hidden="true">{n}</span>
        <span className="sr-only">ข้อ {n}: </span>
        <span>{body}</span>
      </button>
    );
  }
  return <b className={styles.slot} data-tone={tone} data-empty={text ? undefined : "1"}>{body}</b>;
}

/**
 * ประโยคนโยบาย ① ต้องวางบิลไหม → ② วางบิลได้เมื่อไร → ③ กำหนดชำระเมื่อไร (แบบ A ที่เจ้าของเลือก)
 * @param words `policyWordsOf(rule)` / `formWordsOf(form)` — need 'ask' = ยังไม่ตอบในโมดัล
 */
export function PolicySentence({ words, onGoto, lead = "" }) {
  const slot = (n, text, placeholder, tone) => <Slot n={n} text={text} placeholder={placeholder} tone={tone} onGoto={onGoto} />;
  let body;
  if (words.need === "unknown" || words.need === "legacy" || words.need === "ask") {
    body = (
      <>
        {slot(1, "", "ต้องวางบิลไหม?", "need")}
        {words.need === "unknown" ? <span className={styles.tx}>— ยังไม่ระบุ · ถามบนใบ SO ตอนตั้งวันงวดครั้งแรก</span> : null}
        {words.need === "legacy" ? <span className={styles.tx}>— ยังไม่ระบุ · ระบบใช้รูปเดิม &quot;{NO_CREDIT_TEXT}&quot; ไปก่อน</span> : null}
      </>
    );
  } else if (words.need === "none") {
    body = (
      <>
        {slot(1, "ไม่ต้องวางบิล", "", "none")}
        <span className={styles.tx}>· กำหนดชำระตั้งรายงวดบนใบ SO · เตือนก่อนครบกำหนด</span>
      </>
    );
  } else {
    body = (
      <>
        {slot(1, "ต้องวางบิล", "", "need")}
        <span className={styles.tx}>· วางบิลได้</span>
        {slot(2, words.when, words.noTiming ? "ยังไม่ตั้งรอบ" : "เมื่อไร?", "bill")}
        <span className={styles.tx}>· กำหนดชำระ</span>
        {slot(3, words.pay, words.noTiming ? "ใส่เองรายงวด" : "เมื่อไร?", "pay")}
      </>
    );
  }
  return (
    <p className={styles.sentence}>
      {lead ? <span className={styles.sentenceLead}>{lead}</span> : null}
      {body}
    </p>
  );
}

/**
 * รายการคู่ ○ วันวางบิล → ● กำหนดชำระ (ตัวอย่างรอบของการ์ด/โมดัล · ก่อน/หลังของจอจัดวันใหม่)
 * @param rows `[{ key, billingDate, dueDate, source?, lead?, billText?, dueText?, tone? }]` — วันว่าง = คำใน billText/dueText (ตั้งต้น ขีด)
 */
export function PairList({ rows, sourceText = () => "", compact = false }) {
  return (
    <ul className={styles.pairs} data-compact={compact ? "1" : undefined}>
      {rows.map((row) => <PairRow key={row.key} row={row} source={row.dueDate ? sourceText(row.source) : ""} />)}
    </ul>
  );
}

export function PairRow({ row, source = "", as: Tag = "li" }) {
  return (
    <Tag className={styles.pair} data-tone={row.tone}>
      {row.lead ? <span className={styles.pairLead}>{row.lead}</span> : null}
      <span className={styles.pairSide}>
        <i className={styles.dotBill} data-off={row.billingDate ? undefined : "1"} aria-hidden="true" />
        <span className={styles.pairText}>
          <small>วันวางบิล</small>
          {row.billingDate ? <b>{fmtDate(row.billingDate)}</b> : <b className={styles.muted}>{row.billText || NA}</b>}
          <WeekendBadge date={row.billingDate} />
        </span>
      </span>
      <span className={styles.pairArrow} aria-hidden="true">→</span>
      <span className={styles.pairSide}>
        <i className={styles.dotDue} data-off={row.dueDate ? undefined : "1"} aria-hidden="true" />
        <span className={styles.pairText}>
          <small>กำหนดชำระ</small>
          {row.dueDate ? <b>{fmtDate(row.dueDate)}</b> : <b className={styles.muted}>{row.dueText || NA}</b>}
          <WeekendBadge date={row.dueDate} />
          {source ? <em>{source}</em> : null}
        </span>
      </span>
    </Tag>
  );
}

/* ชิปการเตือน — `reminderChipsOf` (on = ได้ · off = บอกว่าไม่มี) */
export function ReminderChips({ chips }) {
  return (
    <ul className={styles.remind}>
      {chips.map((chip) => (
        <li key={chip.key} data-off={chip.on ? undefined : "1"}>
          {chip.on ? <BellRing size={13} aria-hidden="true" /> : <BellOff size={13} aria-hidden="true" />}
          <span>{chip.text}</span>
        </li>
      ))}
    </ul>
  );
}
