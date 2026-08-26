"use client";
// ── เลือกคน โดยเห็นภาระงานของแต่ละคนพร้อมกัน ─────────────────────────────
//
// ⭐ **ทำไมไม่ใช้ `PersonSelect` (ดรอปดาวน์) ที่นี่**: มติ 2026-08-08 บอกว่าช่องเลือก AE
// ให้เป็นดรอปดาวน์ เพราะ "ชื่อยาว และอาจโชว์หลายคน" — และยังจริงอยู่สำหรับช่องที่ถามแค่
// *ใคร* (เช่นผู้รับผิดชอบดีล) · แต่กล่องมอบหมายลีดถามคนละคำถาม: **"ตอนนี้ใครยังตามงาน
// ไหว"** ซึ่งตอบไม่ได้ถ้าตัวเลขถูกพับอยู่ในดรอปดาวน์ที่ต้องกดเปิดทีละครั้ง
// ข้อกังวลเดิม (ชื่อยาว/คนเยอะ) แก้ด้วยรูปทรงแทน: หนึ่งคนหนึ่งแถวเต็มความกว้าง
// ชื่อยาวจึงมีที่พอ และรายชื่อยาวเลื่อนในกล่องตัวเอง ไม่ดันปุ่มยืนยันตกจอ
//
// ตัวเลขมาจาก `lib/sales/leadWorkload.js` — **ของค้าง ณ ตอนนี้ ไม่ใช่ผลงานรายเดือน**
import { personFullName } from "@/lib/ui/personName";
import { TEAM_LABELS, userTeams } from "@/lib/permissions";
import { WORKLOAD_FIELDS, EMPTY_WORKLOAD } from "@/lib/sales/leadWorkload";
import styles from "./PersonLoadSelect.module.css";

const metaOf = (user) => userTeams(user).map((t) => TEAM_LABELS[t] || t).join(" + ");

/* ช่อง `alert` เป็นศูนย์ = ดี · มากกว่าศูนย์ = ต้องเห็นแต่ไกล
   ช่องนับเฉย ๆ ไม่ทาสี — ถือ 11 ใบไม่ได้แปลว่าผิด แปลว่าต้องชั่งน้ำหนักเอง */
const toneOf = (field, count) => {
  if (!field.alert) return undefined;
  return count > 0 ? "red" : "green";
};

export default function PersonLoadSelect({
  users = [],
  value,
  onChange,
  disabled = false,
  ariaLabel,
  /* (user) → { label, warning } | null — ป้ายกำกับรายคน เช่น "เคยถือใบนี้มาแล้ว"
     `warning` ขึ้นเป็นบรรทัดเตือนใต้รายชื่อเมื่อคนนั้นถูกเลือก (เตือน ไม่ห้าม) */
  noteOf,
  emptyText = "ไม่มีใครให้มอบหมายในทีมนี้",
}) {
  if (!users.length) return <p className={styles.empty}>{emptyText}</p>;
  const selected = users.find((user) => user?.id === value) || null;
  const selectedNote = selected && noteOf ? noteOf(selected) : null;

  return (
    <>
      {/* ป้ายคอลัมน์ครั้งเดียวข้างบน ไม่ใช่ซ้ำทุกแถว — 3 ป้าย × จำนวนคน กลบตัวเลข
          ที่เป็นของจริงจนอ่านไม่ออก · aria-hidden เพราะแต่ละตัวเลขมีป้ายในตัวอยู่แล้ว */}
      <div className={styles.head} aria-hidden="true">
        <span className={styles.load}>
          {WORKLOAD_FIELDS.map((field) => (
            <span key={field.key} className={styles.stat}><small>{field.label}</small></span>
          ))}
        </span>
      </div>
      <div className={styles.list} role="radiogroup" aria-label={ariaLabel}>
        {users.map((user) => {
          const load = user?.load || EMPTY_WORKLOAD;
          const note = noteOf ? noteOf(user) : null;
          const meta = metaOf(user);
          return (
            <button
              key={user.id}
              type="button"
              role="radio"
              aria-checked={user.id === value}
              data-on={user.id === value ? "1" : undefined}
              className={styles.row}
              disabled={disabled}
              onClick={() => onChange?.(user.id)}
            >
              <span className={styles.who}>
                <strong className={styles.name}>{personFullName(user)}</strong>
                <small className={styles.meta}>
                  {meta}
                  {note?.label ? <em className={styles.note}>{meta ? " · " : ""}{note.label}</em> : null}
                </small>
              </span>
              <span className={styles.load}>
                {WORKLOAD_FIELDS.map((field) => (
                  <span key={field.key} className={styles.stat}>
                    <b
                      data-tone={toneOf(field, load[field.key] || 0)}
                      aria-label={`${field.label} ${load[field.key] || 0}`}
                    >
                      {load[field.key] || 0}
                    </b>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {selectedNote?.warning ? <p className={styles.warn}>{selectedNote.warning}</p> : null}
    </>
  );
}
