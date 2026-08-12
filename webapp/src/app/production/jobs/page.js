"use client";
// ── คิวงานผลิต (mig 0189 · P-2) ───────────────────────────────────────────
//
// ⭐ **หน้าที่ PC เปิดจริงทุกเช้า** — ตอบว่าต้องผลิตอะไรก่อน และเริ่มได้จริงไหม
// ⭐ ตัวเชื่อมที่สำคัญที่สุด: คอลัมน์ "ของครบ?" มาจาก `productionReadiness()` ของ
//    ของเข้า PM/RM ที่ PC กรอกไว้แล้ว — โมดูลนี้เป็นปลายทางของข้อมูลชิ้นนั้น
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Factory, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import ProductionJobModal from "@/components/pm/ProductionJobModal";
import { canEditProduction } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import {
  JOB_STATUS_LABELS,
  isJobWaitingToSchedule,
  jobDateRange,
  jobWarnings,
} from "@/lib/pm/productionPlan";
import styles from "./page.module.css";
import { fmtNumber } from "@/lib/format";

// คิวเปิดมาเห็น "งานที่ยังต้องตัดสินใจ" ก่อน — จบ/ยกเลิกไม่ใช่คิว
const OPEN_STATUSES = "draft,planned,in_progress";

export default function ProductionJobsPage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditProduction({ role, team, teams, department }), [role, team, teams, department]);

  const [jobs, setJobs] = useState([]);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showDone, setShowDone] = useState(false);
  /* ⭐ `?count=productionJobs` — ลิงก์จากป้ายตัวเลขบนเมนู (ม-118) · ป้ายนับ "งานร่างที่ยัง
     ไม่ถูกวางคิว" ⇒ กดแล้วต้องเจอเท่านั้น ไม่ใช่คิวทั้งโรงงาน
     ⚠️ อ่านครั้งเดียวตอนเปิดหน้า ไม่เฝ้าค่า (แพตเทิร์นเดียวกับ `?count=` ของคิว RD) */
  const [draftOnly, setDraftOnly] = useState(
    () => new URLSearchParams(window.location.search).get("count") === "productionJobs",
  );
  const [formJob, setFormJob] = useState(undefined); // undefined = ปิด · null = สร้าง
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      // autoDraft=1 — กวาด SO ที่อนุมัติแล้วมาเป็นงานร่างก่อนคืนคิว
      // คิวที่ต้องกดปุ่มก่อนถึงจะครบ คือคิวที่คนจะเชื่อว่าว่างทั้งที่มีงานรออยู่
      const status = showDone ? "" : `&status=${OPEN_STATUSES}`;
      const res = await fetch(`/api/production/jobs?autoDraft=1${status}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดคิวงานผลิตไม่สำเร็จ");
      setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      setLines(Array.isArray(data?.lines) ? data.lines : []);
      if (data?.generated > 0) {
        setToast({ kind: "success", msg: `สร้างงานร่างจากใบสั่งขายที่อนุมัติแล้ว ${data.generated} รายการ` });
      }
    } catch (e) {
      // ⚠️ ห้ามกลืน error แล้วโชว์คิวว่าง — "โหลดพัง" กับ "ไม่มีงาน" หน้าตาเหมือนกัน
      // จนแยกไม่ออก แล้ว PC จะเชื่อว่าโรงงานว่าง
      setLoadError(e.message || "โหลดคิวงานผลิตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [showDone]);
  useEffect(() => { load(); }, [load]);

  const linesById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const visibleJobs = useMemo(
    () => (draftOnly ? jobs.filter(isJobWaitingToSchedule) : jobs),
    [jobs, draftOnly],
  );

  const saveJob = async (form) => {
    const editing = !!formJob;
    const res = await fetch(editing ? `/api/production/jobs/${formJob.id}` : "/api/production/jobs", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: editing ? "บันทึกงานผลิตแล้ว" : "สร้างงานผลิตแล้ว" });
    await load();
  };

  const counts = useMemo(() => ({
    draft: jobs.filter((j) => j.status === "draft").length,
    planned: jobs.filter((j) => j.status === "planned").length,
    running: jobs.filter((j) => j.status === "in_progress").length,
  }), [jobs]);

  return (
    <Workspace
      icon={<Factory size={20} aria-hidden="true" />}
      title="คิวงานผลิต"
      subtitle="งานที่ต้องผลิต เรียงตามกำหนดส่ง · บอกด้วยว่าของครบพร้อมผลิตหรือยัง"
      headerRight={canEdit ? (
        <Button tone="primary" onClick={() => setFormJob(null)} icon={<Plus size={15} aria-hidden="true" />}>
          สร้างงานผลิต
        </Button>
      ) : null}
      toolbar={(
        <div className={styles.toolbar}>
          <div className="segmented" role="group" aria-label="ขอบเขตคิว">
            <button type="button" onClick={() => setShowDone(false)} aria-pressed={!showDone}>ที่ยังไม่จบ</button>
            <button type="button" onClick={() => setShowDone(true)} aria-pressed={showDone}>ทั้งหมด</button>
          </div>
          <span className={styles.counts}>
            {draftOnly && (
              /* ตัวกรองที่ใช้อยู่เป็นปุ่มกดล้าง — ต้นแบบเดียวกับคิวคำร้อง */
              <Button size="sm" onClick={() => setDraftOnly(false)}>กรอง: รอวางคิว ×</Button>
            )}
            ร่าง {counts.draft} · วางคิวแล้ว {counts.planned} · กำลังผลิต {counts.running}
          </span>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={5} /> : loadError ? null : visibleJobs.length === 0 ? (
        <EmptyState icon={Factory}>
          ยังไม่มีงานผลิตในคิว — งานร่างจะถูกสร้างให้เองเมื่อมีใบสั่งขายที่อนุมัติแล้ว
        </EmptyState>
      ) : (
        <TableShell>
          <table>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>สินค้า</th>
                <th className={styles.numCol}>จำนวน</th>
                <th>กำหนดส่ง</th>
                <th>ไลน์ · แผนผลิต</th>
                <th>ของครบ?</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => {
                const line = linesById.get(job.lineId);
                const plan = jobDateRange(job, line);
                const warnings = jobWarnings(job, line, { readiness: job.readiness });
                return (
                  <tr key={job.id} className={job.status === "cancelled" ? styles.inactive : undefined}>
                    <td>
                      <button type="button" className={styles.codeBtn} onClick={() => setFormJob(job)}>
                        {job.code || job.id}
                      </button>
                    </td>
                    <td>
                      {job.productName || job.fgCode || "-"}
                      {job.fgCode && job.productName ? <span className={styles.muted}> · {job.fgCode}</span> : null}
                    </td>
                    <td className={styles.numCol}>
                      {fmtNumber(job.qty)}{job.unit ? ` ${job.unit}` : ""}
                    </td>
                    <td>{job.dueDate || <span className={styles.muted}>ยังไม่กำหนด</span>}</td>
                    <td>
                      {line ? (
                        <>
                          {line.name}
                          {plan ? <span className={styles.muted}> · {plan.start} – {plan.finish}</span> : null}
                        </>
                      ) : <span className={styles.muted}>ยังไม่วางไลน์</span>}
                    </td>
                    {/* ⭐ คอลัมน์นี้คือเหตุผลที่ทั้งโมดูลต่อกับของเข้า PM/RM */}
                    <td className={job.readiness?.tone === "danger" ? styles.danger : job.readiness?.tone === "warning" ? styles.warn : undefined}>
                      {job.readiness ? job.readiness.label : <span className={styles.muted}>ไม่ได้ผูกใบสั่งขาย</span>}
                    </td>
                    <td>
                      <span className="ui-badge">{JOB_STATUS_LABELS[job.status] || job.status}</span>
                      {warnings.map((warning) => (
                        <p key={warning.kind} className={styles.warnRow}>
                          <AlertTriangle size={12} aria-hidden="true" />{warning.message}
                        </p>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      <ProductionJobModal
        open={formJob !== undefined}
        job={formJob}
        lines={lines}
        onClose={() => setFormJob(undefined)}
        onSave={saveJob}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
