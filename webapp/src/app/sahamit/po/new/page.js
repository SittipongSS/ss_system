"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, X, AlertTriangle } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DateInput from "@/components/ui/DateInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { DestinationToggle } from "@/components/sahamit/destinations";
import { useApiList } from "@/lib/excise/useApiList";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { productMeta } from "@/lib/format";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { useCan } from "@/lib/roleContext";

// สร้าง PO — หน้าเต็ม. กำหนดรับของ + สถานที่ส่ง เป็นระดับหัว PO (ทั้ง PO ใช้ค่าเดียว);
// รายการสินค้าใส่แค่ จำนวน. เรียงฟอร์ม: หัวเอกสาร → เพิ่มรายการ → ตารางรายการ.
const today = () => new Date().toISOString().slice(0, 10);

export default function PoCreatePage() {
  const router = useRouter();
  const canEdit = useCan("sahamit:edit");
  const { data: products } = useApiList("/api/sahamit/products");

  const [poNumber, setPoNumber] = useState("");
  const [docDate, setDocDate] = useState(today);
  const [receivedDate, setReceivedDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [destination, setDestination] = useState(null);
  const [quoteRef, setQuoteRef] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState([]); // [{fgCode, productName, productMeta, known, qty}]
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // หน่วยที่กรอก: ชิ้น (canonical) หรือ ลัง (คูณชิ้นต่อลังตอนบันทึก)
  const [entryUnit, setEntryUnit] = useState("piece");

  const productIndex = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);
  const ppcForRow = (r) => ppcOf(r.known ? productIndex.get(String(r.fgCode).trim().toLowerCase()) : null);

  const addRow = (fgCodeRaw) => {
    const code = String(fgCodeRaw || "").trim();
    if (!code) return;
    if (rows.some((r) => r.fgCode.toLowerCase() === code.toLowerCase())) { setPick(""); return; }
    const hit = productIndex.get(code.toLowerCase());
    setRows((prev) => [...prev, { fgCode: hit?.fgCode || code, productName: hit?.name || null, productMeta: hit ? productMeta(hit) : "", known: !!hit, qty: "" }]);
    setPick("");
  };
  const setQty = (ri, v) => setRows((prev) => prev.map((r, i) => (i === ri ? { ...r, qty: v } : r)));
  const removeRow = (ri) => setRows((prev) => prev.filter((_, i) => i !== ri));

  const hasUnknown = rows.some((r) => !r.known);
  const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  const submit = async () => {
    // ชิ้นเป็น canonical: กรอกลัง → คูณชิ้นต่อลัง (ต่อ SKU) ก่อนบันทึก.
    const isCase = entryUnit === "case";
    const missingPpc = [];
    const lines = [];
    for (const r of rows) {
      const qty = Number(r.qty);
      if (!r.fgCode || !Number.isFinite(qty) || qty <= 0) continue;
      const ppc = ppcForRow(r);
      if (isCase) {
        if (!ppc) { if (!missingPpc.includes(r.fgCode)) missingPpc.push(r.fgCode); continue; }
        lines.push({ fgCode: r.fgCode, qty: Math.round(qty * ppc) });
      } else {
        lines.push({ fgCode: r.fgCode, qty });
      }
    }
    if (!poNumber.trim()) { setError("ระบุเลขที่ PO"); return; }
    if (isCase && missingPpc.length) {
      setError(`กรอกเป็นลังไม่ได้ — สินค้ายังไม่ได้ตั้ง "ชิ้นต่อลัง": ${missingPpc.join(", ")} (ตั้งที่ข้อมูลสินค้า หรือสลับหน่วยเป็นชิ้น)`);
      return;
    }
    if (!lines.length) { setError("เพิ่มรายการสินค้าอย่างน้อย 1 (มีจำนวน > 0)"); return; }
    setBusy(true); setError("");
    try {
      await sahamitFetch("/api/sahamit/po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poNumber: poNumber.trim(), docDate, receivedDate, dueDate: dueDate || null, destination, quoteRef, note, lines }),
      });
      router.push("/sahamit/po");
    } catch (e) { setError(e.message); setBusy(false); }
  };

  // viewer (ไม่มี sahamit:edit) เข้าหน้าสร้าง PO ไม่ได้ — โชว์ข้อความอย่างเดียว
  if (!canEdit) {
    return (
      <Workspace
        icon={<FileText size={22} />}
        title="บันทึก PO ใหม่"
        subtitle="กำหนดรับ + สถานที่ส่ง = ทั้ง PO · รายการใส่แค่จำนวน (ลูกค้า AR-109)"
        back={{ href: "/sahamit/po", label: "Purchase Orders" }}
      >
        <div className="empty-state dashed" style={{ padding: 48, textAlign: "center", color: "var(--text-3)" }}>
          <FileText size={28} strokeWidth={1.5} style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 600, fontSize: 15 }}>ไม่มีสิทธิ์สร้าง PO</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>บัญชีนี้ดูข้อมูลได้อย่างเดียว</div>
        </div>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<FileText size={22} />}
      title="บันทึก PO ใหม่"
      subtitle="กำหนดรับ + สถานที่ส่ง = ทั้ง PO · รายการใส่แค่จำนวน (ลูกค้า AR-109)"
      back={{ href: "/sahamit/po", label: "Purchase Orders" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 900 }}>
        {/* หัวเอกสาร PO */}
        <div className="glass-panel" style={{ padding: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>ข้อมูลหัว PO</div>
          <div className="form-grid cols-3">
            <div className="form-group">
              <label>เลขที่ PO <span style={{ color: "var(--red)" }}>*</span></label>
              <input className="premium-input font-mono" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="เช่น PO-2607-001" />
            </div>
            <div className="form-group">
              <label>วันที่เอกสาร</label>
              <DateInput value={docDate} onChange={setDocDate} />
            </div>
            <div className="form-group">
              <label>วันที่รับ PO</label>
              <DateInput value={receivedDate} onChange={setReceivedDate} />
            </div>
            <div className="form-group">
              <label>กำหนดรับของ (ทั้ง PO)</label>
              <DateInput value={dueDate} onChange={setDueDate} />
            </div>
            <div className="form-group">
              <label>สถานที่ส่ง (ทั้ง PO)</label>
              <DestinationToggle value={destination} onChange={setDestination} />
            </div>
            <div className="form-group">
              <label>อ้างอิงใบเสนอราคา</label>
              <input className="premium-input" value={quoteRef} onChange={(e) => setQuoteRef(e.target.value)} placeholder="(ไม่บังคับ)" />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>หมายเหตุ</label>
            <input className="premium-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ไม่บังคับ)" />
          </div>
        </div>

        {/* เพิ่มรายการสินค้า */}
        <div className="form-group">
          <label>เพิ่มรายการสินค้า</label>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }}>
              <SearchableSelect
                entity="product"
                size="sm"
                allowFreeText
                options={products.map((p) => {
                  const meta = productMeta(p);
                  return {
                    value: p.fgCode,
                    label: `${p.fgCode} — ${p.name || ""}${meta ? ` (${meta})` : ""}`,
                    search: `${p.fgCode || ""} ${p.name || ""} ${p.brandName || ""}`,
                    render: (<span><strong>{p.fgCode}</strong> — {p.name || ""}{meta && <span style={{ color: "var(--text-3)" }}> ({meta})</span>}</span>),
                  };
                })}
                value={pick}
                onChange={setPick}
                placeholder="ค้นหารหัส / ชื่อสินค้า แล้วกดเพิ่ม"
              />
            </div>
            <button type="button" className="btn" onClick={() => addRow(pick)} style={{ height: 30, flexShrink: 0 }}><Plus size={15} /> เพิ่ม</button>
          </div>
        </div>

        {rows.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>กรอกจำนวนเป็น:</span>
            <div className="segmented">
              <button type="button" className={entryUnit === "piece" ? "active" : ""} onClick={() => setEntryUnit("piece")}>ชิ้น</button>
              <button type="button" className={entryUnit === "case" ? "active" : ""} onClick={() => setEntryUnit("case")}>ลัง</button>
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
              {entryUnit === "case" ? "ระบบจะคูณ “ชิ้นต่อลัง” แล้วเก็บเป็นชิ้น" : "เก็บตามที่กรอก (ชิ้น)"}
            </span>
          </div>
        )}

        {hasUnknown && (
          <div className="ui-badge" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--amber)", borderColor: "var(--amber)" }}>
            <AlertTriangle size={14} /> มีรหัสที่ไม่รู้จัก (บันทึกได้ แต่ยังไม่ผูกสินค้า)
          </div>
        )}
        {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}

        {rows.length > 0 && (
          <div className="premium-table-wrapper">
            <table className="premium-table">
              <thead>
                <tr><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th style={{ textAlign: "right" }}>จำนวน ({entryUnit === "case" ? "ลัง" : "ชิ้น"})</th><th></th></tr>
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
                    <td style={{ padding: 2, textAlign: "right" }}>
                      <input type="number" min={0} className="premium-input" style={{ width: 120, textAlign: "right", height: 30 }} value={r.qty} onChange={(e) => setQty(ri, e.target.value)} />
                      {(() => {
                        const ppc = ppcForRow(r);
                        const n = Number(r.qty);
                        if (!ppc || !Number.isFinite(n) || n <= 0) return null;
                        const hint = entryUnit === "case"
                          ? `= ${Math.round(n * ppc).toLocaleString("th-TH")} ชิ้น`
                          : (casesText(n, ppc) ? `= ${casesText(n, ppc)}` : null);
                        return hint ? <div style={{ fontSize: 10, color: "var(--text-3)" }}>{hint}</div> : null;
                      })()}
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <span style={{ fontSize: 13, color: "var(--text-3)" }}>
            {rows.length ? `${rows.length} รายการ · รวม ${totalQty.toLocaleString("th-TH")} ${entryUnit === "case" ? "ลัง" : "ชิ้น"}` : "ยังไม่มีรายการ"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={() => router.push("/sahamit/po")} disabled={busy}>ยกเลิก</button>
            <button type="button" className="btn btn-primary px-6" onClick={submit} disabled={busy || !rows.length}>
              {busy ? "กำลังบันทึก..." : "บันทึก PO"}
            </button>
          </div>
        </div>
      </div>
    </Workspace>
  );
}
