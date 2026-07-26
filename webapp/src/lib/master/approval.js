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

const sameValue = (a, b) => {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if ((a && typeof a === 'object') || (b && typeof b === 'object')) {
    try {
      return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
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

// changedFields = ผลจาก changedFieldsAgainst (ไม่ส่ง = พฤติกรรมเดิม: reset ทุกการแก้)
// exemptFields = ฟิลด์ที่แก้แล้วไม่ต้องอนุมัติใหม่ (ดู CUSTOMER_CONTACT_FIELDS)
export function resetApprovalOnEdit(record, user, { changedFields = null, exemptFields = [] } = {}) {
  if (record?.approvalStatus !== 'approved') return null;
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
