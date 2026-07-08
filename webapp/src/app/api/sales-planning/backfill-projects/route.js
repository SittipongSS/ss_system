import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { isSuperuser } from '@/lib/permissions';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/backfill-projects — งานครั้งเดียว (superuser):
// โปรเจกต์ PM เก่าที่เกิดก่อนระบบบริหารงานขาย ยังไม่ผูกดีล → สร้าง "โครงการขาย" ผูกให้
// ทุกตัว เพื่อไม่ให้มีโปรเจกต์ลอยนอกระบบ (Sales เป็นแม่). ดีลที่สร้าง:
//   stage=timeline_proposed (มีโปรเจกต์/ไทม์ไลน์แล้ว แต่ "ยังไม่ปิดการขาย" — ให้ผู้ดูแล
//   ตัดสินใจปิด Won เอง ไม่เหมาเป็น won ให้), projectValue=0, wonValue=null,
//   forecastMonth/confirmedAt=null → ไม่เข้ายอด/FC เดือนใด, ธง needsReview+bypassPipeline
// ให้ผู้ดูแล (AE) ไล่เติมมูลค่าคาดการณ์/เดือนทีหลังผ่านตัวกรอง "รอเติมข้อมูล".
// Idempotent: ข้ามโปรเจกต์ที่ผูกดีลแล้ว → รันซ้ำได้ปลอดภัย.
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!isSuperuser(user.role)) return forbidden('เฉพาะผู้ดูแลระบบเท่านั้น');

  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name, customerId, customerName, team, ownerId, aeOwner');
  if (projErr) return fail(projErr.message, 500);

  const { data: linked, error: linkErr } = await supabase
    .from('sales_deals')
    .select('projectId')
    .not('projectId', 'is', null);
  if (linkErr) return fail(linkErr.message, 500);
  const linkedIds = new Set((linked || []).map((d) => d.projectId));

  const orphans = (projects || []).filter((p) => !linkedIds.has(p.id));
  if (!orphans.length) return ok({ created: 0, skipped: 0, message: 'ไม่มีโปรเจกต์ที่ต้อง backfill' });

  const now = new Date().toISOString();
  const rows = orphans.map((p) => ({
    id: genId('DEAL'),
    title: p.name || `โครงการ ${p.id}`,
    customerId: p.customerId || null,
    customerName: p.customerName || null,
    stage: 'timeline_proposed',  // มีไทม์ไลน์แล้ว แต่ยังไม่ปิดการขาย (ผู้ดูแลปิด Won เอง)
    projectValue: 0,      // NOT NULL DEFAULT 0 — มูลค่าคาดการณ์รอผู้ดูแลเติม
    wonValue: null,       // ยังไม่ Won → ยังไม่มีมูลค่าปิดจริง
    probability: 65,      // ตรงกับ DEFAULT_PROBABILITY_BY_STAGE.timeline_proposed
    forecastMonth: null,  // null → ไม่ตกเดือนใดในแดชบอร์ด จนกว่าจะเติม
    expectedCloseDate: null,
    confirmedAt: null,
    depositPaid: false,
    ownerId: p.ownerId || null,
    ownerName: p.aeOwner || null,
    team: p.team || null,
    projectId: p.id,
    metadata: { source: 'pm-backfill', needsReview: true, bypassPipeline: true, backfilledAt: now },
    createdAt: now,
    updatedAt: now,
  }));

  // insert แบบ ignore-duplicates กัน race กับ unique(projectId) ถ้ามีการผูกคู่ขนาน
  let created = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { data, error } = await supabase.from('sales_deals').insert(chunk).select('id');
    if (error) {
      // ถ้าชน unique(projectId) ในก้อน → ลองทีละแถว ข้ามตัวที่ชน
      for (const row of chunk) {
        const { error: oneErr } = await supabase.from('sales_deals').insert(row);
        if (!oneErr) created += 1;
      }
      continue;
    }
    created += data?.length || 0;
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: 'backfill',
    summary: `backfill สร้างโครงการขายจากโปรเจกต์ PM เก่า ${created} รายการ (รอเติมมูลค่าจริง)`,
    request: req,
  });

  return ok({ created, skipped: orphans.length - created });
});
