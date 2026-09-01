"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, Calendar, Clock, CornerDownRight, FolderKanban, Handshake, Link2, ListTodo, MessageCircleQuestion, MessageSquare, PauseCircle, Pencil, Send, Tag, User } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import ReadableText from "@/components/ui/ReadableText";
import SalesDetailOverview, { DetailStateBadge as SalesStateBadge } from "@/components/ui/DetailOverview";
import { ContextCard, ContextGrid, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import UpdateThread from "@/components/updates/UpdateThread";
import TaskFormModal, { TASK_BLANK } from "@/components/pm/TaskFormModal";
import { DIFFICULTY_LABELS, TASK_STATUS_TH, isWaitingStatus } from "@/lib/pm/tasks";
import { taskUrgency } from "@/lib/pm/derived";
import { daysWaiting } from "@/lib/pm/taskChain";
import { cachedFetchJson } from "@/lib/apiCache";
import { assignableUsersFor, isRdRole } from "@/lib/permissions";
import { useCan, useRole } from "@/lib/roleContext";
import { fmtDateNumeric, fmtDateTime, naText } from "@/lib/format";
import usePeopleDirectory from "@/lib/usePeopleDirectory";
import { livePersonName } from "@/lib/ui/personName";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

const STATUS_LABELS = TASK_STATUS_TH;
const STATUS_COLORS = {
  Pending: "var(--text-3)", "In Progress": "var(--accent)",
  Blocked: "var(--purple)", Completed: "var(--green)",
};

/* ป้ายกำหนดเสร็จ — หน้านี้เคยโชว์แค่ "วันที่" เฉย ๆ ทุกสถานะ อ่านแล้วไม่รู้ว่าเลยมาแล้ว
   กี่วัน (แก้ 2026-08-17 พร้อมกับบั๊กเดียวกันที่หน้ารายการ) · ตรรกะใช้ตัวเดียวกับ
   หน้ารายการคือ `taskUrgency` — ที่นี่แค่แปลง tone เป็นโทนสีของ quickFacts
   late = อยู่ในมือเรา (แดง) · wait = รอคนอื่นอยู่ (ม่วง) */
const FACT_TONE = { overdue: "late", soon: "late", waiting: "wait" };

// วันนี้ตามเครื่องผู้ใช้ (ไทย = ICT) — ใช้นับ "รอมาแล้วกี่วัน"
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function dueFact(task) {
  const value = task.dueDate ? fmtDateNumeric(task.dueDate) : "ไม่ระบุ";
  if (!task.dueDate || task.status === "Completed") return { value };
  const u = taskUrgency(task, { waiting: isWaitingStatus(task.status) });
  return { value, sub: u.label, tone: FACT_TONE[u.tone] };
}

/* ค่าคงที่ระดับโมดูล ไม่ใช่ object ใหม่ทุก render (และไม่โดน ratchet `audit:ui` นับ
   เป็นชั้นสไตล์เก่าแบบ `style={{…}}` inline) */
const CHAIN_ACTION = { color: "var(--purple)" };
const WAIT_TEXT = { color: "var(--purple)" };
const CHAIN_MUTED = { color: "var(--text-3)" };

export default function TaskDetailPage() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const directory = usePeopleDirectory(); // แปลง id → ชื่อปัจจุบันบนการ์ดบริบท
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  // ตัวเลือกของโมดัล (ดีล/โครงการ/คน) — โหลดตอนกดแก้ไขเท่านั้น ไม่ใช่ตอนเปิดหน้า
  // (คนส่วนใหญ่เข้ามาดูเฉย ๆ ไม่ได้แก้ — ไม่ควรจ่ายค่าโหลดลิสต์พวกนี้ทุกครั้งที่เปิดหน้า)
  const [opts, setOpts] = useState({ deals: [], projects: [], assignableUsers: [] });
  const [followUp, setFollowUp] = useState(null); // ค่าตั้งต้นของงานต่อเนื่อง (null = ไม่ได้เปิด)
  // สร้างงานได้ = pm:edit (rd จัดการงานของฝ่ายตัวเองได้ — กติกาเดียวกับหน้ารายการ)
  const role = useRole();
  const canCreateTasks = useCan("pm:edit") || isRdRole(role);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await apiFetch(`/api/pm/personal-tasks/${id}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        // อย่าโชว์คำว่า "forbidden" ดิบ ๆ — แปลเป็นข้อความที่คนอ่านรู้เรื่อง
        const msg = res.status === 403 ? "คุณไม่มีสิทธิ์ดูงานนี้ (อยู่นอกทีม/ขอบเขตของคุณ)"
          : res.status === 404 ? "ไม่พบงานนี้ (อาจถูกลบไปแล้ว)"
          : (body?.error === "forbidden" ? "คุณไม่มีสิทธิ์ดูงานนี้" : body?.error) || "ไม่สามารถโหลดงานได้";
        throw new Error(msg);
      }
      setTask(body);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const loadFormOptions = () => {
    const json = (url) => apiFetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    return Promise.all([
      cachedFetchJson("/api/pm/assignable-users").catch(() => []),
      json("/api/pm/task-deals"),   // ดีลที่ผูกงานได้ (scope ทีม) — ตัวเดียวกับหน้ารายการ
      json("/api/pm/projects"),     // ใช้แค่ติดรหัสโครงการหน้าชื่อดีลใน dropdown
    ]).then(([users, deals, projects]) => setOpts({
      // ต้องกรองด้วยกติกาเดียวกับ server — ยิงรายชื่อดิบเข้า dropdown จะเห็นคนทั้งบริษัท
      // ทุกฝ่าย เลือกไปก็โดนปฏิเสธ (หน้ารายการกรองอยู่ หน้านี้เคยลืม)
      assignableUsers: assignableUsersFor(task?.me, Array.isArray(users) ? users : []),
      deals: Array.isArray(deals) ? deals : [],
      projects: Array.isArray(projects) ? projects : [],
    }));
  };
  const openEdit = () => { setEditing(true); loadFormOptions(); };

  const person = (userId) => naText(task?.people?.[userId]);

  /* สร้างงานต่อเนื่อง (mig 0266) — ก๊อปบริบทของใบนี้ให้ (ดีล/หมวด/ผู้รับผิดชอบ)
     สถานะปล่อยให้ API ตัดสิน: ใบนี้ยังไม่ปิด = ใบใหม่เริ่มที่ "รอคนอื่น" อัตโนมัติ */
  const openFollowUp = () => {
    setFollowUp({
      ...TASK_BLANK,
      predecessorId: task.id,
      dealId: task.dealId || "",
      projectId: task.projectId || "",
      category: task.category || "",
      assigneeId: task.assigneeId || "",
    });
    loadFormOptions();
  };

  // ปุ่มแก้ไข = action ระดับ entity — ไอคอนแถวเดียวกับปุ่มย้อนกลับ ตามกติกา Page Header
  // ⚠️ ปุ่ม "งานต่อเนื่อง" = **สร้างงานใหม่** จึงต้องกั้นด้วย pm:edit เหมือนปุ่ม "เพิ่มงาน"
  // ที่หน้ารายการ — ไม่ใช่สิทธิ์ของงานใบนี้ (ผู้สังเกตการณ์เห็นงานได้ แต่สร้างไม่ได้
  // กดแล้วจะไปตายที่ 403 ตอนบันทึก)
  const backActions = task ? (
    <>
      {canCreateTasks && (
        <Button iconOnly style={CHAIN_ACTION} onClick={openFollowUp} aria-label="สร้างงานต่อเนื่อง" title="สร้างงานต่อเนื่องจากงานนี้" icon={<CornerDownRight size={16} aria-hidden="true" />} />
      )}
      {(task.canManage || task.canChangeStatus) && (
        <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} onClick={openEdit} aria-label="แก้ไขงาน" title="แก้ไข">
          <Pencil size={16} aria-hidden="true" />
        </button>
      )}
    </>
  ) : null;

  return <Workspace icon={<ListTodo size={22} />} title={task?.title || "รายละเอียดงาน"} subtitle="กำหนดการ ผู้รับผิดชอบ และงานที่เชื่อมโยง" back={{ href: "/sa/tasks", label: "กลับหน้ารายการงาน" }} backActions={backActions} hideHeader loading={loading}>
    {error && <div className="glass-panel" role="alert" style={{ padding: "12px 14px", borderColor: "var(--red)", color: "var(--red)", marginBottom: 16 }}>{error}</div>}
    {task && <div className={styles.page}>
        <SalesDetailOverview
          eyebrow="รายละเอียดงาน"
          title={task.title}
          description={<><span>{task.category || "งานทั่วไป"}</span>{task.project && <><span>·</span><span>{task.project.name}</span></>}{task.deal && <><span>·</span><span>{task.deal.title}</span></>}</>}
          badges={<SalesStateBadge label={STATUS_LABELS[task.status] || task.status} color={STATUS_COLORS[task.status]} />}
          // ไม่มีช่อง "สถานะ" ในแถวนี้ — ป้ายข้างชื่องานบอกอยู่แล้ว (แบบเดียวกับหน้า
          // สอบถาม RD) เดิมโชว์ซ้ำสองที่ในการ์ดเดียวกัน
          facts={[
            { icon: Calendar, label: "วันเริ่ม", value: task.startDate ? fmtDateNumeric(task.startDate) : "ไม่ระบุ" },
            { icon: AlertTriangle, label: "กำหนดเสร็จ", ...dueFact(task) },
            ...(task.originalDueDate ? [{ icon: Clock, label: "เดดไลน์แรก", value: fmtDateNumeric(task.originalDueDate) }] : []),
            { icon: User, label: "ผู้รับผิดชอบ", value: person(task.assigneeId || task.ownerId) },
          ]}
        />

        <DetailPageLayout aside={<><TaskPeople task={task} person={person} />{/* rail ข้างแคบ — การ์ดแถวละใบ ไม่งั้นชื่อไทยไม่มีช่องว่างโดนหั่นกลางคำ (แพตเทิร์นเดียวกับหน้า tax) */}
<AttachmentsPanel entityType="personal_task" entityId={task.id} canEdit={!!task.canManage} title="ไฟล์แนบงาน" cardColumns={1} /></>}>

        <DetailCard icon={ListTodo} eyebrow="Task information" title="ข้อมูลงาน" actions={!task.canManage ? <span className="ui-badge">แก้ได้เฉพาะสถานะ</span> : null}>
          <div className={styles.grid}>
            <div className={styles.field}><span className={styles.label}>หมวดงาน</span><div className={styles.value}><Tag size={14} /> {task.category || "ไม่ระบุ"}</div></div>
            <div className={styles.field}><span className={styles.label}>ความยาก</span><div className={styles.value}>{DIFFICULTY_LABELS[task.difficulty] || naText(task.difficulty)}</div></div>
            {/* งานที่รอคนอื่น: "รออะไรอยู่" คือคำตอบของคำถามที่คนเปิดหน้านี้มาถาม —
                ต่างจาก lateReason ตรงที่มันยังเป็นเรื่องปัจจุบัน ไม่ใช่บันทึกหลังจบงาน
                จึงอยู่บนการ์ด ไม่ได้อยู่แต่ในเธรด */}
            {isWaitingStatus(task.status) && (
              <div className={`${styles.field} ${styles.wide}`}>
                <span className={styles.label}>รออะไรอยู่</span>
                <div className={styles.value} style={WAIT_TEXT}>
                  <PauseCircle size={14} /> {task.blockedReason || "ไม่ได้ระบุ"}
                  {daysWaiting(task, todayLocal()) !== null && ` · รอมาแล้ว ${daysWaiting(task, todayLocal())} วัน`}
                </div>
              </div>
            )}
            <div className={`${styles.field} ${styles.wide}`}><span className={styles.label}>รายละเอียด / โน้ต</span><ReadableText className={styles.value} text={task.note} lines={5} empty={<div className={styles.value}>ไม่มีรายละเอียดเพิ่มเติม</div>} /></div>
            {/* ไม่มีช่อง "สาเหตุที่ทำเสร็จช้า" ที่นี่ — อยู่ในเธรดอัปเดตงานแล้ว (มติผู้ใช้
                2026-07-17). ช่องนี้อ่าน task.lateReason ซึ่งเก็บค่าล่าสุดค่าเดียว และ
                ถูกล้างทิ้งตอนเปิดงานใหม่/ปิดตรงเวลา — เธรดเก็บครบทุกครั้งพร้อมเวลา
                และคนเขียน จึงเห็นคู่กับอัปเดตอื่นตามลำดับเวลา. คอลัมน์ใน DB ยังอยู่
                (KPI/รายงานยังใช้ได้) แค่ไม่โชว์ซ้ำ */}
          </div>
        </DetailCard>

        <TaskUpdates task={task} onPosted={load} />

        {/* สายงาน (mig 0266) — ทั้งใบก่อนหน้าและใบที่ต่อจากงานนี้ อยู่การ์ดเดียวกัน
            เพราะคำถามคือคำถามเดียว: "งานนี้อยู่ตรงไหนของสาย" */}
        {(task.predecessor || task.followers?.length > 0) && (
          <DetailCard icon={CornerDownRight} eyebrow="Task chain" title="สายงาน" meta={task.followers?.length ? `งานต่อเนื่อง ${task.followers.length} งาน` : null}>
            <div className={styles.grid}>
              {task.predecessor && (
                <div className={`${styles.field} ${styles.wide}`}>
                  <span className={styles.label}>ต่อจากงาน</span>
                  <div className={styles.value}>
                    <Link href={`/sa/tasks/${task.predecessor.id}`} className="linklike">{task.predecessor.title}</Link>
                    <span style={CHAIN_MUTED}> · {STATUS_LABELS[task.predecessor.status] || task.predecessor.status}</span>
                  </div>
                </div>
              )}
              {(task.followers || []).map((next) => (
                <div key={next.id} className={`${styles.field} ${styles.wide}`}>
                  <span className={styles.label}>งานต่อเนื่อง</span>
                  <div className={styles.value}>
                    <Link href={`/sa/tasks/${next.id}`} className="linklike">{next.title}</Link>
                    <span style={CHAIN_MUTED}> · {STATUS_LABELS[next.status] || next.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </DetailCard>
        )}

        {/* การ์ดรวมของที่ผูกกับงาน — ใช้ไอคอน "ลิงก์" ไม่ใช่ไอคอนโครงการ เพราะข้างในมีทั้ง
            โครงการ ดีล และคำร้อง (FolderKanban = โครงการอย่างเดียว ดู entityIcon.test.mjs) */}
        {(task.project || task.deal || task.inquiry) && <DetailCard icon={Link2} eyebrow="Business context" title="งานที่เชื่อมโยง"><ContextGrid>
          {task.project && <ContextCard icon={FolderKanban} href={`/sa/projects/${task.project.id}`} eyebrow="โครงการ" title={`${task.project.code ? `${task.project.code} · ` : ""}${task.project.name}`} subtitle={task.project.customerName || "รายละเอียดโครงการ"} facts={[{ label: "ทีม", value: naText(task.project.team) }, { label: "AE", value: naText(task.project.aeOwner) }]} />}
          {task.deal && <ContextCard icon={Handshake} href={`/sales-planning/deals/${task.deal.id}`} eyebrow="ดีล" title={task.deal.title} subtitle={task.deal.customerName || "รายละเอียดดีล"} facts={[{ label: "ทีม", value: naText(task.deal.team) }, { label: "เจ้าของดีล", value: naText(livePersonName(directory, task.deal.ownerId, task.deal.ownerName)) }]} />}
          {task.inquiry && <ContextCard icon={MessageCircleQuestion} href={`/requests/${task.inquiry.id}`} eyebrow="ข้อความต้นทาง" title={`${task.inquiry.code || "คำร้อง"} · ${task.inquiry.title}`} subtitle="เปิดการสนทนาและข้อมูลประกอบ" badges={<span className="ui-badge">{task.inquiry.status}</span>} />}
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

    {/* งานต่อเนื่อง = โมดัลสร้างงานตัวเดิม แค่ preset ค่ามาให้ (AGENTS.md: ห้ามฟอร์มที่สอง) */}
    {task && followUp && (
      <TaskFormModal
        open
        onClose={() => setFollowUp(null)}
        initialForm={followUp}
        chainSource={{ id: task.id, title: task.title }}
        deals={opts.deals}
        projects={opts.projects}
        assignableUsers={opts.assignableUsers}
        me={task.me}
        onSaved={() => { setFollowUp(null); load(); }}
      />
    )}
  </Workspace>;
}

// เธรดอัปเดตความคืบหน้า: คนทำงานเล่าว่าติดอะไร + ระบบบันทึกการเปลี่ยนสถานะ/
// เลื่อนกำหนดให้เอง — หัวหน้าจะได้ไม่ต้องเดินมาถามว่าทำไมยังไม่เสร็จ
//
// mig 0163: ย้ายมาใช้ `UpdateThread` ของกลาง (เดิมวาดเองที่นี่ตั้งแต่ mig 0113) —
// ได้ "แนบรูป" กับ "แก้/ลบข้อความตัวเอง" มาด้วย ซึ่งของเดิมทำไม่ได้ทั้งคู่
function TaskUpdates({ task, onPosted }) {
  const count = (task.updates || []).length;
  return <DetailCard icon={MessageSquare} eyebrow="Progress updates" title="อัปเดตงาน" meta={count ? `${count} รายการ` : null}>
    <UpdateThread
      entityType="personal_task"
      entityId={task.id}
      placeholder="ติดอะไรอยู่ / คืบหน้าถึงไหนแล้ว..."
      emptyText="ยังไม่มีอัปเดต — เล่าความคืบหน้าหรือสิ่งที่ติดอยู่ไว้ตรงนี้ได้ แนบรูปหน้างานได้ด้วย"
      onPosted={onPosted}
    />
  </DetailCard>;
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
