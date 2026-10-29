"use client";

import { MapPin, PencilRuler } from "lucide-react";
import Tag from "@/components/ui/Tag";
import { keepPhrases } from "@/components/ThaiText";

/* ── ป้ายวิธีประเมินของพื้นที่ / ใบ (ประเมินจากแบบ · งวด S2b §2.1) ──────────────────────────
 *
 * ⭐ **วาดอย่างเดียว ไม่ตัดสินคำ** — คำบนป้ายมาจาก view-model ของผู้เรียก (`SURVEY_METHOD_CHIP` ·
 *   `SURVEY_METHOD_LABEL` ใน `lib/service/surveyMethodSwitch.js`) · ไม่มีคำ = ไม่วาดอะไรเลย
 *   ⇒ ใบที่ไม่มีพื้นที่จากแบบ (view-model ให้ค่าว่าง) ได้จอเดิมทุกจุด
 * ⭐ วิธีประเมินเป็น **คุณสมบัติ** ของพื้นที่ ไม่ใช่สถานะ ⇒ ใช้ `Tag` ไม่ใช่ `StatusBadge`
 * 🔴 prop ชื่อ `variant` โดยตั้งใจ — ยามของงวด S2a ห้ามค่าวิธีอยู่ติดกับชื่อคอลัมน์วิธีในไฟล์ที่ไม่ใช่ตัวเขียน
 *   ผู้เรียกส่งค่าจาก view-model (`variant={row.method}`) หรือไม่ส่งเลย (ค่าตั้งต้น = หน้าตาของ "จากแบบ")
 * ⚠️ `Tag` มีขนาดเดียว ⇒ `size` รับไว้ให้ผู้เรียกบอกเจตนา (หัวหน้าพื้นที่ = "md") แต่ขนาดจริงมาจาก `className`
 *   ของ module ผู้เรียก — ไฟล์นี้ไม่มี CSS ของตัวเอง
 */
const LOOKS = {
  drawing: { tone: "info", icon: PencilRuler },
  onsite: { tone: "neutral", icon: MapPin },
};

export default function SurveyMethodChip({ variant = "drawing", label, size = "sm", className = "" }) {
  const words = String(label ?? "").trim();
  if (!words) return null;
  const look = LOOKS[variant] || LOOKS.drawing;
  void size;
  /* ป้ายสองท่อน ("ประเมินจากแบบ · รอยืนยันหน้างาน") ตัดบรรทัดได้ที่ " · " เท่านั้น — แต่ละท่อนห่อ nowrap (ตัวหนังสือไม่ถูกแตะ)
     🐞 ไทล์พื้นที่ของฟอร์มที่ 768 (สามไทล์ต่อแถว) เคยขาดเป็น "…รอยืนยันหน้า" / "งาน" (S2b แก้หลังตรวจจอ E-4 · UAT sales 27/10)
     · ป้ายท่อนเดียว = ข้อความเดิม */
  const shown = words.includes(" · ") ? keepPhrases(words, words.split(" · ")) : words;
  return <Tag tone={look.tone} icon={look.icon} label={shown} className={className} />;
}
