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
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CalendarClock, CalendarDays, Droplets,
  LayoutDashboard, MapPin, UserRound, Wrench,
} from "lucide-react";
import ActionQueue from "@/components/ui/ActionQueue";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { VISIT_KIND_LABELS, visitTimeText } from "@/lib/service/rounds";
import {
  refillTotals,
  refillWatchlist,
  serviceAttention,
  serviceCounts,
  todayByTechnician,
} from "@/lib/service/overview";
import { canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtDayMonth, naText, NA } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

// ⚠️ ต้องย้อนหลังพอที่จะเห็น **นัดค้าง** ทั้งหมด ไม่ใช่แค่สัปดาห์ที่แล้ว —
// นัดที่ค้างมา 2 เดือนคือนัดที่เจ็บที่สุด ถ้าช่วงที่ดึงสั้นไปมันจะหายไปเงียบ ๆ
const LOOKBACK_DAYS = 120;
const ATTENTION_LIMIT = 8;
const WATCHLIST_LIMIT = 8;

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

  const todayIso = useMemo(() => businessDate(), []);
  const range = useMemo(
    () => ({ from: shiftDays(todayIso, -LOOKBACK_DAYS), to: shiftDays(todayIso, 6) }),
    [todayIso],
  );

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
        apiFetch(`/api/service/visits?from=${range.from}&to=${range.to}`),
        apiFetch("/api/service/sites?withSchedule=1"),
      ]);
      const visitData = await visitRes.json().catch(() => null);
      if (!visitRes.ok) throw new Error(visitData?.error || "โหลดตารางนัดไม่สำเร็จ");
      const siteData = await siteRes.json().catch(() => null);
      if (!siteRes.ok) throw new Error(siteData?.error || "โหลดไซต์บริการไม่สำเร็จ");

      if (!isLatest()) return; // เลื่อนช่วงวันที่ระหว่างรอ — ทั้งแผงต้องมาจากรอบเดียวกัน
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
  }, [range.from, range.to, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const sitesById = useMemo(() => new Map(visitSites.map((s) => [s.id, s])), [visitSites]);

  const counts = useMemo(() => serviceCounts(visits, todayIso), [visits, todayIso]);
  const refill = useMemo(() => refillTotals(sites), [sites]);
  const attention = useMemo(() => serviceAttention(visits, sitesById, todayIso), [visits, sitesById, todayIso]);
  const today = useMemo(() => todayByTechnician(visits, todayIso), [visits, todayIso]);
  const watchlist = useMemo(() => refillWatchlist(sites), [sites]);

  const queueItems = useMemo(() => attention.slice(0, ATTENTION_LIMIT).map((row) => {
    const worst = row.reasons.find((r) => REASON_TONE[r.kind] === "danger") || row.reasons[0];
    const siteName = row.site?.name || row.visit.siteName || "ไซต์ไม่ทราบชื่อ";
    return {
      id: row.visit.id,
      tone: REASON_TONE[worst?.kind] || "neutral",
      title: `${fmtDate(row.visit.scheduledDate)} · ${siteName}`,
      subtitle: row.reasons.map((r) => r.message).join(" · "),
      badge: VISIT_KIND_LABELS[row.visit.kind] || row.visit.kind,
      cta: "เปิดตารางนัด",
      onClick: () => router.push("/service/schedule"),
    };
  }), [attention, router]);

  return (
    <Workspace
      icon={<LayoutDashboard size={22} aria-hidden="true" />}
      title="ภาพรวมธุรกิจบริการ"
      subtitle="นัดที่ค้าง · วันนี้ใครไปไหน · ไซต์ที่น้ำหอมกำลังจะหมด"
      headerRight={(
        <div className={styles.headerActions}>
          {canEdit && (
            <Button tone="neutral" variant="quiet" onClick={() => router.push("/service/today")} icon={<UserRound size={15} aria-hidden="true" />}>
              งานวันนี้
            </Button>
          )}
          <Button tone="primary" onClick={() => router.push("/service/schedule")} icon={<CalendarDays size={15} aria-hidden="true" />}>
            จัดคิวช่าง
          </Button>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={6} /> : loadError ? null : (
        <>
          <div className="kpi-grid">
            <KpiCard
              label="นัดค้าง"
              value={counts.overdue}
              icon={AlertTriangle}
              tone={counts.overdue > 0 ? "danger" : "success"}
              hint="เลยวันนัดแล้วยังไม่ปิดงาน"
              onClick={() => router.push("/service/schedule")}
            />
            <KpiCard
              label="นัดวันนี้"
              value={counts.today}
              icon={CalendarClock}
              tone="accent"
              hint={fmtDate(todayIso)}
              onClick={() => router.push("/service/schedule")}
            />
            <KpiCard
              label="นัดสัปดาห์นี้"
              value={counts.week}
              icon={CalendarDays}
              tone="info"
              hint={counts.unassigned > 0 ? `ยังไม่มอบหมายช่าง ${counts.unassigned} นัด` : "มอบหมายช่างครบแล้ว"}
              onClick={() => router.push("/service/schedule")}
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
              onClick={() => router.push("/service/sites")}
            />
          </div>

          <WorkspaceSection
            icon={<AlertTriangle size={17} aria-hidden="true" />}
            title="ต้องจัดการก่อน"
            subtitle={attention.length > ATTENTION_LIMIT
              ? `แสดง ${ATTENTION_LIMIT} จาก ${attention.length} รายการ — ที่เหลืออยู่ในตารางเข้าบริการ`
              : "นัดที่ค้าง เวลาทับกัน ชนช่วงเข้าไซต์ หรือยังไม่มอบหมายช่าง"}
          >
            <ActionQueue items={queueItems} empty="ไม่มีนัดที่ติดปัญหาตอนนี้ 🎉" />
          </WorkspaceSection>

          <WorkspaceSection
            icon={<Wrench size={17} aria-hidden="true" />}
            title="วันนี้ใครไปไหน"
            subtitle={fmtDate(todayIso)}
          >
            {today.length === 0 ? (
              <EmptyState icon={CalendarClock}>ไม่มีนัดเข้าบริการวันนี้</EmptyState>
            ) : (
              <TableShell>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ช่าง</th>
                      <th scope="col" className="num">จำนวนนัด</th>
                      <th scope="col">ไซต์ที่ต้องเข้า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {today.map((row) => (
                      <tr key={`${row.assigneeId || "unassigned"}|${row.date}`}>
                        <th scope="row">
                          {/* ⚠️ นัดที่ไม่มีเจ้าของต้องเห็นชัดที่สุด ไม่ใช่ซ่อน */}
                          {row.assigneeName || <span className={styles.unassigned}>ยังไม่มอบหมายช่าง</span>}
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
              </TableShell>
            )}
          </WorkspaceSection>

          <WorkspaceSection
            icon={<Droplets size={17} aria-hidden="true" />}
            title="ไซต์ที่น้ำหอมกำลังจะหมด"
            subtitle={watchlist.length > WATCHLIST_LIMIT
              ? `แสดง ${WATCHLIST_LIMIT} จาก ${watchlist.length} ไซต์ — ที่เหลืออยู่ในทะเบียนไซต์`
              : "ประเมินจากขนาดขวดและอัตราใช้ต่อวัน — ไซต์ที่มีนัดครอบแล้วไม่อยู่ในรายการนี้"}
            actions={(
              <Button tone="neutral" variant="quiet" size="sm" onClick={() => router.push("/service/sites")} icon={<MapPin size={15} aria-hidden="true" />}>
                ทะเบียนไซต์
              </Button>
            )}
          >
            {watchlist.length === 0 ? (
              <EmptyState icon={Droplets}>ทุกไซต์มีนัดครอบก่อนน้ำหอมหมดแล้ว 🎉</EmptyState>
            ) : (
              <TableShell>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ไซต์</th>
                      <th scope="col">ลูกค้า</th>
                      <th scope="col" className="num">เครื่องที่ต้องเติม</th>
                      <th scope="col">คาดว่าหมด</th>
                      <th scope="col">นัดครั้งหน้า</th>
                    </tr>
                  </thead>
                  <tbody>
                    {watchlist.slice(0, WATCHLIST_LIMIT).map((site) => (
                      <tr key={site.id}>
                        <th scope="row">
                          <button type="button" className={styles.siteLink} onClick={() => router.push(`/service/sites/${site.id}`)}>
                            {site.name}
                          </button>
                          <span className={styles.sub}>{site.code}{site.routeZone ? ` · ${site.routeZone}` : ""}</span>
                        </th>
                        <td>{naText(site.customerName)}</td>
                        <td className="num">
                          {site.refill?.needsAttention || 0}
                          {site.refill?.overdue > 0 && <span className={styles.over}>หมดแล้ว {site.refill.overdue}</span>}
                        </td>
                        <td>{fmtDate(site.refill?.earliestDue)}</td>
                        {/* ไซต์ในรายการนี้คือไซต์ที่ยังไม่มีนัดครอบ — ช่องนี้จึงมักว่าง
                            และช่องว่างคือสัญญาณว่าต้องนัด ไม่ใช่ข้อมูลขาด */}
                        <td>{site.nextVisitDate ? fmtDate(site.nextVisitDate) : <span className={styles.unassigned}>ยังไม่มีนัด</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            )}
          </WorkspaceSection>
        </>
      )}
    </Workspace>
  );
}
