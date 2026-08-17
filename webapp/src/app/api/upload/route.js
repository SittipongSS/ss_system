import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { checkUploadCandidate, resolveUploadMime } from '@/lib/master/attachmentTypes';
import { MAX_BYTES } from '@/lib/upload/limits';
import {
  PRIVATE_EVIDENCE_BUCKET,
  isPrivateEvidence,
  checkPrivateEvidenceScope,
  privateEvidenceObjectPath,
  privateEvidencePrefix,
} from '@/lib/upload/privateEvidence';

// googleapis (Drive backend) ต้อง Node runtime — กันถูก bundle เป็น edge.
export const runtime = 'nodejs';

// ── POST /api/upload — **เส้นสำรอง** ของไฟล์เล็กเท่านั้น ─────────────────────
// ทางหลักคือ `/api/upload/session` (เบราว์เซอร์ยิงไบต์ขึ้นที่เก็บตรง ๆ) เพราะไบต์ที่
// วิ่งผ่าน function ตายที่เพดาน request body ของ Vercel (4.5 MB) — คำขอไปไม่ถึงโค้ดนี้
// เลยและผู้ใช้ได้ error ของ Vercel ไม่ใช่ของแอป
// เส้นนี้เหลือไว้ให้ client ถอยมาใช้เมื่ออัปตรงไม่สำเร็จ (CORS/พร็อกซีองค์กร) และ
// ไฟล์เล็กพอจะรอด — ดู LEGACY_UPLOAD_MAX_BYTES ใน attachmentTypes.js
export async function POST(request) {
  try {
    // ต้องล็อกอินก่อนจึงอัปไฟล์ได้ (กัน upload สาธารณะ). สิทธิ์รายเอกสาร
    // ตรวจต่อตอนบันทึก metadata ที่ /api/master/attachments (canEditRecord).
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file');
    // entity context — ใช้ resolve โฟลเดอร์ปลายทางบน Drive
    const entityType = formData.get('entityType');
    const entityId = formData.get('entityId');

    if (!file) {
      return Response.json({ error: 'ไม่พบไฟล์ที่ส่งมา' }, { status: 400 });
    }

    // ด่านขนาด/ชนิดชุดเดียวกับทางอัปตรง (attachmentTypes.checkUploadCandidate) —
    // เงื่อนไขต้องไม่แตกกันสองที่ ไม่งั้นไฟล์ที่ทางหนึ่งรับอีกทางปฏิเสธโดยไม่มีเหตุผล
    const verdict = checkUploadCandidate({
      fileName: file.name, mimeType: file.type, sizeBytes: file.size, maxBytes: MAX_BYTES,
    });
    if (!verdict.ok) return Response.json({ error: verdict.error }, { status: verdict.status });

    // Content-Type ตัดสินฝั่ง server จากนามสกุล ไม่เชื่อค่าที่ client ประกาศมา
    const contentType = resolveUploadMime(file.name, file.type);
    const buffer = Buffer.from(await file.arrayBuffer());

    // ── หลักฐาน Won / หลักฐานการชำระ: bucket ส่วนตัว ไม่ขึ้น Drive ─────────
    // ด่านสิทธิ์ + รูปแบบ path อยู่ที่ lib/upload/privateEvidence (ที่เดียวกับทางอัปตรง)
    // ref ที่คืนไปไม่มี public URL — ดาวน์โหลดผ่าน proxy ที่ตรวจสิทธิ์รายใบ
    if (isPrivateEvidence(entityType)) {
      const scope = await checkPrivateEvidenceScope(user, entityType, entityId);
      if (!scope.ok) return Response.json({ error: scope.error }, { status: scope.status });

      const objectPath = privateEvidenceObjectPath(entityType, entityId, file.name);
      const supabase = getSupabaseAdmin();
      const { error: uploadError } = await supabase.storage
        .from(PRIVATE_EVIDENCE_BUCKET)
        .upload(objectPath, buffer, {
          // contentType จาก server เช่นกัน — bucket นี้ private แต่กติกาเดียวกันทั้งระบบ
          contentType,
          upsert: false,
        });
      if (uploadError) {
        console.error('[upload] private evidence failed:', entityType, uploadError);
        return Response.json({ error: `อัปโหลดหลักฐานไม่สำเร็จ — ${uploadError.message}` }, { status: 500 });
      }
      return Response.json({
        url: null,
        storageBucket: PRIVATE_EVIDENCE_BUCKET,
        storagePath: objectPath,
      });
    }

    // ── Google Drive — ที่เก็บเดียวของไฟล์แนบ ─────────────────────────
    // (ทาง Supabase Storage ถูกตัดออก 2026-07-30: prod อยู่บน Drive 100% อยู่แล้ว
    //  128/128 แถว และโค้ดสองทางคือแหล่งของบั๊กเกือบทุกข้อในสายอัปโหลด)
    // dynamic import: โหลด googleapis เฉพาะตอนอัปจริง ไม่ถ่วง route อื่น
    try {
      const { uploadForEntity } = await import('@/lib/drive');
      const { id, webViewLink } = await uploadForEntity({
        entityType,
        entityId,
        buffer,
        name: file.name || 'file',
        mimeType: contentType,
      });
      // คืน driveFileId เพิ่ม — caller ส่งต่อให้ /api/master/attachments เก็บไว้.
      return Response.json({ url: webViewLink, driveFileId: id, mimeType: contentType });
    } catch (err) {
      console.error('[upload] Google Drive upload failed:', err);
      // ส่งสาเหตุจริงกลับไปให้ผู้ใช้เห็น — "อัปโหลดไม่สำเร็จ" เฉย ๆ ทำให้ทั้งผู้ใช้และ
      // คนดูแลระบบตามต่อไม่ได้เลย (ตรวจการเชื่อมต่อได้ที่ ตั้งค่า → ที่เก็บไฟล์)
      const detail = String(err?.errors?.[0]?.message || err?.message || '').slice(0, 200);
      return Response.json(
        { error: `อัปโหลดขึ้น Google Drive ไม่สำเร็จ${detail ? ` — ${detail}` : ''}` },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('Upload error:', error);
    // ⚠️ ข้อความนี้ต้อง **ไม่ซ้ำ** กับค่าสำรองฝั่ง client ("อัปโหลดไฟล์ไม่สำเร็จ")
    // เดิมซ้ำกันเป๊ะ ⇒ เห็นข้อความแล้วแยกไม่ออกว่า handler ตกที่ catch นี้ หรือคำขอ
    // ไปไม่ถึง handler เลย (ถูกตัดที่ชั้นหน้าแอป) ซึ่งเป็นคนละปัญหาและแก้คนละทาง
    // เคสที่ตกมาที่นี่บ่อยสุดคือ formData() อ่าน body ไม่ได้ — ต้องเห็นสาเหตุจริง
    const detail = String(error?.message || '').slice(0, 200);
    return Response.json(
      { error: `เซิร์ฟเวอร์อ่านไฟล์ที่ส่งมาไม่ได้${detail ? ` — ${detail}` : ''}` },
      { status: 500 },
    );
  }
}

// DELETE /api/upload — rollback ไฟล์ Drive ที่เพิ่งอัป เมื่อ caller บันทึก metadata
// (/api/master/attachments) ไม่สำเร็จ → กัน orphan (ไฟล์ค้างใน Drive ไม่มี row).
// best-effort: ใครก็ตามที่ล็อกอินเรียกได้ (เป็นการลบไฟล์ที่ตัวเองเพิ่งอัป).
export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let body = {};
  try { body = await request.json(); } catch { /* no body */ }
  const { driveFileId, storageBucket, storagePath, entityType, entityId } = body;

  // Roll back a private Won-evidence upload only while the quotation is still
  // open. After accept, the quote becomes the Actual source and its evidence is
  // immutable through this endpoint.
  if (storagePath) {
    // ⚠️ ลบได้เฉพาะ **หลักฐาน Won ที่ยังอยู่ระหว่างกด Won** — หลักฐานการชำระของใบสั่งขาย
    // ถอนผ่านเส้นของงวดชำระ ไม่ใช่ทางนี้ (ทางนี้ไม่รู้ว่างวดไหนอ้างไฟล์อยู่)
    if (entityType !== 'quotation_won_evidence' || !entityId || storageBucket !== PRIVATE_EVIDENCE_BUCKET) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const prefix = privateEvidencePrefix(entityType, entityId);
    if (!prefix || !String(storagePath).startsWith(prefix)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    // ด่านเดียวกับตอนอัป (สิทธิ์ฝ่ายขาย + ขอบเขตดีล + ใบต้องยังเปิด)
    const scope = await checkPrivateEvidenceScope(user, entityType, entityId);
    if (!scope.ok) return Response.json({ error: 'forbidden' }, { status: 403 });
    const supabase = getSupabaseAdmin();
    await supabase.storage.from(PRIVATE_EVIDENCE_BUCKET).remove([storagePath]);
    return Response.json({ ok: true });
  }

  if (!driveFileId) return Response.json({ ok: true });

  // rollback นี้ลบได้เฉพาะไฟล์ "orphan" (อัปแล้วบันทึก metadata ไม่สำเร็จ = ยังไม่มี
  // ที่ไหนอ้างอิง). ไฟล์ที่ commit แล้วห้ามลบผ่าน endpoint นี้ (กันใครก็ได้ยิง driveFileId
  // มาลบไฟล์บริษัท): attachment ต้องลบผ่าน /api/master/attachments/[id] ที่เช็คสิทธิ์ราย
  // entity; หลักฐาน Won ล็อกหลัง accept. เช็คทั้งตาราง attachments และ quotations.wonAttachments.
  const supabase = getSupabaseAdmin();
  const [{ data: attRef }, { data: wonRef }] = await Promise.all([
    supabase.from('attachments').select('id').eq('driveFileId', driveFileId).limit(1),
    supabase.from('quotations').select('id').contains('wonAttachments', [{ driveFileId }]).limit(1),
  ]);
  if (attRef?.length || wonRef?.length) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const { deleteFile } = await import('@/lib/drive');
    await deleteFile(driveFileId); // best-effort (กลืน error เองภายใน)
  } catch { /* ignore */ }
  return Response.json({ ok: true });
}
