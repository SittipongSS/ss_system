// ── API คำตอบของลูกค้าต่อนัดติดตั้ง (ขั้นเข้าติดตั้ง PR-4 · ม็อก A5 · mig 0425) ──────────────────────────────
//
//   POST /api/sales-planning/sales-orders/[id]/install/customer
//     body `{ siteId, visitId, action: 'confirm'|'reschedule', contactName, contactPhone?, note?,
//             requestedDate?, requestedStartTime?, requestedEndTime?, changeReason? }`
//     → 200 `{ visit, scheduled, blocker }` (confirm) · `{ request }` (reschedule) · 400 ค่าผิด · 403 · 409 นัด/คำขอเพิ่งเปลี่ยน
//
// ⭐ confirm: ประทับ `customerConfirmed*` แล้วถามด่านนัดตัวเดียวกับหน้าจัดคิว (`evaluateVisitGate` + `loadVisitGateContext`)
//    ด้วยค่าหลังประทับ — ผ่าน ⇒ เลื่อนร่างเป็น `scheduled` ใน **คำสั่งเขียนเดียว** (+ ร่องรอยปล่อยเข้าคิว `queued*`)
//    · ไม่ผ่าน ⇒ ประทับอย่างเดียว นัดคงเป็นร่าง และตอบเหตุ (TS ปล่อยเองที่หน้าจัดคิวเมื่อแก้แล้ว)
//    · ไม่มีทางข้ามด่านที่นี่ — การข้ามด่านเป็นสิทธิ์หัวหน้า TS ที่หน้าจัดคิว (กติกาเดิม)
// ⭐ reschedule: วันใหม่ + เหตุ ลงคำขอ (`requestedAt` เดิน ⇒ ขั้นกลับไปรอ TS) · ล้างร่องรอยคอนเฟิร์มบนร่างของคำขอ
//    (TS ยืนยันวันใหม่แล้ว ฝ่ายขายต้องคอนเฟิร์มลูกค้าอีกรอบ — N4 "ทุกครั้ง") · นัดร่างคงอยู่ โซน/เครื่องไม่หาย
// ⭐ ตรรกะอยู่ที่นี่ (route เป็นตัวส่งต่อ) · ตัวโหลด/audit/กระดิ่ง/เธรด ส่งเข้ามาได้ ⇒ เทสต์ไม่แตะฐานจริง
// ⚠️ ทุกการเขียนเทียบสถานะเดิม (CAS) — สองหน้าต่างกดพร้อมกันต้องได้ 409 ไม่ใช่เขียนทับเงียบ
import { recordAudit } from '@/lib/audit';
import { businessDate } from '@/lib/businessDate';
import { appendUpdate } from '@/lib/master/updates';
import { gateContextForSite, loadVisitGateContext } from './gateContext';
import { INSTALL_CUSTOMER_TEXT, installCustomerInput, installCustomerThreadText, installCustomerVisitError } from './installCustomer';
import { notifyInstallCustomerConfirmed, notifyInstallRequested } from './installNotify';
import { DEFAULT_DEPS, prepareWrite } from './installRequestRoute';
import { evaluateVisitGate, gateBlocker, gatePassed } from './visitGate';

const reply = (status, body) => ({ status, body });
const failWith = (status, error, extra = {}) => reply(status, { error, ...extra });
const text = (value) => String(value ?? '').trim();
const CONFLICT = new Set([
  INSTALL_CUSTOMER_TEXT.visitMissing, INSTALL_CUSTOMER_TEXT.notDraft, INSTALL_CUSTOMER_TEXT.notTsConfirmed,
  INSTALL_CUSTOMER_TEXT.reasked, INSTALL_CUSTOMER_TEXT.alreadyConfirmed,
]);

/* ⭐ ด่านของนัด: แถวเต็มของนัด + บริบทด่านของไซต์ (ตัวโหลดเดียวกับหน้าจัดคิว · ห้ามประกอบเอง) */
async function loadVisitForGate(supabase, visitId) {
  const { data: visit, error: visitError } = await supabase.from('service_visits').select('*').eq('id', visitId).maybeSingle();
  if (visitError) throw new Error(`อ่านนัดติดตั้งไม่สำเร็จ: ${visitError.message}`);
  if (!visit) return { visit: null };
  /* ⚠️ อ่านไซต์ตรงนี้ ไม่ import `sitesRepo.findSite` — ไฟล์นั้นลาก `@/lib/http` (next/headers) เข้ามา ⇒ เทสต์โหลดไฟล์นี้ไม่ได้ */
  const [ctx, siteRes] = await Promise.all([
    loadVisitGateContext(supabase, [visit.siteId]),
    supabase.from('service_sites').select('*').eq('id', visit.siteId).maybeSingle(),
  ]);
  if (siteRes.error) throw new Error(`อ่านไซต์ไม่สำเร็จ: ${siteRes.error.message}`);
  return { visit, ctx, site: siteRes.data || null };
}

export const CUSTOMER_DEPS = Object.freeze({ ...DEFAULT_DEPS, gate: loadVisitForGate });

export async function installCustomerPost({
  supabase, user, id, body, enabled = false, request = null, audit = recordAudit, thread = appendUpdate,
  notifyConfirmed = notifyInstallCustomerConfirmed, notifyRescheduled = notifyInstallRequested,
  now = () => new Date().toISOString(), todayIso = businessDate(), deps = CUSTOMER_DEPS,
}) {
  const siteId = text(body?.siteId);
  const visitId = text(body?.visitId);
  const action = text(body?.action);
  const prep = await prepareWrite({ supabase, user, id, enabled, siteId, deps });
  if (prep.failure) return prep.failure;
  const installRequest = prep.site.request;
  const visit = (prep.state.visits || []).find((v) => v.id === visitId) || null;
  const visitError = installCustomerVisitError(visit, installRequest, action);
  if (visitError) return failWith(CONFLICT.has(visitError) ? 409 : 400, visitError);
  const { value, error } = installCustomerInput(body || {}, { visit, todayIso });
  if (error) return failWith(400, error);

  const stamp = now();
  const actor = { id: user.id ?? null, name: user.name || user.email || null };
  const site = { code: prep.site.siteCode, name: prep.site.siteName };
  return value.action === 'confirm'
    ? confirmCustomer({ supabase, user, prep, visit, value, stamp, actor, site, request, audit, thread, notify: notifyConfirmed, deps })
    : rescheduleRequest({ supabase, user, prep, installRequest, visit, value, stamp, actor, site, request, audit, thread, notify: notifyRescheduled });
}

async function confirmCustomer({ supabase, user, prep, visit, value, stamp, actor, site, request, audit, thread, notify, deps }) {
  let gateState;
  try { gateState = await deps.gate(supabase, visit.id); }
  catch (error) { return failWith(500, error?.message || 'โหลดด่านของนัดไม่สำเร็จ'); }
  if (!gateState?.visit) return failWith(409, INSTALL_CUSTOMER_TEXT.visitMissing);

  const trail = { customerConfirmedAt: stamp, customerConfirmedById: actor.id ? String(actor.id) : null, customerConfirmedByName: actor.name };
  const items = evaluateVisitGate(
    { ...gateState.visit, ...trail },
    gateContextForSite(gateState.ctx, gateState.visit.siteId, { site: gateState.site }),
  );
  const scheduled = gatePassed(items);
  const blocker = scheduled ? '' : gateBlocker(items);
  const patch = {
    ...trail,
    updatedAt: stamp,
    ...(scheduled ? { status: 'scheduled', queuedById: trail.customerConfirmedById, queuedByName: actor.name, queuedAt: stamp } : {}),
  };
  /* CAS: ยังเป็นร่าง · TS ยังไม่ยืนยันใหม่ระหว่างนั้น · ยังไม่มีใครคอนเฟิร์ม */
  const { data: saved, error: writeError } = await supabase.from('service_visits').update(patch)
    .eq('id', visit.id).eq('status', 'draft').eq('tsConfirmedAt', visit.tsConfirmedAt).is('customerConfirmedAt', null)
    .select('*').maybeSingle();
  if (writeError) return failWith(500, `บันทึกคำตอบของลูกค้าไม่สำเร็จ: ${writeError.message}`);
  if (!saved) return failWith(409, 'นัดนี้เพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่');

  await thread(supabase, {
    entityType: 'service_visit', entityId: saved.id, kind: scheduled ? 'queue' : 'customer',
    body: installCustomerThreadText(value, { scheduled, blocker }), user,
  });
  await audit({
    user, action: 'update', entityType: 'service_visit', entityId: saved.id, before: visit, after: saved,
    summary: `คอนเฟิร์มลูกค้า ${saved.code || saved.id} · ${saved.scheduledDate}`
      + `${scheduled ? ' · ขึ้นตารางช่าง' : ' · ยังเป็นร่าง (ติดด่าน)'} · ${prep.order.orderNumber || prep.order.id}`,
    request,
  });
  notify(supabase, { order: prep.order, visit: saved, site, actor, scheduled, blocker });
  return reply(200, { visit: saved, scheduled, blocker: blocker || null });
}

async function rescheduleRequest({ supabase, user, prep, installRequest, visit, value, stamp, actor, site, request, audit, thread, notify }) {
  const fields = {
    requestedDate: value.requestedDate,
    requestedStartTime: value.requestedStartTime,
    requestedEndTime: value.requestedEndTime,
    changeReason: value.changeReason,
    requestedAt: stamp,
    requestedById: actor.id,
    requestedByName: actor.name,
    updatedAt: stamp,
  };
  const { data: saved, error: writeError } = await supabase.from('service_install_requests')
    .update(fields).eq('id', installRequest.id).eq('updatedAt', installRequest.updatedAt).select('*').maybeSingle();
  if (writeError) return failWith(500, `บันทึกวันใหม่ไม่สำเร็จ: ${writeError.message}`);
  if (!saved) return failWith(409, 'คำขอนี้เพิ่งถูกแก้จากอีกหน้าต่าง — โหลดใหม่');

  /* ล้างคอนเฟิร์มเดิมบนร่างทุกนัดของคำขอ — ร่างที่ค้างคอนเฟิร์มเก่า + TS ยืนยันใหม่ = ผ่านด่านโดยลูกค้าไม่ได้ตกลงวันใหม่
     ⚠️ พังตรงนี้ = คำขอบันทึกแล้ว (ขั้นกลับไปรอ TS อยู่ดี) และ TS ยืนยันใหม่จะล้างซ้ำ ⇒ บอกในข้อความ ไม่ย้อนคำขอ */
  const { error: clearError } = await supabase.from('service_visits')
    .update({ customerConfirmedAt: null, customerConfirmedById: null, customerConfirmedByName: null, updatedAt: stamp })
    .eq('installRequestId', installRequest.id).eq('status', 'draft');
  if (clearError) {
    return failWith(500, `บันทึกวันใหม่แล้ว แต่ล้างคอนเฟิร์มเดิมของนัดไม่สำเร็จ (${clearError.message}) — ลองกดอีกครั้ง`);
  }

  await thread(supabase, {
    entityType: 'service_visit', entityId: visit.id, kind: 'reschedule', body: installCustomerThreadText(value), user,
  });
  await audit({
    user, action: 'update', entityType: 'service_install_requests', entityId: saved.id, before: installRequest, after: saved,
    summary: `ลูกค้าขอเปลี่ยนวันติดตั้ง ${prep.site.siteCode || saved.siteId} เป็น ${saved.requestedDate}`
      + ` (นัด ${visit.code || visit.id} เดิม ${visit.scheduledDate}) · ${prep.order.orderNumber || prep.order.id}`,
    request,
  });
  const zoneCount = prep.site.zones.filter((z) => z.requested).length;
  notify(supabase, { request: saved, order: prep.order, site, zoneCount, actor, changed: true, rescheduled: true });
  return reply(200, { request: saved });
}
