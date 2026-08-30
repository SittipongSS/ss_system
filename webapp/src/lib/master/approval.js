// ── Re-approval on edit (org rule: ทุกระบบ) ───────────────────────────────
// Policy: any APPROVED master-data record (customer / product) that is later
// edited must drop back to 'pending' and be re-approved by an AE Supervisor
// (canApproveMasterData). This keeps an approved record from silently changing
// after sign-off.
//
// Returns a field patch to merge into the update, or null when no reset is
// needed. The caller stamps `submittedBy/Name` with the editor so the
// re-submission is attributed correctly; approval stamps are cleared.
//
// ⚠️ ต้นทุนของการ reset ที่ต้องชั่งทุกครั้งก่อนเพิ่มฟิลด์: 'pending' = แถวนั้น
// **หลุดจากลิสต์เลือกทุกหน้าทันที** เพราะ GET /api/customers และ /api/products
// คืนเฉพาะ approved — ลูกค้าที่กำลังจะออกใบเสนอราคาหายจาก picker กลางทาง
// (เคสจริง 2026-07-26/27). จึงมีข้อยกเว้นตามมติผู้ใช้ด้านล่าง
//
// NOTE: excise_registrations follow the STRICTER rule (locked when approved +
// explicit "ขอแก้ไข" revise) handled in the registration route, not here.

// ผู้ติดต่อของลูกค้า — แก้ได้โดยไม่ต้องอนุมัติใหม่ (มติผู้ใช้ 2026-07-27).
// คนติดต่อ/เบอร์/อีเมลเปลี่ยนบ่อยกว่าตัวนิติบุคคลและไม่ใช่ตัวตนของลูกค้า ส่วนชื่อ
// เลขภาษี สาขา **ที่อยู่** รหัส AR ทีมดูแล ยังต้องอนุมัติใหม่ เพราะไปโผล่บน
// เอกสารที่ออกให้ลูกค้าและกรมสรรพสามิต
// คอลัมน์ 3 ตัวหลังเป็นค่า mirror ของผู้ติดต่อคนแรก (mig 0033) จึงยกเว้นตามกัน
export const CUSTOMER_CONTACT_FIELDS = ['contacts', 'contactPerson', 'contactPhone', 'email'];

// หมายเหตุประจำสินค้า (mig 0317) — แก้ได้โดยไม่ต้องอนุมัติใหม่ (มติผู้ใช้ 2026-08-30).
// ชั่งตามย่อหน้า ⚠️ ด้านบน: ข้อความนี้ไม่ใช่ตัวตนของสินค้า ไม่กระทบราคา ปริมาตร หรือ
// รหัส — ของที่ด่านอนุมัติมีไว้คุม · ตรงข้ามกับต้นทุนของการ reset ซึ่งคือสินค้าหลุด
// จาก picker ทุกหน้าทันที ทั้งที่คนแค่ไปเกลาถ้อยคำหมายเหตุ
// ⚠️ ข้อความนี้ **ขึ้นเอกสารที่ส่งลูกค้า** — คนแก้ต้องรู้ตัว จึงยังบันทึกลงเธรดของ
// สินค้าตามปกติ (appendUpdate) และใบที่ออกไปแล้วไม่ถูกแตะ (ก๊อปตอนสร้างบรรทัด)
export const PRODUCT_DOC_NOTE_FIELDS = ['docNote', 'docNoteEn'];

// ที่อยู่หลายรายการ (mig 0202) — ตัวลิสต์ addresses[] และที่อยู่จัดส่งยกเว้นได้
// แต่ **ที่อยู่ออกเอกสาร/สาขาไม่ยกเว้น**: address/branchCode เป็นกระจกของที่อยู่
// ออกบิลหลัก ซึ่งอยู่บนเอกสารถึงกรมสรรพสามิต — แก้แล้วต้องอนุมัติใหม่เหมือนเดิม
// (กติกาเดิมทุกอย่างจึงคงอยู่ครบ เพราะทุกการแก้ที่อยู่หลักจะขยับกระจกเสมอ)
//
// ที่ต้องยกเว้น addresses[] เอง เพราะไม่งั้น: (1) เพิ่มคลัง/ที่อยู่จัดส่งใหม่ =
// ลูกค้าหลุดจากลิสต์ทุกหน้าไปรออนุมัติ ทั้งที่ตัวตนไม่เปลี่ยน · (2) ลูกค้าแถวเก่า
// ที่ยังไม่ backfill พอเปิดฟอร์มแล้วกดบันทึกเฉย ๆ ลิสต์จะถูกเขียนครั้งแรก
// (ว่าง → มีค่า) แล้วนับเป็น "แก้" ทั้งที่ผู้ใช้ไม่ได้แตะอะไร
export const CUSTOMER_ADDRESS_EXEMPT_FIELDS = ['addresses', 'shippingAddress'];

// ── เหตุผลตอนตีกลับ/ปลดอนุมัติข้อมูลหลัก ──────────────────────────────────
// เดิมลูกค้า/สินค้าตีกลับได้โดย "ไม่ต้องบอกเหตุ" (`body.rejectionReason || null`) ต่างจาก
// ทุกโมดูลอื่นในระบบที่บังคับ — คนสร้างเห็นแค่ป้ายแดงแล้วต้องเดาเองว่าต้องแก้อะไร
// ไม่ตั้งขั้นต่ำ 10 ตัวอักษรแบบเอกสารที่มีลายเซ็น (QT/SO) เพราะเหตุผลของข้อมูลหลัก
// สั้นได้จริงและยังสื่อครบ ("ชื่อซ้ำ", "เลขภาษีผิด")
export const REJECTION_REASON_MAX = 500;

export function normalizeRejectionReason(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function rejectionReasonError(value, { label = 'ที่ตีกลับ' } = {}) {
  const reason = normalizeRejectionReason(value);
  if (!reason) return `กรุณาระบุเหตุผล${label}`;
  if (reason.length > REJECTION_REASON_MAX) {
    return `เหตุผลต้องไม่เกิน ${REJECTION_REASON_MAX} ตัวอักษร`;
  }
  return '';
}

/* 🐞 **jsonb คืนคีย์คนละลำดับกับที่โค้ดสร้าง** (พบ 2026-08-27 ตอนไล่กดฟอร์มลูกค้า)
   Postgres เก็บ jsonb แบบเรียงคีย์เอง ⇒ `brands` ที่อ่านกลับมาเป็น
   `[{"en":"RAM","th":"ร่ำ"}]` แต่ `normalizeBrands` สร้าง `[{"th":...,"en":...}]`
   JSON.stringify ตรง ๆ จึงไม่เท่ากันทั้งที่เป็นค่าเดียวกัน ⇒ ทุกครั้งที่กดบันทึก
   ลูกค้าที่ **มีแบรนด์** จะถูกนับว่า "แก้ฟิลด์ brands" แม้ไม่ได้แตะอะไรเลย
   ผลจริง: เปิดฟอร์มแล้วกดบันทึกเฉย ๆ ลูกค้าที่อนุมัติแล้วเด้งกลับเป็น "รออนุมัติ"
   และหลุดจากทุก picker ทันที (วัดกับ AR-802 ซึ่งมีแบรนด์ RAM)
   ⇒ ต้องเรียงคีย์ก่อนเทียบ · ลำดับใน **อาร์เรย์** ยังมีความหมาย ไม่เรียง */
const stableJson = (value) => JSON.stringify(value ?? null, (_key, val) => {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
  return Object.fromEntries(Object.keys(val).sort().map((k) => [k, val[k]]));
});

const sameValue = (a, b) => {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if ((a && typeof a === 'object') || (b && typeof b === 'object')) {
    try {
      return stableJson(a) === stableJson(b);
    } catch {
      return false;
    }
  }
  return String(a ?? '') === String(b ?? '');
};

// ฟิลด์ที่ "เปลี่ยนค่าจริง" เทียบกับแถวเดิม — ต้องเทียบค่า ไม่ใช่ดูว่า payload ส่ง
// key อะไรมา เพราะฟอร์มแก้ไขส่งทั้งก้อนทุกครั้ง (CustomerForm/ProductForm ตัวเดียว
// กับตอนสร้าง) ถ้าดูแค่ key ทุกการแก้จะนับเป็น "แก้ทุกฟิลด์" และข้อยกเว้นจะตายสนิท
export function changedFieldsAgainst(record, updates = {}, { ignore = [] } = {}) {
  return Object.keys(updates || {})
    .filter((key) => !ignore.includes(key))
    .filter((key) => !sameValue(updates[key], record?.[key]));
}

/* 🐞 **ระเบียนที่ถูกตีกลับเคยติดตาย** (พบตอน UAT 2026-08-30 — เดินครบวงเป็นครั้งแรก)
   เดิมด่านนี้เช็คแค่ `=== 'approved'` ⇒ ของที่ถูก **ตีกลับ** แก้ตามเหตุผลแล้วกดบันทึก
   สถานะยังเป็น 'rejected' เหมือนเดิม · คิวหน้าทะเบียนกรองเฉพาะ 'pending' และการ์ด
   จัดการก็ซ่อนปุ่มด้วยเงื่อนไขเดียวกัน ⇒ **ไม่มีปุ่มไหนทั้งเว็บดันกลับเข้าคิวได้เลย**
   ของที่ถูกตีกลับจึงค้างถาวรจนกว่าจะมีคนยิง API เอง
   ⇒ แก้ของที่ถูกตีกลับ = ส่งตรวจใหม่ ซึ่งเป็นสิ่งที่ข้อความบนรางบอกไว้อยู่แล้ว
   ("แก้ตามเหตุผลที่ผู้อนุมัติแจ้ง แล้วบันทึกเพื่อส่งตรวจใหม่")
   ⚠️ ข้อยกเว้นรายฟิลด์ยังมีผลเหมือนเดิม — แก้เฉพาะช่องที่ยกเว้น (ผู้ติดต่อ/ที่อยู่
   จัดส่ง/หมายเหตุเอกสาร) ไม่นับว่าแก้ตามที่ถูกตีกลับ จึงไม่ดันเข้าคิว */
const RESUBMITTABLE = ['approved', 'rejected'];

// changedFields = ผลจาก changedFieldsAgainst (ไม่ส่ง = พฤติกรรมเดิม: reset ทุกการแก้)
// exemptFields = ฟิลด์ที่แก้แล้วไม่ต้องอนุมัติใหม่ (ดู CUSTOMER_CONTACT_FIELDS)
export function resetApprovalOnEdit(record, user, { changedFields = null, exemptFields = [] } = {}) {
  if (!RESUBMITTABLE.includes(record?.approvalStatus)) return null;
  if (Array.isArray(changedFields)) {
    // ไม่มีอะไรเปลี่ยน = กดบันทึกโดยไม่แก้อะไร ไม่ควรทำให้ของหลุดจากลิสต์
    if (changedFields.length === 0) return null;
    if (changedFields.every((field) => exemptFields.includes(field))) return null;
  }
  return {
    approvalStatus: 'pending',
    submittedBy: user?.id ?? null,
    submittedByName: user?.name ?? null,
    approvedBy: null,
    approvedByName: null,
    approvedAt: null,
    rejectionReason: null,
  };
}
