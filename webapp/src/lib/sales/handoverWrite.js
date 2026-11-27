// ── เขียนการส่งต่องาน (ฝั่ง server) — ตัวคิดอยู่ที่ `handover.js` ───────────────────────────────
//
// หนึ่งคำขอส่งต่อ = หนึ่งรายการ (ดีลหนึ่งใบ หรือลีดหนึ่งใบ) · route วนเรียกทีละรายการแล้วตอบผลรายตัว
// ⇒ รายการหนึ่งพังไม่ล้มรายการอื่น และจอรู้ว่าแถวไหนหายได้ แถวไหนต้องค้างไว้พร้อมเหตุ
//
// ⚠️ PostgREST ไม่มีทรานแซกชันคร่อมหลายคำขอ — ลำดับเขียนตั้งใจให้ "พังครึ่งทาง" ยังอ่านออก:
//    แถวดีลก่อน (มีด่าน optimistic: เจ้าของเดิม + ขั้นเดิม) → SO/สัญญาที่ย้ายตาม → audit → เธรด
//    SO/สัญญาย้ายไม่สำเร็จ = ดีลย้ายไปแล้ว ⇒ คืน `warning` (ไม่ใช่ error) ให้จอบอก แบบเดียวกับ PATCH ดีล
// ⚠️ ทุกตัวที่เขียนฐานนอกจาก `supabase` (audit · เธรด) รับเป็นพารามิเตอร์ — เทสต์ห้ามแตะฐานจริง (AGENTS.md)
import { validateDealOwner } from '@/lib/sales/dealOwner';
import { resolveDealPeople } from '@/lib/sales/dealPeople';
import { validateLeadAssignee } from '@/lib/sales/leadAssignee';
import { LEAD_CLOSED_STATUSES } from '@/lib/sales/leads';
import { genId } from '@/lib/id';
import {
  dealHandoverGroup, isHandoverEligible, planDealHandover, handoverMetadata,
  MOVABLE_ORDER_STATUSES, OPEN_CONTRACT_STATUSES, SIGNED_CONTRACT_STATUSES,
} from '@/lib/sales/handover';
import { loadDealDocs } from '@/lib/sales/handoverRead';

/* kind ของกระดิ่งคนรับ — ต้องอยู่ใน HANDOVER_BELL_KINDS (lib/notifications.js) ไม่งั้นเขียนลงตารางแต่ไม่โผล่ในกระดิ่ง
   (Next ห้าม route.js ส่งออกชื่ออื่นนอกจากเมธอด/ค่าตั้งค่า จึงอยู่ที่นี่) */
export const HANDOVER_NOTIFY_KIND = 'sales_handover';

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const dealLabel = (deal) => deal?.code || deal?.title || deal?.id;

/**
 * ส่งต่อดีลหนึ่งใบ
 * @param input `{ dealId, toUserId, team, acOwnerId?, aeSupervisorId?, note? }` — ไม่ส่ง AC/Sup = คงคนเดิม
 * @param ctx `{ actor, request, audit, appendUpdate, now }`
 * @returns `{ ok: true, deal, moved: { orders, contracts }, warning? } | { ok: false, status, error }`
 */
export async function handoverDeal(supabase, input = {}, ctx = {}) {
  const { actor, request = null, audit, appendUpdate, now = new Date().toISOString() } = ctx;
  const dealId = String(input.dealId || '').trim();
  if (!dealId) return { ok: false, status: 400, error: 'ต้องระบุดีล' };

  const { data: deal, error: readError } = await supabase.from('sales_deals').select('*').eq('id', dealId).maybeSingle();
  if (readError) return { ok: false, status: 500, error: `อ่านดีลไม่สำเร็จ: ${readError.message}` };
  if (!deal) return { ok: false, status: 404, error: 'ไม่พบดีล' };

  let docs;
  try {
    docs = await loadDealDocs(supabase, [deal.id]);
  } catch (e) {
    return { ok: false, status: 500, error: e.message };
  }
  const orders = docs.orders.get(deal.id) || [];
  const contracts = docs.contracts.get(deal.id) || [];
  const verdict = dealHandoverGroup(deal, { orders, contracts, installmentsByOrder: docs.installmentsByOrder });
  if (!isHandoverEligible(verdict.group)) {
    const why = verdict.group === 'container'
      ? 'ดีลของใบสั่งขายย้อนหลังย้ายเจ้าของได้ที่หน้าดีลทีละใบ (ต้องตรวจดีลภาชนะของลูกค้ารายเดียวกัน)'
      : verdict.group === 'lost' ? 'ดีลนี้ปิดเป็น Lost แล้ว — อยู่กับคนเดิม' : 'ดีลนี้งานจบแล้ว — ไม่มีงานให้ส่งต่อ';
    return { ok: false, status: 409, error: why };
  }

  const toUserId = String(input.toUserId || '').trim();
  if (toUserId && toUserId === String(deal.ownerId || '')) {
    return { ok: false, status: 400, error: 'คนรับเป็นเจ้าของดีลนี้อยู่แล้ว — เลือกคนอื่น' };
  }
  const picked = await validateDealOwner(supabase, toUserId, actor, input.team || deal.team || null);
  if (!picked.ok) return { ok: false, status: 400, error: picked.error };

  /* AC / Sup — เลือกได้ทุกครั้ง (มติ 27/11 ข้อ 7) · ไม่ส่ง = คงคนเดิม
     ⚠️ ทีมเปลี่ยน = AC เดิมต้องผ่านด่านทีมใหม่ด้วย (AC ต้องอยู่ทีมเดียวกับดีล) ⇒ ตรวจคนเดิมซ้ำแม้ไม่ได้ส่งมา */
  const peopleBody = {};
  if (has(input, 'acOwnerId')) peopleBody.acOwnerId = input.acOwnerId;
  else if (picked.team && picked.team !== deal.team && deal.acOwnerId) peopleBody.acOwnerId = deal.acOwnerId;
  if (has(input, 'aeSupervisorId')) peopleBody.aeSupervisorId = input.aeSupervisorId;
  const people = await resolveDealPeople(supabase, { body: peopleBody, current: deal, team: picked.team || deal.team, required: false });
  if (!people.ok) return { ok: false, status: 400, error: people.error };

  const patch = {
    ownerId: picked.ownerId,
    ownerName: picked.ownerName,
    ...(picked.team ? { team: picked.team } : {}),
    ...people.patch,
    metadata: handoverMetadata(deal.metadata, deal.ownerId, picked.ownerId),
    updatedAt: now,
  };
  /* ด่าน optimistic — เจ้าของเดิม + ขั้นเดิม: ระหว่างที่หน้าต่างเปิดค้าง มีคนย้าย/ปิดดีลไปแล้ว = ไม่เขียนทับ */
  let query = supabase.from('sales_deals').update(patch).eq('id', deal.id).eq('stage', deal.stage);
  query = deal.ownerId ? query.eq('ownerId', deal.ownerId) : query.is('ownerId', null);
  const { data: after, error: writeError } = await query.select('*').maybeSingle();
  if (writeError) return { ok: false, status: 500, error: `ส่งต่อดีลไม่สำเร็จ: ${writeError.message}` };
  if (!after) return { ok: false, status: 409, error: 'ดีลถูกแก้ไขพร้อมกัน (เจ้าของหรือขั้นเปลี่ยนระหว่างนั้น) — รีเฟรชแล้วลองใหม่' };

  /* ── ของที่ย้ายตาม ── */
  const plan = planDealHandover({ orders, contracts });
  const warnings = [];
  const moved = { orders: [], contracts: [] };
  const team = after.team || null;
  if (plan.orderIds.length) {
    const { data, error } = await supabase.from('sales_orders')
      .update({ createdBy: picked.ownerId, createdByName: picked.ownerName, updatedAt: now })
      .in('id', plan.orderIds).in('status', [...MOVABLE_ORDER_STATUSES])
      .select('id, "orderNumber", status');
    if (error) warnings.push(`ผู้สร้างใบสั่งขายที่ยังไม่อนุมัติยังเป็นคนเดิม: ${error.message}`);
    else moved.orders = data || [];
  }
  if (plan.openContractIds.length) {
    const { data, error } = await supabase.from('sales_contracts')
      .update({ ownerId: picked.ownerId, ownerName: picked.ownerName, createdBy: picked.ownerId, createdByName: picked.ownerName, ...(team ? { team } : {}), updatedAt: now })
      .in('id', plan.openContractIds).in('status', [...OPEN_CONTRACT_STATUSES])
      .select('id, "contractNo", status');
    if (error) warnings.push(`ผู้ดูแลสัญญาที่ยังไม่จบยังเป็นคนเดิม: ${error.message}`);
    else moved.contracts.push(...(data || []));
  }
  if (plan.signedContractIds.length) {
    const { data, error } = await supabase.from('sales_contracts')
      .update({ ownerId: picked.ownerId, ownerName: picked.ownerName, ...(team ? { team } : {}), updatedAt: now })
      .in('id', plan.signedContractIds).in('status', [...SIGNED_CONTRACT_STATUSES])
      .select('id, "contractNo", status');
    if (error) warnings.push(`ผู้ดูแลสัญญาที่ลงนามแล้วยังเป็นคนเดิม: ${error.message}`);
    else moved.contracts.push(...(data || []));
  }

  const fromName = deal.ownerName || 'ไม่ระบุ';
  const movedText = [
    moved.orders.length ? `ใบสั่งขายที่ยังไม่อนุมัติ ${moved.orders.length} ใบ` : '',
    moved.contracts.length ? `สัญญา ${moved.contracts.length} ใบ` : '',
  ].filter(Boolean).join(' · ');
  const note = String(input.note || '').trim().slice(0, 1000);
  await audit?.({
    user: actor, action: 'update', entityType: 'sales_deal', entityId: deal.id, before: deal, after,
    summary: `ส่งต่องาน ${dealLabel(deal)}: ${fromName} → ${after.ownerName}${movedText ? ` · ย้ายตาม ${movedText}` : ''}${note ? ` · หมายเหตุ: ${note}` : ''}`,
    request,
  });
  for (const order of moved.orders) {
    await audit?.({
      user: actor, action: 'update', entityType: 'sales_order', entityId: order.id,
      summary: `ผู้สร้าง ${order.orderNumber || order.id} ย้ายตามการส่งต่อดีล ${dealLabel(deal)}: ${fromName} → ${after.ownerName}`,
      request,
    });
  }
  for (const contract of moved.contracts) {
    await audit?.({
      user: actor, action: 'update', entityType: 'sales_contract', entityId: contract.id,
      summary: `ผู้ดูแลสัญญา ${contract.contractNo || contract.id} ย้ายตามการส่งต่อดีล ${dealLabel(deal)}: ${fromName} → ${after.ownerName}`,
      request,
    });
  }
  /* เธรดของดีล — สมุดความเคลื่อนไหว (ชนิด `handover` เงียบ: กระดิ่งของคนรับยิงจาก route ครั้งเดียวต่อคน) */
  await appendUpdate?.(supabase, {
    entityType: 'deal', entityId: deal.id, kind: 'handover', user: actor,
    body: `ส่งต่องานจาก ${fromName} ให้ ${after.ownerName}${after.team && after.team !== deal.team ? ` (ย้ายทีม ${deal.team || '—'} → ${after.team})` : ''}${movedText ? ` · ย้ายตาม ${movedText}` : ''}${note ? `\nหมายเหตุ: ${note}` : ''}`,
    meta: { fromId: deal.ownerId || null, toId: after.ownerId, orders: moved.orders.map((o) => o.id), contracts: moved.contracts.map((c) => c.id) },
  });

  return {
    ok: true,
    deal: { id: after.id, code: after.code || null, title: after.title || null, ownerId: after.ownerId, ownerName: after.ownerName, team: after.team || null },
    from: { id: deal.ownerId || null, name: deal.ownerName || null },
    moved: { orders: moved.orders.length, contracts: moved.contracts.length },
    ...(warnings.length ? { warning: warnings.join(' · ') } : {}),
  };
}

/**
 * ส่งต่อลีดหนึ่งใบ — ด่านคนรับตัวเดียวกับ "เปลี่ยนผู้รับผิดชอบ" ของหน้าลีด (validateLeadAssignee)
 * @param input `{ leadId, toUserId, team? }` — ทีมเปลี่ยนได้ (คนรับต้องอยู่ทีมนั้น)
 */
export async function handoverLead(supabase, input = {}, ctx = {}) {
  const { actor, request = null, audit, now = new Date().toISOString() } = ctx;
  const leadId = String(input.leadId || '').trim();
  if (!leadId) return { ok: false, status: 400, error: 'ต้องระบุลีด' };
  const { data: lead, error: readError } = await supabase.from('sales_leads').select('*').eq('id', leadId).maybeSingle();
  if (readError) return { ok: false, status: 500, error: `อ่านลีดไม่สำเร็จ: ${readError.message}` };
  if (!lead) return { ok: false, status: 404, error: 'ไม่พบลีด' };
  if (LEAD_CLOSED_STATUSES.includes(lead.status)) return { ok: false, status: 409, error: 'ลีดนี้ปิดแล้ว — อยู่กับคนเดิม' };

  const team = String(input.team || lead.team || '').trim() || null;
  let assignee;
  try {
    assignee = await validateLeadAssignee(supabase, input.toUserId, { ...lead, team });
  } catch (e) {
    return { ok: false, status: 500, error: e.message };
  }
  if (!assignee.ok) return { ok: false, status: 400, error: assignee.error };
  if (assignee.assigneeId === lead.assigneeId) return { ok: false, status: 400, error: 'คนรับถือลีดใบนี้อยู่แล้ว — เลือกคนอื่น' };

  /* ⚠️ รีเซ็ตนาฬิกาติดต่อกลับเฉพาะใบที่ยังไม่ได้ติดต่อ — กติกาเดียวกับ reassign ของหน้าลีด (ดู transition route) */
  const patch = { assigneeId: assignee.assigneeId, assigneeName: assignee.assigneeName, team, updatedAt: now };
  if (!lead.firstContactAt) patch.assignedAt = now;
  let query = supabase.from('sales_leads').update(patch).eq('id', lead.id).eq('status', lead.status);
  query = lead.assigneeId ? query.eq('assigneeId', lead.assigneeId) : query.is('assigneeId', null);
  const { data: after, error } = await query.select('*').maybeSingle();
  if (error) return { ok: false, status: 500, error: `ส่งต่อลีดไม่สำเร็จ: ${error.message}` };
  if (!after) return { ok: false, status: 409, error: 'ลีดถูกแก้ไขพร้อมกัน — รีเฟรชแล้วลองใหม่' };

  const reason = `ส่งต่องานจาก ${lead.assigneeName || 'ไม่ระบุ'} ให้ ${assignee.assigneeName}`;
  const { error: eventError } = await supabase.from('lead_events').insert({
    id: genId('LEV'), leadId: lead.id, kind: 'reassign', fromStatus: lead.status, toStatus: lead.status,
    assigneeId: assignee.assigneeId, assigneeName: assignee.assigneeName, reason,
    createdBy: actor?.id || null, createdByName: actor?.name || null,
  });
  if (eventError) console.error(`[handover] บันทึกประวัติลีด ${lead.id} ไม่สำเร็จ:`, eventError.message);
  await audit?.({
    user: actor, action: 'update', entityType: 'sales_lead', entityId: lead.id, before: lead, after,
    summary: `ลีด ${lead.contactName || lead.company || lead.id}: ${reason}`, request,
  });
  return {
    ok: true,
    lead: { id: after.id, company: after.company || null, contactName: after.contactName || null, assigneeId: after.assigneeId, assigneeName: after.assigneeName, team: after.team || null },
    from: { id: lead.assigneeId || null, name: lead.assigneeName || null },
    ...(eventError ? { warning: `ย้ายลีดแล้ว แต่ลงประวัติลีดไม่สำเร็จ: ${eventError.message}` } : {}),
  };
}

/**
 * กระดิ่งคนรับ — หนึ่งคนหนึ่งกระดิ่งต่อคำขอ (โอนทีละ 30 ใบ ต้องไม่ได้ 30 กระดิ่ง)
 * @param results ผลที่สำเร็จ `[{ kind: 'deal'|'lead', toId, toName, label, id, fromName }]`
 * @returns `[{ userId, entityType, entityId, title, body, href }]` — ป้อน notifyUsers ทีละตัว
 */
export function handoverNotices(results = [], { actorName = null } = {}) {
  const byUser = new Map();
  for (const r of results) {
    if (!r?.toId) continue;
    if (!byUser.has(r.toId)) byUser.set(r.toId, []);
    byUser.get(r.toId).push(r);
  }
  return [...byUser.entries()].map(([userId, rows]) => {
    const froms = [...new Set(rows.map((r) => r.fromName).filter(Boolean))];
    const fromText = froms.length ? ` จาก ${froms.join(', ')}` : '';
    if (rows.length === 1) {
      const [r] = rows;
      return {
        userId,
        entityType: r.kind === 'lead' ? 'lead' : 'deal',
        entityId: r.id,
        title: `ได้รับงานส่งต่อ: ${r.label}`,
        body: `${r.kind === 'lead' ? 'ลีด' : 'ดีล'}${fromText}${actorName ? ` · ส่งต่อโดย ${actorName}` : ''}`,
        href: r.kind === 'lead' ? `/sa/leads/${r.id}` : `/sa/deals/${r.id}`,
      };
    }
    const deals = rows.filter((r) => r.kind === 'deal').length;
    const leads = rows.length - deals;
    return {
      userId,
      entityType: 'deal',
      entityId: rows.find((r) => r.kind === 'deal')?.id || rows[0].id,
      title: `ได้รับงานส่งต่อ ${rows.length} รายการ${fromText}`,
      body: [deals ? `ดีล ${deals} ใบ` : '', leads ? `ลีด ${leads} ใบ` : '', actorName ? `ส่งต่อโดย ${actorName}` : ''].filter(Boolean).join(' · '),
      href: deals ? '/sa/deals' : '/sa/leads',
    };
  });
}
