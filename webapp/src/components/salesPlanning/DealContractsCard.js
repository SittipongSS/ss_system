"use client";
// ── การ์ด "สัญญา" บนหน้าดีล (mig 0278) ───────────────────────────────────────
//
// โหลดข้อมูลของตัวเอง (แบบเดียวกับ EntityDocumentsPanel) เพื่อไม่ต้องขยาย payload
// ของหน้าดีลที่หนักอยู่แล้ว · การ์ดนี้เป็นทาง **สร้าง** สัญญาเส้นหลัก เพราะสัญญาต้อง
// รู้ดีลและใบเสนอราคาที่อนุมัติเสมอ ซึ่งเป็นบริบทที่มีอยู่แล้วตรงนี้
//
// ⚠️ ปุ่ม "ออกสัญญา" ขึ้นเสมอเมื่อแก้ดีลได้ — เหตุผลที่ออกไม่ได้จริงถูกบอกในโมดัล
//    (จาก /options ซึ่งเรียกด่านตัวเดียวกับ API) · ซ่อนปุ่มเงียบ ๆ = คนถามว่าปุ่มอยู่ไหน
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileSignature, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import { TableEmpty, TableShell } from "@/components/ui/Table";
import ContractCreateModal from "@/components/salesPlanning/ContractCreateModal";
import { contractKindBadge, contractStatusBadge } from "@/components/salesPlanning/ui";
import { fmtDate } from "@/lib/format";

export default function DealContractsCard({ dealId, canEdit = false, quotationId = "" }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!dealId) return;
    try {
      const res = await fetch(`/api/sales-planning/contracts?dealId=${encodeURIComponent(dealId)}`);
      const data = await res.json().catch(() => []);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      // การ์ดเสริมบนหน้าดีล — โหลดไม่ได้ต้องไม่ทำให้ทั้งหน้าพัง (แสดงเป็นว่าง)
      setRows([]);
    }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <TableShell
        title="สัญญา"
        description="ออกได้หลังใบเสนอราคาอนุมัติ · พิมพ์ไปเซ็นแล้วอัปโหลดฉบับลงนามกลับ"
        actions={canEdit ? (
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            <Plus size={13} aria-hidden="true" /> ออกสัญญา
          </Button>
        ) : null}
      >
        <table className="w-full text-sm">
          <thead>
            <tr><th>เลขที่</th><th>ชนิด</th><th>วันที่</th><th>สถานะ</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="premium-row">
                <td className="mono">
                  <Link prefetch={false} href={`/sa/contracts/${row.id}`} className="linklike">
                    {row.contractNo || "ฉบับร่าง"}
                  </Link>
                </td>
                <td>{contractKindBadge(row.kind)}</td>
                <td className="mono">{fmtDate(row.contractDate)}</td>
                <td>{contractStatusBadge(row.status)}</td>
              </tr>
            ))}
            {!rows.length && (
              <TableEmpty
                colSpan={4}
                title="ยังไม่มีสัญญาของดีลนี้"
                description={canEdit ? "กด “ออกสัญญา” เพื่อสร้างร่างจากใบเสนอราคาที่อนุมัติแล้ว" : undefined}
              />
            )}
          </tbody>
        </table>
      </TableShell>

      <ContractCreateModal
        open={open}
        dealId={dealId}
        quotationId={quotationId}
        onClose={() => setOpen(false)}
        onCreated={load}
      />
    </>
  );
}
