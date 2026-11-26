// ── ขั้นคิดภาษีสรรพสามิตต่อหน่วยสำหรับโชว์ (มติเจ้าของ 26/11/2026 · V43) ─────────────────────
//
// ทรงตามที่เจ้าของพิมพ์มา (ราคา 1,290):
//   ราคาสินค้าถอด VAT 7%                 1,290.00 ÷ 1.07 = 1,205.61
//   1 ภาษีสรรพสามิต 8%                    1,205.61 × 8%   = 96.45
//   2 ภาษีท้องถิ่น 10% ของสรรพสามิต         96.45 × 10%    = 9.65
//
// ⚠️ ตัวเลขทุกตัวมาจาก `productTaxRates` — ตัวเดียวกับที่ระบบคิดเงินและเก็บลงสินค้า · จอห้ามคิดเอง
//    (ถ้าจอคิดอีกสูตร ป้ายบนจอกับเงินบนใบจะต่างกันสตางค์เดียวแบบที่เจ้าของเจอ: 96.45 + 9.64 = 106.09)
import { EXCISE_RATE, EXCISE_VAT_RATE, LOCAL_TAX_RATE_OF_EXCISE, productTaxRates } from '@/lib/tax/exciseBilling';
import { fmtNumber } from '@/lib/format';

/** อัตราเป็นเปอร์เซ็นต์ (0.08 → "8%") */
export const ratePct = (rate) => `${Math.round(rate * 1000) / 10}%`;

const plain = (value) => fmtNumber(Number(value) || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * @param basePriceIncVat ฐานภาษีรวม VAT (`exciseBasePriceIncVat(product)` — ชุดของขวัญรายชิ้น = ราคาน้ำหอมในชุด)
 * @returns `null` (ไม่มีฐาน) หรือ `{ base, retailPriceExVat, exciseTax, localTax, taxPerUnit, rows }`
 *          `rows` = `[{ key, marker, label, formula, amount }]` สามขั้น (ถอด VAT · ① สรรพสามิต · ② ท้องถิ่น)
 */
export function exciseTaxSteps(basePriceIncVat) {
  const base = Number(basePriceIncVat);
  if (!Number.isFinite(base) || base <= 0) return null;
  const rates = productTaxRates(base);
  return {
    base,
    ...rates,
    rows: [
      {
        key: 'exVat',
        marker: null,
        label: `ราคาสินค้าถอด VAT ${ratePct(EXCISE_VAT_RATE)}`,
        formula: `${plain(base)} ÷ ${Math.round((1 + EXCISE_VAT_RATE) * 100) / 100}`,
        amount: rates.retailPriceExVat,
      },
      {
        key: 'excise',
        marker: '1',
        label: `ภาษีสรรพสามิต ${ratePct(EXCISE_RATE)}`,
        formula: `${plain(rates.retailPriceExVat)} × ${ratePct(EXCISE_RATE)}`,
        amount: rates.exciseTax,
      },
      {
        key: 'local',
        marker: '2',
        label: `ภาษีท้องถิ่น ${ratePct(LOCAL_TAX_RATE_OF_EXCISE)} ของสรรพสามิต`,
        formula: `${plain(rates.exciseTax)} × ${ratePct(LOCAL_TAX_RATE_OF_EXCISE)}`,
        amount: rates.localTax,
      },
    ],
  };
}

/** ประโยคเดียวของสูตร (คำเตือน/คำอธิบาย) — ไม่มีตัวเลขของสินค้า */
export const EXCISE_FORMULA_TEXT =
  `ถอด VAT ${ratePct(EXCISE_VAT_RATE)} แล้วคิดสรรพสามิต ${ratePct(EXCISE_RATE)} + ท้องถิ่น ${ratePct(LOCAL_TAX_RATE_OF_EXCISE)} ของสรรพสามิต`;
