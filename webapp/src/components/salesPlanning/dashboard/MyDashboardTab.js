"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, FolderKanban,
  ListTodo, RefreshCw, Target, TrendingUp,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney, fmtPercent } from "@/lib/format";
import { LEAD_STATUS_LABELS } from "@/lib/sales/leads";
import styles from "./RdDashboardTab.module.css";

const ACTIVITY_KIND_LABEL = {
  note: "บันทึก",
  call: "โทรศัพท์",
  meeting: "ประชุม",
  email: "อีเมล",
  next_step: "ขั้นตอนถัดไป",
};

export default function MyDashboardTab({ month }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/sales-planning/my-dashboard?month=${encodeURIComponent(month)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดแดชบอร์ดส่วนตัวได้");
      setData(payload);
    } catch (loadError) {
      setError(loadError.message || "ไม่สามารถโหลดแดชบอร์ดส่วนตัวได้");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const feed = useMemo(() => {
    const dealPosts = (data?.dealActivityFeed || []).map((item) => ({
      ...item,
      feedType: "deal",
      feedAt: item.updatedAt || item.createdAt,
    }));
    const taskPosts = (data?.taskFeed || []).map((item) => ({
      ...item,
      feedType: "task",
      feedAt: item.updatedAt || item.createdAt,
    }));
    return [...dealPosts, ...taskPosts]
      .filter((item) => filter === "all" || item.feedType === filter || (filter === "urgent" && item.urgent))
      .sort((a, b) => String(b.feedAt || "").localeCompare(String(a.feedAt || "")))
      .slice(0, 50);
  }, [data, filter]);

  const target = Number(data?.target || 0);
  const actual = Number(data?.wonValue || 0);
  const gap = Number(data?.targetGap || 0);
  const targetPct = target > 0 ? (actual / target) * 100 : 0;
  const tasks = data?.taskSummary || { total: 0, today: 0, overdue: 0, urgent: 0 };
  const actionLeads = data?.actionLeads || [];
  const byForecast = data?.byForecast || [];

  if (error) return <div className="glass-panel" role="alert" style={{ padding: 16, color: "var(--red)" }}>{error}</div>;

  return (
    <div className={styles.page} aria-busy={loading}>
      <div className={styles.layout}>
        <main className={styles.documentColumn}>
          <section className={`${styles.card} ${styles.overviewCard}`}>
            <div className={styles.overviewHeading}>
              <div>
                <div className={styles.overviewEyebrowRow}>
                  <span className={styles.eyebrow}>MY · SALES WORKSPACE</span>
                  <span className={styles.period}>รอบข้อมูล {data?.periodFrom ? fmtDate(data.periodFrom) : "-"} – {data?.periodTo ? fmtDate(data.periodTo) : "-"}</span>
                </div>
                <h2>ศูนย์ติดตามงานของฉัน</h2>
                <p>ยอดขาย · ดีลที่รับผิดชอบ · งานที่ต้องทำ · การติดตามลูกค้า</p>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.liveBadge}><Activity size={12} /> LIVE FEED</span>
                <button type="button" className="btn ghost sm" onClick={load} disabled={loading}><RefreshCw size={14} /> อัปเดต</button>
              </div>
            </div>
            <div className={styles.quickFacts}>
              <QuickFact icon={<Target />} label="เป้าหมาย" value={fmtMoney(target)} note={`สำเร็จ ${fmtPercent(targetPct)}`} />
              <QuickFact icon={<CheckCircle2 />} label="Actual" value={fmtMoney(actual)} note={`Gap ${fmtMoney(gap)}`} tone={actual >= target && target > 0 ? "good" : undefined} />
              <QuickFact icon={<FolderKanban />} label="ดีลที่เปิดอยู่" value={data?.openDealsCount || 0} note={`Pipeline ${fmtMoney(data?.pipelineValue || 0)}`} />
              <QuickFact icon={<AlertTriangle />} label="งานเลยกำหนด" value={tasks.overdue || 0} note={`งานค้าง ${tasks.total || 0}`} tone={tasks.overdue ? "danger" : "good"} />
            </div>
          </section>

          <section className={`${styles.card} ${styles.feedCard}`}>
            <div className={styles.sectionHead}>
              <div className={styles.sectionTitle}><Activity size={17} /><div><h3>รายการอัปเดตล่าสุด</h3><span>กิจกรรมจากดีลและงานที่คุณรับผิดชอบ</span></div></div>
              <div className={styles.filters}>
                {[["all", "ทั้งหมด"], ["deal", "ดีล"], ["task", "งาน"], ["urgent", "ด่วน"]].map(([key, label]) => (
                  <button type="button" key={key} className={filter === key ? styles.activeFilter : ""} onClick={() => setFilter(key)}>{label}</button>
                ))}
              </div>
            </div>
            <div className={styles.feed}>
              {feed.map((item) => item.feedType === "task"
                ? <TaskPost key={`task-${item.id}`} item={item} />
                : <DealPost key={`deal-${item.id}`} item={item} />)}
              {!feed.length && <div className={styles.empty}>{loading ? "กำลังโหลดกิจกรรม..." : "ยังไม่มีกิจกรรมตามตัวกรองนี้"}</div>}
            </div>
          </section>
        </main>

        <aside className={styles.aside}>
          <section className={`${styles.card} ${styles.queueCard}`}>
            <div className={styles.queueHead}>
              <div className={styles.sectionTitle}><Clock3 size={17} /><div><h3>สิ่งที่ต้องดำเนินการ</h3><span>{actionLeads.length} รายการล่าสุด</span></div></div>
              <Link href="/sales-planning/leads">ดูทั้งหมด</Link>
            </div>
            <div className={styles.queueList}>
              {actionLeads.slice(0, 10).map((lead) => (
                <Link href={`/sales-planning/leads/${lead.id}`} key={lead.id} className={styles.queueItem}>
                  <div><strong>{LEAD_STATUS_LABELS[lead.status] || lead.status}</strong><span className={styles.dot} /></div>
                  <h4>{lead.company || lead.contactName || "ลีด"}</h4>
                  <p>{lead.status === "meeting" && lead.meetingAt ? `นัดหมาย ${fmtDate(lead.meetingAt)}` : "รอการติดต่อกลับ"}</p>
                </Link>
              ))}
              {!actionLeads.length && <div className={styles.empty}>ไม่มีรายการเร่งด่วน 🎉</div>}
            </div>
          </section>

          <section className={`${styles.card} ${styles.teamCard}`}>
            <div className={styles.sectionTitle}><TrendingUp size={18} /><div><h3>เป้าหมายของฉัน</h3><span>Target เทียบ Actual เดือนนี้</span></div></div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}><strong style={{ fontSize: 22 }}>{fmtMoney(actual)}</strong><span style={{ color: "var(--text-3)", fontSize: 11 }}>{fmtPercent(targetPct)}</span></div>
              <div style={{ height: 8, marginTop: 9, overflow: "hidden", borderRadius: 999, background: "var(--panel-2)" }}><div style={{ width: `${Math.min(100, Math.max(0, targetPct))}%`, height: "100%", borderRadius: 999, background: "var(--accent)" }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, color: "var(--text-3)", fontSize: 10.5 }}><span>0</span><span>Target {fmtMoney(target)}</span></div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.teamCard}`}>
            <div className={styles.sectionTitle}><ListTodo size={18} /><div><h3>ภาพรวมงาน</h3><span>งานที่คุณรับผิดชอบอยู่</span></div></div>
            <div className={styles.teamFacts}>
              <p>งานค้าง <strong>{tasks.total || 0}</strong></p>
              <p>วันนี้ <strong>{tasks.today || 0}</strong></p>
              <p>ต้องรีบ <strong style={{ color: tasks.urgent ? "var(--amber)" : undefined }}>{tasks.urgent || 0}</strong></p>
              <p>เลยกำหนด <strong className={tasks.overdue ? styles.danger : ""}>{tasks.overdue || 0}</strong></p>
            </div>
            <Link href="/pm/tasks" className="btn ghost sm" style={{ width: "100%", marginTop: 12 }}>เปิดงานของฉัน <ArrowUpRight size={13} /></Link>
          </section>

          <section className={`${styles.card} ${styles.teamCard}`}>
            <div className={styles.sectionTitle}><FolderKanban size={18} /><div><h3>Pipeline ตาม FC</h3><span>ดีลที่ยังเปิดอยู่</span></div></div>
            <div className={styles.teamFacts}>
              {byForecast.map((bucket) => <p key={bucket.level}>FC {bucket.level}% <strong>{fmtMoney(bucket.value)}</strong><span>{bucket.count} ดีล</span></p>)}
            </div>
            <Link href="/sales-planning/deals" className="btn ghost sm" style={{ width: "100%", marginTop: 12 }}>เปิดดีลทั้งหมด <ArrowUpRight size={13} /></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function QuickFact({ icon, label, value, note, tone }) {
  return <div><span className={styles.factIcon}>{icon}</span><span><small>{label}</small><strong className={tone ? styles[tone] : ""}>{value ?? "-"}</strong><em>{note}</em></span></div>;
}

function TaskPost({ item }) {
  const statusLabel = { Pending: "รอดำเนินการ", "In Progress": "กำลังทำ", Completed: "เสร็จแล้ว" }[item.status] || item.status;
  return <article className={`${styles.post} ${styles.taskPost}`}>
    <div className={`${styles.avatar} ${styles.taskAvatar}`}><ListTodo size={16} /></div>
    <div className={styles.postBody}>
      <div className={styles.postMeta}><strong>{item.assigneeName || "ฉัน"}</strong><span>·</span><span>{fmtDateTime(item.feedAt)}</span><span className={styles.typeLabel}>งาน</span></div>
      <Link href={`/pm/tasks/${item.id}`} className={styles.postTitle}>{item.title || "งาน"}</Link>
      <p>{item.note || `${item.assignedByName ? `${item.assignedByName} มอบหมาย · ` : ""}${item.category || "งานทั่วไป"}`}</p>
      <div className={styles.postFooter}>
        <span className={`${styles.taskStatus} ${item.status === "Completed" ? styles.completed : ""}`}>{statusLabel}</span>
        {item.urgent && <span className={styles.urgent}>ด่วน</span>}{item.important && <span className={styles.important}>สำคัญ</span>}
        {item.dueDate && <span className={styles.taskDue}>กำหนด {fmtDate(item.dueDate)}</span>}
        <Link href={`/pm/tasks/${item.id}`}>เปิดงาน <ArrowUpRight size={12} /></Link>
      </div>
    </div>
  </article>;
}

function DealPost({ item }) {
  return <article className={styles.post}>
    <div className={`${styles.avatar} ${styles.sa}`}>SA</div>
    <div className={styles.postBody}>
      <div className={styles.postMeta}><strong>{item.createdByName || "ฝ่ายขาย"}</strong><span>·</span><span>{fmtDateTime(item.feedAt)}</span><span className={styles.typeLabel}>{ACTIVITY_KIND_LABEL[item.kind] || "ดีล"}</span></div>
      <Link href={`/sales-planning/deals/${item.dealId}`} className={styles.postTitle}>{item.dealCode ? `${item.dealCode} · ` : ""}{item.dealTitle || "ดีล"}</Link>
      <p>{item.body || "อัปเดตความเคลื่อนไหวของดีล"}</p>
      <div className={styles.postFooter}>
        {item.customerName && <span>{item.customerName}</span>}{item.urgent && <span className={styles.urgent}>ต้องติดตาม</span>}
        {item.dueDate && <span className={styles.taskDue}>กำหนด {fmtDate(item.dueDate)}</span>}
        <Link href={`/sales-planning/deals/${item.dealId}`}>เปิดดีล <ArrowUpRight size={12} /></Link>
      </div>
    </div>
  </article>;
}
