"use client";
import { BarChart3 } from "lucide-react";
import ReportView from "@/components/reports/ReportView";

const TABS = [
  { key: "customer", label: "คุณภาพข้อมูลลูกค้า" },
  { key: "product", label: "คุณภาพข้อมูลสินค้า" },
  { key: "usage", label: "การใช้งาน / ข้อมูลกำพร้า" },
];

// Approval-status filter for the customer/product quality tabs (usage has none).
const APPROVAL_OPTIONS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "pending", label: "รออนุมัติ" },
  { value: "rejected", label: "ตีกลับ" },
];

export default function DatabaseReportsPage() {
  return (
    <ReportView
      icon={<BarChart3 size={22} />}
      title="รายงานคุณภาพข้อมูล"
      subtitle="ตรวจความครบถ้วนของข้อมูลหลัก (ลูกค้า/สินค้า) และการใช้งาน พร้อมส่งออก Excel และพิมพ์ PDF"
      apiPath="/api/master/reports"
      tabs={TABS}
      statusOptions={{ customer: APPROVAL_OPTIONS, product: APPROVAL_OPTIONS }}
      enableCustomerFilter
    />
  );
}
