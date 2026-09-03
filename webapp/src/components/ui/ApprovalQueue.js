"use client";
import { useState } from "react";
import Link from "next/link";
import { Clock } from "lucide-react";
import Button from "@/components/ui/Button";
import { ApprovalActions } from "@/components/ApprovalStatus";
import styles from "./ApprovalQueue.module.css";

/* คิว "ต้องทำตอนนี้" — ของที่รอ **คนที่กำลังดูอยู่** อนุมัติ คาดไว้เหนือตารางของทะเบียนนั้น
   ว่างเมื่อไรก็หายไปทั้งกล่อง (ไม่รกให้คนที่ไม่ใช่ผู้อนุมัติ)

   ⭐ ใช้ร่วมทั้งทะเบียนข้อมูลหลัก (ลูกค้า/สินค้า) และทะเบียนเอกสารขาย (ใบเสนอราคา/
   ใบสั่งขาย) — ทรงเดียวกันทั้งระบบ ต่างกันแค่ "ปุ่มท้ายแถวทำอะไร":

     `onDecide` — ตัดสินในที่เลย (ระเบียนสั้นที่อ่านจบในบรรทัดเดียว: ลูกค้า สินค้า)
     `renderAction` — ปุ่มของผู้เรียกเอง เช่นลิงก์ "เปิดใบ"
       ⚠️ เอกสารขายใช้ทางนี้โดยตั้งใจ: การอนุมัติ QT/SO **ตรึงลายเซ็นผู้อนุมัติกับ
       fingerprint ของเนื้อใบ** ⇒ ต้องเห็นรายการ/ราคาก่อนกด และโมดัลยืนยันต้องบอก
       ผลลัพธ์ (ยอด Actual · งวดชำระ) ตามกติกา approvalPrompt — ติ๊กจบในลิสต์ไม่ได้

   Props:
     items        — ของที่รออนุมัติจากผู้ใช้คนนี้ (ผู้เรียกกรองมาแล้ว)
     onDecide     — (rec, "approved"|"rejected") => void  ⚠️ ส่ง **ทั้งระเบียน** ไม่ใช่ id
                    เพราะโมดัลยืนยันต้องเอ่ยชื่อของที่กำลังอนุมัติ (ดู lib/approvalPrompt.js)
     renderAction — (rec) => ReactNode  ใช้แทน onDecide เมื่อการตัดสินต้องไปทำที่หน้าเอกสาร
     primary      — (rec) => string   บรรทัดหลัก (เช่น arCode / เลขที่เอกสาร)
     secondary    — (rec) => string   บรรทัดรอง (ชื่อ · ทีม)
     rowHref      — (rec) => string   URL ของระเบียนนั้น ⚠️ **บังคับ** (ดูบล็อกข้างล่าง)
     title        — คำบนหัวกล่อง (ไม่บังคับ) */

/* ── ทางเข้าเป็น <Link> ในแถว ไม่ใช่ `onClick` บนแถว (2026-09-02) ────────────────
   เดิมแถวเป็น `<div onClick>` ที่เรียก `onOpen(rec)` ⇒ เมาส์กดได้ แต่ **คีย์บอร์ดเข้าไม่ถึง**
   (WCAG 2.1.1) และไม่ได้คลิกกลาง/เปิดแท็บใหม่/เมนูคลิกขวา/สถานะเยี่ยมชม

   🚫 **ห่อทั้งแถวด้วย <Link>/<button> ไม่ได้** — ทุกแถวมี control ของตัวเองอยู่ท้ายแถว
   เสมอทุกโหมด (`renderAction` เป็นปุ่ม "เปิดใบ" · `ApprovalActions` เป็นปุ่มอนุมัติ/
   ไม่อนุมัติ) และ `<a>` ห้ามมี interactive descendant ⇒ ทางเข้าต้องไปอยู่ที่ **บล็อก
   ข้อความ** แทน ซึ่งเป็นท่าเดียวกับ `<Link>` ในเซลล์ของ `ui/DetailRow.js`

   🪤 **ต้องถอด `onClick` ของแถวทิ้งจริง ๆ ห้ามเก็บไว้เป็น "ทางลัดของเมาส์"** — ทาง
   ยกเว้นของด่านคีย์บอร์ดผูกตายกับไฟล์ primitive (`ROW_PRIMITIVE` / `CARD_PRIMITIVE`
   ใน scripts/audit-ui.mjs) และล็อกไว้ **แบบละ 1 จุดพอดี** ⇒ เก็บ onClick ไว้ที่นี่
   = ยังนับเป็นความผิดเหมือนเดิม เลขไม่ขยับสักตัว
   เสียพื้นที่กดของเมาส์น้อยมาก: `.rowText` เป็น `flex: 1` และ `.linklike-block` เป็น
   `display: block` ⇒ ลิงก์กินเต็มความกว้างของบล็อกข้อความอยู่แล้ว

   🪤 `<strong className="code">` ต้องเป็นลูก **ตรง** ของลิงก์และเป็นบรรทัดแรก —
   `.linklike-block` ถอดเส้นใต้ออกจากตัวลิงก์แล้วขีดเฉพาะ `> strong` ไม่งั้นได้
   "ลิงก์ที่ดูเหมือนข้อความธรรมดา" · น้ำหนักตัวอักษรของ `<strong>` ถูกกดกลับเป็น
   `inherit` ที่ `.rowText .code` ⇒ หน้าตาไม่ขยับจากของเดิมที่เป็น `<span>`

   ⚠️ `rowHref` เป็น prop **บังคับ** ด้วยเหตุผลเดียวกับ `href` ของ `DetailRow`:
   คิวนี้มีงานเดียวคือ "พาไปเปิดของที่รออยู่" · แถวที่ไม่พาไปไหนไม่ใช่งานของคิวนี้ */
const QUEUE_PREVIEW = 3;

export default function ApprovalQueue({
  items, onDecide, renderAction, primary, secondary, rowHref,
  title = "ต้องทำตอนนี้ — รออนุมัติจากคุณ", unit = "รายการ",
}) {
  const [open, setOpen] = useState(false);
  // ⚠️ hook ต้องมาก่อน early return เสมอ — คิวว่างแล้วค่อยคืน null
  if (!items.length) return null;
  const shown = open ? items : items.slice(0, QUEUE_PREVIEW);
  return (
    <section className={styles.queue}>
      <div className={styles.head}>
        <Clock size={16} aria-hidden="true" />
        <span>{title} ({items.length})</span>
      </div>
      <div className={styles.list}>
        {shown.map((rec) => (
          <div key={rec.id} className={styles.row}>
            <div className={styles.rowText}>
              {/* prefetch={false}: คิวกางได้ยาว (ฝ่ายบัญชีเคยเจอ 43 ใบ) — กัน RSC prefetch ต่อแถว */}
              <Link prefetch={false} href={rowHref(rec)} className="linklike linklike-block">
                <strong className="code">{primary(rec)}</strong>{" "}
                <span className="name">{secondary(rec)}</span>
              </Link>
            </div>
            {/* ไม่มีตัวห่อ stopPropagation แล้ว — แถวไม่มี onClick ให้ต้องกันคลิกทะลุอีก
                (`ApprovalActions` มีตัวกันของตัวเองอยู่แล้วเผื่อผู้เรียกที่ยังมีแถวกดได้) */}
            {renderAction ? renderAction(rec) : <ApprovalActions onDecide={(status) => onDecide(rec, status)} />}
          </div>
        ))}
        {items.length > QUEUE_PREVIEW && (
          <div className={styles.more}>
            <Button size="sm" variant="quiet" onClick={() => setOpen((v) => !v)}>
              {open ? "ย่อคิว" : `ดูอีก ${items.length - QUEUE_PREVIEW} ${unit}`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
