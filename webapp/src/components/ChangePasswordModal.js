"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabaseBrowser";
import { apiCache } from "@/lib/apiCache";
import Modal from "@/components/Modal";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Self-service change-password modal. Used in two places so the forced
// first-login flow is enforced everywhere a signed-in user can land:
//   - AppLayout (every system page), opened manually or forced.
//   - the /home hub, forced-only (the hub has no manual trigger).
//
// `forced` (must_change_password) makes the modal non-dismissible and hides the
// cancel button. On success `onChanged()` lets the parent clear its forced flag.
export default function ChangePasswordModal({ open, forced = false, onClose, onChanged }) {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const close = () => {
    setForm({ currentPassword: "", newPassword: "", confirm: "" });
    setError("");
    setDone(false);
    onClose?.();
  };

  // Changing the password server-side revokes the current session's refresh
  // token (Supabase security default). The browser still holds the now-stale
  // cookies, so without intervention the next request bounces to login and the
  // login attempt fails until a manual refresh. So on success we sign out
  // cleanly (drops the bad cookies + clears the outgoing user's cached data)
  // and do a FULL page load to the login page — not a client navigation, which
  // would land on the hub and also keep the stale client state. A hard reload
  // guarantees a clean slate so the user can sign in with the new password.
  const goToLogin = async () => {
    if (SUPABASE_CONFIGURED) {
      try { await createClient().auth.signOut(); } catch {}
    }
    apiCache.clear();
    window.location.href = "/"; // force logout + full refresh to the login page
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.newPassword.length < 6) {
      setError("รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (form.newPassword !== form.confirm) {
      setError("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Don't clear the parent's `forced` flag here: in the forced flow that
        // would unmount the modal before the "go to login" screen shows. We sign
        // the user out and redirect anyway, so the flag is moot.
        setDone(true);
      } else {
        setError(data.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ");
      }
    } catch {
      setError("เกิดข้อผิดพลาด");
    }
    setSubmitting(false);
  };

  return (
    <Modal
      open={open || forced}
      onClose={close}
      title={forced && !done ? "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน" : "เปลี่ยนรหัสผ่าน"}
      size="sm"
      dismissible={!forced}
    >
      {done ? (
        <div className="p-2">
          <p className="text-[var(--text-2)]">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้งด้วยรหัสผ่านใหม่</p>
          <div className="flex justify-end mt-8 pt-6 border-t border-[var(--border)]">
            <button onClick={goToLogin} className="btn btn-primary px-8">ไปหน้าเข้าสู่ระบบ</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {forced && (
            <p className="text-[var(--text-2)] text-sm mb-4">
              นี่เป็นการเข้าใช้งานครั้งแรก (หรือแอดมินเพิ่งรีเซ็ตรหัสให้) กรุณาตั้งรหัสผ่านใหม่ของคุณเองก่อนเริ่มใช้งานระบบ
            </p>
          )}
          <div className="grid gap-[18px]">
            <div className="form-group">
              <label>รหัสผ่านปัจจุบัน <span className="text-[var(--red)]">*</span></label>
              <input
                type="password"
                value={form.currentPassword}
                onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))}
                required
                className="premium-input w-full"
                autoComplete="current-password"
              />
            </div>
            <div className="form-group">
              <label>รหัสผ่านใหม่ <span className="text-[var(--red)]">*</span></label>
              <input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                required
                placeholder="อย่างน้อย 6 ตัวอักษร"
                className="premium-input w-full"
                autoComplete="new-password"
              />
            </div>
            <div className="form-group">
              <label>ยืนยันรหัสผ่านใหม่ <span className="text-[var(--red)]">*</span></label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
                required
                className="premium-input w-full"
                autoComplete="new-password"
              />
            </div>
          </div>
          {error && <p className="text-[var(--red)] text-sm mt-3">{error}</p>}
          <div className="form-action-bar">
            {!forced && (
              <button type="button" onClick={close} className="btn">ยกเลิก</button>
            )}
            <button type="submit" disabled={submitting} className="btn btn-primary px-8">
              {submitting ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
