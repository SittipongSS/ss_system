// ── ใบสรุปรายการยื่นชำระภาษีสรรพสามิต (แผนรื้อสรรพสามิต v3 · มติเจ้าของ 02/11 ข้อ V9) ─────────────────────
//
// RA ติ๊กหลายงานจากหน้าการยื่นชำระ → พิมพ์รวมเป็นใบเดียว ไว้กรอกแบบ ภส. ของกรม (ไม่ใช่เอกสารควบคุม ⇒ เปลือกรายงาน
// `buildReportPrintHTML` ของ lib/tax/reportPrint ตัวเดียวกับรายงาน Excel/พิมพ์ของ /tax)
//   · งานที่เริ่มยื่นแล้ว = รายการจากบันทึกที่ตรึงไว้ตอนกดเริ่มยื่น · งานที่ยังรอ RA = ข้อมูลสดจาก SO (หัวงานบอก "ยังไม่เริ่มยื่น")
// ⚠️ ไฟล์บริสุทธิ์ — ตัวโหลดฝั่ง server อยู่ที่ api/tax/orders/summary
//   · แบ่งรอบ (หมวด 13 · D19): หัวงานบอก "รอบที่ n/m · SO ลูกค้ายังค้าง x หน่วย" — ข้อความเดียวกับคิว RA (`raRoundLabel`)
import { round2 } from '@/lib/tax/exciseBilling';
import { raRoundLabel } from '@/lib/excise/raQueueItem';

export const FILING_SUMMARY_TITLE = 'ใบสรุปรายการยื่นชำระภาษีสรรพสามิต';
/* เพดานงานต่อใบ — คีย์ไปทาง query string (`?keys=`) · ใบสรุปที่ยาวกว่านี้อ่านไม่ไหวอยู่แล้ว */
export const FILING_SUMMARY_MAX_KEYS = 100;

const KEY_KINDS = Object.freeze(['excise', 'not_billed', 'order']);

/** คีย์งานของหน้าการยื่นชำระ → `{ kind, id }` · `excise:<SO ค่าสรรพสามิต>` · `not_billed:<SO ลูกค้า>` · `order:<บันทึก>` */
export function parseFilingSummaryKey(key) {
  const text = String(key ?? '').trim();
  const at = text.indexOf(':');
  if (at <= 0) return null;
  const kind = text.slice(0, at);
  const id = text.slice(at + 1).trim();
  return KEY_KINDS.includes(kind) && id ? { kind, id } : null;
}

const COLUMNS = Object.freeze([
  { key: 'doc', label: 'เอกสาร', multiline: true },
  { key: 'customer', label: 'ลูกค้า', multiline: true },
  { key: 'product', label: 'สินค้า', multiline: true },
  { key: 'registration', label: 'เลขที่ทะเบียน' },
  { key: 'quantity', label: 'จำนวน', num: true },
  { key: 'exciseRatePerUnit', label: 'สรรพสามิต/ชิ้น', money: true },
  { key: 'localTaxRatePerUnit', label: 'ท้องถิ่น/ชิ้น', money: true },
  { key: 'totalExciseTax', label: 'ภาษีสรรพสามิต', money: true },
  { key: 'totalLocalTax', label: 'ภาษีท้องถิ่น', money: true },
  { key: 'totalTax', label: 'รวมภาษี', money: true },
]);

const lines = (...parts) => parts.filter((part) => String(part ?? '').trim()).join('\n');

/**
 * งานหลายงาน → รายงานรูปกลาง `{ title, columns, rows, summary }` ที่ `buildReportPrintHTML` วาดได้
 * @param items `[{ statusLabel, salesOrderNumber, exciseOrderNumber?, notBilledLabel?, round?: { no, count, remainingUnits },
 *               customerName, customerTaxId,
 *               lines: [{ fgCode, description, registrationNumber, quantity, exciseRatePerUnit, localTaxRatePerUnit,
 *                         totalExciseTax, totalLocalTax, totalTax }] }]`
 */
export function filingSummaryReport(items = []) {
  const rows = [];
  const sum = { quantity: 0, totalExciseTax: 0, totalLocalTax: 0, totalTax: 0 };
  let lineCount = 0;
  for (const item of items || []) {
    const itemLines = item?.lines?.length ? item.lines : [null];
    itemLines.forEach((line, index) => {
      const first = index === 0;
      rows.push({
        // หัวงานพิมพ์บนแถวแรกของงานเท่านั้น — แถวถัดไปของงานเดียวกันเว้นว่าง อ่านเป็นก้อนเดียว
        doc: first ? lines(
          item.salesOrderNumber,
          item.exciseOrderNumber ? `ค่าสรรพสามิต ${item.exciseOrderNumber}` : item.notBilledLabel ? `ไม่เรียกเก็บในระบบ — ${item.notBilledLabel}` : '',
          raRoundLabel(item),
          item.statusLabel,
        ) : '',
        customer: first ? lines(item.customerName, item.customerTaxId ? `เลขผู้เสียภาษี ${item.customerTaxId}` : '') : '',
        product: line ? lines(line.fgCode, line.description) : 'ไม่มีรายการสรรพสามิต',
        registration: line ? (line.registrationNumber || 'ยังไม่มีทะเบียนอนุมัติ') : '',
        quantity: line ? Number(line.quantity) || 0 : null,
        exciseRatePerUnit: line ? Number(line.exciseRatePerUnit) || 0 : null,
        localTaxRatePerUnit: line ? Number(line.localTaxRatePerUnit) || 0 : null,
        totalExciseTax: line ? Number(line.totalExciseTax) || 0 : null,
        totalLocalTax: line ? Number(line.totalLocalTax) || 0 : null,
        totalTax: line ? Number(line.totalTax) || 0 : null,
      });
      if (!line) return;
      lineCount += 1;
      sum.quantity += Number(line.quantity) || 0;
      sum.totalExciseTax += Number(line.totalExciseTax) || 0;
      sum.totalLocalTax += Number(line.totalLocalTax) || 0;
      sum.totalTax += Number(line.totalTax) || 0;
    });
  }
  return {
    title: FILING_SUMMARY_TITLE,
    columns: COLUMNS,
    rows,
    summary: {
      _label: `รวม ${(items || []).length} งาน · ${lineCount} รายการ`,
      quantity: sum.quantity,
      totalExciseTax: round2(sum.totalExciseTax),
      totalLocalTax: round2(sum.totalLocalTax),
      totalTax: round2(sum.totalTax),
    },
  };
}
