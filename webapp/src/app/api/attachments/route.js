import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can } from '@/lib/permissions';
import { COSTING_ATTACHMENT_TABLE } from '@/lib/master/costingAttachmentAccess';
import { canEditAttachmentParent, canViewAttachmentParent, canViewAttachmentRow } from '@/lib/master/attachmentAccess';
import { ensureGoogleDocAccess } from '@/lib/master/googleDocAccess';
import { listAttachments } from '@/lib/master/attachments';
import { attachmentUrlErrorForEnv } from '@/lib/master/attachmentStorage';
import {
  GoogleDocError, buildGoogleAttachment, googleDocsEnvError, stripDriveMetadata, workspaceEmail,
} from '@/lib/master/googleDocs';
import { hasFolderBranch } from '@/lib/master/driveEntityMap';
import { ATTACHMENT_ENTITY_TYPES, ATTACHMENT_TYPES } from '@/lib/master/attachmentTypes';
import { appendUpdate as appendMgmtUpdate } from '@/lib/mgmt/repo';

import { SALES_ATTACHMENT_TABLE } from '@/lib/sales/salesAttachmentAccess';

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
// ชื่อ entity ที่เธรด "ประวัติ & อัพเดท" ของงานบริหารใช้ (คนละชุดกับชื่อ entity ของไฟล์แนบ)
const MGMT_FEED_ENTITY = { mgmt_task: 'task', mgmt_meeting: 'meeting' };
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
  const allowed = await canViewAttachmentParent(supabase, entityType, parent, user);
  if (!allowed) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    /* ⭐ เอกสารส่วนบุคคลของลูกค้าแคบกว่าตัวระเบียน (มติผู้ใช้ 2026-08-16 · ดู
       canViewAttachmentRow) — คนนอกทีมผู้ดูแลได้ **แถวที่ปิดเนื้อหาไว้** ไม่ใช่ลิสต์ที่
       หายไปเฉย ๆ
       ⭐ ทำไมไม่กรองทิ้งทั้งแถว: การ์ด "เอกสารบังคับ" บนหน้าลูกค้านับจากลิสต์นี้ ⇒ กรอง
       ทิ้งแล้วคนนอกทีมจะเห็นว่า "ยังไม่แนบบัตรประชาชน" ทั้งที่แนบครบแล้ว แล้วไปทวง
       เอกสารจากลูกค้าซ้ำ · แถวที่ปิดเนื้อหาบอกความจริง ("มีแล้ว") โดยไม่ปล่อยของ
       ⚠️ ตัดทุกช่องที่พาไปถึงไฟล์ **รวมชื่อไฟล์** — ชื่อไฟล์มักมีชื่อเจ้าของบัตรอยู่ในนั้น
       ⚠️ ตัด `metadata.googleFileId` ด้วย ไม่งั้น `ensureGoogleDocAccess` ข้างล่างจะ
       ไปให้สิทธิ์ Drive กับคนที่ไม่ควรเห็นทันทีตั้งแต่เปิดหน้า */
    const items = (await listAttachments(entityType, entityId))
      .map((item) => (canViewAttachmentRow(item, parent, user) ? item : {
        id: item.id,
        entityType: item.entityType,
        entityId: item.entityId,
        docType: item.docType,
        createdAt: item.createdAt,
        fileName: 'เอกสารส่วนบุคคล — ไม่มีสิทธิ์เปิด',
        fileUrl: null,
        driveFileId: null,
        mimeType: null,
        sizeBytes: null,
        // วันที่ออกเอกสารคงไว้: การ์ด "หนังสือรับรองอายุไม่เกิน 6 เดือน" ใช้ตัดสินว่า
        // เอกสารหมดอายุหรือยัง ซึ่งไม่ได้เปิดเผยเนื้อหาอะไร
        metadata: item.metadata?.issuedDate ? { issuedDate: item.metadata.issuedDate } : {},
        restricted: true,
      }));

    // ⭐ ให้สิทธิ์เปิดเอกสารร่วมบน Drive **ตอนคนเห็นรายการ** ไม่ใช่ตอนคนกดเปิด —
    // ปุ่ม "แก้ใน Google" เป็นลิงก์เปิดแท็บใหม่ ถ้ารอ Drive ตอบก่อนเปิดจะโดน
    // popup blocker กินไปทั้งคลิก · ทำตรงนี้แทน คลิกจึงเปิดได้ทันทีเสมอ
    // ⚠️ ยิง Drive เฉพาะคู่ (คน × ไฟล์) ที่ยังไม่เคยให้ — ครั้งต่อไปไม่มีต้นทุนเลย
    await ensureGoogleDocAccess(supabase, items, {
      email: await workspaceEmail(supabase, user?.id),
      role: (await canEditAttachmentParent(supabase, entityType, parent, user)) ? 'writer' : 'reader',
    });

    // no-store: รายการไฟล์แนบเปลี่ยนได้ตลอด — กันเบราว์เซอร์ cache คำตอบเก่า (เช่น []
    // ก่อนแนบไฟล์) แล้วแสดงผิดหลัง refresh
    return Response.json(items, {
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
  const allowedEdit = await canEditAttachmentParent(supabase, entityType, parent, user);
  if (!allowedEdit) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // Registration lock (ทุกระบบ, stricter): an APPROVED registration is locked —
  // only RA may still attach (e.g. the post-approval หนังสืออนุมัติ). Everyone
  // else must press "ขอแก้ไข" first (reverts it to draft for re-approval).
  if (entityType === 'registration' && parent.status === 'approved' && !can(user?.role, 'ra:approve')) {
    return Response.json({ error: 'ทะเบียนนี้อนุมัติแล้ว ถูกล็อก — ต้องให้ฝ่าย RAปลดอนุมัติก่อนจึงจะแนบเอกสารเพิ่มได้' }, { status: 403 });
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
    // ⚠️ `kind`/`googleFileId` ของเอกสารมีชีวิตต้องมาจาก Drive เท่านั้น
    //
    // 🐞 **เดิมวางทับด้วย spread ซึ่งกันได้แค่ครึ่งเดียว (ผลตรวจรอบ 13 · ค-1)** —
    // การวางทับเกิดเฉพาะตอน `googleFile` มีค่า คือเฉพาะสาขาที่สร้าง/ผูกผ่าน Drive จริง ·
    // สาขาไฟล์ธรรมดา `googleFile` เป็น null ⇒ **ไม่มีอะไรมาทับ ค่าจาก client อยู่ครบ**
    // แล้วแถวไฟล์ธรรมดากลายเป็น "เอกสารมีชีวิต" ปลอมที่พาให้ระบบไปแชร์ไฟล์ Drive
    // ตาม id ที่ client เลือก ⇒ ตัดทิ้งก่อนเสมอ ไม่พึ่งการวางทับ
    metadata: {
      ...stripDriveMetadata(metadata),
      ...(googleFile ? googleFile.metadata : {}),
    },
  };

  const { data, error } = await supabase.from('attachments').insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // เอกสารแนบ **ไม่** ทำให้ลูกค้า/สินค้าตกกลับรออนุมัติ (มติผู้ใช้ 2026-07-27) — เหตุผล
  // เดียวกับตอนลบไฟล์ ดู attachments/[id]/route.js. เดิมการแนบไฟล์ทำให้ลูกค้าที่อนุมัติแล้ว
  // หลุดจากลิสต์ออกใบเสนอราคาทันที ซึ่งเป็นหนึ่งในเหตุที่ "ค้นลูกค้าไม่เจอ" แบบไม่มีคำอธิบาย
  // (ทะเบียนสรรพสามิตยังล็อกตามเดิมด้วยด่านข้างบน — กติกาเข้มกว่าโดยเจตนา)

  // งานบริหารมี "ประวัติ & อัพเดท" ต่อระเบียน — การแนบเอกสารคือความเคลื่อนไหว
  // ⚠️ ย้ายมาจาก `/api/mgmt/docs` ที่ถูกยุบทิ้ง · เดิมเขียนฟีดเฉพาะตอนสร้าง/ผูก
  // เอกสาร Google ส่วนการอัปไฟล์เงียบ — ตอนนี้เขียนทั้งสองทางเพราะเป็น code path
  // เดียวกันแล้ว และ "ใครแนบอะไรเมื่อไหร่" มีค่าเท่ากันไม่ว่าไฟล์มาจากไหน
  if (isMgmt(entityType)) {
    await appendMgmtUpdate(supabase, {
      entityType: MGMT_FEED_ENTITY[entityType],
      entityId,
      kind: 'link',
      body: `${google ? (google.mode === 'link' ? 'ผูก' : 'สร้าง') : 'แนบ'}เอกสาร: ${data.fileName || data.fileUrl}`,
      user,
    });
  }

  return Response.json(data, { status: 201 });
}
