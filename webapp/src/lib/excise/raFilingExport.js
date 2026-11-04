// ── ไฟล์ของตาราง "รายการชำระภาษีสรรพสามิต" ของ RA (มติเจ้าของ 04/11: "Excel แบน · พิมพ์ตามจอ") ─────────────────
//
// ⭐ ทั้งสองไฟล์ประกอบจาก **แถวที่จอวาดอยู่** (หลังตัวกรอง · ติ๊กไว้ = เฉพาะที่ติ๊ก) — แถวงาน + `detail` จาก
//    `/api/tax/orders/table` ⇒ ไฟล์ตรงกับจอเสมอ ไม่มีตัวกรองชุดที่สองฝั่ง server
//    (เดิมไฟล์อ่านเฉพาะบันทึกการยื่น ⇒ งานกำลังมา/รอ RA ไม่อยู่ในไฟล์ และปุ่มดับทั้งที่ตารางมีงาน · คอลัมน์เป็นของรุ่นก่อน V20)
//   · Excel = ตารางแบน แถวละสินค้า มีเดือน/SO/ลูกค้า/สถานะทุกแถว (กรอง/เรียง/pivot ต่อใน Excel ได้) · ตรึงหัว + ปุ่มกรอง
//   · พิมพ์ = ทรงเดียวกับจอ: หัวเดือน (ยอดรวมเดือน) → หัวงาน (ยอดรวมงาน) → แถวละสินค้า (แถวหัวกลุ่มของ lib/tax/reportPrint)
//   · ไม่รวมจำนวนชิ้น (หลายขนาดปนกัน · V28) · งานที่ยังไม่มีรายการยังขึ้นในไฟล์ (ไม่หายเงียบ) แต่ไม่อยู่ในยอด
// ⚠️ ไฟล์บริสุทธิ์ (ไม่พก lib ฝั่ง server) — จอเรียกตรง
import { fmtMoney, fmtNumber, naText } from '@/lib/format';
import { statusMeta } from '@/lib/excise/workflow';
import { filingDateText, filingLinesTaxTotal, filingMonthLabel, filingMonthTotals } from '@/lib/excise/raFilingMonth';

export const RA_FILING_EXPORT_TITLE = 'รายการชำระภาษีสรรพสามิต';

const NO_LINES_TEXT = 'ยังไม่มีรายการสินค้า';

/** แถวที่จะลงไฟล์ — ติ๊กไว้ = เฉพาะที่ติ๊ก (ตามลำดับบนจอ) · ไม่ติ๊ก = ทุกแถวบนจอ */
export function raFilingExportRows(rows = [], selected = null) {
  const picked = selected && selected.size ? (rows || []).filter((row) => selected.has(row.key)) : (rows || []);
  return [...picked];
}

/** ลำดับเดียวกับจอ (`FilingLinesTable.monthBuckets`): เดือนใหม่สุดก่อน → วันที่ส่งของ (ไม่มีวันไปท้าย) → เลข SO */
export function raFilingMonthBuckets(rows = []) {
  const sorted = [...(rows || [])].sort((a, b) => String(b.detail?.month || '').localeCompare(String(a.detail?.month || ''))
    || String(a.detail?.deliveryDate || '9999').localeCompare(String(b.detail?.deliveryDate || '9999'))
    || String(a.salesOrderNumber || '').localeCompare(String(b.salesOrderNumber || '')));
  const buckets = [];
  for (const row of sorted) {
    const month = row.detail?.month || null;
    const last = buckets.at(-1);
    if (last && last.month === month) last.rows.push(row);
    else buckets.push({ month, rows: [row] });
  }
  return buckets;
}

const statusText = (row) => statusMeta(row?.status).label;
/* เงินบนกระดาษ = ทรงของเปลือกเอกสาร ("1,190.00" ไม่มี ฿ · `documentShell.money`) — ใช้กับข้อความที่ประกอบเอง */
const paperMoney = (value) => fmtNumber(Number(value) || 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const taxCheckText = (line) => {
  if (!line?.taxCheck) return '';
  return line.taxCheck.ok ? 'ตรงสูตร' : `ไม่ตรงสูตร · 8.8% = ${paperMoney(line.taxCheck.expected)}`;
};
const summaryLabel = (totals) => `รวม ${fmtNumber(totals.jobs)} งาน · ${fmtNumber(totals.lines)} รายการ${totals.missing ? ` (ไม่รวม ${fmtNumber(totals.missing)} งานที่ยังไม่มีรายการ)` : ''}`;

/** Excel แบน — แถวละสินค้า · งานที่ไม่มีรายการ = หนึ่งแถวบอกเหตุ */
export function raFilingExcelReport(rows = []) {
  const out = [];
  for (const bucket of raFilingMonthBuckets(rows)) {
    const monthText = filingMonthLabel(bucket.month).short;
    for (const row of bucket.rows) {
      const job = {
        month: monthText,
        salesOrder: row.salesOrderNumber || '',
        customer: naText(row.customerName),
        stage: row.subtitle || '',
        status: statusText(row),
        deliveryDate: row.detail?.deliveryDate || null,
      };
      const lines = row.detail?.lines || [];
      if (!lines.length) {
        out.push({ ...job, description: row.detail ? 'ใบนี้ไม่มีรายการค่าสรรพสามิต' : NO_LINES_TEXT });
        continue;
      }
      for (const line of lines) {
        out.push({
          ...job,
          brand: line.brand || '',
          description: line.description || line.fgCode || '',
          fgCode: line.fgCode || '',
          volume: line.volume || '',
          quantity: Number(line.quantity) || 0,
          retailPriceIncVat: line.retailPriceIncVat ?? '',
          retailPriceExVat: line.retailPriceExVat ?? '',
          taxPerUnit: line.taxPerUnit ?? '',
          taxCheck: taxCheckText(line),
          totalTax: Number(line.totalTax) || 0,
        });
      }
    }
  }
  const totals = filingMonthTotals(rows);
  return {
    type: 'raFiling',
    title: RA_FILING_EXPORT_TITLE,
    excel: { freezeHeader: true, autoFilter: true },
    columns: [
      { key: 'month', label: 'เดือนที่ยื่น', width: 13 },
      { key: 'salesOrder', label: 'ใบสั่งขาย', width: 17 },
      { key: 'customer', label: 'ลูกค้า', width: 34 },
      { key: 'stage', label: 'เอกสาร / ขั้น', width: 40 },
      { key: 'status', label: 'สถานะ', width: 12 },
      { key: 'deliveryDate', label: 'วันที่ส่งของ', date: true, width: 13 },
      { key: 'brand', label: 'แบรนด์', width: 16 },
      { key: 'description', label: 'รายการ', width: 40 },
      { key: 'fgCode', label: 'รหัส FG', width: 22 },
      { key: 'volume', label: 'ปริมาณ', width: 10 },
      { key: 'quantity', label: 'จำนวน', num: true, width: 10 },
      { key: 'retailPriceIncVat', label: 'ราคาขายปลีก (รวม VAT)', money: true, width: 16 },
      { key: 'retailPriceExVat', label: 'ราคาขายปลีกก่อน VAT', money: true, width: 16 },
      { key: 'taxPerUnit', label: 'ภาษี/หน่วย (8.8%)', money: true, width: 15 },
      { key: 'taxCheck', label: 'ตรวจสูตร 8.8%', width: 22 },
      { key: 'totalTax', label: 'ภาษีรวม', money: true, width: 16 },
    ],
    rows: out,
    summary: { _label: summaryLabel(totals), totalTax: totals.totalTax },
  };
}

/** พิมพ์ตามจอ — หัวเดือน · หัวงาน · แถวละสินค้า (คอลัมน์เดียวกับจอ · ไม่มีช่องสถานะซ้ำทุกแถว — สถานะอยู่บนหัวงาน) */
export function raFilingPrintReport(rows = []) {
  const out = [];
  for (const bucket of raFilingMonthBuckets(rows)) {
    const label = filingMonthLabel(bucket.month);
    const totals = filingMonthTotals(bucket.rows);
    out.push({
      _kind: 'section',
      _level: 1,
      // บรรทัดเดียว — ยอดของเดือนคือยอดที่ RA ยื่นชำระ ต้องอยู่บนบรรทัดหลัก ไม่ใช่บรรทัดรองตัวเล็ก (เห็นจากใบพิมพ์จริง 04/11)
      _label: `${RA_FILING_EXPORT_TITLE} ${label.short} · ${label.long} · ${fmtNumber(totals.jobs)} งาน · ${fmtNumber(totals.lines)} รายการ`
        + ` · ภาษีรวม ${fmtMoney(totals.totalTax)}`
        + (totals.missing ? ` (ไม่รวม ${fmtNumber(totals.missing)} งานที่ยังไม่มีรายการ)` : ''),
    });
    for (const row of bucket.rows) {
      const lines = row.detail?.lines || [];
      out.push({
        _kind: 'section',
        _level: 2,
        _label: [
          [row.salesOrderNumber, naText(row.customerName), statusText(row),
            lines.length ? `${fmtNumber(lines.length)} รายการ · ภาษีรวม ${fmtMoney(filingLinesTaxTotal(lines))}` : null,
          ].filter(Boolean).join(' · '),
          [row.subtitle, ...(row.detail?.blockers || [])].filter(Boolean).join(' · '),
        ].filter(Boolean).join('\n'),
      });
      if (!lines.length) {
        out.push({ description: row.detail ? 'ใบนี้ไม่มีรายการค่าสรรพสามิต' : NO_LINES_TEXT });
        continue;
      }
      const date = filingDateText(row.detail) || '—';
      for (const line of lines) {
        out.push({
          date,
          brand: line.brand || '—',
          description: line.description || line.fgCode || '—',
          volume: line.volume || '—',
          quantity: Number(line.quantity) || 0,
          retailPriceIncVat: line.retailPriceIncVat ?? '—',
          retailPriceExVat: line.retailPriceExVat ?? '—',
          taxPerUnit: line.taxCheck && !line.taxCheck.ok
            ? `${paperMoney(line.taxPerUnit)}\n${taxCheckText(line)}`
            : (line.taxPerUnit ?? '—'),
          totalTax: Number(line.totalTax) || 0,
        });
      }
    }
  }
  const totals = filingMonthTotals(rows);
  return {
    type: 'raFiling',
    title: RA_FILING_EXPORT_TITLE,
    columns: [
      { key: 'date', label: 'วันที่ส่งของ' },
      { key: 'brand', label: 'แบรนด์' },
      { key: 'description', label: 'รายการ' },
      { key: 'volume', label: 'ปริมาณ' },
      { key: 'quantity', label: 'จำนวน', num: true },
      { key: 'retailPriceIncVat', label: 'ราคาขายปลีก (รวม VAT)', money: true },
      { key: 'retailPriceExVat', label: 'ราคาขายปลีกก่อน VAT', money: true },
      // ไม่ตรงสูตร = บรรทัดรองในช่อง (คำเตือนเดียวกับจอ) ⇒ multiline · ค่าปกติเป็นตัวเลข
      { key: 'taxPerUnit', label: 'ภาษี/หน่วย (8.8%)', money: true, multiline: true },
      { key: 'totalTax', label: 'ภาษีรวม', money: true },
    ],
    rows: out,
    summary: { _label: summaryLabel(totals), totalTax: totals.totalTax },
  };
}
