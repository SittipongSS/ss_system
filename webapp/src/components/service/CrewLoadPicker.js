"use client";
// ── เลือกเจ้าหน้าที่ผู้รับผิดชอบนัด โดยเห็นภาระของ "วันนั้น" พร้อมกัน (มติ 2026-09-22 · แบบ A 24/09) ──
//
// ⭐ คำถามของช่องนี้ไม่ใช่แค่ *ใคร* แต่คือ **"วันนั้นใครยังรับไหว"**
//    แบบ A (มติเจ้าของ 24/09) แยกสองกลุ่มให้ตอบได้โดยไม่ต้องไล่ตาทีละแถว (pain 3 · 15):
//    · **ว่างทั้งวัน** — แผ่นเล็กสองคอลัมน์ (ไม่มีแถว 0/0/0 ซ้ำ ๆ) + "ถ้าเลือก 1 นัด · x/12 จุด" ครั้งเดียวที่หัวกลุ่ม
//    · **มีงานแล้ว** — แถวละคน: ตอนนี้กี่นัด/จุด/แพ็ค · แถบภาระ (เส้นเพดาน 12 จุด) · "ถ้าเลือก n นัด · x/12 จุด"
//      · ป้ายเกินภาระ / ไปช่วย / **เวลาทับ SV-… 10:30–12:30** (เตือนเท่านั้น ไม่ห้าม)
//    · ผู้รับผิดชอบเดิมที่หลุดรายชื่อ (แถวค้าง) · "ยังไม่มอบหมาย" (เฉพาะงานที่ยอมให้ไม่มีคน)
// ⚠️ **ทำไมไม่ใช้ PersonLoadSelect ตรง ๆ** — ตัวนั้นผูกกับตัวเลขของลีด (WORKLOAD_FIELDS ·
//    ชื่อจาก personFullName · ทีมจากทะเบียนทีมขาย) ส่วนงานบริการนับคนละหน่วย (นัด · จุด · แพ็ค)
//    และทีมคือทีมช่าง · ไปแก้ตัวกลางให้รับสองโลก = เสี่ยงกล่องลีดที่ใช้อยู่ทุกวัน
// ⚠️ **ตัวเลขไม่นับร่าง** — หัวกล่องพูดไว้ตรง ๆ ว่า "ไม่นับร่าง"
// ⚠️ **ไม่รู้ = ไม่มีตัวเลข ไม่ใช่ 0** — โหลดภาระไม่ได้/ยังไม่มีวัน ⇒ แผ่นล้วน + คำเตือน
//    (ศูนย์ที่เดาเองอ่านว่า "ว่าง" แล้วงานจะถูกยัดให้คนที่เต็มอยู่แล้ว)
// ⭐ **radio จริงของเบราว์เซอร์ ชื่อกลุ่มเดียว** — ลูกศรเดินผ่านแผ่นและแถวตามลำดับบนจอ · Tab เข้าออกทีเดียว
//    และโมดัลพาโฟกัสมาที่ `input:checked` ได้ (ปุ่ม "เลือกเจ้าหน้าที่" บนการ์ด)
// ⚠️ ตรรกะทั้งหมดอยู่ที่ `crewPickerView` (lib/service/scheduleModal.js) — ตัวนี้วาดอย่างเดียว
import { useId } from "react";
import StatusBadge from "@/components/ui/StatusBadge";
import { crewPickerView } from "@/lib/service/scheduleModal";
import styles from "./CrewLoadPicker.module.css";

export default function CrewLoadPicker({
  value = "",
  onChange,
  technicians = [],
  /* ผลของ staffLoadFor(date): { state: 'ok'|'unknown', people: [{ id, name, team, visits,
     assets, packs, assisting, dayVisits }] } (`crewLoadPeople`) */
  load = null,
  dateIso = "",
  labelledBy,
  /* ชื่อของผู้รับผิดชอบเดิมที่หลุดจากรายชื่อแล้ว (ย้ายฝ่าย/ปิดบัญชี) — ดูแถวค้างข้างล่าง */
  currentName = "",
  /* ⭐ แถว "ยังไม่มอบหมาย" เป็นตัวเลือกได้ไหม (มติเจ้าของ 23/09 — โมดัลลงคิวคำร้องใช้ตัวเลือกนี้ด้วย)
     · โมดัลนัด (ค่าตั้งต้น true) — นัดไม่มีเจ้าหน้าที่ได้ (เป็นร่าง รอมอบหมาย)
     · โมดัลลงคิวคำร้อง (false) — เจ้าหน้าที่ **บังคับ** (`surveyScheduleGaps` ตัวเดียวกับ server)
       ⇒ ปล่อยแถวนี้ไว้ = ให้เลือกคำตอบที่กดแล้วโดนตีกลับแน่นอน */
  allowUnassigned = true,
  /* `{ assets, packs }` ของไซต์ที่กำลังนัด — "ถ้าเลือก … x/12 จุด" · ไม่ส่ง = พูดแค่จำนวนนัด (ไม่เดาจุด) */
  siteLoad = null,
  /* `{ startTime, endTime }` ที่กำลังกรอก — เตือน "เวลาทับ" (ไม่ส่ง = ไม่เตือน) */
  timeWindow = null,
  /* รายชื่อเอง: 'loading' | 'error' | 'ready' — ไม่ส่ง = พร้อม (ว่างเปล่า = "ยังไม่มีบัญชี…") */
  rosterState = "ready",
}) {
  const group = useId();
  const headId = useId();
  const view = crewPickerView({
    technicians, load, dateIso, value, currentName, allowUnassigned, siteLoad, timeWindow, rosterState,
  });

  /* รายชื่อยังไม่พร้อม — กำลังโหลด / โหลดพัง / ไม่มีใครเลย (สามข้อความ ไม่ใช่ข้อความเดียว) */
  if (view.roster.state !== "ready") {
    return (
      <p className={styles.roster} role={view.roster.state === "error" ? "alert" : undefined}>
        {view.roster.text}
      </p>
    );
  }

  const radio = (id, checked) => (
    <input
      type="radio" name={group} value={id} className={styles.srOnly}
      checked={checked} onChange={() => onChange?.(id)}
    />
  );
  const tile = (person) => (
    <label key={person.id} className={styles.tile} data-on={person.selected ? "1" : undefined}>
      {radio(person.id, person.selected)}
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.name}>{person.name}</span>
      {person.team ? <span className={styles.team}>{person.team}</span> : null}
    </label>
  );

  /* ⭐ ช่องบังคับที่ยังไม่มีใคร (ลงคิว — `view.invalid`) ⇒ กรอบสีเตือน + aria-invalid ที่ตัวกลุ่ม (รีวิว UAT 24/09 · แบบ A)
     เดิมบอกแค่บรรทัดท้ายโมดัลกับข้อ ③ — ตัวช่องเองดูเหมือนไม่มีอะไรขาด */
  return (
    <div className={styles.picker} data-invalid={view.invalid ? "1" : undefined}>
      <div className={styles.head} id={headId}>
        <span>{view.head.text}</span>
        {view.head.aside ? (
          <span className={styles.headAside} data-tone={view.head.asideTone || undefined}>{view.head.aside}</span>
        ) : null}
      </div>
      {view.notice ? <p className={styles.notice}>{view.notice}</p> : null}
      <div
        className={styles.list}
        role="radiogroup"
        aria-labelledby={[labelledBy, headId].filter(Boolean).join(" ")}
        aria-required={allowUnassigned ? undefined : "true"}
        aria-invalid={view.invalid ? "true" : undefined}
      >
        {view.free ? (
          <div className={styles.section}>
            <p className={styles.groupHead}>
              <span>{view.free.label}</span>
              <span className={styles.groupProjection}>{view.free.projection}</span>
            </p>
            {view.free.people.length ? <div className={styles.grid}>{view.free.people.map(tile)}</div> : null}
          </div>
        ) : null}

        {view.plain.length ? (
          <div className={styles.section}>
            <div className={styles.grid}>{view.plain.map(tile)}</div>
          </div>
        ) : null}

        {view.busy.map((row) => (
          <label key={row.id} className={styles.row} data-on={row.selected ? "1" : undefined}>
            {radio(row.id, row.selected)}
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.who}>
              <span className={styles.line}>
                <span className={styles.name}>{row.name}</span>
                {row.team ? <span className={styles.team}>{row.team}</span> : null}
                {row.tags.map((tag) => (
                  <StatusBadge key={tag.key} size="sm" tone={tag.tone} label={tag.text} />
                ))}
              </span>
              <span className={`${styles.line} ${styles.now}`}>
                <span>{row.nowText}</span>
                {row.overlaps.map((tag) => (
                  <StatusBadge key={tag.key} size="sm" tone={tag.tone} label={tag.text} />
                ))}
              </span>
            </span>
            <span className={styles.load}>
              <span className={styles.bar} data-over={row.bar.over ? "1" : undefined} aria-hidden="true">
                {row.bar.cells.map((cell, index) => (
                  <i key={index} data-fill={cell.fill || undefined} data-cap={cell.cap ? "1" : undefined} />
                ))}
              </span>
              <span className={styles.projection} data-over={row.projection.over ? "1" : undefined}>
                {row.projection.text}
              </span>
            </span>
          </label>
        ))}

        {/* 🐞 กันแถวที่เลือกอยู่ "หายไปเฉย ๆ" — ผู้รับผิดชอบเดิมที่ไม่อยู่ในรายชื่อเจ้าหน้าที่แล้ว
            ถ้าไม่มีแถวของเขา กลุ่มปุ่มจะไม่มีอะไรถูกเลือก แล้วอ่านเหมือน "ยังไม่มอบหมาย" ทั้งที่ใบยังผูกคนเดิม */}
        {view.pinned ? (
          <label className={styles.row} data-on="1">
            {radio(view.pinned.id, true)}
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.who}>
              <span className={styles.line}><span className={styles.name}>{view.pinned.name}</span></span>
              <span className={`${styles.line} ${styles.gone}`}>{view.pinned.note}</span>
            </span>
          </label>
        ) : null}

        {view.unassigned ? (
          <label className={styles.none} data-on={view.unassigned.selected ? "1" : undefined}>
            {radio("", view.unassigned.selected)}
            <span className={styles.dot} aria-hidden="true" />
            <span>{view.unassigned.label}</span>
            <span className={styles.noneSub}>· {view.unassigned.sub}</span>
          </label>
        ) : null}
      </div>
    </div>
  );
}
