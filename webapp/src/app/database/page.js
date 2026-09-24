"use client";
import { ChartCanvas } from "@/components/ui/ChartCard";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Package, Building2, ChevronRight, TrendingUp, BarChart3, PieChart as PieChartIcon, Hourglass, CalendarRange, Users, AlertCircle } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ActionQueue from "@/components/ui/ActionQueue";
import FilterPopover from "@/components/ui/FilterPopover";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import StatusNotice from "@/components/ui/StatusNotice";
import Button from "@/components/ui/Button";
import { useApiList } from "@/lib/excise/useApiList";
import { sourcesFailureDetail } from "@/lib/ui/loadFailure";
import { useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canApproveMasterData, isSuperuser } from "@/lib/permissions";
import { approvalStatusOf } from "@/components/ApprovalStatus";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts";
import { CHART_LINE_TYPE, CHART_CATEGORICAL } from "@/lib/chartTheme";
import { brandLabel } from "@/lib/master/brands";
import { productIdentity } from "@/lib/master/productIdentity";
import { NA, naText } from "@/lib/format";

const teamsOf = (c) => (c?.teams?.length ? c.teams : c?.team ? [c.team] : []);

/* ชุดจำแนกประเภทกลาง (ดู chartTheme.js) — เดิมเป็นลิสต์เฉพาะหน้าเริ่มด้วย accent
   ซึ่งชนสีปุ่ม · ลำดับ segment ของ v1 ขยับตามชุดกลางโดยเจตนา */
const COLORS = CHART_CATEGORICAL;

export default function DatabaseOverview() {
  const router = useRouter();
  const role = useRole();
  const myTeam = useTeam();
  const myTeams = useTeams();
  const { data: rawProducts, loading: l1, error: productsError, staleError: productsStale, errorDetail: productsDetail, loaded: productsLoaded, reload: reloadProducts } = useApiList("/api/master/products?manage=1");
  const { data: rawCustomers, loading: l2, error: customersError, staleError: customersStale, errorDetail: customersDetail, loaded: customersLoaded, reload: reloadCustomers } = useApiList("/api/master/customers?manage=1");

  /* ── โหลดพัง ≠ ทะเบียนว่าง ─────────────────────────────────────────────────
     🐞 ของเดิมแกะแค่ `{ data, loading }` ⇒ API ตอบ 500 เมื่อไร `rawProducts`/`rawCustomers`
     ค้างที่ `[]` แล้วจอนี้ขึ้น "สินค้าทั้งหมด 0 · ลูกค้าทั้งหมด 0" + "ไม่มีรายการรออนุมัติตอนนี้ 🎉"
     ซึ่งอ่านได้ว่าทะเบียนว่าง/อนุมัติหมดแล้ว ไม่ใช่ระบบพัง — ทรงเดียวกับที่ซ่อน /tax ไว้ 26 วัน (#1795)

     ⭐ **ป้ายเดียวที่หัวจอ ไม่ใช่ป้ายประจำแผง** — จอนี้ไม่ใช่ "แผงสินค้า" คู่กับ "แผงลูกค้า":
       · แถว KPI สี่ใบอยู่แถวเดียว สลับสายกัน (สินค้า · ลูกค้า · สินค้า · ลูกค้า)
       · กราฟแนวโน้มวาดสองสายบนแกนเดียว
       · คิวรออนุมัติผสมแถวสินค้ากับลูกค้าไว้ในกองเดียว
     ⇒ ป้ายรายแผงต้องไปแปะซ้ำในห้าแผง และแผงที่ผสมสองสายก็ยังตอบไม่ได้ว่าครึ่งไหนหาย
     ⇒ ป้ายเดียวบอกชื่อสายที่ล้ม (ท่าเดียวกับ /tax) · แต่ละแผงแค่เลิกพูดตัวเลขของสายที่ไม่มีในมือ
       แล้วชี้ขึ้นไปที่ป้าย

     ⚠️ **สองคำถามคนละข้อ ห้ามยุบเป็นตัวเดียว** (กติกาเดียวกับ /tax · /sahamit) —
       1. **ขึ้นป้ายไหม** = มี `error` (หรือรอบเบื้องหลังล้ม `staleError`) ก็ขึ้น · `apiCache` อยู่ระดับ
          โมดูล อายุเท่าแท็บ ⇒ เดินไป /database/products แล้วกดกลับ จอวาดของเก่าจากแคชได้ครบก่อน
          แล้วรอบใหม่ค่อยล้ม · ผูกป้ายไว้กับ "ว่างด้วย" = ตัวเลขเมื่อวานยืนยันตัวเองเงียบ ๆ
       2. **เลิกโชว์ตัวเลขไหม** = error **คู่กับ** ไม่มีของในมือ (`…Failed`) เท่านั้น — และบล็อกเฉพาะ
          ของที่กินสายนั้น: สินค้าล้ม ⇒ ไทล์สินค้า + กราฟสามใบ (ทุกใบกินสินค้า) · ลูกค้าล้ม ⇒ ไทล์ลูกค้า
          + กราฟแนวโน้ม · คิวรออนุมัติไม่ซ่อน แต่บอกว่ายังไม่ครบ
     🪤 `empty` = **ไม่เคยโหลดสำเร็จ** (`loaded`) ไม่ใช่ `!list.length` — ทะเบียนที่ตอบ `200 []`
        (เช่นตัวกรองทีมที่ไม่มีของ หรือระบบที่เพิ่งเริ่ม) คือคำตอบที่ถูก ต้องยังอ่านว่าว่าง */
  const sources = [
    { label: "สินค้า", error: productsError || productsStale, empty: !productsLoaded, detail: productsDetail, reload: reloadProducts },
    { label: "ลูกค้า", error: customersError || customersStale, empty: !customersLoaded, detail: customersDetail, reload: reloadCustomers },
  ];
  const failing = sources.filter((s) => s.error);
  const blocked = failing.filter((s) => s.empty);
  const productsFailed = !!(productsError || productsStale) && !productsLoaded;
  const customersFailed = !!(customersError || customersStale) && !customersLoaded;
  // 🪤 พ่วงทุกข้อความ ไม่ใช่ตัวแรก — สองสายล้มพร้อมกันมักคนละเหตุ และตัวที่ถูกทิ้งมักเป็นตัวที่ไขคดีได้
  const causes = [...new Set(failing.map((s) => s.error))].join(" · ");
  const loadError = failing.length
    ? `ดึงข้อมูลไม่ได้: ${failing.map((s) => s.label).join(" · ")} — ${[
      blocked.length ? "ตัวเลขและกราฟของสายที่ดึงไม่ได้จึงยังไม่แสดง และรายการรออนุมัติยังไม่ครบ" : null,
      blocked.length < failing.length ? "ตัวเลขที่ยังเห็นอยู่เป็นข้อมูลรอบก่อน ไม่ใช่ล่าสุด" : null,
    ].filter(Boolean).join(" · ")} · ${causes}`
    : null;
  // ⭐ สตริงดิบของทุกสายที่ล้ม — บรรทัดรองของกล่อง (มติ 23/09 "ไทยนำ + ดิบเป็นบรรทัดเล็ก")
  const loadErrorDetail = sourcesFailureDetail(failing);
  // กด "ลองใหม่" = รอบหน้าบ้าน ⇒ `l1/l2` เป็น true ⇒ `Workspace loading` สลับเนื้อเป็น skeleton ให้เองระหว่างรอ
  const retryLoad = () => failing.forEach((s) => s.reload());
  /* คิวรออนุมัติกินทั้งสองสาย — สายไหนไม่มีของในมือ แถวของสายนั้นหายไปเงียบ ๆ ⇒ ป้ายจำนวน
     ต้องไม่อ้างยอดเต็ม และช่องว่างต้องไม่ยินดีว่าอนุมัติหมดแล้ว (ท่าเดียวกับ WorkQueue ของ /tax) */
  const queueIncomplete = productsFailed || customersFailed;

  const canApprove = canApproveMasterData(role);

  // ตัวกรองรวมใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) —
  // ทุกหมวด multi-select, ว่าง = ทั้งหมด (ช่วงเวลาหลายค่า = รวมกัน/union)
  const [timeframe, setTimeframe] = useState([]);
  const [teamFilter, setTeamFilter] = useState([]);

  // Extract unique teams for the filter dropdown
  const allTeams = useMemo(() => {
    const teams = new Set();
    (rawProducts || []).forEach(p => p.team && teams.add(p.team));
    (rawCustomers || []).forEach(c => teamsOf(c).forEach(t => teams.add(t)));
    return Array.from(teams).sort();
  }, [rawProducts, rawCustomers]);

  // Filter Data
  const { products, customers } = useMemo(() => {
    const now = new Date();
    const filterFn = (item) => {
      if (teamFilter.length) {
        const itemTeams = item.teams?.length ? item.teams : (item.team ? [item.team] : []);
        if (!itemTeams.some((t) => teamFilter.includes(t))) return false;
      }
      if (!timeframe.length) return true;
      const d = new Date(item.createdAt);
      if (isNaN(d)) return true;
      return timeframe.some((tf) =>
        tf === "30d" ? (now - d) / (1000 * 60 * 60 * 24) <= 30
          : tf === "1y" ? d.getFullYear() === now.getFullYear()
            : true,
      );
    };
    return {
      products: (rawProducts || []).filter(filterFn),
      customers: (rawCustomers || []).filter(filterFn)
    };
  }, [rawProducts, rawCustomers, timeframe, teamFilter]);

  // Process data for charts
  const trendData = useMemo(() => {
    const map = {};
    products.forEach(p => {
      const d = new Date(p.createdAt);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { name: key, สินค้า: 0, ลูกค้า: 0 };
      map[key].สินค้า++;
    });
    customers.forEach(c => {
      const d = new Date(c.createdAt);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { name: key, สินค้า: 0, ลูกค้า: 0 };
      map[key].ลูกค้า++;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [products, customers]);

  const topCustomersData = useMemo(() => {
    const counts = {};
    products.forEach(p => {
      const name = p.customerName || "ไม่ระบุ";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [products]);

  const categoryData = useMemo(() => {
    const counts = {};
    products.forEach(p => {
      const cat = p.categoryCode || "ไม่มีหมวดหมู่";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [products]);

  const countOf = (list) => ({
    approved: list.filter((x) => approvalStatusOf(x) === "approved").length,
    pending: list.filter((x) => approvalStatusOf(x) === "pending").length,
    inactive: list.filter((x) => x.isActive === false).length,
    total: list.length
  });
  const pStats = countOf(products);
  const cStats = countOf(customers);

  const queue = useMemo(() => {
    // คนอยู่หลายทีมได้ ⇒ อนุมัติของทุกทีมที่ตัวเองสังกัด
    const canApproveProduct = (p) => canApprove && (isSuperuser(role) || myTeams.includes(p?.team));
    const canApproveCustomer = (c) => canApprove && (isSuperuser(role) || teamsOf(c).some((t) => myTeams.includes(t)));
    const q = [];
    products.filter((x) => approvalStatusOf(x) === "pending").forEach((x) => {
      const mine = canApproveProduct(x);
      if (canApprove && !mine) return;
      q.push({
        id: `p-${x.id}`, tone: "warning", badge: "สินค้า",
        title: productIdentity(x).text,
        subtitle: x.customerName || brandLabel(x.brandName, x.brandNameEn) || "รออนุมัติสินค้า",
        cta: mine ? "อนุมัติ" : "ดู", onClick: () => router.push("/database/products"),
      });
    });
    customers.filter((x) => approvalStatusOf(x) === "pending").forEach((x) => {
      const mine = canApproveCustomer(x);
      if (canApprove && !mine) return;
      q.push({
        id: `c-${x.id}`, tone: "warning", badge: "ลูกค้า",
        title: `${naText(x.arCode)} · ${x.name || ""}`.trim(),
        subtitle: "รออนุมัติลูกค้า",
        cta: mine ? "อนุมัติ" : "ดู", onClick: () => router.push("/database/customers"),
      });
    });
    return q;
  }, [products, customers, canApprove, role, myTeams, router]);

  /* ตัวกรองนี้คุม **ทั้งหน้า** (KPI · กราฟ · คิวรออนุมัติ) ไม่ใช่รายการใดรายการหนึ่ง
     ⇒ อยู่ที่ headerRight ของ Workspace ไม่ห่อ `.toolbar` (มติผู้ใช้ 2026-09-15 · ข้อเท็จจริง F3
     ของด่าน LIST_PANEL_SHAPE) · แผงเปิดผ่าน portal จึงไม่ล้นขอบขวา */
  const filter = (
    <FilterPopover
        count={timeframe.length + teamFilter.length}
      onClear={() => { setTimeframe([]); setTeamFilter([]); }}
      groups={[
        {
          key: "timeframe", label: "ช่วงเวลา", icon: CalendarRange,
          options: [
            { value: "1y", label: "ปีนี้" },
            { value: "30d", label: "30 วันล่าสุด" },
          ],
          selected: timeframe, onChange: setTimeframe,
        },
        ...(allTeams.length ? [{
          key: "team", label: "ทีมดูแล", icon: Users,
          options: allTeams.map((t) => ({ value: t, label: t })),
          selected: teamFilter, onChange: setTeamFilter,
        }] : []),
      ]}
    />
  );

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวมระบบฐานข้อมูล"
      subtitle="สรุปข้อมูลสินค้า ลูกค้า และรายการรออนุมัติ"
      loading={l1 || l2}
      headerRight={filter}
    >
      <div className="flex flex-col gap-6" style={{ paddingBottom: 40 }}>

        {loadError && (
          <StatusNotice
            tone="error"
            detail={loadErrorDetail}
            action={<Button size="sm" variant="ghost" onClick={retryLoad}>ลองใหม่</Button>}
          >
            {loadError}
          </StatusNotice>
        )}

        {/* KPIs
            ⭐ สายที่ไม่มีของในมือ = **ขีด** (`NA` = "—" ค่าว่างกลางของระบบ) ไม่ใช่ 0 และไม่ใช่ซ่อนการ์ด
            — /tax ซ่อนทั้งแถวได้เพราะหนึ่งแถว = หนึ่งสาย · ที่นี่สี่ใบอยู่แถวเดียวสลับสายกัน ซ่อนเฉพาะ
            ใบของสายที่ล้ม = การ์ดสายที่ยังดีเลื่อนที่ แถวแหว่ง อ่านเป็น "จอเรนเดอร์ไม่ครบ" ไม่ใช่ "ไม่รู้ค่า"
            ⇒ คงการ์ดไว้ที่เดิม ค่าเป็นขีด และบรรทัดใต้ค่าชี้ขึ้นไปที่ป้าย */}
        <div className="kpi-grid" style={{ marginBottom: 0 }}>
          <KpiCard label="สินค้าทั้งหมด" value={productsFailed ? NA : pStats.total} hint={productsFailed ? "ดึงข้อมูลไม่ได้ — ดูข้อความด้านบน" : undefined} icon={Package} tone="accent" onClick={() => router.push("/database/products")} />
          <KpiCard label="ลูกค้าทั้งหมด" value={customersFailed ? NA : cStats.total} hint={customersFailed ? "ดึงข้อมูลไม่ได้ — ดูข้อความด้านบน" : undefined} icon={Building2} tone="info" onClick={() => router.push("/database/customers")} />
          <KpiCard label="สินค้ารออนุมัติ" value={productsFailed ? NA : pStats.pending} hint={productsFailed ? "ดึงข้อมูลไม่ได้ — ดูข้อความด้านบน" : undefined} icon={Hourglass} tone="warning" onClick={() => router.push("/database/products")} />
          <KpiCard label="ลูกค้ารออนุมัติ" value={customersFailed ? NA : cStats.pending} hint={customersFailed ? "ดึงข้อมูลไม่ได้ — ดูข้อความด้านบน" : undefined} icon={Hourglass} tone="danger" onClick={() => router.push("/database/customers")} />
        </div>

        {/* Charts Section 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-panel chart-card flex flex-col" style={{ height: 350 }}>
            <div className="chart-header">
              <h3 className="flex items-center gap-2"><TrendingUp size={16} color="var(--accent)" /> แนวโน้มการขึ้นทะเบียน (ต่อเดือน)</h3>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {/* กราฟนี้กินทั้งสองสาย ⇒ สายไหนไม่มีของในมือก็ **ซ่อนทั้งกราฟ** วางบรรทัดแทน
                  — `trendData` ตั้งทั้งสองคีย์เป็น 0 ทุกเดือน ⇒ ถ้าวาดต่อ เส้นของสายที่ล้มจะนอนที่ 0
                  ตลอดแกน (0 ที่มาจากความไม่รู้) · และไม่วาดเส้นเดียวแทน เพราะงานของกราฟนี้คือเทียบ
                  สองเส้น เส้นเดียวที่ legend ไม่บอกว่าอีกเส้นหายไปไหน อ่านเป็น "ไม่มีลูกค้าใหม่" ได้ */}
              {productsFailed || customersFailed ? (
                <EmptyState icon={AlertCircle} plain className="h-full">กราฟแนวโน้มยังแสดงไม่ได้ — ดูข้อความด้านบน</EmptyState>
              ) : (
              <ChartCanvas><ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    {/* คู่ series ผ่านชุดกลาง: สินค้า = cat-2 (v1 = accent เดิมเป๊ะ) ·
                        ลูกค้า = cat-1 (v1 = blue เดิมเป๊ะ) — v2 ได้คู่ ส้ม/น้ำเงิน ที่วัดแล้ว */}
                    <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_CATEGORICAL[1]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_CATEGORICAL[1]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCust" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_CATEGORICAL[0]} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_CATEGORICAL[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: "var(--fs-3)", fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: "var(--fs-3)", fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: "var(--fs-5)" }} />
                  <Legend wrapperStyle={{ fontSize: "var(--fs-5)", color: 'var(--text-2)' }} iconType="circle" />
                  <Area type={CHART_LINE_TYPE} dataKey="สินค้า" stroke={CHART_CATEGORICAL[1]} strokeWidth={2} fillOpacity={1} fill="url(#colorProd)" />
                  <Area type={CHART_LINE_TYPE} dataKey="ลูกค้า" stroke={CHART_CATEGORICAL[0]} strokeWidth={2} fillOpacity={1} fill="url(#colorCust)" />
                </AreaChart>
              </ResponsiveContainer></ChartCanvas>
              )}
            </div>
          </div>

          <div className="glass-panel chart-card flex flex-col" style={{ height: 350 }}>
            <div className="chart-header">
              <h3 className="flex items-center gap-2"><BarChart3 size={16} color="var(--green)" /> Top 5 ลูกค้าที่มีสินค้ามากที่สุด</h3>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              {/* นับจากทะเบียนสินค้าล้วน (ชื่อลูกค้าบนแถวสินค้า) ⇒ ขึ้นกับสายสินค้าสายเดียว
                  — ลูกค้าล้มไม่เกี่ยว กราฟนี้ยังถูกอยู่ */}
              {productsFailed ? (
                <EmptyState icon={AlertCircle} plain className="h-full">กราฟนี้ต้องใช้ข้อมูลสินค้า ซึ่งยังดึงไม่ได้ — ดูข้อความด้านบน</EmptyState>
              ) : (
              <ChartCanvas><ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCustomersData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: "var(--fs-3)", fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: "var(--fs-3)", fill: 'var(--text-3)' }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--border)' }} contentStyle={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: "var(--fs-5)" }} />
                  <Bar dataKey="count" name="จำนวนสินค้า" fill="var(--green)" radius={[0, 4, 4, 0]}>
                    {topCustomersData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer></ChartCanvas>
              )}
            </div>
          </div>
        </div>

        {/* Charts Section 2 & Action Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <div className="glass-panel chart-card flex flex-col" style={{ height: 350 }}>
            <div className="chart-header">
              <h3 className="flex items-center gap-2"><PieChartIcon size={16} color="var(--violet)" /> สัดส่วนสินค้าแบ่งตามหมวดหมู่</h3>
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {/* ลำดับสำคัญ: พังก่อน ว่างทีหลัง — สินค้าที่ไม่เคยโหลดสำเร็จทำให้ `categoryData` ว่าง
                  แล้วตกไปที่ "ไม่มีข้อมูลสินค้าตามตัวกรองนี้" ซึ่งโทษตัวกรองแทนระบบ */}
              {productsFailed ? (
                <EmptyState icon={AlertCircle} plain className="h-full">กราฟนี้ต้องใช้ข้อมูลสินค้า ซึ่งยังดึงไม่ได้ — ดูข้อความด้านบน</EmptyState>
              ) : categoryData.length === 0 ? (
                <EmptyState icon={Package} plain className="h-full">ไม่มีข้อมูลสินค้าตามตัวกรองนี้</EmptyState>
              ) : (
                <ChartCanvas><ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    {/* 🐞 Recharts 3.9.2: `<Pie>` ที่เปิดอนิเมชัน (ค่าเริ่มต้น) เรนเดอร์ออกมาเป็น sector
                        เปล่าไม่มี path = วงกลมหายทั้งวง และไม่มี error อะไรฟ้อง — ห้ามลบ prop นี้
                        (ตรวจเจอ 2026-08-12 ตอนทำการ์ดช่องทางของลีด · พังเงียบมาก่อนหน้านั้น) */}
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="var(--panel)"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: "var(--fs-5)" }} />
                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: "var(--fs-3)", color: 'var(--text-2)' }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer></ChartCanvas>
              )}
            </div>
          </div>

          <div className="glass-panel chart-card flex flex-col" style={{ minHeight: 350 }}>
            <div className="chart-header">
              <h3 className="flex items-center gap-2">
                {/* คิวไม่ครบ = บอก "อย่างน้อย n" ไม่อ้างยอดเต็ม (กติกาเดียวกับป้ายจำนวนของ WorkQueue) */}
                {canApprove ? "รออนุมัติจากคุณ" : "รายการรออนุมัติ"} {queue.length > 0 && <span className="ui-badge warning">{queueIncomplete ? `อย่างน้อย ${queue.length}` : queue.length}</span>}
              </h3>
              <div className="flex items-center gap-3 text-sm">
                <Link href="/database/products" className="text-[var(--accent)] hover:underline flex items-center">เปิดหน้าสินค้า <ChevronRight size={14} /></Link>
                <Link href="/database/customers" className="text-[var(--accent)] hover:underline flex items-center">เปิดหน้าลูกค้า <ChevronRight size={14} /></Link>
              </div>
            </div>
            <div style={{ flex: 1, maxHeight: 290, overflowY: "auto", paddingRight: 4 }}>
              <ActionQueue items={queue} incomplete={queueIncomplete} empty="ไม่มีรายการรออนุมัติตอนนี้ 🎉" />
            </div>
          </div>
        </div>
      </div>
    </Workspace>
  );
}
