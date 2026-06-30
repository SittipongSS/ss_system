"use client";
import { useMemo, useState } from "react";
import { FileText, Plus, AlertCircle, Download } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { fmtDate } from "@/lib/format";
import { poTotalQty, poLineCount, poRollupStatus, PO_STATUS_LABEL } from "@/lib/sahamit/po";
import PoFormModal from "@/components/sahamit/PoFormModal";
import PoDetailModal from "@/components/sahamit/PoDetailModal";

export default function PoPage() {
  const { data: pos, loading, error, reload } = useApiList("/api/sahamit/po");
  const { data: products } = useApiList("/api/sahamit/products");
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  // Derive the selected PO from the live list so the detail modal stays fresh
  // after each line mutation reloads the list.
  const selected = useMemo(() => pos.find((p) => p.id === selectedId) || null, [pos, selectedId]);

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="Purchase Orders"
      subtitle="ติดตาม PO ที่ลูกค้าส่งมา (ลูกค้า AR-109)"
      back={{ href: "/sahamit", label: "งานสหมิตร" }}
      headerRight={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={() => window.open("/api/sahamit/export?view=po", "_blank")}>
            <Download size={16} /> Excel
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> บันทึก PO
          </button>
        </div>
      }
    >
      {error && (
        <div className="glass-panel" style={{ padding: "14px", borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: "8px", alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : pos.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: "48px", textAlign: "center", color: "var(--text-3)" }}>
          <FileText size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ยังไม่มี PO</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>เริ่มจากบันทึก PO ที่ลูกค้าส่งมา</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowForm(true)}>
            <Plus size={16} /> บันทึก PO
          </button>
        </div>
      ) : (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th>เลขที่ PO</th>
                <th>วันที่เอกสาร</th>
                <th>วันที่รับ</th>
                <th style={{ textAlign: "right" }}>รายการ</th>
                <th style={{ textAlign: "right" }}>จำนวนรวม</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id} className="clickable-row" style={{ cursor: "pointer" }} onClick={() => setSelectedId(po.id)}>
                  <td className="font-mono" style={{ fontWeight: 600 }}>{po.poNumber}</td>
                  <td>{po.docDate ? fmtDate(po.docDate) : "—"}</td>
                  <td>{po.receivedDate ? fmtDate(po.receivedDate) : "—"}</td>
                  <td style={{ textAlign: "right" }}>{poLineCount(po)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{poTotalQty(po).toLocaleString("th-TH")}</td>
                  <td><span className="status-pill">{PO_STATUS_LABEL[poRollupStatus(po)]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PoFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={() => reload()}
        products={products}
      />
      <PoDetailModal
        open={!!selected}
        po={selected}
        onClose={() => setSelectedId(null)}
        onChanged={() => reload()}
      />
    </Workspace>
  );
}
