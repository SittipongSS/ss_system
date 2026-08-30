"use client";
// ── ใบสั่งขายที่เกี่ยวข้องกับงานของฝ่าย R&D (มติผู้ใช้ 2026-08-29) ───────────
//
// ⭐ **บ้านของ RD ต้องมีของที่ RD ต้องดู** — บรีฟกลิ่นเกิดจากใบสั่งขาย ⇒ ฝ่ายต้องรู้ว่า
// ออร์เดอร์นั้นสั่ง FG อะไรไว้บ้าง · เดิมทางเดียวคือกดลิงก์จากใบคำร้องทีละใบ ซึ่งอ่าน
// ภาพรวมไม่ได้เลย · หน้านี้มาคู่กับการปิดเมนู "บริหารงานขาย" ของฝ่าย (เหมือนฝ่าย FN)
//
// ⚠️ **อ่านอย่างเดียว และไม่ใช่ทะเบียนใบสั่งขาย** — เอกสารยังเป็นของฝ่ายขาย
// (กฎสามชั้น ชั้น 2) · แถวที่นี่คือ "ใบที่คำร้องของฝ่ายเราอ้างถึง" เท่านั้น
// ⚠️ **ไม่มีราคา** — server ไม่ส่ง `unitPrice`/`lineTotal` มาให้ตั้งแต่แรก
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { TableEmpty, TableScroll } from "@/components/ui/Table";
import DetailRow from "@/components/ui/DetailRow";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtNumber, NA, naText } from "@/lib/format";
import { SALES_ORDER_STATUS_LABELS } from "@/lib/sales/salesOrderWorkflow";
import { requestKindLabel } from "@/lib/master/requestTypes";
import { apiFetch } from "@/lib/apiFetch";

export default function RdSalesOrdersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/rd/sales-orders")
      .then(async (res) => {
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(body?.error || "โหลดใบสั่งขายไม่สำเร็จ");
        setRows(Array.isArray(body) ? body : []);
      })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // จำนวนคำร้องรวม — บอกว่าหน้านี้ครอบงานของฝ่ายอยู่กี่เรื่อง ไม่ใช่แค่กี่ใบ
  const requestCount = useMemo(
    () => rows.reduce((sum, row) => sum + (row.requests?.length || 0), 0),
    [rows],
  );

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="ใบสั่งขายที่เกี่ยวข้อง"
      subtitle="ใบสั่งขายที่คำร้องของฝ่ายอ้างถึง — อ่านอย่างเดียว แก้ไขที่เอกสารต้นทาง"
      headerRight={<span className="ui-badge">{rows.length} ใบ · {requestCount} คำร้อง</span>}
      loading={loading}
    >
      {error && <StatusNotice tone="danger" title="โหลดข้อมูลไม่สำเร็จ" description={error} />}

      <TableScroll surface="embedded" cells="stacked" aria-busy={loading}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>เลขที่ใบสั่งขาย</th>
              <th>ลูกค้า</th>
              <th>วันที่สั่ง</th>
              <th>สินค้าในใบ</th>
              <th>คำร้องของฝ่าย</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <DetailRow key={row.id} href={`/sa/sales-orders/${row.id}`} className="premium-row">
                <td>
                  <Link prefetch={false} href={`/sa/sales-orders/${row.id}`} className="linklike mono">
                    <strong>{naText(row.orderNumber)}</strong>
                  </Link>
                </td>
                <td>{naText(row.customerName)}</td>
                <td>{fmtDate(row.orderDate)}</td>
                <td>
                  {/* FG ที่อยู่ในใบ — บรรทัดแรกคือของหลัก ที่เหลือย่อเป็นตัวเลข
                      เพื่อไม่ให้ใบที่มีสิบบรรทัดดันแถวสูงจนตารางอ่านไม่ได้ */}
                  {row.lines?.length ? (
                    <div>
                      <div className="mono">{naText(row.lines[0].fgCode)}</div>
                      <div className="cell-sub">
                        {naText(row.lines[0].description)}
                        {row.lines[0].qty != null
                          ? ` · ${fmtNumber(row.lines[0].qty)} ${row.lines[0].unit || ""}`.trimEnd()
                          : ""}
                        {row.lines.length > 1 ? ` · อีก ${row.lines.length - 1} รายการ` : ""}
                      </div>
                    </div>
                  ) : <span className="cell-quiet">{NA}</span>}
                </td>
                <td>
                  {/* ลิงก์กลับไปใบคำร้อง — จอเดียวกับที่ฝ่ายใช้ตอบอยู่แล้ว (ม-31) */}
                  <div className="flex flex-col gap-1">
                    {(row.requests || []).map((request) => (
                      <Link
                        key={request.id}
                        prefetch={false}
                        href={`/requests/${request.id}`}
                        className="linklike"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="mono">{naText(request.docNo)}</span>
                        <span className="cell-sub"> · {requestKindLabel(request.kind)}</span>
                      </Link>
                    ))}
                  </div>
                </td>
                <td>
                  <span className="ui-badge ui-badge-cell">
                    {SALES_ORDER_STATUS_LABELS[row.status] || naText(row.status)}
                  </span>
                </td>
              </DetailRow>
            ))}
            {!rows.length && !loading && (
              <TableEmpty
                colSpan={6}
                title="ยังไม่มีใบสั่งขายที่เกี่ยวข้อง"
                description="ใบจะขึ้นที่นี่เองเมื่อมีคำร้องของฝ่ายอ้างถึงใบสั่งขาย (เช่น บรีฟกลิ่นที่เปิดจากใบสั่งขาย)"
                icon={FileText}
              />
            )}
          </tbody>
        </table>
      </TableScroll>
    </Workspace>
  );
}
