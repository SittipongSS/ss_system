"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { DestinationToggle } from "@/components/sahamit/destinations";

// Create one PO with its lines. Header carries the document/received dates; each
// line carries due + expected delivery dates (the expected date can later be
// rescheduled with history in the detail view).
export default function PoFormModal({ open, onClose, onCreated, products = [] }) {
  const today = () => new Date().toISOString().slice(0, 10);
  const [poNumber, setPoNumber] = useState("");
  const [docDate, setDocDate] = useState(today);
  const [receivedDate, setReceivedDate] = useState(today);
  const [quoteRef, setQuoteRef] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState([]); // [{fgCode, productName, known, qty, dueDate, expectedDate}]
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const productIndex = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);

  // Brand + size shown alongside the name so lookalike SKUs (same product,
  // different pack size / brand line) are easy to tell apart while picking.
  const productMeta = (p) =>
    [p?.brandName, p?.volume ? `${p.volume}${p?.volumeUnit || ""}` : null].filter(Boolean).join(" · ");

  useEffect(() => {
    if (!open) return;
    setPoNumber(""); setDocDate(today()); setReceivedDate(today());
    setQuoteRef(""); setNote(""); setRows([]); setPick(""); setError(""); setBusy(false);
  }, [open]);

  const addRow = (fgCodeRaw) => {
    const code = String(fgCodeRaw || "").trim();
    if (!code) return;
    if (rows.some((r) => r.fgCode.toLowerCase() === code.toLowerCase())) { setPick(""); return; }
    const hit = productIndex.get(code.toLowerCase());
    setRows((prev) => [...prev, {
      fgCode: hit?.fgCode || code, productName: hit?.name || null, productMeta: hit ? productMeta(hit) : "", known: !!hit,
      qty: "", dueDate: "", expectedDate: "", destination: null,
    }]);
    setPick("");
  };
  const setField = (ri, k, v) => setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, [k]: v } : r)));
  const removeRow = (ri) => setRows((prev) => prev.filter((_, i) => i !== ri));

  const submit = async () => {
    const lines = rows
      .map((r) => ({ fgCode: r.fgCode, qty: Number(r.qty), dueDate: r.dueDate || null, expectedDate: r.expectedDate || null, destination: r.destination || null }))
      .filter((l) => l.fgCode && Number.isFinite(l.qty) && l.qty > 0);
    if (!poNumber.trim()) { setError("ระบุเลขที่ PO"); return; }
    if (!lines.length) { setError("เพิ่มรายการสินค้าอย่างน้อย 1 (มีจำนวน > 0)"); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/sahamit/po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poNumber: poNumber.trim(), docDate, receivedDate, quoteRef, note, lines }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "บันทึกไม่สำเร็จ");
      onCreated?.(json);
      onClose?.();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const hasUnknown = rows.some((r) => !r.known);

  return (
    <Modal open={open} onClose={onClose} title="บันทึก PO ใหม่" size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="form-grid cols-2">
          <div className="form-group">
            <label>เลขที่ PO <span style={{ color: "var(--red)" }}>*</span></label>
            <input className="premium-input font-mono" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="เช่น PO-2607-001" />
          </div>
          <div className="form-group">
            <label>วันที่เอกสาร</label>
            <input type="date" className="premium-input" value={docDate} onChange={(e) => setDocDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>วันที่รับ PO</label>
            <input type="date" className="premium-input" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>อ้างอิงใบเสนอราคา</label>
            <input className="premium-input" value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} placeholder="(ไม่บังคับ)" />
          </div>
        </div>
        <div className="form-group">
          <label>หมายเหตุ</label>
          <input className="premium-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ไม่บังคับ)" />
        </div>

        {/* Add product line */}
        <div className="form-group">
          <label>เพิ่มรายการสินค้า</label>
          <div style={{ display: "flex", gap: "6px" }}>
            <div style={{ flex: 1 }}>
              <SearchableSelect
                size="sm"
                allowFreeText
                options={products.map((p) => {
                  const meta = productMeta(p);
                  return {
                    value: p.fgCode,
                    label: `${p.fgCode} — ${p.name || ""}${meta ? ` (${meta})` : ""}`,
                    search: `${p.fgCode || ""} ${p.name || ""} ${p.brandName || ""}`,
                    render: (
                      <span>
                        <strong>{p.fgCode}</strong> — {p.name || ""}
                        {meta && <span style={{ color: "var(--text-3)" }}> ({meta})</span>}
                      </span>
                    ),
                  };
                })}
                value={pick}
                onChange={setPick}
                placeholder="ค้นหารหัส / ชื่อสินค้า แล้วกดเพิ่ม"
              />
            </div>
            <button type="button" className="btn" onClick={() => addRow(pick)} style={{ height: "30px", flexShrink: 0 }}><Plus size={15} /> เพิ่ม</button>
          </div>
        </div>

        {hasUnknown && (
          <div className="ui-badge" style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--amber)", borderColor: "var(--amber)" }}>
            <AlertTriangle size={14} /> มีรหัสที่ไม่รู้จัก (บันทึกได้ แต่ยังไม่ผูกสินค้า)
          </div>
        )}
        {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>{error}</div>}

        {rows.length > 0 && (
          <div className="premium-table-wrapper" style={{ maxHeight: "40vh", overflow: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>รหัสสินค้า</th><th>ชื่อสินค้า</th>
                  <th style={{ textAlign: "right" }}>จำนวน</th>
                  <th>กำหนดส่ง</th><th>คาดการณ์ส่ง</th><th>สถานที่ส่ง</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={`${r.fgCode}-${ri}`}>
                    <td className="font-mono" style={{ fontWeight: 600 }}>
                      {r.fgCode}{!r.known && <span title="ไม่รู้จัก" style={{ color: "var(--amber)", marginLeft: 4 }}>⚠</span>}
                    </td>
                    <td style={{ color: r.known ? "inherit" : "var(--amber)" }}>
                      {r.productName || "— ไม่รู้จัก —"}
                      {r.productMeta && <span style={{ color: "var(--text-3)", fontSize: 12 }}> ({r.productMeta})</span>}
                    </td>
                    <td style={{ padding: 2 }}>
                      <input type="number" min={0} className="premium-input" style={{ width: 90, textAlign: "right", height: 30 }}
                        value={r.qty} onChange={(e) => setField(ri, "qty", e.target.value)} />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input type="date" className="premium-input" style={{ height: 30 }} value={r.dueDate} onChange={(e) => setField(ri, "dueDate", e.target.value)} />
                    </td>
                    <td style={{ padding: 2 }}>
                      <input type="date" className="premium-input" style={{ height: 30 }} value={r.expectedDate} onChange={(e) => setField(ri, "expectedDate", e.target.value)} />
                    </td>
                    <td style={{ padding: 2 }}>
                      <DestinationToggle value={r.destination} onChange={(v) => setField(ri, "destination", v)} />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button type="button" className="btn-icon" title="ลบแถว" onClick={() => removeRow(ri)}><X size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn btn-primary px-6" onClick={submit} disabled={busy || !rows.length}>
            {busy ? "กำลังบันทึก..." : "บันทึก PO"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
