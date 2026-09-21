/* ── เอกสาร FM-SA-04 หนึ่งใบ — อ่าน (GET) + การกระทำตามเส้นสถานะ (PATCH) (mig 0370) ──
 *
 * ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md · ตาราง "เส้นสถานะของ Rev")
 *   AC ยื่น → **AE เจ้าของดีลของ SO** อนุมัติ → **AE Supervisor** อนุมัติ (admin กดแทนได้ทุกขั้น)
 *   · แก้ก่อนอนุมัติขั้นสุดท้าย = Rev เดิม · อนุมัติแล้วกด "แก้ไขเอกสาร" = Rev+1 เลขที่เดิม
 *   · ทุกการยื่น/อนุมัติ/แก้ไข ต้องเช็คว่า SO ยัง `approved` อยู่
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
import { canEditProductSpec } from '@/lib/sales/productSpecWorkflow';
import {
  DOC_ACTION_KEYS, canAeApproveProductSpecDocument, canIssueProductSpecDocument,
  canSupApproveProductSpecDocument, docReasonError, documentActions, formatRevLabel,
  rejectStageOf, revisionPatch,
} from '@/lib/sales/productSpecDocWorkflow';
import {
  applyFinalApproval, buildDocumentSnapshot, loadSpecDocument, missingSnapshotIllustrations, openNextRevision,
  transitionRevision, voidDocument,
} from '@/lib/sales/productSpecStore';
import { freezeProductSpecRevision } from '@/lib/sales/productSpecFreeze';

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
        brandName: product.brandName,
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
   ที่กดซ้ำ/กดจากแท็บค้างต้องได้ "โหลดใหม่" ไม่ใช่ "ไม่มีสิทธิ์" */
const ACTION_ROLE = {
  submit: ({ user }) => canIssueProductSpecDocument(user?.role),
  revise: ({ user }) => canIssueProductSpecDocument(user?.role),
  void: ({ user }) => canIssueProductSpecDocument(user?.role),
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
  revise: 'แก้ไขเอกสาร (ออก Rev. ใหม่) ได้เฉพาะ AC',
  void: 'ยกเลิกเอกสารได้เฉพาะ AC',
  withdraw: 'ดึงกลับได้เฉพาะผู้ยื่นเอกสาร Rev. นี้',
  ae_approve: 'ขั้นนี้เป็นของ AE เจ้าของดีลของใบสั่งขายนี้',
  sup_approve: 'ขั้นนี้เป็นของ AE Supervisor',
  reject: 'ตีกลับได้เฉพาะผู้อนุมัติของขั้นนี้',
};

function hiddenActionResponse(action, { document, latest, user, dealOwnerId }) {
  if (document.status === 'void') return conflict('เอกสารนี้ถูกยกเลิกแล้ว — ทำรายการต่อไม่ได้');
  if (!latest) return fail('เอกสารนี้ไม่มี Rev. — แจ้งผู้ดูแลระบบ', 500);
  if (ACTION_ROLE[action]({ user, latest, dealOwnerId })) return conflict(STALE);
  return forbidden(ACTION_FORBIDDEN[action]);
}

/* ── แจ้งเตือน (`notifyUsers`) ตามตารางในเอกสารมติ ───────────────────────────
   ยื่น ⇒ AE เจ้าของดีล · AE อนุมัติ ⇒ `ae_supervisor` ทุกคนที่ active · ตีกลับ ⇒ ผู้ยื่น ·
   อนุมัติขั้นสุดท้าย ⇒ ผู้ยื่น + AE เจ้าของดีล
   ⚠️ ไม่แจ้งตัวเอง (admin กดแทนเจ้าของดีล/ผู้ยื่นกดเองก็ไม่ต้องเด้งหาตัวเอง)
   ⚠️ fire-and-forget หลังตอบ — การอนุมัติบันทึกไปแล้ว แจ้งเตือนพลาดต้องไม่ทำให้ตอบ error
      (`notifyUsers` กลืน error เองแล้ว · ไล่รายชื่อ ae_supervisor ต้องอ่านบัญชีทั้งระบบ
      จึงไม่ควรให้คนกดรอ) */
function describe({ document, revision, product, salesOrder }) {
  const head = `${document.docNo} ${formatRevLabel(revision?.revNo)}`;
  const body = [
    [product?.fgCode, product?.productDescription].filter(Boolean).join(' '),
    salesOrder?.orderNumber ? `ใบสั่งขาย ${salesOrder.orderNumber}` : null,
  ].filter(Boolean).join(' · ') || null;
  return { head, body };
}

async function recipientsFor(supabase, action, { latest, dealOwner }) {
  if (action === 'submit') return [dealOwner?.id];
  if (action === 'ae_approve') {
    const directory = await loadUserDirectory(supabase);
    return [...directory.values()]
      .filter((u) => u && !u.disabled && u.role === 'ae_supervisor')
      .map((u) => u.id);
  }
  if (action === 'reject') return [latest?.submittedBy];
  if (action === 'sup_approve') return [latest?.submittedBy, dealOwner?.id];
  return [];
}

function noticeText(action, { head, body, reason }) {
  if (action === 'submit') {
    return { kind: 'product_spec_doc_submit', title: `รอ AE อนุมัติใบสเปคสินค้า · ${head}`, body };
  }
  if (action === 'ae_approve') {
    return { kind: 'product_spec_doc_ae_approve', title: `รอ AE Supervisor อนุมัติใบสเปคสินค้า · ${head}`, body };
  }
  if (action === 'reject') {
    return {
      kind: 'product_spec_doc_reject',
      title: `ใบสเปคสินค้าถูกตีกลับ · ${head}`,
      body: [String(reason || '').trim().slice(0, 300), body].filter(Boolean).join(' — ') || null,
    };
  }
  if (action === 'sup_approve') {
    return { kind: 'product_spec_doc_approve', title: `ใบสเปคสินค้าอนุมัติแล้ว · ${head}`, body };
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

/* บรรทัด SO ที่เอกสารอ้าง — ใช้ถ่ายภาพนิ่งตอนยื่น (จำนวน · หน่วย · คำบรรยาย)
   ⚠️ ต้องเป็นบรรทัดของ SO เดียวกับเอกสาร — เช็คเอง ไม่เชื่อ id ลอย ๆ */
async function loadDocumentLine(supabase, document) {
  const { data, error } = await supabase.from('sales_order_lines')
    .select('id, salesOrderId, productId, fgCode, description, qty, unit, sortOrder')
    .eq('id', document.salesOrderLineId)
    .maybeSingle();
  if (error) return { error: `อ่านบรรทัดใบสั่งขายไม่สำเร็จ: ${error.message}` };
  if (!data || data.salesOrderId !== document.salesOrderId) {
    return { error: 'บรรทัดของใบสั่งขายที่เอกสารนี้อ้างถูกถอดแล้ว — ยกเลิกเอกสารใบนี้แทน', status: 400 };
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
  const { document, latest, salesOrder, dealOwner, product } = loaded;
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
    const lineRes = await loadDocumentLine(supabase, document);
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
    document, revision: revisionAfter, latest, product, salesOrder, dealOwner, user, reason,
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
