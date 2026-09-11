// ── คำสั่งย้าย/เปลี่ยนสถานะของเครื่อง (เฟส C · mig 0335) ─────────────────
//
// ⭐ **ทางเขียนเดียวของทุกคำสั่ง** — ติดตั้ง · ย้าย · ถอดออกจากไซต์ · ส่งซ่อม ·
//   รับคืนจากซ่อม · แจ้งสภาพ · ปลดระวาง · ทุกอันเขียนแถวประวัติ **แล้วค่อย**
//   ตอกค่าลงตัวเครื่อง ⇒ `siteId`/`status` บนเครื่องเป็นภาพสรุปของแถวล่าสุด
//   ไม่ใช่แหล่งข้อมูลคู่แข่งที่เดินหนีประวัติได้
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, notFound, conflict } from '@/lib/http';
import { canEditService } from '@/lib/permissions';
import { MOVE_LABELS, assetMoveError } from '@/lib/service/assetMoves';
import { commitAssetMove } from '@/lib/service/assetMoveCommit';
import { findAssetById, findSite, requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const access = requireService({ user, edit: true });
  if (access.response) return access.response;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || '');

  try {
    // ⚠️ โหลดแถวจริงเสมอ — ห้ามเชื่อสถานะที่จอส่งมา (จออาจค้างอยู่หลายนาทีแล้ว)
    const asset = await findAssetById(supabase, id);
    if (!asset) return notFound('ไม่พบเครื่องนี้');

    const fromSite = asset.siteId ? await findSite(supabase, asset.siteId) : null;
    const toSite = body.toSiteId ? await findSite(supabase, body.toSiteId) : null;

    /* ด่านเดียวกับที่ปุ่มบนจอใช้ — ถ้าสองฝั่งไม่ใช่ตัวเดียวกัน จอจะโชว์ปุ่มที่กดแล้ว
       เด้ง หรือซ่อนปุ่มที่จริง ๆ กดได้ · `canEdit` ตรวจซ้ำที่นี่แม้ requireService
       ผ่านแล้ว เพราะตัวตัดสินต้องได้บริบทครบเหมือนฝั่งจอเป๊ะ */
    const gate = assetMoveError(asset, kind, body, {
      canEdit: canEditService(user), fromSite, toSite,
    });
    if (gate) return badRequest(gate);

    /* ⭐ ลำดับการเขียน (ประวัติก่อน → ตอกค่าลงเครื่อง → ลบประวัติทิ้งถ้าไม่ได้เขียนจริง)
       อยู่ที่ตัวช่วยกลางตัวเดียว — นัดถอนเครื่องใช้ตัวเดียวกัน (`assetMoveCommit.js`) */
    const result = await commitAssetMove(supabase, {
      asset, kind, input: body, fromSite, toSite, user,
    });
    if (result.error) {
      return result.status === 409 ? conflict(result.error) : fail(result.error, 500);
    }
    const { asset: after, move, row } = result;

    const where = row.toSiteName ? ` → ${row.toSiteName}` : '';
    await recordAudit({
      user, action: 'update', entityType: 'service_asset', entityId: id,
      before: asset, after,
      summary: `${MOVE_LABELS[kind] || kind} ${asset.serial || asset.label}${where}`.trim(),
      request: req,
    });

    return ok({ asset: after, move });
  } catch (e) {
    return fail(e.message, 500);
  }
});
