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
        </form>
      </div>
    </div>
  );
}
