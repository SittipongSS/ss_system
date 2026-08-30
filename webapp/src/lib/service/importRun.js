// ── ทางเดินร่วมของ preview กับ commit (F-8) ───────────────────────────────
//
// ⭐ **commit อ่านไฟล์ใหม่ทั้งใบ ไม่รับแผนที่หน้าจอส่งกลับมา** — แผนที่ client
// ถือไว้แก้ได้ตามใจ ถ้าเชื่อมัน ใครก็ยิงคำขอสร้างไซต์ให้ลูกค้าไหนก็ได้ผ่านหน้า
// นำเข้า ⇒ อ่าน-แปลง-วางแผนใหม่ทุกครั้ง แล้วค่อยลงมือ (ช้ากว่านิดเดียว
// เพราะงานหนักอยู่ที่ query ฐาน ซึ่งต้องทำอยู่แล้วเพื่อกันสร้างซ้ำ)
import { buildDrafts, matchHeaders } from './importSheet';
import { planImport, reportRows } from './importPlan';
import { IMPORT_MAX_ROWS, parsePastedTable, readWorkbook } from './importWorkbook';
import { loadImportSnapshot } from './importRepo';

/* อ่าน input (ไฟล์ .xlsx หรือข้อความที่วางมา) → ตารางดิบ + รายชื่อชีต */
export async function readImportInput({ buffer = null, text = null, sheetName = null }) {
  if (buffer) return readWorkbook(buffer, { sheetName });
  const table = parsePastedTable(text || '');
  return { sheets: [], sheetName: null, ...table };
}

/* ตารางดิบ + ฐาน → ผลเต็ม (ใช้ทั้งตอนพรีวิวและตอนลงมือ) */
export async function buildImportResult(supabase, table) {
  const headerMatch = matchHeaders(table.headers);
  if (headerMatch.missingRequired.length) {
    return {
      blocked: `ไฟล์ขาดคอลัมน์ที่ต้องมี: ${headerMatch.missingRequired.join(' · ')}`,
      headerMatch,
    };
  }
  if (table.rows.length > IMPORT_MAX_ROWS) {
    return { blocked: `ข้อมูล ${table.rows.length} แถว เกินเพดาน ${IMPORT_MAX_ROWS} แถวต่อครั้ง`, headerMatch };
  }

  const drafts = buildDrafts(table.rows, headerMatch.map, { startRow: table.headerRowNumber + 1 });
  if (!drafts.length) return { blocked: 'ไม่พบข้อมูลในชีตนี้', headerMatch };

  const snapshot = await loadImportSnapshot(supabase);
  const { rows, summary } = planImport(drafts, snapshot);
  /* ⭐ ส่ง `snapshot` กลับไปด้วย — ตอนลงมือสร้าง (`applyImportPlan`) ต้องใช้รหัส AR
     ของลูกค้าและรหัสของไซต์เพื่อประกอบรหัสใหม่ (mig 0315) · ของพวกนี้อยู่ในก้อนนี้แล้ว
     ⇒ ไม่ต้องยิงถามรายแถวอีกรอบ (ไฟล์จริงมีหลายร้อยแถว) */
  return { blocked: null, headerMatch, rows, summary, report: reportRows(rows), snapshot };
}
