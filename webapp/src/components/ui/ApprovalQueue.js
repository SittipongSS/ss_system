"use client";
import { Clock } from "lucide-react";
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
     onOpen       — (rec) => void     กดที่แถวเพื่อเปิดรายละเอียด (ไม่บังคับ)
     title        — คำบนหัวกล่อง (ไม่บังคับ) */
export default function ApprovalQueue({ items, onDecide, renderAction, primary, secondary, onOpen, title = "ต้องทำตอนนี้ — รออนุมัติจากคุณ" }) {
  if (!items.length) return null;
  return (
    <section className={styles.queue}>
      <div className={styles.head}>
        <Clock size={16} aria-hidden="true" />
        <span>{title} ({items.length})</span>
      </div>
      <div className={styles.list}>
        {items.map((rec) => (
          <div
            key={rec.id}
            onClick={onOpen ? () => onOpen(rec) : undefined}
            className={`${styles.row} ${onOpen ? "clickable-row cursor-pointer" : ""}`.trim()}
          >
            <div className={styles.rowText}>
              <span className="code">{primary(rec)}</span>{" "}
              <span className="name">{secondary(rec)}</span>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              {renderAction ? renderAction(rec) : <ApprovalActions onDecide={(status) => onDecide(rec, status)} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
