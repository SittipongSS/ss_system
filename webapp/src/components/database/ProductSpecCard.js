"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { DetailCard } from "@/components/ui/DetailPage";
import { TableScroll } from "@/components/ui/Table";
import EmptyState from "@/components/ui/EmptyState";
import { apiJson } from "@/lib/apiFetch";
import { fmtDate, naText } from "@/lib/format";
import { productSpecPageHref } from "@/lib/sales/productSpecDocView";
import { specControlDescription, specDocumentRows } from "@/lib/sales/productSpecView";
import styles from "./ProductSpecCard.module.css";

/**
 * การ์ด "สเปคสินค้า FM-SA-04" บนหน้าสินค้า — **อ่านอย่างเดียว**
 *
 * ⭐ มติ 21/09/2569 (docs/fm-sa-04-document-model.md): สเปคเป็นข้อมูลของสินค้า (ไม่มีเลข ไม่มี Rev)
 * ส่วนเลขที่ · Rev · การอนุมัติ อยู่ที่ **เอกสารที่ออกจากบรรทัด SO** ⇒ การ์ดนี้บอกสองอย่าง:
 * สินค้านี้มีสเปคหรือยัง และมีเอกสารใบไหนออกจากสเปคนี้ไปแล้วบ้าง
 *
 * ⚠️ ทุก role ที่เปิดหน้าสินค้าได้เห็นการ์ดนี้ (RD/PD/QC ต้องอ่านสเปคที่ตกลงกับลูกค้าได้) ·
 *    การแก้อยู่ที่หน้าสเปค · ป้ายปุ่มเดินตาม `permissions.canEdit` ที่ API ส่งมา ไม่ใช่สิทธิ์แก้สินค้า
 *    (สเปคเป็นของฝ่ายขาย — คนแก้ทะเบียนสินค้าได้ไม่ได้แปลว่าแก้สเปคได้)
 * ⚠️ **ไม่ใช่ `AttachmentsPanel`** — การ์ด "เอกสารของสินค้า" ข้างล่างเป็นไฟล์ที่คนอัปโหลดและมีด่าน
 *    นับ "ยังขาดเอกสาร" ของตัวเอง · เอาเอกสารที่ระบบออกไปปนทำให้ด่านนั้นนับผิด
 *
 * คืน `null` เมื่อสินค้าอยู่นอกขอบเขต (หมวด 03/04) — สองหมวดนั้นไม่ใช่ตัวสินค้าจึงไม่มีสเปคให้ตกลง
 * (ไม่ใช่ด่านสิทธิ์ — เป็น "ไม่มีของให้แสดง")
 *
 * @param canEdit ⚠️ คงไว้ให้ผู้เรียกเดิม — ใช้เป็นค่าสำรองเฉพาะตอน API ไม่ได้ส่ง `permissions` มา
 */
export default function ProductSpecCard({ productId, canEdit = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const next = await apiJson(`/api/products/${productId}/spec`, { fallbackError: "อ่านสเปคสินค้าไม่สำเร็จ" });
        if (alive) setData(next);
      } catch (loadError) {
        if (alive) setError(loadError.message || "อ่านสเปคสินค้าไม่สำเร็จ");
      }
    })();
    return () => { alive = false; };
  }, [productId]);

  if (!data && !error) return null;
  if (data?.scopeReason) return null;

  const spec = data?.spec || null;
  const rows = specDocumentRows(data?.documents);
  const mayEdit = data?.permissions ? Boolean(data.permissions.canEdit) : canEdit;
  const href = productSpecPageHref(productId);

  return (
    <DetailCard
      icon={ClipboardCheck}
      eyebrow="FM-SA-04"
      title="สเปคสินค้า"
      meta={spec ? specControlDescription({ spec, documents: data?.documents }) : "หนึ่งสินค้าหนึ่งสเปค — ออกเอกสารจากสเปคนี้ได้ทุกใบสั่งขาย"}
      actions={<Button as={Link} href={href} variant="ghost" size="sm" icon={<ExternalLink size={13} />}>
        {spec ? (mayEdit ? "เปิด / แก้สเปค" : "เปิดสเปค") : mayEdit ? "สร้างสเปค" : "เปิดดู"}
      </Button>}
    >
      {error ? <div className={styles.notice}><StatusNotice tone="error">{error}</StatusNotice></div> : null}
      {!data ? null : !spec ? (
        <EmptyState plain>
          <strong>สินค้าชิ้นนี้ยังไม่มีสเปค</strong>
          <small>กรอกครั้งเดียว ใช้ออกเอกสาร FM-SA-04 ได้ทุกใบสั่งขายที่อนุมัติแล้ว</small>
        </EmptyState>
      ) : rows.length ? (
        <TableScroll family="list" surface="embedded">
          <table>
            <thead>
              <tr>
                <th className={styles.colDoc}>เลขที่เอกสาร</th>
                <th className={styles.colRev}>Rev.</th>
                <th className={styles.colStatus}>สถานะ</th>
                <th className={styles.colOrder}>ใบสั่งขาย</th>
                <th className={`num ${styles.colDate}`}>วันที่ออก</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="mono"><Link href={row.href}>{naText(row.docNo)}</Link></td>
                  <td>
                    <div>{naText(row.revLabel)}</div>
                    {row.inUseRevLabel ? <div className={styles.sub}>ใช้อยู่ {row.inUseRevLabel}</div> : null}
                  </td>
                  <td><StatusBadge size="sm" tone={row.tone} label={naText(row.statusLabel)} /></td>
                  <td className="mono">
                    {row.orderHref ? <Link href={row.orderHref}>{naText(row.orderNumber)}</Link> : naText(row.orderNumber)}
                  </td>
                  <td className="num">{row.createdAt ? fmtDate(row.createdAt) : naText(null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : (
        <EmptyState plain>
          <strong>มีสเปคแล้ว แต่ยังไม่เคยออกเอกสาร</strong>
          <small>AC ออกเอกสารได้ที่หน้าใบสั่งขายหลังใบอนุมัติแล้ว — หนึ่งบรรทัดสินค้าหนึ่งใบ</small>
        </EmptyState>
      )}
    </DetailCard>
  );
}
