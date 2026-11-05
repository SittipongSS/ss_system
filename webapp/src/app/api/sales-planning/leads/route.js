import { genId } from '@/lib/id';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, unauthorized } from '@/lib/http';
import {
  LEAD_CHANNELS, SERVICE_INTERESTS, SERVICE_DETAIL_REQUIRED, channelGroupOf, leadBudgetError,
  applyLeadScope, canViewLeads, canCreateLead,
  leadBounceHistory, leadHandoffContext, chunkLeadIds, LEAD_BOUNCE_KINDS, LEAD_FOLLOW_UP_ACTIONS,
} from '@/lib/sales/leads';
import { toMoney } from '@/lib/salesPlanning';
import { leadLinkError } from '@/lib/sales/dealLeadLink';
import { notifyLeadHandoff } from '@/lib/sales/leadNotify';
import { loadUserDirectory } from '@/lib/usersRepo';
import {
  INTAKE_APPOINTMENT_MODES, appointmentConflictMessage, appointmentInputError, hasAppointmentInput,
  normalizeAppointmentInput,
} from '@/lib/sales/leadAppointments';
import { attachUpcomingAppointments, bookLeadAppointment, findRoomConflicts, withVisibleLeadNames } from '@/lib/sales/leadAppointmentsRepo';

export const dynamic = 'force-dynamic';

// applyLeadScope / inLeadScope / canViewLeads / canCreateLead ย้ายไป
// `lib/sales/leads.js` แล้ว (ทะเบียนเธรดกลางเป็น lib จะ import จาก app route ไม่ได้
// · และ canCreateLead ต้องตรงกับปุ่ม "รับลีดใหม่" บนหน้า list เสมอ)

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewLeads(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const status = params.get('status');

  /* ⚠️ ไล่ทีละหน้า — `applyLeadScope` **คืน query เดิมโดยไม่กรองเลย** สำหรับ superuser /
     ผู้สังเกตการณ์ / marketing (ดู lib/sales/leads.js) ⇒ สามบทบาทนั้นอ่านทั้งตาราง
     และจะโดนเพดาน 1,000 แถวตัดเงียบ ๆ ก่อนเพื่อน · เรียง `createdAt` มากไปน้อย
     ⇒ ลีดเก่าหายก่อน แล้ว KPI ที่นับจากลิสต์นี้จะต่ำกว่าจริงโดยไม่มีสัญญาณ */
  const { data, error } = await fetchAllResult(() => {
    let query = supabase.from('sales_leads').select('*')
      .order('createdAt', { ascending: false })
      .order('id', { ascending: true });
    query = applyLeadScope(query, user);
    if (status && status !== 'all') query = query.eq('status', status);
    return query;
  });
  if (error) return fail(error.message, 500);
  const leads = data || [];

  /* `?linkable=1` = ลีดที่ผู้ใช้คนนี้ผูกกับดีลได้ (โมดัลผูกลีดที่หน้าดีล + ช่องลีดต้นทางในฟอร์มเพิ่มดีล)
     ⭐ กรองด้วยด่านตัวเดียวกับ POST /deals และ /deals/[id]/link-lead (leadLinkError) — ที่ server
        เพราะรู้ตัวตนจริงของผู้ใช้ (id/ทีมหลายทีม) · จอกรองเองแล้วได้คำตอบคนละอย่างกับด่านได้
     ⚠️ ไม่แนบบริบทตีกลับ — โมดัลผูกไม่ได้ใช้ */
  if (params.get('linkable') === '1') {
    return ok(leads.filter((lead) => !leadLinkError({ user, lead })));
  }

  /* ⭐ บริบทของใบที่ถูกส่งกลับ — ติดไปกับแถวเลย ไม่ให้จอต้องยิงรายใบ
     ใบที่ไม่เคยถูกตีกลับไม่มีคีย์นี้เลย (ไม่ใช่ค่าว่าง) ⇒ จอเช็ค `lead.bounce` ตรง ๆ ได้
     ⚠️ อ่านไม่สำเร็จ = **ไม่ใส่บริบท** แต่ยังคืนลีดตามปกติ — คิวลีดเป็นหน้าทำงานหลัก
     ล้มทั้งหน้าเพราะป้ายเสริมอ่านไม่ได้คือแลกผิดฝั่ง */
  await attachBounceContext(supabase, leads);
  /* ⭐ ธงนัดหมาย (mig 0424 · มติเจ้าของ 05/11) — `lead.appointment` = นัดที่รออยู่ของใบนั้น
     ไม่มีนัด = ไม่มีคีย์ · อ่านไม่ได้ = ไม่มีธงแต่คิวยังเปิดได้ (ดู attachUpcomingAppointments) */
  await attachUpcomingAppointments(supabase, leads, new Date().toISOString());
  return ok(leads);
});

/* ⚠️ ซอย `.in()` เสมอ — PostgREST ยัดลิสต์ลง query string ทั้งก้อน (ดู LEAD_ID_CHUNK)
   ⚠️ **ถามเฉพาะใบที่ยังไม่มีเจ้าของรอบใหม่** — ใบที่ถูกมอบหมายต่อไปแล้วไม่ต้องโชว์ป้าย
   "ส่งกลับ" อีก เพราะรอบใหม่เริ่มไปแล้ว · ตัดจำนวนใบที่ต้องถามลงมาก
   ⚠️ ต้องมี `screened` ด้วย ไม่ใช่แค่ `new`: `bounce` ส่งใบกลับไปที่ `new` ก็จริง แต่คน
   ที่ต้องอ่านบริบทมากที่สุดคือคนกด **มอบหมาย** ซึ่งเกิดตอน `screened` (หลังคัดกรองแล้ว)
   ถ้าตัดที่ `new` อย่างเดียว ป้าย "เคยถือใบนี้มาแล้ว" ในกล่องมอบหมายจะไม่มีวันขึ้น */
const BOUNCE_CONTEXT_STATUSES = ['new', 'screened'];
const HANDOFF_CONTEXT_KINDS = [...LEAD_BOUNCE_KINDS, 'screen', 'meeting', ...LEAD_FOLLOW_UP_ACTIONS];

async function attachBounceContext(supabase, leads) {
  const ids = leads.filter((l) => BOUNCE_CONTEXT_STATUSES.includes(l?.status)).map((l) => l.id).filter(Boolean);
  if (!ids.length) return;
  const byLead = new Map();
  for (const chunk of chunkLeadIds(ids)) {
    const { data, error } = await supabase
      .from('lead_events')
      .select('leadId, kind, team, assigneeId, assigneeName, reason, createdAt')
      .in('leadId', chunk)
      /* ⚠️ ไม่ใช่แค่ชนิด "ตีกลับ" อีกต่อไป — กล่องมอบหมายต้องเล่าได้ว่าใบนี้ผ่านอะไรมา
         (ผู้คัดกรองฝากอะไรไว้ · ติดต่อไปแล้วกี่ครั้ง · เคยนัดหรือยัง)
         🪤 อย่าเผลอเอาลิมิตมาใส่: ใบเดียวมีเหตุการณ์ได้ไม่จำกัด และเราซอย `.in()` ตามใบ
         ไม่ใช่ตามแถว — ดู LEAD_ID_CHUNK · ชนิดที่ไม่ได้ใช้ตัดออกตั้งแต่ที่นี่ */
      .in('kind', HANDOFF_CONTEXT_KINDS)
      .order('createdAt', { ascending: false });
    if (error) {
      console.error('[leads] อ่านประวัติการตีกลับไม่สำเร็จ — คิวจะไม่มีป้ายบริบท:', error.message);
      return;
    }
    for (const row of data || []) {
      if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
      byLead.get(row.leadId).push(row);
    }
  }
  for (const lead of leads) {
    const events = byLead.get(lead.id);
    if (events?.length) {
      lead.bounce = leadBounceHistory(events);
      lead.handoff = leadHandoffContext(events);
    }
  }
}

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canCreateLead(user.role)) return forbidden('ลีดเพิ่มได้เฉพาะทีม Marketing และหัวหน้าฝ่ายขาย');

  const body = await req.json();
  if (!body.contactName?.trim()) return badRequest('ต้องระบุชื่อลูกค้า/ผู้ติดต่อ');
  if (!LEAD_CHANNELS.includes(body.channel)) return badRequest('ต้องระบุช่องทางที่รับลีด');
  const serviceInterest = SERVICE_INTERESTS.includes(body.serviceInterest) ? body.serviceInterest : 'other';
  const serviceDetail = (body.serviceDetail || '').trim();
  if (SERVICE_DETAIL_REQUIRED.has(serviceInterest) && !serviceDetail) {
    return badRequest('บริการที่สนใจประเภทนี้ต้องระบุรายละเอียด');
  }
  // ⚠️ ด่านเดียวกับ CHECK ของ mig 0233 — ตกที่นี่ได้ข้อความไทยพร้อมชื่อช่อง
  // ส่วนตกที่ DB ได้ error ภาษาอังกฤษที่คนกรอกอ่านไม่ออก
  const budgetError = leadBudgetError(body);
  if (budgetError) return badRequest(budgetError);

  /* ⭐ นัดที่ลูกค้าจองมาแล้ว (mig 0424 · มติเจ้าของ 05/11) — ด่านเดียวกับฟอร์ม (appointmentInputError)
     ⚠️ เช็คห้อง **ก่อน** สร้างลีด — ห้องชนต้องตอบ 409 โดยไม่มีลีดเกิดขึ้น ไม่งั้น MKT กดใหม่แล้วได้ลีดซ้ำ
     (ยังมีช่องสองคนกดพร้อมกัน — ฐานปัดคนที่สองตอนจองจริงข้างล่าง แล้วเราลบลีดที่เพิ่งเกิดทิ้ง) */
  const appointmentError = appointmentInputError(body.appointment, { modes: INTAKE_APPOINTMENT_MODES });
  if (appointmentError) return badRequest(appointmentError);
  const appointment = hasAppointmentInput(body.appointment)
    ? normalizeAppointmentInput(body.appointment, { modes: INTAKE_APPOINTMENT_MODES })
    : null;
  if (appointment?.room) {
    const { data: clash, error: clashError } = await findRoomConflicts(supabase, appointment);
    if (clashError) return fail(`เช็คห้องว่างไม่สำเร็จ: ${clashError.message}`, 500);
    if (clash?.length) return conflict(appointmentConflictMessage(await withVisibleLeadNames(supabase, user, clash)));
  }

  const row = {
    id: genId('LEAD'),
    channel: body.channel,
    channelGroup: channelGroupOf(body.channel),
    contactName: body.contactName.trim(),
    company: (body.company || '').trim() || null,
    email: (body.email || '').trim() || null,
    contactChannel: (body.contactChannel || '').trim() || null,
    phone: (body.phone || '').trim() || null,
    serviceInterest,
    serviceDetail: serviceDetail || null,
    budget: toMoney(body.budget, null),
    budgetMax: toMoney(body.budgetMax, null),
    details: (body.details || '').trim() || null,
    status: 'new',
    createdBy: user.id || null,
    createdByName: user.name || null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };

  const { data, error } = await supabase.from('sales_leads').insert(row).select().single();
  if (error) return fail(error.message, 500);

  let booked = null;
  if (appointment) {
    const nowIso = new Date().toISOString();
    const result = await bookLeadAppointment(supabase, {
      leadId: data.id, appointment, source: 'intake', user, nowIso,
    });
    if (result.conflict || result.error) {
      /* ลีดเพิ่งเกิดและยังไม่มีใครเห็น (ยังไม่มีประวัติ/audit/แจ้งเตือน) — ถอยทั้งใบ ให้ MKT แก้นัดแล้วกดใหม่
         ⚠️ ลบไม่สำเร็จ = มีลีดค้างโดยไม่มีนัด → บอกตรง ๆ ไม่ให้กดซ้ำจนลีดซ้ำ */
      const { error: rollbackError } = await supabase.from('sales_leads').delete().eq('id', data.id);
      if (rollbackError) {
        console.error('[leads] ถอยลีดหลังจองห้องไม่สำเร็จ', data.id, rollbackError.message);
        return fail(`${result.conflict || result.error} — แต่ลีด ${data.contactName} ถูกบันทึกไปแล้วโดยไม่มีนัด กรุณาเปิดใบนั้นแก้นัดแทนการกรอกใหม่`, 409);
      }
      return result.conflict ? conflict(result.conflict) : fail(result.error, 500);
    }
    booked = result.data;
  }

  const { error: eventError } = await supabase.from('lead_events').insert({
    id: genId('LEV'),
    leadId: data.id,
    kind: 'create',
    fromStatus: null,
    toStatus: 'new',
    createdBy: user.id || null,
    createdByName: user.name || null,
  });
  // ลีดเกิดแล้ว ตอบล้มตรงนี้ = กดซ้ำได้ลีดซ้ำ · "รับลีดโดย/วันที่รับ" ยังอยู่บนแถว + audit
  if (eventError) console.error('[leads] บันทึกประวัติรับลีดไม่สำเร็จ', data.id, eventError.message);

  await recordAudit({
    user, action: 'create', entityType: 'sales_lead', entityId: data.id, after: booked ? { ...data, appointment: booked } : data,
    summary: `รับลีด ${data.contactName}${data.company ? ` (${data.company})` : ''} · ${data.channel}`,
    request: req,
  });

  /* จุดส่งมอบ 1/3 — เข้ากล่องแจ้งเตือนของ **คนที่ต้องคัดกรอง** ไม่ใช่ห้องรวม
     🪦 เดิมมีคู่กับ Chat webhook (ประกาศให้ฝ่าย) ซึ่งถูกถอดออก 2026-08-12 ⇒ ตอนนี้
     ทางนี้คือ**ทางเดียว**ที่คนได้รู้ว่ามีลีดเข้ามา (ดูเหตุผลเต็มใน leadNotify.js) */
  notifyLeadHandoff(supabase, {
    action: 'create',
    lead: data,
    directory: await loadUserDirectory(supabase).catch(() => new Map()),
    actor: user,
  });

  // จุดส่งมอบ 1/3: ลีดใหม่เข้าคิว → แจ้งผู้คัดกรอง (Supervisor) ให้เริ่มนับ SLA 1 วันทำการ.

  return ok(booked ? { ...data, appointment: booked } : data, 201);
});
