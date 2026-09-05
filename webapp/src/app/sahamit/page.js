"use client";
import { TableScroll } from "@/components/ui/Table";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, LineChart, ShoppingCart, AlertCircle, Clock, TrendingUp, GitCompareArrows, Target, Tags, Ruler, Package, CalendarRange } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import KpiCard from "@/components/ui/KpiCard";
import Tabs from "@/components/ui/Tabs";
import DetailRow from "@/components/ui/DetailRow";
import FilterPopover from "@/components/ui/FilterPopover";
import { useApiList } from "@/lib/excise/useApiList";
import { poRollupStatus } from "@/lib/sahamit/po";
import { fmtNumber, fmtMoney, fmtPercent, naText } from "@/lib/format";
import { dashboardKpis, categoryOptions, volumeOptions, yearOptions, fgCodeFilterSet, filterRoundsByFg, filterPosByFg } from "@/lib/sahamit/dashboard";
import DashboardCharts from "@/components/sahamit/DashboardCharts";
import FcRoundsView from "@/components/sahamit/FcRoundsView";
import FcVsPoView from "@/components/sahamit/FcVsPoView";
import PoVsFcView from "@/components/sahamit/PoVsFcView";
import GrowthView from "@/components/sahamit/GrowthView";
import { productSelectOptions } from "@/components/master/productOption";

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

// ปุ่มสลับหน่วย ชิ้น ↔ มูลค่า(฿) — ใช้ .segmented กลาง (สลับโหมด/กรอง = segmented).
// สูง = --ctl-h (34px) ให้เท่าปุ่ม "ตัวกรอง" ในแถว header เดียวกัน (แนวเรียบเสมอกัน).
function UnitToggle({ unit, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="หน่วยที่แสดง" style={{ height: "var(--ctl-h)" }}>
      {[["qty", "ชิ้น"], ["value", "มูลค่า (฿)"]].map(([k, lbl]) => (
        <button key={k} type="button" className={unit === k ? "active" : ""} aria-pressed={unit === k} onClick={() => onChange(k)} style={{ height: "100%" }}>{lbl}</button>
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
    { key: "cat", label: "ประเภทสินค้า", icon: Tags, selected: cats, onChange: setCats,
      options: catOpts.map((c) => ({ value: c, label: c })) },
    { key: "vol", label: "ปริมาตร", icon: Ruler, selected: vols, onChange: setVols,
      options: volOpts.map((v) => ({ value: String(v), label: `${v}${volUnitOf.get(String(v)) || ""}` })) },
    { key: "sku", label: "สินค้า", icon: Package, selected: skus, onChange: setSkus, searchable: true,
      options: productSelectOptions(products, (p) => p.fgCode) },
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
  // มูลค่าโชว์เต็มหลักเสมอ (ไม่ย่อ M/K) — การ์ด KPI ย่อฟอนต์ให้เองตามความยาว
  const fmtTotal = (n) => (unit === "value" ? fmtMoney(n) : fmtNumber(n));

  // PO follow-up (ยึด pos ทั้งหมด — งานติดตามไม่ผูกกับตัวกรองมุมมอง)
  const followUp = pos.filter((p) => ["open", "partial"].includes(poRollupStatus(p)));
  const recentFollowUps = [...followUp].sort((a, b) => new Date(a.receivedDate || 0) - new Date(b.receivedDate || 0)).slice(0, 5);
  const recentFCs = [...rounds].sort((a, b) => new Date(b.receivedDate || 0) - new Date(a.receivedDate || 0)).slice(0, 3);

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม"
      subtitle="ติดตาม FC / PO และการเติบโต · ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109) — เฉพาะทีม Key Account"
      loading={l1 || l2 || l3 || l4}
      headerRight={
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
            <KpiCard label={`PO สั่งจริง (${unit === "value" ? "฿" : "ชิ้น"})`} value={fmtTotal(kpi.poTotal)} tone="accent" icon={ShoppingCart} onClick={() => router.push("/sahamit/po")} />
            {/* kpi.coveragePct = ค่าดิบไม่ปัดจาก lib — จัดรูปแบบตอนพิมพ์, ส่วนสีการ์ดยังเทียบตัวเลขดิบกับ 90 */}
            <KpiCard label="ครอบคลุม (PO ÷ FC)" value={fmtPercent(kpi.coveragePct)} tone={kpi.coveragePct >= 90 ? "success" : "warning"} icon={Target} />
            <KpiCard label="จุดที่ต้องตาม" value={kpi.alertCount} tone={kpi.alertCount ? "danger" : "success"} icon={AlertCircle} hint="รอ PO + PO ไม่ครบ + นอกแผน" onClick={() => router.push("/sahamit/reconcile")} />
          </div>
          {/* Status badges */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {Object.entries(kpi.statusCounts).sort((a, b) => b[1] - a[1]).map(([st, n]) => {
              const [label, color] = STATUS_META[st] || [st, "var(--text-3)"];
              return (
                <span key={st} className="ui-badge" style={{ color, borderColor: color, fontSize: "var(--fs-6)" }}>
                  {label}: <b style={{ marginLeft: 4 }}>{fmtNumber(n)}</b>
                </span>
              );
            })}
            {Object.keys(kpi.statusCounts).length === 0 && <span style={{ color: "var(--text-3)", fontSize: "var(--fs-7)" }}>— ยังไม่มีข้อมูล FC/PO —</span>}
            {unit === "value" && kpi.unpricedCount > 0 && (
              <span className="ui-badge" style={{ color: "var(--amber)", borderColor: "var(--amber)", fontSize: "var(--fs-6)" }}>
                {kpi.unpricedCount} สินค้ายังไม่ตั้งราคา — มูลค่าต่ำกว่าจริง
              </span>
            )}
          </div>
        </section>

        {/* Tab bar (component กลาง Tabs — สลับหน้า/มุมมอง) */}
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="มุมมองภาพรวม"
          tabs={TABS.map(({ key, label, icon: Icon }) => ({
            key,
            label: <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon size={15} /> {label}</span>,
          }))}
        />

        {/* Tab content */}
        {tab === "overview" && (
          <div className="flex flex-col gap-6">
            <DashboardCharts rounds={fRounds} pos={fPos} coverages={coverages} />

            {/* 🪤 ต้องเป็น minmax(0, …) ไม่ใช่ `2fr 1fr` — min track sizing function ของ `2fr`
          คือ `auto` ⇒ automatic minimum size ของ grid item มีผล (CSS Grid §6.6)
          ตารางข้างในมี `white-space: nowrap` จึงมี min-content กว้าง แล้วยกฐานราง
          ซ้ายจนดันแผงขวาหลุดออกนอกกล่อง (วัดที่ vp 375: กริดล้น 96px · ที่ 347: 124px)
          `.form-grid` เปล่า ๆ ไม่เข้า media query ที่จับเฉพาะ .cols-2/.cols-3 ⇒ ติดถึงมือถือ */}
            <section className="form-grid" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: "24px", alignItems: "start" }}>
              {/* Follow-up POs */}
              <div className="glass-panel" style={{ padding: "0", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <AlertCircle size={16} style={{ color: "var(--amber)" }} />
                  <h3 style={{ fontSize: "var(--fs-8)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>PO ที่ต้องการการติดตาม (ด่วน)</h3>
                  <button className="btn ghost" style={{ marginLeft: "auto", padding: "4px 8px", fontSize: "var(--fs-5)" }} onClick={() => router.push("/sahamit/po")}>ดูทั้งหมด</button>
                </div>
                {recentFollowUps.length > 0 ? (
                  <TableScroll><table className="premium-table" style={{ borderTop: "none" }}>
                    <thead><tr><th style={{ paddingLeft: "20px" }}>เลขที่ PO</th><th>วันที่รับ PO</th><th>สถานะ</th></tr></thead>
                    <tbody>
                      {recentFollowUps.map((p) => (
                        /* ── แถวเป็น `DetailRow` ไม่ใช่ `<tr onClick>` ดิบ (2026-09-03) ────────────
                            ของเดิมแขวน `onClick` + `cursor: pointer` ไว้บน `<tr>` เอง ⇒ เมาส์กดได้
                            แต่คีย์บอร์ดเข้าไม่ถึง (WCAG 2.1.1) และ **ทางลัดเมาส์บนแถวได้รับยกเว้น
                            ที่ `ui/DetailRow.js` จุดเดียวในระบบ** ⇒ ต้องย้ายมาใช้ primitive ตัวนั้น
                            เงื่อนไขของการยกเว้นคือด่าน ROW_MIRROR: ต้องมี `<Link>` ที่ href
                            **ตรงตัวอักษรต่อตัวอักษร** กับของแถวอยู่ในเซลล์ — ซึ่งเซลล์แรกมีอยู่แล้ว
                            จึงเปลี่ยนแค่แท็ก · `className` ของผู้เรียกถูกต่อท้าย `detail-row` ไม่ทับกัน
                            🪤 `cursor: pointer` มาจาก `.detail-row` แล้ว ไม่ต้องเขียน inline อีก */
                        <DetailRow key={p.id} href={`/sahamit/po?q=${p.poNumber}`} className="hover-row">
                          {/* เลขที่ PO เป็น <Link> จริง = ทางเข้าของคีย์บอร์ด/โปรแกรมอ่านหน้าจอ/เปิดแท็บใหม่
                              onClick ของ <tr> เหลือไว้เป็นทางลัดของเมาส์
                              🪤 ถอด stopPropagation ทิ้งแล้ว — DetailRow ถาม `isInteractiveTarget`
                                 ก่อนยิง router.push จึงเห็น <a> ตัวนี้เอง ไม่มี history ซ้อนสองชั้น
                                 (ท่าเดียวกับที่เรียกอื่น ๆ ของ DetailRow ใช้อยู่) */}
                          <td style={{ paddingLeft: "20px", fontWeight: "var(--fw-medium)" }}>
                            <Link
                              href={`/sahamit/po?q=${p.poNumber}`}
                              className="linklike"
                              title="เปิดรายการ PO ที่กรองด้วยเลขที่นี้"
                            >
                              {p.poNumber}
                            </Link>
                          </td>
                          <td>{naText(p.receivedDate)}</td>
                          <td><span className={`status-pill ${poRollupStatus(p) === "open" ? "warning" : "info"}`}>{poRollupStatus(p) === "open" ? "รอผลิต" : "ทยอยส่ง"}</span></td>
                        </DetailRow>
                      ))}
                    </tbody>
                  </table></TableScroll>
                ) : (
                  <div className="empty-state" style={{ padding: "32px", fontSize: "var(--fs-7)" }}>ไม่มี PO ค้างส่งที่ต้องติดตาม เยี่ยมมาก!</div>
                )}
              </div>

              {/* Recent FC activity */}
              <div className="glass-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                  <Clock size={16} style={{ color: "var(--text-3)" }} />
                  <h3 style={{ fontSize: "var(--fs-8)", fontWeight: "var(--fw-semibold)", color: "var(--text)" }}>การอัปเดต FC ล่าสุด</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {recentFCs.map((fc) => (
                    <div key={fc.id} style={{ display: "flex", flexDirection: "column", gap: "4px", paddingBottom: "12px", borderBottom: "1px dashed var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        {/* ── หัวข้อรอบ FC เป็น <Link> ไม่ใช่ <span onClick> (2026-09-03) ──────────
                            เดิมเป็น `<span>` ที่แขวนตัวรับคลิกยิง router.push เอง ⇒ เมาส์กดได้ แต่คีย์บอร์ด
                            เข้าไม่ถึงเลย (WCAG 2.1.1) และไม่ได้คลิกกลาง/เปิดแท็บใหม่/เมนูคลิกขวา
                            ⇒ ห่อด้วย <Link> ตรง ๆ ได้ **เพราะไม่มีตัวกดครอบอยู่**: แม่เป็น <div>
                            ธรรมดาสองชั้นที่ไม่มี onClick ⇒ ไม่กลายเป็นตัวกดซ้อนตัวกด
                            🪤 ใช้ `.card-link` ไม่ใช่ `.linklike` — `.linklike` เป็น **ลิงก์ข้อความ**
                               (สี accent + เส้นใต้) ซึ่งจะเปลี่ยนหน้าตาหัวข้อนี้ทั้งบรรทัด
                               `.card-link` ให้ `color: inherit` + วงโฟกัส `--accent-ink` เฉย ๆ
                               ⇒ inline style เดิม (สี/น้ำหนัก/ขนาด) ยังคุมหน้าตาเหมือนเดิมทุกพิกเซล
                            🪤 ถอด `cursor: pointer` ออก — <a> ที่มี href แจกให้เองอยู่แล้ว */}
                        <Link href="/sahamit/forecast" className="card-link" style={{ fontWeight: "var(--fw-medium)", fontSize: "var(--fs-7)", color: "var(--text)" }}>นำเข้ารอบ FC ที่ #{fc.roundNo}</Link>
                        <span style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>{naText(fc.receivedDate)}</span>
                      </div>
                      <span style={{ fontSize: "var(--fs-5)", color: "var(--text-2)" }}>ครอบคลุม {fc.coverMonths?.length || 0} เดือน</span>
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

        {tab === "match" && <PoVsFcView rounds={fRounds} pos={fPos} coverages={coverages} products={products} unit={unit} years={years} />}

        {tab === "growth" && <GrowthView pos={fPos} products={products} unit={unit} years={years} />}
      </div>
    </Workspace>
  );
}

