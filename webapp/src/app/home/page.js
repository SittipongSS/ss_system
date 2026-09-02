"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LayoutGrid, LogOut, Settings, ShieldCheck, TriangleAlert, UserRound, Users } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";
import { apiCache } from "@/lib/apiCache";
import { canUser, normalizeRole, userTeams, ROLE_LABELS, TEAM_LABELS } from "@/lib/permissions";
import { devBypassUser } from "@/lib/devBypass";
import { fmtName } from "@/lib/format";
import {
  recentSystemForUser,
  RECENT_SYSTEM_STORAGE_KEY,
  SYSTEM_DISABLED_NOTE,
  systemLandingForUser,
  systemsForUser,
} from "@/config/systems";
import useNavCounts, { navCountForSystem } from "@/lib/nav/useNavCounts";
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
  /* หน้านี้อยู่นอก `AppLayout` (ไม่มีแถบเมนู) จึงต้องเรียกฮุกเอง — ส่ง "/home" คงที่
     เพราะไม่มีการเปลี่ยนหน้าภายในหน้านี้ ตัวฮุกยังดึงตอน mount และทุก 2 นาทีตามเดิม */
  const navCounts = useNavCounts("/home");

  const loadSession = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    if (!SUPABASE_CONFIGURED) {
      /* 🐞 เดิมตรึง `ae_supervisor` ไว้ตรงนี้ ⇒ **สวมบทบาทตอน UAT แล้วหน้าแรกไม่เปลี่ยน**
         (แถบเมนูใน `AppLayout` เชื่อ `NEXT_PUBLIC_DEV_BYPASS_ROLE` แต่การ์ดระบบหน้านี้
         ไม่เชื่อ) ⇒ ได้จอที่การ์ดกับเมนูเล่าคนละเรื่อง ซึ่งเป็นอาการเดียวกับที่คอมเมนต์
         ของ `devBypass.js` เตือนไว้ว่า "UAT ที่เชื่อไม่ได้" · ใช้ตัวประกอบผู้ใช้ตัวเดียวกัน */
      const bypass = devBypassUser({
        NEXT_PUBLIC_DEV_BYPASS_ROLE: process.env.NEXT_PUBLIC_DEV_BYPASS_ROLE,
        NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT: process.env.NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT,
        NEXT_PUBLIC_DEV_BYPASS_TEAM: process.env.NEXT_PUBLIC_DEV_BYPASS_TEAM,
      });
      setSession({
        role: bypass.role,
        team: bypass.team,
        teams: bypass.teams,
        department: bypass.department,
        extraCaps: [],
        userName: bypass.name,
      });
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
        role: normalizeRole(user.app_metadata?.role) || "user",
        team: user.app_metadata?.team || null,
        // ทุกทีมที่สังกัด — การ์ดระบบบางใบกั้นด้วยทีม (สหมิตร = KA) ขาดช่องนี้แล้ว
        // คนที่ KA เป็นทีมรองจะไม่เห็นการ์ด ทั้งที่กดเข้าหน้าและ API ผ่าน
        teams: userTeams(user.app_metadata),
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
  const openSystems = visibleSystems.filter((system) => !system.disabled);
  const disabledCount = visibleSystems.length - openSystems.length;

  return (
    <main className="home-hub">
      <div className="home-hub-shell">
        <header className="home-hub-topbar">
          <Link href="/home" className="home-hub-brand-link" aria-label="ระบบสุข · SUK">
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
            <span className="home-hub-eyebrow">ศูนย์รวมการทำงานระบบสุข</span>
            <h1 id="home-greeting">สวัสดี {session.userName}</h1>
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
                  className="btn btn-primary"
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
              {/* นับเฉพาะระบบที่เปิดอยู่ — ระบบที่ยังไม่เปิดยังโชว์การ์ดจาง ๆ อยู่
                  แต่ถ้านับรวมเข้าไปด้วย ตัวเลขจะไม่ตรงกับจำนวนการ์ดที่กดได้จริง */}
              <p>
                {openSystems.length} พื้นที่ทำงานตามบทบาทและสิทธิ์ปัจจุบัน
                {disabledCount > 0 && ` · อีก ${disabledCount} ระบบ${SYSTEM_DISABLED_NOTE}`}
              </p>
            </div>
          </div>

          {visibleSystems.length ? (
            <div className={`home-system-grid ${countClass}`}>
              {visibleSystems.map((system) => {
                const Icon = system.icon;
                const landing = systemLandingForUser(system, userContext);
                const descriptionId = `system-description-${system.key}`;
                // คลาสการ์ดเขียนที่เดียวแล้วใช้ทั้งสองสาขา — เขียนซ้ำเมื่อไร งบ
                // `legacySurface` ของ `glass-panel` (scripts/uiLegacyBudget.mjs) ขึ้น 1
                // แล้ว `npm run audit:ui` ดับ เพราะเพดานขึ้นไม่ได้ ลงได้อย่างเดียว
                const cardClass = `home-system-card glass-panel${system.disabled ? ' is-disabled' : ''}`;
                /* ⭐ ป้าย "รอคุณ N" บนการ์ด (2026-08-12) — หน้านี้คือจุดตัดสินใจว่าจะเข้า
                   ระบบไหนก่อน แต่เดิมทุกการ์ดหน้าตาเหมือนกันหมดไม่ว่ามีงานค้างหรือไม่
                   ⚠️ **มีคำกำกับ ไม่ใช่ตัวเลขเปล่าแบบบนเมนู** — บนเมนู ป้ายเกาะชื่อเมนูที่
                   บอกอยู่แล้วว่าเป็นงานอะไร ส่วนบนการ์ดใหญ่ ตัวเลขลอย ๆ อ่านได้หลายอย่าง
                   (จำนวนเมนู? เวอร์ชัน?) · ใช้ทรงชิปตัวเดียวกับชิปบทบาทในหัวหน้านี้ */
                const systemCount = navCountForSystem(navCounts, system.key);
                const body = (
                  <>
                    <span className="home-system-head">
                      <span className="home-system-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span>
                      {systemCount ? (
                        <span className="chip home-system-count">รอคุณ {systemCount > 99 ? '99+' : systemCount}</span>
                      ) : null}
                    </span>
                    <span className="home-system-copy">
                      <strong>{system.label}</strong>
                      <span id={descriptionId}>{system.description}</span>
                    </span>
                  </>
                );

                // ระบบที่ยังไม่เปิด — การ์ดยังอยู่ครบแต่กดไม่ได้ · ใช้ <div> ไม่ใช่ <Link>
                // ที่ปิดด้วย CSS เพราะ pointer-events ไม่กัน Enter บนคีย์บอร์ดกับเมนู
                // "เปิดในแท็บใหม่" ของเบราว์เซอร์ — ลิงก์ที่ยังอยู่ใน DOM คือลิงก์ที่กดได้
                if (system.disabled) {
                  return (
                    <div
                      key={system.key}
                      className={cardClass}
                      aria-describedby={descriptionId}
                    >
                      {body}
                      <span className="home-system-enter">{SYSTEM_DISABLED_NOTE}</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={system.key}
                    href={landing}
                    className={cardClass}
                    aria-describedby={descriptionId}
                    onClick={() => rememberSystem(system.key)}
                  >
                    {body}
                    <span className="home-system-enter">เข้าใช้งาน <ArrowRight size={16} aria-hidden="true" /></span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={LayoutGrid}>
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
