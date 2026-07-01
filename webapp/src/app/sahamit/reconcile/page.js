"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, AlertCircle, Download } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { buildReconMatrix } from "@/lib/sahamit/reconcileClient";

// token → CSS var
const C = {
  green: "var(--green)", teal: "var(--teal)", amber: "var(--amber)",
  red: "var(--red)", violet: "var(--violet)", blue: "var(--blue)", "text-3": "var(--text-3)",
};
const LEGEND = [
  { s: "match", c: "green", t: "ครบ (FC=PO)" },
  { s: "over", c: "teal", t: "PO เกิน" },
  { s: "discrepancy", c: "amber", t: "PO ไม่ครบ" },
  { s: "pending", c: "red", t: "รอ PO" },
  { s: "unforecasted", c: "violet", t: "นอก FC" },
  { s: "covered", c: "text-3", t: "ครอบคลุมข้ามเดือน" },
  { s: "shifted", c: "text-3", t: "เลื่อนเดือน" },
];
const VIEWS = [
  { key: "recon", label: "FC vs PO" },
  { key: "fc", label: "FC" },
  { key: "po", label: "PO" },
];

const nf = (n) => Number(n || 0).toLocaleString("th-TH");

export default function ReconcilePage() {
  const router = useRouter();
  const { data: rounds, loading: l1, error: e1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2, error: e2 } = useApiList("/api/sahamit/po");
  const { data: locks } = useApiList("/api/sahamit/locks");
  const { data: coverages } = useApiList("/api/sahamit/coverage");
  const [view, setView] = useState("recon");

  const loading = l1 || l2;
  const error = e1 || e2;
  const matrix = useMemo(() => buildReconMatrix(rounds, pos, coverages), [rounds, pos, coverages]);
  const lockByKey = useMemo(() => {
    const m = new Map();
    for (const lk of locks) m.set(`${lk.fgCode}||${lk.month}`, lk);
    return m;
  }, [locks]);

  // Click a cell → open the full drill-down page (phase B).
  const openCell = (fg, m) => router.push(`/sahamit/reconcile/${encodeURIComponent(fg)}/${encodeURIComponent(m)}`);

  const renderCell = (cell, fg, m) => {
    if (!cell || cell.status === "none") {
      return <td key={m} style={{ textAlign: "center", color: "var(--text-3)", padding: "6px 5px" }}>·</td>;
    }
    const locked = lockByKey.has(`${fg}||${m}`);
    const hasCov = cell.coverageIn > 0 || cell.coverageOut > 0;
    const badges = (
      <>
        {locked && <span style={{ position: "absolute", top: 3, right: 4, fontSize: 9, lineHeight: 1 }} title={`ล็อก (ตกลงแล้ว) ที่ ${nf(cell.fcQty)}`}>🔒</span>}
        {hasCov && <span style={{ position: "absolute", top: 3, left: 4, fontSize: 9, lineHeight: 1, color: "var(--blue)" }} title={`ชดเชยข้ามเดือน (รับ ${nf(cell.coverageIn)} / ส่ง ${nf(cell.coverageOut)})`}>⇄</span>}
      </>
    );
    // Single-value views (FC / PO): neutral box, one number.
    if (view === "fc" || view === "po") {
      const val = view === "fc" ? cell.fcQty : cell.poQty;
      return (
        <td key={m} style={{ padding: "5px 5px" }}>
          <div className="grid-cell-box" onClick={() => openCell(fg, m)} style={{ position: "relative", alignItems: "center", minWidth: 84 }}>
            {badges}
            <span className="cell-val fc" style={{ fontSize: 13 }}>{val ? nf(val) : "·"}</span>
          </div>
        </td>
      );
    }
    // FC vs PO view: status-colored box with FC/PO lines + status tag.
    return (
      <td key={m} style={{ padding: "5px 5px" }}>
        <div
          className={`grid-cell-box ${cell.status}`}
          onClick={() => openCell(fg, m)}
          title={locked ? `${cell.label} · ล็อกแล้ว` : cell.label}
          style={{ position: "relative" }}
        >
          {badges}
          <div className="cell-value-line"><span className="cell-lbl">FC</span><span className="cell-val fc">{nf(cell.fcQty)}</span></div>
          <div className="cell-value-line"><span className="cell-lbl">PO</span><span className="cell-val po">{nf(cell.poQty)}</span></div>
          <span className="cell-status-tag">{cell.label}</span>
        </div>
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
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="segmented">
            {VIEWS.map((v) => (
              <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => setView(v.key)}>{v.label}</button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => window.open("/api/sahamit/export?view=reconcile", "_blank")}>
            <Download size={16} /> Excel
          </button>
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

          <div className="reconciliation-container">
            <table className="reconcile-grid">
              <thead>
                <tr>
                  <th>สินค้า / SKU</th>
                  {matrix.months.map((m) => <th key={m}>{m}</th>)}
                  <th style={{ textAlign: "right" }}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((r) => (
                  <tr key={r.fgCode}>
                    <td>
                      <div className="product-row-info">
                        <span className="product-row-name" style={r.productName ? undefined : { color: "var(--amber)" }} title={r.productName || r.fgCode}>{r.productName || "— ไม่รู้จัก —"}</span>
                        <span className="product-row-sku">{r.fgCode}</span>
                      </div>
                    </td>
                    {matrix.months.map((m) => renderCell(r.cells[m], r.fgCode, m))}
                    <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>FC {nf(r.fcTotal)}</div>
                      <div style={{ fontWeight: 700 }}>PO {nf(r.poTotal)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Workspace>
  );
}
