import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { DEFAULT_WON_EVIDENCE_BUCKET } from '@/lib/sales/quotationWonEvidence';
import {
  MAX_UPLOAD_BYTES, MAX_UPLOAD_MB,
  ACCEPTED_UPLOAD_MIME, ACCEPTED_UPLOAD_EXT,
  fileExt, resolveUploadMime,
} from '@/lib/master/attachmentTypes';

// googleapis (Drive backend) ต้อง Node runtime — กันถูก bundle เป็น edge.
export const runtime = 'nodejs';

const PRIVATE_EVIDENCE_BUCKET = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_WON_EVIDENCE_BUCKET;

// ขนาดสูงสุดต่อไฟล์ — ค่ากลางจาก attachmentTypes (env override ได้).
const MAX_BYTES = Number(process.env.SUPABASE_MAX_UPLOAD_MB) > 0
  ? Number(process.env.SUPABASE_MAX_UPLOAD_MB) * 1024 * 1024
  : MAX_UPLOAD_BYTES;
const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));

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
    const isWonEvidence = entityType === 'quotation_won_evidence';
    // หลักฐานการชำระรายงวดของใบสั่งขาย (mig 0245) — bucket เดียวกับหลักฐาน Won
    // แต่คนละโฟลเดอร์ ⇒ proxy อ่านไฟล์ของแต่ละเอกสารแยกด่านกันได้
    const isPaymentEvidence = entityType === 'sales_order_payment_evidence';

    if (!file) {
      return Response.json({ error: 'ไม่พบไฟล์ที่ส่งมา' }, { status: 400 });
    }

    // จำกัดขนาดไฟล์ก่อนอ่านลง buffer (กันไฟล์ใหญ่ถมพื้นที่/ค่าใช้จ่าย).
    if (typeof file.size === 'number' && file.size > MAX_BYTES) {
      return Response.json(
        { error: `ไฟล์ใหญ่เกินกำหนด (สูงสุด ${MAX_MB} MB)` },
        { status: 413 },
      );
    }

    // รับเฉพาะเอกสาร/รูปที่ใช้ทำงานจริง — กันไฟล์อันตราย (.exe/.html) ที่ยิง API ตรง.
    // ผ่านถ้า mime อยู่ในลิสต์ หรือ (mime ว่าง/กว้าง) แต่นามสกุลถูกต้อง.
    const ext = fileExt(file.name);
    const mimeOk = file.type && ACCEPTED_UPLOAD_MIME.includes(file.type);
    const extOk = ACCEPTED_UPLOAD_EXT.includes(ext);
    if (!mimeOk && !extOk) {
      // บอกให้ตรงว่าไฟล์ไหนและนามสกุลอะไรที่ไม่ผ่าน — ข้อความรวม ๆ ทำให้ผู้ใช้เดาไม่ออก
      return Response.json(
        {
          error: `ชนิดไฟล์ไม่รองรับ: ${file.name || 'ไฟล์นี้'}${ext ? ` (.${ext})` : ''} — `
            + `รองรับ ${ACCEPTED_UPLOAD_EXT.map((e) => `.${e}`).join(' ')}`,
        },
        { status: 415 },
      );
    }

    // Content-Type ตัดสินฝั่ง server จากนามสกุล ไม่เชื่อค่าที่ client ประกาศมา
    const contentType = resolveUploadMime(file.name, file.type);
    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Won evidence: private Supabase bucket, regardless of the global backend ──
    // Validate the quotation/deal scope before storing bytes. The returned ref has
    // no public URL; clients download through the scoped quotation file proxy.
    if (isWonEvidence) {
      if (!entityId || !canEditSalesPlanning(user)) {
        return Response.json({ error: 'forbidden' }, { status: 403 });
      }
      const supabase = getSupabaseAdmin();
      const { data: quote, error: quoteError } = await supabase
        .from('quotations').select('id, dealId, status').eq('id', entityId).maybeSingle();
      if (quoteError) return Response.json({ error: quoteError.message }, { status: 500 });
      if (!quote) return Response.json({ error: 'ไม่พบใบเสนอราคา' }, { status: 404 });
      if (!['draft', 'sent'].includes(quote.status)) {
        return Response.json({ error: 'ใบเสนอราคานี้ไม่อยู่ในสถานะที่แนบหลักฐาน Won ได้' }, { status: 409 });
      }
      const { data: deal, error: dealError } = await supabase
        .from('sales_deals').select('*').eq('id', quote.dealId).maybeSingle();
      if (dealError) return Response.json({ error: dealError.message }, { status: 500 });
      if (!deal || !inSalesEditScope(user, deal)) {
        return Response.json({ error: 'forbidden' }, { status: 403 });
      }

      const safeQuoteId = String(quote.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
      const safeName = (file.name || 'file')
        .replace(/[^a-zA-Z0-9.\-_]+/g, '_')
        .replace(/^_+/, '') || 'file';
      const objectPath = `quotations/${safeQuoteId}/won/${Date.now()}_${crypto.randomUUID()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(PRIVATE_EVIDENCE_BUCKET)
        .upload(objectPath, buffer, {
          // contentType จาก server เช่นกัน — bucket นี้ private แต่กติกาเดียวกันทั้งระบบ
          contentType,
          upsert: false,
        });
      if (uploadError) {
        console.error('[upload] private Won evidence failed:', uploadError);
        return Response.json({ error: 'อัปโหลดหลักฐาน Won ไม่สำเร็จ' }, { status: 500 });
      }
      return Response.json({
        url: null,
        storageBucket: PRIVATE_EVIDENCE_BUCKET,
        storagePath: objectPath,
      });
    }

    // ── หลักฐานการชำระของใบสั่งขาย: private bucket เหมือนหลักฐาน Won ──────
    // ⚠️ ด่านเป็น **edit-scope ของดีลเจ้าของใบ** เหมือนกัน — คนที่แนบสลิปคือ SA/AC
    //    ที่ดูแลดีลนั้น ไม่ใช่ใครก็ได้ที่เห็นใบ
    // ⚠️ อนุญาตเฉพาะใบที่อนุมัติแล้ว: งวดเกิดตอนอนุมัติ ก่อนหน้านั้นไม่มีอะไรให้แนบ
    if (isPaymentEvidence) {
      if (!entityId || !canEditSalesPlanning(user)) {
        return Response.json({ error: 'forbidden' }, { status: 403 });
      }
      const supabase = getSupabaseAdmin();
      const { data: order, error: orderError } = await supabase
        .from('sales_orders').select('id, dealId, status').eq('id', entityId).maybeSingle();
      if (orderError) return Response.json({ error: orderError.message }, { status: 500 });
      if (!order) return Response.json({ error: 'ไม่พบใบสั่งขาย' }, { status: 404 });
      if (order.status !== 'approved') {
        return Response.json({ error: 'แนบหลักฐานการชำระได้หลังใบสั่งขายอนุมัติแล้ว' }, { status: 409 });
      }
      const { data: deal, error: dealError } = await supabase
        .from('sales_deals').select('*').eq('id', order.dealId).maybeSingle();
      if (dealError) return Response.json({ error: dealError.message }, { status: 500 });
      if (!deal || !inSalesEditScope(user, deal)) {
        return Response.json({ error: 'forbidden' }, { status: 403 });
      }

      const safeOrderId = String(order.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
      const safeName = (file.name || 'file')
        .replace(/[^a-zA-Z0-9.\-_]+/g, '_')
        .replace(/^_+/, '') || 'file';
      const objectPath = `sales-orders/${safeOrderId}/payments/${Date.now()}_${crypto.randomUUID()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(PRIVATE_EVIDENCE_BUCKET)
        .upload(objectPath, buffer, { contentType, upsert: false });
      if (uploadError) {
        console.error('[upload] private payment evidence failed:', uploadError);
        return Response.json({ error: 'อัปโหลดหลักฐานการชำระไม่สำเร็จ' }, { status: 500 });
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
    if (entityType !== 'quotation_won_evidence' || !entityId || storageBucket !== PRIVATE_EVIDENCE_BUCKET) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const safeQuoteId = String(entityId).replace(/[^a-zA-Z0-9_-]+/g, '_');
    if (!String(storagePath).startsWith(`quotations/${safeQuoteId}/won/`)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const supabase = getSupabaseAdmin();
    const { data: quote, error: quoteLoadError } = await supabase
      .from('quotations').select('id, dealId, status').eq('id', entityId).maybeSingle();
    if (quoteLoadError) return Response.json({ error: quoteLoadError.message }, { status: 500 });
    if (!quote || !['draft', 'sent'].includes(quote.status) || !canEditSalesPlanning(user)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    const { data: deal, error: dealError } = await supabase
      .from('sales_deals').select('*').eq('id', quote.dealId).maybeSingle();
    if (dealError) return Response.json({ error: dealError.message }, { status: 500 });
    if (!deal || !inSalesEditScope(user, deal)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
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
