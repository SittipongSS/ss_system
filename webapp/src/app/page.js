"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseBrowser";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// If the public Supabase env vars are missing in a PRODUCTION build, the client
// can't authenticate but the server proxy still enforces auth. Silently doing
// the dev fallback (router.replace("/home")) would then bounce the user right
// back to login forever. So we only allow the no-auth bypass in development.
const DEV_BYPASS = !SUPABASE_CONFIGURED && process.env.NODE_ENV !== "production";
const MISCONFIGURED = !SUPABASE_CONFIGURED && process.env.NODE_ENV === "production";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // If already signed in, skip the login screen.
  useEffect(() => {
    // ข้อความ error จาก OAuth callback (?sso=domain / ?sso=failed) — อ่านจาก
    // window ตรง ๆ แทน useSearchParams เพื่อไม่ต้องครอบ Suspense ทั้งหน้า
    const sso = new URLSearchParams(window.location.search).get("sso");
    if (sso === "domain") setError("ใช้ได้เฉพาะบัญชี Google ของบริษัท (@scentandsense.co.th)");
    else if (sso === "failed") setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่");

    if (MISCONFIGURED) {
      setError("ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ (NEXT_PUBLIC_SUPABASE_*) กรุณาแจ้งผู้ดูแลระบบ");
      return;
    }
    if (!SUPABASE_CONFIGURED) return;
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (user) router.replace("/home");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google SSO (เฟส 4): เด้งไป Google แล้วกลับมาที่ /auth/callback เพื่อแลก session
  // hd = กรองหน้าจอเลือกบัญชีให้เห็นเฉพาะโดเมนบริษัท (ตัวบังคับจริงอยู่ที่ callback)
  const handleGoogle = async () => {
    setError("");
    if (MISCONFIGURED || DEV_BYPASS) {
      setError("ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase");
      return;
    }
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: "scentandsense.co.th", prompt: "select_account" },
      },
    });
    if (error) setError("เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองใหม่");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    // Production build with missing public env: don't fake-login (that bounces
    // straight back here) — surface the misconfiguration instead.
    if (MISCONFIGURED) {
      setError("ระบบยังไม่ได้ตั้งค่าการเชื่อมต่อ (NEXT_PUBLIC_SUPABASE_*) กรุณาแจ้งผู้ดูแลระบบ");
      return;
    }

    // Dev fallback: no Supabase configured -> skip auth so local dev works.
    if (DEV_BYPASS) {
      router.replace("/home");
      return;
    }

    setLoading(true);
    const { data, error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    router.replace("/home");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div className="glass-panel" style={{ padding: "32px", width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <img
            src="/brand-logo.png"
            alt="Scent &amp; Sense"
            style={{ width: "56px", height: "56px", margin: "0 auto 16px", borderRadius: "var(--radius-lg)", objectFit: "contain", display: "block" }}
          />
          <h1 style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em" }}>Scent &amp; Sense</h1>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && (
            <div
              className="status-pill danger"
              style={{ height: "auto", padding: "10px 12px", width: "100%", fontSize: "12.5px", fontWeight: 500, borderRadius: "var(--radius)" }}
            >
              {error}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>อีเมล (Email)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="premium-input"
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>รหัสผ่าน (Password)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="premium-input"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: "100%", height: "38px", justifyContent: "center", marginTop: "6px", opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "4px 0" }}>
            <span style={{ flex: 1, height: "1px", background: "var(--border)" }} />
            <span style={{ fontSize: "11.5px", color: "var(--text-3)" }}>หรือ</span>
            <span style={{ flex: 1, height: "1px", background: "var(--border)" }} />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            className="btn"
            style={{ width: "100%", height: "38px", justifyContent: "center", gap: "10px" }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            เข้าสู่ระบบด้วย Google
          </button>
        </form>
      </div>
    </div>
  );
}
