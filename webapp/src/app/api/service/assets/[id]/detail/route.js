// ── ข้อมูลหน้าอุปกรณ์รายตัว · เส้นทะเบียนรวม (เฟส B) ─────────────────────
//
// ⭐ เปิดเครื่องจาก **id ล้วน** ไม่ต้องรู้ไซต์ก่อน — คนที่ค้นเจอเครื่องในทะเบียนรวม
//   ไม่มีทางรู้ siteId และเครื่องในคลังก็ไม่มีไซต์ลูกค้าให้ซ่อนอยู่ใต้
//
// ⚠️ ตัวประกอบร่างเดียวกับเส้นใต้ไซต์ (`lib/service/assetDetail.js`) — ที่ต่างกันคือ
//   วิธีหาเครื่อง: เส้นนั้นยืนยันว่าเครื่องอยู่ในไซต์ที่เปิดอยู่ เส้นนี้อ่าน siteId
//   จากตัวเครื่องเอง แล้วโหลดไซต์ตาม
import { withUser, ok, fail, notFound } from '@/lib/http';
import { buildAssetDetail } from '@/lib/service/assetDetail';
import { findAssetById, findSite, requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  try {
    // ด่านระดับโมดูล — ไม่มีไซต์เดียวให้ตรวจ (เครื่องอาจอยู่ในคลัง)
    const access = requireService({ user });
    if (access.response) return access.response;

    const asset = await findAssetById(supabase, id);
    if (!asset) return notFound('ไม่พบอุปกรณ์');

    /* 🐞 **เครื่องที่ยังไม่ได้ติดตั้งไม่มีไซต์** (mig 0344) — ของเดิม 404 ทุกตัว
       ⇒ เปิดหน้ารายละเอียดเครื่องที่เพิ่งขึ้นทะเบียนแล้วเจอ "ไม่พบไซต์ของอุปกรณ์นี้"
       ⚠️ ยังต้อง 404 อยู่เมื่อ **มี `siteId` แต่หาไซต์ไม่เจอ** — นั่นคือข้อมูลเสียจริง
          (FK เป็น RESTRICT ⇒ ไม่ควรเกิด แต่ถ้าเกิดต้องดังไม่ใช่เงียบ) */
    const site = asset.siteId ? await findSite(supabase, asset.siteId) : null;
    if (asset.siteId && !site) return notFound('ไม่พบไซต์ของอุปกรณ์นี้');

    const { data, error } = await buildAssetDetail(supabase, { site, asset });
    if (error) return fail(error, 500);
    return ok(data);
  } catch (e) {
    return fail(e.message, 500);
  }
});
