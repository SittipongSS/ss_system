"use client";
// ── เปลือกของใบประเมิน: หัวงาน · แถบแท็บ · เนื้อ · รางของหัวหน้า (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.2 · ชุด S9) ────────────
//
// ⭐ **เปลือกเดียวทั้งสองแท็บ** — 🔄 แทน `DetailOverview` + `DetailPageLayout` · รางของตัวหลังปักที่ 1051 ⇒ ที่ 1000–1199
//   รางกินบานพื้นที่จนเหลือไม่ถึงสองคอลัมน์ และสองแท็บได้รางที่ความกว้างคนละค่า · ที่นี่รางมีเส้นเดียว (1200 · แผนลงมือ C5)
// ⚠️ **JS ตัดสินว่ามีรางไหม** (`useMediaQuery(SURVEY_RAIL_QUERY)` + เป็นคนเคาะ) — CSS แค่วางตาม `data-rail`
//   ไม่มี `@media` ของตัวเอง ⇒ เส้นจอของ JS กับ CSS ไม่มีวันเถียงกัน (บทเรียน "JS ตัดสินโหมด CSS อ่านตาม" แผนลงมือ §3.1)
// ⚠️ หน้าเต็มจอของพื้นที่ (`immersive`) = หัวงานกับแถบแท็บหลบด้วย `hidden` — ไม่ถอด (กลับมาที่รายการแล้วอยู่ที่เดิม
//   และตัวจับว่าที่อยู่ถูกตัดไหมของหัวงานไม่ต้องเริ่มใหม่)
import styles from "./SurveySheetLayout.module.css";

/**
 * @param header    หัวงาน (`SurveyJobHeader`) — กินเต็มความกว้างเหนือรางเสมอ (ม็อก AW-2: รางเริ่มที่แถวแท็บ)
 * @param tabs      แถบแท็บ (หัวหน้าเท่านั้น) · ไม่ส่ง = ไม่มีแถว (ช่างไปสรุปส่งผลจากแถวใน "เกี่ยวกับคำร้อง")
 * @param tabsNote  บรรทัดสรุปท้ายแถบแท็บ ("รวม 114 ตร.ม. · …" — ไม่ใช่แท็บ ⇒ อยู่นอกรายการแท็บ คีย์บอร์ดเดินไม่โดน)
 * @param rail      การ์ดจัดการผล (≥1200 · หัวหน้า) · ไม่ส่ง = คอลัมน์เดียว
 * @param railLabel ชื่อของราง — ป้ายของ landmark (หัวการ์ดหลบบนจอแคบ ชื่อต้องยังอยู่ในผังของโปรแกรมอ่านจอ)
 * @param immersive หน้าพื้นที่เต็มจออยู่ — หัวงาน · แถบแท็บหลบ
 * @param headerLast หัวงานลงไปอยู่ท้ายเนื้อ (นัดปิดแล้วถูกส่งกลับ — ไซต์และนัดเป็นเรื่องรอง · ม็อก A-5 ย่อไว้ใต้รายการ) ·
 *                  ไม่ใช้กับราง · 🐞 UAT 25/09 จอ 360×640: หัวงานเต็มจอแรก ช่างไม่เห็นข้อที่หัวหน้าขอสักข้อ
 */
export default function SurveySheetLayout({
  header = null, tabs = null, tabsNote = null, rail = null, railLabel = "จัดการผลประเมิน", immersive = false,
  headerLast = false, children,
}) {
  const headNode = header ? <div className={styles.head} hidden={immersive}>{header}</div> : null;
  const last = headerLast && !rail;
  return (
    <div
      className={styles.sheet}
      data-rail={rail ? "" : undefined}
      data-tabs={tabs ? "" : undefined}
      data-header-last={last ? "" : undefined}
    >
      {last ? null : headNode}
      {tabs ? (
        <div className={styles.tabs} hidden={immersive}>
          {tabs}
          {tabsNote ? <p className={styles.tabsNote}>{tabsNote}</p> : null}
        </div>
      ) : null}
      <div className={styles.main}>{children}</div>
      {last ? headNode : null}
      {rail ? <aside className={styles.rail} aria-label={railLabel}>{rail}</aside> : null}
    </div>
  );
}
