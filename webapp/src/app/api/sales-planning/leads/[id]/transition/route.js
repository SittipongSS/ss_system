import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { can, isSuperuser } from '@/lib/permissions';
import {
  LEAD_TRANSITIONS, TRANSITION_TO_STATUS, MEETING_MODES, canWorkLead,
  meetingTimesSinceBounce, pickNextMeetingAt,
} from '@/lib/sales/leads';
import { validateLeadAssignee } from '@/lib/sales/leadAssignee';
import { TEAMS, TEAM_LABELS } from '@/lib/permissions';
import { sendChat, chatCard } from '@/lib/chat';
import { notifyLeadHandoff } from '@/lib/sales/leadNotify';
import { loadUserDirectory } from '@/lib/usersRepo';

export const dynamic = 'force-dynamic';

/* เวลานัดที่ควรค้างบน `sales_leads.meetingAt` หลังบันทึกนัดใบใหม่ —
 * กติกาอยู่ที่ `meetingTimesSinceBounce` + `pickNextMeetingAt` ใน lib/sales/leads.js
 * (route เหลือหน้าที่เดียวคือดึงประวัติมาส่งต่อ) */
async function nextMeetingAt(supabase, leadId, addedAt, now) {
  const { data, error } = await supabase
    .from('lead_events')
    .select('kind, eventAt, createdAt')
    .eq('leadId', leadId)
    .in('kind', ['meeting', 'bounce'])
    .order('createdAt', { ascending: false });
  // อ่านประวัติไม่ได้ = ถอยไปใช้นัดที่เพิ่งบันทึก (พฤติกรรมเดิมก่อนมติ) ไม่ล้มทั้งรายการ
  if (error) console.error('[lead transition] อ่านประวัตินัดไม่สำเร็จ:', error.message);
  const previous = error ? [] : meetingTimesSinceBounce(data || []);
  return pickNextMeetingAt([...previous, addedAt].filter(Boolean), now) || addedAt || null;
}

// POST /api/sales-planning/leads/[id]/transition
// { action: screen|assign|contact|meeting|qualify|disqualify|bounce,
//   team?, assigneeId?, assigneeName?, reason?, meetingMode?, eventAt?, customerId? }
//
// กติกา role ต่อ action (เฟส C — ตามเส้นชีวิตในแผน):
//   screen     = supervisor/admin (คัดกรอง เลือกทีม — SLA 1 วันทำการ)
//   assign     = senior_ae/ac ของทีมนั้น + supervisor/admin (กระจายให้ AE)
//   contact    = ผู้รับมอบ (AE) / senior ทีม / admin (SLA 1 วันทำการ) — ต้องระบุหมายเหตุการติดต่อ (เก็บใน event.reason)
//     มติผู้ใช้ 2026-07-21: supervisor จบงานที่คัดกรอง ไม่ทำขั้นทำงานแทนทีม
//   meeting    = เดียวกับ contact (+ บันทึกรูปแบบนัด onsite/online — วัด KPI)
//   qualify    = เดียวกับ contact — ต้องระบุ customerId (เปิดลูกค้าในฐานข้อมูลก่อน)
//   disqualify = ขั้นกำกับดูแล: ทีมเจ้าของงาน + supervisor/admin — ต้องมีเหตุผล
//   bounce     = ทีมไม่ตรง → กลับคิวคัดกรอง (ล้างทีม/ผู้รับ) — ต้องมีเหตุผล
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'salesplan:lead')) return forbidden();

  const { id } = await ctx.params;
  const { data: lead, error: loadErr } = await supabase.from('sales_leads').select('*').eq('id', id).maybeSingle();
  if (loadErr) return fail(loadErr.message, 500);
  if (!lead) return notFound('ไม่พบลีด');

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const allowed = LEAD_TRANSITIONS[lead.status] || [];
  if (!allowed.includes(action)) {
    return badRequest(`ลีดสถานะ "${lead.status}" ทำ "${action}" ไม่ได้`);
  }

  const role = user.role;
  const superuser = isSuperuser(role);
  const inTeam = (role === 'senior_ae' || role === 'ac') && lead.team === user.team;
  const isAssignee = role === 'ae' && lead.assigneeId === user.id;
  // สองระดับ (มติผู้ใช้ 2026-07-21): ปุ่มกำกับดูแล (ตีกลับ/ไม่ไปต่อ) = ทีม + supervisor;
  // ขั้นทำงาน (ติดต่อ/นัด) = ทีมเจ้าของงานเท่านั้น — supervisor จบงานที่คัดกรอง
  const oversightScope = superuser || inTeam || isAssignee;
  const workScope = canWorkLead(user, lead);

  const now = new Date().toISOString();
  const patch = { updatedAt: now };
  const event = {
    id: genId('LEV'),
    leadId: lead.id,
    kind: action,
    fromStatus: lead.status,
    toStatus: TRANSITION_TO_STATUS[action],
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  if (action === 'screen') {
    if (!superuser) return forbidden('คัดกรองลีดได้เฉพาะแอดมินหรือ AE Supervisor');
    if (!TEAMS.includes(body.team)) return badRequest('ต้องเลือกทีม (ODM/KA/SV)');
    patch.team = body.team;
    patch.screenedAt = lead.screenedAt || now; // SLA นับครั้งแรก — ตีกลับแล้วคัดใหม่ไม่รีเซ็ต
    event.team = body.team;
  } else if (action === 'assign') {
    // supervisor/admin (superuser) กระจายได้ทุกทีม + senior_ae/ac เฉพาะทีมตัวเอง
    if (!(superuser || inTeam)) return forbidden('กระจายลีดได้เฉพาะ Senior AE ของทีม หรือ Supervisor/แอดมิน');
    // ⚠️ ผู้รับผิดชอบต้องเป็นผู้ใช้จริง + role ที่ canWorkLead พาไป true ได้ —
    // เดิมเขียน assigneeId/assigneeName จาก body ดิบ ๆ (ปลอมชื่อ / มอบให้คนที่ลาออก /
    // มอบให้ role ที่ทำงานคิวลีดไม่ได้เลย → ลีดค้างถาวร). ดูเหตุผลเต็มใน leadAssignee.js
    // ชื่อมาจาก server เสมอ ไม่รับ body.assigneeName อีก (สองความจริงในแถวเดียว)
    let assignee;
    try {
      assignee = await validateLeadAssignee(supabase, body.assigneeId, lead);
    } catch (assigneeError) {
      return fail(assigneeError.message, 500);
    }
    if (!assignee.ok) return badRequest(assignee.error);
    patch.assigneeId = assignee.assigneeId;
    patch.assigneeName = assignee.assigneeName;
    patch.assignedAt = now; // จุดเริ่ม SLA ติดต่อกลับ — มอบใหม่นับใหม่ (เจ้าของใหม่)
    event.assigneeId = assignee.assigneeId;
    event.assigneeName = assignee.assigneeName;
  } else if (action === 'contact') {
    if (!workScope) return forbidden('ติดต่อกลับได้เฉพาะทีมเจ้าของงาน (AE ผู้รับมอบ / Senior ทีม)');
    if (!body.reason?.trim()) return badRequest('ต้องระบุหมายเหตุการติดต่อ');
    patch.firstContactAt = lead.firstContactAt || now;
    event.eventAt = body.eventAt || now;
    event.reason = body.reason.trim();
  } else if (action === 'meeting') {
    if (!workScope) return forbidden('บันทึกนัดประชุมได้เฉพาะทีมเจ้าของงาน (AE ผู้รับมอบ / Senior ทีม)');
    if (body.meetingMode && !MEETING_MODES.includes(body.meetingMode)) return badRequest('รูปแบบนัดไม่ถูกต้อง');
    const meetingAt = body.eventAt || now;
    event.meetingMode = body.meetingMode || null;
    event.eventAt = meetingAt;
    // ลีดเดียวมีได้หลายนัดแล้ว — คอลัมน์เก็บ "นัดถัดไป" ไม่ใช่ "นัดที่กดล่าสุด"
    patch.meetingAt = await nextMeetingAt(supabase, lead.id, meetingAt, now);
  } else if (action === 'create_deal') {
    // สร้างดีลจากลีดต้องผ่าน POST /api/sales-planning/deals (ทางเดียว) — ที่นั่นออกรหัส DL
    // แบบ atomic + บันทึก stage history + audit + กันสร้างซ้ำ. path นี้เดิมสร้างดีล
    // "ไร้รหัส/ไร้ประวัติ" และซ้ำได้ ปิดทิ้งเพื่อไม่ให้แตกจากทางหลัก (ผลตรวจ 2026-07-16).
    return badRequest('สร้างดีลจากลีดผ่านปุ่ม "สร้างดีล" (ระบบดีล) เท่านั้น');
  } else if (action === 'disqualify') {
    if (!oversightScope) return forbidden();
    if (!body.reason?.trim()) return badRequest('ต้องระบุเหตุผลที่ไม่ไปต่อ');
    patch.disqualifiedReason = body.reason.trim();
    patch.closedAt = now;
    event.reason = body.reason.trim();
  } else if (action === 'bounce') {
    if (!oversightScope) return forbidden();
    if (!body.reason?.trim()) return badRequest('ต้องระบุเหตุผลที่ตีกลับ (เช่น ทีมไม่ตรง)');
    patch.team = null;
    patch.assigneeId = null;
    patch.assigneeName = null;
    // ตีกลับ = เริ่มใหม่หมด: ล้างเวลาติดต่อ/นัดของรอบก่อน ไม่งั้น SLA ติดต่อกลับของ
    // ผู้รับคนใหม่ถูกวัดจาก firstContactAt เดิม (assignedAt ใหม่ > firstContactAt เก่า →
    // countBusinessDays ติดลบ → slaHit นับเป็น "ทัน" ฟรี ๆ)
    patch.firstContactAt = null;
    patch.meetingAt = null;
    event.reason = body.reason.trim();
  }

  patch.status = TRANSITION_TO_STATUS[action];

  const { data, error } = await supabase.from('sales_leads').update(patch).eq('id', id).select().single();
  if (error) return fail(error.message, 500);
  await supabase.from('lead_events').insert(event);

  await recordAudit({
    user, action: 'update', entityType: 'sales_lead', entityId: id, before: lead, after: data,
    summary: `ลีด ${lead.contactName}: ${lead.status} → ${data.status} (${action}${event.reason ? ` — ${event.reason}` : ''})`,
    request: req,
  });

  /* กล่องแจ้งเตือนรายคน — แจ้ง **คนที่ต้องลงมือต่อ** ไม่ใช่ทั้งห้อง
     ครอบ 3 จังหวะ: คัดกรองเข้าทีม (→ Senior AE/AC ของทีม) · มอบหมาย (→ AE ผู้รับ) ·
     ตีกลับ (→ ผู้คัดกรอง + คนที่เพิ่งถูกดึงลีดออกจากมือ)
     ⚠️ `bounce` ล้าง assigneeId ไปแล้วใน patch — ผู้รับเดิมต้องอ่านจาก `lead` (ก่อนแก้)
     โหลดทะเบียนผู้ใช้เฉพาะจังหวะที่ต้องใช้ ไม่ใช่ทุก transition (contact/meeting ไม่ส่งมอบใคร) */
  if (['screen', 'assign', 'bounce'].includes(action)) {
    notifyLeadHandoff(supabase, {
      action,
      lead: data,
      directory: await loadUserDirectory(supabase).catch(() => new Map()),
      actor: user,
      previousAssigneeId: lead.assigneeId,
      reason: body.reason?.trim() || null,
    });
  }

  // จุดส่งมอบ 2–3/3: แจ้งคนรับช่วงถัดไปให้เริ่มนับ SLA (fire-and-forget หลังเขียน DB).
  // แจ้งเฉพาะ "จุดส่งมอบงานระหว่างคน" — screen (→ Senior ทีม) และ assign (→ AE ผู้รับ).
  // การกระทำอื่น (contact/meeting/bounce/disqualify) ไม่ใช่การส่งต่อ ไม่ต้องแจ้งทันที.
  const subject = data.company ? `${data.contactName} · ${data.company}` : data.contactName;
  if (action === 'screen') {
    sendChat('leads', chatCard({
      title: '🧭 ลีดคัดกรองแล้ว รอกระจาย',
      subtitle: subject,
      rows: [
        { label: 'ทีม', value: TEAM_LABELS[data.team] || data.team },
        { label: 'สิ่งที่ต้องทำ', value: `Senior AE ทีม${TEAM_LABELS[data.team] || data.team} มอบให้ AE (ภายใน 1 วันทำการ)` },
      ],
      linkPath: `/sa/leads`,
      linkLabel: 'เปิดคิวลีด',
    }));
  } else if (action === 'assign') {
    sendChat('leads', chatCard({
      title: '📌 ลีดถูกมอบหมาย รอติดต่อกลับ',
      subtitle: subject,
      rows: [
        { label: 'ผู้รับผิดชอบ', value: data.assigneeName || '' },
        { label: 'ทีม', value: TEAM_LABELS[data.team] || data.team || '' },
        { label: 'สิ่งที่ต้องทำ', value: 'AE ติดต่อลูกค้ากลับ (ภายใน 1 วันทำการ)' },
      ],
      linkPath: `/sa/leads/${data.id}`,
      linkLabel: 'เปิดลีด',
    }));
  }

  return ok(data);
});

