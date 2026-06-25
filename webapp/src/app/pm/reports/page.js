"use client";
import { BarChart3 } from "lucide-react";
import ReportView from "@/components/reports/ReportView";

const TABS = [
  { key: "project", label: "ภาพรวมโครงการ" },
  { key: "overdue", label: "งานเกินกำหนด" },
  { key: "team", label: "สรุปตามทีม" },
];

// Computed-status filter for the project-overview tab (mirrors the board).
const STATUS_OPTIONS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "New", label: "ใหม่" },
  { value: "On Track", label: "ตามแผน" },
  { value: "Delayed", label: "ล่าช้า" },
  { value: "On Hold", label: "พักไว้" },
  { value: "Completed", label: "เสร็จสิ้น" },
  { value: "Dropped", label: "ยกเลิก" },
];

export default function PmReportsPage() {
  return (
    <ReportView
      icon={<BarChart3 size={22} />}
      title="รายงานโครงการ"
      subtitle="ภาพรวมการดำเนินงาน งานที่เกินกำหนด และสรุปตามทีม พร้อมส่งออก Excel และพิมพ์ PDF"
      apiPath="/api/pm/reports"
      tabs={TABS}
      statusOptions={{ project: STATUS_OPTIONS }}
    />
  );
}
