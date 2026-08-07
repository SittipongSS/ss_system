"use client";
// ── ตัวเลือกดีลของทั้งระบบ: โครงการ (ซ้าย) → ดีล (ขวา) ────────────────────────
//
// เป็น **ตัวห่อบาง ๆ** ของ ui/TwoPanePicker — ที่นี่รู้เรื่อง "ดีล/โครงการ" อย่างเดียว
// (ป้าย ถัง ข้อความค้น) ส่วนพฤติกรรมแผง/การค้น/ขนาด อยู่ที่ตัวกลาง
//
// ⭐ ทุกจุดที่ต้องเลือกดีลต้องเรียกตัวนี้ ห้ามประกอบ dropdown เอง — เดิมมีคู่ช่อง
// "โครงการ + ดีล" กระจายอยู่ 4 หน้า แต่ละที่กรอง/ค้น/เขียนป้ายไม่เหมือนกัน
// (มติผู้ใช้ 2026-08-06: ยกเป็นดีไซน์กลางแล้วใช้ทั้งระบบ)
import { FolderOpen, Layers } from "lucide-react";
import TwoPanePicker from "@/components/ui/TwoPanePicker";
import {
  ALL_DEALS_BUCKET, buildDealBuckets, dealSearchText, NO_PROJECT_BUCKET, projectLabelOf,
} from "@/lib/pm/dealPickerTree";

const dealMeta = (deal) => [deal.customerName, `FC ${deal.forecastMonth || "ไม่ระบุ"}`].filter(Boolean).join(" · ");

export default function DealPicker({
  deals = [],
  projects = [],
  value = "",
  // (dealId, deal, item) => void — `deal` คือแถวดีลตัวจริงจาก `deals` (ผู้เรียกที่เก็บ
  // projectId เองอ่านจากมันได้) · `item` คือตัวบรรยายรายการของแผง ปกติไม่ต้องใช้
  onChange,
  disabled = false,
  // เลือก "ไม่ผูกดีล" ได้ไหม — ปิดไว้เมื่อกติกาบังคับผูก (ตัวเลือกที่กดแล้วโดน API
  // ตีกลับไม่ควรมีอยู่ตั้งแต่แรก)
  clearable = false,
  clearLabel = "— ไม่ผูกดีล —",
  placeholder = "— เลือกดีล —",
  ariaLabel = "ดีลที่ผูกกับงาน",
}) {
  const buckets = buildDealBuckets(deals, projects);
  const labelOf = (deal) => (deal.projectId
    ? projectLabelOf(projects.find((p) => p.id === deal.projectId)) || "โครงการอื่น"
    : "ยังไม่ผูกโครงการ");

  const groups = buckets.map((bucket) => ({
    key: bucket.key,
    // ชื่อโครงการได้บรรทัดเต็ม — รหัส PJ-xxxx หน้าตาคล้ายกันทุกใบ อยู่บรรทัดรองคู่กับ
    // ลูกค้าอ่านง่ายกว่า (ของเดิมเอารหัสนำหน้า ชื่อเลยโดนตัดทุกใบบน prod)
    label: bucket.name || bucket.label,
    meta: [bucket.code, bucket.customerName].filter(Boolean).join(" · "),
    search: bucket.search,
    icon: bucket.key === ALL_DEALS_BUCKET ? Layers : FolderOpen,
    emptyText: bucket.key === NO_PROJECT_BUCKET
      ? "ไม่มีดีลที่ยังไม่ผูกโครงการ"
      : "โครงการนี้ยังไม่มีดีลที่ผูกงานได้",
    items: bucket.deals.map((deal) => ({
      value: deal.id,
      label: deal.title,
      // ในถังรวมต้องบอกด้วยว่าดีลใบนั้นอยู่โครงการไหน — ในถังโครงการมันซ้ำกับที่
      // เลือกค้างอยู่ฝั่งซ้าย
      meta: bucket.key === ALL_DEALS_BUCKET ? `${dealMeta(deal)} · ${labelOf(deal)}` : dealMeta(deal),
      chip: deal.projectId ? projects.find((p) => p.id === deal.projectId)?.code || "" : "",
      search: dealSearchText(deal, labelOf(deal)),
    })),
  }));

  /* 🐞 **ส่ง `onChange` ตรง ๆ ไม่ได้** — `TwoPanePicker` คืน `(value, item)` โดย
     `item` คือ **ตัวบรรยายรายการของแผง** (ค่า/ป้าย/บรรทัดรอง/คำค้น) ไม่ใช่แถวดีล
     ⇒ ผู้เรียกที่อ่าน `deal.projectId` ตามสัญญาข้างบนได้ `undefined` เสมอ

     ผลจริงที่ผู้ใช้เจอ: เลือกดีลที่ **ผูกโครงการอยู่แล้ว** แล้วฟอร์มยังขึ้นว่า
     "ดีลนี้ยังไม่ผูกโครงการ" ⇒ หัวข้อที่บังคับผูกโครงการ (สอบถามข้อมูล · ขอเอกสาร ·
     พัฒนาสูตร) **เปิดคำร้องไม่ได้เลยสักใบ** · หน้าใบเสนอราคาใหม่ก็ได้ `projectId` ว่าง
     เหมือนกัน — เป็นอาการเดียวกับบั๊กที่ปิดไปแล้วรอบ P5 แค่กลับมาทางตัวเลือกกลาง
     ที่เพิ่งยกออกมา (มติ 2026-08-06)

     ⇒ แปลงกลับเป็น "ดีลตัวจริง" ที่นี่ ที่เดียว — ผู้เรียกทุกที่ได้สัญญาเดิมคืน */
  const emitChange = (dealId, item) => {
    onChange?.(dealId, dealId ? deals.find((d) => d.id === dealId) || null : null, item);
  };

  return (
    <TwoPanePicker
      groups={groups}
      value={value}
      onChange={emitChange}
      disabled={disabled}
      clearable={clearable}
      clearLabel={clearLabel}
      placeholder={placeholder}
      headLabel="เลือกดีล"
      headMeta={`ทั้งหมด ${deals.length} ดีล`}
      groupSearchPlaceholder="ค้นหาโครงการ / ลูกค้า…"
      itemSearchPlaceholder="ค้นหาดีล / ลูกค้า…"
      groupEmptyText="ไม่พบโครงการที่ตรงกับคำค้น — ถ้ากำลังหาชื่อดีล ให้ค้นที่ช่องขวาในถัง “ดีลทั้งหมด”"
      itemEmptyText="ไม่พบดีลที่ตรงกับคำค้นในถังนี้"
      allGroupKey={ALL_DEALS_BUCKET}
      ariaLabel={ariaLabel}
    />
  );
}
