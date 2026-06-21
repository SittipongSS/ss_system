"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Scale, FolderKanban, Database, ArrowRight, LogOut, Users } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";
import { apiCache } from "@/lib/apiCache";
import { landingFor, can } from "@/lib/permissions";
import ChangePasswordModal from "@/components/ChangePasswordModal";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function HomeHubPage() {
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [userName, setUserName] = useState("");
  const [mustChangePwd, setMustChangePwd] = useState(false); // forced on first login

  useEffect(() => {
    // Local dev fallback — no Supabase configured yet.
    if (!SUPABASE_CONFIGURED) {
      setRole("ae_supervisor");
      setUserName("Local Dev");
      return;
    }
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!user) {
          router.replace("/");
          return;
        }
        setRole(user.app_metadata?.role || "user");
        setUserName(user.user_metadata?.name || user.email || "user");
        // The hub isn't wrapped by AppLayout, so enforce the forced first-login
        // password change here too — otherwise a must-change user could sit on
        // the hub without being prompted.
        setMustChangePwd(!!user.app_metadata?.must_change_password);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    if (SUPABASE_CONFIGURED) {
      try {
        await createClient().auth.signOut();
      } catch {}
    }
    apiCache.clear(); // don't leak the outgoing user's cached data to the next login
    router.replace("/");
  };

  if (!role) return null;

  const enterTax = () => router.push(landingFor(role));
  const enterPM = () => router.push("/pm/projects");
  // No /database hub page — land directly on the first registry the role can open.
  const enterDB = () =>
    router.push(
      can(role, "products:view") ? "/database/products"
        : can(role, "customers:view") ? "/database/customers"
          : "/database/holidays"
    );
  // All three systems are open to their normal roles. Tax is visible to anyone
  // who can see the tax workflow (SA/LG via history:view). Keep in sync with
  // OPEN_PAGES/lockedOut in proxy.js + the tax nav gate in AppLayout.
  const isAdmin = can(role, "users:manage");
  const canPM = isAdmin || can(role, "pm:view");
  const canTax = isAdmin || can(role, "history:view");
  // Database hub card: anyone who can open a registry (sales/legal/staff) — the
  // approval workflow needs AE/AC to reach it, not just admins.
  const canDB =
    isAdmin || can(role, "products:view") || can(role, "customers:view");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: "1000px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <img
            src="/brand-logo.png"
            alt="Scent &amp; Sense"
            style={{ width: "60px", height: "60px", margin: "0 auto 18px", borderRadius: "var(--radius-lg)", objectFit: "contain", display: "block" }}
          />
          <h1 style={{ fontSize: "24px", fontWeight: 600, letterSpacing: "-0.01em" }}>
            สวัสดี{userName ? `, ${userName}` : ""}
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: "14px", marginTop: "6px" }}>
            เลือกระบบที่ต้องการเข้าใช้งาน
          </p>
        </div>

        {/* System cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
          {/* Card 1 — Project Management. Shown only to roles with pm:view
              (SALES) or admins; hidden entirely otherwise. */}
          {canPM && (
            <button
              onClick={enterPM}
              className="glass-panel system-card"
              style={{
                textAlign: "left", padding: "28px", cursor: "pointer",
                display: "flex", flexDirection: "column", gap: "16px",
                background: "var(--panel)", color: "inherit",
              }}
            >
              <div
                className="brand-logo"
                style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "#181f4b" }}
              >
                <FolderKanban size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>ระบบจัดการโครงการ</h2>
                <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.6 }}>
                  ติดตามและบริหารงานโครงการ มอบหมายงาน และดูความคืบหน้า
                </p>
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--accent, var(--navy))" }}>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  เข้าใช้งาน <ArrowRight size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          )}

          {/* Card 2 — Excise Tax (SA/LG/admin via history:view). */}
          {canTax && (
            <button
              onClick={enterTax}
              className="glass-panel system-card"
              style={{
                textAlign: "left", padding: "28px", cursor: "pointer",
                display: "flex", flexDirection: "column", gap: "16px",
                background: "var(--panel)", color: "inherit",
              }}
            >
              <div
                className="brand-logo"
                style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "#181f4b" }}
              >
                <Scale size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>ระบบภาษีสรรพสามิต</h2>
                <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.6 }}>
                  จัดการทะเบียนสินค้า ลูกค้า ขออนุมัติภาษี และแจ้งยื่นภาษี
                </p>
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--accent, var(--navy))" }}>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  เข้าใช้งาน <ArrowRight size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          )}

          {/* Card 3 — Master Database (customers / products registry).
              Shown to roles that can open a registry; hidden otherwise. */}
          {canDB && (
            <button
              onClick={enterDB}
              className="glass-panel system-card"
              style={{
                textAlign: "left", padding: "28px", cursor: "pointer",
                display: "flex", flexDirection: "column", gap: "16px",
                background: "var(--panel)", color: "inherit",
              }}
            >
              <div
                className="brand-logo"
                style={{ width: "48px", height: "48px", borderRadius: "var(--radius-lg)", background: "#181f4b" }}
              >
                <Database size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>ระบบฐานข้อมูล</h2>
                <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.6 }}>
                  จัดการฐานข้อมูลลูกค้าและสินค้า ข้อมูลหลักที่ใช้ร่วมกันทุกระบบ
                </p>
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--accent, var(--navy))" }}>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  เข้าใช้งาน <ArrowRight size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          )}
        </div>

        {/* Footer — user management (admins) + logout */}
        <div style={{ textAlign: "center", marginTop: "32px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
          {isAdmin && (
            <button onClick={() => router.push("/users")} className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }} title="จัดการผู้ใช้">
              <Users size={15} strokeWidth={2} /> จัดการผู้ใช้
            </button>
          )}
          <button onClick={handleLogout} className="btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
            <LogOut size={15} strokeWidth={2} /> ออกจากระบบ
          </button>
        </div>
      </div>

      {/* Forced first-login password change (the hub has no manual trigger, so
          this is forced-only). */}
      <ChangePasswordModal forced={mustChangePwd} onChanged={() => setMustChangePwd(false)} />
    </div>
  );
}
