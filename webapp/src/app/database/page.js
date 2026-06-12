"use client";
import Link from "next/link";
import { Database, Building2, Package, CalendarDays, ArrowRight } from "lucide-react";
import { useCan } from "@/lib/roleContext";

// Landing hub for the database (master-data) system. Each card links to one of
// the master registries; cards render only for the capability that page needs,
// so the hub matches what the user can actually open.
const CARDS = [
  {
    href: "/database/customers",
    cap: "customers:view",
    icon: Building2,
    title: "ข้อมูลลูกค้า",
    desc: "ทะเบียนลูกค้า รหัสลูกค้า ที่อยู่ และข้อมูลภาษี ใช้ร่วมกันทุกระบบ",
  },
  {
    href: "/database/products",
    cap: "products:view",
    icon: Package,
    title: "ข้อมูลสินค้า",
    desc: "ทะเบียนสินค้า รหัสสินค้า หมวดหมู่ และข้อมูลที่เกี่ยวข้องกับภาษี",
  },
  {
    href: "/database/holidays",
    cap: "master:manage",
    icon: CalendarDays,
    title: "วันหยุด (ปฏิทินทำการ)",
    desc: "ตั้งค่าวันหยุดที่ใช้คำนวณวันทำการของไทม์ไลน์โครงการ (PM)",
  },
];

export default function DatabaseHubPage() {
  // useCan must be called unconditionally; compute all flags up front.
  const can = {
    "customers:view": useCan("customers:view"),
    "products:view": useCan("products:view"),
    "master:manage": useCan("master:manage"),
  };
  const cards = CARDS.filter((c) => can[c.cap]);

  return (
    <>
      <div className="premium-header">
        <div className="header-content">
          <h1>
            <span className="premium-header-icon">
              <Database size={22} />
            </span>{" "}
            ระบบฐานข้อมูล
          </h1>
          <p>จัดการข้อมูลหลักที่ใช้ร่วมกันทุกระบบ — ลูกค้า สินค้า และปฏิทินทำการ</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="glass-panel system-card"
              style={{
                textAlign: "left", padding: "28px", cursor: "pointer",
                display: "flex", flexDirection: "column", gap: "16px",
                background: "var(--panel)", color: "inherit", textDecoration: "none",
              }}
            >
              <div
                className="brand-logo"
                style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "#181f4b" }}
              >
                <Icon size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>{c.title}</h2>
                <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.6 }}>{c.desc}</p>
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--accent, var(--navy))" }}>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  เข้าใช้งาน <ArrowRight size={15} strokeWidth={2} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
