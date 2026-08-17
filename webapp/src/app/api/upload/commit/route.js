import { getCurrentUser } from '@/lib/authUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { checkUploadCandidate, resolveUploadMime } from '@/lib/master/attachmentTypes';
import { MAX_BYTES, MAX_MB } from '@/lib/upload/limits';
import { UPLOAD_STAGING_BUCKET, isOwnStagingPath } from '@/lib/upload/staging';

// googleapis (Drive backend) ต้อง Node runtime — กันถูก bundle เป็น edge.
export const runtime = 'nodejs';
// ไฟล์ 25 MB ต้องดาวน์โหลดจาก Storage แล้วอัปเข้า Drive ในคำขอเดียว — เผื่อเวลาให้พอ
// (ค่าตั้งต้นของ Vercel พอสำหรับไฟล์เล็ก แต่เน็ตช้า/ไฟล์ใหญ่กินเวลาเกินได้)
export const maxDuration = 120;

// ── POST /api/upload/commit — ย้ายไฟล์จาก staging เข้า Drive ────────────────
//
// ขาที่สองของการอัป: เบราว์เซอร์เอาไบต์ขึ้น staging bucket แล้ว (ดู /api/upload/session)
// route นี้ดาวน์โหลดจาก Storage แล้วอัปเข้าโฟลเดอร์จริงบน Drive
//
// ทำไมไม่ให้เบราว์เซอร์ยิงเข้า Drive ตรง: googleapis.com ไม่ตอบ CORS ให้ resumable
// session URL (พิสูจน์บน prod 2026-08-17 — session สร้างได้ แต่ PUT ตายที่ `Failed to
// fetch` ทุกครั้ง) · ขานี้เป็น fetch **ออก** จาก function ไม่ใช่ request body จึงไม่ติด
// เพดาน 4.5 MB ของ Vercel
//
// ⚠️ นี่คือจุดเดียวที่วัด **ขนาดไบต์จริง** ได้ก่อนไฟล์เข้า Drive — ค่าที่ client ประกาศ
// ตอนขอ session เชื่อไม่ได้ · เกินเพดาน = ลบทิ้งจาก staging แล้วตอบ 413
export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

    let body = {};
    try { body = await request.json(); } catch { /* no body */ }
    const { entityType, entityId, storagePath, fileName } = body;

    // ย้ายได้เฉพาะไฟล์ที่ **คนเรียกอัปไว้เอง** (path มี id ผู้อัปอยู่ในตัว) — ไม่งั้น
    // ใครก็ยิง path ของคนอื่นเข้าเอกสารของตัวเองได้
    if (!isOwnStagingPath(user.id, storagePath)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    const supabase = getSupabaseAdmin();
    const slash = storagePath.lastIndexOf('/');
    const dir = storagePath.slice(0, slash);
    const base = storagePath.slice(slash + 1);
    const { data: listed, error: listError } = await supabase.storage
      .from(UPLOAD_STAGING_BUCKET)
      .list(dir, { search: base, limit: 1 });
    if (listError) {
      console.error('[upload/commit] list staging failed:', listError);
      return Response.json({ error: `อ่านไฟล์ที่พักไว้ไม่ได้ — ${listError.message}` }, { status: 502 });
    }
    const object = (listed || []).find((o) => o.name === base);
    if (!object) {
      return Response.json({ error: 'ไม่พบไฟล์ที่อัปไว้ (อาจถูกลบหรือหมดอายุ) — ลองแนบอีกครั้ง' }, { status: 404 });
    }

    const sizeBytes = Number(object.metadata?.size);
    const name = fileName || base;
    const verdict = checkUploadCandidate({
      fileName: name, mimeType: object.metadata?.mimetype, sizeBytes, maxBytes: MAX_BYTES,
    });
    if (!verdict.ok) {
      // ไฟล์ที่รับไม่ได้ไม่ต้องค้างกินที่ — ลบทิ้งเลย (best-effort)
      await supabase.storage.from(UPLOAD_STAGING_BUCKET).remove([storagePath]);
      return Response.json({ error: verdict.error }, { status: verdict.status });
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from(UPLOAD_STAGING_BUCKET)
      .download(storagePath);
    if (downloadError || !blob) {
      console.error('[upload/commit] download staging failed:', downloadError);
      return Response.json(
        { error: `อ่านไฟล์ที่พักไว้ไม่ได้ — ${downloadError?.message || 'ไม่มีข้อมูล'}` },
        { status: 502 },
      );
    }
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      // ขนาดใน metadata กับไบต์จริงไม่ตรงกัน = ไม่เชื่อ metadata
      await supabase.storage.from(UPLOAD_STAGING_BUCKET).remove([storagePath]);
      return Response.json({ error: `ไฟล์ใหญ่เกินกำหนด (สูงสุด ${MAX_MB} MB)` }, { status: 413 });
    }

    // Content-Type ตัดสินฝั่ง server จากนามสกุล ไม่เชื่อค่าที่ client ประกาศมา
    const contentType = resolveUploadMime(name, object.metadata?.mimetype);

    // dynamic import: โหลด googleapis เฉพาะตอนอัปจริง ไม่ถ่วง route อื่น
    let uploaded;
    try {
      const { uploadForEntity } = await import('@/lib/drive');
      uploaded = await uploadForEntity({
        entityType, entityId, buffer, name, mimeType: contentType,
      });
    } catch (err) {
      console.error('[upload/commit] Google Drive upload failed:', err);
      // ⚠️ **ไม่ลบไฟล์ใน staging** เมื่อขาขึ้น Drive ล้ม — ไบต์ยังอยู่ ผู้ใช้กดแนบซ้ำได้
      // โดยไม่ต้องอัปใหม่ทั้งก้อน (ของค้างใน staging ลบทิ้งเมื่อไรก็ได้ ไม่มีแถวไหนอ้างถึง)
      const detail = String(err?.errors?.[0]?.message || err?.message || '').slice(0, 200);
      return Response.json(
        { error: `อัปโหลดขึ้น Google Drive ไม่สำเร็จ${detail ? ` — ${detail}` : ''}` },
        { status: 502 },
      );
    }

    // ไฟล์อยู่ Drive แล้ว — ที่พักไม่ต้องเก็บอีก (best-effort: ถ้าลบไม่ได้ก็ไม่ล้มทั้งงาน
    // เพราะไฟล์ปลายทางสำเร็จแล้ว ของค้างเป็นแค่ขยะที่ลบภายหลังได้)
    const { error: removeError } = await supabase.storage
      .from(UPLOAD_STAGING_BUCKET).remove([storagePath]);
    if (removeError) console.error('[upload/commit] ลบไฟล์ที่พักไม่สำเร็จ', storagePath, removeError.message);

    return Response.json({
      url: uploaded.webViewLink,
      driveFileId: uploaded.id,
      mimeType: contentType,
    });
  } catch (error) {
    console.error('[upload/commit] error:', error);
    const detail = String(error?.message || '').slice(0, 200);
    return Response.json(
      { error: `ย้ายไฟล์เข้าที่เก็บไม่สำเร็จ${detail ? ` — ${detail}` : ''}` },
      { status: 500 },
    );
  }
}
