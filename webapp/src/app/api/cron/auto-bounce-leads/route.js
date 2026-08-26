// ── ตีกลับลีดที่ไม่มีความเคลื่อนไหวเกิน 5 วันทำการ (mig 0291) ────────────────
//
// ⭐ ขาที่สองของ mig 0288: เตือนแล้วยังเงียบต่อ ต้องมีอะไรดึงลีดออกจากมือคนที่ปล่อยทิ้ง
// กติกาทั้งหมดอยู่ที่ `lib/sales/leadAutoBounce.js` (route เหลือหน้าที่ query + เขียน)
//
// 🔴 **ตีกลับ ไม่ใช่ปิดลีด** — เหตุผลเต็มอยู่ที่หัวไฟล์ leadAutoBounce.js
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
import { can } from '@/lib/permissions';
import { genId } from '@/lib/id';
import { holidaySet } from '@/lib/master/holidays';
import { businessDaysWaiting } from '@/lib/sales/handoffQueue';
import { leadBouncePatch, chunkLeadIds } from '@/lib/sales/leads';
import {
  AUTO_BOUNCE_STATUSES, autoBounceReason, escalationNotice, planAutoBounce,
} from '@/lib/sales/leadAutoBounce';
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

/** เคยถูกตีกลับอัตโนมัติมาแล้วกี่รอบ — นับจากประวัติ ไม่มีคอลัมน์ให้เพี้ยน */
async function autoBounceRounds(supabase, ids) {
  const rounds = new Map(ids.map((id) => [id, 0]));
  for (const chunk of chunkLeadIds(ids)) {
    const { data, error } = await supabase
      .from('lead_events')
      .select('leadId')
      .eq('kind', 'auto_bounce')
      .in('leadId', chunk);
    // อ่านรอบไม่ได้ = **หยุดทั้งรอบ** ไม่ใช่เดาว่าศูนย์ — เดาแล้วใบที่ครบโควตาจะถูก
    // ตีกลับซ้ำเรื่อย ๆ ซึ่งเป็นสิ่งเดียวที่ตัวนับนี้มีไว้กัน
    if (error) return null;
    for (const row of data || []) rounds.set(row.leadId, (rounds.get(row.leadId) || 0) + 1);
  }
  return rounds;
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
  const COLUMNS = 'id, contactName, company, status, team, assigneeId, assigneeName, createdAt, assignedAt, followUpAt';
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
  if (!leads.length) return Response.json({ apply, scanned: 0, bounced: 0, reason: 'ไม่มีลีดในสถานะที่เข้าข่าย' });

  const [holidays, rounds] = await Promise.all([
    holidaySet().catch(() => new Set()),
    autoBounceRounds(supabase, leads.map((l) => l.id)),
  ]);
  if (!rounds) {
    return Response.json({ error: 'อ่านจำนวนรอบที่เคยตีกลับไม่สำเร็จ — ไม่ตีกลับรอบนี้' }, { status: 500 });
  }

  const sinceOf = { assigned: (l) => l.assignedAt || l.createdAt, contacted: (l) => l.followUpAt };
  const plan = planAutoBounce(leads, {
    ageOf: (lead) => businessDaysWaiting(sinceOf[lead.status]?.(lead), now, holidays),
    roundOf: (id) => rounds.get(id) || 0,
  });

  const preview = ({ lead, days, rounds: n }) => ({
    id: lead.id, name: lead.company || lead.contactName, status: lead.status,
    team: lead.team, assignee: lead.assigneeName, days, rounds: n,
  });
  const skipped = Math.max(0, plan.bounce.length - MAX_PER_RUN);
  const todo = plan.bounce.slice(0, MAX_PER_RUN);

  if (!apply) {
    return Response.json({
      apply: false,
      note: 'โหมดดูอย่างเดียว — ยังไม่เขียนอะไร · cron ทำจริงเองอยู่แล้ว · คนกดเองใส่ ?apply=1 ถ้าจะเขียน',
      scanned: leads.length,
      wouldBounce: todo.length,
      skippedOverLimit: skipped,
      needsDecision: plan.escalate.length,
      leads: todo.map(preview),
      escalate: plan.escalate.map(preview),
    });
  }

  const directory = await loadUserDirectory(supabase).catch(() => new Map());
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
      .filter((u) => u && !u.disabled && (u.role === 'ae_supervisor' || u.role === 'admin'))
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
    bounced: bounced.length,
    skippedOverLimit: skipped,
    needsDecision: plan.escalate.length,
    ids: bounced,
  });
}
