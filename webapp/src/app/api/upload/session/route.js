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
import { UPLOAD_STAGING_BUCKET, stagingObjectPath } from '@/lib/upload/staging';

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
// ปลายทางของ URL ที่คืนไปมีสองแบบ (client ดูที่ `kind`):
//   • `supabase`      — หลักฐาน Won/การชำระ ขึ้น bucket ส่วนตัวแล้วจบ
//   • `drive-staged`  — ไฟล์แนบทั่วไป ขึ้น staging bucket ก่อน แล้วเรียก
//                       `/api/upload/commit` ให้ server ย้ายเข้า Drive (Drive ไม่รับ
//                       PUT ตรงจากเบราว์เซอร์ — ไม่มี CORS ดูคอมเมนต์ท้าย handler)
//
// ⚠️ ขนาดที่ client ประกาศมาเชื่อไม่ได้ — ด่านจริงอยู่ที่ Storage (`file_size_limit`
// ของ bucket: mig 0262/0263 ตั้งเท่า MAX_UPLOAD_MB) และที่ commit ซึ่งวัดขนาดไบต์จริง
// ก่อนย้ายเข้า Drive ⇒ ไม่ต้องมีขั้น "confirm" ที่ฝั่งเราลบไฟล์ Drive ทีหลัง (ซึ่งจะ
// กลายเป็นปุ่มลบไฟล์ใบไหนก็ได้สำหรับใครที่รู้ fileId)
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

    // ── ไฟล์แนบทั่วไป (ปลายทาง Drive): พักที่ staging bucket ก่อน ───────────────
    // 🐞 รอบแรกให้เบราว์เซอร์ PUT ขึ้น **Drive resumable session URL** ตรง ๆ ซึ่ง
    // **ใช้ไม่ได้จริง**: googleapis.com ไม่ตอบ CORS ให้ขานั้น (prod 2026-08-17 —
    // session สร้างสำเร็จ แต่ PUT ตาย `TypeError: Failed to fetch` ทุกครั้ง)
    // Supabase Storage รับ PUT ตรงจากเบราว์เซอร์ได้ (ทดสอบ 6 MB ผ่าน 200) ⇒ ไบต์ขึ้น
    // staging ก่อน แล้ว `/api/upload/commit` ย้ายเข้า Drive (mig 0263)
    const storagePath = stagingObjectPath(user.id, fileName);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(UPLOAD_STAGING_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error) {
      console.error('[upload/session] createSignedUploadUrl (staging) failed:', error);
      return Response.json({ error: `ขอทางอัปไฟล์ไม่สำเร็จ — ${error.message}` }, { status: 502 });
    }
    return Response.json({
      kind: 'drive-staged',
      signedUrl: data.signedUrl,
      storageBucket: UPLOAD_STAGING_BUCKET,
      storagePath,
      contentType,
    });
  } catch (error) {
    console.error('[upload/session] error:', error);
    const detail = String(error?.message || '').slice(0, 200);
    return Response.json(
      { error: `เซิร์ฟเวอร์เตรียมทางอัปไฟล์ไม่ได้${detail ? ` — ${detail}` : ''}` },
      { status: 500 },
    );
  }
}
