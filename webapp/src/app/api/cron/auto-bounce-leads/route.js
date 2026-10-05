// ── งานเก็บกวาดคิวลีดประจำเช้า: ปิดอัตโนมัติ (มติ 2026-09-16) → ตีกลับ (mig 0291) ──────
//
// ⭐ ขาที่สองของ mig 0288: เตือนแล้วยังเงียบต่อ ต้องมีอะไรดึงลีดออกจากมือคนที่ปล่อยทิ้ง
// กติกาทั้งหมดอยู่ที่ `lib/sales/leadAutoBounce.js` + `lib/sales/leadAutoLost.js`
// (route เหลือหน้าที่ query + เขียน)
//
// ⭐ **สองกติกา หนึ่ง route โดยเจตนา** — ลำดับสำคัญ: ใบที่เข้าเกณฑ์ทั้งคู่ในเช้าเดียวกัน
// ต้องถูก **ปิด** ไม่ใช่ตีกลับ · ตีกลับก่อนเมื่อไร ใบจะหลุดไปนอน `new` (สถานะที่ตัวปิดไม่สแกน)
// แล้วรอดไปจนมีคนมอบใหม่ · แยกสอง cron แล้วพึ่งเวลาของ Vercel เรียงให้ = ลำดับไม่การันตี
//
// 🔴 ตีกลับ ≠ ปิด — ตีกลับคือ "ทีม/คนไม่ตรง ส่งคนอื่น" (หัวไฟล์ leadAutoBounce.js) ·
// ปิดคือ "ถือครบ 10 วันทำการแล้วไม่ได้นัด" พร้อมฉลากความพยายาม (หัวไฟล์ leadAutoLost.js)
//
// ⚠️ **คนเปิดเองได้แค่ดู** — cron (มี CRON_SECRET) ทำจริง ส่วนคนกดต้องเติม `?apply=1`
// ตรวจข้อมูลจริง 2026-08-08 พบลีด 14 ใบค้างข้ามเดือน ใบที่นานสุด 10 วันทำการ ⇒ รอบแรก
// จะตีกลับของค้างทั้งกองในนาทีเดียวโดยไม่มีใครทันดู · เปิดจากเบราว์เซอร์ในฐานะแอดมิน
// เพื่อดูรายการก่อนได้ โดยไม่เขียนอะไรเลย · คิวใน vercel.json ส่ง `apply=1` มาเอง
// เมื่อพร้อมเปิดใช้จริง (ดูคอมเมนต์ที่นั่น)
//
// เรียกโดย Vercel Cron ด้วย Authorization: Bearer CRON_SECRET หรือ admin เปิดเอง —
// กติกาเดียวกับ daily-digest / close-resolved-issues
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, SALES_BELL_ROLES } from '@/lib/permissions';
import { genId } from '@/lib/id';
import { holidaySet } from '@/lib/master/holidays';
import { businessDaysWaiting } from '@/lib/sales/handoffQueue';
import { leadBouncePatch, LEAD_LOST_LABELS } from '@/lib/sales/leads';
import {
  AUTO_BOUNCE_STATUSES, autoBounceReason, escalationNotice, planAutoBounce,
} from '@/lib/sales/leadAutoBounce';
import { autoLostReason, leadOwnedBusinessDays, planAutoLost } from '@/lib/sales/leadAutoLost';
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { recordAudit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notifications';
import { loadUserDirectory } from '@/lib/usersRepo';
import { businessDayKey } from '@/lib/datePeriods';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* เพดานต่อรอบ — cron มี maxDuration 60 วิ และแต่ละใบเขียน 2 ครั้ง (แถว + ประวัติ)
   ⚠️ ตัดแล้วต้อง **บอกว่าตัด** ในคำตอบ ไม่ใช่เงียบ — จำนวนที่รายงานต้องตรงกับ
   สิ่งที่เกิดขึ้นจริงเสมอ · เรียงค้างนานสุดขึ้นก่อนแล้ว (planAutoBounce) ใบที่แย่ที่สุด
   จึงได้ถูกจัดการก่อนถ้าชนเพดาน */
const MAX_PER_RUN = 100;

/** ประวัติทั้งหมดของลีดที่สแกน — ใช้ทั้งนับรอบตีกลับ และนาฬิกา/ฉลากของการปิดอัตโนมัติ
 *  (อ่านรอบเดียวแทนสองรอบ · ประวัติไม่เคยถูกล้าง จึงเป็นแหล่งเดียวที่นับข้ามรอบตีกลับได้)
 *  @returns Map(leadId → events) หรือ `null` ถ้าอ่านไม่ได้ */
async function loadLeadEvents(supabase, ids) {
  try {
    const rows = await fetchAllInChunks(ids, (chunk) => supabase
      .from('lead_events')
      .select('id, leadId, kind, fromStatus, toStatus, createdAt')
      .in('leadId', chunk)
      .order('id'));
    const byLead = new Map(ids.map((id) => [id, []]));
    for (const row of rows) byLead.get(row.leadId)?.push(row);
    return byLead;
  } catch (error) {
    console.error('[auto-bounce] อ่านประวัติลีดไม่สำเร็จ:', error?.message || error);
    return null;
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const auth = request.headers.get('authorization');
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const user = await getCurrentUser();
    if (!can(user?.role, 'master:manage')) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  /* ⭐ **สวิตช์ผูกกับ *ตัวตนผู้เรียก* ไม่ใช่ query string**
     · cron (มี `Bearer CRON_SECRET`) = ทำจริง
     · คนเปิดจากเบราว์เซอร์ = ดูอย่างเดียว (ต้องเติม `?apply=1` เองถ้าจะให้เขียน)

     🪤 เดิมอ่านจาก `?apply=1` อย่างเดียว แล้ววางสวิตช์ไว้ใน `vercel.json` — ถ้า query
     string หายไป (Vercel ไม่ส่งต่อ / มีคนแก้ config แล้วตกหล่น) route จะคืน
     **200 OK พร้อม `apply:false`** ⇒ Vercel เห็นว่าสำเร็จทุกรอบ ไม่มี log ผิดปกติ
     แต่ **ไม่มีอะไรถูกตีกลับเลยตลอดไป** · ค่าตั้งต้นที่ปลอดภัยกลายเป็นโหมดพังเงียบ
     เพราะไปผูกกับ string ใน config ที่หายแล้วไม่มีใครรู้
     ⚠️ ความปลอดภัยเดิมยังอยู่ครบ — คนกดเองยังไม่เขียนอะไรจนกว่าจะขอชัด ๆ */
  const apply = cronOk || url.searchParams.get('apply') === '1';

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  /* ⚠️ **ยิงทีละสถานะ เรียงเก่าสุดก่อน + มีเพดาน** ไม่ใช่ `.in(status)` ก้อนเดียว —
     PostgREST ตัดที่ 1,000 แถวเงียบ ๆ ⇒ ถ้าคิวโตเกินนั้น cron จะเห็นแต่ใบที่บังเอิญ
     มาก่อนใน index แล้วใบที่ค้างนานที่สุดรอดไปตลอดกาล ซึ่งเป็นใบที่ต้องจัดการที่สุด
     ⚠️ สองสถานะเรียงด้วยคอลัมน์คนละตัว (`assignedAt` vs `followUpAt`) จึงแยกคิวรี
     ไม่ได้รวมเป็นอันเดียว · เพดานตั้งสูงกว่า MAX_PER_RUN มากเพื่อให้ยังเห็นภาพรวม
     ในโหมดดูอย่างเดียว */
  const SCAN_LIMIT = 500;
  const ORDER_BY = { assigned: 'assignedAt', contacted: 'followUpAt' };
  /* ⚠️ คอลัมน์ชุดท้าย (disqualified… → updatedAt) = ทุกช่องที่การปิดอัตโนมัติเขียน — audit สร้าง
     แถว "ก่อน" เต็มแถวจาก `{ ...หลัง, ...ก่อน }` ได้ก็ต่อเมื่อช่องที่เปลี่ยนอยู่ในชุดนี้ครบ */
  const COLUMNS = 'id, contactName, company, status, team, assigneeId, assigneeName, createdAt, assignedAt, firstAssignedAt, followUpAt, '
    + 'disqualifiedCode, disqualifiedReason, revisitAt, closedAt, updatedAt';
  const leads = [];
  for (const status of AUTO_BOUNCE_STATUSES) {
    const { data, error } = await supabase
      .from('sales_leads')
      .select(COLUMNS)
      .eq('status', status)
      .order(ORDER_BY[status], { ascending: true, nullsFirst: false })
      .limit(SCAN_LIMIT);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    leads.push(...(data || []));
  }
  if (!leads.length) return Response.json({ apply, scanned: 0, lost: 0, bounced: 0, reason: 'ไม่มีลีดในสถานะที่เข้าข่าย' });

  const [holidays, eventsByLead] = await Promise.all([
    holidaySet().catch(() => new Set()),
    loadLeadEvents(supabase, leads.map((l) => l.id)),
  ]);
  /* อ่านประวัติไม่ได้ = **หยุดทั้งรอบ** ไม่ใช่เดาว่าว่าง — เดาแล้ว (1) ใบที่ครบโควตาตีกลับจะถูก
     ตีกลับซ้ำเรื่อย ๆ (2) ใบที่เคยนัดแล้วจะถูกปิดเพราะมองไม่เห็นนัด · ทั้งสองอย่างย้อนยาก */
  if (!eventsByLead) {
    return Response.json({ error: 'อ่านประวัติลีดไม่สำเร็จ — ไม่ปิดและไม่ตีกลับรอบนี้' }, { status: 500 });
  }
  const eventsOf = (id) => eventsByLead.get(id) || [];
  const daysBetween = (from, to) => businessDaysWaiting(from, to, holidays);

  /* ① ปิดก่อน — ใบที่ถูกปิดต้องไม่ถูกตีกลับซ้ำในรอบเดียวกัน (ดูหัวไฟล์) */
  const lostPlan = planAutoLost(leads, {
    eventsOf,
    ageOf: (lead, events) => leadOwnedBusinessDays(lead, events, { now, daysBetween }),
  });
  const lostIds = new Set(lostPlan.map((entry) => entry.lead.id));

  const sinceOf = { assigned: (l) => l.assignedAt || l.createdAt, contacted: (l) => l.followUpAt };
  const plan = planAutoBounce(leads.filter((lead) => !lostIds.has(lead.id)), {
    ageOf: (lead) => businessDaysWaiting(sinceOf[lead.status]?.(lead), now, holidays),
    roundOf: (id) => eventsOf(id).filter((e) => e.kind === 'auto_bounce').length,
  });

  const preview = ({ lead, days, rounds: n }) => ({
    id: lead.id, name: lead.company || lead.contactName, status: lead.status,
    team: lead.team, assignee: lead.assigneeName, days, rounds: n,
  });
  const lostPreview = ({ lead, days, contacts, code }) => ({
    id: lead.id, name: lead.company || lead.contactName, status: lead.status,
    team: lead.team, assignee: lead.assigneeName, days, contacts, label: LEAD_LOST_LABELS[code] || code,
  });
  /* เพดานรวมสองกติกา — ทั้งคู่เขียนแถวละ 2–3 ครั้งภายใน maxDuration เดียวกัน
     ปิดได้ก่อน (ลำดับเดียวกับที่ทำจริง) ตีกลับได้ส่วนที่เหลือ */
  const lostTodo = lostPlan.slice(0, MAX_PER_RUN);
  const todo = plan.bounce.slice(0, MAX_PER_RUN - lostTodo.length);
  const skipped = (lostPlan.length - lostTodo.length) + (plan.bounce.length - todo.length);

  if (!apply) {
    return Response.json({
      apply: false,
      note: 'โหมดดูอย่างเดียว — ยังไม่เขียนอะไร · cron ทำจริงเองอยู่แล้ว · คนกดเองใส่ ?apply=1 ถ้าจะเขียน',
      scanned: leads.length,
      wouldLose: lostTodo.length,
      wouldBounce: todo.length,
      skippedOverLimit: skipped,
      needsDecision: plan.escalate.length,
      lost: lostTodo.map(lostPreview),
      leads: todo.map(preview),
      escalate: plan.escalate.map(preview),
    });
  }

  const directory = await loadUserDirectory(supabase).catch(() => new Map());

  /* ── ① ปิดอัตโนมัติ ───────────────────────────────────────────────────── */
  const lost = [];
  for (const entry of lostTodo) {
    const { lead, code } = entry;
    const reason = autoLostReason(entry);
    /* ⚠️ เขียนชุดเดียวกับที่ `disqualify` ของคนกดเขียน (transition/route.js) — ไม่ล้าง
       ทีม/ผู้รับ/firstContactAt ⇒ `leadReopenStatus` อ่านแถวแล้วพาใบกลับขั้นเดิมได้ถูก
       และคนถือใบยังเห็นใบของตัวเอง (applyLeadScope กรองด้วยทีม/ผู้รับ) */
    const { data: updated, error: updateError } = await supabase
      .from('sales_leads')
      .update({
        status: 'disqualified',
        disqualifiedCode: code,
        disqualifiedReason: reason,
        revisitAt: null,
        closedAt: now,
        updatedAt: now,
      })
      .eq('id', lead.id)
      // กันแข่งกับ AE ที่เพิ่งกดนัดพอดี (assigned/contacted → meeting) — แถวที่ขยับไปแล้วไม่ match
      .eq('status', lead.status)
      .select()
      .maybeSingle();
    if (updateError) console.error('[auto-lost] ปิดลีดไม่สำเร็จ:', lead.id, updateError.message);
    if (updateError || !updated) continue;

    const { error: eventError } = await supabase.from('lead_events').insert({
      id: genId('LEV'),
      leadId: lead.id,
      kind: 'disqualify',
      fromStatus: lead.status,
      toStatus: 'disqualified',
      team: lead.team || null,
      assigneeId: lead.assigneeId || null,
      assigneeName: lead.assigneeName || null,
      reason,
      createdBy: null,
      createdByName: 'ระบบ',
    });
    if (eventError) console.error('[auto-lost] เขียนประวัติไม่สำเร็จ:', lead.id, eventError.message);

    /* ⚠️ cron ไม่มีถังขยะให้กู้ — audit เก็บแถวก่อน/หลังไว้ให้ไล่ย้อนได้ว่าระบบปิดอะไรไปบ้าง
       (ทางกลับปกติคือปุ่ม "ลูกค้ากลับมา" บนใบ) */
    await recordAudit({
      user: { id: null, name: 'ระบบ (ปิดลีดอัตโนมัติ)', role: null },
      action: 'update', entityType: 'sales_lead', entityId: lead.id,
      // ช่องที่ไม่ได้ select มาไม่ถูกแตะ ⇒ ค่าใน `updated` = ค่าเดิม · ช่องที่แตะอยู่ใน COLUMNS ครบ
      before: { ...updated, ...lead }, after: updated,
      summary: `ลีด ${lead.contactName || lead.id}: ${lead.status} → disqualified (ระบบปิดอัตโนมัติ — ${LEAD_LOST_LABELS[code] || code})`,
    });

    /* แจ้ง **คนที่ถือใบ** — ต้องรู้ว่าใบหลุดเพราะอะไร และกลับมาได้ทางไหน */
    if (lead.assigneeId) {
      await notifyUsers(supabase, {
        userIds: [lead.assigneeId],
        entityType: 'lead',
        entityId: lead.id,
        kind: 'lead_auto_lost',
        title: `ลีดถูกปิดอัตโนมัติ · ${lead.company || lead.contactName || 'ลีด'}`,
        body: `${reason} — ถ้าลูกค้ากลับมา กด “ลูกค้ากลับมา” บนใบเพื่อเปิดต่อ`,
        dedupeKey: `AUTOLOST-${lead.id}`,
      }).catch(() => {});
    }
    lost.push(lead.id);
  }

  /* ── ② ตีกลับอัตโนมัติ ────────────────────────────────────────────────── */
  const bounced = [];
  for (const entry of todo) {
    const { lead, days } = entry;
    const reason = autoBounceReason(lead, days);
    const { data: updated, error: updateError } = await supabase
      .from('sales_leads')
      .update(leadBouncePatch(now))
      .eq('id', lead.id)
      /* ⚠️ กันแข่งกับ AE ที่เพิ่งกดบันทึกการติดต่อพอดี — แถวที่ขยับไปแล้วจะไม่ match
         แล้วรอบนี้ข้ามไปเงียบ ๆ แทนที่จะทับงานที่เพิ่งทำ (ท่าเดียวกับ
         close-resolved-issues ที่ `.eq('status','resolved')`) */
      .eq('status', lead.status)
      .select()
      .maybeSingle();
    if (updateError || !updated) continue;

    /* ⚠️ ประวัติต้องเขียนให้สำเร็จ ไม่งั้นรอบถัดไปจะนับรอบผิด (ตัวนับอ่านจากตรงนี้)
       — ต่างจาก transition/route.js ที่ปล่อย insert ล้มเงียบได้ ที่นี่มันคือตัวนับ */
    const { error: eventError } = await supabase.from('lead_events').insert({
      id: genId('LEV'),
      leadId: lead.id,
      kind: 'auto_bounce',
      fromStatus: lead.status,
      toStatus: 'new',
      /* ⭐ **ต้องเก็บว่าใบนี้เคยอยู่กับใคร/ทีมไหน** — `leadBouncePatch` ล้าง
         `assigneeId`/`team` บนแถวทิ้งไปแล้ว ⇒ ถ้าไม่เขียนลงประวัติตรงนี้
         **ไม่มีทางรู้อีกเลย** ต้องไปไล่ event `assign` ย้อนหลังทีละใบ
         · คนคัดกรองรอบใหม่ต้องเห็นว่า "เคยส่งไปทีมนี้แล้วไม่เวิร์ก" ไม่งั้นจะส่งซ้ำทางเดิม
         ⚠️ คอลัมน์พวกนี้มีใน `lead_events` อยู่แล้วตั้งแต่ mig 0091 — ไม่ต้อง migrate */
      team: lead.team || null,
      assigneeId: lead.assigneeId || null,
      assigneeName: lead.assigneeName || null,
      reason,
      createdBy: null,
      createdByName: 'ระบบ',
    });
    if (eventError) console.error('[auto-bounce] เขียนประวัติไม่สำเร็จ:', lead.id, eventError.message);

    /* แจ้ง **คนที่เพิ่งถูกดึงลีดออกจากมือ** — ไม่แจ้งแล้วเขาจะรู้ตัวตอนหาลีดไม่เจอ
       ⚠️ อ่าน assigneeId จาก `lead` (ก่อนแก้) เพราะ patch ล้างไปแล้ว */
    if (lead.assigneeId) {
      await notifyUsers(supabase, {
        userIds: [lead.assigneeId],
        entityType: 'lead',
        entityId: lead.id,
        kind: 'lead_auto_bounce',
        title: `ลีดถูกส่งกลับคิวคัดกรอง · ${lead.company || lead.contactName || 'ลีด'}`,
        body: reason,
        dedupeKey: `AUTOBOUNCE-${lead.id}-${businessDayKey(now)}`,
      }).catch(() => {});
    }
    bounced.push(lead.id);
  }

  /* ใบที่ครบโควตารอบ — แจ้งผู้ดูแลให้ตัดสินใจ ไม่ตีกลับซ้ำ
     หนึ่งเด้งรวมทุกใบต่อวัน (กติกา mig 0185: ห้ามเด้งรายใบ) */
  const notice = escalationNotice(plan.escalate);
  if (notice) {
    const screeners = [...directory.values()]
      // AE Supervisor + admin — CD/CM ไม่รับกระดิ่ง (มติ 2026-09-24 ข้อ 6 · SALES_BELL_ROLES)
      .filter((u) => u && !u.disabled && (SALES_BELL_ROLES.includes(u.role) || u.role === 'admin'))
      .map((u) => u.id);
    if (screeners.length) {
      await notifyUsers(supabase, {
        userIds: screeners,
        entityType: 'lead',
        entityId: plan.escalate[0].lead.id,
        kind: 'lead_auto_bounce_stuck',
        title: notice.title,
        body: notice.body,
        dedupeKey: `AUTOBOUNCE-STUCK-${businessDayKey(now)}`,
      }).catch(() => {});
    }
  }

  return Response.json({
    apply: true,
    scanned: leads.length,
    lost: lost.length,
    lostIds: lost,
    bounced: bounced.length,
    skippedOverLimit: skipped,
    needsDecision: plan.escalate.length,
    ids: bounced,
  });
}
