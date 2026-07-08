"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LineChart, FileText, ChevronRight } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import KpiCard from "@/components/excise/KpiCard";
import { useApiList } from "@/lib/excise/useApiList";
import { poRollupStatus } from "@/lib/sahamit/po";

// SAHAMIT command center — ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109), เฉพาะทีม Key Account.
// สรุป FC / PO รายรอบ.
export default function SahamitOverview() {
  const router = useRouter();
  const { data: rounds, loading: l1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2 } = useApiList("/api/sahamit/po");

  const latestRound = rounds.reduce((m, r) => Math.max(m, r.roundNo || 0), 0);
  const activePos = pos.filter((p) => poRollupStatus(p) !== "cancelled");
  const followUp = pos.filter((p) => ["open", "partial"].includes(poRollupStatus(p)));

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม"
      subtitle="งานสหมิตร · ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109) — เฉพาะทีม Key Account"
      loading={l1 || l2}
    >
      <div className="flex flex-col gap-6">
        {/* KPI */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            <LineChart size={16} /> สถานะรวม
            <Link href="/sahamit/reconcile" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>กระทบยอด <ChevronRight size={14} /></Link>
          </div>
          <div className="kpi-grid">
            <KpiCard label="FC รอบล่าสุด" value={latestRound ? `#${latestRound}` : "-"} tone="info" icon={LineChart} onClick={() => router.push("/sahamit/forecast")} />
            <KpiCard label="PO ทั้งหมด" value={activePos.length} tone="accent" icon={FileText} onClick={() => router.push("/sahamit/po")} />
            <KpiCard label="PO ที่ต้องติดตาม" value={followUp.length} tone="warning" onClick={() => router.push("/sahamit/po")} />
          </div>
        </section>
      </div>
    </Workspace>
  );
}
