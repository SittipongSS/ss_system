"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import SaWorkspace from "@/components/salesPlanning/SaWorkspace";
import { useRole } from "@/lib/roleContext";
import { canSeeTaskKpi, canSeeLeadKpi, canSeeDealKpi, canSeeRdKpi } from "@/lib/permissions";
import { MonthPicker, thisMonth } from "@/components/salesPlanning/ui";
import SalesKpiDashboard from "@/components/pm/SalesKpiDashboard";
import MyDashboardTab from "@/components/salesPlanning/dashboard/MyDashboardTab";
import KpiLeadsTab from "@/components/salesPlanning/dashboard/KpiLeadsTab";
import RdDashboardTab from "@/components/salesPlanning/dashboard/RdDashboardTab";
import PerformanceTab from "@/components/salesPlanning/dashboard/performance/PerformanceTab";
import Tabs from "@/components/ui/Tabs";
import SkeletonRows from "@/components/ui/Skeleton";

// หน้า /sa/dashboard — ศูนย์รวมแดชบอร์ดฝ่ายขาย 5 แท็บ. แท็บ "ผลงานขาย" แทน
// "KPI ดีล" เดิม (2026-07-18): บอร์ดประชุมเช้า + ทบยอด + เจาะรายคน/ทีม —
// เนื้อหาทั้งหมดอยู่ใน components/salesPlanning/dashboard/performance/.

const DASHBOARD_TABS = [
  { key: "my", label: "แดชบอร์ดของฉัน" },
  { key: "rd_kpi", label: "แดชบอร์ด RD" },
  { key: "lead_kpi", label: "KPI ลีด" },
  { key: "performance", label: "ผลงานขาย" },
  { key: "task_kpi", label: "KPI งาน" },
];

export default function SalesPlanningOverviewPage() {
  return (
    <React.Suspense fallback={<SkeletonRows rows={7} />}>
      <DashboardContent />
    </React.Suspense>
  );
}

// ลิงก์เก่า ?tab=overview (KPI ดีล เดิม) → แท็บผลงานขาย
const normalizeTab = (t) => (t === "overview" ? "performance" : t);

function DashboardContent() {
  const searchParams = useSearchParams();
  const role = useRole();
  const canSeeKpi = canSeeTaskKpi(role);
  const currentMonth = thisMonth();
  const [month, setMonth] = useState(currentMonth);
  const [tab, setTab] = useState(normalizeTab(searchParams.get("tab")) || "my");
  useEffect(() => {
    const t = normalizeTab(searchParams.get("tab"));
    if (t) setTab(t);
  }, [searchParams]);
  // role rd: "แดชบอร์ดของฉัน" ฝั่งขายไม่มีความหมาย (ไม่มีดีลของตัวเอง) —
  // เด้งไปแท็บ RD เป็นค่าเริ่มต้น (ยังเปิดแท็บอื่นที่มีสิทธิ์ได้ตามปกติ)
  useEffect(() => {
    if (role === "rd" && tab === "my" && !searchParams.get("tab")) setTab("rd_kpi");
  }, [role, tab, searchParams]);
  const year = month.slice(0, 4);

  return (
    <SaWorkspace
      icon={<LayoutDashboard size={22} />}
      title="บริหารงานขาย — ภาพรวม"
      subtitle="คาดการณ์มูลค่าดีล เพื่อผลักไปสู่ Won — โครงการ PM อาจเกิดก่อนหรือหลัง Won ได้"
      headerRight={<MonthPicker value={month} onChange={setMonth} />}
    >
      <div className="flex flex-col gap-4">
        <Tabs
          ariaLabel="มุมมองภาพรวม"
          value={tab}
          onChange={setTab}
          tabs={DASHBOARD_TABS.filter((t) => {
            if (t.key === "performance" && !canSeeDealKpi(role)) return false; // ผลงานขาย = สิทธิ์เดิมของ KPI ดีล
            if (t.key === "task_kpi" && !canSeeKpi) return false;
            if (t.key === "lead_kpi" && !canSeeLeadKpi(role)) return false;
            if (t.key === "rd_kpi" && !canSeeRdKpi(role)) return false; // แดชบอร์ด/KPI ฝ่าย RD — วัดแยกจากฝ่ายขาย
            if (t.key === "my" && role === "rd") return false; // rd ไม่มีดีลของตัวเอง — ใช้แท็บ RD แทน
            return true;
          })}
        />

        {tab === "my" && <MyDashboardTab month={month} />}

        {tab === "rd_kpi" && canSeeRdKpi(role) && <RdDashboardTab month={month} />}

        {tab === "lead_kpi" && <KpiLeadsTab month={month} />}

        {tab === "task_kpi" && canSeeKpi && <SalesKpiDashboard />}

        {tab === "performance" && canSeeDealKpi(role) && <PerformanceTab year={year} />}
      </div>
    </SaWorkspace>
  );
}
