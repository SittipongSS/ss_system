// ── งานยื่นกรมของ RA — กติกาล้วน (แผนรื้อสรรพสามิต PR5 · mig 0417 · มติ D7 29/10: ยื่นทีละ SO · v3 02/11) ─────
//
// v3 (มติเจ้าของ 02/11 · แผน หมวด 12): SO ค่าสรรพสามิตที่อนุมัติ = งานถึง RA แล้ว ไม่มีขั้นสร้างใบยื่น
//   รอ RA (คิวคำนวณสด) → RA กด "เริ่มยื่น" = ระบบเขียนบันทึกการยื่น (แถว orders · กำลังยื่น) → ชำระแล้ว (เลขใบเสร็จกรม)
//   ด่านเริ่มยื่น: ทะเบียนทุก FG อนุมัติแล้ว **เด็ดขาด** · เงิน (บัญชีปิดใบ) แค่โชว์ ไม่ใช่ด่าน
// แหล่งของงานมีสองแบบ (แผน หมวด 3.6):
//   · excise_order — SO ค่าสรรพสามิตที่อนุมัติแล้ว · รายการ = บรรทัดของใบนั้น (ยอดที่ลูกค้าจ่ายจริง · คิดใหม่ไม่ได้)
//   · not_billed   — SO ลูกค้าที่ฝ่ายขายตัดสิน "ไม่เรียกเก็บในระบบ" แบบเก็บนอกระบบ/รวมในราคา · รายการคิดจาก SO ลูกค้า
//                    (ชนิด "ไม่ต้องเสียภาษี" ไม่เข้าคิว — ไม่มีอะไรให้ยื่น)
// ⚠️ ไฟล์บริสุทธิ์ — จอ import ได้ · ตัวโหลดฝั่ง server อยู่ที่ lib/excise/raFiling.js
import { EXCISE_NOT_BILLED_KINDS } from '@/lib/excise/exciseNotBilled';
import { exciseTaxLine, exciseTaxTotals, round2 } from '@/lib/tax/exciseBilling';
import { EXCISE_CHARGE_LINE_KIND } from '@/lib/excise/exciseCharge';
import { FINANCE_STATUS_LABELS } from '@/lib/sales/salesOrderFinanceApproval';
import { lineUnitsTotal } from '@/lib/sales/linePacks';

export const FILING_SOURCE_EXCISE_ORDER = 'excise_order';
export const FILING_SOURCE_NOT_BILLED = 'not_billed';
/* ชนิด "ไม่เรียกเก็บ" ที่ RA ยังต้องยื่นกรม — not_liable = ไม่ต้องเสีย ⇒ ไม่มีใบยื่น */
export const NOT_BILLED_FILING_KINDS = Object.freeze(['collected_outside', 'included_in_price']);
/* ความยาวเหตุผลที่ RA ต้องพิมพ์ตอนยกเลิกการเริ่มยื่น (D10) */
export const FILING_REASON_MIN = 10;
export const FILING_REASON_MAX = 500;

/** แหล่งของใบยื่นหนึ่งใบ — ใบเก่าที่สร้างเอง (ไม่มี SO) = null */
export function filingSourceOf(order) {
  if (order?.exciseSalesOrderId) return FILING_SOURCE_EXCISE_ORDER;
  if (order?.salesOrderId) return FILING_SOURCE_NOT_BILLED;
  return null;
}

export const notBilledLabel = (kind) => EXCISE_NOT_BILLED_KINDS[kind]?.label || kind || '';

/**
 * รายการใบยื่นจากบรรทัด SO ค่าสรรพสามิต — **ยอดที่ลูกค้าจ่ายจริง** ไม่ใช่คิดจากสินค้า ณ วันนี้
 *  · สินค้า = FG ต้นทาง (`metadata.sourceProductId`) ทะเบียนจับคู่ด้วยตัวนี้ (ห้ามใช้สินค้า 04-003)
 *  · ลิงก์บรรทัด = บรรทัด SO ลูกค้า (`metadata.sourceSalesOrderLineId` · FK ไป sales_order_lines)
 *  · ภาษี/ชิ้น = ช่อง ภส. ที่ใบค่าสรรพสามิตแตกไว้ (`excisePerUnit` + `localPerUnit` · กติกา D1)
 *  · ทะเบียน = ทะเบียนอนุมัติ **ณ ตอนนี้** ของบรรทัด SO ลูกค้า (จากผล resolve ของ SO ลูกค้า — ทะเบียนอนุมัติทีหลังได้)
 * @param exciseLines    บรรทัดของ SO ค่าสรรพสามิต (ต้องมี metadata · qty · unitPrice)
 * @param customerLines  `lines` จาก resolveSoFiling ของ SO ลูกค้า (หาด้วย salesOrderLineId)
 */
export function exciseOrderFilingLines({ exciseLines = [], customerLines = [] } = {}) {
  const byLine = new Map((customerLines || []).filter((l) => l?.salesOrderLineId).map((l) => [l.salesOrderLineId, l]));
  const lines = [];
  const warnings = [];
  for (const line of exciseLines || []) {
    const meta = line?.metadata || {};
    if (meta.lineKind !== EXCISE_CHARGE_LINE_KIND) continue;
    const source = byLine.get(meta.sourceSalesOrderLineId) || null;
    const fgCode = meta.sourceFgCode || source?.fgCode || '';
    // จำนวน = หน่วยรวมของบรรทัด (บรรทัดค่าสรรพสามิตไม่มีเลขแพ็ค ⇒ = qty · ใช้ตัวนับกลางตามด่าน linePackReaders)
    const quantity = lineUnitsTotal(line);
    const taxLine = exciseTaxLine({
      exciseRatePerUnit: meta.excisePerUnit,
      localTaxRatePerUnit: meta.localPerUnit,
      quantity,
    });
    /* ช่อง ภส. ต้องรวมได้ภาษี/ชิ้นของบรรทัด — ไม่ตรง = metadata เพี้ยน ⇒ ยึดราคาบนใบ (ยอดที่ลูกค้าจ่าย) ทั้งก้อนเป็นช่องสรรพสามิต */
    const unitPrice = round2(Number(line.unitPrice) || 0);
    const sane = taxLine.taxPerUnit === unitPrice;
    const finalLine = sane ? taxLine : exciseTaxLine({ exciseRatePerUnit: unitPrice, localTaxRatePerUnit: 0, quantity });
    if (!sane) {
      warnings.push({
        code: 'tax_split_mismatch',
        fgCode,
        message: `${fgCode || line.description} ช่องสรรพสามิต/ท้องถิ่นบนใบไม่รวมเป็นภาษีต่อชิ้น ${unitPrice} — ลงเป็นช่องสรรพสามิตทั้งก้อน ตรวจก่อนยื่น`,
      });
    }
    lines.push({
      salesOrderLineId: meta.sourceSalesOrderLineId || null,
      registrationId: source?.registrationId || null,
      registrationState: source?.registrationState || 'none',
      productId: meta.sourceProductId || source?.productId || null,
      fgCode,
      description: source?.description || line.description || fgCode,
      ...finalLine,
      needsRegistration: !source?.registrationId,
    });
    if (!source?.registrationId) {
      warnings.push({
        code: 'registration_missing',
        fgCode,
        registrationState: source?.registrationState || 'none',
        message: `${fgCode || line.description} ยังไม่มีทะเบียนสรรพสามิตที่อนุมัติ`,
      });
    }
  }
  return { lines, warnings, ...exciseTaxTotals(lines) };
}

/**
 * ด่านเริ่มยื่น (v3 · มติเจ้าของ 02/11 ข้อ V3–V4)
 *  · registration — **ด่านเด็ดขาด**: ทุกรายการผูกทะเบียนที่อนุมัติแล้ว · ไม่มีทางข้ามใส่เหตุผล
 *  · money        — **แค่ข้อมูล ไม่ใช่ด่าน**: SO ค่าสรรพสามิตบัญชีปิดใบแล้วหรือยัง (`financeStatus = approved`)
 *                   · ใบไม่เรียกเก็บ = เงินอยู่นอกระบบตามคำตัดสินของฝ่ายขาย
 * @param order        บันทึก/พรีวิวของงาน (ต้องมี items หรือ lines ที่มี registrationId · fgCode)
 * @param exciseOrder  SO ค่าสรรพสามิต (financeStatus) — ใบไม่เรียกเก็บ = null
 * @param notBilledKind ชนิดคำตัดสินบน SO ลูกค้า (ใบไม่เรียกเก็บ)
 */
export function filingStartGates({ order, exciseOrder = null, notBilledKind = null } = {}) {
  const items = order?.items || [];
  const missing = items.filter((item) => !item?.registrationId);
  const codes = [...new Set(missing.map((item) => item?.fgCode || item?.product?.fgCode).filter(Boolean))];
  const source = filingSourceOf(order);
  let money;
  if (source === FILING_SOURCE_EXCISE_ORDER) {
    const finance = exciseOrder?.financeStatus || null;
    money = finance === 'approved'
      ? { ok: true, label: `บัญชีปิดใบสั่งขายค่าสรรพสามิต ${exciseOrder?.orderNumber || ''} แล้ว`.trim() }
      : {
        ok: false,
        label: `บัญชียังไม่ปิดใบสั่งขายค่าสรรพสามิต ${exciseOrder?.orderNumber || ''} (${FINANCE_STATUS_LABELS[finance] || 'ยังไม่เข้าคิวบัญชี'})`
          .replace(/\s+\(/, ' ('),
      };
  } else if (source === FILING_SOURCE_NOT_BILLED) {
    money = { ok: true, label: `ไม่เรียกเก็บในระบบ — ${notBilledLabel(notBilledKind)}` };
  } else {
    money = { ok: true, label: 'ใบยื่นเดิม (สร้างเอง)' };
  }
  return {
    money,
    registration: missing.length
      ? {
        ok: false,
        missing: missing.length,
        codes,
        label: `ยังไม่มีทะเบียนอนุมัติ ${missing.length} รายการ${codes.length ? ` (${codes.join(', ')})` : ''}`,
      }
      : { ok: true, missing: 0, codes: [], label: 'ทะเบียนอนุมัติครบทุกรายการ' },
  };
}

/** ข้อความไทยเมื่อเริ่มยื่นไม่ได้ · null = เริ่มได้ (route + ปุ่มบนจอใช้ตัวเดียวกัน) — ด่านเงินไม่บล็อก (V3) */
export function filingStartGateError(gates) {
  if (gates?.registration && !gates.registration.ok) {
    return `${gates.registration.label} — ทะเบียนทุก FG ต้องอนุมัติก่อนเริ่มยื่น (อนุมัติที่หน้าการขึ้นทะเบียน)`;
  }
  return null;
}
