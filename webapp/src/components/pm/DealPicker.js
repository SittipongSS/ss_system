"use client";
// ── ตัวเลือกดีลของทั้งระบบ: ลูกค้า (ซ้าย) → ดีล (ขวา) ────────────────────────
//
// เป็น **ตัวห่อบาง ๆ** ของ ui/TwoPanePicker — ที่นี่รู้เรื่อง "ดีล/ลูกค้า" อย่างเดียว
// (ป้าย ถัง ข้อความค้น) ส่วนพฤติกรรมแผง/การค้น/ขนาด อยู่ที่ตัวกลาง
//
// ⭐ ทุกจุดที่ต้องเลือกดีลต้องเรียกตัวนี้ ห้ามประกอบ dropdown เอง — เดิมมีคู่ช่อง
// "โครงการ + ดีล" กระจายอยู่ 4 หน้า แต่ละที่กรอง/ค้น/เขียนป้ายไม่เหมือนกัน
// (มติผู้ใช้ 2026-08-06: ยกเป็นดีไซน์กลางแล้วใช้ทั้งระบบ)
// ⭐ ยุบดีล/โครงการ P2d (มติเจ้าของ 13/11/2026): ถังซ้ายเปลี่ยนจากโครงการเป็นลูกค้า — `projects` เลิกรับแล้ว
import { Building2, Handshake } from "lucide-react";
import TwoPanePicker from "@/components/ui/TwoPanePicker";
import {
  ALL_DEALS_BUCKET, buildDealBuckets, dealArCode, dealSearchText, NO_CUSTOMER_BUCKET,
} from "@/lib/pm/dealPickerTree";

// ⚠️ ดีลที่ยังไม่มีลูกค้าต้องบอกไว้ตรงนี้ — บนหน้าออกใบเสนอราคา ดีลกลุ่มนี้โผล่ต่อท้าย
// ลิสต์ของลูกค้าที่เลือกไว้ และการเลือกมันแปลว่า "ตั้งลูกค้ารายนั้นให้ดีลด้วย"
const dealMeta = (deal) => [
  deal.customerName || (deal.customerId ? "" : "ยังไม่มีลูกค้า"),
  `FC ${deal.forecastMonth || "ไม่ระบุ"}`,
].filter(Boolean).join(" · ");

export default function DealPicker({
  deals = [],
  value = "",
  // (dealId, deal, item) => void — `deal` คือแถวดีลตัวจริงจาก `deals` (ผู้เรียกที่เก็บ
  // ลูกค้า/projectId เองอ่านจากมันได้) · `item` คือตัวบรรยายรายการของแผง ปกติไม่ต้องใช้
  onChange,
  disabled = false,
  // เลือก "ไม่ผูกดีล" ได้ไหม — ปิดไว้เมื่อกติกาบังคับผูก (ตัวเลือกที่กดแล้วโดน API
  // ตีกลับไม่ควรมีอยู่ตั้งแต่แรก)
  clearable = false,
  clearLabel = "— ไม่ผูกดีล —",
  placeholder = "— เลือกดีล —",
  ariaLabel = "ดีลที่ผูกกับงาน",
}) {
  const buckets = buildDealBuckets(deals);

  const groups = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.name || bucket.label,
    meta: bucket.code || "",
    search: bucket.search,
    // ถังรวม = ไอคอนดีล · ถังอื่นคือลูกค้าหนึ่งราย = ไอคอนลูกค้า (entityIcon.test.mjs)
    icon: bucket.key === ALL_DEALS_BUCKET ? Handshake : Building2,
    emptyText: bucket.key === NO_CUSTOMER_BUCKET
      ? "ไม่มีดีลที่ยังไม่มีลูกค้า"
      : "ลูกค้ารายนี้ยังไม่มีดีลที่ผูกงานได้",
    items: bucket.deals.map((deal) => ({
      value: deal.id,
      label: deal.title,
      // ในถังรวมบรรทัดรองบอกลูกค้าอยู่แล้ว (dealMeta) — ในถังลูกค้ามันซ้ำกับที่เลือกค้างฝั่งซ้ายแต่ไม่เสียหาย
      meta: dealMeta(deal),
      chip: deal.code || dealArCode(deal) || "",
      search: dealSearchText(deal),
    })),
  }));

  /* 🐞 **ส่ง `onChange` ตรง ๆ ไม่ได้** — `TwoPanePicker` คืน `(value, item)` โดย
     `item` คือ **ตัวบรรยายรายการของแผง** (ค่า/ป้าย/บรรทัดรอง/คำค้น) ไม่ใช่แถวดีล
     ⇒ ผู้เรียกที่อ่าน `deal.projectId` ตามสัญญาข้างบนได้ `undefined` เสมอ

     ผลจริงที่ผู้ใช้เจอ (สมัยยังมีโครงการ): เลือกดีลที่ **ผูกโครงการอยู่แล้ว** แล้วฟอร์มยังขึ้นว่า
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
      groupSearchPlaceholder="ค้นหาลูกค้า / รหัส AR…"
      itemSearchPlaceholder="ค้นหาดีล / ลูกค้า…"
      groupEmptyText="ไม่พบลูกค้าที่ตรงกับคำค้น — ถ้ากำลังหาชื่อดีล ให้ค้นที่ช่องขวาในถัง “ดีลทั้งหมด”"
      itemEmptyText="ไม่พบดีลที่ตรงกับคำค้นในถังนี้"
      allGroupKey={ALL_DEALS_BUCKET}
      ariaLabel={ariaLabel}
    />
  );
}
