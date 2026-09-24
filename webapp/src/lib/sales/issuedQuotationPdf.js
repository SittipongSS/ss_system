import 'server-only';
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { genId } from '@/lib/id';
import { renderQuotationPdf, QUOTATION_PDF_GENERATOR_VERSION } from '@/lib/sales/quotationPdf';

// bucket ส่วนตัวสำหรับ PDF ใบเสนอราคาที่ออกจริง (สร้างใน mig 0139) — override ได้ด้วย env
export const ISSUED_QUOTATION_PDF_BUCKET =
  process.env.ISSUED_QUOTATION_PDF_BUCKET || 'issued-quotation-pdf';

const safe = (value) => String(value ?? '').replace(/[^a-zA-Z0-9_-]+/g, '_');

function bufferSha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

// path ของไฟล์ต่อ snapshot — เสถียร (derive จาก quotationId + snapshotId) เพื่อให้ idempotent
export function issuedQuotationPdfPath(quotationId, snapshotId) {
  return `quotations/${safe(quotationId)}/issued/${safe(snapshotId)}.pdf`;
}

// เก็บ PDF ของ issued snapshot ลง bucket + บันทึกแถว metadata (idempotent).
// - ถ้ามีแถวอยู่แล้ว → คืนของเดิม (reused) ไม่เรนเดอร์ซ้ำ (กัน sha256 เพี้ยนจาก chromium
//   ที่ไม่ deterministic ระดับไบต์)
// - upload upsert:false → ไฟล์ตัวแรกชนะและไม่ถูกเขียนทับ; แถว metadata อ้าง path เดียวกัน
// html = artifact HTML ที่ตรึงไว้ (frozen, self-contained) — เรนเดอร์จากนี้เท่านั้น ไม่ใช่ข้อมูลสด
export async function captureIssuedQuotationPdf(supabase, { quotationId, snapshotId, html }) {
  if (!snapshotId) throw new Error('captureIssuedQuotationPdf: missing snapshotId');

  const { data: existing, error: existingError } = await supabase
    .from('issued_document_pdf_artifacts')
    .select('*')
    .eq('issuedDocumentId', snapshotId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { row: existing, reused: true };

  const buffer = await renderQuotationPdf(html);
  const storagePath = issuedQuotationPdfPath(quotationId, snapshotId);

  const { error: uploadError } = await supabase.storage
    .from(ISSUED_QUOTATION_PDF_BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
  // ไฟล์ค้างอยู่แล้ว (เช่นรอบก่อนอัปโหลดสำเร็จแต่ insert แถวพลาด) = ยอมรับได้ ใช้ไฟล์เดิม
  if (uploadError && !/exists|duplicate|already/i.test(String(uploadError.message || ''))) {
    throw uploadError;
  }

  const { data: inserted } = await supabase
    .from('issued_document_pdf_artifacts')
    .upsert(
      {
        id: genId('IDP'),
        issuedDocumentId: snapshotId,
        storageBucket: ISSUED_QUOTATION_PDF_BUCKET,
        storagePath,
        mimeType: 'application/pdf',
        sha256: bufferSha256(buffer),
        sizeBytes: buffer.length,
        generatorVersion: QUOTATION_PDF_GENERATOR_VERSION,
      },
      { onConflict: 'issuedDocumentId', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (inserted) return { row: inserted, reused: false };

  // แข่งกันสร้าง (race) — อีก request ชนะไปแล้ว: อ่านแถวที่ commit จริง
  const { data: row, error: rowError } = await supabase
    .from('issued_document_pdf_artifacts')
    .select('*')
    .eq('issuedDocumentId', snapshotId)
    .maybeSingle();
  // อ่านแถวที่อีก request ชนะ race ไปแล้ว — พังตรงนี้ต้องดัง เพราะ row = undefined
  // จะไหลไปเป็น "ไม่มีไฟล์ PDF" ที่ปลายทางแทนที่จะบอกว่าอ่านไม่ได้
  if (rowError) throw rowError;
  return { row, reused: true };
}

/* ── สร้าง PDF **หลังตอบหน้าจอแล้ว** (`after`) — ผู้กดอนุมัติ/เปลี่ยนภาษาไม่ต้องรอ chromium ──────────
   🐞 เดิม route อนุมัติ await ขั้นนี้ก่อนตอบ ⇒ วัดจาก prod 24/09 (ใบเสนอราคา 38 ใบล่าสุด): ขั้น PDF ใช้ค่ากลาง
      4.8 วิ (2.1–6.0) จากทั้งคำขอ ~5.3 วิ — ส่วนลายเซ็น + เข้ารหัส + ตรึง HTML ใช้แค่ ~0.34 วิ
      (ลายเซ็นอยู่ Supabase Storage ไม่ใช่ Drive) · ใบสั่งขายไม่มีขั้นนี้ อนุมัติเสร็จ ~0.8 วิ
   ⚠️ ยัง best-effort + idempotent เหมือนเดิม — ยังไม่เสร็จ/พลาด แล้วมีคนกดดาวน์โหลด เส้น `issued/pdf` สร้างจาก
      HTML ที่ตรึงเอง และสองทางแข่งกันได้ (แถว upsert ignoreDuplicates · ไฟล์ upload upsert:false = ตัวแรกชนะ)
   ⚠️ พลาดต้อง log เสมอ — ไม่มีใครรออยู่ปลายทางแล้ว ถ้ากลืนเงียบจะไม่มีใครรู้ว่าใบนั้นไม่มี PDF ถาวร */
export function captureIssuedQuotationPdfLater(supabase, { quotationId, snapshotId, html }, { logLabel } = {}) {
  if (!snapshotId || !html) return;
  const run = () => captureIssuedQuotationPdf(supabase, { quotationId, snapshotId, html })
    .catch((error) => console.error(logLabel || 'issued quotation pdf capture failed', quotationId, error));
  try {
    after(run);
  } catch {
    // นอกบริบท request ของ Next (script/เทสต์) — ยิงตรงแทน (ทรงเดียวกับ notifyLater ของใบสเปค)
    run();
  }
}

// โหลดไบต์ PDF จาก bucket ตามแถว metadata (คืน Buffer) — ใช้ตอนเสิร์ฟดาวน์โหลด
export async function downloadIssuedQuotationPdf(supabase, row) {
  if (!row?.storagePath) return null;
  const { data, error } = await supabase.storage
    .from(row.storageBucket || ISSUED_QUOTATION_PDF_BUCKET)
    .download(row.storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
