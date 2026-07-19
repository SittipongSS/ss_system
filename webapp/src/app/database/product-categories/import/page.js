"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, Download, Eye, FileSpreadsheet,
  History, RotateCcw, Tags, Upload,
} from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import Tabs from "@/components/ui/Tabs";
import Select from "@/components/ui/Select";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Toast from "@/components/ui/Toast";
import RecordDrawer from "@/components/excise/RecordDrawer";
import { useRole } from "@/lib/roleContext";
import { canManageProductCategories } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import styles from "./page.module.css";

const ACTION_META = {
  create: { label: "เพิ่มใหม่", tone: "green" },
  update: { label: "แก้ไข", tone: "blue" },
  activate: { label: "เปิดใช้งาน", tone: "green" },
  deactivate: { label: "พักใช้งาน", tone: "amber" },
  unchanged: { label: "ไม่เปลี่ยน", tone: "muted" },
  error: { label: "ข้อมูลผิด", tone: "red" },
  conflict: { label: "ข้อมูลขัดแย้ง", tone: "amber" },
};

const RUN_META = {
  previewed: { label: "รอยืนยัน", tone: "amber" },
  completed: { label: "สำเร็จ", tone: "green" },
  failed: { label: "ไม่สำเร็จ", tone: "red" },
  expired: { label: "หมดอายุ", tone: "muted" },
};

function Badge({ meta }) {
  const value = meta || { label: "ไม่ทราบสถานะ", tone: "muted" };
  return <span className={`${styles.badge} ${styles[value.tone]}`}>{value.label}</span>;
}

const changeCount = (summary = {}) =>
  (summary.create || 0) + (summary.update || 0) + (summary.activate || 0) + (summary.deactivate || 0);

function effectiveRunMeta(run) {
  if (run?.status === "previewed" && run.expiresAt && new Date(run.expiresAt) <= new Date()) {
    return RUN_META.expired;
  }
  return RUN_META[run?.status];
}

export default function ProductCategoryImportPage() {
  const role = useRole();
  const canManage = canManageProductCategories(role);
  const inputRef = useRef(null);
  const [tab, setTab] = useState("import");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [committed, setCommitted] = useState(null);
  const [toast, setToast] = useState(null);
  const [history, setHistory] = useState({ items: [], total: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/product-types/imports?pageSize=50", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดประวัติไม่สำเร็จ");
      setHistory({ items: payload.items || [], total: payload.total || 0 });
    } catch (loadError) {
      setToast({ kind: "error", msg: loadError.message || "โหลดประวัติไม่สำเร็จ" });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { if (canManage) loadHistory(); }, [canManage, loadHistory]);

  const resetImport = () => {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    setError("");
    setFilter("all");
    if (inputRef.current) inputRef.current.value = "";
  };

  const chooseFile = (nextFile) => {
    if (!nextFile) return;
    setFile(nextFile);
    setPreview(null);
    setCommitted(null);
    setError("");
    setFilter("all");
  };

  const inspectFile = async () => {
    if (!file) return;
    setBusy("preview");
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/product-types/import/preview", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ตรวจไฟล์ไม่สำเร็จ");
      setPreview(payload);
      if (!payload.hasChanges && payload.summary?.error === 0 && payload.summary?.conflict === 0) {
        setToast({ kind: "info", msg: "ไฟล์นี้ไม่มีข้อมูลที่เปลี่ยนแปลง" });
      }
    } catch (inspectError) {
      setError(inspectError.message || "ตรวจไฟล์ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const commitImport = async () => {
    if (!preview?.committable) return;
    setBusy("commit");
    setError("");
    try {
      const response = await fetch("/api/product-types/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: preview.runId, fileHash: preview.fileHash }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "นำเข้าข้อมูลไม่สำเร็จ");
      setCommitted(payload);
      setConfirmOpen(false);
      setToast({ kind: "success", msg: `นำเข้าหมวดสินค้าแล้ว ${payload.summary?.applied || 0} รายการ` });
      await loadHistory();
    } catch (commitError) {
      setConfirmOpen(false);
      setError(commitError.message || "นำเข้าข้อมูลไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  };

  const openDetail = async (run) => {
    setDetail({ ...run, rows: null });
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/product-types/imports/${run.id}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดรายละเอียดไม่สำเร็จ");
      setDetail(payload);
    } catch (detailError) {
      setToast({ kind: "error", msg: detailError.message || "โหลดรายละเอียดไม่สำเร็จ" });
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const visibleRows = useMemo(() => {
    const rows = preview?.rows || [];
    if (filter === "changes") return rows.filter((row) => ["create", "update", "activate", "deactivate"].includes(row.action));
    if (filter === "issues") return rows.filter((row) => ["error", "conflict"].includes(row.action));
    if (filter === "unchanged") return rows.filter((row) => row.action === "unchanged");
    return rows;
  }, [filter, preview]);

  if (!role || !canManage) return null;
  const step = committed ? 4 : preview ? 3 : file ? 2 : 1;
  const summary = preview?.summary || {};
  const issueCount = (summary.error || 0) + (summary.conflict || 0);

  return (
    <>
      <Workspace
        icon={<Upload size={22} />}
        title="นำเข้าหมวดสินค้า"
        subtitle="ตรวจ Preview ก่อนยืนยันทุกครั้ง พร้อมประวัติและหลักฐานรายแถว"
        back={{ href: "/database/product-categories", label: "กลับหน้าหมวดสินค้า" }}
        headerRight={(
          <Link prefetch={false} className="btn" href="/api/product-types/template">
            <Download size={16} /> ดาวน์โหลดไฟล์สำหรับนำเข้า
          </Link>
        )}
      >
        <Tabs
          value={tab}
          onChange={setTab}
          ariaLabel="นำเข้าและประวัติหมวดสินค้า"
          tabs={[
            { key: "import", label: "นำเข้าข้อมูล" },
            { key: "history", label: `ประวัติการนำเข้า (${history.total})` },
          ]}
        />

        {tab === "import" ? (
          <div className={styles.importLayout}>
            <ol className={styles.steps} aria-label="ขั้นตอนการนำเข้าข้อมูล">
              {["เลือกไฟล์", "ตรวจไฟล์", "ตรวจ Preview", "นำเข้าสำเร็จ"].map((label, index) => {
                const number = index + 1;
                return (
                  <li key={label} className={`${number === step ? styles.currentStep : ""} ${number < step ? styles.doneStep : ""}`}>
                    <span>{number < step ? <CheckCircle2 size={16} /> : number}</span><strong>{label}</strong>
                  </li>
                );
              })}
            </ol>

            {!preview && !committed && (
              <section className={`glass-panel ${styles.uploadPanel}`}>
                <button
                  type="button"
                  className={styles.dropZone}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]); }}
                >
                  <span className={styles.uploadIcon}><FileSpreadsheet size={28} /></span>
                  <strong>{file ? "เปลี่ยนไฟล์ Excel" : "เลือกหรือวางไฟล์ Excel ที่นี่"}</strong>
                  <small>รับเฉพาะ .xlsx ขนาดไม่เกิน 5 MB</small>
                </button>
                <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(event) => chooseFile(event.target.files?.[0])} />

                {file && (
                  <div className={styles.selectedFile}>
                    <FileSpreadsheet size={20} />
                    <div><strong>{file.name}</strong><small>{(file.size / 1024).toLocaleString("th-TH", { maximumFractionDigits: 1 })} KB</small></div>
                    <button type="button" className="btn ghost" onClick={resetImport}>นำออก</button>
                  </div>
                )}

                {error && <div className={styles.errorBanner}><AlertTriangle size={18} /><span>{error}</span></div>}
                <div className="form-action-bar">
                  <span>ระบบจะยังไม่แก้ข้อมูลจนกว่าคุณจะตรวจ Preview และกดยืนยัน</span>
                  <button type="button" className="btn btn-primary" onClick={inspectFile} disabled={!file || busy === "preview"}>
                    <Eye size={16} /> {busy === "preview" ? "กำลังตรวจไฟล์…" : "ตรวจสอบไฟล์"}
                  </button>
                </div>
              </section>
            )}

            {preview && (
              <section className={`glass-panel ${styles.previewPanel}`}>
                <div className={styles.previewHeading}>
                  <div><h2>ผลการตรวจ Preview</h2><p>{preview.fileName} · หมดอายุ {fmtDateTime(preview.expiresAt)}</p></div>
                  <button type="button" className="btn ghost" onClick={resetImport} disabled={busy === "commit"}><RotateCcw size={15} /> เริ่มใหม่</button>
                </div>

                {committed && (
                  <div className={styles.successBanner}><CheckCircle2 size={20} /><div><strong>นำเข้าข้อมูลสำเร็จ</strong><span>{committed.summary?.applied || 0} รายการถูกบันทึกในรอบนี้</span></div></div>
                )}
                {!committed && issueCount > 0 && (
                  <div className={styles.errorBanner}><AlertTriangle size={18} /><span>พบข้อมูลที่ต้องแก้ {issueCount} แถว ระบบจะไม่อนุญาตให้นำเข้าจนกว่าจะผ่านทั้งหมด</span></div>
                )}

                <div className={styles.summaryGrid} aria-label="สรุปผล Preview">
                  <div><span>ทั้งหมด</span><strong>{summary.total || 0}</strong></div>
                  <div><span>มีการเปลี่ยนแปลง</span><strong>{changeCount(summary)}</strong></div>
                  <div><span>ไม่เปลี่ยน</span><strong>{summary.unchanged || 0}</strong></div>
                  <div className={issueCount ? styles.issueCard : ""}><span>ต้องแก้ไข</span><strong>{issueCount}</strong></div>
                </div>

                <div className={styles.previewToolbar}>
                  <Select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="กรองผล Preview">
                    <option value="all">ทุกผลลัพธ์ ({summary.total || 0})</option>
                    <option value="changes">มีการเปลี่ยนแปลง ({changeCount(summary)})</option>
                    <option value="issues">ต้องแก้ไข ({issueCount})</option>
                    <option value="unchanged">ไม่เปลี่ยน ({summary.unchanged || 0})</option>
                  </Select>
                  <span>{visibleRows.length} แถว</span>
                </div>

                <div className={`premium-table-wrapper ${styles.previewTableWrap}`}>
                  <table className={`premium-table sticky-col1 ${styles.previewTable}`}>
                    <thead><tr><th>แถว</th><th>รหัส</th><th>ผลตรวจ</th><th>ชื่อหมวดหลัก</th><th>ชื่อหมวดสินค้า</th><th>สถานะ</th><th>รายละเอียด</th></tr></thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.code}`}>
                          <td>{row.rowNumber}</td>
                          <td><strong className="mono">{row.code || "—"}</strong></td>
                          <td><Badge meta={ACTION_META[row.action]} /></td>
                          <td>{row.after?.mainCategoryName || "—"}</td>
                          <td><strong>{row.after?.nameTh || row.after?.nameEn || "—"}</strong>{row.after?.nameTh && row.after?.nameEn && <small>{row.after.nameEn}</small>}</td>
                          <td>{row.after?.isActive === false ? "พักใช้งาน" : "ใช้งาน"}</td>
                          <td className={row.errors?.length ? styles.issueText : styles.mutedText}>{row.errors?.join(" · ") || "พร้อม"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {error && <div className={styles.errorBanner}><AlertTriangle size={18} /><span>{error}</span></div>}
                {!committed && (
                  <div className={styles.actionBar}>
                    <span>{preview.committable ? `พร้อมนำเข้า ${changeCount(summary)} รายการ` : issueCount ? `ต้องแก้ไข ${issueCount} แถวก่อนนำเข้า` : "ไม่มีข้อมูลที่เปลี่ยนแปลง"}</span>
                    <div>
                      <button type="button" className="btn ghost" onClick={resetImport}>ยกเลิก</button>
                      <button type="button" className="btn btn-primary" disabled={!preview.committable || busy === "commit"} onClick={() => setConfirmOpen(true)}>
                        <Upload size={16} /> ยืนยันการนำเข้า
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          <HistoryView history={history} loading={historyLoading} onOpen={openDetail} onReload={loadHistory} />
        )}
      </Workspace>

      <ConfirmDialog
        open={confirmOpen}
        title="ยืนยันการนำเข้าหมวดสินค้า"
        description={`ระบบจะบันทึกการเปลี่ยนแปลง ${changeCount(summary)} รายการ`}
        detail="การนำเข้าจะทำทั้งชุดใน transaction เดียว และบันทึกประวัติ Before/After"
        confirmLabel="นำเข้าข้อมูล"
        busy={busy === "commit"}
        onConfirm={commitImport}
        onClose={() => busy !== "commit" && setConfirmOpen(false)}
      />

      <ImportDetailDrawer detail={detail} loading={detailLoading} onClose={() => setDetail(null)} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

function HistoryView({ history, loading, onOpen, onReload }) {
  if (loading) return <SkeletonRows rows={6} />;
  if (!history.items.length) {
    return <EmptyState icon={History} action={{ label: "ตรวจอีกครั้ง", onClick: onReload }}>ยังไม่มีประวัติการนำเข้าหมวดสินค้า</EmptyState>;
  }
  return (
    <section className="glass-panel">
      <div className={styles.historyHeader}><div><h2>ประวัติการนำเข้า</h2><p>เก็บผู้ดำเนินการ ไฟล์ สรุปผล และหลักฐานรายแถว</p></div><button type="button" className="btn ghost" onClick={onReload}>รีเฟรช</button></div>
      <div className={`premium-table-wrapper ${styles.historyTable}`}>
        <table className="premium-table">
          <thead><tr><th>วันที่</th><th>ไฟล์</th><th>ผู้ดำเนินการ</th><th>สรุป</th><th>สถานะ</th><th style={{ textAlign: "right" }}>รายละเอียด</th></tr></thead>
          <tbody>{history.items.map((run) => (
            <tr key={run.id}>
              <td>{fmtDateTime(run.createdAt)}</td><td><strong>{run.fileName}</strong><small>{run.templateVersion}</small></td><td>{run.actorName || "—"}</td>
              <td>{changeCount(run.summary)} เปลี่ยน · {run.summary?.error || 0} ผิด · {run.summary?.conflict || 0} ขัดแย้ง</td>
              <td><Badge meta={effectiveRunMeta(run)} /></td>
              <td style={{ textAlign: "right" }}><button type="button" className="btn ghost sm" onClick={() => onOpen(run)}><Eye size={14} /> ดู</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={styles.historyCards}>{history.items.map((run) => (
        <article key={run.id}><div><strong>{run.fileName}</strong><Badge meta={effectiveRunMeta(run)} /></div><p>{fmtDateTime(run.createdAt)} · {run.actorName || "—"}</p><small>{changeCount(run.summary)} เปลี่ยน · {(run.summary?.error || 0) + (run.summary?.conflict || 0)} ต้องแก้</small><button type="button" className="btn" onClick={() => onOpen(run)}><Eye size={14} /> ดูรายละเอียด</button></article>
      ))}</div>
    </section>
  );
}

function ImportDetailDrawer({ detail, loading, onClose }) {
  const summary = detail?.summary || {};
  return (
    <RecordDrawer
      open={!!detail}
      onClose={onClose}
      closeOnOverlay={false}
      title="รายละเอียดการนำเข้า"
      subtitle={detail ? `${detail.fileName} · ${fmtDateTime(detail.createdAt)}` : ""}
      badge={detail ? <Badge meta={effectiveRunMeta(detail)} /> : null}
      footer={<button type="button" className="btn" onClick={onClose}>ปิด</button>}
    >
      {loading ? <SkeletonRows rows={5} /> : detail && (
        <div className={styles.detailBody}>
          <dl><div><dt>ผู้ดำเนินการ</dt><dd>{detail.actorName || "—"}</dd></div><div><dt>เวอร์ชัน</dt><dd>{detail.templateVersion}</dd></div><div><dt>เพิ่มใหม่</dt><dd>{summary.create || summary.created || 0}</dd></div><div><dt>แก้ไข/สถานะ</dt><dd>{(summary.update || summary.updated || 0) + (summary.activate || summary.activated || 0) + (summary.deactivate || summary.deactivated || 0)}</dd></div></dl>
          <h4>หลักฐานรายแถว</h4>
          <div className={styles.detailRows}>{(detail.rows || []).map((row) => (
            <article key={row.id}><div><strong>{row.mainCategoryCode && row.typeCode ? `${row.mainCategoryCode}-${row.typeCode}` : `แถว ${row.rowNumber}`}</strong><Badge meta={ACTION_META[row.action]} /></div><p>{row.after?.nameTh || row.after?.nameEn || row.errors?.join(" · ") || "ไม่มีรายละเอียด"}</p></article>
          ))}</div>
        </div>
      )}
    </RecordDrawer>
  );
}
