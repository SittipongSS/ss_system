import ExcelJS from 'exceljs';
import {
  PRODUCT_CATEGORY_IMPORT_HEADERS as HEADERS,
  PRODUCT_CATEGORY_IMPORT_MAX_ROWS,
  PRODUCT_CATEGORY_IMPORT_VERSION,
  PRODUCT_CATEGORY_STATUS_LABELS,
} from './productCategoryImport';

const FONT = 'Leelawadee UI';
const HEADER_FILL = 'FFC17A52';
const HEADER_TEXT = 'FFFFFFFF';
const INFO_FILL = 'FFF4E8DF';
const IMPORT_SHEET = 'หมวดสินค้า';
const INSTRUCTION_SHEET = 'คำแนะนำ';
const METADATA_SHEET = '_metadata';

const visibleColumns = [
  ['mainCategoryCode', HEADERS.mainCategoryCode, 16],
  ['mainCategoryName', HEADERS.mainCategoryName, 24],
  ['typeCode', HEADERS.typeCode, 16],
  ['nameTh', HEADERS.nameTh, 32],
  ['nameEn', HEADERS.nameEn, 36],
  ['status', HEADERS.status, 14],
  ['note', HEADERS.note, 36],
];
const technicalColumns = [
  ['recordId', HEADERS.recordId, 14],
  ['expectedUpdatedAt', HEADERS.expectedUpdatedAt, 24],
];

function styleHeader(row) {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

function workbookBase(now) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SS System';
  workbook.created = now;
  workbook.modified = now;
  workbook.calcProperties.fullCalcOnLoad = false;
  return workbook;
}

export async function buildProductCategoryTemplateBuffer(rows = [], { now = new Date() } = {}) {
  const workbook = workbookBase(now);
  const instructions = workbook.addWorksheet(INSTRUCTION_SHEET, { views: [{ showGridLines: false }] });
  instructions.columns = [{ width: 24 }, { width: 92 }];
  instructions.addRow(['ไฟล์สำหรับนำเข้า', 'หมวดสินค้า']);
  instructions.addRow(['เวอร์ชัน', PRODUCT_CATEGORY_IMPORT_VERSION]);
  instructions.addRow(['สร้างเมื่อ', now.toISOString()]);
  instructions.addRow([]);
  instructions.addRow(['วิธีใช้', 'แก้ข้อมูลในชีต “หมวดสินค้า” แล้วอัปโหลดกลับเข้าระบบเพื่อ Preview ก่อนยืนยัน']);
  instructions.addRow(['รหัส', 'รายการเดิมห้ามแก้รหัสหมวดหลักและรหัสหมวดรอง; เพิ่มแถวใหม่ได้']);
  instructions.addRow(['สถานะ', `ใช้เฉพาะ “${PRODUCT_CATEGORY_STATUS_LABELS.active}” หรือ “${PRODUCT_CATEGORY_STATUS_LABELS.inactive}”`]);
  instructions.addRow(['การลบ', 'การลบแถวออกจากไฟล์ไม่ลบและไม่พักใช้ข้อมูลในระบบ']);
  instructions.addRow(['คำเตือน', 'ห้ามแก้หรือลบคอลัมน์ที่ซ่อนอยู่ และควรใช้ไฟล์ล่าสุดเพื่อลดข้อมูลขัดแย้ง']);
  instructions.eachRow((row, index) => {
    row.font = { name: FONT, size: 11, bold: index <= 3 && index !== 4 };
    row.alignment = { vertical: 'top', wrapText: true };
    if (index === 1) {
      row.height = 30;
      row.getCell(1).font = { name: FONT, size: 15, bold: true };
      row.getCell(2).font = { name: FONT, size: 15, bold: true };
    }
  });

  const sheet = workbook.addWorksheet(IMPORT_SHEET, {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }],
  });
  sheet.columns = [...visibleColumns, ...technicalColumns].map(([key, header, width]) => ({ key, header, width }));
  styleHeader(sheet.getRow(1));
  for (const row of rows) {
    const excelRow = sheet.addRow({
      mainCategoryCode: row.mainCategoryCode,
      mainCategoryName: row.mainCategoryName,
      typeCode: row.typeCode,
      nameTh: row.nameTh || '',
      nameEn: row.nameEn || '',
      status: row.isActive === false ? PRODUCT_CATEGORY_STATUS_LABELS.inactive : PRODUCT_CATEGORY_STATUS_LABELS.active,
      note: row.note || '',
      recordId: row.id == null ? '' : String(row.id),
      expectedUpdatedAt: row.updatedAt || '',
    });
    excelRow.font = { name: FONT, size: 11 };
    excelRow.alignment = { vertical: 'top', wrapText: true };
  }
  sheet.autoFilter = { from: 'A1', to: 'G1' };
  sheet.getColumn(8).hidden = true;
  sheet.getColumn(9).hidden = true;
  sheet.dataValidations.add(`G2:G${PRODUCT_CATEGORY_IMPORT_MAX_ROWS + 1}`, {
    type: 'list',
    allowBlank: false,
    formulae: [`"${PRODUCT_CATEGORY_STATUS_LABELS.active},${PRODUCT_CATEGORY_STATUS_LABELS.inactive}"`],
    showErrorMessage: true,
    errorTitle: 'สถานะไม่ถูกต้อง',
    error: `เลือกเฉพาะ ${PRODUCT_CATEGORY_STATUS_LABELS.active} หรือ ${PRODUCT_CATEGORY_STATUS_LABELS.inactive}`,
  });

  const metadata = workbook.addWorksheet(METADATA_SHEET);
  metadata.state = 'veryHidden';
  metadata.addRows([
    ['key', 'value'],
    ['templateVersion', PRODUCT_CATEGORY_IMPORT_VERSION],
    ['exportedAt', now.toISOString()],
  ]);
  metadata.eachRow((row) => { row.font = { name: FONT, size: 10 }; });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildProductCategoryExportBuffer(rows = [], { now = new Date() } = {}) {
  const workbook = workbookBase(now);
  const sheet = workbook.addWorksheet('ข้อมูลปัจจุบัน', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 3 }],
  });
  sheet.columns = [
    { key: 'mainCategoryCode', header: HEADERS.mainCategoryCode, width: 16 },
    { key: 'mainCategoryName', header: HEADERS.mainCategoryName, width: 24 },
    { key: 'typeCode', header: HEADERS.typeCode, width: 16 },
    { key: 'nameTh', header: HEADERS.nameTh, width: 32 },
    { key: 'nameEn', header: HEADERS.nameEn, width: 36 },
    { key: 'status', header: HEADERS.status, width: 14 },
    { key: 'note', header: HEADERS.note, width: 36 },
    // ธงกำกับดูแล (mig 0131) — อ่านอย่างเดียวในไฟล์ export/ตรวจสอบ: แก้ได้เฉพาะ
    // หน้าจอจัดการหมวดเท่านั้น (มติ 2026-07-20) จึงไม่อยู่ใน template นำเข้า
    // (PC-IMPORT-1 ไม่ bump; parser ฝั่ง import อ่านตามชื่อหัวคอลัมน์ — คอลัมน์นี้ถูกเพิกเฉย)
    { key: 'isExcise', header: 'เสียภาษีสรรพสามิต', width: 18 },
    { key: 'requiresFdaNotice', header: 'ต้องจดแจ้ง อย.', width: 16 },
    { key: 'products', header: 'สินค้า', width: 12 },
    { key: 'deals', header: 'ดีล', width: 12 },
    { key: 'projects', header: 'โครงการ', width: 12 },
    { key: 'createdAt', header: 'สร้างเมื่อ', width: 22 },
    { key: 'updatedAt', header: 'แก้ไขล่าสุด', width: 22 },
  ];
  styleHeader(sheet.getRow(1));
  for (const row of rows) {
    const excelRow = sheet.addRow({
      mainCategoryCode: row.mainCategoryCode,
      mainCategoryName: row.mainCategoryName,
      typeCode: row.typeCode,
      nameTh: row.nameTh || '',
      nameEn: row.nameEn || '',
      status: row.isActive === false ? PRODUCT_CATEGORY_STATUS_LABELS.inactive : PRODUCT_CATEGORY_STATUS_LABELS.active,
      note: row.note || '',
      isExcise: row.isExcise ? 'ใช่' : '',
      requiresFdaNotice: row.requiresFdaNotice ? 'ใช่' : '',
      products: row.usage?.products || 0,
      deals: row.usage?.deals || 0,
      projects: row.usage?.projects || 0,
      createdAt: row.createdAt ? new Date(row.createdAt) : '',
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : '',
    });
    excelRow.font = { name: FONT, size: 11 };
    excelRow.alignment = { vertical: 'top', wrapText: true };
    for (const column of [10, 11, 12]) excelRow.getCell(column).numFmt = '#,##0';
    for (const column of [13, 14]) excelRow.getCell(column).numFmt = 'dd/mm/yyyy hh:mm';
  }
  sheet.autoFilter = { from: 'A1', to: 'N1' };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function formulaField(cell, label, formulaFields) {
  const value = cell?.value;
  if (value && typeof value === 'object' && Object.hasOwn(value, 'formula')) {
    formulaFields.push(label);
  }
}

function metadataOf(sheet) {
  const result = {};
  if (!sheet) return result;
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const key = String(row.getCell(1).text || '').trim();
    if (key) result[key] = String(row.getCell(2).text || '').trim();
  });
  return result;
}

export async function parseProductCategoryWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet(IMPORT_SHEET);
  if (!sheet) throw new Error(`ไม่พบชีต “${IMPORT_SHEET}”`);

  const metadata = metadataOf(workbook.getWorksheet(METADATA_SHEET));
  if (metadata.templateVersion !== PRODUCT_CATEGORY_IMPORT_VERSION) {
    throw new Error('เวอร์ชันไฟล์ไม่รองรับ กรุณาดาวน์โหลดไฟล์สำหรับนำเข้าล่าสุด');
  }

  const headerIndex = new Map();
  sheet.getRow(1).eachCell((cell, column) => {
    headerIndex.set(String(cell.text || '').trim(), column);
  });
  for (const [, header] of visibleColumns) {
    if (!headerIndex.has(header)) throw new Error(`ไม่พบคอลัมน์ “${header}”`);
  }
  if (sheet.rowCount - 1 > PRODUCT_CATEGORY_IMPORT_MAX_ROWS) {
    throw new Error(`ไฟล์มีข้อมูลเกิน ${PRODUCT_CATEGORY_IMPORT_MAX_ROWS.toLocaleString('th-TH')} แถว`);
  }

  const read = (row, header) => {
    const column = headerIndex.get(header);
    return column ? String(row.getCell(column).text || '').trim() : '';
  };
  const rows = [];
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    const visible = visibleColumns.map(([, header]) => read(row, header));
    if (visible.every((value) => value === '')) continue;
    const formulaFields = [];
    for (const [, header] of visibleColumns) {
      const column = headerIndex.get(header);
      formulaField(row.getCell(column), header, formulaFields);
    }
    rows.push({
      rowNumber: index,
      mainCategoryCode: read(row, HEADERS.mainCategoryCode),
      mainCategoryName: read(row, HEADERS.mainCategoryName),
      typeCode: read(row, HEADERS.typeCode),
      nameTh: read(row, HEADERS.nameTh),
      nameEn: read(row, HEADERS.nameEn),
      status: read(row, HEADERS.status),
      note: read(row, HEADERS.note),
      recordId: read(row, HEADERS.recordId),
      expectedUpdatedAt: read(row, HEADERS.expectedUpdatedAt),
      formulaFields,
    });
  }
  if (!rows.length) throw new Error('ไม่พบข้อมูลหมวดสินค้าในไฟล์');
  return {
    templateVersion: metadata.templateVersion,
    exportedAt: metadata.exportedAt || null,
    rows,
  };
}
