"use client";
import Link from "next/link";
import { LineChart, FileText, ClipboardCheck, Boxes, ArrowRight, LayoutDashboard } from "lucide-react";
import Workspace from "@/components/ui/Workspace";

// SAHAMIT (Planning & Sales) landing. The four cards mirror the module's flow:
// Forecast → PO → Reconcile → Material. Each sub-page is built out in its own
// phase; for now they link to placeholders. Whole module scopes to one customer
// (สหมิตรโปรดักส์ AR-109) and is restricted to the Key Account team (guarded in
// layout.js + every /api/sahamit handler).
const MODULES = [
  {
    href: "/sahamit/forecast",
    icon: LineChart,
    title: "Forecast",
    desc: "รับ FC รายเดือนเป็นรอบ ตรวจการเพิ่ม/ลด/เลื่อน/หาย และเฝ้าระวังยอด Peak",
  },
  {
    href: "/sahamit/po",
    icon: FileText,
    title: "Purchase Orders",
    desc: "ติดตาม PO ลูกค้า วันเอกสาร/รับ/กำหนดส่ง/คาดการณ์/ส่งจริง และการเลื่อนวัน",
  },
  {
    href: "/sahamit/reconcile",
    icon: ClipboardCheck,
    title: "กระทบยอด (Reconciliation)",
    desc: "กริดสถานะ FC / PO / FC vs PO รายสินค้า × เดือน ดูช่องที่ขาด/เกิน/รอ",
  },
  {
    href: "/sahamit/material",
    icon: Boxes,
    title: "วัสดุ / Lead time",
    desc: "ติดตาม PM (สต็อกตาม FC) และ RM (สั่งตาม PO) พร้อมวันพร้อมผลิต 60/90 วันทำการ",
  },
];

export default function SahamitHomePage() {
  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="งานสหมิตร"
      subtitle="ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109) — เฉพาะทีม Key Account"
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.href}
              href={m.href}
              className="glass-panel hover-card"
              style={{
                textAlign: "left", padding: "22px", textDecoration: "none", color: "inherit",
                display: "flex", flexDirection: "column", gap: "14px", background: "var(--panel)",
              }}
            >
              <div className="brand-logo" style={{ width: "44px", height: "44px", borderRadius: "var(--radius-lg)", background: "#181f4b" }}>
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "6px" }}>{m.title}</h2>
                <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.6 }}>{m.desc}</p>
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: 600, color: "var(--accent, var(--navy))", marginLeft: "auto" }}>
                เปิด <ArrowRight size={15} strokeWidth={2} />
              </div>
            </Link>
          );
        })}
      </div>
    </Workspace>
  );
}
