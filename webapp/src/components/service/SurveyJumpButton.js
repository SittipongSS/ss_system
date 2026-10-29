"use client";
// ── ปุ่มพาไปจุดที่แก้ได้จริง ของการ์ดจัดการผลและส่วนเอกสารประเมิน ──────────────
//
// ⭐ **ยกออกจาก `SurveyControlCard` เพื่อให้สองผู้เรียกใช้ตัวเดียว** — การ์ด (บรรทัดเหตุ · แถวด่าน) กับส่วนเอกสารประเมิน
//   (`SurveyDocumentSection` — ในการ์ดของหัวหน้า และเป็นบล็อกเดี่ยวของผู้วางคิว · มติเจ้าของ 19/10/2026)
//   ⚠️ ไม่ประกาศในไฟล์การ์ดแล้ว export — ส่วนเอกสารถูกการ์ด import อยู่ ⇒ import กลับ = วงวนของโมดูล
import { keepUnits } from "./SurveyCardText";

/* ปุ่มพาไปจุดที่แก้ได้จริง — `target` มาจากตัวตัดสิน ไม่ได้คิดที่นี่ (กฎ "ไปไหนถึงจะ
   แก้ข้อนี้ได้" มีชุดเดียว อยู่ใน `surveyControl.js`) · การ์ดแค่แปลงเป็นปุ่ม */
export default function JumpButton({ target, onOpenZone, onGoTab, onReload, onSwitchMethod, className }) {
  if (!target) return null;
  const go = () => {
    if (target.kind === "zone") onOpenZone?.(target.zoneId);
    else if (target.kind === "tab") onGoTab?.(target.tab);
    /* `method` = ทางออกของเหตุ "ใบยังมีพื้นที่ลงหน้างานแต่ไม่มีนัดที่เข้าพื้นที่" / "ใบจากแบบที่ยังมีนัดเปิดค้าง" (ตาราง §2 แถว 17 · 17a)
       — ตัวจัดการตัวเดียวกับปุ่ม "เปลี่ยนวิธีประเมิน" ของการ์ด (หน้าเปิดโมดัล หรือบอกเหตุตอนกด) · 🐞 เดิมไม่มีสาขานี้ = ปุ่มกดแล้วเงียบ */
    else if (target.kind === "method") onSwitchMethod?.();
    /* `reload` = อ่านใบใหม่ (ทะเบียนขนาดแพ็คเกจมากับ GET ใบประเมิน) — ทางออกเดียวของเหตุ "อ่านทะเบียนไม่สำเร็จ" ·
       ส่วนเอกสารส่งตัวจัดการ "ตรวจอีกครั้ง" ที่บอกผลของการกดมาแทน */
    else if (target.kind === "reload") onReload?.();
  };
  return (
    <button type="button" className={`text-action ${className || ""}`.trim()} onClick={go}>
      {/* ป้ายของปุ่มพาไปเป็นชิ้นเดียว (S2b แก้หลังตรวจจอ head-r3-12) — "เปิด ห้องประชุมชั้น 3" ไม่ขาดเป็น "เปิด ห้อง" / "ประชุมชั้น 3"
          ในบรรทัดเหตุที่แคบ: ทั้งปุ่มขึ้นบรรทัดใหม่แทน · ป้ายที่ยาวเกินเพดานของชิ้น (`surveyControlCardUnits.js`) ตัดได้ตามปกติ */}
      {keepUnits(target.label, [target.label])}
    </button>
  );
}
