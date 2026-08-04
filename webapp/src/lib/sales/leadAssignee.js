// ผู้รับผิดชอบลีด — บังคับให้เป็น "ผู้ใช้จริง + role ที่ทำงานลีดได้จริง"
//
// ทำไมต้องมี (ตรวจ flow LD 2026-08-04): `POST /leads/[id]/transition` action=assign
// เขียน `assigneeId` / `assigneeName` จาก body ดิบ ๆ โดยไม่ตรวจอะไรเลย ⇒
//   1. ปลอมชื่อได้ — `assigneeName` เป็นสตริงอิสระที่ถูกเก็บเป็น snapshot แล้วโชว์
//      บนคิวลีด/KPI (`byAssignee` จัดกลุ่มด้วยค่านี้) โดยไม่มีอะไรผูกกับบัญชีจริง
//   2. มอบให้ id มั่ว/คนที่ลาออกแล้ว ได้ — ลีดหายเข้ากลีบเมฆ ไม่มีใครเห็นในคิวตัวเอง
//   3. มอบให้ role ที่ `canWorkLead()` **ไม่มีวันคืน true** (legal / staff / rd /
//      marketing / ae_supervisor) ⇒ ลีดค้างถาวร: ผู้รับกดติดต่อ/นัดไม่ได้ และคนอื่น
//      ก็ไม่ใช่เจ้าของงาน ต้องให้แอดมินมาตีกลับให้อย่างเดียว
//
// กติกา role ที่นี่ **ถอดมาจาก `canWorkLead` ตรง ๆ** ไม่ใช่ความชอบ:
//   admin → ทำได้ทุกใบ · senior_ae/ac → ใบของทีมตัวเอง · ae → ใบที่ถูกมอบให้
// role อื่นไม่มีสาขาไหนใน canWorkLead ที่พาไป true ได้เลย
//
// แพตเทิร์นเดียวกับ `validateQuotationPeople` (ผู้รับผิดชอบเอกสารใบเสนอราคา) —
// ต่างกันที่ลีดผูกด้วย **id** ซึ่งแข็งแรงกว่าชื่อ จึงตรวจด้วย id แล้ว *คืนชื่อจาก
// server* ให้ผู้เรียกเขียนลงแถว (ไม่รับชื่อจาก client อีกต่อไป)

export const LEAD_ASSIGNEE_ROLES = ['admin', 'senior_ae', 'ac', 'ae'];

// ชื่อที่แสดง — กติกาเดียวกับ /api/pm/assignable-users (name → email)
// ไม่งั้น dropdown กับค่าที่บันทึกจะเป็นคนละสตริงสำหรับคนเดียวกัน
export const leadAssigneeName = (u) =>
  (u?.user_metadata?.name || '').trim() || (u?.email || '').trim();

async function findAuthUser(supabase, id) {
  // getUserById ตรงกว่าการวน listUsers ทั้งระบบ — ด่านนี้อยู่บนเส้นทางที่ผู้ใช้กดรอ
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error) {
    // "ไม่พบ" ไม่ใช่ความผิดพลาดของระบบ — ปล่อยให้ผู้เรียกตอบ 400 ตามปกติ
    if (/not.?found/i.test(error.message || '') || error.status === 404) return null;
    throw new Error(`อ่านข้อมูลผู้ใช้ไม่สำเร็จ: ${error.message}`);
  }
  return data?.user || null;
}

/**
 * ตรวจว่า `assigneeId` มอบลีดใบนี้ให้ได้จริงไหม
 * @returns {Promise<{ ok: true, assigneeId: string, assigneeName: string } | { ok: false, error: string }>}
 */
export async function validateLeadAssignee(supabase, assigneeId) {
  const id = String(assigneeId || '').trim();
  if (!id) return { ok: false, error: 'ต้องเลือก AE ผู้รับผิดชอบ' };

  const user = await findAuthUser(supabase, id);
  if (!user) return { ok: false, error: 'ไม่พบผู้ใช้ที่เลือกเป็นผู้รับผิดชอบ' };

  const disabled = !!user.banned_until && new Date(user.banned_until) > new Date();
  if (disabled) return { ok: false, error: 'ผู้ใช้รายนี้ถูกระงับบัญชีแล้ว — เลือกผู้รับผิดชอบคนอื่น' };

  const role = user.app_metadata?.role || null;
  if (!LEAD_ASSIGNEE_ROLES.includes(role)) {
    return { ok: false, error: 'ผู้รับผิดชอบลีดต้องเป็น AE / Senior AE / AC (ตำแหน่งอื่นทำงานคิวลีดไม่ได้)' };
  }

  const name = leadAssigneeName(user);
  if (!name) return { ok: false, error: 'ผู้ใช้รายนี้ยังไม่มีชื่อในระบบ — ตั้งชื่อที่หน้าจัดการผู้ใช้ก่อน' };

  return { ok: true, assigneeId: id, assigneeName: name };
}
