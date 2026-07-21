import { withUser, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import {
  captureIssuedQuotationPdf,
  downloadIssuedQuotationPdf,
} from '@/lib/sales/issuedQuotationPdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // เผื่อ cold start ของ chromium ตอน fallback generate

// GET /api/sales-planning/quotations/[id]/issued/pdf — Phase 7C (D-7C-1): เสิร์ฟ PDF
// ถาวรของใบเสนอราคาที่ออกจริง (เรนเดอร์จาก HTML ที่ตรึง ไม่ใช่ข้อมูลสด). สิทธิ์ + การเลือก
// ฉบับ = pattern เดียวกับ /issued (HTML reprint). ถ้า PDF ยังไม่ถูกสร้างตอนอนุมัติ →
// fallback สร้างจาก snapshot ทันที (idempotent) แล้วเสิร์ฟ.
//   ?render=latest (ค่าเริ่มต้น) → ฉบับตรึงล่าสุด (เฉพาะเมื่อยัง approved)
//   ?render=<seq>              → ฉบับที่ระบุ (ดูประวัติ)
export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { data: quote } = await supabase
    .from('quotations')
    .select('id, dealId, approvalStatus')
    .eq('id', id)
    .maybeSingle();
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  const { data: deal } = await supabase
    .from('sales_deals').select('*').eq('id', quote.dealId).maybeSingle();
  if (!deal || !inSalesViewScope(user, deal)) return forbidden();

  const { data: snapshots, error } = await supabase
    .from('issued_documents')
    .select('id, documentNumber, issueSequence, contentFingerprint')
    .eq('documentType', 'quotation')
    .eq('documentId', id)
    .order('issueSequence', { ascending: false });
  if (error) return fail(error.message, 500);
  if (!snapshots?.length) return notFound('ยังไม่มีเอกสารที่ออกจริงสำหรับใบเสนอราคานี้');

  const render = new URL(req.url).searchParams.get('render') || 'latest';
  // เหมือน HTML reprint: latest เสิร์ฟได้เฉพาะเมื่อเนื้อหาปัจจุบันยังตรงฉบับอนุมัติ
  if (render === 'latest' && quote.approvalStatus !== 'approved') {
    return fail('ใบถูกแก้ไขหลังอนุมัติ — ฉบับตรึงล่าสุดไม่ตรงเนื้อหาปัจจุบัน ต้องอนุมัติใหม่ก่อน', 409);
  }
  const target = render === 'latest'
    ? snapshots[0]
    : snapshots.find((row) => String(row.issueSequence) === String(render));
  if (!target) return notFound('ไม่พบฉบับที่ออกจริงตามที่ระบุ');

  // มี PDF ตรึงแล้ว → เสิร์ฟจาก bucket; ยังไม่มี → fallback สร้างจาก HTML ที่ตรึง
  let fallbackGenerated = false;
  let { data: pdfRow } = await supabase
    .from('issued_document_pdf_artifacts')
    .select('*')
    .eq('issuedDocumentId', target.id)
    .maybeSingle();

  if (!pdfRow) {
    const { data: artifact, error: artifactError } = await supabase
      .from('issued_document_artifacts')
      .select('content')
      .eq('issuedDocumentId', target.id)
      .maybeSingle();
    if (artifactError) return fail(artifactError.message, 500);
    if (!artifact?.content) return notFound('ไม่พบไฟล์เอกสารที่ตรึงไว้');
    try {
      const result = await captureIssuedQuotationPdf(supabase, {
        quotationId: id,
        snapshotId: target.id,
        html: artifact.content,
      });
      pdfRow = result.row;
      fallbackGenerated = !result.reused;
    } catch (pdfError) {
      return fail(`สร้าง PDF ไม่สำเร็จ: ${pdfError.message || pdfError}`, 500);
    }
  }
  if (!pdfRow) return fail('สร้าง PDF ไม่สำเร็จ', 500);

  const buffer = await downloadIssuedQuotationPdf(supabase, pdfRow);
  if (!buffer) return fail('อ่านไฟล์ PDF ที่เก็บไว้ไม่สำเร็จ', 502);

  const fileName = `${target.documentNumber || id}.pdf`;
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Issued-Document-Fingerprint': target.contentFingerprint,
      'X-Issued-Artifact-Sha256': pdfRow.sha256,
      // audit: บอกว่าไฟล์นี้เพิ่งถูกสร้างสด (ไม่ได้ตรึงตอนอนุมัติ) ตาม contract Phase 7C
      ...(fallbackGenerated ? { 'X-Pdf-Fallback': 'on-demand' } : {}),
    },
  });
});
