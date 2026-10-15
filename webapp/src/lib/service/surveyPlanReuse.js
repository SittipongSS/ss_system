// ── ปุ่ม "ใช้รูปนี้เป็นภาพแบบของพื้นที่นี้" ฝั่งเบราว์เซอร์ (ประเมินจากแบบ · งวด S2b §2.4 · มติเจ้าของ §10 ข้อ 6) ──────
//
// ⭐ **สองจังหวะ ลำดับนี้เปลี่ยนไม่ได้** (รูปเดียวกับ `uploadAttachment`):
//   ① `POST /api/service/surveys/<id>/zones/<zoneId>/plan-from-sales` — server คัดลอกไบต์ของไฟล์ฝ่ายขายเป็น **ไฟล์ใหม่** ในโฟลเดอร์
//      ของพื้นที่ แล้วออกใบรับการอัปให้คนกด · เส้นนั้นไม่เขียนแถวไฟล์แนบ
//   ② แนบไฟล์ใหม่ผ่านเส้นไฟล์แนบเส้นเดียวของระบบ (`attachUploadedFile`) เป็นภาพแบบของพื้นที่ — ด่านของเส้นนั้นเดินครบทุกข้อ
//      (เฉพาะหัวหน้าบนพื้นที่จากแบบ · ใบยังไม่ล็อก · ใบรับ · ไม่มีแถวอื่นถือ)
//   ② ล้ม = `attachUploadedFile` ถอยไฟล์ที่เพิ่งคัดลอกให้เอง (`DELETE /api/upload`)
// 🔴 **ทำไมไม่แนบไฟล์ของฝ่ายขายตรง ๆ** — เส้นไฟล์แนบไม่ยอมให้ไฟล์ Drive ใบเดียวมีสองแถว (ลบแถวหนึ่ง = ไฟล์ของอีกแถวหาย)
//    ⇒ ภาพแบบของพื้นที่ต้องเป็นไฟล์ของตัวเอง ลบได้โดยไม่กระทบไฟล์ที่ฝ่ายขายแนบมา
// ⚠️ ไม่ toast เอง — คืน `{ ok, error, attachment }` ให้จอเลือกวิธีแจ้ง · ไม่โยน (ต่อไม่ติดก็คืนข้อความไทย)
// ⚠️ ไฟล์ฝั่งเบราว์เซอร์: ห้ามดึงโมดูลของ server (Drive · ใบรับ · `surveyPlanCopy.js`) เข้ามา
import { apiJson } from '@/lib/apiFetch';
import { attachUploadedFile } from '@/lib/master/attachmentUpload';
import { SURVEY_DOC_PLAN } from './survey';

const COPY_FAILED = 'คัดลอกไฟล์ไม่สำเร็จ — ลองอีกครั้ง';
const ZONE_ENTITY = 'service_survey_zone';
const idText = (v) => String(v ?? '').trim();

/**
 * @param requestId id ของใบประเมิน · @param zoneId id ของแถวพื้นที่ (ต้องเป็นพื้นที่จากแบบ — server ตัดสิน)
 * @param ref `ref` ของไฟล์จาก `surveySalesDrawingsView` — `{ kind: 'request', attachmentId }` หรือ `{ kind: 'thread', updateId, index }`
 * @returns `{ ok, error, attachment }` — `attachment` = แถวภาพแบบที่เพิ่งสร้าง (อ่านไม่ออก = `null` แต่ `ok` ยังจริง)
 */
export async function reuseSalesFileAsPlan({ requestId, zoneId, ref } = {}) {
  const request = idText(requestId);
  const zone = idText(zoneId);
  if (!request || !zone || !ref || typeof ref !== 'object') return { ok: false, error: 'ไฟล์ที่เลือกไม่ถูกต้อง', attachment: null };

  let copy;
  try {
    copy = await apiJson(
      `/api/service/surveys/${encodeURIComponent(request)}/zones/${encodeURIComponent(zone)}/plan-from-sales`,
      { method: 'POST', json: { source: ref }, fallbackError: COPY_FAILED },
    );
  } catch (err) {
    return { ok: false, error: err?.message || COPY_FAILED, attachment: null };
  }
  if (!copy?.driveFileId || !copy?.url) return { ok: false, error: COPY_FAILED, attachment: null };

  try {
    const attached = await attachUploadedFile({
      entityType: ZONE_ENTITY,
      entityId: zone,
      docType: SURVEY_DOC_PLAN,
      url: copy.url,
      driveFileId: copy.driveFileId,
      fileName: copy.fileName,
      mimeType: copy.mimeType,
      sizeBytes: copy.sizeBytes,
    });
    return { ok: attached.ok, error: attached.error, attachment: attached.attachment ?? null };
  } catch (err) {
    return { ok: false, error: err?.message || 'บันทึกเอกสารไม่สำเร็จ', attachment: null };
  }
}
