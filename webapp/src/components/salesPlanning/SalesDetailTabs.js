"use client";

import { SALES_DETAIL_TABS } from "@/lib/salesDetailTabs";
import Tabs from "@/components/ui/Tabs";

// แท็บส่วนของหน้ารายละเอียดงานขาย — ใช้ Tabs กลาง (globals: .tabs-header/.tab-btn)
export default function SalesDetailTabs({ value, onChange, label = "ส่วนของรายการ" }) {
  return <Tabs tabs={SALES_DETAIL_TABS} value={value} onChange={onChange} ariaLabel={label} />;
}
