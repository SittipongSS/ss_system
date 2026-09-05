// ── ด่านลบเครื่อง — ตัวเดียวของทั้งสองเส้น (mig 0344) ─────────────────────
//
// ⭐ **มีสองทางเข้าหาเครื่องตัวเดียวกัน** — เส้นใต้ไซต์ (เดิม) และเส้นทะเบียนรวม
//   (`/api/service/assets/[id]` · เปิดตอน mig 0344 เพราะเครื่องที่ยังไม่ได้ติดตั้ง
//   **ไม่มีไซต์ให้ใส่ใน URL**) ⇒ ปล่อยให้ต่างคนต่างเขียนด่านเมื่อไรมันเพี้ยนหากันแน่
//   (โรคเดียวกับที่ AGENTS.md ห้ามไว้เรื่องฟอร์มสร้าง/แก้)
//
// 🔴 **ลบเครื่องที่มีประวัติ = ข้อมูลหายเงียบ ๆ สองชั้น**
//   · `service_visit_items.assetId` เป็น ON DELETE SET NULL ⇒ สายเชื่อม consumption
//     ขาดเงียบ ยอด ml ของโซนหายไปโดยไม่มี error
//   · `service_visit_assets.assetId` เป็น RESTRICT ⇒ Postgres โยน 23503 ดิบภาษาอังกฤษ
//   ⇒ ตรวจก่อนแล้ว **บอกทางออก** (ถอดออกจากไซต์ / ปลดระวาง) ไม่ใช่แค่ห้าม

/** นับประวัติที่ผูกกับเครื่องนี้ — `{ used, parts }`
 *  🐞 ต้องนับ `replacedByAssetId` ด้วย ไม่ใช่แค่ `assetId` — เครื่องสำรองที่เคยถูกเอาไป
 *     แทนเครื่องเสียไม่มีแถวที่ `assetId` ชี้หามันเลย ด่านจึงปล่อยผ่าน แล้วไปตายที่ FK
 *     (เจอตอนเก็บกวาดข้อมูลทดสอบ 2026-08-28 · mig 0303 ปิดรูฝั่ง DB แล้ว
 *      ที่นี่คือชั้นที่พูดกับคน)
 */
export async function assetHistoryCount(supabase, assetId) {
  const [{ count: resultCount }, { count: itemCount }, { count: swapCount }] = await Promise.all([
    supabase.from('service_visit_assets').select('id', { count: 'exact', head: true }).eq('assetId', assetId),
    supabase.from('service_visit_items').select('id', { count: 'exact', head: true }).eq('assetId', assetId),
    supabase.from('service_visit_assets').select('id', { count: 'exact', head: true }).eq('replacedByAssetId', assetId),
  ]);
  return {
    used: (resultCount || 0) + (itemCount || 0) + (swapCount || 0),
    parts: { results: resultCount || 0, items: itemCount || 0, swaps: swapCount || 0 },
  };
}

/**
 * 🔑 **ตัวตัดสินตัวเดียว** — คืนข้อความไทยเมื่อลบไม่ได้ หรือ `null` เมื่อผ่าน
 *
 * @param ctx.canEdit  ผู้ใช้จัดการเครื่องบริการได้ไหม
 * @param ctx.used     จำนวนประวัติที่ผูกอยู่ (จาก `assetHistoryCount`)
 *
 * ⚠️ fail-closed: ไม่ส่งบริบทมา = ปฏิเสธ
 * ⚠️ **แอดมินบังคับลบทั้งสายได้** ผ่าน `?force=1` ที่ route — ด่านนี้ไม่รู้เรื่องนั้น
 *   โดยตั้งใจ (ทางลัดของแอดมินเป็นเรื่องของ route ไม่ใช่ของกติกาธุรกิจ)
 */
export function assetDeleteError(asset, { canEdit = false, used = 0 } = {}) {
  if (!asset) return 'ไม่พบเครื่องนี้';
  if (!canEdit) return 'ไม่มีสิทธิ์จัดการเครื่องบริการ';
  if (used > 0) {
    return `เครื่องนี้มีประวัติการเข้าบริการอยู่ ${used} รายการ ลบไม่ได้ — `
      + 'ถ้าถอดออกจากหน้างานจริงให้ใช้คำสั่ง “ถอดออกจากไซต์” หรือ “ปลดระวาง” '
      + 'เพื่อไม่ให้ประวัติและยอดการใช้ของโซนหายไปด้วย';
  }
  return null;
}
