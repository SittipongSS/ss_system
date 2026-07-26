// ── ทะเบียนสิทธิ์ของเธรดอัปเดต (mig 0163) ────────────────────────────────
//
// ⭐ **นี่คือที่เดียวที่บอกว่า entity หนึ่ง ๆ ใครอ่าน/โพสต์/แก้-ลบได้** — เพิ่ม entity
// ใหม่ = เพิ่มรายการเดียวในไฟล์นี้ แล้วทั้ง API, proxy ไฟล์แนบ และ component
// ใช้ตามได้เลย
//
// ⚠️ ทำไมต้องรวมไว้ที่เดียว: ไฟล์แนบของ entity (ตาราง attachments) กระจายด่านไว้
// 5 จุดคนละไฟล์ แล้วขาดไปสองจุดโดยไม่มีใครรู้เป็นปี (PR #733 — อัปโหลดพังทั้งปุ่ม
// และรูปพรีวิวไม่ขึ้น) เธรดอัปเดตจะไม่ซ้ำรอยนั้น
//
// ⚠️ ทุกฟังก์ชันเป็น **async และรับ supabase** เพราะด่านของงาน/เคสต้อง query ต่อ
// (canViewPersonalTask เป็น async อยู่แล้ว) — ถ้าทำเป็น sync จะต้องรื้อทั้งทะเบียน
// ตอนต่อ entity ตัวที่สอง
import { canChangeTaskStatus, isSuperuser } from '@/lib/permissions';
import { canManagePersonalTask, canViewPersonalTask } from '@/lib/pm/personalTaskAccess';

export const UPDATE_ENTITIES = {
  personal_task: {
    table: 'personal_tasks',
    attachments: true,   // เปิดใหม่ตอนย้ายมาของกลาง (ของเดิมแนบรูปในอัปเดตงานไม่ได้)
    async canView(supabase, parent, user) {
      return canViewPersonalTask(supabase, parent, user);
    },
    // โพสต์ได้เฉพาะคนที่เกี่ยวข้องกับงาน — คนที่บังเอิญมองเห็นงาน (ทีมเดียวกัน)
    // อ่านได้แต่โพสต์ไม่ได้ กันเธรดกลายเป็นที่คุยของคนไม่เกี่ยว (กฎเดิมของ 0113)
    async canPost(supabase, parent, user) {
      const manage = await canManagePersonalTask(supabase, parent, user);
      return manage || canChangeTaskStatus(user, parent, manage);
    },
  },
};

export const isUpdateEntity = (entityType) => !!UPDATE_ENTITIES[entityType];

export function updateEntityConfig(entityType) {
  return UPDATE_ENTITIES[entityType] || null;
}

// โหลด entity แม่ (null = ไม่มีจริง/ชนิดไม่รองรับ) — ใช้ก่อนเช็คสิทธิ์เสมอ
export async function loadUpdateParent(supabase, entityType, entityId) {
  const conf = UPDATE_ENTITIES[entityType];
  if (!conf || !entityId) return null;
  const { data, error } = await supabase
    .from(conf.table).select('*').eq('id', entityId).maybeSingle();
  // แยก "อ่านไม่สำเร็จ" ออกจาก "ไม่มีแถวนี้" — ไม่งั้น schema error กลายเป็น 404
  // แล้วไล่ผิดทางยาว (บทเรียน PR #735)
  if (error) throw new Error(`อ่านข้อมูลต้นทางไม่สำเร็จ: ${error.message}`);
  return data || null;
}

export async function canViewUpdates(supabase, entityType, parent, user) {
  const conf = UPDATE_ENTITIES[entityType];
  if (!conf || !parent) return false;
  return !!(await conf.canView(supabase, parent, user));
}

export async function canPostUpdate(supabase, entityType, parent, user) {
  const conf = UPDATE_ENTITIES[entityType];
  if (!conf || !parent) return false;
  if (!(await conf.canView(supabase, parent, user))) return false;
  return !!(await conf.canPost(supabase, parent, user));
}

// แก้/ลบข้อความ: เจ้าของข้อความเท่านั้น (+ admin break-glass) และต้องยังโพสต์ได้อยู่
// — งานที่ปิดไปแล้ว/เคสที่ปิดแล้ว ไม่ควรมีใครย้อนไปแก้คำพูดเก่า
// ข้อความที่ระบบเขียน (kind อื่นที่ไม่ใช่ comment) แก้ไม่ได้เลย มันคือบันทึกเหตุการณ์
export async function canMutateUpdate(supabase, entityType, parent, user, row) {
  if (!row || row.deletedAt) return false;
  if (row.kind !== 'comment') return false;
  if (isSuperuser(user?.role)) return true;
  if (!row.authorId || row.authorId !== user?.id) return false;
  return canPostUpdate(supabase, entityType, parent, user);
}
