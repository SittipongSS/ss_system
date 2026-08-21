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
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableEmpty, TableShell } from "@/components/ui/Table";
import { fmtDate, naText } from "@/lib/format";
import { notifyToast } from "@/lib/feedback";
import { addendumStatusLabel } from "@/lib/sales/contractAddenda";

export default function ContractAddendaCard({ contract, canEdit = false }) {
  const [rows, setRows] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestId, setRequestId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const signed = contract?.status === "signed";

  const load = useCallback(async () => {
    if (!contract?.id) return;
    try {
      const res = await fetch(`/api/sales-planning/contracts/${contract.id}/addenda`);
      const data = await res.json().catch(() => []);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    }
  }, [contract?.id]);

  useEffect(() => { load(); }, [load]);

  /* คำร้องพัฒนากลิ่นที่ปิดเรื่องแล้ว **ของลูกค้ารายนี้** และยังไม่ถูกใช้ทำบันทึกใบอื่น
     — ด่านฝั่ง API ตัดให้แล้ว จอไม่ต้องกรองซ้ำ (กรองสองที่ = เพี้ยนหากันวันหลัง) */
  const loadRequests = useCallback(async () => {
    if (!contract?.id) return;
    try {
      const res = await fetch(`/api/sales-planning/contracts/${contract.id}/addenda/options`);
      const data = await res.json().catch(() => ({}));
      setRequests(data.requests || []);
      setRequestId(data.requests?.[0]?.id || "");
    } catch {
      setRequests([]);
    }
  }, [contract?.id]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/sales-planning/contracts/${contract.id}/addenda`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "สร้างบันทึกไม่สำเร็จ");
      notifyToast.success("สร้างร่างบันทึกเพิ่มเติมแล้ว");
      setCreating(false);
      await load();
    } catch (err) {
      notifyToast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <TableShell
      title="บันทึกเพิ่มเติมสัญญา"
      description="เอกสารแนบท้ายที่ระบุสูตรกลิ่นตามคำร้องที่ปิดเรื่องแล้วของลูกค้ารายนี้ — ถือเป็นส่วนหนึ่งของสัญญา"
      actions={canEdit && signed ? (
        <Button size="sm" variant="primary" onClick={() => { setCreating(true); loadRequests(); }}>
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
          <label className="form-field span-2">
            <span className="form-field-label">คำร้องพัฒนากลิ่นที่ปิดเรื่องแล้ว <span className="required-mark">*</span></span>
            <Select
              value={requestId}
              onChange={(event) => setRequestId(event.target.value)}
              disabled={busy}
              options={requests.map((request) => ({
                value: request.id,
                label: `${request.docNo} · ${request.formulaCount} สูตร · ปิดเมื่อ ${fmtDate(request.closedAt)}`,
              }))}
            />
            <span className="hint">
              {requests.length
                ? "ตารางสูตรในบันทึกดึงจากคำร้องใบนี้ แล้วตรึงลงเอกสาร · หนึ่งคำร้องออกบันทึกได้ครั้งเดียว"
                : `ยังไม่มีคำร้องพัฒนากลิ่นของ ${contract?.customerName || "ลูกค้ารายนี้"} ที่ปิดเรื่อง มีสูตรขึ้นทะเบียน และยังไม่ถูกใช้ทำบันทึก`}
            </span>
          </label>
          <div className="form-actions span-2">
            <div className="form-actions-buttons">
              <Button onClick={() => setCreating(false)} disabled={busy}>ยกเลิก</Button>
              <Button variant="accent" onClick={create} disabled={busy || !requestId}>สร้างร่างบันทึก</Button>
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
              description={signed ? "กด “ทำบันทึกเพิ่มเติม” เมื่อมีสูตรที่ตกลงกันแล้วจากคำร้องพัฒนากลิ่น" : undefined}
            />
          )}
        </tbody>
      </table>
    </TableShell>
  );
}
