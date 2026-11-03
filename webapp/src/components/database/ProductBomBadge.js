"use client";
// ── ป้ายสถานะลง BOM ของทะเบียนสินค้า (mig 0419 · มติเจ้าของ 03/11/2026) ─────────────────────────────
//
// สองที่ใช้:
//  - มุมมองการ์ด (ค่าตั้งต้น) — ขึ้นเฉพาะ FG ที่ **ส่งแล้ว** หรือ **พร้อมส่ง** พร้อมคำนำ "BOM" (การ์ดไม่มีหัวคอลัมน์บอก) ·
//    ข้อมูลยังไม่ครบไม่มีป้าย: กลุ่ม 01/02 หลายร้อยตัวยังไม่ผูกสูตร ⇒ ป้ายเต็มทุกใบคือขยะ
//  - คอลัมน์ "BOM" ของตาราง (`cell`) — ตารางเห็นสถานะทุกแถว: ข้อมูลยังไม่ครบ = เหตุสั้นตัวจาง (ตัวเดียวกับปุ่มส่งบนหน้า FG
//    · `bomSendBlockerShort`) · พร้อมส่ง = ป้ายกลาง · ส่งแล้ว = ป้ายสีไม่มีคำนำ · กลุ่ม 03/04 (ไม่มีขั้น BOM) = ขีด
// ⭐ ค่ามาจาก `bomFilterValueOf` ตัวเดียวกับตัวกรอง "สถานะ BOM" · คำ/โทนจาก `BOM_STATUS_META` ตัวเดียวกับหน้า FG/คิว RD
// ⭐ ใช้ `StatusBadge` (ตัวกลางของ React) ไม่ใช่คลาสป้ายดิบใน globals — รูปทรงเดียวกันเป๊ะ (badgeFamilies.test.mjs)
//    และไม่เพิ่มจุดเรียกชื่อเก่าที่รอยุบ (เทสต์นั้นนับแม้ในคอมเมนต์ที่อยู่ในเครื่องหมายคำพูด)
import StatusBadge from "@/components/ui/StatusBadge";
import { NA } from "@/lib/format";
import { BOM_STATUS_META, bomFilterValueOf, bomSendBlockerShort } from "@/lib/master/productBom";

export default function ProductBomBadge({ product, cell = false }) {
  const value = bomFilterValueOf(product);
  if (!value) return cell ? <span className="text-[var(--text-3)]">{NA}</span> : null;
  const meta = BOM_STATUS_META[value];
  if (value === "blocked") {
    return cell
      ? <span className="text-xs text-[var(--text-3)]" title={`${meta.label} — ส่ง RD ไม่ได้จนกว่าจะแก้`}>{bomSendBlockerShort(product)}</span>
      : null;
  }
  return (
    <StatusBadge tone={meta.tone} title={`BOM · ${meta.label}`}>
      {cell ? meta.short : `BOM ${meta.short}`}
    </StatusBadge>
  );
}
