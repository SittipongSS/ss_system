import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { chatCard, sendChatNow } from '@/lib/chat';
import { productDisplayName } from '@/lib/master/productIdentity';
import { holidaySet } from '@/lib/master/holidays';
import { agedAtLeast, businessDaysWaiting } from '@/lib/sales/handoffQueue';
import { leadDigestRows, summarizeLeadQueue } from '@/lib/sales/leadDigest';
import { overdueLeadNotices } from '@/lib/sales/leadNotify';
import { notifyUsers } from '@/lib/notifications';
import { businessDayKey } from '@/lib/datePeriods';
import { loadUserDirectory } from '@/lib/usersRepo';
import { loadHandoffQueue } from '@/lib/sales/handoffQueueData';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/daily-digest — สรุปประจำวันเข้า Google Chat (เฟส 3 ของ GOOGLE_CHAT_PLAN.md)
// เรียกโดย Vercel Cron (08:30 ไทย จ-ศ, ดู vercel.json) ด้วย Authorization: Bearer CRON_SECRET
// หรือ admin เปิดเองจากเบราว์เซอร์เพื่อทดสอบ. ไม่มีเหตุการณ์ = ไม่ส่งการ์ด (ไม่สแปม space)
//
// เนื้อหา 4 การ์ด (reuse ตรรกะเดิม ไม่มีกติกาใหม่):
//   1. งานค้างอนุมัติ (ลูกค้า/สินค้า pending) → space ผู้อนุมัติ
//   2. ลีดค้างคิว (รอคัดกรอง/กระจาย/ติดต่อกลับ — มี SLA) → space คิวลีด
//   3. งานโครงการเลยกำหนด/ครบใน 3 วัน (นิยาม isUrgent ใน lib/pm/derived.js) → space โครงการ
//   4. รอยต่อเอกสารค้าง (Won ยังไม่ออก SO · SO ยังไม่ออกใบยื่นภาษี) → space ทีมขาย
// (FC สหมิตรเสี่ยง เคยอยู่ในแผนแต่ผู้ใช้ตัดออก — ดูใน dashboard เองพอ)

const fmtShortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

async function approvalsDigest(supabase) {
  // เฉพาะ master data (ลูกค้า/สินค้า) — ใบเสนอราคาไม่นับ เพราะ flow จริงไม่มีขั้นขออนุมัติ
  const [customers, products] = await Promise.all([
    supabase.from('customers').select('name').eq('approvalStatus', 'pending').limit(50),
    supabase.from('products').select('fgCode, productDescription, productDescriptionEn').eq('approvalStatus', 'pending').limit(50),
  ]);
  const c = customers.data || [];
  const p = products.data || [];
  const total = c.length + p.length;
  if (!total) return null;

  const sample = (arr, render) => arr.slice(0, 3).map(render).join(', ') + (arr.length > 3 ? ` และอีก ${arr.length - 3}` : '');
  return chatCard({
    title: '🗂 งานค้างอนุมัติเช้านี้',
    subtitle: `รวม ${total} รายการ`,
    rows: [
      c.length ? { label: `ลูกค้ารออนุมัติ (${c.length})`, value: sample(c, (x) => x.name) } : null,
      p.length ? { label: `สินค้ารออนุมัติ (${p.length})`, value: sample(p, (x) => productDisplayName(x) || x.fgCode) } : null,
    ].filter(Boolean),
    linkPath: '/home',
    linkLabel: 'เข้าระบบ',
  });
}

/* ทวงลีดที่เลย SLA เข้ากล่องแจ้งเตือนรายคน — หนึ่งคนได้เด้งเดียวต่อวัน
   กติกา "ใครค้างอะไร" อยู่ที่ `overdueLeadNotices` (lib/sales/leadNotify.js) ที่นี่แค่
   ดึงข้อมูลกับยิง · ยิงซ้ำวันเดียวกันไม่เกิดแถวซ้ำ (dedupeKey ต่อคนต่อวัน) */
async function notifyOverdueLeads(supabase) {
  const { data, error } = await supabase
    .from('sales_leads')
    .select('id, contactName, status, team, assigneeId, createdAt, screenedAt, assignedAt')
    .in('status', ['new', 'screened', 'assigned']);
  if (error) return { sent: 0, error: error.message };
  if (!data?.length) return { sent: 0, reason: 'ไม่มีลีดค้าง' };

  const [holidays, directory] = await Promise.all([
    holidaySet().catch(() => new Set()),
    loadUserDirectory(supabase).catch(() => new Map()),
  ]);
  const now = new Date().toISOString();
  const sinceOf = { new: (l) => l.createdAt, screened: (l) => l.screenedAt || l.createdAt, assigned: (l) => l.assignedAt || l.createdAt };
  const notices = overdueLeadNotices(data, {
    directory,
    ageOf: (lead) => businessDaysWaiting(sinceOf[lead.status]?.(lead), now, holidays),
    dayKey: businessDayKey(now),
  });
  if (!notices.length) return { sent: 0, reason: 'ไม่มีลีดเลย SLA' };

  let sent = 0;
  for (const notice of notices) {
    const result = await notifyUsers(supabase, {
      userIds: notice.userIds,
      entityType: 'lead',
      entityId: notice.entityId,
      kind: 'lead_overdue',
      title: notice.title,
      body: notice.body,
      dedupeKey: notice.dedupeKey,
      // สรุปหลายใบ → พาไปที่ *คิว* ไม่ใช่ใบใดใบหนึ่ง (การ์ด "ค้างคิว" อยู่บนหน้านั้นแล้ว)
      href: '/sa/leads',
      actorName: 'สรุปประจำวัน',
    });
    sent += result.sent || 0;
  }
  return { sent, notices: notices.length };
}

async function leadsDigest(supabase) {
  // ลีดค้างในสถานะที่ "รอคนทำ" + มี SLA ผูก: รอคัดกรอง (Supervisor) · รอกระจาย (Senior) ·
  // รอติดต่อกลับ (AE). ภาพรวมทั้งฝ่าย (เหมือน approvalsDigest) — การทำงานรายใบยัง scope
  // ที่หน้า /sa/leads. ไม่มีลีดค้าง = ไม่ส่งการ์ด (ไม่สแปม space).
  //
  // ⭐ 2026-08-08: เพิ่ม **ใครถืออยู่** กับ **ค้างมากี่วันทำการ** — ของเดิมบอกแค่จำนวนรวม
  // ("รอติดต่อกลับ 29") ซึ่งอ่านแล้วไม่รู้ว่าต้องไปตามใคร · ตรวจข้อมูลจริงวันเดียวกันพบว่า
  // ใน 29 ใบนั้นมี 14 ใบค้างข้ามเดือน ใบที่นานสุด 10 วันทำการ ทั้งที่ SLA คือ 1 วันทำการ
  // การ์ดที่บอกแค่ตัวเลขรวมจึงถูกอ่านผ่านทุกเช้าโดยไม่มีใครเห็นว่ามันแย่ขนาดไหน
  // ⚠️ **จำนวนไม่เปลี่ยนสูตร** — ยังนับลีดค้างทุกใบเหมือนเดิม ที่เพิ่มคือรายละเอียดข้างหลัง
  const { data } = await supabase
    .from('sales_leads')
    .select('status, team, assigneeId, assigneeName, createdAt, screenedAt, assignedAt')
    .in('status', ['new', 'screened', 'assigned']);
  const rows = data || [];
  if (!rows.length) return null;

  const [holidays, directory] = await Promise.all([
    holidaySet().catch(() => new Set()),
    // ชื่อปัจจุบันจากบัญชีจริง — สำเนาชื่อในแถวเป็นชื่อย่อ/ชื่อเก่าอยู่หลายใบบน prod
    // (ปัญหาเดียวกับที่แก้ในตาราง KPI) · อ่านทะเบียนล่มก็ยังส่งการ์ดได้ แค่ถอยไปชื่อในแถว
    loadUserDirectory(supabase).catch(() => new Map()),
  ]);
  const summary = summarizeLeadQueue(rows, {
    asOf: new Date().toISOString(),
    holidays,
    nameOf: (id) => directory.get(id)?.name || null,
  });

  const worst = Math.max(summary.screen.oldest, summary.spread.oldest, summary.contact.oldest);
  return chatCard({
    title: '📋 ลีดค้างคิวเช้านี้',
    subtitle: `รวม ${summary.total} รายการ · SLA 1 วันทำการ${worst ? ` · ค้างนานสุด ${worst} วันทำการ` : ''}`,
    rows: leadDigestRows(summary),
    linkPath: '/sa/leads',
    linkLabel: 'เปิดคิวลีด',
  });
}

async function pmDigest(supabase) {
  // นิยามเดียวกับ isUrgent ใน lib/pm/derived.js: ยังไม่เสร็จ และ finishDate ≤ วันนี้+3
  const soon = new Date();
  soon.setHours(0, 0, 0, 0);
  soon.setDate(soon.getDate() + 3);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // finishDate เป็นคอลัมน์ date — เทียบด้วย YYYY-MM-DD ตรง ๆ
  const soonISO = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
  const { data: tasks, error: tasksError } = await supabase
    .from('project_tasks')
    .select('projectId, name, status, finishDate')
    .neq('status', 'Completed')
    .not('finishDate', 'is', null)
    .lte('finishDate', soonISO)
    .limit(200);
  // การ์ดสรุปเช้าเป็น best-effort — query พังไม่ควรทำให้ทั้งการ์ดหาย แต่ต้องมีร่องรอย
  // ไม่งั้นหมวด "งานใกล้ครบกำหนด" หายไปเงียบ ๆ แล้วไม่มีใครรู้ว่าเคยมี
  if (tasksError) {
    console.error('[digest] โหลดงานใกล้ครบกำหนดไม่สำเร็จ:', tasksError.message);
    return null;
  }
  if (!tasks?.length) return null;

  const projectIds = [...new Set(tasks.map((t) => t.projectId))];
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, code, status')
    .in('id', projectIds);
  // โครงการที่พัก/ยกเลิกไม่ต้องตาม (เหมือนหน้ารวม PM ที่ derived status ครอบไว้)
  const active = new Map((projects || []).filter((p) => !['Dropped', 'On Hold'].includes(p.status)).map((p) => [p.id, p]));
  const rows = tasks.filter((t) => active.has(t.projectId));
  if (!rows.length) return null;

  const overdue = rows.filter((t) => new Date(t.finishDate) < today);
  const dueSoon = rows.filter((t) => new Date(t.finishDate) >= today);
  const render = (t) => {
    const proj = active.get(t.projectId);
    return { label: `${proj.code || proj.name}`, value: `${t.name} · กำหนด ${fmtShortDate(t.finishDate)}` };
  };
  return chatCard({
    title: '⏰ งานโครงการใกล้ครบกำหนด',
    subtitle: `เลยกำหนด ${overdue.length} · ครบใน 3 วัน ${dueSoon.length}`,
    rows: [...overdue.slice(0, 4), ...dueSoon.slice(0, 4)].map(render),
    linkPath: '/pm/projects',
    linkLabel: 'เปิดหน้าโครงการ',
  });
}

// รอยต่อเอกสารค้าง: Won → Sale Order → ใบยื่นชำระภาษี. สองจุดนี้ไม่มีสถานะ "ค้าง"
// ในตารางไหนเลย ของที่ยังไม่ถูกกดจึงไม่โผล่ในคิวใด — การ์ดนี้คือตัวทวงตัวเดียวที่มี
//
// มติผู้ใช้ 2026-07-28: เตือนเมื่อค้างเกิน 1 วันทำการ (ปิดดีลวันนี้ พรุ่งนี้เช้ายังไม่โดนทวง
// และของที่ค้างข้ามวันหยุดยาวไม่ถูกนับเป็นค้างหลายวัน) ส่วนคิวสดไม่มีเกณฑ์อายุ อยู่บน
// แท็บ "แดชบอร์ดของฉัน". ภาพรวมทั้งฝ่ายเหมือน approvalsDigest/leadsDigest — งานรายใบ
// ยัง scope ที่หน้ารายการ
async function handoffDigest(supabase) {
  const [{ awaitingSalesOrder, awaitingFiling }, holidays] = await Promise.all([
    loadHandoffQueue(supabase, { dealIds: null }),
    holidaySet(),
  ]);
  const asOf = new Date().toISOString();
  const agedQuotes = agedAtLeast(awaitingSalesOrder, { sinceOf: (row) => row.acceptedAt, asOf, holidays });
  const agedOrders = agedAtLeast(awaitingFiling, { sinceOf: (row) => row.approvedAt, asOf, holidays });
  if (!agedQuotes.length && !agedOrders.length) return null;

  const waited = (since) => {
    const days = businessDaysWaiting(since, asOf, holidays);
    return days >= 2 ? `ค้าง ${days} วันทำการ` : 'ค้างข้ามวัน';
  };
  return chatCard({
    title: '🔗 รอยต่อเอกสารค้าง',
    subtitle: [
      agedQuotes.length ? `Won รอออก SO ${agedQuotes.length} ใบ` : null,
      agedOrders.length ? `SO รอออกใบยื่นภาษี ${agedOrders.length} ใบ` : null,
    ].filter(Boolean).join(' · '),
    rows: [
      ...agedQuotes.slice(0, 4).map((quote) => ({
        label: `${quote.quoteNumber} · Won ${fmtShortDate(quote.acceptedAt)}`,
        value: `${quote.customerName || 'ลูกค้า'} — ยังไม่ออก ใบสั่งขาย (${waited(quote.acceptedAt)})`,
      })),
      ...agedOrders.slice(0, 4).map((order) => ({
        label: `${order.orderNumber} · อนุมัติ ${fmtShortDate(order.approvedAt)}`,
        value: `${order.customerName || 'ลูกค้า'} — ยังไม่ออกใบยื่นภาษี (${waited(order.approvedAt)})`,
      })),
    ],
    linkPath: agedQuotes.length ? '/sa/quotations' : '/tax/filings',
    linkLabel: agedQuotes.length ? 'เปิดใบเสนอราคา' : 'เปิดหน้ายื่นชำระ',
  });
}

export async function GET(request) {
  // ผ่านได้ 2 ทาง: Vercel Cron (Bearer CRON_SECRET) หรือ admin กดทดสอบเองจากเบราว์เซอร์
  const auth = request.headers.get('authorization');
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const user = await getCurrentUser();
    if (!can(user?.role, 'master:manage')) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();
  const results = {};

  /* ทวงลีดค้างเข้ากล่องแจ้งเตือน **รายคน** — แยกจากการ์ด Chat ด้านล่างโดยตั้งใจ
     การ์ดเข้าห้องรวมและต้องเปิด webhook ก่อน (องค์กรนี้ยังไม่ได้เปิดสักช่อง)
     ส่วนตัวนี้ถึงตัวคนที่ต้องลงมือเสมอ ไม่ต้องตั้งค่าอะไร
     ⚠️ วางไว้ก่อน jobs และ try/catch แยก — การ์ดพังต้องไม่ทำให้การทวงหาย และกลับกัน */
  try {
    results.leadOverdue = await notifyOverdueLeads(supabase);
  } catch (e) {
    results.leadOverdue = { sent: 0, error: e?.message || String(e) };
  }

  // การ์ดไหนพัง (query/ส่งไม่สำเร็จ) ไม่ต้องล้มทั้ง digest — เก็บ error รายการ์ดไว้ในผลลัพธ์
  const jobs = [
    ['approvals', 'approvals', approvalsDigest],
    ['leads', 'leads', leadsDigest],
    ['pm', 'pm', pmDigest],
    ['handoff', 'sales', handoffDigest],
  ];
  for (const [name, spaceKey, build] of jobs) {
    try {
      const card = await build(supabase);
      if (!card) {
        results[name] = { sent: false, reason: 'ไม่มีเหตุการณ์' };
        continue;
      }
      const sent = await sendChatNow(spaceKey, card);
      results[name] = sent.ok ? { sent: true } : { sent: false, error: sent.error };
    } catch (e) {
      results[name] = { sent: false, error: e?.message || String(e) };
    }
  }

  return Response.json({ ok: true, at: new Date().toISOString(), results });
}
