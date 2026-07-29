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
import {
  canApproveCosting, canChangeTaskStatus, canViewCosting, isReadOnlyObserver, isSuperuser,
} from '@/lib/permissions';
import { canViewLeads, canWorkLead, inLeadScope } from '@/lib/sales/leads';
import { canManagePersonalTask, canViewPersonalTask } from '@/lib/pm/personalTaskAccess';
import { canAnswerRequest, canManageRequest } from '@/lib/deptRequests';
import { canViewCostingRequest } from '@/lib/costing';
import {
  canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope,
} from '@/lib/salesPlanning';
import { isAuthorableKind } from '@/lib/master/updateTypes';

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

  // ── เคสขอราคาวัสดุ (mig 0158) ────────────────────────────────────────
  // อ่าน = เห็นระบบขอราคา (ด่านเดียวกับ GET ของเคสเอง — ต้นทุนเป็นข้อมูลลับ
  // แต่ในระบบเห็นกันทั้งวง) **ห้ามตั้งด่านใหม่ที่แคบกว่าหน้าจอ** ไม่งั้นเปิดเคสได้
  // แต่เธรดว่างเปล่าโดยไม่มีอะไรบอกว่าเพราะอะไร
  dept_request: {
    table: 'dept_requests',
    attachments: true,   // "ขวดหน้าตาแบบนี้" — รูปคือหัวใจของการคุยเรื่องวัสดุ
    async canView(supabase, parent, user) {
      return canViewCosting(user);
    },
    // โพสต์ = สองฝ่ายที่เกี่ยวกับเคสจริง (ผู้เปิดเคส ↔ ฝ่ายที่ต้องตอบ) และเฉพาะตอน
    // เคสยังเดินอยู่ — ปิด/ยกเลิกแล้วถือเป็นหลักฐาน กฎเดียวกับไฟล์แนบ
    // (canAttachToCosting) เพื่อไม่ให้เคสเดียวมีสองมาตรฐาน
    async canPost(supabase, parent, user) {
      if (!canViewCosting(user)) return false;
      if (['closed', 'cancelled'].includes(parent?.status)) return false;
      return canManageRequest(user, parent) || canAnswerRequest(user, parent);
    },
  },

  // ── ดีล (ฟีดความเคลื่อนไหว ย้ายมาจาก sales_deal_activities, mig 0169) ──
  // ด่านยกมาจาก /api/sales-planning/activities ตรง ๆ ทั้งอ่านและเขียน — ห้ามคิดใหม่
  // ให้ต่างจากเดิม ไม่งั้นคนที่เคยโพสต์ได้จะโพสต์ไม่ได้โดยไม่มีใครสั่ง
  deal: {
    table: 'sales_deals',
    attachments: true,   // ของเดิมแนบรูปได้ (mig 0083) — ต้องไม่หายไปกับการย้าย
    async canView(supabase, parent, user) {
      return canViewSalesPlanning(user) && inSalesViewScope(user, parent);
    },
    async canPost(supabase, parent, user) {
      return canEditSalesPlanning(user) && inSalesEditScope(user, parent);
    },
  },

  // ── ลีด (mig 0091) ───────────────────────────────────────────────────
  // เดิมหน้าลีด **อ่านอย่างเดียว** — มีไทม์ไลน์เหตุการณ์ระบบแต่ไม่มีที่ให้คนพิมพ์
  // อะไรเลย ทั้งที่ช่วงลีดคือช่วงที่ข้อมูลอยู่ในหัวคนมากที่สุด (โทรแล้วไม่รับ /
  // สนใจแต่ยังไม่มีงบ) แล้วหายไปทั้งหมดตอนแตกเป็นดีล
  lead: {
    table: 'sales_leads',
    attachments: true,   // สกรีนช็อตแชท/นามบัตร = หลักฐานต้นทางของลีด
    async canView(supabase, parent, user) {
      // ด่านเดียวกับ GET /api/sales-planning/leads/[id] เป๊ะ ๆ — ห้ามตั้งใหม่ให้
      // แคบกว่าหน้าจอ ไม่งั้นเปิดลีดได้แต่เธรดว่างโดยไม่มีอะไรบอกว่าเพราะอะไร
      return canViewLeads(user) && inLeadScope(user, parent);
    },
    // ⚠️ **ห้ามใช้ `canEditLead`** — มันปิดตายเมื่อลีดเข้า LEAD_LOCKED_STATUSES
    // (contacted/meeting/qualified/disqualified) ซึ่งถูกสำหรับ "แก้ข้อมูลติดต่อ"
    // แต่ผิดสนิทสำหรับเธรด เพราะนั่นคือช่วงที่มีเรื่องต้องเล่ามากที่สุด
    // (กับดักเดียวกับ canEditCostingRequest ด้านล่าง)
    async canPost(supabase, parent, user) {
      if (!canViewLeads(user) || !inLeadScope(user, parent)) return false;
      if (isReadOnlyObserver(user?.role)) return false;
      if (canWorkLead(user, parent)) return true;        // ทีมที่ถือลีดอยู่
      if (isSuperuser(user?.role)) return true;          // supervisor คัดกรอง/ตีกลับ
      // คนกรอกลีดเข้ามา (ทีม Marketing) — เจ้าของข้อมูลต้นทาง ตอบคำถามได้เสมอ
      // แม้หลังส่งมอบให้ฝ่ายขายแล้วจะแก้ตัวลีดไม่ได้ก็ตาม
      return !!user?.id && parent?.createdBy === user.id;
    },
  },

  // ── ใบขอราคาผลิต (mig 0143) ──────────────────────────────────────────
  costing_request: {
    table: 'costing_requests',
    attachments: true,
    async canView(supabase, parent, user) {
      return canViewCostingRequest(user, parent);
    },
    // โพสต์ = ผู้บริหาร (คนตีกลับ/อนุมัติ ต้องตอบกลับได้เสมอ) + ฝ่ายขายเจ้าของใบ
    //
    // ⚠️ ตั้งใจ **ไม่** ใช้ `canEditCostingRequest` เพราะมันปิดตายเมื่อใบอนุมัติแล้ว
    // (approved/linked) — นั่นถูกสำหรับ "แก้เนื้อใบ" แต่ผิดสำหรับเธรด เพราะช่วงหลัง
    // อนุมัติคือช่วงที่มีคำถามเยอะที่สุด · จึงเช็คขอบเขตเจ้าของ (inSalesEditScope)
    // ตรง ๆ แล้วปิดเฉพาะใบที่ยกเลิกซึ่งไม่มีอะไรต้องคุยต่อ
    //
    // RD/PC มองเห็นใบนี้ได้ (canViewCostingRequest ปล่อยผ่านทั้งระบบ) แต่โพสต์ไม่ได้
    // โดยเจตนา — บทสนทนาเรื่องราคาวัสดุอยู่บนเคสขอราคา ไม่ใช่บนใบขออนุมัติราคาผลิต
    async canPost(supabase, parent, user) {
      if (!canViewCostingRequest(user, parent)) return false;
      if (parent?.status === 'cancelled') return false;
      if (canApproveCosting(user) || isSuperuser(user?.role)) return true;
      return inSalesEditScope(user, { team: parent?.team, ownerId: parent?.requestedById });
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
  // เทียบกับ "ชนิดที่คนเลือกเองได้ของ entity นี้" ไม่ใช่ 'comment' ตัวเดียว —
  // ไม่งั้นบันทึกการโทรในฟีดดีล (kind='call') จะกลายเป็นข้อความที่เจ้าของแก้ไม่ได้
  if (!isAuthorableKind(entityType, row.kind)) return false;
  if (isSuperuser(user?.role)) return true;
  if (!row.authorId || row.authorId !== user?.id) return false;
  return canPostUpdate(supabase, entityType, parent, user);
}
