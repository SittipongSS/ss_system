"use client";
// ── รายละเอียดงานแบบกางในที่ (หน้ารายการงาน) ──────────────────────────────
//
// กติกา: **อ่านให้ครบตรงนี้ · จะแก้ค่อยกดไปต้นทาง**
// หน้ารายการมีหน้าที่ให้ตรวจสอบ — เดิมเห็นแค่ชื่องานกับโน้ตย่อ 2 บรรทัด อยากรู้ว่า
// ใครสั่ง เริ่มเมื่อไหร่ ทำไมเสร็จช้า ต้องเปิดหน้ารายละเอียดทีละใบ กลับมาแล้วตัวกรอง
// กับหน้าที่ค้างอยู่ก็หายไปด้วย
//
// ⚠️ ทุกค่าที่แสดงมาจากแถวที่หน้ารายการโหลดมาแล้ว (`select('*')`) — ห้ามยิง API
// เพิ่มตอนกาง ไม่งั้นกาง 20 แถวก็ยิง 20 ครั้ง
// ⚠️ ที่นี่ **อ่านอย่างเดียว** ปุ่มแก้ไขอยู่ที่แถว/ที่หน้างานตามเดิม
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import Button from "@/components/ui/Button";
import { DIFFICULTY_LABELS } from "@/lib/pm/tasks";
import { fmtDateNumeric as fmtDate } from "@/lib/format";
import styles from "./TaskDetailPanel.module.css";

const DASH = "—";

function Field({ label, children, className = "" }) {
  return (
    <div className={`${styles.field} ${className}`}>
      <span className={styles.label}>{label}</span>
      <p className={styles.value}>{children}</p>
    </div>
  );
}

function Value({ text }) {
  if (text) return text;
  return <span className={styles.muted}>{DASH}</span>;
}

/* โน้ตย่อบรรทัดเดียวสำหรับการ์ดใบเล็ก (บอร์ด/เมทริกซ์) — การ์ดพวกนั้นแคบเกินกว่าจะ
   กางแผงเต็มได้ แต่ "ชื่องานอย่างเดียว" ก็ไม่พอจะรู้ว่าใบไหนคือใบที่กำลังตามอยู่ */
export function TaskNoteLine({ text }) {
  if (!text) return null;
  return <div className={styles.miniNote}>{text}</div>;
}

/**
 * @param task    แถวงานจาก personal_tasks (ต้องมาจากรายการที่โหลดแล้ว)
 * @param nameOf  (id) => ชื่อคน — หน้ารายการมี usersMap อยู่แล้ว
 * @param links   ต้นทางที่กดไปแก้ได้ [{ label, href }] — ดีล/โครงการ/คำร้อง
 * @param href    หน้ารายละเอียดของงานใบนี้
 */
export default function TaskDetailPanel({ task, nameOf = () => "", links = [], href }) {
  if (!task) return null;
  const flags = [task.urgent && "ด่วน", task.important && "สำคัญ"].filter(Boolean).join(" · ");
  // ผู้สั่ง: งานที่กรอกเองไม่มี assignedBy — บอกตรง ๆ ว่า "สร้างเอง" ดีกว่าขีดกลาง
  const assigner = task.assignedBy
    ? nameOf(task.assignedBy)
    : (task.ownerId && task.ownerId === task.assigneeId ? "สร้างเอง" : nameOf(task.ownerId));

  return (
    <div className={styles.panel}>
      {task.note
        ? <div className={styles.note}>{task.note}</div>
        : <div className={styles.noteEmpty}>ไม่มีรายละเอียดเพิ่มเติม</div>}

      <div className={styles.grid}>
        <Field label="เริ่ม"><Value text={task.startDate ? fmtDate(task.startDate) : null} /></Field>
        <Field label="กำหนดเสร็จ"><Value text={task.dueDate ? fmtDate(task.dueDate) : null} /></Field>
        <Field label="เสร็จเมื่อ"><Value text={task.completedAt ? fmtDate(task.completedAt) : null} /></Field>
        <Field label="ผู้สั่งงาน"><Value text={assigner} /></Field>
        <Field label="ผู้รับผิดชอบ"><Value text={nameOf(task.assigneeId || task.ownerId)} /></Field>
        {task.proxyBy && <Field label="ทำแทนโดย"><Value text={nameOf(task.proxyBy)} /></Field>}
        <Field label="หมวด"><Value text={task.category} /></Field>
        <Field label="ความยาก"><Value text={DIFFICULTY_LABELS[task.difficulty] || DIFFICULTY_LABELS[2]} /></Field>
        <Field label="ป้ายกำกับ"><Value text={flags} /></Field>
        {/* เหตุผลที่เสร็จช้าคือสิ่งที่คนตรวจงานมองหาก่อนเพื่อน — เดิมเห็นได้ที่หน้า
            รายละเอียดเท่านั้น ทั้งที่เป็นข้อมูลชิ้นเดียวที่อธิบายว่างานสะดุดตรงไหน */}
        {task.lateReason && (
          <Field label="สาเหตุที่เสร็จช้า" className={styles.late}>{task.lateReason}</Field>
        )}
      </div>

      <div className={styles.links}>
        {links.filter((link) => link?.href).map((link) => (
          <Button key={link.href} as={Link} href={link.href} variant="quiet" size="sm">{link.label}</Button>
        ))}
        <span className={styles.spacer} />
        {href && (
          <Button as={Link} href={href} variant="quiet" size="sm">
            <ExternalLink size={13} aria-hidden="true" /> เปิดหน้างาน
          </Button>
        )}
      </div>
    </div>
  );
}
