"use client";

// สองบรรทัดรองใต้ราคาผลิตบนทะเบียนสินค้า: ยอด VAT และราคารวม VAT
// (มติผู้ใช้ 2026-08-28 — คนอ่านทะเบียนต้องเห็นครบสามค่าโดยไม่ต้องคิดเอง)
//
// ⚠️ `products.costPrice` เก็บเป็นราคา **ก่อน VAT** — บรรทัดหลักคือค่าที่เก็บ
// ส่วนสองบรรทัดนี้คำนวณสดจากตัวช่วยตัวเดียวของระบบ (lib/master/costVat)
// ยังไม่ตั้งราคา → ไม่ขึ้นอะไรเลย (ไม่ยัด ฿0.00 ซ้อนอีกสองบรรทัดให้รก)
import { fmtMoney } from "@/lib/format";
import { costPriceVat, VAT_RATE_LABEL } from "@/lib/master/costVat";

export default function CostVatLines({ costPrice }) {
  const { vat, incVat } = costPriceVat(costPrice);
  if (vat == null) return null;
  return (
    <div className="mt-0.5 text-[11px] font-normal leading-tight text-[var(--text-3)]">
      <div>VAT {VAT_RATE_LABEL} {fmtMoney(vat)}</div>
      <div>รวม VAT {fmtMoney(incVat)}</div>
    </div>
  );
}
