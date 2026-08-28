// ── ลงมือนำเข้าข้อมูลเก่า (F-8) ───────────────────────────────────────────
// POST multipart { file, sheetName?, expected }  หรือ  JSON { text, expected }
//   → { created, summary, report, errors }
//
// ⭐ `expected` = จำนวนที่หน้าจอเห็นตอนพรีวิว (`newSites/newZones/newAssets`)
//   server วางแผนใหม่เองแล้วเทียบ — ไม่ตรงเมื่อไรแปลว่ามีคนแก้ข้อมูลคั่นระหว่าง
//   ที่กำลังดูพรีวิวอยู่ ⇒ หยุด ให้กดพรีวิวใหม่ (ยอมเสียเวลาดีกว่าสร้างของที่ไม่ได้ดู)
import { recordAudit } from '@/lib/audit';
import { canImportServiceData } from '@/lib/permissions';
import { badRequest, conflict, fail, forbidden, ok, unauthorized, withUser } from '@/lib/http';
import { ROW_OK } from '@/lib/service/importPlan';
import { applyImportPlan } from '@/lib/service/importRepo';
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

  let result;
  try {
    result = await buildImportResult(supabase, table);
  } catch (e) {
    console.error('[service-import-commit] plan', e);
    return fail(e.message || 'ตรวจข้อมูลไม่สำเร็จ', 500);
  }
  if (result.blocked) return badRequest(result.blocked);

  const expected = input.expected;
  if (expected) {
    const now = result.summary;
    const same = ['newSites', 'newZones', 'newAssets'].every((key) => Number(expected[key]) === now[key]);
    if (!same) {
      return conflict(
        `ข้อมูลในระบบเปลี่ยนไประหว่างที่ดูพรีวิว (ตอนนี้จะสร้าง ไซต์ ${now.newSites} · โซน ${now.newZones} · เครื่อง ${now.newAssets}) — กดตรวจใหม่อีกครั้งก่อนยืนยัน`,
      );
    }
  }

  const toCreate = result.rows.filter((row) => row.status === ROW_OK);
  if (!toCreate.length) return badRequest('ไม่มีอะไรให้สร้าง — ทุกแถวมีอยู่แล้วหรือมีปัญหาที่ต้องแก้ก่อน');

  let applied;
  try {
    applied = await applyImportPlan(supabase, toCreate, { user });
  } catch (e) {
    console.error('[service-import-commit] apply', e);
    return fail(e.message || 'นำเข้าไม่สำเร็จ', 500);
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'service_site',
    entityId: 'import',
    after: { created: applied.created, fileName: input.fileName || null, sheetName: table.sheetName || null },
    summary: `นำเข้าข้อมูลเก่าธุรกิจบริการ — ไซต์ ${applied.created.sites} · โซน ${applied.created.zones} · เครื่อง ${applied.created.assets}`,
    request: req,
  });

  return ok({
    created: applied.created,
    errors: applied.errors,
    summary: result.summary,
    report: result.report,
  });
});
