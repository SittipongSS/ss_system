"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import EmptyState from "@/components/ui/EmptyState";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate, naText } from "@/lib/format";
import { SPEC_ISSUE_STATUS_LABELS, SPEC_REVISION_STATUS_LABELS } from "@/lib/sales/productSpecWorkflow";
import { revLabel } from "@/lib/sales/productSpecView";
import styles from "./ProductSpecCard.module.css";

/**
 * การ์ด "ใบสเปคสินค้า" บนหน้าสินค้า — **บ้านของใบ** (มติผู้ใช้ 2026-09-17)
 *
 * ⚠️ **อ่านอย่างเดียว** ทุก role ที่เปิดหน้าสินค้าได้เห็นการ์ดนี้ (RD/PD/QC ต้องอ่าน
 * สเปกที่ตกลงกับลูกค้าได้โดยไม่ต้องไปงัดหน้าใบสั่งขาย) · การแก้อยู่ที่หน้าใบ
 *
 * ⚠️ **ไม่ใช่ `AttachmentsPanel`** — การ์ด "เอกสารของสินค้า" ข้างล่างเป็นไฟล์ที่คน
 * อัปโหลดและมีด่านนับ "ยังขาดเอกสาร" ของตัวเอง · เอาเอกสารที่ระบบออกไปปนทำให้ด่านนั้นนับผิด
 *
 * ⚠️ **แถวในตารางคือครั้งที่ออกเอกสาร ไม่ใช่ใบคนละใบ** — Rev.02 ออกซ้ำได้หลายครั้ง
 * ถ้าขายรอบใหม่โดยสเปกไม่เปลี่ยน ⇒ คอลัมน์ "สเปก" บอก Rev. ณ ตอนออก ไม่ใช่ Rev. วันนี้
 *
 * คืน `null` เมื่อสินค้าอยู่นอกขอบเขต (หมวด 03/04) — ไม่ใช่การ์ดว่างที่อ่านไม่ได้ว่าทำไม
 * เพราะสองหมวดนั้นไม่ใช่ตัวสินค้าจึงไม่มีสเปกให้ตกลงเลย
 */
export default function ProductSpecCard({ productId, canEdit = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const next = await apiJson(`/api/products/${productId}/spec`, { fallbackError: "อ่านใบสเปคไม่สำเร็จ" });
        if (alive) setData(next);
      } catch (loadError) {
        if (alive) setError(loadError.message || "อ่านใบสเปคไม่สำเร็จ");
      }
    })();
    return () => { alive = false; };
  }, [productId]);

  if (!data && !error) return null;
  if (data?.scopeReason) return null;

  const spec = data?.spec || null;
  const revisions = data?.revisions || [];
  const latest = revisions[0] || null;
  const issues = data?.issues || [];
  const href = `/database/products/${productId}/spec`;

  return (
    <DetailCard
      icon={ClipboardCheck}
      eyebrow="FM-SA-04"
      title={latest ? `ใบสเปคสินค้า · ${revLabel(spec?.currentRevNo || latest.revNo)}` : "ใบสเปคสินค้า"}
      meta={spec
        ? `ออกเอกสารมาแล้ว ${issues.length} ครั้ง · ฉบับล่าสุด ${revLabel(latest?.revNo)} (${naText(SPEC_REVISION_STATUS_LABELS[latest?.status])})`
        : "หนึ่งสินค้าหนึ่งใบตลอดอายุ — ออกเอกสารจากใบนี้ทุกครั้งที่ขาย"}
      actions={<Button as={Link} href={href} variant="ghost" size="sm" icon={<ExternalLink size={13} />}>
        {spec ? "เปิดใบสเปค" : canEdit ? "สร้างใบสเปค" : "เปิดดู"}
      </Button>}
    >
      {error ? <p className={styles.error}>{error}</p> : null}
      {!spec ? (
        <EmptyState plain>
          <strong>สินค้าชิ้นนี้ยังไม่มีใบสเปค</strong>
          <small>กรอกครั้งเดียวแล้วออกเอกสารซ้ำได้ทุกรอบขาย — สเปกเปลี่ยนเมื่อไรค่อยออกฉบับใหม่</small>
        </EmptyState>
      ) : issues.length ? (
        <TableScroll family="list" surface="embedded">
          <table>
            <thead>
              <tr>
                <th className={styles.colDoc}>เลขที่เอกสาร</th>
                <th className={styles.colRev}>สเปก</th>
                <th className={styles.colOrder}>ออกตาม</th>
                <th className={styles.colStatus}>สถานะ</th>
                <th className={`num ${styles.colQty}`}>จำนวน</th>
                <th className={`num ${styles.colDue}`}>กำหนดส่ง</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td className="mono">{issue.docNo}</td>
                  <td>{revLabel(issue.revNo)}</td>
                  <td className="mono">{naText(issue.orderNumber)}</td>
                  <td>{SPEC_ISSUE_STATUS_LABELS[issue.status] || issue.status}</td>
                  <td className="num">{naText(issue.qty)}</td>
                  <td className="num">{issue.deliveryDueDate ? fmtDate(issue.deliveryDueDate) : naText(null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <EmptyState plain>
          <strong>มีใบสเปคแล้ว แต่ยังไม่เคยออกเอกสาร</strong>
          <small>เอกสารออกจากหน้าใบสั่งขายที่อนุมัติแล้ว — แถวที่นี่คือครั้งที่ออก ไม่ใช่ใบคนละใบ</small>
        </EmptyState>
      )}
    </DetailCard>
  );
}
