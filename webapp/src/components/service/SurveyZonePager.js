"use client";
// ── ตัวเลื่อนพื้นที่บนหัวหน้าพื้นที่ (แผน §10.5 จอหน้างานแบบ A · ม็อก A-2 · AT-2 · AT-3) ──────────────
//
// ⭐ ของสามชิ้นบนหัว: "‹ พื้นที่ทั้งหมด" (หน้าเต็มจอเท่านั้น — สองบานมีรายการอยู่ข้างซ้ายแล้ว) · ‹ จุด › · เมนู ⋮
//   ⇒ ช่างไล่วัดห้องถัดไปได้โดยไม่ต้องกลับรายการ และทางออกของพื้นที่ (ตัดออก · ลบ · เอากลับ) อยู่ห่างไม่เกินสองแตะ
// ⚠️ **ทุกตัวเป็น `<button>` ไม่ใช่ลิงก์** — ตัวเฝ้าค่าค้าง (`useUnsavedChanges`) โหลดหน้าใหม่ทั้งหน้าเมื่อกด `<a>` ที่
//   search ต่างกัน ⇒ ค่าที่พิมพ์ค้างหายโดยไม่ถาม · ปุ่มส่งเรื่องให้ตัวต่อสายประวัติ (`useSurveyZoneRoute`) ถามแทน
// ⚠️ จุดทุกขนาดจอ · เกิน 8 พื้นที่เป็น "n / t" (`surveyZoneNeighbors` ตัดสิน) — จุดสิบกว่าจุดนับไม่ออก
// ⭐ **จุดเป็นตัวบอก ไม่ใช่ปุ่ม** (ม็อก A-2 `role="img"`) — 🐞 UAT 25/09: ปุ่มจุดหดเหลือกว้าง 10px ติดกันเป็นก้อน
//   กดพลาดไปโดนพื้นที่ข้าง ๆ (ซึ่งเปิดกล่องทิ้งค่าค้าง) · ย้ายพื้นที่ด้วย ‹ › (44px) หรือรายการเท่านั้น
// ⚠️ เมนูสร้างที่หน้าพื้นที่ (รู้ว่าพื้นที่นี้ทำอะไรได้) — ที่นี่วาดอย่างเดียว
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import RowActionMenu from "@/components/ui/RowActionMenu";
import styles from "./SurveyZonePager.module.css";


/**
 * @param layout    "page" (แถบกรมท่าของหน้าเต็มจอ) | "pane" (หัวบานขวา)
 * @param neighbors `surveyZoneNeighbors(...)` — `{ index, total, prev, next, dots, ariaLabel, compactText }`
 * @param titles    `{ [zoneId]: "ห้อง Treatment · ชั้น 05" }` — ชื่อบนปุ่มจุด/ลูกศรสำหรับโปรแกรมอ่านจอ
 * @param onGo      `(zoneId) => void` — ย้ายไปพื้นที่นั้น (ตัวต่อสายถามก่อนทิ้งค่าค้างเอง)
 * @param onList    กลับหน้ารายการ (หน้าเต็มจอ) · ไม่ส่ง = ไม่มีปุ่ม
 * @param menuItems รายการของ `RowActionMenu` · ว่าง = ไม่มีเมนู (ไม่มีสิทธิ์ = ไม่โชว์)
 */
export default function SurveyZonePager({
  layout = "page", neighbors = null, titles = {}, onGo, onList, menuItems = [], menuLabel = "จัดการพื้นที่นี้",
}) {
  const nav = neighbors || { index: 0, total: 0, prev: null, next: null, dots: [], ariaLabel: "", compactText: null };
  const titleOf = (zoneId) => titles?.[zoneId] || "";
  const showSteps = nav.total > 1;
  return (
    <div className={styles.pager} data-layout={layout}>
      {onList ? (
        <button type="button" className={styles.list} onClick={onList}>
          <ChevronLeft size={18} aria-hidden="true" />
          พื้นที่ทั้งหมด
        </button>
      ) : null}
      {showSteps ? (
        <div className={styles.steps} role="group" aria-label="เลื่อนไปพื้นที่อื่น">
          <button
            type="button"
            className={styles.arrow}
            disabled={!nav.prev}
            aria-label={nav.prev ? `พื้นที่ก่อนหน้า: ${titleOf(nav.prev)}` : "ไม่มีพื้นที่ก่อนหน้า"}
            onClick={() => nav.prev && onGo?.(nav.prev)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          {/* จุดกับ "n / t" วาดคู่กันเสมอ — CSS เลือกตามที่ว่างจริงของแถบ (`@container`) ไม่ใช่ความกว้างจอ
              เพราะที่ว่างขึ้นกับปุ่ม "พื้นที่ทั้งหมด" และเมนู ⋮ ด้วย (🐞 UAT 25/09: จอ 360 เหลือที่ให้จุดราว 3 จุด) */}
          <span className={styles.indicator} role="img" aria-label={nav.ariaLabel || undefined}>
            {nav.compactText ? null : (
              <span className={styles.dots} data-n={nav.dots.length} aria-hidden="true">
                {nav.dots.map((dot) => (
                  <span key={dot.id} className={styles.dot} data-state={dot.state} data-current={dot.current ? "" : undefined}>
                    {dot.state === "done" ? <Check size={8} strokeWidth={3.4} /> : null}
                  </span>
                ))}
              </span>
            )}
            <span className={styles.count} data-always={nav.compactText ? "" : undefined} aria-hidden="true">
              {nav.compactText || `${nav.index} / ${nav.total}`}
            </span>
          </span>
          <button
            type="button"
            className={styles.arrow}
            disabled={!nav.next}
            aria-label={nav.next ? `พื้นที่ถัดไป: ${titleOf(nav.next)}` : "ไม่มีพื้นที่ถัดไป"}
            onClick={() => nav.next && onGo?.(nav.next)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {menuItems.length ? (
        <RowActionMenu className={styles.menu} items={menuItems} label={menuLabel} />
      ) : null}
    </div>
  );
}
