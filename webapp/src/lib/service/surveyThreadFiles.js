// ── ไฟล์ที่แนบในเธรดของคำร้อง บนจอใบประเมิน — อ่านอย่างเดียว (ประเมินจากแบบ · งวด S2a) ─────────
//
// ⭐ ฝ่ายขายส่งแบบแปลนมาได้สองทาง: แนบกับคำร้อง (`loadSurveyRequestFiles`) หรือ **โพสต์ในเธรดของใบ**
//   (ส่งตามมาทีหลัง) — หัวหน้าที่ประเมินจากแบบต้องเห็นทั้งสองทางบนจอใบประเมิน ไม่ต้องสลับไปหน้าคำร้อง
// 🔑 **ลิสต์ = เปิดได้** — ถามด่านอ่านเธรดตัวเดียวกับ proxy `/api/updates/[id]/file` (`canViewUpdates`) ก่อนอ่าน
//   ⇒ ไม่มีวันลิสต์ไฟล์ที่กดแล้ว 403 · ไม่ผ่านด่าน = ลิสต์ว่างและ **ไม่ยิงอ่านเลย**
// ⚠️ อ่านพัง = `unknown` (ผู้เรียกตอบ `unknown.threadFiles`) ไม่ใช่ 500 — ผลวัดเป็นเนื้อหลักของจอ
//   (สัญญาเดียวกับ `loadSurveyRequestFiles`)
// 🔴 **ไม่ส่งที่อยู่ไฟล์ออกไป** — ไม่มี `fileUrl` ไม่มี `driveFileId` ในผลลัพธ์ · จอเปิดไฟล์ด้วย
//   `updateId` + `index` ผ่าน proxy เท่านั้น (ด่านอ่านถูกถามซ้ำทุกครั้งที่เปิด)
import { canViewUpdates } from '@/lib/master/updateAccess';

const THREAD_ENTITY = 'dept_request';

/**
 * แถวไฟล์ของเธรดที่ส่งให้จอ — หนึ่งรายการต่อหนึ่งไฟล์แนบ เรียงตามที่ได้แถวมา
 *   `index` = ตำแหน่งในลิสต์ `attachments` **ของข้อความนั้นเอง** (ค่า `?i=` ของ proxy) — รายการที่ถูกข้ามไม่ทำให้เลขเลื่อน
 * ⚠️ ข้อความที่ลบแล้ว = ไฟล์ของมันเปิดไม่ได้แล้ว (proxy ตอบ 404) ⇒ ไม่ลิสต์
 * ⚠️ รายการที่ไม่มี `fileUrl` = proxy ตอบ "ไม่พบไฟล์แนบ" ⇒ ไม่ลิสต์เช่นกัน
 */
export function surveyThreadFileRows(updates) {
  const out = [];
  for (const row of Array.isArray(updates) ? updates : []) {
    if (!row || row.deletedAt) continue;
    const list = Array.isArray(row.attachments) ? row.attachments : [];
    list.forEach((file, index) => {
      if (!file || typeof file.fileUrl !== 'string' || !file.fileUrl.trim()) return;
      out.push({
        updateId: row.id ?? null,
        index,
        fileName: file.fileName ?? null,
        mimeType: file.mimeType ?? null,
        sizeBytes: file.sizeBytes ?? null,
        createdAt: row.createdAt ?? null,
        authorName: row.authorName ?? null,
      });
    });
  }
  return out;
}

/**
 * ไฟล์ที่แนบในเธรดของคำร้อง — `{ files: [{ updateId, index, fileName, mimeType, sizeBytes, createdAt, authorName }], unknown }`
 * @param request แถว `dept_requests` ของใบ (ผู้เรียกผ่านด่านอ่านของใบประเมินมาแล้ว)
 */
export async function loadSurveyThreadFiles(supabase, request, user) {
  if (!request?.id) return { files: [], unknown: false };
  if (!(await canViewUpdates(supabase, THREAD_ENTITY, request, user))) return { files: [], unknown: false };
  try {
    /* เก่าไปใหม่ · `id` ปิดท้ายให้ลำดับนิ่งเมื่อเวลาเท่ากัน
       ⚠️ supabase ไม่ throw — อ่าน `{ error }` เอง: ปล่อยผ่าน = ลิสต์ว่างที่จออ่านว่า "ไม่มีไฟล์ในเธรด" */
    const { data, error } = await supabase
      .from('entity_updates')
      .select('id, attachments, "createdAt", "authorName", "deletedAt"')
      .eq('entityType', THREAD_ENTITY).eq('entityId', request.id)
      .order('createdAt', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw new Error(error.message);
    return { files: surveyThreadFileRows(data), unknown: false };
  } catch (e) {
    console.error('[survey] อ่านไฟล์ในเธรดของคำร้องไม่สำเร็จ', request.id, e?.message || e);
    return { files: [], unknown: true };
  }
}
