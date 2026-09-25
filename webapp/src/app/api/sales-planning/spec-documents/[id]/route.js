/* ── เอกสาร FM-SA-04 หนึ่งใบ — อ่าน (GET) + การกระทำตามเส้นสถานะ (PATCH) (mig 0370) ──
 *
 * ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md · ตาราง "เส้นสถานะของ Rev")
 *   AC ยื่น → **AE เจ้าของดีลของ SO** อนุมัติ → **AE Supervisor** อนุมัติ (admin กดแทนได้ทุกขั้น)
 *   · แก้ก่อนอนุมัติขั้นสุดท้าย = Rev เดิม · อนุมัติแล้วกด "แก้ไขเอกสาร" = Rev+1 เลขที่เดิม
 *   · ทุกการยื่น/อนุมัติ/แก้ไข ต้องเช็คว่า SO ยัง `approved` อยู่
 * ⭐ **มติเจ้าของ 24/09/2569 "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ"** — ผู้อนุมัติทั้งสองขั้น
 *   (AE เจ้าของดีล · CD/CM/AE Sup) กด "แก้ไขเอกสาร" และ "ยกเลิกเอกสาร" บนใบที่เคยอนุมัติแล้วได้ ·
 *   สาย AC คงสิทธิ์เดิมทุกอย่าง · ยื่น/ลบร่างยังเป็นของสาย AC · แก้ไข ⇒ แจ้ง AC · ยกเลิก ⇒ แจ้ง AC + เจ้าของดีล
 *
 * ⚠️ **ด่านของทุกปุ่มคือ `documentActions` ตัวเดียวกับที่หน้าเอกสารใช้** — ที่นี่ไม่ตัดสินเอง
 *   ว่าใครกดอะไรได้ (คิดซ้ำเมื่อไร จอกับ API จะยอมคนละอย่าง) · ก้อนที่เขียนลง Rev มาจาก
 *   `revisionPatch` ตัวเดียว ให้ผ่าน CHECK ของ 0370 ทุกครั้ง
 * 🔴 "admin" = `role === 'admin'` เท่านั้น — **ไม่ใช้ `isSuperuser`** เพราะ `ae_supervisor`
 *   นับเป็น superuser แล้วจะกดขั้น AE ข้ามเจ้าของดีลได้
 * 🔴 UPDATE ที่เปลี่ยนสถานะเดินผ่าน store ซึ่ง `.eq('status', เดิม)` และเช็คว่าโดนแถวจริง —
 *   ไม่โดน = 409 "สถานะเปลี่ยนแล้ว กรุณาโหลดใหม่" (สองแท็บ/สองคนกดพร้อมกัน)
 */
import { after } from 'next/server';
import { withUser, ok, fail, badRequest, forbidden, conflict, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { loadScoped } from '@/lib/scopedRow';
import { notifyUsers } from '@/lib/notifications';
import { loadUserDirectory } from '@/lib/usersRepo';
import { SALES_BELL_ROLES } from '@/lib/permissions';
import { canEditProductSpec } from '@/lib/sales/productSpecWorkflow';
import {
  DOC_ACTION_KEYS, DRAFT_EXIT_MISMATCH, FRESH_DRAFT_VOID_BLOCK, canAeApproveProductSpecDocument, canIssueProductSpecDocument,
  canReviseProductSpecDocument, canSupApproveProductSpecDocument, canVoidProductSpecDocument, docReasonError,
  documentActions, documentExitKey, draftDeleteBlock, formatRevLabel, lineRemovedBlock, rejectStageOf, revisionPatch,
} from '@/lib/sales/productSpecDocWorkflow';
import {
  applyFinalApproval, buildDocumentSnapshot, deleteDraftDocument, loadSpecDocument,
  missingSnapshotIllustrations, openNextRevision, transitionRevision, voidDocument,
} from '@/lib/sales/productSpecStore';
import { freezeProductSpecRevision } from '@/lib/sales/productSpecFreeze';
import { formatSpecDocNo } from '@/lib/sales/productSpecDocNo';

export const dynamic = 'force-dynamic';

const STALE = 'สถานะเปลี่ยนแล้ว กรุณาโหลดใหม่';
const PENDING = ['pending_ae', 'pending_ae_supervisor'];

/**
 * โหลดเอกสาร + ตรวจว่าคนนี้เห็น SO ต้นเรื่องไหม
 *
 * ⚠️ เอกสารไม่มีเจ้าของ/ทีมของตัวเอง — ขอบเขตมาจาก **SO ที่ผูกอยู่** (`loadScoped` ของใบสั่งขาย)
 * ⚠️ SO ถูกลบถาวรไปแล้ว (FK SET NULL) = ไม่มีอะไรให้ตรวจขอบเขต ⇒ เปิดเฉพาะฝ่ายขาย
 *    (ชุดเดียวกับคนที่แก้สเปคได้) ไม่ใช่เปิดให้ทุกคนที่ล็อกอิน
 * @param mode 'view' (GET) | 'edit' (PATCH)
 */
async function loadVisibleDocument(supabase, id, user, mode) {
  const loaded = await loadSpecDocument(supabase, id);
  if (loaded.error) return { response: fail(loaded.error, loaded.status || 500) };
  if (loaded.document.salesOrderId) {
    const scoped = await loadScoped(supabase, 'sales_orders', loaded.document.salesOrderId, user, mode);
    if (scoped.response) return { response: scoped.response };
  } else if (!canEditProductSpec(user?.role)) {
    return { response: forbidden() };
  }
  return loaded;
}

/* รูปคำตอบของ GET/PATCH — ตามสัญญาของหน้าเอกสาร (Rev ไม่มี frozenHtml · store ไม่ดึงมาอยู่แล้ว)
   ⚠️ dealOwner ส่งแค่ id + ชื่อ — อีเมล/เบอร์ของเจ้าของดีลใช้พิมพ์ลงกระดาษเท่านั้น
   ⚠️ `canEditSpec` = ปุ่ม "แก้สเปคที่หน้าสินค้า" — หน้านี้เปิดได้ทุกคนที่เห็น SO (RD · FN · TS ...)
      แต่แก้สเปคได้เฉพาะฝ่ายขาย ⇒ ไม่มีสิทธิ์ = ไม่แสดงปุ่ม (ui-visibility-rule) ไม่ใช่ปุ่มที่พาไปหน้าอ่านอย่างเดียว */
function documentPayload(loaded, user) {
  const { document, revisions, latest, approved, salesOrder, dealOwner, product } = loaded;
  return {
    document,
    revisions,
    latest,
    approved,
    salesOrder: salesOrder
      ? { id: salesOrder.id, orderNumber: salesOrder.orderNumber, status: salesOrder.status }
      : null,
    dealOwner: dealOwner ? { id: dealOwner.id, name: dealOwner.name } : null,
    product: product
      ? {
        id: product.id,
        fgCode: product.fgCode,
        productDescription: product.productDescription,
        productDescriptionEn: product.productDescriptionEn,
        // ⚠️ ส่งทั้งสองภาษา — จอเลือกภาษาด้วย productBrandName/productDisplayName (สินค้าที่มีแต่ชื่ออังกฤษเคยขึ้นขีด)
        brandName: product.brandName,
        brandNameEn: product.brandNameEn,
      }
      : null,
    actions: documentActions({
      document, latest, salesOrder, dealOwnerId: dealOwner?.id || null, user,
    }),
    canEditSpec: canEditProductSpec(user?.role),
  };
}

/* ยื่นไม่สำเร็จหลังเขียนลง Rev ไปแล้ว ⇒ คืน Rev กลับสภาพก่อนกดทุกช่องที่ก้อน `submit` เขียน
   (รวมรอยตีกลับ — Rev ที่ถูกตีกลับต้องกลับไปเป็น "ตีกลับ" พร้อมเหตุผลเดิม ไม่ใช่กลายเป็นร่างเปล่า)
   ⚠️ ถอยคือทางย้อน ไม่ใช่เดินหน้า — ยามของ 0370 ไม่ขวาง · เดินผ่าน `transitionRevision` ตัวเดียวกัน */
function undoSubmitPatch(before, submitPatch, now) {
  const patch = Object.fromEntries(Object.keys(submitPatch).map((key) => [key, before?.[key] ?? null]));
  return { ...patch, illustrationIds: before?.illustrationIds || [], updatedAt: now };
}

/* ── GET ────────────────────────────────────────────────────────────────── */
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const loaded = await loadVisibleDocument(supabase, id, user, 'view');
  if (loaded.response) return loaded.response;
  return ok(documentPayload(loaded, user));
});

/* ── ปุ่มที่ `documentActions` ซ่อน: ตอบ 403 หรือ 409 ─────────────────────────
   ⚠️ ที่นี่ **ไม่ใช่ด่าน** — ด่านจริงคือ `documentActions` ข้างบน ซึ่งซ่อนปุ่มทั้งเมื่อ "ไม่มีสิทธิ์"
   และเมื่อ "สถานะเลยขั้นนั้นไปแล้ว" · ที่นี่แค่แยกสองกรณีให้ข้อความตรงความจริง: คนมีสิทธิ์
   ที่กดซ้ำ/กดจากแท็บค้างต้องได้ "โหลดใหม่" ไม่ใช่ "ไม่มีสิทธิ์"
   ⭐ มติ 24/09/2569: แก้ไข/ยกเลิก ถามตัวตัดสินชุดเดียวกับ `documentActions` (สาย AC + ผู้อนุมัติ) ไม่ใช่ canIssue
      — ผู้อนุมัติที่กดแก้ไขซ้ำหลังมีคนเปิด Rev ไปแล้วต้องได้ "โหลดใหม่" ไม่ใช่ "ได้เฉพาะ AC" ที่ไม่จริงแล้ว */
const ACTION_ROLE = {
  submit: ({ user }) => canIssueProductSpecDocument(user?.role),
  revise: ({ user, dealOwnerId }) => canReviseProductSpecDocument(user, dealOwnerId),
  void: ({
    user, dealOwnerId, document, latest,
  }) => canVoidProductSpecDocument({
    user, dealOwnerId, document, latest,
  }),
  // ดึงกลับ = ผู้ยื่นของ Rev นี้ · Rev ที่ไม่ได้รออนุมัติแล้ว (ดึงกลับไปแล้ว) = AC ที่กดซ้ำ
  withdraw: ({ user, latest }) => user?.role === 'admin'
    || (Boolean(user?.id) && latest?.submittedBy === user.id)
    || (!PENDING.includes(latest?.status) && canIssueProductSpecDocument(user?.role)),
  ae_approve: ({ user, dealOwnerId }) => canAeApproveProductSpecDocument(user, dealOwnerId),
  sup_approve: ({ user }) => canSupApproveProductSpecDocument(user),
  reject: ({ user, dealOwnerId }) => canAeApproveProductSpecDocument(user, dealOwnerId)
    || canSupApproveProductSpecDocument(user),
};

const ACTION_FORBIDDEN = {
  submit: 'ยื่นเอกสารได้เฉพาะ AC',
  revise: 'แก้ไขเอกสาร (ออก Rev. ใหม่) ได้เฉพาะ AC หรือผู้อนุมัติของเอกสารนี้ (AE เจ้าของดีล · ผู้จัดการฝ่ายขาย)',
  void: 'ยกเลิกเอกสารได้เฉพาะ AC — ผู้อนุมัติยกเลิกได้เมื่อเอกสารเคยอนุมัติแล้ว (ใบที่รออนุมัติใช้ "ตีกลับ")',
  withdraw: 'ดึงกลับได้เฉพาะผู้ยื่นเอกสาร Rev. นี้',
  ae_approve: 'ขั้นนี้เป็นของ AE เจ้าของดีลของใบสั่งขายนี้',
  sup_approve: 'ขั้นนี้เป็นของ AE Supervisor',
  reject: 'ตีกลับได้เฉพาะผู้อนุมัติของขั้นนี้',
};

function hiddenActionResponse(action, { document, latest, user, dealOwnerId }) {
  if (document.status === 'void') return conflict('เอกสารนี้ถูกยกเลิกแล้ว — ทำรายการต่อไม่ได้');
  if (!latest) return fail('เอกสารนี้ไม่มี Rev. — แจ้งผู้ดูแลระบบ', 500);
  /* ⭐ มติ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง" — ร่างที่ยังไม่เคยยื่นมีแค่ "ลบร่าง" (`documentExitKey`)
     ⇒ AC ที่ยิง void มาจากแท็บค้าง/ยิงตรงต้องได้ทางที่ใช้ได้จริง ไม่ใช่ "สถานะเปลี่ยนแล้ว"
     (ใบไม่ได้ขยับเลย โหลดใหม่กี่รอบก็ยกเลิกไม่ได้)
     ⚠️ เฉพาะสาย AC — ผู้อนุมัติไม่มีปุ่มลบให้ชี้ (ร่างที่ไม่เคยยื่นไม่เคยอนุมัติ ⇒ ตกไป 403 ข้างล่าง) */
  if (action === 'void' && canIssueProductSpecDocument(user?.role)
    && documentExitKey(document, latest) === 'remove') {
    return conflict(FRESH_DRAFT_VOID_BLOCK);
  }
  // ⚠️ ส่ง `document` ด้วย — ยกเลิกของผู้อนุมัติขึ้นกับว่าใบเคยอนุมัติหรือยัง (`currentRevNo`)
  if (ACTION_ROLE[action]({ user, latest, dealOwnerId, document })) return conflict(STALE);
  return forbidden(ACTION_FORBIDDEN[action]);
}

/* ── แจ้งเตือน (`notifyUsers`) ตามตารางในเอกสารมติ ───────────────────────────
   ยื่น ⇒ AE เจ้าของดีล · AE อนุมัติ ⇒ AE Supervisor ทุกคนที่ active (`SALES_BELL_ROLES` — CD/CM อนุมัติขั้นนี้ได้
   แต่ไม่รับกระดิ่ง · มติ 2026-09-24 ข้อ 6) · ตีกลับ ⇒ ผู้ยื่น ·
   อนุมัติขั้นสุดท้าย ⇒ ผู้ยื่น + AE เจ้าของดีล
   ⭐ มติ 24/09/2569 (ผู้อนุมัติย้อน/ยกเลิกได้):
     · แก้ไขเอกสาร ⇒ ผู้ยื่นฉบับที่อนุมัติ + ผู้ออกเอกสาร (สาย AC) — Rev ใหม่ต้องให้ AC ยื่น และ AC **ไม่มีคิวงาน**
       ของเอกสาร ⇒ ไม่แจ้ง = Rev ที่ผู้อนุมัติเปิดค้างเงียบจนกว่าจะมีคนบังเอิญเปิดหน้า
     · ยกเลิก ⇒ ผู้ยื่น (Rev ล่าสุด + ฉบับที่อนุมัติ — Rev ใหม่ที่ยังไม่ยื่นไม่มีผู้ยื่น) + ผู้ออกเอกสาร + AE เจ้าของดีล
       (รวมยกเลิกที่ AC กดเอง ซึ่งเดิมไม่แจ้งใคร)
   ⚠️ ไม่แจ้งตัวเอง (admin กดแทนเจ้าของดีล/ผู้ยื่นกดเองก็ไม่ต้องเด้งหาตัวเอง)
   ⚠️ fire-and-forget หลังตอบ — การอนุมัติบันทึกไปแล้ว แจ้งเตือนพลาดต้องไม่ทำให้ตอบ error
      (`notifyUsers` กลืน error เองแล้ว · ไล่รายชื่อ ae_supervisor ต้องอ่านบัญชีทั้งระบบ
      จึงไม่ควรให้คนกดรอ) */
function describe({ document, revision, product, salesOrder }) {
  /* ⭐ เลขที่ในหัวแจ้งเตือน = รูปเดียวกับกระดาษ `DDMMYY-XXX-RR` (มติ 22/09) — Rev อยู่ในเลขแล้ว
     ชื่อชนิด "(FM-SA-04)" อยู่ที่ป้ายของแถวแจ้งเตือน (ENTITY_LABEL) ไม่ต้องซ้ำในหัว */
  const head = formatSpecDocNo(document.docNo, revision?.revNo);
  const body = [
    [product?.fgCode, product?.productDescription].filter(Boolean).join(' '),
    salesOrder?.orderNumber ? `ใบสั่งขาย ${salesOrder.orderNumber}` : null,
  ].filter(Boolean).join(' · ') || null;
  return { head, body };
}

async function recipientsFor(supabase, action, { latest, approved, document, dealOwner }) {
  if (action === 'submit') return [dealOwner?.id];
  if (action === 'ae_approve') {
    const directory = await loadUserDirectory(supabase);
    return [...directory.values()]
      .filter((u) => u && !u.disabled && SALES_BELL_ROLES.includes(u.role))
      .map((u) => u.id);
  }
  if (action === 'reject') return [latest?.submittedBy];
  if (action === 'sup_approve') return [latest?.submittedBy, dealOwner?.id];
  if (action === 'revise') return [latest?.submittedBy, document?.createdBy];
  if (action === 'void') return [latest?.submittedBy, approved?.submittedBy, document?.createdBy, dealOwner?.id];
  return [];
}

function noticeText(action, { head, body, reason }) {
  if (action === 'submit') {
    return { kind: 'product_spec_doc_submit', title: `รอ AE อนุมัติรายละเอียดผลิตภัณฑ์ · ${head}`, body };
  }
  if (action === 'ae_approve') {
    return { kind: 'product_spec_doc_ae_approve', title: `รอ AE Supervisor อนุมัติรายละเอียดผลิตภัณฑ์ · ${head}`, body };
  }
  if (action === 'reject') {
    return {
      kind: 'product_spec_doc_reject',
      title: `รายละเอียดผลิตภัณฑ์ถูกตีกลับ · ${head}`,
      body: [String(reason || '').trim().slice(0, 300), body].filter(Boolean).join(' — ') || null,
    };
  }
  if (action === 'sup_approve') {
    return { kind: 'product_spec_doc_approve', title: `รายละเอียดผลิตภัณฑ์อนุมัติแล้ว · ${head}`, body };
  }
  /* ⚠️ สองตัวนี้ใช้แค่ head/body/reason — เทสต์ดึงก้อนนี้ไปรันใน `new Function` ที่รู้จักแค่ formatSpecDocNo
     ⚠️ หัวไม่มีคำว่า "Rev." — Rev อยู่ในเลขแล้ว (head ของ revise = เลขของ Rev ใหม่) */
  if (action === 'revise') {
    return {
      kind: 'product_spec_doc_revise',
      title: `เปิดฉบับแก้ไขรายละเอียดผลิตภัณฑ์ — รอ AC แก้สเปคและยื่น · ${head}`,
      body: [String(reason || '').trim().slice(0, 300), body].filter(Boolean).join(' — ') || null,
    };
  }
  if (action === 'void') {
    return {
      kind: 'product_spec_doc_void',
      title: `รายละเอียดผลิตภัณฑ์ถูกยกเลิก · ${head}`,
      body: [String(reason || '').trim().slice(0, 300), body].filter(Boolean).join(' — ') || null,
    };
  }
  return null;
}

function notifyLater(supabase, action, context) {
  const deliver = async () => {
    const { head, body } = describe(context);
    const text = noticeText(action, { head, body, reason: context.reason });
    if (!text) return;
    const actorId = context.user?.id ? String(context.user.id) : null;
    const userIds = (await recipientsFor(supabase, action, context))
      .filter(Boolean).map(String).filter((uid) => uid !== actorId);
    if (!userIds.length) return;
    await notifyUsers(supabase, {
      userIds,
      entityType: 'product_spec_document',
      entityId: context.document.id,
      kind: text.kind,
      title: text.title,
      body: text.body,
      actorName: context.user?.name || null,
    });
  };
  try {
    after(deliver);
  } catch {
    // นอกบริบท request ของ Next (script/เทสต์) — ยิงตรงแล้วปล่อยให้ notifyUsers กลืน error เอง
    deliver().catch(() => {});
  }
}

/* บรรทัด SO ที่เอกสารอ้าง — ใช้ถ่ายภาพนิ่งตอนยื่น (จำนวน · หน่วย · คำบรรยาย · บรรทัดใบเสนอราคาต้นทาง
   ที่เป็นค่าสำรองของ "จำนวนผลิต")
   ⚠️ ต้องเป็นบรรทัดของ SO เดียวกับเอกสาร — เช็คเอง ไม่เชื่อ id ลอย ๆ */
async function loadDocumentLine(supabase, document, latest) {
  const { data, error } = await supabase.from('sales_order_lines')
    .select('id, salesOrderId, quotationLineId, productId, fgCode, description, qty, unit, sortOrder')
    .eq('id', document.salesOrderLineId)
    .maybeSingle();
  if (error) return { error: `อ่านบรรทัดใบสั่งขายไม่สำเร็จ: ${error.message}` };
  if (!data || data.salesOrderId !== document.salesOrderId) {
    // ⚠️ ชี้ปุ่มปลายทางที่ใบนี้มีจริง (ร่างที่ไม่เคยยื่น = ลบร่าง · นอกนั้น = ยกเลิก) — มติ 23/09/2569
    return { error: lineRemovedBlock(document, latest), status: 400 };
  }
  return { line: data };
}

/* ── PATCH { action, reason? } ─────────────────────────────────────────────── */
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const key = DOC_ACTION_KEYS[action];
  if (!key) return badRequest('ไม่รู้จักการกระทำนี้');

  const loaded = await loadVisibleDocument(supabase, id, user, 'edit');
  if (loaded.response) return loaded.response;
  const { document, latest, approved, salesOrder, dealOwner, product } = loaded;
  const dealOwnerId = dealOwner?.id || null;

  const gate = documentActions({ document, latest, salesOrder, dealOwnerId, user })[key];
  if (!gate.visible) return hiddenActionResponse(action, { document, latest, user, dealOwnerId });
  if (gate.reason) return badRequest(gate.reason);

  const reason = String(body?.reason ?? '').trim();
  const now = new Date().toISOString();
  const warnings = [];
  let revisionAfter = latest;
  let documentAfter = document;

  /* ยื่น: ถ่ายภาพนิ่งใหม่ทุกครั้ง (ยื่นใหม่หลังตีกลับก็ถ่ายใหม่) — สเปค + checklist + สินค้า +
     บรรทัด SO + รูป · อนุมัติของที่ไม่มีภาพนิ่ง = ลายเซ็นที่ไม่รู้ว่ารับรองอะไร */
  if (action === 'submit') {
    const lineRes = await loadDocumentLine(supabase, document, latest);
    if (lineRes.error) return fail(lineRes.error, lineRes.status || 500);
    const snap = await buildDocumentSnapshot(supabase, {
      productId: document.productId, order: salesOrder, line: lineRes.line, dealOwner, now,
    });
    if (snap.error) return fail(snap.error, snap.status || 500);
    const step = revisionPatch('submit', {
      user, now, snapshot: snap.snapshot, illustrationIds: snap.illustrationIds,
    });
    if (!step.from.includes(latest.status)) return conflict(STALE);
    const moved = await transitionRevision(supabase, { revision: latest, patch: step.patch });
    if (moved.error) return fail(moved.error, moved.status || 500);

    /* 🔴 รูปห้ามหาย — ภาพนิ่งอ่านรายการรูปก่อน แล้วค่อยเขียน `illustrationIds` ⇒ คนลบรูปแทรกกลางได้
       (ด่านของเส้นลบรูปยังไม่เห็น Rev นี้เพราะยังไม่ commit) ⇒ ตรวจซ้ำหลังเขียน: รูปหาย/ถูกปลดระวาง
       ระหว่างนั้น = ถอย Rev กลับสภาพเดิมแล้วตอบ 409 ให้ยื่นใหม่ · ฝั่งลบรูปประทับปลดระวางก่อนแล้ว
       ตรวจซ้ำเหมือนกัน (api/attachments/[id]) ⇒ ไม่มีจังหวะไหนที่กระดาษชี้รูปที่ถูกลบไฟล์ไปแล้ว
       ⚠️ ตรวจไม่ได้ = ถอยเหมือนกัน — "น่าจะครบ" คือทางที่รูปบนกระดาษที่ลูกค้าเซ็นหายจริง */
    const check = await missingSnapshotIllustrations(supabase, snap.illustrationIds);
    if (check.error || check.missing.length) {
      const undone = await transitionRevision(supabase, {
        revision: moved.row, patch: undoSubmitPatch(latest, step.patch, new Date().toISOString()),
      });
      if (undone.error) {
        return fail(`ยื่นแล้วแต่รูปประกอบในภาพนิ่งไม่ครบ และถอย ${formatRevLabel(latest.revNo)} กลับไม่สำเร็จ: ${undone.error} — แจ้งผู้ดูแลระบบ`, 500);
      }
      if (check.error) return fail(`ตรวจรูปประกอบในภาพนิ่งไม่สำเร็จ จึงยังไม่ยื่น — ${check.error}`, 500);
      return conflict('รูปประกอบบางรูปถูกลบระหว่างที่ยื่น จึงยังไม่ยื่น — โหลดหน้าใหม่แล้วยื่นอีกครั้ง');
    }
    revisionAfter = moved.row;
  } else if (action === 'withdraw' || action === 'ae_approve' || action === 'reject') {
    let step;
    if (action === 'reject') {
      // ⚠️ 10–500 ตัวอักษร — ด่านเดียวกับโมดัลตีกลับบนจอ · ขั้นที่ตีกลับลง `rejectedStage`
      const reasonError = docReasonError(reason, { label: 'เหตุผลที่ตีกลับ' });
      if (reasonError) return badRequest(reasonError);
      step = revisionPatch('reject', { user, now, reason, stage: rejectStageOf(latest) });
    } else {
      step = revisionPatch(action, { user, now });
    }
    if (!step.from.includes(latest.status)) return conflict(STALE);
    const moved = await transitionRevision(supabase, { revision: latest, patch: step.patch });
    if (moved.error) return fail(moved.error, moved.status || 500);
    revisionAfter = moved.row;
  } else if (action === 'sup_approve') {
    const step = revisionPatch('sup_approve', { user, now });
    if (!step.from.includes(latest.status)) return conflict(STALE);
    const moved = await transitionRevision(supabase, { revision: latest, patch: step.patch });
    if (moved.error) return fail(moved.error, moved.status || 500);
    revisionAfter = moved.row;

    /* ⚠️ ต่อจากนี้คือของที่ตามหลังการอนุมัติ — Rev นี้ `approved` ไปแล้วและถอยไม่ได้
       (ยามของ 0370 ห้าม approved → อื่นนอกจาก superseded) ⇒ ล้ม = ตอบสำเร็จพร้อม warning
       + ลง audit ไม่ใช่ 500 (คนจะกดซ้ำแล้วได้ "สถานะเปลี่ยนแล้ว" ทั้งที่ของค้างครึ่งทาง) */
    const final = await applyFinalApproval(supabase, { document, revision: revisionAfter, now });
    if (final.error) {
      warnings.push(`อนุมัติแล้ว แต่ปิด Rev. ก่อนหน้า/อัปเดต Rev. ปัจจุบันของเอกสารไม่สำเร็จ: ${final.error} — แจ้งผู้ดูแลระบบ`);
    }
    /* ตรึงกระดาษ (frozenHtml) จากภาพนิ่ง + ผู้ลงนามทั้งสามขั้น — พิมพ์ Rev ที่อนุมัติแล้วใช้ค่านี้เสมอ
       🪤 ห่อ try — ตัวเรนเดอร์เป็นโมดูลอื่นที่ throw ได้ (ไม่ใช่ supabase ที่คืน error เสมอ) */
    let frozen;
    try {
      frozen = await freezeProductSpecRevision(supabase, { documentId: document.id, revisionId: revisionAfter.id });
    } catch (error) {
      frozen = { error: error?.message || String(error) };
    }
    if (frozen?.error) {
      warnings.push(`อนุมัติแล้ว แต่บันทึกกระดาษฉบับตรึงของ ${formatRevLabel(revisionAfter.revNo)} ไม่สำเร็จ: ${frozen.error} — แจ้งผู้ดูแลระบบ`);
    }
  } else if (action === 'revise') {
    // Rev ที่อนุมัติแล้วยังเป็นฉบับที่ใช้ จนกว่า Rev ใหม่จะผ่านด่านครบสามขั้น
    const reasonError = docReasonError(reason, { label: 'เหตุผลที่แก้ไขเอกสาร' });
    if (reasonError) return badRequest(reasonError);
    const opened = await openNextRevision(supabase, { document, fromRevision: latest, reason, user, now });
    if (opened.error) return fail(opened.error, opened.status || 500);
    revisionAfter = opened.revision;
  } else if (action === 'void') {
    // void คือปลายทาง — เลขที่ไม่นำกลับมาใช้ · บรรทัดนี้ออกเอกสารใหม่ได้ (เลขใหม่)
    const reasonError = docReasonError(reason, { label: 'เหตุผลที่ยกเลิกเอกสาร' });
    if (reasonError) return badRequest(reasonError);
    const voided = await voidDocument(supabase, { document, reason, user, now });
    if (voided.error) return fail(voided.error, voided.status || 500);
    documentAfter = voided.document;
  }

  // ⚠️ before/after เต็มทั้งเอกสารและ Rev — ทางตามรอยทางเดียวว่าใครเซ็นอะไรเมื่อไร
  const revLabel = formatRevLabel(revisionAfter?.revNo ?? latest?.revNo);
  await recordAudit({
    user,
    action: 'update',
    entityType: 'product_spec_document',
    entityId: document.id,
    before: { document, revision: latest },
    after: {
      document: documentAfter,
      revision: revisionAfter,
      ...(warnings.length ? { warnings } : {}),
    },
    summary: `${action} ${document.docNo} ${revLabel}`
      + (reason && ['reject', 'revise', 'void'].includes(action) ? `: ${reason}` : '')
      + (warnings.length ? ` ⚠️ ${warnings.join(' · ')}` : ''),
    request: req,
  });

  notifyLater(supabase, action, {
    document, revision: revisionAfter, latest, approved, product, salesOrder, dealOwner, user, reason,
  });

  const warning = warnings.length ? warnings.join(' · ') : null;
  const reloaded = await loadSpecDocument(supabase, id);
  if (reloaded.error) {
    /* บันทึกไปแล้ว — อ่านกลับไม่ขึ้นต้องไม่กลายเป็น error (คนจะกดซ้ำ) · ส่งของที่รู้ + บอกให้โหลดใหม่ */
    const stale = { ...loaded, document: documentAfter, latest: revisionAfter };
    return ok({
      ...documentPayload(stale, user),
      warning: [warning, `บันทึกแล้ว แต่โหลดเอกสารใหม่ไม่สำเร็จ: ${reloaded.error} — โหลดหน้าใหม่`]
        .filter(Boolean).join(' · '),
    });
  }
  const payload = documentPayload(reloaded, user);
  return ok(warning ? { ...payload, warning } : payload);
});

/* ── DELETE — ลบร่างที่ยังไม่เคยยื่น (มติเจ้าของ 23/09/2569 · mig 0375) ──────────
 *
 * ⭐ **มติ**: ใบที่บันทึกไว้แล้วแต่ยังไม่เคยยื่นให้ใครดู ลบทิ้งได้เหมือนร่างใบเสนอราคา ·
 *   ผู้ลบ = ชุดเดียวกับผู้ออกเอกสาร (AC + admin) · **เลขที่ไม่นำกลับมาใช้** — ตัวนับ FMSA04
 *   ไม่ถอย บรรทัด SO เดิมออกใบใหม่ได้ทันทีและได้ **เลขใหม่**
 * 🔴 ร่างที่ยื่นแล้วดึงกลับ · ถูกตีกลับ · อนุมัติแล้ว **ลบไม่ได้** — AE เห็นใบนั้นแล้ว
 *   ทางออกเดียวยังเป็น "ยกเลิกเอกสาร" (void)
 *
 * ⚠️ ด่านเป็น `documentActions().remove` ตัวเดียวกับที่จอใช้วาดปุ่ม — ที่นี่ไม่ตัดสินเอง
 * ⚠️ ฐานตรวจซ้ำทุกข้อใน RPC `delete_product_spec_document_draft` (ล็อก Rev → เอกสาร ตาม
 *    ลำดับเดียวกับทางยื่น) ⇒ คนกด "ยื่น" แทรกกลางจะถูกเห็น และเราต์ตอบ 409 ไม่ใช่ลบทับ
 */
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const loaded = await loadVisibleDocument(supabase, id, user, 'edit');
  if (loaded.response) return loaded.response;
  const { document, latest, salesOrder, dealOwner } = loaded;

  const gate = documentActions({
    document, latest, salesOrder, dealOwnerId: dealOwner?.id || null, user,
  }).remove;
  if (!gate.visible) {
    /* ⚠️ ปุ่มถูกซ่อน = อาจเป็น "ไม่มีสิทธิ์" หรือ "ใบนี้ลบไม่ได้มาแต่ต้น" — สองเรื่องคนละข้อความ
       ห้ามตอบ "สถานะเปลี่ยนแล้ว โหลดใหม่" รวด ๆ เพราะร่างที่เคยยื่นแล้วดึงกลับ **ไม่ได้
       เปลี่ยนสถานะ** มันแค่ลบไม่ได้ตลอดกาล · โหลดใหม่กี่รอบก็เหมือนเดิม */
    if (!canIssueProductSpecDocument(user?.role)) return forbidden('ลบร่างเอกสารได้เฉพาะ AC');
    return conflict(draftDeleteBlock(document, latest) || STALE);
  }

  /* 🔴 **ลง audit ก่อนลบ** — ระบบไม่มีถังขยะ `audit_logs.before` คือทางกู้ทางเดียว
     ([[deleted-data-recovery]]) · ลบก่อนแล้วค่อยเขียน = จังหวะที่แถวหายไปโดยยังไม่มีสำเนา
     (และ `recordAudit` กลืน error เอง ⇒ เราต์ไม่มีทางรู้ว่าต้องหยุด) · ลบไม่ผ่านหลังจากนี้
     จะมีแถว audit แก้ไว้ข้างล่าง ไม่ปล่อยให้บันทึกโกหกว่าลบไปแล้ว */
  const revLabel = formatRevLabel(latest?.revNo);
  await recordAudit({
    user,
    action: 'delete',
    entityType: 'product_spec_document',
    entityId: document.id,
    before: { document, revision: latest },
    after: null,
    summary: `delete ${document.docNo} ${revLabel} (ร่างที่ยังไม่เคยยื่น — เลขที่ไม่นำกลับมาใช้)`,
    request: req,
  });

  const removed = await deleteDraftDocument(supabase, { document });
  if (removed.error) {
    await recordAudit({
      user,
      action: 'update',
      entityType: 'product_spec_document',
      entityId: document.id,
      before: { document, revision: latest },
      after: { document, revision: latest, deleteFailed: removed.error },
      summary: `delete ${document.docNo} ${revLabel} ไม่สำเร็จ — แถวยังอยู่: ${removed.error}`,
      request: req,
    });
    /* 🔴 ไม่ให้เกิดทางตัน (มติ 23/09/2569 "ซ่อนปุ่มยกเลิกช่วงร่าง" ถอดปุ่มยกเลิกที่เคยเป็นทางหนีของร่าง)
       RPC ปฏิเสธ = ปกติคือมีคนยื่นแทรก ⇒ อ่านใบใหม่แล้วปุ่มกลายเป็น "ยกเลิก" ข้อความของ RPC ("ใช้ยกเลิกเอกสารแทน") ถูก
       · แต่ถ้าอ่านใหม่แล้ว **ยังเป็นร่างที่ลบได้ในสายตาแอป** = ตัวตัดสินกับ RPC เห็นไม่ตรงกัน ⇒ ส่งต่อข้อความของ RPC
         คือส่งคนไปหาปุ่มยกเลิกที่ไม่มี (และ PATCH void จะตอบกลับว่า "ใช้ลบร่าง") ⇒ ตอบให้แจ้งผู้ดูแลแทน */
    if (removed.conflict) {
      const again = await loadVisibleDocument(supabase, id, user, 'edit');
      if (!again.response && documentExitKey(again.document, again.latest) === 'remove') {
        return conflict(DRAFT_EXIT_MISMATCH);
      }
    }
    return fail(removed.error, removed.status || 500);
  }

  /* จอเด้งกลับหน้าใบสั่งขาย — ส่ง id ของ SO กลับไปด้วย เพราะเอกสารที่ลบแล้วอ่านซ้ำไม่ได้
     (การ์ดบนหน้า SO และรายการเอกสารบนหน้าสเปคดึงใหม่เองตอนกลับไปถึง) */
  return ok({
    deleted: true,
    docNo: removed.docNo,
    salesOrderId: document.salesOrderId || null,
    salesOrderNumber: salesOrder?.orderNumber || null,
  });
});
