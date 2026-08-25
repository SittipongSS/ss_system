"use client";
// ── ภาพรวมวางแผนผลิต (X-1) ────────────────────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-01: **ไม่ทำปฏิทินรวมกับธุรกิจบริการ** — คนละทีมปฏิบัติงาน
// (PD/PC/WH/QC กับ TS) · แต่ละระบบมีหน้าภาพรวมของตัวเองแทน
//
// ⭐ หน้านี้ตอบสามคำถามของ PC ตอนเช้า:
//    1. มีงานอะไรที่ต้องตัดสินใจก่อน  2. โรงงานแน่นแค่ไหนสัปดาห์นี้  3. วันนี้ไลน์ไหนเดินอะไร
// ⚠️ ทุกตัวเลขต้องกดต่อไปหางานได้ — ตัวเลขที่กดไม่ได้คือตัวเลขที่ไม่มีใครดูรอบสอง
import { useCallback, useEffect, useMemo, useState } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarRange, Factory, Gauge, Hammer, LayoutDashboard, ListChecks, PlayCircle } from "lucide-react";
import ActionQueue from "@/components/ui/ActionQueue";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import { isBusinessDay, toLocalISODate } from "@/lib/pm/dateHelpers";
import { overridesByDate } from "@/lib/pm/productionLines";
import { JOB_STATUS_LABELS } from "@/lib/pm/productionPlan";
import {
  capacityGlance,
  productionAttention,
  productionCounts,
  runningToday,
} from "@/lib/pm/productionOverview";
import { canEditProduction } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtDayMonth, fmtNumber, naText, NA } from "@/lib/format";

const OPEN_STATUSES = "draft,planned,in_progress";
const ATTENTION_LIMIT = 8;

// เหตุผลแต่ละชนิดควรเจ็บแค่ไหน — ใช้เลือกโทนของแถวในคิว
const REASON_TONE = { materials: "danger", due: "danger", unplanned: "warning", rate: "warning" };

const shiftDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
};

// "14 ส.ค." — ตัวกลางเดียวกับบอร์ดผลิต/ตารางบริการ (`fmtDayMonth`)
// ⚠️ ต่อ T00:00:00 ก่อน — สตริง `YYYY-MM-DD` ล้วนถูกอ่านเป็น UTC แล้วเลื่อนวัน
const fmtDate = (iso) => (iso ? fmtDayMonth(`${iso}T00:00:00`) : NA);

export default function ProductionOverviewPage() {
  const router = useRouter();
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditProduction({ role, team, teams, department }), [role, team, teams, department]);

  const [jobs, setJobs] = useState([]);
  const [lines, setLines] = useState([]);
  const [boardJobs, setBoardJobs] = useState([]);
  const [capacityDays, setCapacityDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const todayIso = useMemo(() => businessDate(), []);
  const weekEnd = useMemo(() => shiftDays(todayIso, 6), [todayIso]);

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async () => {
    const isLatest = startRun();
    setLoading(true);
    setLoadError("");
    try {
      // ⭐ autoDraft=1 เหมือนหน้าคิว — ถ้าภาพรวมไม่กวาด SO อนุมัติแล้วมาเป็นงานร่าง
      // ตัวเลข "ร่าง" บนหน้านี้จะน้อยกว่าที่หน้าคิวโชว์ แล้วภาพรวมก็กลายเป็นหน้าที่โกหก
      // (API กันไว้แล้วว่าคนอ่านอย่างเดียวไม่ทำให้เกิดการเขียน)
      const [queueRes, boardRes] = await Promise.all([
        fetch(`/api/production/jobs?autoDraft=1&status=${OPEN_STATUSES}`),
        fetch(`/api/production/board?from=${todayIso}&to=${weekEnd}`),
      ]);
      const queue = await queueRes.json().catch(() => null);
      if (!queueRes.ok) throw new Error(queue?.error || "โหลดคิวงานผลิตไม่สำเร็จ");
      const board = await boardRes.json().catch(() => null);
      if (!boardRes.ok) throw new Error(board?.error || "โหลดกำลังผลิตไม่สำเร็จ");

      if (!isLatest()) return; // ช่วงวันเปลี่ยนระหว่างรอ — ตัวเลขทั้งแผงต้องมาจากรอบเดียวกัน
      setJobs(Array.isArray(queue?.jobs) ? queue.jobs : []);
      setLines(Array.isArray(board?.lines) ? board.lines : []);
      // ⚠️ ใช้งานจากบอร์ด ไม่ใช่จากคิว — งานที่เริ่มก่อนสัปดาห์นี้แต่ยังเดินคร่อมเข้ามา
      // ต้องนับเข้ากำลังผลิตด้วย ไม่งั้นตัวเลข % จะต่ำกว่าความจริง
      setBoardJobs(Array.isArray(board?.jobs) ? board.jobs : []);
      setCapacityDays(Array.isArray(board?.capacityDays) ? board.capacityDays : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์ภาพรวมว่าง — "โหลดพัง" กับ "ไม่มีงาน" หน้าตา
      // เหมือนกันจนแยกไม่ออก แล้ว PC จะเชื่อว่าโรงงานว่าง
      if (isLatest()) setLoadError(e.message || "โหลดภาพรวมไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [todayIso, weekEnd, startRun]);
  useEffect(() => { load(); }, [load]);

  const overridesByLine = useMemo(() => {
    const map = new Map();
    for (const line of lines) {
      map.set(line.id, overridesByDate(capacityDays.filter((c) => c.lineId === line.id)));
    }
    return map;
  }, [lines, capacityDays]);

  const counts = useMemo(() => productionCounts(jobs), [jobs]);
  const glance = useMemo(
    () => capacityGlance(boardJobs, lines, { from: todayIso, to: weekEnd, overridesByLine }),
    [boardJobs, lines, todayIso, weekEnd, overridesByLine],
  );
  const attention = useMemo(
    () => productionAttention(jobs, lines, { overridesByLine }),
    [jobs, lines, overridesByLine],
  );
  const today = useMemo(
    () => runningToday(boardJobs, lines, { todayIso, overridesByLine }),
    [boardJobs, lines, todayIso, overridesByLine],
  );

  const queueItems = useMemo(() => attention.slice(0, ATTENTION_LIMIT).map((row) => {
    const worst = row.reasons.find((r) => REASON_TONE[r.kind] === "danger") || row.reasons[0];
    return {
      id: row.job.id,
      tone: REASON_TONE[worst?.kind] || "neutral",
      title: `${row.job.code || "งานผลิต"} · ${naText(row.job.productName)}`,
      subtitle: row.reasons.map((r) => r.message).join(" · "),
      badge: JOB_STATUS_LABELS[row.job.status] || row.job.status,
      cta: canEdit ? "เปิดคิวงาน" : "ดูคิวงาน",
      onClick: () => router.push("/production/jobs"),
    };
  }), [attention, canEdit, router]);

  return (
    <Workspace
      icon={<LayoutDashboard size={22} aria-hidden="true" />}
      title="ภาพรวมวางแผนผลิต"
      subtitle="งานที่ต้องตัดสินใจก่อน · กำลังผลิตสัปดาห์นี้ · วันนี้ไลน์ไหนเดินอะไร"
      headerRight={(
        <div className={styles.headerActions}>
          <Button tone="neutral" variant="quiet" onClick={() => router.push("/production/board")} icon={<CalendarRange size={15} aria-hidden="true" />}>
            บอร์ดตารางผลิต
          </Button>
          <Button tone="primary" onClick={() => router.push("/production/jobs")} icon={<ListChecks size={15} aria-hidden="true" />}>
            คิวงานผลิต
          </Button>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={6} /> : loadError ? null : (
        <>
          <div className="kpi-grid">
            <KpiCard
              label="งานร่างรอวางคิว"
              value={counts.draft}
              icon={Hammer}
              tone={counts.draft > 0 ? "warning" : "neutral"}
              hint="สร้างจากใบสั่งขายที่อนุมัติแล้ว"
              onClick={() => router.push("/production/jobs")}
            />
            <KpiCard
              label="วางคิวแล้ว"
              value={counts.planned}
              icon={ListChecks}
              tone="info"
              hint="มีไลน์และวันเริ่มครบแล้ว"
              onClick={() => router.push("/production/board")}
            />
            <KpiCard
              label="กำลังผลิต"
              value={counts.running}
              icon={PlayCircle}
              tone="accent"
              hint="เดินอยู่บนไลน์ตอนนี้"
              onClick={() => router.push("/production/jobs")}
            />
            <KpiCard
              label="กำลังผลิตสัปดาห์นี้"
              /* ⚠️ ไม่รู้ ≠ 0 — ไลน์ที่ยังไม่กรอกกำลังต้องขึ้น "—" ไม่ใช่ 0% */
              value={glance.pct == null ? "—" : `${glance.pct}%`}
              icon={Gauge}
              tone={glance.overloadedCells > 0 ? "danger" : "success"}
              hint={glance.overloadedCells > 0
                ? `จองเกินกำลัง ${glance.overloadedCells} ช่อง`
                : glance.unknownCells > 0
                  ? `ยังไม่กรอกกำลัง ${glance.unknownCells} ช่อง`
                  : `${fmtDate(todayIso)} – ${fmtDate(weekEnd)}`}
              onClick={() => router.push("/production/board")}
            />
          </div>

          <WorkspaceSection
            icon={<AlertTriangle size={17} aria-hidden="true" />}
            title="ต้องตัดสินใจก่อน"
            subtitle={attention.length > ATTENTION_LIMIT
              ? `แสดง ${ATTENTION_LIMIT} จาก ${attention.length} รายการ — ที่เหลืออยู่ในคิวงานผลิต`
              : "งานที่วางก่อนของมาถึง จบช้ากว่ากำหนดส่ง หรือยังไม่ได้วางคิว"}
          >
            <ActionQueue items={queueItems} empty="ไม่มีงานผลิตที่ติดปัญหาตอนนี้ 🎉" />
          </WorkspaceSection>

          <WorkspaceSection
            icon={<Factory size={17} aria-hidden="true" />}
            title="วันนี้ไลน์ไหนเดินอะไร"
            /* ⚠️ วันหยุด/เสาร์-อาทิตย์ ทุกไลน์จะขึ้น "ว่าง" ซึ่งอ่านแล้วเหมือนโรงงาน
               ว่างงาน ทั้งที่จริงคือ **ปิด** — ต้องบอกตรง ๆ ไม่งั้นคนอ่านจะสรุปผิด */
            subtitle={isBusinessDay(new Date(`${todayIso}T00:00:00`))
              ? fmtDate(todayIso)
              : `${fmtDate(todayIso)} · วันหยุด — ไลน์ไม่เดิน ไม่ใช่ว่างงาน`}
          >
            {today.length === 0 ? (
              <EmptyState icon={Factory}>
                ยังไม่มีไลน์ผลิตที่เปิดใช้ — ตั้งค่าไลน์ก่อนที่เมนู &quot;ไลน์ผลิต&quot;
              </EmptyState>
            ) : (
              <TableShell>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">ไลน์ผลิต</th>
                      <th scope="col" className="num">วางไว้วันนี้</th>
                      <th scope="col" className="num">กำลังผลิต</th>
                      <th scope="col">งานบนไลน์</th>
                    </tr>
                  </thead>
                  <tbody>
                    {today.map((row) => (
                      <tr key={row.line.id}>
                        <th scope="row">
                          {row.line.name}
                          <span className={styles.sub}>{row.line.code}</span>
                        </th>
                        <td className="num">{row.planned ? fmtNumber(row.planned) : NA}</td>
                        <td className="num">
                          {/* ยังไม่กรอกกำลัง = "—" ไม่ใช่ 0 (ดู capacityOn) */}
                          {row.capacity == null ? "—" : fmtNumber(row.capacity)}
                          {row.pct != null && <span className={styles.sub}>{row.pct}%</span>}
                        </td>
                        <td>
                          {row.jobs.length === 0 ? (
                            <span className={styles.idle}>ว่าง</span>
                          ) : (
                            <span className={styles.jobList}>
                              {row.jobs.map((j) => j.productName || j.code).join(" · ")}
                            </span>
                          )}
                        </td>
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
