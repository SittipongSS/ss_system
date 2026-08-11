"use client";
// ── แถบเตือนพร้อมทางไปจัดการ — หนึ่งหน้าตา ใช้ได้ทุกโมดูล ──────────────────
//
// ⭐ **ยกออกมาจาก `ForecastReviewBanner`** (2026-08-11) — ตอนทำแถบ "มีใบตีกลับค้าง"
// ของหน้าคำร้อง ของที่ต้องการคือแถบเดียวกันเป๊ะ แค่เปลี่ยนโทนกับข้อความ ⇒ ก๊อปไฟล์
// ที่สองแล้วมันจะเพี้ยนหากันภายในเดือนเดียว (โรคเดียวกับที่ AGENTS.md ห้ามเรื่อง
// ฟอร์มสร้าง/แก้ และที่ `QueueCountStrip` เคยเป็นก่อนถูกยกมารวม)
//
// ⚠️ **ปุ่มต้องพาไปที่ตัวกรอง ไม่ใช่บอกเฉย ๆ** — เตือนแล้วยังต้องไล่หาเองในตาราง
// ร้อยแถว คนจะเลิกอ่านแถบนี้ภายในสัปดาห์เดียว (บทเรียนจากแถบทบทวน FC)
import styles from "./AlertBanner.module.css";

/**
 * props
 *   tone     : "warning" (มีงานต้องทำ) | "danger" (มีของค้างที่ผิดปกติแล้ว)
 *   icon     : lucide icon component
 *   children : เนื้อความ — ใช้ <strong> เน้นตัวเลขที่เป็นเหตุผลของแถบ
 *   action   : ปุ่ม/ลิงก์ทางขวา (ไม่ส่ง = แถบบอกเฉย ๆ)
 */
export default function AlertBanner({ tone = "warning", icon: Icon, children, action }) {
  return (
    <div className={styles.banner} data-tone={tone} role="status">
      {Icon && <Icon size={16} aria-hidden="true" className={styles.icon} />}
      <p className={styles.text}>{children}</p>
      {action}
    </div>
  );
}
