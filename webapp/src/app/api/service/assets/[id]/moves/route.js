// ── คำสั่งย้าย/เปลี่ยนสถานะของเครื่อง (เฟส C · mig 0335) ─────────────────
//
// ⭐ **ทางเขียนเดียวของทุกคำสั่ง** — ติดตั้ง · ย้าย · ถอดออกจากไซต์ · ส่งซ่อม ·
//   รับคืนจากซ่อม · แจ้งสภาพ · ปลดระวาง · ทุกอันเขียนแถวประวัติ **แล้วค่อย**
//   ตอกค่าลงตัวเครื่อง ⇒ `siteId`/`status` บนเครื่องเป็นภาพสรุปของแถวล่าสุด
//   ไม่ใช่แหล่งข้อมูลคู่แข่งที่เดินหนีประวัติได้
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, notFound, conflict } from '@/lib/http';
import { canEditService } from '@/lib/permissions';
import {
  MOVE_LABELS, assetMoveError, assetMovePatch, assetMoveRow,
} from '@/lib/service/assetMoves';
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

    const patch = assetMovePatch(asset, kind, body);
    const row = assetMoveRow(asset, kind, body, { fromSite, toSite });

    /* ⚠️ **ไม่มีทรานแซกชันในชั้นนี้** (ทุก route ของโมดูลยิงทีละคำสั่ง) — เขียน
       ประวัติก่อน แล้วค่อยตอกค่าลงเครื่อง · ถ้าคำสั่งที่สองล้ม จะเหลือแถวประวัติ
       ที่ไม่ตรงกับตัวเครื่อง ซึ่ง **อ่านออกว่าผิด** (ไทม์ไลน์บอกว่าย้ายแล้วแต่หัวใบ
       ยังอยู่ที่เดิม) — ดีกว่าลำดับกลับกันที่จะได้เครื่องย้ายแล้วไม่มีประวัติ
       ซึ่งเงียบสนิทและตามกลับไม่ได้ */
    const { data: move, error: moveError } = await supabase
      .from('service_asset_moves')
      .insert({
        id: genId('SVM'),
        ...row,
        createdById: user.id || null,
        createdByName: user.name || user.email || null,
      })
      .select('*').maybeSingle();
    if (moveError) return fail(moveError.message, 500);

    /* optimistic guard — กันสองคนสั่งพร้อมกัน (คนหนึ่งย้าย อีกคนส่งซ่อม)
       คำสั่งที่มาทีหลังต้องเด้ง ไม่ใช่เขียนทับเงียบ ๆ */
    const { data: after, error: updateError } = await supabase
      .from('service_assets')
      .update({ ...patch, updatedAt: new Date().toISOString() })
      .eq('id', id).eq('status', asset.status)
      .select('*').maybeSingle();
    if (updateError) return fail(updateError.message, 500);
    if (!after) {
      // ลบแถวประวัติที่เพิ่งเขียนทิ้ง — คำสั่งไม่ได้เกิดขึ้นจริง
      await supabase.from('service_asset_moves').delete().eq('id', move.id);
      return conflict('สถานะเครื่องเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่');
    }

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
