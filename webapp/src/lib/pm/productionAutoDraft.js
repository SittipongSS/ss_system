// ── สร้างงานร่างจาก SO ที่อนุมัติแล้ว (P-2) — ฝั่ง server ─────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowsWithEntityCode } from '@/lib/entityCode';
import { draftJobsForSalesOrder } from './productionPlan';
import { approvedOrdersWithLines, existingJobLineIds } from './productionJobsRepo';

// เรียกได้ทั้งตอนเปิดคิว (กวาดทุก SO) และตอนกดจาก SO ใบเดียว
//
// ⚠️ **ต้องกดซ้ำได้เสมอโดยไม่ได้งานซ้ำ** — ฟังก์ชันนี้ถูกเรียกทุกครั้งที่เปิดคิว
// กันสองชั้น: กรองด้วย existingJobLineIds ก่อน + unique index ที่ระดับ DB
// (partial unique บน salesOrderLineId เฉพาะ status='draft' — mig 0189)
export async function autoDraftJobs({ supabase, user, req, salesOrderId = null }) {
  const bundles = await approvedOrdersWithLines(supabase, { salesOrderId });
  if (!bundles.length) return [];

  const taken = await existingJobLineIds(supabase, bundles.map((b) => b.order.id));

  const payload = [];
  for (const { order, lines } of bundles) {
    const drafts = draftJobsForSalesOrder(order, lines, { existingLineIds: [...taken] });
    for (const draft of drafts) {
      taken.add(draft.salesOrderLineId);
      payload.push({
        id: genId('PBJ'),
        // ⚠️ ไม่ใส่ code ตรงนี้ — รหัสออกทีละใบในฟังก์ชัน SQL ตอน insert (mig 0238)
        // ห้ามคำนวณเลขรันเองแล้วบวกทีละ 1 (สองคนเปิดคิวพร้อมกันจะได้รหัสชนกัน)
        // และห้ามจองเลขไว้ก่อนตรงนี้ — ชุดนี้ล้มทั้งชุด เลขที่จองไว้จะหายไปทั้งหมด
        ...draft,
        dayOverrides: {},
        createdById: user?.id ? String(user.id) : null,
        createdByName: user?.name || null,
      });
    }
  }
  if (!payload.length) return [];

  // ออกรหัสทุกใบ + insert ในทรานแซกชันเดียว — ล้มใบไหนก็คืนเลขทั้งชุด (mig 0238)
  const { data, error } = await insertRowsWithEntityCode(supabase, 'PB', payload);
  if (error) {
    // ชนกันเพราะมีคนกดพร้อมกัน = ของถูกสร้างไปแล้ว ไม่ใช่ความผิดพลาดที่ต้องเด้งใส่ผู้ใช้
    if (error.code === '23505') return [];
    throw error;
  }

  await recordAudit({
    user, action: 'create', entityType: 'production_job', entityId: salesOrderId || 'auto',
    summary: `สร้างงานผลิตร่างจากใบสั่งขาย ${data.length} รายการ`,
    request: req,
  });
  return data || [];
}
