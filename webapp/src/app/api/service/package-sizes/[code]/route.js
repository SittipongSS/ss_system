// ── API ขนาดแพ็คเกจรายตัว (mig 0398 · มติเจ้าของ 01/10) ────────────────────────────────
//
// ⚠️ **ด่านจริงของการเขียนอยู่ที่นี่** (`canManagePackageSizes`) — proxy ปล่อยช่าง (`service:work`) มาถึงได้ (ดูหัวไฟล์
//   `../route.js`) ⇒ ตรวจสิทธิ์ **ก่อน** อ่านพารามิเตอร์/ฐาน: คนไม่มีสิทธิ์ต้องไม่รู้ด้วยซ้ำว่ารหัสไหนมีอยู่
// ⚠️ ตัวเขียนอยู่ใน `packageSizesRepo` (เทสต์รันกับฐานปลอม) — ไฟล์นี้แค่ต่อสาย: สิทธิ์ → ตัวเขียน → audit
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden } from '@/lib/http';
import { canManagePackageSizes } from '@/lib/permissions';
import { PACKAGE_SIZE_EDIT_DENIED } from '@/lib/service/packageSizes';
import { deletePackageSize, packageSizeDbFailure, updatePackageSize } from '@/lib/service/packageSizesRepo';

export const dynamic = 'force-dynamic';

// PATCH { nameEn?, autoSuggest?, maxCbm?, note? } — รหัสแก้ไม่ได้ (พื้นที่ที่เคาะแล้วเก็บรหัสเป็นภาพนิ่ง)
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!canManagePackageSizes(user)) return forbidden(PACKAGE_SIZE_EDIT_DENIED);
  const { code } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const out = await updatePackageSize(supabase, { user, code, body, canEdit: true });
    if (out.error) return fail(out.error, out.status);
    await recordAudit({ user, ...out.audit, request: req });
    return ok(out.data);
  } catch (e) {
    return fail(packageSizeDbFailure('write', e), 500);
  }
});

/* DELETE → { code, usage: { surveys, zones, docNos } } — ลบได้แม้มีใบใช้อยู่ (มติเจ้าของ 01/10)
   `usage` = ใบประเมินที่ยังไม่ส่งผลซึ่งต้องเลือกขนาดใหม่ก่อนส่ง · ใบที่ส่งผลแล้วไม่เปลี่ยน (ไม่มี FK ไม่มี cascade) */
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!canManagePackageSizes(user)) return forbidden(PACKAGE_SIZE_EDIT_DENIED);
  const { code } = await ctx.params;
  try {
    const out = await deletePackageSize(supabase, { code, canEdit: true });
    if (out.error) return fail(out.error, out.status);
    await recordAudit({ user, ...out.audit, request: req });
    return ok(out.data);
  } catch (e) {
    return fail(packageSizeDbFailure('write', e), 500);
  }
});
