"use client";
// ── ป้ายสถานะขึ้นทะเบียนสรรพสามิตของ FG บนทะเบียนสินค้า (มติเจ้าของ 03/11/2026) ─────────────────────
//
// ⭐ ค่ามาจาก `productRegistrationValue` ตัวเดียวกับตัวกรอง "การขึ้นทะเบียน" — ไม่มีมิตินี้ (ผู้ดูไม่ถือ history:view ·
//    หมวดไม่ใช่สรรพสามิต) = ไม่มีป้าย
// ⭐ "ยังไม่ขึ้นทะเบียน" ของสินค้าที่ **ต้องเสีย** = โทนแดง (ขายแล้วยื่นไม่ได้) · ของที่ RA ยกเว้น = โทนกลาง (ไม่ใช่งานค้าง)
import StatusBadge from "@/components/ui/StatusBadge";
import { REGISTRATION_META, productRegistrationValue } from "@/lib/master/productFilter";

export default function ProductRegistrationBadge({ product, productTypes, taxable }) {
  const value = productRegistrationValue(product, productTypes);
  if (!value) return null;
  const meta = REGISTRATION_META[value];
  const tone = meta.tone || (taxable ? "danger" : "neutral");
  return <StatusBadge size="sm" tone={tone} title={`ทะเบียนสรรพสามิต · ${meta.label}`}>{meta.cell}</StatusBadge>;
}
