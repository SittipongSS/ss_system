"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, MessageCircleQuestion, RefreshCw, Users } from "lucide-react";
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

  const feed = useMemo(() => (data?.activityFeed || []).filter((item) => {
    if (filter === "open") return item.inquiryStatus === "open";
    if (filter === "RD" || filter === "SA") return item.authorDept === filter;
    return true;
  }), [data, filter]);
  const queue = data?.openQueue || [];
  const inq = data?.inquirySummary;

  if (error) return <div className="glass-panel" role="alert" style={{ padding: 16, color: "var(--red)" }}>{error}</div>;
  return <div className={styles.page} aria-busy={loading}>
    <header className={styles.hero}>
      <div><span className={styles.eyebrow}>RD WORKSPACE</span><h2>อัปเดตงานสอบถาม</h2><p>ติดตามคำถาม คำตอบ และการรับทราบล่าสุดของทีมในที่เดียว</p></div>
      <button className="btn ghost sm" onClick={load} disabled={loading}><RefreshCw size={14} /> อัปเดต</button>
    </header>

    <section className={styles.metrics}>
      <Metric icon={<MessageCircleQuestion />} label="รอตอบ" value={inq?.openNow} note={`ยังไม่มีผู้รับ ${inq?.unassignedOpen || 0}`} />
      <Metric icon={<AlertTriangle />} label="เลยกำหนด" value={inq?.overdueNow} tone={inq?.overdueNow ? "danger" : "good"} note="SLA และวันที่นัดตอบ" />
      <Metric icon={<CheckCircle2 />} label="ตอบแล้ว" value={inq?.answered} note={`ทันกำหนด ${inq?.onTimePct || 0}%`} />
      <Metric icon={<Clock3 />} label="เวลาตอบเฉลี่ย" value={inq?.avgResponseDays == null ? "-" : `${inq.avgResponseDays} วัน`} note="นับเฉพาะวันทำการ" />
    </section>

    <div className={styles.layout}>
      <main className={styles.main}>
        <div className={styles.sectionHead}><div><h3>Activity feed</h3><span>กิจกรรมล่าสุดจากทุกเรื่องสอบถาม RD</span></div><div className={styles.filters}>
          {[['all','ทั้งหมด'],['open','เรื่องค้าง'],['SA','จาก SA'],['RD','จาก RD']].map(([key,label]) => <button key={key} className={filter === key ? styles.activeFilter : ""} onClick={() => setFilter(key)}>{label}</button>)}
        </div></div>
        <div className={styles.feed}>
          {feed.map((item) => <article key={item.id} className={styles.post}>
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
      </main>

      <aside className={styles.aside}>
        <section className={styles.queueCard}><div className={styles.queueHead}><div><h3>คิวที่ต้องจัดการ</h3><span>{queue.length} เรื่องล่าสุด</span></div><Link href="/sa/inquiries">ดูทั้งหมด</Link></div>
          <div className={styles.queueList}>{queue.map((q) => { const due = inquiryDueTone(q, todayISO); return <Link href={`/sa/inquiries/${q.id}`} key={q.id} className={styles.queueItem}>
            <div><strong>{q.code || "RD"}</strong>{q.urgent && <span className={styles.dot}/>}</div><h4>{q.title}</h4><p>{q.assigneeName || "ยังไม่มีผู้รับ"}</p>{q.dueDate && <small style={{ color: due?.color }}>กำหนด {fmtDate(q.dueDate)} {due?.label}</small>}
          </Link>; })}{!queue.length && <div className={styles.empty}>ไม่มีเรื่องค้าง 🎉</div>}</div>
        </section>
        <section className={styles.teamCard}><div><Users size={18}/><h3>ภาพรวมทีม</h3></div><p>งานเสร็จ <strong>{data?.taskSummary?.completed || 0}/{data?.taskSummary?.total || 0}</strong></p><p>ตรงเวลา <strong>{data?.taskSummary?.onTimePct || 0}%</strong></p></section>
      </aside>
    </div>
  </div>;
}

function Metric({ icon, label, value, note, tone }) {
  return <div className={styles.metric}><span className={styles.metricIcon}>{icon}</span><div><small>{label}</small><strong className={tone ? styles[tone] : ""}>{value ?? "-"}</strong><p>{note}</p></div></div>;
}
