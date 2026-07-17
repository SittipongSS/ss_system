"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Briefcase, Calendar, CheckCircle2, CircleDashed, Clock, FolderKanban, ListTodo, MessageCircleQuestion, Pencil, Tag, User } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import TaskFormModal from "@/components/pm/TaskFormModal";
import { DIFFICULTY_LABELS } from "@/lib/pm/tasks";
import { cachedFetchJson } from "@/lib/apiCache";
import { fmtDateNumeric, fmtDateTime } from "@/lib/format";
import styles from "./page.module.css";

const STATUS_LABELS = { Pending: "รอดำเนินการ", "In Progress": "กำลังทำ", Completed: "เสร็จแล้ว" };
const STATUS_COLORS = { Pending: "var(--text-3)", "In Progress": "var(--accent)", Completed: "var(--green)" };

export default function TaskDetailPage() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  // ตัวเลือกของโมดัล (ดีล/โครงการ/คน) — โหลดตอนกดแก้ไขเท่านั้น ไม่ใช่ตอนเปิดหน้า
  // (คนส่วนใหญ่เข้ามาดูเฉย ๆ ไม่ได้แก้ — ไม่ควรจ่ายค่าโหลดลิสต์พวกนี้ทุกครั้งที่เปิดหน้า)
  const [opts, setOpts] = useState({ deals: [], projects: [], assignableUsers: [] });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/pm/personal-tasks/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "ไม่สามารถโหลดงานได้");
      setTask(body);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const openEdit = () => {
    setEditing(true);
    const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    Promise.all([
      cachedFetchJson("/api/pm/assignable-users").catch(() => []),
      json("/api/pm/task-deals"),   // ดีลที่ผูกงานได้ (scope ทีม) — ตัวเดียวกับหน้ารายการ
      json("/api/pm/projects"),     // ใช้แค่ติดรหัสโครงการหน้าชื่อดีลใน dropdown
    ]).then(([users, deals, projects]) => setOpts({
      assignableUsers: Array.isArray(users) ? users : [],
      deals: Array.isArray(deals) ? deals : [],
      projects: Array.isArray(projects) ? projects : [],
    }));
  };

  const person = (userId) => task?.people?.[userId] || "-";
  const statusIcon = task?.status === "Completed" ? CheckCircle2 : task?.status === "In Progress" ? Clock : CircleDashed;

  return <Workspace icon={<ListTodo size={22} />} title={task?.title || "รายละเอียดงาน"} subtitle="กำหนดการ ผู้รับผิดชอบ และงานที่เชื่อมโยง" back={{ href: "/sa/tasks", label: "กลับหน้ารายการงาน" }} hideHeader loading={loading}>
    {error && <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>{error}</div>}
    {task && <div className={styles.page}>
        <SalesDetailOverview
          eyebrow="รายละเอียดงาน"
          title={task.title}
          description={<><span>{task.category || "งานทั่วไป"}</span>{task.project && <><span>·</span><span>{task.project.name}</span></>}{task.deal && <><span>·</span><span>{task.deal.title}</span></>}</>}
          badges={<SalesStateBadge label={STATUS_LABELS[task.status] || task.status} color={STATUS_COLORS[task.status]} />}
          actions={(task.canManage || task.canChangeStatus)
            ? <button className="btn" onClick={openEdit}><Pencil size={14} /> แก้ไข</button>
            : null}
          facts={[
            { icon: statusIcon, label: "สถานะ", value: STATUS_LABELS[task.status] || task.status },
            { icon: Calendar, label: "วันเริ่ม", value: task.startDate ? fmtDateNumeric(task.startDate) : "ไม่ระบุ" },
            { icon: AlertTriangle, label: "กำหนดเสร็จ", value: task.dueDate ? fmtDateNumeric(task.dueDate) : "ไม่ระบุ" },
            ...(task.originalDueDate ? [{ icon: Clock, label: "เดดไลน์แรก", value: fmtDateNumeric(task.originalDueDate) }] : []),
            { icon: User, label: "ผู้รับผิดชอบ", value: person(task.assigneeId || task.ownerId) },
          ]}
        />

        <DetailPageLayout aside={<><TaskPeople task={task} person={person} /><AttachmentsPanel entityType="personal_task" entityId={task.id} canEdit={!!task.canManage} title="ไฟล์แนบงาน" /></>}>

        <DetailCard icon={ListTodo} eyebrow="Task information" title="ข้อมูลงาน" actions={!task.canManage ? <span className="ui-badge">แก้ได้เฉพาะสถานะ</span> : null}>
          <div className={styles.grid}>
            <div className={styles.field}><span className={styles.label}>หมวดงาน</span><div className={styles.value}><Tag size={14} /> {task.category || "ไม่ระบุ"}</div></div>
            <div className={styles.field}><span className={styles.label}>ความยาก</span><div className={styles.value}>{DIFFICULTY_LABELS[task.difficulty] || task.difficulty || "-"}</div></div>
            <div className={`${styles.field} ${styles.wide}`}><span className={styles.label}>รายละเอียด / โน้ต</span><div className={styles.value}>{task.note || "ไม่มีรายละเอียดเพิ่มเติม"}</div></div>
            {task.lateReason && <div className={`${styles.field} ${styles.wide}`}><span className={styles.label}>สาเหตุที่ทำเสร็จช้า</span><div className={styles.value} style={{ color: "var(--amber)" }}>{task.lateReason}</div></div>}
          </div>
        </DetailCard>

        {(task.project || task.deal || task.inquiry) && <DetailCard icon={FolderKanban} eyebrow="Business context" title="งานที่เชื่อมโยง"><ContextGrid>
          {task.project && <ContextCard icon={FolderKanban} href={`/sa/projects/${task.project.id}`} eyebrow="โครงการ" title={`${task.project.code ? `${task.project.code} · ` : ""}${task.project.name}`} subtitle={task.project.customerName || "รายละเอียดโครงการ"} facts={[{ label: "ทีม", value: task.project.team || "-" }, { label: "AE", value: task.project.aeOwner || "-" }]} />}
          {task.deal && <ContextCard icon={Briefcase} href={`/sales-planning/deals/${task.deal.id}`} eyebrow="ดีล" title={task.deal.title} subtitle={task.deal.customerName || "รายละเอียดดีล"} facts={[{ label: "ทีม", value: task.deal.team || "-" }, { label: "เจ้าของดีล", value: task.deal.ownerName || "-" }]} />}
          {task.inquiry && <ContextCard icon={MessageCircleQuestion} href={`/sa/inquiries/${task.inquiry.id}`} eyebrow="ข้อความต้นทาง" title={`${task.inquiry.code || "สอบถาม RD"} · ${task.inquiry.title}`} subtitle="เปิดการสนทนาและข้อมูลประกอบ" badges={<span className="ui-badge">{task.inquiry.status}</span>} />}
        </ContextGrid></DetailCard>}
        </DetailPageLayout>
    </div>}

    {/* แก้ไข = โมดัลตัวเดียวกับตอนสร้าง (มติผู้ใช้ 2026-07-17) */}
    {task && (
      <TaskFormModal
        open={editing}
        onClose={() => setEditing(false)}
        task={task}
        deals={opts.deals}
        projects={opts.projects}
        assignableUsers={opts.assignableUsers}
        me={task.me}
        canManage={!!task.canManage}
        canChangeStatus={!!task.canChangeStatus}
        onSaved={() => { setEditing(false); load(); }}
      />
    )}
  </Workspace>;
}

function TaskPeople({ task, person }) {
  return <DetailCard icon={User} eyebrow="Responsibility" title="ผู้เกี่ยวข้อง">
    <div className={styles.summaryRow}><span>เจ้าของงาน</span><strong>{person(task.ownerId)}</strong></div>
    <div className={styles.summaryRow}><span>ผู้รับมอบหมาย</span><strong>{person(task.assigneeId)}</strong></div>
    <div className={styles.summaryRow}><span>มอบหมายโดย</span><strong>{person(task.assignedBy)}</strong></div>
    <div className={styles.summaryRow}><span>สร้างเมื่อ</span><strong>{fmtDateTime(task.createdAt)}</strong></div>
    <div className={styles.summaryRow}><span>แก้ไขล่าสุด</span><strong>{fmtDateTime(task.updatedAt)}</strong></div>
  </DetailCard>;
}
