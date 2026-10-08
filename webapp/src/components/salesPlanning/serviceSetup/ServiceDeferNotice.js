"use client";
// ── ประกาศบนใบรออนุมัติที่ "ยื่นโดยยังไม่ตั้งงานบริการ" (mig 0404 · มติเจ้าของ 01/10 → ทาง "ฝ่ายขายกดข้ามเอง") ─────────────────
//
// ⭐ ทุกคนที่เปิดใบเห็น (ผู้ยื่น · ผู้อนุมัติ · ผู้อ่าน) — ผู้อนุมัติต้องรู้ตั้งแต่บนสุดของใบว่าใบนี้ข้ามการตั้งงานบริการ:
//   อนุมัติ = นับ Actual ตามปกติ แต่ **ยังไม่ส่งงานให้ TS** จนกว่าฝ่ายขายจะตั้งงานบริการและผู้จัดการฝ่ายขายอนุมัติ
// ⭐ หน้าเมานต์เฉพาะ `view.deferred.stage === 'pending'` (ก้อน GET ของ `…/service-setup`) · หลังอนุมัติเป็นหน้าที่ของแบนเนอร์/การ์ดราง
//   เส้นตั้งย้อนหลังตัวเดิม (`backfillCopyOfView`)
// ⭐ สี่แบบ (ยังข้ามอยู่ไหม × มีข้อที่หยุดการอนุมัติไหม) เลือกโดย `deferNoticeOfView` ของ serviceSetupDraft.js — ที่นี่วาดอย่างเดียว
//   · คำทุกคำมาจาก `SERVICE_DEFERRED_TEXT` ของ serviceSetup.js (ห้ามพิมพ์เอง)
// 🔴 ไม่มีแบบไหนเป็นสีแดง — ยังไม่มีใครกดอะไร (กฎ 3) · เหตุที่อนุมัติไม่ได้ขึ้นเป็นแดงในโมดัลอนุมัติเมื่อกด
import thaiText from "@/components/ThaiText";
import StatusNotice from "@/components/ui/StatusNotice";
import Tag from "@/components/ui/Tag";
import { deferNoticeOfView } from "./serviceSetupDraft";
import styles from "./ServiceBackfillPanel.module.css";

/** @param view ก้อน GET ของงานบริการ (`setup.data`) — ไม่มีตราการข้าม / ไม่ใช่ขั้นรออนุมัติ = ไม่วาด */
export default function ServiceDeferNotice({ view }) {
  const notice = deferNoticeOfView(view);
  if (!notice) return null;
  return (
    <StatusNotice
      tone={notice.tone}
      title={notice.title}
      action={notice.tag ? <Tag tone="warning">{notice.tag}</Tag> : null}
    >
      {/* บรรทัดยาว — ผ่าน thaiText ให้คำทับศัพท์ไม่ถูกตัดกลางคำตอนขึ้นบรรทัดใหม่บนจอแคบ (StatusNotice ทำให้เฉพาะ children ที่เป็นสตริงล้วน) */}
      {notice.lines.map((line) => <span key={line} className={styles.bannerLine}>{thaiText(line)}</span>)}
    </StatusNotice>
  );
}
