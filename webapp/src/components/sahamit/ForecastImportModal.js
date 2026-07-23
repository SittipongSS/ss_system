"use client";
import DateInput from "@/components/ui/DateInput";
import { useEffect, useMemo, useState } from "react";
import { Upload, Download, AlertTriangle, Plus, X, Pencil, Copy, History } from "lucide-react";
import Modal from "@/components/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { roundMatrix } from "@/lib/sahamit/forecastClient";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { productMeta } from "@/lib/format";
import { productSelectOptions } from "@/components/master/productOption";
import { ppcOf } from "@/lib/sahamit/units";

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

export default function ForecastImportModal({ open, onClose, onCreated, products = [], editRound = null, existingRounds = [], onEditExisting }) {
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
  // หน่วยที่ผู้ใช้กรอกในกริด: ชิ้น (ค่าเริ่มต้น = canonical) หรือ ลัง (คูณชิ้นต่อลังตอนบันทึก).
  const [entryUnit, setEntryUnit] = useState("piece");

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

  // Load a round's lines into the grid (months pinned to the round's span).
  // Shared by edit-prefill and "seed create grid from the previous round".
  const loadRoundIntoGrid = (round) => {
    const matrix = roundMatrix(round);
    const months = (round.coverMonths || []).length ? [...round.coverMonths].sort() : matrix.months;
    setMonthsOverride(months);
    if (months.length) { setStartMonth(months[0]); setEndMonth(months[months.length - 1]); }
    setRows(matrix.rows.map((r) => {
      const hit = productIndex.get(String(r.fgCode || "").trim().toLowerCase());
      return { fgCode: r.fgCode, productName: r.productName || hit?.name || null, productMeta: hit ? productMeta(hit) : "", known: !!hit, qty: { ...r.qty } };
    }));
  };

  // Reset (create) or prefill (edit) when the modal is (re)opened or the target
  // round changes. In edit mode the grid is loaded from the round's lines.
  useEffect(() => {
    if (!open) return;
    setUnknown([]); setPick(""); setError(""); setBusy(false); setEntryUnit("piece");
    if (editRound) {
      setReceivedDate(String(editRound.receivedDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10));
      setNote(editRound.note || "");
      loadRoundIntoGrid(editRound);
    } else {
      setReceivedDate(new Date().toISOString().slice(0, 10));
      setNote(""); setStartMonth(thisMonth()); setEndMonth(addMonths(thisMonth(), 3));
      setMonthsOverride(null); setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editRound]);

  // Month columns run from start to end (independent from/to pickers). Changing
  // either clears any upload-pinned months; the grid columns update live.
  const onStart = (v) => { setMonthsOverride(null); setStartMonth(v); };
  const onEnd = (v) => { setMonthsOverride(null); setEndMonth(v); };

  const addRow = (fgCodeRaw) => {
    const code = String(fgCodeRaw || "").trim();
    if (!code) return;
    if (rows.some((r) => r.fgCode.toLowerCase() === code.toLowerCase())) { setPick(""); return; }
    const hit = productIndex.get(code.toLowerCase());
    setRows((prev) => [...prev, { fgCode: hit?.fgCode || code, productName: hit?.name || null, productMeta: hit ? productMeta(hit) : "", known: !!hit, qty: {} }]);
    setPick("");
  };

  const addAllProducts = () => {
    const existing = new Set(rows.map((r) => r.fgCode.toLowerCase()));
    const add = products
      .filter((p) => !existing.has(String(p.fgCode).toLowerCase()))
      .map((p) => ({ fgCode: p.fgCode, productName: p.name, productMeta: productMeta(p), known: true, qty: {} }));
    setRows((prev) => [...prev, ...add]);
  };

  // "ใช้ FC รอบก่อนหน้า" (create mode): seed the grid from the latest existing
  // round — same products/months/quantities as a starting point, then the user
  // adjusts and saves as a genuinely new round. Quantities are canonical pieces,
  // so the entry unit is reset to "ชิ้น" to avoid re-multiplying on save.
  const latestRound = useMemo(() => {
    if (editRound || !existingRounds.length) return null;
    return existingRounds.reduce((a, b) => (Number(b.roundNo) >= Number(a.roundNo) ? b : a));
  }, [editRound, existingRounds]);

  const seedFromLatest = () => {
    if (!latestRound) return;
    if (rows.length && !confirm(`แทนที่ข้อมูลในกริดด้วย FC รอบที่ ${latestRound.roundNo}?`)) return;
    setUnknown([]); setError(""); setEntryUnit("piece");
    loadRoundIntoGrid(latestRound);
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
      const json = await sahamitFetch("/api/sahamit/forecast/import", { method: "POST", body: fd });
      const fileMonths = json.months || [];
      setMonthsOverride(fileMonths);
      if (fileMonths.length) { setStartMonth(fileMonths[0]); setEndMonth(fileMonths[fileMonths.length - 1]); }
      setRows((json.rows || []).map((r) => {
        const hit = productIndex.get(String(r.fgCode || "").trim().toLowerCase());
        return { fgCode: r.fgCode, productName: r.productName, productMeta: hit ? productMeta(hit) : "", known: r.known, qty: { ...r.qtyByMonth } };
      }));
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
    // ชิ้นเป็น canonical เสมอ: ถ้ากรอกเป็น "ลัง" ให้คูณชิ้นต่อลัง (ต่อ SKU) ก่อนบันทึก.
    const isCase = entryUnit === "case";
    const lines = [];
    const missingPpc = [];
    for (const r of rows) {
      const ppc = ppcOf(productIndex.get(String(r.fgCode).trim().toLowerCase()));
      for (const m of months) {
        const q = Number(r.qty[m]);
        if (!Number.isFinite(q) || q <= 0) continue;
        if (isCase) {
          if (!ppc) { if (!missingPpc.includes(r.fgCode)) missingPpc.push(r.fgCode); continue; }
          lines.push({ fgCode: r.fgCode, month: m, qty: Math.round(q * ppc) });
        } else {
          lines.push({ fgCode: r.fgCode, month: m, qty: q });
        }
      }
    }
    if (!receivedDate) { setError("ระบุวันที่รับ FC"); return; }
    if (!months.length) { setError("ช่วงเดือนไม่ถูกต้อง (เดือนสุดท้ายต้องไม่ก่อนเดือนเริ่มต้น)"); return; }
    if (isCase && missingPpc.length) {
      setError(`กรอกเป็นลังไม่ได้ — สินค้ายังไม่ได้ตั้ง "ชิ้นต่อลัง": ${missingPpc.join(", ")} (ตั้งที่ข้อมูลสินค้า หรือสลับหน่วยเป็นชิ้น)`);
      return;
    }
    if (!lines.length) { setError("กรอกจำนวน FC อย่างน้อย 1 รายการ"); return; }
    setBusy(true); setError("");
    try {
      const json = await sahamitFetch(
        editRound ? `/api/sahamit/forecast/rounds/${editRound.id}` : "/api/sahamit/forecast/rounds",
        {
          method: editRound ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receivedDate, note, coverMonths: months, lines }),
        },
      );
      onCreated?.(json);
      onClose?.();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const hasGrid = months.length > 0 && rows.length > 0;
  // Duplicate received-date guard (create mode only): flag if another round was
  // already logged on this date — likely a re-entry of data already captured.
  const dupRound = !editRound && existingRounds.find((r) => String(r.receivedDate || "").slice(0, 10) === receivedDate);
  // Backfill hint (create mode): a received date older than the latest round is
  // slotted into the chronology by the server — show where it will land.
  const backfillPos = useMemo(() => {
    if (editRound || !existingRounds.length || !receivedDate) return null;
    const dates = existingRounds.map((r) => String(r.receivedDate || "").slice(0, 10));
    if (receivedDate >= dates.reduce((a, b) => (b > a ? b : a))) return null;
    return dates.filter((d) => d <= receivedDate).length + 1;
  }, [editRound, existingRounds, receivedDate]);

  return (
    <Modal open={open} onClose={onClose} title={editRound ? `แก้ FC รอบที่ ${editRound.roundNo}` : "นำเข้ารอบ FC ใหม่"} size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Round meta + month range (start → last month; grid updates live) */}
        <div className="form-grid cols-3">
          <div className="form-group">
            <label>วันที่รับ FC <span style={{ color: "var(--red)" }}>*</span></label>
            <DateInput value={receivedDate} onChange={setReceivedDate} />
          </div>
          <div className="form-group">
            <label>เดือนเริ่มต้น</label>
            <input type="month" className="premium-input" value={startMonth} onChange={(e) => onStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label>เดือนสุดท้ายของรอบ</label>
            <input type="month" className="premium-input" value={endMonth} min={startMonth} onChange={(e) => onEnd(e.target.value)} />
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
              <div style={{ flex: 1 }}>
                <SearchableSelect
                  entity="product"
                  size="sm"
                  allowFreeText
                  options={productSelectOptions(products, (p) => p.fgCode)}
                  value={pick}
                  onChange={setPick}
                  placeholder="ค้นหารหัส / ชื่อสินค้า แล้วกดเพิ่ม"
                />
              </div>
              <button type="button" className="btn" onClick={() => addRow(pick)} style={{ height: "30px", flexShrink: 0 }}><Plus size={15} /> เพิ่ม</button>
            </div>
          </div>
          {latestRound && (
            <button type="button" className="btn ghost" onClick={seedFromLatest} title={`ดึงสินค้า เดือน และจำนวนจากรอบที่ ${latestRound.roundNo} มาเป็นตั้งต้น`}>
              <Copy size={15} /> ใช้ FC รอบก่อนหน้า (#{latestRound.roundNo})
            </button>
          )}
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

        {dupRound && (
          <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--amber)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <AlertTriangle size={16} style={{ color: "var(--amber)" }} />
            <span style={{ fontSize: 13 }}>
              วันที่รับนี้เคยลง<strong> รอบที่ {dupRound.roundNo} </strong>แล้ว — อาจลงข้อมูลซ้ำ
            </span>
            {onEditExisting && (
              <button type="button" className="btn sm" style={{ marginLeft: "auto" }} onClick={() => onEditExisting(dupRound)}>
                <Pencil size={14} /> ไปแก้รอบ {dupRound.roundNo}
              </button>
            )}
          </div>
        )}

        {backfillPos != null && (
          <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--blue)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <History size={16} style={{ color: "var(--blue)" }} />
            <span style={{ fontSize: 13 }}>
              วันที่รับนี้เก่ากว่ารอบล่าสุด — จะแทรกเป็น<strong> รอบที่ {backfillPos} </strong>ตามลำดับวันที่รับ (เลขรอบหลังจากนั้นขยับขึ้นให้อัตโนมัติ)
            </span>
          </div>
        )}

        {unknown.length > 0 && (
          <div className="ui-badge" style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--amber)", borderColor: "var(--amber)" }}>
            <AlertTriangle size={14} /> รหัสไม่รู้จัก {unknown.length} รายการ: {unknown.join(", ")} (บันทึกได้ แต่ยังไม่ผูกสินค้า)
          </div>
        )}

        {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>{error}</div>}

        {/* หน่วยที่กรอกในกริด — สหมิตรคุยเป็นลัง แต่ระบบเก็บเป็นชิ้น (คูณชิ้นต่อลังตอนบันทึก) */}
        {hasGrid && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>กรอกจำนวนเป็น:</span>
            <div className="segmented">
              <button type="button" className={entryUnit === "piece" ? "active" : ""} onClick={() => setEntryUnit("piece")}>ชิ้น</button>
              <button type="button" className={entryUnit === "case" ? "active" : ""} onClick={() => setEntryUnit("case")}>ลัง</button>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {entryUnit === "case"
                ? "ระบบจะคูณ “ชิ้นต่อลัง” ของแต่ละสินค้าแล้วเก็บเป็นชิ้น"
                : "เก็บตามที่กรอก (ชิ้น)"}
            </span>
          </div>
        )}

        {/* Grid */}
        {hasGrid ? (
          <div className="premium-table-wrapper" style={{ maxHeight: "44vh", overflow: "auto" }}>
            <table className="premium-table sticky-col1">
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
                    <td style={{ color: r.known ? "inherit" : "var(--amber)" }}>
                      {r.productName || "— ไม่รู้จัก —"}
                      {r.productMeta && <span style={{ color: "var(--text-3)", fontSize: 12 }}> ({r.productMeta})</span>}
                    </td>
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
            เลือกช่วงเดือน แล้วเพิ่มสินค้าเข้ากริด (หรืออัปโหลด Excel{latestRound ? " / ใช้ FC รอบก่อนหน้า" : ""})
          </div>
        )}

        {/* Footer */}
        <div className="form-action-bar">
          <span className="text-[13px] text-[var(--text-3)]">
            {months.length ? `${months.length} เดือน` : "ช่วงเดือนไม่ถูกต้อง"}
            {hasGrid ? ` · ${rows.length} สินค้า · รวม ${totalQty.toLocaleString("th-TH")} ${entryUnit === "case" ? "ลัง" : "ชิ้น"}` : ""}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !hasGrid}>
              {busy ? "กำลังบันทึก..." : editRound ? "บันทึกการแก้ไข" : "บันทึกรอบ FC"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
