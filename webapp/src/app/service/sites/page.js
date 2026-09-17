// ── /service/sites → /database/sites (มติผู้ใช้ 2026-09-17) ────────────────
//
// ⭐ **ทะเบียนไซต์เป็นข้อมูลหลัก ไม่ใช่งานของฝ่าย** (กฎสามชั้นข้อ 3) — บ้านของมัน
//   ย้ายไปฐานข้อมูลพร้อมทะเบียนเครื่อง · เมนูฝ่ายบริการยังมีทางลัดชี้มาที่ URL ใหม่
//   ผ่าน `ADOPTED_SHARED_PATHS.service` ⇒ TS เปิดแล้วยังเห็นเปลือกบริการเหมือนเดิม
// ⚠️ เส้นทางเก่าต้องอยู่ต่อ — ลิงก์ที่ส่งกันไว้ในแชท/อีเมล และ bookmark ของ TS
//   ชี้ที่นี่มาตั้งแต่ mig 0187
import { redirect } from 'next/navigation';

export default function ServiceSitesRedirect() {
  redirect('/database/sites');
}
