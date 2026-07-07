"use client";
import { useMemo, useState } from "react";
import { ClipboardCheck, AlertCircle, Download, Search } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import CellDetailModal from "@/components/sahamit/CellDetailModal";
import FilterPopover from "@/components/ui/FilterPopover";
import { useApiList } from "@/lib/excise/useApiList";
import { buildReconMatrix } from "@/lib/sahamit/reconcileClient";
import { predictShifts } from "@/lib/sahamit/predict";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
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
const nfBaht = (n) => "฿" + Math.round(Number(n) || 0).toLocaleString("th-TH");
const URGENCY_COLOR = { high: "var(--red)", medium: "var(--amber)", low: "var(--violet)" };
const shortMonth = (ym) => {
  try { return new Date(`${ym}-02`).toLocaleDateString("th-TH", { month: "short" }); }
  catch { return ym; }
};
const volLabel = (p) => (p?.volume ? `${p.volume}${p?.volumeUnit || ""}` : "");

export default function ReconcilePage() {
  const { data: rounds, loading: l1, error: e1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2, error: e2 } = useApiList("/api/sahamit/po");
  const { data: locks } = useApiList("/api/sahamit/locks");
  const { data: coverages, reload: reloadCoverages } = useApiList("/api/sahamit/coverage");
  const { data: predAcks, reload: reloadAcks } = useApiList("/api/sahamit/pred-ack");
  const { data: products } = useApiList("/api/sahamit/products");
  const [view, setView] = useState("recon");
  const [cellSel, setCellSel] = useState(null); // { fg, m } → เปิด modal รายละเอียด
  const [search, setSearch] = useState("");
  const [brands, setBrands] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [categories, setCategories] = useState([]);
  const q = search.trim().toLowerCase();

  const loading = l1 || l2;
  const error = e1 || e2;
  const matrix = useMemo(() => buildReconMatrix(rounds, pos, coverages), [rounds, pos, coverages]);
  // Proactive shift prediction (เฟส S1): pending cells (FC, no PO) get a "✨ →month"
  // hint colored by urgency (days to month-end). Pure — logic lives in predict.js.
  const today = useMemo(() => toLocalISODate(new Date()), []);
  const predictions = useMemo(() => predictShifts(rounds, pos, { today, locks }), [rounds, pos, today, locks]);
  const ackSet = useMemo(() => new Set((predAcks || []).map((a) => `${a.fgCode}||${a.month}`)), [predAcks]);

  // fgCode → product (แบรนด์/ปริมาตร/ราคาโรงงาน) จาก master; ใช้ทั้งคอลัมน์สินค้า + แถวมูลค่า.
  const productByFg = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);
  const productOf = (fg) => productByFg.get(String(fg).trim().toLowerCase()) || null;

  // ตัวเลือกตัวกรอง (แบรนด์/ปริมาตร/หมวด) จากสินค้าที่อยู่ในกริด
  const filterOptions = useMemo(() => {
    const b = new Set(), v = new Set(), c = new Set();
    for (const r of matrix.rows) {
      const p = productByFg.get(String(r.fgCode).trim().toLowerCase());
      if (p?.brandName) b.add(p.brandName);
      const vl = p?.volume ? `${p.volume}${p?.volumeUnit || ""}` : "";
      if (vl) v.add(vl);
      if (p?.category) c.add(p.category);
    }
    const toOpts = (s) => [...s].sort((x, y) => String(x).localeCompare(String(y))).map((x) => ({ value: x, label: x }));
    return { brands: toOpts(b), volumes: toOpts(v), categories: toOpts(c) };
  }, [matrix, productByFg]);

  // แถวที่ผ่านตัวกรอง (ว่าง = ไม่กรอง). สินค้าที่ไม่รู้จัก master จะไม่ผ่านเมื่อมีตัวกรอง แบรนด์/ปริมาตร/หมวด.
  const filteredRows = useMemo(() => {
    if (!q && !brands.length && !volumes.length && !categories.length) return matrix.rows;
    return matrix.rows.filter((r) => {
      if (q && !String(r.fgCode).toLowerCase().includes(q) && !String(r.productName || "").toLowerCase().includes(q)) return false;
      const p = productByFg.get(String(r.fgCode).trim().toLowerCase());
      if (brands.length && !brands.includes(p?.brandName)) return false;
      if (volumes.length && !volumes.includes(volLabel(p))) return false;
      if (categories.length && !categories.includes(p?.category)) return false;
      return true;
    });
  }, [matrix, productByFg, q, brands, volumes, categories]);

  const filterCount = brands.length + volumes.length + categories.length;

  // จัดกลุ่มแถวตามหมวดสินค้า (แสดงหัวหมวดคั่น)
  const catGroups = useMemo(() => {
    const m = new Map();
    for (const r of filteredRows) {
      const cat = productByFg.get(String(r.fgCode).trim().toLowerCase())?.category || "— ไม่ระบุหมวด —";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat).push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredRows, productByFg]);

  // มูลค่ารายเดือน (ราคา×จำนวน) — คิดตามแถวที่แสดง (หลังกรอง). ราคา = ราคาโรงงาน
  // (costPrice) จาก products — SKU ที่ไม่มีราคาถูกข้าม + นับไว้เตือน.
  const valueSummary = useMemo(() => {
    const byMonth = {};
    for (const m of matrix.months) byMonth[m] = { fc: 0, po: 0 };
    let gFc = 0, gPo = 0, unpriced = 0;
    for (const row of filteredRows) {
      const p = productByFg.get(String(row.fgCode).trim().toLowerCase());
      const price = p?.price == null ? null : Number(p.price);
      if (price == null) { if (row.fcTotal > 0 || row.poTotal > 0) unpriced += 1; continue; }
      for (const m of matrix.months) {
        const c = row.cells[m];
        if (!c) continue;
        byMonth[m].fc += (c.fcQty || 0) * price;
        byMonth[m].po += (c.poQty || 0) * price;
      }
      gFc += (row.fcTotal || 0) * price;
      gPo += (row.poTotal || 0) * price;
    }
    return { byMonth, gFc, gPo, unpriced };
  }, [matrix, productByFg, filteredRows]);

  // Click a cell → open the detail modal (แทนการเด้งไปหน้าเต็ม).
  const openCell = (fg, m) => setCellSel({ fg, m });

  // "ดูแล้ว" ป้ายคาดการณ์ (ปิด/เปิดเตือน) — S4
  const toggleAck = async (fg, m, isAcked) => {
    try {
      await sahamitFetch("/api/sahamit/pred-ack", {
        method: isAcked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fgCode: fg, month: m }),
      });
      reloadAcks();
    } catch (e) { alert(e.message); }
  };

  const renderCell = (cell, fg, m) => {
    if (!cell || cell.status === "none") {
      return <td key={m} style={{ textAlign: "center", color: "var(--text-3)", padding: "6px 5px" }}>·</td>;
    }
    const hasCov = cell.coverageIn > 0 || cell.coverageOut > 0;
    const pred = predictions.get(`${fg}||${m}`);
    const acked = pred && ackSet.has(`${fg}||${m}`);
    const predBadge = pred ? (
      <div
        style={{ fontSize: 9.5, fontWeight: acked ? 400 : 600, color: acked ? "var(--text-3)" : URGENCY_COLOR[pred.urgency], display: "flex", alignItems: "center", justifyContent: "center", gap: 2, marginTop: 2, whiteSpace: "nowrap", opacity: acked ? 0.7 : 1 }}
        title={acked ? `ดูแล้ว (ปิดเตือน) · คาดว่าจะเลื่อนไป ${pred.toMonth}` : `ระบบคาดว่าจะเลื่อนไป ${pred.toMonth} (${pred.pattern}) · เหลือ ${pred.daysLeft} วันถึงสิ้นเดือน · ยังไม่มี PO`}
      >
        <span style={{ fontSize: 10 }}>{acked ? "👁" : "✨"}</span> →{shortMonth(pred.toMonth)}
      </div>
    ) : null;
    const badges = hasCov ? (
      <span style={{ position: "absolute", top: 3, left: 4, fontSize: 9, lineHeight: 1, color: "var(--blue)" }} title={`ชดเชย FC ข้ามเดือน (รับ FC ${nf(cell.coverageIn)} / ส่ง FC ${nf(cell.coverageOut)}) · PO อยู่กับที่`}>⇄</span>
    ) : null;
    // Single-value views (FC / PO): one number, but colored by reconcile status
    // (เขียว=ครบ / แดง=รอ PO / เหลือง=ไม่ครบ ฯลฯ) เหมือนมุมมอง FC vs PO.
    if (view === "fc" || view === "po") {
      const val = view === "fc" ? cell.fcQty : cell.poQty;
      return (
        <td key={m} style={{ padding: "5px 5px" }}>
          <div className={`grid-cell-box ${cell.status}`} onClick={() => openCell(fg, m)} title={cell.label} style={{ position: "relative", alignItems: "center", minWidth: 84 }}>
            {badges}
            <span className="cell-val fc" style={{ fontSize: 14, fontWeight: 600 }}>{val ? nf(val) : "·"}</span>
            <span className="cell-status-tag">{cell.label}</span>
            {view === "fc" && predBadge}
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
          title={cell.label}
          style={{ position: "relative" }}
        >
          {badges}
          <div className="cell-value-line">
            <span className="cell-lbl">FC</span>
            <span className="cell-val fc">
              {nf(cell.fcQty)}
              {cell.originalFc != null && cell.originalFc !== cell.fcQty && (
                <span style={{ textDecoration: "line-through", color: "var(--text-3)", fontWeight: 400, fontSize: 10, marginLeft: 3 }}>{nf(cell.originalFc)}</span>
              )}
            </span>
          </div>
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
          <button className="btn ghost" onClick={() => {
            const p = new URLSearchParams({ view: "reconcile" });
            if (brands.length) p.set("brands", brands.join(","));
            if (volumes.length) p.set("volumes", volumes.join(","));
            if (categories.length) p.set("categories", categories.join(","));
            window.open(`/api/sahamit/export?${p.toString()}`, "_blank");
          }}>
            <Download size={16} /> Excel{filterCount > 0 ? " (กรองแล้ว)" : ""}
          </button>
        </div>
      }
    >
      {/* ตัวกรองอยู่ในเนื้อหา (ไม่ใช่ในหัว) เพราะหัว premium-header เป็น overflow:hidden จะตัด dropdown */}
      {!loading && !error && matrix.rows.length > 0 && (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="search-glass" style={{ width: 240 }}>
            <Search size={18} color="var(--text-3)" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหารหัส / ชื่อสินค้า..." />
          </div>
          <FilterPopover
            count={filterCount}
            onClear={() => { setBrands([]); setVolumes([]); setCategories([]); }}
            groups={[
              { key: "brand", label: "แบรนด์", options: filterOptions.brands, selected: brands, onChange: setBrands },
              { key: "volume", label: "ปริมาตร", options: filterOptions.volumes, selected: volumes, onChange: setVolumes },
              { key: "category", label: "หมวดสินค้า", options: filterOptions.categories, selected: categories, onChange: setCategories },
            ]}
          />
          {(filterCount > 0 || q) && <span style={{ fontSize: 12, color: "var(--text-3)" }}>แสดง {filteredRows.length} จาก {matrix.rows.length} สินค้า</span>}
        </div>
      )}
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
          </div>

          <div className="reconciliation-container">
            <table className="reconcile-grid">
              <thead>
                <tr>
                  <th>สินค้า / SKU</th>
                  {matrix.months.map((m) => (
                    <th key={m}><div>{m}</div></th>
                  ))}
                  <th style={{ textAlign: "right" }}>รวม</th>
                </tr>
              </thead>
              <tbody>
                {catGroups.flatMap(([cat, rows]) => [
                  <tr key={`cat-${cat}`}>
                    <td colSpan={matrix.months.length + 2} style={{ position: "static", background: "var(--panel-2)", fontWeight: 700, color: "var(--text-2)", padding: "8px 10px" }}>
                      {cat} <span style={{ fontWeight: 400, color: "var(--text-3)", fontSize: 12 }}>({rows.length})</span>
                    </td>
                  </tr>,
                  ...rows.map((r) => {
                    const p = productOf(r.fgCode);
                    const meta = [p?.brandName, volLabel(p)].filter(Boolean).join(" · ");
                    return (
                      <tr key={r.fgCode}>
                        <td>
                          <div className="product-row-info">
                            <span className="product-row-name" style={r.productName ? undefined : { color: "var(--amber)" }} title={r.productName || r.fgCode}>{r.productName || "— ไม่รู้จัก —"}</span>
                            <span className="product-row-sku">{r.fgCode}</span>
                            {meta && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{meta}</span>}
                          </div>
                        </td>
                        {matrix.months.map((m) => renderCell(r.cells[m], r.fgCode, m))}
                        <td style={{ textAlign: "right", verticalAlign: "middle" }}>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>FC {nf(r.fcTotal)}</div>
                          <div style={{ fontWeight: 700 }}>PO {nf(r.poTotal)}</div>
                        </td>
                      </tr>
                    );
                  }),
                ])}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={matrix.months.length + 2} style={{ textAlign: "center", color: "var(--text-3)", padding: 28 }}>
                      ไม่มีสินค้าตรงตัวกรอง — ปรับตัวกรอง หรือกด “ล้างทั้งหมด”
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="recon-value-row">
                  <td>
                    รวมมูลค่า{view === "fc" ? " (FC)" : view === "po" ? " (PO)" : ""}
                    {valueSummary.unpriced > 0 && (
                      <span style={{ color: "var(--amber)", fontSize: 11, fontWeight: 400 }} title="สินค้าที่ยังไม่มีราคาขายปลีกใน master ถูกข้าม">
                        {" "}· {valueSummary.unpriced} SKU ไม่มีราคา
                      </span>
                    )}
                  </td>
                  {matrix.months.map((m) => {
                    const v = valueSummary.byMonth[m] || { fc: 0, po: 0 };
                    return (
                      <td key={m} style={{ textAlign: "right" }}>
                        {view !== "po" && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{nfBaht(v.fc)}</div>}
                        {view !== "fc" && <div style={{ fontWeight: 700 }}>{nfBaht(v.po)}</div>}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "right" }}>
                    {view !== "po" && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{nfBaht(valueSummary.gFc)}</div>}
                    {view !== "fc" && <div style={{ fontWeight: 700 }}>{nfBaht(valueSummary.gPo)}</div>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <CellDetailModal
        open={!!cellSel}
        onClose={() => setCellSel(null)}
        fgCode={cellSel?.fg}
        month={cellSel?.m}
        matrix={matrix}
        rounds={rounds}
        pos={pos}
        coverages={coverages}
        prediction={cellSel ? predictions.get(`${cellSel.fg}||${cellSel.m}`) || null : null}
        product={cellSel ? productOf(cellSel.fg) : null}
        acked={cellSel ? ackSet.has(`${cellSel.fg}||${cellSel.m}`) : false}
        onToggleAck={() => cellSel && toggleAck(cellSel.fg, cellSel.m, ackSet.has(`${cellSel.fg}||${cellSel.m}`))}
        onCoverageChanged={reloadCoverages}
      />
    </Workspace>
  );
}
