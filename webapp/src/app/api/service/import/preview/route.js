// ── พรีวิวการนำเข้าข้อมูลเก่า (F-8) ───────────────────────────────────────
// POST multipart { file, sheetName? }  หรือ  JSON { text }
//   → { sheets, sheetName, headerMatch, rows, summary, report }
// ไม่เขียนอะไรลงฐานเลย
import { canImportServiceData } from '@/lib/permissions';
import { badRequest, fail, forbidden, ok, unauthorized, withUser } from '@/lib/http';
import { readImportRequest } from '@/lib/service/importRequest';
import { buildImportResult, readImportInput } from '@/lib/service/importRun';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canImportServiceData(user)) return forbidden('ต้องเป็นหัวหน้าฝ่ายบริการขึ้นไปจึงนำเข้าข้อมูลเก่าได้');

  const input = await readImportRequest(req);
  if (input.error) return badRequest(input.error);

  let table;
  try {
    table = await readImportInput(input);
  } catch (e) {
    return fail(e.message || 'อ่านไฟล์ไม่สำเร็จ', 422);
  }

  try {
    const result = await buildImportResult(supabase, table);
    return ok({
      fileName: input.fileName || null,
      sheets: table.sheets,
      sheetName: table.sheetName,
      headerRowNumber: table.headerRowNumber,
      ...result,
    });
  } catch (e) {
    console.error('[service-import-preview]', e);
    return fail(e.message || 'ตรวจข้อมูลไม่สำเร็จ', 500);
  }
});
