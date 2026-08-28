// ── อ่านคำขอนำเข้า (F-8) — ใช้ร่วมกันทั้ง preview และ commit ───────────────
//
// ⚠️ อยู่ใน lib ไม่ใช่ใน route — ไฟล์ route ของ Next ควร export เฉพาะ handler
// กับ config การ import ข้าม route กันเองพังง่ายตอน build
import { IMPORT_MAX_BYTES } from './importWorkbook';

/* รับสองรูปตามที่หน้าจอส่งมา:
     multipart { file, sheetName?, expected? }  — ไฟล์ .xlsx ทั้งใบ
     JSON      { text, sheetName?, expected? }  — ตารางที่ก๊อปมาวาง (TSV)
   คืน { buffer|text, sheetName, fileName, expected } หรือ { error } */
export async function readImportRequest(req) {
  const type = req.headers.get('content-type') || '';

  if (type.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return { error: 'รูปแบบข้อมูลอัปโหลดไม่ถูกต้อง' };
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return { error: 'ไม่พบไฟล์สำหรับนำเข้า' };
    if (typeof file.size === 'number' && file.size > IMPORT_MAX_BYTES) {
      return { error: 'ไฟล์ใหญ่เกินกำหนด (สูงสุด 5 MB)' };
    }
    if (!String(file.name || '').toLowerCase().endsWith('.xlsx')) {
      return { error: 'รับเฉพาะไฟล์ .xlsx — ถ้าเป็น .xls หรือ Google Sheet ให้บันทึกเป็น .xlsx ก่อน' };
    }
    const sheetName = form.get('sheetName');
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      sheetName: sheetName ? String(sheetName) : null,
      fileName: String(file.name),
      expected: parseExpected(form.get('expected')),
    };
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.text || '');
  if (!text.trim()) return { error: 'ยังไม่มีข้อมูลให้ตรวจ' };
  if (text.length > IMPORT_MAX_BYTES) return { error: 'ข้อความยาวเกินกำหนด' };
  return { text, sheetName: null, fileName: null, expected: parseExpected(body.expected) };
}

function parseExpected(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return null; }
}
