"use client";
// ── หน้ามือถือของช่าง: งานวันนี้ (S-3 · เดิมชื่อ "นัดของฉัน" — F-1 2026-08-27) ──
//
// ⭐ **จุดที่ข้อมูลจริงเข้าระบบ** — ถ้าหน้านี้ใช้ยาก ทั้งโมดูลตาย · ตารางสวยแค่ไหน
// ก็ไม่มีค่าถ้าไม่มีใครปิดงาน แล้วทุกแถวค้างเป็น "นัดไว้" ตลอดกาล
//
// ⚠️ ชื่อหน้าเป็น "งานวันนี้" ไม่ใช่ "งานของฉัน" — ชื่อหลังเป็นของระบบบริหารงานขาย
// (/sa/tasks = งานติดตามส่วนบุคคล) คนละเรื่องกันคนละระบบ · ชื่อซ้ำข้ามระบบทำให้คน
// จำไม่ได้ว่าของตัวเองอยู่เมนูไหน แล้วเปิดผิดหน้าประจำ
//
// ⚠️ ไม่มีปุ่มสลับ "ทั้งทีม" บนหน้านี้ (มติ 2026-08-02 ข้อ 2) — มุมมองทั้งฝ่ายอยู่ที่
// หน้าจัดคิวช่าง · เคสไปแทนกันเข้าหน้านี้ด้วยลิงก์ ?user=<id> จากหน้าจัดคิวแทน
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import { AlertTriangle, CheckCircle2, ClipboardList, FileText, MapPin, Phone, Play, Wrench } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import CloseVisitSheet from "@/components/service/CloseVisitSheet";
import { canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { VISIT_KIND_LABELS, visitTimeText, visitWarnings } from "@/lib/service/rounds";
import { VISIT_STATUS_LABELS, isClosedVisit } from "@/lib/service/visitStatus";
import { groupVisits, openCount, overdueDays } from "@/lib/service/myVisits";
import { accessWindowText } from "@/lib/service/sites";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";
import { fmtDayMonth, naText } from "@/lib/format";

const SECTIONS = [
  { key: "overdue", title: "ค้างอยู่", tone: "danger" },
  { key: "today", title: "วันนี้", tone: "accent" },
  { key: "tomorrow", title: "พรุ่งนี้", tone: "plain" },
  { key: "later", title: "ถัดไป", tone: "plain" },
];

export default function TodayPage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);

  // ไปแทนกัน: หน้าจัดคิวลิงก์มาพร้อม ?user=<id> — หน้านี้กลายเป็น "งานวันนี้ของ <ช่าง>"
  // ไม่มี UI สลับคนบนหน้านี้เอง (มุมมองข้ามคนเป็นเรื่องของหน้าจัดคิว) · server เป็นคน
  // เทียบว่า id นี้คือตัวเองหรือคนอื่น — ฝั่ง client ไม่มีทางรู้ id ตัวเอง (roleContext ไม่พก id)
  const searchParams = useSearchParams();
  const viewUserId = searchParams.get("user") || "";
  const viewingOther = !!viewUserId;

  const [visits, setVisits] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [closing, setClosing] = useState(null);
  const [toast, setToast] = useState(null);

  // กันคำตอบมาผิดลำดับเมื่อตัวกรองขยับเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร ตารางต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const assignee = viewingOther ? `&assignee=${encodeURIComponent(viewUserId)}` : "";
      const res = await fetch(`/api/service/my-visits?scope=mine${assignee}`);
      const data = await res.json().catch(() => null);
      if (!isLatest()) return; // เปลี่ยนคนดูระหว่างรอ — คิวต้องตรงกับลิงก์ล่าสุด
      if (!res.ok) throw new Error(data?.error || "โหลดคิวงานไม่สำเร็จ");
      setVisits(Array.isArray(data?.visits) ? data.visits : []);
      setSites(Array.isArray(data?.sites) ? data.sites : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error เป็นคิวว่าง — "โหลดพัง" กับ "วันนี้ไม่มีงาน" หน้าตาเหมือนกัน
      // จนแยกไม่ออก แล้วช่างจะเชื่อว่าตัวเองว่างทั้งที่มีนัดรออยู่
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดคิวงานไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [startRun, viewingOther, viewUserId]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const todayIso = businessDate();
  const groups = useMemo(() => groupVisits(visits, todayIso), [visits, todayIso]);
  const counts = useMemo(() => openCount(groups), [groups]);

  // ชื่อช่างที่กำลังดูแทน — เอาจากนัดใบแรกที่มีชื่อ (API กรองด้วย assignee อยู่แล้ว)
  const viewedName = useMemo(() => {
    if (!viewingOther) return "";
    return visits.find((v) => v.assigneeName)?.assigneeName || "ช่างคนอื่น";
  }, [viewingOther, visits]);

  /* ⭐ ปุ่ม "เริ่มงาน" — ส่ง `stamp: 'start'` ให้ server ประทับเวลาไทยเอง
     ช่างไม่พิมพ์เวลา และค่าที่ได้ไม่ขึ้นกับนาฬิกาในมือถือที่ตั้งผิดได้ (มติข้อ 5) */
  const [starting, setStarting] = useState(null);
  const startVisit = async (visit) => {
    setStarting(visit.id);
    try {
      const res = await fetch(`/api/service/visits/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress", stamp: "start" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "เริ่มงานไม่สำเร็จ");
      setToast({ kind: "success", msg: `เริ่มงานแล้ว · ${data?.visit?.actualStartTime || ""} น.` });
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setStarting(null);
    }
  };

  const closeVisit = async (form) => {
    const res = await fetch(`/api/service/visits/${closing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // stamp:'end' = ให้ server ประทับเวลาจบด้วยนาฬิกาไทย · ฟอร์มไม่ส่งเวลามาเอง
      body: JSON.stringify({ ...form, stamp: "end" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "ปิดงานไม่สำเร็จ");

    // ⭐ server เสนอนัดรอบถัดไปมา — บอกวันให้เห็น แต่ไม่สร้างให้เอง
    const suggestion = data?.nextVisitSuggestion;
    const closedAs = VISIT_STATUS_LABELS[data?.visit?.status] || "ปิดงาน";
    setToast(suggestion
      ? { kind: "success", msg: `${closedAs} · รอบถัดไปควรเข้า ${suggestion.scheduledDate} — สร้างนัดได้ที่หน้าจัดคิวช่าง` }
      : { kind: "success", msg: `${closedAs}แล้ว` });
    setClosing(null);
    await load();
  };

  const subtitle = viewingOther
    ? `กำลังดูงานของ ${viewedName} (ไปแทนกัน) · ปิดงานแทนได้จากหน้านี้`
    : "นัดเข้าไซต์ที่มอบหมายให้คุณ · ปิดงานได้จากหน้านี้";

  return (
    <Workspace
      icon={<Wrench size={20} aria-hidden="true" />}
      title="งานวันนี้"
      subtitle={subtitle}
      toolbar={(
        <span className={styles.counts}>
          {counts.overdue > 0 && <strong className={styles.overdueCount}>ค้าง {counts.overdue}</strong>}
          วันนี้ {counts.today} · พรุ่งนี้ {counts.tomorrow}
        </span>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={4} /> : loadError ? null : (
        SECTIONS.every((section) => groups[section.key].length === 0) ? (
          <EmptyState icon={CheckCircle2}>
            {viewingOther ? `${viewedName} ไม่มีนัดค้างและไม่มีนัดในช่วงนี้` : "ไม่มีนัดค้างและไม่มีนัดในช่วงนี้"}
          </EmptyState>
        ) : SECTIONS.map((section) => {
          const rows = groups[section.key];
          if (!rows.length) return null;
          return (
            <section key={section.key} className={styles.section}>
              <h2 className={`${styles.sectionTitle} ${section.tone === "danger" ? styles.danger : ""}`}>
                {section.tone === "danger" && <AlertTriangle size={15} aria-hidden="true" />}
                {section.title}
                <span className={styles.sectionCount}>{rows.length}</span>
              </h2>

              {rows.map((visit) => {
                const site = sitesById.get(visit.siteId);
                const warnings = visitWarnings(visit, { site });
                const done = isClosedVisit(visit);
                const running = visit.status === "in_progress";
                const late = overdueDays(visit, todayIso);
                return (
                  <article key={visit.id} className={`${styles.card} ${done ? styles.cardDone : ""} ${running ? styles.cardLive : ""} ${late && !done && !running ? styles.cardLate : ""}`}>
                    <div className={styles.cardHead}>
                      {/* ⚠️ **วันที่ต้องอยู่บนการ์ด** — กลุ่ม "ค้างอยู่" กับ "ถัดไป" รวมหลายวัน
                          ไว้ด้วยกัน ถ้ามีแต่เวลา นัดที่ค้างมาสองเดือนจะหน้าตาเหมือนนัดเมื่อวาน */}
                      <span className={styles.date}>{fmtDayMonth(visit.scheduledDate)}</span>
                      <span className={styles.time}>{visitTimeText(visit)}</span>
                      <span className={styles.kind}>{VISIT_KIND_LABELS[visit.kind] || visit.kind}</span>
                      {late && !done && !running && <span className="ui-badge danger">ค้าง {late} วัน</span>}
                      {done && <span className={`ui-badge ${visit.status === "done" ? "success" : "warning"}`}>{VISIT_STATUS_LABELS[visit.status]}</span>}
                    </div>

                    <p className={styles.siteName}>{site?.name || visit.siteId}</p>
                    <p className={styles.meta}>
                      {naText([site?.routeZone, site?.customerName, accessWindowText(site) && `เข้าได้ ${accessWindowText(site)}`]
                        .filter(Boolean).join(" · "))}
                    </p>
                    {site?.accessNote && <p className={styles.meta}>{site.accessNote}</p>}

                    {/* 🐞 หมายเหตุที่คนจัดคิวพิมพ์ไว้ **ไม่เคยถูกแสดงบนการ์ดเลย** ทั้งที่
                        เก็บลง service_visits.note และ API ส่งมาครบ (select '*') ⇒ ข้อความที่
                        ตั้งใจสั่งงานช่างหายทั้งหมด · แยกทรงจาก .meta เพราะเป็นคำสั่ง ไม่ใช่คำขยาย */}
                    {visit.note && (
                      <p className={styles.note}>
                        <FileText size={13} aria-hidden="true" />
                        <span>{visit.note}</span>
                      </p>
                    )}

                    {running && (
                      <p className={styles.running}>
                        <span className={styles.pulse} aria-hidden="true" />
                        กำลังทำอยู่ · เริ่ม {String(visit.actualStartTime || "").slice(0, 5)} น.
                      </p>
                    )}

                    {warnings.map((warning) => (
                      <p key={warning.kind} className={styles.warn}>
                        <AlertTriangle size={13} aria-hidden="true" />{warning.message}
                      </p>
                    ))}

                    <div className={styles.actions}>
                      {site?.mapUrl && (
                        <Button as="a" href={site.mapUrl} target="_blank" rel="noreferrer noopener"
                          tone="neutral" variant="quiet" size="sm" icon={<MapPin size={14} aria-hidden="true" />}>
                          นำทาง
                        </Button>
                      )}
                      {site?.contactPhone && (
                        <Button as="a" href={`tel:${site.contactPhone}`}
                          tone="neutral" variant="quiet" size="sm" icon={<Phone size={14} aria-hidden="true" />}>
                          โทร
                        </Button>
                      )}
                      {/* ⭐ สองปุ่มคนละจังหวะ: ยังไม่เริ่ม = "เริ่มงาน" (ประทับเวลาเริ่มที่ server)
                          · กำลังทำอยู่ = "ปิดงาน" · ปิดแล้ว = "แก้ผลการเข้า"
                          ไม่มีปุ่มไหนให้พิมพ์เวลาเอง — นั่นคือทั้งเหตุผลของการมีปุ่มเริ่มงาน */}
                      {canEdit && !done && !running && (
                        <Button tone="accent" size="sm" disabled={starting === visit.id}
                          icon={<Play size={14} aria-hidden="true" />}
                          onClick={() => startVisit(visit)}>
                          {starting === visit.id ? "กำลังเริ่ม…" : "เริ่มงาน"}
                        </Button>
                      )}
                      {canEdit && (running || done) && (
                        <Button tone={done ? "neutral" : "primary"} variant={done ? "quiet" : undefined} size="sm"
                          onClick={() => setClosing(visit)}>
                          {done ? "แก้ผลการเข้า" : "ปิดงาน"}
                        </Button>
                      )}
                      {done && (
                        <Button as="a" href={`/service/visits/${visit.id}`} tone="neutral" variant="quiet" size="sm"
                          icon={<ClipboardList size={14} aria-hidden="true" />}>
                          ใบส่งงาน
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })
      )}

      <CloseVisitSheet
        open={!!closing}
        visit={closing}
        site={closing ? sitesById.get(closing.siteId) : null}
        onClose={() => setClosing(null)}
        onSubmit={closeVisit}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
