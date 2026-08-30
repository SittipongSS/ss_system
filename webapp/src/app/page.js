"use client";
import { useState, useEffect } from "react";
import { resolveLoginEmail } from "@/lib/auth/loginIdentity";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseBrowser";
import BrandMark from "@/components/BrandMark";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// If the public Supabase env vars are missing in a PRODUCTION build, the client
// can't authenticate but the server proxy still enforces auth. Silently doing
// the dev fallback (router.replace("/home")) would then bounce the user right
// back to login forever. So we only allow the no-auth bypass in development.
const DEV_BYPASS = !SUPABASE_CONFIGURED && process.env.NODE_ENV !== "production";
const MISCONFIGURED = !SUPABASE_CONFIGURED && process.env.NODE_ENV === "production";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
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

    /* ⭐ **ช่องเดียวรับได้ทั้งอีเมลและเบอร์โทร** (มติผู้ใช้ 2026-08-30) — เจ้าหน้าที่
       หน้างานไม่มีอีเมลบริษัท · เบอร์ถูกแปลงเป็นที่อยู่ล็อกอินภายในให้เอง
       ⚠️ ตัดสินด้วย `@` (ดู lib/auth/loginIdentity.js) — พิมพ์ตัวเลขที่ไม่ใช่เบอร์ไทย
          ต้องบอกให้ชัดตรงนี้ ไม่ใช่ปล่อยไปตาย 400 ที่ Supabase แล้วขึ้น "ไม่ถูกต้อง" */
    const loginEmail = resolveLoginEmail(identifier);
    if (!loginEmail) {
      setError("กรอกอีเมล หรือเบอร์โทรศัพท์ที่ใช้เข้าระบบ (เช่น 081-234-5678)");
      return;
    }

    setLoading(true);
    const { data, error } = await createClient().auth.signInWithPassword({
      email: loginEmail,
      password,
    });
    setLoading(false);
    if (error) {
      setError("อีเมล/เบอร์โทร หรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    router.replace("/home");
  };

  return (
    <main className="login-page">
      <section className="glass-panel login-card">
        <div className="login-brand">
          {/* โลโก้มี wordmark ในตัวแล้ว จึงไม่มีหัวข้อชื่อบริษัทซ้ำใต้ภาพ */}
          <BrandMark height={54} className="brand-mark" style={{ margin: "0 auto" }} />
        </div>

        <form onSubmit={handleLogin} className="login-form">
          {error && (
            <div
              className="status-pill danger"
              style={{ height: "auto", padding: "10px 12px", width: "100%", fontSize: "var(--fs-6)", fontWeight: "var(--fw-medium)", borderRadius: "var(--radius)" }}
            >
              {error}
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>อีเมล หรือเบอร์โทรศัพท์</label>
            {/* 🐞 **type ต้องเป็น text** — `type="email"` ทำให้เบราว์เซอร์ตีกลับเบอร์โทร
                ตั้งแต่ก่อนโค้ดเราได้ทำงาน แล้วคนกรอกจะเห็นแค่ tooltip ของเบราว์เซอร์
                ⚠️ autoComplete เป็น "username" เพื่อให้ตัวจำรหัสผ่านเก็บได้ทั้งสองแบบ */}
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@company.com หรือ 081-234-5678"
              className="premium-input"
              autoComplete="username"
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
            className="btn btn-primary login-submit"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </section>
    </main>
  );
}
