// ── ข้อมูลหน้าอุปกรณ์รายตัว · เส้นใต้ไซต์ (เฟส 4) ────────────────────────
//
// ⭐ ค่าตั้งเครื่องจริงเคยอยู่ใน **รูปถ่ายหน้าจอที่เจ้าหน้าที่ส่งเข้า LINE ทุกเดือน** — mig 0298
//   เพิ่งมีที่เก็บ (`settings`) แต่ยังไม่มีจอไหนแสดง · และเครื่องหนึ่งตัวมีประวัติของ
//   ตัวเอง (ย้ายโซน · ส่งซ่อม · ถูกเปลี่ยน) ที่วันนี้เป็นแค่แถวกระจายอยู่หลายตาราง
//
// ⚠️ ตัวประกอบร่างอยู่ที่ `lib/service/assetDetail.js` — เส้นนี้กับเส้นทะเบียนรวม
//   (`/api/service/assets/[id]/detail`) ใช้ตัวเดียวกัน · ที่ต่างกันคือ **ด่านสิทธิ์**:
//   เส้นนี้ยืนยันว่าเครื่องอยู่ในไซต์ที่กำลังเปิดจริง เส้นนั้นหาเครื่องจาก id ล้วน
import { withUser, ok, fail, notFound } from '@/lib/http';
import { buildAssetDetail } from '@/lib/service/assetDetail';
import { findAsset, requireSite } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id, assetId } = await ctx.params;
  try {
    const access = await requireSite({ user, supabase, id });
    if (access.response) return access.response;

    const asset = await findAsset(supabase, id, assetId);
    if (!asset) return notFound('ไม่พบอุปกรณ์ในไซต์นี้');

    const { data, error } = await buildAssetDetail(supabase, { site: access.site, asset });
    if (error) return fail(error, 500);
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});
