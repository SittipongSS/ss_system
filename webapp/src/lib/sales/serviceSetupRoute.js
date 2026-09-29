// ── ตรรกะของ `…/sales-orders/[id]/service-setup` (mig 0392 · PR-A · แผน §2.4) — ฝั่ง server เท่านั้น ─────────
//
// ⭐ route เป็นเปลือกบาง ๆ (withUser + ด่านอ่าน) แล้วส่งต่อมาที่นี่ · ทุกฟังก์ชันคืน `{ status, body }`
//   แบบเดียวกับ historicalOrderCommit.js ⇒ ทดสอบด้วย supabase ปลอมได้ (route.js import ใต้ node ไม่ได้ เพราะ
//   `@/lib/http` ลาก `next/headers` มาด้วย)
//   GET   ก้อนของตาราง/โมดัล/แถบ (`serviceSetupView`) — ทุกคนที่อ่านใบได้
//   PATCH บันทึกงานบริการ (RPC `save_sales_order_service_setup`) — ฝ่ายขายที่แก้ใบนี้ได้
//   POST  งานบริการย้อนหลังของใบที่อนุมัติแล้ว: `submit` ยื่นตรวจ · `approve` / `reject` ผู้จัดการฝ่ายขาย
//
// 🔴 **ทุกด่านโหลดบริบทด้วย `withFgOptions: true`** — ข้อ fg_foreign ตรวจที่ JS เท่านั้น และ serviceSetupIssues
//    throw เมื่อไม่มีตัวเลือก FG (fail-closed) · มีจุดโหลดจุดเดียว (`contextOf`) ยามใน serviceSetupRoute.test.mjs
// 🔴 **สายธุรกิจตัดสินจากบริบท ไม่ใช่แถวที่ loadScoped คืน** — แถวนั้นพกแต่ดีล (ไม่มีโครงการ) ⇒ ใบที่โครงการเป็น
//    SERVICE แต่ดีลเป็น PRODUCT จะถูกอ่านว่า "ไม่ใช่ใบสายบริการ" · ด่านล็อกการแก้/ขั้นของงานจึงถาม `ctx.order`
// ⚠️ เวลาของใบ (`expectedUpdatedAt`) ส่งค่าดิบที่จอได้จาก GET เข้า RPC ตรง ๆ — ห้ามแปลงผ่าน Date (ไมโครวินาทีหาย
//    แล้วทุกการบันทึกตายด้วย workflow_stale · lib/sales/documentConcurrency.js)
// ⚠️ ไม่มีกระดิ่ง/แชต (มติกล่องกระดิ่ง) — ป้ายตัวเลขบนเมนูคือช่องทางแจ้งผู้จัดการ
// ⚠️ ลง audit **หลัง** RPC สำเร็จเท่านั้น (ของที่ไม่ได้เขียนต้องไม่มีประวัติ)
import { recordAudit } from '@/lib/audit';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { loadScoped } from '@/lib/scopedRow';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';
import { adminOverrideReasonError, normalizeAdminOverrideReason } from '@/lib/sales/salesOrderApprovalOverride';
import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';
import {
  SERVICE_SETUP_EDIT_TEXT, SERVICE_SETUP_LIMITS, SERVICE_SETUP_SQL_MESSAGES,
  serviceBackfillAwaitingReview, serviceSetupAuditSnapshot, serviceSetupEditError, serviceSetupFlow, serviceSetupIssues,
  serviceSetupSqlIssues, serviceSetupTotals, serviceSetupView, serviceSetupWarnings, validateServiceSetupPatch,
} from '@/lib/sales/serviceSetup';
import {
  approveServiceBackfill, loadServiceSetupContext, rejectServiceBackfill, saveServiceSetup, submitServiceBackfill,
} from '@/lib/sales/serviceSetupRepo';

const reply = (status, body) => ({ status, body });
const failWith = (status, error, extra = {}) => reply(status, { error, ...extra });

/* เพดานเดียวกับ CHECK ของฐาน (เหตุผลตีกลับ · Admin Override) — นับเป็นตัวอักษรแบบ length() ของ Postgres */
const REASON_MIN = 10;
const REASON_MAX = 500;
const charCount = (value) => [...String(value ?? '')].length;

/* โซนที่ก้อนบันทึกอ้างถึง — โหลดรวมกับบริบทให้ตัวตรวจเห็นไซต์ของมัน
   ⚠️ รายการที่เกิน 500 โซนไม่ต้องอ่าน (ตัวตรวจตีกลับ zones_too_many อยู่แล้ว) · และทั้งก้อนไม่เกิน
   EXTRA_ZONE_IDS_MAX โซนไม่ซ้ำ — ลูกค้าใหญ่สุดวันนี้มีโซนในทะเบียน 247 โซน ⇒ เกินหลักพัน = ก้อนที่ไม่ได้มาจากจอ
   (กันการยิงก้อนมหึมาให้ server ไล่อ่านทะเบียนเป็นพันรอบก่อนจะถึงตัวตรวจ) */
const EXTRA_ZONE_IDS_MAX = 5000;
function bodyZoneIds(body) {
  const ids = new Set();
  for (const entry of Array.isArray(body?.lines) ? body.lines : []) {
    const zones = entry?.zones;
    if (!Array.isArray(zones) || zones.length > SERVICE_SETUP_LIMITS.zonesPerLine) continue;
    for (const zone of zones) {
      const zoneId = String(zone?.zoneId ?? '').trim();
      if (zoneId) ids.add(zoneId);
    }
  }
  return [...ids];
}

/* loadScoped คืน Response เมื่อไม่ผ่าน (404/403/500) — แปลงเป็นรูป { status, body } ของไฟล์นี้ */
async function scopedOrder(supabase, user, id) {
  const { row, response } = await loadScoped(supabase, 'sales_orders', id, user, 'view');
  if (!response) return { order: row };
  let body;
  try { body = await response.json(); } catch { body = { error: 'ไม่พบใบสั่งขาย' }; }
  return { failure: reply(response.status, body) };
}

/* ⭐ จุดโหลดบริบทจุดเดียวของไฟล์ — อ่านพังที่ไหน (รวมตัวเลือก FG) = 500 ข้อความไทย จอขึ้นปุ่มลองโหลดอีกครั้ง ไม่เดา */
async function contextOf(supabase, order, extraZoneIds = []) {
  try {
    return { ctx: await loadServiceSetupContext(supabase, order, { extraZoneIds, withFgOptions: true }) };
  } catch (error) {
    return { error };
  }
}
const contextFailed = (error) => failWith(500, `โหลดงานบริการไม่สำเร็จ: ${error?.message || error || 'ไม่ทราบสาเหตุ'}`);

/* ผู้ขอแก้ใบนี้ได้ไหม — กติกาเดียวกับทุก action ของหน้าใบ (`canEditSalesPlanning && inSalesEditScope`) */
const canEditOrder = (user, order) => canEditSalesPlanning(user) && inSalesEditScope(user, order?.deal);

const orderLabel = (order) => order?.orderNumber || order?.id || '—';
const auditOrder = (audit, { user, order, before, after, summary, request }) => audit({
  user, action: 'update', entityType: 'sales_order', entityId: order.id, before, after, summary, request,
});

/* ผลผิดของ RPC → คำตอบ · ฐานบอกว่ายังไม่ครบ = แปลงรหัสใน DETAIL เป็นข้อที่ยังขาดพร้อมเลขรายการ (ของเปลี่ยนระหว่างทาง) */
function rpcFailure(error, ctx = null) {
  const extra = { code: error?.code ?? null };
  if (error?.code === 'sales_order_service_setup_incomplete') {
    extra.issues = serviceSetupSqlIssues(error.detailCodes, ctx || {});
  }
  return failWith(error?.status || 500, error?.message, extra);
}

/* ══ GET ══════════════════════════════════════════════════════════════════════════════════════════ */

/** ก้อนงานบริการของใบ (`serviceSetupView`) — ทุกคนที่อ่านใบได้ · canEdit มาจาก server เสมอ */
export async function serviceSetupGet({ supabase, user, id }) {
  if (!user) return failWith(401, 'unauthorized');
  if (!canViewSalesPlanning(user)) return failWith(403, 'forbidden');
  const { order, failure } = await scopedOrder(supabase, user, id);
  if (failure) return failure;
  const { ctx, error } = await contextOf(supabase, order);
  if (error) return contextFailed(error);
  try {
    return reply(200, serviceSetupView(ctx, { canEdit: canEditOrder(user, order), userId: user.id ?? null, role: user.role ?? null }));
  } catch (viewError) {
    return contextFailed(viewError);
  }
}

/* ══ PATCH — บันทึกงานบริการ ═══════════════════════════════════════════════════════════════════════ */

/**
 * body: `{ expectedUpdatedAt, period?: {from,to}|null, lines?: [{ lineId, kind?, serviceProductId?, rounds?, zones?: [...] }] }`
 * → 200 `{ updatedAt, issues, warnings, totals }` · 400 `{ error, fieldErrors }` · 403 · 409 (ล็อก/เก่า) · 500
 */
export async function serviceSetupPatch({ supabase, user, id, body, request = null, audit = recordAudit }) {
  if (!user) return failWith(401, 'unauthorized');
  if (!canViewSalesPlanning(user)) return failWith(403, 'forbidden');
  if (!canEditSalesPlanning(user)) return failWith(403, SERVICE_SETUP_EDIT_TEXT.noRight);
  const { order, failure } = await scopedOrder(supabase, user, id);
  if (failure) return failure;
  const canEdit = canEditOrder(user, order);
  if (!canEdit) return failWith(403, SERVICE_SETUP_EDIT_TEXT.noRight);

  const expected = resolveExpectedUpdatedAt(body);
  if (!expected.ok) return failWith(400, expected.error);
  const zoneIds = bodyZoneIds(body);
  if (zoneIds.length > EXTRA_ZONE_IDS_MAX) {
    const message = SERVICE_SETUP_SQL_MESSAGES.service_setup_payload_invalid.message;
    return failWith(400, message, { fieldErrors: [{ lineId: null, field: 'payload', message }] });
  }

  const loaded = await contextOf(supabase, order, zoneIds);
  if (loaded.error) return contextFailed(loaded.error);
  const before = loaded.ctx;
  const locked = serviceSetupEditError(before.order, { canEdit });
  if (locked) return failWith(409, locked);

  const { value, errors } = validateServiceSetupPatch(body, before);
  if (errors.length) return failWith(400, 'บันทึกงานบริการไม่ได้ — ตรวจช่องที่ขึ้นสีแดง', { fieldErrors: errors });

  const { data, error } = await saveServiceSetup(supabase, {
    orderId: order.id, expectedUpdatedAt: expected.value, payload: value, user,
  });
  if (error) return rpcFailure(error, before);

  /* ผลหลังบันทึก — อ่านใบ + บริบทใหม่ (ช่วงบริการ/โซนที่ฐานเขียนจริง) · อ่านไม่ขึ้น = บันทึกสำเร็จแล้ว ห้ามตอบ 500
     (คนจะกดซ้ำ) ⇒ ตอบ 200 พร้อมคำเตือน และให้จอโหลดใหม่เอง */
  let after = null;
  const fresh = await scopedOrder(supabase, user, id);
  if (!fresh.failure) {
    const reloaded = await contextOf(supabase, fresh.order);
    if (!reloaded.error) after = reloaded.ctx;
  }
  const lineCount = Array.isArray(value?.lines) ? value.lines.length : 0;
  const zoneCount = Number.isFinite(Number(data?.zones)) ? Number(data.zones) : (after ? serviceSetupTotals(after).zones : 0);
  await auditOrder(audit, {
    user, order, request,
    before: { serviceSetup: serviceSetupAuditSnapshot(before) },
    after: after ? { serviceSetup: serviceSetupAuditSnapshot(after) } : { serviceSetup: null, payload: value },
    summary: `บันทึกงานบริการ ${orderLabel(order)} — ${lineCount} รายการ · ${zoneCount} โซน`,
  });

  const updatedAt = data?.updatedAt ?? after?.order?.updatedAt ?? null;
  if (!after) {
    return reply(200, {
      updatedAt, issues: null, warnings: null, totals: null,
      warning: 'บันทึกงานบริการแล้ว แต่โหลดผลตรวจล่าสุดไม่สำเร็จ — โหลดหน้าใหม่',
    });
  }
  return reply(200, {
    updatedAt,
    issues: serviceSetupIssues(after),
    warnings: serviceSetupWarnings(after),
    totals: serviceSetupTotals(after),
  });
}

/* ══ POST — งานบริการย้อนหลัง (ใบที่อนุมัติแล้ว ยังไม่เปิดงานให้ TS) ════════════════════════════════════════ */

async function submitBackfill({ supabase, user, order, canEdit, body, request, audit }) {
  if (!canEdit) return failWith(403, SERVICE_SETUP_EDIT_TEXT.noRight);
  const expected = resolveExpectedUpdatedAt(body);
  if (!expected.ok) return failWith(400, expected.error);
  const { ctx, error: loadError } = await contextOf(supabase, order);
  if (loadError) return contextFailed(loadError);

  /* ยื่นได้เมื่อขั้นเป็น "ตั้งย้อนหลัง" (D25: มีสิ่งที่ต้องตั้ง) และยังไม่ยื่น/ถูกตีกลับแล้ว */
  const state = ctx.order.serviceSetupState ?? null;
  if (serviceSetupFlow(ctx.order, ctx) !== 'backfill' || (state !== null && state !== 'rejected')) {
    return failWith(409, serviceSetupEditError(ctx.order, { canEdit })
      || SERVICE_SETUP_SQL_MESSAGES.service_setup_state_invalid.message);
  }
  const issues = serviceSetupIssues(ctx);
  if (issues.length) {
    return failWith(400, `ยื่นตรวจไม่ได้ — ยังขาด ${issues.length} ข้อ`, { issues, warnings: serviceSetupWarnings(ctx) });
  }

  const { data, error } = await submitServiceBackfill(supabase, { orderId: order.id, expectedUpdatedAt: expected.value, user });
  if (error) return rpcFailure(error, ctx);

  const totals = serviceSetupTotals(ctx);
  await auditOrder(audit, {
    user, order, request,
    before: { serviceSetupState: state, serviceSetup: serviceSetupAuditSnapshot(ctx) },
    after: { serviceSetupState: 'submitted', serviceSetupSubmittedAt: data?.serviceSetupSubmittedAt ?? null },
    summary: `ยื่นตรวจงานบริการ (ใบเดิม) ${orderLabel(order)} — ${totals.zones} โซนใน ${totals.sites} ไซต์`,
  });
  return reply(200, { order: data ?? null });
}

async function approveBackfill({ supabase, user, order, canEdit, body, request, audit }) {
  if (!isSalesOrderReviewer(user.role) || !canEdit) {
    return failWith(403, SERVICE_SETUP_SQL_MESSAGES.service_setup_review_forbidden.message);
  }
  /* D28: ค่า 'submitted' ที่ค้างบนใบที่ย้อนการอนุมัติ/ยกเลิก/ถูก Rev. ทับ ไม่มีผล — ถามตัวตัดสินตัวเดียว */
  if (!serviceBackfillAwaitingReview(order)) {
    return failWith(409, SERVICE_SETUP_SQL_MESSAGES.service_setup_review_state_invalid.message);
  }
  /* D12: ยื่นเองอนุมัติเองไม่ได้ · Admin ทำได้เมื่อมีเหตุผล 10–500 ตัวอักษร (ฐานตรวจซ้ำ · เหตุผลลง audit ไม่มีคอลัมน์)
     ⚠️ adminOverrideReasonError ของใบปกติไม่บังคับขั้นต่ำ (เหตุผลเป็นทางเลือกที่นั่น) ⇒ ขั้นต่ำตรวจเองที่นี่ */
  let overrideReason = null;
  if (order.serviceSetupSubmittedById && order.serviceSetupSubmittedById === user.id) {
    if (user.role !== 'admin') return failWith(403, SERVICE_SETUP_SQL_MESSAGES.service_setup_separation_required.message);
    const reason = normalizeAdminOverrideReason(body?.overrideReason);
    if (charCount(reason) < REASON_MIN || charCount(reason) > REASON_MAX || adminOverrideReasonError(reason)) {
      return failWith(400, SERVICE_SETUP_SQL_MESSAGES.service_setup_override_reason_required.message);
    }
    overrideReason = reason;
  }
  const expected = resolveExpectedUpdatedAt(body);
  if (!expected.ok) return failWith(400, expected.error);
  const { ctx, error: loadError } = await contextOf(supabase, order);
  if (loadError) return contextFailed(loadError);
  /* สายของโครงการ/ดีลแก้ได้ระหว่างรอตรวจ — ไม่ใช่ขั้นตั้งย้อนหลังแล้ว = อนุมัติไม่ได้ (RPC ก็ปฏิเสธ ไม่เปิด 0 โซนแล้วเรียกว่าอนุมัติ)
     ⭐ บอกทางออกแทนข้อความสถานะดิบ — ตีกลับไม่ถามสาย จึงล้างคำขอตรวจได้เสมอ */
  if (serviceSetupFlow(ctx.order, ctx) !== 'backfill') return failWith(409, SERVICE_SETUP_EDIT_TEXT.reviewNotService);

  /* ตรวจซ้ำตอนอนุมัติ — ของอาจเปลี่ยนหลังยื่น (สินค้าถูกปิด · โซนถูกปิด · งวดถูกแก้) */
  const issues = serviceSetupIssues(ctx);
  if (issues.length) {
    return failWith(409, `อนุมัติไม่ได้ — งานบริการยังขาด ${issues.length} ข้อ · ตีกลับให้ฝ่ายขายแก้`,
      { issues, warnings: serviceSetupWarnings(ctx) });
  }

  const { data, error } = await approveServiceBackfill(supabase, {
    orderId: order.id, expectedUpdatedAt: expected.value, overrideReason, user,
  });
  if (error) return rpcFailure(error, ctx);

  const termsOpened = Number(data?.termsOpened) || 0;
  await auditOrder(audit, {
    user, order, request,
    before: { serviceSetupState: 'submitted', serviceTermsOpenedAt: null, serviceSetup: serviceSetupAuditSnapshot(ctx) },
    after: {
      serviceSetupState: null,
      serviceSetupApprovedAt: data?.order?.serviceSetupApprovedAt ?? null,
      serviceTermsOpenedAt: data?.order?.serviceTermsOpenedAt ?? null,
      termsOpened,
      overrideReason,
    },
    summary: `อนุมัติงานบริการ (ใบเดิม) ${orderLabel(order)} — เปิดรอบขาย ${termsOpened} โซนให้ TS`
      + (overrideReason ? ` · Admin Override: ${overrideReason}` : ''),
  });
  return reply(200, { order: data?.order ?? null, termsOpened });
}

async function rejectBackfill({ supabase, user, order, canEdit, body, request, audit }) {
  if (!isSalesOrderReviewer(user.role) || !canEdit) {
    return failWith(403, SERVICE_SETUP_SQL_MESSAGES.service_setup_review_forbidden.message);
  }
  if (!serviceBackfillAwaitingReview(order)) {
    return failWith(409, SERVICE_SETUP_SQL_MESSAGES.service_setup_review_state_invalid.message);
  }
  /* ตัดช่องว่างหัวท้ายก่อนนับ (CHECK ของฐานนับหลัง btrim) — ส่งค่าที่ตัดแล้วเข้า RPC */
  const reason = String(body?.reason ?? '').trim();
  if (charCount(reason) < REASON_MIN || charCount(reason) > REASON_MAX) {
    return failWith(400, SERVICE_SETUP_SQL_MESSAGES.workflow_reason_invalid.message);
  }
  const expected = resolveExpectedUpdatedAt(body);
  if (!expected.ok) return failWith(400, expected.error);

  const { data, error } = await rejectServiceBackfill(supabase, {
    orderId: order.id, expectedUpdatedAt: expected.value, reason, user,
  });
  if (error) return rpcFailure(error);

  await auditOrder(audit, {
    user, order, request,
    before: { serviceSetupState: 'submitted' },
    after: { serviceSetupState: 'rejected', serviceSetupRejectedReason: reason },
    summary: `ตีกลับงานบริการ (ใบเดิม) ${orderLabel(order)}: ${reason}`,
  });
  return reply(200, { order: data ?? null });
}

const BACKFILL_ACTIONS = { submit: submitBackfill, approve: approveBackfill, reject: rejectBackfill };

/**
 * body: `{ action: 'submit' | 'approve' | 'reject', expectedUpdatedAt, reason?, overrideReason? }`
 * → submit 200 `{ order }` · approve 200 `{ order, termsOpened }` · reject 200 `{ order }`
 */
export async function serviceSetupPost({ supabase, user, id, body, request = null, audit = recordAudit }) {
  if (!user) return failWith(401, 'unauthorized');
  if (!canViewSalesPlanning(user)) return failWith(403, 'forbidden');
  const action = String(body?.action ?? '');
  const handler = Object.prototype.hasOwnProperty.call(BACKFILL_ACTIONS, action) ? BACKFILL_ACTIONS[action] : null;
  if (!handler) return failWith(400, 'ไม่รู้จักคำสั่งของงานบริการ');
  const { order, failure } = await scopedOrder(supabase, user, id);
  if (failure) return failure;
  return handler({ supabase, user, order, canEdit: canEditOrder(user, order), body, request, audit });
}
