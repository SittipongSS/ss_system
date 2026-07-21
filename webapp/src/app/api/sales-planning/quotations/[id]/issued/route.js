import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/quotations/[id]/issued — Phase 7B reprint from the
// immutable issued-document snapshot. Reprints replay the frozen artifact, never
// live data. Query:
//   (none)           → list snapshot metadata (no artifact body) for the quote
//   ?render=latest   → return the latest snapshot's canonical HTML artifact
//                      (เฉพาะเมื่อเนื้อหาปัจจุบันยังตรงฉบับอนุมัติ — ดูด้านล่าง)
//   ?render=<seq>    → return a specific issue sequence's HTML artifact
export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  // สิทธิ์คุมด้วย view-scope ของดีลเจ้าของ (pattern เดียวกับ [id]/file) — capability
  // อย่างเดียวไม่พอ: เอกสารตรึงมีราคา/ลูกค้าครบ ห้ามให้ AE ข้ามทีมดึงตาม id ได้
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
    .select('id, documentNumber, issueSequence, contentFingerprint, layoutTemplateVersion, locale, issuedAt, issuedBy, issuedByName, createdAt')
    .eq('documentType', 'quotation')
    .eq('documentId', id)
    .order('issueSequence', { ascending: false });
  if (error) return fail(error.message, 500);
  if (!snapshots?.length) return notFound('ยังไม่มีเอกสารที่ออกจริงสำหรับใบเสนอราคานี้');

  const render = new URL(req.url).searchParams.get('render');
  if (!render) return ok({ snapshots });

  // แก้เนื้อหาหลังอนุมัติ → approvalStatus ถูกรีเซ็ตเป็น pending เสมอ (PATCH ใบ) แต่
  // snapshot เก่าไม่ถูกลบ (ประวัติต้องอยู่) — ถ้ายังเสิร์ฟ "latest" ต่อ ผู้ใช้จะพิมพ์ได้
  // ฉบับเก่าที่ไม่มีลายน้ำร่าง ทั้งที่เนื้อหาจริงเปลี่ยนไปแล้ว จึงตอบ 409 ให้ปุ่มพิมพ์
  // fallback ไปเรนเดอร์สด (มีลายน้ำรออนุมัติ); ฉบับระบุ seq ตรง ๆ ยังเปิดไว้ดูประวัติ
  if (render === 'latest' && quote.approvalStatus !== 'approved') {
    return fail('ใบถูกแก้ไขหลังอนุมัติ — ฉบับตรึงล่าสุดไม่ตรงเนื้อหาปัจจุบัน ต้องอนุมัติใหม่ก่อน', 409);
  }

  const target = render === 'latest'
    ? snapshots[0]
    : snapshots.find((row) => String(row.issueSequence) === String(render));
  if (!target) return notFound('ไม่พบฉบับที่ออกจริงตามที่ระบุ');

  const { data: artifact, error: artifactError } = await supabase
    .from('issued_document_artifacts')
    .select('content, mimeType, sha256')
    .eq('issuedDocumentId', target.id)
    .maybeSingle();
  if (artifactError) return fail(artifactError.message, 500);
  if (!artifact) return notFound('ไม่พบไฟล์เอกสารที่ตรึงไว้');

  return new Response(artifact.content, {
    status: 200,
    headers: {
      'Content-Type': `${artifact.mimeType}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Issued-Document-Fingerprint': target.contentFingerprint,
      'X-Issued-Artifact-Sha256': artifact.sha256,
    },
  });
});
