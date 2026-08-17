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
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { loadScoped } from '@/lib/scopedRow';
import { canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { buildEntityDocuments, entityDocumentProgress } from '@/lib/sales/entityDocuments';
import { ensureGoogleDocAccess } from '@/lib/master/googleDocAccess';
import { workspaceEmail } from '@/lib/master/googleDocs';

export const dynamic = 'force-dynamic';
// ให้สิทธิ์เอกสารร่วมบน Drive ต้องโหลด googleapis — ต้อง Node runtime
export const runtime = 'nodejs';

// ⭐ แท็บนี้เป็นทางเดียวที่คนเห็นเอกสารร่วม **ของดีลอื่นในโครงการเดียวกัน** —
// กล่องไฟล์แนบด้านล่างโหลดเฉพาะของใบที่เปิดอยู่ ⇒ ถ้าไม่ให้สิทธิ์ตรงนี้ด้วย คนกด
// "ดู" จากลิสต์รวมของโครงการจะได้กรอบว่างทั้งที่ระบบบอกว่าเขาเห็นเอกสารนั้นได้
async function grantDocAccess(supabase, attachments, user, canEdit) {
  await ensureGoogleDocAccess(supabase, attachments || [], {
    email: await workspaceEmail(supabase, user?.id),
    role: canEdit ? 'writer' : 'reader',
  });
}

// query ที่พังต้อง **ดังทันที** ไม่ใช่คืน [] เงียบ ๆ — แผงที่ว่างเปล่าอ่านเหมือน
// "ดีลนี้ไม่มีเอกสาร" ทั้งที่จริง ๆ คืออ่านไม่สำเร็จ (บทเรียน mig 0174)
function raise(label, error) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

// เก็บเอกสารทุกแหล่งของดีลเดียว — คืน "วัตถุดิบ" ให้ buildEntityDocuments
// ⭐ แยกออกมาเพื่อให้ **หน้าโครงการเรียกวนได้** (ม-88: "เอกสารไปสู่แท็บเอกสารใน
// โครงการ ดีลนั้นด้วย") — โครงการ = รวมของทุกดีลข้างใน ไม่ใช่แหล่งใหม่
async function collectDealDocuments(supabase, dealId) {

    // 1) ไฟล์แนบที่ผูกกับดีลตรง ๆ
    // ⚠️ วันนี้ยังไม่มีทางแนบไฟล์เข้าดีลโดยตรง (`deal` ยังไม่อยู่ใน ATTACHMENT_TYPES —
    // ต้องต่อครบ 5 จุดก่อน ดู costingAttachmentAccess.js) ⇒ แหล่งนี้จะว่างจนกว่า
    // จะเปิดใช้ · อ่านไว้ตั้งแต่ตอนนี้เพราะพอเปิดแล้วจะได้ไม่ต้องกลับมาแก้ที่นี่อีก
    const { data: attachments, error: attError } = await supabase
      // metadata + fileUrl: แยก "เอกสารร่วม" (Google Doc/Sheet) ออกจากไฟล์นิ่ง
      // — เอกสารร่วมเปิดผ่าน fileUrl ตรง ไม่ผ่าน proxy stream (ดู entityDocuments)
      .from('attachments').select('id, fileName, docType, createdAt, metadata, fileUrl')
      .eq('entityType', 'deal').eq('entityId', dealId);
    raise('อ่านไฟล์แนบของดีลไม่สำเร็จ', attError);

    // 2) ไฟล์ที่แนบมากับข้อความในความเคลื่อนไหว — **ไฟล์ของดีลวันนี้อยู่ที่นี่จริง ๆ**
    const { data: updates, error: updError } = await supabase
      // 🐞 คอลัมน์จริงชื่อ `authorName` — เดิมเขียน `userName` ⇒ แท็บเอกสารของดีล
      // **ตอบ 500 ทั้งแท็บ** ทุกดีลที่มีความเคลื่อนไหว (เจอตอนเดินวง ม-88)
      .from('entity_updates').select('id, attachments, createdAt, "authorName"')
      .eq('entityType', 'deal').eq('entityId', dealId)
      .not('attachments', 'is', null);
    raise('อ่านไฟล์ในความเคลื่อนไหวไม่สำเร็จ', updError);
    const threadAttachments = (updates || []).flatMap((u) => (
      (Array.isArray(u.attachments) ? u.attachments : []).map((a, i) => ({
        id: `${u.id}:${i}`,
        fileName: a?.fileName || a?.name || null,
        fileUrl: a?.fileUrl || a?.url || null,
        byName: u.authorName || null,
        createdAt: u.createdAt,
      }))
    ));

    // 3–4) ใบเสนอราคา / ใบสั่งขาย → ฉบับที่ออกจริง + หลักฐานปิดการขาย
    // 🐞 เลขที่เอกสารของสองตารางนี้ชื่อ `quoteNumber`/`orderNumber` — เดิมเขียน
    // `docNo` ทั้งคู่ ⇒ แท็บเอกสารของดีล **ตอบ 500 ทุกดีลที่มี QT** มาตั้งแต่ P5b
    // (เจอตอนเดินวง ม-88 — จอนี้ไม่เคยถูกเปิดกับดีลจริงเลย)
    const [{ data: quotations, error: qtError }, { data: salesOrders, error: soError }] =
      await Promise.all([
        supabase.from('quotations').select('id, "quoteNumber", "wonAttachments", "createdAt"').eq('dealId', dealId),
        supabase.from('sales_orders').select('id, "orderNumber", "createdAt"').eq('dealId', dealId),
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
        .select('id, "quotationId", "salesOrderId", "documentNumber", "issuedAt", "createdAt"')
        .or([
          qtIds.length ? `quotationId.in.(${qtIds.join(',')})` : null,
          soIds.length ? `salesOrderId.in.(${soIds.join(',')})` : null,
        ].filter(Boolean).join(','));
      raise('อ่านฉบับที่ออกจริงไม่สำเร็จ', issuedError);
      issued = (rows || []).map((d) => ({
        ...d,
        title: d.documentNumber || 'ฉบับที่ออกจริง',
        // ⚠️ ฉบับที่ออกจริงเป็น **HTML ไม่ใช่ PDF** — ป้ายบนปุ่มห้ามเขียน "ดาวน์โหลด"
        href: `/api/issued-documents/${d.id}`,
      }));
    }

    const wonAttachments = (quotations || []).flatMap((q) => (
      (Array.isArray(q.wonAttachments) ? q.wonAttachments : []).map((a, i) => ({
        id: `${q.id}:${i}`,
        fileName: a?.fileName || a?.name || null,
        fileUrl: a?.fileUrl || a?.url || null,
        docNo: q.quoteNumber || null,
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
      .from('dept_requests').select('id, status, "docNo"').eq('dealId', dealId);
    raise('อ่านคำร้องของดีลไม่สำเร็จ', reqError);
    const openRequestIds = (requests || [])
      .filter((r) => !['cancelled'].includes(r.status)).map((r) => r.id);
    let awaitingRequestItems = [];
    let requestItemFiles = [];
    if (openRequestIds.length) {
      const { data: items, error: itemError } = await supabase
        .from('dept_request_items')
        .select('id, requestId, docType, spec, answerStatus, readyAt, createdAt')
        .in('requestId', openRequestIds).eq('lineKind', 'document');
      raise('อ่านบรรทัดขอเอกสารไม่สำเร็จ', itemError);
      // ⭐ เกณฑ์เดียวกับแถบตัวเลขในใบคำร้อง (ม-85): "ยังไม่มา" = แถวยังเดินอยู่
      // (`answerStatus` ยังไม่ done/declined) — ไม่ใช่ `!readyAt`
      // 🐞 เดิมสองที่นิยามคนละแบบ: ฝ่ายกดส่งของแล้ว หน้าดีลบอกว่ามาแล้ว แต่ในใบ
      // ยังนับเป็น "รอเอกสาร" — จอเดียวกันเรื่องเดียวกัน ตอบคนละคำตอบ
      // · declined ไม่นับเป็น "รอ" — จบแล้วแบบไม่ได้ของ ค้างเป็นรายการรอตลอดกาล
      // คือสิ่งที่ทำให้ตัวเลขบนหน้าดีลไม่มีใครเชื่อ
      awaitingRequestItems = (items || [])
        .filter((i) => !['done', 'declined'].includes(i.answerStatus));

      // ⭐ 6.5) ไฟล์ที่ฝ่ายแนบบนแถวคำร้องแล้วส่งมา (ม-88) — "RD แนบเอกสาร →
      // เอกสารไปสู่แท็บเอกสารในโครงการ/ดีลนั้นด้วย" · เอาเฉพาะแถวที่ **ส่งแล้ว**
      // (readyAt) — ไฟล์บนแถวที่ยังทำอยู่เป็นของระหว่างทาง ยังไม่ใช่เอกสารที่ได้
      const sentItems = (items || []).filter((i) => i.readyAt);
      if (sentItems.length) {
        const requestById = new Map((requests || []).map((r) => [r.id, r]));
        const { data: files, error: fileError } = await supabase
          .from('attachments')
          .select('id, "entityId", "fileName", "createdAt"')
          .eq('entityType', 'dept_request_item')
          .in('entityId', sentItems.map((i) => i.id));
        raise('อ่านไฟล์ของแถวคำร้องไม่สำเร็จ', fileError);
        const itemById = new Map(sentItems.map((i) => [i.id, i]));
        requestItemFiles = (files || []).map((f) => {
          const item = itemById.get(f.entityId);
          return {
            id: f.id,
            fileName: f.fileName || null,
            docType: item?.docType || null,
            requestDocNo: requestById.get(item?.requestId)?.docNo || null,
            createdAt: f.createdAt || null,
          };
        });
      }
    }

    return {
      attachments: attachments || [],
      threadAttachments,
      issued,
      wonAttachments,
      checklist: checklist || [],
      requestItemFiles,
      awaitingRequestItems,
    };
}

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const url = new URL(req.url);
  const dealId = url.searchParams.get('dealId');
  const projectId = url.searchParams.get('projectId');
  if (!dealId && !projectId) return badRequest('dealId or projectId is required');

  try {
    // ── โหมดดีลเดียว (แท็บเอกสารบนหน้าดีล) ────────────────────────────────
    if (dealId) {
      const { row: deal, response } = await loadScoped(supabase, 'sales_deals', dealId, user, 'view');
      if (response) return response;
      const raw = await collectDealDocuments(supabase, dealId);
      await grantDocAccess(supabase, raw.attachments, user, inSalesEditScope(user, deal));
      const rows = buildEntityDocuments(raw);
      return ok({ rows, progress: entityDocumentProgress(rows) });
    }

    // ── โหมดโครงการ (ม-88) — รวมของทุกดีลในโครงการ ─────────────────────────
    // ⚠️ กรองดีลด้วยขอบเขตการเห็นรายใบ (ไม่ใช่เช็คแค่โครงการ) — คนที่เห็นดีลได้
    // บางใบต้องได้เอกสารเฉพาะใบที่ตัวเองเห็น ไม่ใช่ทั้งโครงการ
    const { data: deals, error: dealsError } = await supabase
      .from('sales_deals').select('*').eq('projectId', projectId);
    raise('อ่านดีลของโครงการไม่สำเร็จ', dealsError);
    const visible = (deals || []).filter((deal) => inSalesViewScope(user, deal));
    const collected = await Promise.all(
      visible.map((deal) => collectDealDocuments(supabase, deal.id).then((raw) => ({ deal, raw }))),
    );
    for (const { deal, raw } of collected) {
      await grantDocAccess(supabase, raw.attachments, user, inSalesEditScope(user, deal));
    }
    const dealRows = collected.flatMap(({ deal, raw }) => buildEntityDocuments(raw)
      // บอกด้วยว่าแถวนี้มาจากดีลไหน — โครงการมีหลายดีล แถวลอย ๆ อ่านไม่ออกว่าของใคร
      .map((row) => ({
        ...row,
        id: `${deal.id}:${row.id}`,
        note: [row.note, deal.title].filter(Boolean).join(' · '),
      })));

    // ⭐ เอกสารร่วมของ **ตัวโครงการเอง** (เฟส 2) — ไม่ได้ผูกดีลใบไหน จึงไม่มีทาง
    // โผล่จากการวนอ่านดีลข้างบน · แถวพวกนี้ไม่มีชื่อดีลต่อท้ายโดยตั้งใจ: มันเป็นของ
    // ทั้งโครงการ ไม่ใช่ของดีลใดใบหนึ่ง
    // ⚠️ อ่านได้ก็ต่อเมื่อเห็นตัวโครงการ — ไม่พ่วงกับสิทธิ์ของดีลข้างใน
    const { data: project, error: projectError } = await supabase
      .from('projects').select('*').eq('id', projectId).maybeSingle();
    raise('อ่านโครงการไม่สำเร็จ', projectError);
    let projectRows = [];
    if (project && inSalesViewScope(user, project)) {
      const { data: projectAttachments, error: projectAttError } = await supabase
        .from('attachments').select('id, fileName, docType, createdAt, metadata, fileUrl')
        .eq('entityType', 'project').eq('entityId', projectId);
      raise('อ่านเอกสารร่วมของโครงการไม่สำเร็จ', projectAttError);
      await grantDocAccess(supabase, projectAttachments, user, inSalesEditScope(user, project));
      projectRows = buildEntityDocuments({ attachments: projectAttachments || [] });
    }

    const rows = [...projectRows, ...dealRows];
    return ok({ rows, progress: entityDocumentProgress(rows) });
  } catch (e) {
    return fail(e.message, 500);
  }
});
