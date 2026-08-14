"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import SaWorkspace from "@/components/ui/Workspace";
import { useRole } from "@/lib/roleContext";
import { MonthPicker, thisMonth } from "@/components/salesPlanning/ui";
import DayRangePicker from "@/components/ui/DayRangePicker";
import Segmented from "@/components/ui/Segmented";
import { addDays, businessDayKey } from "@/lib/datePeriods";
import { displayYear } from "@/lib/datePeriods";
import Select from "@/components/ui/Select";
import { TAB_PERIOD, resolveDashboardTab } from "@/lib/salesPlanning/dashboardTabs";
import StatusNotice from "@/components/ui/StatusNotice";
import styles from "./page.module.css";
import SalesKpiDashboard from "@/components/pm/SalesKpiDashboard";
import MyDashboardTab from "@/components/salesPlanning/dashboard/MyDashboardTab";
import KpiLeadsTab from "@/components/salesPlanning/dashboard/KpiLeadsTab";
import PerformanceTab from "@/components/salesPlanning/dashboard/performance/PerformanceTab";
import Tabs from "@/components/ui/Tabs";
import SkeletonRows from "@/components/ui/Skeleton";

// หน้า /sa/dashboard — ศูนย์รวมแดชบอร์ดฝ่ายขาย 5 แท็บ. แท็บ "ผลงานขาย" แทน
// "KPI ดีล" เดิม (2026-07-18): บอร์ดประชุมเช้า + ทบยอด + เจาะรายคน/ทีม —
// เนื้อหาทั้งหมดอยู่ใน components/salesPlanning/dashboard/performance/.

/* ⭐ **ตารางแท็บ · ช่วงเวลา · สิทธิ์ ย้ายไป `lib/salesPlanning/dashboardTabs.js`**
   (2026-08-11) — กฎ "ใครเห็นแท็บไหน" พังเงียบได้ (ตอนลบแท็บแดชบอร์ด RD เกือบทำให้
   role rd เหลือศูนย์แท็บ) และอยู่ในไฟล์ JSX แล้วเทสต์ node เรียกไม่ได้ ⇒ ยกออกไป
   พร้อมเทสต์ที่ยืนยันว่า **ไม่มี role ไหนเหลือศูนย์แท็บ** */

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
  const currentMonth = thisMonth();
  const [month, setMonth] = useState(currentMonth);
  /* ติ๊ก "ทุกเดือน" = ทุกเดือน**ของปีที่เลือก** (มติ 2026-07-29 · ท่าเดียวกับหน้าลีด/ดีล)
     ⚠️ อยู่ที่หน้านี้ ไม่ใช่ในแต่ละแท็บ — มันเป็นคู่กับตัวเลือกเดือนบนหัวหน้าซึ่งอยู่ที่นี่
     แท็บที่กินเดือน (`TAB_PERIOD === "month"`) ต้องรับไปใช้ทุกตัว ไม่งั้นติ๊กแล้ว
     ตัวเลขไม่ขยับ = ตัวคุมที่โกหก */
  const [allMonths, setAllMonths] = useState(false);
  /* งวดของแท็บ "KPI ลีด" เลือกเป็นช่วงวันได้ (IS-26080023) — แท็บอื่นยังรายเดือน/รายปี
     เหมือนเดิม เพราะตัวเลขของมัน (FC/Actual/เป้า) เป็นของรายเดือนโดยธรรมชาติ
     ⚠️ วันนี้คิดจากวันไทย ไม่ใช่ `new Date()` ของเบราว์เซอร์ — ไม่งั้น "สัปดาห์นี้"
     ของเครื่องที่ตั้ง timezone อื่นจะคนละสัปดาห์กับที่ server นับ */
  const todayTh = businessDayKey(new Date().toISOString());
  const [leadPeriodMode, setLeadPeriodMode] = useState("month");
  const [leadRange, setLeadRange] = useState(() => ({ from: addDays(todayTh, -13), to: todayTh }));
  /* ปีของแท็บผลงานขายเป็น state แยก ไม่ได้เฉือนมาจาก `month` — ของเดิมใช้
     month.slice(0,4) ทำให้ตัวเลือกเดือนกลายเป็นตัวเลือกปีที่พาเดือนติดไปด้วย
     แยกกันแล้ว สลับแท็บไปกลับจึงไม่ลากค่าของอีกฝั่งเปลี่ยนตาม */
  const [year, setYear] = useState(() => currentMonth.slice(0, 4));
  // 3 ปีย้อนหลัง–3 ปีข้างหน้า — ชุดเดียวกับหน้าเป้าหมาย (/sa/targets)
  const yearOptions = useMemo(() => {
    const base = Number(currentMonth.slice(0, 4));
    return Array.from({ length: 7 }, (_, index) => String(base - 3 + index));
  }, [currentMonth]);
  const [tab, setTab] = useState(normalizeTab(searchParams.get("tab")) || "my");
  useEffect(() => {
    const t = normalizeTab(searchParams.get("tab"));
    if (t) setTab(t);
  }, [searchParams]);

  /* สิทธิ์ + แท็บที่แสดงจริง + "ถูกปฏิเสธไหม" มาจากตัวเดียวที่ lib (มีเทสต์คุม)
     ⚠️ ส่ง **state `tab`** เข้าไป ไม่ใช่อ่าน searchParams ซ้ำ — กดสลับแท็บเขียนลง state
     อ่านจาก URL ตรง ๆ เมื่อไร ปุ่มแท็บจะกดแล้วไม่มีอะไรเกิดขึ้น */
  const { tab: activeTab, denied: deniedTab, allowed: allowedTabs } = resolveDashboardTab(role, tab);

  const period = TAB_PERIOD[activeTab] || "none";

  return (
    <SaWorkspace
      icon={<LayoutDashboard size={22} />}
      title="บริหารงานขาย — ภาพรวม"
      subtitle="คาดการณ์มูลค่าดีล เพื่อผลักไปสู่ Won — โครงการ PM อาจเกิดก่อนหรือหลัง Won ได้"
      headerRight={
        activeTab === "lead_kpi" ? (
          <>
            <Segmented
              ariaLabel="หน่วยของงวด"
              value={leadPeriodMode}
              onChange={setLeadPeriodMode}
              options={[{ value: "month", label: "รายเดือน" }, { value: "range", label: "ช่วงวัน" }]}
            />
            {leadPeriodMode === "range"
              ? <DayRangePicker from={leadRange.from} to={leadRange.to} today={todayTh} onChange={setLeadRange} />
              : <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />}
          </>
        ) : period === "month" ? <MonthPicker value={month} onChange={setMonth} allMonths={allMonths} onAllMonths={setAllMonths} />
          : period === "year" ? (
            <Select
              className={styles.yearSelect}
              value={year}
              onChange={(event) => setYear(event.target.value)}
              aria-label="ปี"
            >
              {yearOptions.map((y) => <option key={y} value={y}>ปี {displayYear(y)}</option>)}
            </Select>
          ) : null
      }
    >
      <div className="flex flex-col gap-4">
        <Tabs
          ariaLabel="มุมมองภาพรวม"
          value={activeTab}
          onChange={setTab}
          tabs={allowedTabs}
        />

        {deniedTab && activeTab && (
          <StatusNotice tone="warning" title={`ไม่มีสิทธิ์เข้าถึงแท็บ “${deniedTab.label}”`}>
            พาไปที่แท็บ “{allowedTabs.find((t) => t.key === activeTab)?.label}” แทน — ถ้าต้องใช้แท็บนั้น ติดต่อผู้ดูแลระบบเพื่อขอสิทธิ์
          </StatusNotice>
        )}

        {!activeTab && (
          <StatusNotice tone="warning" title="ไม่มีสิทธิ์เข้าถึงภาพรวมนี้">
            บัญชีของคุณยังไม่มีสิทธิ์ดูภาพรวมฝ่ายขายสักแท็บ
          </StatusNotice>
        )}

        {/* เงื่อนไขสิทธิ์ไม่ต้องเช็คซ้ำตรงนี้ — activeTab มาจาก allowedTabs อยู่แล้ว */}
        {activeTab === "my" && <MyDashboardTab month={month} allMonths={allMonths} />}


        {activeTab === "lead_kpi" && (
          <KpiLeadsTab
            month={month}
            allMonths={allMonths}
            rangeFrom={leadPeriodMode === "range" ? leadRange.from : null}
            rangeTo={leadPeriodMode === "range" ? leadRange.to : null}
          />
        )}

        {activeTab === "task_kpi" && <SalesKpiDashboard />}

        {activeTab === "performance" && <PerformanceTab year={year} />}
      </div>
    </SaWorkspace>
  );
}
