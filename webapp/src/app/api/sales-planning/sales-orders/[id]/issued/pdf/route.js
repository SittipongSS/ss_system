import { documentFileName } from '@/lib/documents/documentShell';
import { loadScoped } from '@/lib/scopedRow';
import { withUser, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';
import {
  captureIssuedQuotationPdf,
  downloadIssuedQuotationPdf,
} from '@/lib/sales/issuedQuotationPdf';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // เผื่อ cold start ของ chromium ตอนสร้างครั้งแรก

// GET /api/sales-planning/sales-orders/[id]/issued/pdf — PDF ของใบสั่งขายฉบับที่ออกจริง
// (ชุดเอกสาร QT · SO · การชำระ บนทะเบียนใบสั่งขาย · มติเจ้าของ 27/10/2569) — ฝาแฝดของ
// quotations/[id]/issued/pdf: เรนเดอร์จาก HTML ที่ตรึงตอนอนุมัติ ไม่ใช่ข้อมูลสด
// ⭐ ใบสั่งขายไม่สร้าง PDF ตอนอนุมัติ (อนุมัติเสร็จ ~0.8 วิ — ดู issuedQuotationPdf.js) ⇒ สร้างครั้งแรกที่มีคนขอ
//   แล้วเก็บลง bucket + `issued_document_pdf_artifacts` ชุดเดียวกับใบเสนอราคา ครั้งต่อไปเสิร์ฟของเดิม
//   ?render=latest (ค่าเริ่มต้น) → ฉบับตรึงล่าสุด (เฉพาะเมื่อใบยัง approved — กติกาเดียวกับ /issued)
//   ?render=<seq>              → ฉบับที่ระบุ (ดูประวัติ)
export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  // สิทธิ์ = view-scope ของดีลเจ้าของ (ตัวเดียวกับ /issued) — เอกสารตรึงมีราคา/ลูกค้าครบ
  const { row: order, response } = await loadScoped(supabase, 'sales_orders', id, user, 'view');
  if (response) return response;

  const { data: snapshots, error } = await supabase
    .from('issued_documents')
    .select('id, documentNumber, issueSequence, contentFingerprint, resolvedPayload')
    .eq('documentType', 'sales_order')
    .eq('documentId', id)
    .order('issueSequence', { ascending: false });
  if (error) return fail(error.message, 500);
  if (!snapshots?.length) return notFound('ยังไม่มีเอกสารที่ออกจริงสำหรับใบสั่งขายนี้ (ใบยังไม่อนุมัติ)');

  const render = new URL(req.url).searchParams.get('render') || 'latest';
  // ⚠️ PDF ฉบับตรึงไม่มีลายน้ำ — ใบที่ยกเลิก/ย้อนอนุมัติแล้วส่งต่อไปจะอ่านเหมือนใบที่ยังมีผล ⇒ 409 แบบ /issued
  if (render === 'latest' && order.status !== 'approved') {
    return fail('ใบสั่งขายเปลี่ยนสถานะหลังอนุมัติ — ฉบับตรึงล่าสุดไม่ตรงสถานะปัจจุบัน', 409);
  }
  const target = render === 'latest'
    ? snapshots[0]
    : snapshots.find((row) => String(row.issueSequence) === String(render));
  if (!target) return notFound('ไม่พบฉบับที่ออกจริงตามที่ระบุ');

  let generated = false;
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
        folder: 'sales-orders',
      });
      pdfRow = result.row;
      generated = !result.reused;
    } catch (pdfError) {
      return fail(`สร้าง PDF ไม่สำเร็จ: ${pdfError.message || pdfError}`, 500);
    }
  }
  if (!pdfRow) return fail('สร้าง PDF ไม่สำเร็จ', 500);

  const buffer = await downloadIssuedQuotationPdf(supabase, pdfRow);
  if (!buffer) return fail('อ่านไฟล์ PDF ที่เก็บไว้ไม่สำเร็จ', 502);

  // ชื่อไฟล์ = รหัสเอกสาร_ชื่อลูกค้า_ชื่อดีล จาก payload ที่ตรึง (กติกาเดียวกับใบเสนอราคา · มติ 2026-08-05)
  const pinned = target.resolvedPayload || {};
  const fileName = `${documentFileName(
    target.documentNumber || order.orderNumber || id,
    pinned.customer?.customerName,
    pinned.context?.dealTitle,
  )}.pdf`;
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Issued-Document-Fingerprint': target.contentFingerprint,
      'X-Issued-Artifact-Sha256': pdfRow.sha256,
      ...(generated ? { 'X-Pdf-Fallback': 'on-demand' } : {}),
    },
  });
});
