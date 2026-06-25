// Debug: เช็ก Google Drive (WIF) + สถานะ attachments rows + ทดสอบ stream/delete จริง.
//   GET /api/debug/drive                 → env + เชื่อม Shared Drive + 5 แถวล่าสุด (ดู driveFileId)
//   GET /api/debug/drive?stream=<id>     → ทดสอบดึงไฟล์จาก Drive (คืน error จริงถ้าพัง)
//   GET /api/debug/drive?delete=<id>     → ทดสอบลบไฟล์บน Drive (คืน error จริง ไม่กลืน)
// ต้องล็อกอิน. ลบทิ้งหลังแก้เสร็จ.
import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const streamId = searchParams.get('stream');
  const deleteId = searchParams.get('delete');

  const env = {
    STORAGE_BACKEND: process.env.STORAGE_BACKEND || '(unset)',
    GOOGLE_SHARED_DRIVE_ID: process.env.GOOGLE_SHARED_DRIVE_ID || '(unset)',
  };

  let drive;
  try {
    const mod = await import('@/lib/drive');
    drive = mod.getDrive();
  } catch (err) {
    return Response.json({ ok: false, env, stage: 'getDrive', error: err?.message || String(err) });
  }

  // ทดสอบดึงไฟล์ (stream) จาก Drive — คืน error จริงถ้าพัง.
  if (streamId) {
    try {
      const res = await drive.files.get(
        { fileId: streamId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      const bytes = res.data?.byteLength ?? (res.data?.length || 0);
      return Response.json({ ok: true, action: 'stream', fileId: streamId, bytes });
    } catch (err) {
      return Response.json({ ok: false, action: 'stream', fileId: streamId, error: err?.message || String(err), details: err?.response?.data || err?.errors || null });
    }
  }

  // ทดสอบลบไฟล์บน Drive — คืน error จริง (ไม่ best-effort กลืนเหมือนใน production path).
  if (deleteId) {
    try {
      await drive.files.delete({ fileId: deleteId, supportsAllDrives: true });
      return Response.json({ ok: true, action: 'delete', fileId: deleteId });
    } catch (err) {
      return Response.json({ ok: false, action: 'delete', fileId: deleteId, error: err?.message || String(err), details: err?.response?.data || err?.errors || null });
    }
  }

  // default: เชื่อม Shared Drive + แถว attachments ล่าสุด (ดูว่า driveFileId ถูกบันทึกไหม).
  const out = { ok: true, env };
  try {
    const res = await drive.drives.get({ driveId: process.env.GOOGLE_SHARED_DRIVE_ID });
    out.sharedDrive = { id: res.data.id, name: res.data.name };
  } catch (err) {
    out.ok = false;
    out.sharedDriveError = err?.message || String(err);
  }
  try {
    const { data } = await getSupabaseAdmin()
      .from('attachments')
      .select('id, entityType, entityId, driveFileId, fileName, fileUrl, createdAt')
      .order('createdAt', { ascending: false })
      .limit(5);
    out.recentAttachments = (data || []).map((a) => ({
      id: a.id,
      entityType: a.entityType,
      driveFileId: a.driveFileId, // null = ไม่ได้บันทึก (ปัญหาอยู่ตรงนี้)
      fileName: a.fileName,
      isDriveUrl: typeof a.fileUrl === 'string' && a.fileUrl.includes('drive.google.com'),
      createdAt: a.createdAt,
    }));
  } catch (err) {
    out.attachmentsError = err?.message || String(err);
  }
  return Response.json(out);
}
