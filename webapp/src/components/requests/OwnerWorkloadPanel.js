"use client";
// ── "งานอยู่ที่ใคร" — ตารางคนของฝ่าย (มติผู้ใช้ 2026-08-12 · แบบ ก) ────────
//
// ⭐ ก่อนหน้านี้ทั้งหน้าภาพรวมไม่มีชื่อคนสักที่ ทั้งที่ `acknowledgedByName` มากับ
// แถวอยู่แล้ว ⇒ หัวหน้าต้องเปิดคิวแล้วกวาดตาทีละแถวเพื่อรู้ว่าใครถือกี่ใบ
//
// ⚠️ **กด = เปิดคิวที่กรองคนนั้นไว้แล้ว** ไม่ใช่แค่บอกตัวเลข — ตัวกรอง "ผู้รับเรื่อง"
// มีอยู่ในคิวแล้ว (`queueList.js` · แบบ จ) หน้านี้แค่ส่ง `?owner=` ไปให้
// ⚠️ ตัวเลข "กลิ่น" มาจาก `requestLineCount` ตัวเดียวกับสายพาน — สองก้อนบนหน้า
// เดียวกันนับคนละแบบเมื่อไร ไม่มีใครรู้ว่าอันไหนถูก
// ⚠️ **"ใครถือ" = ผู้รับผิดชอบที่มอบหมายไว้ (mig 0230) แล้วถอยไปคนที่กดรับเรื่อง** —
// กฎอยู่ที่ `requestAssignee` ที่เดียว (lib/requests/assign.js)
import Link from "next/link";
import { TableScroll } from "@/components/ui/Table";
import { Users } from "lucide-react";
import { WorkspaceSection } from "@/components/ui/Workspace";
import EmptyState from "@/components/ui/EmptyState";
import { UNASSIGNED } from "@/lib/requests/deptOverview";
import styles from "./requestForm.module.css";
import { NA } from "@/lib/format";

export default function OwnerWorkloadPanel({
  rows = [],
  // ลิงก์ปลายทางของแต่ละแถว — ผู้เรียกเป็นคนรู้ว่าคิวของฝ่ายตัวเองอยู่ที่ไหน
  queueHref = "/rd/requests",
  title = "งานค้างรายคน",
  subtitle = "ผู้รับผิดชอบที่มอบหมายไว้ · ใบที่ยังไม่มอบหมายใช้คนที่กดรับเรื่องแทน — กดชื่อเพื่อเปิดคิวของคนนั้น",
}) {
  return (
    <WorkspaceSection
      icon={<Users size={17} />}
      title={title}
      subtitle={subtitle}
      actions={<span className="ui-badge">{rows.length} คน</span>}
    >
      {rows.length === 0 ? (
        <EmptyState icon={Users}>ไม่มีงานค้างของฝ่ายตอนนี้</EmptyState>
      ) : (
        /* ⚠️ **ไม่ใส่ `.premium-table`** — `TableScroll` มีสไตล์หัวตาราง/เส้นคั่น/
           padding ครบแล้ว (Table.module.css ยกค่ามาจากคลาสเก่าไว้ที่ `[data-family]`)
           · คลาสเก่าถูก ratchet ของ `audit:ui` นับอยู่ ตารางใหม่จึงต้องไม่พกมันมาอีก */
        <TableScroll>
          <table className="w-full">
          <thead>
            <tr>
              <th>ผู้รับผิดชอบ</th>
              {/* ⚠️ หัวชิดขวาตามเนื้อข้างล่าง (กฎ 4 · UI_DESIGN_SYSTEM.md) */}
              <th className="num">ใบ</th>
              <th className="num">กลิ่น</th>
              <th className="num">เลยกำหนด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={styles.rowLink}>
                <td>
                  {/* ⚠️ ลิงก์จริง ไม่ใช่ onClick บน <tr> — แถวนี้มีปลายทางเดียวและ
                      ต้องเปิดแท็บใหม่ได้ (ต่างจากแถวคิวที่ทั้งแถวคือใบเดียว) */}
                  <Link
                    className="linklike"
                    href={`${queueHref}?tab=todo&owner=${encodeURIComponent(row.key)}`}
                  >
                    {row.name}
                  </Link>
                  {/* กองที่ยังไม่มีใครรับ — บอกว่ารอมานานแค่ไหนแล้ว เพราะมันคือกอง
                      ที่ต้องแจกก่อนอย่างอื่น ไม่ใช่ "คนที่ถือน้อยที่สุด" */}
                  {row.unassigned && row.waitingDays > 0 && (
                    <div className={`${styles.subText} ${styles.overdue}`}>
                      รอแจกมา {row.waitingDays} วัน
                    </div>
                  )}
                </td>
                <td className="num">{row.requests}</td>
                {/* ใบที่ไม่มีบรรทัด (สอบถาม/ขอเอกสาร) รวมกันได้ 0 กลิ่น — ขีดอ่านง่ายกว่าเลขศูนย์ */}
                <td className="num">{row.lines || <span className={styles.muted}>{NA}</span>}</td>
                <td className="num">
                  {row.overdue
                    ? <span className={`ui-badge ${styles.overdue}`}>{row.overdue}</span>
                    : <span className={styles.muted}>{NA}</span>}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </TableScroll>
      )}
    </WorkspaceSection>
  );
}
