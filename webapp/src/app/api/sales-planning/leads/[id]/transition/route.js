import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { can, isSuperuser } from '@/lib/permissions';
import { LEAD_TRANSITIONS, TRANSITION_TO_STATUS, MEETING_MODES, canWorkLead } from '@/lib/sales/leads';
import { TEAMS, TEAM_LABELS } from '@/lib/permissions';
import { sendChat, chatCard } from '@/lib/chat';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/leads/[id]/transition
// { action: screen|assign|contact|meeting|qualify|disqualify|bounce,
//   team?, assigneeId?, assigneeName?, reason?, meetingMode?, eventAt?, customerId? }
//
// กติกา role ต่อ action (เฟส C — ตามเส้นชีวิตในแผน):
//   screen     = supervisor/admin (คัดกรอง เลือกทีม — SLA 1 วันทำการ)
//   assign     = senior_ae/ac ของทีมนั้น + supervisor/admin (กระจายให้ AE)
//   contact    = ผู้รับมอบ (AE) / senior ทีม / admin (SLA 1 วันทำการ) —
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
    if (!body.assigneeId || !body.assigneeName) return badRequest('ต้องเลือก AE ผู้รับผิดชอบ');
    patch.assigneeId = body.assigneeId;
    patch.assigneeName = body.assigneeName;
    patch.assignedAt = now; // จุดเริ่ม SLA ติดต่อกลับ — มอบใหม่นับใหม่ (เจ้าของใหม่)
    event.assigneeId = body.assigneeId;
    event.assigneeName = body.assigneeName;
  } else if (action === 'contact') {
    if (!workScope) return forbidden('ติดต่อกลับได้เฉพาะทีมเจ้าของงาน (AE ผู้รับมอบ / Senior ทีม)');
    patch.firstContactAt = lead.firstContactAt || now;
    event.eventAt = body.eventAt || now;
  } else if (action === 'meeting') {
    if (!workScope) return forbidden('บันทึกนัดประชุมได้เฉพาะทีมเจ้าของงาน (AE ผู้รับมอบ / Senior ทีม)');
    if (body.meetingMode && !MEETING_MODES.includes(body.meetingMode)) return badRequest('รูปแบบนัดไม่ถูกต้อง');
    patch.meetingAt = body.eventAt || now;
    event.meetingMode = body.meetingMode || null;
    event.eventAt = body.eventAt || now;
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

