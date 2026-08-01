import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { can, inPmProjectScope } from '@/lib/permissions';
import { loadProject } from '@/lib/pm/projectsRepo';
import { recordAudit } from '@/lib/audit';
import { sendChat, chatCard } from '@/lib/chat';
import {
  canApproveProjectClose, canProjectCloseTransition, isValidCloseType, PROJECT_CLOSE_TYPE_LABELS,
} from '@/lib/pm/projectClose';
import { summarizeProjectCloseReadiness } from '@/lib/pm/projectCloseReadiness';
import { projectCloseUpdate } from '@/lib/pm/projectUpdates';
import { appendUpdate } from '@/lib/master/updates';
import { loadHandoffQueue } from '@/lib/sales/handoffQueueData';

export const dynamic = 'force-dynamic';

// GET /api/pm/projects/[id]/close — "ยังมีอะไรค้าง" ก่อนปิด (มติ B3: เตือนแต่ไม่บล็อก)
// ทั้งคนขอปิดและคนอนุมัติเห็นชุดเดียวกัน ตัวเลขไม่ได้เป็นเงื่อนไขของ POST แต่อย่างใด
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  const { id: idOrCode } = await ctx.params;
  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound('ไม่พบโครงการ');

  const { data: deals, error: dealError } = await supabase
    .from('sales_deals').select('id').eq('projectId', project.id);
  if (dealError) return fail(dealError.message, 500);
  const dealIds = (deals || []).map((deal) => deal.id);

  try {
    // สองตัวแรกมาจากตัวตัดสินกลางของคิวรอยต่อ (lib/sales/handoffQueue) — คำเตือนตอนปิด
    // กับการ์ดคิวบนแดชบอร์ดต้องนับด้วยกติกาเดียวกัน ไม่งั้นสองที่บอกไม่ตรงกัน
    const handoff = await loadHandoffQueue(supabase, { dealIds });
    const { data: salesOrders, error: orderError } = dealIds.length
      ? await supabase.from('sales_orders')
        .select('id, orderNumber, status, supersededById').in('dealId', dealIds)
      : { data: [], error: null };
    if (orderError) throw orderError;
    const orderIds = (salesOrders || []).map((order) => order.id);
    const { data: filings, error: filingError } = orderIds.length
      ? await supabase.from('orders').select('id, status, salesOrderId').in('salesOrderId', orderIds)
      : { data: [], error: null };
    if (filingError) throw filingError;

    return ok(summarizeProjectCloseReadiness({
      awaitingSalesOrder: handoff.awaitingSalesOrder,
      awaitingFiling: handoff.awaitingFiling,
      salesOrders: salesOrders || [],
      filings: filings || [],
    }));
  } catch (readinessError) {
    return fail(`ตรวจงานค้างก่อนปิดโครงการไม่สำเร็จ: ${readinessError.message}`, 500);
  }
});

// POST /api/pm/projects/[id]/close — ด่านอนุมัติปิดโครงการ (เฟส F, มติ 2026-07-18).
// action: request | cancel_request | approve | reject | reopen
//   request        = ผู้ดูแลโครงการขอปิด (เลือก completed/cancelled + เหตุผล)
//   approve/reject = AE Supervisor/admin (ไม่ใช่ผู้ขอ — แบ่งแยกหน้าที่เหมือน SO)
//   reopen         = AE Supervisor/admin เปิดโครงการที่ปิดแล้วกลับมา (รองรับ RE-ORDER)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  const { id: idOrCode } = await ctx.params;
  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound('ไม่พบโครงการ');
  const id = project.id;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const approver = canApproveProjectClose(user);
  const closeStatus = project.closeStatus || 'open';

  if (!canProjectCloseTransition(closeStatus, action, { approver })) {
    return badRequest(`โครงการสถานะ "${closeStatus}" ทำ "${action}" ไม่ได้`);
  }

  const now = new Date().toISOString();
  let patch = { updatedAt: now };
  let summary = '';
  let chat = null;

  if (action === 'request') {
    // ผู้ดูแลโครงการ (pm:edit + scope) ขอปิด
    if (!can(user.role, 'pm:edit') || !inPmProjectScope(user, project)) return forbidden('ขอปิดโครงการได้เฉพาะผู้ดูแลโครงการ');
    const closeType = String(body.closeType || '').trim();
    const reason = String(body.reason || '').trim();
    if (!isValidCloseType(closeType)) return badRequest('เลือกประเภทการปิด (ปิดสำเร็จ / ยกเลิก)');
    if (!reason) return badRequest('ระบุเหตุผล/สรุปการปิดโครงการ');
    patch = {
      ...patch,
      closeStatus: 'pending_close', closeType, closeReason: reason,
      closeRequestedAt: now, closeRequestedBy: user.id || null, closeRequestedByName: user.name || null,
    };
    summary = `ขอปิดโครงการ ${project.code || id} (${PROJECT_CLOSE_TYPE_LABELS[closeType]})`;
    chat = { space: 'approvals', title: '📋 ขออนุมัติปิดโครงการ', label: 'ประเภท', value: PROJECT_CLOSE_TYPE_LABELS[closeType] };
  } else if (action === 'cancel_request') {
    // ผู้ขอถอนคำขอเอง หรือ approver
    const isRequester = project.closeRequestedBy && project.closeRequestedBy === user.id;
    if (!isRequester && !approver) return forbidden('ถอนคำขอปิดได้เฉพาะผู้ขอหรือผู้อนุมัติ');
    patch = { ...patch, closeStatus: 'open', closeRequestedAt: null, closeRequestedBy: null, closeRequestedByName: null };
    summary = `ถอนคำขอปิดโครงการ ${project.code || id}`;
  } else if (action === 'approve') {
    if (project.closeRequestedBy && project.closeRequestedBy === user.id) {
      return forbidden('อนุมัติปิดโครงการที่ตัวเองขอไม่ได้ — ต้องให้ผู้อนุมัติคนอื่น');
    }
    patch = { ...patch, closeStatus: 'closed', closedAt: now, closedBy: user.id || null, closedByName: user.name || null };
    summary = `อนุมัติปิดโครงการ ${project.code || id} (${PROJECT_CLOSE_TYPE_LABELS[project.closeType] || project.closeType})`;
    chat = { space: 'pm', title: '✅ ปิดโครงการแล้ว', label: 'ประเภท', value: PROJECT_CLOSE_TYPE_LABELS[project.closeType] || '' };
  } else if (action === 'reject') {
    if (project.closeRequestedBy && project.closeRequestedBy === user.id) {
      return forbidden('ตีกลับคำขอที่ตัวเองขอไม่ได้');
    }
    const reason = String(body.reason || '').trim();
    if (!reason) return badRequest('ระบุเหตุผลที่ตีกลับ');
    patch = {
      ...patch,
      closeStatus: 'open', closeReason: reason,
      closeRequestedAt: null, closeRequestedBy: null, closeRequestedByName: null,
    };
    summary = `ตีกลับคำขอปิดโครงการ ${project.code || id}: ${reason}`;
    chat = { space: 'pm', title: '↩️ ตีกลับคำขอปิดโครงการ', label: 'เหตุผล', value: reason };
  } else if (action === 'reopen') {
    const reason = String(body.reason || '').trim();
    if (!reason) return badRequest('ระบุเหตุผลที่เปิดโครงการใหม่ (เช่น RE-ORDER)');
    patch = {
      ...patch,
      closeStatus: 'open', closeType: null, closeReason: reason,
      closedAt: null, closedBy: null, closedByName: null,
      closeRequestedAt: null, closeRequestedBy: null, closeRequestedByName: null,
    };
    summary = `เปิดโครงการใหม่ ${project.code || id}: ${reason}`;
    chat = { space: 'pm', title: '🔓 เปิดโครงการใหม่', label: 'เหตุผล', value: reason };
  }

  const { data, error } = await supabase
    .from('projects').update(patch).eq('id', id).eq('closeStatus', closeStatus).select().maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return badRequest('สถานะการปิดโครงการเปลี่ยนแล้ว กรุณาโหลดใหม่');

  // จุดจบ (และจุดกลับมา) ของเส้นเรื่องโครงการ — ต้องอยู่ในเธรดที่คนอ่านกัน ไม่ใช่
  // เห็นเฉพาะใน audit log ซึ่งเปิดได้แค่ supervisor และไม่มีลิงก์จากหน้าโครงการ
  // ⚠️ เหตุผลอยู่ในตัวข้อความ ไม่ใช่ซ่อนใน meta (บทเรียนเหตุผลตีกลับของ QT/SO)
  await appendUpdate(supabase, {
    entityType: 'project', entityId: id,
    ...projectCloseUpdate(action, {
      closeType: data.closeType || project.closeType || null,
      reason: String(body.reason || '').trim(),
    }),
    user,
  });

  await recordAudit({ user, action: 'update', entityType: 'project', entityId: id, before: project, after: data, summary, request: req });

  if (chat) {
    sendChat(chat.space, chatCard({
      title: chat.title,
      subtitle: `${project.code || ''} ${project.name || ''}`.trim(),
      rows: [
        { label: chat.label, value: chat.value },
        { label: 'โดย', value: user.name || '' },
      ],
      linkPath: `/sa/projects/${id}`,
      linkLabel: 'เปิดโครงการ',
    }));
  }

  return ok(data);
});
