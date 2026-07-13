"use client";

import { SALES_DETAIL_TABS } from "@/lib/salesDetailTabs";

export default function SalesDetailTabs({ value, onChange, label = "ส่วนของรายการ" }) {
  return (
    <div className="tabs-header" role="tablist" aria-label={label}>
      {SALES_DETAIL_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          className={`tab-btn ${value === tab.key ? "active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
