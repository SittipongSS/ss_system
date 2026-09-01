// ── ทะเบียนเครื่องรวมทุกไซต์ (เฟส B) ─────────────────────────────────────
//
// ⭐ **เส้นแรกของระบบที่ถามเครื่องโดยไม่ผ่านไซต์** — ทุก route ของเครื่องก่อนหน้านี้
//   อยู่ใต้ `/api/service/sites/[id]/assets/` ⇒ คำถามพื้นฐานอย่าง "เครื่อง OV08-0334
//   อยู่ไหน" ตอบไม่ได้เลย ต้องรู้ไซต์ก่อนถึงจะถามถึงเครื่องได้
//
// ⚠️ **อ่านอย่างเดียว** — การสร้าง/แก้/ย้ายเครื่องยังอยู่ใต้ไซต์เหมือนเดิม
//   (เครื่องเกิดที่ไซต์เสมอ · ย้ายเครื่องเป็นงานเฟส C)
import { withUser, ok, fail } from '@/lib/http';
import { loadAllAssets, requireService } from '@/lib/service/sitesRepo';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  /* ด่านระดับโมดูล ไม่ใช่รายไซต์ — `requireSite` ใช้ไม่ได้เพราะเส้นนี้ไม่มีไซต์เดียว
     ให้ตรวจ · ฝ่ายขายอ่านไม่ได้ (ไม่ส่ง forRequestForm) เพราะทะเบียนเครื่องเป็นของ TS */
  const access = requireService({ user });
  if (access.response) return access.response;

  try {
    const { assets, sites } = await loadAllAssets(supabase);
    const siteById = new Map(sites.map((s) => [s.id, s]));

    /* แนบ **ตัวตนของไซต์** ไปกับเครื่องแต่ละตัว ไม่ใช่ให้จอไปไล่หาเอง —
       จอทะเบียนต้องกรอง/เรียง/จัดกลุ่มด้วยชื่อไซต์และลูกค้า ซึ่งเป็นข้อมูลคนละตาราง
       ⚠️ `siteKind` คือตัวที่แยก "อยู่หน้างานลูกค้า" ออกจาก "อยู่ในคลัง" บนจอ —
          ห้ามให้จอเดาจาก customerId/arCode (บริษัทตัวเองมีไซต์ลูกค้าจริงด้วย) */
    const rows = assets.map((asset) => {
      const site = siteById.get(asset.siteId) || null;
      return {
        ...asset,
        siteCode: site?.code || null,
        siteName: site?.name || null,
        siteKind: site?.kind || null,
        customerId: site?.customerId || null,
        customerName: site?.customerName || null,
        routeZone: site?.routeZone || null,
        province: site?.province || null,
      };
    });

    return ok(rows);
  } catch (e) {
    return fail(e.message, 500);
  }
});
