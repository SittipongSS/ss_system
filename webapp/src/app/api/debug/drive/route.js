// Debug: ตรวจ Google Drive (WIF) + เทียบไฟล์ใน Drive กับ DB rows.
//   GET /api/debug/drive            → env + เชื่อม Drive + 10 แถว attachments ล่าสุด
//   GET /api/debug/drive?list=1     → list ไฟล์จริงใน Shared Drive (หา orphan)
//   GET /api/debug/drive?delete=<fileId>  → ลบไฟล์ Drive ตรง ๆ (คืน error จริง)
//   GET /api/debug/drive?stream=<fileId>  → ทดสอบอ่านไฟล์
// ต้องล็อกอิน. ลบทิ้งหลังแก้เสร็จ.
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const doList = searchParams.get('list');
  const streamId = searchParams.get('stream');
  const deleteId = searchParams.get('delete');
  const driveId = process.env.GOOGLE_SHARED_DRIVE_ID;

  let drive;
  try {
    const mod = await import('@/lib/drive');
    drive = mod.getDrive();
  } catch (err) {
    return Response.json({ ok: false, stage: 'getDrive', error: err?.message || String(err) });
  }

  if (streamId) {
    try {
      const res = await drive.files.get({ fileId: streamId, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      return Response.json({ ok: true, action: 'stream', fileId: streamId, bytes: res.data?.byteLength ?? 0 });
    } catch (err) {
      return Response.json({ ok: false, action: 'stream', fileId: streamId, error: err?.message || String(err) });
    }
  }

  if (deleteId) {
    try {
      await drive.files.delete({ fileId: deleteId, supportsAllDrives: true });
      return Response.json({ ok: true, action: 'delete', fileId: deleteId });
    } catch (err) {
      return Response.json({ ok: false, action: 'delete', fileId: deleteId, error: err?.message || String(err) });
    }
  }

  // list ไฟล์จริงใน Shared Drive (ไม่รวมโฟลเดอร์) — ใช้หา orphan (ไฟล์ที่ไม่มี row).
  if (doList) {
    try {
      const res = await drive.files.list({
        q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
        corpora: 'drive', driveId, supportsAllDrives: true, includeItemsFromAllDrives: true,
        fields: 'files(id, name, parents)', pageSize: 100,
      });
      const files = res.data.files || [];
      // เทียบกับ DB: driveFileId ตัวไหนมี row บ้าง
      const { data: rows } = await getSupabaseAdmin().from('attachments').select('driveFileId').not('driveFileId', 'is', null);
      const tracked = new Set((rows || []).map((r) => r.driveFileId));
      return Response.json({
        ok: true, action: 'list', count: files.length,
        files: files.map((f) => ({ id: f.id, name: f.name, orphan: !tracked.has(f.id) })),
      });
    } catch (err) {
      return Response.json({ ok: false, action: 'list', error: err?.message || String(err) });
    }
  }

  const out = { ok: true, env: { STORAGE_BACKEND: process.env.STORAGE_BACKEND || '(unset)', GOOGLE_SHARED_DRIVE_ID: driveId } };
  try {
    const res = await drive.drives.get({ driveId });
    out.sharedDrive = { id: res.data.id, name: res.data.name };
  } catch (err) {
    out.ok = false; out.sharedDriveError = err?.message || String(err);
  }
  try {
    const { data } = await getSupabaseAdmin().from('attachments')
      .select('id, entityType, driveFileId, fileName, fileUrl, createdAt')
      .order('createdAt', { ascending: false }).limit(10);
    out.recentAttachments = (data || []).map((a) => ({
      id: a.id, entityType: a.entityType, driveFileId: a.driveFileId, fileName: a.fileName,
      isDriveUrl: typeof a.fileUrl === 'string' && a.fileUrl.includes('drive.google.com'),
    }));
  } catch (err) { out.attachmentsError = err?.message || String(err); }
  return Response.json(out);
}
