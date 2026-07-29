import { withUser, ok, fail, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';

export const dynamic = 'force-dynamic';

// GET /api/sales-planning/sales-orders/[id]/issued — reprint ใบสั่งขายจาก issued-document
// snapshot ที่ตรึงตอนอนุมัติ (คู่ขนานกับ quotations/[id]/issued). เล่นฉบับตรึงเสมอ ไม่ใช่
// ข้อมูลสด. Query:
//   (none)         → list snapshot metadata (ไม่มี artifact body)
//   ?render=latest → HTML artifact ฉบับล่าสุด (เฉพาะเมื่อ SO ยัง approved อยู่)
//   ?render=<seq>  → HTML artifact ตาม issue sequence ที่ระบุ
export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  // สิทธิ์คุมด้วย view-scope ของดีลเจ้าของ (pattern เดียวกับ QT issued) — เอกสารตรึงมีราคา/
  // ลูกค้าครบ ห้ามให้ AE ข้ามทีมดึงตาม id
  const { data: order, error: orderError } = await supabase
    .from('sales_orders')
    .select('id, dealId, status')
    .eq('id', id)
    .maybeSingle();
  if (orderError) return fail(orderError.message, 500);
  if (!order) return notFound('ไม่พบใบสั่งขาย');
  const { data: deal, error: dealError } = await supabase
    .from('sales_deals').select('*').eq('id', order.dealId).maybeSingle();
  if (dealError) return fail(dealError.message, 500);
  if (!deal || !inSalesViewScope(user, deal)) return forbidden();

  const { data: snapshots, error } = await supabase
    .from('issued_documents')
    .select('id, documentNumber, issueSequence, contentFingerprint, layoutTemplateVersion, locale, issuedAt, issuedBy, issuedByName, createdAt')
    .eq('documentType', 'sales_order')
    .eq('documentId', id)
    .order('issueSequence', { ascending: false });
  if (error) return fail(error.message, 500);
  if (!snapshots?.length) return notFound('ยังไม่มีเอกสารที่ออกจริงสำหรับใบสั่งขายนี้');

  const render = new URL(req.url).searchParams.get('render');
  if (!render) return ok({ snapshots });

  // SO ถูกยกเลิก/reversal หลังอนุมัติ → status เปลี่ยนจาก approved; ฉบับตรึงล่าสุดไม่ตรง
  // สถานะปัจจุบัน จึงตอบ 409 ให้ปุ่มพิมพ์ fallback ไปเรนเดอร์สด (มีลายน้ำตามสถานะ);
  // ฉบับระบุ seq ตรง ๆ ยังเปิดดูประวัติได้
  if (render === 'latest' && order.status !== 'approved') {
    return fail('ใบสั่งขายเปลี่ยนสถานะหลังอนุมัติ — ฉบับตรึงล่าสุดไม่ตรงสถานะปัจจุบัน', 409);
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
