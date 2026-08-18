// ── คำร้อง ↔ ทะเบียนกลิ่น/สูตร: ข้อมูลสดของแถว (มติผู้ใช้ 2026-08-18) ─────
//
// ⭐ **ทะเบียนเป็นเจ้าของข้อมูล คำร้องอ่านสด** — เดิมแถวคำร้องโชว์ `items.label`
// ซึ่งเป็นข้อความ **แช่แข็งตอนส่ง** (สายสูตรถึงขั้นต่อสตริง `"หมวด · กลิ่น → PF1004"`)
// ⇒ เปลี่ยนชื่อ/รหัสในทะเบียนแล้วคำร้องยังโชว์ของเก่าตลอดกาล และไม่มีทางแก้จากฝั่งคำร้อง
// เลยสักช่อง (`PATCH items/[itemId]` รับแต่ `hop`)
//
// ⇒ ลิงก์มีอยู่ในฐานแล้ว (`producedScentId` · `scentId` · `producedFormulaId`)
// ที่ขาดคือ **การอ่านมันขึ้นมา** · ที่นี่คือชั้นที่ทำให้ id กลายเป็นค่าที่จอใช้ได้
//
// ⚠️ **สำเนาที่เขียนได้มีชุดเดียวคือทะเบียน** — ห้ามให้คำร้องเก็บชื่อ/รหัสของตัวเอง
// เพิ่มอีกช่องแล้วคอยไล่ซิงก์ · `label` เดิมยังอยู่ในฐานในฐานะ **หลักฐานว่าตอนนั้น
// ส่งอะไร** (ใช้ตอนไม่มีลิงก์ และตอนเขียนประวัติว่าชื่อเปลี่ยนจากอะไรเป็นอะไร)

/** id ทั้งหมดที่แถวชุดนี้อ้างถึงทะเบียน — ผู้เรียกเอาไปยิง query ครั้งเดียวต่อชนิด */
export function registryIdsFromItems(items = []) {
  const scentIds = new Set();
  const formulaIds = new Set();
  for (const item of items || []) {
    if (!item) continue;
    // ⚠️ `producedScentId` มาก่อน `scentId` — ตัวแรกคือกลิ่นที่ **เกิดจากแถวนี้**
    // ตัวหลังคือกลิ่นที่แถวนี้ **อ้างถึงตอนขอ** · สายพัฒนากลิ่นมีแต่ตัวแรก
    // สายพัฒนาสูตรมีแต่ตัวหลัง ⇒ เก็บทั้งคู่ แล้วให้ชั้นบนเลือกว่าจะโชว์ตัวไหน
    if (item.producedScentId) scentIds.add(item.producedScentId);
    if (item.scentId) scentIds.add(item.scentId);
    if (item.producedFormulaId) formulaIds.add(item.producedFormulaId);
  }
  return { scentIds: [...scentIds], formulaIds: [...formulaIds] };
}

/** แถวทะเบียนดิบ → ก้อนเล็กที่จอใช้ (ไม่ส่งทั้งแถวออกไป — ทะเบียนมีช่องที่คำร้องไม่ควรเห็น) */
function refOf(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code || null,
    name: row.name || null,
    status: row.status || null,
  };
}

/**
 * ติดข้อมูลทะเบียนสดให้แต่ละแถว — `refScent` · `refFormula`
 *
 * ⚠️ ฟังก์ชันบริสุทธิ์ ไม่ยิง DB เอง (ผู้เรียกโหลดมาให้) — เทสต์ได้โดยไม่ต้องมีฐาน
 * และ route เป็นคนคุมว่าโหลดกี่ครั้ง
 */
export function attachRegistryLinks(items = [], { scents = [], formulas = [] } = {}) {
  const scentById = new Map((scents || []).map((s) => [s.id, s]));
  const formulaById = new Map((formulas || []).map((f) => [f.id, f]));
  return (items || []).map((item) => {
    if (!item) return item;
    const scent = scentById.get(item.producedScentId) || scentById.get(item.scentId) || null;
    const formula = formulaById.get(item.producedFormulaId) || null;
    return { ...item, refScent: refOf(scent), refFormula: refOf(formula) };
  });
}

/**
 * ข้อความประวัติตอนชื่อ/รหัสในทะเบียนเปลี่ยน — ลงเธรดของ **คำร้องทุกใบที่อ้างถึง**
 *
 * ⭐ คืนค่า `null` เมื่อไม่มีอะไรที่คนอ่านคำร้องต้องรู้ (แก้หมายเหตุ/ชื่อที่ลูกค้าเรียก
 * ไม่ต้องไปกวนใบที่ผูกอยู่) — เขียนทุกการแก้ลงทุกใบคือ log ที่ไม่มีใครอ่าน
 * ⚠️ ต้องบอก **ค่าเดิม** ด้วยเสมอ นั่นคือทั้งหมดที่ประวัติมีค่ากว่าค่าปัจจุบันที่จอโชว์อยู่แล้ว
 */
export function registryRenameBody(kind, before = {}, after = {}) {
  const label = kind === 'formula' ? 'สูตร' : 'กลิ่น';
  const parts = [];
  if ((before.code || null) !== (after.code || null)) {
    parts.push(`รหัส ${before.code || '(ไม่มี)'} → ${after.code || '(ไม่มี)'}`);
  }
  if ((before.name || null) !== (after.name || null)) {
    parts.push(`ชื่อ ${before.name || '(ไม่มี)'} → ${after.name || '(ไม่มี)'}`);
  }
  if (!parts.length) return null;
  return `แก้ทะเบียน${label} — ${parts.join(' · ')}`;
}
