// ── ขั้นคิดภาษีสรรพสามิตต่อหน่วยสำหรับโชว์ (มติเจ้าของ 26/11/2026 · V43) ─────────────────────
//
// ทรงตามที่เจ้าของพิมพ์มา (ราคา 1,290):
//   ราคาสินค้าถอด VAT 7%                 1,290.00 ÷ 1.07 = 1,205.61
//   1 ภาษีสรรพสามิต 8%                    1,205.61 × 8%   = 96.45
//   2 ภาษีท้องถิ่น 10% ของสรรพสามิต         96.45 × 10%    = 9.65
//
// ⚠️ ตัวเลขทุกตัวมาจาก `productTaxRates` — ตัวเดียวกับที่ระบบคิดเงินและเก็บลงสินค้า · จอห้ามคิดเอง
//    (ถ้าจอคิดอีกสูตร ป้ายบนจอกับเงินบนใบจะต่างกันสตางค์เดียวแบบที่เจ้าของเจอ: 96.45 + 9.64 = 106.09)
import { EXCISE_RATE, EXCISE_VAT_RATE, LOCAL_TAX_RATE_OF_EXCISE, exciseTaxLine, productTaxRates } from '@/lib/tax/exciseBilling';
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

// ── แจกแจงภาษี/ชิ้นในตาราง/บรรทัดรอง (เจ้าของ 26/11: "มันต้องแจกแจงภาษีด้วยมั้ย" → "ทำทั้งหมดที่เกี่ยว") ──
// จอที่โชว์ "ภาษี/ชิ้น" เป็นยอดเดียว ใส่บรรทัดรองว่ามาจากสรรพสามิตเท่าไร + ท้องถิ่นเท่าไร (สูตรเต็มอยู่หน้ารายละเอียดทะเบียน/สินค้า)

/** "สรรพสามิต 21.68 + ท้องถิ่น 2.17" · ไม่มีภาษีทั้งสองช่อง / ค่าไม่ใช่ตัวเลข = null (ไม่วาดบรรทัด) */
const missing = (value) => value === null || value === undefined || value === '';

export function exciseSplitText(excisePerUnit, localPerUnit) {
  if (missing(excisePerUnit) || missing(localPerUnit)) return null;
  const excise = Number(excisePerUnit);
  const local = Number(localPerUnit);
  if (!Number.isFinite(excise) || !Number.isFinite(local) || (excise <= 0 && local <= 0)) return null;
  return `สรรพสามิต ${plain(excise)} + ท้องถิ่น ${plain(local)}`;
}

/** ทรงสั้นของกระดาษ (หัวคอลัมน์บอกลำดับ "สรรพสามิต + ท้องถิ่น" แล้ว) — "21.68 + 2.17" · ไม่มี = null */
export function exciseSplitShort(excisePerUnit, localPerUnit) {
  if (!exciseSplitText(excisePerUnit, localPerUnit)) return null;
  return `${plain(excisePerUnit)} + ${plain(localPerUnit)}`;
}

/**
 * ภาษี/ชิ้นของสินค้าจากอัตราที่เก็บบนสินค้า — ตัวคิดกลาง (`exciseTaxLine`) ไม่บวกค่าดิบเอง
 * @returns `{ taxPerUnit, excisePerUnit, localPerUnit }` · ยกเว้นภาษี = ศูนย์ทั้งชุด
 */
export function productTaxPerUnit(product) {
  const taxable = product?.isExciseTaxable !== false;
  const line = exciseTaxLine({
    exciseRatePerUnit: taxable ? product?.exciseTax : 0,
    localTaxRatePerUnit: taxable ? product?.localTax : 0,
    quantity: 1,
  });
  return { taxPerUnit: line.taxPerUnit, excisePerUnit: line.exciseRatePerUnit, localPerUnit: line.localTaxRatePerUnit };
}
