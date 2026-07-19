"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileSignature,
  History,
  ImagePlus,
  RefreshCw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import RecordDrawer from "@/components/excise/RecordDrawer";
import Toast from "@/components/ui/Toast";
import styles from "./SignatureVault.module.css";

const ACTION_LABELS = {
  upload: "เพิ่มลายเซ็น",
  replace: "เปลี่ยนลายเซ็น",
  revoke: "ยกเลิกลายเซ็น",
};

const STATE_LABELS = {
  active: "ใช้งานอยู่",
  superseded: "แทนที่แล้ว",
  revoked: "ยกเลิกแล้ว",
};

function fmtDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function fmtBytes(value) {
  const bytes = Number(value) || 0;
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

function statusBadge(active) {
  return active ? (
    <span className="ui-badge" style={{ background: "var(--green-soft)", color: "var(--green)" }}>พร้อมใช้งาน</span>
  ) : (
    <span className="ui-badge" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>ยังไม่ได้ตั้งค่า</span>
  );
}

export default function SignatureVault() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [candidate, setCandidate] = useState(null);
  const [candidateUrl, setCandidateUrl] = useState("");
  const [candidateError, setCandidateError] = useState("");
  const [revokeMode, setRevokeMode] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [confirmAction, setConfirmAction] = useState("");
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/account/signature", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "โหลดข้อมูลลายเซ็นไม่สำเร็จ");
      setData(payload);
    } catch (error) {
      setLoadError(error.message || "โหลดข้อมูลลายเซ็นไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!candidate) {
      setCandidateUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(candidate);
    setCandidateUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [candidate]);

  const closeDrawer = () => {
    if (busy) return;
    setDrawerOpen(false);
    setCandidate(null);
    setCandidateError("");
    setRevokeMode(false);
    setRevokeReason("");
    setConfirmAction("");
  };

  const selectFile = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    setConfirmAction("");
    setCandidateError("");
    if (!file) return;
    if (file.type && file.type !== "image/png") {
      setCandidate(null);
      setCandidateError("รองรับเฉพาะไฟล์ PNG เท่านั้น");
      return;
    }
    const maxBytes = data?.limits?.maxBytes || 1024 * 1024;
    if (file.size > maxBytes) {
      setCandidate(null);
      setCandidateError("ไฟล์ใหญ่เกิน 1 MB");
      return;
    }
    setCandidate(file);
    setRevokeMode(false);
  };

  const upload = async () => {
    if (!candidate) return;
    setBusy("upload");
    try {
      const body = new FormData();
      body.append("file", candidate);
      body.append("expectedActiveVersionId", data?.active?.id || "");
      const response = await fetch("/api/account/signature", { method: "POST", body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "บันทึกลายเซ็นไม่สำเร็จ");
      setData(payload);
      setCandidate(null);
      setConfirmAction("");
      setToast({ kind: "success", msg: data?.active ? "สร้างลายเซ็นเวอร์ชันใหม่แล้ว" : "เพิ่มลายเซ็นแล้ว" });
    } catch (error) {
      setConfirmAction("");
      setToast({ kind: "error", msg: error.message || "บันทึกลายเซ็นไม่สำเร็จ" });
      if (/หน้าต่าง|ล่าสุด/.test(error.message || "")) load();
    } finally {
      setBusy("");
    }
  };

  const revoke = async () => {
    setBusy("revoke");
    try {
      const response = await fetch("/api/account/signature", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedActiveVersionId: data?.active?.id,
          reason: revokeReason,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "ยกเลิกลายเซ็นไม่สำเร็จ");
      setData(payload);
      setRevokeMode(false);
      setRevokeReason("");
      setConfirmAction("");
      setToast({ kind: "success", msg: "ยกเลิกลายเซ็นที่ใช้งานอยู่แล้ว" });
    } catch (error) {
      setConfirmAction("");
      setToast({ kind: "error", msg: error.message || "ยกเลิกลายเซ็นไม่สำเร็จ" });
      if (/หน้าต่าง|ล่าสุด/.test(error.message || "")) load();
    } finally {
      setBusy("");
    }
  };

  const activePreview = useMemo(() => {
    if (candidateUrl) return candidateUrl;
    if (!data?.active?.previewUrl) return "";
    return `${data.active.previewUrl}?version=${encodeURIComponent(data.active.id)}`;
  }, [candidateUrl, data?.active]);

  const openManage = () => {
    setDrawerOpen(true);
    setConfirmAction("");
  };

  if (loading) {
    return <section className={`glass-panel ${styles.card}`} aria-label="กำลังโหลดข้อมูลลายเซ็น"><div className={`skeleton ${styles.cardSkeleton}`} /></section>;
  }

  if (loadError) {
    return (
      <section className={`glass-panel ${styles.card}`} aria-labelledby="signature-error-heading">
        <div className={styles.errorRow}>
          <AlertTriangle size={20} color="var(--red)" aria-hidden="true" />
          <div><strong id="signature-error-heading">โหลดลายเซ็นไม่สำเร็จ</strong><span>{loadError}</span></div>
          <button type="button" className="btn sm" onClick={load}><RefreshCw size={14} aria-hidden="true" /> ลองใหม่</button>
        </div>
      </section>
    );
  }

  const active = data?.active;
  const uploadLabel = active ? "บันทึกเป็นเวอร์ชันใหม่" : "บันทึกลายเซ็น";

  return (
    <>
      <section className={`glass-panel ${styles.card}`} aria-labelledby="signature-card-heading">
        <div className={styles.cardHeader}>
          <span className={styles.cardIcon} aria-hidden="true"><FileSignature size={20} /></span>
          <div className={styles.cardTitle}>
            <div><h2 id="signature-card-heading">ลายเซ็นอิเล็กทรอนิกส์</h2>{statusBadge(active)}</div>
            <p>{active ? `Version ${active.versionNumber} · อัปเดต ${fmtDate(active.createdAt)}` : "เก็บแบบ Private และใช้ได้เฉพาะบัญชีของคุณ"}</p>
          </div>
        </div>
        <button type="button" className="btn" onClick={openManage}>จัดการลายเซ็น</button>
      </section>

      <RecordDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="ลายเซ็นอิเล็กทรอนิกส์"
        subtitle="Signature Vault ส่วนตัว — ไฟล์ทุกเวอร์ชันเก็บแบบ Private"
        badge={statusBadge(active)}
        closeOnOverlay={!busy}
        opaqueSurface
        footer={(
          <>
            {confirmAction ? (
              <>
                <button type="button" className="btn ghost" onClick={() => setConfirmAction("")} disabled={!!busy}>ย้อนกลับ</button>
                <button
                  type="button"
                  className={confirmAction === "revoke" ? "btn btn-danger" : "btn btn-accent"}
                  onClick={confirmAction === "revoke" ? revoke : upload}
                  disabled={!!busy}
                >
                  {busy ? "กำลังดำเนินการ…" : confirmAction === "revoke" ? "ยืนยันการยกเลิก" : "ยืนยันและบันทึก"}
                </button>
              </>
            ) : candidate ? (
              <>
                <button type="button" className="btn ghost" onClick={() => setCandidate(null)} disabled={!!busy}>ยกเลิกไฟล์</button>
                <button type="button" className="btn btn-accent" onClick={() => setConfirmAction("upload")} disabled={!!busy}>{uploadLabel}</button>
              </>
            ) : revokeMode ? (
              <>
                <button type="button" className="btn ghost" onClick={() => { setRevokeMode(false); setRevokeReason(""); }} disabled={!!busy}>ยกเลิก</button>
                <button type="button" className="btn btn-danger" onClick={() => setConfirmAction("revoke")} disabled={!revokeReason.trim() || !!busy}>ตรวจสอบก่อนยกเลิก</button>
              </>
            ) : (
              <button type="button" className="btn ghost" onClick={closeDrawer}>ปิด</button>
            )}
          </>
        )}
      >
        <div className={styles.drawerBody}>
          {confirmAction && (
            <section className={`${styles.confirmPanel} ${confirmAction === "revoke" ? styles.dangerPanel : ""}`} role="alert">
              <AlertTriangle size={20} aria-hidden="true" />
              <div>
                <strong>{confirmAction === "revoke" ? "ยืนยันการยกเลิกลายเซ็น" : active ? "ยืนยันการสร้างเวอร์ชันใหม่" : "ยืนยันการเพิ่มลายเซ็น"}</strong>
                <p>{confirmAction === "revoke"
                  ? "ลายเซ็นนี้จะไม่ถูกใช้กับการอนุมัติใหม่ แต่ไฟล์และประวัติเดิมจะไม่ถูกลบ"
                  : "ระบบจะเก็บไฟล์เดิมไว้เป็นประวัติและตั้งไฟล์นี้เป็นเวอร์ชันที่ใช้งานอยู่"}</p>
              </div>
            </section>
          )}

          <section className={styles.previewSection} aria-labelledby="signature-preview-heading">
            <div className={styles.sectionHeading}>
              <div><h3 id="signature-preview-heading">ตัวอย่างลายเซ็น</h3><p>{candidate ? "ไฟล์ใหม่ที่รอบันทึก" : active ? `Version ${active.versionNumber}` : "ยังไม่มีลายเซ็น"}</p></div>
              {candidate && <span className="ui-badge" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>Preview</span>}
            </div>
            <div className={styles.previewBox}>
              {activePreview ? (
                <Image
                  src={activePreview}
                  alt={candidate ? "ตัวอย่างไฟล์ลายเซ็นใหม่" : "ลายเซ็นอิเล็กทรอนิกส์ที่ใช้งานอยู่"}
                  width={360}
                  height={180}
                  unoptimized
                />
              ) : (
                <div className={styles.emptyPreview}><FileSignature size={30} aria-hidden="true" /><span>เลือกไฟล์ PNG เพื่อดูตัวอย่าง</span></div>
              )}
            </div>
            {(candidate || active) && (
              <div className={styles.previewMeta}>
                <span>{candidate?.name || `signature-v${active.versionNumber}.png`}</span>
                <span>{candidate ? fmtBytes(candidate.size) : `${active.width}×${active.height} px · ${fmtBytes(active.sizeBytes)}`}</span>
              </div>
            )}
          </section>

          {!confirmAction && !revokeMode && (
            <section className={styles.uploadSection} aria-labelledby="signature-upload-heading">
              <div className={styles.sectionHeading}>
                <div><h3 id="signature-upload-heading">{active ? "เปลี่ยนลายเซ็น" : "เพิ่มลายเซ็น"}</h3><p>ไฟล์เดิมจะไม่ถูกเขียนทับหรือลบย้อนหลัง</p></div>
              </div>
              <label className={`btn ${styles.fileButton}`}>
                <ImagePlus size={16} aria-hidden="true" /> เลือกไฟล์ PNG
                <input type="file" accept="image/png,.png" onChange={selectFile} className={styles.fileInput} />
              </label>
              <p className={styles.assistText}>PNG ไม่เกิน 1 MB · กว้าง 120–2400 px · สูง 40–1200 px · แนะนำพื้นหลังโปร่งใส</p>
              {candidateError && <p className={styles.validationError} role="alert">{candidateError}</p>}
            </section>
          )}

          <section className={styles.securityNote} aria-label="การคุ้มครองลายเซ็น">
            <ShieldCheck size={20} aria-hidden="true" />
            <div><strong>ไฟล์ส่วนตัวและมีเวอร์ชัน</strong><p>ไม่มี Public URL และระบบจะตรวจ owner ทุกครั้งที่เปิดภาพ การ Replace/Revoke ไม่ลบหลักฐานเดิม</p></div>
          </section>

          {active && !candidate && !confirmAction && (
            <section className={styles.revokeSection} aria-labelledby="signature-revoke-heading">
              <div className={styles.sectionHeading}>
                <div><h3 id="signature-revoke-heading">ยกเลิกการใช้งาน</h3><p>หยุดใช้กับรายการใหม่ โดยไม่ลบ Version ปัจจุบัน</p></div>
              </div>
              {revokeMode ? (
                <div className="form-group">
                  <label htmlFor="signature-revoke-reason">เหตุผลที่ยกเลิก</label>
                  <textarea id="signature-revoke-reason" className="premium-input" rows={3} maxLength={500} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="เช่น เปลี่ยนรูปแบบลายเซ็น หรือไฟล์เดิมไม่ถูกต้อง" />
                  <p className={styles.assistText}>{revokeReason.length}/500 ตัวอักษร</p>
                </div>
              ) : (
                <button type="button" className="btn action-outline btn-danger" onClick={() => setRevokeMode(true)}><Ban size={15} aria-hidden="true" /> ยกเลิกลายเซ็นนี้</button>
              )}
            </section>
          )}

          <section className={styles.historySection} aria-labelledby="signature-history-heading">
            <div className={styles.sectionHeading}>
              <div><h3 id="signature-history-heading"><History size={16} aria-hidden="true" /> ประวัติเวอร์ชัน</h3><p>ข้อมูลย้อนหลังแก้ไขหรือลบไม่ได้</p></div>
            </div>
            {data?.versions?.length ? (
              <ol className={styles.historyList}>
                {data.versions.map((version) => (
                  <li key={version.id}>
                    <span className={`${styles.historyIcon} ${styles[version.state]}`} aria-hidden="true">
                      {version.state === "active" ? <CheckCircle2 size={15} /> : version.state === "revoked" ? <Ban size={15} /> : <Upload size={15} />}
                    </span>
                    <div><strong>Version {version.versionNumber}</strong><span>{fmtDate(version.createdAt)} · {version.width}×{version.height} px</span></div>
                    <span className={styles.historyState}>{STATE_LABELS[version.state] || version.state}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={styles.emptyHistory}><History size={22} aria-hidden="true" /><span>ยังไม่มีประวัติลายเซ็น</span></div>
            )}
          </section>

          {data?.localOnly && <p className={styles.localNote}>Local mode: ใช้ตรวจ UX เท่านั้น ข้อมูลจะไม่ถูกบันทึกข้ามการ Reload</p>}
        </div>
      </RecordDrawer>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
