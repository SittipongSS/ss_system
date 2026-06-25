// ── Central deletion policy (BOUNDARY_MAP_PLAN Phase 2) ───────────────
// หลักการกลาง: ข้อมูลที่เข้าสู่ workflow แล้ว "ห้าม hard delete" — กันไม่ให้เกิด
// record กำพร้า (live DB ไม่มี FK constraint จริงทุกความสัมพันธ์ ดูเมโม
// no-real-fk-constraints — ต้องนับ dependent เอง):
//   • master (customer/product): ลบได้เฉพาะตอนยังไม่ถูกอ้างที่ไหนเลย — ถ้าถูกใช้
//     แล้วให้ "พักใช้งาน" (isActive=false) แทนการลบ
//   • workflow record (registration/order): ลบได้เฉพาะตอนยังเป็น draft/ฉบับร่าง
//     และยังไม่ถูกอ้างปลายน้ำ — ถ้ายื่น/อนุมัติ/ผูกแล้ว ต้อง void/cancel
//     (เช่น registration: กด "ขอแก้ไข" ย้อนเป็น draft ก่อน) จึงจะลบได้
//
// helper เหล่านี้เป็น pure function: route ดึงจำนวน dependent มาให้ แล้วได้ข้อความ
// บล็อก (string) กลับไป response ตรง ๆ — หรือ null ถ้าลบได้ ทุก route ใช้กฎเดียวกัน.

// master entity ที่ยังถูกอ้างอยู่ → คืนข้อความบล็อกมาตรฐาน (หรือ null ถ้าว่าง).
// `refs` = รายการคำอธิบาย dependent ที่อ่านง่าย เช่น "2 ออเดอร์ (OR-1, OR-2)".
export function referencedBlock(entityLabel, refs) {
  const used = (refs || []).filter(Boolean);
  if (!used.length) return null;
  return `ลบไม่ได้: ${entityLabel}นี้ยังถูกใช้งานอยู่ใน ${used.join(', ')} — กรุณาจัดการรายการเหล่านั้นก่อน (หรือพักใช้งานแทนการลบ)`;
}

// workflow record (registration): ลบได้เฉพาะ draft ที่ยังไม่ถูกอ้างในใบสั่งซื้อ.
// reg ที่ยื่น/อนุมัติ/ตีกลับแล้ว ต้องย้อนเป็น draft ("ขอแก้ไข") ก่อน.
export function registrationDeleteBlock(reg, { orderItemCount = 0 } = {}) {
  if (orderItemCount > 0) {
    return 'ลบไม่ได้: ทะเบียนนี้ถูกอ้างในใบสั่งซื้อแล้ว — กรุณาจัดการใบสั่งซื้อก่อน';
  }
  if (reg?.status && reg.status !== 'draft') {
    return 'ลบไม่ได้: ทะเบียนที่ยื่น/อนุมัติแล้วถูกล็อก — กรุณากด "ขอแก้ไข" เพื่อย้อนเป็นฉบับร่างก่อนจึงจะลบได้';
  }
  return null;
}
