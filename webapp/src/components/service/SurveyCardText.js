// ── ตัววาดร้อยแก้วของการ์ดจัดการผลประเมิน — ชิ้นที่ไม่ตัดบรรทัดข้างใน ─────────────────────────────
//
// ⭐ **ยกออกจาก `SurveyControlCard` เพื่อให้สามผู้เรียกใช้ตัวเดียว** — การ์ด · ปุ่มพาไป (`SurveyJumpButton`) · ส่วนเอกสารประเมิน
//   (`SurveyDocumentSection` — ในการ์ดของหัวหน้า และเป็นบล็อกเดี่ยวของผู้วางคิว · มติเจ้าของ 19/10/2026)
//   ⚠️ ไม่ประกาศในไฟล์การ์ดแล้ว export — การ์ด import สองไฟล์นั้นอยู่ ⇒ import กลับ = วงวนของโมดูล
//   ⚠️ ไฟล์นี้มี JSX — ตัวเลือกชิ้น (ไม่มี JSX · เทสต์ Node import ได้) อยู่ที่ `surveyControlCardUnits.js`
import { Fragment } from "react";
import plainThaiText, { keepPhrases } from "@/components/ThaiText";
import { surveyCardUnits } from "./surveyControlCardUnits";

/* ⭐ **ร้อยแก้วของการ์ดวาดเป็นชิ้นที่ไม่ตัดบรรทัดข้างใน** (S2b แก้หลังตรวจจอ head-r3-12) — ป้ายใน “…” · วงเล็บสั้น "(SM 3)" · "ฝ่ายขาย" ·
   ชื่อพื้นที่ ห่อด้วย `keepPhrases` ของ `ThaiText` (nowrap ทั้งชิ้น · ตัวหนังสือไม่ถูกแตะ) · ท่อนระหว่างชิ้นผ่าน `thaiText` กลางตามเดิม
   (คำทับศัพท์ · เลขที่เอกสาร "SV-26100011" ยังไม่ขาด) ⇒ บรรทัดตัดได้ที่ " · " และช่องว่างระหว่างชิ้นเท่านั้น
   ⚠️ ข้อความที่ไม่มีชิ้นไหนเลย = ผลของ `thaiText` กลางเป๊ะ (เหมือนก่อนแก้ทุกตัวอักษร) · ชิ้นไหนเป็นชิ้น ตัดสินที่ `surveyControlCardUnits.js` */
export function keepUnits(text, names) {
  if (typeof text !== "string" || text.length < 2) return text;
  const kept = keepPhrases(text, surveyCardUnits(text, names));
  if (kept === text) return plainThaiText(text);
  /* key ของชิ้นที่ห่อเป็นเลขลำดับจาก `keepPhrases` — ท่อนข้อความขึ้นต้นด้วย "t" จึงไม่ชนกัน (ลิสต์เกิดจากสตริงเดียว ไม่สลับลำดับ) */
  return kept.map((part, index) => (typeof part === "string"
    ? <Fragment key={`t${index}`}>{plainThaiText(part)}</Fragment>
    : part));
}
