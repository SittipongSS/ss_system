"use client";
import { useMemo } from "react";
import Link from "next/link";
import { BarChart3, AlertCircle, TriangleAlert } from "lucide-react";
import Workspace, { Spinner } from "@/components/ui/Workspace";
import { useApiList } from "@/lib/excise/useApiList";
import { productMetaText, indexProducts } from "@/lib/sahamit/productMeta";
import { ppcOf, casesText } from "@/lib/sahamit/units";
import { fmtDate, fmtMoney, fmtMoneyCompact, fmtPct } from "@/lib/format";
import { buildReport } from "@/lib/sahamit/reportClient";
import { PO_STATUS_LABEL } from "@/lib/sahamit/po";
import { destinationLabel } from "@/components/sahamit/destinations";

const C = {
  green: "var(--green)", teal: "var(--teal)", amber: "var(--amber)",
  red: "var(--red)", violet: "var(--violet)", "text-3": "var(--text-3)",
};
const STATUS_META = {
  match: ["ครบ (FC=PO)", "green"], over: ["PO เกิน", "teal"], discrepancy: ["PO ไม่ครบ", "amber"],
  pending: ["รอ PO", "red"], unforecasted: ["นอก FC", "violet"], covered: ["ครอบคลุมข้ามเดือน", "green"],
  shifted: ["เลื่อนเดือน", "text-3"], cancelled: ["ยกเลิก", "text-3"],
};
const nf = (n) => Number(n || 0).toLocaleString("th-TH");
const baht = (n) => fmtMoney(n);

function Kpi({ label, value, sub, color }) {
  return (
    <div className="glass-panel" style={{ padding: 16, flex: "1 1 180px", minWidth: 160 }}>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || "inherit", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function ReportPage() {
  const { data: rounds, loading: l1, error: e1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2, error: e2 } = useApiList("/api/sahamit/po");
  const { data: coverages } = useApiList("/api/sahamit/coverage");
  const { data: products } = useApiList("/api/sahamit/products");

  const loading = l1 || l2;
  const error = e1 || e2;
  const rep = useMemo(() => buildReport(rounds, pos, coverages, products), [rounds, pos, coverages, products]);
  const prodIdx = useMemo(() => indexProducts(products), [products]);

  return (
    <Workspace
      icon={<BarChart3 size={22} />}
      title="รายงานมูลค่า FC / PO"
      subtitle="มูลค่าตามแผนเทียบยอดสั่งจริง สถานะ และ PO ที่ยังแบ่งส่งได้ · ราคา = ราคาโรงงาน จากข้อมูลสินค้า (AR-109)"
      back={{ href: "/sahamit", label: "งานสหมิตร" }}
    >
      {error && (
        <div className="glass-panel" style={{ padding: 14, borderLeft: "3px solid var(--red)", color: "var(--red)", display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : error ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* KPI cards */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Kpi label="มูลค่า FC (ตามแผน)" value={fmtMoneyCompact(rep.fcValue)} />
            <Kpi label="มูลค่า PO (สั่งจริง)" value={fmtMoneyCompact(rep.poValue)} color={C.teal} />
            <Kpi label="ครอบคลุม (PO ÷ FC)" value={fmtPct(rep.coveragePct)} />
            <Kpi label="จุดที่ต้องตาม" value={nf(rep.alertCount)} sub="รอ PO + PO ไม่ครบ + นอกแผน" color={rep.alertCount ? C.red : C.green} />
          </div>

          {rep.unpricedCount > 0 && (
            <div className="glass-panel" style={{ padding: 12, borderLeft: "3px solid var(--amber)", display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <TriangleAlert size={16} style={{ color: "var(--amber)" }} />
              มี {rep.unpricedCount} สินค้าที่ยังไม่ได้ตั้งราคาโรงงาน — มูลค่าจะต่ำกว่าจริง (ตั้งราคาได้ที่ ข้อมูลสินค้า → ราคาโรงงาน/ต้นทุน)
            </div>
          )}

          {/* Health badges */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>สรุปสถานะ (รายช่อง สินค้า×เดือน)</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {Object.entries(rep.statusCounts).sort((a, b) => b[1] - a[1]).map(([st, n]) => {
                const [label, tok] = STATUS_META[st] || [st, "text-3"];
                return (
                  <span key={st} className="ui-badge" style={{ color: C[tok], borderColor: C[tok], fontSize: 13 }}>
                    {label}: <b style={{ marginLeft: 4 }}>{nf(n)}</b>
                  </span>
                );
              })}
              {Object.keys(rep.statusCounts).length === 0 && <span style={{ color: "var(--text-3)", fontSize: 13 }}>— ยังไม่มีข้อมูล —</span>}
            </div>
          </div>

          {/* Per-SKU value table */}
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>มูลค่าต่อสินค้า</h3>
            <div className="premium-table-wrapper" style={{ overflowX: "auto" }}>
              <table className="premium-table">
                <thead>
                  <tr>
                    <th>รหัสสินค้า</th><th>ชื่อสินค้า</th>
                    <th style={{ textAlign: "right" }}>FC (ชิ้น)</th>
                    <th style={{ textAlign: "right" }}>PO (ชิ้น)</th>
                    <th style={{ textAlign: "right" }}>ราคา/หน่วย</th>
                    <th style={{ textAlign: "right" }}>มูลค่า FC</th>
                    <th style={{ textAlign: "right" }}>มูลค่า PO</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.perSku.map((s) => {
                    const p = prodIdx.get(String(s.fgCode).trim().toLowerCase());
                    const meta = productMetaText(p);
                    const ppc = ppcOf(p);
                    return (
                    <tr key={s.fgCode}>
                      <td className="font-mono" style={{ fontWeight: 600 }}>{s.fgCode}</td>
                      <td style={{ color: s.productName ? "inherit" : "var(--amber)" }}>
                        {s.productName || "— ไม่รู้จัก —"}
                        {meta && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{meta}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {nf(s.fcQty)}
                        {casesText(s.fcQty, ppc) && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesText(s.fcQty, ppc)}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {nf(s.poQty)}
                        {casesText(s.poQty, ppc) && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{casesText(s.poQty, ppc)}</div>}
                      </td>
                      <td style={{ textAlign: "right", color: s.price == null ? "var(--amber)" : "inherit" }}>{s.price == null ? "—" : baht(s.price)}</td>
                      <td style={{ textAlign: "right" }}>{baht(s.fcValue)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600, color: C.teal }}>{baht(s.poValue)}</td>
                    </tr>
                    );
                  })}
                  {rep.perSku.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text-3)", padding: 20 }}>ยังไม่มีข้อมูล FC/PO</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Split-delivery opportunities */}
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
                      <th>เดือนส่ง</th><th>คาดการณ์ส่ง</th><th>สถานที่ส่ง</th><th>สถานะ</th>
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
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {nf(s.qty)}
                          {casesText(s.qty, ppcOf(prodIdx.get(String(s.fgCode).trim().toLowerCase()))) && (
                            <div style={{ fontSize: 10, fontWeight: 400, color: "var(--text-3)" }}>{casesText(s.qty, ppcOf(prodIdx.get(String(s.fgCode).trim().toLowerCase())))}</div>
                          )}
                        </td>
                        <td>{s.deliveryMonth || "—"}</td>
                        <td>{s.expectedDate ? fmtDate(s.expectedDate) : (s.dueDate ? fmtDate(s.dueDate) : "—")}</td>
                        <td>{destinationLabel(s.destination) || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                        <td><span className="status-pill">{PO_STATUS_LABEL[s.status] || s.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Workspace>
  );
}
