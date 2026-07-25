"use client";

import { ShieldAlert } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import EmptyState from "@/components/ui/EmptyState";

// จอ "ไม่มีสิทธิ์" กลางของระบบ — เดิมแต่ละหน้าเขียนเอง บางหน้าเป็นกล่องข้อความลอย ๆ
// บางหน้า return null (จอขาวสนิท) และ **ไม่มีปุ่มกลับสักหน้า** ทั้งที่ proxy เปิด URL
// บางเส้นให้ทุก role เข้าได้ (เช่น /settings/chat-webhooks) = ผู้ใช้ติดอยู่ในทางตันจริง
//
// ยังโชว์ไอคอน+ชื่อหน้าเดิมไว้ เพื่อให้รู้ว่ามาถูกที่แล้วแต่สิทธิ์ไม่ถึง ไม่ใช่หลงทาง
export default function AccessDenied({ icon, title, message, back }) {
  return (
    <Workspace hideHeader back={back}>
      {title && (
        <div className="premium-header">
          <div className="header-content">
            <h1>{icon && <span className="premium-header-icon">{icon}</span>} {title}</h1>
          </div>
        </div>
      )}
      <EmptyState icon={ShieldAlert}>{message}</EmptyState>
    </Workspace>
  );
}
