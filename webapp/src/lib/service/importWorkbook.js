// ── อ่านไฟล์ชีตเก่าเป็นตารางดิบ (F-8) ─────────────────────────────────────
//
// รับสองทาง เพราะข้อมูลเก่ามาจากสองที่จริง ๆ:
//   1. ไฟล์ `.xlsx` ทั้งใบ (มีหลายชีต · ชีตที่ต้องการอาจ **ซ่อนอยู่** — `Sheet3`
//      ที่เก็บจำนวนเครื่อง/ปริมาณ ถูกซ่อนไว้ในไฟล์จริง)
//   2. ข้อความที่ก๊อปจาก Excel มาวาง (TSV) — เร็วกว่าตอนแก้ทีละสิบแถวแล้วลองใหม่
//
// ⚠️ อ่านค่าด้วย `cell.text` เสมอ ไม่ใช่ `cell.value` — ช่องที่เป็นสูตรจะได้
//    **ผลลัพธ์ที่ตาเห็น** ไม่ใช่ object สูตร และวันที่ได้ข้อความตามที่ format ไว้
//    ซึ่งตัวแปลงของเรารับได้อยู่แล้ว (พ.ศ./ค.ศ./serial)
import ExcelJS from 'exceljs';

export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;

/* หา "แถวหัวตาราง" — ชีตจริงมีหัวเรื่อง/โลโก้/บรรทัดว่างก่อนตารางเสมอ
   ⇒ เลือกแถวแรกใน 10 แถวแรกที่มีช่องมีข้อความ ≥ 3 ช่อง */
export function findHeaderRow(rows = [], { limit = 10 } = {}) {
  for (let i = 0; i < Math.min(rows.length, limit); i += 1) {
    const filled = (rows[i] || []).filter((cell) => String(cell ?? '').trim() !== '').length;
    if (filled >= 3) return i;
  }
  return 0;
}

/* ตารางดิบ → { headers, rows, headerRowNumber }
   headerRowNumber = เลขแถวจริงในไฟล์ (1-based) เพื่อให้รายงานอ้างแถวได้ตรง */
export function splitTable(matrix = []) {
  const headerIndex = findHeaderRow(matrix);
  const headers = (matrix[headerIndex] || []).map((cell) => String(cell ?? '').trim());
  return {
    headers,
    rows: matrix.slice(headerIndex + 1),
    headerRowNumber: headerIndex + 1,
  };
}

/* ข้อความที่ก๊อปจาก Excel (TSV — Excel ใช้ tab เสมอตอน copy) */
export function parsePastedTable(text = '') {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const matrix = lines.map((line) => (line.includes('\t') ? line.split('\t') : line.split(',')));
  while (matrix.length && matrix[matrix.length - 1].every((cell) => String(cell).trim() === '')) matrix.pop();
  return splitTable(matrix);
}

/* .xlsx → รายชื่อชีต + ตารางของชีตที่เลือก
   ⚠️ ชีตที่ซ่อนอยู่ต้องอ่านได้ด้วย (state === 'hidden'/'veryHidden') — ข้อมูล
      จำนวนเครื่อง/ปริมาณของจริงอยู่ในชีตที่ซ่อน */
export async function readWorkbook(buffer, { sheetName = null } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheets = workbook.worksheets.map((sheet) => ({
    name: sheet.name,
    hidden: sheet.state === 'hidden' || sheet.state === 'veryHidden',
    rowCount: sheet.rowCount,
  }));
  if (!sheets.length) throw new Error('ไฟล์นี้ไม่มีชีตข้อมูล');

  const target = sheetName
    ? workbook.worksheets.find((sheet) => sheet.name === sheetName)
    : workbook.worksheets[0];
  if (!target) throw new Error(`ไม่พบชีต “${sheetName}”`);

  if (target.rowCount > IMPORT_MAX_ROWS + 20) {
    throw new Error(`ชีต “${target.name}” มี ${target.rowCount} แถว เกินเพดาน ${IMPORT_MAX_ROWS} แถวต่อครั้ง`);
  }

  const matrix = [];
  for (let index = 1; index <= target.rowCount; index += 1) {
    const row = target.getRow(index);
    const cells = [];
    // ⚠️ ใช้ cellCount ของชีต ไม่ใช่ของแถว — แถวที่ท้ายว่างจะสั้นกว่าหัวตาราง
    //    แล้วดัชนีคอลัมน์เลื่อนทันที
    for (let col = 1; col <= target.columnCount; col += 1) {
      cells.push(String(row.getCell(col).text ?? '').trim());
    }
    matrix.push(cells);
  }

  return { sheets, sheetName: target.name, ...splitTable(matrix) };
}
