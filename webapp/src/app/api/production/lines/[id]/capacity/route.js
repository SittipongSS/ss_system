// ── API กำลังผลิตรายวันของไลน์หนึ่ง (mig 0186) ───────────────────────────
// GET  : วันที่กำลังไม่ปกติของไลน์ (กรองช่วงด้วย ?from=&to=)
// POST : ตั้ง/แก้กำลังของวันหนึ่ง — upsert เพราะ "วันเดียวมีค่าเดียว" (unique index)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, notFound } from '@/lib/http';
import { normalizeCapacityDayInput } from '@/lib/pm/productionLines';
import { findLine, loadCapacityDays, requireProduction } from '@/lib/pm/productionLinesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req, ctx }) => {
  const access = requireProduction({ user });
  if (access.response) return access.response;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  try {
    return ok(await loadCapacityDays(supabase, {
      lineId: id,
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
    }));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { date, capacityPerDay, reason? }  — capacityPerDay = 0 คือ "ปิดไลน์วันนั้น"
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const access = requireProduction({ user, edit: true });
  if (access.response) return access.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeCapacityDayInput(body);
  if (error) return badRequest(error);

  try {
    const line = await findLine(supabase, id);
    if (!line) return notFound('ไม่พบไลน์ผลิต');

    // upsert ตาม (lineId, date): ตั้งค่าซ้ำวันเดิม = แก้ค่าเดิม ไม่ใช่ error
    // (ผู้ใช้กดตั้งวันเดิมซ้ำแล้วเจอ "ซ้ำ" คือ UX ที่ทำให้คนเลิกใช้)
    const { data, error: upsertError } = await supabase
      .from('production_capacity_days')
      .upsert({
        id: genId('PCD'),
        lineId: id,
        ...value,
        createdById: user.id ? String(user.id) : null,
        createdByName: user.name || null,
      }, { onConflict: 'lineId,date' })
      .select().single();
    if (upsertError) return fail(upsertError.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'production_capacity_day', entityId: data.id, after: data,
      summary: value.capacityPerDay === 0
        ? `ปิดไลน์ ${line.code} วันที่ ${value.date}${value.reason ? ` (${value.reason})` : ''}`
        : `ตั้งกำลังไลน์ ${line.code} วันที่ ${value.date} = ${value.capacityPerDay}`,
      request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
