"use client";
import { useState } from "react";
import { suggestCoverage, suggestCoverageTargets } from "@/lib/sahamit/predict";
import { sahamitFetch } from "@/lib/sahamit/apiClient";
import { casesText } from "@/lib/sahamit/units";

const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// ชดเชยข้ามเดือนสำหรับช่อง (sku × เดือน) — อัตโนมัติล้วน (ไม่มีฟอร์มกรอกเอง):
//  • เดือนนี้ "ขาด" (shortage>0)   → เสนอ "ดึงจาก" เดือนที่ PO เกิน (pull in)
//  • เดือนนี้ "PO เกิน" (excess>0)  → เสนอ "ส่งไปชดเชย" เดือนที่ขาด (push out)
// การจัดลำดับ/จำนวนเป็นไปตาม logic ใน predict.js (suggestCoverage / suggestCoverageTargets).
// `matrix` = ผลจาก buildReconMatrix ที่หน้ากระทบยอดมีอยู่แล้ว.
export default function CoveragePanel({ fgCode, month, coverages, matrix, piecesPerCase = null, canEdit = true, onChanged }) {
  const [busy, setBusy] = useState(false);
  const caseSuffix = (n) => { const c = casesText(n, piecesPerCase); return c ? ` (${c})` : ""; };
  const related = (coverages || []).filter(
    (c) => c.fgCode === fgCode && (c.sourceMonth === month || c.targetMonth === month),
  );

  // ชดเชย = ย้าย FC (PO อยู่กับที่). need = PO เกิน FC (ต้องรับ FC), spare = FC เกิน PO (ส่ง FC ออกได้)
  const target = (matrix?.rows || []).find((r) => r.fgCode === fgCode)?.cells?.[month];
  const need = target ? Math.max(0, Number(target.poQty || 0) - Number(target.fcQty || 0)) : 0;
  const spare = target ? Math.max(0, Number(target.fcQty || 0) - Number(target.poQty || 0)) : 0;

  // เดือนนี้ต้องรับ FC → ดึง FC จากเดือนที่มี FC เกิน (source มี FC → target = เดือนนี้)
  const alreadyIn = new Set(related.filter((c) => c.targetMonth === month).map((c) => c.sourceMonth));
  const pullIn = need > 0 && matrix
    ? suggestCoverage(matrix, fgCode, month)
        .filter((s) => !alreadyIn.has(s.sourceMonth))
        .map((s) => ({ sourceMonth: s.sourceMonth, targetMonth: month, use: Math.min(s.canCover, need) }))
        .filter((s) => s.use > 0)
    : [];

  // เดือนนี้มี FC เกิน → ส่ง FC ไปเดือนที่มี PO ขาด FC (source = เดือนนี้ → target มี PO)
  const alreadyOut = new Set(related.filter((c) => c.sourceMonth === month).map((c) => c.targetMonth));
  const pushOut = spare > 0 && matrix
    ? suggestCoverageTargets(matrix, fgCode, month)
        .filter((t) => !alreadyOut.has(t.targetMonth))
        .map((t) => ({ sourceMonth: month, targetMonth: t.targetMonth, use: t.use }))
        .filter((t) => t.use > 0)
    : [];

  const suggestions = [...pullIn, ...pushOut];

  const confirm = async (sourceMonth, targetMonth, useQty) => {
    setBusy(true);
    try {
      await sahamitFetch("/api/sahamit/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fgCode, sourceMonth, targetMonth, qty: useQty }),
      });
      onChanged?.();
    } catch (e) {
      alert(e.message);
    }
    setBusy(false);
  };
  const remove = async (id) => {
    try {
      await sahamitFetch(`/api/sahamit/coverage/${id}`, { method: "DELETE" });
      onChanged?.();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      {/* คำแนะนำจากระบบ: ดึงเข้า (เดือนนี้ขาด) หรือ ส่งออก (เดือนนี้ PO เกิน) */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            ✨ คำแนะนำจากระบบ
            <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400 }}>
              ({need > 0 ? `เดือนนี้ PO เกิน FC ${nf(need)} — ต้องดึง FC เข้า` : `เดือนนี้ FC เกิน PO ${nf(spare)} — ส่ง FC ออกได้`})
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {suggestions.map((s) => {
              const isPull = s.targetMonth === month; // ดึงเข้าเดือนนี้
              return (
                <div
                  key={`${s.sourceMonth}->${s.targetMonth}`}
                  className="glass-panel"
                  style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, borderLeft: "3px solid var(--blue)" }}
                >
                  <div style={{ fontSize: 13, flex: 1 }}>
                    <span style={{ fontWeight: 600, color: "var(--blue)" }}>
                      💡 {isPull ? `ดึง FC จาก ${s.sourceMonth}` : `ส่ง FC ไป ${s.targetMonth}`}
                    </span>
                    <span style={{ color: "var(--text-2)" }}> ({nf(s.use)} ชิ้น{caseSuffix(s.use)})</span>
                  </div>
                  {canEdit && <button className="btn btn-primary sm" disabled={busy} onClick={() => confirm(s.sourceMonth, s.targetMonth, s.use)}>ยืนยัน</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ไม่มีการ์ดแนะนำ → บอกสถานะให้ชัดเสมอว่าทำไม */}
      {matrix && suggestions.length === 0 && (
        <div
          className="glass-panel"
          style={{ padding: 12, marginBottom: 14, fontSize: 13, color: "var(--text-2)", borderLeft: `3px solid ${need > 0 || spare > 0 ? "var(--amber)" : "var(--green)"}` }}
        >
          {need > 0 ? (
            <>
              เดือนนี้ <b>PO เกิน FC {nf(need)}</b> — <b>ยังไม่มีเดือนอื่นที่ FC เกิน PO</b> ให้ดึง FC มา
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4 }}>
                ระบบจะเสนอ “💡 ดึง FC จากเดือน…” เมื่อมีเดือนที่มี FC แต่ยังไม่มี PO (PO คงที่ ย้ายเฉพาะ FC)
              </div>
            </>
          ) : spare > 0 ? (
            <>
              เดือนนี้ <b>FC เกิน PO {nf(spare)}</b> (มี FC รอ PO) — <b>ไม่มีเดือนอื่นที่ PO เกิน FC</b> ให้ส่ง FC ไป
            </>
          ) : (
            <>เดือนนี้ FC ตรงกับ PO แล้ว — ไม่ต้องชดเชย</>
          )}
        </div>
      )}

      {/* รายการชดเชยที่ยืนยันแล้ว (ลบได้) */}
      {related.length > 0 && (
        <>
          <h3 style={{ fontWeight: 600, marginBottom: 8 }}>ชดเชยที่ยืนยันแล้ว</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13 }}>
            {related.map((c) => (
              <li key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ color: "var(--blue)" }}>{c.sourceMonth} → {c.targetMonth}</span>
                <span style={{ fontWeight: 600 }}>{Number(c.qty).toLocaleString("th-TH")}{caseSuffix(Number(c.qty))}</span>
                {c.targetMonth === month ? (
                  <span className="ui-badge" style={{ color: "var(--green)", borderColor: "var(--green)" }}>รับเข้า</span>
                ) : (
                  <span className="ui-badge" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}>ส่งออก</span>
                )}
                {canEdit && <button className="btn-icon" title="ลบ" onClick={() => remove(c.id)} style={{ marginLeft: "auto" }}>✕</button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
