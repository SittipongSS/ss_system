// ── API ของเข้ารายแถว (mig 0176) ────────────────────────────────────────
// PATCH  : แก้กำหนดถึง / ทำเครื่องหมายว่ามาแล้ว / แก้รายละเอียด
// DELETE : ลบแถว (ของที่กางผิด หรือยกเลิกการสั่ง)
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { normalizeDeliveryInput } from '@/lib/pm/deliveries';
import { findDelivery, loadDeliveries, requireProject, salesOrderScopeError } from '@/lib/pm/deliveriesRepo';
import { deliveriesCompletedUpdate } from '@/lib/pm/projectUpdates';
import { appendUpdate } from '@/lib/master/updates';

export const dynamic = 'force-dynamic';

// PATCH — ส่งมาเฉพาะช่องที่จะแก้ก็ได้ (merge กับของเดิมก่อนตรวจ เพื่อให้กฎชุดเดียว
// ใช้ได้ทั้งตอนสร้างและตอนแก้ ไม่ต้องเขียน validator สองชุดที่เพี้ยนหากันทีหลัง)
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, deliveryId } = await ctx.params;
  const access = await requireProject({ user, supabase, id, edit: true });
  if (access.response) return access.response;
  const closedErr = projectWriteBlockedError(access.project);
  if (closedErr) return conflict(closedErr);

  try {
    const before = await findDelivery(supabase, access.project.id, deliveryId);
    if (!before) return notFound('ไม่พบรายการของเข้า');

    const body = await req.json().catch(() => ({}));
    const merged = { ...before, ...body };
    const { value, error } = normalizeDeliveryInput(merged);
    if (error) return badRequest(error);
    const soError = await salesOrderScopeError(supabase, access.project, value.salesOrderId);
    if (soError) return badRequest(soError);
    // ของมาถึงก่อนวันที่สั่งไม่สมเหตุผล แต่ "มาก่อนกำหนด" ปกติมาก → ไม่บล็อก
    // ตรวจแค่ว่าเป็นวันที่ที่เป็นไปได้ (ทำใน normalizeDeliveryInput แล้ว)

    const { data, error: updateError } = await supabase
      .from('material_deliveries')
      .update({ ...value, updatedAt: new Date().toISOString() })
      .eq('id', deliveryId).select().single();
    if (updateError) return fail(updateError.message, 500);

    // สรุปให้อ่านรู้เรื่องใน audit: การกด "มาแล้ว" คือเหตุการณ์ที่คนตามหาย้อนหลัง
    const arrivedNow = !before.arrivedAt && data.arrivedAt;

    // เธรดโครงการเอาเฉพาะจังหวะ "ครบทุกรายการ" — การติ๊กรับของรายชิ้นเป็นงานประจำวัน
    // ของ PC ซึ่งถ้าลงเธรดทุกครั้งจะกลบบทสนทนาจนหมด · จังหวะที่ระดับโครงการสนใจคือ
    // ตอนที่ของครบแล้วเริ่มผลิตได้ ซึ่งเกิดครั้งเดียว
    if (arrivedNow) {
      const rows = await loadDeliveries(supabase, access.project.id);
      const event = deliveriesCompletedUpdate(
        rows.map((row) => (row.id === deliveryId ? before : row)),
        rows,
      );
      if (event) {
        await appendUpdate(supabase, { entityType: 'project', entityId: access.project.id, ...event, user });
      }
    }
    await recordAudit({
      user, action: 'update', entityType: 'material_delivery', entityId: deliveryId,
      before, after: data,
      summary: arrivedNow
        ? `ของเข้าแล้ว "${data.label}" (${data.arrivedAt})`
        : `แก้รายการของเข้า "${data.label}"`,
      request: req,
    });
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id, deliveryId } = await ctx.params;
  const access = await requireProject({ user, supabase, id, edit: true });
  if (access.response) return access.response;
  const closedErr = projectWriteBlockedError(access.project);
  if (closedErr) return conflict(closedErr);

  try {
    const before = await findDelivery(supabase, access.project.id, deliveryId);
    if (!before) return notFound('ไม่พบรายการของเข้า');
    const { error } = await supabase.from('material_deliveries').delete().eq('id', deliveryId);
    if (error) return fail(error.message, 500);
    await recordAudit({
      user, action: 'delete', entityType: 'material_delivery', entityId: deliveryId, before,
      summary: `ลบรายการของเข้า "${before.label}"`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
