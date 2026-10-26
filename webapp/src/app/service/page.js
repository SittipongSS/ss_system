"use client";
// ── ภาพรวมธุรกิจบริการ (X-1) ──────────────────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-01: **ไม่ทำปฏิทินรวมกับสายผลิต** — TS กับ PD/PC เป็นคนละทีม
// ปฏิบัติงาน · แต่ละระบบมีหน้าภาพรวมของตัวเองแทน
//
// ⭐ หน้านี้ตอบสามคำถามของหัวหน้าทีมบริการตอนเช้า:
//    1. มีอะไรค้างจากเมื่อวาน  2. วันนี้ใครไปไหน  3. ไซต์ไหนกำลังจะมีปัญหา
// ⚠️ ข้อ 3 คือของที่ระบบเก่าไม่มี — ไซต์ที่น้ำหอมจะหมดแต่ยังไม่มีนัด คือลูกค้าที่
//    กำลังจะโทรมาบ่น · ต้องอยู่หน้าแรก ไม่ใช่ซ่อนอยู่ในแท็บของหน้าไซต์
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarClock, CalendarDays, Droplets,
  LayoutDashboard, MapPin, Wrench,
} from "lucide-react";
import ActionQueue from "@/components/ui/ActionQueue";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableScroll } from "@/components/ui/Table";
import Workspace, { ListPanel, WorkspaceSection } from "@/components/ui/Workspace";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { VISIT_KIND_LABELS, visitTimeText } from "@/lib/service/rounds";
import {
  attentionView,
  refillTotals,
  refillWatchView,
  serviceAttention,
  serviceCounts,
  todayByTechnician,
} from "@/lib/service/overview";
import { QUEUE_RANGE_TODAY, scheduleQueueHref } from "@/lib/service/scheduleQueueLink";
import { canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtDayMonth, naText, NA } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

/* ── นัดของหน้านี้มาจาก API ของรายการงาน (`/api/service/visits/queue?view=load`) ไม่ใช่ช่วงวัน (ตรวจตัวเลข 20/10 · M24g) ──
   🐞 เดิมดึง `/api/service/visits?from=วันนี้-120&to=วันนี้+6` ⇒ การ์ด "นัดค้าง N" ไม่นับนัดที่ค้างเกิน 120 วัน แต่แท็บ
      "ค้าง" ของหน้าจัดคิวที่การ์ดพาไปโหลดนัดเปิด **ไม่มีขอบล่าง** ⇒ กดการ์ดแล้วเจอมากกว่าเลข (และ "ต้องจัดการก่อน"
      ไม่เห็นนัดค้างเก่าสุดซึ่งเจ็บที่สุด)
   ⭐ ชุดเดียวกับที่แท็บ "ค้าง" อ่าน (`loadQueueVisits` · ด่าน requireService ตัวเดียวกัน) · `view=load` = ไม่มีร่าง ไม่มีบริบทด่าน
      ไม่มีคำร้อง — การ์ด/แผงทุกตัวของหน้านี้อ่านแค่นัดที่ยังเปิด (`isOpenVisit`) อยู่แล้ว
   ⚠️ ขอบบนคงเดิม (วันนี้ + 6) — ชุดของรายการงานมีนัดเปิดทุกวันข้างหน้า แต่ "ต้องจัดการก่อน" เตือนแค่ใน 7 วันข้างหน้า
      (ชนช่วงเข้าไซต์/เวลาทับของนัดเดือนหน้ายังไม่ใช่ของที่ต้องจัดการเช้านี้) ⇒ ตัดที่ `WINDOW_AHEAD_DAYS` ฝั่งจอ
      · หน้าต่างเลื่อน 7 วัน ไม่ใช่สัปดาห์ อา.–ส. (มติ 26/09) — คำบนจอจึงเป็น "7 วันข้างหน้า" ทุกที่ (มติเจ้าของ 26/10 · L21) */
const WINDOW_AHEAD_DAYS = 6;
const ATTENTION_LIMIT = 8;
const WATCHLIST_LIMIT = 8;
const WATCHLIST_ID = "refill-watchlist";

const REASON_TONE = { overdue: "danger", overlap: "danger", time: "warning", day: "warning", unassigned: "warning" };

const shiftDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
};

// "14 ส.ค." — ตัวกลางเดียวกับบอร์ดผลิต/ตารางบริการ (`fmtDayMonth`)
// ⚠️ ต่อ T00:00:00 ก่อน — สตริง `YYYY-MM-DD` ล้วนถูกอ่านเป็น UTC แล้วเลื่อนวัน
const fmtDate = (iso) => (iso ? fmtDayMonth(`${iso}T00:00:00`) : NA);

export default function ServiceOverviewPage() {
  const router = useRouter();
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);

  const [visits, setVisits] = useState([]);
  const [visitSites, setVisitSites] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /* "วันนี้" จากนาฬิกาไทย — เป็น state ที่เลื่อนตอนกลับมามองแท็บ (ดู `useRevalidateOnFocus` ข้างล่าง) ไม่ใช่ค่าที่ตรึงตอนเมานต์
     🐞 เดิม `useMemo(() => businessDate(), [])` ⇒ แท็บที่เปิดค้างข้ามเที่ยงคืน ดึงนัดใหม่แต่ยังนับ "นัดวันนี้" ของเมื่อวาน
        (= นัดที่กลายเป็นค้างไปแล้ว) ขณะที่การ์ดพาไป `range=today` ของวันใหม่ ⇒ เลขบนการ์ด ≠ แถวที่เปิดเจอ (H15 · รีวิว 19/10) */
  const [todayIso, setTodayIso] = useState(() => businessDate());

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const [visitRes, siteRes] = await Promise.all([
        apiFetch("/api/service/visits/queue?view=load"),
        apiFetch("/api/service/sites?withSchedule=1"),
      ]);
      const visitData = await visitRes.json().catch(() => null);
      if (!visitRes.ok) throw new Error(visitData?.error || "โหลดตารางนัดไม่สำเร็จ");
      const siteData = await siteRes.json().catch(() => null);
      if (!siteRes.ok) throw new Error(siteData?.error || "โหลดไซต์บริการไม่สำเร็จ");

      if (!isLatest()) return; // มีรอบใหม่ระหว่างรอ (ข้ามวัน/กลับมามองแท็บ) — ทั้งแผงต้องมาจากรอบเดียวกัน
      setVisits(Array.isArray(visitData?.visits) ? visitData.visits : []);
      setVisitSites(Array.isArray(visitData?.sites) ? visitData.sites : []);
      setSites(Array.isArray(siteData) ? siteData : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ภาพรวมว่าง — "โหลดพัง" กับ "ไม่มีนัดค้าง"
      // หน้าตาเหมือนกันจนแยกไม่ออก แล้วทีมจะเชื่อว่าเคลียร์หมดแล้ว
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดภาพรวมไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startRun]);
  /* `todayIso` อยู่ใน deps ของ effect (ไม่ใช่ของ useCallback — ตัวโหลดไม่ได้อ่านมัน) ⇒ ข้ามวันแล้วโหลดใหม่ทั้งแผงเหมือนตอนที่
     ช่วงวันยังขยับตาม · 🪤 ถอด todayIso ออกเมื่อไร ทางข้ามวันของ useRevalidateOnFocus ข้างล่างจะเลื่อนแค่วัน ไม่โหลดใหม่ */
  useEffect(() => { load(); }, [load, todayIso]);
  /* กลับมามองแท็บ: อ่านนาฬิกาไทยใหม่ก่อน — ข้ามวันแล้ว = เลื่อน "วันนี้" (effect ข้างบนโหลดใหม่ทั้งแผง
     และการ์ด/คำใบ้/แผงวันนี้นับด้วยวันเดียวกับรายการที่การ์ดเปิด) · วันเดิม = ดึงเบื้องหลังตามปกติ */
  useRevalidateOnFocus((opts) => {
    const nowIso = businessDate();
    if (nowIso !== todayIso) setTodayIso(nowIso);
    else load(opts);
  });

  const sitesById = useMemo(() => new Map(visitSites.map((s) => [s.id, s])), [visitSites]);

  /* นัดในกรอบของหน้า = ทุกวันก่อนหน้า (ไม่มีขอบล่าง — นัดค้างเก่าแค่ไหนก็นับ) ถึงวันนี้ + WINDOW_AHEAD_DAYS */
  const windowVisits = useMemo(() => {
    const until = shiftDays(todayIso, WINDOW_AHEAD_DAYS);
    return visits.filter((v) => String(v.scheduledDate || "") <= until);
  }, [visits, todayIso]);
  const counts = useMemo(() => serviceCounts(windowVisits, todayIso), [windowVisits, todayIso]);
  const refill = useMemo(() => refillTotals(sites), [sites]);
  const attention = useMemo(() => serviceAttention(windowVisits, sitesById, todayIso), [windowVisits, sitesById, todayIso]);
  const today = useMemo(() => todayByTechnician(windowVisits, todayIso), [windowVisits, todayIso]);
  /* แผงไซต์ที่น้ำหอมกำลังจะหมด = ปลายทางของการ์ด "เครื่องที่ต้องเข้าเติม" — การ์ดกดแล้วเปิดแผงนี้ครบทุกไซต์
     (H14 ตรวจตัวกรอง 08/10 · ดู `refillWatchView`) · ตั้งต้นย่อเหลือ WATCHLIST_LIMIT */
  const [watchAll, setWatchAll] = useState(false);
  const watch = useMemo(
    () => refillWatchView(sites, { all: watchAll, limit: WATCHLIST_LIMIT }),
    [sites, watchAll],
  );
  const openWatchlist = useCallback(() => {
    setWatchAll(true);
    document.getElementById(WATCHLIST_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* แผง "ต้องจัดการก่อน" ตั้งต้นย่อเหลือ ATTENTION_LIMIT · ปุ่ม "ดูทั้งหมด" ขยายในแผงเดียวกัน (ตรวจตัวเลข L8 · 26/10)
     🐞 เดิมตัดเหลือ 8 แล้วชี้ "ที่เหลืออยู่ในตารางเข้าบริการ" — ชื่อเก่าของหน้าจัดคิว ซึ่งไม่มีตัวกรองชุดนี้ ⇒ หา N ที่เหลือไม่เจอ */
  const [attentionAll, setAttentionAll] = useState(false);
  const attentionShown = useMemo(
    () => attentionView(attention, { all: attentionAll, limit: ATTENTION_LIMIT }),
    [attention, attentionAll],
  );
  const queueItems = useMemo(() => attentionShown.rows.map((row) => {
    const worst = row.reasons.find((r) => REASON_TONE[r.kind] === "danger") || row.reasons[0];
    const siteName = row.site?.name || row.visit.siteName || "ไซต์ไม่ทราบชื่อ";
    return {
      id: row.visit.id,
      tone: REASON_TONE[worst?.kind] || "neutral",
      title: `${fmtDate(row.visit.scheduledDate)} · ${siteName}`,
      subtitle: row.reasons.map((r) => r.message).join(" · "),
      badge: VISIT_KIND_LABELS[row.visit.kind] || row.visit.kind,
      /* ⭐ พาไปที่ **นัดใบนั้น** ไม่ใช่หน้าตารางเปล่า — หน้าจัดคิวอ่าน `?visit=` แล้วเปิดโมดัลให้เอง
         (เดิมพาไปสัปดาห์ปัจจุบัน ⇒ นัดค้างที่อยู่สัปดาห์ก่อนต้องไล่หาเอง) */
      cta: "เปิดนัด",
      onClick: () => router.push(`/service/schedule?visit=${encodeURIComponent(row.visit.id)}`),
    };
  }), [attentionShown, router]);

  return (
    <Workspace
      icon={<LayoutDashboard size={22} aria-hidden="true" />}
      title="ภาพรวมธุรกิจบริการ"
      subtitle="นัดที่ค้าง · วันนี้ใครไปไหน · ไซต์ที่น้ำหอมกำลังจะหมด"
      headerRight={(
        /* ปุ่มสองตัวนี้แค่พาไปหน้าอื่น ⇒ ลิงก์จริง + Button เปล่า (ไม่ใช่ primary ที่แปลว่ายืนยัน)
           ⚠️ navMirrored เฉพาะคนแก้งานบริการได้ — แถบล่างมือถือมีแท็บ "จัดคิวเจ้าหน้าที่"
              ให้คนกลุ่มนี้เท่านั้น คนอื่นต้องยังเห็นปุ่มในหัวหน้า */
        <div className={canEdit ? `${styles.headerActions} ${styles.navMirrored}` : styles.headerActions}>
          {canEdit && (
            /* ไอคอนตามเมนู "งานวันนี้" ใน AppLayout (Wrench) — หนึ่งปลายทางหนึ่งไอคอน
               เดิม UserRound ขณะที่แท็บแถบล่างของปลายทางเดียวกันเป็นประแจ */
            <Button as={Link} href="/service/today" icon={<Wrench size={15} aria-hidden="true" />}>
              งานวันนี้
            </Button>
          )}
          <Button as={Link} href="/service/schedule" icon={<CalendarDays size={15} aria-hidden="true" />}>
            จัดคิวเจ้าหน้าที่
          </Button>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={6} /> : loadError ? null : (
        <>
          {/* ⭐ การ์ดพาไปที่ **กองในรายการงาน** ที่นับเลขเดียวกับการ์ด — กดแล้วต้องเจอตัวเลขที่เห็น
              ไม่ใช่ปฏิทินสัปดาห์ที่ต้องนับเอง · ลิงก์ประกอบด้วย `scheduleQueueHref` ตัวเดียวกับที่หน้าจัดคิวอ่านกลับ
              🐞 H15 (ตรวจตัวกรอง 08/10): "นัดวันนี้ 3" เคยลงที่ช่วง 7 วัน (12 แถว · กลุ่ม "วันนี้" ขึ้นก่อน) เพราะรายการงาน
                 ไม่มีช่วง "เฉพาะวันนี้" ⇒ มติเจ้าของ 19/10: เปิดรายการ **วันนี้วันเดียว** (`range=today` · ป้าย "กรอง: นัดวันนี้ … ×")
                 เลขบนการ์ดกับตัวกรองใช้ตัวตัดสินเดียว (`isVisitToday`) และ "วันนี้" จากนาฬิกาไทยทั้งสองฝั่ง (`businessDate`)
              ⭐ นัดค้างไม่มีขอบล่าง — โหลดชุดเดียวกับแท็บ "ค้าง" (`visits/queue?view=load` · M24g) ⇒ เลขบนการ์ด = แถวที่เปิดเจอ */}
          <div className={styles.kpiGrid}>
            <KpiCard
              label="นัดค้าง"
              value={counts.overdue}
              icon={AlertTriangle}
              tone={counts.overdue > 0 ? "danger" : "success"}
              hint="เลยวันนัดแล้วยังไม่ปิดงาน"
              onClick={() => router.push(scheduleQueueHref({ tab: "overdue" }))}
            />
            <KpiCard
              label="นัดวันนี้"
              value={counts.today}
              icon={CalendarClock}
              tone="accent"
              hint={fmtDate(todayIso)}
              onClick={() => router.push(scheduleQueueHref({ tab: "scheduled", range: QUEUE_RANGE_TODAY }))}
            />
            {/* ⚠️ คำใบ้ "ยังไม่มอบหมาย" อยู่ **ใน** ปุ่มการ์ด (KpiCard ทั้งใบเป็น <button> เดียว) ⇒ ทำเป็น
                ลิงก์ของตัวเองไม่ได้ (ห้ามปุ่มซ้อนปุ่ม) · การ์ดจึงไป 7 วันตามเลขบนการ์ด — ที่นั่นมีช่วง
                "ยังไม่มีเจ้าหน้าที่" อีกคลิกเดียว · ห้ามสลับปลายทางตามคำใบ้ = กดเลข 12 แล้วเจอ 2 แถว
                ⚠️ ชื่อ "7 วันข้างหน้า" ไม่ใช่ "สัปดาห์นี้" — นับวันนี้ … วันนี้ + 6 (หน้าต่างเลื่อน) ตรงกับชิป "7 วัน" ของปลายทาง
                   ไม่ใช่ อา.–ส. (มติ 26/09) · มติเจ้าของ 26/10 (L21) เลือกเปลี่ยนชื่อ ไม่เปลี่ยนวิธีนับ */}
            <KpiCard
              label="นัด 7 วันข้างหน้า"
              value={counts.week}
              icon={CalendarDays}
              tone="info"
              hint={counts.unassigned > 0 ? `ยังไม่มอบหมายเจ้าหน้าที่ ${counts.unassigned} นัด` : "มอบหมายเจ้าหน้าที่ครบแล้ว"}
              onClick={() => router.push(scheduleQueueHref({ tab: "scheduled", range: "7d" }))}
            />
            <KpiCard
              label="เครื่องที่ต้องเข้าเติม"
              value={refill.overdue + refill.soon}
              icon={Droplets}
              tone={refill.overdue > 0 ? "danger" : refill.soon > 0 ? "warning" : "success"}
              hint={refill.overdue > 0
                ? `น่าจะหมดแล้ว ${refill.overdue} เครื่อง · ${refill.sites} ไซต์`
                : refill.soon > 0
                  ? `ใกล้หมด ${refill.soon} เครื่อง · ${refill.sites} ไซต์`
                  : "ทุกไซต์มีนัดครอบแล้ว"}
              /* 🐞 H14 (ตรวจตัวกรอง 08/10): เดิมพาไปทะเบียนไซต์ — ไม่มีข้อมูลการเติมและไม่มีตัวกรองนี้ ⇒ เลข N เปิดมาเจอ
                 ทุกไซต์ · ปลายทางที่นับชุดเดียวกันคือแผง "ไซต์ที่น้ำหอมกำลังจะหมด" ข้างล่าง ⇒ เปิดแผงนั้นครบทุกไซต์ */
              onClick={openWatchlist}
            />
          </div>

          <WorkspaceSection
            icon={<AlertTriangle size={17} aria-hidden="true" />}
            title="ต้องจัดการก่อน"
            /* ⚠️ ขอบเขตบอกบนจอ: นัดในกรอบของหน้า = ทุกนัดที่ค้าง + นัดถึงวันนี้ + 6 (`WINDOW_AHEAD_DAYS`) */
            subtitle={attentionShown.truncated
              ? `แสดง ${ATTENTION_LIMIT} จาก ${attentionShown.total} รายการ — กด “ดูทั้งหมด” เพื่อดูครบ`
              : `${attentionShown.total > ATTENTION_LIMIT ? `ครบ ${attentionShown.total} รายการ — ` : ""}นัดที่ค้าง เวลาทับกัน ชนช่วงเข้าไซต์ หรือยังไม่มอบหมายเจ้าหน้าที่ — นัดถึง 7 วันข้างหน้า`}
            actions={attentionShown.total > ATTENTION_LIMIT ? (
              <Button size="sm" onClick={() => setAttentionAll((v) => !v)} aria-expanded={attentionAll}>
                {attentionAll ? "ย่อ" : "ดูทั้งหมด"}
              </Button>
            ) : null}
          >
            <ActionQueue items={queueItems} empty="ไม่มีนัดที่ติดปัญหาตอนนี้ 🎉" />
          </WorkspaceSection>

          {/* ⭐ รายการ = ListPanel (มติผู้ใช้ 2026-09-15) · แถวคือเจ้าหน้าที่ แต่ป้ายนับ **นัด** ของวันนี้
              (ตัวเลขที่หัวหน้าทีมถาม) · กรอบชั้นเดียว TableScroll — เดิม TableShell = การ์ดซ้อนการ์ด */}
          <ListPanel
            icon={<Wrench size={17} aria-hidden="true" />}
            title="วันนี้ใครไปไหน"
            subtitle={fmtDate(todayIso)}
            count={`${today.reduce((sum, row) => sum + row.count, 0)} นัด`}
          >
            {today.length === 0 ? (
              <EmptyState plain icon={CalendarClock}>ไม่มีนัดเข้าบริการวันนี้</EmptyState>
            ) : (
              <TableScroll>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">เจ้าหน้าที่</th>
                      <th scope="col" className="num">จำนวนนัด</th>
                      <th scope="col">ไซต์ที่ต้องเข้า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {today.map((row) => (
                      <tr key={`${row.assigneeId || "unassigned"}|${row.date}`}>
                        <th scope="row">
                          {/* ⚠️ นัดที่ไม่มีเจ้าของต้องเห็นชัดที่สุด ไม่ใช่ซ่อน */}
                          {row.assigneeName || <span className={styles.unassigned}>ยังไม่มอบหมายเจ้าหน้าที่</span>}
                        </th>
                        <td className="num">
                          {row.count}
                          {row.over && <span className={styles.over}>งานแน่น</span>}
                        </td>
                        <td>
                          <span className={styles.visitList}>
                            {row.visits.map((v) => {
                              const time = visitTimeText(v);
                              const name = sitesById.get(v.siteId)?.name || naText(v.siteName);
                              return time ? `${time} ${name}` : name;
                            }).join(" · ")}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </ListPanel>

          <ListPanel
            id={WATCHLIST_ID}
            icon={<Droplets size={17} aria-hidden="true" />}
            title="ไซต์ที่น้ำหอมกำลังจะหมด"
            /* "แสดง N จาก M" ย้ายจากคำอธิบายขึ้นป้ายจำนวน — เลขอยู่ที่เดียว (ด่าน LP9)
               ⚠️ ป้ายบอกจำนวนเครื่องด้วย = เลขบนการ์ด "เครื่องที่ต้องเข้าเติม" (ผลรวมคอลัมน์ "เครื่องที่ต้องเติม")
               🐞 เดิมคำอธิบายบอก "ที่เหลืออยู่ในทะเบียนไซต์" — ทะเบียนไม่มีข้อมูลการเติม หาไม่เจอ ⇒ ขยายในแผงนี้แทน */
            subtitle={watch.truncated
              ? "ประเมินจากขนาดขวดและอัตราใช้ต่อวัน — เรียงจากไซต์ที่หมดก่อน กด “ดูทั้งหมด” เพื่อดูครบทุกไซต์"
              : "ประเมินจากขนาดขวดและอัตราใช้ต่อวัน — ไซต์ที่มีนัดครอบแล้วไม่อยู่ในรายการนี้"}
            count={watch.truncated
              ? `${WATCHLIST_LIMIT} จาก ${watch.sites} ไซต์ · ${watch.machines} เครื่อง`
              : `${watch.sites} ไซต์ · ${watch.machines} เครื่อง`}
            actions={(
              <>
                {watch.sites > WATCHLIST_LIMIT && (
                  <Button size="sm" onClick={() => setWatchAll((v) => !v)} aria-expanded={watchAll}>
                    {watchAll ? "ย่อ" : "ดูทั้งหมด"}
                  </Button>
                )}
                <Button as={Link} href="/database/sites" size="sm" icon={<MapPin size={15} aria-hidden="true" />}>
                  ทะเบียนไซต์
                </Button>
              </>
            )}
          >
            {watch.sites === 0 ? (
              <EmptyState plain icon={Droplets}>ทุกไซต์มีนัดครอบก่อนน้ำหอมหมดแล้ว 🎉</EmptyState>
            ) : (
              <TableScroll>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ไซต์</th>
                      <th scope="col">ลูกค้า</th>
                      <th scope="col" className="num">เครื่องที่ต้องเติม</th>
                      <th scope="col" className="num">คาดว่าหมด</th>
                      <th scope="col" className="num">นัดครั้งหน้า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watch.rows.map((site) => (
                      <tr key={site.id}>
                        <th scope="row">
                          {/* 🐞 เดิมเป็น <button> สี --accent: ไม่มี href (เปิดแท็บใหม่ไม่ได้) ·
                              ไม่มีวงโฟกัส · ธีมสว่างคอนทราสต์ 3.3:1 ตก AA
                              คอลัมน์ระบุตัวตน ⇒ .table-row-link ไม่ใช่ .linklike (ท่าเดียวกับโซน/เครื่องใน sites/[id]) */}
                          <Link href={`/database/sites/${site.id}`} prefetch={false} className="table-row-link">
                            {site.name}
                          </Link>
                          <span className={styles.sub}>{site.code}{site.routeZone ? ` · ${site.routeZone}` : ""}</span>
                        </th>
                        <td>{naText(site.customerName)}</td>
                        <td className="num">
                          {site.refill?.needsAttention || 0}
                          {site.refill?.overdue > 0 && <span className={styles.over}>หมดแล้ว {site.refill.overdue}</span>}
                        </td>
                        {/* วันที่เทียบกันข้ามแถว (ไซต์ไหนหมดก่อน) ⇒ .num ให้หลักตรงกัน */}
                        <td className="num">{fmtDate(site.refill?.earliestDue)}</td>
                        {/* ไซต์ในรายการนี้คือไซต์ที่ยังไม่มีนัดครอบ — ช่องนี้จึงมักว่าง
                            และช่องว่างคือสัญญาณว่าต้องนัด ไม่ใช่ข้อมูลขาด */}
                        <td className="num">{site.nextVisitDate ? fmtDate(site.nextVisitDate) : <span className={styles.unassigned}>ยังไม่มีนัด</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </ListPanel>
        </>
      )}
    </Workspace>
  );
}
