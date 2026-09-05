// ── API เครื่องรายตัว · เส้นทะเบียนรวม (mig 0344) ─────────────────────────
//
// ⭐ **เส้นนี้มีเพราะเครื่องอาจไม่มีไซต์** — เส้นเดิม
//   `/api/service/sites/[id]/assets/[assetId]` ต้องมี siteId ใน URL ⇒ เครื่องที่ยัง
//   ไม่ได้ติดตั้ง (สถานะ "ว่าง") ลบไม่ได้เลย ต้องยิง SQL เอง
//   ⚠️ เส้นเดิม **ยังอยู่** — ใช้ตอนที่คนกำลังยืนอยู่ในไซต์และรู้ปลายทางแน่นอน
//
// ⚠️ ด่านลบเป็นตัวเดียวกันทั้งสองเส้น (`lib/service/assetDelete.js`)
import { recordAudit } from '@/lib/audit';
import { canForceDelete, isDryRun, isForceRequest } from '@/lib/forceDelete';
import { assetForceManifest, deleteAssetDeep } from '@/lib/service/forceDeleteService';
import { withUser, ok, fail, conflict, notFound } from '@/lib/http';
import { canEditService } from '@/lib/permissions';
import { assetDeleteError, assetHistoryCount } from '@/lib/service/assetDelete';
import { findAssetById, findSite, requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    // ด่านระดับโมดูล — ไม่มีไซต์เดียวให้ตรวจ (เครื่องอาจยังไม่ได้ติดตั้ง)
    const access = requireService({ user, edit: true });
    if (access.response) return access.response;

    const before = await findAssetById(supabase, id);
    if (!before) return notFound('ไม่พบเครื่องนี้');

    // ⭐ ทางลัดผู้ดูแลระบบ — ดูเหตุผลเต็มที่ lib/service/forceDeleteService.js
    const admin = canForceDelete(user);
    if (isDryRun(req) && admin) return ok(await assetForceManifest(supabase, id));

    const site = before.siteId ? await findSite(supabase, before.siteId) : null;
    const where = site ? ` ออกจากไซต์ ${site.name}` : '';
    const label = before.code || before.serial || before.label;

    if (isForceRequest(req) && admin) {
      await deleteAssetDeep(supabase, id);
      await recordAudit({
        user, action: 'delete', entityType: 'service_asset', entityId: id, before,
        summary: `ลบเครื่อง ${label}${where} (แอดมินบังคับลบทั้งสาย)`, request: req,
      });
      return ok({ ok: true, forced: true });
    }

    const { used } = await assetHistoryCount(supabase, id);
    // 🔑 ด่านตัวเดียวกับที่จอใช้ปิดปุ่ม
    const gate = assetDeleteError(before, { canEdit: canEditService(user), used });
    if (gate) return conflict(gate);

    const { error } = await supabase.from('service_assets').delete().eq('id', id);
    if (error) return fail(error.message, 500);

    await recordAudit({
      user, action: 'delete', entityType: 'service_asset', entityId: id, before,
      summary: `ลบเครื่อง ${label}${where}`, request: req,
    });
    return ok({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
