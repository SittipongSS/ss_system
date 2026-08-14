import { canUser } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, badRequest, notFound } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { appendUpdate } from '@/lib/mgmt/repo';
import { GoogleDocError, buildGoogleAttachment, googleDocsEnvError, workspaceEmail } from '@/lib/master/googleDocs';

// googleapis (Drive) ต้อง Node runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MGMT_TABLE = { mgmt_task: 'mgmt_tasks', mgmt_meeting: 'mgmt_meetings' };
const FEED_ENTITY = { mgmt_task: 'task', mgmt_meeting: 'meeting' };

// POST /api/mgmt/docs — ผูก (mode:'link', url) หรือ สร้าง (mode:'create', type:'gdoc'|'gsheet', name)
// Google Doc/Sheet แล้วบันทึกเป็น attachment (metadata.kind). เปิดผ่าน webViewLink ตรง.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!canUser(user, 'mgmt:edit')) return forbidden();

  // 🐞 เดิมเช็ค STORAGE_BACKEND ที่ prod ตั้งไว้แต่ที่อื่นไม่ตั้ง → ปุ่มสร้าง/ผูกเอกสาร
  // Google ตอบ 400 ทั้งที่ Drive ใช้งานได้ · ตอนนี้ไฟล์แนบอยู่บน Drive ที่เดียวเสมอ
  // ด่านที่เหลือคือ "ตั้งค่า env ครบไหม" ซึ่งเป็นเรื่องของการ deploy ไม่ใช่ของ backend
  const envError = googleDocsEnvError();
  if (envError) return fail(envError, 400);

  const body = await req.json().catch(() => ({}));
  const { entityType, entityId, mode } = body;
  const table = MGMT_TABLE[entityType];
  if (!table || !entityId) return badRequest('entityType/entityId ไม่ถูกต้อง');

  const { data: parent, error: parentError } = await supabase.from(table).select('id').eq('id', entityId).maybeSingle();
  if (parentError) return fail(parentError.message, 500);
  if (!parent) return notFound('ไม่พบระเบียนที่จะแนบเอกสาร');

  // ⚠️ ตรรกะการคุยกับ Drive อยู่ที่ `lib/master/googleDocs` ที่เดียว — route นี้กับ
  // `/api/attachments` เรียกตัวเดียวกัน ต่างกันแค่ route นี้เขียนเธรดอัปเดตของ
  // โมดูลงานบริหารต่อท้ายให้ด้วย
  let file;
  try {
    file = await buildGoogleAttachment({
      entityType,
      entityId,
      mode,
      type: body.type,
      url: body.url,
      name: body.name,
      grantEmail: await workspaceEmail(supabase, user?.id),
    });
  } catch (err) {
    if (err instanceof GoogleDocError) return fail(err.message, err.status);
    throw err;
  }

  const row = {
    entityType,
    entityId,
    docType: 'other',
    ...file,
    uploadedBy: user?.id ?? null,
    uploadedByName: user?.name ?? null,
  };
  const { data, error } = await supabase.from('attachments').insert(row).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({ user, action: 'create', entityType: `${entityType}_doc`, entityId: data.id, after: data, request: req });
  await appendUpdate(supabase, {
    entityType: FEED_ENTITY[entityType], entityId, kind: 'link',
    body: `${mode === 'create' ? 'สร้าง' : 'ผูก'}เอกสาร: ${file.fileName || file.fileUrl}`, user,
  });
  return ok(data, 201);
});
