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
import { canUser, isRdRole, isReadOnlyObserver, isSuperuser } from '@/lib/permissions';

export const SCENT_STATUSES = ['draft', 'developing', 'active', 'archived'];

// ⭐ **"รอเข้าทะเบียน" ไม่ใช่ "ร่าง — รอ RD รับเข้าทะเบียน"** (มติผู้ใช้ 2026-08-08) —
// "ร่าง" ซ้ำกับโทน neutral ของป้ายอยู่แล้ว · "RD" ตัดได้เพราะทะเบียนกลิ่นมี RD เป็น
// เจ้าของอยู่แล้ว (isScentRegistrar) ⇒ 156px → 89px · ชุดนี้เคยมีตัวเดียวยาวเป็น
// **สองเท่า** ของตัวถัดไป (156 vs 81) ตอนนี้ช่วง 50–89
// วัดจริงบน dev server · ดู UI_DESIGN_SYSTEM.md §ป้ายในตาราง
export const SCENT_STATUS_LABELS = {
  draft: 'รอเข้าทะเบียน',
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
  return isRdRole(user?.role) || isSuperuser(user?.role);
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

/* ── ใครกรอกรหัส/วันที่/สถานะที่ขอ ลงในร่างได้ (มติผู้ใช้ 2026-08-19) ─────────
   ⭐ เดิมช่องพวกนี้เป็นของ RD คนเดียว ⇒ ฝ่ายขายที่ถือข้อมูลกลิ่นเก่าจากระบบเดิม
   กรอกได้แค่ชื่อ+ลูกค้า แล้วรหัส/วันที่/สถานะจริงต้องส่งต่อ RD นอกระบบ
   ⇒ เปิดให้ **คนที่เสนอร่างได้ กรอกได้ครบตั้งแต่แรก**
   ⚠️ **ไม่ได้แปลว่าอนุมัติตัวเองได้** — ร่างยังเป็น `draft` และปลายทางจริงยังมาจาก
   `accept` ของ RD/admin เท่านั้น (`isScentRegistrar`)
   ⚠️ ของที่ **รับเข้าทะเบียนแล้ว** กลับไปเป็นของ RD เหมือนเดิม — รหัสตอนนั้นเป็น
   ตัวตนที่ระบบอื่นอ้างถึงแล้ว (ใบเสนอราคา · สินค้า · สูตร) ไม่ใช่ช่องกรอกอิสระ */
export function canSetScentCode(user, scent = null) {
  if (isScentRegistrar(user)) return true;
  if (!canProposeScent(user)) return false;
  if (!scent) return true;                      // โหมดสร้าง — ยังไม่มีแถว
  return scent.status === 'draft' && scent.createdById === user?.id;
}

// ลบได้เฉพาะร่างที่ยังไม่มีใครอ้าง — ของที่รับเข้าทะเบียนแล้วเป็นหลักฐาน
//
// ⚠️ `linkedCount` มาแทน `revisionCount` เดิม (ตารางรอบถูกยกเลิกไปพร้อมมติที่ว่า
// แก้แล้วได้กลิ่นตัวใหม่)
//
// ⭐ **หลัง mig 0232 นับให้ครบทุก pointer ที่เป็น RESTRICT** — คำร้องทั้งใบ ·
// บรรทัดที่ขอกลิ่นนี้ · บรรทัดที่ผลิตกลิ่นนี้ขึ้นมา · ทะเบียนราคา
// 🐞 เดิมนับแค่ `producedScentId` ⇒ กลิ่นที่ถูกอ้างทางอื่นผ่านด่านนี้ไปได้ แล้วไป
// ตายที่ฐานข้อมูลด้วย 23503 ซึ่งขึ้นจอเป็นข้อความอังกฤษที่ผู้ใช้อ่านไม่ออก
// (ก่อน 0232 แย่กว่านั้นอีก: ผ่านแล้วลิงก์หายเงียบโดยไม่มี error เลย)
/* ⭐ **ลบได้ถึงขั้น "กำลังพัฒนา"** (มติผู้ใช้ 2026-08-18) — เดิมลบได้เฉพาะร่าง
   ⇒ กลิ่นที่ RD เพิ่งรับเข้าทะเบียนแล้วพิมพ์ผิด/ส่งผิดตัว แก้ไม่ได้นอกจากเก็บเข้ากรุ
   ทิ้งไว้เป็นขยะในทะเบียนตลอดกาล · ขั้นนี้ยังไม่มีใครใช้กลิ่นจริง (ลูกค้ายังไม่คอนเฟิร์ม
   ⇒ ยังไม่ `active`) จึงเป็นช่วงที่ลบได้โดยไม่กระทบใคร
   ⚠️ `active`/`archived` ยังห้ามลบเหมือนเดิม — ของที่ลูกค้าคอนเฟิร์มแล้วเป็นหลักฐาน
   ⚠️ ด่าน `linkedCount` ยังอยู่ครบ: ถูกอ้างจากที่ไหนก็ลบไม่ได้ (ลบจากในคำร้องมีเส้น
   ของตัวเองที่ลบแถวไปพร้อมกัน — ดู `lib/requests/rowDelete.js`) */
const DELETABLE_SCENT_STATUS = new Set(['draft', 'developing']);

export function deleteScentError(scent, { linkedCount = 0 } = {}) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (!DELETABLE_SCENT_STATUS.has(scent.status)) {
    return 'ลบได้เฉพาะร่างหรือกลิ่นที่ยังกำลังพัฒนา — กลิ่นที่ใช้งานแล้วให้เปลี่ยนเป็น "เลิกใช้" แทน';
  }
  if (linkedCount > 0) return `กลิ่นนี้ถูกอ้างอยู่ ${linkedCount} ที่ (คำร้อง/ทะเบียนราคา) ลบไม่ได้`;
  return null;
}

// ── ด่านของแต่ละ action — คืนข้อความไทย หรือ null ถ้าผ่าน ────────────────
/* ⭐ **รหัสมาจากร่างได้แล้ว** (มติผู้ใช้ 2026-08-19) — ฝ่ายขายที่ย้ายข้อมูลจาก
   ระบบเก่ากรอกรหัสจริงมาตั้งแต่ตอนเสนอ ⇒ ตอน RD กดรับไม่ต้องพิมพ์ซ้ำ
   ⚠️ ยังต้อง **มีรหัส** เสมอ (constraint `scents_code_required_when_accepted`)
   แค่ไม่สนว่ามาจากช่องในโมดัลหรือจากแถว */
export function acceptScentCode(scent, body = {}) {
  const typed = String(body.code ?? '').trim();
  return typed || String(scent?.code ?? '').trim() || '';
}

export function acceptScentError(scent, body = {}) {
  if (!scent) return 'ไม่พบกลิ่น';
  if (scent.status !== 'draft') return 'กลิ่นนี้รับเข้าทะเบียนไปแล้ว';
  if (!acceptScentCode(scent, body)) return 'ต้องระบุรหัสกลิ่นตอนรับเข้าทะเบียน';
  return null;
}

/* สถานะปลายทางตอนกดรับเข้าทะเบียน — ผู้ตรวจเลือกได้ · ไม่เลือก = ตามที่ผู้เสนอขอมา
   · ไม่มีทั้งคู่ = `developing` เหมือนพฤติกรรมเดิมทุกประการ
   ⚠️ **ค่าที่ผู้เสนอขอไม่ใช่คำสั่ง** — RD เห็นแล้วเปลี่ยนได้เสมอ นั่นคือทั้งหมด
   ของขั้นตอนนี้ (ยืนยันความถูกต้อง ไม่ใช่ปั๊มตรายาง) */
export function acceptedScentStatus(scent, body = {}) {
  const chosen = String(body.status ?? '').trim();
  if (NEW_SCENT_STATUSES.includes(chosen)) return chosen;
  const proposed = String(scent?.proposedStatus ?? '').trim();
  return NEW_SCENT_STATUSES.includes(proposed) ? proposed : 'developing';
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

  // ── วันที่ของกลิ่นเก่าที่เพิ่มเข้าทะเบียนเอง (มติผู้ใช้ 2026-08-08) ────────
  //
  // ⭐ ทางเพิ่มตรงมีไว้ลง **กลิ่นเดิมที่เคยออกแบบไว้ก่อนมีระบบ** ⇒ วันผลิตกับวันส่ง
  // ของมันเกิดไปแล้วในอดีต · ไม่มีช่องให้กรอกตอนสร้าง = ต้องบันทึกแล้วกดปุ่มซ้ำ
  // อีกรอบ และช่อง "วันที่ผลิต" จะว่างถาวรเพราะไม่มีทางเขียนเลยนอกจากผ่านคำร้อง
  //
  // ⚠️ ไม่บังคับทั้งคู่ — กลิ่นเก่าบางตัวไม่มีใครจำวันได้แล้ว · ว่างแล้วขึ้น N/A
  // ตรงไปตรงมา ดีกว่าบังคับให้เดาวันแล้วได้ข้อมูลที่ดูน่าเชื่อถือแต่ผิด
  const dateField = (raw, label) => {
    const at = String(raw ?? '').trim();
    if (!at) return { value: null, error: null };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return { value: null, error: `${label}ไม่ถูกต้อง` };
    return { value: at, error: null };
  };
  const produced = dateField(body.producedAt, 'วันที่ผลิตกลิ่น');
  if (produced.error) return { value: null, error: produced.error };
  const sent = dateField(body.sentAt, 'วันที่ส่งลูกค้า');
  if (sent.error) return { value: null, error: sent.error };

  return {
    value: {
      name,
      code,
      customerId,
      customerTradeName: customerTradeName || null,
      producedAt: produced.value,
      sentAt: sent.value,
      derivedFromScentId: String(body.derivedFromScentId ?? '').trim() || null,
      customerName: String(body.customerName ?? '').trim() || null,
      dealId: String(body.dealId ?? '').trim() || null,
      ownerId: String(body.ownerId ?? '').trim() || null,
      ownerName: String(body.ownerName ?? '').trim() || null,
      /* ⭐ **ผู้ปรุงกลิ่น** (มติผู้ใช้ 2026-09-02) — คนละคนกับ `ownerId` ที่ระบบเซ็ตให้เอง
         เป็นคนกดรับกลิ่นเข้าทะเบียน (ของจริง 115 กลิ่น: ล้วนเป็นผู้ประสานงาน/แอดมิน)
         ⚠️ **ชื่อแช่แข็ง ไม่ซิงก์ตามบัญชี** — เป็นข้อเท็จจริงว่าใครปรุงกลิ่นนี้ตอนนั้น
         ⚠️ `perfumerId` ว่างได้แม้มีชื่อ — กลิ่นเก่าที่กรอกย้อนหลังอาจเป็นคนที่ไม่มีบัญชี */
      perfumerId: String(body.perfumerId ?? '').trim() || null,
      perfumerName: String(body.perfumerName ?? '').trim().slice(0, 200) || null,
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
// ⚠️ ป้ายในตัวกรองต้องสะกดตรงกับป้ายในตาราง (`scentSourceLabel`) — คนกรอง "เพิ่มเอง"
// แล้วต้องเห็นแถวที่ป้ายเขียนว่า "เพิ่มเอง" ไม่ใช่คำอื่นที่แปลว่าอย่างเดียวกัน
export const SCENT_SOURCES = [
  { value: 'request', label: 'มาจากคำร้อง' },
  { value: 'manual', label: 'เพิ่มเอง' },
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
  if (kind === 'manual') return { kind, label: 'เพิ่มเอง', requestId: null };
  const request = scent?.sourceRequest || null;
  // ⚠️ "คำร้องถูกลบ" ไม่ใช่ "มาจากคำร้อง (ถูกลบแล้ว)" — เคสหายากที่เคยดันคอลัมน์
  // กว้างกว่าเลขที่คำร้องซึ่งเป็นเคสปกติ (146px vs 130px)
  if (!request) return { kind, label: 'คำร้องถูกลบ', requestId: null };
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

// ── สถานะตอนสร้างกลิ่นใหม่ ───────────────────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-08: ทางเพิ่มตรงจากทะเบียนมีไว้ลง **กลิ่นเดิมที่ลูกค้าอนุมัติ
// ไปแล้ว** ⇒ ควรลงเป็น `active` ได้ตั้งแต่แรก ไม่ใช่บังคับ `developing` แล้วให้ RD
// กดเปลี่ยนอีกรอบทุกใบ
//
// ⚠️ **เลือกได้แค่สองสถานะที่ "เป็นของจริงแล้ว"** —
//   · `draft`    เป็นของทางเสนอร่าง (ฝ่ายขาย) ไม่ใช่ของที่เลือกเอง
//   · `archived` เป็น action แยก (เก็บเข้ากรุ) ไม่ใช่สถานะเริ่มต้นของอะไร
// ⚠️ ฝ่ายขายที่เสนอร่างได้ `draft` เสมอไม่ว่าจะส่งอะไรมา — "ใส่รหัส = รับเข้าทะเบียน"
// เป็นอำนาจของ RD (ดู isScentRegistrar) ปล่อยให้เลือกสถานะเองเมื่อไรก็ข้ามด่านนั้น
export const NEW_SCENT_STATUSES = ['developing', 'active'];

export function newScentStatus(requested, accepted = false) {
  if (!accepted) return 'draft';
  const value = String(requested ?? '').trim();
  return NEW_SCENT_STATUSES.includes(value) ? value : 'developing';
}

/* ── สถานะที่ผู้เสนอร่างบอกว่าเป็นจริง (mig 0269 · มติผู้ใช้ 2026-08-19) ──────
   ฝ่ายขายถือข้อมูลกลิ่นเก่าจากระบบเดิม รวมถึงรู้ว่าตัวไหนลูกค้าอนุมัติไปแล้ว
   ⇒ เก็บไว้เป็นค่าตั้งต้นให้คนตรวจ แทนที่จะให้ RD ไปไล่ถามใหม่ทุกแถว
   ⚠️ **ไม่ใช่ `status`** — แถวยังเป็น `draft` และยังใช้งานไม่ได้จนกว่า RD จะรับ */
export function proposedScentStatus(requested) {
  const value = String(requested ?? '').trim();
  return NEW_SCENT_STATUSES.includes(value) ? value : null;
}

/* ── ฟอร์มทะเบียนกลิ่น → payload ของ API ───────────────────────────────────
 *
 * ⭐ **ที่เดียวสำหรับสองจอ** — เหตุผลเดียวกับ `formulaFormPayload` (2026-08-19):
 * หน้ารายละเอียดเปิดฟอร์มตัวเดียวกับหน้ารายการได้แล้ว ⇒ ตัวสร้าง payload ต้องเป็น
 * ก้อนเดียว ไม่งั้นสองจอเลื่อนออกจากกัน
 * ⚠️ **ส่งรหัสไปเสมอเมื่อมีสิทธิ์ รวมตอนช่องว่าง** — ไม่ส่ง = server คงค่าเดิมแล้ว
 * ตอบ 200 ⇒ ขึ้นว่าบันทึกสำเร็จทั้งที่ไม่มีอะไรเปลี่ยน (ผู้ใช้ทัก 2026-08-10)
 * ⚠️ วันที่/สถานะส่งเฉพาะตอน **สร้างใหม่** — โหมดแก้มี action ของตัวเอง
 * ⭐ ฝ่ายขายส่งวัน/สถานะมาได้แล้ว (มติผู้ใช้ 2026-08-19) — `status` ที่ส่งไปลงเป็น
 * `proposedStatus` ให้เองที่ server (`createScent`) แถวยังเป็นร่างเหมือนเดิม
 */
export function scentFormPayload(value = {}, {
  canSetCode = false, mode = 'create', customerName = null,
} = {}) {
  const payload = {
    name: value.name,
    customerId: value.customerId,
    customerName,
    customerTradeName: value.customerTradeName,
    derivedFromScentId: value.derivedFromScentId,
    note: value.note,
    /* ผู้ปรุงกลิ่น (mig 0333) — ส่งทั้งสองโหมด (สร้าง/แก้) เพราะกลิ่นเก่าที่กรอก
       ย้อนหลังคือเหตุผลหลักที่ช่องนี้มี ⇒ ต้องแก้ของที่ลงไปแล้วได้ด้วย
       ⚠️ ส่งค่าว่างไป = ล้างผู้ปรุง (คนกรอกผิดคนต้องถอนได้) ไม่ใช่ "ไม่แตะ" */
    perfumerId: value.perfumerId ?? null,
    perfumerName: value.perfumerName ?? null,
  };
  if (canSetCode) payload.code = String(value.code ?? '').trim();
  if (mode === 'create') {
    if (value.producedAt) payload.producedAt = value.producedAt;
    if (value.sentAt) payload.sentAt = value.sentAt;
    payload.status = value.status;
  }
  return payload;
}
