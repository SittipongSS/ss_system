// ── ทะเบียนกลิ่น (mig 0171) — logic ล้วน ใช้ร่วมทั้ง API และหน้าจอ ─────────
//
// ทำไมต้องมีตารางนี้: ก่อนหน้านี้ "กลิ่น" ไม่มีตัวตนในระบบเลย มีแค่ชื่อขั้นตอนใน
// ไทม์ไลน์ ("ส่งกลิ่น ครั้งที่ 1") กับข้อความในทะเบียนวัสดุ — คนเลยไปกรอกชื่อกลิ่น
// ลงช่อง "ชื่อสูตร" ของสินค้าแทน (เจอจริงบน prod 10 แถว) แล้วข้อมูลสองอย่างปนกัน
//
// ⭐ **กลิ่น 1 ตัวถูกส่งครั้งเดียวตลอดชีวิต** — ลูกค้าให้แก้ ⇒ ได้กลิ่น *ตัวใหม่*
// ที่มีรหัส ชื่อ วันที่ ของตัวเอง แล้วชี้กลับตัวเดิมด้วย `derivedFromScentId`
// (มติ 2026-08-04) ⇒ ไม่มีตาราง Rev. อีกแล้ว · วันที่ส่งอยู่บนตัวกลิ่นเอง (`sentAt`)
//
// ทำไมสายพันธุ์ดีกว่า Rev.: Rev. บังคับให้เป็นเส้นตรง แต่งานจริงแตกกิ่งได้ —
// ลูกค้าให้แก้ทั้ง A และ C พร้อมกัน แล้วเลือกตัวที่แตกจาก A
import { canUser, isReadOnlyObserver, isSuperuser } from '@/lib/permissions';

export const SCENT_STATUSES = ['draft', 'developing', 'active', 'archived'];

export const SCENT_STATUS_LABELS = {
  draft: 'ร่าง — รอ RD รับเข้าทะเบียน',
  developing: 'กำลังพัฒนา',
  active: 'ใช้งานได้',
  archived: 'เลิกใช้',
};

// โทนของ pill = ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี — หน้าจอจึงไม่ต้องรู้จัก
// token สีเลย และเปลี่ยนดีไซน์ป้ายได้ที่ Badge.module.css ที่เดียวทั้งระบบ
export const SCENT_STATUS_TONES = {
  draft: 'neutral',
  developing: 'info',
  active: 'success',
  archived: 'neutral',
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

// 🗑 `canRecordScentFeedback` ถูกลบไปพร้อมตาราง Rev (0206) — ผลตอบรับของลูกค้า
// ไม่ได้อยู่ที่ทะเบียนอีกแล้ว แต่อยู่บน **แถวคำร้อง** (`outcome` — mig 0204) ซึ่งมี
// ด่านของตัวเองที่ `HOP_OWNER.outcome = 'requester'` (ฝ่ายขายเป็นคนบันทึก ตรงกับ
// เจตนาเดิมทุกประการ — คนที่คุยกับลูกค้าจริงคือฝ่ายขาย)

// แก้ตัวกลิ่น (ชื่อ/ลูกค้า/หมายเหตุ): ร่างของตัวเองแก้ได้ · รับเข้าทะเบียนแล้ว
// เป็นงานของ RD (ชื่อกลิ่นถูกอ้างจากที่อื่นแล้ว เปลี่ยนมั่วไม่ได้)
export function canEditScent(user, scent) {
  if (!scent) return false;
  if (isScentRegistrar(user)) return true;
  if (scent.status !== 'draft') return false;
  return canProposeScent(user) && scent.createdById === user?.id;
}

// ลบได้เฉพาะร่างที่ยังไม่มีใครอ้าง — ของที่รับเข้าทะเบียนแล้วเป็นหลักฐาน
//
// ⚠️ `linkedCount` มาแทน `revisionCount` เดิม (ตารางรอบถูกยกเลิกไปพร้อมมติที่ว่า
// แก้แล้วได้กลิ่นตัวใหม่) · ตัวที่ต้องกันตอนนี้คือ **คำร้องที่ผลิตกลิ่นตัวนี้ขึ้นมา**
// เพราะ `producedScentId` เป็น FK แบบ SET NULL ⇒ ลบผ่านได้เงียบ ๆ แล้วคำร้อง
// จะชี้ไปที่ว่าง สายพันธุ์ของงานขาดตรงนั้นและต่อกลับไม่ได้อีก
export function deleteScentError(scent, { linkedCount = 0 } = {}) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (scent.status !== 'draft') return 'ลบได้เฉพาะร่าง — กลิ่นที่รับเข้าทะเบียนแล้วให้เปลี่ยนเป็น "เลิกใช้" แทน';
  if (linkedCount > 0) return 'กลิ่นนี้ถูกอ้างอยู่ในคำร้องแล้ว ลบไม่ได้';
  return null;
}

// ── ด่านของแต่ละ action — คืนข้อความไทย หรือ null ถ้าผ่าน ────────────────
export function acceptScentError(scent, { code } = {}) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (scent.status !== 'draft') return 'กลิ่นนี้รับเข้าทะเบียนไปแล้ว';
  if (!String(code ?? '').trim()) return 'ต้องระบุรหัสกลิ่นตอนรับเข้าทะเบียน';
  return null;
}

// บันทึกวันที่ส่งกลิ่นให้ลูกค้า — ร่างยังไม่ใช่ของจริง เก็บเข้ากรุแล้วก็ไม่ส่งแล้ว
// ⚠️ ด่านนี้ยกกฎมาจาก `sendRevisionError` เดิมทั้งชุด **ยกเว้น** ข้อ "Rev ก่อนหน้า
// ยังรอผลอยู่" ซึ่งหมดความหมายไปพร้อมตารางรอบ (กลิ่นตัวหนึ่งมีวันส่งได้วันเดียว)
export function sendScentError(scent, { sentAt } = {}) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (scent.status === 'draft') {
    return 'กลิ่นนี้ยังเป็นร่าง — RD ต้องรับเข้าทะเบียนก่อนจึงจะบันทึกวันที่ส่งได้';
  }
  if (scent.status === 'archived') {
    return `กลิ่นนี้อยู่ในสถานะ "${SCENT_STATUS_LABELS.archived}" — เปิดใช้ก่อนจึงจะส่งได้`;
  }
  const at = String(sentAt ?? '').trim();
  if (!at) return 'ต้องระบุวันที่ส่งกลิ่น';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return 'วันที่ส่งกลิ่นไม่ถูกต้อง';
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

// ── สายพันธุ์: "กลิ่นตัวนี้แก้มาจากตัวไหน" ────────────────────────────────
//
// ⭐ มาแทน Rev. — Rev. บังคับให้เป็นเส้นตรง แต่งานจริงแตกกิ่งได้ (ลูกค้าให้แก้ทั้ง
// A และ C พร้อมกัน แล้วเลือกตัวที่แตกจาก A)
//
// ⚠️ ด่านนี้ต้องอยู่ที่ **server** ไม่ใช่แค่กรองตัวเลือกบนจอ — ตัวเลือกที่กรองแล้ว
// กันคนกดผิด แต่ไม่กันคนยิง API ตรง · กลิ่นข้ามลูกค้าเป็นข้อห้ามระดับโมเดล (มติ 9)
// เท่ากับตัวตนของกลิ่นเอง ไม่ใช่แค่ความสะดวกของฟอร์ม
//
// `parent` = แถวกลิ่นต้นทางที่ route โหลดมาให้ (null = หาไม่เจอ)
export function derivedFromError(parent, { customerId, id } = {}) {
  if (!parent) return 'ไม่พบกลิ่นต้นทางที่อ้างถึง';
  if (id && parent.id === id) return 'กลิ่นอ้างตัวเองเป็นต้นทางไม่ได้';
  if (parent.customerId !== customerId) {
    return 'กลิ่นต้นทางเป็นของลูกค้าคนละราย — อ้างข้ามลูกค้าไม่ได้';
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

  // ⭐ ชื่อที่ลูกค้าตั้งเอง — เป็นวิธีที่ลูกค้าโทรมาถามจริง ("ขอตัว Summer Breeze")
  // ⚠️ **ห้ามแสดงแทนรหัส/ชื่อของเรา ต้องแสดงคู่กันเสมอ** — ปล่อยให้แทนกันเมื่อไร
  // จะเข้าโรคเดิมที่ 0171 บันทึกไว้ (ของจริง: สินค้า 10 แถวเอาชื่อกลิ่นไปกรอก
  // ช่องชื่อสูตร แล้วไม่มีใครกลับมาตรวจ)
  const customerTradeName = String(body.customerTradeName ?? '').trim().replace(/\s+/g, ' ');
  if (customerTradeName.length > 200) {
    return { value: null, error: 'ชื่อที่ลูกค้าเรียกยาวเกิน 200 ตัวอักษร' };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 2000) return { value: null, error: 'หมายเหตุยาวเกิน 2000 ตัวอักษร' };

  return {
    value: {
      name,
      code,
      customerId,
      customerTradeName: customerTradeName || null,
      derivedFromScentId: String(body.derivedFromScentId ?? '').trim() || null,
      customerName: String(body.customerName ?? '').trim() || null,
      dealId: String(body.dealId ?? '').trim() || null,
      ownerId: String(body.ownerId ?? '').trim() || null,
      ownerName: String(body.ownerName ?? '').trim() || null,
      note: note || null,
    },
    error: null,
  };
}

// ── ที่มาของกลิ่น ────────────────────────────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-08: *"ทะเบียนกลิ่นเป็นข้อมูลกลางที่ข้อมูลจะมาจากทาง flow
// พัฒนากลิ่นเป็นหลัก · การเพิ่มจากระบบทะเบียนโดยตรงจะเป็นกลิ่นเดิมที่เคยออกแบบแล้ว"*
// ⇒ เปิดทะเบียนมาต้องแยกออกทันทีว่าตัวไหนเป็นตัวไหน
//
// ⚠️ **ตัดสินจาก `briefId` ไม่ใช่ `dealId`** — ดีลกรอกเองได้ตอนเพิ่มตรง (POST รับ
// `dealId`) ส่วนบรีฟเกิดได้ทางเดียวคือตอน RD กดส่งในคำร้อง
export const SCENT_SOURCES = [
  { value: 'request', label: 'มาจากคำร้อง' },
  { value: 'manual', label: 'เพิ่มเข้าทะเบียนเอง' },
];

export function scentSourceKind(scent) {
  return scent?.briefId ? 'request' : 'manual';
}

/**
 * ป้ายที่มาแบบพร้อมแสดง — `{ kind, label, requestId }`
 *
 * ⚠️ `briefId` มีแต่ตามกลับไม่เจอคำร้อง = คำร้องถูกลบไปแล้ว · ยังเป็น "มาจากคำร้อง"
 * อยู่ดี แค่กดต่อไม่ได้ — ตกเป็น "เพิ่มเอง" เมื่อไรคือโกหกเรื่องที่มาของข้อมูล
 */
export function scentSourceLabel(scent) {
  const kind = scentSourceKind(scent);
  if (kind === 'manual') return { kind, label: 'เพิ่มเข้าทะเบียนเอง', requestId: null };
  const request = scent?.sourceRequest || null;
  if (!request) return { kind, label: 'มาจากคำร้อง (ถูกลบแล้ว)', requestId: null };
  return {
    kind,
    label: `คำร้อง ${request.docNo || request.id}`,
    requestId: request.id || null,
  };
}

// ตัวกรอง "ที่มา" บนทะเบียน — '' = ทั้งหมด
export function matchesScentSource(scent, filter) {
  if (!filter) return true;
  return scentSourceKind(scent) === filter;
}
