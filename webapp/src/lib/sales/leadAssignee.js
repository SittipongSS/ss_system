// ผู้รับผิดชอบลีด — บังคับให้เป็น "ผู้ใช้จริง + role ที่ทำงานลีดได้จริง"
//
// ทำไมต้องมี (ตรวจ flow LD 2026-08-04): `POST /leads/[id]/transition` action=assign
// เขียน `assigneeId` / `assigneeName` จาก body ดิบ ๆ โดยไม่ตรวจอะไรเลย ⇒
//   1. ปลอมชื่อได้ — `assigneeName` เป็นสตริงอิสระที่ถูกเก็บเป็น snapshot แล้วโชว์
//      บนคิวลีด/KPI (`byAssignee` จัดกลุ่มด้วยค่านี้) โดยไม่มีอะไรผูกกับบัญชีจริง
//   2. มอบให้ id มั่ว/คนที่ลาออกแล้ว ได้ — ลีดหายเข้ากลีบเมฆ ไม่มีใครเห็นในคิวตัวเอง
//   3. มอบให้ role ที่ `canWorkLead()` **ไม่มีวันคืน true** (RA / staff / rd /
//      marketing / ae_supervisor) ⇒ ลีดค้างถาวร: ผู้รับกดติดต่อ/นัดไม่ได้ และคนอื่น
//      ก็ไม่ใช่เจ้าของงาน ต้องให้แอดมินมาตีกลับให้อย่างเดียว
//
// ⚠️ ด่านนี้กับดรอปดาวน์ฝั่งหน้าจอ (`assignableFor` ใน leadLifecycle.js) ต้องขยับ
// พร้อมกันเสมอ — แก้ข้างเดียวได้ผลอย่างใดอย่างหนึ่ง: ซ่อนชื่อแต่ยิง API ตรงยังผ่าน
// หรือเห็นชื่อในดรอปดาวน์แล้วเลือกไม่ได้
//
// กติกา role ที่นี่ถอดมาจาก `canWorkLead` แล้ว **แคบลงอีกชั้นด้วยมติผู้ใช้**:
//   admin → ทำได้ทุกใบ · senior_ae → ใบของทีมตัวเอง · ae → ใบที่ถูกมอบให้
//
// ⭐ มติผู้ใช้ 2026-08-08: **AC ไม่อยู่ในลิสต์นี้** ทั้งที่ `canWorkLead` ยังให้ AC
// ทำงานลีดของทีมตัวเองได้ — AC เป็นหลังบ้านของทีม SA จึงช่วยเดินงาน (กระจาย ติดต่อ
// นัด ปิด) ได้ แต่ **ไม่ใช่เจ้าของลีด** เพราะ KPI ของลีดวัดกันที่ผู้รับผิดชอบรายคน
// (SLA ติดต่อกลับ · conversion) ซึ่งเป็นเส้นวัดของ AE ไม่ใช่ของหลังบ้าน
// ⇒ ลิสต์นี้จึง **แคบกว่า canWorkLead ได้** (แคบกว่าปลอดภัย: คนที่รับลีดได้ทุกคนยัง
// ทำงานต่อได้จริง) แต่ **ห้ามกว้างกว่า** — กว้างกว่าเมื่อไรคือมอบให้คนที่กดอะไรไม่ได้
// แล้วลีดค้างถาวร ซึ่งเป็นเหตุผลที่ไฟล์นี้เกิดมา
//
// แพตเทิร์นเดียวกับ `validateQuotationPeople` (ผู้รับผิดชอบเอกสารใบเสนอราคา) —
// ต่างกันที่ลีดผูกด้วย **id** ซึ่งแข็งแรงกว่าชื่อ จึงตรวจด้วย id แล้ว *คืนชื่อจาก
// server* ให้ผู้เรียกเขียนลงแถว (ไม่รับชื่อจาก client อีกต่อไป)

import { normalizeRole, userTeams } from '@/lib/permissions';

export const LEAD_ASSIGNEE_ROLES = ['admin', 'senior_ae', 'ae'];

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
 * @param lead  ลีดปลายทาง — ใช้เทียบทีม (ไม่ส่งมา = ข้ามด่านทีม)
 * @returns {Promise<{ ok: true, assigneeId: string, assigneeName: string } | { ok: false, error: string }>}
 */
export async function validateLeadAssignee(supabase, assigneeId, lead = null) {
  const id = String(assigneeId || '').trim();
  if (!id) return { ok: false, error: 'ต้องเลือก AE ผู้รับผิดชอบ' };

  const user = await findAuthUser(supabase, id);
  if (!user) return { ok: false, error: 'ไม่พบผู้ใช้ที่เลือกเป็นผู้รับผิดชอบ' };

  const disabled = !!user.banned_until && new Date(user.banned_until) > new Date();
  if (disabled) return { ok: false, error: 'ผู้ใช้รายนี้ถูกระงับบัญชีแล้ว — เลือกผู้รับผิดชอบคนอื่น' };

  const role = normalizeRole(user.app_metadata?.role, user.app_metadata?.department) || null;
  if (!LEAD_ASSIGNEE_ROLES.includes(role)) {
    return { ok: false, error: 'ผู้รับผิดชอบลีดต้องเป็น AE หรือ Senior AE เท่านั้น (AC เป็นหลังบ้านของทีม ไม่รับเป็นเจ้าของลีด)' };
  }

  // ── ทีม ────────────────────────────────────────────────────────────────
  // ลีดถูกคัดกรองเข้าทีมแล้วก่อนถึงขั้นมอบหมาย คนที่รับต่อจึงต้องอยู่ทีมนั้น —
  // ไม่ใช่แค่ความเป็นระเบียบ: `canWorkLead` ให้ senior_ae/ac ทำงานได้เฉพาะลีดของ
  // ทีมตัวเอง ⇒ มอบข้ามทีมให้สองตำแหน่งนี้ = คนรับกดติดต่อ/นัดไม่ได้เลย ลีดค้าง
  // ผู้ที่ไม่มีทีม (admin) ผ่านได้ — canWorkLead ให้ admin ทำได้ทุกใบ
  // ต้องย้ายทีมจริง ๆ ให้ใช้ "ตีกลับ" แล้วคัดกรองใหม่ (เส้นทางที่มีร่องรอย)
  // ⚠️ คนรับอยู่ได้หลายทีม ⇒ ถามว่า "อยู่ทีมของลีดหรือเปล่า" ไม่ใช่ "ทีมหลักตรงกับลีดไหม"
  // เทียบทีมหลักตรง ๆ จะกันคนที่อยู่ทีมนั้นจริงและ canWorkLead ให้ทำงานได้แล้ว
  const assigneeTeams = userTeams(user.app_metadata);
  if (lead?.team && assigneeTeams.length && !assigneeTeams.includes(lead.team)) {
    return { ok: false, error: `ผู้รับผิดชอบอยู่ทีม ${assigneeTeams.join('/')} แต่ลีดนี้อยู่ทีม ${lead.team} — ถ้าต้องเปลี่ยนทีมให้ใช้ "ตีกลับ" แล้วคัดกรองใหม่` };
  }

  const name = leadAssigneeName(user);
  if (!name) return { ok: false, error: 'ผู้ใช้รายนี้ยังไม่มีชื่อในระบบ — ตั้งชื่อที่หน้าจัดการผู้ใช้ก่อน' };

  return { ok: true, assigneeId: id, assigneeName: name };
}
