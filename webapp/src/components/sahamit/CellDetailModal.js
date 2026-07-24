"use client";
import { useMemo, useState } from "react";
import { Lock } from "lucide-react";
import Modal from "@/components/Modal";
import Tabs from "@/components/ui/Tabs";
import CoveragePanel from "@/components/sahamit/CoveragePanel";
import { fmtDate } from "@/lib/format";
import { cellDetail, RECON_STATUS_COLOR } from "@/lib/sahamit/reconcileClient";
import { PO_STATUS_LABEL } from "@/lib/sahamit/po";
import { productMetaText } from "@/lib/sahamit/productMeta";
import { ppcOf, casesText } from "@/lib/sahamit/units";

// รายละเอียดช่องกระทบยอด (SKU × เดือน) แบบ modal — แทนการเด้งไปหน้าเต็ม.
// รับ matrix/rounds/pos/coverages ที่หน้ากระทบยอดมีอยู่แล้ว ไม่โหลดซ้ำ.
const C = {
  green: "var(--green)", teal: "var(--teal)", amber: "var(--amber)",
  red: "var(--red)", violet: "var(--violet)", blue: "var(--blue)", "text-3": "var(--text-3)",
};
const nf = (n) => Number(n || 0).toLocaleString("th-TH");
const TABS = [
  { key: "overview", label: "ภาพรวม" },
  { key: "docs", label: "เอกสารอ้างอิง" },
  { key: "coverage", label: "ชดเชยยอดข้ามเดือน" },
];

export default function CellDetailModal({ open, onClose, fgCode, month, matrix, rounds, pos, coverages, product, canEdit = true, onCoverageChanged }) {
  const [tab, setTab] = useState("overview");

  const row = useMemo(() => (matrix?.rows || []).find((r) => r.fgCode === fgCode), [matrix, fgCode]);
  const cell = row?.cells?.[month] || null;
  const detail = useMemo(() => cellDetail(rounds, pos, fgCode, month), [rounds, pos, fgCode, month]);

  const color = cell ? (C[RECON_STATUS_COLOR[cell.status]] || C["text-3"]) : C["text-3"];
  const fcQty = cell?.fcQty || 0;
  const poQty = cell?.poQty || 0;
  const diff = poQty - fcQty;
  const pct = fcQty > 0 ? Math.min(100, Math.round((poQty / fcQty) * 100)) : poQty > 0 ? 100 : 0;
  // ชิ้นต่อลังของสินค้านี้ — ต่อท้ายจำนวนชิ้นด้วย "(x ลัง)" ถ้ารู้ค่า
  const ppc = ppcOf(product);
  const withCase = (n) => { const c = casesText(n, ppc); return c ? ` (${c})` : ""; };
  const diffMsg =
    !cell ? "" :
    cell.status === "match" ? "ครบพอดีตามแผน" :
    cell.status === "pending" ? `ยังไม่มี PO — ขาด ${nf(fcQty)} ชิ้น${withCase(fcQty)}` :
    cell.status === "discrepancy" ? `PO ไม่ครบ — ขาดอีก ${nf(fcQty - poQty)} ชิ้น${withCase(fcQty - poQty)}` :
    cell.status === "over" ? `PO เกินแผน +${nf(diff)} ชิ้น${withCase(diff)}` :
    cell.status === "unforecasted" ? `สั่ง PO นอกแผน ${nf(poQty)} ชิ้น${withCase(poQty)} (ไม่มี FC)` :
    cell.label;

  const meta = productMetaText(product);
  const title = `${row?.productName || fgCode} · ${fgCode} · เดือน ${month}${meta ? ` · ${meta}` : ""}`;

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg" side="right" closeOnOverlay>
      {!cell ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-3)" }}>ไม่พบข้อมูลช่องนี้</div>
      ) : (
        <div style={{ padding: "4px 2px", flex: 1, minHeight: 0, overflow: "auto" }}>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />

          {tab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span className="ui-badge" style={{ color, borderColor: color, fontSize: 13 }}>{cell.label}</span>
                {cell.status === "match" && (
                  <span className="ui-badge" style={{ color: "var(--green)", borderColor: "var(--green)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Lock size={13} /> FC=PO ตกลงแล้ว (ล็อกอัตโนมัติ)
                  </span>
                )}
              </div>

              <div className="glass-panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", gap: 32 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>Forecast (FC)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {nf(fcQty)}
                      {cell.originalFc != null && cell.originalFc !== fcQty && (
                        <span style={{ textDecoration: "line-through", color: "var(--text-3)", fontWeight: 400, fontSize: 13, marginLeft: 6 }}>เดิม {nf(cell.originalFc)}</span>
                      )}
                    </div>
                    {casesText(fcQty, ppc) && <div style={{ fontSize: 12, color: "var(--text-3)" }}>{casesText(fcQty, ppc)}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>Purchase Order (PO)</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{nf(poQty)}</div>
                    {casesText(poQty, ppc) && <div style={{ fontSize: 12, color: "var(--text-3)" }}>{casesText(poQty, ppc)}</div>}
                  </div>
                </div>
                <div style={{ fontSize: 13, color }}>{diffMsg}</div>
                <div className="progress"><span style={{ width: `${pct}%`, background: color }} /></div>
                <div style={{ fontSize: 11, color: "var(--text-3)", textAlign: "right" }}>ครอบคลุม {pct}%</div>
                {(cell.coverageIn > 0 || cell.coverageOut > 0) && (
                  <div style={{ fontSize: 12, color: "var(--blue)" }}>
                    ⇄ ชดเชย FC ข้ามเดือน (รับ FC เข้า {nf(cell.coverageIn)} / ส่ง FC ออก {nf(cell.coverageOut)}) — PO อยู่กับที่ · ดูแท็บ “ชดเชยยอดข้ามเดือน”
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "docs" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <div>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Forecast (ตามรอบ)</h3>
                {detail.fcs.length === 0 ? (
                  <div style={{ color: "var(--text-3)", fontSize: 13 }}>— ไม่มี FC เดือนนี้ —</div>
                ) : (
                  <div className="premium-table-wrapper">
                    <table className="premium-table">
                      <thead><tr><th>รอบที่</th><th>วันที่รับ</th><th style={{ textAlign: "right" }}>จำนวน</th></tr></thead>
                      <tbody>
                        {detail.fcs.map((f, i) => (
                          <tr key={i}><td>#{f.roundNo}</td><td>{f.receivedDate ? fmtDate(f.receivedDate) : "—"}</td><td style={{ textAlign: "right" }}>{nf(f.qty)}{casesText(f.qty, ppc) && <span style={{ color: "var(--text-3)", fontSize: 11 }}> ({casesText(f.qty, ppc)})</span>}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Purchase Orders (ส่งเดือนนี้)</h3>
                {detail.poLines.length === 0 ? (
                  <div style={{ color: "var(--text-3)", fontSize: 13 }}>— ไม่มี PO เดือนนี้ —</div>
                ) : (
                  <div className="premium-table-wrapper">
                    <table className="premium-table">
                      <thead><tr><th>เลขที่ PO</th><th>วันที่ PO</th><th>วันที่รับ PO</th><th style={{ textAlign: "right" }}>จำนวน</th><th>กำหนดส่ง</th><th>คาดส่ง</th><th>ส่งจริง</th><th>สถานะ</th></tr></thead>
                      <tbody>
                        {detail.poLines.map((p, i) => (
                          <tr key={i}>
                            <td className="font-mono">{p.poNumber}</td>
                            <td>{p.docDate ? fmtDate(p.docDate) : "—"}</td>
                            <td>{p.receivedDate ? fmtDate(p.receivedDate) : "—"}</td>
                            <td style={{ textAlign: "right" }}>{nf(p.qty)}{casesText(p.qty, ppc) && <span style={{ color: "var(--text-3)", fontSize: 11 }}> ({casesText(p.qty, ppc)})</span>}</td>
                            <td>{p.dueDate ? fmtDate(p.dueDate) : "—"}</td>
                            <td>{p.expectedDate ? fmtDate(p.expectedDate) : "—"}</td>
                            <td>{p.actualDeliveredDate ? fmtDate(p.actualDeliveredDate) : "—"}</td>
                            <td>{PO_STATUS_LABEL[p.status] || p.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "coverage" && (
            <CoveragePanel fgCode={fgCode} month={month} coverages={coverages} matrix={matrix} piecesPerCase={ppc} canEdit={canEdit} onChanged={onCoverageChanged} />
          )}
        </div>
      )}
    </Modal>
  );
}
