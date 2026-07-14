"use client";
// ศูนย์รวมการตั้งค่าระบบ — เมนู "ตั้งค่า" เดียวใน top nav ชี้มาที่นี่
// โชว์เฉพาะการ์ดที่สิทธิ์ของผู้ใช้เข้าถึงได้ (ปฏิทินเห็นทุกคนเพราะเป็นข้อมูลอ่านได้ทั้งระบบ)
import Link from "next/link";
import { Settings, CalendarDays, BellRing, Users, History, ChevronRight } from "lucide-react";
import { useCan, useRole } from "@/lib/roleContext";
import { can } from "@/lib/permissions";

export default function SettingsPage() {
  const role = useRole();
  const canChat = useCan("master:manage");
  const canAudit = useCan("audit:view");
  // เรียก hook ก่อนเสมอ (ห้ามอยู่หลัง || ที่ short-circuit ได้ — ลำดับ hook ต้องคงที่)
  const canUsersView = useCan("users:view");
  const canUsers = can(role, "users:manage") || canUsersView;

  const items = [
    {
      href: "/database/holidays",
      icon: CalendarDays,
      title: "วันหยุด (ปฏิทินทำการ)",
      desc: "วันหยุดบริษัท/นักขัตฤกษ์ที่ระบบใช้นับวันทำการของไทม์ไลน์โครงการ",
      show: true,
    },
    {
      href: "/database/chat-webhooks",
      icon: BellRing,
      title: "แจ้งเตือน Google Chat",
      desc: "webhook ของแต่ละ space ที่ระบบส่งการ์ดแจ้งเตือน — แก้แล้วมีผลทันที",
      show: canChat,
    },
    {
      href: "/users",
      icon: Users,
      title: "ผู้ใช้งาน",
      desc: "บัญชีผู้ใช้ บทบาท ทีม และสิทธิ์เพิ่มเติมรายคน",
      show: canUsers,
    },
    {
      href: "/audit",
      icon: History,
      title: "บันทึกการใช้งาน",
      desc: "ประวัติการเพิ่ม/แก้/ลบข้อมูลทั้งระบบ ย้อนดูก่อน-หลังได้",
      show: canAudit,
    },
  ].filter((i) => i.show);

  return (
    <>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon"><Settings size={22} /></span>{" "}
            ตั้งค่าระบบ
          </h1>
          <p>การตั้งค่าและเครื่องมือดูแลระบบทั้งหมด รวมไว้ที่เดียว</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="glass-panel"
              style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", textDecoration: "none", color: "inherit" }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent)",
                }}
              >
                <Icon size={22} />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{item.title}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>{item.desc}</span>
              </span>
              <ChevronRight size={18} style={{ color: "var(--text-3)", flexShrink: 0 }} />
            </Link>
          );
        })}
      </div>
    </>
  );
}
