// ── API ของที่ใช้ในนัด (mig 0188 · S-3) ──────────────────────────────────
// ⚠️ มติ §10.2: **บันทึกอย่างเดียว ไม่ตัดสต็อก ไม่ออกบิล** — เป็นหลักฐานว่าเติม
// อะไรไปเท่าไร เพื่อตอบลูกค้าย้อนหลัง + ทำให้ประเมินรอบถัดไปแม่นขึ้น
// ⚠️ ห้ามเผลอทำครึ่งทาง — ถ้าไม่ตัดสต็อกก็อย่ามีช่อง "คงเหลือ" ให้เข้าใจผิด
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest } from '@/lib/http';
import { loadVisitItems, requireVisit } from '@/lib/service/visitsRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id });
    if (access.response) return access.response;
    return ok(await loadVisitItems(supabase, id));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST { label, qty?, unit?, assetId?, productId?, note? }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireVisit({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const body = await req.json().catch(() => ({}));
    const label = String(body.label ?? '').trim().replace(/\s+/g, ' ');
    if (!label) return badRequest('ต้องระบุชื่อของที่ใช้');
    if (label.length > 200) return badRequest('ชื่อของที่ใช้ยาวเกิน 200 ตัวอักษร');

    // ⚠️ จำนวนเว้นว่างได้ — "เติมน้ำหอมขวดนึง" ที่ยังไม่ได้ชั่งจริงมีอยู่จริง
    // ห้ามแปลงค่าว่างเป็น 0 (0 อ่านว่า "ไม่ได้ใช้เลย" ซึ่งคนละความหมาย)
    let qty = null;
    if (body.qty !== undefined && body.qty !== null && String(body.qty).trim() !== '') {
      qty = Number(body.qty);
      if (!Number.isFinite(qty) || qty <= 0) return badRequest('จำนวนต้องเป็นตัวเลขมากกว่า 0');
    }

    const unit = String(body.unit ?? '').trim();
    if (unit.length > 30) return badRequest('หน่วยยาวเกิน 30 ตัวอักษร');
    const note = String(body.note ?? '').trim();
    if (note.length > 500) return badRequest('หมายเหตุยาวเกิน 500 ตัวอักษร');

    const row = {
      id: genId('SVI'),
      visitId: id,
      assetId: body.assetId || null,
      productId: body.productId || null,
      label,
      qty,
      unit: unit || null,
      note: note || null,
    };
    const { data, error } = await supabase.from('service_visit_items').insert(row).select().single();
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'create', entityType: 'service_visit', entityId: id, after: data,
      summary: `บันทึกของที่ใช้ ${data.label} ในนัด ${access.visit.code || id}`, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
