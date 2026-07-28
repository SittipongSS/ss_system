// ด่านเดียวของสายขาย: โครงการปิดแล้ว = ออกเอกสารใบใหม่ไม่ได้ (มติผู้ใช้ B3 2026-07-27)
//
// เดิม `projectWriteBlockedError` มีแต่ฝั่ง PM เรียก (หัวเอกสาร/ขั้นตอน/FG/revision) —
// **ไม่มี route สายขายเรียกเลยสักตัว** ผลคือด่านอนุมัติปิดโครงการคุ้มแค่เนื้อในโครงการ
// ปิดไปแล้วยังออกใบเสนอราคา/Sale Order ใบใหม่ผูกเข้าโครงการนั้นได้ตามปกติ
//
// ขอบเขตโดยเจตนา = **เอกสารใบใหม่เท่านั้น** (สร้างใบ · ออก Rev. · ยืนยัน PO สหมิตรที่ออก QT)
// สิ่งที่ยัง "เดินต่อได้" หลังปิด: ยื่นอนุมัติ/อนุมัติ/ตีกลับ/ยกเลิกใบที่ออกไปแล้ว และ
// การออกใบยื่นชำระภาษีจาก SO เดิม — ไม่งั้นเอกสารที่คำเตือนตอนขอปิดบอกว่า "ค้างอยู่"
// จะเดินต่อไม่ได้เลย = ล็อกตาย ต้อง reopen ทุกครั้งซึ่งไม่ใช่เจตนาของด่านนี้
import { projectWriteBlockedError } from '@/lib/pm/projectClose';

// คืนข้อความ error เมื่อออกเอกสารใหม่ไม่ได้ / null เมื่อออกได้
// docLabel = คำกริยาที่จะต่อท้าย เช่น 'ออกใบเสนอราคาใบใหม่'
export async function closedProjectBlock(supabase, projectId, docLabel) {
  if (!projectId) return null;
  const { data, error } = await supabase
    .from('projects')
    .select('id, code, name, closeStatus')
    .eq('id', projectId)
    .maybeSingle();
  // อ่านโครงการไม่ได้ = ไม่รู้ว่าปิดหรือยัง — ปล่อยผ่านดีกว่าล็อกคนออกเอกสารเพราะ DB สะดุด
  // (ด่านนี้เป็นการกันความสับสน ไม่ใช่ด่านความปลอดภัย)
  if (error || !data) return null;
  if (!projectWriteBlockedError(data)) return null;
  const name = [data.code, data.name].filter(Boolean).join(' ') || 'นี้';
  return `โครงการ ${name} ปิดแล้ว — ${docLabel}ไม่ได้ ต้องให้ผู้อนุมัติเปิดโครงการใหม่ (RE-ORDER) ก่อน`;
}
