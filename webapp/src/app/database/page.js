"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Package, Building2, ChevronRight, TrendingUp, BarChart3, PieChart as PieChartIcon, Hourglass, CalendarRange, Users } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ActionQueue from "@/components/ui/ActionQueue";
import FilterPopover from "@/components/ui/FilterPopover";
import KpiCard from "@/components/ui/KpiCard";
import EmptyState from "@/components/ui/EmptyState";
import { useApiList } from "@/lib/excise/useApiList";
import { useRole, useTeam } from "@/lib/roleContext";
import { canApproveMasterData, isSuperuser } from "@/lib/permissions";
import { approvalStatusOf } from "@/components/ApprovalStatus";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts";
import { brandLabel } from "@/lib/master/brands";

const teamsOf = (c) => (c?.teams?.length ? c.teams : c?.team ? [c.team] : []);

const COLORS = ['var(--accent)', 'var(--blue)', 'var(--green)', 'var(--amber)', 'var(--violet)'];

export default function DatabaseOverview() {
  const router = useRouter();
  const role = useRole();
  const myTeam = useTeam();
  const { data: rawProducts, loading: l1 } = useApiList("/api/master/products?manage=1");
  const { data: rawCustomers, loading: l2 } = useApiList("/api/master/customers?manage=1");

  const canApprove = canApproveMasterData(role);

  // ตัวกรองรวมใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18) —
  // ช่วงเวลาเลือกได้ค่าเดียว (single), ทีม multi-select, ว่าง = ทั้งหมด
  const [timeframe, setTimeframe] = useState("all");
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
      if (timeframe === "all") return true;
      const d = new Date(item.createdAt);
      if (isNaN(d)) return true;
      if (timeframe === "30d") return (now - d) / (1000 * 60 * 60 * 24) <= 30;
      if (timeframe === "1y") return d.getFullYear() === now.getFullYear();
      return true;
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
    const canApproveProduct = (p) => canApprove && (isSuperuser(role) || p?.team === myTeam);
    const canApproveCustomer = (c) => canApprove && (isSuperuser(role) || teamsOf(c).includes(myTeam));
    const q = [];
    products.filter((x) => approvalStatusOf(x) === "pending").forEach((x) => {
      const mine = canApproveProduct(x);
      if (canApprove && !mine) return;
      q.push({
        id: `p-${x.id}`, tone: "warning", badge: "สินค้า",
        title: `${x.fgCode || "-"} · ${x.productDescriptionEn || x.productDescription || brandLabel(x.brandName, x.brandNameEn) || ""}`.trim(),
        subtitle: x.customerName || brandLabel(x.brandName, x.brandNameEn) || "รออนุมัติสินค้า",
        cta: mine ? "อนุมัติ" : "ดู", onClick: () => router.push("/database/products"),
      });
    });
    customers.filter((x) => approvalStatusOf(x) === "pending").forEach((x) => {
      const mine = canApproveCustomer(x);
      if (canApprove && !mine) return;
      q.push({
        id: `c-${x.id}`, tone: "warning", badge: "ลูกค้า",
        title: `${x.arCode || "-"} · ${x.name || ""}`.trim(),
        subtitle: "รออนุมัติลูกค้า",
        cta: mine ? "อนุมัติ" : "ดู", onClick: () => router.push("/database/customers"),
      });
    });
    return q;
  }, [products, customers, canApprove, role, myTeam, router]);

  const toolbar = (
    <div className="toolbar">
      <FilterPopover
        count={(timeframe !== "all" ? 1 : 0) + teamFilter.length}
        onClear={() => { setTimeframe("all"); setTeamFilter([]); }}
        groups={[
          {
            key: "timeframe", label: "ช่วงเวลา", icon: CalendarRange, single: true,
            options: [
              { value: "1y", label: "ปีนี้" },
              { value: "30d", label: "30 วันล่าสุด" },
            ],
            selected: timeframe === "all" ? [] : [timeframe],
            onChange: (vals) => setTimeframe(vals[0] || "all"),
          },
          ...(allTeams.length ? [{
            key: "team", label: "ทีมดูแล", icon: Users,
            options: allTeams.map((t) => ({ value: t, label: t })),
            selected: teamFilter, onChange: setTeamFilter,
          }] : []),
        ]}
      />
    </div>
  );

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวมระบบฐานข้อมูล"
      subtitle="สรุปข้อมูลสินค้า ลูกค้า และรายการรออนุมัติ"
      loading={l1 || l2}
      toolbar={toolbar}
    >
      <div className="flex flex-col gap-6" style={{ paddingBottom: 40 }}>

        {/* KPIs */}
        <div className="kpi-grid" style={{ marginBottom: 0 }}>
          <KpiCard label="สินค้าทั้งหมด" value={pStats.total} icon={Package} tone="accent" onClick={() => router.push("/database/products")} />
          <KpiCard label="ลูกค้าทั้งหมด" value={cStats.total} icon={Building2} tone="info" onClick={() => router.push("/database/customers")} />
          <KpiCard label="สินค้ารออนุมัติ" value={pStats.pending} icon={Hourglass} tone="warning" onClick={() => router.push("/database/products")} />
          <KpiCard label="ลูกค้ารออนุมัติ" value={cStats.pending} icon={Hourglass} tone="danger" onClick={() => router.push("/database/customers")} />
        </div>

        {/* Charts Section 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-panel chart-card flex flex-col" style={{ height: 350 }}>
            <div className="chart-header">
              <h3 className="flex items-center gap-2"><TrendingUp size={16} color="var(--accent)" /> แนวโน้มการขึ้นทะเบียน (ต่อเดือน)</h3>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCust" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--blue)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--blue)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} iconType="circle" />
                  <Area type="monotone" dataKey="สินค้า" stroke="var(--accent)" strokeWidth={2} fillOpacity={1} fill="url(#colorProd)" />
                  <Area type="monotone" dataKey="ลูกค้า" stroke="var(--blue)" strokeWidth={2} fillOpacity={1} fill="url(#colorCust)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel chart-card flex flex-col" style={{ height: 350 }}>
            <div className="chart-header">
              <h3 className="flex items-center gap-2"><BarChart3 size={16} color="var(--green)" /> Top 5 ลูกค้าที่มีสินค้ามากที่สุด</h3>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCustomersData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} width={100} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'var(--border)' }} contentStyle={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }} />
                  <Bar dataKey="count" name="จำนวนสินค้า" fill="var(--green)" radius={[0, 4, 4, 0]}>
                    {topCustomersData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
              {categoryData.length === 0 ? (
                <EmptyState icon={Package} plain className="h-full">ไม่มีข้อมูลสินค้าตามตัวกรองนี้</EmptyState>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
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
                    >
                      {categoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12 }} />
                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: 11, color: 'var(--text-2)' }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="glass-panel chart-card flex flex-col" style={{ minHeight: 350 }}>
            <div className="chart-header">
              <h3 className="flex items-center gap-2">
                {canApprove ? "รออนุมัติจากคุณ" : "รายการรออนุมัติ"} {queue.length > 0 && <span className="ui-badge warning">{queue.length}</span>}
              </h3>
              <div className="flex items-center gap-3 text-sm">
                <Link href="/database/products" className="text-[var(--accent)] hover:underline flex items-center">เปิดหน้าสินค้า <ChevronRight size={14} /></Link>
                <Link href="/database/customers" className="text-[var(--accent)] hover:underline flex items-center">เปิดหน้าลูกค้า <ChevronRight size={14} /></Link>
              </div>
            </div>
            <div style={{ flex: 1, maxHeight: 290, overflowY: "auto", paddingRight: 4 }}>
              <ActionQueue items={queue} empty="ไม่มีรายการรออนุมัติตอนนี้ 🎉" />
            </div>
          </div>
        </div>
      </div>
    </Workspace>
  );
}
