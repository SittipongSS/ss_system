"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Edit3, Send, Trash2 } from "lucide-react";
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

function StatusBadge({ status }) {
  const tone = status === "published" ? styles.published : status === "archived" ? styles.archived : styles.draft;
  return <span className={`${styles.badge} ${tone}`}>{organizationSettingStatusLabel(status)}</span>;
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

  // ปุ่มเดียวจบ: มีร่างอยู่แล้ว → เปิดแก้ต่อ; ยังไม่มี → สร้างร่างเบื้องหลังแล้วเปิดแก้ทันที
  // (กลไก version/ร่างถูกซ่อนจากผู้ใช้ — เห็นแค่ "แก้ไข")
  const startEdit = async () => {
    if (data.draft) { openEdit(data.draft); return; }
    setBusy(true);
    try {
      const draft = await request("/api/organization-settings/draft", { method: "POST" }, "เริ่มแก้ไขไม่สำเร็จ");
      await load();
      setForm(versionForm(draft));
      setDrawer({ mode: "edit", row: draft });
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  // บันทึกร่าง แล้ว "เลื่อน" แถวใน drawer ไปเป็นแถวที่เพิ่งบันทึกทันที — expectedUpdatedAt
  // ของครั้งถัดไปต้องเป็นค่าล่าสุดเสมอ ไม่งั้นถ้าจังหวะเผยแพร่ล้มหลังบันทึกผ่านแล้ว
  // การกดซ้ำจะชน 409 draft_stale ตลอดจนกว่าจะปิด drawer เปิดใหม่
  const patchDraft = async (row) => {
    const saved = await request(
      `/api/organization-settings/draft/${row.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, expectedUpdatedAt: row.updatedAt }),
      },
      "บันทึกฉบับร่างไม่สำเร็จ",
    );
    setDrawer((current) => current ? { ...current, row: saved } : current);
    return saved;
  };

  // "เก็บร่างไว้ก่อน" — บันทึกเฉย ๆ ยังไม่เผยแพร่
  const saveDraft = async () => {
    const row = drawer?.row;
    if (!row) return;
    setBusy(true);
    try {
      const saved = await patchDraft(row);
      setDrawer(null);
      setToast({ kind: "success", msg: `เก็บร่าง Version ${saved.versionNumber} ไว้แล้ว (ยังไม่เผยแพร่)` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  // "เผยแพร่การเปลี่ยนแปลง" — บันทึกร่าง แล้วเผยแพร่ต่อเนื่องในจังหวะเดียว
  const saveAndPublish = async (event) => {
    event.preventDefault();
    const row = drawer?.row;
    if (!row) return;
    if (!String(form.changeNote || "").trim()) {
      setToast({ kind: "error", msg: "กรุณาระบุหมายเหตุการเปลี่ยนแปลงก่อนเผยแพร่" });
      return;
    }
    setBusy(true);
    try {
      const saved = await patchDraft(row);
      await request(
        `/api/organization-settings/draft/${row.id}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedUpdatedAt: saved.updatedAt }),
        },
        "เผยแพร่ข้อมูลบริษัทไม่สำเร็จ",
      );
      setDrawer(null);
      setToast({ kind: "success", msg: `เผยแพร่ Version ${saved.versionNumber} แล้ว` });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
      // อาจล้มหลังบันทึกร่างผ่านไปแล้ว — โหลดใหม่ให้แบนเนอร์ร่างค้างและกล่องยืนยัน
      // (ที่อ่านจาก data.draft) เห็นสถานะจริง ไม่ใช่ของก่อนกดเผยแพร่
      await load();
    } finally {
      setBusy(false);
    }
  };

  // เผยแพร่/ยกเลิก จากแบนเนอร์ร่างค้าง (ร่างถูกบันทึกไว้แล้ว)
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
      }, action === "publish" ? "เผยแพร่ข้อมูลบริษัทไม่สำเร็จ" : "ยกเลิกการแก้ไขไม่สำเร็จ");
      setConfirm(null);
      setToast({
        kind: "success",
        msg: action === "publish" ? `เผยแพร่ Version ${row.versionNumber} แล้ว` : `ยกเลิกการแก้ไข Version ${row.versionNumber} แล้ว`,
      });
      await load();
    } catch (requestError) {
      setToast({ kind: "error", msg: requestError.message });
    } finally {
      setBusy(false);
    }
  };

  if (!canManage) return null;

  return (
    <Workspace hideHeader back={{ href: "/settings", label: "กลับหน้าตั้งค่า" }}>
      <header className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><Building2 size={22} /></span> ข้อมูลบริษัท</h1>
          <p>จัดการข้อมูลนิติบุคคลที่ใช้บนเอกสารทั้งระบบ การเผยแพร่จะไม่แก้ข้อมูลย้อนหลังของใบที่ออกไปแล้ว</p>
        </div>
        {/* action entity อยู่ขวาบนของเฮดเดอร์ (ตามกติกา Page Header) */}
        <div className={styles.headerActions}>
          {!loading && !error && data.published && !data.draft && (
            <button type="button" className="btn btn-accent" onClick={startEdit} disabled={busy}>
              <Edit3 size={16} /> แก้ไขข้อมูลบริษัท
            </button>
          )}
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
        <EmptyState icon={Building2}>
          ไม่พบข้อมูลบริษัทเวอร์ชันที่เผยแพร่ — ข้อมูลตั้งต้นอาจยังไม่ถูกติดตั้ง กรุณาติดต่อผู้ดูแลระบบ
        </EmptyState>
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
            <section className={`glass-panel ${styles.draftPanel}`} aria-label="การแก้ไขที่ยังไม่เผยแพร่">
              <Edit3 size={20} aria-hidden="true" />
              <div className={styles.draftCopy}>
                <strong>มีการแก้ไขที่ยังไม่เผยแพร่</strong>
                <p>บันทึกล่าสุด {formatDate(data.draft.updatedAt)} · ข้อมูลยังไม่มีผลจนกว่าจะยืนยันเผยแพร่</p>
              </div>
              <div className={styles.draftActions}>
                <button type="button" className="btn ghost" onClick={() => setConfirm({ action: "discard" })} disabled={busy}>
                  <Trash2 size={15} /> ยกเลิกการแก้ไข
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
                  <Edit3 size={15} /> แก้ต่อ
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      <RecordDrawer
        open={!!drawer}
        onClose={() => !busy && setDrawer(null)}
        closeOnOverlay={false}
        title="แก้ไขข้อมูลบริษัท"
        subtitle="เก็บร่างไว้ก่อน หรือเผยแพร่ให้มีผลทันที — ไม่มี Auto-save"
        badge={<StatusBadge status="draft" />}
        footer={(
          <>
            <button type="button" className="btn ghost" onClick={() => setDrawer(null)} disabled={busy}>ยกเลิก</button>
            <button type="button" className="btn" onClick={saveDraft} disabled={busy}>
              {busy ? "กำลังบันทึก…" : "เก็บร่างไว้ก่อน"}
            </button>
            <button type="submit" form="company-settings-form" className="btn btn-accent" disabled={busy}>
              {busy ? "กำลังดำเนินการ…" : "เผยแพร่การเปลี่ยนแปลง"}
            </button>
          </>
        )}
      >
        <form id="company-settings-form" className={styles.form} onSubmit={saveAndPublish}>
          <p className={styles.note}>“เก็บร่างไว้ก่อน” จะยังไม่เปลี่ยนข้อมูลที่ใช้งานอยู่ · “เผยแพร่การเปลี่ยนแปลง” จะทำให้ข้อมูลใหม่มีผลทันทีและต้องระบุหมายเหตุ</p>
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
            <label>หมายเหตุการเปลี่ยนแปลง <b>*</b><textarea className="premium-input" value={form.changeNote} onChange={(event) => setForm({ ...form, changeNote: event.target.value })} required maxLength={500} placeholder="ระบุเหตุผลหรือรายการข้อมูลที่เปลี่ยน (จำเป็นก่อนเผยแพร่)" /></label>
          </section>
        </form>
      </RecordDrawer>

      <ConfirmDialog
        open={confirm?.action === "publish"}
        title="ยืนยันเผยแพร่ข้อมูลบริษัท"
        description={`Version ${data.draft?.versionNumber || "-"} จะเป็นข้อมูลบริษัทเวอร์ชันที่ใช้งานอยู่`}
        detail="เอกสารที่ออกใหม่จะใช้ข้อมูลชุดนี้ · ใบที่ออกไปแล้วยังคงข้อมูลเดิม"
        confirmLabel="เผยแพร่เวอร์ชัน"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <ConfirmDialog
        open={confirm?.action === "discard"}
        title="ยกเลิกการแก้ไข"
        description={`Version ${data.draft?.versionNumber || "-"} จะถูกลบถาวรและกู้คืนไม่ได้`}
        detail="ร่างที่ไม่เคยเผยแพร่ไม่ใช่หลักฐาน — การยกเลิกจะถูกบันทึกในประวัติการใช้งาน (Audit log) และข้อมูลที่ใช้งานอยู่จะไม่เปลี่ยนแปลง"
        confirmLabel="ยกเลิกการแก้ไข"
        tone="danger"
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={transitionDraft}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
