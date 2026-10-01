// ── ไฟล์แนบของคำร้อง บนจอใบประเมิน — อ่านอย่างเดียว (PR-S · แผน operation-crew §11c Q6) ─────────
//
// ⭐ ช่างเห็นไฟล์ที่ SA แนบมากับคำร้อง (ผังอาคาร · รูปหน้าร้าน) บนจอใบประเมินเลย — ไม่มีลิงก์ไปหน้าคำร้อง
//   (ช่างเปิดหน้านั้นไม่ได้) · เปิดไฟล์ผ่าน proxy เดิม (`attachmentHref`)
// 🔑 **ลิสต์ = เปิดได้** — ถามด่านอ่านตัวเดียวกับ proxy `/api/master/attachments/[id]/file`
//   (`canViewCostingAttachment` · ช่องของใบประเมินพื้นที่อยู่ในตัวนั้น) ก่อนอ่าน ⇒ ไม่มีวันลิสต์ไฟล์ที่กดแล้ว 403
// ⚠️ อ่านพัง = `unknown` (ผู้เรียกตอบ `unknown.requestFiles`) ไม่ใช่ 500 — ผลวัดเป็นเนื้อหลักของจอ
// ⚠️ ไม่ส่ง `metadata` ดิบ — แถวเอกสาร Google ถือรายชื่ออีเมลที่เคยได้สิทธิ์ Drive (`accessGranted`) และ id ของ Google
//   ⇒ ส่งเฉพาะช่องที่รายการอ่านอย่างเดียวต้องใช้ (+ `kind` ไว้บอกว่าเป็นเอกสาร Google)
import { listAttachments } from '@/lib/master/attachments';
import { canViewCostingAttachment } from '@/lib/master/costingAttachmentAccess';

/** แถวไฟล์ของคำร้องที่ส่งให้จอ — ช่องที่รายการอ่านอย่างเดียวใช้เท่านั้น */
export function surveyRequestFileRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row?.id ?? null,
    docType: row?.docType ?? null,
    fileName: row?.fileName ?? null,
    mimeType: row?.mimeType ?? null,
    sizeBytes: row?.sizeBytes ?? null,
    driveFileId: row?.driveFileId ?? null,
    fileUrl: row?.fileUrl ?? null,
    createdAt: row?.createdAt ?? null,
    uploadedByName: row?.uploadedByName ?? null,
    kind: row?.metadata?.kind ?? null,
  }));
}

/**
 * @param request แถว `dept_requests` ของใบ (ผู้เรียกผ่านด่านอ่านของใบประเมินมาแล้ว)
 * @param list    ตัวอ่านไฟล์ (เทสต์ใส่ของปลอม)
 * @returns `{ files, unknown }`
 */
export async function loadSurveyRequestFiles(supabase, request, user, { list = listAttachments } = {}) {
  if (!request?.id) return { files: [], unknown: false };
  if (!(await canViewCostingAttachment(supabase, 'dept_request', request, user))) return { files: [], unknown: false };
  try {
    return { files: surveyRequestFileRows(await list('dept_request', request.id, supabase)), unknown: false };
  } catch (e) {
    console.error('[survey] อ่านไฟล์แนบของคำร้องไม่สำเร็จ', request.id, e?.message || e);
    return { files: [], unknown: true };
  }
}
