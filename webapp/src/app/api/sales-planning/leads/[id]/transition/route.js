import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { can, hasTeam, isSuperuser } from '@/lib/permissions';
import {
  LEAD_TRANSITIONS, TRANSITION_TO_STATUS, MEETING_MODES, canWorkLead,
  meetingTimesSinceBounce, pickNextMeetingAt, leadFollowUpError, leadLostReasonError, LEAD_LOST_REVISIT_CODES,
  leadBouncePatch, LEAD_BOUNCE_KINDS,
} from '@/lib/sales/leads';
import { validateLeadAssignee } from '@/lib/sales/leadAssignee';
import { TEAMS } from '@/lib/permissions';
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
    // ⚠️ ต้องรวม auto_bounce ด้วย (mig 0291) — ลิสต์นี้ตัดที่ 'ขอบรอบ' ขาดชนิดไหนไป
    // นัดของรอบก่อนจะฟื้นขึ้นมาบนลีดของเจ้าของคนใหม่
    .in('kind', ['meeting', ...LEAD_BOUNCE_KINDS])
    .order('createdAt', { ascending: false });
  // อ่านประวัติไม่ได้ = ถอยไปใช้นัดที่เพิ่งบันทึก (พฤติกรรมเดิมก่อนมติ) ไม่ล้มทั้งรายการ
  if (error) console.error('[lead transition] อ่านประวัตินัดไม่สำเร็จ:', error.message);
  const previous = error ? [] : meetingTimesSinceBounce(data || []);
  return pickNextMeetingAt([...previous, addedAt].filter(Boolean), now) || addedAt || null;
}

// POST /api/sales-planning/leads/[id]/transition
// { action: screen|assign|reassign|contact|followup|meeting|disqualify|bounce,
//   team?, assigneeId?, assigneeName?, reason?, meetingMode?, eventAt?, followUpAt? }
//
// กติกา role ต่อ action (เฟส C — ตามเส้นชีวิตในแผน):
//   screen     = supervisor/admin (คัดกรอง เลือกทีม — SLA 1 วันทำการ)
//   assign     = senior_ae/ac ของทีมนั้น + supervisor/admin (กระจายให้ AE)
//   reassign   = เดียวกับ assign แต่ทำกับใบที่มอบไปแล้ว (assigned/contacted/meeting)
//     มติผู้ใช้ 2026-08-20: AE ลาออก/ลาป่วย/สลับงานกันในทีม ต้องย้ายเจ้าของได้โดย
//     **ไม่ถอยสถานะ** และไม่ต้องตีกลับ (ตีกลับล้างทีม/เวลาติดต่อ/นัดทิ้งทั้งรอบ)
//   contact    = ผู้รับมอบ (AE) / senior ทีม / admin (SLA 1 วันทำการ) — ต้องระบุหมายเหตุการติดต่อ (เก็บใน event.reason)
//     มติผู้ใช้ 2026-07-21: supervisor จบงานที่คัดกรอง ไม่ทำขั้นทำงานแทนทีม
//   followup   = เดียวกับ contact แต่ **ไม่ขยับสถานะ** (ติดตามครั้งที่ 2 ขึ้นไป)
//     มติผู้ใช้ 2026-08-25: ของเดิมบันทึกการติดต่อซ้ำไม่ได้เลย — `contacted` ไม่มี
//     `contact` ในลิสต์ ⇒ AE ที่โทรตามรอบสองต้องไปเขียนในเธรดกลาง ซึ่งไม่มีวันที่
//     ให้ระบบทวงต่อ · ทั้ง contact และ followup **บังคับ followUpAt** (mig 0289)
//   meeting    = เดียวกับ contact (+ บันทึกรูปแบบนัด onsite/online — วัด KPI)
//     ล้าง followUpAt เพราะวันประชุมแทนที่คำสัญญา "จะโทรกลับ" ไปแล้ว
//   qualify    = เดียวกับ contact — ต้องระบุ customerId (เปิดลูกค้าในฐานข้อมูลก่อน)
//   disqualify = ขั้นกำกับดูแล: ทีมเจ้าของงาน + supervisor/admin
//     ต้องมี **ทั้งรหัสเหตุผล** (disqualifiedCode · mig 0290) **และข้อความ** —
//     รหัสไว้ทำรายงาน "แพ้เพราะอะไร" ข้อความไว้อ่านย้อนหลัง
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
  const inTeam = (role === 'senior_ae' || role === 'ac') && hasTeam(user, lead.team);
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
    // reassign = เปลี่ยนมือ ไม่เปลี่ยนขั้น ⇒ ปลายทางเป็น null ในแมป ต้องคงสถานะเดิม
    toStatus: TRANSITION_TO_STATUS[action] ?? lead.status,
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  if (action === 'screen') {
    if (!superuser) return forbidden('คัดกรองลีดได้เฉพาะแอดมินหรือ AE Supervisor');
    if (!TEAMS.includes(body.team)) return badRequest('ต้องเลือกทีม (ODM/KA/SV)');
    patch.team = body.team;
    // สองคอลัมน์ ไม่ใช่ตัวเดียวรับสองหน้าที่ (mig 0234):
    //   firstScreenedAt = ครั้งแรกตลอดกาล → ด่าน "คัดกรอง" วัดจากตัวนี้ (ตีกลับแล้วคัดใหม่
    //     ไม่ลบผลงานรอบแรก — มติเดิม 2026-08-04 คงไว้ทุกประการ)
    //   screenedAt      = ของรอบปัจจุบัน → เป็น *จุดเริ่ม* ของด่าน "กระจาย" จึงต้องเป็น
    //     เวลาที่ใบมาถึงมือ Senior AE รอบนี้ ไม่ใช่รอบที่แล้ว
    patch.firstScreenedAt = lead.firstScreenedAt || lead.screenedAt || now;
    patch.screenedAt = now;
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
    // สองคอลัมน์ ไม่ใช่ตัวเดียวรับสองหน้าที่ (mig 0273 — เหตุผลเดียวกับ screen ข้างบน):
    //   firstAssignedAt = มอบครั้งแรกของรอบ → *จุดจบ* ของด่านกระจาย (ไม่ขยับอีกเลยจนกว่า
    //     จะตีกลับ ⇒ เปลี่ยนผู้รับผิดชอบทีหลังไม่ลบผลงานของคนที่มอบทันเวลา)
    //   assignedAt      = เจ้าของปัจจุบันรับเมื่อไร → *จุดเริ่ม* ของด่านติดต่อกลับ
    patch.firstAssignedAt = lead.firstAssignedAt || now;
    event.assigneeId = assignee.assigneeId;
    event.assigneeName = assignee.assigneeName;
  } else if (action === 'reassign') {
    // ด่านเดียวกับ assign เป๊ะ (superuser หรือทีมเจ้าของงาน) — ใบนี้มีทีมแล้วเสมอ
    if (!(superuser || inTeam)) return forbidden('เปลี่ยนผู้รับผิดชอบได้เฉพาะ Senior AE ของทีม หรือ Supervisor/แอดมิน');
    let assignee;
    try {
      assignee = await validateLeadAssignee(supabase, body.assigneeId, lead);
    } catch (assigneeError) {
      return fail(assigneeError.message, 500);
    }
    if (!assignee.ok) return badRequest(assignee.error);
    // กันกดพลาดเลือกคนเดิม — ผ่านไปแล้วจะได้ event/แจ้งเตือน "เปลี่ยนผู้รับผิดชอบ"
    // ที่ประวัติอ่านแล้วงง (จาก A ไป A) และ SLA ติดต่อกลับถูกรีเซ็ตฟรี ๆ ให้คนเดิม
    if (assignee.assigneeId === lead.assigneeId) {
      return badRequest('ผู้รับผิดชอบคนนี้ถือลีดใบนี้อยู่แล้ว — เลือกคนอื่นถ้าต้องการเปลี่ยนมือ');
    }
    patch.assigneeId = assignee.assigneeId;
    patch.assigneeName = assignee.assigneeName;
    /* ⚠️ รีเซ็ตนาฬิกาติดต่อกลับให้เจ้าของใหม่ **เฉพาะใบที่ยังไม่ได้ติดต่อลูกค้า** —
       ใบที่ติดต่อไปแล้ว `firstContactAt` ค้างอยู่ในอดีต ถ้าดัน `assignedAt` มาเป็น
       ตอนนี้จะได้คู่เวลาสลับลำดับ (assignedAt > firstContactAt) ⇒ countBusinessDays
       ติดลบ → slaHit คืน null → ใบที่ทำทันจริง ๆ ถูกนับเข้า checked แต่ไม่ได้ hit
       = โดนหักคะแนนเพราะมีคนย้ายเจ้าของ (บั๊กพี่น้องกับที่ bounce ล้าง firstContactAt) */
    if (!lead.firstContactAt) patch.assignedAt = now;
    event.assigneeId = assignee.assigneeId;
    event.assigneeName = assignee.assigneeName;
    // ประวัติต้องอ่านออกว่า "ย้ายจากใครไปใคร" — ชื่อเดิมอยู่ในแถวก่อนแก้เท่านั้น
    event.reason = body.reason?.trim()
      || `เปลี่ยนผู้รับผิดชอบจาก ${lead.assigneeName || 'ไม่ระบุ'} เป็น ${assignee.assigneeName}`;
  } else if (action === 'contact' || action === 'followup') {
    /* ⭐ สองจังหวะเดียวกันทุกอย่างยกเว้นสถานะปลายทาง (มติผู้ใช้ 2026-08-25):
       `contact` = ครั้งแรก (assigned → contacted) · `followup` = ครั้งที่สองขึ้นไป
       (สถานะไม่ขยับ ⇒ ใช้ได้ทั้งจาก contacted และ meeting)
       เขียนรวมกันเพราะกติกา "ต้องมีหมายเหตุ + ต้องมีวันติดตามต่อ" ต้องตรงกันเป๊ะ —
       แยกสองบล็อกเมื่อไรก็เป็นสองที่ที่ต้องคอยทำให้ตรงกันเอง */
    const label = action === 'contact' ? 'ติดต่อกลับ' : 'บันทึกการติดตาม';
    if (!workScope) return forbidden(`${label}ได้เฉพาะทีมเจ้าของงาน (AE ผู้รับมอบ / Senior ทีม)`);
    if (!body.reason?.trim()) return badRequest('ต้องระบุหมายเหตุการติดต่อ');
    /* ⚠️ ด่านเดียวกับที่ฟอร์มใช้ (`leadFollowUpError`) — ห้ามเขียนเงื่อนไขซ้ำที่นี่
       ทุกการติดต่อต้องมีทางออก ไม่งั้นลีดนอนอยู่ใน `contacted` ได้ตลอดกาล
       🪤 เคส "ลูกค้าไม่สนใจแล้ว" ไม่ต้องกรอกวันมั่ว — กด `disqualify` ตรงจาก
       `assigned` ได้เลย (อยู่ใน LEAD_TRANSITIONS.assigned แล้ว) */
    const followUpError = leadFollowUpError(body.followUpAt);
    if (followUpError) return badRequest(followUpError);
    if (action === 'contact') patch.firstContactAt = lead.firstContactAt || now;
    patch.followUpAt = new Date(body.followUpAt).toISOString();
    event.eventAt = body.eventAt || now;
    event.reason = body.reason.trim();
  } else if (action === 'meeting') {
    if (!workScope) return forbidden('บันทึกนัดประชุมได้เฉพาะทีมเจ้าของงาน (AE ผู้รับมอบ / Senior ทีม)');
    if (body.meetingMode && !MEETING_MODES.includes(body.meetingMode)) return badRequest('รูปแบบนัดไม่ถูกต้อง');
    const meetingAt = body.eventAt || now;
    event.meetingMode = body.meetingMode || null;
    event.eventAt = meetingAt;
    /* ⚠️ นัดได้ = ติดต่อไปแล้วจริง — ต้องเขียน `firstContactAt` ที่นี่ด้วย ตั้งแต่เปิดให้
       `meeting` ทำได้ตรงจาก `assigned` (ดู LEAD_TRANSITIONS) ไม่งั้นใบที่ข้ามมาทางนี้
       จะหายจากตัวหารของ SLA "ติดต่อกลับ" ⇒ ตัวเลขดูดีขึ้นเพราะนับใบน้อยลง ไม่ใช่เพราะทำได้ดีขึ้น */
    patch.firstContactAt = lead.firstContactAt || now;
    // หมายเหตุของสายที่เพิ่งคุยจบ — กล่องเดียวกันเก็บมาให้แล้ว อย่าทิ้ง
    if (body.reason?.trim()) event.reason = body.reason.trim();
    // ลีดเดียวมีได้หลายนัดแล้ว — คอลัมน์เก็บ "นัดถัดไป" ไม่ใช่ "นัดที่กดล่าสุด"
    patch.meetingAt = await nextMeetingAt(supabase, lead.id, meetingAt, now);
    /* ⚠️ วันประชุมแทนที่คำสัญญา "จะโทรกลับ" ไปแล้ว — ปล่อยทั้งคู่ไว้ = ลีดใบเดียว
       โผล่สองแถวในคิวของฉันด้วยกำหนดคนละวัน · อยากติดตามต่อหลังประชุมให้กด
       "บันทึกการติดตาม" ซึ่งตั้งวันใหม่ให้เอง */
    patch.followUpAt = null;
  } else if (action === 'create_deal') {
    // สร้างดีลจากลีดต้องผ่าน POST /api/sales-planning/deals (ทางเดียว) — ที่นั่นออกรหัส DL
    // แบบ atomic + บันทึก stage history + audit + กันสร้างซ้ำ. path นี้เดิมสร้างดีล
    // "ไร้รหัส/ไร้ประวัติ" และซ้ำได้ ปิดทิ้งเพื่อไม่ให้แตกจากทางหลัก (ผลตรวจ 2026-07-16).
    return badRequest('สร้างดีลจากลีดผ่านปุ่ม "สร้างดีล" (ระบบดีล) เท่านั้น');
  } else if (action === 'disqualify') {
    if (!oversightScope) return forbidden();
    /* ⭐ รหัสเหตุผล (mig 0290) — **คู่กับข้อความ ไม่ใช่แทนที่** · ข้อความอิสระนับไม่ได้
       ("งบไม่ถึง"/"งบไม่พอ"/"ลูกค้าบอกแพง" = เรื่องเดียวกันแต่ group by ไม่ได้)
       ⚠️ ด่านเดียวกับที่ฟอร์มใช้ — เขียนเงื่อนไขซ้ำที่นี่เมื่อไร สองฝั่งจะเริ่มไม่ตรงกัน
       แล้วผู้ใช้กดแล้วโดนตีกลับโดยไม่รู้ว่าเพราะอะไร (form-design-rules §2) */
    const lostError = leadLostReasonError({ code: body.disqualifiedCode, detail: body.reason });
    if (lostError) return badRequest(lostError);
    /* ⚠️ รายละเอียดยังบังคับทุกเหตุผลเหมือนเดิม — รหัสบอกว่า "หมวดไหน" ส่วนข้อความบอก
       ว่า "เกิดอะไรขึ้นจริง ๆ" ซึ่งเป็นสิ่งเดียวที่คนอ่านประวัติย้อนหลังใช้ได้
       (`leadLostReasonError` บังคับข้อความเฉพาะ 'other' — ที่นี่เข้มกว่าโดยเจตนา
       เพราะเป็นกติกาเดิมของ API ที่มีมาก่อนแล้ว ไม่ใช่ของใหม่) */
    if (!body.reason?.trim()) return badRequest('ต้องระบุเหตุผลที่ไม่ไปต่อ');
    patch.disqualifiedCode = body.disqualifiedCode;
    /* ⭐ วันกลับมาถามใหม่ (mig 0293) — เก็บเฉพาะเหตุผลที่ไม่ใช่แพ้ถาวร
       ⚠️ เหตุผลอื่นเขียนทับเป็น null เสมอ ไม่ใช่ปล่อยค่าเดิมค้าง — ใบที่เคยปิดว่า
       "ยังไม่พร้อม" แล้วเปิดใหม่/ปิดใหม่ด้วยเหตุผลอื่น จะเหลือวันของรอบก่อนติดอยู่
       แล้วรายงาน "ถึงเวลากลับไปถาม" จะกวาดใบที่แพ้จริงมาด้วย */
    patch.revisitAt = LEAD_LOST_REVISIT_CODES.includes(body.disqualifiedCode) && body.revisitAt
      ? new Date(body.revisitAt).toISOString()
      : null;
    patch.disqualifiedReason = body.reason.trim();
    patch.closedAt = now;
    event.reason = body.reason.trim();
  } else if (action === 'bounce') {
    if (!oversightScope) return forbidden();
    if (!body.reason?.trim()) return badRequest('ต้องระบุเหตุผลที่ตีกลับ (เช่น ทีมไม่ตรง)');
    /* ⚠️ กติกา "ตีกลับแล้วต้องล้างอะไรบ้าง" อยู่ที่ `leadBouncePatch` ที่เดียว —
       cron ตีกลับอัตโนมัติ (mig 0291) เขียนแถวเองไม่ผ่าน route นี้ (ไม่มี session user)
       สองที่ที่ต้องล้างเจ็ดคอลัมน์ให้ตรงกันเองคือสองที่ที่จะเพี้ยนหากัน */
    /* ⭐ เก็บ "เคยอยู่กับใคร/ทีมไหน" ลงประวัติ **ก่อน** ล้างแถว — ไม่งั้นไม่มีทางรู้อีกเลย
       คนคัดกรองรอบใหม่ต้องเห็นว่าเคยส่งไปทีมไหนแล้วไม่เวิร์ก ไม่งั้นส่งซ้ำทางเดิม
       (คู่กับ cron ตีกลับอัตโนมัติที่เขียนชุดเดียวกัน) */
    event.team = lead.team || null;
    event.assigneeId = lead.assigneeId || null;
    event.assigneeName = lead.assigneeName || null;
    Object.assign(patch, leadBouncePatch(now));
    event.reason = body.reason.trim();
  }

  patch.status = TRANSITION_TO_STATUS[action] ?? lead.status;

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
  if (['screen', 'assign', 'reassign', 'bounce'].includes(action)) {
    notifyLeadHandoff(supabase, {
      action,
      lead: data,
      directory: await loadUserDirectory(supabase).catch(() => new Map()),
      actor: user,
      previousAssigneeId: lead.assigneeId, // reassign/bounce = คนที่เพิ่งถูกดึงลีดออกจากมือ
      reason: body.reason?.trim() || null,
    });
  }

  // จุดส่งมอบ 2–3/3: แจ้งคนรับช่วงถัดไปให้เริ่มนับ SLA (fire-and-forget หลังเขียน DB).

  return ok(data);
});

