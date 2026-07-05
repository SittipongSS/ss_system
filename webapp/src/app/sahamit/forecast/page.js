"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Plus, Trash2, Pencil, AlertCircle, Download } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { fmtDate } from "@/lib/format";
import { roundTotal, roundSkuCount, roundMatrix, compareRounds } from "@/lib/sahamit/forecastClient";
import RoundComparison from "@/components/sahamit/RoundComparison";
import ForecastImportModal from "@/components/sahamit/ForecastImportModal";

const TABS = [
  { key: "overview", label: "รายการสินค้า" },
  { key: "matrix", label: "ตารางจัดการ (Matrix)" },
  { key: "history", label: "ประวัติ / เทียบรอบ" },
];
const nf = (n) => Number(n || 0).toLocaleString("th-TH");
const nfBaht = (n) => "฿" + Math.round(Number(n) || 0).toLocaleString("th-TH");

export default function ForecastPage() {
  const { data: rounds, loading, error, reload } = useApiList("/api/sahamit/forecast/rounds");
  const { data: products } = useApiList("/api/sahamit/products");
  const [selectedNo, setSelectedNo] = useState(null);
  const [tab, setTab] = useState("matrix");
  const [showImport, setShowImport] = useState(false);
  const [editRound, setEditRound] = useState(null); // round being edited, or null = create

  // Default selection = the latest round, kept in sync as rounds load/change.
  useEffect(() => {
    if (rounds.length && selectedNo == null) setSelectedNo(rounds[rounds.length - 1].roundNo);
  }, [rounds, selectedNo]);

  const selectedIndex = useMemo(
    () => rounds.findIndex((r) => r.roundNo === selectedNo),
    [rounds, selectedNo],
  );
  const selectedRound = selectedIndex >= 0 ? rounds[selectedIndex] : null;
  const comparison = useMemo(
    () => (selectedIndex >= 0 ? compareRounds(rounds, selectedIndex) : null),
    [rounds, selectedIndex],
  );
  const matrix = useMemo(() => (selectedRound ? roundMatrix(selectedRound) : { months: [], rows: [] }), [selectedRound]);

  // fgCode → product (หมวด + ราคาโรงงาน) จาก master — สำหรับ group หมวด + แถวรวมมูลค่า
  const productByFg = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);
  const catOf = (fg) => productByFg.get(String(fg).trim().toLowerCase())?.category || "— ไม่ระบุหมวด —";

  // จัดกลุ่มแถว matrix ตามหมวดสินค้า
  const matrixGroups = useMemo(() => {
    const g = new Map();
    for (const r of matrix.rows) {
      const cat = catOf(r.fgCode);
      if (!g.has(cat)) g.set(cat, []);
      g.get(cat).push(r);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, productByFg]);

  // แถวรวมมูลค่า (ราคาโรงงาน × จำนวน) ต่อเดือน + รวม — เหมือนหน้ากระทบยอด
  const matrixValue = useMemo(() => {
    const byMonth = {};
    for (const m of matrix.months) byMonth[m] = 0;
    let grand = 0, unpriced = 0;
    for (const r of matrix.rows) {
      const p = productByFg.get(String(r.fgCode).trim().toLowerCase());
      const price = p?.price == null ? null : Number(p.price);
      if (price == null) { if (r.total > 0) unpriced += 1; continue; }
      for (const m of matrix.months) { const q = Number(r.qty[m]) || 0; byMonth[m] += q * price; grand += q * price; }
    }
    return { byMonth, grand, unpriced };
  }, [matrix, productByFg]);

  // Overview: latest known qty per SKU (the most recent round that lists it).
  const overview = useMemo(() => {
    const map = new Map();
    for (const r of rounds) {
      for (const row of roundMatrix(r).rows) {
        map.set(row.fgCode, { fgCode: row.fgCode, productName: row.productName, total: row.total, roundNo: r.roundNo, receivedDate: r.receivedDate });
      }
    }
    return [...map.values()].sort((a, b) => String(a.fgCode).localeCompare(String(b.fgCode)));
  }, [rounds]);

  const openCreate = () => { setEditRound(null); setShowImport(true); };
  const openEdit = (r) => { setEditRound(r); setShowImport(true); };
  const closeModal = () => { setShowImport(false); setEditRound(null); };

  const deleteRound = async (r) => {
    if (!confirm(`ลบ FC รอบที่ ${r.roundNo}? (ลบบรรทัดทั้งหมดในรอบนี้ด้วย)`)) return;
    try {
      await sahamitFetch(`/api/sahamit/forecast/rounds/${r.id}`, { method: "DELETE" });
      setSelectedNo(null); reload();
    } catch (e) { alert(e.message); }
  };

  return (
    <Workspace
      icon={<LineChart size={22} />}
      title="Forecast"
      subtitle="รับ FC รายเดือนเป็นรอบ และเทียบรอบต่อรอบ (ลูกค้า AR-109)"
      back={{ href: "/sahamit", label: "SAHAMIT" }}
      headerRight={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={() => window.open("/api/sahamit/export?view=forecast", "_blank")}>
            <Download size={16} /> Excel
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> นำเข้ารอบ FC
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
      ) : error ? null : rounds.length === 0 ? (
        <div className="empty-state dashed" style={{ padding: "48px", textAlign: "center", color: "var(--text-3)" }}>
          <LineChart size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ยังไม่มีรอบ FC</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>เริ่มจากนำเข้ารอบแรกจากลูกค้า</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>
            <Plus size={16} /> นำเข้ารอบ FC
          </button>
        </div>
      ) : (
        <>
          <div className="tabs-header">
            {TABS.map((t) => (
              <button key={t.key} className={`tab-btn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {/* รายการสินค้า (Overview) — ยอดล่าสุดต่อ SKU */}
          {tab === "overview" && (
            <div className="premium-table-wrapper">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>รหัสสินค้า</th>
                    <th>ชื่อสินค้า</th>
                    <th style={{ textAlign: "right" }}>ยอดล่าสุด</th>
                    <th style={{ textAlign: "right" }}>รอบล่าสุด</th>
                    <th>วันที่รับ</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.map((s) => (
                    <tr key={s.fgCode}>
                      <td className="font-mono" style={{ fontWeight: 600 }}>{s.fgCode}</td>
                      <td style={{ color: s.productName ? "inherit" : "var(--amber)" }}>{s.productName || "— ไม่รู้จัก —"}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{nf(s.total)}</td>
                      <td style={{ textAlign: "right" }}>#{s.roundNo}</td>
                      <td>{fmtDate(s.receivedDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ตารางจัดการ (Matrix) — กริด SKU × เดือน ของรอบที่เลือก (อ่านอย่างเดียว, แก้ผ่านปุ่ม) */}
          {tab === "matrix" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 13, color: "var(--text-2)" }}>รอบ:</label>
                <select className="premium-select" style={{ height: 32, minWidth: 220 }} value={selectedNo ?? ""} onChange={(e) => setSelectedNo(Number(e.target.value))}>
                  {[...rounds].reverse().map((r) => (
                    <option key={r.id} value={r.roundNo}>#{r.roundNo} · รับ {fmtDate(r.receivedDate)} · {nf(roundTotal(r))} หน่วย</option>
                  ))}
                </select>
                {selectedRound && (
                  <button className="btn sm" onClick={() => openEdit(selectedRound)}><Pencil size={14} /> แก้รอบนี้</button>
                )}
                <button className="btn ghost sm" onClick={openCreate}><Plus size={14} /> ลงรอบใหม่</button>
              </div>

              {matrix.rows.length === 0 ? (
                <div className="empty-state dashed" style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>รอบนี้ยังไม่มีรายการ</div>
              ) : (
                <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
                  <table className="premium-table sticky-col1">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 120 }}>รหัสสินค้า</th>
                        <th style={{ minWidth: 160 }}>ชื่อสินค้า</th>
                        {matrix.months.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}</th>)}
                        <th style={{ textAlign: "right" }}>รวม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixGroups.flatMap(([cat, rows]) => [
                        <tr key={`cat-${cat}`}>
                          <td colSpan={matrix.months.length + 3} style={{ position: "static", background: "var(--panel-2)", fontWeight: 700, color: "var(--text-2)", padding: "8px 10px" }}>
                            {cat} <span style={{ fontWeight: 400, color: "var(--text-3)", fontSize: 12 }}>({rows.length})</span>
                          </td>
                        </tr>,
                        ...rows.map((r) => (
                          <tr key={r.fgCode}>
                            <td className="font-mono" style={{ fontWeight: 600 }}>{r.fgCode}</td>
                            <td style={{ color: r.productName ? "inherit" : "var(--amber)" }}>{r.productName || "— ไม่รู้จัก —"}</td>
                            {matrix.months.map((m) => (
                              <td key={m} style={{ textAlign: "right", color: r.qty[m] ? "inherit" : "var(--text-3)" }}>{r.qty[m] ? nf(r.qty[m]) : "·"}</td>
                            ))}
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{nf(r.total)}</td>
                          </tr>
                        )),
                      ])}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2} style={{ background: "var(--panel-2)", fontWeight: 600, color: "var(--text-2)", borderTop: "2px solid var(--border)" }}>
                          รวมมูลค่า (฿)
                          {matrixValue.unpriced > 0 && <span style={{ color: "var(--amber)", fontSize: 11, fontWeight: 400 }}> · {matrixValue.unpriced} SKU ไม่มีราคา</span>}
                        </td>
                        {matrix.months.map((m) => (
                          <td key={m} style={{ textAlign: "right", background: "var(--panel-2)", fontWeight: 700, borderTop: "2px solid var(--border)" }}>{nfBaht(matrixValue.byMonth[m])}</td>
                        ))}
                        <td style={{ textAlign: "right", background: "var(--panel-2)", fontWeight: 700, borderTop: "2px solid var(--border)" }}>{nfBaht(matrixValue.grand)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ประวัติ / เทียบรอบ */}
          {tab === "history" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
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
                    {[...rounds].reverse().map((r) => (
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
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{nf(roundTotal(r))}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <button className="btn-icon" title="แก้รอบนี้" onClick={(e) => { e.stopPropagation(); openEdit(r); }}><Pencil size={15} /></button>
                          <button className="btn-icon" title="ลบรอบนี้" onClick={(e) => { e.stopPropagation(); deleteRound(r); }}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {comparison && (
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>การเปลี่ยนแปลงของรอบที่เลือก (#{selectedNo})</h2>
                  <RoundComparison comparison={comparison} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      <ForecastImportModal
        open={showImport}
        onClose={closeModal}
        onCreated={(json) => { setShowImport(false); setEditRound(null); if (json?.roundNo) setSelectedNo(json.roundNo); reload(); }}
        products={products}
        editRound={editRound}
        existingRounds={rounds}
        onEditExisting={(r) => setEditRound(r)}
      />
    </Workspace>
  );
}
