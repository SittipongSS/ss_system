"use client";
// ── หน้ามือถือของช่าง: งานของฉัน (S-3) ────────────────────────────────────
//
// ⭐ **จุดที่ข้อมูลจริงเข้าระบบ** — ถ้าหน้านี้ใช้ยาก ทั้งโมดูลตาย · ตารางสวยแค่ไหน
// ก็ไม่มีค่าถ้าไม่มีใครปิดงาน แล้วทุกแถวค้างเป็น "นัดไว้" ตลอดกาล
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MapPin, Phone, Wrench } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import CloseVisitSheet from "@/components/service/CloseVisitSheet";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam } from "@/lib/roleContext";
import { VISIT_KIND_LABELS, visitTimeText, visitWarnings } from "@/lib/service/rounds";
import { VISIT_SCOPES, VISIT_SCOPE_LABELS, groupVisits, openCount } from "@/lib/service/myVisits";
import { accessWindowText } from "@/lib/service/sites";
import styles from "./page.module.css";

const SECTIONS = [
  { key: "overdue", title: "ค้างอยู่", tone: "danger" },
  { key: "today", title: "วันนี้", tone: "accent" },
  { key: "tomorrow", title: "พรุ่งนี้", tone: "plain" },
  { key: "later", title: "ถัดไป", tone: "plain" },
];

export default function MyVisitsPage() {
  const role = useRole();
  const team = useTeam();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, department }), [role, team, department]);

  const [scope, setScope] = useState("mine");
  const [visits, setVisits] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [closing, setClosing] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/service/my-visits?scope=${scope}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "โหลดคิวงานไม่สำเร็จ");
      setVisits(Array.isArray(data?.visits) ? data.visits : []);
      setSites(Array.isArray(data?.sites) ? data.sites : []);
    } catch (e) {
      // ⚠️ ห้ามกลืน error เป็นคิวว่าง — "โหลดพัง" กับ "วันนี้ไม่มีงาน" หน้าตาเหมือนกัน
      // จนแยกไม่ออก แล้วช่างจะเชื่อว่าตัวเองว่างทั้งที่มีนัดรออยู่
      setLoadError(e.message || "โหลดคิวงานไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const todayIso = toLocalISODate(new Date());
  const groups = useMemo(() => groupVisits(visits, todayIso), [visits, todayIso]);
  const counts = useMemo(() => openCount(groups), [groups]);

  const closeVisit = async (form) => {
    const res = await fetch(`/api/service/visits/${closing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "ปิดงานไม่สำเร็จ");

    // ⭐ server เสนอนัดรอบถัดไปมา — บอกวันให้เห็น แต่ไม่สร้างให้เอง
    const suggestion = data?.nextVisitSuggestion;
    setToast(suggestion
      ? { kind: "success", msg: `ปิดงานแล้ว · รอบถัดไปควรเข้า ${suggestion.scheduledDate} — สร้างนัดได้ที่หน้าตาราง` }
      : { kind: "success", msg: "ปิดงานแล้ว" });
    setClosing(null);
    await load();
  };

  const subtitle = scope === "mine"
    ? "นัดที่มอบหมายให้คุณ · ปิดงานได้จากหน้านี้"
    : "นัดของทั้งฝ่าย — ใช้ตอนไปแทนกัน";

  return (
    <Workspace
      icon={<Wrench size={20} aria-hidden="true" />}
      title="งานของฉัน"
      subtitle={subtitle}
      toolbar={(
        <div className={styles.toolbar}>
          {/* ⭐ ตัวสลับของฉัน/ทั้งทีม (มติผู้ใช้) — ช่างไปแทนกันเป็นเรื่องปกติ
              ต้องเปิดดูของคนที่ลาได้โดยไม่ต้องออกไปหน้าตารางใหญ่ */}
          {/* สถานะ active ของ .segmented มาจาก aria-pressed เอง — ไม่ต้องใส่คลาสซ้ำ */}
          <div className="segmented" role="group" aria-label="ขอบเขตคิวงาน">
            {VISIT_SCOPES.map((key) => (
              <button key={key} type="button" onClick={() => setScope(key)} aria-pressed={scope === key}>
                {VISIT_SCOPE_LABELS[key]}
              </button>
            ))}
          </div>
          <span className={styles.counts}>
            {counts.overdue > 0 && <strong className={styles.overdueCount}>ค้าง {counts.overdue}</strong>}
            วันนี้ {counts.today} · พรุ่งนี้ {counts.tomorrow}
          </span>
        </div>
      )}
    >
      {loadError && <p className="form-error" role="alert">{loadError}</p>}

      {loading ? <SkeletonRows rows={4} /> : loadError ? null : (
        SECTIONS.every((section) => groups[section.key].length === 0) ? (
          <EmptyState icon={CheckCircle2}>
            {scope === "mine" ? "ไม่มีนัดค้างและไม่มีนัดในช่วงนี้" : "ทั้งฝ่ายไม่มีนัดในช่วงนี้"}
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
                const done = visit.status === "done";
                return (
                  <article key={visit.id} className={`${styles.card} ${done ? styles.cardDone : ""}`}>
                    <div className={styles.cardHead}>
                      <span className={styles.time}>{visitTimeText(visit)}</span>
                      <span className={styles.kind}>{VISIT_KIND_LABELS[visit.kind] || visit.kind}</span>
                      {done && <span className="ui-badge">ปิดงานแล้ว</span>}
                    </div>

                    <p className={styles.siteName}>{site?.name || visit.siteId}</p>
                    <p className={styles.meta}>
                      {[site?.zone, site?.customerName, accessWindowText(site) && `เข้าได้ ${accessWindowText(site)}`]
                        .filter(Boolean).join(" · ") || "—"}
                    </p>
                    {site?.accessNote && <p className={styles.meta}>{site.accessNote}</p>}
                    {/* ทั้งทีม: ต้องรู้ว่านัดนี้เป็นของใคร ไม่งั้นไปทับงานคนอื่น */}
                    {scope === "team" && (
                      <p className={styles.meta}>ช่าง: {visit.assigneeName || "ยังไม่มอบหมาย"}</p>
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
                      {canEdit && (
                        <Button tone={done ? "neutral" : "primary"} variant={done ? "quiet" : undefined} size="sm"
                          onClick={() => setClosing(visit)}>
                          {done ? "แก้ผลการเข้า" : "ปิดงาน"}
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
