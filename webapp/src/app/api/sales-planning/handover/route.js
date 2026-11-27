// ── ส่งต่องานบริหารงานขาย (มติเจ้าของ 27/11/2026 · docs/sales-handover.md) ──────────────────────────
//
// GET  ?from=<userId> | ?customerId=<id> | ?dealId=<id>  → รายการที่ต้องส่งต่อ (หน้าต่างเลือกตัวเดียวกันทั้งสามที่)
// POST { items: [{ kind: 'deal'|'lead', id, toUserId, team, acOwnerId?, aeSupervisorId? }], note? }
//      → ผลรายตัว `{ results: [{ kind, id, ok, error?, warning?, ... }] }` · รายการหนึ่งพังไม่ล้มรายการอื่น
//
// ⭐ สิทธิ์: AE Supervisor + Admin (`canHandoverSalesWork`) — ไม่ผ่าน = 403 ทั้งสองเมธอด
//    หน้าโอนงานคนลาออก (/users/:id/handover) เปิดได้เฉพาะคนถือ users:manage (แอดมิน) — ด่านอยู่ที่หน้า
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { appendUpdate } from '@/lib/master/updates';
import { notifyUsers } from '@/lib/notifications';
import { canHandoverSalesWork } from '@/lib/sales/handover';
import { listHandoverItems } from '@/lib/sales/handoverRead';
import { handoverDeal, handoverLead, handoverNotices, HANDOVER_NOTIFY_KIND } from '@/lib/sales/handoverWrite';

export const dynamic = 'force-dynamic';

/* เพดานต่อคำขอ — หน้าโอนงานส่งทีละแถวหรือทีละชุดที่ติ๊ก · คนหนึ่งคนถือดีลเปิด + Won ค้างราว 50–60 ใบ */
const MAX_ITEMS = 200;

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canHandoverSalesWork(user)) return forbidden('ส่งต่องานได้เฉพาะ AE Supervisor หรือ Admin');
  const params = new URL(req.url).searchParams;
  const fromId = params.get('from') || null;
  const customerId = params.get('customerId') || null;
  const dealId = params.get('dealId') || null;
  if ([fromId, customerId, dealId].filter(Boolean).length !== 1) {
    return badRequest('ระบุอย่างใดอย่างหนึ่ง: from (คน) · customerId (ลูกค้า) · dealId (ดีล)');
  }
  try {
    return ok(await listHandoverItems(supabase, { fromId, customerId, dealId }));
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canHandoverSalesWork(user)) return forbidden('ส่งต่องานได้เฉพาะ AE Supervisor หรือ Admin');
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return badRequest('ยังไม่ได้เลือกรายการที่จะส่งต่อ');
  if (items.length > MAX_ITEMS) return badRequest(`ส่งต่อได้ครั้งละไม่เกิน ${MAX_ITEMS} รายการ`);
  const note = typeof body.note === 'string' ? body.note : '';

  const ctx = { actor: user, request: req, audit: recordAudit, appendUpdate };
  const results = [];
  for (const item of items) {
    const kind = item?.kind;
    const base = { kind, id: item?.id || null };
    if (kind === 'deal') {
      const input = { dealId: item.id, toUserId: item.toUserId, team: item.team || null, note };
      if (Object.prototype.hasOwnProperty.call(item, 'acOwnerId')) input.acOwnerId = item.acOwnerId;
      if (Object.prototype.hasOwnProperty.call(item, 'aeSupervisorId')) input.aeSupervisorId = item.aeSupervisorId;
      const r = await handoverDeal(supabase, input, ctx);
      results.push(r.ok
        ? { ...base, ok: true, label: r.deal.code || r.deal.title, toId: r.deal.ownerId, toName: r.deal.ownerName, team: r.deal.team, fromName: r.from.name, moved: r.moved, ...(r.warning ? { warning: r.warning } : {}) }
        : { ...base, ok: false, status: r.status, error: r.error });
    } else if (kind === 'lead') {
      const r = await handoverLead(supabase, { leadId: item.id, toUserId: item.toUserId, team: item.team || null }, ctx);
      results.push(r.ok
        ? { ...base, ok: true, label: r.lead.company || r.lead.contactName, toId: r.lead.assigneeId, toName: r.lead.assigneeName, team: r.lead.team, fromName: r.from.name, ...(r.warning ? { warning: r.warning } : {}) }
        : { ...base, ok: false, status: r.status, error: r.error });
    } else {
      results.push({ ...base, ok: false, status: 400, error: 'ชนิดรายการไม่ถูกต้อง (ดีล หรือ ลีด)' });
    }
  }

  /* กระดิ่งคนรับ — หนึ่งคนหนึ่งกระดิ่งต่อคำขอ · notifyUsers ไม่ throw (พลาดแค่ log) */
  for (const notice of handoverNotices(results.filter((r) => r.ok), { actorName: user.name || null })) {
    await notifyUsers(supabase, {
      userIds: [notice.userId], entityType: notice.entityType, entityId: notice.entityId,
      kind: HANDOVER_NOTIFY_KIND, title: notice.title, body: notice.body, href: notice.href, actorName: user.name || null,
    });
  }

  const done = results.filter((r) => r.ok).length;
  return ok({ results, done, failed: results.length - done });
});
