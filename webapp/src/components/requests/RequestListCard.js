"use client";
// การ์ด "คำร้องที่ผูกกับรายการนี้" — ใช้บนหน้าดีลและหน้าโครงการ
// แทน InquiryListCard เดิมที่ปลดระวางพร้อมระบบสอบถาม (mig 0174)
//
// ⚠️ ไม่มีปุ่ม "เปิดคำร้อง" ที่นี่โดยตั้งใจ: ฟอร์มเปิดคำร้องต้องรู้ชนิด/ทะเบียน
// (กลิ่น/สูตร/วัสดุ/ดีล) ครบก่อน ซึ่งหน้า /sa/requests โหลดไว้ให้แล้ว — การ์ดนี้
// จึงเป็น "ทางเข้า" ไม่ใช่ที่สร้าง (ของเดิมมีโมดัลสร้างซ้อนอยู่บนหน้าดีล)
import Link from "next/link";
import { ClipboardList, ExternalLink } from "lucide-react";
import { TableScroll } from "@/components/ui/Table";
import { RequestStatusBadge } from "@/components/requests/requestUi";
import { requestKindLabel } from "@/lib/master/requestTypes";
import { fmtDate } from "@/lib/format";
import styles from "./requestForm.module.css";

export default function RequestListCard({
  requests = [], title = "คำร้องข้ามฝ่าย", openHref = "/sa/requests",
}) {
  return (
    <section className={`glass-panel ${styles.listCard}`}>
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={17} aria-hidden="true" />
        <h2 className={styles.listTitle}>{title}</h2>
        <span className="ui-badge">{requests.length} เรื่อง</span>
        <div className="spacer" />
        <Link className="btn sm" href={openHref}>
          <ExternalLink size={13} aria-hidden="true" /> เปิดหน้าคำร้อง
        </Link>
      </div>
      {requests.length ? (
        <div className="premium-glass-table table-responsive">
          <TableScroll surface="embedded">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>เลขที่ / เรื่อง</th><th>ชนิด</th><th>ถึงฝ่าย</th>
                  <th>ผู้รับเรื่อง</th><th>รับปากว่าจะตอบ</th><th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="premium-row">
                    <td>
                      <Link className={`linklike ${styles.listLink}`} href={`/sa/requests/${r.id}`}>
                        {r.docNo || "ร่าง"}
                        {r.title ? ` · ${r.title}` : ""}
                      </Link>
                    </td>
                    <td className={styles.kindCell}>{requestKindLabel(r.kind)}</td>
                    <td className={styles.smallCell}>{r.dept}</td>
                    <td>{r.acknowledgedByName || <span className={styles.muted}>ยังไม่มีผู้รับ</span>}</td>
                    <td>{r.committedDueDate ? fmtDate(r.committedDueDate) : "-"}</td>
                    <td><RequestStatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      ) : (
        <div className={styles.listEmpty}>ยังไม่มีคำร้องที่ผูกกับรายการนี้</div>
      )}
    </section>
  );
}
