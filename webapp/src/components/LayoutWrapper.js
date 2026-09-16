"use client";

import { usePathname } from 'next/navigation';
import AppLayout from './AppLayout';
import IdleLogout from './IdleLogout';

export default function LayoutWrapper({ children }) {
  const pathname = usePathname();

  // The login page has no session yet — no layout, no idle timer.
  if (pathname === '/') {
    return <>{children}</>;
  }

  /* ทุกหน้าที่ล็อกอินแล้วอยู่ในเปลือกเดียวกันหมด รวม `/home` (ADR 0016 — เดิมหน้าแรก
     วาดเองนอกเปลือกตาม Phase 4C แล้วทำงานซ้ำกับเปลือกทั้ง session · devBypass ·
     โมดัลรหัสผ่าน · ตัวดึงตัวเลข จนสองชุดเริ่มเพี้ยนกัน) */
  return (
    <>
      <IdleLogout />
      <AppLayout>{children}</AppLayout>
    </>
  );
}
