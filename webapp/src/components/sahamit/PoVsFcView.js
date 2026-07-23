"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { matchReport } from "@/lib/sahamit/dashboard";
import { cellDetail } from "@/lib/sahamit/reconcileClient";
import { indexProducts, productMetaText } from "@/lib/sahamit/productMeta";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { fmtNumber, fmtMoney, fmtDate } from "@/lib/format";
import { PO_STATUS_LABEL } from "@/lib/sahamit/po";

// แท็บ "PO เทียบ FC" — ยุบงานจากหน้า /report เดิมเข้ามา: ตารางมูลค่า/จำนวนต่อสินค้า
// + เจาะลึกรายเดือน (สถานะ + PO ที่ตัด ผ่าน cellDetail) + PO ที่ยังแบ่งส่ง/ค้างส่ง.
// ต่อ peak engine (matchReport → buildReconMatrix). รับ rounds/pos กรองสินค้าแล้ว.

const STATUS_META = {
  match: ["ครบ", "var(--green)"], over: ["PO เกิน", "var(--teal)"], discrepancy: ["PO ไม่ครบ", "var(--amber)"],
  pending: ["รอ PO", "var(--red)"], unforecasted: ["นอก FC", "var(--violet)"], covered: ["ชดเชย", "var(--green)"],
  shifted: ["เลื่อน", "var(--blue)"], cancelled: ["ยกเลิก", "var(--text-3)"], none: ["—", "var(--text-3)"],
};
const shortM = (ym) => {
  if (!ym) return "—";
  const TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const [y, m] = String(ym).split("-");
  return `${TH[parseInt(m, 10) - 1] || m} ${(parseInt(y, 10) + 543).toString().slice(-2)}`;
};
const StatusPill = ({ st }) => {
  const [label, color] = STATUS_META[st] || [st, "var(--text-3)"];
  return <span className="ui-badge" style={{ color, borderColor: color, fontSize: 11 }}>{label}</span>;
};

export default function PoVsFcView({ rounds, pos, coverages = [], products, unit = "qty", years = [] }) {
  const isValue = unit === "value";
  const rep = useMemo(() => matchReport(rounds, pos, coverages, products, { years }), [rounds, pos, coverages, products, years]);
  const prodIdx = useMemo(() => indexProducts(products), [products]);
  const [open, setOpen] = useState(null); // fgCode ที่กางอยู่

  if (!rep.rows.length) {
    return <div className="glass-panel empty-state" style={{ padding: 40 }}>ไม่มีข้อมูล FC/PO ตามตัวกรองที่เลือก</div>;
  }

  const qtyCell = (qty, ppc) => (
    <>
      {fmtNumber(qty)}
      {casesText(qty, ppc) && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesText(qty, ppc)}</div>}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      {isValue && rep.unpricedCount > 0 && (
        <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--amber)", display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <TriangleAlert size={16} style={{ color: "var(--amber)" }} />
          มี {rep.unpricedCount} สินค้าที่ยังไม่ได้ตั้งราคาผลิต — มูลค่าจะต่ำกว่าจริง (ตั้งได้ที่ ข้อมูลสินค้า → ราคาผลิต)
        </div>
      )}

      {/* ตารางต่อสินค้า + เจาะลึกรายเดือน */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
          PO เทียบ FC ต่อสินค้า {isValue ? "(มูลค่า)" : "(ชิ้น)"} — คลิกแถวเพื่อดูรายเดือน
        </h3>
        <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
          <table className="premium-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>รหัส</th><th>ชื่อสินค้า</th>
                <th style={{ textAlign: "right" }}>FC (ชิ้น)</th>
                <th style={{ textAlign: "right" }}>PO (ชิ้น)</th>
                {isValue && <th style={{ textAlign: "right" }}>ราคา/หน่วย</th>}
                {isValue && <th style={{ textAlign: "right" }}>มูลค่า FC</th>}
                {isValue && <th style={{ textAlign: "right" }}>มูลค่า PO</th>}
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rep.rows.map((s) => {
                const p = prodIdx.get(String(s.fgCode).trim().toLowerCase());
                const ppc = ppcOf(p);
                const meta = productMetaText(p);
                const isOpen = open === s.fgCode;
                const colSpan = isValue ? 9 : 6;
                return (
                  <>
                    <tr key={s.fgCode} onClick={() => setOpen(isOpen ? null : s.fgCode)} style={{ cursor: "pointer" }} className="hover-row">
                      <td style={{ textAlign: "center", color: "var(--text-3)" }}>
                        <ChevronRight size={14} style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                      </td>
                      <td className="font-mono" style={{ fontWeight: 600 }}>{s.fgCode}</td>
                      <td style={{ color: s.productName ? "inherit" : "var(--amber)" }}>
                        {s.productName || "— ไม่รู้จัก —"}
                        {meta && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{meta}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>{qtyCell(s.fcQty, ppc)}</td>
                      <td style={{ textAlign: "right" }}>{qtyCell(s.poQty, ppc)}</td>
                      {isValue && <td style={{ textAlign: "right", color: s.price == null ? "var(--amber)" : "inherit" }}>{s.price == null ? "—" : fmtMoney(s.price)}</td>}
                      {isValue && <td style={{ textAlign: "right" }}>{fmtMoney(s.fcValue)}</td>}
                      {isValue && <td style={{ textAlign: "right", fontWeight: 600, color: "var(--teal)" }}>{fmtMoney(s.poValue)}</td>}
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {Object.entries(s.statuses).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([st, n]) => (
                            <span key={st} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><StatusPill st={st} />{n > 1 && <b style={{ fontSize: 10, color: "var(--text-3)" }}>×{n}</b>}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={colSpan} style={{ background: "var(--panel-2)", padding: 0 }}>
                          <MonthDrill rounds={rounds} pos={pos} fgCode={s.fgCode} cells={s.cells} ppc={ppc} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            {isValue && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                  <td></td><td colSpan={2}>รวม (ครอบคลุม {rep.coveragePct}%)</td>
                  <td style={{ textAlign: "right" }}>{fmtNumber(rep.totals.fcQty)}</td>
                  <td style={{ textAlign: "right" }}>{fmtNumber(rep.totals.poQty)}</td>
                  <td></td>
                  <td style={{ textAlign: "right" }}>{fmtMoney(rep.totals.fcValue)}</td>
                  <td style={{ textAlign: "right", color: "var(--teal)" }}>{fmtMoney(rep.totals.poValue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* PO ที่ยังแบ่งส่ง / ค้างส่ง */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>PO ที่ยังแบ่งส่งได้ / รอส่ง</h3>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10 }}>บรรทัด PO ที่ยังไม่ส่งครบ — แบ่งส่งหรือติดตามได้ที่หน้า PO</div>
        {rep.splittable.length === 0 ? (
          <div className="empty-state dashed" style={{ padding: 24, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>ไม่มีบรรทัด PO ที่ค้างส่ง</div>
        ) : (
          <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="premium-table">
              <thead>
                <tr>
                  <th>เลขที่ PO</th><th>สินค้า</th>
                  <th style={{ textAlign: "right" }}>คงเหลือ (ชิ้น)</th>
                  <th>เดือนส่ง</th><th>คาดการณ์ส่ง</th><th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rep.splittable.map((s) => (
                  <tr key={s.lineId}>
                    <td>
                      <Link href={`/sahamit/po/${s.poId}`} className="font-mono" style={{ fontWeight: 600, color: "var(--green)" }}>{s.poNumber}</Link>
                      {s.isBalance && <span className="ui-badge" style={{ marginLeft: 6, color: "var(--blue)", borderColor: "var(--blue)" }}>ยอดแยก</span>}
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontSize: 12 }}>{s.fgCode}</span>
                      <span style={{ color: s.productName ? "var(--text-3)" : "var(--amber)", fontSize: 12 }}> · {s.productName || "ไม่รู้จัก"}</span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{qtyCell(s.qty, ppcOf(prodIdx.get(String(s.fgCode).trim().toLowerCase())))}</td>
                    <td>{s.deliveryMonth ? shortM(s.deliveryMonth) : "—"}</td>
                    <td>{s.expectedDate ? fmtDate(s.expectedDate) : (s.dueDate ? fmtDate(s.dueDate) : "—")}</td>
                    <td><span className="status-pill">{PO_STATUS_LABEL[s.status] || s.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// เจาะลึกรายเดือนของสินค้าหนึ่ง: FC/PO ต่อเดือน + สถานะ + PO ที่ตัด (cellDetail).
function MonthDrill({ rounds, pos, fgCode, cells, ppc }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead>
        <tr style={{ color: "var(--text-3)" }}>
          <th style={{ textAlign: "left", padding: "8px 12px 8px 44px", fontWeight: 600 }}>เดือน</th>
          <th style={{ textAlign: "right", padding: "8px 12px" }}>FC</th>
          <th style={{ textAlign: "right", padding: "8px 12px" }}>PO</th>
          <th style={{ textAlign: "left", padding: "8px 12px" }}>สถานะ</th>
          <th style={{ textAlign: "left", padding: "8px 12px" }}>PO ที่ตัด</th>
        </tr>
      </thead>
      <tbody>
        {cells.map((c) => {
          const det = cellDetail(rounds, pos, fgCode, c.month);
          const poNos = [...new Set((det.poLines || []).map((l) => l.poNumber).filter(Boolean))];
          return (
            <tr key={c.month} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "7px 12px 7px 44px" }}>{shortM(c.month)}</td>
              <td style={{ textAlign: "right", padding: "7px 12px" }}>
                {fmtNumber(c.fcQty)}
                {casesText(c.fcQty, ppc) && <div style={{ fontSize: 9.5, color: "var(--text-3)" }}>{casesText(c.fcQty, ppc)}</div>}
              </td>
              <td style={{ textAlign: "right", padding: "7px 12px" }}>{fmtNumber(c.poQty)}</td>
              <td style={{ padding: "7px 12px" }}><StatusPill st={c.status} /></td>
              <td style={{ padding: "7px 12px", color: poNos.length ? "var(--text-2)" : "var(--text-3)" }}>{poNos.length ? poNos.join(", ") : "—"}</td>
            </tr>
          );
        })}
        {cells.length === 0 && <tr><td colSpan={5} style={{ padding: "10px 44px", color: "var(--text-3)" }}>ไม่มีเดือนที่มีข้อมูล</td></tr>}
      </tbody>
    </table>
  );
}
