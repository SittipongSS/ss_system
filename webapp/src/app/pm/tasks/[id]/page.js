"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Briefcase, Calendar, CheckCircle2, CircleDashed, Clock, FolderKanban, ListTodo, MessageCircleQuestion, Pencil, Save, Tag, User, X } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import DateInput from "@/components/ui/DateInput";
import Select from "@/components/ui/Select";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { DIFFICULTY_LABELS, DIFFICULTY_OPTIONS, TASK_CATEGORIES } from "@/lib/pm/tasks";
import { fmtDateNumeric, fmtDateTime } from "@/lib/format";
import styles from "./page.module.css";

const STATUS_LABELS = { Pending: "รอดำเนินการ", "In Progress": "กำลังทำ", Completed: "เสร็จแล้ว" };
const STATUS_COLORS = { Pending: "var(--text-3)", "In Progress": "var(--accent)", Completed: "var(--green)" };

// วันที่วันนี้ตามเครื่องผู้ใช้ (ไทย = ICT) รูปแบบ YYYY-MM-DD — ใช้เทียบเลยกำหนดฝั่ง client
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function TaskDetailPage() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [updates, setUpdates] = useState([]);
  const [newUpdate, setNewUpdate] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/pm/personal-tasks/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "ไม่สามารถโหลดงานได้");
      setTask(body); setForm(body);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [id]);
  const loadUpdates = useCallback(async () => {
    try {
      const res = await fetch(`/api/pm/personal-tasks/${id}/updates`, { cache: "no-store" });
      if (res.ok) setUpdates(await res.json());
    } catch { /* เงียบ — สายอัปเดตไม่ critical */ }
  }, [id]);
  useEffect(() => { load(); loadUpdates(); }, [load, loadUpdates]);

  async function postUpdate() {
    const text = newUpdate.trim();
    if (!text) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/pm/personal-tasks/${id}/updates`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "โพสต์อัปเดตไม่สำเร็จ");
      setNewUpdate(""); await loadUpdates();
    } catch (e) { setError(e.message); } finally { setPosting(false); }
  }
  const change = (key) => (e) => setForm((v) => ({ ...v, [key]: e?.target ? e.target.value : e }));

  async function save() {
    setError("");
    // ปิดงานที่ "เลยกำหนด" → ต้องระบุสาเหตุที่ทำเสร็จช้า (server บังคับซ้ำ)
    const due = form.dueDate || task.dueDate;
    const willComplete = form.status === "Completed" && task.status !== "Completed";
    let lateReason;
    if (willComplete && due && due < todayLocal()) {
      const r = window.prompt("งานนี้เลยกำหนดแล้ว — ระบุสาเหตุที่ทำเสร็จช้า", "");
      if (r == null || !r.trim()) { setError("ต้องระบุสาเหตุที่ทำเสร็จช้าก่อนปิดงาน"); return; }
      lateReason = r.trim();
    }
    setBusy(true);
    try {
      const keys = task.canManage ? ["title", "note", "startDate", "dueDate", "status", "category", "difficulty"] : ["status"];
      const payload = Object.fromEntries(keys.map((key) => [key, form[key] ?? null]));
      if (lateReason !== undefined) payload.lateReason = lateReason;
      const res = await fetch(`/api/pm/personal-tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "บันทึกไม่สำเร็จ");
      setEditing(false); await load(); loadUpdates();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

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
          actions={(task.canManage || task.canChangeStatus) ? (!editing ? <button className="btn" onClick={() => setEditing(true)}><Pencil size={14} /> แก้ไข</button> : <><button className="btn" onClick={() => { setEditing(false); setForm(task); }} disabled={busy}><X size={14} /> ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={busy}><Save size={14} /> {busy ? "กำลังบันทึก..." : "บันทึก"}</button></>) : null}
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
            {task.lateReason && <div className={`${styles.field} ${styles.wide}`}><span className={styles.label}>สาเหตุที่ทำเสร็จช้า</span><div className={styles.value} style={{ color: "var(--amber)" }}>{task.lateReason}</div></div>}
          </div>}
        </DetailCard>

        {(task.project || task.deal || task.inquiry) && <DetailCard icon={FolderKanban} eyebrow="Business context" title="งานที่เชื่อมโยง"><ContextGrid>
          {task.project && <ContextCard icon={FolderKanban} href={`/sa/projects/${task.project.id}`} eyebrow="โครงการ" title={`${task.project.code ? `${task.project.code} · ` : ""}${task.project.name}`} subtitle={task.project.customerName || "รายละเอียดโครงการ"} facts={[{ label: "ทีม", value: task.project.team || "-" }, { label: "AE", value: task.project.aeOwner || "-" }]} />}
          {task.deal && <ContextCard icon={Briefcase} href={`/sales-planning/deals/${task.deal.id}`} eyebrow="ดีล" title={task.deal.title} subtitle={task.deal.customerName || "รายละเอียดดีล"} facts={[{ label: "ทีม", value: task.deal.team || "-" }, { label: "เจ้าของดีล", value: task.deal.ownerName || "-" }]} />}
          {task.inquiry && <ContextCard icon={MessageCircleQuestion} href={`/sa/inquiries/${task.inquiry.id}`} eyebrow="ข้อความต้นทาง" title={`${task.inquiry.code || "สอบถาม RD"} · ${task.inquiry.title}`} subtitle="เปิดการสนทนาและข้อมูลประกอบ" badges={<span className="ui-badge">{task.inquiry.status}</span>} />}
        </ContextGrid></DetailCard>}

        <DetailCard icon={ListTodo} eyebrow="Progress updates" title="อัปเดตความคืบหน้า" meta={`${updates.length} รายการ`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {updates.length === 0 && <div style={{ color: "var(--text-3)", fontSize: 13 }}>ยังไม่มีอัปเดต — โพสต์ความคืบหน้า หรือระบุปัญหาที่ติดอยู่ได้เลย</div>}
            {updates.map((u) => {
              const late = u.kind === "late";
              const system = u.kind === "status" || u.kind === "due";
              let text = u.body;
              if (u.kind === "status") text = `เปลี่ยนสถานะ: ${STATUS_LABELS[u.fromStatus] || u.fromStatus || "-"} → ${STATUS_LABELS[u.toStatus] || u.toStatus}`;
              if (late) text = `ปิดงานเกินกำหนด — ${u.body}`;
              return (
                <div key={u.id} style={{ borderLeft: `2px solid ${late ? "var(--amber)" : system ? "var(--border)" : "var(--accent)"}`, paddingLeft: 10 }}>
                  <div style={{ fontSize: 13, color: late ? "var(--amber)" : "var(--text)", whiteSpace: "pre-wrap" }}>{text}</div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{u.authorName || "-"} · {fmtDateTime(u.createdAt)}</div>
                </div>
              );
            })}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <textarea className="premium-input" rows={2} value={newUpdate} onChange={(e) => setNewUpdate(e.target.value)} placeholder="อัปเดตความคืบหน้า / ติดอะไรอยู่..." style={{ resize: "vertical" }} />
              <button type="button" className="btn btn-primary sm" style={{ alignSelf: "flex-end" }} onClick={postUpdate} disabled={posting || !newUpdate.trim()}>
                {posting ? "กำลังโพสต์..." : "โพสต์อัปเดต"}
              </button>
            </div>
          </div>
        </DetailCard>
        </DetailPageLayout>
    </div>}
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
