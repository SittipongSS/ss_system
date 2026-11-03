"use client";
// ── ป้ายสถานะลง BOM บนแถวของทะเบียนสินค้า (mig 0419 · มติเจ้าของ 03/11/2026) ─────────────────────────
//
// ⭐ ขึ้นเฉพาะ FG ที่ **ส่งแล้ว** — "ยังไม่ส่ง" ไม่มีป้าย (กลุ่ม 01/02 หลายร้อยตัวยังไม่ส่ง ⇒ ป้ายเต็มทุกแถวคือขยะบนตาราง)
//    อยากเห็นตัวที่ยังไม่ส่ง ใช้ตัวกรอง "สถานะ BOM" ซึ่งถามค่าเดียวกัน (`bomFilterValueOf`)
// ⭐ คำ/โทนมาจาก `BOM_STATUS_META` ตัวเดียวกับกล่องในหน้า FG และคิว RD — ชี้เมาส์ได้ป้ายเต็ม
// ⭐ ใช้ `StatusBadge` (ตัวกลางของ React) ไม่ใช่คลาสป้ายดิบใน globals — รูปทรงเดียวกันเป๊ะ (badgeFamilies.test.mjs)
//    และไม่เพิ่มจุดเรียกชื่อเก่าที่รอยุบ (เทสต์นั้นนับแม้ในคอมเมนต์ที่อยู่ในเครื่องหมายคำพูด)
import StatusBadge from "@/components/ui/StatusBadge";
import { BOM_STATUS_META, bomFilterValueOf } from "@/lib/master/productBom";

export default function ProductBomBadge({ product }) {
  const value = bomFilterValueOf(product);
  if (!value || value === "none") return null;
  const meta = BOM_STATUS_META[value];
  return <StatusBadge tone={meta.tone} title={`BOM · ${meta.label}`}>BOM {meta.short}</StatusBadge>;
}
