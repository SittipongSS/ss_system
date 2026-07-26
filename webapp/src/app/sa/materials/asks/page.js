// รายการเคสขอราคาย้ายไปเป็นแท็บของหน้า /sa/materials แล้ว (มติผู้ใช้ 2026-07-26)
// เก็บ route นี้ไว้เป็นทางเปลี่ยนเส้นทาง — ลิงก์เก่า/บุ๊กมาร์ก/การ์ดแชทที่ชี้มาที่นี่
// ต้องไม่ตาย (หน้ารายละเอียด /sa/materials/asks/[id] ยังอยู่ที่เดิมไม่เปลี่ยน)
import { redirect } from 'next/navigation';

export default function MaterialAsksIndexRedirect() {
  redirect('/sa/materials?tab=mine');
}
