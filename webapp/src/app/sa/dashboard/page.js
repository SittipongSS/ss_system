"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import SaWorkspace from "@/components/ui/Workspace";
import { useRole } from "@/lib/roleContext";
import { canSeeTaskKpi, canSeeLeadKpi, canSeeDealKpi } from "@/lib/permissions";
import { MonthPicker, thisMonth } from "@/components/salesPlanning/ui";
import { displayYear } from "@/lib/datePeriods";
import Select from "@/components/ui/Select";
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

const DASHBOARD_TABS = [
  { key: "my", label: "แดชบอร์ดของฉัน" },
  { key: "lead_kpi", label: "KPI ลีด" },
  { key: "performance", label: "ผลงานขาย" },
  { key: "task_kpi", label: "KPI งาน" },
];

/* ⭐ แต่ละแท็บกินช่วงเวลาคนละหน่วย — ตัวคุมบนหัวหน้าจึงต้องเปลี่ยนตามแท็บ
   (มติผู้ใช้ 2026-08-05) ของเดิมโชว์ตัวเลือก "เดือน" ตัวเดียวทุกแท็บ ทั้งที่
   - ผลงานขาย รับแค่ `year` (month.slice(0,4)) ⇒ เลือก ม.ค. กับ ธ.ค. ปีเดียวกัน
     ตัวเลขไม่ขยับสักตัว
   - KPI งาน ไม่รับอะไรเลย และถือตัวเลือกช่วงวัน from/to + ทีม ของตัวเองอยู่ข้างใน
     ⇒ จอเดียวมีตัวคุมเวลาสองชุด ชุดบนไม่ทำอะไร
   ⚠️ เพิ่มแท็บใหม่ต้องมาเติมที่นี่ด้วย ไม่งั้นจะได้ตัวเลือกเดือนที่อาจไม่มีผล
   "none" = แท็บถือตัวคุมของตัวเอง หัวหน้าต้องไม่มีตัวคุมซ้อน */
const TAB_PERIOD = {
  my: "month",
  lead_kpi: "month",
  performance: "year",
  task_kpi: "none",
};

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

  /* 🔑 สิทธิ์ของแท็บตัดสิน **ที่เดียว** แล้วใช้ทั้งแถบแท็บและตัวเนื้อหา
     ของเดิมเช็คสองที่ (filter ของแถบ + เงื่อนไขตอน render) แล้วไม่ตรงกัน:
     - เปิดแท็บที่ไม่มีสิทธิ์ → แท็บหายจากแถบ *และ* เนื้อหาไม่ render
       ⇒ ได้หน้าว่างเปล่าโดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
     - `lead_kpi` ลืมใส่เงื่อนไขตอน render ⇒ คนไม่มีสิทธิ์เปิดลิงก์ตรงได้เนื้อหาจริง
       แล้วไปตกที่ API 403 เป็นกล่อง error แทน = พฤติกรรมสองแบบของเรื่องเดียวกัน */
  const allowedTabs = DASHBOARD_TABS.filter((t) => {
    if (t.key === "performance") return canSeeDealKpi(role); // ผลงานขาย = สิทธิ์เดิมของ KPI ดีล
    if (t.key === "task_kpi") return canSeeTaskKpi(role);
    if (t.key === "lead_kpi") return canSeeLeadKpi(role);
    /* ⭐ **แท็บ "แดชบอร์ด RD" ถูกลบทิ้ง** (มติผู้ใช้ 2026-08-11) — ภาพรวมของฝ่าย RD
       ย้ายไปอยู่ที่โมดูลของฝ่ายเอง (`/rd`) ซึ่งตอบคำถาม "วันนี้ทำอะไรก่อน" ด้วยคิวจริง
       แทน KPI รายเดือนที่ไม่มีใครใช้ตัดสินใจ
       ⚠️ **ต้องปลด `role !== "rd"` ของแท็บ "ของฉัน" ไปพร้อมกัน** — เดิม rd ถูกกันออก
       จากแท็บนั้นเพราะมีแท็บ RD ให้อยู่แล้ว · ลบแท็บ RD โดยไม่ปลดข้อนี้ = role rd
       เปิดหน้าแดชบอร์ดแล้ว **เหลือศูนย์แท็บ** ได้จอเปล่าที่ไม่มีอะไรบอกว่าทำไม */
    if (t.key === "my") return true;
    return true;
  });
  // แท็บที่แสดงจริง = ตัวที่ขอมาถ้ามีสิทธิ์ ไม่งั้นถอยไปตัวแรกที่เปิดให้
  // (role rd ที่เปิดหน้าเปล่า ๆ จึงตกมาที่ "แดชบอร์ด RD" เองโดยไม่ต้องมี effect เด้ง)
  const activeTab = allowedTabs.some((t) => t.key === tab) ? tab : allowedTabs[0]?.key;
  /* บอกเฉพาะตอนที่ผู้ใช้ **ขอแท็บนั้นมาเองทาง URL** — ไม่ใช่ตอนที่ค่าตั้งต้น "my"
     ของ role rd ตกไปแท็บอื่น (นั่นคือพฤติกรรมปกติ ไม่ใช่การถูกปฏิเสธ) */
  const deniedTab = normalizeTab(searchParams.get("tab")) === tab && tab !== activeTab
    ? DASHBOARD_TABS.find((t) => t.key === tab)
    : null;

  const period = TAB_PERIOD[activeTab] || "none";

  return (
    <SaWorkspace
      icon={<LayoutDashboard size={22} />}
      title="บริหารงานขาย — ภาพรวม"
      subtitle="คาดการณ์มูลค่าดีล เพื่อผลักไปสู่ Won — โครงการ PM อาจเกิดก่อนหรือหลัง Won ได้"
      headerRight={
        period === "month" ? <MonthPicker value={month} onChange={setMonth} />
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
          <StatusNotice tone="warning" title="ไม่มีสิทธิ์เข้าถึงแดชบอร์ดนี้">
            บัญชีของคุณยังไม่มีสิทธิ์ดูแดชบอร์ดฝ่ายขายสักแท็บ
          </StatusNotice>
        )}

        {/* เงื่อนไขสิทธิ์ไม่ต้องเช็คซ้ำตรงนี้ — activeTab มาจาก allowedTabs อยู่แล้ว */}
        {activeTab === "my" && <MyDashboardTab month={month} />}


        {activeTab === "lead_kpi" && <KpiLeadsTab month={month} />}

        {activeTab === "task_kpi" && <SalesKpiDashboard />}

        {activeTab === "performance" && <PerformanceTab year={year} />}
      </div>
    </SaWorkspace>
  );
}
