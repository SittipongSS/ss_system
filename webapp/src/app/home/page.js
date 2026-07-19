"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Boxes, LogOut, Settings, ShieldCheck, TriangleAlert, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";
import { apiCache } from "@/lib/apiCache";
import { canUser, ROLE_LABELS, TEAM_LABELS } from "@/lib/permissions";
import { fmtName } from "@/lib/format";
import {
  recentSystemForUser,
  RECENT_SYSTEM_STORAGE_KEY,
  systemLandingForUser,
  systemsForUser,
} from "@/config/systems";
import BrandMark from "@/components/BrandMark";
import ChangePasswordModal from "@/components/ChangePasswordModal";
import EmptyState from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function HomeHubSkeleton() {
  return (
    <main className="home-hub" aria-label="กำลังโหลดศูนย์รวมระบบ">
      <div className="home-hub-shell">
        <header className="home-hub-topbar">
          <BrandMark height={42} className="brand-mark home-hub-brand" />
          <Skeleton width={180} height={36} radius={10} />
        </header>
        <section className="home-hub-hero glass-panel">
          <div className="home-hub-greeting">
            <Skeleton width={120} height={14} />
            <Skeleton width="min(420px, 80%)" height={32} />
            <Skeleton width={260} height={18} />
          </div>
        </section>
        <div className="home-system-grid count-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="home-system-card glass-panel" key={index}>
              <Skeleton width={48} height={48} radius={12} />
              <Skeleton width="55%" height={20} />
              <Skeleton width="100%" height={42} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function HomeHubPage() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [recentKey, setRecentKey] = useState(null);
  const [mustChangePwd, setMustChangePwd] = useState(false);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    if (!SUPABASE_CONFIGURED) {
      setSession({ role: "ae_supervisor", team: null, extraCaps: [], userName: "Local Dev" });
      setLoading(false);
      return;
    }

    try {
      const { data: { user }, error } = await createClient().auth.getUser();
      if (error) throw error;
      if (!user) {
        router.replace("/");
        return;
      }

      const meta = user.user_metadata || {};
      setSession({
        role: user.app_metadata?.role || "user",
        team: user.app_metadata?.team || null,
        extraCaps: Array.isArray(user.app_metadata?.extraCaps) ? user.app_metadata.extraCaps : [],
        userName: fmtName({ ...meta, email: user.email }) || user.email || "ผู้ใช้งาน",
      });
      setMustChangePwd(!!user.app_metadata?.must_change_password);
      setLoading(false);
    } catch {
      setLoadError("ไม่สามารถโหลดข้อมูลบัญชีและสิทธิ์การใช้งานได้");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!session) return;
    try { setRecentKey(localStorage.getItem(RECENT_SYSTEM_STORAGE_KEY)); } catch {}
  }, [session]);

  const userContext = useMemo(() => ({
    role: session?.role,
    team: session?.team,
    extraCaps: session?.extraCaps || [],
  }), [session]);

  const visibleSystems = useMemo(
    () => session ? systemsForUser(userContext) : [],
    [session, userContext],
  );
  const recentSystem = session ? recentSystemForUser(userContext, recentKey) : null;

  const rememberSystem = (key) => {
    setRecentKey(key);
    try { localStorage.setItem(RECENT_SYSTEM_STORAGE_KEY, key); } catch {}
  };

  const handleLogout = async () => {
    if (SUPABASE_CONFIGURED) {
      try { await createClient().auth.signOut(); } catch {}
    }
    apiCache.clear();
    router.replace("/");
  };

  if (loading) return <HomeHubSkeleton />;

  if (loadError || !session) {
    return (
      <main className="home-hub">
        <div className="home-hub-shell home-hub-error">
          <BrandMark height={42} className="brand-mark home-hub-brand" />
          <EmptyState
            icon={TriangleAlert}
            action={{ label: "ลองใหม่", onClick: loadSession }}
          >
            <strong>เปิดศูนย์รวมระบบไม่สำเร็จ</strong>
            <span>{loadError || "ไม่พบข้อมูลบัญชีผู้ใช้งาน"}</span>
          </EmptyState>
        </div>
      </main>
    );
  }

  const roleLabel = ROLE_LABELS[session.role] || session.role;
  const teamLabel = session.team ? (TEAM_LABELS[session.team] || session.team) : null;
  const canOpenUsers = canUser(userContext, "users:manage") || canUser(userContext, "users:view");
  const recentLanding = recentSystem ? systemLandingForUser(recentSystem, userContext) : null;
  const countClass = `count-${Math.min(Math.max(visibleSystems.length, 1), 6)}`;

  return (
    <main className="home-hub">
      <div className="home-hub-shell">
        <header className="home-hub-topbar">
          <Link href="/home" className="home-hub-brand-link" aria-label="ศูนย์รวมระบบ Scent and Sense">
            <BrandMark height={42} className="brand-mark home-hub-brand" />
          </Link>
          <nav className="home-hub-shortcuts" aria-label="บัญชีและการตั้งค่าส่วนกลาง">
            <Link href="/account" className="btn ghost"><UserRound size={16} /> บัญชีของฉัน</Link>
            <Link href="/settings" className="btn ghost"><Settings size={16} /> ตั้งค่า</Link>
            {canOpenUsers && (
              <Link href="/users" className="btn ghost"><Users size={16} /> รายชื่อผู้ใช้</Link>
            )}
            <button type="button" className="btn ghost" onClick={handleLogout}>
              <LogOut size={16} /> ออกจากระบบ
            </button>
          </nav>
        </header>

        <section className={`home-hub-hero glass-panel${recentSystem ? ' has-continue' : ''}`} aria-labelledby="home-greeting">
          <div className="home-hub-greeting">
            <span className="home-hub-eyebrow">ศูนย์รวมการทำงาน</span>
            <h1 id="home-greeting">สวัสดี, {session.userName}</h1>
            <p>เลือกพื้นที่ทำงานที่ต้องการ ระบบจะแสดงเฉพาะส่วนที่บัญชีนี้มีสิทธิ์เข้าถึง</p>
            <div className="home-user-context" aria-label="บริบทผู้ใช้งาน">
              <span className="chip"><ShieldCheck size={14} /> {roleLabel}</span>
              {teamLabel && <span className="chip">ทีม {teamLabel}</span>}
            </div>
          </div>

          {recentSystem && recentLanding && (() => {
            const RecentIcon = recentSystem.icon;
            return (
              <aside className="home-continue-card" aria-label={`ทำงานต่อใน${recentSystem.label}`}>
                <span className="home-continue-label">ทำงานต่อ</span>
                <div className="home-continue-title">
                  <span className="home-system-icon"><RecentIcon size={22} aria-hidden="true" /></span>
                  <div>
                    <strong>{recentSystem.label}</strong>
                    <span>{recentSystem.description}</span>
                  </div>
                </div>
                <Link
                  href={recentLanding}
                  className="btn btn-accent"
                  onClick={() => rememberSystem(recentSystem.key)}
                >
                  กลับไปทำงานต่อ <ArrowRight size={16} />
                </Link>
              </aside>
            );
          })()}
        </section>

        <section className="home-systems" aria-labelledby="home-systems-title">
          <div className="home-section-heading">
            <div>
              <h2 id="home-systems-title">ระบบที่คุณใช้งานได้</h2>
              <p>{visibleSystems.length} พื้นที่ทำงานตามบทบาทและสิทธิ์ปัจจุบัน</p>
            </div>
          </div>

          {visibleSystems.length ? (
            <div className={`home-system-grid ${countClass}`}>
              {visibleSystems.map((system) => {
                const Icon = system.icon;
                const landing = systemLandingForUser(system, userContext);
                const descriptionId = `system-description-${system.key}`;
                return (
                  <Link
                    key={system.key}
                    href={landing}
                    className="home-system-card glass-panel"
                    aria-describedby={descriptionId}
                    onClick={() => rememberSystem(system.key)}
                  >
                    <span className="home-system-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span>
                    <span className="home-system-copy">
                      <strong>{system.label}</strong>
                      <span id={descriptionId}>{system.description}</span>
                    </span>
                    <span className="home-system-enter">เข้าใช้งาน <ArrowRight size={16} aria-hidden="true" /></span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={Boxes}>
              <strong>ยังไม่มีระบบที่บัญชีนี้เข้าถึงได้</strong>
              <span>ติดต่อผู้ดูแลระบบเพื่อตรวจสอบบทบาทและสิทธิ์การใช้งาน</span>
            </EmptyState>
          )}
        </section>

        <footer className="home-hub-footer">
          <span>Settings เป็นการตั้งค่าส่วนกลางและไม่อยู่ภายใต้ระบบธุรกิจใด</span>
          <Link href="/settings">เปิดการตั้งค่าส่วนกลาง <ArrowRight size={14} /></Link>
        </footer>
      </div>

      <ChangePasswordModal
        open={mustChangePwd}
        forced={mustChangePwd}
        onChanged={() => setMustChangePwd(false)}
      />
    </main>
  );
}
