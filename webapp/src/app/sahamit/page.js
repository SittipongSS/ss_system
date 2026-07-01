"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LineChart, FileText, Flag, ChevronRight } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import KpiCard from "@/components/excise/KpiCard";
import ActionQueue from "@/components/ui/ActionQueue";
import { useApiList } from "@/lib/excise/useApiList";
import { poRollupStatus } from "@/lib/sahamit/po";
import { FLAG_KIND_LABEL } from "@/lib/sahamit/flags";

const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// SAHAMIT command center — ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109), เฉพาะทีม Key Account.
// สรุป FC / PO และเน้นคิว "ตรวจการเปลี่ยน FC" (flag ที่ยัง open) ให้เคลียร์.
export default function SahamitOverview() {
  const router = useRouter();
  const { data: rounds, loading: l1 } = useApiList("/api/sahamit/forecast/rounds");
  const { data: pos, loading: l2 } = useApiList("/api/sahamit/po");
  const { data: flags, loading: l3 } = useApiList("/api/sahamit/flags");

  const latestRound = rounds.reduce((m, r) => Math.max(m, r.roundNo || 0), 0);
  const activePos = pos.filter((p) => poRollupStatus(p) !== "cancelled");
  const followUp = pos.filter((p) => ["open", "partial"].includes(poRollupStatus(p)));
  const openFlags = flags.filter((f) => f.status === "open");

  const goReview = () => router.push("/sahamit/review");

  const queue = openFlags.map((f) => ({
    id: `f-${f.id}`, tone: "danger", badge: FLAG_KIND_LABEL[f.kind] || f.kind,
    title: `${f.fgCode || "-"} · ${f.month || ""}`.trim(),
    subtitle: `${nf(f.prevQty)} → ${nf(f.newQty)} (ลด ${nf(f.drop)}) · FC รอบ #${f.roundNo}`,
    cta: "ตรวจ", onClick: goReview,
  }));

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม"
      subtitle="งานสหมิตร · ลูกค้า บจก.สหมิตรโปรดักส์ (AR-109) — เฉพาะทีม Key Account"
      loading={l1 || l2 || l3}
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
            <KpiCard label="รอตรวจการเปลี่ยน FC" value={openFlags.length} tone="danger" icon={Flag} onClick={goReview} />
          </div>
        </section>

        {/* คิวงาน — flag ที่ยังต้องตรวจ */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            ต้องตรวจตอนนี้ {queue.length > 0 && <span className="ui-badge danger">{queue.length}</span>}
            <Link href="/sahamit/review" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>เปิดหน้างาน <ChevronRight size={14} /></Link>
          </div>
          <ActionQueue items={queue} empty="ไม่มี FC ที่ต้องตรวจตอนนี้ 🎉" />
        </section>
      </div>
    </Workspace>
  );
}
