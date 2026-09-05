// ── /service/models → แท็บ "รุ่นเครื่อง" ใต้ทะเบียนเครื่อง ────────────────
//
// ⭐ **รวมเป็นเมนูเดียว** (มติผู้ใช้ 2026-09-06) — ทะเบียนรุ่นย้ายไปเป็นแท็บของ
//   `/service/assets` · เส้นทางเดิมยังอยู่เพื่อ **ไม่ให้ลิงก์ที่ส่งกันไว้ตาย**
//   (คนที่บุ๊กมาร์กหน้านี้ไว้ตอนเฟสก่อน ต้องไปถึงที่เดิมได้)
// ⚠️ `redirect` ของ Next ต้องอยู่ใน server component — ห้ามใส่ "use client"
import { redirect } from 'next/navigation';

export default function ServiceAssetModelsRedirect() {
  redirect('/service/assets?tab=models');
}
