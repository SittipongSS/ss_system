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
  HardDrive, CheckCircle2, XCircle, RefreshCw, FolderTree, FileSearch, PlayCircle, Trash2,
} from "lucide-react";
import { useRole } from "@/lib/roleContext";
import { can } from "@/lib/permissions";
import { accessState } from "@/lib/accessGate";
import AccessDenied from "@/components/ui/AccessDenied";
import Button from "@/components/ui/Button";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusNotice from "@/components/ui/StatusNotice";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import styles from "./page.module.css";


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
  const [orphanRows, setOrphanRows] = useState(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [orphans, setOrphans] = useState(null);
  const [orphanBusy, setOrphanBusy] = useState(false);
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

  const loadOrphanRows = async () => {
    setRowBusy(true);
    setError("");
    try {
      setOrphanRows(await call("/api/admin/drive?action=orphan-rows"));
    } catch (e) {
      setError(e.message);
    } finally {
      setRowBusy(false);
    }
  };

  // ลบแถวกำพร้าออกจากฐานข้อมูล — ไฟล์บน Drive ไม่ถูกแตะ (ตัดสินใจแยกที่หัวข้อถัดไป)
  const purgeOrphanRows = async () => {
    const count = orphanRows?.orphanCount || 0;
    if (!count) return;
    const okToRun = await confirmAction(
      `ลบแถวไฟล์แนบกำพร้า ${count} แถวออกจากฐานข้อมูล?`,
      {
        detail: "แถวเหล่านี้ชี้ไปยังระเบียนที่ถูกลบไปแล้ว จึงไม่มีหน้าไหนแสดงอยู่ · ไฟล์บน Google Drive จะยังอยู่ครบ ไม่ถูกแตะ",
        danger: true,
        confirmLabel: "ลบแถวกำพร้า",
      },
    );
    if (!okToRun) return;

    setRowBusy(true);
    setError("");
    try {
      const res = await call("/api/admin/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge-orphan-rows" }),
      });
      notifyToast.success(`ลบแถวกำพร้าแล้ว ${res.deleted} แถว`);
      await loadOrphanRows();
    } catch (e) {
      setError(e.message);
    } finally {
      setRowBusy(false);
    }
  };

  const loadOrphans = async () => {
    setOrphanBusy(true);
    setError("");
    try {
      setOrphans(await call("/api/admin/drive?action=orphans"));
    } catch (e) {
      setError(e.message);
    } finally {
      setOrphanBusy(false);
    }
  };

  // ทิ้งของกำพร้า — ถังขยะของ Shared Drive เก็บให้ 30 วัน จึงกู้คืนได้ถ้าพลาด
  const trashOrphans = async () => {
    const list = orphans?.orphans || [];
    if (!list.length) return;
    const okToRun = await confirmAction(
      `ทิ้ง ${list.length} รายการที่ไม่มีใครอ้างถึงลงถังขยะ?`,
      {
        detail: "ของจะไปอยู่ในถังขยะของ Shared Drive ซึ่งกู้คืนได้ภายใน 30 วัน — ไม่ใช่การลบถาวร",
        danger: true,
        confirmLabel: "ทิ้งลงถังขยะ",
      },
    );
    if (!okToRun) return;

    setOrphanBusy(true);
    setError("");
    try {
      const res = await call("/api/admin/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trash-orphans", ids: list.map((o) => o.id) }),
      });
      notifyToast.success(`ทิ้งลงถังขยะแล้ว ${res.trashed} รายการ`);
      if (res.errors?.length) {
        setError(`ทิ้งไม่สำเร็จ ${res.errors.length} รายการ: ${res.errors.slice(0, 3).map((e) => `${e.what} (${e.error})`).join(" · ")}`);
      }
      await loadOrphans();
    } catch (e) {
      setError(e.message);
    } finally {
      setOrphanBusy(false);
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
          body: JSON.stringify({ action: "restructure", offset, limit: 25 }),
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
      />
    );
  }

  return (
    <Workspace
      icon={<HardDrive size={22} />}
      title="ที่เก็บไฟล์ (Google Drive)"
      subtitle="ไฟล์แนบทั้งระบบเก็บบน Shared Drive ของบริษัท — หน้านี้ใช้ตรวจว่าท่อยังดีอยู่ และจัดโครงโฟลเดอร์"
    >
      {/* ⚠️ ระยะห่างระหว่างก้อนมาจากตัวห่อ `flex flex-col gap-4` — `.ui-section`
          ไม่มี margin ของตัวเอง (กติกาเดียวกับหน้า RD / ใบสั่งขาย / โครงการ) */}
      <div className="flex flex-col gap-4">
      {error ? <StatusNotice tone="error" title="มีปัญหา">{error}</StatusNotice> : null}

      {/* ── 1. การเชื่อมต่อ ── */}
      <WorkspaceSection
        title="การเชื่อมต่อ"
        subtitle="ยืนยันตัวตนด้วย Workload Identity Federation (ไม่มีไฟล์กุญแจให้หลุด) — ทำงานได้เฉพาะตอนรันบน Vercel"
        actions={(
          <>
            <Button onClick={() => loadHealth()} disabled={healthBusy} icon={<RefreshCw size={15} />}>
              ตรวจอีกครั้ง
            </Button>
            <Button tone="primary" onClick={() => loadHealth({ write: true })} disabled={healthBusy} icon={<PlayCircle size={15} />}>
              ทดสอบเขียนไฟล์จริง
            </Button>
          </>
        )}
      >
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
      </WorkspaceSection>

      {/* ── 2. ไฟล์แนบทั้งระบบ ── */}
      <WorkspaceSection
        title="ไฟล์แนบทั้งระบบ"
        subtitle="ไล่ทุกแถวที่อ้างไฟล์บน Drive (เอกสารแนบ + ไฟล์ในเธรด) ว่าไฟล์ยังอยู่จริงไหม"
        actions={(
          <>
            <Button onClick={loadAudit} disabled={auditBusy} icon={<FileSearch size={15} />}>
              {auditBusy ? "กำลังตรวจ..." : "ตรวจไฟล์ทั้งระบบ"}
            </Button>
          </>
        )}
      >
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
      </WorkspaceSection>

      {/* ── 2.2 แถวที่ระเบียนแม่ถูกลบไปแล้ว ── */}
      <WorkspaceSection
        title="แถวไฟล์แนบที่ระเบียนแม่ถูกลบไปแล้ว"
        subtitle="แถวที่ชี้ไปยังทะเบียน/ใบยื่น/ใบขอราคาที่ไม่มีอยู่ในระบบแล้ว — มองไม่เห็นจากหน้าไหน เพราะไม่มีหน้าแม่ให้เปิด และทำให้รายงานด้านบนอ่านแล้วเข้าใจผิด"
        actions={(
          <>
            <Button onClick={loadOrphanRows} disabled={rowBusy} icon={<FileSearch size={15} />}>
              {rowBusy ? "กำลังตรวจ..." : "ตรวจแถวกำพร้า"}
            </Button>
            {orphanRows?.orphanCount ? (
            <Button tone="danger" onClick={purgeOrphanRows} disabled={rowBusy} icon={<Trash2 size={15} />}>
              ลบ {orphanRows.orphanCount} แถว
            </Button>
            ) : null}
          </>
        )}
      >
        {orphanRows ? (
          <>
            <p className={styles.progress}>
              ไฟล์แนบทั้งหมด {orphanRows.total} แถว · แม่ถูกลบแล้ว {orphanRows.orphanCount}
              {Object.entries(orphanRows.byType).map(([k, v]) => ` · ${k} ${v}`)}
              {orphanRows.unknownTypes?.length ? ` · ข้ามชนิดที่ยังไม่รู้จัก: ${orphanRows.unknownTypes.join(", ")}` : ""}
            </p>
            {orphanRows.orphanCount ? (
              <StatusNotice tone="warning" title="ลบแถวไม่กระทบไฟล์บน Drive">
                ไฟล์ {orphanRows.withDriveFile} ใบที่แถวเหล่านี้ชี้ถึงจะยังอยู่บนไดรฟ์ตามเดิม —
                ไปตรวจและตัดสินใจต่อได้ที่หัวข้อ &quot;ของบน Drive ที่ไม่มีใครอ้างถึง&quot; ด้านล่าง
              </StatusNotice>
            ) : (
              <StatusNotice tone="success" title="ไม่มีแถวกำพร้า">
                ทุกแถวไฟล์แนบมีระเบียนแม่อยู่จริง
              </StatusNotice>
            )}
          </>
        ) : null}
      </WorkspaceSection>

      {/* ── 2.5 ของบน Drive ที่ไม่มีใครอ้างถึง ── */}
      <WorkspaceSection
        title="ของบน Drive ที่ไม่มีใครอ้างถึง"
        subtitle="ตรวจทางกลับ: ไล่ของจริงบนไดรฟ์ว่ามีแถวไหนในระบบชี้มาไหม — นับผู้อ้างอิงครบทุกทาง (เอกสารแนบ · เอกสาร Google ของงานบริหาร · ไฟล์ในเธรด · หลักฐาน Won · โฟลเดอร์ลูกค้า/สินค้า)"
        actions={(
          <>
            <Button onClick={loadOrphans} disabled={orphanBusy} icon={<FileSearch size={15} />}>
              {orphanBusy ? "กำลังตรวจ..." : "ตรวจของกำพร้า"}
            </Button>
            {orphans?.orphans?.length ? (
            <Button tone="danger" onClick={trashOrphans} disabled={orphanBusy} icon={<Trash2 size={15} />}>
              ทิ้งลงถังขยะ {orphans.orphans.length} รายการ
            </Button>
            ) : null}
          </>
        )}
      >
        {orphans ? (
          <>
            <p className={styles.progress}>
              ไล่ของบนไดรฟ์ {orphans.scanned} รายการ · มีคนอ้างถึง {orphans.referenced} · ไม่มีใครอ้าง {orphans.orphans.length}
              {orphans.orphanBytes ? ` (${(orphans.orphanBytes / 1048576).toFixed(1)} MB)` : ""}
            </p>
            {orphans.orphans.length ? (
              <div className={styles.planGrid}>
                {orphans.orphans.map((o) => (
                  <div key={o.id} className={styles.planRow}>
                    <span className={styles.planPath}>
                      {o.name}
                      <span className={styles.planMeta}>{o.path}</span>
                    </span>
                    <span className={styles.planCount}>
                      {o.kind}{o.sizeBytes ? ` · ${(o.sizeBytes / 1024).toFixed(0)} KB` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <StatusNotice tone="success" title="ไม่มีของกำพร้า">
                ทุกไฟล์และโฟลเดอร์บนไดรฟ์มีที่มาที่ไปในระบบครบ
              </StatusNotice>
            )}
          </>
        ) : null}
      </WorkspaceSection>

      {/* ── 3. จัดโครงโฟลเดอร์ ── */}
      <WorkspaceSection
        title="จัดโครงโฟลเดอร์"
        subtitle="จัดของเข้าโครง ลูกค้า / ขอราคา / งานบริหาร / งานขาย — ดูแผนก่อนได้ ไม่มีอะไรเปลี่ยนจนกว่าจะกดย้าย"
        actions={(
          <>
            <Button onClick={loadPlan} disabled={planBusy} icon={<FolderTree size={15} />}>
              {planBusy ? "กำลังคำนวณ..." : "ดูแผนการย้าย"}
            </Button>
            <Button tone="accent" onClick={runMove} disabled={!plan || planBusy}>
              ย้ายจริง
            </Button>
          </>
        )}
      >
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
      </WorkspaceSection>
      </div>
    </Workspace>
  );
}
