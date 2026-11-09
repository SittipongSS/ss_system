"use client";
// ── หน้างานติดตั้งของช่าง (ขั้นเข้าติดตั้ง PR-5b · ม็อก C1a/C1/C2/C3 · มติเจ้าของ 09/11/2026) ──────────────────────
//
// ⭐ ทรงเดียวกับจอประเมินพื้นที่ (จอช่างแบบ A): หัวงาน › แถบขั้น เริ่มงาน › ทำงาน › ส่งงาน › **รายการโซนทั้งหมดพร้อมสถานะ**
//    · แตะโซนไหนก่อนก็ได้ (C2 = รายการจุด) · ข้ามได้ · ตอนส่งงานค่อยบอกผลโซนที่ยังไม่ได้ทำ (C3)
//    · ก่อนเริ่มงาน (C1a) ดูโซน/จุดได้ แต่บันทึกผลได้หลังกด "เริ่มงาน" · งานวันอื่นกดเริ่มไม่ได้
// ⚠️ ข้อมูลมาจากสองเส้น: `GET visits/[id]` (นัด · ไซต์ · ทีม · บทบาทของคนเปิดจอ) + `GET visits/[id]/install` (โซน › จุด)
//    กติกาบันทึก/ส่งงานอยู่ server (`installJob.js`) — จอส่งค่าแล้วโชว์คำตอบ
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardList, Phone, Play, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import StepTrack from "@/components/ui/StepTrack";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { businessDate } from "@/lib/businessDate";
import { notifyToast } from "@/lib/feedback";
import { fmtDate } from "@/lib/format";
import { isInstallStepVisit } from "@/lib/service/visitGate";
import { VISIT_STATUS_LABELS, isClosedVisit } from "@/lib/service/visitStatus";
import {
  installJobSteps, installMissingText, installStartState, installZoneBadge, installZoneMachines,
} from "@/lib/service/installJobScreen";
import InstallZonePage from "./InstallZonePage";
import InstallSendSheet from "./InstallSendSheet";
import styles from "./InstallJob.module.css";

const slot = (visit) => (visit?.startTime && visit?.endTime
  ? `${String(visit.startTime).slice(0, 5)}–${String(visit.endTime).slice(0, 5)}`
  : "ทั้งวัน");

export default function InstallJobScreen({ visitId }) {
  const router = useRouter();
  const [base, setBase] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [zoneOpen, setZoneOpen] = useState(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const todayIso = businessDate();

  const load = useCallback(async () => {
    try {
      setError("");
      const head = await apiJson(`/api/service/visits/${visitId}`, { fallbackError: "โหลดงานไม่สำเร็จ" });
      setBase(head);
      if (!isInstallStepVisit(head?.visit)) { setJob(null); return; }
      setJob(await apiJson(`/api/service/visits/${visitId}/install`, { fallbackError: "โหลดงานติดตั้งไม่สำเร็จ" }));
    } catch (e) {
      setError(e?.message || "โหลดงานไม่สำเร็จ");
    }
  }, [visitId]);

  useEffect(() => { if (visitId) load(); }, [visitId, load]);

  const visit = base?.visit || null;
  const view = job?.view || null;
  const start = useMemo(() => installStartState(visit, todayIso), [visit, todayIso]);
  const zone = useMemo(() => (view?.zones || []).find((z) => z.zoneId === zoneOpen) || null, [view, zoneOpen]);

  async function startJob() {
    setStarting(true);
    try {
      /* ปุ่มเดิมของระบบ — server ประทับเวลาไทยเอง และกันงานวันอื่น (`visitMoveDecision`) */
      const res = await apiFetch(`/api/service/visits/${visitId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress", stamp: "start" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "เริ่มงานไม่สำเร็จ");
      notifyToast.success(`เริ่มงานแล้ว · ${String(data?.visit?.actualStartTime || "").slice(0, 5)} น.`);
      await load();
    } catch (e) {
      notifyToast.error(e?.message || "เริ่มงานไม่สำเร็จ");
      await load();
    } finally {
      setStarting(false);
    }
  }

  if (error) {
    return (
      <div className={styles.page}>
        <StatusNotice tone="error" action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}>{error}</StatusNotice>
      </div>
    );
  }
  if (!base) return <div className={styles.page}><SkeletonRows rows={5} /></div>;
  if (!isInstallStepVisit(visit)) {
    return (
      <div className={styles.page}>
        <EmptyState icon={ClipboardList}>งานนี้ทำต่อที่หน้างานของฉัน — หน้านี้ตอนนี้รองรับงานติดตั้งเท่านั้น</EmptyState>
      </div>
    );
  }
  if (!view) return <div className={styles.page}><SkeletonRows rows={5} /></div>;

  const site = base.site || {};
  /* ทีมของใบ (`loadVisitCrew`: `{ id, name, lead, you }`) — คนหลักก่อน แล้วผู้ช่วยตามลำดับบนนัด */
  const lead = (base.crew || []).find((c) => c.lead);
  const helpers = (base.crew || []).filter((c) => !c.lead && !c.you).map((c) => c.name).filter(Boolean);
  const closed = isClosedVisit(visit);
  const running = visit.status === "in_progress";
  const request = job?.request || null;

  if (zone) {
    const index = view.zones.findIndex((z) => z.zoneId === zone.zoneId);
    return (
      <InstallZonePage
        key={zone.zoneId}
        visitId={visitId}
        zone={zone}
        position={{ index, count: view.zones.length }}
        neighbors={{ prev: view.zones[index - 1] || null, next: view.zones[index + 1] || null }}
        canRecord={running}
        onBack={() => setZoneOpen(null)}
        onGo={(zoneId) => setZoneOpen(zoneId)}
        onSaved={load}
      />
    );
  }

  return (
    <div className={styles.page}>
      <StepTrack steps={installJobSteps(visit)} ariaLabel="ขั้นของงานนี้" className={styles.steps} />

      <section className={styles.head} aria-label="หัวงาน">
        <div className={styles.headTop}>
          <StatusBadge size="sm" tone="info" label="ติดตั้ง" />
          <span className={styles.code}>{visit.code || visit.id}</span>
          <StatusBadge size="sm" dot tone={running ? "warning" : closed ? "success" : "neutral"} label={VISIT_STATUS_LABELS[visit.status] || visit.status} />
        </div>
        <h1 className={styles.site}>{site.name || visit.siteId}</h1>
        {site.customerName ? <p className={styles.sub}>{site.customerName}</p> : null}
        <p className={styles.when}>
          {visit.scheduledDate === todayIso ? "วันนี้ · " : ""}{fmtDate(visit.scheduledDate)} · {slot(visit)}
        </p>
        <p className={styles.crew}>
          {base.viewerRole === "lead" ? "คุณเป็นหัวหน้างาน" : base.viewerRole === "helper" ? `คุณเป็นผู้ช่วย · หัวหน้างาน ${lead?.name || visit.assigneeName || ""}` : `หัวหน้างาน ${visit.assigneeName || "ยังไม่ระบุ"}`}
          {helpers.length && base.viewerRole !== "helper" ? ` · ผู้ช่วย ${helpers.join(", ")}` : ""}
        </p>
        {request?.note ? <p className={styles.note}><b>ฝ่ายขายฝากบอก</b> {request.note}</p> : null}
        {request?.contactName || request?.contactPhone ? (
          <p className={styles.contact}>
            <span>{request.contactName || "ผู้ติดต่อหน้างาน"}</span>
            {request.contactPhone ? (
              <a href={`tel:${request.contactPhone.replace(/[^\d+]/g, "")}`} className={styles.tel}>
                <Phone size={14} aria-hidden="true" />{request.contactPhone}
              </a>
            ) : null}
          </p>
        ) : null}
      </section>

      <section className={styles.zones} aria-label="โซนทั้งหมด">
        <div className={styles.zonesHead}>
          <b>โซนทั้งหมด</b>
          <span>{running || closed ? `ครบ ${view.zonesComplete}/${view.zones.length} โซน · ${view.done}/${view.total} จุดติดตั้งแล้ว` : `${view.zones.length} โซน · ${view.total} จุด`}</span>
        </div>
        <ul className={styles.zoneList}>
          {view.zones.map((z) => {
            const badge = installZoneBadge(z);
            return (
              <li key={z.zoneId}>
                <button type="button" className={styles.zoneRow} onClick={() => setZoneOpen(z.zoneId)}>
                  <span className={styles.zoneText}>
                    <small>{z.code || ""}</small>
                    <b>{z.name || z.code || "โซน"}</b>
                    <small>{installZoneMachines(z)}</small>
                  </span>
                  <StatusBadge size="sm" tone={badge.tone} label={badge.text} />
                  <ChevronRight size={18} aria-hidden="true" className={styles.chev} />
                </button>
              </li>
            );
          })}
          {view.elsewhere.map((z) => (
            <li key={`other-${z.zoneId}`} className={styles.zoneElsewhere}>
              <span className={styles.zoneText}>
                <small>{z.code || ""}</small>
                <b>{z.name || z.code || "โซน"}</b>
                <small>นัดแยก {z.visitCode || ""}{z.scheduledDate ? ` · ${fmtDate(z.scheduledDate)}` : ""}</small>
              </span>
              <span className={styles.muted}>ไม่อยู่ในงานนี้</span>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>
          {running ? "แตะโซนไหนก่อนก็ได้ · ข้ามได้ · ตอนส่งงานค่อยบอกผลโซนที่ยังไม่ได้ทำ"
            : closed ? "ส่งงานแล้ว — แก้ผลที่ส่งได้ที่หัวหน้า"
              : "เปิดดูโซนและจุดได้ก่อน · บันทึกผลได้หลังกดเริ่มงาน · ถึงหน้างานแล้วค่อยกด"}
        </p>
      </section>

      <div className={styles.bar}>
        {start.show ? (
          <>
            <span className={styles.barText}>{start.reason || "ถึงหน้างานแล้วกดเริ่มงาน · เวลาเริ่มงานบันทึกตอนกด"}</span>
            <Button tone="primary" icon={<Play size={16} aria-hidden="true" />} onClick={startJob} disabled={!start.can || starting}>
              {starting ? "กำลังเริ่ม…" : "เริ่มงาน"}
            </Button>
          </>
        ) : running ? (
          <>
            <span className={styles.barText}>{installMissingText(view)}</span>
            <Button tone="primary" icon={<Send size={16} aria-hidden="true" />} onClick={() => setSendOpen(true)}>ส่งงาน</Button>
          </>
        ) : (
          <>
            <span className={styles.barText}>ส่งงานแล้ว · ติดตั้งแล้ว {view.done}/{view.total} จุด</span>
            <Button as={Link} href={`/service/visits/${visit.id}`} variant="ghost" icon={<ClipboardList size={16} aria-hidden="true" />}>ใบส่งงาน</Button>
          </>
        )}
      </div>

      {sendOpen ? (
        <InstallSendSheet
          visit={visit}
          site={site}
          view={view}
          onClose={() => setSendOpen(false)}
          onSent={() => { setSendOpen(false); router.push("/service/today"); }}
        />
      ) : null}
    </div>
  );
}
