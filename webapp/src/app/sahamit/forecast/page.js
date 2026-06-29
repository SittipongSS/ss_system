"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Plus, Trash2, AlertCircle } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { fmtDate } from "@/lib/format";
import { roundTotal, roundSkuCount, compareRounds } from "@/lib/sahamit/forecastClient";
import RoundComparison from "@/components/sahamit/RoundComparison";
import ForecastImportModal from "@/components/sahamit/ForecastImportModal";

export default function ForecastPage() {
  const { data: rounds, loading, error, reload } = useApiList("/api/sahamit/forecast/rounds");
  const { data: products } = useApiList("/api/sahamit/products");
  const [selectedNo, setSelectedNo] = useState(null);
  const [showImport, setShowImport] = useState(false);

  // Default selection = the latest round, kept in sync as rounds load/change.
  useEffect(() => {
    if (rounds.length && selectedNo == null) setSelectedNo(rounds[rounds.length - 1].roundNo);
  }, [rounds, selectedNo]);

  const selectedIndex = useMemo(
    () => rounds.findIndex((r) => r.roundNo === selectedNo),
    [rounds, selectedNo],
  );
  const comparison = useMemo(
    () => (selectedIndex >= 0 ? compareRounds(rounds, selectedIndex) : null),
    [rounds, selectedIndex],
  );

  const deleteRound = async (r) => {
    if (!confirm(`ลบ FC รอบที่ ${r.roundNo}? (ลบบรรทัดทั้งหมดในรอบนี้ด้วย)`)) return;
    const res = await fetch(`/api/sahamit/forecast/rounds/${r.id}`, { method: "DELETE" });
    if (res.ok) { setSelectedNo(null); reload(); }
    else alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
  };

  return (
    <Workspace
      icon={<LineChart size={22} />}
      title="Forecast"
      subtitle="รับ FC รายเดือนเป็นรอบ และเทียบรอบต่อรอบ (ลูกค้า AR-109)"
      back={{ href: "/sahamit", label: "SAHAMIT" }}
      headerRight={
        <button className="btn btn-primary" onClick={() => setShowImport(true)}>
          <Plus size={16} /> นำเข้ารอบ FC
        </button>
      }
    >
      {error && (
        <div className="glass-panel" style={{ padding: "14px", borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: "8px", alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : rounds.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: "48px", textAlign: "center", color: "var(--text-3)" }}>
          <LineChart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ยังไม่มีรอบ FC</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>เริ่มจากนำเข้ารอบแรกจากลูกค้า</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowImport(true)}>
            <Plus size={16} /> นำเข้ารอบ FC
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Rounds list */}
          <div className="premium-table-wrapper">
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รอบที่</th>
                  <th>วันที่รับ</th>
                  <th>เดือนที่ครอบคลุม</th>
                  <th style={{ textAlign: "right" }}>จำนวนสินค้า</th>
                  <th style={{ textAlign: "right" }}>ยอดรวม</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedNo(r.roundNo)}
                    className="clickable-row"
                    style={{ background: r.roundNo === selectedNo ? "var(--panel-2)" : undefined, cursor: "pointer" }}
                  >
                    <td style={{ fontWeight: 600 }}>#{r.roundNo}</td>
                    <td>{fmtDate(r.receivedDate)}</td>
                    <td style={{ fontSize: 12, color: "var(--text-3)" }}>
                      {(r.coverMonths || []).length ? `${r.coverMonths[0]} – ${r.coverMonths[r.coverMonths.length - 1]} (${r.coverMonths.length})` : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>{roundSkuCount(r)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{roundTotal(r).toLocaleString("th-TH")}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        className="btn-icon"
                        title="ลบรอบนี้"
                        onClick={(e) => { e.stopPropagation(); deleteRound(r); }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Comparison for the selected round */}
          {comparison && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>การเปลี่ยนแปลงของรอบที่เลือก</h2>
              <RoundComparison comparison={comparison} />
            </div>
          )}
        </div>
      )}

      <ForecastImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onCreated={() => { setSelectedNo(null); reload(); }}
        products={products}
      />
    </Workspace>
  );
}
