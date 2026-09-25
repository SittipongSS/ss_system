import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { stripDriveMetadata } from '@/lib/master/googleDocs';
import { getCurrentUser } from '@/lib/authUser';
import { can, canUser, canEditRecord, canViewCosting } from '@/lib/permissions';
import { getAttachment, releaseAttachmentFile } from '@/lib/master/attachments';
import {
  ISSUED_DATE_FIELD, RETIRED_METADATA_KEYS, SPEC_ILLUSTRATION_DOC_TYPE, isRetiredAttachment,
} from '@/lib/master/attachmentTypes';
import { isIllustrationReferenced } from '@/lib/sales/productSpecStore';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { canAttachToPersonalTask } from '@/lib/pm/personalTaskAccess';
import {
  COSTING_ATTACHMENT_TABLE, canAttachToCosting, isCostingAttachment,
} from '@/lib/master/costingAttachmentAccess';

import { canViewSalesPlanning } from '@/lib/salesPlanning';
import {
  SALES_ATTACHMENT_TABLE, canAttachToSalesEntity, isSalesAttachment,
} from '@/lib/sales/salesAttachmentAccess';
import { historicalContractFilesFrozenGate } from '@/lib/sales/historicalContractLock';
import {
  SALES_ORDER_ATTACHMENT_TABLE, canAttachToSalesOrder, canRemoveSalesOrderFile, isSalesOrderAttachment,
  salesOrderAttachBlock,
} from '@/lib/sales/salesOrderAttachmentAccess';

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
//
// 🐞 ทั้งสามทางข้างล่างถือ "ไม่มีแถวแม่" เป็น **แม่ถูกลบไปแล้ว ⇒ เหลือด่านระบบล้วน**
// (ให้เก็บกวาดไฟล์ค้างได้) — เคยทิ้ง error ของการอ่านแม่ ⇒ อ่านพังครั้งเดียว = ได้ null
// = ข้ามด่านรายใบไปเลย ใครที่ผ่านด่านระบบก็ลบ/แก้ไฟล์ของระเบียนที่ตัวเองไม่มีสิทธิ์ได้
// ⇒ อ่านพังต้องหยุดที่ 500 เสมอ แยกให้ออกจาก "ไม่มีจริง"
async function guardAttachmentWrite(supabase, att, user, actionLabel) {
  // mgmt: gate ด้วย cap ของโมดูล (ไม่ผ่าน parent customer/product).
  if (isMgmt(att.entityType) && !canUser(user, 'mgmt:edit')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // ระบบขอราคา: สิทธิ์ลบ = สิทธิ์แนบของ entity นั้น (cap ระบบขอราคา + ฝ่าย/ผู้เปิดเคส)
  if (isCostingAttachment(att.entityType)) {
    const { data: parentRow, error: parentError } = await supabase
      .from(COSTING_ATTACHMENT_TABLE[att.entityType]).select('*').eq('id', att.entityId).maybeSingle();
    if (parentError) return Response.json({ error: parentError.message }, { status: 500 });
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
    const { data: deal, error: dealError } = await supabase
      .from(SALES_ATTACHMENT_TABLE[att.entityType]).select('*').eq('id', att.entityId).maybeSingle();
    if (dealError) return Response.json({ error: dealError.message }, { status: 500 });
    // ดีลถูกลบไปแล้ว — ไม่มีแถวให้ตรวจสิทธิ์รายใบ เหลือด่านระบบล้วน (เจตนาเดิม
    // เหมือนระบบขอราคา: ให้เก็บกวาดไฟล์ที่ค้างได้ ไม่ใช่ให้เปิดอ่านของใคร)
    const allowed = deal ? canAttachToSalesEntity(deal, user) : canViewSalesPlanning(user);
    if (!allowed) return Response.json({ error: 'forbidden' }, { status: 403 });
    /* ล็อกไฟล์ของเอกสารแทนสัญญา (ใบสั่งขายย้อนหลัง · 0374) — ตรึงระหว่างรอ AE Sup อนุมัติ ด่านเดียวกับตอนแนบ
       (POST /api/attachments) · ลบไฟล์ที่ AE Sup กำลังดูอยู่ = อนุมัติด้วยไฟล์ที่ไม่มีแล้ว (RPC ตีกลับ
       signed_file_invalid) หรือได้ชุดไฟล์ที่ไม่ใช่ชุดที่ตรวจ · แถวแม่ถูกลบแล้ว = ไม่มีอะไรให้ล็อก */
    if (att.entityType === 'contract' && deal) {
      const frozen = await historicalContractFilesFrozenGate(supabase, deal);
      if (frozen) return Response.json({ error: frozen.message }, { status: frozen.status });
    }
  }

  /* ⚠️ ใบสั่งขาย: ไม่มี parent ใน PARENT_TABLE ของไฟล์นี้ — ไม่ดักตรงนี้ = บล็อก `if (table)` ข้างล่างถูกข้าม
     ทั้งก้อน = **ใครก็ลบไฟล์แนบของใบสั่งขายได้**
     กติกา (มติ 25/09): ลบ/แก้ได้เฉพาะ **คนแนบเอง ที่ยังแก้ใบได้** หรือแอดมิน · ใบยกเลิก/ถูก Rev. แทน = แตะไม่ได้
     (แอดมินข้ามด่านสถานะได้) · ใบถูกลบไปแล้ว = เหลือด่านระบบ + คนแนบ/แอดมิน (เก็บกวาดไฟล์ค้าง) */
  if (isSalesOrderAttachment(att.entityType)) {
    const { data: order, error: orderError } = await supabase
      .from(SALES_ORDER_ATTACHMENT_TABLE[att.entityType]).select('*').eq('id', att.entityId).maybeSingle();
    if (orderError) return Response.json({ error: orderError.message }, { status: 500 });
    const allowed = canRemoveSalesOrderFile(att, user)
      && (order ? await canAttachToSalesOrder(supabase, order, user) : canViewSalesPlanning(user));
    if (!allowed) {
      return Response.json({
        error: canRemoveSalesOrderFile(att, user) ? 'forbidden' : `${actionLabel}ได้เฉพาะคนที่แนบไฟล์นี้หรือแอดมิน`,
      }, { status: 403 });
    }
    const blocked = order && user?.role !== 'admin' ? salesOrderAttachBlock(order) : null;
    if (blocked) return Response.json({ error: blocked }, { status: 409 });
  }

  // สิทธิ์ลบ = สิทธิ์แก้ entity แม่ (team scope จาก canEditRecord).
  const table = PARENT_TABLE[att.entityType];
  let parent = null;
  if (table) {
    let parentError;
    ({ data: parent, error: parentError } = await supabase.from(table).select('*').eq('id', att.entityId).maybeSingle());
    if (parentError) return Response.json({ error: parentError.message }, { status: 500 });
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

// ── ภาพประกอบใบสเปค FM-SA-04 ที่เอกสารอ้างอยู่: ปลดระวางแทนการลบ ────────────────
// (มติ 21/09/2569 · docs/fm-sa-04-document-model.md หัวข้อ "รูปห้ามหาย")
//
// เอกสารถือภาพนิ่งของตัวเองตั้งแต่ตอนยื่น และภาพนิ่งชี้รูปด้วย id (`illustrationIds`)
// ⇒ ลบแถว + ทิ้งไฟล์บน Drive = กระดาษ Rev ที่ยื่นหรืออนุมัติไปแล้ว (บางใบลูกค้าเซ็นกลับมา
//   แล้ว) เปิดรูปไม่ขึ้นตลอดกาล และกู้ไม่ได้เพราะตัวไฟล์หายไปด้วย
// ⇒ รูปที่ Rev ไหนก็ตามที่ไม่ใช่ร่างอ้างอยู่ ต้องเก็บทั้งแถวและไฟล์ไว้ แค่ประทับ
//   `metadata.retiredAt` ให้จอสเปคกับภาพนิ่งรอบใหม่ข้ามไป (ดู isRetiredAttachment)
// ⚠️ ตรวจไม่สำเร็จต้องหยุดที่ 500 — ถ้าถือว่า "ไม่มีใครอ้าง" แล้วลบต่อ นั่นคือทางเดียว
//    ที่รูปบนกระดาษหายจริง (supabase ไม่ throw ⇒ ต้องอ่าน error เอง)
// คืน Response เมื่อจบที่นี่ (ปลดระวางแล้ว หรือ error) · คืน null = ไม่มีเอกสารใบไหนอ้าง ลบได้ตามปกติ
const SPEC_ILLUSTRATION_RETIRED_MESSAGE = 'รูปนี้อยู่ในเอกสาร FM-SA-04 ที่ยื่นหรืออนุมัติแล้ว จึงเก็บไฟล์ไว้และซ่อนจากสเปค';

// ตราปลดระวาง — ที่เดียวที่ประกอบก้อนนี้ (สองทางข้างล่างใช้ร่วม) · metadata เดิม (คำบรรยาย · ลำดับ ·
// คีย์ของ Drive) ต้องคงอยู่ ประทับทับทั้งก้อนแล้วคำบรรยายหาย
const retiredMetadataOf = (att, user) => ({
  ...(att.metadata || {}),
  retiredAt: new Date().toISOString(),
  retiredBy: user?.id || null,
  retiredByName: user?.name || user?.email || null,
});

async function retireReferencedIllustration(supabase, att, user) {
  const ref = await isIllustrationReferenced(supabase, att.id);
  if (ref.error) {
    return Response.json({
      error: `ตรวจไม่ได้ว่ารูปนี้อยู่ในเอกสาร FM-SA-04 ใบไหนหรือไม่ จึงยังไม่ลบ — ${ref.error}`,
    }, { status: 500 });
  }
  if (!ref.referenced) return null;

  // กดลบซ้ำที่รูปที่ปลดระวางไปแล้ว (เปิดจอค้างไว้สองแท็บ) — ไม่ประทับทับ คงผู้ปลดคนแรกไว้
  if (!isRetiredAttachment(att)) {
    const metadata = retiredMetadataOf(att, user);
    const { data: retired, error: retireError } = await supabase
      .from('attachments').update({ metadata }).eq('id', att.id).select('id').maybeSingle();
    if (retireError) return Response.json({ error: retireError.message }, { status: 500 });
    // แถวหายไประหว่างทาง (อีกแท็บลบไปก่อน) — ไม่ตอบว่าปลดระวางสำเร็จทั้งที่ไม่มีแถวให้ประทับ
    if (!retired) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });
  }
  return Response.json({ success: true, retired: true, message: SPEC_ILLUSTRATION_RETIRED_MESSAGE });
}

// ── รูปที่ "ยังไม่มีใครอ้าง" ก็ต้องกันการยื่นที่แทรกกลาง ────────────────────────────
// 🔴 ยื่นเอกสารอ่านรายการรูปก่อน แล้วค่อยเขียน `illustrationIds` ลง Rev ทีหลัง ⇒ ถ้าคำขอยื่นกำลังวิ่ง
//    ด่านข้างบนยังไม่เห็น Rev นั้น (ยังไม่ commit) แล้วเราลบแถว + ปล่อยไฟล์ไปเลย = กระดาษที่อนุมัติ
//    ทีหลังชี้รูปที่หายไปแล้วตลอดกาล (ไฟล์ถูกปล่อย กู้ไม่ได้)
// ⇒ ประทับปลดระวางก่อน (ภาพนิ่งรอบใหม่ข้ามรูปที่ปลดระวางแล้วทันที) → ตรวจการอ้างอิงซ้ำ →
//   ไม่มีใครอ้างจริงค่อยลบ · ถ้ามีคำขอยื่นที่ commit ทันก่อนตรวจซ้ำ = เก็บรูปไว้แบบปลดระวาง
//   · ฝั่งยื่นตรวจรูปซ้ำหลังเขียนเหมือนกัน (รูปหาย/ถูกปลดระวาง = ถอยการยื่น) ⇒ สองฝั่งถอยให้กันเสมอ
//   ไม่มีลำดับไหนที่กระดาษชี้ไฟล์ที่ถูกปล่อยไปแล้ว
// ⚠️ ตรวจซ้ำไม่สำเร็จ = เก็บไว้แบบปลดระวาง (ซ่อนจากสเปคแล้ว ไฟล์ยังอยู่) ไม่ใช่ลบต่อ
// คืน Response เมื่อจบที่นี่ · คืน null = ไม่มีใครอ้างจริง ลบแถว + ปล่อยไฟล์ได้
async function retireBeforeDelete(supabase, att, user) {
  if (!isRetiredAttachment(att)) {
    const { data: retired, error: retireError } = await supabase
      .from('attachments').update({ metadata: retiredMetadataOf(att, user) }).eq('id', att.id).select('id').maybeSingle();
    if (retireError) return Response.json({ error: retireError.message }, { status: 500 });
    if (!retired) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });
  }
  const again = await isIllustrationReferenced(supabase, att.id);
  if (again.error) {
    return Response.json({
      error: `ซ่อนรูปจากสเปคแล้ว แต่ตรวจซ้ำไม่ได้ว่ามีเอกสาร FM-SA-04 เพิ่งยื่นพร้อมรูปนี้หรือไม่ จึงยังเก็บไฟล์ไว้ — ${again.error}`,
    }, { status: 500 });
  }
  if (again.referenced) {
    return Response.json({ success: true, retired: true, message: SPEC_ILLUSTRATION_RETIRED_MESSAGE });
  }
  return null;
}

// DELETE /api/attachments/[id] — ลบ row + best-effort ลบไฟล์ใน storage.
// ยกเว้นภาพประกอบใบสเปคที่เอกสาร FM-SA-04 อ้างอยู่ = ปลดระวาง (ดู retireReferencedIllustration)
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const att = await getAttachment(id);
  if (!att) return Response.json({ error: 'ไม่พบเอกสารแนบ' }, { status: 404 });

  const denied = await guardAttachmentWrite(supabase, att, user, 'ลบเอกสาร');
  if (denied) return denied;

  // ⚠️ ต้องมาก่อนคำสั่งลบแถวเสมอ — ลบไปแล้วไม่มีอะไรให้ปลดระวาง และไฟล์ถูกปล่อยทิ้งแล้ว
  if (att.entityType === 'product' && att.docType === SPEC_ILLUSTRATION_DOC_TYPE) {
    const handled = await retireReferencedIllustration(supabase, att, user);
    if (handled) return handled;
    const raced = await retireBeforeDelete(supabase, att, user);
    if (raced) return raced;
  }

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
  //
  // ⚠️ คีย์ปลดระวาง (`retiredAt`…) ก็ตัดด้วยเหตุผลเดียวกัน — DELETE เป็นคนเขียนคนเดียว
  // ส่ง `retiredAt: null` มาแล้วรูปที่เอกสาร FM-SA-04 อ้างอยู่จะกลับเข้าภาพนิ่งรอบหน้า
  const requested = stripDriveMetadata(metadata);
  for (const key of RETIRED_METADATA_KEYS) delete requested[key];
  const merged = { ...(att.metadata || {}), ...requested };
  const { data, error } = await supabase
    .from('attachments').update({ metadata: merged }).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // ไม่ทำให้ลูกค้า/สินค้าตกกลับรออนุมัติ — เหตุผลเดียวกับตอนแนบ/ลบไฟล์ (มติ 2026-07-27)
  return Response.json(data);
}
