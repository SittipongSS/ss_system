import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { chatCard, sendChatNow } from '@/lib/chat';
import { fmtMoney } from '@/lib/format';
import { buildSahamitReverseRiskRows } from '@/lib/salesPlanningReverse';
import { SAHAMIT_AR_CODE } from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/daily-digest — สรุปประจำวันเข้า Google Chat (เฟส 3 ของ GOOGLE_CHAT_PLAN.md)
// เรียกโดย Vercel Cron (08:30 ไทย จ-ศ, ดู vercel.json) ด้วย Authorization: Bearer CRON_SECRET
// หรือ admin เปิดเองจากเบราว์เซอร์เพื่อทดสอบ. ไม่มีเหตุการณ์ = ไม่ส่งการ์ด (ไม่สแปม space)
//
// เนื้อหา 3 การ์ด (reuse ตรรกะเดิม ไม่มีกติกาใหม่):
//   1. งานค้างอนุมัติ (ลูกค้า/สินค้า/ใบเสนอราคา pending) → space ผู้อนุมัติ
//   2. งานโครงการเลยกำหนด/ครบใน 3 วัน (นิยาม isUrgent ใน lib/pm/derived.js) → space โครงการ
//   3. FC สหมิตรเสี่ยงช้า (buildSahamitReverseRiskRows เดียวกับแดชบอร์ด) → space ทีมขาย

const fmtShortDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

async function approvalsDigest(supabase) {
  const [customers, products, quotes] = await Promise.all([
    supabase.from('customers').select('name').eq('approvalStatus', 'pending').limit(50),
    supabase.from('products').select('fgCode, productDescription, productDescriptionEn').eq('approvalStatus', 'pending').limit(50),
    supabase.from('quotations').select('quoteNumber, customerName, totalAmount').eq('approvalStatus', 'pending')
      .not('status', 'in', '(cancelled,rejected)').limit(50),
  ]);
  const c = customers.data || [];
  const p = products.data || [];
  const q = quotes.data || [];
  const total = c.length + p.length + q.length;
  if (!total) return null;

  const sample = (arr, render) => arr.slice(0, 3).map(render).join(', ') + (arr.length > 3 ? ` และอีก ${arr.length - 3}` : '');
  return chatCard({
    title: '🗂 งานค้างอนุมัติเช้านี้',
    subtitle: `รวม ${total} รายการ`,
    rows: [
      c.length ? { label: `ลูกค้ารออนุมัติ (${c.length})`, value: sample(c, (x) => x.name) } : null,
      p.length ? { label: `สินค้ารออนุมัติ (${p.length})`, value: sample(p, (x) => x.productDescriptionEn || x.productDescription || x.fgCode) } : null,
      q.length ? { label: `ใบเสนอราคารออนุมัติ (${q.length})`, value: sample(q, (x) => `${x.quoteNumber} (${fmtMoney(x.totalAmount)})`) } : null,
    ].filter(Boolean),
    linkPath: '/home',
    linkLabel: 'เข้าระบบ',
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
  const { data: tasks } = await supabase
    .from('project_tasks')
    .select('projectId, name, status, finishDate')
    .neq('status', 'Completed')
    .not('finishDate', 'is', null)
    .lte('finishDate', soonISO)
    .limit(200);
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

async function sahamitDigest(supabase) {
  const { data: customer } = await supabase
    .from('customers').select('id').eq('arCode', SAHAMIT_AR_CODE).maybeSingle();
  if (!customer) return null;

  const { data: rounds } = await supabase
    .from('sahamit_forecast_rounds').select('*').eq('customerId', customer.id);
  if (!rounds?.length) return null;

  const { data: lines } = await supabase
    .from('sahamit_forecast_lines').select('*').in('roundId', rounds.map((r) => r.id));
  const { data: hol } = await supabase.from('holidays').select('date');
  const holidays = new Set((hol || []).map((h) => h.date));
  const roundsWithLines = rounds.map((round) => ({
    ...round,
    lines: (lines || []).filter((line) => line.roundId === round.id),
  }));

  const risk = buildSahamitReverseRiskRows(roundsWithLines, holidays, 90).filter((row) => row.risk);
  if (!risk.length) return null;

  return chatCard({
    title: '⚠️ FC สหมิตรเสี่ยงช้า',
    subtitle: `${risk.length} SKU-เดือน ต้องรีบ confirm`,
    rows: risk.slice(0, 5).map((row) => ({
      label: row.fgCode,
      value: `ต้องใช้ ${row.warehouseNeedMonth} · ควร confirm ภายใน ${row.requiredConfirmMonth || '-'} · FC ล่าสุด ${row.latestFcReceivedMonth || 'ยังไม่มี'}`,
    })),
    linkPath: '/sahamit',
    linkLabel: 'เปิดระบบสหมิตร',
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

  // การ์ดไหนพัง (query/ส่งไม่สำเร็จ) ไม่ต้องล้มทั้ง digest — เก็บ error รายการ์ดไว้ในผลลัพธ์
  const jobs = [
    ['approvals', 'approvals', approvalsDigest],
    ['pm', 'pm', pmDigest],
    ['sahamit', 'sales', sahamitDigest],
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
