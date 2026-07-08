"use client";
import { AlertTriangle, ArrowUp, ArrowDown, Plus, X, MoveRight, CheckCircle2 } from "lucide-react";
import { productMetaText } from "@/lib/sahamit/productMeta";
import { ppcOf, casesText } from "@/lib/sahamit/units";

// Renders the round-to-round comparison from compareRounds(): a peak-drop alert
// section first (the items S&S must ask the customer about), then a per-SKU
// change list. Pure presentation — all logic is in lib/sahamit.
const COLORS = {
  up: "var(--green)", down: "var(--red)", add: "var(--teal)",
  remove: "var(--red)", shift: "var(--blue)",
};

function fmt(n) {
  return Number(n || 0).toLocaleString("th-TH");
}

function ChangeChips({ diff }) {
  const chips = [];
  diff.increases.forEach((d) => chips.push({ k: `up-${d.month}`, c: COLORS.up, Icon: ArrowUp, text: `${d.month} +${fmt(d.diff)}` }));
  diff.decreases.forEach((d) => chips.push({ k: `dn-${d.month}`, c: COLORS.down, Icon: ArrowDown, text: `${d.month} ${fmt(d.diff)}` }));
  diff.shifts.forEach((s) => chips.push({ k: `sh-${s.fromMonth}`, c: COLORS.shift, Icon: MoveRight, text: `${s.fromMonth}→${s.toMonth}${s.diff ? ` (${s.diff > 0 ? "+" : ""}${fmt(s.diff)})` : ""}` }));
  diff.added.forEach((a) => chips.push({ k: `ad-${a.month}`, c: COLORS.add, Icon: Plus, text: `${a.month} ${fmt(a.qty)}` }));
  diff.removed.forEach((r) => chips.push({ k: `rm-${r.month}`, c: COLORS.remove, Icon: X, text: `${r.month} −${fmt(r.qty)}` }));
  if (!chips.length) return <span style={{ color: "var(--text-3)", fontSize: "12px" }}>ไม่เปลี่ยนแปลง</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {chips.map(({ k, c, Icon, text }) => (
        <span key={k} className="ui-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: c, borderColor: c }}>
          <Icon size={12} strokeWidth={2.2} /> {text}
        </span>
      ))}
    </div>
  );
}

export default function RoundComparison({ comparison, productByFg }) {
  const metaOf = (fg) => productMetaText(productByFg?.get?.(String(fg).trim().toLowerCase()));
  const casesOf = (fg, n) => casesText(n, ppcOf(productByFg?.get?.(String(fg).trim().toLowerCase())));
  if (!comparison) return null;
  if (!comparison.hasPrev) {
    return (
      <div className="empty-state" style={{ padding: "28px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
        <CheckCircle2 size={22} style={{ marginBottom: 8 }} />
        <div>รอบแรก — ยังไม่มีรอบก่อนหน้าให้เปรียบเทียบ</div>
      </div>
    );
  }

  const peakDrops = comparison.perSku.filter((s) => s.peak?.hasWarning);
  const changed = comparison.perSku.filter((s) => s.changed || s.peak?.hasWarning);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ fontSize: "13px", color: "var(--text-2)" }}>
        เปรียบเทียบ <b>รอบที่ {comparison.targetRoundNo}</b> กับ <b>รอบที่ {comparison.prevRoundNo}</b>
      </div>

      {/* Peak-drop alert — the heart of the feature (FC peak ไม่ควรลด). */}
      {peakDrops.length > 0 && (
        <div className="glass-panel" style={{ padding: "16px", borderLeft: "3px solid var(--red)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--red)", fontWeight: 600, marginBottom: "10px" }}>
            <AlertTriangle size={18} /> ยอด FC ลดลงจากจุดสูงสุด — ควรสอบถามลูกค้า ({peakDrops.length} รายการ)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {peakDrops.map((s) => (
              <div key={s.fgCode} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "13px" }}>
                  <span className="font-mono" style={{ fontWeight: 600 }}>{s.fgCode}</span>
                  {s.productName ? <span style={{ color: "var(--text-3)" }}> · {s.productName}</span> : null}
                  <span style={{ color: "var(--red)", fontWeight: 600, marginLeft: 8 }}>
                    {fmt(s.peak.newTotal)} / peak {fmt(s.peak.oldTotal)} ({fmt(s.peak.totalDiff)})
                  </span>
                </div>
                <ChangeChips diff={s.diff} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-SKU change list. */}
      <div className="premium-table-wrapper">
        <table className="premium-table">
          <thead>
            <tr>
              <th>รหัสสินค้า</th>
              <th>ชื่อสินค้า</th>
              <th style={{ textAlign: "right" }}>รอบก่อน</th>
              <th style={{ textAlign: "right" }}>รอบนี้</th>
              <th style={{ textAlign: "right" }}>สุทธิ</th>
              <th>การเปลี่ยนแปลง</th>
            </tr>
          </thead>
          <tbody>
            {changed.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-3)", padding: "24px" }}>ไม่มีรายการเปลี่ยนแปลงระหว่างสองรอบนี้</td></tr>
            ) : changed.map((s) => (
              <tr key={s.fgCode}>
                <td className="font-mono" style={{ fontWeight: 600 }}>{s.fgCode}</td>
                <td>
                  {s.productName || <span style={{ color: "var(--amber)" }}>— ไม่รู้จัก —</span>}
                  {metaOf(s.fgCode) && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{metaOf(s.fgCode)}</div>}
                </td>
                <td style={{ textAlign: "right" }}>
                  {fmt(s.prevTotal)}
                  {casesOf(s.fgCode, s.prevTotal) && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesOf(s.fgCode, s.prevTotal)}</div>}
                </td>
                <td style={{ textAlign: "right" }}>
                  {fmt(s.targetTotal)}
                  {casesOf(s.fgCode, s.targetTotal) && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesOf(s.fgCode, s.targetTotal)}</div>}
                </td>
                <td style={{ textAlign: "right", color: s.net > 0 ? "var(--green)" : s.net < 0 ? "var(--red)" : "var(--text-3)", fontWeight: 600 }}>
                  {s.net > 0 ? "+" : ""}{fmt(s.net)}
                </td>
                <td><ChangeChips diff={s.diff} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
