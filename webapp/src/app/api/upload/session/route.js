import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { checkUploadCandidate, resolveUploadMime } from '@/lib/master/attachmentTypes';
import { MAX_BYTES } from '@/lib/upload/limits';
import {
  PRIVATE_EVIDENCE_BUCKET,
  isPrivateEvidence,
  checkPrivateEvidenceScope,
  privateEvidenceObjectPath,
} from '@/lib/upload/privateEvidence';

// googleapis (Drive backend) ต้อง Node runtime — กันถูก bundle เป็น edge.
export const runtime = 'nodejs';

// ── POST /api/upload/session — ขอ "ทางอัปตรง" ให้เบราว์เซอร์ ────────────────
//
// ทำไมต้องมี: Vercel ตัด request body ของ function ที่ 4.5 MB ⇒ ไฟล์แนบที่ใหญ่กว่านั้น
// ส่งผ่าน `/api/upload` ไม่ได้เลย (ตายที่ขอบ ไปไม่ถึงโค้ดเรา) · route นี้จึงทำแต่ส่วนที่
// ต้องมีสิทธิ์ — ตรวจคน ตรวจเอกสาร ตรวจขนาด/ชนิด เลือกโฟลเดอร์ ตั้งชื่อ — แล้วคืน URL
// ที่ **เขียนได้ไฟล์เดียว** ให้เบราว์เซอร์ยิงไบต์ขึ้น Drive/Storage เอง
//
// ไบต์ไม่ผ่าน function ⇒ ไม่มีเพดาน 4.5 MB · เพดานจริงเหลือชั้นเดียวคือ MAX_BYTES
//
// ⚠️ ขนาดที่ client ประกาศมาคือค่าที่ใช้ตรวจ — ปลายทางบังคับซ้ำให้อีกชั้น:
//   • Drive: session ผูก X-Upload-Content-Length ไว้ ไบต์จริงไม่ตรงกับที่ประกาศ = Drive ปฏิเสธ
//   • Storage: bucket ตั้ง file_size_limit ไว้ (mig 0262) Storage ปฏิเสธเอง
//   ⇒ ไม่มีขั้น "confirm" ที่ฝั่งเราลบไฟล์ทีหลัง (ซึ่งจะกลายเป็นปุ่มลบไฟล์ Drive ใบไหน
//     ก็ได้สำหรับใครที่รู้ fileId) — ปลายทางเป็นคนปฏิเสธตั้งแต่ตอนรับไบต์
export async function POST(request) {
  try {
    // ต้องล็อกอินก่อน (กัน upload สาธารณะ) — ด่านเดียวกับ `/api/upload`
    // สิทธิ์รายเอกสารตรวจต่อตอนบันทึก metadata ที่ `/api/master/attachments`
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

    let body = {};
    try { body = await request.json(); } catch { /* no body */ }
    const { entityType, entityId, fileName } = body;
    const sizeBytes = Number(body.sizeBytes);

    const verdict = checkUploadCandidate({
      fileName, mimeType: body.mimeType, sizeBytes, maxBytes: MAX_BYTES,
    });
    if (!verdict.ok) return Response.json({ error: verdict.error }, { status: verdict.status });

    // Content-Type ตัดสินฝั่ง server จากนามสกุล ไม่เชื่อค่าที่ client ประกาศมา
    const contentType = resolveUploadMime(fileName, body.mimeType);

    // ── หลักฐาน Won / หลักฐานการชำระ: bucket ส่วนตัว + signed upload URL ──────
    if (isPrivateEvidence(entityType)) {
      const scope = await checkPrivateEvidenceScope(user, entityType, entityId);
      if (!scope.ok) return Response.json({ error: scope.error }, { status: scope.status });

      const storagePath = privateEvidenceObjectPath(entityType, entityId, fileName);
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.storage
        .from(PRIVATE_EVIDENCE_BUCKET)
        .createSignedUploadUrl(storagePath);
      if (error) {
        console.error('[upload/session] createSignedUploadUrl failed:', error);
        return Response.json({ error: `ขอทางอัปหลักฐานไม่สำเร็จ — ${error.message}` }, { status: 502 });
      }
      return Response.json({
        kind: 'supabase',
        // signedUrl พก token มาในตัว ⇒ client PUT ตรงได้เลย (ไม่ต้องคืน token แยก)
        signedUrl: data.signedUrl,
        storageBucket: PRIVATE_EVIDENCE_BUCKET,
        storagePath,
        contentType,
      });
    }

    // ── ไฟล์แนบทั่วไป: Google Drive (ที่เก็บเดียวของระบบ) ────────────────────
    // dynamic import: โหลด googleapis เฉพาะตอนอัปจริง ไม่ถ่วง route อื่น
    try {
      const { createResumableUpload } = await import('@/lib/drive');
      const { uploadUrl } = await createResumableUpload({
        entityType, entityId, name: fileName, mimeType: contentType, sizeBytes,
      });
      return Response.json({ kind: 'drive', uploadUrl, contentType });
    } catch (err) {
      console.error('[upload/session] Google Drive session failed:', err);
      // ส่งสาเหตุจริงกลับไป — "ขอทางอัปไม่สำเร็จ" ลอย ๆ ทำให้ตามต่อไม่ได้ว่าติด env,
      // ติดสิทธิ์ Shared Drive หรือโฟลเดอร์หาย (ตรวจได้ที่ ตั้งค่า → ที่เก็บไฟล์)
      const detail = String(err?.errors?.[0]?.message || err?.message || '').slice(0, 200);
      return Response.json(
        { error: `ขอทางอัปขึ้น Google Drive ไม่สำเร็จ${detail ? ` — ${detail}` : ''}` },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('[upload/session] error:', error);
    const detail = String(error?.message || '').slice(0, 200);
    return Response.json(
      { error: `เซิร์ฟเวอร์เตรียมทางอัปไฟล์ไม่ได้${detail ? ` — ${detail}` : ''}` },
      { status: 500 },
    );
  }
}
