"use client";
// ── วาดข้อความไทยไม่ให้ตัดขาดกลางคำ ────────────────────────────────────────
//
// ตรรกะทั้งหมด (ทำไม · วัดอะไรมาบ้าง · ทำไมไม่ใช้ CSS/WORD JOINER) อยู่ที่
// `lib/thaiWrap.js` — ไฟล์นี้ทำหน้าที่เดียว: เอาชิ้นที่ซอยมาแล้วไปวาด โดยห่อ
// คำทับศัพท์ด้วย `nowrap` เพื่อห้ามตัด *ข้างใน* คำ
//
// ⚠️ **ตัวคำไม่ถูกแตะ** — `Ctrl+F` และ copy ยังได้คำเดิมเป๊ะ (ต่างจากการแทรก
//   WORD JOINER ซึ่งได้ผลเหมือนกันแต่ทำให้ค้นหาคำนั้นบนหน้าไม่เจอ)
import { splitThai } from "@/lib/thaiWrap";
import styles from "./ThaiText.module.css";

/**
 * @param {string} text ข้อความที่จะวาด
 * @returns ข้อความเดิม (ถ้าไม่มีอะไรต้องทำ) หรือ node ที่ห่อคำทับศัพท์ไว้แล้ว
 */
export default function thaiText(text) {
  if (typeof text !== "string" || text.length < 2) return text;
  const { parts, touched } = splitThai(text);
  if (!touched) return text;
  return parts.map((part, idx) => (part.word
    /* key เป็น index ได้ — ลิสต์นี้เกิดจากสตริงเดียว ไม่มีการสลับ/แทรกภายหลัง */
    ? <span key={idx} className={styles.word}>{part.text}</span>
    : part.text));
}
