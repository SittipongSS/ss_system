import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canUser, canEditRecord, canViewRecord } from '@/lib/permissions';
import {
  COSTING_ATTACHMENT_TABLE, canAttachToCosting, canViewCostingAttachment, isCostingAttachment,
} from '@/lib/master/costingAttachmentAccess';
import { listAttachments } from '@/lib/master/attachments';
import { attachmentUrlErrorForEnv } from '@/lib/master/attachmentStorage';
import { GoogleDocError, buildGoogleAttachment, googleDocsEnvError, workspaceEmail } from '@/lib/master/googleDocs';
import { hasFolderBranch } from '@/lib/master/driveEntityMap';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { ATTACHMENT_ENTITY_TYPES, ATTACHMENT_TYPES } from '@/lib/master/attachmentTypes';
import { canAttachToPersonalTask, canViewPersonalTask } from '@/lib/pm/personalTaskAccess';

import {
  SALES_ATTACHMENT_TABLE, canAttachToSalesEntity, canViewSalesAttachment, isSalesAttachment,
} from '@/lib/sales/salesAttachmentAccess';

export const dynamic = 'force-dynamic';
// สาขา "เอกสารมีชีวิต" โหลด googleapis (หนัก + อ่าน OIDC token) — ต้อง Node runtime
export const runtime = 'nodejs';

// Polymorphic attachments (migration 0028). Permission piggybacks on the parent
// entity: viewing/editing an attachment = viewing/editing its customer/product.
const PARENT_TABLE = { customer: 'customers', product: 'products', order: 'orders', registration: 'excise_registrations', personal_task: 'personal_tasks' };
// resource key passed to the permission helpers (matches lib/permissions).
const RESOURCE = { customer: 'customers', product: 'products', order: 'orders', registration: 'registrations' };

// โมดูล "งานบริหาร" (mgmt): แนบไฟล์กับ task/meeting — สิทธิ์คุมด้วย mgmt cap
// (admin+เลขา) ไม่ใช่ canViewRecord ของ parent customer/product. parent = แค่เช็ก
// ว่า row มีจริง (ไม่ถูกลบ) เพื่อไม่ให้แนบกับ id ลอย.
const MGMT_TABLE = { mgmt_task: 'mgmt_tasks', mgmt_meeting: 'mgmt_meetings' };
const isMgmt = (entityType) => !!MGMT_TABLE[entityType];
const isPersonalTask = (entityType) => entityType === 'personal_task';

async function loadParent(supabase, entityType, entityId) {
  const table = PARENT_TABLE[entityType]
    || MGMT_TABLE[entityType]
    || COSTING_ATTACHMENT_TABLE[entityType]
    || SALES_ATTACHMENT_TABLE[entityType];
  if (!table) return null;
  const { data } = await supabase.from(table).select('*').eq('id', entityId).maybeSingle();
  return data || null;
}

// GET /api/attachments?entityType=customer&entityId=CUS-123456
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');
  if (!ATTACHMENT_ENTITY_TYPES.includes(entityType) || !entityId) {
    return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const parent = await loadParent(supabase, entityType, entityId);
  if (!parent) return Response.json([]); // ไม่มี entity → ไม่มีเอกสาร
  const allowed = isMgmt(entityType)
    ? canUser(user, 'mgmt:view')
    : isPersonalTask(entityType)
      ? await canViewPersonalTask(supabase, parent, user)
      : isCostingAttachment(entityType)
        ? await canViewCostingAttachment(supabase, entityType, parent, user)
        // ดีลคุมด้วยขอบเขตของสายงานขาย (ทีม/เจ้าของดีล) ไม่ใช่ทีมเจ้าของลูกค้า
        : isSalesAttachment(entityType)
          ? canViewSalesAttachment(parent, user)
          : canViewRecord(user, RESOURCE[entityType], parent);
  if (!allowed) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    // no-store: รายการไฟล์แนบเปลี่ยนได้ตลอด — กันเบราว์เซอร์ cache คำตอบเก่า (เช่น []
    // ก่อนแนบไฟล์) แล้วแสดงผิดหลัง refresh
    return Response.json(await listAttachments(entityType, entityId), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/attachments — บันทึก metadata หลังอัปโหลดไฟล์ผ่าน /api/upload แล้ว
// **หรือ** สร้าง/ผูกเอกสาร Google เมื่อส่ง `google: { mode, ... }` มาแทน fileUrl
//
// ⭐ ทางเดียวกันโดยตั้งใจ (มติผู้ใช้ 2026-08-14) — ปลายทางคือแถว `attachments`
// แถวเดียวกัน ต่างแค่ว่าไฟล์มาจากไหน · แยก route จะต้องเขียนด่านสิทธิ์สองชุด
// แล้วเพี้ยนหากันภายหลัง ซึ่งเป็นความพังแบบเงียบที่สุดของสายไฟล์แนบ
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();
  const { entityType, entityId, docType, fileUrl, driveFileId, fileName, mimeType, sizeBytes, metadata, google } = body;

  if (!ATTACHMENT_ENTITY_TYPES.includes(entityType) || !entityId) {
    return Response.json({ error: 'entityType/entityId ไม่ถูกต้อง' }, { status: 400 });
  }

  if (google) {
    // ⚠️ ต้องมีสาขาโฟลเดอร์ของตัวเอง ไม่งั้นไฟล์ตกถัง "_รอจัดที่" แล้วหาไม่เจอ
    // บน Drive โดยไม่มี error ให้เห็น (บั๊กที่เคยเกิดกับเธรดทะเบียนภาษี)
    if (!hasFolderBranch(entityType)) {
      return Response.json({ error: 'entity นี้ยังไม่มีที่เก็บบน Drive — สร้างเอกสารร่วมไม่ได้' }, { status: 400 });
    }
    const envError = googleDocsEnvError();
    if (envError) return Response.json({ error: envError }, { status: 400 });
  } else {
    // ที่อยู่ไฟล์ต้องเป็นของ storage เราเท่านั้น — client ส่ง fileUrl อะไรมาก็ได้ และตั้ง
    // driveFileId เป็น null เองได้ ซึ่งทำให้แถวนั้นถูก render เป็น <a href> ดิบ ๆ และทำให้
    // proxy ดาวน์โหลดกลายเป็น open redirect จากโดเมนของแอปเราเอง (ดู attachmentStorage)
    //
    // ⚠️ สาขา google ข้ามด่านนี้ได้เพราะที่อยู่ **มาจาก Drive ไม่ใช่จาก client** —
    // client ส่งได้แค่ "สร้างชนิดไหน" กับ "ลิงก์ไหนที่จะผูก" ซึ่งถูกแปลงเป็น fileId
    // แล้วอ่าน metadata กลับมาจาก Drive อีกที
    const urlError = attachmentUrlErrorForEnv(fileUrl);
    if (urlError) return Response.json({ error: urlError }, { status: 400 });
  }

  const parent = await loadParent(supabase, entityType, entityId);
  if (!parent) return Response.json({ error: 'ไม่พบระเบียนที่จะแนบเอกสาร' }, { status: 404 });
  const allowedEdit = isMgmt(entityType)
    ? canUser(user, 'mgmt:edit')
    : isPersonalTask(entityType)
      ? await canAttachToPersonalTask(supabase, parent, user)
      : isCostingAttachment(entityType)
        ? await canAttachToCosting(supabase, entityType, parent, user)
      // ⚠️ แนบ = **แก้ดีลได้** ไม่ใช่แค่เห็น · คนที่เห็นดีลของทีมอื่นได้
      // (หัวหน้าสาย/ผู้บริหาร) ต้องอ่านได้แต่ไม่ควรไปเพิ่มเอกสารในดีลที่ไม่ใช่ของตัวเอง
      : isSalesAttachment(entityType)
        ? canAttachToSalesEntity(parent, user)
      // product: edit scope follows the OWNING CUSTOMER's caretaker team (มติ
      // 2026-07-20/21) — resolve it so this matches the product detail page.
      : canEditRecord(
          user,
          RESOURCE[entityType],
          parent,
          entityType === 'product' ? await productCaretakerTeams(parent, supabase) : undefined,
        );
  if (!allowedEdit) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // Registration lock (ทุกระบบ, stricter): an APPROVED registration is locked —
  // only LG may still attach (e.g. the post-approval หนังสืออนุมัติ). Everyone
  // else must press "ขอแก้ไข" first (reverts it to draft for re-approval).
  if (entityType === 'registration' && parent.status === 'approved' && !can(user?.role, 'legal:approve')) {
    return Response.json({ error: 'ทะเบียนนี้อนุมัติแล้ว ถูกล็อก — ต้องให้ฝ่ายกฎหมายปลดอนุมัติก่อนจึงจะแนบเอกสารเพิ่มได้' }, { status: 403 });
  }

  // docType ต้องเป็นชนิดที่รองรับของ entity นั้น — ที่ไม่รู้จักตกเป็น 'other'.
  const allowed = (ATTACHMENT_TYPES[entityType] || []).map((t) => t.key);
  const safeDocType = allowed.includes(docType) ? docType : 'other';

  // เอกสารมีชีวิต: คุยกับ Drive **หลังผ่านด่านสิทธิ์แล้วเท่านั้น** — ไม่งั้นคนที่แนบ
  // ไม่ได้ยังสร้างไฟล์ค้างไว้บน Shared Drive ได้ทุกครั้งที่กด
  let googleFile = null;
  if (google) {
    try {
      googleFile = await buildGoogleAttachment({
        entityType,
        entityId,
        mode: google.mode,
        type: google.type,
        url: google.url,
        name: google.name,
        grantEmail: await workspaceEmail(supabase, user?.id),
      });
    } catch (err) {
      if (err instanceof GoogleDocError) return Response.json({ error: err.message }, { status: err.status });
      throw err;
    }
  }

  const row = {
    entityType,
    entityId,
    docType: safeDocType,
    fileUrl: googleFile ? googleFile.fileUrl : fileUrl,
    // Drive backend: id ไฟล์บน Drive (null = ไฟล์เก่าบน Supabase — hybrid).
    driveFileId: googleFile ? googleFile.driveFileId : (driveFileId || null),
    fileName: googleFile ? googleFile.fileName : (fileName || null),
    mimeType: googleFile ? googleFile.mimeType : (mimeType || null),
    // เอกสาร Google ไม่มีขนาดที่มีความหมาย (Drive คืน 1 KB เสมอ) — เก็บ null
    sizeBytes: !googleFile && typeof sizeBytes === 'number' ? sizeBytes : null,
    uploadedBy: user?.id ?? null,
    uploadedByName: user?.name ?? null,
    // รายละเอียด/แท็คเพิ่มเติม (เลขใบเสร็จ/วันที่/ยอด/อ้างอิงออเดอร์ ฯลฯ).
    // รับเฉพาะ plain object — ป้องกัน array/ค่าแปลกปลอม.
    //
    // ⚠️ `kind`/`googleFileId` ของเอกสารมีชีวิตต้องมาจาก Drive เท่านั้น — วางทับ
    // ของที่ client ส่งมา ไม่งั้นตั้ง kind ปลอมให้แถวไฟล์ธรรมดาแล้วหน้าเว็บจะ
    // เอาไปประกอบเป็นลิงก์ /preview ของ Google ตามค่าที่ client บอก
    metadata: {
      ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
      ...(googleFile ? googleFile.metadata : {}),
    },
  };

  const { data, error } = await supabase.from('attachments').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // เอกสารแนบ **ไม่** ทำให้ลูกค้า/สินค้าตกกลับรออนุมัติ (มติผู้ใช้ 2026-07-27) — เหตุผล
  // เดียวกับตอนลบไฟล์ ดู attachments/[id]/route.js. เดิมการแนบไฟล์ทำให้ลูกค้าที่อนุมัติแล้ว
  // หลุดจากลิสต์ออกใบเสนอราคาทันที ซึ่งเป็นหนึ่งในเหตุที่ "ค้นลูกค้าไม่เจอ" แบบไม่มีคำอธิบาย
  // (ทะเบียนสรรพสามิตยังล็อกตามเดิมด้วยด่านข้างบน — กติกาเข้มกว่าโดยเจตนา)

  return Response.json(data, { status: 201 });
}
