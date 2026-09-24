/* ── ผูกดีลกับลีดต้นทาง "ย้อนหลัง" ได้ทั้งสองทาง (มติผู้ใช้ 2026-09-22) ─────────────
 *
 * โจทย์: SA ลืมกด "เปิดดีลจากลีดนี้" แล้วไปเปิดดีลตรงจากหน้าดีล ⇒ ลีดค้างสถานะ
 * ติดต่อแล้ว/นัดแล้ว (ระบบยังทวงและตีกลับต่อ) และ KPI ของ MKT นับลีดใบนั้นว่าไม่แปลง
 * (prod 22/09: ~11 ลีด 20+ ดีลที่เปิดนอกเส้นลีด เทียบกับ 22 ลีดที่เปิดถูกทาง)
 *
 * ทางเข้าสามทาง ใช้กติกาชุดเดียวในไฟล์นี้:
 *   1. ฟอร์มเพิ่มดีลที่หน้าดีล — เลือกลีดต้นทางได้ (POST /deals · kind 'create_deal')
 *   2. หน้าดีล — ปุ่ม "ผูกลีดต้นทาง" / "ถอดลีดต้นทาง" (/deals/[id]/link-lead)
 *   3. หน้าลีด — ปุ่ม "ผูกดีลที่มีอยู่" (ยิง endpoint เดียวกับข้อ 2)
 *
 * มติ 2026-09-22 (สามข้อ):
 *   · ลีดทุกสถานะผูกได้ รวม "ไม่ไปต่อ" — ลีดกลายเป็น "เปิดลูกค้าแล้ว" เพราะความจริงคือ
 *     เปิดดีลไปแล้ว (เหตุผลไม่ไปต่อยังอยู่ในประวัติและคอลัมน์เดิม) · ยกเว้นลีดที่ยังไม่ถูก
 *     กระจาย (รอคัดกรอง/รอกระจาย) ซึ่งรวมลีดที่ถูกตีกลับจนไม่มีทีม — ผูกได้เฉพาะ
 *     Admin กับ AE Supervisor
 *   · ถอดได้ · ลีดที่ไม่เหลือดีลกลับไปสถานะก่อนเปิดดีล โดยไม่มีวันติดตาม
 *     (AE ต้องบันทึกการติดต่อใหม่) · ลบดีลใช้กติกาเดียวกัน
 *   · คนผูกได้ = คนที่เปิดดีลจากลีดได้อยู่แล้ว (Admin/AE/Senior AE) + AE Supervisor
 *     และต้องแก้ดีลใบนั้นได้ + ทำงานลีดใบนั้นได้ทั้งสองฝั่ง
 *
 * ⚠️ สูตรล้วน (จอ import ได้) — ห้ามแตะฐานหรือ session · ตัวที่คุยกับฐานอยู่ที่
 *    `dealLeadLinkRepo.js` · ข้อความ blocker ที่จอโชว์ต้องมาจากฟังก์ชันในไฟล์นี้ตัวเดียว
 *    กับที่ server ใช้ปฏิเสธ (กติกา GatedAction)
 */
import { hasTeam, isTeamLead, DEAL_HOLDER_ROLES, SALES_MANAGER_ROLES } from '@/lib/permissions';
import { isHistoricalDeal } from '@/lib/sales/historicalOrders';
import { LEAD_STATUS_LABELS } from '@/lib/sales/leads';

/** ใครผูก/ถอดลีดกับดีลได้ — `canCreateDealFromLead` + AE Supervisor (มติ 2026-09-22)
 *  ⚠️ **ไม่แก้ `canCreateDealFromLead`** — ปุ่ม "เปิดดีลจากลีดนี้" ของ AE Supervisor ยังปิดตาม
 *     มติ 2026-07-21 (งานของหัวหน้าจบที่คัดกรอง) · ผูกย้อนหลังคือ "แก้ของลูกทีม" คนละเรื่อง
 *  ⚠️ AC ไม่อยู่ในลิสต์ — AC เปิดดีลจากลีดไม่ได้มาตั้งแต่ต้น (มติผู้ใช้) · สาย AC ทุกระดับก็เช่นกัน
 *  ⭐ ผังตำแหน่ง 2026-09-24: "AE Supervisor" = ผู้มีอำนาจตัดสิน (CD · CM · AE Sup) */
export const LEAD_LINK_ROLES = ['admin', ...DEAL_HOLDER_ROLES, ...SALES_MANAGER_ROLES];
export const canLinkLeadRole = (role) => LEAD_LINK_ROLES.includes(role);

const LEAD_LINK_SUPERVISORS = ['admin', ...SALES_MANAGER_ROLES];

/** สถานะที่ผูกได้ทุกคนที่ผ่านด่านสิทธิ์ — "กระจายแล้ว" ขึ้นไป รวม "ไม่ไปต่อ" */
export const LEAD_LINK_STATUSES = ['assigned', 'contacted', 'meeting', 'qualified', 'disqualified'];
/** สถานะที่ผูกได้เฉพาะ Admin/AE Supervisor — ยังไม่ถูกกระจาย หรือถูกตีกลับจนไม่มีทีม
 *  (`leadBouncePatch` ล้างทีม/ผู้รับ ⇒ AE/Senior มองไม่เห็นใบนี้อยู่แล้ว) */
export const LEAD_LINK_SUPERVISOR_STATUSES = ['new', 'screened'];

/** ขอบเขต "ทำงานลีดใบนี้ได้" ของการผูก — ท่าเดียวกับ `canWorkLead` (admin · senior_ae ทีมเดียวกัน ·
 *  ae ผู้รับมอบ) + AE Supervisor เห็นทุกใบ
 *  ⚠️ ไม่ใช้ `inLeadScope` — ตัวนั้นให้ marketing/ผู้สังเกตการณ์ผ่าน และให้ AE ที่ "กรอกลีดเอง"
 *     ผ่านด้วย ซึ่งไม่ใช่คนทำงานใบนั้น */
export function leadLinkScopeOk(user, lead) {
  const role = user?.role;
  if (!lead || !canLinkLeadRole(role)) return false;
  if (LEAD_LINK_SUPERVISORS.includes(role)) return true;
  // หัวหน้าทีมในลิสต์นี้มีแค่ Senior AE (สาย AC ไม่ผ่าน canLinkLeadRole ข้างบน)
  if (isTeamLead(role)) return hasTeam(user, lead.team);
  if (role === 'ae') return !!user?.id && lead.assigneeId === user.id;
  return false;
}

/** ข้อความเมื่อผูก/ถอดกับลีดใบนี้ไม่ได้ · `null` = ผ่าน
 *  @param forUnlink ถอด = ตรวจแค่สิทธิ์ ไม่ตรวจสถานะ (ลีดที่ผูกอยู่แล้วเป็น "เปิดลูกค้าแล้ว" เสมอ
 *                   ยกเว้นเคสแก้ข้อมูลด้วยมือ ซึ่งยิ่งต้องถอดได้)
 *  คืน `{ message, status }` ให้ route เลือก HTTP code ได้ · จอใช้ `.message` */
export function leadLinkError({ user, lead, forUnlink = false } = {}) {
  if (!lead) return { message: 'ไม่พบลีด', status: 404 };
  if (!canLinkLeadRole(user?.role)) {
    return { message: `${forUnlink ? 'ถอด' : 'ผูก'}ลีดกับดีลได้เฉพาะ AE · Senior AE · AE Supervisor และแอดมิน`, status: 403 };
  }
  if (!leadLinkScopeOk(user, lead)) {
    return {
      message: `ลีดใบนี้ไม่ได้อยู่ในความดูแลของคุณ — ให้ผู้รับผิดชอบลีด หัวหน้าทีม หรือ AE Supervisor เป็นคน${forUnlink ? 'ถอด' : 'ผูก'}`,
      status: 403,
    };
  }
  if (forUnlink) return null;
  if (LEAD_LINK_STATUSES.includes(lead.status)) return null;
  if (LEAD_LINK_SUPERVISOR_STATUSES.includes(lead.status) && LEAD_LINK_SUPERVISORS.includes(user.role)) return null;
  const label = LEAD_STATUS_LABELS[lead.status] || lead.status;
  if (LEAD_LINK_SUPERVISOR_STATUSES.includes(lead.status)) {
    return {
      message: `ลีดสถานะ "${label}" ยังไม่ถูกมอบหมาย (หรือถูกส่งกลับคิวคัดกรอง) — ให้ AE Supervisor หรือแอดมินเป็นคนผูก`,
      status: 400,
    };
  }
  return { message: `ลีดสถานะ "${label}" ผูกกับดีลไม่ได้`, status: 400 };
}

/** ดีลที่ไม่มีวันมาจากลีด — ตัดก่อนดูลีด
 *  · ดีลของใบสั่งขายย้อนหลัง (mig 0360) — CHECK `sales_deals_historical_shape` บังคับ leadId ว่าง
 *  · ดีลสหมิตร — เกิดจากรอบพยากรณ์/PO ของสหมิตร ไม่ได้มาจากลีด
 *    (ตัวอ่าน `metadata.source` ของสหมิตรมีสี่ที่ — ห้ามให้การผูกลีดไปทับค่านั้น) */
export function dealLeadLinkBlocker(deal) {
  if (!deal) return 'ไม่พบดีล';
  if (isHistoricalDeal(deal)) return 'ดีลของใบสั่งขายย้อนหลังไม่มีลีดต้นทาง — ผูกลีดไม่ได้';
  if (String(deal.metadata?.source || '').startsWith('sahamit')) {
    return 'ดีลสหมิตรเกิดจากรอบพยากรณ์/PO ของสหมิตร ไม่ได้มาจากลีด — ผูกลีดไม่ได้';
  }
  return null;
}

/** ข้อความของ "ผูกลีดให้ดีลใบนี้" ทั้งก้อน (ดีล + ลีด) — ตัวเดียวที่ route ใช้ */
export function dealLeadLinkError({ user, deal, lead } = {}) {
  const dealBlocker = dealLeadLinkBlocker(deal);
  if (dealBlocker) return { message: dealBlocker, status: 409 };
  if (deal.leadId) {
    return deal.leadId === lead?.id
      ? { message: 'ดีลนี้ผูกกับลีดใบนี้อยู่แล้ว', status: 409 }
      : { message: 'ดีลนี้ผูกลีดต้นทางใบอื่นอยู่แล้ว — ถอดของเดิมที่หน้าดีลก่อน แล้วค่อยผูกใหม่', status: 409 };
  }
  return leadLinkError({ user, lead });
}

/** metadata ของดีลหลังผูกลีด — กระจก `metadata.leadId` ต้องตรงคอลัมน์เสมอ (ท่าเดียวกับ POST /deals)
 *  ⚠️ `source` เขียนเฉพาะตอนว่าง — ดีลที่มี source อื่นอยู่แล้ว (เช่นของสหมิตร ซึ่งด่านข้างบน
 *     กันไว้แล้ว) ห้ามถูกทับ · `leadChannel` ตามลีดใบที่ผูก */
export function dealMetadataWithLead(metadata, lead) {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  return {
    ...base,
    leadId: lead.id,
    ...(base.source ? {} : { source: 'lead' }),
    leadChannel: lead.channel || null,
  };
}

/** metadata ของดีลหลังถอดลีด — ถอดทั้งสามคีย์ของเส้นผูกลีด
 *  (`source` ถอดเฉพาะเมื่อเป็น 'lead' — ค่าของเส้นอื่นอยู่ต่อ) */
export function dealMetadataWithoutLead(metadata) {
  const base = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  const { leadId: _leadId, leadChannel: _channel, ...rest } = base;
  if (rest.source === 'lead') delete rest.source;
  return rest;
}

/** แพตช์ของลีดตอนผูกดีล · `null` = ไม่ต้องแตะ (เปิดลูกค้าแล้วอยู่แล้ว — ลีด 1 ใบหลายดีล)
 *  ⚠️ **ไม่ล้าง `disqualifiedCode`/`disqualifiedReason`/`revisitAt`** ของลีดที่เคยปิดไม่ไปต่อ —
 *     `leadOutcome` อ่านรหัสนั้นเฉพาะตอนสถานะเป็น disqualified (ไม่กระทบตัวส่วน) และตอนถอด
 *     ลีดจะกลับไปเป็น "ไม่ไปต่อ" พร้อมเหตุผลเดิมครบ ไม่ต้องไปขุดจากประวัติ
 *  ⭐ ลีดที่ **ยังไม่มีผู้รับผิดชอบ** (หัวหน้าผูกใบรอคัดกรอง/รอกระจาย/ถูกตีกลับ) ⇒ ผู้ดูแลดีลเป็น
 *     ผู้รับผิดชอบ (+ ทีมของดีลถ้าลีดยังไม่มีทีม) · 🐞 ไม่ประทับ = ลีด "เปิดลูกค้าแล้ว" ที่ไม่มีเจ้าของ
 *     นับในผัง Funnel แต่หลุดตาราง AE (`if (!l.assigneeId) continue`) ⇒ ยอดรวมสองตารางไม่เท่ากัน
 *     (ก่อนมีการผูกย้อนหลัง ลีด qualified ทุกใบมีผู้รับผิดชอบเสมอ) · ถอดแล้วคืนค่าเดิมจากเหตุการณ์ */
export function leadLinkPatch(lead, now, deal = null) {
  if (!lead || lead.status === 'qualified') return null;
  const patch = { status: 'qualified', closedAt: now, updatedAt: now };
  if (!lead.assigneeId && deal?.ownerId) {
    patch.assigneeId = deal.ownerId;
    patch.assigneeName = deal.ownerName || null;
    if (!lead.team && deal.team) patch.team = deal.team;
    /* ⚠️ ประทับเวลามอบหมายคู่ไปด้วย — แถว "มอบหมายแล้ว" ของผัง Funnel นับ firstAssignedAt||assignedAt
       ส่วนตาราง AE นับทุกแถวที่มี assigneeId ⇒ ประทับแต่ผู้รับ = สองตารางต่างกันอีกแถวหนึ่ง
       (ใบที่เข้าเงื่อนไขนี้ไม่เคยถูกมอบหมายในรอบนี้ — bounce ล้างทั้งสองช่องไปแล้ว) */
    patch.assignedAt = now;
    patch.firstAssignedAt = lead.firstAssignedAt || now;
  }
  return patch;
}

/* เหตุการณ์ที่พาลีดเข้า "เปิดลูกค้าแล้ว" — ใช้หาสถานะก่อนหน้าตอนถอด */
export const LEAD_QUALIFY_EVENT_KINDS = ['create_deal', 'link_deal'];

/** เหตุการณ์ล่าสุดที่พาลีดจากสถานะอื่นเข้า qualified (ตัวบอก "ก่อนเปิดดีลเป็นอะไร")
 *  @param events แถว `lead_events` ของลีดใบนี้ (ลำดับไหนก็ได้ — เรียงใหม่ที่นี่) */
export function latestQualifyEvent(events = []) {
  return [...(events || [])]
    .filter((e) => LEAD_QUALIFY_EVENT_KINDS.includes(e?.kind)
      && e?.toStatus === 'qualified' && e?.fromStatus && e.fromStatus !== 'qualified')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
}

/** สถานะที่ลีดควรกลับไปเมื่อไม่เหลือดีลแล้ว = `fromStatus` ของ `latestQualifyEvent`
 *  ⚠️ ไม่เจอเหตุการณ์ (ดีลก่อน mig 0199 · บันทึกประวัติล้มตอนผูก เช่นก่อนรัน mig 0371) ⇒ อ่านร่องรอย
 *     บนแถวตามลำดับ — 🐞 รอบแรกดูแค่ meetingAt ⇒ ลีดที่ผูกจาก "ไม่ไปต่อ" เปิดกลับเป็น "ติดต่อแล้ว"
 *     (ผิดมติข้อ B และผิดคำที่โมดัลผูกสัญญาไว้) · ลีดไร้ทีมกลายเป็น "ติดต่อแล้ว" ที่ไม่มีคิวไหนเห็น
 *     · เหตุผลไม่ไปต่อบนแถว = มาจาก "ไม่ไปต่อ" แน่นอน (ก่อนมีการผูกย้อนหลัง ลีดที่ปิดแล้วไม่มีทางกลับ)
 *     · ไม่มีทีม = รอคัดกรอง · มีทีมแต่ไม่มีผู้รับ = รอกระจาย
 *     · เคยนัด = นัดแล้ว · เคยติดต่อ = ติดต่อแล้ว · ไม่งั้น = รอติดต่อกลับ */
export function leadRevertStatus(events = [], lead = {}) {
  const latest = latestQualifyEvent(events);
  if (latest) return latest.fromStatus;
  if (lead?.disqualifiedCode || lead?.disqualifiedReason) return 'disqualified';
  if (!lead?.team) return 'new';
  if (!lead?.assigneeId) return 'screened';
  if (lead?.meetingAt) return 'meeting';
  return lead?.firstContactAt ? 'contacted' : 'assigned';
}

/** แพตช์ของลีดตอนไม่เหลือดีลแล้ว
 *  · กลับไปสถานะเปิด (assigned/contacted/meeting) ⇒ ล้าง `closedAt` + **ล้างวันติดตาม**
 *    (มติ 2026-09-22 "AE ต้องบันทึกการติดต่อใหม่") — ใบไม่มี followUpAt ไม่ถูกตีกลับอัตโนมัติ
 *  · กลับไป `assigned` ⇒ **เริ่มนาฬิกา `assignedAt` ใหม่** · 🐞 รอบแรกคงค่าเดิม ⇒ cron ตีกลับ
 *    (นับจาก assignedAt > 5 วันทำการ) ดึงลีดออกจากมือ AE เช้าวันทำการถัดไป ก่อนได้บันทึกการติดต่อ
 *    ⚠️ ไม่แตะ `firstAssignedAt` — SLA กระจายเป็นของครั้งแรกตลอดกาล (ท่าเดียวกับ reassign)
 *  · กลับไป `disqualified` ⇒ คง `closedAt` (ปิดอยู่แล้ว) · เหตุผลไม่ไปต่อเดิมยังอยู่ครบ
 *  · กลับไป `new`/`screened` ⇒ ล้าง `closedAt` + คืนผู้รับผิดชอบ/ทีมเป็นว่างตามสถานะนั้น
 *    (ตอนผูกประทับผู้ดูแลดีลไว้ — ดู leadLinkPatch)
 *  · กลับไป `disqualified` ด้วยเหตุการณ์ที่บันทึกทีม/ผู้รับก่อนผูกไว้ ⇒ คืนค่านั้น
 *  @param event เหตุการณ์จาก `latestQualifyEvent` (null ได้) — team/assigneeId/assigneeName ของมัน
 *               คือค่าก่อนผูก (ดู recordLeadDealOpened) */
export function leadUnlinkPatch(targetStatus, now, event = null) {
  const patch = { status: targetStatus, updatedAt: now };
  if (targetStatus !== 'disqualified') patch.closedAt = null;
  if (['assigned', 'contacted', 'meeting'].includes(targetStatus)) patch.followUpAt = null;
  if (targetStatus === 'assigned') patch.assignedAt = now;
  /* กลับคิวคัดกรอง/รอกระจาย = ถอดผู้รับที่ประทับตอนผูก (ใบสถานะนี้ไม่มีผู้รับ/เวลามอบหมายในรอบนี้เสมอ —
     bounce ล้างครบทุกช่อง) · รอกระจาย **เริ่มนาฬิกา screenedAt ใหม่** ไม่งั้นสรุปเช้าทวงว่าค้าง
     ทั้งช่วงที่ลีดเป็น "เปิดลูกค้าแล้ว" (ไม่แตะ firstScreenedAt — ครั้งแรกตลอดกาล) · คิวคัดกรอง
     นับจาก createdAt ซึ่งเริ่มใหม่ไม่ได้ */
  const unassigned = { assigneeId: null, assigneeName: null, assignedAt: null, firstAssignedAt: null };
  if (targetStatus === 'new') Object.assign(patch, { team: null, ...unassigned });
  if (targetStatus === 'screened') Object.assign(patch, { ...unassigned, screenedAt: now });
  /* ⚠️ คืนผู้รับเฉพาะเหตุการณ์ที่มาจาก "ไม่ไปต่อ" — เหตุการณ์ create_deal เก่าไม่เคยบันทึกทีม/ผู้รับ
     (ค่าว่างในแถวเก่า ≠ "ก่อนผูกไม่มีผู้รับ") และสถานะเปิดมีผู้รับเสมออยู่แล้ว
     · ก่อนผูกไม่มีผู้รับ = ตอนผูกประทับทั้งผู้รับและเวลามอบหมาย ⇒ ถอดออกทั้งชุด */
  if (targetStatus === 'disqualified' && event?.fromStatus === 'disqualified') {
    Object.assign(patch, {
      team: event.team ?? null,
      assigneeId: event.assigneeId ?? null,
      assigneeName: event.assigneeName ?? null,
      ...(event.assigneeId ? {} : { assignedAt: null, firstAssignedAt: null }),
    });
  }
  return patch;
}

/** ป้ายดีลในเหตุการณ์ของลีด (lead_events ไม่มีคอลัมน์ dealId — เล่าผ่าน reason) */
export function dealLabelForLead(deal = {}) {
  return [deal.code || deal.id, deal.title].filter(Boolean).join(' · ');
}

/** ป้ายลีดสั้น ๆ — ลีดไม่มีคอลัมน์รหัส จึงใช้ ชื่อผู้ติดต่อ · บริษัท */
export function leadLabel(lead = {}) {
  return [lead.contactName, lead.company].filter(Boolean).join(' · ') || lead.id || '';
}

/* ── ตัวเลือกของโมดัลผูก ─────────────────────────────────────────────────────── */

const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

/** ตัวเลือกลีดสำหรับ SearchableSelect — ลีดของผู้ดูแลดีลขึ้นก่อน (เคสลืมกดแทบทั้งหมดคือคนเดียวกัน)
 *  @param leads แถวจาก `GET /api/sales-planning/leads?linkable=1` (server กรองด่านแล้ว)
 *  @param ownerId เจ้าของดีล · `fmtDate` ให้จอส่งตัวจัดรูปวันที่มาเอง (ไฟล์นี้ไม่ผูกกับ lib/format) */
export function leadLinkOptions(leads = [], { ownerId = null, ownerName = '', fmtDate = (v) => v } = {}) {
  const option = (lead) => {
    const bits = [
      lead.company,
      LEAD_STATUS_LABELS[lead.status] || lead.status,
      lead.assigneeName,
      lead.createdAt ? `รับ ${fmtDate(lead.createdAt)}` : null,
    ].filter(Boolean);
    return {
      value: lead.id,
      label: `${lead.contactName || lead.id}${bits.length ? ` · ${bits.join(' · ')}` : ''}`,
      search: [lead.contactName, lead.company, lead.phone, lead.email, lead.assigneeName, lead.id]
        .filter(Boolean).join(' '),
    };
  };
  const rows = [...(leads || [])].sort(byNewest);
  const mine = ownerId ? rows.filter((lead) => lead.assigneeId === ownerId) : [];
  const others = ownerId ? rows.filter((lead) => lead.assigneeId !== ownerId) : rows;
  if (!mine.length) return others.map(option);
  return [
    { value: '__group_mine', label: `ลีดที่ ${ownerName || 'ผู้ดูแลดีลนี้'} รับผิดชอบ`, group: true },
    ...mine.map(option),
    ...(others.length ? [{ value: '__group_others', label: 'ลีดอื่นที่ผูกได้', group: true }, ...others.map(option)] : []),
  ];
}

/** ดีลที่ผูกกับลีดได้จากหน้าลีด — ยังไม่มีลีด + แก้ได้ + ไม่ใช่ดีลที่ไม่มีวันมาจากลีด */
export function isDealLinkableToLead(deal) {
  return !!deal && !!deal.canEdit && !deal.leadId && !dealLeadLinkBlocker(deal);
}

/** ตัวเลือกดีลสำหรับ SearchableSelect — ดีลของผู้รับผิดชอบลีดขึ้นก่อน
 *  @param stageLabel (stage) → ป้าย (จอส่ง STAGE_LABELS มา — ไฟล์นี้ไม่ import salesPlanning ทั้งก้อน) */
export function dealLinkOptions(deals = [], { assigneeId = null, assigneeName = '', stageLabel = (s) => s } = {}) {
  const option = (deal) => ({
    value: deal.id,
    label: [deal.code, deal.title, deal.customerName, stageLabel(deal.stage), deal.ownerName].filter(Boolean).join(' · '),
    search: [deal.code, deal.title, deal.customerName, deal.ownerName, deal.metadata?.brand].filter(Boolean).join(' '),
  });
  const rows = (deals || []).filter(isDealLinkableToLead).sort(byNewest);
  const mine = assigneeId ? rows.filter((deal) => deal.ownerId === assigneeId) : [];
  const others = assigneeId ? rows.filter((deal) => deal.ownerId !== assigneeId) : rows;
  if (!mine.length) return others.map(option);
  return [
    { value: '__group_mine', label: `ดีลของ ${assigneeName || 'ผู้รับผิดชอบลีด'}`, group: true },
    ...mine.map(option),
    ...(others.length ? [{ value: '__group_others', label: 'ดีลอื่นที่ผูกได้', group: true }, ...others.map(option)] : []),
  ];
}

/** ประโยคบอกผลลัพธ์ในโมดัลผูก (กติกา approval-confirm: บอกว่ากดแล้วเกิดอะไร ไม่ใช่ "แน่ใจไหม") */
export function leadLinkEffects(lead, { via = 'link' } = {}) {
  if (!lead) return [];
  const effects = [];
  if (lead.status === 'qualified') {
    effects.push('ลีดนี้เปิดลูกค้าแล้ว — เพิ่มดีลนี้เข้าไปเป็นอีกใบของลีด สถานะลีดไม่เปลี่ยน');
  } else {
    effects.push(`ลีดเปลี่ยนจาก "${LEAD_STATUS_LABELS[lead.status] || lead.status}" เป็น "${LEAD_STATUS_LABELS.qualified}" และนับเป็นลีดที่แปลงสำเร็จในเดือนที่รับลีดเข้ามา`);
    effects.push('ระบบเลิกทวงวันติดตามและเลิกตีกลับลีดใบนี้อัตโนมัติ');
  }
  if (lead.status === 'disqualified') {
    effects.push('เหตุผล "ไม่ไปต่อ" เดิมยังเก็บไว้ในประวัติ — ถ้าถอดดีลออกภายหลัง ลีดจะกลับเป็น "ไม่ไปต่อ" ตามเดิม');
  }
  if (!lead.assigneeId && lead.status !== 'qualified') {
    effects.push('ลีดนี้ยังไม่มีผู้รับผิดชอบ — ผู้ดูแลดีลจะเป็นผู้รับผิดชอบลีด (และได้ทีมของดีลถ้าลีดยังไม่มีทีม) · ถอดภายหลังจะคืนลีดเข้าคิวเดิม');
  }
  effects.push(via === 'create'
    ? 'ประวัติลีดบันทึกการเปิดดีลใบนี้ · ถอดได้ที่หน้าดีล'
    : 'ประวัติลีดบันทึกว่าผูกดีลย้อนหลัง · ถอดได้ที่หน้าดีล');
  return effects;
}

/** ลีดเป็นอย่างไรเมื่อดีลหลุดไป — กล่องยืนยันถอด (หน้าดีล) และลบดีล (สองหน้า) ใช้ประโยคเดียวกัน
 *  🐞 รอบแรกเขียนว่า "ไม่มีวันติดตาม ต้องบันทึกการติดต่อใหม่" ทุกกรณี ⇒ ผิดกับลีดที่เคย "ไม่ไปต่อ"
 *     (กลับเป็นไม่ไปต่อ ไม่มีอะไรให้ติดต่อ) ซึ่งมติข้อ A เปิดให้ผูกได้ */
export const LEAD_RELEASE_NOTE =
  'ถ้าลีดไม่เหลือดีลอื่น ลีดจะกลับไปสถานะก่อนเปิดดีล และ KPI ไม่นับเป็นลีดที่แปลงสำเร็จอีก — สถานะที่ยังทำงานอยู่จะไม่มีวันติดตาม (ผู้รับผิดชอบต้องบันทึกการติดต่อใหม่) · ถ้าเคย "ไม่ไปต่อ" จะกลับเป็น "ไม่ไปต่อ" พร้อมเหตุผลเดิม · ถ้ายังไม่เคยถูกมอบหมาย จะกลับคิวคัดกรอง/รอกระจาย';

/** บรรทัดในกล่องยืนยันลบดีลที่มีลีดต้นทาง — สองหน้าที่ลบดีลได้ (รายการ · รายละเอียด) ใช้ข้อความเดียวกัน */
export const DEAL_DELETE_LEAD_NOTE = `ดีลนี้ผูกลีดต้นทางอยู่ — ${LEAD_RELEASE_NOTE}`;
