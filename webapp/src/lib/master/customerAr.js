// ── รหัสลูกค้า (AR) คู่ชื่อกิจการ — ของกลาง ────────────────────────────────
//
// ⭐ **มติผู้ใช้ (IS-26080003 · 2026-08-11)**: *"อยากให้แสดงรหัสลูกค้ากำกับชื่อตรงกิจการ
// ด้วย จะได้สัมพันธ์กับรหัสกลิ่น รหัส MU"* — ทะเบียนกลิ่น/สูตรใช้รหัสลูกค้าเป็นตัวเชื่อม
// ในหัวคน แต่หน้าจอโชว์แต่ชื่อบริษัท ⇒ ต้องเปิดทะเบียนลูกค้าอีกแท็บเพื่อแปลงกลับ
//
// ⚠️ **รหัสอ่านสดจากทะเบียนลูกค้าเสมอ ไม่ประทับลงแถวลูก** — แถวกลิ่น/คำร้อง/ดีล
// ประทับ `customerName` ไว้เป็นหลักฐาน ณ เวลาที่ผูก (ชื่ออาจเปลี่ยนภายหลัง) ส่วนรหัส
// เป็นตัวชี้กลับไปทะเบียน ⇒ ต้องเป็นค่าปัจจุบันเสมอ ไม่งั้นตามกลับไม่เจอเมื่อรหัสถูกแก้
//
// ⚠️ ไฟล์นี้ **ไม่ยิง I/O** — ผู้เรียกโหลด `/api/customers` (ซึ่งหน้าทะเบียนส่วนใหญ่
// โหลดอยู่แล้วผ่าน `cachedFetchJson`) แล้วส่งลิสต์เข้ามา

/** แผนที่ `customerId → arCode` — สร้างครั้งเดียวต่อการเรนเดอร์ กัน O(n²) ในตาราง */
export function customerArIndex(customers = []) {
  const index = new Map();
  // ⚠️ `= []` กัน undefined ได้อย่างเดียว — `cachedFetchJson` คืน null ได้ตอน API พลาด
  // แล้ว `for…of null` โยน TypeError กลางการเรนเดอร์ (จอขาวทั้งหน้า)
  for (const customer of Array.isArray(customers) ? customers : []) {
    const code = String(customer?.arCode || '').trim();
    if (customer?.id && code) index.set(customer.id, code);
  }
  return index;
}

/**
 * ค่าที่หน้าจอต้องวาด — `{ name, arCode }`
 *
 * ⚠️ `name` ใช้ชื่อที่แถวประทับไว้ก่อน (`snapshotName`) แล้วค่อยตกไปที่ทะเบียน —
 * เอกสารที่ออกไปแล้วต้องอ่านได้เหมือนวันที่ออก · ถ้าไม่มีทั้งคู่คืน id ดิบไว้ให้
 * ตามต่อได้ ดีกว่าขีดที่บอกอะไรไม่ได้เลย
 */
export function customerWithAr(customerId, snapshotName, arIndex) {
  const arCode = customerId ? (arIndex?.get?.(customerId) || null) : null;
  const name = String(snapshotName || '').trim() || (customerId ? String(customerId) : '');
  return { name: name || '—', arCode };
}

/** ข้อความค้นหา — ให้พิมพ์รหัส AR แล้วเจอแถวของลูกค้ารายนั้น */
export function customerSearchText(customerId, snapshotName, arIndex) {
  const { name, arCode } = customerWithAr(customerId, snapshotName, arIndex);
  return [name, arCode].filter(Boolean).join(' ');
}
