// ── ตรรกะของ `…/sales-orders/[id]/service-setup` (mig 0392 · PR-A · แผน §2.4) — ฝั่ง server เท่านั้น ─────────
//
// ⭐ route เป็นเปลือกบาง ๆ (withUser + ด่านอ่าน) แล้วส่งต่อมาที่นี่ · ทุกฟังก์ชันคืน `{ status, body }`
//   แบบเดียวกับ historicalOrderCommit.js ⇒ ทดสอบด้วย supabase ปลอมได้ (route.js import ใต้ node ไม่ได้ เพราะ
//   `@/lib/http` ลาก `next/headers` มาด้วย)
//   GET   ก้อนของตาราง/โมดัล/แถบ (`serviceSetupView`) — ทุกคนที่อ่านใบได้
//         · mig 0404: ก้อนพก `skip` (ปุ่ม 'ยื่นโดยยังไม่ตั้งงานบริการ' — คิดจาก canEdit ของ server) และ `deferred` (ใบที่ผู้ยื่นเลือกข้าม)
//           การยื่นแบบข้ามเองอยู่ที่ action 'submit' ของ route ใบ (`deferServiceSetup: true`) ไม่ใช่เส้นนี้ · หลังอนุมัติใบเดินเส้น POST เดิมข้างล่าง
//   PATCH บันทึกงานบริการ (RPC `save_sales_order_service_setup`) — ฝ่ายขายที่แก้ใบนี้ได้
//   POST  งานบริการย้อนหลังของใบที่อนุมัติแล้ว: `submit` ยื่นตรวจ · `approve` / `reject` ผู้จัดการฝ่ายขาย
//         · `reopen` เปิดแก้งานบริการหลังอนุมัติ (mig 0396 — ถอนรอบขายจาก TS แล้วกลับเข้าเส้นตั้งย้อนหลัง)
//
// 🔴 **ทุกด่านโหลดบริบทด้วย `withFgOptions: true`** — ข้อ fg_foreign ตรวจที่ JS เท่านั้น และ serviceSetupIssues
//    throw เมื่อไม่มีตัวเลือก FG (fail-closed) · มีจุดโหลดจุดเดียว (`contextOf`) ยามใน serviceSetupRoute.test.mjs
// 🔴 **สายธุรกิจตัดสินจากบริบท ไม่ใช่แถวที่ loadScoped คืน** — แถวนั้นพกแต่ดีล (ไม่มีโครงการ) ⇒ ใบที่โครงการเป็น
//    SERVICE แต่ดีลเป็น PRODUCT จะถูกอ่านว่า "ไม่ใช่ใบสายบริการ" · ด่านล็อกการแก้/ขั้นของงานจึงถาม `ctx.order`
// ⚠️ เวลาของใบ (`expectedUpdatedAt`) ส่งค่าดิบที่จอได้จาก GET เข้า RPC ตรง ๆ — ห้ามแปลงผ่าน Date (ไมโครวินาทีหาย
//    แล้วทุกการบันทึกตายด้วย workflow_stale · lib/sales/documentConcurrency.js)
// ⚠️ ไม่มีกระดิ่ง/แชต (มติกล่องกระดิ่ง) — ป้ายตัวเลขบนเมนูคือช่องทางแจ้งผู้จัดการ
// ⚠️ ลง audit **หลัง** RPC สำเร็จเท่านั้น (ของที่ไม่ได้เขียนต้องไม่มีประวัติ) · ยกเว้น `reopen` ที่ฐานลงเอง (ดู reopenSetup)
import { recordAudit } from '@/lib/audit';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope } from '@/lib/salesPlanning';
import { loadScoped } from '@/lib/scopedRow';
import { resolveExpectedUpdatedAt } from '@/lib/sales/documentConcurrency';
import { adminOverrideReasonError, normalizeAdminOverrideReason } from '@/lib/sales/salesOrderApprovalOverride';
import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';
import {
  SERVICE_DEFERRED_TEXT, SERVICE_REOPENED_TEXT, SERVICE_SETUP_EDIT_TEXT, SERVICE_SETUP_LIMITS, SERVICE_SETUP_SQL_MESSAGES,
  serviceBackfillAwaitingReview, serviceReopenAvailable, serviceReopenBlockedText, serviceReopenBlockers,
  serviceReopenMoneyCodes, serviceReopenStateError, serviceSetupAuditSnapshot, serviceSetupDeferred, serviceSetupEditError, serviceSetupFlow,
  serviceSetupIssues, serviceSetupReopened, serviceSetupSqlIssues, serviceSetupTotals, serviceSetupView, serviceSetupWarnings,
  validateServiceSetupPatch,
} from '@/lib/sales/serviceSetup';
import {
  approveServiceBackfill, loadServiceReopenBlockers, loadServiceSetupContext, rejectServiceBackfill, reopenServiceSetup,
  saveServiceSetup, submitServiceBackfill,
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
/* วงเล็บในสรุป audit ของเส้นย้อนหลัง — ใบที่เปิดแก้หลังอนุมัติ (0396) ไม่ใช่ "ใบเดิม" (ภาคผนวก A.4)
   · ใบที่ผู้ยื่นเลือกข้ามการตั้งงานบริการตอนยื่น (0404) ก็ไม่ใช่ — "(ข้ามตอนยื่น)" · ตัวตัดสินสองตัวไม่ตอบพร้อมกัน (เหตุการณ์ที่เกิดทีหลังชนะ) */
const backfillTag = (order) => (serviceSetupReopened(order) ? SERVICE_REOPENED_TEXT.auditTag
  : serviceSetupDeferred(order) ? SERVICE_DEFERRED_TEXT.auditTag : '(ใบเดิม)');
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

/* ── แท็บที่เปิดค้างข้ามการสลับโหมดช่วงบริการ (mig 0400 · ตรวจทาน ui-stale-mode-dead-end) ─────────────────────────────
   ตัวตรวจก้อนบันทึกวิ่ง **ก่อน** RPC (ซึ่งเป็นคนเทียบ `expectedUpdatedAt`) และตรวจกับโหมดสดของฐาน ⇒ แท็บที่ยังเห็นโหมดเก่า
   (อีกหน้าต่างสลับแล้วบันทึก) ได้ 400 "ใบนี้ใช้ช่วงเดียวทั้งใบ — สลับเป็นแยกรายรายการก่อน…" ทั้งที่สวิตช์บนจอของตัวเองอยู่ที่แยกรายรายการ
   ไม่มีการโหลดใหม่ และกดซ้ำก็ตายแบบเดิมจนกด F5 · ทางที่ถูกคือทางเดียวกับ `workflow_stale` ของฐาน (409 → จอโหลดใหม่ + บอก)
   ⭐ เข้าทางนี้เมื่อ **ทั้งสองอย่าง** จริง: (1) ผลตรวจมีข้อ "โหมดไม่ตรง" (ช่วงของใบในโหมดแยกรายรายการ · ช่วงของรายการในโหมดทั้งใบ)
      (2) เวลาของใบในคำขอไม่เท่าเวลาของใบที่เพิ่งอ่าน (เทียบ **ตัวอักษร** — ทั้งคู่เป็นค่าดิบจาก PostgREST · ห้ามผ่าน Date)
      ก้อนที่เวลาตรง (จอรุ่นเก่า/ยิงตรง) ยังได้ 400 รายช่องเหมือนเดิม · ถ้ารูปตัวอักษรต่างกันทั้งที่ใบไม่เปลี่ยน ผลคือ 409 + โหลดใหม่
      เฉพาะก้อนที่จอรุ่นนี้ไม่มีวันส่ง (จอส่ง `period`/`lines[].period` ตามโหมดที่ตัวเองเห็นเท่านั้น) */
const MODE_CONFLICT_MESSAGES = new Set([
  SERVICE_SETUP_SQL_MESSAGES.service_setup_period_derived.message,
  SERVICE_SETUP_SQL_MESSAGES.service_setup_line_period_mode.message,
]);
function staleModeConflict(errors, expectedUpdatedAt, order) {
  const current = order?.updatedAt;
  if (typeof current !== 'string' || !current || expectedUpdatedAt === current) return false;
  return errors.some((item) => item?.field === 'period' && MODE_CONFLICT_MESSAGES.has(item?.message));
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
  const canEdit = canEditOrder(user, order);
  /* ปุ่ม 'แก้งานบริการ' (0396) — ถามฐานว่า TS เริ่มงานของใบนี้หรือยัง **เฉพาะตอนปุ่มโชว์** (มีสิทธิ์ · ใบประทับ · มีอะไรให้แก้)
     ⇒ ไม่ยิงต่อทุกใบ/ทุกคนที่แค่อ่าน · อ่านพัง = 'unread' (ปุ่มบล็อกพร้อมเหตุ) แต่ตารางยังขึ้น — ไม่ตอบ 500 ทั้งก้อน
     รหัสฝั่ง JS (`money_fn`) serviceSetupView ต่อท้ายเอง */
  let reopenBlockers = null;
  try {
    if (serviceReopenAvailable(ctx.order, ctx, { canEdit })) {
      const { codes, error: blockersError } = await loadServiceReopenBlockers(supabase, order.id);
      reopenBlockers = blockersError ? ['unread'] : codes;
    }
    return reply(200, serviceSetupView(ctx, { canEdit, userId: user.id ?? null, role: user.role ?? null, reopenBlockers }));
  } catch (viewError) {
    return contextFailed(viewError);
  }
}

/* ══ PATCH — บันทึกงานบริการ ═══════════════════════════════════════════════════════════════════════ */

/**
 * body: `{ expectedUpdatedAt, periodMode?: 'whole'|'line', period?: {from,to}|null,
 *          lines?: [{ lineId, kind?, serviceProductId?, rounds?, zones?: [...], period?: {from,to}|null }] }`
 *   ⭐ mig 0400: `periodMode` (ไม่ส่ง = ไม่เปลี่ยน) · `period` ของใบส่งได้เฉพาะโหมดผลลัพธ์ 'whole' · `lines[].period` = ช่วงของรายการ
 *     (โหมด 'line' · รายการแพ็คเกจ · null = ล้าง) — กติกาทั้งหมดอยู่ที่ `validateServiceSetupPatch` (คู่กับ RPC รุ่น 0400/F1)
 * → 200 `{ updatedAt, issues, warnings, totals }` · 400 `{ error, fieldErrors }` · 403 · 409 (ล็อก/เก่า) · 500
 *   · 409 `{ error, code: 'workflow_stale' }` มาได้สองทาง: RPC (เวลาของใบไม่ตรง) และตัวตรวจที่นี่เมื่อแท็บค้างข้ามการสลับโหมด (`staleModeConflict`)
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
  if (errors.length) {
    if (staleModeConflict(errors, expected.value, before.order)) {
      return failWith(409, SERVICE_SETUP_SQL_MESSAGES.workflow_stale.message, { code: 'workflow_stale' });
    }
    return failWith(400, 'บันทึกงานบริการไม่ได้ — ตรวจช่องที่ขึ้นสีแดง', { fieldErrors: errors });
  }

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
    summary: `ยื่นตรวจงานบริการ ${backfillTag(ctx.order)} ${orderLabel(order)} — ${totals.zones} โซนใน ${totals.sites} ไซต์`,
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
    summary: `อนุมัติงานบริการ ${backfillTag(ctx.order)} ${orderLabel(order)} — เปิดรอบขาย ${termsOpened} โซนให้ TS`
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
    summary: `ตีกลับงานบริการ ${backfillTag(order)} ${orderLabel(order)}: ${reason}`,
  });
  return reply(200, { order: data ?? null });
}

/* ══ POST reopen — เปิดแก้งานบริการหลังอนุมัติ (mig 0396 · แผน IMPL_PLAN_REOPEN §4) ══════════════════════════════════ */

/* 409 ของการเปิดแก้ที่ถูกบล็อก — ข้อความเจาะจงจากรหัส + รายการรหัสให้จอ (ข้อความรวมว่าง = ข้อความสำรองของฐาน) */
const reopenBlocked = (codes, fallback = SERVICE_SETUP_SQL_MESSAGES.service_setup_reopen_blocked.message) => failWith(
  409, serviceReopenBlockedText(codes) || fallback, { code: 'service_setup_reopen_blocked', blockers: serviceReopenBlockers(codes) },
);

/**
 * body: `{ action: 'reopen', expectedUpdatedAt, reason }` → 200 `{ order, termsRemoved }`
 * · 400 เหตุผล/เวลาของใบ · 403 ไม่มีสิทธิ์ · 409 ขั้นของใบ / เก่า / ถูกบล็อก `{ error, code, blockers: [{ code, count, text }] }` / ระบบยุ่ง · 500
 * ลำดับ: สิทธิ์ → เหตุผล → เวลาของใบ → บริบทสด → ขั้นของใบ (กติกาเดียวกับการโชว์ปุ่ม) → ด่านเงินของบัญชี (JS เท่านั้น) → RPC
 */
async function reopenSetup({ supabase, order, canEdit, body, user }) {
  if (!canEdit) return failWith(403, SERVICE_SETUP_EDIT_TEXT.noRight);
  /* ตัดช่องว่างหัวท้ายก่อนนับ (ฐานนับหลัง btrim · CHECK ของตารางก็เช่นกัน) — ส่งค่าที่ตัดแล้วเข้า RPC */
  const reason = String(body?.reason ?? '').trim();
  if (charCount(reason) < REASON_MIN || charCount(reason) > REASON_MAX) {
    return failWith(400, SERVICE_SETUP_SQL_MESSAGES.workflow_reason_invalid.message);
  }
  const expected = resolveExpectedUpdatedAt(body);
  if (!expected.ok) return failWith(400, expected.error);
  const { ctx, error: loadError } = await contextOf(supabase, order);
  if (loadError) return contextFailed(loadError);

  const stateError = serviceReopenStateError(ctx.order, ctx, { canEdit });
  if (stateError) return failWith(409, stateError);
  /* R4 (g): ข้อด่านเงินที่ฝ่ายบัญชีต้องแก้ — ยื่นตรวจกลับจะไม่ผ่าน และฝ่ายขายแก้เองไม่ได้ ⇒ เปิดแก้ตอนนี้ = ใบค้างไม่มีงานให้ TS
     ฐานมองไม่เห็นด่านงวด (อยู่ที่ serviceSetupIssues) ⇒ ตรวจที่นี่ก่อนยิง RPC เสมอ · บัญชีรับรองงวดระหว่างตรวจกับกด = แค่ยื่นกลับช้าลง */
  const moneyCodes = serviceReopenMoneyCodes(ctx);
  if (moneyCodes.length) return reopenBlocked(moneyCodes);

  const { data, error } = await reopenServiceSetup(supabase, {
    orderId: order.id, expectedUpdatedAt: expected.value, reason, user,
  });
  if (error) {
    if (error.code === 'service_setup_reopen_blocked') return reopenBlocked(error.detailCodes, error.message);
    return rpcFailure(error, ctx);
  }
  /* 🔴 **ไม่ลง audit ที่นี่** (ต่างจาก action อื่นของไฟล์นี้โดยตั้งใจ — R12 ของแผน): RPC ลง audit เองในทรานแซกชันเดียวกับที่ถอน
     รอบขาย — หนึ่งแถวต่อ term ที่ลบ (`before` = ทั้งแถว) + หนึ่งแถวของใบ (เหตุผล · ก่อนแก้ = ทุกช่องที่ถูกล้างรวมหลักฐานผู้อนุมัติเดิม)
     ⇒ ประวัติไม่มีทางขาดแม้ route ตายหลัง commit และครอบกรณีคนรัน RPC จาก SQL Editor ด้วย · ลงซ้ำที่นี่ = แถวใบซ้อนสองแถว */
  return reply(200, { order: data?.order ?? null, termsRemoved: Number(data?.termsRemoved) || 0 });
}

/* ทุก action ของ POST — ย้อนหลัง (submit/approve/reject) + เปิดแก้หลังอนุมัติ (reopen) */
const SERVICE_SETUP_ACTIONS = { submit: submitBackfill, approve: approveBackfill, reject: rejectBackfill, reopen: reopenSetup };

/**
 * body: `{ action: 'submit' | 'approve' | 'reject' | 'reopen', expectedUpdatedAt, reason?, overrideReason? }`
 * → submit 200 `{ order }` · approve 200 `{ order, termsOpened }` · reject 200 `{ order }` · reopen 200 `{ order, termsRemoved }`
 */
export async function serviceSetupPost({ supabase, user, id, body, request = null, audit = recordAudit }) {
  if (!user) return failWith(401, 'unauthorized');
  if (!canViewSalesPlanning(user)) return failWith(403, 'forbidden');
  const action = String(body?.action ?? '');
  const handler = Object.prototype.hasOwnProperty.call(SERVICE_SETUP_ACTIONS, action) ? SERVICE_SETUP_ACTIONS[action] : null;
  if (!handler) return failWith(400, 'ไม่รู้จักคำสั่งของงานบริการ');
  const { order, failure } = await scopedOrder(supabase, user, id);
  if (failure) return failure;
  return handler({ supabase, user, order, canEdit: canEditOrder(user, order), body, request, audit });
}
