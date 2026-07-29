"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, FileText,
  FolderKanban, ListTodo, ReceiptText, RefreshCw, Target, TrendingUp,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney, fmtPercent } from "@/lib/format";
import { LEAD_STATUS_LABELS } from "@/lib/sales/leads";
import { useCan } from "@/lib/roleContext";
import StatusNotice from "@/components/ui/StatusNotice";
import styles from "./RdDashboardTab.module.css";

const ACTIVITY_KIND_LABEL = {
  note: "บันทึก",
  call: "โทรศัพท์",
  meeting: "ประชุม",
  email: "อีเมล",
  next_step: "ขั้นตอนถัดไป",
};

const FEED_PAGE = 8;

export default function MyDashboardTab({ month }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [visible, setVisible] = useState(FEED_PAGE);

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
  // เปลี่ยนตัวกรองหรือเดือน = เริ่มนับหน้าฟีดใหม่ ไม่งั้นจะค้างจำนวนที่กางไว้จากชุดก่อน
  useEffect(() => { setVisible(FEED_PAGE); }, [filter, month]);

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
  const shownFeed = feed.slice(0, visible);

  const target = Number(data?.target || 0);
  // "ยังไม่ตั้งเป้า" (ไม่มี record) ≠ "เป้า = 0 จริง" — เคสแรกแสดง dash ตาม rulebook, เคสหลังแสดงตัวเลข
  // ระหว่างโหลดรอบแรก (data ยังไม่มา) ก็แสดง dash ไปก่อน ไม่ใช่ ฿0.00
  const hasTarget = !!data?.hasTarget;
  const canSetTarget = useCan("salesplan:target");
  const actual = Number(data?.wonValue || 0);
  const gap = Number(data?.targetGap || 0);
  const targetPct = target > 0 ? (actual / target) * 100 : 0;
  const tasks = data?.taskSummary || { total: 0, today: 0, overdue: 0, urgent: 0 };
  const actionLeads = data?.actionLeads || [];
  const byForecast = data?.byForecast || [];
  // คิวรอยต่อเอกสาร — สองจุดที่ระบบส่งไม้ต่อแล้วไม่มีอะไรคอยทวง (ดู lib/sales/handoffQueue)
  const handoff = data?.handoff || {};
  const awaitingSalesOrder = handoff.awaitingSalesOrder || [];
  const awaitingFiling = handoff.awaitingFiling || [];

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
              <QuickFact icon={<Target />} label="เป้าหมาย" value={hasTarget ? fmtMoney(target) : "—"} note={hasTarget ? `สำเร็จ ${fmtPercent(targetPct)}` : data ? "ยังไม่ตั้งเป้า" : ""} />
              {/* Actual = ยอด Won จริง แสดง 0 ได้ (ศูนย์จริง) แต่ Gap มีความหมายก็ต่อเมื่อมีเป้า */}
              <QuickFact icon={<CheckCircle2 />} label="Actual" value={fmtMoney(actual)} note={`Gap ${hasTarget ? fmtMoney(gap) : "—"}`} tone={actual >= target && target > 0 ? "good" : undefined} />
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
              {shownFeed.map((item) => item.feedType === "task"
                ? <TaskPost key={`task-${item.id}`} item={item} />
                : <DealPost key={`deal-${item.id}`} item={item} />)}
              {feed.length > visible && (
                <div className={styles.feedMore}>
                  <button type="button" className="btn ghost sm" onClick={() => setVisible((n) => n + FEED_PAGE)}>
                    ดูเพิ่มเติม (อีก {feed.length - visible})
                  </button>
                </div>
              )}
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

          {/* คิวรอยต่อเอกสาร: Won → Sale Order → ใบยื่นชำระภาษี. ก่อนหน้านี้สองจุดนี้เป็น
              manual ล้วน — ไม่มีคิว ไม่มีตัวเลข ต้องมีคนจำไปกดเอง. ตัวเลขนับเฉพาะดีลที่
              ฉันเป็นเจ้าของ (เหมือนทุกอย่างในแท็บนี้) ส่วนภาพรวมทั้งทีมดูที่หน้ารายการ */}
          {handoff.error && (
            <StatusNotice tone="error" title="โหลดคิวรอยต่อเอกสารไม่สำเร็จ">{handoff.error}</StatusNotice>
          )}

          <HandoffQueueCard
            icon={<FileText size={17} />}
            title="Won รอออก Sale Order"
            hint="ใบเสนอราคาที่ปิดได้แล้วแต่ยังไม่มี SO"
            items={awaitingSalesOrder}
            allHref="/sa/quotations"
            emptyText="ออก SO ครบทุกใบแล้ว 🎉"
            renderItem={(quote) => ({
              key: quote.id,
              href: `/sa/quotations/${quote.id}`,
              eyebrow: quote.quoteNumber,
              title: quote.customerName || "ลูกค้า",
              note: `Won ${fmtDate(quote.acceptedAt)} · ${fmtMoney(quote.totalAmount)}`,
            })}
          />

          <HandoffQueueCard
            icon={<ReceiptText size={17} />}
            title="SO รอออกใบยื่นภาษี"
            hint="SO อนุมัติแล้วที่มีสินค้าสรรพสามิต"
            items={awaitingFiling}
            allHref="/tax/filings"
            allLabel="เปิดหน้ายื่นชำระ"
            emptyText="ยื่นครบทุกใบแล้ว 🎉"
            renderItem={(order) => ({
              key: order.id,
              href: `/sa/sales-orders/${order.id}`,
              eyebrow: order.orderNumber,
              title: order.customerName || "ลูกค้า",
              note: `อนุมัติ ${fmtDate(order.approvedAt)} · ภาษี ${fmtMoney(order.filingTotalTax)}`,
            })}
          />

          {/* ตัวเลขเป้า/ทบยอด/กราฟฉบับเต็มย้ายไปแท็บ "ผลงานขาย" (2026-07-18) —
              ที่นี่เหลือสรุปบรรทัดเดียว + ลิงก์เจาะตัวเอง กันข้อมูลซ้ำสองที่แล้วเพี้ยนหากัน */}
          <section className={`${styles.card} ${styles.teamCard}`}>
            <div className={styles.sectionTitle}><TrendingUp size={18} /><div><h3>เป้าหมายของฉัน</h3><span>เดือนนี้</span></div></div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: "var(--fs-13)" }}>{fmtMoney(actual)}</strong>
              <span style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>
                {hasTarget ? `/ ${fmtMoney(target)} · ${fmtPercent(targetPct)}` : data ? "/ — · ยังไม่ตั้งเป้า" : "/ —"}
              </span>
            </div>
            {/* ตั้งเป้าได้เฉพาะผู้ถือสิทธิ์ salesplan:target (admin/หัวหน้าทีม) — AE ทั่วไปไม่มีลิงก์เพราะเข้าหน้านั้นไม่ได้ */}
            {data && !hasTarget && canSetTarget && (
              <Link href="/sa/targets" className="btn ghost sm" style={{ width: "100%", marginTop: 12 }}>
                ตั้งเป้าเดือนนี้ <ArrowUpRight size={13} />
              </Link>
            )}
            <Link
              href={data?.me?.id ? `/sa/dashboard?tab=performance&scope=person&person=${encodeURIComponent(data.me.id)}` : "/sa/dashboard?tab=performance"}
              className="btn ghost sm"
              style={{ width: "100%", marginTop: 12 }}
            >
              ดูผลงานเต็ม (ทบยอด · กราฟ · YoY) <ArrowUpRight size={13} />
            </Link>
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

// การ์ดคิวรอยต่อเอกสาร — หน้าตาเดียวกับคิวลีดข้างบน (queueCard/queueItem ชุดเดิม)
// ทั้งสองใบใช้ component ตัวนี้ร่วมกัน ต่างกันแค่ props ไม่ใช่คนละชุด (กฎ AGENTS.md)
const HANDOFF_PREVIEW = 5;

function HandoffQueueCard({ icon, title, hint, items, allHref, allLabel = "ดูทั้งหมด", emptyText, renderItem }) {
  return (
    <section className={`${styles.card} ${styles.queueCard}`}>
      <div className={styles.queueHead}>
        <div className={styles.sectionTitle}>
          {icon}
          <div><h3>{title}</h3><span>{items.length ? `${items.length} ใบ · ${hint}` : hint}</span></div>
        </div>
        <Link href={allHref}>{allLabel}</Link>
      </div>
      <div className={styles.queueList}>
        {items.slice(0, HANDOFF_PREVIEW).map((item) => {
          const row = renderItem(item);
          return (
            <Link href={row.href} key={row.key} className={styles.queueItem}>
              <div><strong>{row.eyebrow}</strong><span className={styles.dot} /></div>
              <h4>{row.title}</h4>
              <p>{row.note}</p>
            </Link>
          );
        })}
        {items.length > HANDOFF_PREVIEW && (
          <Link href={allHref} className={styles.queueItem}>
            <p>และอีก {items.length - HANDOFF_PREVIEW} ใบ — {allLabel}</p>
          </Link>
        )}
        {!items.length && <div className={styles.empty}>{emptyText}</div>}
      </div>
    </section>
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
