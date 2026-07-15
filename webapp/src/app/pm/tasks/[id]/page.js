"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, Briefcase, Calendar, CheckCircle2, CircleDashed, Clock, FolderKanban, ListTodo, MessageCircleQuestion, Pencil, Save, Tag, User, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DateInput from "@/components/ui/DateInput";
import Select from "@/components/ui/Select";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { DIFFICULTY_LABELS, DIFFICULTY_OPTIONS, TASK_CATEGORIES } from "@/lib/pm/tasks";
import { fmtDateNumeric, fmtDateTime } from "@/lib/format";
import styles from "./page.module.css";

const STATUS_LABELS = { Pending: "รอดำเนินการ", "In Progress": "กำลังทำ", Completed: "เสร็จแล้ว" };
const STATUS_COLORS = { Pending: "var(--text-3)", "In Progress": "var(--accent)", Completed: "var(--green)" };

export default function TaskDetailPage() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/pm/personal-tasks/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "ไม่สามารถโหลดงานได้");
      setTask(body); setForm(body);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const change = (key) => (e) => setForm((v) => ({ ...v, [key]: e?.target ? e.target.value : e }));

  async function save() {
    setBusy(true); setError("");
    try {
      const keys = task.canManage ? ["title", "note", "startDate", "dueDate", "status", "category", "difficulty"] : ["status"];
      const payload = Object.fromEntries(keys.map((key) => [key, form[key] ?? null]));
      const res = await fetch(`/api/pm/personal-tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "บันทึกไม่สำเร็จ");
      setEditing(false); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const person = (userId) => task?.people?.[userId] || "-";
  const statusIcon = task?.status === "Completed" ? CheckCircle2 : task?.status === "In Progress" ? Clock : CircleDashed;

  return <Workspace icon={<ListTodo size={22} />} title={task?.title || "รายละเอียดงาน"} subtitle="กำหนดการ ผู้รับผิดชอบ และงานที่เชื่อมโยง" back={{ href: "/sa/tasks", label: "กลับหน้ารายการงาน" }} hideHeader loading={loading}>
    {error && <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>{error}</div>}
    {task && <div className={styles.layout}>
      <main className={styles.main}>
        <SalesDetailOverview
          eyebrow="รายละเอียดงาน"
          title={task.title}
          description={<><span>{task.category || "งานทั่วไป"}</span>{task.project && <><span>·</span><span>{task.project.name}</span></>}{task.deal && <><span>·</span><span>{task.deal.title}</span></>}</>}
          badges={<SalesStateBadge label={STATUS_LABELS[task.status] || task.status} color={STATUS_COLORS[task.status]} />}
          actions={(task.canManage || task.canChangeStatus) ? (!editing ? <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> แก้ไข</button> : <><button className="btn" onClick={() => { setEditing(false); setForm(task); }} disabled={busy}><X size={14} /> ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} /> {busy ? "กำลังบันทึก..." : "บันทึก"}</button></>) : null}
          facts={[
            { icon: statusIcon, label: "สถานะ", value: STATUS_LABELS[task.status] || task.status },
            { icon: Calendar, label: "วันเริ่ม", value: task.startDate ? fmtDateNumeric(task.startDate) : "ไม่ระบุ" },
            { icon: AlertTriangle, label: "กำหนดเสร็จ", value: task.dueDate ? fmtDateNumeric(task.dueDate) : "ไม่ระบุ" },
            { icon: User, label: "ผู้รับผิดชอบ", value: person(task.assigneeId || task.ownerId) },
          ]}
        />

        <section className={styles.card}>
          <div className={styles.heading}><h2>ข้อมูลงาน</h2>{!task.canManage && <span className="ui-badge">แก้ได้เฉพาะสถานะ</span>}</div>
          {editing ? <div className={styles.grid}>
            <div className={`${styles.field} ${styles.wide}`}><label>ชื่องาน</label><input value={form.title || ""} onChange={change("title")} disabled={!task.canManage} /></div>
            <div className={styles.field}><label>สถานะ</label><Select value={form.status || "Pending"} onChange={change("status")} disabled={!task.canChangeStatus}><option value="Pending">รอดำเนินการ</option><option value="In Progress">กำลังทำ</option><option value="Completed">เสร็จแล้ว</option></Select></div>
            <div className={styles.field}><label>หมวดงาน</label><Select value={form.category || ""} onChange={change("category")} disabled={!task.canManage}><option value="">ไม่ระบุ</option>{TASK_CATEGORIES.map((v) => <option key={v} value={v}>{v}</option>)}</Select></div>
            <div className={styles.field}><label>วันเริ่ม</label><DateInput value={form.startDate || ""} onChange={change("startDate")} disabled={!task.canManage} /></div>
            <div className={styles.field}><label>กำหนดเสร็จ</label><DateInput value={form.dueDate || ""} onChange={change("dueDate")} disabled={!task.canManage} /></div>
            <div className={styles.field}><label>ความยาก</label><Select value={String(form.difficulty || 2)} onChange={change("difficulty")} disabled={!task.canManage}>{DIFFICULTY_OPTIONS.map((v) => <option key={v} value={v}>{DIFFICULTY_LABELS[v]}</option>)}</Select></div>
            <div className={`${styles.field} ${styles.wide}`}><label>รายละเอียด / โน้ต</label><textarea value={form.note || ""} onChange={change("note")} disabled={!task.canManage} /></div>
          </div> : <div className={styles.grid}>
            <div className={styles.field}><span className={styles.label}>หมวดงาน</span><div className={styles.value}><Tag size={14} /> {task.category || "ไม่ระบุ"}</div></div>
            <div className={styles.field}><span className={styles.label}>ความยาก</span><div className={styles.value}>{DIFFICULTY_LABELS[task.difficulty] || task.difficulty || "-"}</div></div>
            <div className={`${styles.field} ${styles.wide}`}><span className={styles.label}>รายละเอียด / โน้ต</span><div className={styles.value}>{task.note || "ไม่มีรายละเอียดเพิ่มเติม"}</div></div>
          </div>}
        </section>

        {(task.project || task.deal || task.inquiry) && <section className={styles.card}><div className={styles.heading}><h2>งานที่เชื่อมโยง</h2></div><div className={styles.links}>
          {task.project && <Link className={styles.linkCard} href={`/sa/projects/${task.project.id}`}><FolderKanban size={18} /><span><strong>{task.project.name}</strong><small>{[task.project.code, task.project.customerName].filter(Boolean).join(" · ")}</small></span></Link>}
          {task.deal && <Link className={styles.linkCard} href={`/sales-planning/deals/${task.deal.id}`}><Briefcase size={18} /><span><strong>{task.deal.title}</strong><small>{task.deal.customerName || "รายละเอียดดีล"}</small></span></Link>}
          {task.inquiry && <Link className={styles.linkCard} href={`/sa/inquiries/${task.inquiry.id}`}><MessageCircleQuestion size={18} /><span><strong>{task.inquiry.code || "สอบถาม RD"} · {task.inquiry.title}</strong><small>เปิดข้อความต้นทาง</small></span></Link>}
        </div></section>}
      </main>

      <aside className={styles.sidebar}><section className={styles.card}><div className={styles.heading}><h2>ผู้เกี่ยวข้อง</h2></div>
        <div className={styles.summaryRow}><span>เจ้าของงาน</span><strong>{person(task.ownerId)}</strong></div>
        <div className={styles.summaryRow}><span>ผู้รับมอบหมาย</span><strong>{person(task.assigneeId)}</strong></div>
        <div className={styles.summaryRow}><span>มอบหมายโดย</span><strong>{person(task.assignedBy)}</strong></div>
        <div className={styles.summaryRow}><span>สร้างเมื่อ</span><strong>{fmtDateTime(task.createdAt)}</strong></div>
        <div className={styles.summaryRow}><span>แก้ไขล่าสุด</span><strong>{fmtDateTime(task.updatedAt)}</strong></div>
      </section></aside>
    </div>}
  </Workspace>;
}
