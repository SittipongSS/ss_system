"use client";
// ── สองบานของแท็บหน้างาน: รายการพื้นที่ | หน้าพื้นที่ (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.1–3.2) ───────────────────
//
// ⭐ **ต้นไม้เดียวทุกขนาดจอ** — "pages" (<1000): สองหน้า รายการ ↔ หน้าพื้นที่เต็มจอ · "split" (≥1000): สองบานข้างกัน
//   ⇒ หมุนแท็บเล็ตข้ามเส้น 1000 แล้วหน้าพื้นที่ **ไม่ถูกสร้างใหม่** (ค่าที่ช่างพิมพ์ค้างไม่หาย) · ความกว้างเปลี่ยนแค่การจัดวาง
//   ส่วน "เห็นบานไหน" ในโหมดหน้ามาจาก **การนำทาง** (เปิดพื้นที่อยู่ไหม) ไม่ใช่จากความกว้าง
// ⚠️ ซ่อนด้วย `hidden` ไม่ใช่ถอดออก — รายการที่ถูกซ่อนตอนเปิดพื้นที่ต้องกลับมาที่ตำแหน่งเลื่อนเดิม และแถบงานของช่าง
//   ในบานรายการไม่ต้องสร้างใหม่ทุกครั้งที่กลับมา
// ⭐ **หน้าเต็มจอ** — โหมดหน้า + เปิดพื้นที่อยู่ = ประกาศ `data-immersive-page` ที่บานพื้นที่ ⇒ `globals.css` หลบเปลือกแอป
//   ทั้งชุด (แถบบน · เมนูล่าง · แถวย้อน) · สองบานไม่ประกาศ (รายการยังอยู่ข้างซ้าย เปลือกต้องอยู่)
import { useEffect, useRef } from "react";
import styles from "./SurveyFieldWorkspace.module.css";

/** เนื้อแท็บอื่นที่มีแถบงานของช่างท้ายเนื้อ (แท็บสรุปส่งผล) — แถบที่ติดขอบชิดล่างเหมือนแท็บหน้างาน (🐞 review 26/09: ตารางสั้นแล้วแถบลอยกลางจอ) */
export function SurveyBarColumn({ children }) {
  return <div className={styles.barColumn}>{children}</div>;
}

/** id ของบานพื้นที่ — ตัวต่อสายประวัติเลื่อนบานนี้ให้เห็นหัวเมื่อย้ายพื้นที่ในสองบาน */
export const SURVEY_ZONE_PANE_ID = "survey-zone-pane";

/**
 * @param mode     "pages" | "split" — จาก `useMediaQuery(SURVEY_SPLIT_QUERY)`
 * @param zoneOpen มีพื้นที่เปิดอยู่ (ตัวต่อสายประวัติตัดสิน)
 * @param list     รายการพื้นที่ (+ ของที่อยู่บานเดียวกัน)
 * @param bar      แถบงานของช่าง — ลูกของคอลัมน์รายการ **นอกกล่องเลื่อนของรายการ** ⇒ ติดขอบล่างของจอตั้งแต่เปิดหน้า
 *                 (🐞 UAT 25/09 จอ 1024×768 / 1440×900: แถบอยู่ในกล่องเลื่อนของบานรายการ ซึ่งเริ่มใต้หัวงาน ~295px
 *                  ⇒ ขอบล่างของบานเลยจอ ปุ่ม "เริ่มงาน" ไม่เห็นจนกว่าจะเลื่อนหน้า)
 * @param zone     หน้าพื้นที่ หรือสถานะว่าง
 */
export default function SurveyFieldWorkspace({ mode = "pages", zoneOpen = false, list, bar = null, zone }) {
  const pages = mode !== "split";
  const colRef = useRef(null);
  /* สองบาน: กล่องเลื่อนของรายการหดเท่าความสูงแถบ (แถบสูงไม่คงที่ — บรรทัดรองห่อได้ 1–2 บรรทัดในบาน 320px)
     ⇒ ตอนบานติดบนแล้ว รายการกับแถบพอดีจอ แถวสุดท้ายไม่จมใต้แถบ · วัดจากแถบจริงด้วย ResizeObserver */
  useEffect(() => {
    const col = colRef.current;
    const node = col?.querySelector(":scope > [data-survey-bar]");
    if (pages || !node || typeof ResizeObserver === "undefined") {
      col?.style.removeProperty("--survey-bar-h");
      return undefined;
    }
    const observer = new ResizeObserver(() => col.style.setProperty("--survey-bar-h", `${Math.ceil(node.offsetHeight)}px`));
    observer.observe(node);
    return () => observer.disconnect();
  }, [pages, bar]);
  return (
    <div className={styles.workspace} data-layout={pages ? "pages" : "split"}>
      {/* คอลัมน์รายการ = กล่องเลื่อนของรายการ + แถบ (พี่น้องกัน) · หน้าเดียว: ซ่อนทั้งคอลัมน์ตอนเปิดพื้นที่ */}
      <div ref={colRef} className={styles.listCol} hidden={pages && zoneOpen}>
        <div className={styles.listPane}>
          {list}
        </div>
        {bar}
      </div>
      <div
        id={SURVEY_ZONE_PANE_ID}
        className={styles.zonePane}
        hidden={pages && !zoneOpen}
        data-immersive-page={pages && zoneOpen ? "" : undefined}
      >
        {zone}
      </div>
    </div>
  );
}
