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
  canAccessSahamit, canApproveCosting, canChangeTaskStatus, canEditRecord, canUser,
  canEditService, canViewService, inPmProjectScope, inScope, viewScope,
  canViewCosting, canViewRecord, isReadOnlyObserver, isSuperuser, userTeams,
} from '@/lib/permissions';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { canViewLeads, canWorkLead, inLeadScope } from '@/lib/sales/leads';
import { canManagePersonalTask, canViewPersonalTask } from '@/lib/pm/personalTaskAccess';
import { canAnswerRequest, canManageRequest, canReadRequestRow } from '@/lib/deptRequests';
import { canPostIssueUpdate, canReadIssueRow } from '@/lib/issues/access';
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
    recipients: (parent) => [parent?.ownerId, parent?.assigneeId],
  },

  // ── เคสขอราคาวัสดุ (mig 0158) ────────────────────────────────────────
  // อ่าน = **ด่านเดียวกับ GET ของคำร้องเอง เป๊ะ ๆ** — cap ของระบบ + ผูกกับแถว
  // (ผู้ขอ · ฝ่ายที่ต้องตอบ · admin · ผู้สังเกตการณ์ทั้งระบบ)
  //
  // 🐞 เดิมเป็น `canViewCosting(user)` ล้วน ไม่ดูแถวเลย ⇒ ใครถือ costing:view ก็อ่าน
  // เธรดของคำร้องใบไหนก็ได้ รวมถึงใบที่มีการพิมพ์ราคาคุยกันในนั้น · ตอนนั้น
  // GET /[id] ก็ไม่ดูแถวเหมือนกัน ทั้งคู่จึง "สอดคล้องกัน" ในทางที่ผิด
  //
  // ⚠️ กฎ "ห้ามตั้งด่านเธรดแคบกว่าหน้าจอ" ยังอยู่ และยังถูกเคารพ — หน้าจอแคบลง
  // พร้อมกันในคอมมิตก่อนหน้า (canReadRequestRow) ⇒ เปิดคำร้องได้เมื่อไร อ่านเธรด
  // ได้เมื่อนั้นเสมอ ไม่มีเคสที่เปิดใบได้แต่เธรดว่างเปล่า
  dept_request: {
    table: 'dept_requests',
    attachments: true,   // "ขวดหน้าตาแบบนี้" — รูปคือหัวใจของการคุยเรื่องวัสดุ
    async canView(supabase, parent, user) {
      return canViewCosting(user) && canReadRequestRow(user, parent);
    },
    // โพสต์ = สองฝ่ายที่เกี่ยวกับเคสจริง (ผู้เปิดเคส ↔ ฝ่ายที่ต้องตอบ) และเฉพาะตอน
    // เคสยังเดินอยู่ — ปิด/ยกเลิกแล้วถือเป็นหลักฐาน กฎเดียวกับไฟล์แนบ
    // (canAttachToCosting) เพื่อไม่ให้เคสเดียวมีสองมาตรฐาน
    async canPost(supabase, parent, user) {
      if (!canViewCosting(user)) return false;
      if (['closed', 'cancelled'].includes(parent?.status)) return false;
      return canManageRequest(user, parent) || canAnswerRequest(user, parent);
    },
    // ⚠️ ฝ่ายที่ต้องตอบเป็น **ฝ่าย ไม่ใช่คน** → ไม่ใส่เป็นผู้รับ (มติ 14 ห้าม
    // "ทุกคนในฝ่าย") · งาน "เคสใหม่เข้าคิวฝ่าย" เป็นของ Chat webhook อยู่แล้ว
    // และเมื่อ RD/PC ตอบครั้งแรก เขาจะเข้าเงื่อนไข "คนเคยโพสต์" เอง
    recipients: (parent) => [parent?.requestedById],
  },

  // ── โครงการ (เธรดระดับโครงการ) ───────────────────────────────────────
  // อ่าน = **ด่านเดียวกับ GET /api/pm/projects/[id] เป๊ะ** (`pm:view` + ทีมของโครงการ
  // เมื่อ scope เป็น 'team') — ห้ามตั้งใหม่ให้แคบกว่าหน้าจอ ไม่งั้นเปิดโครงการได้
  // แต่เธรดว่างโดยไม่มีอะไรบอกว่าเพราะอะไร
  //
  // ⚠️ ด่านนี้**กว้างกว่าด่านของดีล**โดยตั้งใจ: `staff` (PC/PD/WH/QC) อ่านเธรด
  // โครงการได้เพราะเขาทำงานอยู่ในโครงการจริง แต่จะไม่เห็นความเคลื่อนไหวของดีลที่
  // ไหลเข้ามาแสดงรวม (กรองด้วยทะเบียนของ 'deal' รายใบที่ฝั่ง API — PR #861)
  project: {
    table: 'projects',
    attachments: true,   // รูปหน้างาน/ไฟล์ที่คุยกันระหว่างทำโครงการ
    async canView(supabase, parent, user) {
      if (!canUser(user, 'pm:view')) return false;
      return viewScope(user?.role) !== 'team' || inScope('team', user, parent);
    },
    // โพสต์ = คนที่แก้แผนโครงการได้จริง · `inPmProjectScope` ต้องการ `pm:edit`
    // อยู่แล้วจึงไม่ต้องกัน observer ซ้ำ (pmEditScope ของ viewer/executive = 'none')
    //
    // ⚠️ **ไม่ผูกกับสถานะโครงการ** — โครงการที่ปิดแล้วยังต้องคุยต่อได้ (ลูกค้าโทรมา
    // ทีหลัง / ของมีปัญหาหลังส่ง) กฎเดียวกับที่ห้ามใช้ `canEditX` คุมเธรดในโมดูลอื่น
    async canPost(supabase, parent, user) {
      return inPmProjectScope(user, parent);
    },
    // เจ้าของโครงการ + AE/AC ที่ระบุไว้บนหัวโครงการ (มติผู้ใช้ 2026-08-01)
    //
    // ⭐ อ่านจาก `aeOwnerId`/`acOwnerId` (mig 0190) **ไม่ใช่ชื่อ** — ตอนแรกทำเป็น
    // จับคู่ชื่อกับสมุดรายชื่อ แล้วตรวจ prod พบว่าใช้ไม่ได้จริง: 8 จาก 11 โครงการ
    // เก็บชื่อย่อ ("Threerapong P.") ซึ่งไม่ตรงกับชื่อบัญชี ("Threerapong Phankam")
    // ⇒ 73% ไม่มีทางได้รับแจ้งเตือน และเงียบโดยไม่มีอะไรฟ้อง
    //
    // ผลพลอยได้: ไม่ต้องเปิดสมุดรายชื่อ (วนทุกหน้าของ auth) ทุกครั้งที่มีคนพิมพ์
    // ข้อความอีกต่อไป — ด่านนี้กลายเป็นการอ่านฟิลด์ล้วน ๆ
    // ⭐ สามฝ่ายของโครงการ + เจ้าของแถว (mig 0256 เพิ่มผู้ตรวจสอบเข้ามา — เดิมหัวหน้าที่
    // ถูกระบุบนหัวโครงการไม่เคยได้รับแจ้งเตือนเลย เพราะช่องนั้นเก็บแค่ "ชื่อ")
    recipients: (parent) => [
      parent?.ownerId, parent?.aeOwnerId, parent?.acOwnerId, parent?.aeSupervisorId,
    ],
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
    recipients: (parent) => [parent?.ownerId],
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
    // ⚠️ **ห้ามใช้ `canEditLead`** — มันปิดตายเมื่อลีดเข้า LEAD_EDIT_LOCKED_STATUSES
    // (qualified/disqualified) ซึ่งถูกสำหรับ "แก้ข้อมูลติดต่อ" แต่ผิดสนิทสำหรับเธรด:
    // ลีดที่แตกดีลไปแล้วยังมีเรื่องต้องเล่าต่อ และคนที่เล่าคือทีมเดิม
    // (กับดักเดียวกับ canEditCostingRequest ด้านล่าง)
    // หมายเหตุ: ชุดที่ล็อกแคบลงตามมติ 2026-08-08 แล้ว แต่เหตุผลที่ห้ามยืมมาคุมเธรด
    // ไม่เปลี่ยน — สิทธิ์ "แก้ตัวระเบียน" กับ "พูดในเธรด" เป็นคนละคำถามกัน
    async canPost(supabase, parent, user) {
      if (!canViewLeads(user) || !inLeadScope(user, parent)) return false;
      if (isReadOnlyObserver(user?.role)) return false;
      if (canWorkLead(user, parent)) return true;        // ทีมที่ถือลีดอยู่
      if (isSuperuser(user?.role)) return true;          // supervisor คัดกรอง/ตีกลับ
      // คนกรอกลีดเข้ามา (ทีม Marketing) — เจ้าของข้อมูลต้นทาง ตอบคำถามได้เสมอ
      // แม้หลังส่งมอบให้ฝ่ายขายแล้วจะแก้ตัวลีดไม่ได้ก็ตาม
      return !!user?.id && parent?.createdBy === user.id;
    },
    recipients: (parent) => [parent?.assigneeId, parent?.createdBy],
  },

  // ── ใบเสนอราคา / ใบสั่งขาย: **ไม่มีเธรด** (มติผู้ใช้ 2026-08-04) ────────
  // เคยมีทะเบียนของตัวเองที่ยืม scope จากดีลแม่ แต่ในเมื่อคนอ่านเป็นกลุ่มเดียวกับ
  // ดีลเป๊ะ (ด่านเดียวกันบรรทัดต่อบรรทัด) และไม่มีใครพิมพ์ที่นั่นเลยสักข้อความ
  // เหตุการณ์ของใบจึงลงเธรดดีลที่เดียว — ดู lib/sales/documentUpdates.js
  //
  // ⚠️ **ห้ามเติมกลับมาโดยไม่ย้ายเนื้อความ**: เหตุผลของ QT/SO (ดึงกลับ/ตีกลับ/
  // ออก Rev./ยกเลิก) ตอนนี้อยู่บนเธรดดีลที่เดียว ถ้าเปิดเธรดของใบใหม่แล้วแยกกัน
  // เขียน จะได้เรื่องเดียวกันสองที่ที่ไม่ตรงกัน

  // ── master data: ลูกค้า / สินค้า ─────────────────────────────────────
  // ⭐ ด่านยกมาจาก `canViewRecord`/`canEditRecord` ตรง ๆ — ทะเบียนกลางของสิทธิ์
  // รายแถวทั้งระบบ · ห้ามคิดกฎใหม่ให้ต่างจากหน้าจอ ไม่งั้นเปิดหน้าได้แต่เธรดว่าง
  //
  // อ่านได้ทุกคน (แคตตาล็อกข้ามทีม มติ 2026-07-20) แต่โพสต์ = ทีมผู้ดูแลเท่านั้น
  customer: {
    table: 'customers',
    attachments: true,
    async canView(supabase, parent, user) {
      return canViewRecord(user, 'customers', parent);
    },
    async canPost(supabase, parent, user) {
      return canEditRecord(user, 'customers', parent);
    },
    // ไม่มี "เจ้าของ" รายคนบน master data — ผู้รับคือคนที่เคยคุยในเธรด/ถูก @ ถึง
    // ซึ่ง notificationRecipients เติมให้เองอยู่แล้ว (มติ 14 ห้ามใช้ทั้งทีมเป็นผู้รับ)
    recipients: () => [],
  },
  product: {
    table: 'products',
    attachments: true,
    async canView(supabase, parent, user) {
      return canViewRecord(user, 'products', parent);
    },
    // ⚠️ สินค้าใช้ทีมผู้ดูแลของ **ลูกค้าเจ้าของ** ไม่ใช่ `product.team` (ซึ่งบันทึก
    // แค่คนสร้าง) → ต้อง resolve เองแล้วส่งเข้าไป · `canEditRecord` fail-closed
    // เมื่อค่านี้เป็น undefined จึงลืมส่งไม่ได้แบบเงียบ ๆ
    async canPost(supabase, parent, user) {
      const teams = await productCaretakerTeams(parent, supabase);
      return canEditRecord(user, 'products', parent, teams);
    },
    recipients: () => [],
  },

  // ── สายภาษีสรรพสามิต ────────────────────────────────────────────────
  excise_registration: {
    table: 'excise_registrations',
    attachments: true,   // ฉลาก/Artwork คือหัวใจของการคุยเรื่องทะเบียน
    async canView(supabase, parent, user) {
      return canViewRecord(user, 'registrations', parent);
    },
    // ⚠️ **ห้ามใช้ `canEditRecord`** ตรงนี้ — สำหรับ registrations มันตกไปที่
    // `inScope(editScope(role), …)` ซึ่งเทียบ `record.ownerId` ที่ทะเบียน**ไม่มี**
    // (มีแต่ `createdBy`) ⇒ AE ทุกคนโพสต์ไม่ได้เลย เธรดจะเหลือแค่ RA กับ supervisor
    // → ใช้ด่านชุดเดียวกับที่ *หน้าจอ* ใช้ตัดสินปุ่ม: products:edit (SA ผู้จัดเตรียม)
    // + ra:approve (RA ผู้ตรวจ) — สองฝ่ายที่คุยกันจริงบนทะเบียนใบหนึ่ง
    async canPost(supabase, parent, user) {
      if (!canViewRecord(user, 'registrations', parent)) return false;
      if (isReadOnlyObserver(user?.role)) return false;
      return canUser(user, 'products:edit') || canUser(user, 'ra:approve');
    },
    recipients: (parent) => [parent?.createdBy, parent?.approvedBy],
  },
  excise_order: {
    table: 'orders',
    attachments: true,
    async canView(supabase, parent, user) {
      return canViewRecord(user, 'orders', parent);
    },
    // เหตุผลเดียวกับทะเบียน — ยึดด่านของหน้าจอ: sales:act (SA รับเงิน/แก้ใบ)
    // + ra:approve (RA ยื่น/ตีกลับ)
    async canPost(supabase, parent, user) {
      if (!canViewRecord(user, 'orders', parent)) return false;
      if (isReadOnlyObserver(user?.role)) return false;
      return canUser(user, 'sales:act') || canUser(user, 'ra:approve');
    },
    recipients: (parent) => [parent?.createdBy],
  },

  // ── PO สหมิตร ────────────────────────────────────────────────────────
  // ⚠️ ด่านของสหมิตรเป็น **ระดับโมดูล** ไม่ใช่รายแถว (ทั้งโมดูลเป็นของลูกค้า
  // รายเดียว) — `canAccessSahamit` คือด่านเดียวกับที่ getSahamitContext ใช้
  sahamit_po: {
    table: 'sahamit_pos',
    attachments: true,
    async canView(supabase, parent, user) {
      return canAccessSahamit(user?.role, userTeams(user));
    },
    async canPost(supabase, parent, user) {
      if (!canAccessSahamit(user?.role, userTeams(user))) return false;
      return !isReadOnlyObserver(user?.role);   // viewer/executive อ่านได้ ไม่เขียน
    },
    recipients: () => [],
  },

  // ── นัดเข้าบริการ (mig 0188 · S-5) ────────────────────────────────────
  // อ่าน = ใครที่เห็นระบบธุรกิจบริการ (ฝ่ายขายต้องตอบลูกค้าได้ว่าทำไมช่างเลื่อน)
  // โพสต์ = คนที่แก้ตารางได้จริง (ฝ่าย TS + ทีมขาย SV)
  //
  // ⚠️ **ห้ามเอาสถานะนัดมาปิดเธรด** — ช่วงที่นัดถูกเลื่อน/ยกเลิก/ติดปัญหา คือช่วงที่
  // มีเรื่องต้องเล่ามากที่สุด · นัดที่ปิดงานแล้วก็ยังต้องคุยต่อได้ (ลูกค้าโทรมาบ่น
  // ทีหลังว่ากลิ่นยังไม่ออก) กฎเดียวกับ canEditX ที่ห้ามคุมเธรดในโมดูลอื่น
  service_visit: {
    table: 'service_visits',
    attachments: true,   // รูปหน้างานเพิ่มเติมที่ถ่ายทีหลัง
    async canView(supabase, parent, user) {
      return canViewService(user);
    },
    async canPost(supabase, parent, user) {
      return canEditService(user);
    },
    // แจ้งช่างที่รับผิดชอบนัดนั้น — ไม่กระจายทั้งฝ่าย (คิวที่เต็มไปด้วยเรื่องคนอื่น
    // คือคิวที่ไม่มีใครอ่าน · บทเรียนเดียวกับมติ 14 ของคำร้องข้ามฝ่าย)
    recipients: (parent) => [parent?.assigneeId],
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
    // ผู้บริหารผู้อนุมัติเป็น **บทบาท ไม่ใช่คนที่ผูกกับใบ** → ไม่ใส่เป็นผู้รับ
    // (มติ 14) · webhook แจ้ง "ใบใหม่รออนุมัติ" อยู่แล้ว และเมื่อเขาตอบครั้งแรก
    // จะเข้าเงื่อนไข "คนเคยโพสต์" เอง
    recipients: (parent) => [parent?.requestedById],
  },

  // ── เรื่องแจ้งปัญหาระบบ (mig 0223) ───────────────────────────────────
  // อ่าน/โพสต์ = **ฟังก์ชันเดียวกับที่ API ของเรื่องใช้เป๊ะ** (`canReadIssueRow` /
  // `canPostIssueUpdate`) ไม่เขียนเงื่อนไขซ้ำที่นี่ — กฎ "ห้ามตั้งด่านเธรดแคบกว่า
  // หน้าจอ" จึงเป็นจริงโดยโครงสร้าง ไม่ใช่โดยความตั้งใจของคนแก้โค้ดรอบหน้า
  // (เทสต์ issueAccess.test.mjs เทียบสองทางนี้ตรง ๆ)
  system_issue: {
    table: 'system_issues',
    attachments: true,   // ภาพหน้าจอคือหลักฐานหลักของเรื่องแจ้งบั๊ก
    async canView(supabase, parent, user) {
      return canReadIssueRow(user, parent);
    },
    // ปิด/ปฏิเสธแล้วถือเป็นหลักฐาน — กติกาเดียวกับ dept_request
    async canPost(supabase, parent, user) {
      return canPostIssueUpdate(user, parent);
    },
    // ⚠️ **ไม่ใส่แอดมินทุกคน** (มติ 14) — งาน "เรื่องใหม่เข้าคิว" เป็นของ Chat
    // webhook ห้องผู้ดูแลระบบ · แอดมินที่กดรับเรื่องจะกลายเป็น assigneeId เอง
    recipients: (parent) => [parent?.reportedById, parent?.assigneeId],
  },
};

// ── ผู้รับแจ้งเตือนของเธรด (mig 0185) ────────────────────────────────────
//
// ⭐ **กฎผู้รับอยู่ที่เดียวคือที่นี่** (มติ 14) — เพิ่ม entity ใหม่ = ประกาศ
// `recipients` ไปพร้อม canView/canPost ในทะเบียนเดียวกัน ไม่ต้องไปแก้ที่อื่น
//
// ⚠️ **ห้ามคืน "ทุกคนในฝ่าย"** — ซ้ำกับ Chat webhook แล้วกล่องแจ้งเตือนจะตายใน
// 1 สัปดาห์เพราะ 90% ไม่เกี่ยวกับตัวเอง · ฝ่ายที่ต้องรับงานใหม่เป็นหน้าที่ของ
// webhook · คนของฝ่ายนั้นจะกลายเป็นผู้รับเองเมื่อเขาโพสต์ตอบครั้งแรก
//
// entity ที่ไม่ประกาศ `recipients` = ไม่มีใครถูกแจ้งจากตัว entity (ยังเหลือ
// "คนเคยโพสต์ในเธรด" ซึ่งผู้เรียกรวมเข้ามาให้)
export async function updateRecipients(supabase, entityType, parent) {
  const conf = UPDATE_ENTITIES[entityType];
  if (!conf?.recipients || !parent) return [];
  const ids = await conf.recipients(parent, supabase);
  return [...new Set((ids || []).filter(Boolean).map(String))];
}

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
  /* ⭐ **ผู้ดูแลระบบมาก่อนทุกด่าน** (มติผู้ใช้ 2026-08-28 "ขอสิทธิ์ทุกอย่างให้แอดมิน
     รวมลบด้วย") — ของเดิมเช็ค `isAuthorableKind` ก่อน ⇒ แถวที่ **ระบบเขียนเอง**
     (เปลี่ยนสถานะ · อนุมัติ · เหตุการณ์) ลบไม่ได้เลยแม้แต่แอดมิน ทั้งที่บรรทัดถัดไป
     เขียนไว้ว่า superuser ผ่านหมด
     ⚠️ ใช้ `role === 'admin'` ไม่ใช่ `isSuperuser` — isSuperuser ครอบ ae_supervisor
     ด้วย และหัวหน้าฝ่ายขายไม่ควรลบบันทึกเหตุการณ์ของระบบทิ้งได้ */
  if (user?.role === 'admin') return true;
  // เทียบกับ "ชนิดที่คนเลือกเองได้ของ entity นี้" ไม่ใช่ 'comment' ตัวเดียว —
  // ไม่งั้นบันทึกการโทรในฟีดดีล (kind='call') จะกลายเป็นข้อความที่เจ้าของแก้ไม่ได้
  if (!isAuthorableKind(entityType, row.kind)) return false;
  if (isSuperuser(user?.role)) return true;
  if (!row.authorId || row.authorId !== user?.id) return false;
  return canPostUpdate(supabase, entityType, parent, user);
}
