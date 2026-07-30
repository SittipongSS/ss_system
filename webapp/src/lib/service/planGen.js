// ── gen นัดตามรอบบริการ (mig 0186) — ฝั่ง server ─────────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { generateEntityCode } from '@/lib/entityCode';
import { ensureVisits } from './rounds';
import { loadVisits } from './visitsRepo';

// gen นัดของรอบหนึ่งภายใน horizon — ใช้ทั้งตอนสร้างรอบและตอนกดปุ่ม "เติมนัด"
//
// ⭐ horizon 90 วัน ไม่ gen ทั้งปี: นัดที่ gen ล่วงหน้า 12 เดือนคือ 12 แถวที่จะถูก
// เลื่อนทุกเดือนแล้วไม่มีใครกล้าลบ · gen สั้น + ต่อรอบตอนปิดงานจริง
//
// ⚠️ อ่านนัดเดิมของ **ไซต์** ทั้งหมด (ไม่ใช่เฉพาะของรอบ) — ensureVisits กรอง planId
// เองอยู่แล้ว และชุดเดียวกันนี้ใช้เช็คซ้ำได้ทั้งกรณีกดเติมซ้ำ
export async function generateVisitsForPlan({ supabase, plan, user, req, horizonDays = 90 }) {
  const existing = await loadVisits(supabase, { siteId: plan.siteId });
  const rows = ensureVisits(plan, existing, { horizonDays });
  if (!rows.length) return [];

  const payload = [];
  for (const draft of rows) {
    payload.push({
      id: genId('SVV'),
      // ⚠️ ออกรหัสทีละใบผ่าน RPC atomic — ห้ามคำนวณเลขรันเองแล้วบวกทีละ 1
      // (สองคนกดเติมนัดพร้อมกันจะได้รหัสชนกัน แล้ว unique constraint เด้งทั้งชุด)
      code: await generateEntityCode(supabase, 'SV'),
      ...draft,
      createdById: user?.id ? String(user.id) : null,
      createdByName: user?.name || null,
    });
  }

  const { data, error } = await supabase.from('service_visits').insert(payload).select();
  if (error) throw error;

  await recordAudit({
    user, action: 'create', entityType: 'service_visit', entityId: plan.id,
    summary: `gen นัดตามรอบ ${data?.length || 0} ครั้ง (ล่วงหน้า ${horizonDays} วัน) ที่ไซต์ ${plan.siteId}`,
    request: req,
  });
  return data || [];
}
