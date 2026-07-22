"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Building2, Package, Tags, ClipboardCheck, ClipboardList, ReceiptText, FileText, Inbox, LogOut, Moon, Sun, ChevronDown, Users, KeyRound, FolderKanban, ListTodo, LayoutDashboard, BarChart3, LineChart, Boxes, Target, Trash2, MessageCircleQuestion, MoreHorizontal, X, Settings as SettingsIcon, UserRound, Calculator } from 'lucide-react';

import { createClient } from '@/lib/supabaseBrowser';
import { apiCache } from '@/lib/apiCache';
import { canUser, canManageProductCategories, canViewCosting, departmentFor, normalizeDepartment, ROLE_LABELS, TEAM_LABELS } from '@/lib/permissions';
import { fmtName } from '@/lib/format';
import { RoleContext, TeamContext, ExtraCapsContext, DepartmentContext } from '@/lib/roleContext';
import BrandMark from '@/components/BrandMark';
import AccountMenu from '@/components/AccountMenu';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { isSettingsPathname, systemForPathname } from '@/config/navigation';
import { getSystemByKey, RECENT_SYSTEM_STORAGE_KEY, systemLandingForUser, systemsForUser } from '@/config/systems';

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
export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState(null);
  const [team, setTeam] = useState(null);
  const [department, setDepartment] = useState(null); // ฝ่ายของผู้ใช้ (SA/RD/PC/...)
  const [extraCaps, setExtraCaps] = useState(null); // per-user LG/margin grants
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [activeSystem, setActiveSystem] = useState('tax');
  const [sysMenuOpen, setSysMenuOpen] = useState(false); // dropdown สลับระบบ
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const sysMenuRef = useRef(null);

  // Self-service password change (any signed-in user, their own account only).
  const [showPwd, setShowPwd] = useState(false);
  const [mustChangePwd, setMustChangePwd] = useState(false); // forced on first login

  useEffect(() => {
    // Load theme (independent of auth)
    if (document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark') {
      setIsDark(true);
    }

    // Auth: read the signed-in user from Supabase. If Supabase isn't configured
    // yet (local dev before setup), fall back to a permissive local session.
    if (!SUPABASE_CONFIGURED) {
      setRole('ae_supervisor');
      setDepartment(departmentFor('ae_supervisor'));
      setUserName('Local D.');
      setUserInitials('LD');
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/');
        return;
      }
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
      setRole(user.app_metadata?.role || 'user');
      setTeam(user.app_metadata?.team || null);
      // ฝ่าย: กติกาเดียวกับ server (assignable-users) — department ตรง หรืออนุมานจาก role
      setDepartment(normalizeDepartment(user.app_metadata?.department) || departmentFor(user.app_metadata?.role) || null);
      setExtraCaps(Array.isArray(user.app_metadata?.extraCaps) ? user.app_metadata.extraCaps : []);
      // Force a password change on first login / after an admin reset.
      setMustChangePwd(!!user.app_metadata?.must_change_password);
      setUserName(dName);
      setUserInitials(inits);
      try { localStorage.setItem('userName', dName); } catch {}
    });
  }, [router]);

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
    const sys = systemForPathname(pathname);

    if (sys) setActiveSystem(sys);
    if (getSystemByKey(sys)) {
      try { localStorage.setItem(RECENT_SYSTEM_STORAGE_KEY, sys); } catch {}
    }
    setSysMenuOpen(false); // navigating closes the system dropdown
    setMobileMoreOpen(false);
  }, [pathname]);

  // ปิด dropdown สลับระบบเมื่อคลิกนอกเมนู
  useEffect(() => {
    if (!sysMenuOpen) return;
    const onDown = (e) => {
      if (sysMenuRef.current && !sysMenuRef.current.contains(e.target)) setSysMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sysMenuOpen]);

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

  const handleLogout = async () => {
    if (SUPABASE_CONFIGURED) {
      try {
        await createClient().auth.signOut();
      } catch {}
    }
    apiCache.clear(); // don't leak the outgoing user's cached data to the next login
    router.replace('/');
  };

  if (!role) return null;

  // Each group belongs to a "system" (the cards on /home). The menu row shows
  // only the current system's items; the system dropdown switches systems.
  const allGroups = [
    {
      system: 'master',
      items: [
        { href: '/database', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'customers:view', match: (p) => p === '/database' },
        { href: '/database/customers', name: 'ข้อมูลลูกค้า', icon: Building2, cap: 'customers:view', match: (p) => p === '/database/customers' || p.startsWith('/database/customers/') },
        { href: '/database/products', name: 'ข้อมูลสินค้า', icon: Package, cap: 'products:view', match: (p) => p === '/database/products' || p.startsWith('/database/products/') },
        { href: '/database/product-categories', name: 'หมวดสินค้า', icon: Tags, cap: 'products:view', managerOnly: true, match: (p) => p.startsWith('/database/product-categories') },
      ],
    },
    {
      system: 'tax',
      items: [
        { href: '/tax', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'history:view', match: (p) => p === '/tax' },
        { href: '/tax/registrations', name: 'การขึ้นทะเบียน', icon: ClipboardCheck, cap: 'history:view', match: (p) => p.startsWith('/tax/registrations') },
        { href: '/tax/filings', name: 'การยื่นชำระภาษี', icon: ReceiptText, cap: 'history:view', match: (p) => p.startsWith('/tax/filings') },
        { href: '/tax/reports', name: 'รายงาน', icon: BarChart3, cap: 'history:view', match: (p) => p === '/tax/reports' },
      ],
    },
    {
      system: 'salesplan',
      items: [
        { href: '/sa/dashboard', name: 'แดชบอร์ด', icon: LayoutDashboard, cap: 'salesplan:view', match: (p) => p === '/sa/dashboard' || p === '/sa' || p === '/sales-planning' || p === '/sa/my-dashboard' || p === '/sa/kpi' },
        // เฟส C: คิวลีดของ Marketing/ฝ่ายขาย — role marketing เห็นเมนูนี้ตัวเดียว
        { href: '/sa/leads', name: 'ลีด', icon: Inbox, cap: 'salesplan:lead', match: (p) => p.startsWith('/sa/leads') || p.startsWith('/sales-planning/leads') },
        // "ดีล" = งานขายแต่ละก้อน (SCENT/NPD/RE-ORDER) — คำ "โครงการ" สงวนให้ตัว
        // project ฝั่ง execution ตามมาตรฐาน IA (SALES_REVAMP_PLAN §5)
        { href: '/sa/deals', name: 'ดีล', icon: FolderKanban, cap: 'salesplan:view', match: (p) => p === '/sa/deals' || p.startsWith('/sa/deals/') || p === '/sales-planning/deals' || p.startsWith('/sales-planning/deals/') },
        // เฟส B: หน้ารวมโครงการ (ภาชนะรวมดีล + KPI rollup) — เดิม /sa/projects เด้งไปหน้าดีล
        { href: '/sa/projects', name: 'โครงการ', icon: Boxes, cap: 'salesplan:view', match: (p) => p === '/sa/projects' || p.startsWith('/sa/projects/') || p.startsWith('/pm/projects') },
        // เฟส D: ใบเสนอราคา FM-SA-01 (มติผู้ใช้: เมนูแยกเพื่อง่ายต่อการค้นหา)
        { href: '/sa/quotations', name: 'ใบเสนอราคา', icon: FileText, cap: 'salesplan:view', match: (p) => p.startsWith('/sa/quotations') || p.startsWith('/sales-planning/quotations') },
        { href: '/sa/sales-orders', name: 'Sale Order', icon: ClipboardList, cap: 'salesplan:view', match: (p) => p.startsWith('/sa/sales-orders') || p.startsWith('/sales-planning/sales-orders') },
        // เรื่องสอบถาม Sale ↔ RD (mig 0104) — ฝั่งขายเห็นตาม scope ดีล, rd เห็นของฝ่ายตน
        { href: '/sa/inquiries', name: 'สอบถาม RD', icon: MessageCircleQuestion, cap: 'salesplan:view', match: (p) => p.startsWith('/sa/inquiries') },
        // ใบขอราคาผลิต (mig 0141) — ฝ่ายขาย/RD/PC/ผู้บริหารใช้หน้าเดียวกัน
        // cap costing:view กว้างเกินจริง (role staff ถือทั้ง PD/WH/QC ด้วย) จึงต้อง
        // แคบด้วยฝ่ายผ่าน canViewCosting ไม่งั้นฝ่ายที่ไม่เกี่ยวเห็นเมนูต้นทุน
        { href: '/sa/costing', name: 'ขอราคาผลิต', icon: Calculator, cap: 'costing:view', visible: canViewCosting, match: (p) => p.startsWith('/sa/costing') },
        { href: '/sa/tasks', name: 'งานของฉัน', icon: ListTodo, caps: ['salesplan:view', 'pm:view'], match: (p) => p === '/sa/tasks' || p.startsWith('/sa/tasks/') || p === '/pm/tasks' || p.startsWith('/pm/tasks/') },
      ],
    },
    {
      system: 'mgmt',
      items: [
        { href: '/mgmt', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'mgmt:view', match: (p) => p === '/mgmt' },
        { href: '/mgmt/tasks', name: 'รายการงาน', icon: ListTodo, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/tasks') },
        { href: '/mgmt/meetings', name: 'การประชุม', icon: Users, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/meetings') },
        { href: '/mgmt/rocks', name: 'Rock & Improve', icon: Target, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/rocks') },
        { href: '/mgmt/trash', name: 'ถังขยะ', icon: Trash2, cap: 'mgmt:edit', match: (p) => p.startsWith('/mgmt/trash') },
      ],
    },
    {
      system: 'sahamit',
      items: [
        { href: '/sahamit', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'sahamit:view', match: (p) => p === '/sahamit' },
        { href: '/sahamit/forecast', name: 'Forecast', icon: LineChart, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/forecast') },
        { href: '/sahamit/po', name: 'Purchase Orders', icon: FileText, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/po') },
        { href: '/sahamit/reconcile', name: 'กระทบยอด', icon: ClipboardCheck, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/reconcile') },
        { href: '/sahamit/material', name: 'วัสดุ / Lead time', icon: Boxes, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/material') },
        { href: '/sahamit/report', name: 'รายงานมูลค่า', icon: BarChart3, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/report') },
      ],
    },
  ];

  // department จำเป็นสำหรับเมนูที่ cap อย่างเดียวกว้างเกิน แล้วต้องแคบด้วยฝ่าย
  // (เช่น ใบขอราคาผลิต — ฝ่ายจัดซื้อใช้ role staff ร่วมกับ PD/WH/QC)
  const userContext = { role, team, department, extraCaps };
  const activeSystemDefinition = getSystemByKey(activeSystem);
  const systemSubtitle = activeSystem === 'settings'
    ? 'การตั้งค่าระบบ'
    : (activeSystemDefinition?.label || 'ภาษีสรรพสามิต');

  // ระบบที่ผู้ใช้เข้าถึงได้ (ใช้ทั้ง dropdown สลับระบบ และกรองเมนูแถวล่าง).
  // canUser (not can) so a per-user grant — e.g. an SA granted mgmt:view to
  // help the secretary — surfaces that system too.
  const groupsBySystem = new Map(allGroups.map((group) => [group.system, group]));
  const accessibleGroups = systemsForUser(userContext)
    .map((system) => {
      const group = groupsBySystem.get(system.key);
      if (!group) return null;
      return {
        ...group,
        label: system.label,
        home: systemLandingForUser(system, userContext),
        icon: system.icon,
        items: group.items.filter((item) => {
          const caps = item.caps || [item.cap];
          return caps.some((cap) => canUser(userContext, cap)) &&
            (!item.managerOnly || canManageProductCategories(role)) &&
            // ด่านเพิ่มสำหรับเมนูที่ cap กว้างกว่าผู้ใช้จริง (ดู costing:view)
            (!item.visible || item.visible(userContext));
        }),
      };
    })
    .filter(Boolean)
    .filter((g) => g.items.length > 0);

  const currentGroup = accessibleGroups.find((g) => g.system === activeSystem) || null;
  const menuItems = currentGroup?.items || [];
  const ActiveSystemIcon = activeSystem === 'settings'
    ? SettingsIcon
    : (activeSystemDefinition?.icon || LayoutDashboard);
  const isSettingsContext = isSettingsPathname(pathname);

  return (
    <div className={`app-container${isSettingsContext ? ' settings-context' : ''}`}>
      {/* ── Top bar 2 ชั้น (ตรึงบนสุดทั้งระบบ) ── */}
      <header className="topnav">
        {/* ชั้นระบบ: โลโก้ (พื้น navy ตามมาตรฐานแบรนด์) + สลับระบบ + user actions */}
        <div className="topnav-system">
          <Link href="/home" className="topnav-brand" title="หน้าแรก (สลับระบบ)">
            {/* โลโก้ตัวเต็มมี wordmark ในภาพแล้ว (มติผู้ใช้ 2026-07-16) — ไม่ใส่ข้อความซ้ำ */}
            <BrandMark height={34} className="topnav-brand-img" />
          </Link>

          <div className="topnav-sys" ref={sysMenuRef}>
            <button
              type="button"
              className="topnav-sys-btn"
              onClick={() => setSysMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={sysMenuOpen}
            >
              <ActiveSystemIcon size={15} aria-hidden="true" />
              {systemSubtitle}
              <ChevronDown size={14} strokeWidth={2.5} style={{ transform: sysMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {sysMenuOpen && (
              <div className="topnav-sys-menu" role="menu">
                <Link href="/home" role="menuitem" className={`topnav-sys-item ${pathname === '/home' ? 'active' : ''}`}>
                  <Home size={15} className="ico" /> หน้าแรก
                </Link>
                {accessibleGroups.map((g) => {
                  const SystemIcon = g.icon || LayoutDashboard;
                  return (
                    <Link
                      key={g.system}
                      href={g.home}
                      role="menuitem"
                      className={`topnav-sys-item ${g.system === activeSystem ? 'active' : ''}`}
                    >
                      <SystemIcon size={15} className="ico" /> {g.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <button type="button" className="mobile-top-more" onClick={() => setMobileMoreOpen(true)} aria-label="เมนูเพิ่มเติม" aria-expanded={mobileMoreOpen}>
            <MoreHorizontal size={21} aria-hidden="true" />
          </button>

          <div className="topbar-actions">
            <Link
              href="/settings"
              className={`topnav-global-action${isSettingsContext ? ' active' : ''}`}
              aria-current={isSettingsContext ? 'page' : undefined}
            >
              <SettingsIcon size={17} aria-hidden="true" />
              <span>ตั้งค่า</span>
            </Link>
            <AccountMenu
              userName={userName}
              userInitials={userInitials}
              roleLabel={team ? `${ROLE_LABELS[role] || role} · ${TEAM_LABELS[team] || team}` : (ROLE_LABELS[role] || role)}
              roleTone={role === 'admin' || role === 'ae_supervisor' || role === 'legal' || role === 'secretary' || role === 'executive' ? 'admin' : (role === 'senior_ae' || role === 'ac' || role === 'ae') ? 'editor' : 'viewer'}
              isDark={isDark}
              canChangePassword={SUPABASE_CONFIGURED}
              onToggleTheme={toggleTheme}
              onChangePassword={() => setShowPwd(true)}
              onLogout={handleLogout}
            />
          </div>
        </div>

        {/* ชั้นเมนูของระบบปัจจุบัน — จอแคบเลื่อนแนวนอนได้ (ไม่มี drawer แล้ว) */}
        {!isSettingsContext && <nav className="topnav-menu" aria-label={`เมนู${systemSubtitle}`}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = item.match(pathname);
            return (
              <Link href={item.href} key={item.href} className={`topnav-item ${active ? 'active' : ''}`}>
                <Icon size={16} className="ico" />
                <span>{item.name}</span>
              </Link>
            );
          })}
          <span className="topnav-menu-spacer" />
          {/* วางเป้าเป็นเมนูของระบบบริหารงานขายระบบเดียว — ไม่โชว์ตอนอยู่ระบบอื่น */}
          {activeSystem === 'salesplan' && canUser({ role, extraCaps }, 'salesplan:target') && (
            <Link
              href="/sa/targets"
              className={`topnav-item topnav-utility-item ${pathname.startsWith('/sa/targets') || pathname.startsWith('/sales-planning/targets') ? 'active' : ''}`}
            >
              <Target size={16} className="ico" />
              <span>วางเป้า</span>
            </Link>
          )}
        </nav>}
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="page">
          <RoleContext.Provider value={role}>
            <ExtraCapsContext.Provider value={extraCaps}>
              <TeamContext.Provider value={team}>
                <DepartmentContext.Provider value={department}>{children}</DepartmentContext.Provider>
              </TeamContext.Provider>
            </ExtraCapsContext.Provider>
          </RoleContext.Provider>
        </div>
      </main>

      {mobileMoreOpen && (
        <div className="mobile-nav-sheet" role="dialog" aria-modal="true" aria-label={`เมนู${systemSubtitle}`}>
          <div className="mobile-nav-sheet-header">
            <div>
              <strong>{systemSubtitle}</strong>
              <span>เมนูงานและการตั้งค่า</span>
            </div>
            <button type="button" className="btn-icon" onClick={() => setMobileMoreOpen(false)} aria-label="ปิดเมนู"><X size={20} /></button>
          </div>

          {menuItems.length > 0 && (
            <section className="mobile-nav-section">
              <h2>เมนูของระบบนี้</h2>
              <div className="mobile-nav-grid">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link href={item.href} key={item.href} className={`mobile-nav-card${item.match(pathname) ? ' active' : ''}`}>
                      <Icon size={20} /><span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          <section className="mobile-nav-section">
            <h2>เครื่องมือ</h2>
            <div className="mobile-nav-grid">
              <Link href="/home" className={`mobile-nav-card${pathname === '/home' ? ' active' : ''}`}><Home size={20} /><span>หน้าหลัก</span></Link>
              {activeSystem === 'salesplan' && canUser({ role, extraCaps }, 'salesplan:target') && <Link href="/sa/targets" className={`mobile-nav-card${pathname.startsWith('/sa/targets') || pathname.startsWith('/sales-planning/targets') ? ' active' : ''}`}><Target size={20} /><span>วางเป้า</span></Link>}
              <Link href="/settings" className={`mobile-nav-card${isSettingsContext ? ' active' : ''}`}><SettingsIcon size={20} /><span>ตั้งค่า</span></Link>
            </div>
          </section>

          <section className="mobile-nav-section mobile-account-actions">
            <h2>บัญชีและการตั้งค่า</h2>
            <Link href="/account" onClick={() => setMobileMoreOpen(false)}><UserRound size={18} /><span>บัญชีของฉัน</span></Link>
            <button type="button" onClick={toggleTheme}>{isDark ? <Sun size={18} /> : <Moon size={18} />}<span>{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</span></button>
            {SUPABASE_CONFIGURED && <button type="button" onClick={() => setShowPwd(true)}><KeyRound size={18} /><span>เปลี่ยนรหัสผ่าน</span></button>}
            <button type="button" className="danger" onClick={handleLogout}><LogOut size={18} /><span>ออกจากระบบ</span></button>
          </section>
        </div>
      )}

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
