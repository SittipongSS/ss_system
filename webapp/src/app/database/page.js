"use client";
import Select from "@/components/ui/Select";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Package, Building2, ChevronRight, TrendingUp, Filter, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import ActionQueue from "@/components/ui/ActionQueue";
import { useApiList } from "@/lib/excise/useApiList";
import { useRole, useTeam } from "@/lib/roleContext";
import { canApproveMasterData, isSuperuser } from "@/lib/permissions";
import { approvalStatusOf } from "@/components/ApprovalStatus";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from "recharts";
import { brandLabel } from "@/lib/master/brands";

const teamsOf = (c) => (c?.teams?.length ? c.teams : c?.team ? [c.team] : []);

const COLORS = ['var(--accent)', 'var(--blue)', 'var(--green)', 'var(--amber)', 'var(--violet)'];

function StatCard({ title, value, icon: Icon, toneColor, onClick }) {
  return (
    <div
      onClick={onClick}
      className="glass-panel hover-card"
      style={{
        padding: "20px", display: "flex", flexDirection: "column", gap: "12px",
        cursor: onClick ? "pointer" : "default",
        borderTop: `3px solid ${toneColor}`,
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div className="flex items-center justify-between" style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 600 }}>
        <span>{title}</span>
        {Icon && <Icon size={18} color={toneColor} style={{ opacity: 0.8 }} />}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>
        {value.toLocaleString()}
      </div>
      {/* Subtle decorative background gradient */}
      <div style={{
        position: 'absolute', right: -20, bottom: -20, width: 80, height: 80,
        borderRadius: '50%', background: toneColor, opacity: 0.05, pointerEvents: 'none'
      }} />
    </div>
  );
}

export default function DatabaseOverview() {
  const router = useRouter();
  const role = useRole();
  const myTeam = useTeam();
  const { data: rawProducts, loading: l1 } = useApiList("/api/master/products?manage=1");
  const { data: rawCustomers, loading: l2 } = useApiList("/api/master/customers?manage=1");

  const canApprove = canApproveMasterData(role);

  // Filters State
  const [timeframe, setTimeframe] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");

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
      if (teamFilter !== "all") {
        const itemTeams = item.teams?.length ? item.teams : (item.team ? [item.team] : []);
        if (!itemTeams.includes(teamFilter) && item.team !== teamFilter) return false;
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

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวมระบบฐานข้อมูล"
      subtitle="Interactive Dashboard สรุปข้อมูลสินค้า ลูกค้า และสถานะการทำงาน"
      loading={l1 || l2}
    >
      <div className="flex flex-col gap-6" style={{ paddingBottom: 40 }}>
        
        {/* Controls / Filters */}
        <div className="glass-panel flex flex-wrap items-center gap-4" style={{ padding: "12px 20px" }}>
          <div className="flex items-center gap-2" style={{ color: "var(--text-3)", fontSize: 13, fontWeight: 500 }}>
            <Filter size={16} /> ตัวกรองข้อมูล:
          </div>
          <Select
            value={timeframe} 
            onChange={(e) => setTimeframe(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none", cursor: "pointer" }}
          >
            <option value="all">เวลาทั้งหมด (All Time)</option>
            <option value="1y">ปีนี้ (This Year)</option>
            <option value="30d">30 วันล่าสุด (Last 30 Days)</option>
          </Select>
          <Select
            value={teamFilter} 
            onChange={(e) => setTeamFilter(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, outline: "none", cursor: "pointer" }}
          >
            <option value="all">ทุกทีม (All Teams)</option>
            {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>

        {/* KPIs Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          <StatCard title="สินค้าทั้งหมด" value={pStats.total} icon={Package} toneColor="var(--accent)" onClick={() => router.push("/database/products")} />
          <StatCard title="ลูกค้าทั้งหมด" value={cStats.total} icon={Building2} toneColor="var(--blue)" onClick={() => router.push("/database/customers")} />
          <StatCard title="สินค้ารออนุมัติ" value={pStats.pending} icon={TrendingUp} toneColor="var(--amber)" onClick={() => router.push("/database/products")} />
          <StatCard title="ลูกค้ารออนุมัติ" value={cStats.pending} icon={TrendingUp} toneColor="var(--red)" onClick={() => router.push("/database/customers")} />
        </div>

        {/* Charts Section 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "16px" }}>
          <div className="glass-panel flex flex-col" style={{ padding: "20px", height: 350 }}>
            <div className="flex items-center gap-2 mb-4" style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>
              <TrendingUp size={16} color="var(--accent)" /> แนวโน้มการขึ้นทะเบียน (ต่อเดือน)
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

          <div className="glass-panel flex flex-col" style={{ padding: "20px", height: 350 }}>
            <div className="flex items-center gap-2 mb-4" style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>
              <BarChart3 size={16} color="var(--green)" /> Top 5 ลูกค้าที่มีสินค้ามากที่สุด
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "16px" }}>
          
          <div className="glass-panel flex flex-col" style={{ padding: "20px", height: 350 }}>
            <div className="flex items-center gap-2 mb-4" style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>
              <PieChartIcon size={16} color="var(--violet)" /> สัดส่วนสินค้าแบ่งตามหมวดหมู่
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {categoryData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm" style={{ color: 'var(--text-3)' }}>ไม่มีข้อมูลสินค้า</div>
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

          <div className="glass-panel flex flex-col" style={{ padding: "20px", minHeight: 350 }}>
            <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>
              {canApprove ? "รออนุมัติจากคุณ" : "รายการรออนุมัติ"} {queue.length > 0 && <span className="ui-badge warning">{queue.length}</span>}
            </div>
            <div style={{ flex: 1, maxHeight: 290, overflowY: "auto", paddingRight: 4 }}>
              <ActionQueue items={queue} empty="ไม่มีรายการรออนุมัติตอนนี้ 🎉" />
            </div>
            <div className="mt-3 flex gap-4 text-sm" style={{ color: "var(--text-2)" }}>
              <Link href="/database/products" className="flex items-center hover-card" style={{ color: "var(--accent)" }}>เปิดคลังสินค้า <ChevronRight size={14} /></Link>
              <Link href="/database/customers" className="flex items-center hover-card" style={{ color: "var(--blue)" }}>เปิดฐานลูกค้า <ChevronRight size={14} /></Link>
            </div>
          </div>
        </div>
      </div>
    </Workspace>
  );
}
