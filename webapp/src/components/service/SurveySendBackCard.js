"use client";
// ── การ์ด "หัวหน้าส่งกลับให้แก้" ของช่าง (ม็อก A-5 · แผน §10.5 S8) ─────────────────────────────────────
//
// ⭐ **ใคร · เมื่อไร · ขออะไร อยู่บนจอเดียว** (pain B10) — 🐞 เดิมข้อความของหัวหน้าอยู่แค่ในแถบล่างสามบรรทัด
//   และเรื่องที่สอง ("ขอรูปใกล้อีกรูป") ไม่มีใครตามว่าทำหรือยัง ⇒ ข้อละแถว ติ๊กได้ · ข้อที่ชี้พื้นที่มีปุ่มพาไป ·
//   หลักฐานรูปที่ขึ้น **หลัง** หัวหน้าส่งกลับ ("เพิ่ม IMG_2118.jpg · ภาพกว้างรวม 3 รูป") ขึ้นใต้ข้อ
// 🔑 **วาดอย่างเดียว** — ข้อ · การผูกพื้นที่ · หลักฐาน · โหมด มาจาก `surveySendBackItemsView`
// ⚠️ **ติ๊กและ "แก้อะไรไป" อยู่บนจอจนกดแจ้ง** (แผนลงมือ C8) — ไปกับ "แจ้งหัวหน้าว่าแก้แล้ว" ที่แถบล่าง (`doneItems` · `note`)
//   · โหลดหน้าใหม่ = ติ๊กหาย (รับไว้ §11) · ข้อความที่พิมพ์ค้างถามก่อนออกจากหน้า (`surveyLeaveMessage`)
// ⚠️ **ปุ่มพาไปเป็นพี่น้องกับช่องติ๊ก ไม่ได้ซ้อนใน label** — ปุ่มในป้ายของช่องติ๊ก = กดพาไปแล้วติ๊กไปด้วย
//   (`OptionTiles` ใช้ไม่ได้ด้วยเหตุเดียวกัน — แผ่นเป็นปุ่มทั้งแผ่น)
// ⚠️ นัดยังเปิด (`mode: 'submit'`) = ไม่มีช่องติ๊ก — ส่งงานปิดเรื่องให้เองโดยไม่พกติ๊ก ช่องติ๊กตอนนั้นคือติ๊กที่หายเงียบ
import { useId } from "react";
import { Check, ChevronRight, CornerUpLeft } from "lucide-react";
import Textarea from "@/components/ui/Textarea";
import styles from "./SurveySendBackCard.module.css";

/* เพดานเดียวกับ route แจ้งแก้แล้ว (`send-back-done` ตีกลับเกิน 300) */
const NOTE_MAX = 300;

/**
 * @param view         `surveySendBackItemsView(...)` — ไม่มี/`mode` ว่าง = ไม่วาด
 * @param note         "แก้อะไรไป" (state ของหน้า — ไปกับปุ่มบนแถบ)
 * @param onNoteChange `(text) => void`
 * @param onToggle     `(index) => void` ติ๊ก/เอาติ๊กออกข้อนั้น
 * @param onGoZone     `(zoneId) => void` เปิดพื้นที่ที่ข้อนั้นพูดถึง (ตัวต่อสายถามก่อนทิ้งค่าค้างเอง)
 * @param busy         กำลังแจ้งหัวหน้าอยู่ — ล็อกช่องติ๊ก/ข้อความ
 */
export default function SurveySendBackCard({ view, note = "", onNoteChange, onToggle, onGoZone, busy = false }) {
  const titleId = useId();
  const noteId = useId();
  if (!view?.mode || !view.items?.length) return null;
  const report = view.mode === "report";

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <header className={styles.head}>
        <span className={styles.icon} aria-hidden="true"><CornerUpLeft size={18} /></span>
        <div className={styles.headCopy}>
          <h2 id={titleId} className={styles.title}>{view.title}</h2>
          <p className={styles.who}>
            {view.byInitials ? <span className={styles.avatar} aria-hidden="true">{view.byInitials}</span> : null}
            <span>{view.meta}</span>
          </p>
        </div>
      </header>

      <div className={styles.body}>
        <ul
          className={styles.asks}
          aria-label={report && view.doneText ? `สิ่งที่หัวหน้าขอ · แก้แล้ว ${view.doneText}` : "สิ่งที่หัวหน้าขอ"}
        >
          {view.items.map((item) => (
            <li key={item.index} className={styles.ask} data-done={item.done ? "1" : undefined}>
              {report ? (
                <label className={styles.askMain}>
                  <input
                    type="checkbox"
                    className={styles.check}
                    checked={item.done}
                    disabled={busy}
                    onChange={() => onToggle?.(item.index)}
                  />
                  <AskCopy item={item} />
                </label>
              ) : (
                <div className={styles.askMain}>
                  <span className={styles.bullet} aria-hidden="true">{item.index + 1}</span>
                  <AskCopy item={item} />
                </div>
              )}
              {/* ข้อที่ติ๊กแล้วไม่มีปุ่มพาไป (ม็อก A-5) — งานของข้อนั้นจบแล้ว ปุ่มที่เหลืออยู่คือข้อที่ยังต้องไป */}
              {item.zoneId && !item.done && onGoZone ? (
                <button type="button" className={styles.go} aria-label={item.goAria} onClick={() => onGoZone(item.zoneId)}>
                  {item.goLabel}
                  <ChevronRight size={15} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        {report ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor={noteId}>
              แก้อะไรไป <span className={styles.optional}>ไม่บังคับ</span>
            </label>
            <Textarea
              id={noteId}
              touch
              rows={3}
              value={note}
              maxLength={NOTE_MAX}
              disabled={busy}
              autoComplete="off"
              placeholder="เช่น ถ่ายจากประตูให้เห็นส่วน B"
              onChange={(e) => onNoteChange?.(e.target.value)}
            />
          </div>
        ) : (
          <p className={styles.hint}>{view.hint}</p>
        )}
      </div>
    </section>
  );
}

function AskCopy({ item }) {
  return (
    <span className={styles.askCopy}>
      <span className={styles.askText}>{item.text}</span>
      {item.evidence ? (
        <span className={styles.evidence}>
          <Check size={13} aria-hidden="true" />
          {item.evidence.text}
        </span>
      ) : null}
    </span>
  );
}
