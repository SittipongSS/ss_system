// ── คำแนะนำขึ้นทะเบียนสรรพสามิตราย FG ────────────────────────────────────
// Pure + client-safe (ไม่มี server import) — ใช้ทั้งแบนเนอร์หน้า detail สินค้า
// และสรุปสถานะให้ตัวกรองหน้า list. สถานะทะเบียนยึด lib/excise/workflow.js
// (draft → pending_legal → approved, rejected = ตีกลับให้แก้).

// แบนเนอร์แนะนำบนหน้า detail สินค้า → null = ไม่ต้องเตือน
//   null เมื่อ: ไม่ใช่หมวดสรรพสามิต / สินค้าพักใช้ / ยกเว้นรายตัว
//   (isExciseTaxable=false — จงใจไม่ชวนขึ้นทะเบียนของที่ยกเว้น) / มีทะเบียน
//   approved แล้ว (rail ขวาโชว์อยู่แล้ว ไม่ซ้ำ)
//   { kind: 'unregistered' }      ยังไม่มีทะเบียนเลย → ชวนส่งขึ้นทะเบียน
//   { kind: 'incomplete', reg }   ร่างค้าง (draft) → พาไปทำต่อ
//   { kind: 'rejected', reg }     ถูกตีกลับ ต้องแก้ไข → พาไปแก้
//   { kind: 'pending', reg }      รอนิติกรรมตรวจ (pending_legal) → ดูสถานะ
// การเช็คสิทธิ์ (history:view / products:edit) เป็นเรื่องของผู้เรียก ไม่อยู่ในนี้.
export function exciseRecommendationState(product, flags, regs) {
  if (!flags?.isExcise) return null;
  if (!product || product.isActive === false) return null;
  if (product.isExciseTaxable === false) return null;

  const list = regs || [];
  if (!list.length) return { kind: 'unregistered' };
  if (list.some((r) => r?.status === 'approved')) return null;

  // FG มีลูกค้าเจ้าของรายเดียว → ปกติมีทะเบียนเดียว; เผื่อหลายแถวยึดแถวแรก
  // (ผู้เรียกส่งมาเรียง createdAt ล่าสุดก่อนอยู่แล้ว — /relations)
  const reg = list[0];
  if (reg?.status === 'rejected') return { kind: 'rejected', reg };
  if (reg?.status === 'pending_legal') return { kind: 'pending', reg };
  return { kind: 'incomplete', reg };
}

// สรุปสถานะทะเบียนของ FG หนึ่งตัวสำหรับตัวกรองหน้า list —
// 'none' | 'in_progress' (มีทะเบียนแต่ยังไม่ approved รวม rejected) | 'approved'
export function registrationStatusOf(regs) {
  const list = regs || [];
  if (!list.length) return 'none';
  return list.some((r) => r?.status === 'approved') ? 'approved' : 'in_progress';
}
