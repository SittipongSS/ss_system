"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Archive, ChevronLeft, Edit3, Eye, FileBadge2, FilePlus2, Send } from "lucide-react";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import { useRole } from "@/lib/roleContext";
import { canManageDocumentStandards } from "@/lib/permissions";
import {
  DOCUMENT_ACCENT_KEYS,
  DOCUMENT_ACCENT_LABELS,
  DOCUMENT_STANDARD_KEYS,
  DOCUMENT_STANDARD_LABELS,
  documentStandardStatusLabel,
  hasDocumentStandardChangeNote,
  numberingPatternExample,
} from "@/lib/documentStandards";
import base from "../company/page.module.css";
import styles from "./page.module.css";

const EMPTY_FORM = {
  titleTh: "",
  titleEn: "",
  formCode: "",
  revision: "00",
  effectiveDate: "",
  accentKey: "terracotta",
  numberingPattern: "",
  changeNote: "",
};

const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "UTC" });
const formatDateTime = (value) => value ? dateTime.format(new Date(value)) : "-";
const formatEffectiveDate = (value) => value ? dateOnly.format(new Date(`${value}T00:00:00Z`)) : "-";
const actorOf = (row) => row?.publishedByName || row?.archivedByName || row?.updatedByName || row?.createdByName || "ระบบ";
const statusClass = (status) => status === "published" ? base.published : status === "draft" ? base.draft : base.archived;

function StatusBadge({ status }) {
  return <span className={`${base.badge} ${statusClass(status)}`}>{documentStandardStatusLabel(status)}</span>;
}

function versionForm(row) {
  return Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, row?.[key] ?? EMPTY_FORM[key]]));
}

function AccentMark({ accentKey, label = true }) {
  return (
    <span className={styles.accentMark}>
      <span className={`${styles.swatch} ${styles[accentKey] || styles.terracotta}`} aria-hidden="true" />
      {label && <span>{DOCUMENT_ACCENT_LABELS[accentKey] || accentKey}</span>}
    </span>
  );
}

function StandardPreview({ row, compact = false }) {
  if (!row) return null;
  return (
    <div className={`${styles.preview} ${styles[row.accentKey] || styles.terracotta} ${compact ? styles.previewCompact : ""}`.trim()}>
      <div className={styles.previewTop}>
        <span>Scent &amp; Sense</span>
        <span>{row.formCode} · Rev.{row.revision}</span>
      </div>
      <strong>{row.titleTh}</strong>
      <small>{row.titleEn || "-"}</small>
      <div className={styles.previewNumber}>{numberingPatternExample(row.numberingPattern, "0")}</div>
      <div className={styles.previewFoot}>มีผล {formatEffectiveDate(row.effectiveDate)}</div>
    </div>
  );
}

function DocumentStandardFields({ form, setForm }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <>
      <section className={base.formSection}>
        <h4>ตัวตนของเอกสารควบคุม</h4>
        <div className={base.formGrid}>
          <label className={base.full}>ชื่อเอกสารภาษาไทย <b>*</b><input className="premium-input" value={form.titleTh} onChange={(event) => update("titleTh", event.target.value)} required maxLength={150} /></label>
          <label className={base.full}>ชื่อเอกสารภาษาอังกฤษ<input className="premium-input" value={form.titleEn} onChange={(event) => update("titleEn", event.target.value)} maxLength={150} /></label>
          <label>รหัสแบบฟอร์ม <b>*</b><input className="premium-input mono" value={form.formCode} onChange={(event) => update("formCode", event.target.value)} required maxLength={40} placeholder="FM-SA-01" /></label>
          <label>Revision <b>*</b><input className="premium-input mono" value={form.revision} onChange={(event) => update("revision", event.target.value)} required maxLength={20} placeholder="00" /></label>
          <label>วันที่มีผล <b>*</b><input className="premium-input" type="date" value={form.effectiveDate} onChange={(event) => update("effectiveDate", event.target.value)} required /></label>
          <label>สี Accent <b>*</b><select className="premium-select" value={form.accentKey} onChange={(event) => update("accentKey", event.target.value)}>{DOCUMENT_ACCENT_KEYS.map((key) => <option key={key} value={key}>{DOCUMENT_ACCENT_LABELS[key]}</option>)}</select></label>
        </div>
      </section>
      <section className={base.formSection}>
        <h4>รูปแบบเลขที่เอกสาร</h4>
        <label>Numbering pattern <b>*</b><input className="premium-input mono" value={form.numberingPattern} onChange={(event) => update("numberingPattern", event.target.value)} required maxLength={120} placeholder="QT-{YY}{MM}{RUNNING:4}-{REVISION}" /></label>
        <p className={styles.fieldHelp}>Token ที่รองรับ: {"{YY}"}, {"{YYYY}"}, {"{MM}"}, {"{DD}"}, {"{RUNNING:3/4/5}"} และ {"{REVISION}"} · {"{REVISION}"} คือฉบับแก้ไขของเลขที่เอกสาร ไม่ใช่ Revision ของรหัสแบบฟอร์ม · รอบนี้ใช้เพื่อกำหนดมาตรฐานและ Preview ยังไม่เปลี่ยนระบบออกเลข Production</p>
        <div className={styles.numberExample}><span>ตัวอย่าง</span><strong className="mono">{numberingPatternExample(form.numberingPattern, "0") || "-"}</strong></div>
      </section>
      <section className={base.formSection}>
        <h4>หลักฐานการเปลี่ยนแปลง</h4>
        <label>หมายเหตุการเปลี่ยนแปลง <b>*</b><textarea className="premium-input" value={form.changeNote} onChange={(event) => update("changeNote", event.target.value)} required maxLength={500} placeholder="ระบุเหตุผลหรือรายการมาตรฐานที่เปลี่ยน" /></label>
      </section>
    </>
  );
}

export default function DocumentStandardsPage() {
  const role = useRole();
  const canManage = canManageDocumentStandards(role);
  const [standards, setStandards] = useState([]);
  const [selectedKey, setSelectedKey] = useState(DOCUMENT_STANDARD_KEYS[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const selectedStandard = useMemo(
    () => standards.find((standard) => standard.documentKey === selectedKey) || null,
    [selectedKey, standards],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/document-standards", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดมาตรฐานเอกสารไม่สำเร็จ");
      setStandards(Array.isArray(payload.standards) ? payload.standards : []);
    } catch (loadError) {
      setError(loadError.message || "โหลดมาตรฐานเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  const request = async (url, options, fallback) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || fallback);
    return payload;
  };

  const openView = (row) => setDrawer({ mode: "view", row });
  const openEdit = (row = selectedStandard?.draft) => {
    if (!row) return;
    setForm(versionForm(row));
    setDrawer({ mode: "edit", row });
  };

  const createDraft = async () => {
    setBusy(true);
    try {
      const draft = await request(`/api/document-standards/${selectedKey}/draft`, { method: "POST" }, "สร้างฉบับร่างไม่สำเร็จ");
      setToast({ kind: "success", msg: `สร้าง ${DOCUMENT_STANDARD_LABELS[selectedKey]} Version ${draft.versionNumber} ฉบับร่างแล้ว` });
      await load();
      openEdit(draft);
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (event) => {
    event.preventDefault();
    const row = drawer?.row;
    if (!row) return;
    setBusy(true);
    try {
      const saved = await request(`/api/document-standards/draft/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, expectedUpdatedAt: row.updatedAt }),
      }, "บันทึกฉบับร่างไม่สำเร็จ");
      setDrawer(null);
      setToast({ kind: "success", msg: `บันทึก ${saved.formCode} Version ${saved.versionNumber} แล้ว` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  const transitionDraft = async () => {
    const row = selectedStandard?.draft;
    if (!row || !confirm) return;
    const action = confirm.action;
    setBusy(true);
    try {
      await request(`/api/document-standards/draft/${row.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: row.updatedAt }),
      }, action === "publish" ? "เผยแพร่มาตรฐานเอกสารไม่สำเร็จ" : "เก็บฉบับร่างไม่สำเร็จ");
      setConfirm(null);
      setDrawer(null);
      setToast({ kind: "success", msg: action === "publish" ? `เผยแพร่ Version ${row.versionNumber} แล้ว` : `เก็บ Version ${row.versionNumber} เป็นประวัติแล้ว` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) return null;

  const selected = drawer?.row;
  const editing = drawer?.mode === "edit";
  const published = selectedStandard?.published;
  const draft = selectedStandard?.draft;
  const versions = selectedStandard?.versions || [];

  return (
    <>
      <header className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><FileBadge2 size={22} /></span> มาตรฐานเอกสาร</h1>
          <p>ควบคุมรหัสแบบฟอร์ม Revision วันที่มีผล สี Accent และรูปแบบเลขที่โดยไม่เปลี่ยนเอกสารย้อนหลัง</p>
        </div>
        <div className={base.headerActions}>
          <Link className="btn ghost" href="/settings"><ChevronLeft size={16} /> กลับหน้าตั้งค่า</Link>
          {!loading && !error && published && !draft && (
            <button type="button" className="btn btn-accent" onClick={createDraft} disabled={busy}><FilePlus2 size={16} /> สร้างฉบับร่าง</button>
          )}
        </div>
      </header>

      <div className={styles.standardSelector} role="group" aria-label="เลือกชนิดเอกสาร">
        {DOCUMENT_STANDARD_KEYS.map((key) => {
          const standard = standards.find((item) => item.documentKey === key);
          return (
            <button key={key} type="button" className={`${styles.standardTab} ${selectedKey === key ? styles.active : ""}`.trim()} aria-pressed={selectedKey === key} onClick={() => { setSelectedKey(key); setDrawer(null); }} disabled={loading}>
              <span>{DOCUMENT_STANDARD_LABELS[key]}</span>
              <small>{standard?.published?.formCode || "กำลังโหลด…"}</small>
            </button>
          );
        })}
      </div>

      {loading ? <SkeletonRows rows={7} /> : error ? (
        <section className={`glass-panel ${base.errorPanel}`} role="alert"><div><AlertTriangle size={28} aria-hidden="true" /><p>{error}</p><button type="button" className="btn" onClick={load}>ลองอีกครั้ง</button></div></section>
      ) : !published ? (
        <EmptyState icon={FileBadge2}>ยังไม่มีมาตรฐานเอกสารเวอร์ชันที่เผยแพร่</EmptyState>
      ) : (
        <div className={base.layout}>
          <section className={`glass-panel ${base.publishedPanel} ${styles.publishedPanel}`} aria-labelledby="published-standard-title">
            <div className={base.identity}>
              <span className={base.eyebrow}>VERSION {published.versionNumber} · ใช้งานอยู่</span>
              <h2 id="published-standard-title">{published.titleTh}</h2>
              <p className={base.english}>{published.titleEn || "-"}</p>
              <AccentMark accentKey={published.accentKey} />
            </div>
            <div className={base.metaGrid}>
              <div><span>รหัสแบบฟอร์ม</span><strong className="mono">{published.formCode}</strong></div>
              <div><span>Revision</span><strong className="mono">{published.revision}</strong></div>
              <div><span>วันที่มีผล</span><strong>{formatEffectiveDate(published.effectiveDate)}</strong></div>
              <div><span>เลขที่ตัวอย่าง</span><strong className="mono">{numberingPatternExample(published.numberingPattern, "0")}</strong></div>
              <div className={base.full}><span>เผยแพร่เมื่อ</span><strong>{formatDateTime(published.publishedAt)}</strong></div>
            </div>
            <StandardPreview row={published} compact />
          </section>

          {draft && (
            <section className={`glass-panel ${base.draftPanel}`} aria-label="ฉบับร่างที่กำลังแก้ไข">
              <Edit3 size={20} aria-hidden="true" />
              <div className={base.draftCopy}><strong>Version {draft.versionNumber} กำลังเป็นฉบับร่าง</strong><p>บันทึกล่าสุด {formatDateTime(draft.updatedAt)} · ยังไม่มีผลจนกว่าจะยืนยันเผยแพร่</p></div>
              <div className={base.draftActions}>
                <button type="button" className="btn ghost" onClick={() => setConfirm({ action: "archive" })} disabled={busy}><Archive size={15} /> เก็บฉบับร่าง</button>
                <button type="button" className="btn" onClick={() => setConfirm({ action: "publish" })} disabled={busy || !hasDocumentStandardChangeNote(draft)} title={!hasDocumentStandardChangeNote(draft) ? "บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่" : undefined}><Send size={15} /> เผยแพร่</button>
                <button type="button" className="btn btn-accent" onClick={() => openEdit()} disabled={busy}><Edit3 size={15} /> แก้ไขฉบับร่าง</button>
              </div>
            </section>
          )}

          <section className={`glass-panel ${base.historyPanel}`} aria-labelledby="version-history-title">
            <header className={base.panelHeader}><h2 id="version-history-title">ประวัติเวอร์ชัน · {DOCUMENT_STANDARD_LABELS[selectedKey]}</h2><p>Published และ Archived เป็นหลักฐานถาวรและแก้ไขไม่ได้</p></header>
            <div className={`premium-table-wrapper ${base.historyTable}`}>
              <table className="premium-table"><thead><tr><th>Version</th><th>สถานะ</th><th>แบบฟอร์ม</th><th>Accent</th><th>หมายเหตุ</th><th>ผู้ดำเนินการ</th><th>วันที่</th><th aria-label="การทำงาน" /></tr></thead><tbody>
                {versions.map((row) => <tr key={row.id}><td><strong>Version {row.versionNumber}</strong><small>{row.id}</small></td><td><StatusBadge status={row.status} /></td><td><span className="mono">{row.formCode}</span><small>Rev.{row.revision}</small></td><td><AccentMark accentKey={row.accentKey} label={false} /></td><td>{row.changeNote || "-"}</td><td>{actorOf(row)}</td><td>{formatDateTime(row.publishedAt || row.archivedAt || row.updatedAt)}</td><td><button type="button" className="btn ghost sm" onClick={() => openView(row)}><Eye size={14} /> ดูรายละเอียด</button></td></tr>)}
              </tbody></table>
            </div>
            <div className={base.historyCards}>{versions.map((row) => <article key={row.id} className={base.card}><div className={base.cardHead}><strong>Version {row.versionNumber} · {row.formCode}</strong><StatusBadge status={row.status} /></div><p>{row.changeNote || "ไม่มีหมายเหตุ"}</p><small>{actorOf(row)} · {formatDateTime(row.publishedAt || row.archivedAt || row.updatedAt)}</small><button type="button" className="btn ghost" onClick={() => openView(row)}><Eye size={15} /> ดูรายละเอียด</button></article>)}</div>
          </section>
        </div>
      )}

      <RecordDrawer open={!!drawer} onClose={() => !busy && setDrawer(null)} closeOnOverlay={false} title={editing ? `แก้ไข Version ${selected?.versionNumber}` : `${selected?.titleTh || "มาตรฐานเอกสาร"} Version ${selected?.versionNumber || "-"}`} subtitle={editing ? "บันทึกฉบับร่างก่อนเผยแพร่ ไม่มี Auto-save" : "เวอร์ชันที่เผยแพร่หรือเก็บถาวรจะแก้ไขไม่ได้"} badge={selected ? <StatusBadge status={selected.status} /> : null} footer={editing ? <><button type="button" className="btn ghost" onClick={() => setDrawer(null)} disabled={busy}>ยกเลิก</button><button type="submit" form="document-standard-form" className="btn btn-accent" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}</button></> : <button type="button" className="btn" onClick={() => setDrawer(null)}>ปิด</button>}>
        {editing ? (
          <form id="document-standard-form" className={base.form} onSubmit={saveDraft}>
            <p className={base.note}>การบันทึกเปลี่ยนเฉพาะฉบับร่าง ส่วน Production Print ยังใช้ค่าปัจจุบันจนถึง Phase 7</p>
            <StandardPreview row={form} compact />
            <DocumentStandardFields form={form} setForm={setForm} />
          </form>
        ) : selected ? (
          <div className={base.drawerBody}>
            <StandardPreview row={selected} />
            <section className={base.drawerSection}><h4>ตัวตนของเอกสารควบคุม</h4><div className={base.detailGrid}><div className={base.full}><span>ชื่อภาษาไทย</span><strong>{selected.titleTh}</strong></div><div className={base.full}><span>ชื่อภาษาอังกฤษ</span><strong>{selected.titleEn || "-"}</strong></div><div><span>รหัสแบบฟอร์ม</span><strong className="mono">{selected.formCode}</strong></div><div><span>Revision</span><strong className="mono">{selected.revision}</strong></div><div><span>วันที่มีผล</span><strong>{formatEffectiveDate(selected.effectiveDate)}</strong></div><div><span>สี Accent</span><strong><AccentMark accentKey={selected.accentKey} /></strong></div></div></section>
            <section className={base.drawerSection}><h4>เลขที่เอกสาร</h4><div className={base.detailGrid}><div className={base.full}><span>Numbering pattern</span><strong className="mono">{selected.numberingPattern}</strong></div><div className={base.full}><span>ตัวอย่าง</span><strong className="mono">{numberingPatternExample(selected.numberingPattern, "0")}</strong></div></div></section>
            <section className={base.drawerSection}><h4>ประวัติเวอร์ชัน</h4><div className={base.detailGrid}><div className={base.full}><span>หมายเหตุ</span><strong>{selected.changeNote || "-"}</strong></div><div><span>สร้างโดย</span><strong>{selected.createdByName || "ระบบ"}</strong></div><div><span>สร้างเมื่อ</span><strong>{formatDateTime(selected.createdAt)}</strong></div><div><span>ดำเนินการล่าสุดโดย</span><strong>{actorOf(selected)}</strong></div><div><span>เวลาล่าสุด</span><strong>{formatDateTime(selected.publishedAt || selected.archivedAt || selected.updatedAt)}</strong></div></div></section>
          </div>
        ) : null}
      </RecordDrawer>

      <ConfirmDialog open={confirm?.action === "publish"} title="ยืนยันเผยแพร่มาตรฐานเอกสาร" description={`Version ${draft?.versionNumber || "-"} จะเป็นมาตรฐานของ ${DOCUMENT_STANDARD_LABELS[selectedKey]} ที่ใช้งานอยู่`} detail="Published เดิมจะถูกเก็บถาวร แต่ Production Print ยังไม่เปลี่ยนจนถึง Phase 7" confirmLabel="เผยแพร่เวอร์ชัน" busy={busy} onClose={() => setConfirm(null)} onConfirm={transitionDraft} />
      <ConfirmDialog open={confirm?.action === "archive"} title="เก็บฉบับร่างเป็นประวัติ" description={`Version ${draft?.versionNumber || "-"} จะถูกปิดและแก้ไขต่อไม่ได้`} detail="มาตรฐานเวอร์ชันที่เผยแพร่อยู่จะไม่เปลี่ยนแปลง" confirmLabel="เก็บฉบับร่าง" tone="danger" busy={busy} onClose={() => setConfirm(null)} onConfirm={transitionDraft} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
