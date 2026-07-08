"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/roleContext";
import { canAccessMgmt } from "@/lib/permissions";

// หน้าชั่วคราวสำหรับเมนู mgmt ที่จะทำในเฟสถัดไป (กันลิงก์ sidebar 404).
export default function ComingSoon({ title, phase }) {
  const role = useRole();
  const router = useRouter();
  useEffect(() => { if (role && !canAccessMgmt(role)) router.replace("/home"); }, [role, router]);
  if (role && !canAccessMgmt(role)) return null;
  return (
    <>
      <div className="premium-header">
        <div className="header-content"><h1>{title}</h1></div>
      </div>
      <div className="glass-panel" style={{ padding: 60, textAlign: "center", color: "var(--text-3)" }}>
        อยู่ระหว่างพัฒนา{phase ? ` (${phase})` : ""} — จะเปิดใช้งานเร็วๆ นี้
      </div>
    </>
  );
}
