import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canApproveQuotation, canViewSalesPlanning, dealAuditLabel } from '@/lib/salesPlanning';
import { quotationApprovalFingerprint } from '@/lib/sales/quotationApprovalFingerprint';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import {
  approveQuotationWithSignatureEvidence,
  signatureEvidenceErrorResponse,
} from '@/lib/admin/signatureEvidence';
import { captureIssuedQuotationSnapshot } from '@/lib/sales/issuedQuotationSnapshot';
import { captureIssuedQuotationPdf } from '@/lib/sales/issuedQuotationPdf';
import { getPublishedCompanyProfile } from '@/lib/admin/organizationSettings';
import { sendChat, chatCard } from '@/lib/chat';
import { fmtMoney } from '@/lib/format';
import { quotationWonAmount } from '@/lib/sales/quotationWonAmount';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/quotations/[id]/approval — อนุมัติใบเสนอราคา (มติ 2026-07-18).
// การเซ็นรับรองโดย "เจ้าของดีล" (ผู้อนุมัติบน FM-SA-01). เดิม route นี้เป็น stub ตอบ
// "ไม่ต้องขออนุมัติ" — เปลี่ยนเป็น action จริง: pending → approved + snapshot fingerprint
// ของเนื้อหา ณ เวลาอนุมัติ (แก้เนื้อหาภายหลัง = fingerprint ไม่ตรง → ต้องอนุมัติใหม่).
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;
  const reqBody = await req.json().catch(() => ({}));

  const { data: quote, error } = await supabase
    .from('quotations')
    .select('*, lines:quotation_lines(*), deal:sales_deals(id, title, code, dealType, ownerId, ownerName, team, stage, customerName, projectId, project:projects(id, code, name))')
    .eq('id', id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (!quote.deal) return badRequest('ใบเสนอราคานี้ไม่มีดีลผูกอยู่');
  // โครงการที่ผูกดีล — snapshot ตอนตรึงต้องมี deal.project ไม่งั้นแถว "โครงการ" ในใบ
  // ออกเป็น '-' ถาวร (เหมือนที่ loadQuote ของ detail GET แนบ). โหลดไม่ได้ = แถวว่างตามเดิม.
  if (quote.deal.projectId) {
    const { data: project } = await supabase
      .from('projects')
      .select('id, code, name')
      .eq('id', quote.deal.projectId)
      .maybeSingle();
    quote.deal.project = project || null;
  }

  // ผู้อนุมัติ = เจ้าของดีล (ownerId) หรือ superuser เท่านั้น — ผู้สร้างที่ไม่ใช่เจ้าของ
  // (เช่น AC/AE ทีมเดียวกัน) อนุมัติไม่ได้; เจ้าของสร้างเอง = เซ็นเองได้.
  if (!canApproveQuotation(user, quote.deal)) {
    return forbidden('อนุมัติใบเสนอราคาได้เฉพาะ AE เจ้าของดีล (หรือผู้ดูแลระบบ)');
  }

  if (quote.deal.stage === 'lost') return badRequest('ดีลนี้ Lost แล้ว — อนุมัติใบเสนอราคาไม่ได้');
  if (!['draft', 'sent', 'rejected'].includes(quote.status)) {
    return badRequest(`ใบสถานะ "${quote.status}" อนุมัติไม่ได้`);
  }
  if (quote.approvalStatus === 'approved') return badRequest('ใบเสนอราคานี้อนุมัติแล้ว');
  // mig 0155: ต้องผ่านขั้น "ยื่นอนุมัติ" ก่อน — การยื่นคือจุดที่ผู้เสนอราคาลงนาม ถ้าอนุมัติ
  // ข้ามขั้นได้ เอกสารจะไม่มีหลักฐาน/วันที่ของผู้เสนอราคาเลย
  if (quote.approvalStatus === 'not_submitted') {
    return badRequest('ใบเสนอราคานี้ยังไม่ได้ยื่นอนุมัติ — ผู้จัดทำต้องกด "ยื่นอนุมัติ" ก่อน');
  }
  if (quote.approvalStatus !== 'pending') {
    return badRequest('ใบเสนอราคานี้ไม่อยู่ในสถานะรออนุมัติ');
  }
  // ยอด 0 อนุมัติได้ (มติผู้ใช้ 2026-07-18: บางใบลดจนเหลือ 0) — ต้องมีรายการเท่านั้น
  if (!(quote.lines?.length > 0)) return badRequest('ต้องมีอย่างน้อย 1 รายการก่อนอนุมัติ');

  let result;
  try {
    result = await approveQuotationWithSignatureEvidence(supabase, {
      documentId: id,
      evidenceId: genId('DSE'),
      expectedUpdatedAt: quote.updatedAt,
      documentFingerprint: quotationApprovalFingerprint(quote, quote.lines),
      note: String(reqBody?.note || '').trim() || null,
      user,
    });
  } catch (approvalError) {
    return signatureEvidenceErrorResponse(approvalError);
  }
  const data = result.document;

  // Phase 7B: capture the immutable issued-document snapshot from the frozen
  // approved state. Best-effort — approval already committed atomically; a failed
  // snapshot must not roll it back and can be regenerated (RPC is idempotent).
  let snap = null;
  try {
    // ข้อมูลบริษัทที่เผยแพร่ ณ เวลาอนุมัติ — ตรึงลง snapshot ให้ reprint ตรงเดิมเสมอ
    const company = await getPublishedCompanyProfile(supabase);
    const snapshotQuote = { ...quote, ...data, lines: quote.lines, deal: quote.deal };
    snap = await captureIssuedQuotationSnapshot(supabase, {
      quote: snapshotQuote,
      evidence: result.evidence,
      user,
      company,
    });
  } catch (snapshotError) {
    console.error('issued quotation snapshot capture failed', id, snapshotError);
  }

  // Phase 7C (D-7C-1): สร้าง PDF ถาวรจาก HTML ที่ตรึง (best-effort, idempotent). แยก
  // try จาก snapshot — chromium พลาด/ช้าต้องไม่กลบผลตรึง HTML และไม่กระทบการอนุมัติที่
  // commit ไปแล้ว; ถ้าไม่เกิดตอนนี้ เส้นทางดาวน์โหลดจะ fallback สร้างเองภายหลัง
  try {
    const snapshotId = snap?.snapshot?.id;
    const html = snap?.artifact?.content;
    if (snapshotId && html) {
      await captureIssuedQuotationPdf(supabase, { quotationId: id, snapshotId, html });
    }
  } catch (pdfError) {
    console.error('issued quotation pdf capture failed', id, pdfError);
  }

  // เหตุการณ์ลงเธรดของใบ — ไม่เช็ค error โดยเจตนา (ดู submit/route.js)
  await appendDocumentEvent(supabase, {
    docType: 'quotation', doc: quote, action: 'approve', opts: { note: reqBody?.note }, user,
  });

  await recordAudit({
    user, action: 'update', entityType: 'quotation', entityId: id, before: quote, after: data,
    summary: `อนุมัติใบเสนอราคา ${quote.quoteNumber} (${dealAuditLabel(quote.deal)})`,
    request: req,
  });
  // แจ้งทีมขาย: ใบผ่านแล้ว = ถือว่าส่งลูกค้าแล้ว (mig 0165) → ขั้นถัดไปคือปิด Won
  // เดิมเงียบทั้งขา ผู้จัดทำที่ไม่ใช่เจ้าของดีลจึงไม่รู้ว่าใบตัวเองผ่านหรือยัง
  sendChat('sales', chatCard({
    title: '✅ ใบเสนอราคาอนุมัติแล้ว (ถือว่าส่งลูกค้าแล้ว)',
    subtitle: quote.deal.title || quote.quoteNumber,
    rows: [
      { label: 'เลขที่ใบเสนอราคา', value: quote.quoteNumber },
      { label: 'ยอด (ก่อน VAT)', value: `${fmtMoney(quotationWonAmount({ ...quote, ...data }))} บาท` },
      { label: 'ลูกค้า', value: quote.customerName || quote.deal.customerName || '' },
      { label: 'ผู้อนุมัติ', value: user.name || '' },
      { label: 'ขั้นถัดไป', value: 'ลูกค้าตอบรับแล้วให้กด "ปิดการขาย (Won)" พร้อมแนบหลักฐาน' },
    ],
    linkPath: `/sa/quotations/${id}`,
    linkLabel: 'เปิดใบเสนอราคา',
  }));
  return ok(data);
});
