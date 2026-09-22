"use client";
// ── เลือกเจ้าหน้าที่ผู้รับผิดชอบนัด โดยเห็นภาระของ "วันนั้น" พร้อมกัน (มติ 2026-09-22) ──
//
// ⭐ คำถามของช่องนี้ไม่ใช่แค่ *ใคร* แต่คือ **"วันนั้นใครยังรับไหว"** — ตอบไม่ได้ถ้าตัวเลข
// ถูกพับอยู่ในดรอปดาวน์ที่ต้องกดเปิดทีละครั้ง จึงกางเป็นหนึ่งคนหนึ่งแถว ตัวเลขชิดขวา
// ป้ายคอลัมน์ครั้งเดียวข้างบน (ทรงเดียวกับ `ui/PersonLoadSelect` ของกล่องมอบหมายลีด)
//
// ⚠️ **ทำไมไม่ใช้ PersonLoadSelect ตรง ๆ** — ตัวนั้นผูกกับตัวเลขของลีด (WORKLOAD_FIELDS ·
//    ชื่อจาก personFullName · ทีมจากทะเบียนทีมขาย) ส่วนงานบริการนับคนละหน่วย
//    (นัด · จุด · แพ็ค) และทีมคือทีมช่าง · ไปแก้ตัวกลางให้รับสองโลก = เสี่ยงกล่องลีด
//    ที่ใช้อยู่ทุกวัน จึงเป็นของโมดูลบริการเอง
// ⚠️ **ตัวเลขไม่นับร่าง** — ร่างยังไม่ถึงมือเจ้าหน้าที่ (ไม่อยู่ในงานวันนี้ของใคร)
//    หัวกล่องจึงพูดไว้ตรง ๆ ว่า "ไม่นับร่าง" กันคนเข้าใจว่า 0 = ไม่มีอะไรรออยู่เลย
// ⚠️ **state 'unknown' = ขีด ไม่ใช่ 0** — ศูนย์ที่เดาเอาเองอ่านว่า "ว่าง" แล้วงานจะถูก
//    ยัดให้คนที่เต็มอยู่แล้ว · บอกตรง ๆ ว่ายังโหลดไม่ได้ ดีกว่าให้ตัวเลขโกหก
import { Fragment, useId } from "react";
import { Check } from "lucide-react";
import { NA, fmtDayMonth } from "@/lib/format";
import { WEEKDAY_LABELS } from "@/lib/service/sites";
import styles from "./CrewLoadPicker.module.css";

/* ป้ายคอลัมน์ + หน่วยที่อ่านออกเสียง — ชุดเดียวกัน ป้ายบนหัวกับหน่วยในแถวจะได้ไม่หลุดกัน */
const LOAD_COLUMNS = [
  { key: "visits", label: "นัด" },
  { key: "assets", label: "จุด" },
  { key: "packs", label: "แพ็ค" },
];

/* "พ. 23 ก.ย." จากวันที่ล้วน — คิดวันในสัปดาห์แบบ UTC เพราะสตริงนี้เป็น *วันที่* ไม่ใช่เวลา
   (new Date('2026-09-23') ในเครื่องโซนลบจะถอยไปเป็นวันก่อน) */
function dayLabel(iso) {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso || "");
  return `${WEEKDAY_LABELS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${fmtDayMonth(iso)}`;
}

/* บรรทัดเล็กใต้ชื่อ — สิ่งที่ต้องชั่งก่อน (เวลาทับ/เกินภาระ/ไปช่วย) ขึ้นก่อนชื่อทีม
   เพราะคนไล่ตาหาเหตุที่ *ไม่ควร* เลือก ไม่ใช่หาว่าใครอยู่ทีมไหน */
function metaOf(row, known) {
  const parts = [];
  if (known && !row.visits && !row.assisting && !row.note) {
    parts.push({ key: "free", text: "ว่างทั้งวัน", tone: "free" });
  }
  if (known && row.assisting > 0) {
    parts.push({ key: "assist", text: `ไปช่วย ${row.assisting} นัด` });
  }
  if (row.note) parts.push({ key: "note", text: row.note, tone: "warn" });
  if (row.team) parts.push({ key: "team", text: row.team });
  return parts;
}

export default function CrewLoadPicker({
  value = "",
  onChange,
  technicians = [],
  /* ผลของ staffLoadFor(date): { state: 'ok'|'unknown', people: [{ id, name, team, visits,
     assets, packs, assisting, note }] } — `note` คือคำเตือนรายคน (เวลาทับ · เกินภาระ) */
  load = null,
  dateIso = "",
  labelledBy,
  /* ชื่อของผู้รับผิดชอบเดิมที่หลุดจากรายชื่อแล้ว (ย้ายฝ่าย/ปิดบัญชี) — ดูแถวค้างข้างล่าง */
  currentName = "",
}) {
  const group = useId();
  const headId = useId();
  const known = load?.state === "ok";
  const byId = new Map((load?.people || []).map((person) => [person.id, person]));

  /* ทีมเอาจากผลภาระก่อน แล้วค่อยจากรายชื่อ — โหลดภาระไม่ได้ (people ว่าง) ชื่อทีมจะได้ไม่หายไปด้วย */
  const rowOf = (id, name, { team = "", note = "" } = {}) => {
    const person = byId.get(id) || {};
    return {
      id,
      name: name || person.name || "",
      team: person.team || team || "",
      visits: Number(person.visits) || 0,
      assets: Number(person.assets) || 0,
      packs: Number(person.packs) || 0,
      assisting: Number(person.assisting) || 0,
      note: note || person.note || "",
    };
  };

  const rows = technicians.map((tech) => rowOf(tech.id, tech.name, { team: tech.team }));
  /* 🐞 กันแถวที่เลือกอยู่ "หายไปเฉย ๆ" — ผู้รับผิดชอบเดิมที่ไม่อยู่ในรายชื่อเจ้าหน้าที่แล้ว
     ถ้าไม่มีแถวของเขา กลุ่มปุ่มจะไม่มีอะไรถูกเลือก แล้วอ่านเหมือน "ยังไม่มอบหมาย"
     ทั้งที่ใบยังผูกคนเดิมอยู่ ⇒ ใส่แถวค้างไว้ให้เห็น และเลือกคนอื่นแทนได้ตามปกติ */
  if (value && !rows.some((row) => row.id === value)) {
    rows.unshift(rowOf(value, currentName, { note: "ไม่อยู่ในรายชื่อเจ้าหน้าที่บริการแล้ว" }));
  }

  const numberCells = (row) =>
    LOAD_COLUMNS.map((col) => (
      <span key={col.key} className={styles.num}>
        {known ? row[col.key] : NA}
        <span className={styles.srOnly}> {col.label}</span>
      </span>
    ));

  return (
    <div className={styles.picker}>
      <div className={styles.head} id={headId}>
        ภาระวันที่ {dayLabel(dateIso)} — ไม่นับร่าง
      </div>
      {!known && (
        <p className={styles.unknown}>ยังโหลดภาระไม่ได้ — ตัวเลขว่างไม่ได้แปลว่าว่าง</p>
      )}
      {/* ป้ายคอลัมน์ครั้งเดียว ไม่ซ้ำทุกแถว · aria-hidden เพราะแต่ละตัวเลขมีหน่วยอ่านออกเสียงในตัว */}
      <div className={`${styles.row} ${styles.cols}`} aria-hidden="true">
        <span>เจ้าหน้าที่</span>
        {LOAD_COLUMNS.map((col) => <span key={col.key} className={styles.num}>{col.label}</span>)}
      </div>
      {/* ⭐ radio จริงของเบราว์เซอร์ — ลูกศรขึ้นลงเลื่อนคน · Tab เข้าออกกลุ่มทีเดียว
          ได้ฟรีโดยไม่ต้องเขียนคีย์บอร์ดเอง (ปุ่มซ่อนตา แต่ยังอยู่ในลำดับโฟกัส) */}
      <div className={styles.list} role="radiogroup" aria-labelledby={[labelledBy, headId].filter(Boolean).join(" ")}>
        <label className={`${styles.row} ${styles.option}`} data-on={!value ? "1" : undefined}>
          <input
            type="radio" name={group} value="" className={styles.srOnly}
            checked={!value} onChange={() => onChange?.("")}
          />
          <span className={styles.who}>
            <span className={`${styles.name} ${styles.unassigned}`}>
              ยังไม่มอบหมาย
              {!value && <Check size={14} aria-hidden="true" className={styles.tick} />}
            </span>
          </span>
        </label>
        {rows.map((row) => {
          const on = row.id === value;
          const meta = metaOf(row, known);
          return (
            <label key={row.id} className={`${styles.row} ${styles.option}`} data-on={on ? "1" : undefined}>
              <input
                type="radio" name={group} value={row.id} className={styles.srOnly}
                checked={on} onChange={() => onChange?.(row.id)}
              />
              <span className={styles.who}>
                <span className={styles.name}>
                  {row.name}
                  {on && <Check size={14} aria-hidden="true" className={styles.tick} />}
                </span>
                {meta.length > 0 && (
                  <small className={styles.meta}>
                    {meta.map((part, index) => (
                      <Fragment key={part.key}>
                        {index > 0 && " · "}
                        <span data-tone={part.tone}>{part.text}</span>
                      </Fragment>
                    ))}
                  </small>
                )}
              </span>
              {numberCells(row)}
            </label>
          );
        })}
      </div>
    </div>
  );
}
