import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { stripDriveMetadata } from '@/lib/master/googleDocs';
import { getCurrentUser } from '@/lib/authUser';
import { can, canUser, canEditRecord, canViewCosting } from '@/lib/permissions';
import { getAttachment, releaseAttachmentFile } from '@/lib/master/attachments';
import { ISSUED_DATE_FIELD } from '@/lib/master/attachmentTypes';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { canAttachToPersonalTask } from '@/lib/pm/personalTaskAccess';
import {
  COSTING_ATTACHMENT_TABLE, canAttachToCosting, isCostingAttachment,
} from '@/lib/master/costingAttachmentAccess';

import { canViewSalesPlanning } from '@/lib/salesPlanning';
import {
  SALES_ATTACHMENT_TABLE, canAttachToSalesEntity, isSalesAttachment,
} from '@/lib/sales/salesAttachmentAccess';

export const dynamic = 'force-dynamic';

const PARENT_TABLE = { customer: 'customers', product: 'products', order: 'orders', registration: 'excise_registrations', personal_task: 'personal_tasks' };
const RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };
// โมดูล "งานบริหาร": สิทธิ์ลบ = mgmt:edit (admin+เลขา) — ไม่มี parent customer/product.
const isMgmt = (entityType) => entityType === 'mgmt_task' || entityType === 'mgmt_meeting';
// ระบบขอราคา: ไม่มี parent ใน PARENT_TABLE เหมือนกัน → ถ้าไม่ดักตรงนี้ บล็อกสิทธิ์
// ข้างล่างจะถูกข้ามทั้งก้อน (`if (table)`) แปลว่าใครก็ลบไฟล์แนบของใบ/เคสได้

// ── ด่านสิทธิ์ร่วมของทุก action ที่ "แก้ของที่แนบไว้แล้ว" ────────────────
// ลบไฟล์กับแก้รายละเอียดไฟล์ (วันที่ออกเอกสาร) ต้องใช้สิทธิ์ชุดเดียวกันเสมอ —
// แยกเป็นสองชุดเมื่อไหร่ ชุดหนึ่งจะหลุดกฎไปโดยไม่มีใครรู้ (บทเรียนเดียวกับกฎ
// "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" ใน AGENTS.md)
// คืน Response เมื่อไม่ผ่าน · คืน null เมื่อผ่าน
async function guardAttachmentWrite(supabase, att, user, actionLabel) {
  // mgmt: gate ด้วย cap ของโมดูล (ไม่ผ่าน parent customer/product).
  if (isMgmt(att.entityType) && !canUser(user, 'mgmt:edit')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // ระบบขอราคา: สิทธิ์ลบ = สิทธิ์แนบของ entity นั้น (cap ระบบขอราคา + ฝ่าย/ผู้เปิดเคส)
  if (isCostingAttachment(att.entityType)) {
    const { data: parentRow } = await supabase
      .from(COSTING_ATTACHMENT_TABLE[att.entityType]).select('*').eq('id', att.entityId).maybeSingle();
    const allowed = parentRow
      ? await canAttachToCosting(supabase, att.entityType, parentRow, user)
      // ระเบียนแม่ถูกลบไปแล้ว — ไม่มีแถวให้ตรวจสิทธิ์รายใบ เหลือด่านระบบล้วน
      // (เจตนาเดิม: ให้เก็บกวาดไฟล์ที่ค้างอยู่ได้ ไม่ใช่ให้เปิดอ่านของใคร)
      : canViewCosting(user);
    if (!allowed) return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // ⚠️ ดีล: ไม่มี parent ใน PARENT_TABLE เหมือนระบบขอราคา → ถ้าไม่ดักตรงนี้
  // บล็อกสิทธิ์ข้างล่างจะถูกข้ามทั้งก้อน (`if (table)`) = **ใครก็ลบไฟล์แนบของดีลได้**
  if (isSalesAttachment(att.entityType)) {
    const { data: deal } = await supabase
      .from(SALES_ATTACHMENT_TABLE[att.entityType]).select('*').eq('id', att.entityId).maybeSingle();
    // ดีลถูกลบไปแล้ว — ไม่มีแถวให้ตรวจสิทธิ์รายใบ เหลือด่านระบบล้วน (เจตนาเดิม
    // เหมือนระบบขอราคา: ให้เก็บกวาดไฟล์ที่ค้างได้ ไม่ใช่ให้เปิดอ่านของใคร)
    const allowed = deal ? canAttachToSalesEntity(deal, user) : canViewSalesPlanning(user);
    if (!allowed) return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // สิทธิ์ลบ = สิทธิ์แก้ entity แม่ (team scope จาก canEditRecord).
  const table = PARENT_TABLE[att.entityType];
  let parent = null;
  if (table) {
    ({ data: parent } = await supabase.from(table).select('*').eq('id', att.entityId).maybeSingle());
    // product: edit scope follows the OWNING CUSTOMER's caretaker team (มติ
    // 2026-07-20/21) — resolve it so the check matches the product detail page.
    const canEditParent = att.entityType === 'personal_task'
      ? await canAttachToPersonalTask(supabase, parent, user)
      : canEditRecord(
          user,
          RESOURCE[att.entityType],
          parent,
          att.entityType === 'product' ? await productCaretakerTeams(parent, supabase) : undefined,
        );
    if (parent && !canEditParent) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    // Registration lock (stricter): can't remove docs from an APPROVED reg unless
    // RA — others must press "ขอแก้ไข" first.
    if (att.entityType === 'registration' && parent?.status === 'approved' && !can(user?.role, 'ra:approve')) {
      return Response.json({ error: `ทะเบียนนี้อนุมัติแล้ว ถูกล็อก — ต้องให้ฝ่าย RA ปลดอนุมัติก่อนจึงจะ${actionLabel}ได้` }, { status: 403 });
    }
  }
  return null;
}

// DELETE /api/attachments/[id] — ลบ row + best-effort ลบไฟล์ใน storage.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  const denied = await guardAttachmentWrite(supabase, att, user, 'ลบเอกสาร');
  if (denied) return denied;

  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // เอกสารแนบ **ไม่** ทำให้ลูกค้า/สินค้าตกกลับรออนุมัติ (มติผู้ใช้ 2026-07-27) — ไฟล์
  // ประกอบไม่ใช่สเปกหรือตัวตนของแถว และการ reset ทำให้แถวนั้นหลุดจากลิสต์เลือกทุกหน้า
  // ทันที (GET คืนเฉพาะ approved) ซึ่งแพงเกินกว่าเหตุ. ทะเบียนสรรพสามิตยังล็อกตามเดิม
  // (ด่านข้างบน) เพราะเป็นกติกาที่เข้มกว่าโดยเจตนา

  // ปล่อยของบน Drive ที่แถวนี้ถืออยู่ — **สิทธิ์ที่เคยให้** แล้วค่อยทิ้งตัวไฟล์
  // (best-effort ทั้งคู่ ไม่ให้ block การลบ row ถ้าพลาด · ดู releaseAttachmentFile)
  await releaseAttachmentFile(att);

  return Response.json({ success: true });
}

// PATCH /api/attachments/[id] — แก้ **รายละเอียด** ของไฟล์ที่แนบไว้แล้ว (metadata)
// ไม่แตะตัวไฟล์/ชนิดเอกสาร/เจ้าของ — เปลี่ยนไฟล์ = ลบแล้วแนบใหม่ตามเดิม
//
// ที่ต้องมี: วันที่ออกเอกสาร (issuedDate) เป็นตัวตัดสินว่าหนังสือรับรองยังไม่เกิน
// 6 เดือนไหม — ไฟล์ที่แนบไว้ก่อนมีฟีเจอร์นี้ต้องเติมวันที่ย้อนหลังได้ ไม่ใช่ต้องลบ
// ทิ้งแล้วอัปใหม่เพียงเพื่อกรอกวันที่
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  const denied = await guardAttachmentWrite(supabase, att, user, 'แก้รายละเอียดเอกสาร');
  if (denied) return denied;

  const body = await request.json();
  const { metadata } = body;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return Response.json({ error: 'metadata ไม่ถูกต้อง' }, { status: 400 });
  }
  // วันที่ต้องเป็น ISO 'YYYY-MM-DD' และเป็นวันที่มีอยู่จริง — ค่ามั่วจะทำให้การคำนวณ
  // วันหมดอายุเงียบ ๆ ผิด แล้วเอกสารที่หมดอายุจริงกลับผ่านด่านอนุมัติไปได้
  const issued = metadata[ISSUED_DATE_FIELD];
  if (issued !== undefined && issued !== null && issued !== '') {
    const text = String(issued);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
      return Response.json({ error: 'วันที่ออกเอกสารไม่ถูกต้อง' }, { status: 400 });
    }
  }

  // merge ไม่ทับทั้งก้อน — ฝั่งจอส่งมาทีละช่อง (เช่นแก้เฉพาะวันที่) ไม่ควรลบแท็ค
  // อื่นที่คนอื่นกรอกไว้ทิ้งไปด้วย
  //
  // ⚠️ **ตัดคีย์ของ Drive ออกจากฝั่ง client ก่อน merge** (ผลตรวจรอบ 13 · ค-1) — เส้นนี้
  // อันตรายกว่า POST ด้วยซ้ำ: แถวที่มีอยู่แล้วยังไม่ใช่เอกสารมีชีวิต แต่ PATCH ยัด
  // `kind`/`googleFileId` เข้าไปทีหลังได้ ⇒ ครั้งถัดไปที่มีคนเปิดรายการไฟล์แนบ ระบบจะ
  // ไปแชร์ไฟล์ Drive ตาม id ที่ยัดไว้ · ของเดิมบนแถว (`att.metadata`) ไม่ถูกแตะ
  // เพราะมันมาจาก Drive ตอนสร้าง ไม่ได้มาจากคำขอนี้
  const merged = { ...(att.metadata || {}), ...stripDriveMetadata(metadata) };
  const { data, error } = await supabase
    .from('attachments').update({ metadata: merged }).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // ไม่ทำให้ลูกค้า/สินค้าตกกลับรออนุมัติ — เหตุผลเดียวกับตอนแนบ/ลบไฟล์ (มติ 2026-07-27)
  return Response.json(data);
}
