"use client";
import { useState } from "react";

// Cross-month PO coverage for one (sku, month): list allocations touching this
// cell + add/remove. "รับเข้า" = PO from another month covers this month's FC;
// "ส่งออก" = this month's PO excess covers another month.
export default function CoveragePanel({ fgCode, month, coverages, onChanged }) {
  const [dir, setDir] = useState("in");
  const [other, setOther] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const related = (coverages || []).filter(
    (c) => c.fgCode === fgCode && (c.sourceMonth === month || c.targetMonth === month),
  );

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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        <select className="premium-select" style={{ height: 30, width: 170 }} value={dir} onChange={(e) => setDir(e.target.value)}>
          <option value="in">เดือนนี้รับชดเชยจาก…</option>
          <option value="out">เดือนนี้ส่งไปชดเชย…</option>
        </select>
        <input type="month" className="premium-input" style={{ height: 30 }} value={other} onChange={(e) => setOther(e.target.value)} />
        <input type="number" min={1} className="premium-input" style={{ height: 30, width: 100 }} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="จำนวน" />
        <button className="btn sm" onClick={add} disabled={busy}>เพิ่มชดเชย</button>
      </div>
    </div>
  );
}
