"use client";
// ── แดชบอร์ดของฉัน — "วันนี้ทำอะไรก่อน" (มติผู้ใช้ 2026-08-12 · แบบ ก) ─────
//
// 🐞 **ของเดิมตอบว่า "มีอะไรบ้าง" แต่ไม่เคยตอบว่า "เริ่มที่ไหน"** — ของค้างกระจาย
// อยู่ห้าการ์ดในคอลัมน์ขวา (ลีด · Won รอ SO · SO รอใบยื่นภาษี · ภาพรวมงาน ·
// Pipeline FC) แต่ละใบมีลิงก์ "ดูทั้งหมด" ของตัวเอง ⇒ ไม่มีที่ไหนบอกว่ารวมแล้ว
// ค้างกี่ชิ้นและอันไหนก่อน · ส่วนกลางหน้าเป็น **ฟีดกิจกรรม** ซึ่งตอบว่า *อะไรเพิ่งเกิด*
// ไม่ใช่ *ฉันต้องทำอะไร* · และคำร้องไม่อยู่ในหน้านี้เลย (ใบตีกลับจึงมองไม่เห็น)
//
// ⭐ ตอนนี้: แถบตัวเลข → การ์ด "เริ่มที่นี่" → **คิวรวมทุกชนิด** → ตัวเลขของฉัน → ฟีด
// ⚠️ ตรรกะการรวม/เรียง/จัดกลุ่มอยู่ที่ `lib/salesPlanning/myQueue.js` ทั้งหมด —
// ที่นี่แค่วาด · ตัวเลขบนแถบนับจาก **คิวเดียวกับตารางข้างล่าง** เสมอ (ของเดิมนับ
// คนละที่กัน แล้วเลขไม่ตรงกันได้โดยไม่มีใครรู้)
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, Flame, ListTodo,
  Target, TrendingUp, Undo2,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney, fmtPercent } from "@/lib/format";
import { periodScopeLabel, yearOfMonth } from "@/lib/datePeriods";
import { useCan } from "@/lib/roleContext";
import { businessDate } from "@/lib/businessDate";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import {
  MY_QUEUE_KINDS, buildMyQueue, groupMyQueue, myQueueCounts,
} from "@/lib/salesPlanning/myQueue";
import styles from "./DashboardShell.module.css";

const ACTIVITY_KIND_LABEL = {
  note: "บันทึก",
  call: "โทรศัพท์",
  meeting: "ประชุม",
  email: "อีเมล",
  next_step: "ขั้นตอนถัดไป",
};

const FEED_PAGE = 8;

export default function MyDashboardTab({ month, allMonths = false }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [visible, setVisible] = useState(FEED_PAGE);
  // ชิปกรองของคิว — null = ทุกชนิด (คีย์มาจาก `MY_QUEUE_KINDS`)
  const [kind, setKind] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      /* ติ๊ก "ทุกเดือน" ⇒ เติม `year` ให้ route ขยายขอบเป็นทั้งปีของเดือนนั้น
         (ยังส่ง `month` ไปด้วยเสมอ — route ใช้เป็นค่าถอยและใช้บอกงวดกลับมา) */
      const query = new URLSearchParams({ month });
      if (allMonths) query.set("year", yearOfMonth(month) || "");
      const response = await fetch(`/api/sales-planning/my-dashboard?${query.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดแดชบอร์ดส่วนตัวได้");
      setData(payload);
    } catch (loadError) {
      setError(loadError.message || "ไม่สามารถโหลดแดชบอร์ดส่วนตัวได้");
    } finally {
      setLoading(false);
    }
  }, [month, allMonths]);

  useEffect(() => { load(); }, [load]);
  // เปลี่ยนตัวกรองหรืองวด = เริ่มนับหน้าฟีดใหม่ ไม่งั้นจะค้างจำนวนที่กางไว้จากชุดก่อน
  useEffect(() => { setVisible(FEED_PAGE); }, [filter, month, allMonths]);

  const today = businessDate();
  const handoff = data?.handoff || {};
  const queue = useMemo(() => buildMyQueue({
    requests: data?.myRequests || [],
    leads: data?.actionLeads || [],
    tasks: data?.openTasks || [],
    awaitingSalesOrder: handoff.awaitingSalesOrder || [],
    awaitingFiling: handoff.awaitingFiling || [],
    todayIso: today,
  }), [data, handoff.awaitingSalesOrder, handoff.awaitingFiling, today]);

  const counts = myQueueCounts(queue);
  const shown = kind ? queue.filter((item) => item.kind === kind) : queue;
  const groups = groupMyQueue(shown);
  // ⭐ "เริ่มที่นี่" = แถวบนสุดของคิวเดียวกัน — ไม่ใช่กติกาความเร่งชุดใหม่
  // (ประกาศเกณฑ์ของตัวเองเมื่อไรจะได้ "การ์ดชี้ใบ A แต่ตารางเรียงใบ B ไว้บนสุด")
  const startHere = queue[0] || null;

  const feed = useMemo(() => {
    const dealPosts = (data?.dealActivityFeed || []).map((item) => ({
      ...item, feedType: "deal", feedAt: item.updatedAt || item.createdAt,
    }));
    const taskPosts = (data?.taskFeed || []).map((item) => ({
      ...item, feedType: "task", feedAt: item.updatedAt || item.createdAt,
    }));
    return [...dealPosts, ...taskPosts]
      .filter((item) => filter === "all" || item.feedType === filter || (filter === "urgent" && item.urgent))
      .sort((a, b) => String(b.feedAt || "").localeCompare(String(a.feedAt || "")))
      .slice(0, 50);
  }, [data, filter]);
  const shownFeed = feed.slice(0, visible);

  const target = Number(data?.target || 0);
  // "ยังไม่ตั้งเป้า" (ไม่มี record) ≠ "เป้า = 0 จริง" — เคสแรกแสดง dash ตาม rulebook
  const hasTarget = !!data?.hasTarget;
  const canSetTarget = useCan("salesplan:target");
  const actual = Number(data?.wonValue || 0);
  const targetPct = target > 0 ? (actual / target) * 100 : 0;
  const byForecast = data?.byForecast || [];
  /* ทุกป้ายของ "ตัวเลขงวด" ต้องบอกงวดเอง — ตัวเลือกเดือนกับติ๊ก "ทุกเดือน" อยู่บนหัวหน้า
     ส่วนตัวเลขอยู่กลางหน้า · เขียน "เดือนนี้" ตายตัวไม่ได้ ทั้งเพราะติ๊กทั้งปีได้ และ
     เพราะเลือกเดือนย้อนหลังได้อยู่แล้ว (ของเดิมเขียน "เดือนนี้" ทุกที่ = โกหกทั้งคู่) */
  const scopeLabel = periodScopeLabel(month, allMonths);
  // ป้ายบนการ์ด KPI ต้องสั้น — `.ui-metric small` ตัดบรรทัดได้ และการ์ดในแถบสูงเท่ากันหมด
  // ⇒ ป้ายยาวใบเดียวดันทั้งแถบสูงตาม ("เป้า ส.ค. 2026" ไม่ใช่ "เป้าเดือน ส.ค. 2026")
  const scopeShort = periodScopeLabel(month, allMonths, { short: true });

  if (error) return <StatusNotice tone="error" title="โหลดแดชบอร์ดไม่สำเร็จ">{error}</StatusNotice>;

  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      {/* ⭐ **ตัวเลขทุกช่องนับจากคิวเดียวกับตารางข้างล่าง** ยกเว้นช่องเป้าซึ่งเป็น
          ตัวเลขของเดือน ไม่ใช่ของค้าง · กดแล้วกรองในที่ (ไม่พาออกจากหน้า) */}
      {!loading && (
        <MetricStrip aria-label="ของค้างของฉัน — กดเพื่อกรองคิว">
          <Metric
            as="button" type="button" icon={<ListTodo />} label="ค้างทั้งหมด" value={counts.total}
            note={kind ? "กดเพื่อเลิกกรอง" : "ทุกชนิดรวมกัน"}
            active={!kind} onClick={() => setKind(null)}
          />
          <Metric
            icon={<AlertTriangle />} label="เลยกำหนด" value={counts.overdue}
            note="เลยวันที่รับปากไว้" tone={counts.overdue ? "danger" : undefined}
          />
          <Metric
            as="button" type="button" icon={<Undo2 />} label="ตีกลับ รอคุณแก้" value={counts.bounced}
            note={counts.bounced ? "กดเพื่อดูเฉพาะคำร้อง" : "ไม่มีใบตีกลับ"}
            tone={counts.bounced ? "danger" : undefined}
            active={kind === "request"} onClick={() => setKind(kind === "request" ? null : "request")}
          />
          <Metric
            as="button" type="button" icon={<CheckCircle2 />} label="รอออกเอกสาร" value={counts.document}
            note="Won รอ SO · SO รอใบยื่นภาษี" tone={counts.document ? "warning" : undefined}
            active={kind === "document"} onClick={() => setKind(kind === "document" ? null : "document")}
          />
          <Metric
            icon={<Target />} label={allMonths ? `เป้า${scopeShort}` : `เป้า ${scopeShort}`}
            value={hasTarget ? fmtPercent(targetPct, 0) : "—"}
            note={hasTarget ? `${fmtMoney(actual)} / ${fmtMoney(target)}` : "ยังไม่ตั้งเป้า"}
            tone={hasTarget && targetPct >= 100 ? "good" : undefined}
          />
        </MetricStrip>
      )}

      {/* ⭐ การ์ด "เริ่มที่นี่" — แถวบนสุดของคิว · บอกว่าว่างด้วย ไม่ใช่ซ่อนทิ้ง
          (หายไปเฉย ๆ อ่านไม่ออกว่างานหมดจริงหรือหน้ายังโหลดไม่เสร็จ) */}
      {!loading && (startHere ? (
        <div className={styles.startHere}>
          <div className={styles.startBody}>
            <div className={styles.startEyebrow}><Flame size={13} /> เริ่มที่นี่</div>
            <div className={styles.startStep}>{startHere.step}</div>
            <div className={styles.startTitle}>{startHere.title}</div>
            <div className={styles.startSub}>
              {[startHere.sub, startHere.dueText].filter(Boolean).join(" · ")}
              {queue.length > 1 ? ` — และอีก ${queue.length - 1} เรื่องต่อจากนี้` : ""}
            </div>
          </div>
          <Button tone="primary" icon={<ArrowRight size={15} />} onClick={() => router.push(startHere.href)}>
            เปิดเรื่องนี้
          </Button>
        </div>
      ) : (
        <div className={styles.startClear}><CheckCircle2 size={16} /> ไม่มีเรื่องค้างของคุณตอนนี้</div>
      ))}

      <WorkspaceSection
        icon={<ListTodo size={17} />}
        title="คิวของฉัน"
        subtitle="ทุกอย่างที่รอคุณอยู่ — คำร้อง · ลีด · งาน · เอกสาร"
        actions={<span className="ui-badge">{shown.length} รายการ</span>}
      >
        {/* ชิปกรองตามชนิด — ตัวเลขในชิปมาจากคิวก้อนเดียวกัน ไม่ใช่นับใหม่ */}
        <div className="toolbar">
          <Button size="sm" tone={kind ? undefined : "primary"} onClick={() => setKind(null)}>
            ทั้งหมด {counts.total}
          </Button>
          {MY_QUEUE_KINDS.map((k) => (
            <Button
              key={k.key} size="sm" tone={kind === k.key ? "primary" : undefined}
              disabled={!counts.byKind[k.key]}
              onClick={() => setKind(kind === k.key ? null : k.key)}
            >
              {k.label} {counts.byKind[k.key] || 0}
            </Button>
          ))}
        </div>

        {loading ? <SkeletonRows rows={4} /> : shown.length === 0 ? (
          <EmptyState icon={CheckCircle2}>
            {kind ? "ไม่มีของค้างในชนิดนี้ — กดชิปซ้ำเพื่อดูทั้งหมด" : "ไม่มีของค้างของคุณตอนนี้ 🎉"}
          </EmptyState>
        ) : (
          <TableScroll cells="stacked">
            <table className="w-full">
              <thead>
                <tr>
                  <th>ต้องทำอะไร</th>
                  <th>เรื่อง</th>
                  <th className="num">กำหนด</th>
                </tr>
              </thead>
              <tbody>
                {/* หัวกลุ่มเป็นแถวเต็มความกว้าง แล้วตามด้วยแถวของกลุ่มนั้น —
                    แพตเทิร์นเดียวกับคิวคำร้อง (`RequestQueuePanel`) */}
                {groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className={styles.groupRow} data-tone={group.tone}>
                      <td colSpan={3}>{group.label} · {group.items.length}</td>
                    </tr>
                    {group.items.map((item) => (
                      <tr
                        key={item.key} className={styles.queueRow}
                        onClick={() => router.push(item.href)}
                      >
                        <td>
                          <span className="ui-badge ui-badge-cell ui-badge-w-nextstep">{item.step}</span>
                          <div className={styles.rowMeta}>
                            {MY_QUEUE_KINDS.find((k) => k.key === item.kind)?.label}
                          </div>
                        </td>
                        <td>
                          <div className={styles.rowTitle}>
                            {item.title}
                            {item.urgent && <span className={`ui-badge ${styles.rowUrgent}`}>ด่วน</span>}
                          </div>
                          <div className={styles.rowMeta}>{item.sub}</div>
                        </td>
                        <td className="num">
                          <div className={item.overdue ? styles.rowOverdue : undefined}>{item.dueText}</div>
                          {item.due && <div className={styles.rowMeta}>{fmtDate(item.due)}</div>}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </WorkspaceSection>

      {/* ตัวเลขของเดือน — **ไม่ใช่ของค้าง** จึงอยู่ใต้คิว · ฉบับเต็ม (ทบยอด/กราฟ/YoY)
          อยู่แท็บ "ผลงานขาย" ที่เดียว (มติ 2026-07-18) ที่นี่มีแค่ทางเข้า */}
      {!loading && (
        <WorkspaceSection
          icon={<TrendingUp size={17} />}
          title={`ตัวเลขของฉัน — ${scopeLabel}`}
          subtitle="เป้า · ยอดปิดได้ · ไปป์ไลน์ที่ยังเปิดอยู่"
          actions={(
            <div className="flex gap-2 items-center flex-wrap">
              {data && !hasTarget && canSetTarget && (
                <Button as={Link} size="sm" href="/sa/targets" icon={<ArrowUpRight size={13} />}>
                  ตั้งเป้า
                </Button>
              )}
              <Button
                as={Link} size="sm" icon={<ArrowUpRight size={13} />}
                href={data?.me?.id
                  ? `/sa/dashboard?tab=performance&scope=person&person=${encodeURIComponent(data.me.id)}`
                  : "/sa/dashboard?tab=performance"}
              >
                ดูผลงานเต็ม
              </Button>
            </div>
          )}
        >
          <div className={styles.numbers}>
            <p>
              ยอดปิดได้
              <strong>{fmtMoney(actual)}</strong>
              <span>{hasTarget ? `จากเป้า ${fmtMoney(target)}` : `ยังไม่ตั้งเป้า${scopeLabel}`}</span>
            </p>
            <p>
              ดีลที่เปิดอยู่
              <strong>{data?.openDealsCount || 0}</strong>
              <span>Pipeline {fmtMoney(data?.pipelineValue || 0)}</span>
            </p>
            {byForecast.map((bucket) => (
              <p key={bucket.level}>
                FC {bucket.level}%
                <strong>{fmtMoney(bucket.value)}</strong>
                <span>{bucket.count} ดีล</span>
              </p>
            ))}
          </div>
        </WorkspaceSection>
      )}

      {/* ⭐ **ฟีดย้ายลงท้ายหน้า** — มันตอบว่า *อะไรเพิ่งเกิด* ซึ่งมีค่า แต่ไม่ใช่สิ่งแรก
          ที่ตาควรไปเจอตอนเปิดหน้ามาทำงาน (มติผู้ใช้ 2026-08-12 · แบบ ก) */}
      <WorkspaceSection
        icon={<Activity size={17} />}
        title="รายการอัปเดตล่าสุด"
        subtitle="กิจกรรมจากดีลและงานที่คุณรับผิดชอบ"
        actions={(
          <div className={styles.filters}>
            {[["all", "ทั้งหมด"], ["deal", "ดีล"], ["task", "งาน"], ["urgent", "ด่วน"]].map(([key, label]) => (
              <button
                type="button" key={key}
                className={filter === key ? styles.activeFilter : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      >
        <div className={styles.feed}>
          {shownFeed.map((item) => (item.feedType === "task"
            ? <TaskPost key={`task-${item.id}`} item={item} />
            : <DealPost key={`deal-${item.id}`} item={item} />))}
          {feed.length > visible && (
            <div className={styles.feedMore}>
              <Button size="sm" onClick={() => setVisible((n) => n + FEED_PAGE)}>
                ดูเพิ่มเติม (อีก {feed.length - visible})
              </Button>
            </div>
          )}
          {!feed.length && (
            <div className={styles.empty}>{loading ? "กำลังโหลดกิจกรรม..." : "ยังไม่มีกิจกรรมตามตัวกรองนี้"}</div>
          )}
        </div>
      </WorkspaceSection>
    </div>
  );
}

function TaskPost({ item }) {
  const statusLabel = { Pending: "รอดำเนินการ", "In Progress": "กำลังทำ", Completed: "เสร็จแล้ว" }[item.status] || item.status;
  return (
    <article className={`${styles.post} ${styles.taskPost}`}>
      <div className={`${styles.avatar} ${styles.taskAvatar}`}><ListTodo size={16} /></div>
      <div className={styles.postBody}>
        <div className={styles.postMeta}>
          <strong>{item.assigneeName || "ฉัน"}</strong><span>·</span>
          <span>{fmtDateTime(item.feedAt)}</span><span className={styles.typeLabel}>งาน</span>
        </div>
        <Link href={`/pm/tasks/${item.id}`} className={styles.postTitle}>{item.title || "งาน"}</Link>
        <p>{item.note || `${item.assignedByName ? `${item.assignedByName} มอบหมาย · ` : ""}${item.category || "งานทั่วไป"}`}</p>
        <div className={styles.postFooter}>
          <span className={`${styles.taskStatus} ${item.status === "Completed" ? styles.completed : ""}`}>{statusLabel}</span>
          {item.urgent && <span className={styles.urgent}>ด่วน</span>}
          {item.important && <span className={styles.important}>สำคัญ</span>}
          {item.dueDate && <span className={styles.taskDue}>กำหนด {fmtDate(item.dueDate)}</span>}
          <Link href={`/pm/tasks/${item.id}`}>เปิดงาน <ArrowUpRight size={12} /></Link>
        </div>
      </div>
    </article>
  );
}

function DealPost({ item }) {
  return (
    <article className={styles.post}>
      <div className={styles.avatar}>SA</div>
      <div className={styles.postBody}>
        <div className={styles.postMeta}>
          <strong>{item.createdByName || "ฝ่ายขาย"}</strong><span>·</span>
          <span>{fmtDateTime(item.feedAt)}</span>
          <span className={styles.typeLabel}>{ACTIVITY_KIND_LABEL[item.kind] || "ดีล"}</span>
        </div>
        <Link href={`/sales-planning/deals/${item.dealId}`} className={styles.postTitle}>
          {item.dealCode ? `${item.dealCode} · ` : ""}{item.dealTitle || "ดีล"}
        </Link>
        <p>{item.body || "อัปเดตความเคลื่อนไหวของดีล"}</p>
        <div className={styles.postFooter}>
          {item.customerName && <span>{item.customerName}</span>}
          {item.urgent && <span className={styles.urgent}>ต้องติดตาม</span>}
          {item.dueDate && <span className={styles.taskDue}>กำหนด {fmtDate(item.dueDate)}</span>}
          <Link href={`/sales-planning/deals/${item.dealId}`}>เปิดดีล <ArrowUpRight size={12} /></Link>
        </div>
      </div>
    </article>
  );
}
