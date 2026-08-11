"use client";
import { TableScroll } from "@/components/ui/Table";
// ── ตารางชั้นราคาของวัสดุ 1 รุ่น (mig 0157) ────────────────────────────
// ใช้ทั้งตอน RD/PC ใส่ราคาในทะเบียน และ (PR-2) ตอบราคาในเคสขอราคา
//
// มติ 2026-07-26: **ชั้นจำนวนผู้ใช้ระบุเองอิสระ ห้ามกำหนดตายตัวว่าจะขอชั้นอะไรบ้าง**
// ปุ่มแนะนำด้านล่างเป็นแค่ทางลัด กดหรือไม่กดก็ได้ และพิมพ์ค่าอะไรก็ได้
//
// 1 แถว = ราคาเดียวไม่แบ่งชั้น (เว้นช่องจำนวนไว้) · หลายแถว = ต้องบอกจำนวนทุกแถว
import { Plus, Trash2 } from "lucide-react";
import { fmtNumber } from "@/lib/format";

const QTY_SHORTCUTS = [500, 1000, 3000, 5000, 10000];

export const emptyTierRow = () => ({ qty: "", price: "" });

export default function PriceTierFields({
  value = [], onChange, unitLabel = "฿/ชิ้น", disabled = false, showShortcuts = true,
}) {
  const rows = value.length ? value : [emptyTierRow()];
  const multi = rows.length > 1;

  const patch = (idx, next) => onChange(rows.map((r, i) => (i === idx ? { ...r, ...next } : r)));
  const addRow = (qty = "") => onChange([...rows, { ...emptyTierRow(), qty: String(qty || "") }]);
  const removeRow = (idx) => onChange(rows.filter((_, i) => i !== idx));

  const usedQty = new Set(rows.map((r) => String(r.qty || "").trim()).filter(Boolean));

  return (
    <div className="form-group">
      <label>ราคา ({unitLabel})</label>
      <TableScroll family="editable">
        <table className="premium-table">
          <thead>
            <tr>
              <th style={{ width: "45%" }}>สั่งตั้งแต่ (จำนวน)</th>
              <th>ราคา ({unitLabel})</th>
              {multi && <th style={{ width: 44 }} aria-label="ลบชั้น" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    className="premium-input" type="number" min="1" step="1"
                    value={row.qty} disabled={disabled}
                    placeholder={multi ? "จำเป็น" : "ไม่แบ่งชั้น"}
                    onChange={(e) => patch(idx, { qty: e.target.value })}
                    aria-label={`จำนวนของชั้นที่ ${idx + 1}`}
                  />
                </td>
                <td>
                  <input
                    className="premium-input" type="number" min="0" step="0.01"
                    value={row.price} disabled={disabled}
                    onChange={(e) => patch(idx, { price: e.target.value })}
                    aria-label={`ราคาของชั้นที่ ${idx + 1}`}
                  />
                </td>
                {multi && (
                  <td>
                    <button
                      type="button" className="btn-icon" disabled={disabled}
                      onClick={() => removeRow(idx)} aria-label={`ลบชั้นที่ ${idx + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
        <button type="button" className="btn sm" onClick={() => addRow()} disabled={disabled}>
          <Plus size={13} /> เพิ่มชั้นจำนวน
        </button>
        {showShortcuts && (
          <>
            <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>แนะนำ:</span>
            {QTY_SHORTCUTS.filter((q) => !usedQty.has(String(q))).map((q) => (
              <button
                key={q} type="button" className="chip" disabled={disabled}
                onClick={() => addRow(q)} style={{ cursor: disabled ? "not-allowed" : "pointer" }}
              >
                +{fmtNumber(q)}
              </button>
            ))}
          </>
        )}
      </div>
      <small style={{ color: "var(--text-3)" }}>
        {multi
          ? "หลายชั้น = ต้องระบุจำนวนทุกชั้น · ราคาที่ใช้จริงคือชั้นสูงสุดที่ไม่เกินจำนวนที่สั่ง"
          : "เว้นช่องจำนวนไว้ = ราคาเดียวใช้ได้ทุกจำนวน · กด \"เพิ่มชั้นจำนวน\" ถ้าราคาต่างกันตามล็อต"}
      </small>
    </div>
  );
}
