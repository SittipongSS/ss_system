"use client";
import { useMemo, useState } from "react";
import { Upload, Download, AlertTriangle, Plus } from "lucide-react";
import Modal from "@/components/Modal";

// Create one FC round. Two ways to fill the SKU × month grid:
//   • Upload an .xlsx (parsed server-side via /import → grid + unknown flags)
//   • Manual: pick a start month + count, then type quantities per product
// On submit, non-zero cells become lines and POST to /forecast/rounds.

function monthsFrom(start, count) {
  if (!/^\d{4}-\d{2}$/.test(start)) return [];
  const [y, m] = start.split("-").map(Number);
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ForecastImportModal({ open, onClose, onCreated, products = [] }) {
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [startMonth, setStartMonth] = useState(thisMonth);
  const [count, setCount] = useState(4);
  const [months, setMonths] = useState([]);
  const [rows, setRows] = useState([]); // [{fgCode, productName, known, qty:{month:val}}]
  const [unknown, setUnknown] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const productIndex = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);

  const reset = () => {
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setNote(""); setStartMonth(thisMonth()); setCount(4);
    setMonths([]); setRows([]); setUnknown([]); setError(""); setBusy(false);
  };

  // Manual: build the grid from the product catalog over the chosen months.
  const buildManualGrid = () => {
    const ms = monthsFrom(startMonth, Number(count) || 0);
    if (!ms.length) { setError("เลือกเดือนเริ่มต้นให้ถูกต้อง"); return; }
    setError("");
    setMonths(ms);
    setRows(products.map((p) => ({ fgCode: p.fgCode, productName: p.name, known: true, qty: {} })));
  };

  // Upload: parse server-side and load the returned grid.
  const onUpload = async (file) => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/sahamit/forecast/import", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "นำเข้าไม่สำเร็จ");
      setMonths(json.months || []);
      setRows((json.rows || []).map((r) => ({ fgCode: r.fgCode, productName: r.productName, known: r.known, qty: { ...r.qtyByMonth } })));
      setUnknown(json.unknownFgCodes || []);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const downloadTemplate = () => {
    const ms = monthsFrom(startMonth, Number(count) || 0);
    if (!ms.length) { setError("เลือกเดือนเริ่มต้น/จำนวนเดือนก่อนดาวน์โหลดเทมเพลต"); return; }
    window.open(`/api/sahamit/forecast/template?months=${ms.join(",")}`, "_blank");
  };

  const setQty = (ri, month, val) => {
    setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, qty: { ...r.qty, [month]: val } } : r)));
  };

  const addCustomRow = () => {
    const fg = prompt("รหัสสินค้า (fgCode) ที่ต้องการเพิ่ม:");
    if (!fg) return;
    const code = fg.trim();
    const hit = productIndex.get(code.toLowerCase());
    setRows((prev) => [...prev, { fgCode: code, productName: hit?.name || null, known: !!hit, qty: {} }]);
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
      reset();
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
        {/* Round meta + month range */}
        <div className="form-grid cols-3">
          <div className="form-group">
            <label>วันที่รับ FC <span style={{ color: "var(--red)" }}>*</span></label>
            <input type="date" className="premium-input" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>เดือนเริ่มต้น</label>
            <input type="month" className="premium-input" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
          </div>
          <div className="form-group">
            <label>จำนวนเดือน</label>
            <input type="number" min={1} max={12} className="premium-input" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>หมายเหตุ</label>
          <input type="text" className="premium-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ไม่บังคับ)" />
        </div>

        {/* Actions: build manual grid, download template, upload file */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={buildManualGrid}>
            <Plus size={15} /> สร้างกริดจากสินค้า ({products.length})
          </button>
          <button type="button" className="btn ghost" onClick={downloadTemplate}>
            <Download size={15} /> ดาวน์โหลดเทมเพลต
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
        {hasGrid && (
          <div className="premium-table-wrapper" style={{ maxHeight: "44vh", overflow: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 120 }}>รหัสสินค้า</th>
                  <th style={{ minWidth: 160 }}>ชื่อสินค้า</th>
                  {months.map((m) => <th key={m} style={{ textAlign: "center" }}>{m}</th>)}
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
                          style={{ width: 78, textAlign: "right", height: 30 }}
                          value={r.qty[m] ?? ""}
                          onChange={(e) => setQty(ri, m, e.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasGrid && (
          <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={addCustomRow}>
            <Plus size={14} /> เพิ่มรหัสสินค้าเอง
          </button>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-3)" }}>
            {hasGrid ? `รวม ${totalQty.toLocaleString("th-TH")} หน่วย · ${months.length} เดือน · ${rows.length} สินค้า` : "เลือกวิธีกรอกข้อมูลด้านบน"}
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
