"use client";
// ── ตั้งค่า → ที่เก็บไฟล์ (Google Drive) ─────────────────────────────────
// หน้าเดียวที่ตอบคำถาม "ระบบไฟล์แนบยังดีอยู่ไหม" โดยไม่ต้องเป็น Google Workspace admin
// และไม่ต้องเปิด terminal:
//   1. การเชื่อมต่อ — ตั้งค่าครบไหม · คุยกับ Drive ได้ไหม · เขียนไฟล์จริงได้ไหม
//   2. ไฟล์แนบทั้งระบบ — ทุกแถวยังชี้ไปที่ไฟล์ที่มีอยู่จริงไหม (จับไฟล์ที่ถูกลบด้วยมือ)
//   3. จัดโครงโฟลเดอร์ — ดูแผนก่อน แล้วค่อยกดย้ายจริง (ย้าย = เปลี่ยน parent เท่านั้น
//      id ไม่เปลี่ยน ลิงก์เดิมใช้ได้หมด และกดซ้ำได้)
import { useCallback, useEffect, useState } from "react";
import {
  HardDrive, CheckCircle2, XCircle, RefreshCw, FolderTree, FileSearch, PlayCircle,
} from "lucide-react";
import { useRole } from "@/lib/roleContext";
import { can } from "@/lib/permissions";
import { accessState } from "@/lib/accessGate";
import AccessDenied from "@/components/ui/AccessDenied";
import Button from "@/components/ui/Button";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusNotice from "@/components/ui/StatusNotice";
import Workspace from "@/components/ui/Workspace";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import styles from "./page.module.css";

const BACK_TO_SETTINGS = { href: "/settings", label: "กลับหน้าตั้งค่า" };

// ป้ายไทยของสถานะไฟล์ที่ตรวจเจอ — 'ok' ไม่ต้องมีเพราะไม่ถูกส่งกลับมา
const FILE_STATUS = {
  trashed: "อยู่ในถังขยะ",
  missing: "ไม่พบไฟล์บน Drive",
  error: "เข้าถึงไม่ได้",
  "no-drive-id": "ไม่มี id ของ Drive (เอกสาร Google หรือแถวเก่า)",
};

export default function StoragePage() {
  const role = useRole();
  const canManage = can(role, "users:manage");

  const [health, setHealth] = useState(null);
  const [healthBusy, setHealthBusy] = useState(true);
  const [audit, setAudit] = useState(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [moving, setMoving] = useState(null); // { done, total, moved, skipped }
  const [log, setLog] = useState([]);
  const [error, setError] = useState("");

  const call = useCallback(async (url, init) => {
    const res = await fetch(url, { cache: "no-store", ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "เรียกใช้งานไม่สำเร็จ");
    return data;
  }, []);

  const loadHealth = useCallback(async ({ write = false } = {}) => {
    setHealthBusy(true);
    setError("");
    try {
      setHealth(await call(`/api/admin/drive?action=health${write ? "&write=1" : ""}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setHealthBusy(false);
    }
  }, [call]);

  useEffect(() => {
    if (canManage) loadHealth();
  }, [canManage, loadHealth]);

  const loadAudit = async () => {
    setAuditBusy(true);
    setError("");
    try {
      setAudit(await call("/api/admin/drive?action=audit"));
    } catch (e) {
      setError(e.message);
    } finally {
      setAuditBusy(false);
    }
  };

  const loadPlan = async () => {
    setPlanBusy(true);
    setError("");
    try {
      setPlan(await call("/api/admin/drive?action=plan"));
    } catch (e) {
      setError(e.message);
    } finally {
      setPlanBusy(false);
    }
  };

  // ย้ายจริง — เรียกเป็นชุดจนกว่า done เพราะ serverless มีเพดานเวลา 60 วินาที
  const runMove = async () => {
    const okToRun = await confirmAction(
      "ย้ายไฟล์และโฟลเดอร์บน Google Drive เข้าโครงใหม่ตอนนี้?",
      { detail: "การย้ายเปลี่ยนแค่ที่อยู่ของโฟลเดอร์ — id ไฟล์ไม่เปลี่ยน ลิงก์เดิมในระบบยังใช้ได้ทั้งหมด และกดซ้ำได้ถ้าค้างกลางทาง" },
    );
    if (!okToRun) return;

    setError("");
    setLog([]);
    let offset = 0;
    let moved = 0;
    let skipped = 0;
    const errors = [];
    try {
      let more = true;
      while (more) {
        const res = await call("/api/admin/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restructure", offset, limit: 40 }),
        });
        moved += res.moved;
        skipped += res.skipped;
        errors.push(...(res.errors || []));
        setLog((prev) => [...prev, ...(res.log || [])]);
        setMoving({ done: res.nextOffset, total: res.total, moved, skipped });
        more = !res.done;
        offset = res.nextOffset;
      }
      notifyToast.success(`จัดโครงเสร็จ — ย้าย ${moved} รายการ · อยู่ที่เดิมถูกต้องแล้ว ${skipped} รายการ`);
      if (errors.length) {
        setError(`มี ${errors.length} รายการที่ย้ายไม่สำเร็จ: ${errors.slice(0, 3).map((e) => `${e.what} (${e.error})`).join(" · ")}`);
      }
      await loadPlan();
    } catch (e) {
      setError(e.message);
    }
  };

  const gate = accessState(role, canManage);
  if (gate === "loading") return <SkeletonRows rows={6} />;
  if (gate === "denied") {
    return (
      <AccessDenied
        icon={<HardDrive size={22} />}
        title="ที่เก็บไฟล์"
        message="เครื่องมือตรวจและจัดโครงที่เก็บไฟล์เปิดให้ผู้ดูแลระบบเท่านั้น"
        back={BACK_TO_SETTINGS}
      />
    );
  }

  return (
    <Workspace hideHeader back={BACK_TO_SETTINGS}>
      <div className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><HardDrive size={22} /></span> ที่เก็บไฟล์ (Google Drive)</h1>
          <p>ไฟล์แนบทั้งระบบเก็บบน Shared Drive ของบริษัท — หน้านี้ใช้ตรวจว่าท่อยังดีอยู่ และจัดโครงโฟลเดอร์</p>
        </div>
      </div>

      {error ? <StatusNotice tone="error" title="มีปัญหา">{error}</StatusNotice> : null}

      {/* ── 1. การเชื่อมต่อ ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>การเชื่อมต่อ</h2>
            <p className={styles.sectionDesc}>
              ยืนยันตัวตนด้วย Workload Identity Federation (ไม่มีไฟล์กุญแจให้หลุด) — ทำงานได้เฉพาะตอนรันบน Vercel
            </p>
          </div>
          <div className={styles.actions}>
            <Button onClick={() => loadHealth()} disabled={healthBusy} icon={<RefreshCw size={15} />}>
              ตรวจอีกครั้ง
            </Button>
            <Button tone="primary" onClick={() => loadHealth({ write: true })} disabled={healthBusy} icon={<PlayCircle size={15} />}>
              ทดสอบเขียนไฟล์จริง
            </Button>
          </div>
        </div>

        {healthBusy && !health ? <SkeletonRows rows={4} /> : null}
        {health ? (
          <ul className={styles.steps}>
            {health.steps.map((s) => (
              <li key={s.key} className={`${styles.step} ${s.ok ? styles.stepOk : styles.stepFail}`}>
                <span className={styles.stepIcon}>
                  {s.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                </span>
                <div className={styles.stepBody}>
                  <div className={styles.stepLabel}>{s.label}</div>
                  <div className={styles.stepDetail}>{s.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* ── 2. ไฟล์แนบทั้งระบบ ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>ไฟล์แนบทั้งระบบ</h2>
            <p className={styles.sectionDesc}>
              ไล่ทุกแถวที่อ้างไฟล์บน Drive (เอกสารแนบ + ไฟล์ในเธรด) ว่าไฟล์ยังอยู่จริงไหม
            </p>
          </div>
          <Button onClick={loadAudit} disabled={auditBusy} icon={<FileSearch size={15} />}>
            {auditBusy ? "กำลังตรวจ..." : "ตรวจไฟล์ทั้งระบบ"}
          </Button>
        </div>

        {audit ? (
          <>
            <p className={styles.progress}>
              ตรวจ {audit.total} รายการ · ปกติ {audit.summary.ok || 0}
              {Object.entries(audit.summary)
                .filter(([k]) => k !== "ok")
                .map(([k, v]) => ` · ${FILE_STATUS[k] || k} ${v}`)}
            </p>
            {audit.problems.length ? (
              <div className={styles.planGrid}>
                {audit.problems.map((p) => (
                  <div key={`${p.source}-${p.rowId}`} className={styles.planRow}>
                    <span className={styles.planPath}>
                      {p.fileName || "(ไม่มีชื่อไฟล์)"}
                      <span className={styles.planMeta}>{p.entityType} · {p.entityId}{p.detail ? ` · ${p.detail}` : ""}</span>
                    </span>
                    <span className={styles.planCount}>{FILE_STATUS[p.status] || p.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <StatusNotice tone="success" title="ไฟล์ครบทุกใบ">
                ทุกแถวชี้ไปที่ไฟล์ที่เปิดได้จริงบน Drive
              </StatusNotice>
            )}
          </>
        ) : null}
      </section>

      {/* ── 3. จัดโครงโฟลเดอร์ ── */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>จัดโครงโฟลเดอร์</h2>
            <p className={styles.sectionDesc}>
              จัดของเข้าโครง ลูกค้า / ขอราคา / งานบริหาร / งานขาย — ดูแผนก่อนได้ ไม่มีอะไรเปลี่ยนจนกว่าจะกดย้าย
            </p>
          </div>
          <div className={styles.actions}>
            <Button onClick={loadPlan} disabled={planBusy} icon={<FolderTree size={15} />}>
              {planBusy ? "กำลังคำนวณ..." : "ดูแผนการย้าย"}
            </Button>
            <Button tone="accent" onClick={runMove} disabled={!plan || planBusy}>
              ย้ายจริง
            </Button>
          </div>
        </div>

        {plan ? (
          <>
            <p className={styles.progress}>
              โฟลเดอร์ลูกค้า {plan.folderMoves.customers} · โฟลเดอร์สินค้า {plan.folderMoves.products} · ไฟล์ {plan.fileCount} รายการ
            </p>
            <div className={styles.planGrid}>
              {plan.targets.map((t) => (
                <div key={t.path} className={styles.planRow}>
                  <span className={styles.planPath}>{t.path}</span>
                  <span className={styles.planCount}>{t.count} ไฟล์</span>
                </div>
              ))}
            </div>
            {plan.failed.length ? (
              <StatusNotice tone="warning" title={`หาโฟลเดอร์ปลายทางไม่ได้ ${plan.failed.length} ไฟล์`}>
                {plan.failed.slice(0, 5).map((f) => `${f.fileName || f.rowId} (${f.error})`).join(" · ")}
              </StatusNotice>
            ) : null}
          </>
        ) : null}

        {moving ? (
          <p className={styles.progress}>
            ความคืบหน้า {moving.done}/{moving.total} — ย้ายแล้ว {moving.moved} · อยู่ถูกที่แล้ว {moving.skipped}
          </p>
        ) : null}

        {log.length ? (
          <div className={styles.logBox}>
            {log.map((line, i) => (
              <div key={i} className={styles.logLine}>{line}</div>
            ))}
          </div>
        ) : null}
      </section>
    </Workspace>
  );
}
