// ── API ทะเบียนกลิ่น (mig 0171) — ค้นหา + เสนอกลิ่นใหม่ ───────────────────
// GET  : ทุกคนที่เห็นแคตตาล็อกสินค้า (กลิ่นเป็นข้อมูลอ้างอิงข้ามฝ่าย)
// POST : ฝ่ายขายเสนอได้เป็น "ร่าง" รอ RD รับ · RD สร้างแล้วเข้าทะเบียนได้เลย
//        ⭐ ฝ่ายขายส่ง `code`/`producedAt`/`sentAt`/`status` มาได้ครบ (มติผู้ใช้
//        2026-08-19 — ย้ายกลิ่นเก่าจากระบบเดิม) · `status` ของฝ่ายขายลงเป็น
//        `proposedStatus` **ไม่ใช่** `status` ⇒ แถวยังเป็นร่างและยังใช้งานไม่ได้
//        ⚠️ ด่านจริงอยู่ที่นี่ — proxy เห็นแค่ role ไม่รู้ว่าใครเป็นเจ้าของทะเบียน
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { canEditScent, canProposeScent, canViewScents, isScentRegistrar } from '@/lib/master/scents';
import { createScent, loadScents } from '@/lib/master/scentFormulaAdmin';

export const dynamic = 'force-dynamic';

// GET /api/master/scents?status=active,developing&customerId=CUS-1
// ชุดข้อมูลเล็ก — ค้นชื่อ/กรองสถานะทำที่ client เหมือนหน้าทะเบียนวัสดุ
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewScents(user)) return forbidden();

  const sp = new URL(req.url).searchParams;
  const statusParam = sp.get('status');
  try {
    const rows = await loadScents(supabase, {
      status: statusParam ? statusParam.split(',').filter(Boolean) : null,
      customerId: sp.get('customerId') || null,
    });
    // ติดธงสิทธิ์มากับแถวเลย — หน้าจอไม่มี user id ให้เทียบ `createdById` เอง
    // (แพตเทิร์นเดียวกับ `_mine` ของคิวเคสขอราคา) · ธงนี้เป็นแค่เรื่องการแสดงผล
    // ด่านจริงยังอยู่ที่ handler ทุกเส้น
    return ok(rows.map((s) => ({ ...s, _canEdit: canEditScent(user, s) })));
  } catch (e) {
    return fail(e.message, 500);
  }
});

// POST /api/master/scents
// { name, customerId, customerName?, code?, dealId?, note? }
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canProposeScent(user)) return forbidden('ไม่มีสิทธิ์เพิ่มกลิ่นเข้าทะเบียน');

  const body = await req.json().catch(() => ({}));
  // RD สร้างพร้อมรหัส = เข้าทะเบียนเลย · ฝ่ายขาย (หรือ RD ที่ยังไม่ใส่รหัส) = ร่าง
  const accepted = isScentRegistrar(user) && !!String(body.code ?? '').trim();

  try {
    const data = await createScent(supabase, body, user, { accepted });
    await recordAudit({
      user, action: 'create', entityType: 'scent', entityId: data.id, after: data, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    // ข้อความจาก normalize/แปล unique violation = เรื่องที่ผู้ใช้แก้เองได้ → 400
    return badRequest(e.message);
  }
});
