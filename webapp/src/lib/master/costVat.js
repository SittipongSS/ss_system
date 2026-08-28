// ── VAT ของราคาผลิต (products.costPrice) ─────────────────────────────
//
// `products.costPrice` เก็บเป็นราคา **ก่อน VAT** (ดูคอมเมนต์ที่ app/sahamit/po
// และ settle-deal ซึ่งเอาค่านี้ไปตั้งราคาบรรทัดในใบโดยตรง) — หน้าทะเบียนสินค้า
// ต้องโชว์ทั้งสามค่า: ก่อน VAT · ยอด VAT · รวม VAT (มติผู้ใช้ 2026-08-28)
//
// ⚠️ อัตราหยิบจาก EXCISE_VAT_RATE ไม่พิมพ์ 0.07 ซ้ำ — VAT ไทยมีอัตราเดียว
// ถ้ามีเลข 7% สองที่ วันที่อัตราเปลี่ยนจะเหลือที่แก้ที่เดียว อีกที่เดินหนีเงียบ ๆ
import { EXCISE_VAT_RATE } from '@/lib/tax/exciseBilling';

export const VAT_RATE = EXCISE_VAT_RATE;

/** ป้ายอัตราสำหรับหัวคอลัมน์/ป้ายกำกับ — "7%" */
export const VAT_RATE_LABEL = `${Math.round(VAT_RATE * 1000) / 10}%`;

const EMPTY = { exVat: null, vat: null, incVat: null };

/**
 * แตกราคาผลิต (ค่าที่เก็บ = ก่อน VAT) ออกเป็นสามค่า
 * ยังไม่ตั้งราคา / ค่าไม่ใช่ตัวเลข → null ทั้งชุด เพื่อให้จอโชว์ขีด (—) ตามกฎของระบบ
 * ไม่ปัดเศษที่นี่ — ปัดตอนแสดงผลด้วย fmtMoney เหมือนราคาช่องอื่น
 */
export function costPriceVat(costPrice) {
  if (costPrice == null || costPrice === '') return EMPTY;
  const exVat = Number(costPrice);
  if (!Number.isFinite(exVat)) return EMPTY;
  const vat = exVat * VAT_RATE;
  return { exVat, vat, incVat: exVat + vat };
}
