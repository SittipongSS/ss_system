"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, AlertCircle, Download } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { buildReconMatrix } from "@/lib/sahamit/reconcileClient";
import { predictShifts } from "@/lib/sahamit/predict";
import { recommendedReadyDate, LEAD_IN_FC, LEAD_OUT_FC } from "@/lib/sahamit/material";
import { monthOf } from "@/lib/sahamit/po";
import { toLocalISODate } from "@/lib/pm/dateHelpers";

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
const URGENCY_COLOR = { high: "var(--red)", medium: "var(--amber)", low: "var(--violet)" };
const shortMonth = (ym) => {
  try { return new Date(`${ym}-02`).toLocaleDateString("th-TH", { month: "short" }); }
  catch { return ym; }
};

export default function ReconcilePage() {
  const router = useRouter();
  const { data: rounds, loading: l1, error: e1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2, error: e2 } = useApiList("/api/sahamit/po");
  const { data: locks } = useApiList("/api/sahamit/locks");
  const { data: coverages } = useApiList("/api/sahamit/coverage");
  const { data: holidays } = useApiList("/api/holidays");
  const [view, setView] = useState("recon");

  const loading = l1 || l2;
  const error = e1 || e2;
  const matrix = useMemo(() => buildReconMatrix(rounds, pos, coverages), [rounds, pos, coverages]);
  // Proactive shift prediction (เฟส S1): pending cells (FC, no PO) get a "✨ →month"
  // hint colored by urgency (days to month-end). Pure — logic lives in predict.js.
  const today = useMemo(() => toLocalISODate(new Date()), []);
  const predictions = useMemo(() => predictShifts(rounds, pos, { today, locks }), [rounds, pos, today, locks]);
  const lockByKey = useMemo(() => {
    const m = new Map();
    for (const lk of locks) m.set(`${lk.fgCode}||${lk.month}`, lk);
    return m;
  }, [locks]);

  // ── LD 60/90 lead-time markers (เฟส E) ──────────────────────────────
  // Reuse material.js (ห้ามคำนวณ lead ซ้ำ): from the latest received date, a NEW
  // in-FC order is ready in 60 working days, out-of-FC in 90 (holidays-aware).
  // The month each lands in is the earliest deliverable month → we draw a dashed
  // divider before it so months to its left are past the lead window.
  const anchorDate = useMemo(() => {
    const dates = (rounds || []).map((r) => r.receivedDate).filter(Boolean);
    return dates.length ? dates.slice().sort().at(-1) : toLocalISODate(new Date());
  }, [rounds]);
  const { ld60Month, ld90Month } = useMemo(() => {
    const set = new Set((holidays || []).map((h) => h.date));
    return {
      ld60Month: monthOf(recommendedReadyDate(anchorDate, LEAD_IN_FC, set)),
      ld90Month: monthOf(recommendedReadyDate(anchorDate, LEAD_OUT_FC, set)),
    };
  }, [anchorDate, holidays]);
  // Left-border style for a month column when it's an LD cutoff (amber=60, violet=90).
  const ldBorder = (m) => {
    if (m && m === ld60Month) return { borderLeft: "2px dashed var(--amber)" };
    if (m && m === ld90Month) return { borderLeft: "2px dashed var(--violet)" };
    return null;
  };

  // Click a cell → open the full drill-down page (phase B).
  const openCell = (fg, m) => router.push(`/sahamit/reconcile/${encodeURIComponent(fg)}/${encodeURIComponent(m)}`);

  const renderCell = (cell, fg, m) => {
    if (!cell || cell.status === "none") {
      return <td key={m} style={{ textAlign: "center", color: "var(--text-3)", padding: "6px 5px", ...ldBorder(m) }}>·</td>;
    }
    const locked = lockByKey.has(`${fg}||${m}`);
    const hasCov = cell.coverageIn > 0 || cell.coverageOut > 0;
    const pred = predictions.get(`${fg}||${m}`);
    const predBadge = pred ? (
      <div
        style={{ fontSize: 9.5, fontWeight: 600, color: URGENCY_COLOR[pred.urgency], display: "flex", alignItems: "center", justifyContent: "center", gap: 2, marginTop: 2, whiteSpace: "nowrap" }}
        title={`ระบบคาดว่าจะเลื่อนไป ${pred.toMonth} (${pred.pattern}) · เหลือ ${pred.daysLeft} วันถึงสิ้นเดือน · ยังไม่มี PO`}
      >
        <span style={{ fontSize: 10 }}>✨</span> →{shortMonth(pred.toMonth)}
      </div>
    ) : null;
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
        <td key={m} style={{ padding: "5px 5px", ...ldBorder(m) }}>
          <div className="grid-cell-box" onClick={() => openCell(fg, m)} style={{ position: "relative", alignItems: "center", minWidth: 84 }}>
            {badges}
            <span className="cell-val fc" style={{ fontSize: 13 }}>{val ? nf(val) : "·"}</span>
            {view === "fc" && predBadge}
          </div>
        </td>
      );
    }
    // FC vs PO view: status-colored box with FC/PO lines + status tag.
    return (
      <td key={m} style={{ padding: "5px 5px", ...ldBorder(m) }}>
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
          {predBadge}
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
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--violet)" }}>
              ✨ คาดว่าจะเลื่อน (สี = ความเร่งด่วน: <b style={{ color: "var(--red)" }}>≤30</b>/<b style={{ color: "var(--amber)" }}>≤60</b>/<b style={{ color: "var(--violet)" }}>วัน</b>)
            </span>
            {(ld60Month || ld90Month) && (
              <span style={{ color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                · เส้นประ <b style={{ color: "var(--amber)" }}>LD 60</b>/<b style={{ color: "var(--violet)" }}>LD 90</b> = เดือนแรกที่ผลิตทันถ้าสั่งวันนี้ (in-FC 60 / นอก FC 90 วันทำการ จาก {anchorDate})
              </span>
            )}
          </div>

          <div className="reconciliation-container">
            <table className="reconcile-grid">
              <thead>
                <tr>
                  <th>สินค้า / SKU</th>
                  {matrix.months.map((m) => {
                    const ld = m === ld60Month ? { t: "LD 60", c: "var(--amber)" } : m === ld90Month ? { t: "LD 90", c: "var(--violet)" } : null;
                    return (
                      <th key={m} style={ldBorder(m) || undefined}>
                        <div>{m}</div>
                        {ld && <div style={{ fontSize: 9, fontWeight: 700, color: ld.c }}>◀ {ld.t} วัน</div>}
                      </th>
                    );
                  })}
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
