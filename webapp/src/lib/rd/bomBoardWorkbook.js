// ── ไฟล์ Excel ของคิว "ลง BOM" (/rd/bom · ปุ่ม "ดาวน์โหลด Excel" · มติเจ้าของ 04/11/2026) ─────────────────────
//
// ⭐ แถว = **เท่าที่ตาเห็นบนจอ** (กติกาเดียวกับ Excel ทะเบียนสินค้า/สูตร) — แท็บที่เปิดอยู่ แท็บเดียว เรียงแบบเดียวกับตาราง
//   (`bomTabRows`) · หนึ่งแถว = FG หนึ่งตัว (หน่วยของหน้านี้คือสินค้า)
// ⭐ คอลัมน์ = ของที่ตารางโชว์ แตกช่องละค่า ให้คนรับไฟล์กรองได้ตรง:
//   สินค้า · ลูกค้า (AR / ชื่อ / Tax ID / สาขา / แบรนด์) · สูตร/กลิ่น (ชนิด / รหัส / ชื่อ / กลิ่นของสูตร / ชื่อที่ลูกค้าเรียก) ·
//   ปริมาตร · คอลัมน์ท้ายตามแท็บ — ช่องที่ห้าของตารางเปลี่ยนตามแท็บ ไฟล์ก็เปลี่ยนตาม (ส่งโดย · ตีกลับ · ลงเสร็จ)
// ⭐ ชุดของขวัญ (หลายสูตร) = หลายบรรทัดในเซลล์เดียว บรรทัดที่ n ของทุกคอลัมน์สูตรคือสูตรตัวเดียวกัน
//   (ค่าที่ไม่มีเป็นบรรทัดว่าง ไม่ใช่ข้ามบรรทัด — ข้ามแล้วบรรทัดเลื่อนไปจับคู่ผิดสูตร)
// รูปแบบชีตลอกจาก `formulaWorkbook.js` (ฟอนต์ · หัวตาราง · ชื่อไฟล์) — ไฟล์ที่ระบบส่งออกหน้าตาเดียวกัน
import ExcelJS from 'exceljs';
import { fmtDate, fmtNationalId } from '@/lib/format';
import { brandBoth } from '@/lib/master/brands';
import { branchValue } from '@/lib/master/thaiAddress';
import { BOM_BOARD_TABS, BOM_FORMULA_KIND_LABEL, BOM_TODO_STATUSES, bomWaitingDays } from '@/lib/rd/bomBoard';

const FONT = 'Leelawadee UI';
const HEADER_FILL = 'FFC17A52';
const HEADER_TEXT = 'FFFFFFFF';

/* คอลัมน์ที่ทุกแท็บมี — ลำดับเดียวกับตาราง (สินค้า → ลูกค้า → สูตร/กลิ่น → ปริมาตร → ส่งโดย) */
const BASE_COLUMNS = Object.freeze([
  { key: 'fgCode', header: 'รหัส FG', width: 24 },
  { key: 'nameTh', header: 'ชื่อสินค้า', width: 34 },
  { key: 'nameEn', header: 'ชื่อสินค้า (อังกฤษ)', width: 30 },
  { key: 'round', header: 'ส่งรอบที่', width: 10 },
  { key: 'customerArCode', header: 'รหัสลูกค้า (AR)', width: 14 },
  { key: 'customerNameTh', header: 'ชื่อลูกค้า', width: 34 },
  { key: 'customerNameEn', header: 'ชื่อลูกค้า (อังกฤษ)', width: 30 },
  { key: 'customerTaxId', header: 'เลขผู้เสียภาษี', width: 20 },
  { key: 'customerBranch', header: 'สาขา', width: 10 },
  { key: 'brand', header: 'แบรนด์', width: 24 },
  { key: 'formulaKind', header: 'ชนิด', width: 12 },
  { key: 'formulaCode', header: 'รหัสสูตร / กลิ่น', width: 22 },
  { key: 'formulaName', header: 'ชื่อสูตร / กลิ่น', width: 40 },
  // วันที่ของป้าย "PF · ชื่อ · วันที่" (มติเจ้าของ 13/11) — สูตร = วันที่สูตร · กลิ่น = วันผลิต
  { key: 'formulaDate', header: 'วันที่สูตร / กลิ่น', width: 14 },
  { key: 'formulaNote', header: 'กลิ่นของสูตร / หมวดในชุด', width: 30 },
  { key: 'tradeName', header: 'ชื่อที่ลูกค้าเรียก', width: 24 },
  { key: 'volume', header: 'ปริมาตร', width: 10 },
  { key: 'volumeUnit', header: 'หน่วยปริมาตร', width: 12 },
  { key: 'saleUnit', header: 'หน่วยขาย', width: 10 },
  { key: 'sentByName', header: 'ส่งโดย', width: 24 },
  { key: 'sentAt', header: 'วันที่ส่ง', width: 12 },
]);

/* คอลัมน์ท้ายตามแท็บ — ตรงกับช่องที่ห้าของตาราง */
const TAB_COLUMNS = Object.freeze({
  queued: [
    { key: 'waitingDays', header: 'รอ (วัน)', width: 10 },
  ],
  in_progress: [
    { key: 'waitingDays', header: 'รอ (วัน)', width: 10 },
    { key: 'acceptedByName', header: 'รับเรื่องโดย', width: 24 },
    { key: 'acceptedAt', header: 'วันที่รับเรื่อง', width: 14 },
  ],
  returned: [
    { key: 'returnReason', header: 'เหตุผลที่ตีกลับ', width: 40 },
    { key: 'returnedByName', header: 'ตีกลับโดย', width: 24 },
    { key: 'returnedAt', header: 'วันที่ตีกลับ', width: 12 },
  ],
  done: [
    { key: 'bomCode', header: 'รหัส BOM', width: 20 },
    { key: 'bomNote', header: 'หมายเหตุ', width: 34 },
    { key: 'doneByName', header: 'ลงเสร็จโดย', width: 24 },
    { key: 'doneAt', header: 'วันที่ลงเสร็จ', width: 14 },
  ],
});

/* คอลัมน์ที่อาจมีหลายบรรทัด — ตัดบรรทัดในเซลล์ */
const WRAP_KEYS = Object.freeze(['formulaCode', 'formulaName', 'formulaNote', 'tradeName', 'returnReason', 'bomNote']);

export const isBomExportTab = (tab) => BOM_BOARD_TABS.some((t) => t.key === tab);

/** คอลัมน์ของไฟล์ตามแท็บ — แท็บที่ไม่รู้จัก = ชุดพื้นฐาน */
export function bomExportColumns(tab) {
  return [...BASE_COLUMNS, ...(TAB_COLUMNS[tab] || [])];
}

const textOf = (value) => String(value ?? '').trim();
const dateOf = (iso) => (iso ? fmtDate(iso) : null);

/* หนึ่งค่าต่อสูตรในช่อง → หนึ่งบรรทัด · ไม่มีค่าสักตัว = เซลล์ว่าง · บางตัวไม่มี = บรรทัดว่าง (บรรทัดยังตรงสูตร) */
function linesOf(items, pick) {
  const values = (items || []).map((item) => textOf(pick(item)));
  return values.some(Boolean) ? values.join('\n') : null;
}

/**
 * แถวของไฟล์จากแถวของคิว (`bomBoardRows`) — ไม่แตะ ExcelJS (เทสต์ได้โดยไม่สร้างไฟล์)
 * ⚠️ ค่าที่ไม่มี = เซลล์ว่าง (null) ไม่ใช่ขีด — คนรับไฟล์กรอง "ว่าง" ใน Excel ได้ (กติกาเดียวกับ Excel ทะเบียนสูตร)
 */
export function bomExportRow(row, { todayIso = null } = {}) {
  const items = row?.formula?.items || [];
  const waited = BOM_TODO_STATUSES.includes(row?.status) ? bomWaitingDays(row, todayIso) : null;
  return {
    fgCode: textOf(row?.fgCode) || null,
    nameTh: textOf(row?.nameTh) || null,
    nameEn: textOf(row?.nameEn) || null,
    round: Number(row?.round) > 0 ? Number(row.round) : null,
    customerArCode: textOf(row?.customerArCode) || null,
    customerNameTh: textOf(row?.customerNameTh) || null,
    customerNameEn: textOf(row?.customerNameEn) || null,
    customerTaxId: row?.customerTaxId ? fmtNationalId(row.customerTaxId) : null,
    // สาขาว่าง = สำนักงานใหญ่ (กติกาเดียวกับตาราง · `branchValue`) — ลูกค้าไม่อยู่ในทะเบียน = ว่าง
    customerBranch: row?.customerArCode || row?.customerTaxId ? branchValue(row?.customerBranchCode) : null,
    brand: brandBoth(row?.brandName, row?.brandNameEn) || null,
    formulaKind: BOM_FORMULA_KIND_LABEL[row?.formula?.kind || 'none'] || null,
    formulaCode: linesOf(items, (item) => item.code),
    formulaName: linesOf(items, (item) => item.name),
    formulaDate: linesOf(items, (item) => dateOf(item.date)),
    formulaNote: linesOf(items, (item) => item.note),
    tradeName: linesOf(items, (item) => item.tradeName),
    volume: row?.volume != null && Number.isFinite(Number(row.volume)) ? Number(row.volume) : null,
    volumeUnit: textOf(row?.volumeUnit) || null,
    saleUnit: textOf(row?.saleUnit) || null,
    sentByName: textOf(row?.sentByName) || null,
    sentAt: dateOf(row?.sentAt),
    waitingDays: waited,
    acceptedByName: textOf(row?.acceptedByName) || null,
    acceptedAt: dateOf(row?.acceptedAt),
    returnReason: textOf(row?.returnReason) || null,
    returnedByName: textOf(row?.returnedByName) || null,
    returnedAt: dateOf(row?.returnedAt),
    bomCode: textOf(row?.bomCode) || null,
    bomNote: textOf(row?.bomNote) || null,
    doneByName: textOf(row?.doneByName) || null,
    doneAt: dateOf(row?.doneAt),
  };
}

const thaiDayStamp = (now) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}${value('month')}${value('day')}`;
};

/** ชื่อไฟล์: YYYYMMDD_bom_<แท็บ>.xlsx ตามเวลาไทย (รูปเดียวกับ export ทะเบียนสินค้า/สูตร) */
export function bomExportFilename(tab, now = new Date()) {
  return `${thaiDayStamp(now)}_bom_${isBomExportTab(tab) ? tab : 'all'}.xlsx`;
}

/** ชื่อชีต = ป้ายแท็บ (คนเปิดไฟล์รู้ว่าเป็นแท็บไหนโดยไม่ต้องดูชื่อไฟล์) */
export const bomExportSheetName = (tab) => BOM_BOARD_TABS.find((t) => t.key === tab)?.label || 'ลง BOM';

export async function buildBomExportBuffer(rows = [], { tab, todayIso = null, now = new Date() } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SS System';
  workbook.created = now;
  workbook.modified = now;
  workbook.calcProperties.fullCalcOnLoad = false;

  const columns = bomExportColumns(tab);
  const sheet = workbook.addWorksheet(bomExportSheetName(tab), { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  sheet.columns = columns.map((c) => ({ ...c }));

  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  const wrapKeys = WRAP_KEYS.filter((key) => columns.some((c) => c.key === key));
  for (const item of rows) {
    const values = bomExportRow(item, { todayIso });
    const row = sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, values[c.key] ?? null])));
    row.font = { name: FONT, size: 11 };
    // ชิดบนทั้งแถว — ชุดของขวัญตัดหลายบรรทัด ช่องอื่นต้องอยู่บรรทัดเดียวกับสูตรตัวแรก
    row.alignment = { vertical: 'top' };
    for (const key of wrapKeys) row.getCell(key).alignment = { vertical: 'top', wrapText: true };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  return workbook.xlsx.writeBuffer();
}
