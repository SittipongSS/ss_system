"use client";
import { useState } from "react";
import { suggestCoverage } from "@/lib/sahamit/predict";

const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// Cross-month PO coverage for one (sku, month): list allocations touching this
// cell + add/remove. "รับเข้า" = PO from another month covers this month's FC;
// "ส่งออก" = this month's PO excess covers another month.
//
// เฟส S2: on top of the manual form, if this month is short on PO the system now
// SUGGESTS which surplus-PO months could cover it (suggestCoverage) as one-click
// "ยืนยัน" cards — matching ss-cj's predict-then-confirm flow. `matrix` is the
// buildReconMatrix result the drill-down page already has; without it the panel
// degrades to manual-only.
export default function CoveragePanel({ fgCode, month, coverages, matrix, onChanged }) {
  const [dir, setDir] = useState("in");
  const [other, setOther] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false); // ฟอร์มกรอกเองซ่อนไว้ก่อน (auto-first)
  const related = (coverages || []).filter(
    (c) => c.fgCode === fgCode && (c.sourceMonth === month || c.targetMonth === month),
  );

  // System suggestions: only when this month still lacks PO, and only sources not
  // already linked to it. `use` is capped to the remaining shortage.
  const target = (matrix?.rows || []).find((r) => r.fgCode === fgCode)?.cells?.[month];
  const shortage = target ? Math.max(0, Number(target.fcQty || 0) - Number(target.effPo ?? target.poQty ?? 0)) : 0;
  const alreadyIn = new Set(related.filter((c) => c.targetMonth === month).map((c) => c.sourceMonth));
  const suggestions = shortage > 0 && matrix
    ? suggestCoverage(matrix, fgCode, month)
        .filter((s) => !alreadyIn.has(s.sourceMonth))
        .map((s) => ({ ...s, use: Math.min(s.canCover, shortage) }))
        .filter((s) => s.use > 0)
    : [];

  const confirm = async (sourceMonth, useQty) => {
    setBusy(true);
    try {
      const res = await fetch("/api/sahamit/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fgCode, sourceMonth, targetMonth: month, qty: useQty }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "ไม่สำเร็จ");
      onChanged?.();
    } catch (e) {
      alert(e.message);
    }
    setBusy(false);
  };

  const add = async () => {
    if (!/^\d{4}-\d{2}$/.test(other) || !(Number(qty) > 0)) {
      alert("ระบุอีกเดือน (YYYY-MM) และจำนวน > 0");
      return;
    }
    const sourceMonth = dir === "in" ? other : month;
    const targetMonth = dir === "in" ? month : other;
    setBusy(true);
    try {
      const res = await fetch("/api/sahamit/coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fgCode, sourceMonth, targetMonth, qty: Number(qty) }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "ไม่สำเร็จ");
      setOther("");
      setQty("");
      onChanged?.();
    } catch (e) {
      alert(e.message);
    }
    setBusy(false);
  };
  const remove = async (id) => {
    await fetch(`/api/sahamit/coverage/${id}`, { method: "DELETE" });
    onChanged?.();
  };

  return (
    <div>
      {/* คำแนะนำจากระบบ (เฟส S2): เดือนนี้ยังขาด PO → เสนอแหล่งที่ PO เกินมาชดเชย */}
      {suggestions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            ✨ คำแนะนำจากระบบ <span style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 400 }}>(เดือนนี้ขาด {nf(shortage)} ชิ้น)</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {suggestions.map((s) => (
              <div
                key={s.sourceMonth}
                className="glass-panel"
                style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, borderLeft: "3px solid var(--blue)" }}
              >
                <div style={{ fontSize: 13, flex: 1 }}>
                  <span style={{ fontWeight: 600, color: "var(--blue)" }}>💡 ดึงจาก {s.sourceMonth}</span>
                  <span style={{ color: "var(--text-2)" }}> (+{nf(s.use)} ชิ้น)</span>
                  {s.canCover > s.use && (
                    <span style={{ color: "var(--text-3)", fontSize: 12 }}> · เดือนนั้น PO เกิน {nf(s.canCover)}</span>
                  )}
                </div>
                <button className="btn btn-primary sm" disabled={busy} onClick={() => confirm(s.sourceMonth, s.use)}>ยืนยัน</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ไม่มีของให้ดึงอัตโนมัติ แต่เดือนนี้ยังขาด → บอกให้รู้ว่าทำไมไม่มีการ์ด */}
      {matrix && shortage > 0 && suggestions.length === 0 && (
        <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 14 }}>
          เดือนนี้ขาด {nf(shortage)} ชิ้น — แต่ยังไม่มีเดือนอื่นที่ PO เกินให้ดึงมาชดเชยอัตโนมัติ (ต้องมี PO เกินในเดือนใกล้เคียงก่อน)
        </div>
      )}

      <h3 style={{ fontWeight: 600, marginBottom: 8 }}>ชดเชยข้ามเดือน</h3>
      {related.length > 0 ? (
        <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none", fontSize: 13 }}>
          {related.map((c) => (
            <li key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "var(--blue)" }}>{c.sourceMonth} → {c.targetMonth}</span>
              <span style={{ fontWeight: 600 }}>{Number(c.qty).toLocaleString("th-TH")}</span>
              {c.targetMonth === month ? (
                <span className="ui-badge" style={{ color: "var(--green)", borderColor: "var(--green)" }}>รับเข้า</span>
              ) : (
                <span className="ui-badge" style={{ color: "var(--amber)", borderColor: "var(--amber)" }}>ส่งออก</span>
              )}
              <button className="btn-icon" title="ลบ" onClick={() => remove(c.id)} style={{ marginLeft: "auto" }}>✕</button>
            </li>
          ))}
        </ul>
      ) : (
        <div style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 12 }}>— ยังไม่มีการชดเชยข้ามเดือนสำหรับเดือนนี้ —</div>
      )}
      {/* กรอกเอง — ซ่อนไว้ใต้ปุ่ม เพื่อให้คำแนะนำอัตโนมัติเป็นตัวเอก */}
      {manual ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
          <select className="premium-select" style={{ height: 30, width: 170 }} value={dir} onChange={(e) => setDir(e.target.value)}>
            <option value="in">เดือนนี้รับชดเชยจาก…</option>
            <option value="out">เดือนนี้ส่งไปชดเชย…</option>
          </select>
          <input type="month" className="premium-input" style={{ height: 30 }} value={other} onChange={(e) => setOther(e.target.value)} />
          <input type="number" min={1} className="premium-input" style={{ height: 30, width: 100 }} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="จำนวน" />
          <button className="btn sm" onClick={add} disabled={busy}>เพิ่มชดเชย</button>
          <button className="btn ghost sm" onClick={() => setManual(false)}>ยกเลิก</button>
        </div>
      ) : (
        <button className="btn ghost sm" onClick={() => setManual(true)}>+ กรอกชดเชยเอง</button>
      )}
    </div>
  );
}
