"use client";
import { useEffect, useMemo, useState } from "react";
import { Upload, Download, AlertTriangle, Plus, X } from "lucide-react";
import Modal from "@/components/Modal";

// Create one FC round. The month columns run from a start month to an end month
// (the round's last month) and the grid updates live when either changes. Rows
// are the products the user explicitly adds (search + add) — no need to pull the
// whole catalog. An .xlsx upload can also fill the grid (parsed server-side).

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Inclusive list of 'YYYY-MM' from start to end (capped to avoid runaway grids).
function monthsBetween(start, end) {
  if (!/^\d{4}-\d{2}$/.test(start) || !/^\d{4}-\d{2}$/.test(end)) return [];
  let [y, m] = start.split("-").map(Number);
  const [ye, me] = end.split("-").map(Number);
  const out = [];
  let guard = 0;
  while ((y < ye || (y === ye && m <= me)) && guard++ < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export default function ForecastImportModal({ open, onClose, onCreated, products = [] }) {
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [startMonth, setStartMonth] = useState(thisMonth);
  const [endMonth, setEndMonth] = useState(() => addMonths(thisMonth(), 3));
  const [monthsOverride, setMonthsOverride] = useState(null); // set by upload; null = derive from start/end
  const [rows, setRows] = useState([]); // [{fgCode, productName, known, qty:{month:val}}]
  const [unknown, setUnknown] = useState([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Month columns: live from start/end, unless an upload pinned them.
  const months = useMemo(
    () => monthsOverride ?? monthsBetween(startMonth, endMonth),
    [monthsOverride, startMonth, endMonth],
  );

  const productIndex = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);

  // Reset everything when the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setNote(""); setStartMonth(thisMonth()); setEndMonth(addMonths(thisMonth(), 3));
    setMonthsOverride(null); setRows([]); setUnknown([]); setPick(""); setError(""); setBusy(false);
  }, [open]);

  // จำนวนเดือน = derived from the range; 2-way synced with start/end:
  //   • change start  → shift the window, keep the same count
  //   • change end    → count recomputes
  //   • change count  → end moves (start fixed)
  const count = months.length;
  const onStart = (v) => {
    setMonthsOverride(null);
    const c = months.length || 1;
    setStartMonth(v);
    setEndMonth(addMonths(v, c - 1));
  };
  const onEnd = (v) => { setMonthsOverride(null); setEndMonth(v); };
  const onCount = (n) => {
    setMonthsOverride(null);
    const c = Math.max(1, Math.min(36, Math.floor(Number(n) || 1)));
    setEndMonth(addMonths(startMonth, c - 1));
  };

  const addRow = (fgCodeRaw) => {
    const code = String(fgCodeRaw || "").trim();
    if (!code) return;
    if (rows.some((r) => r.fgCode.toLowerCase() === code.toLowerCase())) { setPick(""); return; }
    const hit = productIndex.get(code.toLowerCase());
    setRows((prev) => [...prev, { fgCode: hit?.fgCode || code, productName: hit?.name || null, known: !!hit, qty: {} }]);
    setPick("");
  };

  const addAllProducts = () => {
    const existing = new Set(rows.map((r) => r.fgCode.toLowerCase()));
    const add = products
      .filter((p) => !existing.has(String(p.fgCode).toLowerCase()))
      .map((p) => ({ fgCode: p.fgCode, productName: p.name, known: true, qty: {} }));
    setRows((prev) => [...prev, ...add]);
  };

  const removeRow = (ri) => setRows((prev) => prev.filter((_, i) => i !== ri));
  const setQty = (ri, month, val) =>
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, qty: { ...r.qty, [month]: val } } : r)));

  // Upload: parse server-side and load the returned grid (pins months to file).
  const onUpload = async (file) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/sahamit/forecast/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "นำเข้าไม่สำเร็จ");
      const fileMonths = json.months || [];
      setMonthsOverride(fileMonths);
      if (fileMonths.length) { setStartMonth(fileMonths[0]); setEndMonth(fileMonths[fileMonths.length - 1]); }
      setRows((json.rows || []).map((r) => ({ fgCode: r.fgCode, productName: r.productName, known: r.known, qty: { ...r.qtyByMonth } })));
      setUnknown(json.unknownFgCodes || []);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const downloadTemplate = () => {
    if (!months.length) { setError("เลือกช่วงเดือนให้ถูกต้องก่อนดาวน์โหลดเทมเพลต"); return; }
    window.open(`/api/sahamit/forecast/template?months=${months.join(",")}`, "_blank");
  };

  const totalQty = useMemo(
    () => rows.reduce((s, r) => s + months.reduce((ss, m) => ss + (Number(r.qty[m]) || 0), 0), 0),
    [rows, months],
  );

  const submit = async () => {
    const lines = [];
    for (const r of rows) {
      for (const m of months) {
        const q = Number(r.qty[m]);
        if (Number.isFinite(q) && q > 0) lines.push({ fgCode: r.fgCode, month: m, qty: q });
      }
    }
    if (!receivedDate) { setError("ระบุวันที่รับ FC"); return; }
    if (!months.length) { setError("ช่วงเดือนไม่ถูกต้อง (เดือนสุดท้ายต้องไม่ก่อนเดือนเริ่มต้น)"); return; }
    if (!lines.length) { setError("กรอกจำนวน FC อย่างน้อย 1 รายการ"); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/sahamit/forecast/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receivedDate, note, coverMonths: months, lines }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "บันทึกไม่สำเร็จ");
      onCreated?.(json);
      onClose?.();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const hasGrid = months.length > 0 && rows.length > 0;

  return (
    <Modal open={open} onClose={onClose} title="นำเข้ารอบ FC ใหม่" size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Round meta + month range (start ↔ count ↔ last month, 2-way synced) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap, 16px)" }}>
          <div className="form-group">
            <label>วันที่รับ FC <span style={{ color: "var(--red)" }}>*</span></label>
            <input type="date" className="premium-input" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>เดือนเริ่มต้น</label>
            <input type="month" className="premium-input" value={startMonth} onChange={(e) => onStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label>เดือนสุดท้ายของรอบ</label>
            <input type="month" className="premium-input" value={endMonth} min={startMonth} onChange={(e) => onEnd(e.target.value)} />
          </div>
          <div className="form-group">
            <label>จำนวนเดือน</label>
            <input type="number" min={1} max={36} className="premium-input" value={count} onChange={(e) => onCount(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>หมายเหตุ</label>
          <input type="text" className="premium-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ไม่บังคับ)" />
        </div>

        {/* Pick products to add + template/upload */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ flex: "1 1 280px", minWidth: 220 }}>
            <label>เพิ่มสินค้าเข้ากริด</label>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                list="sahamit-products"
                className="premium-input"
                style={{ flex: 1 }}
                placeholder="ค้นหารหัส / ชื่อสินค้า แล้วกดเพิ่ม"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRow(pick); } }}
              />
              <button type="button" className="btn" onClick={() => addRow(pick)}><Plus size={15} /> เพิ่ม</button>
            </div>
            <datalist id="sahamit-products">
              {products.map((p) => <option key={p.id || p.fgCode} value={p.fgCode}>{p.name}</option>)}
            </datalist>
          </div>
          <button type="button" className="btn ghost" onClick={addAllProducts} disabled={!products.length}>
            เพิ่มทุกสินค้า ({products.length})
          </button>
          <button type="button" className="btn ghost" onClick={downloadTemplate}>
            <Download size={15} /> เทมเพลต
          </button>
          <label className="btn ghost" style={{ cursor: "pointer" }}>
            <Upload size={15} /> อัปโหลด Excel
            <input type="file" accept=".xlsx" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        </div>

        {unknown.length > 0 && (
          <div className="ui-badge" style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--amber)", borderColor: "var(--amber)" }}>
            <AlertTriangle size={14} /> รหัสไม่รู้จัก {unknown.length} รายการ: {unknown.join(", ")} (บันทึกได้ แต่ยังไม่ผูกสินค้า)
          </div>
        )}

        {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>{error}</div>}

        {/* Grid */}
        {hasGrid ? (
          <div className="premium-table-wrapper" style={{ maxHeight: "44vh", overflow: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>รหัสสินค้า</th>
                  <th style={{ minWidth: 150 }}>ชื่อสินค้า</th>
                  {months.map((m) => <th key={m} style={{ textAlign: "center" }}>{m}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={`${r.fgCode}-${ri}`}>
                    <td className="font-mono" style={{ fontWeight: 600 }}>
                      {r.fgCode}{!r.known && <span title="ไม่รู้จัก" style={{ color: "var(--amber)", marginLeft: 4 }}>⚠</span>}
                    </td>
                    <td style={{ color: r.known ? "inherit" : "var(--amber)" }}>{r.productName || "— ไม่รู้จัก —"}</td>
                    {months.map((m) => (
                      <td key={m} style={{ padding: "2px" }}>
                        <input
                          type="number" min={0}
                          className="premium-input"
                          style={{ width: 76, textAlign: "right", height: 30 }}
                          value={r.qty[m] ?? ""}
                          onChange={(e) => setQty(ri, m, e.target.value)}
                        />
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }}>
                      <button type="button" className="btn-icon" title="ลบแถวนี้" onClick={() => removeRow(ri)}><X size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state dashed" style={{ padding: "28px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
            เลือกช่วงเดือน แล้วเพิ่มสินค้าเข้ากริด (หรืออัปโหลด Excel)
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-3)" }}>
            {months.length ? `${months.length} เดือน` : "ช่วงเดือนไม่ถูกต้อง"}
            {hasGrid ? ` · ${rows.length} สินค้า · รวม ${totalQty.toLocaleString("th-TH")} หน่วย` : ""}
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary px-6" onClick={submit} disabled={busy || !hasGrid}>
              {busy ? "กำลังบันทึก..." : "บันทึกรอบ FC"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
