// ── เอกสารพิมพ์ของคิว "ลง BOM" (/rd/bom · ปุ่ม "พิมพ์ / PDF" ที่หัวหน้า · มติเจ้าของ 04/11/2026) ─────────────────
//
// ⭐ ไม่เขียนเปลือกเอกสารใหม่ — ประกอบเป็น **รายงานรูปกลาง** `{ title, columns, rows, summary, emptyText }` แล้วส่งให้
//   `openReportPrintWindow` (lib/tax/reportPrint.js) ตัวเดียวกับรายงาน /tax และใบสรุปรายการยื่น — A4 แนวนอน ·
//   หัวบริษัท · แบ่งหน้าตามความสูงแถว + ตาข่ายกันแถวหาย · บันทึกเป็น PDF ได้จากหน้าต่างพิมพ์
// ⭐ แถว = **เท่าที่ตาเห็นบนจอ** — แท็บที่เปิดอยู่ เรียงแบบตาราง (ผู้เรียกส่ง `bomTabRows` มา) · หนึ่งแถว = FG หนึ่งตัว
// ⭐ คอลัมน์ = หน้าตาเดียวกับตาราง (ช่องละหลายบรรทัด: บรรทัดแรกเป็นตัวหลัก ที่เหลือเป็นบรรทัดรองตัวเล็ก) ·
//   ช่องท้ายเปลี่ยนตามแท็บเหมือนช่องที่ห้าของตาราง (ส่งโดย · ตีกลับ · ลงเสร็จ) · ไม่มีคอลัมน์ปุ่ม
// ⚠️ ไฟล์นี้ไม่แตะ DOM และไม่รู้ว่า "วันนี้" คือวันไหน — ผู้เรียกส่งวันไทยมา (กติกาเดียวกับ bomBoard.js)
import { fmtDate, fmtNationalId, fmtNumber } from '@/lib/format';
import { brandBoth } from '@/lib/master/brands';
import { branchValue } from '@/lib/master/thaiAddress';
import { BOM_BOARD_TABS, BOM_FORMULA_KIND_LABEL, bomWaitingDays } from '@/lib/rd/bomBoard';

const text = (value) => String(value ?? '').trim();
const lines = (...parts) => parts.map(text).filter(Boolean).join('\n');
const dot = (...parts) => parts.map(text).filter(Boolean).join(' · ');
const dateOf = (iso) => (iso ? fmtDate(iso) : null);

/* หัวช่องท้ายตามแท็บ — คำเดียวกับหัวคอลัมน์ที่ห้าของตาราง */
const LAST_COLUMN_LABEL = Object.freeze({ queued: 'ส่งโดย', in_progress: 'ส่งโดย', returned: 'ตีกลับ', done: 'ลงเสร็จ' });

export const bomTabLabel = (tab) => BOM_BOARD_TABS.find((t) => t.key === tab)?.label || '';

/** คอลัมน์ของเอกสาร (รูปคอลัมน์ของเปลือกรายงาน: `multiline` = บรรทัดแรกหลัก ที่เหลือบรรทัดรอง · `num` = ชิดขวา) */
export function bomPrintColumns(tab) {
  return [
    { key: 'product', label: 'สินค้า', multiline: true },
    { key: 'customer', label: 'ลูกค้า', multiline: true },
    { key: 'kind', label: 'ชนิด' },
    { key: 'formula', label: 'สูตร / กลิ่น', multiline: true },
    { key: 'volume', label: 'ปริมาตร', multiline: true, num: true },
    { key: 'status', label: LAST_COLUMN_LABEL[tab] || 'สถานะ', multiline: true },
  ];
}

/* ช่องสูตร/กลิ่น — ต่อสูตร: "รหัส ชื่อ" · กลิ่นของสูตร/หมวดในชุด · ชื่อที่ลูกค้าเรียก (ของกลิ่น · มติ 04/11) */
function formulaLines(formula) {
  const items = formula?.items || [];
  if (!items.length) return 'ไม่มีสูตร';
  return items
    .map((item) => lines(
      [item.code, item.name].map(text).filter(Boolean).join(' ') || '-',
      item.note,
      item.tradeName ? `ลูกค้าเรียก “${text(item.tradeName)}”` : null,
    ))
    .join('\n');
}

/* ช่องท้ายตามสถานะของแถว — เนื้อเดียวกับช่องที่ห้าของตาราง */
function statusLines(row, todayIso) {
  if (row.status === 'done') {
    return lines(
      row.bomCode || 'ไม่ระบุรหัส BOM',
      dot(row.doneByName, dateOf(row.doneAt)),
      row.bomNote,
    );
  }
  if (row.status === 'returned') {
    return lines(row.returnReason || '-', dot(row.returnedByName, dateOf(row.returnedAt)));
  }
  const waited = bomWaitingDays(row, todayIso);
  return lines(
    row.sentByName || '-',
    dot(dateOf(row.sentAt), waited != null ? `รอ ${waited} วัน` : null),
    row.status === 'in_progress' && row.acceptedByName ? `รับโดย ${row.acceptedByName}` : null,
  );
}

/** แถวของเอกสารจากแถวของคิว (`bomBoardRows`) */
export function bomPrintRow(row, { todayIso = null } = {}) {
  const items = row?.formula?.items || [];
  const kind = row?.formula?.kind || 'none';
  const hasCustomer = row?.customerArCode || row?.customerTaxId;
  const brand = brandBoth(row?.brandName, row?.brandNameEn);
  return {
    product: lines(
      row?.fgCode || '-',
      row?.nameTh,
      row?.nameEn,
      Number(row?.round) > 1 ? `ส่งรอบที่ ${row.round}` : null,
    ),
    customer: lines(
      row?.customerArCode || '-',
      row?.customerNameTh,
      row?.customerNameEn,
      hasCustomer ? `Tax ID ${row?.customerTaxId ? fmtNationalId(row.customerTaxId) : '-'} · สาขา ${branchValue(row?.customerBranchCode)}` : null,
      brand ? `แบรนด์ ${brand}` : null,
    ),
    kind: `${BOM_FORMULA_KIND_LABEL[kind] || ''}${kind === 'set' && items.length ? ` (${items.length})` : ''}`,
    formula: formulaLines(row?.formula),
    volume: lines(
      row?.volume != null ? `${fmtNumber(row.volume)}${row?.volumeUnit ? ` ${row.volumeUnit}` : ''}` : '-',
      row?.saleUnit ? `ต่อ 1 ${row.saleUnit}` : null,
    ),
    status: statusLines(row || {}, todayIso),
  };
}

/**
 * รายงานรูปกลางของแท็บหนึ่ง — ส่งเข้า `openReportPrintWindow` ได้ตรง ๆ
 * @param rows แถวของแท็บที่เรียงแล้ว (`bomTabRows(rows, tab)` — ตัวเดียวกับตาราง)
 */
export function bomBoardPrintReport(rows = [], { tab, todayIso = null } = {}) {
  const list = rows || [];
  const label = bomTabLabel(tab);
  return {
    // ชื่อเอกสาร = ชื่อไฟล์ตอน "บันทึกเป็น PDF" (เปลือกตั้งเป็น <title>) — บอกแท็บในชื่อ ใบคนละแท็บคือคนละใบ
    title: label ? `รายการลง BOM — ${label}` : 'รายการลง BOM',
    columns: bomPrintColumns(tab),
    rows: list.map((row) => bomPrintRow(row, { todayIso })),
    summary: { _label: `รวม ${fmtNumber(list.length)} รายการ` },
    emptyText: 'ไม่มีรายการในแท็บนี้',
  };
}
