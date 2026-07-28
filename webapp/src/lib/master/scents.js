// ── ทะเบียนกลิ่น (mig 0171) — logic ล้วน ใช้ร่วมทั้ง API และหน้าจอ ─────────
//
// ทำไมต้องมีตารางนี้: ก่อนหน้านี้ "กลิ่น" ไม่มีตัวตนในระบบเลย มีแค่ชื่อขั้นตอนใน
// ไทม์ไลน์ ("ส่งกลิ่น ครั้งที่ 1") กับข้อความในทะเบียนวัสดุ — คนเลยไปกรอกชื่อกลิ่น
// ลงช่อง "ชื่อสูตร" ของสินค้าแทน (เจอจริงบน prod 10 แถว) แล้วข้อมูลสองอย่างปนกัน
//
// กลิ่น 1 ตัวมีหลาย Rev = การส่งตัวอย่างให้ลูกค้าลองแต่ละครั้ง + ผลตอบรับ
// (ดู scentRevisions.js — ไฟล์นี้ดูแลตัวกลิ่น)
import { canUser, isReadOnlyObserver, isSuperuser } from '@/lib/permissions';

export const SCENT_STATUSES = ['draft', 'developing', 'active', 'archived'];

export const SCENT_STATUS_LABELS = {
  draft: 'ร่าง — รอ RD รับเข้าทะเบียน',
  developing: 'กำลังพัฒนา',
  active: 'ใช้งานได้',
  archived: 'เลิกใช้',
};

// สีของ pill ตามระบบ token (ห้ามใส่ hex ตรง ๆ — ดู material-design skill)
export const SCENT_STATUS_TONES = {
  draft: 'var(--text-3)',
  developing: 'var(--blue)',
  active: 'var(--green)',
  archived: 'var(--text-3)',
};

// สถานะที่ "อ้างอิงในคำร้องขอราคา F ได้" — ร่างยังไม่ผ่าน RD จึงยังไม่ใช่ของจริง
export const SCENT_USABLE_STATUSES = ['developing', 'active'];

export function normalizeScentStatus(value) {
  return SCENT_STATUSES.includes(value) ? value : 'draft';
}

export function isScentUsable(scent) {
  return SCENT_USABLE_STATUSES.includes(scent?.status);
}

// ── ตัวตนของกลิ่น ────────────────────────────────────────────────────────
// ต้องตรงกับ unique index scents_identity_uk เป๊ะ ๆ ไม่งั้นฝั่งแอปจะคิดว่าเป็น
// คนละตัวแล้วยิง insert ไปชน constraint (ผู้ใช้เห็น error ดิบของ Postgres)
//
// ⚠️ มติ 9: กลิ่นของลูกค้า A ใช้กับลูกค้า B ไม่ได้ → customerId อยู่ในคีย์เสมอ
// และห้ามเป็นค่าว่าง (ต่างจากทะเบียนวัสดุที่มี "ราคากลาง" ได้)
export function normLabel(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function scentIdentityKey({ name, customerId } = {}) {
  return [normLabel(name), customerId || ''].join('::');
}

export function findScentByIdentity(scents = [], identity = {}) {
  const key = scentIdentityKey(identity);
  return scents.find((s) => scentIdentityKey(s) === key) || null;
}

// ── สิทธิ์ ───────────────────────────────────────────────────────────────
// อ่านทะเบียน: ทุกคนที่เห็นแคตตาล็อกสินค้า (กลิ่นเป็นข้อมูลอ้างอิงข้ามฝ่าย
// เหมือนสินค้า — มติ 2026-07-20 เรื่องแคตตาล็อกเห็นทุกทีม)
export function canViewScents(user) {
  return canUser(user, 'products:view');
}

// เจ้าของทะเบียน = RD (+ admin break-glass): รับร่างเข้าทะเบียน, ใส่รหัส,
// เปลี่ยนสถานะ, ส่ง Rev. ฝ่ายขายทำสามอย่างนี้ไม่ได้แม้จะเปิดร่างเอง
export function isScentRegistrar(user) {
  return user?.role === 'rd' || isSuperuser(user?.role);
}

// เสนอกลิ่นใหม่เป็น "ร่าง" — ฝ่ายขายทำได้ (มติ 10 แพตเทิร์นเดียวกับทะเบียนวัสดุ)
// viewer/executive กันออกด้วย isReadOnlyObserver ไม่งั้นได้ operational surface เงียบ ๆ
export function canProposeScent(user) {
  if (isReadOnlyObserver(user?.role)) return false;
  return isScentRegistrar(user) || canUser(user, 'products:edit');
}

// บันทึกผลตอบรับลูกค้า: **ฝ่ายขายด้วย** ไม่ใช่ RD คนเดียว — คนที่คุยกับลูกค้าจริง
// คือฝ่ายขาย ถ้าให้เฉพาะ RD กรอก ข้อมูลจะมาถึงช้าหรือไม่มาเลย
export function canRecordScentFeedback(user) {
  return canProposeScent(user);
}

// แก้ตัวกลิ่น (ชื่อ/ลูกค้า/หมายเหตุ): ร่างของตัวเองแก้ได้ · รับเข้าทะเบียนแล้ว
// เป็นงานของ RD (ชื่อกลิ่นถูกอ้างจากที่อื่นแล้ว เปลี่ยนมั่วไม่ได้)
export function canEditScent(user, scent) {
  if (!scent) return false;
  if (isScentRegistrar(user)) return true;
  if (scent.status !== 'draft') return false;
  return canProposeScent(user) && scent.createdById === user?.id;
}

// ลบได้เฉพาะร่างที่ยังไม่มี Rev — ของที่รับเข้าทะเบียนแล้วเป็นหลักฐาน
export function deleteScentError(scent, { revisionCount = 0 } = {}) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (scent.status !== 'draft') return 'ลบได้เฉพาะร่าง — กลิ่นที่รับเข้าทะเบียนแล้วให้เปลี่ยนเป็น "เลิกใช้" แทน';
  if (revisionCount > 0) return 'กลิ่นนี้มีประวัติการส่งแล้ว ลบไม่ได้';
  return null;
}

// ── ด่านของแต่ละ action — คืนข้อความไทย หรือ null ถ้าผ่าน ────────────────
export function acceptScentError(scent, { code } = {}) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (scent.status !== 'draft') return 'กลิ่นนี้รับเข้าทะเบียนไปแล้ว';
  if (!String(code ?? '').trim()) return 'ต้องระบุรหัสกลิ่นตอนรับเข้าทะเบียน';
  return null;
}

export function archiveScentError(scent) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (scent.status === 'archived') return 'กลิ่นนี้เลิกใช้ไปแล้ว';
  if (scent.status === 'draft') return 'ร่างยังไม่ได้เข้าทะเบียน — ลบทิ้งแทน';
  return null;
}

// เปลี่ยนสถานะได้เฉพาะเส้นที่มีความหมาย (กันหน้าจอส่งค่าที่ทำให้ย้อนกลับไปเป็นร่าง)
const ALLOWED_TRANSITIONS = {
  draft: ['developing'],              // ผ่าน acceptScent เท่านั้น
  developing: ['active', 'archived'],
  active: ['developing', 'archived'], // กลับไปพัฒนาต่อได้ (ลูกค้าขอปรับ)
  archived: ['active'],               // เอากลับมาใช้ได้
};

export function scentTransitionError(scent, next) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (!SCENT_STATUSES.includes(next)) return 'สถานะไม่ถูกต้อง';
  if (scent.status === next) return 'สถานะเดิมอยู่แล้ว';
  if (!(ALLOWED_TRANSITIONS[scent.status] || []).includes(next)) {
    return `เปลี่ยนจาก "${SCENT_STATUS_LABELS[scent.status]}" เป็น "${SCENT_STATUS_LABELS[next]}" ไม่ได้`;
  }
  return null;
}

// ── ตรวจข้อมูลก่อนสร้าง/แก้ — คืน { value, error } ───────────────────────
export function normalizeScentInput(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อกลิ่น' };
  if (name.length > 200) return { value: null, error: 'ชื่อกลิ่นยาวเกิน 200 ตัวอักษร' };

  // ⚠️ มติ 9 — ไม่มี "กลิ่นกลาง" ในระบบนี้ ทุกกลิ่นเป็นของลูกค้ารายใดรายหนึ่ง
  const customerId = String(body.customerId ?? '').trim();
  if (!customerId) return { value: null, error: 'ต้องเลือกลูกค้าเจ้าของกลิ่น' };

  const code = String(body.code ?? '').trim() || null;
  if (code && code.length > 100) return { value: null, error: 'รหัสกลิ่นยาวเกิน 100 ตัวอักษร' };

  const note = String(body.note ?? '').trim();
  if (note.length > 2000) return { value: null, error: 'หมายเหตุยาวเกิน 2000 ตัวอักษร' };

  return {
    value: {
      name,
      code,
      customerId,
      customerName: String(body.customerName ?? '').trim() || null,
      dealId: String(body.dealId ?? '').trim() || null,
      ownerId: String(body.ownerId ?? '').trim() || null,
      ownerName: String(body.ownerName ?? '').trim() || null,
      note: note || null,
    },
    error: null,
  };
}
