export const SALES_DETAIL_TABS = [
  { key: "overview", label: "ภาพรวม" },
  { key: "timeline", label: "ไทม์ไลน์" },
  { key: "quotations", label: "ใบเสนอราคา" },
  { key: "tasks", label: "งาน" },
  { key: "activities", label: "ความเคลื่อนไหว" },
];

export function detailTabFromSearch(search = "") {
  const key = new URLSearchParams(search).get("tab") || "overview";
  return SALES_DETAIL_TABS.some((tab) => tab.key === key) ? key : "overview";
}
