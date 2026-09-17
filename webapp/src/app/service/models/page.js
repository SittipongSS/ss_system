// ── /service/models → แท็บ "รุ่นเครื่อง" ใต้ทะเบียนเครื่อง ────────────────
//
// ⭐ **รวมเป็นเมนูเดียว** (มติผู้ใช้ 2026-09-06) — ทะเบียนรุ่นย้ายไปเป็นแท็บของ
//   ทะเบียนเครื่อง · เส้นทางเดิมยังอยู่เพื่อ **ไม่ให้ลิงก์ที่ส่งกันไว้ตาย**
// ⭐ ทะเบียนย้ายบ้านไป `/database` แล้ว (มติผู้ใช้ 2026-09-17) — ปลายทางจึงเป็น
//   `/database/assets` · เส้นทางนี้เด้งสองทอดโดยตั้งใจ (ลิงก์เก่าของเก่าก็ยังถึง)
// ⚠️ `redirect` ของ Next ต้องอยู่ใน server component — ห้ามใส่ "use client"
import { redirect } from 'next/navigation';

export default function ServiceAssetModelsRedirect() {
  redirect('/database/assets?tab=models');
}
