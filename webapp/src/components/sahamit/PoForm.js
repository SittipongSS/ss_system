"use client";
// ฟอร์ม PO — ใช้ร่วม 2 จุด: หน้าสร้าง (/sahamit/po/new) กับหน้าแก้ (/sahamit/po/[id]/edit)
// เพื่อไม่ให้สองฟอร์มเพี้ยนหากัน (แพตเทิร์นเดียวกับ DealFormFields).
// กำหนดรับของ + สถานที่ส่ง เป็นระดับหัว PO (ทั้ง PO ใช้ค่าเดียว); รายการใส่แค่จำนวน.
// ตอนแก้: บรรทัดที่ผูกแล้ว (วัสดุ/แบ่งส่ง/ส่งของแล้ว) ถูกล็อก — โชว์เหตุผล แก้ไม่ได้
// ไม่มี auto-save — กดบันทึกครั้งเดียวส่งทั้งหัวและบรรทัด ([[no-autosave-explicit-save]])
import { useMemo, useState } from "react";
import { Lock, Plus, X, AlertTriangle } from "lucide-react";
import DateInput from "@/components/ui/DateInput";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { DestinationToggle } from "@/components/sahamit/destinations";
import { productMeta } from "@/lib/format";
import { productSelectOptions } from "@/components/master/productOption";
import { ppcOf, casesText, convertEntryUnit } from "@/lib/sahamit/units";

export const todayStr = () => new Date().toISOString().slice(0, 10);

export const emptyPoHeader = () => ({
  poNumber: "", docDate: todayStr(), receivedDate: todayStr(),
  dueDate: "", destination: null, quoteRef: "", note: "",
});

// แปลง PO จาก API → state ของฟอร์ม (หน้าแก้ใช้ตอนโหลด)
export const poToForm = (po) => ({
  header: {
    poNumber: po.poNumber || "", docDate: po.docDate || "", receivedDate: po.receivedDate || "",
    dueDate: po.dueDate || "", destination: po.destination ?? null,
    quoteRef: po.quoteRef || "", note: po.note || "",
  },
  rows: (po.lines || []).map((l) => ({
    id: l.id, fgCode: l.fgCode, productName: l.productName || null,
    productMeta: "", known: !!l.productId, qty: l.qty ?? "",
  })),
});

export default function PoForm({
  header, onHeader,          // {poNumber,...}, (patch) => void
  rows, onRows,              // [{id?, fgCode, qty, ...}], (nextRows) => void
  products = [],
  entryUnit, onEntryUnit,    // "piece" | "case"
  // สลับหน่วยได้เฉพาะตอนสร้าง: DB เก็บเป็นชิ้น ถ้าหน้าแก้โหลด 120 (ชิ้น) มาแล้วผู้ใช้
  // กดเป็น "ลัง" เลขเดิมจะถูกตีความใหม่เป็น 120 ลัง = ข้อมูลเพี้ยนเงียบ ๆ
  allowUnitToggle = true,
  // บันทึกย้อนหลัง (เฉพาะหน้าสร้าง): { delivered, deliveredDate } + onBackfill(patch).
  // ส่ง null = ไม่โชว์ (หน้าแก้สถานะทำรายบรรทัดที่หน้ารายละเอียด PO อยู่แล้ว)
  backfill = null, onBackfill = () => {},
  lockOf = () => null,       // (row) => เหตุผลที่ล็อก | null — หน้าสร้างไม่ส่ง = แก้ได้หมด
  disabled = false,
}) {
  const [pick, setPick] = useState("");

  const productIndex = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(String(p.fgCode).trim().toLowerCase(), p);
    return m;
  }, [products]);
  const ppcForRow = (r) => ppcOf(r.known ? productIndex.get(String(r.fgCode).trim().toLowerCase()) : null);

  const set = (k) => (v) => onHeader({ [k]: v });

  const addRow = (fgCodeRaw) => {
    const code = String(fgCodeRaw || "").trim();
    if (!code) return;
    if (rows.some((r) => r.fgCode.toLowerCase() === code.toLowerCase())) { setPick(""); return; }
    const hit = productIndex.get(code.toLowerCase());
    onRows([...rows, { fgCode: hit?.fgCode || code, productName: hit?.name || null, productMeta: hit ? productMeta(hit) : "", known: !!hit, qty: "" }]);
    setPick("");
  };
  const setQty = (ri, v) => onRows(rows.map((r, i) => (i === ri ? { ...r, qty: v } : r)));
  const removeRow = (ri) => onRows(rows.filter((_, i) => i !== ri));

  // สลับหน่วยกรอก ชิ้น⇄ลัง แล้วแปลงตัวเลขทุกแถวตาม (คงจำนวนชิ้นจริง) — ไม่ใช่แค่
  // เปลี่ยนป้ายหน่วยแล้วตีความใหม่. SKU ที่ยังไม่รู้ชิ้นต่อลังคงค่าเดิม (missingPpc กันตอนบันทึก).
  const changeUnit = (next) => {
    if (next === entryUnit) return;
    onRows(rows.map((r) => ({ ...r, qty: convertEntryUnit(r.qty, entryUnit, next, ppcForRow(r)) })));
    onEntryUnit(next);
  };

  const hasUnknown = rows.some((r) => !r.known);
  const lockedCount = rows.filter((r) => lockOf(r)).length;

  return (
    <>
      {/* หัวเอกสาร PO */}
      <div className="glass-panel" style={{ padding: 18 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>ข้อมูลหัว PO</div>
        <div className="form-grid cols-3">
          <div className="form-group">
            <label>เลขที่ PO <span style={{ color: "var(--red)" }}>*</span></label>
            <input className="premium-input font-mono" value={header.poNumber} disabled={disabled}
              onChange={(e) => onHeader({ poNumber: e.target.value })} placeholder="เช่น PO-2607-001" />
          </div>
          <div className="form-group">
            <label>วันที่เอกสาร</label>
            <DateInput value={header.docDate} onChange={set("docDate")} disabled={disabled} />
          </div>
          <div className="form-group">
            <label>วันที่รับ PO</label>
            <DateInput value={header.receivedDate} onChange={set("receivedDate")} disabled={disabled} />
          </div>
          <div className="form-group">
            <label>กำหนดรับของ (ทั้ง PO)</label>
            <DateInput value={header.dueDate} onChange={set("dueDate")} disabled={disabled} />
          </div>
          <div className="form-group">
            <label>สถานที่ส่ง (ทั้ง PO)</label>
            <DestinationToggle value={header.destination} onChange={set("destination")} />
          </div>
          <div className="form-group">
            <label>อ้างอิงใบเสนอราคา</label>
            <input className="premium-input" value={header.quoteRef} disabled={disabled}
              onChange={(e) => onHeader({ quoteRef: e.target.value })} placeholder="(ไม่บังคับ)" />
          </div>
        </div>
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>หมายเหตุ</label>
          <input className="premium-input" value={header.note} disabled={disabled}
            onChange={(e) => onHeader({ note: e.target.value })} placeholder="(ไม่บังคับ)" />
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
              options={productSelectOptions(products, (p) => p.fgCode)}
              value={pick}
              onChange={setPick}
              disabled={disabled}
              placeholder="ค้นหารหัส / ชื่อสินค้า แล้วกดเพิ่ม"
            />
          </div>
          <button type="button" className="btn" onClick={() => addRow(pick)} disabled={disabled} style={{ height: 30, flexShrink: 0 }}><Plus size={15} /> เพิ่ม</button>
        </div>
      </div>

      {backfill && (
        <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--blue)", display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: disabled ? "default" : "pointer" }}>
            <input
              type="checkbox"
              checked={!!backfill.delivered}
              disabled={disabled}
              onChange={(e) => onBackfill({ delivered: e.target.checked })}
            />
            บันทึกย้อนหลัง — PO นี้ส่งของครบแล้ว (ทุกบรรทัดขึ้นสถานะ “ส่งแล้ว”)
          </label>
          {backfill.delivered && (
            <div className="form-group" style={{ maxWidth: 240, margin: 0 }}>
              <label>วันที่ส่งมอบจริง</label>
              <DateInput value={backfill.deliveredDate || ""} onChange={(v) => onBackfill({ deliveredDate: v })} disabled={disabled} />
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>เว้นว่าง = ใช้กำหนดรับของ หรือวันที่รับ PO</span>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && allowUnitToggle && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>กรอกจำนวนเป็น:</span>
          <div className="segmented">
            <button type="button" className={entryUnit === "piece" ? "active" : ""} onClick={() => changeUnit("piece")}>ชิ้น</button>
            <button type="button" className={entryUnit === "case" ? "active" : ""} onClick={() => changeUnit("case")}>ลัง</button>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            {entryUnit === "case" ? "สลับหน่วยแล้วเลขแปลงตามอัตโนมัติ · ระบบเก็บเป็นชิ้น (คูณชิ้นต่อลัง)" : "เก็บตามที่กรอก (ชิ้น)"}
          </span>
        </div>
      )}

      {hasUnknown && (
        <div className="ui-badge" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--amber)", borderColor: "var(--amber)" }}>
          <AlertTriangle size={14} /> มีรหัสที่ไม่รู้จัก (บันทึกได้ แต่ยังไม่ผูกสินค้า)
        </div>
      )}
      {lockedCount > 0 && (
        <div className="ui-badge" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-3)" }}>
          <Lock size={13} /> {lockedCount} รายการถูกล็อก (ผูกกับวัสดุ/การแบ่งส่ง/ส่งของแล้ว) — แก้จำนวนหรือลบไม่ได้
        </div>
      )}

      {rows.length > 0 && (
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th style={{ textAlign: "right" }}>จำนวน ({entryUnit === "case" ? "ลัง" : "ชิ้น"})</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const lock = lockOf(r);
                return (
                  <tr key={r.id || `${r.fgCode}-${ri}`}>
                    <td className="font-mono" style={{ fontWeight: 600 }}>
                      {r.fgCode}{!r.known && <span title="ไม่รู้จัก" style={{ color: "var(--amber)", marginLeft: 4 }}>⚠</span>}
                    </td>
                    <td style={{ color: r.known ? "inherit" : "var(--amber)" }}>
                      {r.productName || "— ไม่รู้จัก —"}
                      {r.productMeta && <span style={{ color: "var(--text-3)", fontSize: 12 }}> ({r.productMeta})</span>}
                      {lock && <span style={{ color: "var(--text-3)", fontSize: 11.5, marginLeft: 6 }}>· ล็อก: {lock}</span>}
                    </td>
                    <td style={{ padding: 2, textAlign: "right" }}>
                      <input type="number" min={0} className="premium-input" style={{ width: 120, textAlign: "right", height: 30 }}
                        value={r.qty} disabled={disabled || !!lock} onChange={(e) => setQty(ri, e.target.value)} />
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
                      {lock
                        ? <Lock size={13} style={{ color: "var(--text-3)" }} aria-label={`ล็อก: ${lock}`} />
                        : <button type="button" className="btn-icon" title="ลบแถว" disabled={disabled} onClick={() => removeRow(ri)}><X size={14} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// แปลงแถวในฟอร์ม → payload lines (ชิ้นเป็น canonical: กรอกลัง = คูณชิ้นต่อลัง)
// คืน { lines, missingPpc } — missingPpc = SKU ที่กรอกลังไม่ได้เพราะยังไม่ตั้งชิ้นต่อลัง
export function rowsToLines(rows, entryUnit, ppcForRow) {
  const isCase = entryUnit === "case";
  const missingPpc = [];
  const lines = [];
  for (const r of rows) {
    const qty = Number(r.qty);
    if (!r.fgCode || !Number.isFinite(qty) || qty <= 0) continue;
    const ppc = ppcForRow(r);
    if (isCase) {
      if (!ppc) { if (!missingPpc.includes(r.fgCode)) missingPpc.push(r.fgCode); continue; }
      lines.push({ ...(r.id ? { id: r.id } : {}), fgCode: r.fgCode, qty: Math.round(qty * ppc) });
    } else {
      lines.push({ ...(r.id ? { id: r.id } : {}), fgCode: r.fgCode, qty });
    }
  }
  return { lines, missingPpc };
}
