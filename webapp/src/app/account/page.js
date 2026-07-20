"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import PhoneInput from "@/components/ui/PhoneInput";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Workspace from "@/components/ui/Workspace";
import Toast from "@/components/ui/Toast";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import SignatureVault from "@/components/account/SignatureVault";
import { DEPARTMENT_LABELS, DEPARTMENT_NAMES_TH, ROLE_LABELS, TEAM_LABELS } from "@/lib/permissions";
import { fmtName } from "@/lib/format";
import styles from "./page.module.css";

const EMPTY_FORM = { firstName: "", lastName: "", phone: "" };
const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function initialsOf(profile) {
  const first = String(profile?.firstName || "").trim();
  const last = String(profile?.lastName || "").trim();
  if (first) return `${first.charAt(0)}${last ? last.charAt(0) : ""}`.toUpperCase();
  return String(profile?.email || "U").slice(0, 2).toUpperCase();
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export default function AccountPage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/account/profile", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "โหลดข้อมูลบัญชีไม่สำเร็จ");
      setProfile(data.profile);
      setForm({
        firstName: data.profile.firstName || "",
        lastName: data.profile.lastName || "",
        phone: data.profile.phone || "",
      });
    } catch (error) {
      setLoadError(error.message || "โหลดข้อมูลบัญชีไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const savedForm = useMemo(() => ({
    firstName: profile?.firstName || "",
    lastName: profile?.lastName || "",
    phone: profile?.phone || "",
  }), [profile]);
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const resetForm = () => setForm(savedForm);
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const saveProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "บันทึกข้อมูลส่วนตัวไม่สำเร็จ");
      setProfile(data.profile);
      setForm({
        firstName: data.profile.firstName || "",
        lastName: data.profile.lastName || "",
        phone: data.profile.phone || "",
      });
      window.dispatchEvent(new CustomEvent("account-profile-updated", { detail: data.profile }));
      setConfirmOpen(false);
      setToast({ kind: "success", msg: "บันทึกข้อมูลส่วนตัวแล้ว" });
    } catch (error) {
      setConfirmOpen(false);
      setToast({ kind: "error", msg: error.message || "บันทึกข้อมูลส่วนตัวไม่สำเร็จ" });
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = ROLE_LABELS[profile?.role] || profile?.role || "—";
  const teamLabel = profile?.team ? (TEAM_LABELS[profile.team] || profile.team) : "—";
  const departmentCode = profile?.department ? (DEPARTMENT_LABELS[profile.department] || profile.department) : "—";
  const departmentName = profile?.department ? DEPARTMENT_NAMES_TH[profile.department] : "";
  const displayName = profile ? (fmtName(profile) || profile.email) : "";

  return (
    <Workspace hideHeader back={{ href: "/home", label: "กลับหน้าหลัก" }}>
      <div className="premium-header">
        <div className="header-content">
          <h1><span className="premium-header-icon"><UserRound size={22} /></span> บัญชีของฉัน</h1>
          <p>จัดการข้อมูลส่วนตัว ความปลอดภัย และลายเซ็นอิเล็กทรอนิกส์ของบัญชี</p>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingGrid} aria-label="กำลังโหลดข้อมูลบัญชี">
          <div className={`glass-panel ${styles.skeletonPanel}`}><div className="skeleton" style={{ height: 220 }} /></div>
          <div className={`glass-panel ${styles.skeletonPanel}`}><div className="skeleton" style={{ height: 150 }} /></div>
        </div>
      ) : loadError ? (
        <div className={`glass-panel ${styles.errorPanel}`} role="alert">
          <div>
            <AlertTriangle size={28} color="var(--red)" aria-hidden="true" />
            <h2>โหลดข้อมูลบัญชีไม่สำเร็จ</h2>
            <p>{loadError}</p>
            <button type="button" className="btn" onClick={loadProfile}>ลองอีกครั้ง</button>
          </div>
        </div>
      ) : (
        <div className={styles.accountGrid}>
          <section className={`glass-panel ${styles.panel}`} aria-labelledby="profile-heading">
            <div className={styles.panelHeader}>
              <div>
                <h2 id="profile-heading">ข้อมูลส่วนตัว</h2>
                <p>ข้อมูลนี้ใช้แสดงชื่อผู้รับผิดชอบและข้อมูลติดต่อในระบบ</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className="form-group">
                <label htmlFor="account-first-name">ชื่อ</label>
                <input id="account-first-name" className="premium-input" value={form.firstName} onChange={change("firstName")} maxLength={80} autoComplete="given-name" />
              </div>
              <div className="form-group">
                <label htmlFor="account-last-name">นามสกุล</label>
                <input id="account-last-name" className="premium-input" value={form.lastName} onChange={change("lastName")} maxLength={80} autoComplete="family-name" />
              </div>
              <div className="form-group">
                <label htmlFor="account-phone">เบอร์โทรศัพท์</label>
                <PhoneInput id="account-phone" className="premium-input" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} autoComplete="tel" />
              </div>
              <div className="form-group">
                <label htmlFor="account-email">อีเมลสำหรับเข้าสู่ระบบ</label>
                <input id="account-email" className="premium-input" value={profile.email} disabled />
                <p className={styles.fieldNote}>หากต้องการเปลี่ยนอีเมล กรุณาติดต่อผู้ดูแลระบบ</p>
              </div>
            </div>

            <div className={styles.formActions}>
              <button type="button" className="btn ghost" onClick={resetForm} disabled={!dirty || saving}>ยกเลิก</button>
              <button type="button" className="btn btn-accent" onClick={() => setConfirmOpen(true)} disabled={!dirty || saving}>บันทึกข้อมูล</button>
            </div>
          </section>

          <aside className={styles.sideColumn} aria-label="ข้อมูลบัญชีและความปลอดภัย">
            <section className={`glass-panel ${styles.panel}`} aria-labelledby="account-summary-heading">
              <div className={styles.identityBlock}>
                <span className={styles.avatar} aria-hidden="true">{initialsOf(profile)}</span>
                <div className={styles.identityCopy}>
                  <strong id="account-summary-heading">{displayName}</strong>
                  <span>{profile.email}</span>
                </div>
              </div>
              <dl className={styles.facts}>
                <div className={styles.fact}><dt>บทบาท</dt><dd>{roleLabel}</dd></div>
                <div className={styles.fact}><dt>ฝ่าย</dt><dd title={departmentName || undefined}>{departmentCode}</dd></div>
                <div className={styles.fact}><dt>ทีม</dt><dd>{teamLabel}</dd></div>
                <div className={styles.fact}><dt>เข้าใช้ล่าสุด</dt><dd>{formatDateTime(profile.lastSignInAt)}</dd></div>
              </dl>
            </section>

            <section className={`glass-panel ${styles.panel}`} aria-labelledby="security-heading">
              <div className={styles.panelHeader}>
                <div>
                  <h2 id="security-heading">ความปลอดภัย</h2>
                  <p>จัดการรหัสผ่านสำหรับบัญชีนี้</p>
                </div>
                {profile.mustChangePassword && <span className="ui-badge" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>ต้องเปลี่ยน</span>}
              </div>
              <div className={styles.securityRow}>
                <div className={styles.securityCopy}>
                  <span className={styles.securityIcon} aria-hidden="true"><ShieldCheck size={19} /></span>
                  <div><strong>รหัสผ่าน</strong><span>ยืนยันรหัสเดิมก่อนตั้งรหัสใหม่</span></div>
                </div>
                {SUPABASE_CONFIGURED && (
                  <button type="button" className="btn" onClick={() => setPasswordOpen(true)}><KeyRound size={15} aria-hidden="true" /> เปลี่ยน</button>
                )}
              </div>
            </section>
            <SignatureVault />
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="ยืนยันการแก้ไขข้อมูลส่วนตัว"
        description="บันทึกชื่อ นามสกุล และเบอร์โทรศัพท์ใหม่ใช่หรือไม่"
        detail="การเปลี่ยนแปลงนี้จะแสดงในส่วนที่อ้างอิงข้อมูลผู้ใช้"
        confirmLabel="บันทึกข้อมูล"
        busy={saving}
        onConfirm={saveProfile}
        onClose={() => !saving && setConfirmOpen(false)}
      />
      <ChangePasswordModal open={passwordOpen} forced={false} onClose={() => setPasswordOpen(false)} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
