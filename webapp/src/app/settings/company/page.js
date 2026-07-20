"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Building2, Edit3, Eye, FilePlus2, Send } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import RecordDrawer from "@/components/excise/RecordDrawer";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import { useCan } from "@/lib/roleContext";
import { hasPublishableChangeNote, organizationSettingStatusLabel } from "@/lib/organizationSettings";
import styles from "./page.module.css";

const EMPTY_FORM = {
  legalNameTh: "",
  legalNameEn: "",
  taxId: "",
  branchCode: "00000",
  registeredAddressTh: "",
  registeredAddressEn: "",
  phone: "",
  email: "",
  lineId: "",
  website: "",
  changeNote: "",
};

const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (value) => value ? dateTime.format(new Date(value)) : "-";
const actorOf = (row) => row?.publishedByName || row?.archivedByName || row?.updatedByName || row?.createdByName || "ระบบ";
const statusClass = (status) => status === "published" ? styles.published : status === "draft" ? styles.draft : styles.archived;

function StatusBadge({ status }) {
  return <span className={`${styles.badge} ${statusClass(status)}`}>{organizationSettingStatusLabel(status)}</span>;
}

function versionForm(row) {
  return Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, row?.[key] || EMPTY_FORM[key]]));
}

export default function CompanySettingsPage() {
  const canManage = useCan("master:manage");
  const [data, setData] = useState({ published: null, draft: null, versions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/organization-settings", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลบริษัทไม่สำเร็จ");
      setData({ published: payload.published || null, draft: payload.draft || null, versions: payload.versions || [] });
    } catch (loadError) {
      setError(loadError.message || "โหลดข้อมูลบริษัทไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  const publishedContacts = useMemo(() => {
    const row = data.published;
    return [row?.phone, row?.email, row?.lineId, row?.website].filter(Boolean).join(" · ") || "-";
  }, [data.published]);

  const openView = (row) => setDrawer({ mode: "view", row });
  const openEdit = (row = data.draft) => {
    if (!row) return;
    setForm(versionForm(row));
    setDrawer({ mode: "edit", row });
  };

  const request = async (url, options, fallback) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || fallback);
    return payload;
  };

  const createDraft = async () => {
    setBusy(true);
    try {
      const draft = await request("/api/organization-settings/draft", { method: "POST" }, "สร้างฉบับร่างไม่สำเร็จ");
      setToast({ kind: "success", msg: `สร้าง Version ${draft.versionNumber} ฉบับร่างแล้ว` });
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
      const saved = await request(`/api/organization-settings/draft/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, expectedUpdatedAt: row.updatedAt }),
      }, "บันทึกฉบับร่างไม่สำเร็จ");
      setDrawer(null);
      setToast({ kind: "success", msg: `บันทึก Version ${saved.versionNumber} ฉบับร่างแล้ว` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  const transitionDraft = async () => {
    const row = data.draft;
    if (!row || !confirm) return;
    const action = confirm.action;
    setBusy(true);
    try {
      await request(`/api/organization-settings/draft/${row.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: row.updatedAt }),
      }, action === "publish" ? "เผยแพร่ข้อมูลบริษัทไม่สำเร็จ" : "เก็บฉบับร่างไม่สำเร็จ");
      setConfirm(null);
      setDrawer(null);
      setToast({
        kind: "success",
        msg: action === "publish" ? `เผยแพร่ Version ${row.versionNumber} แล้ว` : `เก็บ Version ${row.versionNumber} เป็นประวัติแล้ว`,
      });
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

  return (
    <Workspace
      hideHeader
      back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}
      backActions={!loading && !error && !data.draft ? (
        <button type="button" className="btn btn-accent" onClick={createDraft} disabled={busy}>
          <FilePlus2 size={16} /> สร้างฉบับร่าง
        </button>
      ) : null}
    >
      <header className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><Building2 size={22} /></span> ข้อมูลบริษัท</h1>
          <p>จัดการข้อมูลนิติบุคคลแบบมีเวอร์ชัน การเผยแพร่จะไม่แก้ข้อมูลย้อนหลังของเวอร์ชันเดิม</p>
        </div>
      </header>

      {loading ? <SkeletonRows rows={7} /> : error ? (
        <section className={`glass-panel ${styles.errorPanel}`} role="alert">
          <div>
            <AlertTriangle size={28} aria-hidden="true" />
            <p>{error}</p>
            <button type="button" className="btn" onClick={load}>ลองอีกครั้ง</button>
          </div>
        </section>
      ) : !data.published ? (
        <EmptyState icon={Building2}>ยังไม่มีข้อมูลบริษัทเวอร์ชันที่เผยแพร่</EmptyState>
      ) : (
        <div className={styles.layout}>
          <section className={`glass-panel ${styles.publishedPanel}`} aria-labelledby="published-company-title">
            <div className={styles.identity}>
              <span className={styles.eyebrow}>VERSION {data.published.versionNumber} · ใช้งานอยู่</span>
              <h2 id="published-company-title">{data.published.legalNameTh}</h2>
              {data.published.legalNameEn && <p className={styles.english}>{data.published.legalNameEn}</p>}
              <p className={styles.address}>{data.published.registeredAddressTh}</p>
            </div>
            <div className={styles.metaGrid}>
              <div><span>เลขผู้เสียภาษี</span><strong>{data.published.taxId}</strong></div>
              <div><span>สาขา</span><strong>{data.published.branchCode}</strong></div>
              <div className={styles.full}><span>ช่องทางติดต่อ</span><strong>{publishedContacts}</strong></div>
              <div className={styles.full}><span>เผยแพร่เมื่อ</span><strong>{formatDate(data.published.publishedAt)}</strong></div>
            </div>
          </section>

          {data.draft && (
            <section className={`glass-panel ${styles.draftPanel}`} aria-label="ฉบับร่างที่กำลังแก้ไข">
              <Edit3 size={20} aria-hidden="true" />
              <div className={styles.draftCopy}>
                <strong>Version {data.draft.versionNumber} กำลังเป็นฉบับร่าง</strong>
                <p>บันทึกล่าสุด {formatDate(data.draft.updatedAt)} · ข้อมูลยังไม่มีผลจนกว่าจะยืนยันเผยแพร่</p>
              </div>
              <div className={styles.draftActions}>
                <button type="button" className="btn ghost" onClick={() => setConfirm({ action: "archive" })} disabled={busy}>
                  <Archive size={15} /> เก็บฉบับร่าง
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setConfirm({ action: "publish" })}
                  disabled={busy || !hasPublishableChangeNote(data.draft)}
                  title={!hasPublishableChangeNote(data.draft) ? "บันทึกหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่" : undefined}
                >
                  <Send size={15} /> เผยแพร่
                </button>
                <button type="button" className="btn btn-accent" onClick={() => openEdit()} disabled={busy}>
                  <Edit3 size={15} /> แก้ไขฉบับร่าง
                </button>
              </div>
            </section>
          )}

          <section className={`glass-panel ${styles.historyPanel}`} aria-labelledby="version-history-title">
            <header className={styles.panelHeader}>
              <h2 id="version-history-title">ประวัติเวอร์ชัน</h2>
              <p>Published และ Archived เป็นหลักฐานถาวรและแก้ไขไม่ได้</p>
            </header>
            <div className={`premium-table-wrapper ${styles.historyTable}`}>
              <table className="premium-table">
                <thead><tr><th>Version</th><th>สถานะ</th><th>หมายเหตุ</th><th>ผู้ดำเนินการ</th><th>วันที่</th><th aria-label="การทำงาน" /></tr></thead>
                <tbody>
                  {data.versions.map((row) => (
                    <tr key={row.id}>
                      <td><strong>Version {row.versionNumber}</strong><small>{row.id}</small></td>
                      <td><StatusBadge status={row.status} /></td>
                      <td>{row.changeNote || "-"}</td>
                      <td>{actorOf(row)}</td>
                      <td>{formatDate(row.publishedAt || row.archivedAt || row.updatedAt)}</td>
                      <td><button type="button" className="btn ghost sm" onClick={() => openView(row)}><Eye size={14} /> ดูรายละเอียด</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.historyCards}>
              {data.versions.map((row) => (
                <article key={row.id} className={styles.card}>
                  <div className={styles.cardHead}><strong>Version {row.versionNumber}</strong><StatusBadge status={row.status} /></div>
                  <p>{row.changeNote || "ไม่มีหมายเหตุ"}</p>
                  <small>{actorOf(row)} · {formatDate(row.publishedAt || row.archivedAt || row.updatedAt)}</small>
                  <button type="button" className="btn ghost" onClick={() => openView(row)}><Eye size={15} /> ดูรายละเอียด</button>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      <RecordDrawer
        open={!!drawer}
        onClose={() => !busy && setDrawer(null)}
        closeOnOverlay={false}
        title={editing ? `แก้ไข Version ${selected?.versionNumber}` : `ข้อมูลบริษัท Version ${selected?.versionNumber || "-"}`}
        subtitle={editing ? "บันทึกฉบับร่างก่อนเผยแพร่ ไม่มี Auto-save" : "เวอร์ชันที่เผยแพร่หรือเก็บถาวรจะแก้ไขไม่ได้"}
        badge={selected ? <StatusBadge status={selected.status} /> : null}
        footer={editing ? (
          <>
            <button type="button" className="btn ghost" onClick={() => setDrawer(null)} disabled={busy}>ยกเลิก</button>
            <button type="submit" form="company-settings-form" className="btn btn-accent" disabled={busy}>
              {busy ? "กำลังบันทึก…" : "บันทึกฉบับร่าง"}
            </button>
          </>
        ) : <button type="button" className="btn" onClick={() => setDrawer(null)}>ปิด</button>}
      >
        {editing ? (
          <form id="company-settings-form" className={styles.form} onSubmit={saveDraft}>
            <p className={styles.note}>การบันทึกจะอัปเดตเฉพาะฉบับร่าง ข้อมูลที่ใช้งานอยู่จะไม่เปลี่ยนจนกว่าจะยืนยันเผยแพร่</p>
            <section className={styles.formSection}>
              <h4>ข้อมูลนิติบุคคล</h4>
              <div className={styles.formGrid}>
                <label className={styles.full}>ชื่อนิติบุคคลภาษาไทย <b>*</b><input className="premium-input" value={form.legalNameTh} onChange={(event) => setForm({ ...form, legalNameTh: event.target.value })} required maxLength={200} /></label>
                <label className={styles.full}>ชื่อนิติบุคคลภาษาอังกฤษ<input className="premium-input" value={form.legalNameEn} onChange={(event) => setForm({ ...form, legalNameEn: event.target.value })} maxLength={200} /></label>
                <label>เลขประจำตัวผู้เสียภาษี <b>*</b><input className="premium-input" inputMode="numeric" value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} required maxLength={17} /></label>
                <label>รหัสสาขา <b>*</b><input className="premium-input" inputMode="numeric" value={form.branchCode} onChange={(event) => setForm({ ...form, branchCode: event.target.value })} required maxLength={5} /></label>
              </div>
            </section>
            <section className={styles.formSection}>
              <h4>ที่อยู่จดทะเบียน</h4>
              <div className={styles.formGrid}>
                <label className={styles.full}>ที่อยู่ภาษาไทย <b>*</b><textarea className="premium-input" value={form.registeredAddressTh} onChange={(event) => setForm({ ...form, registeredAddressTh: event.target.value })} required maxLength={1000} /></label>
                <label className={styles.full}>ที่อยู่ภาษาอังกฤษ<textarea className="premium-input" value={form.registeredAddressEn} onChange={(event) => setForm({ ...form, registeredAddressEn: event.target.value })} maxLength={1000} /></label>
              </div>
            </section>
            <section className={styles.formSection}>
              <h4>ช่องทางติดต่อ</h4>
              <div className={styles.formGrid}>
                <label>โทรศัพท์<input className="premium-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={50} /></label>
                <label>อีเมล<input className="premium-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} /></label>
                <label>Line ID<input className="premium-input" value={form.lineId} onChange={(event) => setForm({ ...form, lineId: event.target.value })} maxLength={100} /></label>
                <label>เว็บไซต์<input className="premium-input" value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} maxLength={255} /></label>
              </div>
            </section>
            <section className={styles.formSection}>
              <h4>หลักฐานการเปลี่ยนแปลง</h4>
              <label>หมายเหตุการเปลี่ยนแปลง <b>*</b><textarea className="premium-input" value={form.changeNote} onChange={(event) => setForm({ ...form, changeNote: event.target.value })} required maxLength={500} placeholder="ระบุเหตุผลหรือรายการข้อมูลที่เปลี่ยน" /></label>
            </section>
          </form>
        ) : selected ? (
          <div className={styles.drawerBody}>
            <section className={styles.drawerSection}>
              <h4>ข้อมูลนิติบุคคล</h4>
              <div className={styles.detailGrid}>
                <div className={styles.full}><span>ชื่อภาษาไทย</span><strong>{selected.legalNameTh}</strong></div>
                <div className={styles.full}><span>ชื่อภาษาอังกฤษ</span><strong>{selected.legalNameEn || "-"}</strong></div>
                <div><span>เลขผู้เสียภาษี</span><strong>{selected.taxId}</strong></div>
                <div><span>รหัสสาขา</span><strong>{selected.branchCode}</strong></div>
              </div>
            </section>
            <section className={styles.drawerSection}>
              <h4>ที่อยู่และการติดต่อ</h4>
              <div className={styles.detailGrid}>
                <div className={styles.full}><span>ที่อยู่ภาษาไทย</span><strong>{selected.registeredAddressTh}</strong></div>
                <div className={styles.full}><span>ที่อยู่ภาษาอังกฤษ</span><strong>{selected.registeredAddressEn || "-"}</strong></div>
                <div><span>โทรศัพท์</span><strong>{selected.phone || "-"}</strong></div>
                <div><span>อีเมล</span><strong>{selected.email || "-"}</strong></div>
                <div><span>Line ID</span><strong>{selected.lineId || "-"}</strong></div>
                <div><span>เว็บไซต์</span><strong>{selected.website || "-"}</strong></div>
              </div>
            </section>
            <section className={styles.drawerSection}>
              <h4>ประวัติเวอร์ชัน</h4>
              <div className={styles.detailGrid}>
                <div className={styles.full}><span>หมายเหตุ</span><strong>{selected.changeNote || "-"}</strong></div>
                <div><span>สร้างโดย</span><strong>{selected.createdByName || "ระบบ"}</strong></div>
                <div><span>สร้างเมื่อ</span><strong>{formatDate(selected.createdAt)}</strong></div>
                <div><span>ดำเนินการล่าสุดโดย</span><strong>{actorOf(selected)}</strong></div>
                <div><span>เวลาล่าสุด</span><strong>{formatDate(selected.publishedAt || selected.archivedAt || selected.updatedAt)}</strong></div>
              </div>
            </section>
          </div>
        ) : null}
      </RecordDrawer>

      <ConfirmDialog
        open={confirm?.action === "publish"}
        title="ยืนยันเผยแพร่ข้อมูลบริษัท"
        description={`Version ${data.draft?.versionNumber || "-"} จะเป็นข้อมูลบริษัทเวอร์ชันที่ใช้งานอยู่`}
        detail="Published version เดิมจะถูกเก็บถาวร การเปลี่ยนนี้ยังไม่กระทบเอกสาร Production จนกว่าจะดำเนิน Phase 7"
        confirmLabel="เผยแพร่เวอร์ชัน"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <ConfirmDialog
        open={confirm?.action === "archive"}
        title="เก็บฉบับร่างเป็นประวัติ"
        description={`Version ${data.draft?.versionNumber || "-"} จะถูกปิดและแก้ไขต่อไม่ได้`}
        detail="ข้อมูลบริษัทเวอร์ชันที่เผยแพร่อยู่จะไม่เปลี่ยนแปลง"
        confirmLabel="เก็บฉบับร่าง"
        tone="danger"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
