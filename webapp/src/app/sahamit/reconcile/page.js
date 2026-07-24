"use client";
import { useMemo, useState, useEffect } from "react";
import { ClipboardCheck, AlertCircle, Download, Search, Maximize2, Minimize2 } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import CellDetailModal from "@/components/sahamit/CellDetailModal";
import FilterPopover from "@/components/ui/FilterPopover";
import Select from "@/components/ui/Select";
import { useApiList } from "@/lib/excise/useApiList";
import { buildReconMatrix, posByRound } from "@/lib/sahamit/reconcileClient";
import { ppcOf, displayQty, counterpartText } from "@/lib/sahamit/units";
import { fmtMoneyCompact, fmtDate } from "@/lib/format";
import { useCan } from "@/lib/roleContext";

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
const nfBaht = (n) => fmtMoneyCompact(n);
const volLabel = (p) => (p?.volume ? `${p.volume}${p?.volumeUnit || ""}` : "");

export default function ReconcilePage() {
  const { data: rounds, loading: l1, error: e1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2, error: e2 } = useApiList("/api/sahamit/po");
  const { data: coverages, reload: reloadCoverages } = useApiList("/api/sahamit/coverage");
  const { data: products } = useApiList("/api/sahamit/products");
  const { data: flags } = useApiList("/api/sahamit/flags");
  // (สินค้า||เดือน) ที่มีธง "เติมเต็มด้วย PO" (เสนอ po_filled หรือยืนยัน confirmed_filled)
  // — ใช้เปลี่ยนช่องที่จะขึ้น "ยกเลิกแล้ว" ให้เป็น "เติมเต็มด้วย PO" แทน
  const filledSet = useMemo(() => {
    const s = new Set();
    for (const f of flags || []) {
      if (f.kind === "po_filled" || f.status === "confirmed_filled") s.add(`${f.fgCode}||${f.month}`);
    }
    return s;
  }, [flags]);
  // ยอดที่ "ยืนยันตัด/เลื่อนออก" ราย (สินค้า||เดือน) → ลดจาก peak FC ในกระทบยอด
  // (FC ไม่หายเองเพราะรอบใหม่ไม่พูดถึง — ลดเมื่อคนยืนยันตัด/เลื่อนเท่านั้น)
  const confirmedCuts = useMemo(() => {
    const m = new Map();
    for (const f of flags || []) {
      if (f.status === "confirmed_cut" || f.status === "confirmed_shift") {
        const k = `${f.fgCode}||${f.month}`;
        m.set(k, (m.get(k) || 0) + Number(f.drop || 0));
      }
    }
    return m;
  }, [flags]);
  const canEdit = useCan("sahamit:edit");
  const [view, setView] = useState("recon");
  const [unit, setUnit] = useState("piece"); // หน่วยแสดงผล (ชิ้น/ลัง)
  const [cellSel, setCellSel] = useState(null); // { fg, m } → เปิด modal รายละเอียด
  const [search, setSearch] = useState("");
  const [roundSel, setRoundSel] = useState("all"); // ดูการรับ PO ในรอบ FC ที่เลือก
  const [expanded, setExpanded] = useState(false); // ขยายกริดเต็มจอ (overlay)
  const [brands, setBrands] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [categories, setCategories] = useState([]);
  const q = search.trim().toLowerCase();

  const loading = l1 || l2;
  const error = e1 || e2;
  // PO จัดกลุ่มตามรอบ FC (ยึดวันรับ PO อยู่ในช่วงระหว่างรอบ) — สำหรับดรอปดาวน์กรองตามรอบ
  const roundData = useMemo(() => posByRound(rounds, pos), [rounds, pos]);
  const selectedWindow = roundSel !== "all" ? roundData.windows.find((w) => String(w.roundNo) === String(roundSel)) : null;

  // เลือกรอบ FC = กรอง "ข้อมูลที่ป้อนกริด" ให้เป็นมุมมองของรอบนั้น (เหมือนตัวกรองอื่น):
  //   FC = พยากรณ์ของรอบที่เลือก · PO = เฉพาะใบที่รับในช่วงรอบนั้น (byRound).
  // ไม่ใช้ confirmedCuts ตอนเจาะรอบ — ดู FC ดิบของรอบเทียบ PO ที่เข้ามาในรอบ.
  const scopedRounds = roundSel === "all" ? rounds : (rounds || []).filter((r) => String(r.roundNo) === String(roundSel));
  const scopedPos = roundSel === "all" ? pos : (roundData.byRound.get(Number(roundSel))?.pos || []);
  const matrix = useMemo(
    () => buildReconMatrix(scopedRounds, scopedPos, coverages, roundSel === "all" ? confirmedCuts : null),
    [scopedRounds, scopedPos, coverages, confirmedCuts, roundSel],
  );

  // fgCode → product (แบรนด์/ปริมาตร/ราคาผลิต) จาก master; ใช้ทั้งคอลัมน์สินค้า + แถวมูลค่า.
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

  // มูลค่ารายเดือน (ราคา×จำนวน) — คิดตามแถวที่แสดง (หลังกรอง). ราคา = ราคาผลิต
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

  const renderCell = (cell, fg, m) => {
    if (!cell || cell.status === "none") {
      return <td key={m} style={{ textAlign: "center", color: "var(--text-3)", padding: "6px 5px" }}>·</td>;
    }
    const ppc = ppcOf(productOf(fg)); // สำหรับแปลงหน่วยแสดงผล ชิ้น/ลัง
    const hasCov = cell.coverageIn > 0 || cell.coverageOut > 0;
    // ช่องที่จะขึ้น "ยกเลิกแล้ว" แต่มีธง "เติมเต็มด้วย PO" → แสดงเป็นเติมเต็ม (เขียว)
    // แทน — FC ที่หายเพราะ PO มารับ ไม่ใช่ลูกค้ายกเลิก (ใช้สไตล์ 'covered').
    const isFilled = cell.status === "cancelled" && filledSet.has(`${fg}||${m}`);
    const dispStatus = isFilled ? "covered" : cell.status;
    const dispLabel = isFilled ? "เติมเต็มด้วย PO" : cell.label;
    const badges = hasCov ? (
      <span style={{ position: "absolute", top: 3, left: 4, fontSize: 9, lineHeight: 1, color: "var(--blue)" }} title={`ชดเชย FC ข้ามเดือน (รับ FC ${nf(cell.coverageIn)} / ส่ง FC ${nf(cell.coverageOut)}) · PO อยู่กับที่`}>⇄</span>
    ) : null;
    // Single-value views (FC / PO): one number, but colored by reconcile status
    // (เขียว=ครบ / แดง=รอ PO / เหลือง=ไม่ครบ ฯลฯ) เหมือนมุมมอง FC vs PO.
    if (view === "fc" || view === "po") {
      const val = view === "fc" ? cell.fcQty : cell.poQty;
      return (
        <td key={m} style={{ padding: "5px 5px" }}>
          <div className={`grid-cell-box ${dispStatus}`} onClick={() => openCell(fg, m)} title={dispLabel} style={{ position: "relative", alignItems: "center", minWidth: 84 }}>
            {badges}
            <span className="cell-val fc" style={{ fontSize: 14, fontWeight: 600 }}>{displayQty(val, ppc, unit, { dot: true })}</span>
            <span className="cell-status-tag">{dispLabel}</span>
          </div>
        </td>
      );
    }
    // FC vs PO view: status-colored box with FC/PO lines + status tag.
    return (
      <td key={m} style={{ padding: "5px 5px" }}>
        <div
          className={`grid-cell-box ${dispStatus}`}
          onClick={() => openCell(fg, m)}
          title={dispLabel}
          style={{ position: "relative" }}
        >
          {badges}
          <div className="cell-value-line">
            <span className="cell-lbl">FC</span>
            <span className="cell-val fc">
              {displayQty(cell.fcQty, ppc, unit)}
              {cell.originalFc != null && cell.originalFc !== cell.fcQty && (
                <span style={{ textDecoration: "line-through", color: "var(--text-3)", fontWeight: 400, fontSize: 10, marginLeft: 3 }}>{displayQty(cell.originalFc, ppc, unit)}</span>
              )}
            </span>
          </div>
          <div className="cell-value-line"><span className="cell-lbl">PO</span><span className="cell-val po">{displayQty(cell.poQty, ppc, unit)}</span></div>
          <span className="cell-status-tag">{dispLabel}</span>
        </div>
      </td>
    );
  };

  // ปิดโหมดเต็มจอด้วย Esc + ล็อกสกรอลล์พื้นหลังระหว่างเต็มจอ
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [expanded]);

  // ตัวสลับมุมมอง FC/PO + หน่วย ชิ้น/ลัง — ใช้ทั้งใน header และแถบเครื่องมือตอนเต็มจอ
  const viewUnitControls = (
    <>
      <div className="segmented">
        {VIEWS.map((v) => (
          <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => setView(v.key)}>{v.label}</button>
        ))}
      </div>
      <div className="segmented" title="หน่วยแสดงผล">
        <button className={unit === "piece" ? "active" : ""} onClick={() => setUnit("piece")}>ชิ้น</button>
        <button className={unit === "case" ? "active" : ""} onClick={() => setUnit("case")}>ลัง</button>
      </div>
    </>
  );

  return (
    <Workspace
      icon={<ClipboardCheck size={22} />}
      title="กระทบยอด (Reconciliation)"
      subtitle="สถานะ FC / PO รายสินค้า × เดือน (ลูกค้า AR-109)"
      headerRight={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {viewUnitControls}
          {matrix.rows.length > 0 && (
            <button className="btn ghost" onClick={() => setExpanded(true)} title="ขยายกริดเต็มจอ">
              <Maximize2 size={16} /> เต็มจอ
            </button>
          )}
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
          {roundData.windows.length > 0 && (
            <Select
              value={roundSel}
              onChange={(e) => setRoundSel(e.target.value)}
              title="ดูการรับ PO ในรอบ FC"
              options={[
                { value: "all", label: "ทุกรอบ FC" },
                ...[...roundData.windows].sort((a, b) => (b.roundNo || 0) - (a.roundNo || 0)).map((w) => ({
                  value: String(w.roundNo),
                  label: `รอบ #${w.roundNo} · รับ ${fmtDate(w.start, { short: true })}`,
                })),
              ]}
            />
          )}
          {selectedWindow && (
            <span className="ui-badge" style={{ fontSize: 12, color: "var(--accent)", borderColor: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              รอบ #{selectedWindow.roundNo} · PO ที่รับ {fmtDate(selectedWindow.start, { short: true })}–{selectedWindow.end ? fmtDate(selectedWindow.end, { short: true }) : "ปัจจุบัน"} ({scopedPos.length} ใบ)
              <button onClick={() => setRoundSel("all")} title="ล้างตัวเลือกรอบ" style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", display: "flex", padding: 0 }}>✕</button>
            </span>
          )}
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
        <div className={expanded ? "recon-fs" : undefined}>
          {expanded && (
            <div className="recon-fs-bar">
              <ClipboardCheck size={18} style={{ color: "var(--accent)" }} />
              <strong style={{ fontSize: 14 }}>กระทบยอด</strong>
              {selectedWindow && (
                <span className="ui-badge" style={{ fontSize: 12, color: "var(--accent)", borderColor: "var(--accent)" }}>รอบ #{selectedWindow.roundNo}</span>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
                {viewUnitControls}
                <button className="btn ghost" onClick={() => setExpanded(false)} title="ย่อ (Esc)"><Minimize2 size={16} /> ย่อ</button>
              </div>
            </div>
          )}
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
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>FC {displayQty(r.fcTotal, ppcOf(p), unit)}{counterpartText(r.fcTotal, ppcOf(p), unit) ? ` · ${counterpartText(r.fcTotal, ppcOf(p), unit)}` : ""}</div>
                          <div style={{ fontWeight: 700 }}>PO {displayQty(r.poTotal, ppcOf(p), unit)}{counterpartText(r.poTotal, ppcOf(p), unit) ? ` · ${counterpartText(r.poTotal, ppcOf(p), unit)}` : ""}</div>
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
        </div>
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
        product={cellSel ? productOf(cellSel.fg) : null}
        canEdit={canEdit}
        onCoverageChanged={reloadCoverages}
      />
    </Workspace>
  );
}
