// ── รับเครื่องเข้าคลังเป็นชุด (เฟส C ต่อ) ────────────────────────────────
//
// ⭐ **จุดเกิดของเครื่อง** — สร้างหลายตัวรวดเดียวพร้อมเดินรหัสต่อกัน
//   อยู่ใต้ไซต์เหมือนเส้นสร้างทีละตัว เพราะเครื่องต้องมีที่อยู่เสมอ (siteId NOT NULL)
//
// ⚠️ **ไม่มีทรานแซกชันในชั้นนี้** (ทุก route ของโมดูลยิงทีละคำสั่ง) ⇒ ด่านกันรหัสซ้ำ
//   ต้องอยู่ **ก่อน** insert ไม่ใช่ปล่อยให้ unique index ตีกลับกลางทาง ซึ่งจะได้
//   สภาพ "บางตัวเข้าไปแล้ว บางตัวไม่เข้า" ที่คนตามเก็บยาก
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { canEditService } from '@/lib/permissions';
import { fetchAll } from '@/lib/supabaseFetchAll';
import { plannedSerials, receiveError, receiveRows } from '@/lib/service/assetReceive';
import { requireSite } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

// POST { model, colour?, kind?, count, startNumber, receivedAt, note? }
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const body = await req.json().catch(() => ({}));

    /* รหัสที่ถูกใช้ไปแล้วทั้งระบบ — unique index เป็น global ไม่ใช่ต่อไซต์
       ⚠️ ต้องห่อ fetchAll (service_assets เพดาน 0 ใน check:rowcap) */
    const existing = await fetchAll(() => supabase
      .from('service_assets').select('serial')
      .not('serial', 'is', null).order('serial', { ascending: true }));
    const takenSerials = (existing || []).map((r) => r.serial).filter(Boolean);

    const gate = receiveError(body, {
      canEdit: canEditService(user), site: access.site, takenSerials,
    });
    if (gate) return badRequest(gate);

    const rows = receiveRows(body, { site: access.site }).map((row) => ({
      id: genId('SVA'),
      ...row,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    }));

    const { data, error } = await supabase.from('service_assets').insert(rows).select('id, serial');
    if (error) {
      // ด่านข้างบนควรกันไว้หมดแล้ว — ถึงตรงนี้แปลว่ามีคนรับเข้าพร้อมกัน
      if (error.code === '23505') {
        return conflict('มีคนรับเครื่องเข้าคลังพร้อมกันและใช้รหัสชุดนี้ไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง');
      }
      return fail(error.message, 500);
    }

    /* แถวประวัติ `receive` — จุดเกิดของเครื่องต้องอยู่ในไทม์ไลน์ด้วย ไม่งั้น
       เครื่องที่ยังไม่เคยติดตั้งจะมีไทม์ไลน์ว่างเปล่าทั้งที่มีเรื่องเล่าแล้ว
       ⚠️ ล้มตรงนี้ไม่ย้อนการสร้างเครื่อง — เครื่องมีจริงสำคัญกว่าประวัติครบ
          และแถวที่ขาดเติมทีหลังได้ ต่างจากเครื่องที่ไม่ได้ถูกสร้าง */
    const moves = (data || []).map((row) => ({
      id: genId('SVM'),
      assetId: row.id,
      kind: 'receive',
      movedAt: body.receivedAt,
      toSiteId: access.site.id,
      toSiteName: access.site.name,
      statusAfter: 'in_stock',
      conditionAfter: 'ok',
      note: String(body.note ?? '').trim() || null,
      createdById: user.id ? String(user.id) : null,
      createdByName: user.name || null,
    }));
    if (moves.length) await supabase.from('service_asset_moves').insert(moves);

    await recordAudit({
      user, action: 'create', entityType: 'service_asset', entityId: access.site.id,
      after: { created: data?.length || 0, serials: plannedSerials(body) },
      summary: `รับเครื่อง ${body.model} เข้าคลัง ${access.site.name} ${data?.length || 0} ตัว`,
      request: req,
    });

    return ok({ created: data?.length || 0, rows: data || [] }, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
