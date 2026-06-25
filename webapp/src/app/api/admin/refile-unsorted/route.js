// One-off: ย้ายไฟล์ใน _unsorted เข้าโฟลเดอร์ลูกค้า/สินค้าที่ถูกต้อง
// (re-resolve ด้วย resolveFolderForEntity — ใช้ logic fallback ใหม่). admin-only.
// ปลอดภัย: ย้ายโฟลเดอร์ใน Drive เท่านั้น (ไฟล์อ้างด้วย driveFileId, แอปไม่กระทบ).
//
//   GET /api/admin/refile-unsorted         → dry-run: ดูว่าแต่ละไฟล์จะย้ายไปไหน
//   GET /api/admin/refile-unsorted?run=1   → ย้ายจริง
// รันบน Vercel เท่านั้น (WIF). ลบทิ้งหลังใช้เสร็จ.
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'users:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const run = new URL(request.url).searchParams.get('run') === '1';
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;
  const supabase = getSupabaseAdmin();

  const { getDrive, ensureUnsortedFolder, resolveFolderForEntity } = await import('@/lib/drive');
  const drive = getDrive();
  const unsortedId = await ensureUnsortedFolder();

  // ไฟล์ทั้งหมดใน _unsorted
  const list = await drive.files.list({
    q: `'${unsortedId}' in parents and trashed = false`,
    corpora: 'drive', driveId, supportsAllDrives: true, includeItemsFromAllDrives: true,
    fields: 'files(id, name)', pageSize: 200,
  });
  const files = list.data.files || [];

  const results = [];
  for (const f of files) {
    // หา attachment row จาก driveFileId → รู้ entity → re-resolve โฟลเดอร์ที่ถูก
    const { data: row } = await supabase
      .from('attachments').select('entityType, entityId').eq('driveFileId', f.id).maybeSingle();
    if (!row) { results.push({ file: f.name, status: 'ไม่มี row (ข้าม)' }); continue; }

    let target;
    try { target = await resolveFolderForEntity(row.entityType, row.entityId); }
    catch (e) { results.push({ file: f.name, status: 'ยัง resolve ไม่ได้: ' + (e?.message || e) }); continue; }

    if (!target || target === unsortedId) { results.push({ file: f.name, status: 'ยังต้องอยู่ _unsorted' }); continue; }

    if (!run) { results.push({ file: f.name, status: 'จะย้าย', entityType: row.entityType }); continue; }

    try {
      await drive.files.update({ fileId: f.id, addParents: target, removeParents: unsortedId, supportsAllDrives: true });
      results.push({ file: f.name, status: 'ย้ายแล้ว' });
    } catch (e) {
      results.push({ file: f.name, status: 'ย้ายล้มเหลว: ' + (e?.message || e) });
    }
  }

  return Response.json({ run, inUnsorted: files.length, results });
}
