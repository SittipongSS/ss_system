"use client";
// ── รายการพื้นที่ของจอหน้างาน (แผน §10.5 จอหน้างานแบบ A · ม็อก A-1 · AO-2 · AT-1 · AT-3 · AW-1/2) ──────────
//
// ⭐ หน้าแรกของแบบ A (มือถือ/แท็บเล็ตแนวตั้ง) และบานซ้ายของสองบาน — **หนึ่งแถวต่อพื้นที่** ตอบได้โดยไม่ต้องเปิด:
//   รหัส · ชื่อ · ชั้น (ชั้นขึ้นครั้งเดียว) · สามข้อของช่าง (ขนาด · ภาพกว้าง · จุด) หรือ "ขาด: …" · ป้ายที่มา/สถานะ
//   🔄 แทนลิสต์การ์ดพับได้ของจอเดิม (หัวใบ 470px + การ์ดว่าง 1.7 จอต่อพื้นที่ · pain B1)
// ⚠️ **แถวเป็น `<button>` ไม่ใช่ลิงก์** — ตัวเฝ้าค่าค้าง (`useUnsavedChanges`) โหลดหน้าใหม่ทั้งหน้าเมื่อกด `<a>` ที่ search
//   ต่างกัน ⇒ ค่าที่พิมพ์ค้างในบานขวาหายโดยไม่ถาม · ปุ่มส่งเรื่องให้ตัวต่อสายประวัติถามแทน
// ⚠️ ความคืบหน้าพูดที่เดียว ("วัดแล้ว 2 / 3 พื้นที่" บนหัวรายการ · pain B6) · ทุกคำมาจาก `surveyZoneListView`
// ⚠️ จัดวางสองแบบ **ข้อมูลชุดเดียวกัน**: ซ้อนแถว (≤680 · บานซ้าย) กับคอลัมน์ (681–999 หน้ารายการ · AT-1) — CSS ตัดสิน
//   จาก `data-layout` ของรายการเอง (`split`) + จุดตัด 680 (ไม่มีอะไรหายตามขนาดจอ · บทเรียนที่ถูกตีกลับ 16/09)
import { Ban, Check, ChevronRight, Circle, CircleAlert, MapPinPlus, Minus, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import { SURVEY_UNKNOWN_TEXT } from "@/lib/service/surveyControl";
import { NA, naText } from "@/lib/format";
import styles from "./SurveyZoneList.module.css";

/** id ของปุ่มแถว — ตัวต่อสายประวัติคืนโฟกัสมาที่แถวของพื้นที่ที่เพิ่งออกมา (หน้าเต็มจอ → รายการ) */
export const surveyZoneRowId = (zoneId) => `survey-zone-row-${zoneId}`;
/** id ของหัวรายการ — พื้นที่ที่เปิดอยู่หายไป (ถูกลบ) โฟกัสกลับมาที่นี่ */
export const SURVEY_ZONE_LIST_TITLE_ID = "survey-zone-list-title";

function Mark({ mark }) {
  return (
    <span className={styles.mark} data-key={mark.key} data-ok={mark.ok ? "1" : undefined}>
      {mark.ok
        ? <Check size={13} aria-hidden="true" />
        : <Circle size={13} aria-hidden="true" />}
      <span className={styles.markLabel}>{mark.label}</span>
      {/* ค่าข้างติ๊ก (48 ตร.ม. · ภาพกว้าง 2 · จุด 3) · วงเปล่าในโหมดคอลัมน์ใช้ขีด (ป้ายอยู่บนหัวคอลัมน์) */}
      {mark.ok && mark.value ? <span className={styles.markValue}>{mark.value}</span> : null}
      {!mark.ok ? <span className={styles.markDash} aria-hidden="true">{NA}</span> : null}
      {!mark.ok ? <span className="sr-only">ยังไม่มี</span> : null}
    </span>
  );
}

/**
 * @param view     `surveyZoneListView(...)` — `{ rows, progressText }`
 * @param split    สองบาน — แถวที่เลือกได้ `aria-current` (บานขวาคือพื้นที่นั้น)
 * @param onOpen   `(zoneId) => void` — เปิดพื้นที่ (ตัวต่อสายถามก่อนทิ้งค่าค้างเอง)
 * @param onAdd    เปิดฟอร์ม "เพิ่มพื้นที่ที่เจอหน้างาน" · ไม่ส่ง = ไม่มีแถว (ไม่มีสิทธิ์ = ไม่โชว์)
 * @param escape   `surveyEscapeView(...)` — แถว "มาถึงแล้วแต่เข้าไม่ได้?" + ปุ่ม "ไปแล้วเข้าไม่ได้" ใต้รายการ (§10.5 S8)
 * @param onEscape เปิดกล่องส่งงานที่เลือก "ไปแล้วเข้าไม่ได้" ไว้ให้ · ไม่ส่ง/`show` เป็นเท็จ = ไม่มีแถว
 * @param before / children  ของที่ผู้เรียกวางเหนือ/ใต้รายการในบานเดียวกัน (การ์ดส่งกลับของช่าง · การ์ดจัดการผลบนสองบานที่ยังไม่มีราง)
 */
export default function SurveyZoneList({
  view, split = false, onOpen, onAdd, escape = null, onEscape, before = null, children = null,
}) {
  const rows = view?.rows || [];
  return (
    <div className={styles.wrap} data-layout={split ? "split" : "pages"}>
      {before}
      <section className={styles.panel} aria-labelledby={SURVEY_ZONE_LIST_TITLE_ID}>
        <header className={styles.head}>
          <h2 id={SURVEY_ZONE_LIST_TITLE_ID} className={styles.title} tabIndex={-1}>พื้นที่ที่ต้องวัด</h2>
          <span className={styles.progress}>{view?.progressText || ""}</span>
        </header>
        {rows.length ? (
          <div className={styles.cols} aria-hidden="true">
            <span>พื้นที่</span>
            <span>ขนาด</span>
            <span>ภาพกว้าง</span>
            <span>จุดที่ติดตั้งได้</span>
          </div>
        ) : null}
        {rows.length ? (
          <ul className={styles.rows}>
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  id={surveyZoneRowId(row.id)}
                  className={styles.row}
                  data-state={row.state}
                  data-detail={row.detail}
                  aria-current={split && row.selected ? "true" : undefined}
                  onClick={() => onOpen?.(row.id)}
                >
                  <span className={styles.lead} data-state={row.state} aria-hidden="true">
                    {row.state === "done" ? <Check size={16} />
                      : row.state === "cut" ? <Minus size={16} />
                        : row.index}
                  </span>
                  <span className={styles.ident}>
                    <span className={styles.codeLine}>
                      <span className={styles.code}>{row.codeUnknown ? SURVEY_UNKNOWN_TEXT : naText(row.code)}</span>
                      {row.areaText ? <span className={styles.area}>{row.areaText}</span> : null}
                    </span>
                    <span className={styles.name}>{row.title}</span>
                    {row.tags.editing ? <span className={styles.editing}>กำลังแก้ · ยังไม่บันทึก</span> : null}
                  </span>
                  {row.detail === "cut" ? (
                    <span className={styles.cutText}>ตัดออก — {naText(row.cutReason)}</span>
                  ) : (
                    <span className={styles.marks}>
                      {row.marks.map((mark) => <Mark key={mark.key} mark={mark} />)}
                    </span>
                  )}
                  {row.detail === "missing" ? (
                    <span className={styles.missing}>
                      <CircleAlert size={13} aria-hidden="true" />
                      {row.missingText}
                    </span>
                  ) : null}
                  {row.tags.added || row.tags.sentBack || row.tags.headPending ? (
                    <span className={styles.tags}>
                      {row.tags.sentBack ? <span className={styles.tag} data-tone="warning">ส่งกลับให้แก้</span> : null}
                      {row.tags.headPending ? <span className={styles.tag} data-tone="info">หัวหน้ายังไม่เคาะ</span> : null}
                      {row.tags.added ? <span className={styles.tag} data-tone="accent">เพิ่มหน้างาน</span> : null}
                    </span>
                  ) : null}
                  <ChevronRight size={18} className={styles.chev} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>
            <MapPinPlus size={16} aria-hidden="true" />
            ใบนี้ยังไม่มีพื้นที่ที่ต้องประเมิน — ฝ่ายขายเป็นคนระบุพื้นที่ตอนเปิดใบ
          </p>
        )}
        {/* ⭐ ท้ายรายการ ไม่ใช่บนหัวจอ — ช่างรู้ว่ามีพื้นที่เกินมาก็ต่อเมื่อไล่ของในใบจนหมดแล้ว */}
        {onAdd ? (
          <button type="button" className={styles.add} onClick={onAdd}>
            <span className={styles.addMark} aria-hidden="true"><Plus size={16} /></span>
            เพิ่มพื้นที่ที่เจอหน้างาน
          </button>
        ) : null}
      </section>
      {/* ⭐ **ทางออกของทั้งงานอยู่ใต้รายการ ไม่ซ่อนในกล่องส่งงาน** (pain B9 · ม็อก A-1 · AO-2 · AT-1 · AW-1) — 🐞 เดิม
          "ไปแล้วเข้าไม่ได้" มีแค่ชิป 30px ข้างในกล่องส่งงาน ช่างที่ยืนหน้าตึกที่เข้าไม่ได้ไม่รู้ว่ามีทางนี้ ·
          คำถามเปลี่ยนหลังเริ่มงาน ("ทำต่อทั้งงานไม่ได้?") · ปุ่มเส้นแดง = ปิดนัดเป็นทำไม่ได้ (กล่องยังถามเหตุผลก่อน) */}
      {escape?.show && onEscape ? (
        <div className={styles.escape}>
          <p className={styles.escapePrompt}>{escape.prompt}</p>
          <Button tone="danger" variant="outline" className={styles.escapeBtn}
            icon={<Ban size={15} aria-hidden="true" />} onClick={onEscape}>
            {escape.label}
          </Button>
        </div>
      ) : null}
      {children}
    </div>
  );
}
