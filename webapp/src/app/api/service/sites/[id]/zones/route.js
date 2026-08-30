// ── API โซนของไซต์ (mig 0297) ─────────────────────────────────────────────
// GET  → โซนทั้งหมดของไซต์ · POST { name, note?, isActive? } → สร้างโซนใหม่
// รหัส ZN- ออกด้วย RPC atomic (0240/0297) — ห้ามจองเลขเองแล้วค่อย insert
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict } from '@/lib/http';
import { insertRowWithComposedCode } from '@/lib/entityCode';
import { ZONE_RUN_BUCKET, ZONE_RUN_WIDTH, zoneCodePrefix } from '@/lib/service/zoneCode';
import { genId } from '@/lib/id';
import { normalizeZoneInput } from '@/lib/service/zones';
import { loadZones, requireSite } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    // ฟอร์มใบประเมินพื้นที่อ่านพื้นที่เดิมของไซต์มาให้ติ๊ก — ฝ่ายขายจึงต้องอ่านได้
    const access = await requireSite({ user, supabase, id, forRequestForm: true });
    if (access.response) return access.response;
    return ok(await loadZones(supabase, id));
  } catch (e) {
    return fail(e.message, 500);
  }
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id, edit: true });
    if (access.response) return access.response;

    const body = await req.json().catch(() => ({}));
    const { value, error } = normalizeZoneInput(body);
    if (error) return badRequest(error);

    /* รหัส `ZN-CCCC-FF-DDDDD` (mig 0315) — CCCC มาจากรหัสไซต์แม่ · FF คือชั้นที่เพิ่งกรอก
       ⚠️ ประกอบก่อน insert: ไซต์ที่ยังเป็นรหัสรูปเดิมต้องถูกตีกลับพร้อมเหตุผล
          ไม่ใช่ได้โซนที่รหัสอ่านไม่ออก */
    const { prefix, error: codeError } = zoneCodePrefix({
      siteCode: access.site.code,
      floor: value.floor,
    });
    if (codeError) return badRequest(codeError);

    const { data, error: insertError } = await insertRowWithComposedCode(
      supabase,
      { scope: 'ZN', bucket: ZONE_RUN_BUCKET, prefix, width: ZONE_RUN_WIDTH },
      {
        id: genId('SZN'),
        siteId: id,
        ...value,
        createdById: user.id ? String(user.id) : null,
        createdByName: user.name || null,
      },
    );
    if (insertError) {
      // unique (siteId, lower(name)) — Lobby สองแถวในไซต์เดียว = ประวัติแยกร่างเงียบ ๆ
      if (insertError.code === '23505') {
        return conflict(`ไซต์นี้มีโซนชื่อ "${value.name}" อยู่แล้ว — เปิดใช้โซนเดิมแทนการสร้างซ้ำ`);
      }
      return fail(insertError.message, 500);
    }

    await recordAudit({
      user, action: 'create', entityType: 'service_zone', entityId: data.id, after: data,
      summary: `เพิ่มโซน ${data.name} ที่ไซต์ ${access.site.name}`, request: req,
    });
    return ok(data, 201);
  } catch (e) {
    return fail(e.message, 500);
  }
});
