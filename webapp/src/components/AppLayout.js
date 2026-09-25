"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { activeSalesTeams, salesTeamLabel, useSalesTeams } from "@/lib/master/salesTeamRegistry";
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, LifeBuoy, LogOut, Moon, Sun, ChevronDown, ChevronRight, KeyRound, LayoutDashboard, MoreHorizontal, X, Settings as SettingsIcon, UserRound, Menu } from 'lucide-react';

import { createClient } from '@/lib/supabaseBrowser';
import { apiCache } from '@/lib/apiCache';
import { devBypassUser } from '@/lib/devBypass';
import { departmentFor, isSuperuser, normalizeDepartment, normalizeRole, userTeams, ROLE_LABELS, TEAM_ROLES } from '@/lib/permissions';
import { fmtName } from '@/lib/format';
import { RoleContext, TeamContext, TeamsContext, ExtraCapsContext, DepartmentContext } from '@/lib/roleContext';
import BrandMark from '@/components/BrandMark';
import AccountMenu from '@/components/AccountMenu';
import MobileBottomNav from '@/components/MobileBottomNav';
import NotificationBell from '@/components/notifications/NotificationBell';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import useNavCounts, { NavCountsContext, navCountFor, navCountForSystem, navHrefFor } from '@/lib/nav/useNavCounts';
import { isSettingsPathname, shellFlagsFor, systemForPathname } from '@/config/navigation';
import { menuGroupsForUser } from '@/config/menuRegistry';
import { settingsMenuItems } from '@/config/settingsNav';
import useScrollTopOnNavigate from '@/lib/ui/useScrollTopOnNavigate';
import { TooltipHost } from '@/components/ui/Tooltip';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { authOutcome } from '@/lib/authOutcome';
import { getSystemByKey, RECENT_SYSTEM_STORAGE_KEY, SYSTEM_DISABLED_NOTE, systemLandingForUser, systemsForUser } from '@/config/systems';
import { DetailPinBar, DetailPinProvider } from "@/lib/ui/detailPin";
import ForceRefreshWatcher from "@/components/ForceRefreshWatcher";

/* 🪤 สองค่านี้ต้องเป็น "ตรงข้าม" ของจุดตัดใน globals.css เป๊ะ ๆ — CSS รู้เรื่องนี้
   เองไม่ได้เพราะมันคือ **พฤติกรรมของปุ่ม** ไม่ใช่หน้าตา:
   · เหนือ 1200px ปุ่มย่อ/กางไปสลับ "ความชอบถาวร" · ต่ำกว่านั้นไป "เปิด/ปิดชั่วคราว"
   · ≤768px ไม่มีแถบข้างเลย ใช้แถบล่างแทน
   (1200 + 0.02 = ค่าถัดไปที่ CSS ถือว่าพ้น `@media (max-width: 1200px)`) */
const SIDENAV_BOTTOM_QUERY = '(max-width: 768px)';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// (ตัด prefetch หลัง login ออก — มติผู้ใช้ 2026-07-17 เรื่องลด traffic: เดิมอุ่น
// cache ด้วยการดาวน์โหลด products/customers/orders/registrations "ทั้งตารางเต็ม
// ทุกคอลัมน์" ทุกครั้งที่เข้าระบบ แม้ผู้ใช้ไม่เคยเปิดหน้าเหล่านั้นเลย = จ่าย egress
// ฟรีทุก login. ตอนนี้แต่ละหน้า fetch เองตอนเปิดครั้งแรกแล้วแคชแบบ SWR ตามเดิม —
// ช้าลงเฉพาะคลิกแรกของหน้านั้น ๆ ไม่ใช่ทุกการเข้าระบบ)


// เฟส T (Sales Revamp §5.1): navigation ทั้งระบบเป็น top bar 2 ชั้นตรึงบนสุด —
// ชั้นระบบ (โลโก้ navy + ตัวสลับระบบ + user actions) และชั้นเมนูของระบบปัจจุบัน
// (แนวนอน, จอแคบเลื่อนข้างได้). แทน sidebar เดิมทั้งหมด — เนื้อหาได้เต็มความกว้างจอ.
/* เปลือกตอนยังไม่มีเมนูให้วาด — โหลดอยู่ หรืออ่านตัวตนไม่สำเร็จชั่วคราว
   ⭐ คงแถบบนกรมท่ากับโลโก้ไว้เสมอ เพื่อไม่ให้หัวกระพริบหายตอนเปลี่ยนหน้า
   ⚠️ กล่อง error ต้องมีทางออกสองทาง — "ลองใหม่" กับ "กลับไปหน้าเข้าสู่ระบบ"
      ไม่งั้นคนที่เน็ตสะดุดจะติดอยู่กับจอที่กดอะไรไม่ได้เลย */
function ShellState({ kind, busy, onRetry, onLogin }) {
  const errorRef = useRef(null);
  /* โฟกัสต้องไม่หายตอนสลับสถานะ — คนใช้คีย์บอร์ดที่กด "ลองใหม่" แล้วปุ่มหายไปจะตกไปที่
     <body> ต้องไล่ Tab จากต้นเอกสารใหม่ · พาโฟกัสมาที่กล่องแทนเมื่อกล่อง error โผล่ */
  useEffect(() => {
    if (kind === 'error') errorRef.current?.focus({ preventScroll: true });
  }, [kind]);
  return (
    <div className="app-container">
      <header className="topnav">
        <div className="topnav-system">
          <span className="topnav-brand">
            <BrandMark height={34} className="topnav-brand-img" />
          </span>
        </div>
      </header>
      <div className="app-body">
        <main className="main-content">
          {/* ⭐ live region ตัวเดียวอยู่ตลอดทั้งสองสถานะ — ถ้าประกาศไว้ในสาขาที่ถูก unmount
              โปรแกรมอ่านจอจะไม่ได้ยินอะไรเลยตอนสลับจาก "กำลังโหลด" เป็น "เปิดไม่ได้" */}
          <div className="page" role="status" aria-live="polite">
            {kind === 'error' ? (
              <div ref={errorRef} tabIndex={-1} className="shell-state-error">
                <EmptyState icon={LifeBuoy}>
                  <strong>เปิดหน้าไม่ได้ตอนนี้</strong>
                  <span>อ่านข้อมูลผู้ใช้ไม่สำเร็จ อาจเป็นเพราะสัญญาณเน็ตหลุดชั่วครู่ ลองใหม่อีกครั้งได้เลย</span>
                  <span className="shell-state-actions">
                    {/* กดแล้วปุ่มยังอยู่ (แค่ดับชั่วคราว) ⇒ โฟกัสไม่หายกลางคัน */}
                    <Button tone="primary" size="sm" onClick={onRetry} disabled={busy}>
                      {busy ? 'กำลังลองใหม่…' : 'ลองใหม่'}
                    </Button>
                    <Button tone="ghost" size="sm" onClick={onLogin} disabled={busy}>กลับไปหน้าเข้าสู่ระบบ</Button>
                  </span>
                </EmptyState>
              </div>
            ) : (
              <div className="shell-state-loading">
                <span className="sr-only">กำลังเปิดหน้า</span>
                <Skeleton height={28} width="40%" />
                <Skeleton height={18} width="70%" />
                <Skeleton height={18} width="55%" />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  // เปลี่ยนหน้าจากเมนูแล้วจอเคยค้างที่เดิม — ดูเหตุผลใน useScrollTopOnNavigate
  useScrollTopOnNavigate();
  /* ⭐ **เปลือกเป็นเจ้าของการโหลดทะเบียนทีม** — เปลือกอยู่ทุกหน้า ⇒ โหลดที่นี่ครั้งเดียว
     แล้วสแนปช็อตในโมดูลอุ่นให้ทุกจอที่เรียก `teamLabelNow()` (ตัวช่วยที่เรียก hook ไม่ได้)
     ⚠️ ถอด hook บรรทัดนี้ออกเมื่อไร ทุกจอที่ใช้ `teamLabelNow` จะค้างที่รหัสทีม
     จนกว่าจะมีอย่างอื่นบังคับให้เรนเดอร์ใหม่ */
  const teamRegistry = useSalesTeams();
  const [role, setRole] = useState(null);
  const [team, setTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [department, setDepartment] = useState(null); // ฝ่ายของผู้ใช้ (SA/RD/PC/...)
  const [extraCaps, setExtraCaps] = useState(null); // per-user RA/margin grants
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [isDark, setIsDark] = useState(false);
  // ป้ายจำนวน "รอคุณทำ" บนเมนู — คีย์ที่ผู้ใช้ไม่มีสิทธิ์เห็นไม่ถูกส่งมาเลย
  const navCountsState = useNavCounts(pathname);
  const navCounts = navCountsState.counts;
  const [activeSystem, setActiveSystem] = useState('tax');
  const [sysMenuOpen, setSysMenuOpen] = useState(false); // dropdown สลับระบบ
  /* ระบบที่กางเมนูย่อยค้างอยู่ในดรอปดาวน์ (มติผู้ใช้ 2026-08-23) — ทีละระบบเท่านั้น
     เก็บเป็น key ไม่ใช่ boolean ต่อแถว เพราะกางสองระบบพร้อมกันคือแผงยาวเลยจอ */
  const [openSystem, setOpenSystem] = useState(null);
  /* ⭐ **แถบระบบบนหัวสำหรับจอกว้าง** (มติผู้ใช้ 2026-08-25) — ทุกระบบที่คนคนนี้เข้าได้
     เรียงอยู่บนแถบบน กดชื่อระบบแล้วเมนูของระบบนั้นกางลงมาเป็นดรอปดาวน์
     ⚠️ **กดชื่อระบบไม่ย้ายหน้า** (มติเดียวกัน) — มันเปิดเมนูให้เลือกเท่านั้น จึงต้อง
     มีแถวแรกในดรอปดาวน์ที่พาไปหน้าแรกของระบบ ไม่งั้นไปหน้านั้นไม่ได้เลย
     ⚠️ คนละ state กับ `openSystem` ของดรอปดาวน์สลับระบบ — สองตัวนี้ไม่เคยโผล่
     พร้อมกัน (คนละชั้นจอ) แต่ใช้ตัวแปรร่วมกันเมื่อไร ค่าค้างของอีกฝั่งจะทำให้เมนู
     กางเองตอนสลับความกว้างจอ */
  const [openBarSystem, setOpenBarSystem] = useState(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  /* ⭐ **ไม่มีแถบข้างประจำที่แล้วทุกความกว้าง** (มติผู้ใช้ 2026-08-25) — เมนูของระบบ
     มาเป็นลิ้นชักที่เปิดจากแฮมเบอร์เกอร์บนหัว แล้วลอยทับเนื้อหา
     สองชั้นจอเท่านั้น: >768 แฮมเบอร์เกอร์เปิดลิ้นชัก · ≤768 แถบล่างมือถือ
     ⚠️ เดิมมีสามชั้น (กาง 240px ดันเนื้อหา · ราง 56px · ลิ้นชัก) พร้อมความชอบถาวร
     ที่ `data-sidenav` + localStorage — ตัดทิ้งทั้งชุดเพราะแถบกินความกว้างเนื้อหา
     ตลอดเวลาเพื่อสิ่งที่คนดูไม่ได้อ่านระหว่างทำงาน (ตารางกว้างเป็นเรื่องหลักของ
     ระบบนี้) ⇒ เหลือสถานะเดียว
     · `navOpen` = การกางชั่วคราว ไม่เก็บถาวร ปิดเองเมื่อเปลี่ยนหน้า */
  const [navOpen, setNavOpen] = useState(false);
  const sysMenuRef = useRef(null);
  const sysBarRef = useRef(null);

  /* ⚠️ ต้องประกาศ **ก่อน** effect ที่ตัดสินเปลือกระบบข้างล่าง — ตั้งแต่มติ 2026-08-22
     เปลือกของเอกสารร่วมเดินตาม *คนดู* ไม่ใช่ตาม URL อย่างเดียวอีกต่อไป
     ⚠️ ค่าเป็น null ทั้งหมดหนึ่งเฟรมแรกเสมอ (auth ยังไม่กลับ) ⇒ effect ต้องมี
     `role`/`department` อยู่ใน dependency ไม่งั้นเปลือกค้างที่ผลลัพธ์ของเฟรมนั้น */
  const userContext = { role, team, teams, department, extraCaps };

  // Self-service password change (any signed-in user, their own account only).
  const [showPwd, setShowPwd] = useState(false);
  const [mustChangePwd, setMustChangePwd] = useState(false); // forced on first login
  // อ่านตัวตนไม่สำเร็จแบบชั่วคราว (เน็ต/เซิร์ฟเวอร์) — ต่างจาก "ไม่มีสิทธิ์" ที่ต้องเด้งออก
  const [authError, setAuthError] = useState(false);
  // กำลังลองใหม่อยู่ — คงจอ error ไว้ (พร้อมปุ่มที่ดับ) แทนที่จะสลับไปจอโหลดแล้วโฟกัสหาย
  const [authRetrying, setAuthRetrying] = useState(false);

  useEffect(() => {
    // Load theme (independent of auth)
    if (document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark') {
      setIsDark(true);
    }
  }, []);

  /* อ่านตัวตนของคนที่ล็อกอิน — แยกออกมาเป็นฟังก์ชันเพื่อให้ปุ่ม "ลองใหม่" เรียกซ้ำได้
     🐞 ของเดิมเป็น `.then(({ data: { user } }) => { if (!user) router.replace('/') })`
        ไม่ดู `error` ไม่มี `.catch` ⇒ เน็ตสะดุดหนึ่งครั้ง = เด้งออกหน้าล็อกอินทั้งที่
        session ยังดีอยู่ · ตัวตัดสินอยู่ที่ `lib/authOutcome.js` (เทสต์ครบทุกสาขา) */
  const loadUser = useCallback(async ({ retry = false } = {}) => {
    if (retry) setAuthRetrying(true);
    // Auth: read the signed-in user from Supabase. If Supabase isn't configured
    // yet (local dev before setup), fall back to a permissive local session.
    if (!SUPABASE_CONFIGURED) {
      /* ⚠️ ต้องอ่านจากตัวเดียวกับฝั่ง server (`lib/devBypass.js`) — ถ้าสองฝั่งคิดว่า
         เป็นคนละคน จะได้หน้าจอที่ปุ่มหายแต่ API ยอม (หรือกลับกัน) ซึ่ง UAT เชื่อไม่ได้ */
      const bypass = devBypassUser({
        NEXT_PUBLIC_DEV_BYPASS_ROLE: process.env.NEXT_PUBLIC_DEV_BYPASS_ROLE,
        NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT: process.env.NEXT_PUBLIC_DEV_BYPASS_DEPARTMENT,
        NEXT_PUBLIC_DEV_BYPASS_TEAM: process.env.NEXT_PUBLIC_DEV_BYPASS_TEAM,
      });
      setRole(bypass.role);
      setDepartment(bypass.department);
      setTeam(bypass.team);
      setTeams(bypass.teams);
      setUserName('Local D.');
      setUserInitials('LD');
      setAuthRetrying(false);
      return;
    }
    const supabase = createClient();
    let result;
    try {
      const { data, error } = await supabase.auth.getUser();
      result = { user: data?.user ?? null, error };
    } catch (thrown) {
      result = { thrown };
    }
    const outcome = authOutcome(result);
    setAuthRetrying(false);
    if (outcome === 'retry') { setAuthError(true); return; }
    setAuthError(false);
    if (outcome === 'login') { router.replace('/'); return; }
    {
      const user = result.user;
      // ชื่อแสดงผล = มาตรฐาน "ชื่อ + นามสกุลย่อ" (§2.1) จาก helper กลาง.
      const meta = user.user_metadata || {};
      const dName = fmtName({ ...meta, email: user.email });
      const fn = (meta.firstName || '').trim();
      const ln = (meta.lastName || '').trim();
      let inits;
      if (fn) {
        inits = `${fn.charAt(0)}${ln ? ln.charAt(0) : ''}`.toUpperCase();
      } else {
        const nm = (meta.name || user.email || 'user').trim();
        const parts = nm.split(/\s+/);
        inits = parts.length > 1
          ? `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase()
          : nm.substring(0, 2).toUpperCase();
      }

      // Role + team come from app_metadata (service-role-only; users cannot self-edit it).
      // team = ทีมหลัก (attribution) · teams = ทุกทีมที่สังกัด (ขอบเขตแถว) — คนอยู่หลายทีมได้
      setRole(normalizeRole(user.app_metadata?.role) || 'user');
      setTeam(user.app_metadata?.team || null);
      setTeams(userTeams({ team: user.app_metadata?.team, teams: user.app_metadata?.teams }));
      // ฝ่าย: กติกาเดียวกับ server (assignable-users) — department ตรง หรืออนุมานจาก role
      setDepartment(normalizeDepartment(user.app_metadata?.department) || departmentFor(normalizeRole(user.app_metadata?.role)) || null);
      setExtraCaps(Array.isArray(user.app_metadata?.extraCaps) ? user.app_metadata.extraCaps : []);
      // Force a password change on first login / after an admin reset.
      setMustChangePwd(!!user.app_metadata?.must_change_password);
      setUserName(dName);
      setUserInitials(inits);
      try { localStorage.setItem('userName', dName); } catch {}
      // ⭐ id ของคนที่ล็อกอิน — หน้า/โมดัลที่ต้อง "รู้ว่าฉันคือใคร" ต้องใช้ช่องนี้
      // ไม่ใช่ `userName` เพราะ `userName` เป็นชื่อ**ย่อ** (fmtName → "Sittipong K.")
      // ที่เอาไปเทียบ/บันทึกเป็นชื่อเต็มไม่ได้ — ของจริงบน prod มีโครงการ 11 ใบที่
      // `aeOwner` ถูกเขียนเป็นชื่อย่อจากช่องนี้จน `aeOwnerId` ว่างทั้งหมด
      try { localStorage.setItem('userId', user.id); } catch {}
    }
  }, [router]);

  useEffect(() => { loadUser(); }, [loadUser]);

  useEffect(() => {
    const onProfileUpdated = (event) => {
      const profile = event.detail || {};
      const dName = fmtName(profile) || profile.email || userName;
      const firstName = String(profile.firstName || '').trim();
      const lastName = String(profile.lastName || '').trim();
      const initials = firstName
        ? `${firstName.charAt(0)}${lastName ? lastName.charAt(0) : ''}`.toUpperCase()
        : String(profile.email || dName || 'U').slice(0, 2).toUpperCase();
      setUserName(dName);
      setUserInitials(initials);
      try { localStorage.setItem('userName', dName); } catch {}
    };
    window.addEventListener('account-profile-updated', onProfileUpdated);
    return () => window.removeEventListener('account-profile-updated', onProfileUpdated);
  }, [userName]);

  useEffect(() => {
    const sys = systemForPathname(pathname, userContext);

    if (sys) setActiveSystem(sys);
    else {
      /* หน้าที่ไม่ได้เป็นของระบบไหน (กล่องแจ้งเตือน — รวมของทุกระบบไว้กองเดียว)
         ⚠️ เดินมาจากในแอปแล้วปล่อยผ่านเฉย ๆ ได้ เพราะ state เดิมยังอยู่ **แต่เปิด
         จาก URL ตรง ๆ ไม่ได้** — ค่าตั้งต้นของ state คือ 'tax' ⇒ หน้าจะสวมเมนู
         ภาษีสรรพสามิตให้คนที่ไม่เคยเข้าระบบนั้นเลย · ถอยไปที่ระบบล่าสุดที่จำไว้แทน */
      try {
        const recent = localStorage.getItem(RECENT_SYSTEM_STORAGE_KEY);
        if (recent && getSystemByKey(recent)) setActiveSystem(recent);
      } catch { /* โหมดส่วนตัว — คงเปลือกเดิมไว้ */ }
    }
    /* ⚠️ **เขียนความจำเฉพาะระบบที่คนคนนี้เข้าถึงได้จริง** (มติผู้ใช้ 2026-08-22)
       🐞 เดิมเขียนทุกครั้งที่เดินผ่าน ⇒ ฝ่ายบัญชีกดดูใบสั่งขายหนึ่งครั้ง
       `ss:last-system` กลายเป็น `salesplan` ถาวร แล้วการ์ด "ทำงานต่อ" ที่หน้าแรก
       (`recentSystemForUser`) กับเปลือกของหน้าที่ไม่เป็นของระบบไหน (`/notifications`
       · `/account` ซึ่งถอยมาอ่านค่านี้) พาเขาไปยืนในบ้านฝ่ายขายตามไปด้วยทั้งหมด */
    if (getSystemByKey(sys) && systemsForUser(userContext).some((system) => system.key === sys)) {
      try { localStorage.setItem(RECENT_SYSTEM_STORAGE_KEY, sys); } catch {}
    }
    setSysMenuOpen(false); // navigating closes the system dropdown
    setOpenSystem(null);
    setOpenBarSystem(null);
    setMobileMoreOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, role, department, extraCaps]);

  // ปิด dropdown สลับระบบเมื่อคลิกนอกเมนู
  useEffect(() => {
    if (!sysMenuOpen) return;
    const onDown = (e) => {
      if (sysMenuRef.current && !sysMenuRef.current.contains(e.target)) { setSysMenuOpen(false); setOpenSystem(null); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sysMenuOpen]);

  /* ปิดเมนูของแถบระบบเมื่อคลิกนอกแถบหรือกด Esc — ท่าเดียวกับดรอปดาวน์สลับระบบ */
  useEffect(() => {
    if (!openBarSystem) return undefined;
    const onDown = (e) => {
      if (sysBarRef.current && !sysBarRef.current.contains(e.target)) setOpenBarSystem(null);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpenBarSystem(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openBarSystem]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => { if (event.key === 'Escape') setMobileMoreOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileMoreOpen]);

  // (เดิมมี effect เลื่อนแถบล่างหาปุ่ม active — ตัดออกแล้ว: แถบล่างไม่เลื่อนอีกต่อไป
  //  ปุ่มพอดีจอ 4+เพิ่มเติม ตามมติ 2026-07-18)

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.theme = 'light';
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.theme = 'dark';
      setIsDark(true);
    }
  };

  /* ข้ามไปชั้นจอมือถือเมื่อไร ให้ล้างการกางทิ้ง — แถบล่างเข้ามาแทน ลิ้นชักที่ยัง
     ค้างว่าเปิดอยู่จะทำให้ปุ่มครั้งต่อไปไปปิดของที่มองไม่เห็น */
  useEffect(() => {
    const bottom = window.matchMedia(SIDENAV_BOTTOM_QUERY);
    const sync = () => setNavOpen(false);
    bottom.addEventListener('change', sync);
    return () => bottom.removeEventListener('change', sync);
  }, []);

  const toggleSideNav = () => setNavOpen((open) => !open);

  /* แถบที่กางทับเนื้อหาต้องปิดเองเมื่อไปหน้าใหม่ — ไม่งั้นคลิกเมนูแล้วหน้าเปลี่ยน
     อยู่ข้างหลังโดยมีแถบกับฉากหลังบังไว้ ผู้ใช้ต้องกดปิดเองทุกครั้ง */
  useEffect(() => { setNavOpen(false); }, [pathname]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setNavOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const handleLogout = async () => {
    if (SUPABASE_CONFIGURED) {
      try {
        await createClient().auth.signOut();
      } catch {}
    }
    apiCache.clear(); // don't leak the outgoing user's cached data to the next login
    // ตัวตนของคนที่ออกไปต้องไม่ค้างให้คนถัดไปหยิบไปใช้ก่อน getUser() จะตอบ
    try { localStorage.removeItem('userId'); localStorage.removeItem('userName'); } catch {}
    router.replace('/');
  };

  /* 🐞 เดิมเป็น `if (!role) return null` ⇒ ระหว่างอ่าน session จอ **ว่างเปล่า** ไม่มี
     แม้แต่หัวเว็บ · และถ้าอ่านไม่สำเร็จเพราะเน็ต จอก็ว่างค้างอยู่อย่างนั้น
     (หน้าแรกเดิมมีสองสถานะนี้ของตัวเอง — ย้ายมาอยู่ที่เปลือกชุดเดียวตาม ADR 0016) */
  if (authError) {
    return (
      <ShellState
        kind="error"
        busy={authRetrying}
        onRetry={() => loadUser({ retry: true })}
        onLogin={async () => {
          // ล้างเฉพาะเครื่องนี้ — session ฝั่ง server อาจยังดีอยู่ ไม่ต้องไปไล่ปิดให้
          try { await createClient().auth.signOut({ scope: 'local' }); } catch {}
          router.replace('/');
        }}
      />
    );
  }
  if (!role) return <ShellState kind="loading" />;


  /* หน้าไหนมีเปลือกแบบไหน — ตอบที่เดียวใน `config/navigation` (ADR 0016)
     `/home` ไม่มีเมนูของระบบ ไม่มีตัวสลับระบบ ไม่มีแถวระบบ และไม่มีตัวเลขบนหัว */
  const flags = shellFlagsFor(pathname);

  // department จำเป็นสำหรับเมนูที่ cap อย่างเดียวกว้างเกิน แล้วต้องแคบด้วยฝ่าย
  // (เช่น ใบขอราคาผลิต — ฝ่ายจัดซื้อใช้ role staff ร่วมกับ PD/WH/QC)
  const activeSystemDefinition = getSystemByKey(activeSystem);
  // หน้าบัญชีของฉันพูดชื่อตัวเอง ไม่ยืมชื่อระบบที่เพิ่งเดินออกมา (มติผู้ใช้ 2026-08-14)
  // — เปลือกเดียวกับหน้าตั้งค่า: หัวบอกว่าอยู่ไหน แถบเมนูของระบบหายไปทั้งแถบ
  const isAccountContext = pathname === '/account';
  const systemSubtitle = flags.homeHub
    ? 'หน้าแรก'
    : isAccountContext
    ? 'บัญชีของฉัน'
    : activeSystem === 'settings'
      ? 'การตั้งค่าระบบ'
      : (activeSystemDefinition?.label || 'ภาษีสรรพสามิต');

  // ระบบที่ผู้ใช้เข้าถึงได้ (ใช้ทั้ง dropdown สลับระบบ และกรองเมนูแถวล่าง).
  // ⭐ ทะเบียนเมนูอยู่ที่ `config/menuRegistry` ที่เดียว — หน้าแรก (ADR 0016) กางเมนู
  //    ของทุกระบบพร้อมกัน จึงต้องอ่านทะเบียนก้อนเดียวกับเปลือก ไม่ใช่สำเนาที่สอง
  const accessibleGroups = menuGroupsForUser(userContext);

  const currentGroup = accessibleGroups.find((g) => g.system === activeSystem) || null;
  const isSettingsContext = isSettingsPathname(pathname);
  // เปลือกไร้แถบเมนู (เหลือบัญชีของฉันหน้าเดียว) — ล้างเมนูทิ้งที่จุดเดียวตรงนี้
  // แล้วทั้งแถบข้าง แถบล่างมือถือ และแผ่นเมนู "เพิ่มเติม" ว่างตามกันหมด
  const isBareShell = flags.hideSystemMenu;
  /* ⭐ ตั้งค่าใช้แถบเดียวกับทุกระบบ (มติผู้ใช้ 2026-08-22) — รายการมาจากแผนที่
     `config/settingsNav` ไฟล์เดียวกับที่หน้าภาพรวมอ่าน ไม่ใช่รายการชุดที่สอง
     ⚠️ ต้องแยกสาขาตรงนี้เพราะ `allGroups` ไม่มีระบบ `settings` — เมนูตั้งค่าคุมด้วย
     `visible` ในแผนที่ ไม่ใช่ `cap` แบบระบบอื่น จึงยัดเข้า allGroups ตรง ๆ ไม่ได้ */
  const menuItems = isBareShell
    ? []
    : isSettingsContext
      ? settingsMenuItems(userContext)
      : (currentGroup?.items || []);
  /* ⭐ **ป้ายบอกตำแหน่งข้างโลโก้** (มติผู้ใช้ 2026-08-26 · แบบ ข จากม็อกสี่ตัวเลือก) —
     แถบระบบบอกได้แค่ว่าอยู่ *ระบบ* ไหน ไม่ได้บอกว่าอยู่ *เมนู* ไหนของระบบนั้น
     ⚠️ ใช้ `match` ของทะเบียนเมนูเอง ไม่ใช่เทียบ href ตรง ๆ — หน้ารายละเอียด
     (`/sa/deals/DEAL-x`) ต้องยังนับเป็นเมนู "ดีล" · เมนูตั้งค่ามี match ของตัวเอง
     ที่คิดจาก `activeSettingsHref` (ยาวสุดชนะ) อยู่แล้ว
     ⚠️ อันสุดท้ายที่แมตช์ชนะ — ทะเบียนเรียงจากกว้างไปแคบ (`/tax` ก่อน `/tax/registrations`)
     เอาอันแรกจะได้ชื่อกว้างเกินจริงในหน้าลูก */
  const hereItem = [...menuItems].reverse().find((item) => item.match(pathname)) || null;
  /* ที่ว่างข้างโลโก้ยาว ~900px จึงเป็นที่ของป้ายนี้ · ไม่มีเมนูที่แมตช์ (เช่น /home
     หรือเปลือกเปล่า) = ไม่ต้องมีป้าย ปล่อยว่างไว้เหมือนเดิม */
  const hereLabel = isBareShell ? null : hereItem?.name || null;
  /* ปลายทางของชื่อระบบบนป้ายบอกตำแหน่ง — กลุ่มปัจจุบันรู้ `home` ของตัวเองอยู่แล้ว
     (คิดจาก systemLandingForUser ตอนสร้าง accessibleGroups) · หน้าตั้งค่าใช้ /settings
     ตัวเดียวกับแถบระบบ · บัญชีของฉันยืนอยู่บนหน้านั้นเอง ไม่มีปลายทาง ⇒ เป็นข้อความ */
  const hereSystemHref = isAccountContext
    ? null
    : isSettingsContext
      ? '/settings'
      : currentGroup?.home || null;

  /* รายการที่วางบนแถบระบบของจอกว้าง = ระบบที่เข้าได้ทั้งหมด + "ตั้งค่า" เมื่อกำลัง
     อยู่ในนั้น (ตั้งค่าไม่ได้อยู่ใน allGroups — ดูเหตุผลที่ `menuItems` ข้างบน)
     ⚠️ ไม่เอา `isBareShell` — หน้าที่ไม่เป็นของระบบไหนต้องได้เปลือกเปล่าเหมือนเดิม */
  const barGroups = isBareShell
    ? []
    : isSettingsContext
      ? [...accessibleGroups, {
        system: 'settings',
        label: 'ตั้งค่า',
        icon: SettingsIcon,
        home: '/settings',
        items: settingsMenuItems(userContext),
      }]
      : accessibleGroups;
  /* แถบเมนูมีสองกลุ่ม: ลำดับงาน (ซ้าย) กับเครื่องมือ (ขวา ข้าง "วางเป้า")
     ⚠️ `menuItems` ยังเป็นก้อนเดียวสำหรับมือถือ — แผ่นเมนูล่างไม่มีสองฝั่งให้แบ่ง */
  const flowItems = menuItems.filter((item) => !item.utility);
  const utilityItems = menuItems.filter((item) => item.utility);
  const ActiveSystemIcon = isAccountContext
    ? UserRound
    : activeSystem === 'settings'
      ? SettingsIcon
      : (activeSystemDefinition?.icon || LayoutDashboard);

  /* ปุ่มเมนูหนึ่งชิ้น — ใช้ทั้งกลุ่มซ้าย (ลำดับงาน) และกลุ่มขวา (เครื่องมือ)
     ⚠️ เขียนที่เดียว: สองกลุ่มต่างกันแค่คลาส ถ้าก๊อปเป็นสองชุดมันจะเพี้ยนหากันแน่นอน */
  const renderMenuItem = (item, extraClass = '') => {
    const Icon = item.icon;
    const active = item.match(pathname);
    // เมนูที่ยังไม่เปิด — จางและกดไม่ได้ (ดูหมายเหตุที่นิยามเมนูใน allGroups)
    if (item.disabled) {
      return (
        <span key={item.href} aria-disabled="true" title={`${item.name} — ${SYSTEM_DISABLED_NOTE}`} className={`topnav-item is-disabled ${extraClass}`.trim()}>
          <Icon size={16} className="ico" />
          <span>{item.name}</span>
        </span>
      );
    }
    // ⚠️ ป้ายจำนวนขึ้นเฉพาะเมื่อ > 0 (navCountFor คืน null ให้ 0/ไม่มีสิทธิ์) —
    // ต่างจากแท็บในหน้าที่ต้องคง 0 ไว้กันแถวขยับ · แถวเมนูที่มี "0" เรียงกัน
    // ทั้งแถวคือของประดับที่ไม่มีใครอ่าน
    const count = navCountFor(navCounts, item.href);
    return (
      <Link
        href={navHrefFor(item, count)}
        key={item.href}
        className={`topnav-item ${active ? 'active' : ''} ${extraClass}`.trim()}
        // ⭐ ห้ามถอด — โหมดแถบข้างที่ย่อแล้วเหลือแต่ไอคอน ชื่อเมนูอยู่ในนี้ที่เดียว
        title={item.name}
        aria-label={count ? `${item.name} ${count} รายการรอคุณ` : undefined}
      >
        <Icon size={16} className="ico" />
        <span>{item.name}</span>
        {count ? <span className="topnav-count">{count > 99 ? '99+' : count}</span> : null}
      </Link>
    );
  };

  return (
    <div className={`app-container${navOpen ? ' sidenav-open' : ''}${isSettingsContext ? ' settings-context' : ''}${isAccountContext ? ' account-context' : ''}${flags.homeHub ? ' home-context' : ''}`}>
      {/* ── แถบระบบ: ตรึงบนสุดทุกความกว้าง (แถบเมนูของระบบย้ายไปอยู่นอก header) ── */}
      <header className="topnav">
        {/* หน้าแรกไม่มีเมนูบนหัวให้ข้าม แต่มีแผงเมนูยาวทั้งหน้า ⇒ ลิงก์ข้ามไปเนื้อหา
            เป็นชิ้นแรกของหัว (โผล่เมื่อโฟกัสด้วยคีย์บอร์ด) */}
        {flags.homeHub && <a className="topnav-skip" href="#home-main">ข้ามไปที่เมนูทุกระบบ</a>}
        {/* ชั้นระบบ: โลโก้ (พื้น navy ตามมาตรฐานแบรนด์) + สลับระบบ + user actions */}
        <div className="topnav-system">
          {/* ⭐ **ตัวคุมเมนูของระบบมีตัวเดียว อยู่บนหัว** (มติผู้ใช้ 2026-08-25) —
              ไม่มีแถบประจำที่ให้ปุ่มเกาะอีกแล้ว เมนูเป็นลิ้นชักที่เปิดจากปุ่มนี้
              ⚠️ คนละตัวกับ `…` (.mobile-top-more) ที่โผล่ ≤768px — ตัวนั้นเปิด
              "บัญชี/เครื่องมือ" ตัวนี้เปิด "เมนูของระบบ" */}
          {!isBareShell && (
            <button
              type="button"
              className="topnav-global-action sidenav-hamburger"
              onClick={toggleSideNav}
              aria-label={`เมนู${systemSubtitle}`}
              aria-expanded={navOpen}
              title={navOpen ? 'ปิดแถบเมนู' : 'เปิดแถบเมนู'}
            >
              {/* ☰ เปิด ↔ ✕ ปิด — สลับ **อยู่กับที่** ผู้ใช้จึงไม่ต้องย้ายสายตา
                  ไปหาปุ่มปิดที่อื่น */}
              <Menu className="sidenav-burger-open" size={20} aria-hidden="true" />
              <X className="sidenav-burger-close" size={20} aria-hidden="true" />
            </button>
          )}
          <Link
            href="/home"
            className="topnav-brand"
            title={flags.homeHub ? 'หน้าแรก' : 'หน้าแรก (สลับระบบ)'}
            aria-current={flags.homeHub ? 'page' : undefined}
          >
            {/* โลโก้ตัวเต็มมี wordmark ในภาพแล้ว (มติผู้ใช้ 2026-07-16) — ไม่ใส่ข้อความซ้ำ */}
            <BrandMark height={34} className="topnav-brand-img" />
          </Link>

          {/* ป้ายบอกตำแหน่ง "ระบบ › เมนู" · CSS ซ่อนเมื่อจอ ≤1200 เพราะชั้นจอนั้นมี
              ตัวสลับระบบกับลิ้นชักบอกตำแหน่งอยู่แล้ว และที่ว่างบนหัวไม่มีเหลือ
              ⭐ **ชื่อระบบกดได้ ชื่อเมนูไม่กด** (มติผู้ใช้ 2026-08-28 — กลับมติเดิม
              2026-08-26 ที่ให้ป้ายนี้เป็นข้อความล้วน) — ชื่อระบบพาไปหน้าแรกของระบบนั้น
              ซึ่งเป็นทางลัดที่คนคาดหวังจากป้ายทรงนี้อยู่แล้ว ส่วนชื่อเมนูคือหน้าที่ยืนอยู่
              กดแล้วไม่ไปไหน จึงไม่ทำให้กดได้
              ⚠️ ปลายทางมาจาก `home` ของกลุ่มเดียวกับที่ dropdown สลับระบบใช้ ไม่ใช่
              `/{system}` เดา ๆ — หน้าแรกของแต่ละคนไม่เหมือนกัน (systemLandingForUser) */}
          {hereLabel && (
            <div className="topnav-here" aria-live="polite">
              {hereSystemHref ? (
                <Link href={hereSystemHref} className="topnav-here-sys">{systemSubtitle}</Link>
              ) : (
                <span className="topnav-here-sys">{systemSubtitle}</span>
              )}
              <span className="topnav-here-sep" aria-hidden="true">›</span>
              <span className="topnav-here-page">{hereLabel}</span>
            </div>
          )}

          {/* ตัวสลับระบบ (≤1200) — หน้าแรกไม่วาดเลย เพราะแผงในหน้ากางเมนูทุกระบบอยู่แล้ว
              ⚠️ ต้องไม่วาด ไม่ใช่ซ่อนด้วย CSS — ซ่อนแล้วปุ่มยังอยู่ในลำดับ Tab และ
              โปรแกรมอ่านจอยังอ่านตัวเลขบนเมนูย่อย ซึ่ง ADR 0016 ห้ามบนหน้าแรก */}
          {!flags.hideSystemSwitcher && (
          <div className="topnav-sys" ref={sysMenuRef}>
            <button
              type="button"
              className="topnav-sys-btn"
              onClick={() => setSysMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sysMenuOpen}
            >
              <ActiveSystemIcon size={15} aria-hidden="true" />
              {/* span = ที่ตัดป้ายด้วย … บนจอแคบ (ellipsis ไม่ทำงานกับข้อความเปล่าในปุ่ม flex) */}
              <span className="topnav-sys-label">{systemSubtitle}</span>
              <ChevronDown size={14} strokeWidth={2.5} style={{ transform: sysMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--motion-medium)' }} />
            </button>
            {sysMenuOpen && (
              <div className="topnav-sys-menu" role="menu">
                <Link href="/home" role="menuitem" className={`topnav-sys-item ${pathname === '/home' ? 'active' : ''}`}>
                  <Home size={15} className="ico" /> หน้าแรก
                </Link>
                {accessibleGroups.map((g) => {
                  const SystemIcon = g.icon || LayoutDashboard;
                  // ระบบที่ยังไม่เปิด — อยู่ในรายการต่อไปแต่กดไม่ได้ · <span> ไม่ใช่ <Link>
                  // ที่ปิดด้วย CSS ด้วยเหตุผลเดียวกับแผงระบบบนหน้าแรก (ดู components/home/SystemMenuSheet.js)
                  if (g.disabled) {
                    return (
                      <span key={g.system} role="menuitem" aria-disabled="true" className="topnav-sys-item is-disabled">
                        <SystemIcon size={15} className="ico" /> {g.label}
                        <small className="nav-disabled-note">{SYSTEM_DISABLED_NOTE}</small>
                      </span>
                    );
                  }
                  /* ⭐ ยอดรวมของทั้งระบบ — เมนูนี้คือจุดที่คนเลือกว่า "จะไปทำอะไรต่อ"
                     แต่เดิมมันเงียบ ⇒ ต้องเข้าไปในระบบก่อนถึงจะรู้ว่ามีของค้างไหม
                     ⚠️ ระบบที่กำลังอยู่ก็ยังโชว์ — ตัวเลขคือ "เหลือเท่าไร" ไม่ใช่
                     "ที่อื่นมีอะไร" · ซ่อนตอน active แล้วเลขจะหายตอนเข้าไปดู */
                  const systemCount = navCountForSystem(navCounts, g.system);
                  /* ⭐ เมนูย่อยของแต่ละระบบ (มติผู้ใช้ 2026-08-23) — เดิมจะไปหน้าใด
                     หน้าหนึ่งของระบบอื่นต้องสลับระบบก่อนแล้วค่อยหาในแถบข้าง สองจังหวะ
                     ⚠️ **เป้ากดสองอัน ไม่ใช่อันเดียว**: กดชื่อระบบ = ไปหน้าแรกของระบบ
                     นั้น (พฤติกรรมเดิม ห้ามเสีย) · กดลูกศรถึงจะกางเมนู — รวมเป็นปุ่ม
                     เดียวเมื่อไร คนที่แค่อยากข้ามระบบจะต้องกางเมนูทิ้งทุกครั้ง
                     ⚠️ แถบข้างกับแถบล่างมือถือ **ยังอยู่เหมือนเดิม** ตัวนี้เป็นทางลัด
                     ข้ามระบบ ไม่ใช่ตัวแทน (ของเดิมบอก "ตอนนี้อยู่ไหน" ตลอดเวลา
                     โดยไม่ต้องกดเปิด ซึ่งดรอปดาวน์ทำแทนไม่ได้) */
                  const subOpen = openSystem === g.system;
                  return (
                    <div key={g.system} role="none" className={`topnav-sys-row${subOpen ? ' open' : ''}`}>
                      <Link
                        href={g.home}
                        role="menuitem"
                        className={`topnav-sys-item ${g.system === activeSystem ? 'active' : ''}`}
                        aria-label={systemCount ? `${g.label} ${systemCount} รายการรอคุณ` : undefined}
                        /* เมาส์ชี้แล้วกางเอง = ภาษาของ cascading menu ที่คนคุ้น · กัน
                           ด้วย (hover: hover) เพราะจอสัมผัสยิง mouseenter ตอนแตะด้วย
                           ⚠️ อ่าน matchMedia **สดตอนชี้** ไม่เก็บใส่ state — event
                           ที่คอยอัปเดต state พลาดได้ แต่เมนูต้องไม่พลาด */
                        onMouseEnter={() => {
                          if (g.items.length && window.matchMedia('(hover: hover)').matches) setOpenSystem(g.system);
                        }}
                      >
                        <SystemIcon size={15} className="ico" /> {g.label}
                        {systemCount ? <span className="topnav-count">{systemCount > 99 ? '99+' : systemCount}</span> : null}
                      </Link>
                      {g.items.length > 0 && (
                        <button
                          type="button"
                          className="topnav-sys-expand"
                          aria-expanded={subOpen}
                          aria-label={`เมนู${g.label}`}
                          onClick={() => setOpenSystem(subOpen ? null : g.system)}
                        >
                          <ChevronRight size={14} aria-hidden="true" />
                        </button>
                      )}
                      {subOpen && (
                        <div className="topnav-sys-sub" role="menu" aria-label={`เมนู${g.label}`}>
                          {g.items.map((item) => {
                            const ItemIcon = item.icon;
                            const count = navCountFor(navCounts, item.href);
                            if (item.disabled) {
                              return (
                                <span key={item.href} role="menuitem" aria-disabled="true" className="topnav-sys-item is-disabled">
                                  <ItemIcon size={15} className="ico" /> {item.name}
                                </span>
                              );
                            }
                            return (
                              <Link
                                key={item.href}
                                href={navHrefFor(item, count)}
                                role="menuitem"
                                className={`topnav-sys-item ${item.match(pathname) ? 'active' : ''}`}
                                aria-label={count ? `${item.name} ${count} รายการรอคุณ` : undefined}
                              >
                                <ItemIcon size={15} className="ico" /> {item.name}
                                {count ? <span className="topnav-count">{count > 99 ? '99+' : count}</span> : null}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}

          <button type="button" className="mobile-top-more" onClick={() => setMobileMoreOpen(true)} aria-label="เมนูเพิ่มเติม" aria-expanded={mobileMoreOpen}>
            <MoreHorizontal size={21} aria-hidden="true" />
          </button>

          <div className="topbar-actions">
            {/* กระดิ่งอยู่ก่อน "ตั้งค่า" — งานของคุณสำคัญกว่าเมนูตั้งค่า และตำแหน่ง
                ขวาสุดถูก AccountMenu จองไว้แล้ว */}
            <NotificationBell />
            <AccountMenu
              settingsActive={isSettingsContext}
              userName={userName}
              userInitials={userInitials}
              roleLabel={teams.length
                ? `${ROLE_LABELS[role] || role} · ${teams.map((t) => salesTeamLabel(teamRegistry, t)).join(' + ')}`
                : (ROLE_LABELS[role] || role)}
              roleTone={isSuperuser(role) || role === 'ra' || role === 'secretary' || role === 'executive' ? 'admin' : TEAM_ROLES.includes(role) ? 'editor' : 'viewer'}
              isDark={isDark}
              canChangePassword={SUPABASE_CONFIGURED}
              onToggleTheme={toggleTheme}
              onChangePassword={() => setShowPwd(true)}
              onLogout={handleLogout}
            />
          </div>
        </div>

        {/* ── แถบระบบของจอกว้าง (มติผู้ใช้ 2026-08-25) ─────────────────────────
            ทุกระบบที่คนคนนี้เข้าได้เรียงอยู่ตรงนี้ · กดชื่อระบบ = **กางเมนูของระบบ
            นั้น ไม่ใช่ย้ายหน้า** ⇒ ดูเมนูระบบอื่นได้โดยไม่หลุดจากงานที่ทำอยู่
            ⚠️ CSS ซ่อนทั้งแถบเมื่อจอ ≤1200 แล้วกลับไปใช้แฮมเบอร์เกอร์+ลิ้นชัก
            ⚠️ แถวแรกของดรอปดาวน์คือทางไปหน้าแรกของระบบ — ไม่มีแล้วจะไปหน้านั้น
            ไม่ได้เลย เพราะปุ่มบนแถบไม่พาไปไหน (ยกเว้นระบบที่เมนูมีหน้านั้นอยู่แล้ว) */}
        {!flags.hideSystemSwitcher && barGroups.length > 0 && (
          <nav className="topnav-systems" ref={sysBarRef} aria-label="ระบบทั้งหมด">
            {barGroups.map((g) => {
              const SystemIcon = g.icon || LayoutDashboard;
              const open = openBarSystem === g.system;
              const systemCount = navCountForSystem(navCounts, g.system);
              const isActive = g.system === activeSystem || (g.system === 'settings' && isSettingsContext);
              if (g.disabled) {
                return (
                  <span key={g.system} className="topnav-sysbar-btn is-disabled" aria-disabled="true" title={SYSTEM_DISABLED_NOTE}>
                    {g.label}
                  </span>
                );
              }
              /* ระบบที่เมนูมีหน้าแรกของตัวเองอยู่แล้ว (เช่น "ภาพรวม") ไม่ต้องมี
                 แถวพาไปหน้าแรกซ้ำอีกแถว
                 🐞 **ถามด้วย `match` ไม่ใช่เทียบ href** (ผู้ใช้ทัก 2026-08-26) —
                 บริหารงานขาย landing เป็น `/sa` แต่เมนู "ภาพรวม" มี href `/sa/dashboard`
                 (match ครอบ `/sa` ไว้แล้ว) ⇒ เทียบสตริงตรง ๆ แล้วไม่เจอ เลยงอกแถว
                 "ไปที่บริหารงานขาย" ขึ้นมาซ้ำกับ "ภาพรวม" ที่อยู่ใต้มันพอดี
                 ⚠️ เงื่อนไขนี้ยังต้องมี — ระบบที่ landing ไม่ได้อยู่ในเมนูของตัวเอง
                 จะไม่มีทางเข้าเลย เพราะปุ่มบนแถบไม่พาไปไหน */
              const hasHomeItem = g.items.some((item) => item.match(g.home));
              return (
                <div key={g.system} className={`topnav-sysbar-item${open ? ' open' : ''}`}>
                  <button
                    type="button"
                    className={`topnav-sysbar-btn${isActive ? ' active' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    onClick={() => setOpenBarSystem(open ? null : g.system)}
                  >
                    {/* ⚠️ **ไม่มีไอคอนบนแถวนี้** — วัดจริง 2026-08-25: ไอคอน 10 ตัวกิน
                        รวม ~210px ทำให้แถวตกสองบรรทัดที่จอ 1280 (หัวสูง 126px) · ชื่อระบบ
                        เป็นคำที่คนอ่านอยู่แล้ว ส่วนไอคอนยังอยู่ครบในดรอปดาวน์ ตัวสลับระบบ
                        และแผงระบบบนหน้าแรก */}
                    {g.label}
                    {systemCount ? <span className="topnav-count">{systemCount > 99 ? '99+' : systemCount}</span> : null}
                    <ChevronDown size={13} strokeWidth={2.5} aria-hidden="true" className="topnav-sysbar-caret" />
                  </button>
                  {open && (
                    <div className="topnav-sysbar-menu" role="menu" aria-label={`เมนู${g.label}`}>
                      {!hasHomeItem && (
                        <Link href={g.home} role="menuitem" className="topnav-sys-item">
                          <SystemIcon size={15} className="ico" /> ไปที่{g.label}
                        </Link>
                      )}
                      {g.items.map((item) => {
                        const ItemIcon = item.icon;
                        const count = navCountFor(navCounts, item.href);
                        if (item.disabled) {
                          return (
                            <span key={item.href} role="menuitem" aria-disabled="true" className="topnav-sys-item is-disabled">
                              <ItemIcon size={15} className="ico" /> {item.name}
                            </span>
                          );
                        }
                        return (
                          <Link
                            key={item.href}
                            href={navHrefFor(item, count)}
                            role="menuitem"
                            className={`topnav-sys-item ${item.match(pathname) ? 'active' : ''}`}
                            aria-label={count ? `${item.name} ${count} รายการรอคุณ` : undefined}
                          >
                            <ItemIcon size={15} className="ico" /> {item.name}
                            {count ? <span className="topnav-count">{count > 99 ? '99+' : count}</span> : null}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        )}

      </header>

      {/* ฉากหลังตอนแถบกางทับเนื้อหา (จอ <1200px) — เป็นตัวรับคลิกนอกแถบเพื่อปิด
          ⚠️ ต้องอยู่ **ก่อน** <nav> ใน DOM เพราะทั้งคู่ใช้ z-index เดียวกัน
          (--z-topnav-bar) ใครมาทีหลังทับ — สลับที่แล้วฉากหลังจะบังเมนูเอง */}
      {navOpen && (
        <div className="sidenav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}

      {/* 🪤 แถบเมนูของระบบอยู่ **นอก** <header> โดยเจตนา — มันต้องยืนข้างเนื้อหา
          ไม่ใช่ซ้อนใต้หัว และ .topnav มี `backdrop-filter` ซึ่งกลายเป็น containing
          block ให้ลูกที่ position: fixed/absolute ทั้งหมด = ย้ายออกมาข้างนอก
          เท่านั้นถึงจะวางเป็นแถบข้างได้จริง */}
      <div className="app-body">
        {/* เมนูของระบบปัจจุบัน — **ลิ้นชักที่ลอยทับ** ไม่ใช่แถบประจำที่ (มติผู้ใช้
            2026-08-25) · เปิดจากแฮมเบอร์เกอร์บนหัว · ≤768px ไม่วาด ใช้แถบล่างมือถือ
            ⚠️ ไม่มีปุ่มปิดในตัวลิ้นชักแล้ว — ปุ่มบนหัวสลับเป็น ✕ ตอนเปิด คือตัวคุม
            ตัวเดียวของชั้นจอนี้ (มติ "หนึ่งชั้นจอ หนึ่งตัวคุม" 2026-08-22) */}
        {!isBareShell && <nav className="topnav-menu" aria-label={`เมนู${systemSubtitle}`}>
          {/* หัวข้อกลุ่มโผล่เมื่อกลุ่มเปลี่ยน — ตอนนี้มีแค่เมนูตั้งค่าที่ใส่ `group` มา
              เมนูของระบบอื่นไม่มี ⇒ ไม่มีหัวข้อโผล่ ไม่ต้องแก้อะไรที่ฝั่งนั้น
              (ตอนแถบย่อเป็นราง หัวข้อถูกซ่อนด้วย container query ดู .topnav-group) */}
          {flowItems.flatMap((item, index) => {
            const out = [];
            if (item.group && item.group !== flowItems[index - 1]?.group) {
              out.push(<span key={`group-${item.group}`} className="topnav-group">{item.group}</span>);
            }
            out.push(renderMenuItem(item));
            return out;
          })}
          <span className="topnav-menu-spacer" />
          {utilityItems.map((item) => renderMenuItem(item, 'topnav-utility-item'))}
        </nav>}

        {/* Main Content Area */}
        <main className="main-content">
          <DetailPinProvider>
          <div className="page">
            {/* ที่แขวนแถบระบุตัวใบ — ต้องเป็น **ลูกตัวแรกของ .page** เหตุผลเต็มอยู่ที่
                DetailPinBar ใน lib/ui/detailPin.js · สูง 0 จึงไม่ดันเนื้อหาลงเลย */}
            <DetailPinBar />
            {/* ปุ่มแอดมิน "บังคับรีเฟรชทุกคน" (หน้า /users) — หน้าต่างบังคับรีเฟรชของทุกแท็บที่เปิดอยู่
                (มติเจ้าของ 25/09: รีเฟรชเมื่อแอดมินกดเท่านั้น · กติกาใน lib/ui/forceRefresh.js) */}
            <ForceRefreshWatcher />
            {/* ⭐ ตัวเลขชุดเดียวต่อหน้า — เปลือกดึงแล้วแจกต่อ หน้าไหนก็ห้ามยิงรอบที่สอง
                ของตัวเอง (หน้าแรกของ ADR 0016 อ่านจากตรงนี้ · ป้ายบนเมนูใช้ก้อนเดียวกัน) */}
            <NavCountsContext.Provider value={navCountsState}>
            <RoleContext.Provider value={role}>
              <ExtraCapsContext.Provider value={extraCaps}>
                <TeamContext.Provider value={team}>
                  <TeamsContext.Provider value={teams}>
                    <DepartmentContext.Provider value={department}>
                      {children}
                    </DepartmentContext.Provider>
                  </TeamsContext.Provider>
                </TeamContext.Provider>
              </ExtraCapsContext.Provider>
            </RoleContext.Provider>
            </NavCountsContext.Provider>
          </div>
          </DetailPinProvider>
        </main>
      </div>

      {/* แถบเมนูล่างบนมือถือ — เมนูของระบบครบทุกตัว แบ่งหน้าปัดเอา (มติ 2026-08-02)
          ไม่โผล่ในเปลือกไร้เมนู (ตั้งค่า · บัญชีของฉัน) เพราะที่นั่นไม่มีเมนูของระบบ */}
      {!isBareShell && (
        <MobileBottomNav items={menuItems} pathname={pathname} label={systemSubtitle} counts={navCounts} />
      )}

      {mobileMoreOpen && (
        <div className="mobile-nav-sheet" role="dialog" aria-modal="true" aria-label={flags.homeHub ? 'บัญชีและการตั้งค่า' : `เมนู${systemSubtitle}`}>
          <div className="mobile-nav-sheet-header">
            <div>
              <strong>{systemSubtitle}</strong>
              <span>{flags.homeHub ? 'บัญชีและการตั้งค่า' : 'บัญชีและเครื่องมือ'}</span>
            </div>
            <button type="button" className="btn-icon" onClick={() => setMobileMoreOpen(false)} aria-label="ปิดเมนู"><X size={20} /></button>
          </div>

          {/* ⭐ ไม่มีหัวข้อ "เมนูของระบบนี้" ที่นี่ (มติผู้ใช้ 2026-08-14) — แถบล่างแบก
              เมนูของระบบครบทุกตัวอยู่แล้วตั้งแต่มติ 2026-08-02 (แบ่งหน้าปัดเอา)
              การวางซ้ำในแผ่นนี้คือของเหลือจากกติกาเก่า "4+เพิ่มเติม" ที่ถูกล้มไปแล้ว
              ⚠️ แผ่นนี้เหลือหน้าที่เดียว = บัญชี/เครื่องมือ ซึ่งบนมือถือไม่มีทางเข้าอื่น
              (26/08: "วางเป้า" ย้ายเข้ารายการเมนูของระบบแล้ว จึงอยู่บนแถบล่างเหมือนตัวอื่น
               ไม่ต้องมีการ์ดซ้ำในแผ่นนี้อีก) */}
          {/* บนหน้าแรกหมวดนี้มีการ์ดเดียวคือ "หน้าหลัก" ซึ่งชี้หน้าที่ยืนอยู่ ⇒ ไม่ต้องวาด */}
          {!flags.homeHub && (
          <section className="mobile-nav-section">
            <h2>เครื่องมือ</h2>
            <div className="mobile-nav-grid">
              <Link href="/home" className={`mobile-nav-card${pathname === '/home' ? ' active' : ''}`}><Home size={20} /><span>หน้าหลัก</span></Link>
            </div>
          </section>
          )}

          <section className="mobile-nav-section mobile-account-actions">
            {/* หัวแผ่นบอกแล้วว่า "บัญชีและการตั้งค่า" — หมวดเดียวไม่ต้องมีหัวข้อซ้ำ */}
            {!flags.homeHub && <h2>บัญชีและการตั้งค่า</h2>}
            <Link href="/account" onClick={() => setMobileMoreOpen(false)}><UserRound size={18} /><span>บัญชีของฉัน</span></Link>
            {/* ตั้งค่าย้ายมาอยู่กลุ่มนี้พร้อมกับเมนูผู้ใช้ (มติผู้ใช้ 2026-08-25) —
                เดิมเป็นการ์ดในกลุ่ม "เครื่องมือ" ข้างบน · สองที่นี้ต้องตรงกันเสมอ */}
            <Link href="/settings" onClick={() => setMobileMoreOpen(false)}><SettingsIcon size={18} /><span>ตั้งค่าระบบ</span></Link>
            <button type="button" onClick={toggleTheme}>{isDark ? <Sun size={18} /> : <Moon size={18} />}<span>{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</span></button>
            {SUPABASE_CONFIGURED && <button type="button" onClick={() => setShowPwd(true)}><KeyRound size={18} /><span>เปลี่ยนรหัสผ่าน</span></button>}
            {/* คู่กับ AccountMenu — แผ่นเมนูมือถือต้องมีทุกอย่างที่เมนูผู้ใช้มี
                ไม่งั้นคนที่ใช้มือถืออย่างเดียวจะไม่มีทางแจ้งปัญหาเลย
                ⚠️ รวมเป็นรายการเดียวพร้อมกับเมนูผู้ใช้ (มติผู้ใช้ 2026-08-22) —
                สองที่นี้ต้องตรงกันเสมอ ดูเหตุผลเต็มที่ AccountMenu.js */}
            <Link href="/support" onClick={() => setMobileMoreOpen(false)}><LifeBuoy size={18} /><span>แจ้งปัญหาระบบ</span></Link>
            <button type="button" className="danger" onClick={handleLogout}><LogOut size={18} /><span>ออกจากระบบ</span></button>
          </section>
        </div>
      )}

      {/* กล่องคำอธิบายลอยของทั้งแอป — ตัวเดียวดักให้ทุกเซลล์ตารางที่ถูกตัด และ
          ทุก element ที่ติด `data-tip` (ดู components/ui/Tooltip.js)
          ⚠️ ต้องมี **ตัวเดียว** ทั้งแอป — วางไว้ในตารางแต่ละตัวคือ 101 ตัวดักซ้อนกัน */}
      <TooltipHost />

      {/* Self-service change-password modal (forced & non-dismissible on first login) */}
      <ChangePasswordModal
        open={showPwd}
        forced={mustChangePwd}
        onClose={() => setShowPwd(false)}
        onChanged={() => setMustChangePwd(false)}
      />

    </div>
  );
}
