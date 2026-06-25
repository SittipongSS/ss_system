// Phase 3: ย้ายไฟล์แนบเก่าจาก Supabase Storage → Google Drive แล้วลบ original
// (ลดพื้นที่ Supabase จริง). admin-only. รันบน Vercel เท่านั้น (WIF ต้องการ OIDC token).
//
//   GET /api/admin/migrate-drive              → dry-run: นับ + ดูตัวอย่างที่จะย้าย (ไม่แตะอะไร)
//   GET /api/admin/migrate-drive?run=1&limit=5 → ย้ายจริงทีละ batch (เรียกซ้ำจนกว่า remaining = 0)
//
// ปลอดภัย: ลบไฟล์บน Supabase เฉพาะเมื่ออัปขึ้น Drive + อัปเดต DB สำเร็จแล้วเท่านั้น.
// idempotent: ทำเฉพาะแถวที่ driveFileId ยังเป็น null → รันซ้ำได้.
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { can } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// แกะ { bucket, path } จาก Supabase public URL: .../object/public/<bucket>/<path>
function parseSupabaseUrl(url) {
  const m = typeof url === 'string' && url.match(/\/object\/public\/([^/]+)\/(.+)$/);
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
}

async function countRemaining(supabase) {
  const { count } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .is('driveFileId', null)
    .like('fileUrl', '%/object/public/%');
  return count ?? null;
}

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!can(user.role, 'users:manage')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const run = searchParams.get('run') === '1';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '5', 10) || 5, 1), 50);

  const supabase = getSupabaseAdmin();

  // dry-run: รายงานอย่างเดียว ไม่แตะข้อมูล.
  if (!run) {
    const remaining = await countRemaining(supabase);
    const { data: sample } = await supabase
      .from('attachments')
      .select('id, entityType, fileName, fileUrl')
      .is('driveFileId', null).like('fileUrl', '%/object/public/%')
      .order('createdAt', { ascending: true }).limit(10);
    return Response.json({
      dryRun: true,
      remaining,
      sample: (sample || []).map((r) => ({ id: r.id, entityType: r.entityType, fileName: r.fileName })),
      hint: 'เรียก ?run=1&limit=5 เพื่อเริ่มย้ายทีละ batch แล้วเรียกซ้ำจนกว่า remaining = 0',
    });
  }

  const { data: rows, error } = await supabase
    .from('attachments')
    .select('id, entityType, entityId, fileUrl, fileName, mimeType')
    .is('driveFileId', null).like('fileUrl', '%/object/public/%')
    .order('createdAt', { ascending: true }).limit(limit);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { resolveFolderForEntity, ensureUnsortedFolder, uploadFile } = await import('@/lib/drive');
  const migrated = [];
  const failed = [];

  for (const r of rows) {
    try {
      const loc = parseSupabaseUrl(r.fileUrl);
      if (!loc) { failed.push({ id: r.id, error: 'แกะ URL ไม่ได้' }); continue; }

      // 1) ดึงไฟล์จาก Supabase
      const { data: blob, error: dlErr } = await supabase.storage.from(loc.bucket).download(loc.path);
      if (dlErr || !blob) { failed.push({ id: r.id, error: 'download: ' + (dlErr?.message || 'ไม่พบไฟล์') }); continue; }
      const buffer = Buffer.from(await blob.arrayBuffer());

      // 2) หาโฟลเดอร์ปลายทาง (ลูกค้า/สินค้า) — resolve ไม่ได้ → _unsorted
      let folderId;
      try { folderId = await resolveFolderForEntity(r.entityType, r.entityId); }
      catch { folderId = await ensureUnsortedFolder(); }

      // 3) อัปขึ้น Drive
      const { id: driveId, webViewLink } = await uploadFile(folderId, {
        buffer,
        name: r.fileName || loc.path.split('/').pop() || 'file',
        mimeType: r.mimeType || 'application/octet-stream',
      });

      // 4) อัปเดต DB (driveFileId + fileUrl = webViewLink)
      const { error: upErr } = await supabase.from('attachments')
        .update({ driveFileId: driveId, fileUrl: webViewLink }).eq('id', r.id);
      if (upErr) {
        // ขึ้น Drive แล้วแต่ DB ไม่อัปเดต → อย่าลบ Supabase (กันไฟล์หาย); รอบหน้าจะเจอซ้ำ
        failed.push({ id: r.id, error: 'db update: ' + upErr.message, note: 'มี orphan บน Drive' });
        continue;
      }

      // 5) สำเร็จครบ → ลบ original บน Supabase (ลดพื้นที่จริง)
      await supabase.storage.from(loc.bucket).remove([loc.path]);
      migrated.push({ id: r.id, driveFileId: driveId });
    } catch (e) {
      failed.push({ id: r.id, error: e?.message || String(e) });
    }
  }

  return Response.json({
    run: true,
    migratedCount: migrated.length,
    failedCount: failed.length,
    failed,
    remaining: await countRemaining(supabase),
  });
}
