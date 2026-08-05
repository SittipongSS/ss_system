// ── เอกสารทั้งหมดของดีลหนึ่งใบ — รวม 6 แหล่งครั้งเดียว (P5b) ─────────────
//
// GET /api/sales-planning/documents/all?dealId=D-1
//
// ⭐ ทำไมเป็น endpoint เดียว ไม่ใช่ให้หน้าจอยิงหกครั้ง: หกครั้งแปลว่าหน้าจอต้องรู้
// ว่าเอกสารของดีลอยู่ที่ไหนบ้าง — ซึ่งเป็นความรู้ที่จะ drift ทันทีที่มีแหล่งที่เจ็ด
//
// ⚠️ **สิทธิ์ของบรรทัดขอเอกสารอิงด่านของ *คำร้อง* ไม่ใช่ด่านของไฟล์** — คนที่เห็น
// ดีลนี้ได้ ไม่ได้แปลว่าเห็นคำร้องของฝ่ายอื่นได้ · ที่นี่ยอมให้เห็นเพราะสิ่งที่แสดง
// คือ "ยังไม่มีเอกสารชนิดนี้" ซึ่งเป็นข้อมูลของดีล ไม่ใช่เนื้อในคำร้อง
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import { buildEntityDocuments, entityDocumentProgress } from '@/lib/sales/entityDocuments';

export const dynamic = 'force-dynamic';

// query ที่พังต้อง **ดังทันที** ไม่ใช่คืน [] เงียบ ๆ — แผงที่ว่างเปล่าอ่านเหมือน
// "ดีลนี้ไม่มีเอกสาร" ทั้งที่จริง ๆ คืออ่านไม่สำเร็จ (บทเรียน mig 0174)
function raise(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const dealId = new URL(req.url).searchParams.get('dealId');
  if (!dealId) return badRequest('dealId is required');

  try {
    const { data: deal, error: dealError } = await supabase
      .from('sales_deals').select('*').eq('id', dealId).maybeSingle();
    raise('อ่านดีลไม่สำเร็จ', dealError);
    if (!deal) return notFound('ไม่พบดีล');
    if (!inSalesViewScope(user, deal)) return forbidden();

    // 1) ไฟล์แนบที่ผูกกับดีลตรง ๆ
    // ⚠️ วันนี้ยังไม่มีทางแนบไฟล์เข้าดีลโดยตรง (`deal` ยังไม่อยู่ใน ATTACHMENT_TYPES —
    // ต้องต่อครบ 5 จุดก่อน ดู costingAttachmentAccess.js) ⇒ แหล่งนี้จะว่างจนกว่า
    // จะเปิดใช้ · อ่านไว้ตั้งแต่ตอนนี้เพราะพอเปิดแล้วจะได้ไม่ต้องกลับมาแก้ที่นี่อีก
    const { data: attachments, error: attError } = await supabase
      .from('attachments').select('id, fileName, docType, createdAt')
      .eq('entityType', 'deal').eq('entityId', dealId);
    raise('อ่านไฟล์แนบของดีลไม่สำเร็จ', attError);

    // 2) ไฟล์ที่แนบมากับข้อความในความเคลื่อนไหว — **ไฟล์ของดีลวันนี้อยู่ที่นี่จริง ๆ**
    const { data: updates, error: updError } = await supabase
      .from('entity_updates').select('id, attachments, createdAt, userName')
      .eq('entityType', 'deal').eq('entityId', dealId)
      .not('attachments', 'is', null);
    raise('อ่านไฟล์ในความเคลื่อนไหวไม่สำเร็จ', updError);
    const threadAttachments = (updates || []).flatMap((u) => (
      (Array.isArray(u.attachments) ? u.attachments : []).map((a, i) => ({
        id: `${u.id}:${i}`,
        fileName: a?.fileName || a?.name || null,
        fileUrl: a?.fileUrl || a?.url || null,
        byName: u.userName || null,
        createdAt: u.createdAt,
      }))
    ));

    // 3–4) ใบเสนอราคา / ใบสั่งขาย → ฉบับที่ออกจริง + หลักฐานปิดการขาย
    const [{ data: quotations, error: qtError }, { data: salesOrders, error: soError }] =
      await Promise.all([
        supabase.from('quotations').select('id, docNo, wonAttachments, createdAt').eq('dealId', dealId),
        supabase.from('sales_orders').select('id, docNo, createdAt').eq('dealId', dealId),
      ]);
    raise('อ่านใบเสนอราคาไม่สำเร็จ', qtError);
    raise('อ่านใบสั่งขายไม่สำเร็จ', soError);

    const qtIds = (quotations || []).map((q) => q.id);
    const soIds = (salesOrders || []).map((s) => s.id);
    let issued = [];
    if (qtIds.length || soIds.length) {
      // ⚠️ `issued_documents` ไม่มี dealId — ต้อง join ผ่าน id ของ QT/SO
      const { data: rows, error: issuedError } = await supabase
        .from('issued_documents')
        .select('id, quotationId, salesOrderId, docNo, issuedAt, createdAt')
        .or([
          qtIds.length ? `quotationId.in.(${qtIds.join(',')})` : null,
          soIds.length ? `salesOrderId.in.(${soIds.join(',')})` : null,
        ].filter(Boolean).join(','));
      raise('อ่านฉบับที่ออกจริงไม่สำเร็จ', issuedError);
      issued = (rows || []).map((d) => ({
        ...d,
        title: d.docNo || 'ฉบับที่ออกจริง',
        // ⚠️ ฉบับที่ออกจริงเป็น **HTML ไม่ใช่ PDF** — ป้ายบนปุ่มห้ามเขียน "ดาวน์โหลด"
        href: `/api/issued-documents/${d.id}`,
      }));
    }

    const wonAttachments = (quotations || []).flatMap((q) => (
      (Array.isArray(q.wonAttachments) ? q.wonAttachments : []).map((a, i) => ({
        id: `${q.id}:${i}`,
        fileName: a?.fileName || a?.name || null,
        fileUrl: a?.fileUrl || a?.url || null,
        docNo: q.docNo || null,
        createdAt: q.createdAt,
      }))
    ));

    // 5) รายการเอกสารของดีล (checklist) — คอลัมน์ attachmentId ที่ลอยอยู่ได้งานทำ
    const { data: checklist, error: chkError } = await supabase
      .from('sales_deal_documents')
      .select('id, title, status, attachmentId, notes, createdAt').eq('dealId', dealId);
    raise('อ่านรายการเอกสารของดีลไม่สำเร็จ', chkError);

    // 6) ⭐ บรรทัดขอเอกสารที่ยังไม่ได้รับ — แหล่งเดียวที่บอก "ของที่ยังไม่มา"
    const { data: requests, error: reqError } = await supabase
      .from('dept_requests').select('id, status').eq('dealId', dealId);
    raise('อ่านคำร้องของดีลไม่สำเร็จ', reqError);
    const openRequestIds = (requests || [])
      .filter((r) => !['cancelled'].includes(r.status)).map((r) => r.id);
    let awaitingRequestItems = [];
    if (openRequestIds.length) {
      const { data: items, error: itemError } = await supabase
        .from('dept_request_items')
        .select('id, requestId, docType, spec, answerStatus, readyAt, createdAt')
        .in('requestId', openRequestIds).eq('lineKind', 'document');
      raise('อ่านบรรทัดขอเอกสารไม่สำเร็จ', itemError);
      // ยังไม่ได้ส่ง = ยังไม่มา · ส่งแล้วถือว่าไฟล์อยู่ในแหล่งอื่นแล้ว
      awaitingRequestItems = (items || []).filter((i) => !i.readyAt);
    }

    const rows = buildEntityDocuments({
      attachments: attachments || [],
      threadAttachments,
      issued,
      wonAttachments,
      checklist: checklist || [],
      awaitingRequestItems,
    });
    return ok({ rows, progress: entityDocumentProgress(rows) });
  } catch (e) {
    return fail(e.message, 500);
  }
});
