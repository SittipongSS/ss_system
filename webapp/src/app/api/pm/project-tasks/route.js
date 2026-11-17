import { pmEditScope, inScope } from '@/lib/permissions';
import { recalculateGraph } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { propagateAndPersist } from '@/lib/pm/status';
import { genId } from '@/lib/id';
import { withUser, ok, fail, forbidden, notFound, badRequest } from '@/lib/http';
import { businessDate } from '@/lib/businessDate';
import { DEAL_SCOPE_COLUMNS, dealScopeRow } from '@/lib/pm/dealTimelineScope';

export const dynamic = 'force-dynamic';

/* ⭐ งวด P3b-2 ยุบโครงการ (16/11/2026): ถอด GET (ไม่มีจอไหนเรียกแล้ว — หน้าโครงการถูกถอดในงวด P2d) ·
   POST รับเฉพาะ dealId — ขั้นตอนเป็นของดีลเสมอ ไม่ประทับ projectId แล้ว · ลำดับ/จุดยึดวัน/สถานะคิดในชุดของดีล
   (เดิม: ดีลในโครงการนับลำดับ+จุดยึดวันร่วมทั้งโครงการ) · ด่าน "โครงการปิดแล้ว" ถอด (ปิดแล้ว 0 · ปิดเพิ่มไม่ได้อีก) */

// POST — เพิ่มขั้นตอนเข้าไทม์ไลน์ของดีล (manual). stepOrder = max+1 ในชุดของดีล
export const POST = withUser(async ({ user, supabase, req }) => {
  const body = await req.json();
  if (!body.dealId) return badRequest('ต้องระบุ dealId');

  // Row-level scope (งวด P2b · ดีล = หน่วยเดียว): ขอบเขตของดีลตัดสิน
  const { data: deal, error: dealError } = await supabase.from('sales_deals')
    .select(DEAL_SCOPE_COLUMNS).eq('id', body.dealId).maybeSingle();
  if (dealError) return fail(dealError.message, 500);
  if (!deal) return notFound('ไม่พบดีล');
  if (!inScope(pmEditScope(user?.role), user, dealScopeRow(deal))) return forbidden();

  const { data: allTasks } = await supabase.from('project_tasks').select('*')
    .eq('dealId', deal.id).order('stepOrder', { ascending: true });

  // บั๊ก C: แทรกตรงตำแหน่ง — ถ้าระบุ afterTaskId ให้ stepOrder = ของตัวนั้น+1 แล้ว
  // ดัน stepOrder ของแถวที่อยู่หลังให้เลื่อนลง 1 (กันชน + คงลำดับเฟสติดกัน);
  // ไม่ระบุ → ต่อท้ายสุดเหมือนเดิม.
  const lastOrder = (allTasks || []).reduce((m, t) => Math.max(m, t.stepOrder ?? 0), -1);
  let stepOrder = lastOrder + 1;
  const after = body.afterTaskId ? (allTasks || []).find((t) => t.id === body.afterTaskId) : null;
  // แทรก "ก่อน" task ที่ระบุ (เช่นปุ่ม + ก่อนหัวแถวแรกของเฟส) — stepOrder = ของตัวนั้น
  // แล้วดันตัวนั้น + ตัวที่อยู่หลังลง 1; ไม่งั้นถ้าระบุ afterTaskId ก็แทรกต่อท้ายตัวนั้น.
  const before = body.beforeTaskId ? (allTasks || []).find((t) => t.id === body.beforeTaskId) : null;
  if (before) {
    stepOrder = before.stepOrder ?? 0;
    const toShift = (allTasks || []).filter((t) => (t.stepOrder ?? 0) >= stepOrder);
    if (toShift.length) {
      await Promise.all(toShift.map((t) =>
        supabase.from('project_tasks').update({ stepOrder: (t.stepOrder ?? 0) + 1 }).eq('id', t.id)
      ));
    }
  } else if (after) {
    stepOrder = (after.stepOrder ?? 0) + 1;
    const toShift = (allTasks || []).filter((t) => (t.stepOrder ?? 0) >= stepOrder);
    if (toShift.length) {
      await Promise.all(toShift.map((t) =>
        supabase.from('project_tasks').update({ stepOrder: (t.stepOrder ?? 0) + 1 }).eq('id', t.id)
      ));
    }
  }

  const row = {
    id: genId('PT'),
    dealId: deal.id,
    stepOrder,
    name: body.name || '',
    role: body.role || 'SA',
    assignee: body.assignee || null,
    // ผู้รับผิดชอบที่เลือกตอนเพิ่มขั้นตอนต้องติดไปด้วย ไม่งั้นค่าที่กรอกหายเงียบ ๆ
    // (เคยเว้นไว้ตอน migration 0019 ยังไม่รัน — รันแล้ว และ PATCH เขียนคอลัมน์นี้อยู่)
    assigneeId: body.assigneeId || null,
    phase: body.phase || null,
    isMilestone: !!body.isMilestone,
    durationDays: body.durationDays ?? 1,
    startDate: body.startDate || null,
    finishDate: body.finishDate || null,
    dueDate: body.dueDate || null,
    status: body.status || 'Pending',
    predecessors: body.predecessors || [],
    cellsOverride: body.cellsOverride ?? null,
    note: body.note || '',
    showNoteInPrint: !!body.showNoteInPrint,
    origin: 'custom', // ผู้ใช้เพิ่มเอง (template ใช้ DB default 'template') — migration 0022
    // กรอกวันเริ่มตอนเพิ่มขั้นตอน = ปักหมุด (กติกาเดียวกับ PATCH: 'startDate' ใน updates →
    // startLocked = มีวันเริ่มไหม). 🐞 เดิมไม่ใส่เลยเพื่อกัน insert พังตอน migration 0032
    // ยังไม่รัน — รันไปตั้งแต่ยุคนั้นแล้ว (ปัจจุบัน 0198) ผลข้างเคียงคือวันเริ่มที่ผู้ใช้กรอก
    // ถูก recalculateGraph ด้านล่างดึงกลับไปเกาะ anchor/predecessors ทันทีตั้งแต่แถวแรกที่สร้าง
    startLocked: !!body.startDate,
  };

  setHolidays([...(await holidaySet())]);
  const tasksWithNew = [...(allTasks || []), row];
  // anchor: วันเริ่มเร็วสุดของชุดของดีล (fallback วันนี้)
  const anchor = (allTasks || []).map((t) => t.startDate).filter(Boolean).sort()[0] || businessDate();
  const recalced = recalculateGraph(tasksWithNew, anchor);
  const finalRow = recalced.find(t => t.id === row.id);

  const { data, error } = await supabase.from('project_tasks').insert(finalRow).select().single();
  if (error) return fail(error.message, 500);

  // ขั้นใหม่อาจทำให้กราฟเปลี่ยน (เช่นแทรกขั้นที่ไม่มี predecessor = พร้อมทำทันที,
  // หรือไปคั่นกลางทำให้ขั้นถัดไม่พร้อม) → คำนวณสถานะทั้งชุดของดีลใหม่. client เรียก load() ต่อ.
  await propagateAndPersist(supabase, deal.id);

  return ok(data, 201);
});
