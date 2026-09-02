"use client";
// ── การ์ด "บันทึกเพิ่มเติมสัญญา" บนหน้าสัญญา (mig 0282) ─────────────────────
//
// ⭐ บันทึกเป็นเอกสารลูกของสัญญา ⇒ ทางสร้างอยู่ในหน้าสัญญาแม่เท่านั้น (มติผู้ใช้)
// ⚠️ ปุ่มขึ้นเฉพาะสัญญาที่ **ลงนามแล้ว** — ใบที่ยังไม่เซ็นแก้ด้วยการออก Rev. ซึ่งถูกกว่า
//    และตรงความหมายกว่า · เหตุผลที่กดไม่ได้ต้องเป็นตัวหนังสือ ไม่ใช่ปุ่มจางเฉย ๆ
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileStack, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableEmpty, TableShell } from "@/components/ui/Table";
import { fmtDate, naText } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import { addendumStatusLabel } from "@/lib/sales/contractAddenda";
import { apiFetch } from "@/lib/apiFetch";

export default function ContractAddendaCard({ contract, canEdit = false }) {
  const [rows, setRows] = useState([]);
  const [source, setSource] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const signed = contract?.status === "signed";

  const load = useCallback(async () => {
    if (!contract?.id) return;
    try {
      const res = await apiFetch(`/api/sales-planning/contracts/${contract.id}/addenda`);
      const data = await res.json().catch(() => []);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    }
  }, [contract?.id]);

  useEffect(() => { load(); }, [load]);

  /* ⭐ ไม่มีให้เลือกคำร้อง (มติผู้ใช้ 2026-08-22) — คำร้องกับสัญญาอยู่ในดีลเดียวกันอยู่แล้ว
     ระบบหาให้เอง จอแค่ *บอกว่าจะใช้ใบไหน* ก่อนกดสร้าง
     ⚠️ จอไม่กรองเอง — ด่านฝั่ง API เป็นคนตัด (กรองสองที่ = เพี้ยนหากันวันหลัง) */
  const loadSource = useCallback(async () => {
    if (!contract?.id) return;
    try {
      const res = await apiFetch(`/api/sales-planning/contracts/${contract.id}/addenda/options`);
      const data = await res.json().catch(() => ({}));
      setSource(data && typeof data === "object" ? data : null);
    } catch {
      setSource(null);
    }
  }, [contract?.id]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/sales-planning/contracts/${contract.id}/addenda`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "สร้างบันทึกไม่สำเร็จ");
      notifyToast.success("สร้างร่างบันทึกเพิ่มเติมแล้ว");
      setCreating(false);
      await Promise.all([load(), loadSource()]);
    } catch (err) {
      notifyToast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <TableShell
      title="บันทึกเพิ่มเติมสัญญา"
      description="เอกสารแนบท้ายที่ระบุสูตรกลิ่นจากคำร้องพัฒนากลิ่นในดีลเดียวกัน — ถือเป็นส่วนหนึ่งของสัญญา"
      actions={canEdit && signed ? (
        <Button size="sm" tone="accent" onClick={() => { setCreating(true); loadSource(); }}>
          <Plus size={13} aria-hidden="true" /> ทำบันทึกเพิ่มเติม
        </Button>
      ) : null}
    >
      {canEdit && !signed && (
        <StatusNotice tone="info" title="ทำบันทึกเพิ่มเติมได้เมื่อสัญญาลงนามแล้ว">
          สัญญาที่ยังไม่ลงนามให้แก้ด้วยการออกฉบับแก้ไข (Rev.) แทน
        </StatusNotice>
      )}

      {creating && (
        <div className="form-grid">
          <div className="span-2">
            {source?.next ? (
              /* บอกให้ครบว่าจะเอาอะไรมาใส่ใบ — เลขคำร้อง · ใบสั่งขายต้นทาง · จำนวนสูตร
                 (กดสร้างแล้วตารางสูตรถูกตรึงลงใบทันที ไม่ใช่ของที่แก้ทีหลังได้) */
              <StatusNotice tone="info" title={`จะอ้างอิงคำร้อง ${source.next.docNo}`}>
                {source.next.formulaCount} สูตร · ปิดเรื่องเมื่อ {fmtDate(source.next.closedAt)}
                {source.next.salesOrderNo ? ` · จากใบสั่งขาย ${source.next.salesOrderNo}` : ""}
                {source.remaining > 1 ? ` · เหลือคำร้องที่ยังไม่ได้ทำบันทึกอีก ${source.remaining - 1} ใบ` : ""}
              </StatusNotice>
            ) : (
              <StatusNotice tone="warning" title="ยังทำบันทึกเพิ่มเติมไม่ได้">
                {source?.reason || "กำลังตรวจสายเอกสารของสัญญาใบนี้"}
              </StatusNotice>
            )}
          </div>
          <div className="form-actions span-2">
            <div className="form-actions-buttons">
              <Button onClick={() => setCreating(false)} disabled={busy}>ยกเลิก</Button>
              <Button tone="primary" onClick={create} disabled={busy || !source?.next}>สร้างร่างบันทึก</Button>
            </div>
          </div>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr><th>เลขที่</th><th>ครั้งที่</th><th>อ้างอิงคำร้อง</th><th>วันที่</th><th>สถานะ</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="premium-row">
              <td className="mono">
                <Link prefetch={false} href={`/sa/contracts/addenda/${row.id}`} className="linklike">
                  {row.docNo || "ฉบับร่าง"}
                </Link>
              </td>
              <td>{row.addendumNo}</td>
              <td className="mono">{naText(row.requestDocNo)}</td>
              <td className="mono">{fmtDate(row.addendumDate)}</td>
              <td>{addendumStatusLabel(row.status)}</td>
            </tr>
          ))}
          {!rows.length && (
            <TableEmpty
              colSpan={5}
              title="ยังไม่มีบันทึกเพิ่มเติม"
              description={signed ? "กด “ทำบันทึกเพิ่มเติม” — ระบบดึงสูตรจากคำร้องพัฒนากลิ่นในดีลนี้ให้เอง" : undefined}
            />
          )}
        </tbody>
      </table>
    </TableShell>
  );
}
