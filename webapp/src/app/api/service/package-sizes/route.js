// ── API ทะเบียนขนาดแพ็คเกจ (mig 0398 · มติเจ้าของ 01/10) ───────────────────────────────
//
// ⭐ **ต้นทางของแถบ "ขนาด" บนแท็บสรุปส่งผล** — หัวหน้าเคาะขนาด + จำนวนต่อพื้นที่จากทะเบียนนี้ และระบบเสนอขนาด
//   จากช่วง ลบ.ม. ที่ตั้งไว้ที่นี่ · ทะเบียนอยู่ที่ระบบฐานข้อมูล (`/database/package-sizes`) — เพิ่ม · แก้ · ลบ ได้
//
// ⚠️ **อ่านได้ทุกคนที่เข้าฐานข้อมูลได้ · แก้ได้เฉพาะแอดมินและหัวหน้าฝ่ายบริการ** (`canManagePackageSizes`)
//   🔴 proxy ปล่อย `/api/service` ให้ทั้ง `service:edit` และ `service:work` (ช่าง) ⇒ **ด่านจริงของการเขียนอยู่ที่นี่**
//   ไม่ใช่ `requireService({ edit })` — ตัวนั้น Planner ผ่าน ซึ่งไม่ใช่คนเคาะขนาด
// ⚠️ ตัวอ่าน/เขียนอยู่ใน `packageSizesRepo` (เทสต์รันกับฐานปลอม) — ไฟล์นี้แค่ต่อสาย: สิทธิ์ → ตัวเขียน → audit
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden } from '@/lib/http';
import { canManagePackageSizes } from '@/lib/permissions';
import { PACKAGE_SIZE_EDIT_DENIED } from '@/lib/service/packageSizes';
import { createPackageSize, loadPackageSizes, packageSizeDbFailure, packageSizeUsage } from '@/lib/service/packageSizesRepo';
import { requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

// GET → { sizes, usage, canEdit }
export const GET = withUser(async ({ user, supabase }) => {
  const access = requireService({ user, registry: true });
  if (access.response) return access.response;
  try {
    const canEdit = canManagePackageSizes(user);
    const sizes = await loadPackageSizes(supabase);
    /* `usage` = ใบประเมินที่ยังไม่ส่งผลใช้ขนาดไหนอยู่กี่ใบ — ของกล่องยืนยันลบ ⇒ นับให้เฉพาะคนที่ลบได้
       (`null` = ไม่ได้นับ ไม่ใช่ศูนย์ · คนอ่านอย่างเดียวไม่ต้องจ่ายสอง query ที่ไล่ทั้งคิวคำร้อง) */
    const usage = canEdit ? await packageSizeUsage(supabase) : null;
    return ok({ sizes, usage, canEdit });
  } catch (e) {
    /* ข้อความดิบของฐาน (อังกฤษ + ชื่อตาราง) ลง log — จอได้ประโยคไทย (`packageSizeDbFailure`) */
    return fail(packageSizeDbFailure('read', e), 500);
  }
});

// POST { code, nameEn, autoSuggest, maxCbm?, note? }
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!canManagePackageSizes(user)) return forbidden(PACKAGE_SIZE_EDIT_DENIED);
  try {
    const body = await req.json().catch(() => ({}));
    const out = await createPackageSize(supabase, { user, body, canEdit: true });
    if (out.error) return fail(out.error, out.status);
    await recordAudit({ user, ...out.audit, request: req });
    return ok(out.data, out.status);
  } catch (e) {
    return fail(packageSizeDbFailure('write', e), 500);
  }
});
