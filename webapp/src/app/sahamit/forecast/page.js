"use client";
import { useEffect, useMemo, useState } from "react";
import { LineChart, Plus, Trash2, Pencil, AlertCircle, Download, Send, X, CheckCircle2 } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import Modal from "@/components/Modal";
import { useApiList } from "@/lib/excise/useApiList";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { fmtDate, fmtMoneyCompact } from "@/lib/format";
import { roundTotal, roundSkuCount, roundMatrix, compareRounds } from "@/lib/sahamit/forecastClient";
import { productMetaText } from "@/lib/sahamit/productMeta";
import RoundComparison from "@/components/sahamit/RoundComparison";
import ForecastImportModal from "@/components/sahamit/ForecastImportModal";

const TABS = [
  { key: "overview", label: "รายการสินค้า" },
  { key: "matrix", label: "ตารางจัดการ (Matrix)" },
  { key: "lines", label: "รายเดือน (สร้างดีล)" },
  { key: "history", label: "ประวัติ / เทียบรอบ" },
];
const nf = (n) => Number(n || 0).toLocaleString("th-TH");
const nfBaht = (n) => fmtMoneyCompact(n);
const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function ForecastPage() {
  const { data: rounds, loading, error, reload } = useApiList("/api/sahamit/forecast/rounds");
  const { data: products } = useApiList("/api/sahamit/products");
  const { data: assignables } = useApiList("/api/pm/assignable-users");
  // forecast line ที่ถูกสร้างเป็นดีลไปแล้ว (กันสร้างซ้ำตั้งแต่ UI)
  const { data: mappedLineIds, reload: reloadMapped } = useApiList("/api/sahamit/forecast/mapped-lines");
  const mappedSet = useMemo(() => new Set((mappedLineIds || []).map(String)), [mappedLineIds]);
  const aeList = useMemo(() => (assignables || []).filter((u) => u.role === "ae"), [assignables]);
  const [selectedNo, setSelectedNo] = useState(null);
  const [tab, setTab] = useState("matrix");
  const [showImport, setShowImport] = useState(false);
  const [editRound, setEditRound] = useState(null); // round being edited, or null = create
  // เลือก forecast line (ราย line = สินค้า×เดือน ของรอบที่ดู) → สร้าง "1 ดีล" เข้าแผนการขาย
  const [selectedLines, setSelectedLines] = useState(() => new Set());
  const [dealMonth, setDealMonth] = useState(thisMonth()); // เดือนคาดได้รับ PO (Sales Forecast Month)
  const [dealOwnerId, setDealOwnerId] = useState(""); // AE เจ้าของดีล (role=ae เท่านั้น)
  const [creating, setCreating] = useState(false);
  const [dealModalOpen, setDealModalOpen] = useState(false); // modal ยืนยันสร้างแผนการขาย

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

  const closeMonthOptions = useMemo(() => {
    const months = new Set([thisMonth(), ...matrix.months]);
    const baseYear = Number(thisMonth().slice(0, 4));
    for (let y = baseYear - 1; y <= baseYear + 2; y++) {
      for (let m = 1; m <= 12; m++) months.add(`${y}-${String(m).padStart(2, "0")}`);
    }
    return [...months].sort();
  }, [matrix.months]);

  // ตารางราย line: 1 แถว = 1 สินค้า × 1 เดือน × 1 จำนวน (แต่ละ line ของรอบที่เลือก)
  // เรียงตามหมวด → รหัสสินค้า → เดือน; แนบราคา/มูลค่าจาก master สำหรับสร้างดีล
  const lineList = useMemo(() => {
    const rows = (selectedRound?.lines || [])
      .filter((l) => Number(l.qty || 0) > 0)
      .map((l) => {
        const p = productByFg.get(String(l.fgCode).trim().toLowerCase());
        const price = p?.price == null ? null : Number(p.price);
        const qty = Number(l.qty) || 0;
        return {
          id: l.id, fgCode: l.fgCode, productName: l.productName, month: l.month, qty,
          price, amount: price == null ? null : qty * price,
          category: p?.category || "— ไม่ระบุหมวด —",
          mapped: mappedSet.has(String(l.id)), // มีดีลอยู่แล้ว
        };
      });
    rows.sort((a, b) =>
      a.category.localeCompare(b.category) ||
      String(a.fgCode).localeCompare(String(b.fgCode)) ||
      String(a.month).localeCompare(String(b.month)));
    return rows;
  }, [selectedRound, productByFg, mappedSet]);

  const lineGroups = useMemo(() => {
    const g = new Map();
    for (const r of lineList) { if (!g.has(r.category)) g.set(r.category, []); g.get(r.category).push(r); }
    return [...g.entries()];
  }, [lineList]);

  // ล้าง selection เมื่อสลับรอบ (line คนละชุด)
  useEffect(() => { setSelectedLines(new Set()); }, [selectedNo]);
  // default AE = คนแรกในลิสต์ (ถ้ายังไม่เลือก)
  useEffect(() => { if (!dealOwnerId && aeList.length) setDealOwnerId(aeList[0].id); }, [aeList, dealOwnerId]);

  const toggleLine = (id) => setSelectedLines((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  // เลือก/ยกเลิกทั้งกลุ่ม — ข้าม line ที่มีดีลแล้ว (เลือกไม่ได้)
  const setLineGroup = (rows, on) => setSelectedLines((prev) => {
    const next = new Set(prev);
    for (const r of rows) { if (r.mapped) continue; if (on) next.add(r.id); else next.delete(r.id); }
    return next;
  });
  const selectableLines = useMemo(() => lineList.filter((r) => !r.mapped), [lineList]);
  const allLinesSelected = selectableLines.length > 0 && selectableLines.every((r) => selectedLines.has(r.id));

  // สรุป line ที่เลือก (จำนวน + มูลค่าราคาโรงงาน) สำหรับแถบสร้างดีล
  const selection = useMemo(() => {
    let qty = 0, value = 0, unpriced = 0;
    for (const r of lineList) {
      if (!selectedLines.has(r.id)) continue;
      qty += r.qty;
      if (r.price == null) { unpriced += 1; continue; }
      value += r.amount;
    }
    return { count: selectedLines.size, qty, value, unpriced };
  }, [selectedLines, lineList]);

  const createDeal = async () => {
    if (!selectedRound || !selectedLines.size) return;
    if (!dealOwnerId) { alert("ต้องเลือก AE เจ้าของดีล"); return; }
    setCreating(true);
    try {
      const json = await sahamitFetch(`/api/sahamit/forecast/rounds/${selectedRound.id}/create-sales-deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineIds: [...selectedLines], forecastMonth: dealMonth, ownerId: dealOwnerId }),
      });
      const skipMsg = json.skipped ? ` (ข้ามที่มีดีลแล้ว ${json.skipped} รายการ)` : "";
      alert(`สร้างดีลเข้าแผนการขายแล้ว ${json.count || 0} ดีล (1 รายการ = 1 ดีล)${skipMsg}`);
      setSelectedLines(new Set());
      setDealModalOpen(false);
      reloadMapped();
    } catch (e) {
      alert(e.message || "สร้างดีลเข้าแผนการขายไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

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
                  {overview.map((s) => {
                    const meta = productMetaText(productByFg.get(String(s.fgCode).trim().toLowerCase()));
                    return (
                    <tr key={s.fgCode}>
                      <td className="font-mono" style={{ fontWeight: 600 }}>{s.fgCode}</td>
                      <td style={{ color: s.productName ? "inherit" : "var(--amber)" }}>
                        {s.productName || "— ไม่รู้จัก —"}
                        {meta && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{meta}</div>}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{nf(s.total)}</td>
                      <td style={{ textAlign: "right" }}>#{s.roundNo}</td>
                      <td>{fmtDate(s.receivedDate)}</td>
                    </tr>
                    );
                  })}
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
                {matrix.rows.length > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>
                    ไปแท็บ “รายเดือน (สร้างดีล)” เพื่อเลือกรายการส่งเข้าแผนการขาย
                  </span>
                )}
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
                        ...rows.map((r) => {
                          const meta = productMetaText(productByFg.get(String(r.fgCode).trim().toLowerCase()), { withCategory: false });
                          return (
                          <tr key={r.fgCode}>
                            <td className="font-mono" style={{ fontWeight: 600 }}>{r.fgCode}</td>
                            <td style={{ color: r.productName ? "inherit" : "var(--amber)" }}>
                              {r.productName || "— ไม่รู้จัก —"}
                              {meta && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{meta}</div>}
                            </td>
                            {matrix.months.map((m) => (
                              <td key={m} style={{ textAlign: "right", color: r.qty[m] ? "inherit" : "var(--text-3)" }}>{r.qty[m] ? nf(r.qty[m]) : "·"}</td>
                            ))}
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{nf(r.total)}</td>
                          </tr>
                          );
                        }),
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

          {/* รายเดือน (สร้างดีล) — 1 แถว = สินค้า × เดือน × จำนวน; ติ๊กเลือกส่งเข้าแผนการขาย */}
          {tab === "lines" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ fontSize: 13, color: "var(--text-2)" }}>รอบ:</label>
                <select className="premium-select" style={{ height: 32, minWidth: 220 }} value={selectedNo ?? ""} onChange={(e) => setSelectedNo(Number(e.target.value))}>
                  {[...rounds].reverse().map((r) => (
                    <option key={r.id} value={r.roundNo}>#{r.roundNo} · รับ {fmtDate(r.receivedDate)} · {nf(roundTotal(r))} หน่วย</option>
                  ))}
                </select>
                {lineList.length > 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: "auto" }}>
                    ติ๊กเลือกรายการ (สินค้า×เดือน) เพื่อรวมเป็นดีลเดียว
                  </span>
                )}
              </div>

              {/* แถบสรุปที่เลือก → กดปุ่มเปิด modal ยืนยันสร้างแผนการขาย */}
              {selection.count > 0 && (
                <div className="glass-panel" style={{ padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", borderLeft: "3px solid var(--accent, var(--blue))" }}>
                  <div style={{ fontSize: 13 }}>
                    เลือก <b>{selection.count}</b> รายการ · <b>{nf(selection.qty)}</b> หน่วย · <b>{nfBaht(selection.value)}</b>
                    {selection.unpriced > 0 && <span style={{ color: "var(--amber)", fontSize: 11 }}> · {selection.unpriced} รายการไม่มีราคา</span>}
                  </div>
                  <button className="btn sm btn-primary" style={{ marginLeft: "auto" }} onClick={() => setDealModalOpen(true)}>
                    <Send size={14} /> สร้างแผนการขาย ({selection.count})
                  </button>
                  <button className="btn-icon" title="ล้างที่เลือก" onClick={() => setSelectedLines(new Set())}><X size={15} /></button>
                </div>
              )}

              {lineList.length === 0 ? (
                <div className="empty-state dashed" style={{ padding: 28, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>รอบนี้ยังไม่มีรายการ</div>
              ) : (
                <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
                  <table className="premium-table">
                    <thead>
                      <tr>
                        <th style={{ width: 34, textAlign: "center" }}>
                          <input type="checkbox" checked={allLinesSelected} onChange={(e) => setLineGroup(lineList, e.target.checked)} title="เลือกทั้งหมด" />
                        </th>
                        <th style={{ minWidth: 120 }}>รหัสสินค้า</th>
                        <th style={{ minWidth: 160 }}>ชื่อสินค้า</th>
                        <th style={{ textAlign: "center" }}>เดือน</th>
                        <th style={{ textAlign: "right" }}>จำนวน</th>
                        <th style={{ textAlign: "right" }}>มูลค่า (฿)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineGroups.flatMap(([cat, rows]) => [
                        <tr key={`cat-${cat}`}>
                          <td style={{ background: "var(--panel-2)", textAlign: "center", padding: "8px 10px" }}>
                            <input type="checkbox" checked={rows.every((r) => selectedLines.has(r.id))} onChange={(e) => setLineGroup(rows, e.target.checked)} title={`เลือกหมวด ${cat}`} />
                          </td>
                          <td colSpan={5} style={{ background: "var(--panel-2)", fontWeight: 700, color: "var(--text-2)", padding: "8px 10px" }}>
                            {cat} <span style={{ fontWeight: 400, color: "var(--text-3)", fontSize: 12 }}>({rows.length})</span>
                          </td>
                        </tr>,
                        ...rows.map((r) => (
                          <tr key={r.id} style={{ background: selectedLines.has(r.id) ? "var(--panel-2)" : undefined, opacity: r.mapped ? 0.6 : 1 }}>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={selectedLines.has(r.id)}
                                disabled={r.mapped}
                                onChange={() => toggleLine(r.id)}
                                title={r.mapped ? "รายการนี้ถูกสร้างเป็นดีลแล้ว" : undefined}
                              />
                            </td>
                            <td className="font-mono" style={{ fontWeight: 600 }}>{r.fgCode}</td>
                            <td style={{ color: r.productName ? "inherit" : "var(--amber)" }}>
                              {r.productName || "— ไม่รู้จัก —"}
                              {r.mapped && (
                                <span className="ui-badge" style={{ marginLeft: 8, color: "var(--green)", fontSize: 10.5 }}>
                                  <CheckCircle2 size={11} style={{ verticalAlign: "-1px" }} /> มีดีลแล้ว
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: "center" }}>{r.month}</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>{nf(r.qty)}</td>
                            <td style={{ textAlign: "right", color: r.amount == null ? "var(--amber)" : "inherit" }}>{r.amount == null ? "—" : nfBaht(r.amount)}</td>
                          </tr>
                        )),
                      ])}
                    </tbody>
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
                  <RoundComparison comparison={comparison} productByFg={productByFg} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal ยืนยันสร้างแผนการขายจากรายการที่เลือก */}
      <Modal open={dealModalOpen} onClose={() => !creating && setDealModalOpen(false)} title="สร้างแผนการขายจาก Forecast" size="md">
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="glass-panel" style={{ padding: "12px 14px", fontSize: 13, lineHeight: 1.7 }}>
            เลือก <b>{selection.count}</b> รายการ (สินค้า×เดือน) → สร้าง <b>{selection.count}</b> ดีล
            <span style={{ color: "var(--text-3)" }}> (1 รายการ = 1 ดีล)</span>
            <br />
            รวม <b>{nf(selection.qty)}</b> หน่วย · มูลค่า <b>{nfBaht(selection.value)}</b>
            {selection.unpriced > 0 && (
              <span style={{ color: "var(--amber)", fontSize: 12 }}> · {selection.unpriced} รายการไม่มีราคา (มูลค่า = 0)</span>
            )}
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-2)" }}>
            AE เจ้าของดีล
            <select className="premium-select" style={{ height: 36 }} value={dealOwnerId} onChange={(e) => setDealOwnerId(e.target.value)}>
              {!aeList.length && <option value="">— ไม่มี AE —</option>}
              {aeList.map((u) => <option key={u.id} value={u.id}>{u.name}{u.team ? ` (${u.team})` : ""}</option>)}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-2)" }}>
            เดือนคาดได้รับ PO
            <select className="premium-select" style={{ height: 36 }} value={dealMonth} onChange={(e) => setDealMonth(e.target.value)}>
              {closeMonthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button className="btn ghost" onClick={() => setDealModalOpen(false)} disabled={creating}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={createDeal} disabled={creating || !dealOwnerId || !selection.count}>
              <Send size={14} /> {creating ? "กำลังสร้าง..." : `สร้าง ${selection.count} ดีล`}
            </button>
          </div>
        </div>
      </Modal>

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
