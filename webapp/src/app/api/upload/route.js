import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { checkUploadCandidate, resolveUploadMime } from '@/lib/master/attachmentTypes';
import { MAX_BYTES } from '@/lib/upload/limits';
import {
  PRIVATE_EVIDENCE_BUCKET,
  isPrivateEvidence,
  checkPrivateEvidenceScope,
  privateEvidenceObjectPath,
} from '@/lib/upload/privateEvidence';
import { DRIVE_FILE_ID_PATTERN, recordUploadReceipt, uploadReceiptStatus } from '@/lib/upload/receipts';
import { driveFileReferenced, driveFileTrashable } from '@/lib/master/attachments';

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
    let uploaded;
    try {
      const { uploadForEntity } = await import('@/lib/drive');
      uploaded = await uploadForEntity({
        entityType,
        entityId,
        buffer,
        name: file.name || 'file',
        mimeType: contentType,
      });
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

    /* 🔴 ออกใบรับการอัปโหลด (mig 0406 · มติเจ้าของ 08/10/2569) — กติกาเดียวกับ /api/upload/commit: จดว่าไฟล์ Drive ใบนี้
       คนเรียกอัปขึ้นมาเอง (id มาจาก Drive ไม่ใช่จากคำขอ) · ขาหลักฐานใน bucket ส่วนตัวข้างบน **ไม่ออกใบรับ** (ไม่ใช่ไฟล์ Drive)
       ⚠️ อยู่ **นอก** try ของขา Drive — ออกใบรับพังต้องไม่ถูกรายงานเป็น "อัปโหลดขึ้น Google Drive ไม่สำเร็จ"
       ⚠️ ออกไม่สำเร็จ (ลองสองครั้งแล้ว · หรือสร้าง client ไม่ได้) = log ดังแล้วคืน ref ตามเดิม ไม่ล้มการอัป — แต่ไฟล์ใบนี้เก็บลง
          ปลายทางไหนไม่ได้แล้ว: ตั้งแต่รอบสอง ปลายทางของไฟล์ Drive ทุกที่ (ไฟล์แนบ · ไฟล์ในเธรด รวมรูปของใบแจ้งปัญหา ·
          รูป/ลายเซ็นของนัดช่าง) ตรวจใบรับ จึงปิดเอง สองแบบตามเหตุ:
          · ทะเบียนอ่านไม่ได้ / ยังไม่มีตาราง (ไม่ได้รัน 0406) = ปลายทางตอบ 503 "ตรวจที่มาของไฟล์ไม่ได้" และเส้นถอยข้างล่างก็ 503
          · ออกใบรับพลาดชั่วคราวแต่ทะเบียนอ่านได้ = ไม่มีใบรับ ⇒ ปลายทางตอบ 400 "ไฟล์นี้ไม่ได้มาจากการอัปโหลดของคุณ…" และ
            เส้นถอย (DELETE ข้างล่าง) ตอบ 403 ⇒ ไฟล์ค้างบน Drive เป็นไฟล์กำพร้า ให้รายงาน drive-orphans ตามเก็บ ·
            ผู้ใช้อัปไฟล์ใหม่แล้วแนบ/โพสต์อีกครั้ง (ตามหา log นี้ด้วย 400/403 ไม่ใช่ 503) */
    let receipt;
    try {
      receipt = await recordUploadReceipt(getSupabaseAdmin(), {
        driveFileId: uploaded.id, userId: user.id, entityType, entityId,
      });
    } catch (err) {
      receipt = { error: err };
    }
    if (receipt.error) {
      console.error('[upload] 🔴 ออกใบรับการอัปโหลดไม่สำเร็จ — ไฟล์ขึ้น Drive แล้วแต่เก็บลงปลายทางไหนไม่ได้ (ไฟล์แนบ · เธรด · นัดช่าง) ผู้ใช้ต้องอัปใหม่ (ตรวจว่ารัน migration 0406 แล้ว)',
        uploaded.id, receipt.error?.message);
    }

    // คืน driveFileId เพิ่ม — caller ส่งต่อให้ /api/master/attachments เก็บไว้.
    return Response.json({ url: uploaded.webViewLink, driveFileId: uploaded.id, mimeType: contentType });
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
//
// 🔴 **ถอยได้เฉพาะไฟล์ที่คนเรียกอัปเอง และยังไม่มีที่ไหนใช้** (มติเจ้าของ 08/10/2569) —
// 🐞 เดิม "ใครก็ตามที่ล็อกอินเรียกได้" โดยเชื่อ `driveFileId` จากคำขอ และถามแค่สองตาราง (ทิ้ง error ของคำถามด้วย) ⇒ ส่ง id ของ
//    โฟลเดอร์ลูกค้าทั้งโฟลเดอร์ · ไฟล์ในเธรด · รูปของนัดช่าง มาแล้วระบบทิ้งลงถังขยะ Drive ให้ทันที ไม่ต้องมีแถวสักแถว
// ลำดับด่านของขา Drive (สลับไม่ได้ — ด่านถูกสุดและบอกน้อยสุดมาก่อน):
//   ① รูปร่าง id (400 · ค่าที่หลุดรูปห้ามถึงตัวกรองของฐาน)
//   ② ใบรับการอัปโหลดของคนเรียกเอง อายุไม่เกิน 24 ชั่วโมง (mig 0406) — ไม่มี/ของคนอื่น/หมดอายุ = 403 · ตรวจไม่ได้ = 503
//   ③ ใบรับที่ปลายทางรับไปแล้ว (`claimedBy`) = 409
//   ④ มีที่ไหนอ้างถึง (`driveFileReferenced` — attachments สองช่อง · หลักฐาน Won รุ่นเก่า · ไฟล์ในเธรด) หรือถามไม่ได้ = 409
//   ⑤ ชนิดจริงบน Drive (`driveFileTrashable`) — โฟลเดอร์/ไฟล์ของ Google = 409 · ถามไม่ได้ = 502
//   แล้วจึงทิ้งไฟล์
// ⚠️ **สวิตช์ผ่อนด่านใบรับ (UPLOAD_RECEIPT_MODE) ไม่มีผลกับเส้นนี้ทุกโหมด** — ปฏิเสธผิดที่นี่เสียแค่ไฟล์กำพร้าหนึ่งใบ
//    (รายงาน drive-orphans ตามเก็บได้) · ปล่อยผิดคือไฟล์ของคนอื่นลงถังขยะ
// ⚠️ ผู้เรียกทุกจุดยิงแบบไม่รอผล (rollback หลังแนบไม่ผ่าน) — สถานะที่ตอบมีไว้ให้คนไล่ log ไม่ใช่ให้จอ
export async function DELETE(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  let body = {};
  try { body = await request.json(); } catch { /* no body */ }
  const { driveFileId, storagePath } = body;

  /* 🔴 ขา bucket ส่วนตัว (คำขอที่ส่ง `storagePath`) — **ปฏิเสธเสมอ ไม่ลบอะไรจากถังเก็บผ่านเส้นนี้**
     🐞 เดิมลบ object ใต้โฟลเดอร์ `won/` ของใบเสนอราคาที่ยังเปิดอยู่ได้ด้วย path จากคำขอ ทั้งที่
       · ไฟล์ในถังเก็บไม่มีใบรับการอัปโหลด — ไม่รู้ว่าใครอัป จึงแยก "ไฟล์ที่คนเรียกเพิ่งอัปเอง" จากไฟล์ของคนอื่นไม่ได้
       · ลบตาม path ไม่ได้ถามว่ามีแถวไหนอ้างไฟล์นั้นอยู่ ⇒ หลักฐานที่แถวยังชี้ถึงหายได้
     ผู้เรียกเดียวของขานี้ (หน้าสร้างใบสั่งขาย · ส่ง entityType `sales_order_confirmation`) ถูกปฏิเสธ 403 มาตั้งแต่เดิม
     และถอดคำขอนั้นออกจากจอแล้ว ⇒ ไม่มีจอไหนเสียความสามารถ · ไม่มีจอไหนเรียกขานี้อีก · สร้างใบไม่สำเร็จ = ไฟล์ค้างเป็นไฟล์กำพร้าในโฟลเดอร์ของใบเสนอราคา แล้วหายไปพร้อมโฟลเดอร์
     ตอนลบใบเสนอราคา · หลักฐานที่บันทึกแล้วถอนผ่านเส้นของเอกสารนั้นเอง (ซึ่งรู้ว่าแถวไหนอ้างไฟล์อยู่) */
  if (storagePath) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!driveFileId) return Response.json({ ok: true });

  // ① รูปร่าง id
  if (typeof driveFileId !== 'string' || !DRIVE_FILE_ID_PATTERN.test(driveFileId)) {
    return Response.json({ error: 'ลบไฟล์ที่อัปไม่สำเร็จ — รหัสไฟล์ไม่ถูกต้อง' }, { status: 400 });
  }

  // ② ใบรับของคนเรียกเอง (ตรวจไม่ได้ต้องแยกจาก "ไม่มีใบรับ" — ฐานล่มไม่ใช่ความผิดของคนเรียก)
  const supabase = getSupabaseAdmin();
  const receipt = await uploadReceiptStatus(supabase, { driveFileId, userId: user.id });
  if (receipt.reason === 'unverifiable') {
    return Response.json({ error: 'ตรวจที่มาของไฟล์ไม่ได้ในขณะนี้ จึงยังไม่ลบไฟล์ — ลองอีกครั้ง' }, { status: 503 });
  }
  if (!receipt.ok) {
    return Response.json({ error: 'ลบได้เฉพาะไฟล์ที่คุณอัปโหลดเองในช่วง 24 ชั่วโมงที่ผ่านมา' }, { status: 403 });
  }

  // ③ ปลายทางรับไฟล์ไปแล้ว — ต้องลบผ่านปลายทางนั้น (attachment ลบผ่าน /api/master/attachments/[id] ที่เช็คสิทธิ์ราย entity)
  if (receipt.receipt?.claimedBy) {
    return Response.json({ error: 'ไฟล์นี้ถูกแนบไว้กับเอกสารแล้ว — ลบผ่านหน้าของเอกสารนั้น' }, { status: 409 });
  }

  // ④ ยังมีที่ไหนอ้างถึง หรือถามไม่ได้ = ไม่ลบ (หลักฐาน Won ล็อกหลัง accept · ไฟล์ในเธรดลบผ่านเธรด)
  const ref = await driveFileReferenced(supabase, driveFileId);
  if (ref.error || ref.referenced) {
    if (ref.error) console.error('[upload] ตรวจว่าไฟล์ถูกอ้างถึงอยู่ไหมไม่สำเร็จ — ไม่ลบไฟล์', driveFileId, ref.error.message);
    return Response.json({ error: 'ไฟล์นี้ถูกใช้อยู่ในระบบ (หรือตรวจไม่ได้) จึงไม่ลบ' }, { status: 409 });
  }

  // ⑤ ชนิดจริงบน Drive — ด่านเดียวกับตัวปล่อยไฟล์ของแถวไฟล์แนบ (lib/master/attachments)
  const trashable = await driveFileTrashable(driveFileId);
  if (!trashable.ok) {
    if (trashable.reason === 'trashed') return Response.json({ ok: true });
    if (trashable.reason === 'unverifiable') {
      console.error('[upload] ตรวจชนิดไฟล์กับ Google Drive ไม่สำเร็จ — ไม่ลบไฟล์', driveFileId, trashable.error?.message || '');
      return Response.json({ error: 'ตรวจไฟล์กับ Google Drive ไม่สำเร็จ จึงยังไม่ลบไฟล์ — ลองอีกครั้ง' }, { status: 502 });
    }
    return Response.json({ error: 'ไฟล์ชนิดนี้ลบผ่านเส้นนี้ไม่ได้ (โฟลเดอร์หรือเอกสาร Google)' }, { status: 409 });
  }

  try {
    const { deleteFile } = await import('@/lib/drive');
    await deleteFile(driveFileId); // best-effort (กลืน error เองภายใน)
  } catch { /* ignore */ }
  return Response.json({ ok: true });
}
