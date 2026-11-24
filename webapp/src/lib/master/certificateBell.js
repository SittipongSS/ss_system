// ── หนังสือรับรองบริษัทหมดอายุ (งวด 4 วันกำหนด · มติเจ้าของ 24/11/2026 · docs/due-overdue-system.md §12) ──────────
//
// ⭐ อายุ = วันที่ออก (`metadata.issuedDate`) + 6 เดือน — `documentValidity` ตัวเดียวกับป้ายบนแท็บเอกสารของลูกค้า
//   ลูกค้ามีหลายฉบับ ⇒ นับ **ฉบับที่ใช้ได้นานสุด** (แนบฉบับใหม่แล้ว ฉบับเก่าที่หมดไม่ต้องเตือน) · ไม่รู้วันที่ออก = ไม่ตัดสิน
// ⭐ ผู้รับ = **ฝ่ายขายทีมที่ดูแลลูกค้า** ที่แก้ลูกค้าได้ (`canEditRecord` ตัวเดียวกับด่านแนบไฟล์) — ชุดฝ่ายขายของกระดิ่ง
//   ขอปฏิทินวางบิล (ไม่รวม FN: เอกสารลูกค้าเป็นงานของทีมขาย) · ลูกค้าไม่มีทีม = ไม่มีผู้รับ (ห้ามหว่านทั้งบริษัท) ⇒ นับ unrouted
// ⭐ ครั้งเดียวต่อ (ลูกค้า × วันหมดอายุ) เช้าแรกที่หมด · ไม่ยิงย้อนฉบับที่หมดเกิน 7 วัน
// ⚠️ ฟังก์ชันบริสุทธิ์ — cron daily-digest ดึงไฟล์แนบ + ลูกค้า แล้วส่ง `todayIso` วันไทยเข้ามา
import { canEditRecord, caretakerTeamsOf, hasTeam } from '@/lib/permissions';
import { documentValidity } from '@/lib/master/attachmentTypes';
import { customerNameIn } from '@/lib/master/customerName';
import { dueBellFresh } from '@/lib/dueState';
import { fmtDate } from '@/lib/format';

export const CERTIFICATE_DOC_TYPE = 'company_certificate';
export const CERTIFICATE_EXPIRED_KIND = 'customer_certificate_expired';
export const CUSTOMER_DOCS_HASH = 'customer-docs';
export const certificateExpiredDedupeKey = (customerId, expiresAt) => `certificate_expired:${customerId}:${expiresAt}`;

const text = (value) => String(value ?? '').trim();

/** ฉบับที่ใช้ได้นานสุดของลูกค้า — `{ issuedDate, expiresAt }` หรือ null เมื่อไม่มีฉบับที่รู้วันที่ออก */
export function latestCertificate(attachments = [], todayIso) {
  let best = null;
  for (const item of attachments || []) {
    if (item?.docType !== CERTIFICATE_DOC_TYPE) continue;
    const validity = documentValidity('customer', item, todayIso);
    if (!validity?.expiresAt) continue;
    if (!best || validity.expiresAt > best.expiresAt) best = { issuedDate: validity.issuedDate, expiresAt: validity.expiresAt };
  }
  return best;
}

/** ฝ่ายขายทีมที่ดูแลลูกค้าและแก้ลูกค้าได้ — ไม่รวม admin · ตัดบัญชีที่ปิดแล้ว */
export function customerCaretakerIds(customer, directory) {
  const teams = caretakerTeamsOf(customer);
  if (!teams.length || !directory?.values) return [];
  return [...new Set([...directory.values()]
    .filter((user) => user?.id && !user.disabled && user.role !== 'admin'
      && hasTeam(user, teams) && canEditRecord(user, 'customers', customer))
    .map((user) => String(user.id)))];
}

/**
 * กระดิ่งหนังสือรับรองที่เพิ่งหมดอายุ — หนึ่งแถวต่อลูกค้า
 * @param customers     ลูกค้า (`id · arCode · name · nameEn · team · teams · isActive`)
 * @param attachmentsByCustomer Map customerId → ไฟล์แนบชนิดหนังสือรับรอง
 * @returns `{ notices, unrouted }`
 */
export function certificateExpiredNotices(customers = [], {
  todayIso, attachmentsByCustomer = new Map(), directory = null, skipArCodes = [],
} = {}) {
  const skip = new Set((skipArCodes || []).map(text).filter(Boolean));
  const notices = [];
  let unrouted = 0;
  for (const customer of customers || []) {
    if (!customer?.id || customer.isActive === false || skip.has(text(customer.arCode))) continue;
    const cert = latestCertificate(attachmentsByCustomer.get?.(customer.id) || [], todayIso);
    if (!cert || !dueBellFresh(cert.expiresAt, todayIso)) continue;
    const userIds = customerCaretakerIds(customer, directory);
    if (!userIds.length) { unrouted += 1; continue; }
    const name = customerNameIn(customer) || text(customer.arCode) || 'ลูกค้า';
    notices.push({
      userIds,
      entityType: 'customer',
      entityId: customer.id,
      kind: CERTIFICATE_EXPIRED_KIND,
      dedupeKey: certificateExpiredDedupeKey(customer.id, cert.expiresAt),
      title: `หนังสือรับรองบริษัทหมดอายุ · ${name}`,
      body: [
        text(customer.arCode),
        `ออก ${fmtDate(cert.issuedDate)} ใช้ได้ถึง ${fmtDate(cert.expiresAt)}`,
        'ขอฉบับใหม่จากลูกค้าแล้วแนบที่แท็บเอกสาร (อายุไม่เกิน 6 เดือน)',
      ].filter(Boolean).join(' · '),
      href: `/database/customers/${customer.id}#${CUSTOMER_DOCS_HASH}`,
    });
  }
  return { notices, unrouted };
}
