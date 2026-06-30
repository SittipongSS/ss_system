"use client";
import { useMemo, useState } from "react";
import { ClipboardCheck, AlertCircle } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import { useApiList } from "@/lib/excise/useApiList";
import { fmtDate } from "@/lib/format";
import { buildReconMatrix, cellDetail } from "@/lib/sahamit/reconcileClient";
import { PO_STATUS_LABEL } from "@/lib/sahamit/po";

// token → CSS var
const C = {
  green: "var(--green)", teal: "var(--teal)", amber: "var(--amber)",
  red: "var(--red)", violet: "var(--violet)", blue: "var(--blue)", "text-3": "var(--text-3)",
};
const STATUS_COLOR = {
  match: "green", covered: "green", over: "teal", unforecasted: "violet",
  discrepancy: "amber", pending: "red", shifted: "blue", cancelled: "text-3", none: "text-3",
};
const LEGEND = [
  { s: "match", c: "green", t: "ครบ (FC=PO)" },
  { s: "over", c: "teal", t: "PO เกิน" },
  { s: "discrepancy", c: "amber", t: "PO ไม่ครบ" },
  { s: "pending", c: "red", t: "รอ PO" },
  { s: "unforecasted", c: "violet", t: "นอก FC" },
];
const VIEWS = [
  { key: "recon", label: "FC vs PO" },
  { key: "fc", label: "FC" },
  { key: "po", label: "PO" },
];

const nf = (n) => Number(n || 0).toLocaleString("th-TH");

export default function ReconcilePage() {
  const { data: rounds, loading: l1, error: e1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2, error: e2 } = useApiList("/api/sahamit/po");
  const [view, setView] = useState("recon");
  const [drill, setDrill] = useState(null); // { fgCode, month }

  const loading = l1 || l2;
  const error = e1 || e2;
  const matrix = useMemo(() => buildReconMatrix(rounds, pos), [rounds, pos]);
  const detail = useMemo(
    () => (drill ? cellDetail(rounds, pos, drill.fgCode, drill.month) : null),
    [drill, rounds, pos],
  );

  const renderCell = (cell, fg, m) => {
    if (!cell || cell.status === "none") return <td key={m} style={{ textAlign: "center", color: "var(--text-3)" }}>·</td>;
    const color = C[STATUS_COLOR[cell.status]] || C["text-3"];
    const tint = `color-mix(in srgb, ${color} 12%, var(--panel))`;
    return (
      <td
        key={m}
        onClick={() => setDrill({ fgCode: fg, month: m })}
        title={cell.label}
        style={{ cursor: "pointer", background: view === "recon" ? tint : undefined, textAlign: "center", padding: "4px 6px" }}
      >
        {view === "fc" ? (
          <span>{cell.fcQty ? nf(cell.fcQty) : "·"}</span>
        ) : view === "po" ? (
          <span>{cell.poQty ? nf(cell.poQty) : "·"}</span>
        ) : (
          <div style={{ lineHeight: 1.25, fontSize: 12 }}>
            <div style={{ color: "var(--text-2)" }}>{nf(cell.fcQty)}</div>
            <div style={{ color, fontWeight: 600, borderTop: "1px solid var(--border)" }}>{nf(cell.poQty)}</div>
          </div>
        )}
      </td>
    );
  };

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="กระทบยอด (Reconciliation)"
      subtitle="สถานะ FC / PO รายสินค้า × เดือน (ลูกค้า AR-109)"
      back={{ href: "/sahamit", label: "งานสหมิตร" }}
      headerRight={
        <div className="segmented">
          {VIEWS.map((v) => (
            <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => setView(v.key)}>{v.label}</button>
          ))}
        </div>
      }
    >
      {error && (
        <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : matrix.rows.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <ClipboardCheck size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ยังไม่มีข้อมูลให้กระทบยอด</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>เพิ่มรอบ FC หรือ PO ก่อน</div>
        </div>
      ) : (
        <>
          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14, fontSize: 12 }}>
            {LEGEND.map((x) => (
              <span key={x.s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: `color-mix(in srgb, ${C[x.c]} 35%, var(--panel))`, border: `1px solid ${C[x.c]}` }} />
                {x.t}
              </span>
            ))}
            {view === "recon" && <span style={{ color: "var(--text-3)" }}>· แต่ละช่อง: บน=FC ล่าง=PO · คลิกเพื่อดูรายละเอียด</span>}
          </div>

          <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 2, background: "var(--panel-2)", minWidth: 200 }}>สินค้า</th>
                  {matrix.months.map((m) => <th key={m} style={{ textAlign: "center", whiteSpace: "nowrap" }}>{m}</th>)}
                  <th style={{ textAlign: "right" }}>รวม FC</th>
                  <th style={{ textAlign: "right" }}>รวม PO</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.fgCode}>
                    <td style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--panel)" }}>
                      <div className="font-mono" style={{ fontWeight: 600 }}>{r.fgCode}</div>
                      <div style={{ fontSize: 11, color: r.productName ? "var(--text-3)" : "var(--amber)" }}>{r.productName || "— ไม่รู้จัก —"}</div>
                    </td>
                    {matrix.months.map((m) => renderCell(r.cells[m], r.fgCode, m))}
                    <td style={{ textAlign: "right", color: "var(--text-2)" }}>{nf(r.fcTotal)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{nf(r.poTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Cell drill-down */}
      <Modal open={!!drill} onClose={() => setDrill(null)} title={drill ? `${drill.fgCode} · ${drill.month}` : ""} size="md">
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Forecast (ตามรอบ)</h3>
              {detail.fcs.length === 0 ? <div style={{ color: "var(--text-3)", fontSize: 13 }}>— ไม่มี FC เดือนนี้ —</div> : (
                <table className="premium-table">
                  <thead><tr><th>รอบที่</th><th>วันที่รับ</th><th style={{ textAlign: "right" }}>จำนวน</th></tr></thead>
                  <tbody>
                    {detail.fcs.map((f, i) => (
                      <tr key={i}><td>#{f.roundNo}</td><td>{f.receivedDate ? fmtDate(f.receivedDate) : "—"}</td><td style={{ textAlign: "right" }}>{nf(f.qty)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div>
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Purchase Orders (ส่งเดือนนี้)</h3>
              {detail.poLines.length === 0 ? <div style={{ color: "var(--text-3)", fontSize: 13 }}>— ไม่มี PO เดือนนี้ —</div> : (
                <table className="premium-table">
                  <thead><tr><th>เลขที่ PO</th><th style={{ textAlign: "right" }}>จำนวน</th><th>กำหนดส่ง</th><th>ส่งจริง</th><th>สถานะ</th></tr></thead>
                  <tbody>
                    {detail.poLines.map((p, i) => (
                      <tr key={i}>
                        <td className="font-mono">{p.poNumber}</td>
                        <td style={{ textAlign: "right" }}>{nf(p.qty)}</td>
                        <td>{p.dueDate ? fmtDate(p.dueDate) : "—"}</td>
                        <td>{p.actualDeliveredDate ? fmtDate(p.actualDeliveredDate) : "—"}</td>
                        <td>{PO_STATUS_LABEL[p.status] || p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Workspace>
  );
}
