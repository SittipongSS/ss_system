"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, ListTodo, MessageCircleQuestion, RefreshCw, Users } from "lucide-react";
import { InquiryStatusBadge, inquiryDueTone } from "@/components/salesPlanning/inquiryUi";
import { fmtDate, fmtDateTime } from "@/lib/format";
import styles from "./RdDashboardTab.module.css";

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return null;
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

export default function RdDashboardTab({ month }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const todayISO = new Date().toLocaleDateString("en-CA");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const range = monthRange(month);
      const res = await fetch(`/api/sales-planning/rd-kpi${range ? `?from=${range.from}&to=${range.to}` : ""}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "โหลดแดชบอร์ด RD ไม่สำเร็จ");
      setData(payload);
    } catch (e) { setError(e.message || "โหลดแดชบอร์ด RD ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const feed = useMemo(() => {
    const inquiries = (data?.activityFeed || []).map((item) => ({ ...item, feedType: "inquiry", feedAt: item.createdAt }));
    const tasks = (data?.taskFeed || []).map((item) => ({ ...item, feedType: "task", feedAt: item.updatedAt || item.createdAt }));
    return [...inquiries, ...tasks]
      .filter((item) => filter === "all" || item.feedType === filter || (filter === "urgent" && item.urgent))
      .sort((a, b) => String(b.feedAt || "").localeCompare(String(a.feedAt || "")))
      .slice(0, 50);
  }, [data, filter]);
  const queue = data?.openQueue || [];
  const inq = data?.inquirySummary;

  if (error) return <div className="glass-panel" role="alert" style={{ padding: 16, color: "var(--red)" }}>{error}</div>;
  return <div className={styles.page} aria-busy={loading}>
    <div className={styles.layout}>
      <main className={styles.documentColumn}>
        <section className={`${styles.card} ${styles.overviewCard}`}>
          <div className={styles.overviewHeading}>
            <div>
              <div className={styles.overviewEyebrowRow}><span className={styles.eyebrow}>RD · TEAM WORKSPACE</span><span className={styles.period}>รอบข้อมูล {data?.from ? fmtDate(data.from) : "-"} – {data?.to ? fmtDate(data.to) : "-"}</span></div>
              <h2>ศูนย์ติดตามงาน RD</h2>
              <p>งานของทีม · ข้อสอบถามจากฝ่ายขาย · กำหนดตอบและการรับทราบ</p>
            </div>
            <div className={styles.headerActions}>
              <span className={styles.liveBadge}><Activity size={12} /> LIVE FEED</span>
              <button className="btn ghost sm" onClick={load} disabled={loading}><RefreshCw size={14} /> อัปเดต</button>
            </div>
          </div>
          <div className={styles.quickFacts}>
            <QuickFact icon={<MessageCircleQuestion />} label="รอตอบ" value={inq?.openNow} note={`ไม่มีผู้รับ ${inq?.unassignedOpen || 0}`} />
            <QuickFact icon={<AlertTriangle />} label="เลยกำหนด" value={inq?.overdueNow} tone={inq?.overdueNow ? "danger" : "good"} note="SLA / วันที่นัด" />
            <QuickFact icon={<CheckCircle2 />} label="ตอบแล้ว" value={inq?.answered} note={`ทันกำหนด ${inq?.onTimePct || 0}%`} />
            <QuickFact icon={<Clock3 />} label="เวลาตอบเฉลี่ย" value={inq?.avgResponseDays == null ? "-" : `${inq.avgResponseDays} วัน`} note="วันทำการ" />
          </div>
        </section>

        <section className={`${styles.card} ${styles.feedCard}`}>
          <div className={styles.sectionHead}><div className={styles.sectionTitle}><Activity size={17}/><div><h3>รายการอัปเดตล่าสุด</h3><span>เรียงจากกิจกรรมใหม่สุดของงานและข้อสอบถาม</span></div></div><div className={styles.filters}>
          {[['all','ทั้งหมด'],['task','งาน'],['inquiry','ข้อสอบถาม'],['urgent','ด่วน']].map(([key,label]) => <button key={key} className={filter === key ? styles.activeFilter : ""} onClick={() => setFilter(key)}>{label}</button>)}
          </div></div>
          <div className={styles.feed}>
          {feed.map((item) => item.feedType === "task" ? <TaskPost key={`task-${item.id}`} item={item} /> : <article key={`inquiry-${item.id}`} className={styles.post}>
            <div className={`${styles.avatar} ${item.authorDept === 'RD' ? styles.rd : styles.sa}`}>{item.authorDept || '?'}</div>
            <div className={styles.postBody}>
              <div className={styles.postMeta}><strong>{item.authorName || "ระบบ"}</strong><span>·</span><span>{fmtDateTime(item.createdAt)}</span>{item.editedAt && <span>· แก้ไขแล้ว</span>}</div>
              <Link href={`/sa/inquiries/${item.inquiryId}`} className={styles.postTitle}>{item.inquiryCode ? `${item.inquiryCode} · ` : ""}{item.inquiryTitle}</Link>
              <p className={item.kind === 'status' ? styles.statusText : ""}>{item.deletedAt ? "ข้อความถูกลบ" : (item.body || "อัปเดตกิจกรรม")}</p>
              <div className={styles.postFooter}><InquiryStatusBadge status={item.inquiryStatus} />{item.urgent && <span className={styles.urgent}>ด่วน</span>}{item.acknowledgedAt && <span className={styles.ack}>✓ รับทราบแล้ว</span>}<Link href={`/sa/inquiries/${item.inquiryId}`}>เปิดเธรด <ArrowUpRight size={12}/></Link></div>
            </div>
          </article>)}
          {!feed.length && <div className={styles.empty}>{loading ? "กำลังโหลดกิจกรรม..." : "ยังไม่มีกิจกรรมตามตัวกรองนี้"}</div>}
          </div>
        </section>
      </main>

      <aside className={styles.aside}>
        <section className={`${styles.card} ${styles.queueCard}`}><div className={styles.queueHead}><div className={styles.sectionTitle}><MessageCircleQuestion size={17}/><div><h3>คิวที่ต้องจัดการ</h3><span>{queue.length} เรื่องล่าสุด</span></div></div><Link href="/sa/inquiries">ดูทั้งหมด</Link></div>
          <div className={styles.queueList}>{queue.map((q) => { const due = inquiryDueTone(q, todayISO); return <Link href={`/sa/inquiries/${q.id}`} key={q.id} className={styles.queueItem}>
            <div><strong>{q.code || "RD"}</strong>{q.urgent && <span className={styles.dot}/>}</div><h4>{q.title}</h4><p>{q.assigneeName || "ยังไม่มีผู้รับ"}</p>{q.dueDate && <small style={{ color: due?.color }}>กำหนด {fmtDate(q.dueDate)} {due?.label}</small>}
          </Link>; })}{!queue.length && <div className={styles.empty}>ไม่มีเรื่องค้าง 🎉</div>}</div>
        </section>
        <section className={`${styles.card} ${styles.teamCard}`}><div className={styles.sectionTitle}><Users size={18}/><div><h3>ภาพรวมทีม</h3><span>ประสิทธิภาพงานในรอบนี้</span></div></div><div className={styles.teamFacts}><p>งานเสร็จ <strong>{data?.taskSummary?.completed || 0}/{data?.taskSummary?.total || 0}</strong></p><p>กำลังดำเนินการ <strong>{data?.taskSummary?.active || 0}</strong></p><p>เลยกำหนด <strong className={data?.taskSummary?.overdue ? styles.danger : ""}>{data?.taskSummary?.overdue || 0}</strong></p><p>เสร็จตรงเวลา <strong>{data?.taskSummary?.onTimePct || 0}%</strong></p></div></section>
      </aside>
    </div>
  </div>;
}

function QuickFact({ icon, label, value, note, tone }) {
  return <div><span className={styles.factIcon}>{icon}</span><span><small>{label}</small><strong className={tone ? styles[tone] : ""}>{value ?? "-"}</strong><em>{note}</em></span></div>;
}

function TaskPost({ item }) {
  const statusLabel = { Pending: "รอดำเนินการ", "In Progress": "กำลังทำ", Completed: "เสร็จแล้ว" }[item.status] || item.status;
  return <article className={`${styles.post} ${styles.taskPost}`}>
    <div className={`${styles.avatar} ${styles.taskAvatar}`}><ListTodo size={16} /></div>
    <div className={styles.postBody}>
      <div className={styles.postMeta}><strong>{item.assigneeName}</strong><span>·</span><span>{fmtDateTime(item.feedAt)}</span><span className={styles.typeLabel}>งาน RD</span></div>
      <Link href={`/pm/tasks/${item.id}`} className={styles.postTitle}>{item.title}</Link>
      <p>{item.note || `${item.assignedByName ? `${item.assignedByName} มอบหมาย · ` : ""}${item.category || "งานทั่วไป"}`}</p>
      <div className={styles.postFooter}>
        <span className={`${styles.taskStatus} ${item.status === "Completed" ? styles.completed : ""}`}>{statusLabel}</span>
        {item.urgent && <span className={styles.urgent}>ด่วน</span>}{item.important && <span className={styles.important}>สำคัญ</span>}
        {item.dueDate && <span className={styles.taskDue}>กำหนด {fmtDate(item.dueDate)}</span>}
        <Link href={`/pm/tasks/${item.id}`}>เปิดงาน <ArrowUpRight size={12}/></Link>
      </div>
    </div>
  </article>;
}
