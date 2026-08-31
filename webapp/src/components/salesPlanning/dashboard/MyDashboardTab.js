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
  Activity, ArrowUpRight, CheckCircle2, Handshake, ListTodo, Percent, Target,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney, fmtPercent, NA } from "@/lib/format";
import { periodScopeLabel, yearOfMonth } from "@/lib/datePeriods";
import { businessDate } from "@/lib/businessDate";
import Button from "@/components/ui/Button";
import Segmented from "@/components/ui/Segmented";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import {
  MY_QUEUE_KINDS, buildMyQueue, groupMyQueue, myQueueCounts,
} from "@/lib/salesPlanning/myQueue";
import ScheduleSection from "./ScheduleSection";
import styles from "./DashboardShell.module.css";
import { apiFetch } from "@/lib/apiFetch";

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
      const response = await apiFetch(`/api/sales-planning/my-dashboard?${query.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ไม่สามารถโหลดภาพรวมส่วนตัวได้");
      setData(payload);
    } catch (loadError) {
      setError(loadError.message || "ไม่สามารถโหลดภาพรวมส่วนตัวได้");
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

  /* ⚠️ นับจำนวนของแต่ละชิป **จากก้อนก่อนกรอง** — ถ้านับหลังกรอง ชิปที่ไม่ได้เลือกจะขึ้น 0
     ทั้งแถวทันทีที่กรองอยู่ ซึ่งอ่านเหมือน "ไม่มีของชนิดนั้นเลย" */
  const allPosts = useMemo(() => {
    const dealPosts = (data?.dealActivityFeed || []).map((item) => ({
      ...item, feedType: "deal", feedAt: item.updatedAt || item.createdAt,
    }));
    const taskPosts = (data?.taskFeed || []).map((item) => ({
      ...item, feedType: "task", feedAt: item.updatedAt || item.createdAt,
    }));
    return [...dealPosts, ...taskPosts]
      .sort((a, b) => String(b.feedAt || "").localeCompare(String(a.feedAt || "")))
      .slice(0, 50);
  }, [data]);

  const feedCounts = {
    all: allPosts.length,
    deal: allPosts.filter((item) => item.feedType === "deal").length,
    task: allPosts.filter((item) => item.feedType === "task").length,
    urgent: allPosts.filter((item) => item.urgent).length,
  };

  const feed = useMemo(() => allPosts.filter((item) => filter === "all"
    || item.feedType === filter
    || (filter === "urgent" && item.urgent)), [allPosts, filter]);
  const shownFeed = feed.slice(0, visible);

  const target = Number(data?.target || 0);
  // "ยังไม่ตั้งเป้า" (ไม่มี record) ≠ "เป้า = 0 จริง" — เคสแรกแสดง dash ตาม rulebook
  const hasTarget = !!data?.hasTarget;
  const actual = Number(data?.wonValue || 0);
  const targetGap = Number(data?.targetGap || 0);
  const targetPct = target > 0 ? (actual / target) * 100 : 0;
  /* ทุกป้ายของ "ตัวเลขงวด" ต้องบอกงวดเอง — ตัวเลือกเดือนกับติ๊ก "ทุกเดือน" อยู่บนหัวหน้า
     ส่วนตัวเลขอยู่กลางหน้า · เขียน "เดือนนี้" ตายตัวไม่ได้ ทั้งเพราะติ๊กทั้งปีได้ และ
     เพราะเลือกเดือนย้อนหลังได้อยู่แล้ว (ของเดิมเขียน "เดือนนี้" ทุกที่ = โกหกทั้งคู่) */
  const scopeLabel = periodScopeLabel(month, allMonths);
  // ป้ายบนการ์ด KPI ต้องสั้น — `.ui-metric small` ตัดบรรทัดได้ และการ์ดในแถบสูงเท่ากันหมด
  // ⇒ ป้ายยาวใบเดียวดันทั้งแถบสูงตาม ("เป้า ส.ค. 2026" ไม่ใช่ "เป้าเดือน ส.ค. 2026")
  const scopeShort = periodScopeLabel(month, allMonths, { short: true });

  if (error) return <StatusNotice tone="error" title="โหลดภาพรวมไม่สำเร็จ">{error}</StatusNotice>;

  return (
    <div className="flex flex-col gap-4" aria-busy={loading}>
      {/* ⭐ **แถบบนเป็นยอดเงินของงวด ไม่ใช่จำนวนของค้าง** (มติผู้ใช้ 2026-08-21)
          ของค้างมีที่อยู่ของตัวเองอยู่แล้วสองที่ — ชิปกรองบนคิว และการ์ด "ถึงกำหนด"
          ในกำหนดการ · แถบบนจึงเหลือคำถามเดียวที่ไม่มีใครตอบ: **เดือนนี้ยอดถึงไหนแล้ว**
          ⚠️ ฉบับเต็ม (ทบยอด/กราฟ/YoY) อยู่แท็บ "ผลงานขาย" ที่เดียว (มติ 2026-07-18)
          ที่นี่มีแค่ตัวเลขสรุปกับทางเข้า */}
      {/* ⚠️ ป้ายของแถบไม่ผูกงวด — สามช่องแรกเป็นของงวด แต่ "ดีลที่เปิด" เป็นทุกงวด */}
      {!loading && (
        <MetricStrip aria-label="ยอดของฉัน">
          {/* ⚠️ **สี่ช่องนี้ต้องเป็นเลขคนละตัวจริง ๆ** — เป้า(เงิน) · ยอดปิดได้(เงิน) ·
              สัดส่วน(%) · ท่อ(เงิน+จำนวนใบ) · เดิมช่อง "เป้า" โชว์ % อยู่แล้ว การเพิ่ม
              ช่อง % อีกใบจึงต้องย้ายให้ช่องเป้ากลับไปโชว์ "ยอดเป้า" ไม่งั้นเลขซ้ำกันสองที่ */}
          <Metric
            icon={<Target />} label={allMonths ? `เป้า${scopeShort}` : `เป้า ${scopeShort}`}
            value={hasTarget ? fmtMoney(target) : NA}
            note={hasTarget ? `เป้าของ${scopeLabel}` : "ยังไม่ตั้งเป้างวดนี้"}
          />
          <Metric
            icon={<CheckCircle2 />} label="ยอดปิดได้" value={fmtMoney(actual)}
            /* ⚠️ ไม่มีเป้า = ไม่มีอะไรให้เทียบ ⇒ บอกงวดแทน ห้ามเขียน "ขาดอีก" จากเป้า 0
               (เป้า 0 กับ "ยังไม่ตั้งเป้า" คนละเรื่อง — ดู empty-value-rule) */
            note={!hasTarget ? `ปิดได้ใน${scopeLabel}`
              : targetGap > 0 ? `ขาดอีก ${fmtMoney(targetGap)}` : `เกินเป้า ${fmtMoney(-targetGap)}`}
            tone={hasTarget && targetGap <= 0 ? "good" : undefined}
          />
          <Metric
            icon={<Percent />} label="% ที่ปิดได้"
            value={hasTarget ? fmtPercent(targetPct) : NA}
            note={hasTarget ? "ยอดปิดได้ ÷ เป้า" : "ยังไม่ตั้งเป้า — ไม่มีตัวหาร"}
            tone={hasTarget && targetPct >= 100 ? "good" : undefined}
          />
          {/* ⭐ ยุบ "ดีลที่เปิดอยู่" กับ "Pipeline" เป็นใบเดียว — สองใบนั้นพูดถึงกองเดียวกัน
              (จำนวนใบ กับ มูลค่าของใบชุดนั้น) การแยกเป็นสองช่องกินที่โดยไม่เพิ่มคำตอบ */}
          <Metric
            icon={<Handshake />} label="ดีลที่เปิด" value={fmtMoney(data?.pipelineValue || 0)}
            note={`${data?.openDealsCount || 0} ดีลที่ยังไม่ปิด — ทุกงวด ไม่ใช่เฉพาะ${scopeLabel}`}
          />
        </MetricStrip>
      )}

      {/* ⭐ **กำหนดการมาก่อนคิว** (มติผู้ใช้ 2026-08-21) — คิวตอบว่า "ทำอะไรก่อน"
          แต่ของที่มีเวลานัดตายตัวเลื่อนไม่ได้ ⇒ ต้องเห็นก่อนจะไปเลือกงานอื่นทำ
          ⚠️ ส่วนนี้โหลดข้อมูลของตัวเอง (`/api/sales-planning/my-schedule`) ไม่ใช้ก้อน
          ของแท็บนี้ — ช่วงวันที่ของมันเปลี่ยนตามปุ่มในตัวเอง ไม่ใช่ตามงวดบนหัวหน้า */}
      <ScheduleSection />

      {/* ⭐ **คิวซ้าย · อัปเดตขวา บรรทัดเดียวกัน** (มติผู้ใช้ 2026-08-21) — ฟีดตอบว่า
          *อะไรเพิ่งเกิด* ซึ่งอ่านคู่กับคิวได้ ไม่ต้องเลื่อนลงไปหาที่ท้ายหน้า
          ⚠️ ยุบเป็นคอลัมน์เดียวที่ ≤1000px — ตารางคิวสามคอลัมน์ในครึ่งจอแคบอ่านไม่ออก */}
      <div className={styles.split}>
      <WorkspaceSection
        className={styles.pane}
        bodyClassName={styles.paneBody}
        icon={<ListTodo size={17} />}
        title="คิวของฉัน"
        subtitle="ทุกอย่างที่รอคุณอยู่ — คำร้อง · ลีด · งาน · เอกสาร"
      >
        {/* ⚠️ **ตัวกรองของสองแผงต้องเป็นคอนโทรลเดียวกันและอยู่ระดับเดียวกัน** — เดิมคิวใช้
            ปุ่มเรียงกันในตัวการ์ด ส่วนฟีดใช้ชิปข้อความบนหัวส่วน ⇒ ของที่ทำงานเหมือนกัน
            สองอันบนจอเดียวหน้าตาคนละแบบ · ทั้งคู่เป็น `Segmented` (กติกา: สลับหน้า→Tabs,
            กรองในหน้า→segmented) วางในแถบเครื่องมือของ body เหมือนกัน
            ⚠️ ตัวเลขในชิปมาจากคิวก้อนเดียวกับตาราง ไม่ใช่นับใหม่ */}
        {/* ⚠️ **ไม่มีป้ายจำนวนบนหัวแผงแล้ว** — มันนับ "หลังกรอง" ส่วนชิปนับ "ก่อนกรอง"
            ⇒ สองเลขที่ไม่เท่ากันวางชิดกันบนหัวเดียว · ชิปที่เลือกอยู่บอกจำนวนของตัวเองแล้ว */}
        <div className="toolbar">
          <Segmented
            ariaLabel="กรองคิวตามชนิดงาน"
            value={kind || "all"}
            onChange={(next) => setKind(next === "all" ? null : next)}
            options={[
              { value: "all", label: "ทั้งหมด", count: counts.total },
              ...MY_QUEUE_KINDS.map((k) => ({
                value: k.key, label: k.label, count: counts.byKind[k.key] || 0,
                disabled: !counts.byKind[k.key],
              })),
            ]}
          />
        </div>

        {loading ? <SkeletonRows rows={4} /> : shown.length === 0 ? (
          <EmptyState icon={CheckCircle2}>
            {kind ? "ไม่มีของค้างในชนิดนี้ — กดชิปซ้ำเพื่อดูทั้งหมด" : "ไม่มีของค้างของคุณตอนนี้"}
          </EmptyState>
        ) : (
          <TableScroll cells="stacked" className={styles.paneScroll}>
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

      <WorkspaceSection
        className={styles.pane}
        bodyClassName={styles.paneBody}
        icon={<Activity size={17} />}
        title="รายการอัปเดตล่าสุด"
        subtitle="กิจกรรมจากดีลและงานที่คุณรับผิดชอบ"
      >
        <div className="toolbar">
          <Segmented
            ariaLabel="กรองรายการอัปเดต"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "ทั้งหมด", count: feedCounts.all },
              { value: "deal", label: "ดีล", count: feedCounts.deal, disabled: !feedCounts.deal },
              { value: "task", label: "งาน", count: feedCounts.task, disabled: !feedCounts.task },
              { value: "urgent", label: "ด่วน", count: feedCounts.urgent, disabled: !feedCounts.urgent },
            ]}
          />
        </div>
        {/* ⚠️ **กดดูเพิ่มแล้วการ์ดต้องไม่สูงขึ้น** — ของที่โหลดมาเพิ่มไปต่อท้ายในกล่องที่
            เลื่อนเอง ไม่ใช่ยืดการ์ดจนดันคิวฝั่งซ้ายเสียแนว · ปุ่มอยู่นอกกล่องเลื่อน
            จะได้ไม่ต้องไถลงไปหามัน */}
        <div className={styles.paneScroll}>
          <div className={styles.feed}>
            {shownFeed.map((item) => (item.feedType === "task"
              ? <TaskPost key={`task-${item.id}`} item={item} />
              : <DealPost key={`deal-${item.id}`} item={item} />))}
            {!feed.length && (
              <div className={styles.empty}>{loading ? "กำลังโหลดกิจกรรม..." : "ยังไม่มีกิจกรรมตามตัวกรองนี้"}</div>
            )}
          </div>
        </div>
        {feed.length > visible && (
          <div className={styles.feedMore}>
            <Button size="sm" onClick={() => setVisible((n) => n + FEED_PAGE)}>
              ดูเพิ่มเติม (อีก {feed.length - visible})
            </Button>
          </div>
        )}
      </WorkspaceSection>
      </div>
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
