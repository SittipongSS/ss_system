// ── เหตุการณ์ระบบในเธรดของ master data + สายภาษี + PO สหมิตร ─────────────
//
// แพตเทิร์นเดียวกับ lib/costingUpdates.js และ lib/sales/documentUpdates.js:
// ไฟล์นี้ตอบแค่ "ควรบันทึกอะไรลงเธรด" เป็นตรรกะล้วนที่เทสต์ได้ ส่วน I/O เป็นของ
// lib/master/updates.js
//
// ⭐ **ปัญหาเดียวกับที่เจอบน QT/SO เป๊ะ ๆ**: ทั้งสี่ระบบบังคับกรอก "เหตุผลที่ตีกลับ"
// แล้วเก็บลง `rejectionReason` ช่องเดียวของแถว — ซึ่งถูกล้างเป็น null ทุกครั้งที่
//   · ลูกค้า/สินค้า ถูกอนุมัติ หรือถูกแก้ (`resetApprovalOnEdit`)
//   · ทะเบียนสรรพสามิตถูกอนุมัติ
//   · ใบยื่นถูกเปลี่ยนสถานะกลับไป received
// ⇒ ตีกลับรอบที่สองลบเหตุผลรอบแรกทิ้งถาวร · คนที่ต้องอ่าน (คนแก้รอบถัดไป)
// เห็นแค่ป้ายแดงแล้วต้องเดาเอง — เธรดทำให้เหตุผลอยู่ครบทุกรอบบนหน้าเดียวกับของ
//
// ⚠️ ทุกฟังก์ชันทนของไม่ครบ (คืน null) — ผู้เรียกอยู่หลังจุดที่ DB เขียนสำเร็จแล้ว
// การโยน error ตรงนั้นจะทำให้ action ที่สำเร็จแล้วตอบ 500

const clip = (s, n = 1000) => String(s ?? '').trim().slice(0, n) || null;
const withReason = (reason) => (clip(reason) ? ` — ${clip(reason)}` : ' — ไม่ระบุเหตุผล');

// ── ลูกค้า / สินค้า (ด่านอนุมัติ master data) ────────────────────────────
// ใช้ร่วมกันเพราะเป็นด่านเดียวกันจริง ๆ (approvalStatus + rejectionReason +
// resetApprovalOnEdit ชุดเดียวกัน) — แยกเป็นสองฟังก์ชันคือเขียนกฎเดียวกันสองรอบ
export function masterApprovalUpdate(status, { reason = null } = {}) {
  if (status === 'approved') return { kind: 'approve', body: 'อนุมัติแล้ว', meta: {} };
  if (status === 'rejected') {
    return { kind: 'reject', body: `ตีกลับให้แก้ไข${withReason(reason)}`, meta: {} };
  }
  if (status === 'pending') {
    // ผู้อนุมัติกดรีเซ็ตเอง (คนละเรื่องกับ "ถูกแก้จึงต้องอนุมัติใหม่" ด้านล่าง)
    return { kind: 'reset', body: 'รีเซ็ตกลับเป็นรออนุมัติ', meta: {} };
  }
  return null;
}

// แก้ของที่อนุมัติแล้ว = หลุดกลับไปรออนุมัติใหม่ · เดิมเรื่องนี้ไปโผล่แค่ใน Chat
// ของฝ่าย คนเปิดหน้าดูทีหลังจึงไม่มีทางรู้ว่า "ทำไมของที่เคยอนุมัติแล้วกลับมา pending"
// changedFields = ผลจาก changedFieldsAgainst (ฟิลด์ที่เปลี่ยนค่าจริง)
//
// ⚠️ **สองเหตุการณ์คนละเรื่อง ต้องอ่านออกจากเธรด** (2026-08-30) — ระเบียนที่ถูก
// ตีกลับแล้วแก้ตามเหตุผล คือ "ส่งตรวจใหม่" ไม่ใช่ "ของที่เคยผ่านแล้วหลุด" · ประโยค
// เดียวใช้ทั้งสองทางไม่ได้ เพราะคนอ่านเธรดกำลังไล่ว่ารอบนี้ใครต้องทำอะไรต่อ
export function masterReapprovalUpdate(changedFields = [], { fromStatus = 'approved' } = {}) {
  const fields = (changedFields || []).filter(Boolean);
  if (!fields.length) return null;
  const changed = `${fields.slice(0, 8).join(', ')}${fields.length > 8 ? ` +${fields.length - 8}` : ''}`;
  return {
    kind: 'reset',
    body: fromStatus === 'rejected'
      ? `แก้ตามที่ถูกตีกลับ — ส่งตรวจใหม่ (${changed})`
      : `แก้ข้อมูลหลังอนุมัติ — ต้องอนุมัติใหม่ (${changed})`,
    meta: { changedFields: fields, fromStatus },
  };
}

// ── ทะเบียนสรรพสามิต ────────────────────────────────────────────────────
export function registrationStatusUpdate(status, { reason = null } = {}) {
  if (status === 'pending_legal') return { kind: 'submit', body: 'ยื่นให้ฝ่าย RA ตรวจ', meta: {} };
  if (status === 'approved') return { kind: 'approve', body: 'ขึ้นทะเบียนแล้ว', meta: {} };
  if (status === 'rejected') {
    return { kind: 'reject', body: `ตีกลับให้แก้ไข${withReason(reason)}`, meta: {} };
  }
  return null;
}

// ปลดอนุมัติทะเบียนที่ขึ้นแล้ว (approved → draft) — เหตุผลเดิมไปอยู่ใน
// `metadata.revokeApproval` ซึ่งหน้าจอไม่ได้แสดง และรอบถัดไปเขียนทับ
export function registrationRevokeUpdate({ reason = null } = {}) {
  return { kind: 'revoke', body: `ปลดอนุมัติทะเบียน (กลับเป็นร่าง)${withReason(reason)}`, meta: {} };
}

// ── ใบยื่นชำระภาษี ──────────────────────────────────────────────────────
// ป้ายยกมาจาก STATUS ใน lib/excise/workflow.js ตรง ๆ — เธรดกับป้ายสถานะบนหน้า
// ต้องพูดคำเดียวกัน ไม่งั้นคนอ่านนึกว่าเป็นคนละเหตุการณ์
const ORDER_STATUS_LABEL = {
  draft: 'ฉบับร่าง',
  pending: 'รอรับเงิน',
  received: 'รอยื่น',
  filing: 'กำลังยื่น',
  complete: 'ชำระแล้ว',
  delivered: 'ส่งเอกสารให้ลูกค้าแล้ว',
};

export function orderStatusUpdate(status, { reason = null, fromStatus = null } = {}) {
  if (status === 'rejected') {
    return { kind: 'reject', body: `ตีกลับให้แก้ไข${withReason(reason)}`, meta: { fromStatus } };
  }
  const label = ORDER_STATUS_LABEL[status];
  if (!label) return null;
  return { kind: 'status', body: `เปลี่ยนสถานะเป็น "${label}"`, meta: { fromStatus, toStatus: status } };
}

// ── PO สหมิตร ───────────────────────────────────────────────────────────
// PO ไม่มีด่านอนุมัติของตัวเอง (เป็นเอกสารที่ลูกค้าออกมาให้) — เหตุการณ์ที่มีค่า
// คือ "PO ใบนี้ถูกแปลงเป็นดีลแล้ว" ซึ่งเป็นจุดส่งมอบเข้าท่อขายจริง
export function sahamitPoSettleUpdate({ dealCode = null, lineCount = 0 } = {}) {
  const deal = clip(dealCode);
  return {
    kind: 'settle',
    body: `แปลงเป็นดีลแล้ว${deal ? ` (${deal})` : ''}${lineCount ? ` — ${lineCount} บรรทัด` : ''}`,
    meta: { dealCode: deal, lineCount },
  };
}
