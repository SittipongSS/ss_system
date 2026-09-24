"use client";
// ── "เจ้าหน้าที่ที่ไปด้วย" ของโมดัลนัด (แบบ A · มติเจ้าของ 24/09) ───────────────────────────
//
// ⭐ ชิปของคนที่เลือกแล้ว + ปุ่ม "+ เพิ่มผู้ไปด้วย" — ไม่ใช่รายชื่อเต็มชุดที่สองใต้ตัวเลือกผู้รับผิดชอบ
//    (pain 4: เดิมกางแผ่นทุกคนซ้ำอีกชุดทั้งที่งานส่วนใหญ่ไปคนเดียว) · กดเพิ่ม = ช่องค้นชื่อที่กางรายการทันที
//    (`SearchableSelect` — คนเกิน 6 คน เกินเพดานของชิปตามกติกาคอนโทรล) · ปุ่ม × ข้างช่องค้น = ยกเลิกการเพิ่ม
// ⚠️ ความหมายเดิมทุกอย่างของ `assistantIds` (F-6):
//    · ไม่ใช่ "เจ้าของงานคนที่สอง" — ใบส่งงานและรอบถัดไปนับจากผู้รับผิดชอบคนเดียว
//    · ผู้รับผิดชอบไม่อยู่ในตัวเลือก และถูกตัดออกเมื่อแก้รายการ (พฤติกรรมเดียวกับแผ่นเลือกหลายของเดิม)
//    · ลำดับที่ส่งออก = ลำดับรายชื่อ (ไม่ใช่ลำดับที่กด) — ก้อนที่บันทึกเท่ากับของเดิม (`orderHelperIds`)
// ⚠️ ชื่อบนชิป/ตัวเลือก/คำใบ้มาจาก `helperChipsView` (lib/service/scheduleModal.js) — ตัวนี้วาดอย่างเดียว
//    🐞 รีวิว UAT 24/09: คนที่หลุดรายชื่อ/รายชื่อยังโหลดไม่เสร็จเคยขึ้นเป็นรหัสผู้ใช้ดิบ (UUID)
// ⚠️ **โฟกัสไม่หล่นไป body** (รีวิว UAT 24/09) — เลือกคนแล้วช่องค้นถูกถอด · นำชิปออกแล้วปุ่มที่โฟกัสอยู่ถูกถอด
//    ⇒ บอกล่วงหน้าว่าโฟกัสต้องไปไหน (`focusAfter`) แล้วย้ายหลังเรนเดอร์: ปุ่มเพิ่ม / ชิปถัดไป / ชิปที่เพิ่งเพิ่ม
// ⚠️ ปุ่มนำออกของชิปเป็นเป้านิ้ว ≥44px (ชิปของกลาง `Tag` มีปุ่ม 18px — เล็กไปสำหรับจอสัมผัส)
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { helperChipsView, orderHelperIds } from "@/lib/service/scheduleModal";
import styles from "./HelperChips.module.css";

/**
 * @param value        `assistantIds` ปัจจุบัน
 * @param onChange     `(ids) => void` — เรียงตามรายชื่อ · ไม่มีผู้รับผิดชอบ
 * @param technicians  รายชื่อ [{ id, name }] (ชุดเดียวกับตัวเลือกผู้รับผิดชอบ)
 * @param assigneeId   ผู้รับผิดชอบ — ไม่อยู่ในตัวเลือกและไม่ขึ้นเป็นชิป
 * @param labelledBy   id ของป้าย "เจ้าหน้าที่ที่ไปด้วย"
 * @param rosterState  'loading' | 'error' | 'ready' ของรายชื่อ — กำลังโหลด ⇒ ชิปบอกว่ากำลังโหลดชื่อ (ไม่ใช่รหัส)
 */
export default function HelperChips({
  value = [], onChange, technicians = [], assigneeId = "", labelledBy, disabled = false, rosterState = "ready",
}) {
  const [adding, setAdding] = useState(false);
  const rowRef = useRef(null);
  const pickerRef = useRef(null);
  /* โฟกัสหลังเรนเดอร์ถัดไป — `{ prefer, fallback }`: 'add' = ปุ่มเพิ่ม · อื่น ๆ = id ของชิป */
  const focusAfter = useRef(null);
  const view = helperChipsView({ value, technicians, assigneeId, rosterState });
  const ids = (Array.isArray(value) ? value : []).filter(Boolean);

  const emit = (next) => onChange?.(orderHelperIds(next, { technicians, assigneeId }));

  /* เปิดช่องค้นแล้วกางรายการเลย (เดิมต้องกดสองครั้ง) — ช่องค้นของ SearchableSelect รับโฟกัสเองตอนกาง */
  useEffect(() => {
    if (adding) pickerRef.current?.querySelector("button")?.click();
  }, [adding]);

  /* ย้ายโฟกัสที่บอกไว้ — ไม่มี deps: รันหลังทุกเรนเดอร์ แต่ทำงานเฉพาะเมื่อมีคำขอค้าง */
  useEffect(() => {
    const want = focusAfter.current;
    if (!want) return;
    focusAfter.current = null;
    const row = rowRef.current;
    const find = (key) => (key === "add"
      ? row?.querySelector("[data-helper-add]")
      : [...(row?.querySelectorAll("[data-helper-remove]") || [])].find((el) => el.dataset.helperRemove === key));
    (find(want.prefer) || find(want.fallback) || row?.querySelector("[data-helper-remove]"))?.focus();
  });

  const remove = (id, index) => {
    const next = view.chips[index + 1]?.id || view.chips[index - 1]?.id || "";
    focusAfter.current = { prefer: next || "add", fallback: "add" };
    emit(ids.filter((other) => other !== id));
  };

  const cancelAdding = () => {
    focusAfter.current = { prefer: "add", fallback: "add" };
    setAdding(false);
  };

  return (
    <div ref={rowRef} className={styles.row} role="group" aria-labelledby={labelledBy}>
      {view.chips.map((helper, index) => (
        <span key={helper.id} className={styles.chip} data-known={helper.known ? undefined : "no"}>
          <span className={styles.name}>{helper.name}</span>
          <button
            type="button"
            className={styles.remove}
            data-helper-remove={helper.id}
            aria-label={`นำ ${helper.name} ออกจากผู้ไปด้วย`}
            disabled={disabled}
            onClick={() => remove(helper.id, index)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className={styles.adding}>
          <span ref={pickerRef} className={styles.picker}>
            <SearchableSelect
              value=""
              options={view.options}
              placeholder="เลือกผู้ไปด้วย"
              ariaLabel="เพิ่มผู้ไปด้วย"
              disabled={disabled}
              onChange={(id) => {
                if (!id) return;
                focusAfter.current = { prefer: "add", fallback: id };
                emit([...ids, id]);
                setAdding(false);
              }}
            />
          </span>
          <button
            type="button"
            className={styles.remove}
            aria-label="ยกเลิกการเพิ่มผู้ไปด้วย"
            disabled={disabled}
            onClick={cancelAdding}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      ) : view.options.length ? (
        <button type="button" className={styles.add} data-helper-add disabled={disabled} onClick={() => setAdding(true)}>
          <Plus size={14} aria-hidden="true" />
          เพิ่มผู้ไปด้วย
        </button>
      ) : null}
      {/* คำใบ้เดิมของช่องนี้แบ่งสองท่อนตามสถานะ — ว่าง: ไปคนเดียว · มีคน: เขาเห็นนัดในงานวันนี้ของตัวเอง */}
      {!adding ? <span className={styles.hint}>{view.hint}</span> : null}
    </div>
  );
}
