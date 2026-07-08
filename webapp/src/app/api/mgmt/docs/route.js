import { canUser } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, badRequest, notFound } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { appendUpdate } from '@/lib/mgmt/repo';

// googleapis (Drive) ต้อง Node runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MGMT_TABLE = { mgmt_task: 'mgmt_tasks', mgmt_meeting: 'mgmt_meetings' };
const FEED_ENTITY = { mgmt_task: 'task', mgmt_meeting: 'meeting' };

// POST /api/mgmt/docs — ผูก (mode:'link', url) หรือ สร้าง (mode:'create', type:'gdoc'|'gsheet', name)
// Google Doc/Sheet แล้วบันทึกเป็น attachment (metadata.kind). เปิดผ่าน webViewLink ตรง.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!canUser(user, 'mgmt:edit')) return forbidden();

  if ((process.env.STORAGE_BACKEND || 'supabase') !== 'drive') {
    return fail('ต้องตั้งค่า Google Drive (STORAGE_BACKEND=drive) ก่อนจึงจะผูก/สร้างเอกสาร Google ได้', 400);
  }

  const body = await req.json().catch(() => ({}));
  const { entityType, entityId, mode } = body;
  const table = MGMT_TABLE[entityType];
  if (!table || !entityId) return badRequest('entityType/entityId ไม่ถูกต้อง');

  const { data: parent } = await supabase.from(table).select('id').eq('id', entityId).maybeSingle();
  if (!parent) return notFound('ไม่พบระเบียนที่จะแนบเอกสาร');

  let file; // { id, name, mimeType, webViewLink }
  try {
    const drive = await import('@/lib/drive');
    if (mode === 'link') {
      const fileId = drive.parseDriveId(body.url);
      if (!fileId) return badRequest('ลิงก์ Google Drive ไม่ถูกต้อง');
      file = await drive.getFileMeta(fileId);
    } else if (mode === 'create') {
      if (!drive.GOOGLE_NATIVE_MIME[body.type]) return badRequest('ชนิดเอกสารไม่รองรับ (gdoc/gsheet)');
      const name = (body.name || '').trim() || (body.type === 'gsheet' ? 'ตารางงานใหม่' : 'เอกสารใหม่');
      const folderId = await drive.resolveFolderForEntity(entityType, entityId);
      file = await drive.createGoogleFile(folderId, name, body.type);
    } else {
      return badRequest('mode ไม่ถูกต้อง (link/create)');
    }

    // best-effort: ให้สิทธิ์ writer แก่อีเมล Workspace ของผู้ใช้ (นอกเหนือสมาชิก Shared Drive).
    if (user?.id) {
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
        const email = authUser?.user?.email;
        if (email) await drive.grantWriter(file.id, email);
      } catch { /* ignore */ }
    }

    const kind = drive.kindFromMime(file.mimeType) || 'link';
    const row = {
      entityType,
      entityId,
      docType: 'other',
      fileUrl: file.webViewLink,
      driveFileId: null, // เอกสาร native เปิดผ่าน webViewLink ตรง ไม่ผ่าน proxy stream
      fileName: file.name || null,
      mimeType: file.mimeType || null,
      uploadedBy: user?.id ?? null,
      uploadedByName: user?.name ?? null,
      metadata: { kind, googleFileId: file.id },
    };
    const { data, error } = await supabase.from('attachments').insert(row).select().single();
    if (error) return fail(error.message, 500);

    await recordAudit({ user, action: 'create', entityType: `${entityType}_doc`, entityId: data.id, after: data, request: req });
    await appendUpdate(supabase, {
      entityType: FEED_ENTITY[entityType], entityId, kind: 'link',
      body: `${mode === 'create' ? 'สร้าง' : 'ผูก'}เอกสาร: ${file.name || file.webViewLink}`, user,
    });
    return ok(data, 201);
  } catch (err) {
    console.error('[mgmt/docs] failed', err?.message);
    return fail('ดำเนินการกับ Google Drive ไม่สำเร็จ', 500);
  }
});
