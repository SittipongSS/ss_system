"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { FileText, Save, Trash2, Split, History, Truck, ChevronDown, ChevronRight, AlertCircle } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { fmtDate } from "@/lib/format";
import { poTotalQty, poLineCount, PO_STATUS_LABEL } from "@/lib/sahamit/po";
import { DestinationToggle, destinationLabel } from "@/components/sahamit/destinations";

const STATUS_OPTIONS = ["open", "partial", "delivered", "cancelled"];
const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// One PO line with an inline editor: reschedule (expected date + reason →
// history), mark delivered, change qty/due/status/destination, split, delete.
function PoLineRow({ line, onChanged }) {
  const [open, setOpen] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState({});

  useEffect(() => {
    setD({
      qty: line.qty ?? "",
      dueDate: line.dueDate || "",
      expectedDate: line.expectedDate || "",
      actualDeliveredDate: line.actualDeliveredDate || "",
      status: line.status || "open",
      destination: line.destination || null,
      rescheduleReason: "",
    });
  }, [line]);

  const call = async (url, opts) => {
    setBusy(true);
    try {
      const res = await fetch(url, opts);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "ไม่สำเร็จ");
      onChanged?.();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const save = () => {
    const rescheduled = (d.expectedDate || "") !== (line.expectedDate || "");
    if (rescheduled && !d.rescheduleReason) {
      if (!confirm("เลื่อนวันคาดการณ์ส่งโดยไม่ระบุเหตุผล?")) return;
    }
    call(`/api/sahamit/po/lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        qty: Number(d.qty), dueDate: d.dueDate || null,
        expectedDate: d.expectedDate || null, rescheduleReason: d.rescheduleReason || null,
        actualDeliveredDate: d.actualDeliveredDate || null, status: d.status, destination: d.destination || null,
      }),
    });
  };

  const split = () => {
    const q = prompt(`แยกจำนวนเท่าไรจาก ${line.qty}? (จะสร้างบรรทัดยอดแยกใหม่)`);
    const splitQty = Number(q);
    if (!Number.isFinite(splitQty) || splitQty <= 0) return;
    call(`/api/sahamit/po/lines/${line.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "split", splitQty }),
    });
  };

  const del = () => {
    if (!confirm(`ลบรายการ ${line.fgCode}?`)) return;
    call(`/api/sahamit/po/lines/${line.id}`, { method: "DELETE" });
  };

  const hist = Array.isArray(line.expectedHistory) ? line.expectedHistory : [];

  return (
    <>
      <tr>
        <td className="font-mono" style={{ fontWeight: 600 }}>
          {line.fgCode}
          {line.splitFromPoLineId && <span className="ui-badge" style={{ marginLeft: 6, color: "var(--blue)", borderColor: "var(--blue)" }}>ยอดแยก</span>}
        </td>
        <td style={{ color: line.productName ? "inherit" : "var(--amber)" }}>{line.productName || "— ไม่รู้จัก —"}</td>
        <td style={{ textAlign: "right" }}>{nf(line.qty)}</td>
        <td>{line.dueDate ? fmtDate(line.dueDate) : "—"}</td>
        <td>
          {line.expectedDate ? fmtDate(line.expectedDate) : "—"}
          {hist.length > 0 && (
            <button className="btn-icon" title={`เลื่อนมาแล้ว ${hist.length} ครั้ง`} onClick={() => setShowHist((v) => !v)} style={{ marginLeft: 4 }}>
              <History size={13} />
            </button>
          )}
        </td>
        <td>{line.actualDeliveredDate ? fmtDate(line.actualDeliveredDate) : "—"}</td>
        <td>{destinationLabel(line.destination) || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
        <td><span className="status-pill">{PO_STATUS_LABEL[line.status] || line.status}</span></td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <button className="btn-icon" title="แก้ไข/เลื่อน/ส่งจริง" onClick={() => setOpen((v) => !v)}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
          <button className="btn-icon" title="แยกบางส่วน (แบ่งส่ง)" onClick={split} disabled={busy}><Split size={15} /></button>
          <button className="btn-icon" title="ลบ" onClick={del} disabled={busy}><Trash2 size={15} /></button>
        </td>
      </tr>

      {showHist && hist.length > 0 && (
        <tr>
          <td colSpan={9} style={{ background: "var(--panel-2)", fontSize: 12 }}>
            <b>ประวัติการเลื่อนวันคาดการณ์ส่ง:</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {hist.map((h, i) => (
                <li key={i}>เดิม {h.expectedDate ? fmtDate(h.expectedDate) : "—"} {h.reason ? `· ${h.reason}` : ""} <span style={{ color: "var(--text-3)" }}>({h.changedAt ? fmtDate(h.changedAt) : ""})</span></li>
              ))}
            </ul>
          </td>
        </tr>
      )}

      {open && (
        <tr>
          <td colSpan={9} style={{ background: "var(--panel-2)" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-end", padding: "6px 2px" }}>
              <div className="form-group" style={{ width: 90 }}>
                <label>จำนวน</label>
                <input type="number" min={1} className="premium-input" style={{ height: 30 }} value={d.qty} onChange={(e) => setD({ ...d, qty: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <label>กำหนดส่ง</label>
                <input type="date" className="premium-input" style={{ height: 30 }} value={d.dueDate} onChange={(e) => setD({ ...d, dueDate: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <label>คาดการณ์ส่ง</label>
                <input type="date" className="premium-input" style={{ height: 30 }} value={d.expectedDate} onChange={(e) => setD({ ...d, expectedDate: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: "1 1 160px", minWidth: 140 }}>
                <label>เหตุผลที่เลื่อน (ถ้ามี)</label>
                <input className="premium-input" style={{ height: 30 }} value={d.rescheduleReason} placeholder="กรอกเมื่อเปลี่ยนวันคาดการณ์" onChange={(e) => setD({ ...d, rescheduleReason: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 150 }}>
                <label><Truck size={12} style={{ verticalAlign: -1 }} /> วันส่งจริง</label>
                <input type="date" className="premium-input" style={{ height: 30 }} value={d.actualDeliveredDate} onChange={(e) => setD({ ...d, actualDeliveredDate: e.target.value })} />
              </div>
              <div className="form-group" style={{ width: 130 }}>
                <label>สถานะ</label>
                <select className="premium-select" style={{ height: 30 }} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{PO_STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>สถานที่ส่ง</label>
                <DestinationToggle value={d.destination} onChange={(v) => setD({ ...d, destination: v })} />
              </div>
              <button className="btn btn-primary sm" onClick={save} disabled={busy}><Save size={14} /> บันทึกบรรทัด</button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PoDetailPage() {
  const params = useParams();
  const id = params.id;
  const { data: pos, loading, error, reload } = useApiList("/api/sahamit/po");
  const po = useMemo(() => pos.find((p) => p.id === id) || null, [pos, id]);

  const [h, setH] = useState({});
  const [busy, setBusy] = useState(false);
  const [hErr, setHErr] = useState("");

  useEffect(() => {
    if (!po) return;
    setH({
      poNumber: po.poNumber || "", docDate: po.docDate || "", receivedDate: po.receivedDate || "",
      quoteRef: po.quoteRef || "", note: po.note || "",
    });
    setHErr("");
  }, [po]);

  const saveHeader = async () => {
    setBusy(true); setHErr("");
    try {
      const res = await fetch(`/api/sahamit/po/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(h),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "บันทึกไม่สำเร็จ");
      reload();
    } catch (e) { setHErr(e.message); }
    setBusy(false);
  };

  return (
    <Workspace
      icon={<FileText size={22} />}
      title={po ? `PO ${po.poNumber}` : "PO"}
      subtitle="รายละเอียดใบสั่งซื้อ (ลูกค้า AR-109)"
      back={{ href: "/sahamit/po", label: "Purchase Orders" }}
    >
      {error && (
        <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : !po ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <FileText size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ไม่พบ PO นี้</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Summary */}
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 12, color: "var(--text-3)" }}>จำนวนรายการ</div><div style={{ fontSize: 20, fontWeight: 700 }}>{poLineCount(po)}</div></div>
            <div><div style={{ fontSize: 12, color: "var(--text-3)" }}>ยอดรวม (ชิ้น)</div><div style={{ fontSize: 20, fontWeight: 700 }}>{nf(poTotalQty(po))}</div></div>
          </div>

          {/* Header editor */}
          <div className="glass-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-grid cols-2">
              <div className="form-group">
                <label>เลขที่ PO</label>
                <input className="premium-input font-mono" value={h.poNumber || ""} onChange={(e) => setH({ ...h, poNumber: e.target.value })} />
              </div>
              <div className="form-group">
                <label>วันที่เอกสาร</label>
                <input type="date" className="premium-input" value={h.docDate || ""} onChange={(e) => setH({ ...h, docDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label>วันที่รับ PO</label>
                <input type="date" className="premium-input" value={h.receivedDate || ""} onChange={(e) => setH({ ...h, receivedDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label>อ้างอิงใบเสนอราคา</label>
                <input className="premium-input" value={h.quoteRef || ""} onChange={(e) => setH({ ...h, quoteRef: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>หมายเหตุ</label>
                <input className="premium-input" value={h.note || ""} onChange={(e) => setH({ ...h, note: e.target.value })} />
              </div>
              <button className="btn" onClick={saveHeader} disabled={busy}><Save size={14} /> บันทึกหัว PO</button>
            </div>
            {hErr && <div style={{ color: "var(--red)", fontSize: 13 }}>{hErr}</div>}
          </div>

          {/* Lines */}
          <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รหัสสินค้า</th><th>ชื่อสินค้า</th>
                  <th style={{ textAlign: "right" }}>จำนวน</th>
                  <th>กำหนดส่ง</th><th>คาดการณ์ส่ง</th><th>ส่งจริง</th><th>สถานที่ส่ง</th><th>สถานะ</th><th></th>
                </tr>
              </thead>
              <tbody>
                {(po.lines || []).map((l) => <PoLineRow key={l.id} line={l} onChanged={reload} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Workspace>
  );
}
