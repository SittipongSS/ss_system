// ── gen นัดตามรอบบริการ (mig 0188) — ฝั่ง server ─────────────────────────
// แยกจาก route.js เพราะไฟล์ route ของ Next ส่งออกได้เฉพาะ HTTP method
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { insertRowsWithEntityCode } from '@/lib/entityCode';
import { ensureVisits } from './rounds';
import { initialVisitStatus } from './visitGate';
import { gateContextForSite, loadVisitGateContext } from './gateContext';
import { findSite } from './sitesRepo';
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

  /* ⭐ นัดที่ระบบ gen เองก็ต้องผ่านด่านเหมือนกัน (มติผู้ใช้ 2026-08-28)
     รอบที่มีเจ้าหน้าที่ประจำและวันตกในช่วงที่ไซต์ให้เข้า ⇒ ขึ้นตารางเลย
     รอบที่ไม่มีเจ้าหน้าที่ หรือวันชนช่วงเข้าไซต์ ⇒ จอดเป็นร่างให้คนจัดคิวเห็นและจัดการ
     ⚠️ ของเดิม gen เป็น `scheduled` ตรง ๆ ⇒ นัดที่ไม่มีคนรับผิดชอบขึ้นตารางไปเงียบ ๆ
     แล้วไม่มีใครไป (prod วันนี้ `assigneeId = null` ทุกใบ) */
  const site = await findSite(supabase, plan.siteId);
  /* ⭐ ด่าน ①② ตรวจจริงตั้งแต่ PR-C — นัดที่ gen ออกมาต้องถูกตัดสินด้วยบริบทจริง
     ⚠️ ไม่ป้อน = ทุกใบเกิดเป็นร่าง แล้วคนจัดคิวต้องมานั่งปล่อยทีละใบ ซึ่งคืออาการ
        ที่กติกา "ด่านต้องไม่กลายเป็นแรงเสียดทานรายวัน" ห้ามไว้ */
  const gateCtx = await loadVisitGateContext(supabase, [plan.siteId]);
  const siteGateCtx = gateContextForSite(gateCtx, plan.siteId, { site });

  const payload = [];
  for (const draft of rows) {
    payload.push({
      id: genId('SVV'),
      status: initialVisitStatus(draft, siteGateCtx),
      // ⚠️ ไม่ใส่ code ตรงนี้ — รหัสออกทีละใบในฟังก์ชัน SQL ตอน insert (mig 0240)
      // ห้ามคำนวณเลขรันเองแล้วบวกทีละ 1 (สองคนกดเติมนัดพร้อมกันจะได้รหัสชนกัน)
      // และห้ามจองเลขไว้ก่อนตรงนี้ — ชุดนี้ล้มทั้งชุด เลขที่จองไว้จะหายไปทั้งหมด
      ...draft,
      createdById: user?.id ? String(user.id) : null,
      createdByName: user?.name || null,
    });
  }

  // ออกรหัสทุกใบ + insert ในทรานแซกชันเดียว — ล้มใบไหนก็คืนเลขทั้งชุด (mig 0240)
  const { data, error } = await insertRowsWithEntityCode(supabase, 'SV', payload);
  if (error) throw error;

  await recordAudit({
    user, action: 'create', entityType: 'service_visit', entityId: plan.id,
    summary: `gen นัดตามรอบ ${data?.length || 0} ครั้ง (ล่วงหน้า ${horizonDays} วัน) ที่ไซต์ ${plan.siteId}`,
    request: req,
  });
  return data || [];
}
