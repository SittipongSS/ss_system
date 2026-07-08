"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Scale, FolderKanban, Database, ArrowRight, LogOut, Users, LineChart, CircleDollarSign, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";
import { apiCache } from "@/lib/apiCache";
import { landingFor, can, canAccessSahamit, canAccessMgmt } from "@/lib/permissions";
import ChangePasswordModal from "@/components/ChangePasswordModal";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function HomeHubPage() {
  const router = useRouter();
  const [role, setRole] = useState(null);
  const [team, setTeam] = useState(null);
  const [extraCaps, setExtraCaps] = useState([]); // per-user grants (LG/margin/mgmt)
  const [userName, setUserName] = useState("");
  const [mustChangePwd, setMustChangePwd] = useState(false); // forced on first login

  useEffect(() => {
    // Local dev fallback — no Supabase configured yet.
    if (!SUPABASE_CONFIGURED) {
      setRole("ae_supervisor");
      setTeam(null);
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
        setTeam(user.app_metadata?.team || null);
        setExtraCaps(Array.isArray(user.app_metadata?.extraCaps) ? user.app_metadata.extraCaps : []);
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
  const enterPM = () => router.push("/sa/tasks");
  const enterSalesPlanning = () => router.push("/sa");
  const enterSAHAMIT = () => router.push("/sahamit");
  const enterMGMT = () => router.push("/mgmt");
  // Land on each system's command-center "ภาพรวม" (consistent with tax/pm/sahamit).
  const enterDB = () => router.push("/database");
  // All three systems are open to their normal roles. Tax is visible to anyone
  // who can see the tax workflow (SA/LG via history:view). Keep in sync with
  // OPEN_PAGES/lockedOut in proxy.js + the tax nav gate in AppLayout.
  const isAdmin = can(role, "users:manage");
  const canPM = isAdmin || can(role, "pm:view");
  const canSalesPlanning = isAdmin || can(role, "salesplan:view");
  // PM รวมอยู่ใต้ "บริหารงานขาย" แล้ว — ผู้ที่เข้าบริหารงานขายได้จะเข้า PM ผ่านการ์ดนั้น
  // การ์ด PM แยกจึงเหลือไว้เฉพาะ viewer/staff (มี pm:view แต่ไม่มี salesplan:view)
  const showPMCard = canPM && !canSalesPlanning;
  const canTax = isAdmin || can(role, "history:view");
  // Database hub card: anyone who can open a registry (sales/legal/staff) — the
  // approval workflow needs AE/AC to reach it, not just admins.
  const canDB =
    isAdmin || can(role, "products:view") || can(role, "customers:view");
  // SAHAMIT (Planning & Sales) — SA · Key Account team only (+ admin/sales-head
  // oversight). The capability is team-gated inside canAccessSahamit().
  const canSAHAMIT = canAccessSahamit(role, team);
  // งานบริหาร (mgmt) — admin + secretary หรือผู้ใช้ที่ได้รับสิทธิ์เสริม mgmt:view.
  const canMGMT = canAccessMgmt({ role, extraCaps });

  // Balanced column count for wide screens so the cards never leave a lonely
  // orphan on its own row (the old auto-fit gave 3 cols → 3+1 with 4 cards).
  // 1→1, 2→2, 3→3 (single row), 4→2×2, 5–6→3 rows; anything larger caps at 4.
  // Narrower / portrait screens collapse to 2 then 1 via .system-card-grid CSS.
  const visibleCount = [showPMCard, canSalesPlanning, canTax, canSAHAMIT, canMGMT, canDB].filter(Boolean).length;
  const wideCols = { 1: 1, 2: 2, 3: 3, 4: 2, 5: 3, 6: 3 }[visibleCount] || 4;

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
        <div
          className="system-card-grid"
          style={{
            "--cols": wideCols,
            ...(visibleCount === 1 ? { maxWidth: "420px", margin: "0 auto" } : null),
          }}
        >
          {/* Card 1 — Project Management (งานผลิต). PM รวมอยู่ใต้ "บริหารงานขาย" แล้ว
              การ์ดนี้จึงเหลือไว้เฉพาะ viewer/staff ที่มี pm:view แต่ไม่มี salesplan:view */}
          {showPMCard && (
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
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>จัดการโครงการ</h2>
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

          {/* Card 2 — Sales Planning. Commercial planning before handoff to PM. */}
          {canSalesPlanning && (
            <button
              onClick={enterSalesPlanning}
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
                <CircleDollarSign size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>บริหารงานขาย</h2>
                <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.6 }}>
                  โครงการขาย · พยากรณ์ยอด · เป้าหมาย · งานผลิต (PM) ครบในระบบเดียว
                </p>
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--accent, var(--navy))" }}>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  เข้าใช้งาน <ArrowRight size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          )}

          {/* Card 3 — Excise Tax (SA/LG/admin via history:view). */}
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
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>ภาษีสรรพสามิต</h2>
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

          {/* Card 4 — SAHAMIT (Planning & Sales). KA team only (+ admin/
              sales-head oversight); hidden entirely otherwise. */}
          {canSAHAMIT && (
            <button
              onClick={enterSAHAMIT}
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
                <LineChart size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>งานสหมิตร</h2>
                <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.6 }}>
                  ติดตาม Forecast · PO · กระทบยอด และวัสดุ สำหรับลูกค้าสหมิตรโปรดักส์
                </p>
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--accent, var(--navy))" }}>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  เข้าใช้งาน <ArrowRight size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          )}

          {/* Card — งานบริหาร (Management/Executive Office). admin + secretary only. */}
          {canMGMT && (
            <button
              onClick={enterMGMT}
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
                <Briefcase size={24} strokeWidth={1.5} />
              </div>
              <div>
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>งานบริหาร</h2>
                <p style={{ color: "var(--text-3)", fontSize: "13px", lineHeight: 1.6 }}>
                  ติดตามงาน บันทึกการประชุม และเป้าหมาย Rock &amp; Improve
                </p>
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "var(--accent, var(--navy))" }}>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  เข้าใช้งาน <ArrowRight size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          )}

          {/* Card — Master Database (customers / products registry).
              Kept last so the shared data hub always sits at the end. */}
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
                <h2 style={{ fontSize: "17px", fontWeight: 600, marginBottom: "6px" }}>ฐานข้อมูล</h2>
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
