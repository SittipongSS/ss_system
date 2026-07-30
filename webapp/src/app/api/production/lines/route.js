// ── API ไลน์ผลิต (mig 0184) ──────────────────────────────────────────────
// GET  : รายการไลน์ + (ถ้าส่ง from/to) วันที่กำลังไม่ปกติในช่วงนั้น
// POST : เพิ่มไลน์ (ฝ่ายผลิต/จัดซื้อ เท่านั้น — ดู canEditProduction)
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { normalizeLineInput } from '@/lib/pm/productionLines';
import { loadCapacityDays, loadLines, requireProduction } from '@/lib/pm/productionLinesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  const access = requireProduction({ user });
  if (access.response) return access.response;
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  try {
    const lines = await loadLines(supabase, {
      includeInactive: url.searchParams.get('includeInactive') !== '0',
    });
    // ช่วงวันเป็นตัวเลือก — หน้าตั้งค่าโหลดเฉพาะช่วงที่กำลังดู ไม่ดึงทั้งตาราง
    const capacityDays = from && to ? await loadCapacityDays(supabase, { from, to }) : [];
    return ok({ lines, capacityDays });
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { code, name, kind?, capacityPerDay?, unit?, isActive?, sortOrder?, note? }
export const POST = withUser(async ({ user, supabase, req }) => {
  const access = requireProduction({ user, edit: true });
  if (access.response) return access.response;

  const body = await req.json().catch(() => ({}));
  const { value, error } = normalizeLineInput(body);
  if (error) return badRequest(error);

  const row = {
    id: genId('PLN'),
    ...value,
    createdById: user.id ? String(user.id) : null,
    createdByName: user.name || null,
  };
  const { data, error: insertError } = await supabase
    .from('production_lines').insert(row).select().single();
  if (insertError) {
    // unique index เทียบ lower(btrim(code)) — 'mix-01' กับ 'MIX-01' ชนกัน
    if (insertError.code === '23505') return conflict(`มีไลน์รหัส ${value.code} อยู่แล้ว`);
    return fail(insertError.message, 500);
  }

  await recordAudit({
    user, action: 'create', entityType: 'production_line', entityId: data.id, after: data,
    summary: `เพิ่มไลน์ผลิต ${data.code} (${data.name})`, request: req,
  });
  return ok(data, 201);
});
