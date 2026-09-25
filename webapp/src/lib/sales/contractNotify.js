// ── กระดิ่งทวง "สัญญาค้างรอลงนาม" ──────────────────────────────────────────
//
// ⭐ ทะเบียนสัญญามีการ์ด "ค้างเกิน 14 วัน" อยู่แล้ว แต่การ์ดเห็นได้เฉพาะคนที่**เปิด
//    ทะเบียน** · ใบที่ส่งไปให้ลูกค้าเซ็นแล้วเงียบคือใบที่ไม่มีใครเปิดไปดู ⇒ ตัวเลขบน
//    การ์ดจึงไม่เคยถึงตาคนที่ต้องโทรตาม · ที่นี่ยิงเข้ากระดิ่งของ **เจ้าของใบ** แทน
//
// ⚠️ **ยิงจาก cron ไม่ใช่ตอนเปิดหน้า** (ต่างจาก `renewalNotify` / `contractQuotationSync`
//    ที่กวาดตอนมีคนเปิดทะเบียน) — เพราะทะเบียนสัญญาถูกกรองตามขอบเขตของคนเปิด
//    (`loadScoped`) ⇒ AE คนหนึ่งเปิดหน้าแล้วจะเห็นเฉพาะใบของตัวเอง กวาดตอนนั้นก็
//    ทวงได้เฉพาะคนที่บังเอิญเปิดหน้า ซึ่งคือคนที่ไม่ต้องทวงอยู่แล้ว
//    ⇒ ไปอยู่ที่ `/api/cron/daily-digest` ซึ่งรันด้วยสิทธิ์ admin เห็นทุกใบ
//
// ⭐ **หนึ่งคนหนึ่งเด้งต่อวัน** (กติกาผู้รับ mig 0185) — ไม่ใช่หนึ่งใบหนึ่งเด้ง
//    คนที่มีใบค้าง 6 ใบต้องได้ข้อความเดียวที่บอกว่า 6 ใบ ไม่ใช่กระดิ่ง 6 อัน
import {
  SIGNATURE_LATE_DAYS, daysAwaitingSignature, isContractWaitingOnMe, isExternalContract,
} from '@/lib/sales/contracts';

export const CONTRACT_OVERDUE_KIND = 'contract_signature_overdue';
export const CONTRACT_ENTITY_TYPE = 'sales_contract';

/** กุญแจกันยิงซ้ำ — หนึ่งคน หนึ่งวัน หนึ่งครั้ง (เปิด cron ซ้ำวันเดียวกันไม่เกิดแถวซ้ำ) */
export const overdueSignatureDedupeKey = (dayKey, userId) => `CTLATE-${dayKey}-${userId}`;

/**
 * ใครต้องถูกทวงวันนี้ + ข้อความว่าอะไร — ฟังก์ชันบริสุทธิ์ เทสต์ได้ ไม่แตะฐานข้อมูล
 *
 * @param contracts แถวจาก `sales_contracts` — ใช้ `status` · `issuedAt` · `contractNo`
 *                  · `ownerId` · `createdBy` · `customerName`
 * @param now       เวลาอ้างอิง (ฉีดเข้ามาเพื่อให้เทสต์ไม่อ่านนาฬิกาจริง)
 * @param dayKey    วันตามนาฬิกาไทย (`businessDayKey`) — ใช้เป็นกุญแจกันยิงซ้ำ
 *
 * ⚠️ เกณฑ์ "สาย" ใช้ `SIGNATURE_LATE_DAYS` ตัวเดียวกับการ์ดสรุป · ราง · ป้ายบนใบ
 *    เทียบด้วย `>` เหมือนกันหมด — ถ้าที่นี่ใช้ `>=` คนจะได้กระดิ่งก่อนที่การ์ดจะนับให้
 * ⚠️ **ผู้รับคือเจ้าของใบ ไม่ใช่ทั้งทีม** — ไม่มีทั้ง `ownerId` และ `createdBy` = ไม่ยิง
 *    (ส่งหาทุกคนคือสิ่งที่ทำให้กระดิ่งกลายเป็นกองที่ไม่มีใครอ่าน)
 */
export function overdueSignatureNotices(contracts = [], { now = new Date(), dayKey = null } = {}) {
  const late = [];
  for (const contract of contracts || []) {
    const days = daysAwaitingSignature(contract, now);
    if (days === null || days <= SIGNATURE_LATE_DAYS) continue;
    const userId = contract.ownerId || contract.createdBy;
    if (!userId) continue;
    late.push({ contract, days, userId: String(userId) });
  }
  if (!late.length) return [];

  // จัดกลุ่มตาม "ใครต้องโทรตาม" — คนเดียวถือหลายใบได้ และต้องได้ข้อความเดียว
  const buckets = new Map();
  for (const row of late) {
    if (!buckets.has(row.userId)) buckets.set(row.userId, []);
    buckets.get(row.userId).push(row);
  }

  return [...buckets.entries()].map(([userId, rows]) => {
    const sorted = [...rows].sort((a, b) => b.days - a.days);
    const worst = sorted[0];
    const label = worst.contract.contractNo || 'ใบที่ยังไม่มีเลขที่';
    const customer = worst.contract.customerName ? ` · ${worst.contract.customerName}` : '';
    return {
      userIds: [userId],
      /* ผูกกับใบที่ค้างนานสุด — ลบใบนั้นแล้วแจ้งเตือนถูกกวาดตาม (purgeNotificationsMany)
         แพตเทิร์นเดียวกับการทวงลีดค้าง ซึ่งก็รวมหลายใบไว้ในเด้งเดียวเหมือนกัน */
      entityId: worst.contract.id,
      kind: CONTRACT_OVERDUE_KIND,
      dedupeKey: overdueSignatureDedupeKey(dayKey, userId),
      title: `สัญญารอลงนามค้าง ${sorted.length} ใบ · นานสุด ${worst.days} วัน`,
      body: `${label}${customer} ออกไปแล้ว ${worst.days} วันยังไม่ได้ฉบับเซ็นกลับ — ตามลูกค้าหรือบันทึกลงนามให้เรียบร้อย`,
    };
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   ขั้นอนุมัติของ AE Supervisor (2026-09-15)
   ══════════════════════════════════════════════════════════════════════════

   🐞 **ของจริงที่ทำให้ต้องมี** — เอกสารแทนสัญญาบริการใบหนึ่งแนบไฟล์ครบตั้งแต่ 3 ก.ย.
      แล้วค้างเป็นร่างอยู่ 12 วัน ไม่มีใครกดอนุมัติ · ช่องทางเดียวที่ AE Sup จะรู้คือ
      ป้ายตัวเลขบนเมนู "สัญญา" ซึ่งปนกับงานอื่นทั้งหมด ⇒ ไม่มีใครรู้ว่ามีใบรออยู่
   ⚠️ ฝั่งกลับก็เงียบเหมือนกัน — อนุมัติแล้วเจ้าของใบไม่รู้ ต้องเปิดใบเองถึงจะเห็นว่า
      ผูกเข้าใบสั่งขายได้แล้ว */

export const CONTRACT_APPROVAL_PENDING_KIND = 'contract_approval_pending';
export const CONTRACT_APPROVED_KIND = 'contract_approved';

/** กุญแจกันยิงซ้ำ — หนึ่งผู้อนุมัติ หนึ่งวัน หนึ่งครั้ง */
export const approvalPendingDedupeKey = (dayKey, userId) => `CTAPPROVE-${dayKey}-${userId}`;

/**
 * ใบที่รอ AE Supervisor ลงมือ + ใครต้องได้กระดิ่ง — ฟังก์ชันบริสุทธิ์
 *
 * รอผู้อนุมัติมีสองแบบ (คนละปุ่มบนหน้าใบ แต่คนกดคนเดียวกัน ⇒ รวมเป็นเด้งเดียว):
 *   · `awaiting_approval` — สายที่ระบบเจน บันทึกลงนามแล้ว รอรับรอง
 *   · ใบ external ที่ยังเป็นร่าง **และแนบเอกสารแทนสัญญาแล้ว** (`docReadyIds`)
 *
 * ⚠️ ร่าง external ที่ยังไม่แนบไฟล์ **ไม่นับ** — ปุ่มอนุมัติกดไม่ได้จนกว่าจะมีไฟล์
 *    ทวงคนที่ทำอะไรไม่ได้คือเสียงรบกวน (เหตุผลเดียวกับเลนคิวใน `isContractWaitingOnMe`)
 * 🔴 **ตัดสินด้วย `isContractWaitingOnMe` ตัวเดียวกับเลน "รอฉันรับรอง" + ป้ายเมนู** (รีวิว 25/09) —
 *    ของเดิมเขียนเงื่อนไขเองแล้วนับ *เอกสารแทนสัญญาของใบสั่งขายย้อนหลัง* (ร่าง external ที่ฟอร์มคีย์ใบ
 *    แนบไฟล์ให้แล้ว) เข้าไปด้วย ⇒ AE Sup ได้กระดิ่งทุกเช้า กดเข้า `?waiting=1` แล้วไม่เจอใบนั้น เพราะเลน
 *    ตัดมันทิ้ง (อนุมัติพร้อมใบสั่งขาย ไม่ใช่ที่หน้าสัญญา) · ผู้เรียกต้องส่ง `metadata` มากับแถว
 *    ไม่งั้น `isSubstituteContract` ตอบ false เงียบ ๆ
 * ⚠️ ผู้รับมาจากผู้เรียก (`approverIds`) — ที่นี่ไม่อ่านทะเบียนผู้ใช้เอง
 */
/* ผู้อนุมัติสมมติสำหรับถามเลน — ไม่มี id ⇒ เลนเจ้าของใบตอบ false เสมอ เหลือแต่เลนผู้อนุมัติ */
const APPROVER_PROBE = Object.freeze({ role: 'ae_supervisor' });

/** ใบที่รอผู้อนุมัติ (ชุดเดียวกับเลน "รอฉันรับรอง") — แยกออกมาให้ cron บอก "มีใบรอแต่ไม่มีผู้รับ" ได้ */
export function pendingApprovalContracts(contracts = [], { docReadyIds = new Set() } = {}) {
  return (contracts || []).filter((row) => row?.id && isContractWaitingOnMe(row, {
    user: APPROVER_PROBE, externalDocReady: docReadyIds.has(row.id),
  }));
}

export function pendingApprovalNotices(contracts = [], { docReadyIds = new Set(), approverIds = [], dayKey = null } = {}) {
  const pending = pendingApprovalContracts(contracts, { docReadyIds });
  const recipients = [...new Set((approverIds || []).filter(Boolean).map(String))];
  if (!pending.length || !recipients.length) return [];

  // เก่าสุดก่อน — ใบที่รอนานสุดคือใบที่ต้องเห็นชื่อ และเป็นใบที่แถวแจ้งเตือนผูกไว้
  const sorted = [...pending].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const externalCount = sorted.filter((row) => isExternalContract(row)).length;
  const signedCount = sorted.length - externalCount;
  const parts = [
    externalCount ? `เอกสารแทนสัญญา ${externalCount} ใบ` : null,
    signedCount ? `รับรองการลงนาม ${signedCount} ใบ` : null,
  ].filter(Boolean).join(' · ');
  const names = sorted.slice(0, 3)
    .map((row) => row.contractNo || row.customerName || 'ฉบับร่าง')
    .join(' · ');

  return recipients.map((userId) => ({
    userIds: [userId],
    entityId: sorted[0].id,
    kind: CONTRACT_APPROVAL_PENDING_KIND,
    dedupeKey: approvalPendingDedupeKey(dayKey, userId),
    title: `สัญญารอ AE Supervisor อนุมัติ ${sorted.length} ใบ`,
    body: `${parts} — ${names}${sorted.length > 3 ? ' และใบอื่น' : ''}`,
  }));
}

/**
 * แจ้งเจ้าของใบว่าอนุมัติ/รับรองแล้ว — ฟังก์ชันบริสุทธิ์ คืน `null` เมื่อไม่มีใครต้องรู้
 *
 * ⚠️ **ไม่แจ้งคนที่กดเอง** — admin/AE Sup ที่เป็นเจ้าของใบแล้วกดของตัวเอง ไม่ต้องได้กระดิ่ง
 *    บอกสิ่งที่ตัวเองเพิ่งทำ (กติกา "ห้ามแจ้งตัวเอง" ของกล่องแจ้งเตือน)
 * ⭐ สัญญาบริการบอกขั้นถัดไปด้วย — ต้องไปผูกเข้าใบสั่งขายเอง ระบบไม่ผูกให้
 */
export function contractApprovedNotice(contract, actor = null) {
  if (!contract?.id) return null;
  const actorId = actor?.id ? String(actor.id) : '';
  const userIds = [...new Set([contract.ownerId, contract.createdBy].filter(Boolean).map(String))]
    .filter((id) => id !== actorId);
  if (!userIds.length) return null;
  const external = isExternalContract(contract);
  const number = contract.contractNo || 'ฉบับร่าง';
  const customer = contract.customerName ? ` ของ ${contract.customerName}` : '';
  const next = contract.kind === 'service'
    ? 'ผูกเข้าใบสั่งขายได้ที่แท็บ “สัญญา” ของใบนั้น'
    : 'สัญญาใช้งานได้แล้ว';
  return {
    userIds,
    entityId: contract.id,
    kind: CONTRACT_APPROVED_KIND,
    dedupeKey: `CTAPPROVED-${contract.id}`,
    title: external
      ? `อนุมัติเอกสารแทนสัญญาแล้ว · ${number}`
      : `รับรองการลงนามแล้ว · ${number}`,
    body: `${actor?.name || 'AE Supervisor'} อนุมัติ${customer}แล้ว — ${next}`,
  };
}
