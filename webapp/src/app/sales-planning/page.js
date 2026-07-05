"use client";

import Link from "next/link";
import { BarChart3, ClipboardList, LineChart, Target } from "lucide-react";
import Workspace from "@/components/ui/Workspace";

const phaseCards = [
  {
    title: "Pipeline",
    body: "เตรียมพื้นที่สำหรับ deal, stage, owner และ expected close month",
    icon: ClipboardList,
  },
  {
    title: "Targets",
    body: "ฐานสำหรับเป้ายอดขายรายเดือน/ทีม ก่อนต่อ dashboard",
    icon: Target,
  },
  {
    title: "Dashboard",
    body: "ภาพรวม forecast แบบ Sales FC, Project Timeline และ Warehouse FC",
    icon: BarChart3,
  },
];

export default function SalesPlanningPage() {
  return (
    <Workspace
      icon={<LineChart size={22} />}
      title="Sales Planning"
      subtitle="Commercial spine สำหรับ pipeline, forecast, target และใบเสนอราคา ก่อนส่งต่อ PM"
      headerRight={<span className="ui-badge">Phase 0</span>}
    >
      <div className="flex flex-col gap-6">
        <section className="glass-panel" style={{ padding: "18px 20px" }}>
          <div className="flex flex-col gap-2">
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>ฐานระบบพร้อมต่อ Phase 1</h2>
            <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.7, margin: 0, maxWidth: 760 }}>
              หน้านี้เป็น scaffold แรกของ Sales Planning เพื่อเปิด route, permission และ navigation
              ให้พร้อมก่อนเริ่มสร้าง sales_deals, targets และ dashboard ตาม roadmap.
            </p>
          </div>
          <div style={{ marginTop: 14 }}>
            <Link href="/database/products" className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              ดู Product master
            </Link>
          </div>
        </section>

        <section className="kpi-grid">
          {phaseCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.title} className="glass-panel" style={{ padding: "18px 20px", minHeight: 132 }}>
                <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 700 }}>
                  <Icon size={17} /> {card.title}
                </div>
                <p style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.65, margin: 0 }}>{card.body}</p>
              </div>
            );
          })}
        </section>
      </div>
    </Workspace>
  );
}
