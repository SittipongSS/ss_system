import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/quotations/[id]/issued — Phase 7B reprint from the
// immutable issued-document snapshot. Reprints replay the frozen artifact, never
// live data. Query:
//   (none)           → list snapshot metadata (no artifact body) for the quote
//   ?render=latest   → return the latest snapshot's canonical HTML artifact
//   ?render=<seq>    → return a specific issue sequence's HTML artifact
export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

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
