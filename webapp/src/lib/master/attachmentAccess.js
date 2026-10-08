// ── ด่านสิทธิ์ของไฟล์แนบ — ที่เดียวของทั้งระบบ ──────────────────────────
//
// ไฟล์แนบเป็นตาราง polymorphic ตัวเดียว (mig 0028) แต่ "ใครดู/ใครแนบได้" ขึ้นกับ
// entity แม่ ซึ่งแต่ละโมดูลคุมด้วยคนละกฎ: mgmt = cap ของโมดูล · งานส่วนบุคคล =
// ผู้เกี่ยวข้องรายใบ · ขอราคา = ฝ่ายที่ถูกถาม · ดีล/โครงการ = ขอบเขตสายงานขาย ·
// ที่เหลือ = ทีมเจ้าของ customer/product
//
// ⚠️ **เดิมบันไดนี้ถูกก๊อปไว้สองที่** (GET กับ POST ของ /api/attachments) และกำลังจะ
// เป็นที่สามตอนเพิ่มการให้สิทธิ์เอกสาร Google — ยกออกมาก่อนเพิ่มผู้ใช้รายที่สาม
// ตามกฎของโปรเจกต์ · สองชุดที่ต้องแก้พร้อมกันด้วยมือคือของที่เพี้ยนหากันแน่นอน
// และความเพี้ยนของด่านสิทธิ์ = คนเห็นของที่ไม่ควรเห็น ซึ่งไม่มีใครสังเกตจนสาย
import {
  canUser, canEditCustomerBillingRule, canEditRecord, canViewRecord, caretakerTeamsOf, hasTeam, isSuperuser,
} from '@/lib/permissions';
import { BILLING_CALENDAR_DOC_TYPE, SPEC_ITEM_IMAGE_DOC_TYPE, isPersonalDoc } from '@/lib/master/attachmentTypes';
import { canAttachToCosting, canViewCostingAttachment, isCostingAttachment } from '@/lib/master/costingAttachmentAccess';
import { canAttachToPersonalTask, canViewPersonalTask } from '@/lib/pm/personalTaskAccess';
import { canAttachToSalesEntity, canViewSalesAttachment, isSalesAttachment } from '@/lib/sales/salesAttachmentAccess';
import {
  canAttachToSalesOrder, canViewSalesOrderAttachment, isSalesOrderAttachment,
} from '@/lib/sales/salesOrderAttachmentAccess';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { canEditProductSpec } from '@/lib/sales/productSpecWorkflow';

// resource key ที่ส่งให้ helper สิทธิ์กลาง (ตรงกับ lib/permissions)
const RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };

const MGMT_ENTITIES = ['mgmt_task', 'mgmt_meeting'];
export const isMgmtAttachment = (entityType) => MGMT_ENTITIES.includes(entityType);
export const isPersonalTaskAttachment = (entityType) => entityType === 'personal_task';

// ดูไฟล์แนบของระเบียนนี้ได้ไหม
export async function canViewAttachmentParent(supabase, entityType, parent, user) {
  if (isMgmtAttachment(entityType)) return canUser(user, 'mgmt:view');
  if (isPersonalTaskAttachment(entityType)) return canViewPersonalTask(supabase, parent, user);
  if (isCostingAttachment(entityType)) return canViewCostingAttachment(supabase, entityType, parent, user);
  // ดีล/โครงการคุมด้วยขอบเขตของสายงานขาย (ทีม/เจ้าของ) ไม่ใช่ทีมเจ้าของลูกค้า
  if (isSalesAttachment(entityType)) return canViewSalesAttachment(parent, user);
  // ใบสั่งขายไม่มี `team` ของตัวเอง ⇒ ตัดสินด้วยขอบเขตของ **ดีลของใบ** (ต้องอ่านดีลเพิ่มหนึ่งครั้ง)
  if (isSalesOrderAttachment(entityType)) return canViewSalesOrderAttachment(supabase, parent, user);
  return canViewRecord(user, RESOURCE[entityType], parent);
}

/**
 * เห็นไฟล์ **ใบนี้** ได้ไหม — ด่านชั้นที่สอง ต่อจาก `canViewAttachmentParent`
 *
 * ⭐ เอกสารส่วนบุคคลของลูกค้า (บัตรประชาชน · ทะเบียนบ้าน · Bookbank · หนังสือมอบอำนาจ)
 * แคบกว่าตัวระเบียน: **ทีมผู้ดูแลลูกค้ารายนั้น + admin เท่านั้น** (มติผู้ใช้ 2026-08-16)
 * ที่เหลือ — เอกสารธุรกิจของลูกค้า และไฟล์ของ entity อื่นทุกชนิด — ใช้ด่านของ entity แม่
 * ตามเดิมไม่เปลี่ยน
 *
 * ⚠️ ใช้ **ทีมผู้ดูแล** (`caretakerTeamsOf`) ตัวเดียวกับด่านแก้ไข ไม่ใช่ `customers:edit`
 * — คนในทีมที่อ่านอย่างเดียวก็ยังต้องเปิดเอกสารของลูกค้าตัวเองได้ การขอสิทธิ์แก้ไข
 * เพิ่มเพียงเพื่อจะเปิดไฟล์คือการดันสิทธิ์ให้กว้างกว่าที่ต้องการ
 *
 * ⚠️ ลูกค้าที่ไม่มีทีม (`teams: []` = ของกลาง) ยังเปิดได้ทุกคน — กติกาเดียวกับด่านแก้
 * ซึ่งถือว่าแถวไร้ทีมคือข้อมูลกลางที่ยังไม่มีใครรับเป็นเจ้าภาพ ถ้าปิดตรงนี้ทางเดียว
 * ลูกค้าที่ตกสำรวจจะไม่มีใครดูเอกสารได้เลยแม้แต่คนที่กำลังจะรับไปดูแล
 */
export function canViewAttachmentRow(attachment, parent, user) {
  if (!isPersonalDoc(attachment?.entityType, attachment?.docType)) return true;
  if (isSuperuser(user?.role)) return true;
  const teams = caretakerTeamsOf(parent);
  if (!teams.length) return true;
  return hasTeam(user, teams);
}

// แนบ/ลบไฟล์ของระเบียนนี้ได้ไหม — **ไม่ใช่แค่เห็น**
// ⚠️ คนที่เห็นดีลของทีมอื่นได้ (หัวหน้าสาย/ผู้บริหาร) ต้องอ่านได้แต่ไม่ควรไปเพิ่ม
// หรือลบเอกสารในใบที่ไม่ใช่ของตัวเอง
export async function canEditAttachmentParent(supabase, entityType, parent, user) {
  if (isMgmtAttachment(entityType)) return canUser(user, 'mgmt:edit');
  if (isPersonalTaskAttachment(entityType)) return canAttachToPersonalTask(supabase, parent, user);
  if (isCostingAttachment(entityType)) return canAttachToCosting(supabase, entityType, parent, user);
  if (isSalesAttachment(entityType)) return canAttachToSalesEntity(parent, user);
  if (isSalesOrderAttachment(entityType)) return canAttachToSalesOrder(supabase, parent, user);
  // product: ขอบเขตแก้ตามทีมผู้ดูแลของ **ลูกค้าเจ้าของสินค้า** (มติ 2026-07-20/21)
  // — resolve ให้ตรงกับหน้ารายละเอียดสินค้า
  return canEditRecord(
    user,
    RESOURCE[entityType],
    parent,
    entityType === 'product' ? await productCaretakerTeams(parent, supabase) : undefined,
  );
}

/**
 * ⭐ ช่องแคบของรูปปฏิทินวางบิล (v5 · มติเจ้าของ 29/09 · contract §8) — แนบ/ลบ/แก้รายละเอียด **รูปปฏิทิน** ของลูกค้าได้
 * ถ้าแก้กำหนดวางบิลของลูกค้ารายนั้นได้ (`canEditCustomerBillingRule` ตัวเดียวกับ PATCH `/api/customers/[id]/billing-rule` —
 * ฝ่ายขายทีมที่ดูแล + ฝ่าย FN)
 * ⭐ ทำไมต้องมี: FN ถือแค่ `customers:view` (ห้ามให้ customers:edit — cap นั้นเปิดทั้งฟอร์มลูกค้า) ⇒ `canEditAttachmentParent` ตอบ false
 *   ⇒ FN ตั้งปฏิทินได้แต่แนบรูปที่ใช้เทียบไม่ได้ (403 ที่เจอใน calendar-v3)
 * ⚠️ **แคบเป๊ะ**: entity ลูกค้า + docType รูปปฏิทินเท่านั้น — เอกสารอื่นของลูกค้ายังต้องผ่านด่านแก้ทะเบียนลูกค้าตามเดิม
 * ⚠️ ผู้เรียกส่ง docType **ที่จะเก็บจริง** (POST: ค่าที่ผ่านทะเบียนแล้ว · ลบ/แก้: `docType` ของแถว) — ไม่ใช่ค่าดิบที่ตกเป็น 'other'
 * ⚠️ ไม่เปิดสาขาเอกสาร Google — กติกาไฟล์ของ docType นี้ (DOC_TYPE_FILE_RULES) ตีกลับเอกสาร Google ก่อนคุยกับ Drive อยู่แล้ว
 */
export function canAttachBillingCalendar(entityType, docType, parent, user) {
  if (entityType !== 'customer' || docType !== BILLING_CALENDAR_DOC_TYPE || !parent) return false;
  return canEditCustomerBillingRule(user, parent);
}

/**
 * ⭐ ช่องแคบของรูปประจำแถว checklist ใบสเปค (mig 0405 · มติเจ้าของ 08/10/2569) — แนบ/ลบ/แก้รายละเอียด **รูปของแถว**
 * บนสินค้าได้ ถ้าแก้สเปคสินค้าได้ (`canEditProductSpec` ตัวเดียวกับ PATCH `/api/products/[id]/spec` — ฝ่ายขายทุกตำแหน่ง + admin)
 * ⭐ ทำไมต้องมี: ด่านรวมของไฟล์แนบสินค้า = แก้ทะเบียนสินค้า ซึ่งผูกกับ **ทีมที่ดูแลลูกค้าเจ้าของสินค้า** — แต่สเปคแก้ได้
 *   ทั้งฝ่ายขาย ⇒ คนแก้สเปคนอกทีมกรอกแถวได้ทุกช่องยกเว้นรูป (403)
 * ⚠️ **แคบเป๊ะ**: entity สินค้า + docType รูปของแถวเท่านั้น — ไฟล์อื่นของสินค้า (artwork · ภาพประกอบกระดาษ) ยังต้องผ่านด่านเดิม
 * ⚠️ ผู้เรียกส่ง docType **ที่จะเก็บจริง** (POST: ค่าที่ผ่านทะเบียนแล้ว · ลบ/แก้: `docType` ของแถว) — ไม่ใช่ค่าดิบจากคำขอ
 * ⚠️ ไม่รับแถวแม่ — กติกานี้ไม่ขึ้นกับทีมของสินค้า (ผู้เรียกยังต้องเช็กว่าสินค้ามีจริงเอง)
 */
export function canAttachSpecItemImage(entityType, docType, user) {
  return entityType === 'product' && docType === SPEC_ITEM_IMAGE_DOC_TYPE && canEditProductSpec(user?.role);
}
