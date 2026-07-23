"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LineChart, FileText, AlertCircle, Clock, TrendingUp, GitCompareArrows, Target, Boxes, Ruler, Package, CalendarRange } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import KpiCard from "@/components/ui/KpiCard";
import FilterPopover from "@/components/ui/FilterPopover";
import { useApiList } from "@/lib/excise/useApiList";
import { poRollupStatus } from "@/lib/sahamit/po";
import { fmtNumber, fmtMoneyCompact } from "@/lib/format";
import { dashboardKpis, categoryOptions, volumeOptions, yearOptions, fgCodeFilterSet, filterRoundsByFg, filterPosByFg } from "@/lib/sahamit/dashboard";
import DashboardCharts from "@/components/sahamit/DashboardCharts";
import FcRoundsView from "@/components/sahamit/FcRoundsView";
import FcVsPoView from "@/components/sahamit/FcVsPoView";

// SAHAMIT command center — ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109), เฉพาะทีม Key Account.
// แดชบอร์ดติดตาม FC/PO + การเติบโต. ทุกตัวเลข/กราฟต่อจาก peak engine เดิม
// (buildReconMatrix ผ่าน lib/sahamit/dashboard) — ไม่มีเครื่องยนต์จับคู่ตัวที่สอง.

const STATUS_META = {
  match: ["ครบ (FC=PO)", "var(--green)"], over: ["PO เกิน", "var(--teal)"],
  discrepancy: ["PO ไม่ครบ", "var(--amber)"], pending: ["รอ PO", "var(--red)"],
  unforecasted: ["นอก FC", "var(--violet)"], covered: ["ชดเชยข้ามเดือน", "var(--green)"],
  shifted: ["เลื่อนเดือน", "var(--blue)"], cancelled: ["ยกเลิก", "var(--text-3)"],
};

const TABS = [
  { key: "overview", label: "ภาพรวม", icon: LayoutDashboard },
  { key: "rounds", label: "FC แต่ละรอบ", icon: LineChart },
  { key: "fcpo", label: "FC ซ้อน PO", icon: GitCompareArrows },
  { key: "match", label: "PO เทียบ FC", icon: Target },
  { key: "growth", label: "การเติบโต", icon: TrendingUp },
];

// ปุ่มสลับหน่วย ชิ้น ↔ มูลค่า(฿) — segmented control ตามโทเคนระบบ
function UnitToggle({ unit, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--panel-2)", padding: 3, borderRadius: 9, gap: 2 }}>
      {[["qty", "ชิ้น"], ["value", "มูลค่า (฿)"]].map(([k, lbl]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          style={{
            border: "none", cursor: "pointer", padding: "6px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600,
            fontFamily: "inherit", transition: "all .15s",
            background: unit === k ? "var(--bg)" : "transparent",
            color: unit === k ? "var(--text)" : "var(--text-3)",
            boxShadow: unit === k ? "0 1px 3px rgba(0,0,0,.12)" : "none",
          }}>{lbl}</button>
      ))}
    </div>
  );
}

export default function SahamitOverview() {
  const router = useRouter();
  const { data: rounds, loading: l1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2 } = useApiList("/api/sahamit/po");
  const { data: coverages, loading: l3 } = useApiList("/api/sahamit/coverage");
  const { data: products, loading: l4 } = useApiList("/api/sahamit/products");

  const [tab, setTab] = useState("overview");
  const [unit, setUnit] = useState("qty"); // 'qty' | 'value'
  // ตัวกรอง multi-select (มาตรฐาน FilterPopover ทั้งระบบ): หมวด/ปริมาตร/สินค้า/ปี
  const [cats, setCats] = useState([]);
  const [vols, setVols] = useState([]);
  const [skus, setSkus] = useState([]);
  const [years, setYears] = useState([]);
  const filterCount = cats.length + vols.length + skus.length + years.length;

  // ตัวเลือกตัวกรองจากข้อมูลจริง
  const catOpts = useMemo(() => categoryOptions(products), [products]);
  const volOpts = useMemo(() => volumeOptions(products), [products]);
  const yrOpts = useMemo(() => yearOptions(rounds, pos), [rounds, pos]);
  const volUnitOf = useMemo(() => {
    const m = new Map();
    for (const p of products || []) if (p.volume != null && !m.has(String(p.volume))) m.set(String(p.volume), p.volumeUnit || "");
    return m;
  }, [products]);

  const filterGroups = useMemo(() => [
    { key: "cat", label: "ประเภทสินค้า", icon: Boxes, selected: cats, onChange: setCats,
      options: catOpts.map((c) => ({ value: c, label: c })) },
    { key: "vol", label: "ปริมาตร", icon: Ruler, selected: vols, onChange: setVols,
      options: volOpts.map((v) => ({ value: String(v), label: `${v}${volUnitOf.get(String(v)) || ""}` })) },
    { key: "sku", label: "สินค้า", icon: Package, selected: skus, onChange: setSkus,
      options: (products || []).map((p) => ({ value: p.fgCode, label: p.name || p.fgCode })) },
    { key: "year", label: "ปี", icon: CalendarRange, selected: years, onChange: setYears,
      options: yrOpts.map((y) => ({ value: y, label: y })) },
  ], [catOpts, volOpts, yrOpts, volUnitOf, products, cats, vols, skus, years]);

  const clearFilters = () => { setCats([]); setVols([]); setSkus([]); setYears([]); };

  // ข้อมูลหลังกรองสินค้า (ใช้กับกราฟ). ปีกรองแค่คอลัมน์เดือนใน KPI/กราฟ ไม่ตัดบรรทัด.
  const fgSet = useMemo(() => fgCodeFilterSet(products, { cats, vols, skus }), [products, cats, vols, skus]);
  const fRounds = useMemo(() => filterRoundsByFg(rounds, fgSet), [rounds, fgSet]);
  const fPos = useMemo(() => filterPosByFg(pos, fgSet), [pos, fgSet]);

  const kpi = useMemo(() => dashboardKpis(rounds, pos, coverages, products, { unit, filter: { cats, vols, skus }, years }),
    [rounds, pos, coverages, products, unit, cats, vols, skus, years]);

  const latestRound = rounds.reduce((m, r) => Math.max(m, r.roundNo || 0), 0);
  const fmtTotal = (n) => (unit === "value" ? fmtMoneyCompact(n) : fmtNumber(n));

  // PO follow-up (ยึด pos ทั้งหมด — งานติดตามไม่ผูกกับตัวกรองมุมมอง)
  const followUp = pos.filter((p) => ["open", "partial"].includes(poRollupStatus(p)));
  const recentFollowUps = [...followUp].sort((a, b) => new Date(a.receivedDate || 0) - new Date(b.receivedDate || 0)).slice(0, 5);
  const recentFCs = [...rounds].sort((a, b) => new Date(b.receivedDate || 0) - new Date(a.receivedDate || 0)).slice(0, 3);

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม (Dashboard)"
      subtitle="ติดตาม FC / PO และการเติบโต · ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109) — เฉพาะทีม Key Account"
      loading={l1 || l2 || l3 || l4}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <FilterPopover groups={filterGroups} count={filterCount} onClear={clearFilters} />
          <UnitToggle unit={unit} onChange={setUnit} />
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* KPI row (unit-aware) */}
        <section>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <KpiCard label={`FC ตามแผน (${unit === "value" ? "฿" : "ชิ้น"})`} value={fmtTotal(kpi.fcTotal)} tone="info" icon={LineChart} hint={latestRound ? `ล่าสุดรอบ #${latestRound}` : "ยังไม่มีรอบ"} onClick={() => router.push("/sahamit/forecast")} />
            <KpiCard label={`PO สั่งจริง (${unit === "value" ? "฿" : "ชิ้น"})`} value={fmtTotal(kpi.poTotal)} tone="accent" icon={FileText} onClick={() => router.push("/sahamit/po")} />
            <KpiCard label="ครอบคลุม (PO ÷ FC)" value={`${kpi.coveragePct}%`} tone={kpi.coveragePct >= 90 ? "success" : "warning"} />
            <KpiCard label="จุดที่ต้องตาม" value={kpi.alertCount} tone={kpi.alertCount ? "danger" : "success"} hint="รอ PO + PO ไม่ครบ + นอกแผน" onClick={() => router.push("/sahamit/reconcile")} />
          </div>
          {/* Status badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {Object.entries(kpi.statusCounts).sort((a, b) => b[1] - a[1]).map(([st, n]) => {
              const [label, color] = STATUS_META[st] || [st, "var(--text-3)"];
              return (
                <span key={st} className="ui-badge" style={{ color, borderColor: color, fontSize: 12.5 }}>
                  {label}: <b style={{ marginLeft: 4 }}>{fmtNumber(n)}</b>
                </span>
              );
            })}
            {Object.keys(kpi.statusCounts).length === 0 && <span style={{ color: "var(--text-3)", fontSize: 13 }}>— ยังไม่มีข้อมูล FC/PO —</span>}
            {unit === "value" && kpi.unpricedCount > 0 && (
              <span className="ui-badge" style={{ color: "var(--amber)", borderColor: "var(--amber)", fontSize: 12.5 }}>
                {kpi.unpricedCount} สินค้ายังไม่ตั้งราคา — มูลค่าต่ำกว่าจริง
              </span>
            )}
          </div>
        </section>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer",
                background: "transparent", fontFamily: "inherit", fontSize: 13.5, fontWeight: 600,
                padding: "10px 14px", marginBottom: -1, borderRadius: "8px 8px 0 0",
                color: tab === key ? "var(--accent)" : "var(--text-3)",
                borderBottom: tab === key ? "2px solid var(--accent)" : "2px solid transparent",
              }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "overview" && (
          <div className="flex flex-col gap-6">
            <DashboardCharts rounds={fRounds} pos={fPos} coverages={coverages} />

            <section className="form-grid" style={{ gridTemplateColumns: "2fr 1fr", gap: "24px", alignItems: "start" }}>
              {/* Follow-up POs */}
              <div className="glass-panel" style={{ padding: "0", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertCircle size={16} style={{ color: "var(--amber)" }} />
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>PO ที่ต้องการการติดตาม (ด่วน)</h3>
                  <button className="btn ghost" style={{ marginLeft: "auto", padding: "4px 8px", fontSize: "12px" }} onClick={() => router.push("/sahamit/po")}>ดูทั้งหมด</button>
                </div>
                {recentFollowUps.length > 0 ? (
                  <table className="premium-table" style={{ borderTop: "none" }}>
                    <thead><tr><th style={{ paddingLeft: "20px" }}>เลขที่ PO</th><th>วันที่รับ PO</th><th>สถานะ</th></tr></thead>
                    <tbody>
                      {recentFollowUps.map((p) => (
                        <tr key={p.id} onClick={() => router.push(`/sahamit/po?q=${p.poNumber}`)} style={{ cursor: "pointer" }} className="hover-row">
                          <td style={{ paddingLeft: "20px", fontWeight: 500, color: "var(--accent)" }}>{p.poNumber}</td>
                          <td>{p.receivedDate || "-"}</td>
                          <td><span className={`status-pill ${poRollupStatus(p) === "open" ? "warning" : "info"}`}>{poRollupStatus(p) === "open" ? "รอผลิต" : "ทยอยส่ง"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state" style={{ padding: "32px", fontSize: "13px" }}>ไม่มี PO ค้างส่งที่ต้องติดตาม เยี่ยมมาก!</div>
                )}
              </div>

              {/* Recent FC activity */}
              <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <Clock size={16} style={{ color: "var(--text-3)" }} />
                  <h3 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>การอัปเดต FC ล่าสุด</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {recentFCs.map((fc) => (
                    <div key={fc.id} style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "12px", borderBottom: "1px dashed var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontWeight: 500, fontSize: "13px", color: "var(--text)", cursor: "pointer" }} onClick={() => router.push("/sahamit/forecast")}>นำเข้ารอบ FC ที่ #{fc.roundNo}</span>
                        <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{fc.receivedDate || "-"}</span>
                      </div>
                      <span style={{ fontSize: "12px", color: "var(--text-2)" }}>ครอบคลุม {fc.coverMonths?.length || 0} เดือน</span>
                    </div>
                  ))}
                  {recentFCs.length === 0 && <div className="empty-state" style={{ padding: "20px 0" }}>ไม่มีประวัติการนำเข้า FC</div>}
                </div>
              </div>
            </section>
          </div>
        )}

        {tab === "rounds" && <FcRoundsView rounds={fRounds} products={products} unit={unit} years={years} />}

        {tab === "fcpo" && <FcVsPoView rounds={fRounds} pos={fPos} coverages={coverages} products={products} unit={unit} years={years} />}

        {!["overview", "rounds", "fcpo"].includes(tab) && <ComingSoon tab={TABS.find((t) => t.key === tab)} />}
      </div>
    </Workspace>
  );
}

function ComingSoon({ tab }) {
  const Icon = tab?.icon || LayoutDashboard;
  const NEXT = {
    rounds: "เส้นวิวัฒนาการ FC แต่ละรอบต่อเดือน + ยอดรวมรอบ + %เปลี่ยนรอบต่อรอบ",
    fcpo: "กราฟซ้อน: PO ที่มาแล้ว + FC ที่ยังรอ PO + เส้น FC แต่ละรอบ รายเดือน",
    match: "PO เทียบ FC รายสินค้า×เดือน ระบายสีตามสถานะ + ตารางเจาะลึกกาง PO ย่อย",
    growth: "ยอด PO จริงรายเดือน/ไตรมาส + %เติบโต (YoY เปิดเมื่อมีข้อมูลปีก่อน)",
  };
  return (
    <div className="glass-panel" style={{ padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <Icon size={30} style={{ color: "var(--text-3)" }} />
      <div style={{ fontSize: 15, fontWeight: 600 }}>{tab?.label} — กำลังพัฒนา</div>
      <div style={{ fontSize: 13, color: "var(--text-3)", maxWidth: 460 }}>{NEXT[tab?.key] || "เร็ว ๆ นี้"}</div>
    </div>
  );
}
