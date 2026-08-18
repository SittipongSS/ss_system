// ── ทะเบียนเปลี่ยนชื่อ/รหัส → ลงประวัติของคำร้องทุกใบที่อ้างถึง (2026-08-18) ──
//
// ⭐ **จอโชว์ค่าสดอยู่แล้ว สิ่งที่ประวัติมีค่าคือ "ค่าเดิม"** — คนที่เปิดใบเก่าแล้วเห็นชื่อ
// ไม่ตรงกับที่จำได้ ต้องอ่านออกจากใบว่ามันถูกเปลี่ยนเมื่อไร โดยใคร จากอะไร
//
// ⚠️ **เรียกจากฝั่งทะเบียนที่เดียว** (`/api/master/scents|formulas/[id]`) — โมดัลแก้ใน
// หน้าคำร้องยิง API ตัวเดียวกัน ⇒ แก้ทางไหนก็ลงประวัติเหมือนกัน ไม่ต้องมีโค้ดสองชุด
//
// ⚠️ **ล้มแล้วไม่ throw** — การแก้ทะเบียนบันทึกสำเร็จไปแล้ว · ปล่อยให้ทั้ง request ล้ม
// จะได้ผู้ใช้กดซ้ำแล้วเจอ "รหัสนี้ถูกใช้ไปแล้ว" ทั้งที่ของจริงบันทึกไปตั้งแต่รอบแรก
// (กติกาเดียวกับที่ route ของก้าวรายแถวใช้ตอนเขียนค่ากลับทะเบียน)
import { appendUpdate } from '@/lib/master/updates';
import { registryRenameBody } from './registryLinks';

export async function logRegistryChangeToRequests(supabase, {
  kind, id, before, after, user,
}) {
  try {
    const body = registryRenameBody(kind, before, after);
    if (!body || !id) return;

    // ⚠️ กลิ่นถูกอ้างสองทาง: กลิ่นที่ **เกิดจาก** แถว (สายพัฒนากลิ่น) กับกลิ่นที่แถว
    // **ขอถึง** (สายพัฒนาสูตร) — นับทางเดียวแล้วอีกสายจะเงียบ
    const query = kind === 'formula'
      ? supabase.from('dept_request_items').select('requestId').eq('producedFormulaId', id)
      : supabase.from('dept_request_items').select('requestId')
        .or(`producedScentId.eq.${id},scentId.eq.${id}`);
    const { data, error } = await query;
    if (error) throw error;

    const requestIds = [...new Set((data || []).map((r) => r.requestId).filter(Boolean))];
    for (const entityId of requestIds) {
      await appendUpdate(supabase, {
        entityType: 'dept_request',
        entityId,
        kind: 'registry',
        body,
        meta: { registryKind: kind, registryId: id },
        user,
      });
    }
  } catch (e) {
    console.error('[requests] เขียนประวัติการแก้ทะเบียนลงคำร้องไม่สำเร็จ:', e.message);
  }
}
