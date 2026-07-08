"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, FolderKanban, ListTodo, ChevronRight } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import KpiCard from "@/components/excise/KpiCard";
import ActionQueue from "@/components/ui/ActionQueue";
import { useApiList } from "@/lib/excise/useApiList";
import { getComputedStatus, daysToDue, isUrgent } from "@/lib/pm/derived";

// PM command center — สรุปสถานะโครงการ (คำนวณจาก tasks) + งานของฉันที่ต้องรีบ,
// พร้อมคิวงานเด่น (โครงการล่าช้า + งานของฉันที่ใกล้/เลยกำหนด).
export default function PmOverview() {
  const router = useRouter();
  const { data: projects, loading: l1 } = useApiList("/api/pm/projects");

  // my-work คืน object { projectTasks, personalTasks, ... } → useApiList (array-only)
  // ใช้ไม่ได้ ดึงเองด้วย fetch. รวมงานโปรเจกต์ + งานเพิ่มเติมของฉันเป็น "งานของฉัน".
  const [myTasks, setMyTasks] = useState([]);
  const [l2, setL2] = useState(true);
  useEffect(() => {
    fetch("/api/pm/my-work?scope=mine")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const projMap = d.projects || {};
        const label = (t) => projMap[t.projectId]?.code || projMap[t.projectId]?.name || null;
        const enrich = (t) => ({ ...t, projectCode: label(t) });
        setMyTasks([...(d.projectTasks || []).map(enrich), ...(d.personalTasks || []).map(enrich)]);
      })
      .catch(() => {})
      .finally(() => setL2(false));
  }, []);

  const pj = {
    New: 0, "On Track": 0, Delayed: 0, "On Hold": 0, Completed: 0,
  };
  for (const p of projects) {
    const s = getComputedStatus(p);
    if (s in pj) pj[s] += 1;
  }

  const openTasks = myTasks.filter((t) => t.status !== "Completed");
  const overdue = openTasks.filter((t) => { const d = daysToDue(t); return d !== null && d < 0; });
  const urgent = openTasks.filter(isUrgent); // เลยกำหนด/เหลือ ≤3 วัน

  const goProjects = () => router.push("/sa/deals");
  const goTasks = () => router.push("/sa/tasks");

  // คิวงาน: โครงการล่าช้า + งานของฉันที่ต้องรีบ (เรียงเลยกำหนดก่อน).
  const queue = [];
  projects.filter((p) => getComputedStatus(p) === "Delayed").forEach((p) =>
    queue.push({
      id: `pj-${p.id}`, tone: "danger", badge: "ล่าช้า",
      title: `${p.code || ""} · ${p.name || p.customerName || "โครงการ"}`.trim(),
      subtitle: `เจ้าของงาน ${p.aeOwner || "-"}`,
      cta: "เปิดโครงการ", onClick: () => router.push(`/sa/projects/${p.id}`),
    })
  );
  urgent
    .sort((a, b) => (daysToDue(a) ?? 0) - (daysToDue(b) ?? 0))
    .forEach((t) => {
      const dd = daysToDue(t);
      const late = dd !== null && dd < 0;
      queue.push({
        id: `t-${t.id}`, tone: late ? "danger" : "warning",
        badge: late ? `เลย ${Math.abs(dd)} วัน` : dd === 0 ? "ครบวันนี้" : `เหลือ ${dd} วัน`,
        title: t.name || "งาน",
        subtitle: t.projectCode || t.projectName || "งานของฉัน",
        cta: "ไปที่งาน", onClick: goTasks,
      });
    });

  return (
    <Workspace
      icon={<LayoutDashboard size={22} />}
      title="ภาพรวม"
      subtitle="สถานะโครงการทั้งหมด + งานของฉันที่ต้องรีบ"
      loading={l1 || l2}
    >
      <div className="flex flex-col gap-6">
        {/* โครงการ */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            <FolderKanban size={16} /> โครงการ
            <Link href="/sa/deals" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>เปิดหน้างาน <ChevronRight size={14} /></Link>
          </div>
          <div className="kpi-grid">
            <KpiCard label="ใหม่" value={pj.New} tone="neutral" icon={FolderKanban} onClick={goProjects} />
            <KpiCard label="กำลังดำเนินการ" value={pj["On Track"]} tone="success" onClick={goProjects} />
            <KpiCard label="ล่าช้า" value={pj.Delayed} tone="danger" onClick={goProjects} />
            <KpiCard label="ระงับ" value={pj["On Hold"]} tone="warning" onClick={goProjects} />
            <KpiCard label="เสร็จสิ้น" value={pj.Completed} tone="info" onClick={goProjects} />
          </div>
        </section>

        {/* งานของฉัน */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            <ListTodo size={16} /> งานของฉัน
            <Link href="/sa/tasks" className="flex items-center" style={{ marginLeft: "auto", fontSize: 13, color: "var(--accent)" }}>เปิดหน้างาน <ChevronRight size={14} /></Link>
          </div>
          <div className="kpi-grid">
            <KpiCard label="ต้องรีบ (≤3 วัน)" value={urgent.length} tone="warning" icon={ListTodo} onClick={goTasks} />
            <KpiCard label="เลยกำหนด" value={overdue.length} tone="danger" onClick={goTasks} />
            <KpiCard label="งานที่ยังไม่เสร็จ" value={openTasks.length} tone="neutral" onClick={goTasks} />
          </div>
        </section>

        {/* คิวงาน */}
        <section>
          <div className="flex items-center gap-2 mb-3" style={{ color: "var(--text-2)", fontWeight: 600, fontSize: 14 }}>
            งานที่ต้องทำตอนนี้ {queue.length > 0 && <span className="ui-badge danger">{queue.length}</span>}
          </div>
          <ActionQueue items={queue} empty="ไม่มีงานเร่งด่วนตอนนี้ 🎉" />
        </section>
      </div>
    </Workspace>
  );
}
