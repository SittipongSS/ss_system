"use client";

import { SALES_DETAIL_TABS } from "@/lib/salesDetailTabs";
import Tabs from "@/components/ui/Tabs";

// แท็บส่วนของหน้ารายละเอียดงานขาย — ใช้ Tabs กลาง (globals: .tabs-header/.tab-btn)
// `tabs` ส่งเข้ามาแทนได้ (โครงการใช้ PROJECT_DETAIL_TABS ซึ่งยุบบางแท็บเข้าด้วยกัน)
export default function SalesDetailTabs({ value, onChange, label = "ส่วนของรายการ", tabs = SALES_DETAIL_TABS }) {
  return <Tabs tabs={tabs} value={value} onChange={onChange} ariaLabel={label} />;
}
