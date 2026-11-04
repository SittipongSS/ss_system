// ── GET /api/rd/bom-board/export?tab=… — คิว "ลง BOM" เป็นไฟล์ Excel (มติเจ้าของ 04/11/2026) ──────────────────
//
// ⭐ แถว = **เท่าที่ตาเห็นบนจอ** — แท็บ + ค้นหา + ตัวกรอง + เรียง + จัดกลุ่ม ผ่าน `bomViewOf` ตัวเดียวกับหน้า ·
//   ติ๊กไว้ (`id` ซ้ำได้) = เฉพาะที่ติ๊ก **ชนะทุกอย่าง** · ไม่ติ๊ก = ทุกแถวที่แสดงอยู่ (มติเจ้าของ 04/11 · `bomOutputRows`)
//   อ่านด้วย `loadBomBoardRows` ตัวเดียวกับ `GET /api/rd/bom-board` (ไฟล์ = ของบนจอทุกช่อง)
// 🪤 **ต้องเป็น GET** — proxy เปิด `/api/rd` ไว้เฉพาะทางอ่าน (ดู proxy.js `OPEN_READ_APIS`)
// ⚠️ ด่านเดียวกับตาราง (`canAccessRd`) — ใครเห็นคิวได้ก็ได้ไฟล์ของคิวนั้น
import { canAccessRd } from '@/lib/permissions';
import { withUser, fail, unauthorized, forbidden } from '@/lib/http';
import { businessDate } from '@/lib/businessDate';
import { loadBomBoardRows } from '@/lib/rd/bomBoardStore';
import { bomOutputRows, bomViewOf, bomViewStateFromQuery } from '@/lib/rd/bomBoardView';
import { buildBomExportBuffer, bomExportFilename, isBomExportTab } from '@/lib/rd/bomBoardWorkbook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canAccessRd(user)) return forbidden('เส้นนี้เป็นของฝ่าย RD');
  const view = bomViewStateFromQuery(new URL(req.url).searchParams);
  const { tab } = view;
  // จอมีแท็บเสมอ — ไม่รู้จักแท็บ = ลิงก์ผิด (ไม่เดาว่าเป็นทุกแท็บ: ไฟล์จะไม่ตรงกับจอ)
  if (!isBomExportTab(tab)) return fail('ไม่รู้จักแท็บของคิวลง BOM', 400);

  let rows;
  try {
    rows = bomOutputRows(bomViewOf(await loadBomBoardRows(supabase), view).rows, view.ids);
  } catch (e) {
    return fail(e?.message || 'อ่านคิวลง BOM ไม่สำเร็จ', 500);
  }

  try {
    const now = new Date();
    // วันไทย ไม่ใช่วัน UTC — ช่อง "รอ (วัน)" ต้องตรงกับตาราง (ก่อนเจ็ดโมงเช้าวัน UTC ยังเป็นเมื่อวาน)
    const buffer = await buildBomExportBuffer(rows, { tab, todayIso: businessDate(now), now });
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${bomExportFilename(tab, now)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[bom-board-export]', err);
    return fail('ส่งออกคิวลง BOM ไม่สำเร็จ', 500);
  }
});
