"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Building2, Package, ClipboardCheck, ReceiptText, FileText, History, Search, LogOut, Moon, Sun, ChevronLeft, ChevronRight, Users, KeyRound, FolderKanban, ListTodo, CalendarDays, Menu, X, LayoutDashboard, BarChart3, LineChart, Boxes, Flag } from 'lucide-react';
import { createClient } from '@/lib/supabaseBrowser';
import { apiCache } from '@/lib/apiCache';
import { can, canAccessSahamit, ROLE_LABELS, TEAM_LABELS } from '@/lib/permissions';
import { fmtName } from '@/lib/format';
import { RoleContext, TeamContext } from '@/lib/roleContext';
import ChangePasswordModal from '@/components/ChangePasswordModal';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Warm the data cache right after login so the first click on any menu is
// instant (data is already fetched in the background).
function prefetchData() {
  for (const url of ['/api/products', '/api/customers', '/api/orders', '/api/excise-registrations']) {
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) apiCache.set(url, d); })
      .catch(() => {});
  }
}

export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState(null);
  const [team, setTeam] = useState(null);
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false); // slide-in drawer on narrow screens
  const [activeSystem, setActiveSystem] = useState('tax');

  // Self-service password change (any signed-in user, their own account only).
  // The form itself lives in <ChangePasswordModal>; here we only track whether
  // it's open and whether the forced first-login change is still pending.
  const [showPwd, setShowPwd] = useState(false);
  const [mustChangePwd, setMustChangePwd] = useState(false); // forced on first login

  useEffect(() => {
    // Load theme + sidebar state (independent of auth)
    if (document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark') {
      setIsDark(true);
    }
    setIsCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');

    // Auth: read the signed-in user from Supabase. If Supabase isn't configured
    // yet (local dev before setup), fall back to a permissive local session.
    if (!SUPABASE_CONFIGURED) {
      setRole('ae_supervisor');
      setUserName('Local D.');
      setUserInitials('LD');
      prefetchData();
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
      // Force a password change on first login / after an admin reset.
      setMustChangePwd(!!user.app_metadata?.must_change_password);
      setUserName(dName);
      setUserInitials(inits);
      try { localStorage.setItem('userName', dName); } catch {}
      prefetchData();
    });
  }, [router]);

  useEffect(() => {
    const sys =
      pathname.startsWith('/pm') ? 'pm'
      : pathname.startsWith('/database') ? 'master'
      : pathname.startsWith('/sahamit') ? 'sahamit'
      : pathname === '/users' ? 'users'
      : pathname === '/audit' ? 'audit'
      : 'tax';

    if (sys) setActiveSystem(sys);
    setMobileOpen(false); // navigating closes the mobile drawer
  }, [pathname]);

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

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem('sidebarCollapsed', String(next));
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

  // Each group belongs to a "system" (the cards on /home): 'master' (shared
  // master data), 'tax' (excise tax) or 'pm' (project management). 'both' =
  // cross-cutting (e.g. settings), always shown. The sidebar shows only the
  // current system's groups so it changes when you switch systems; "หน้าแรก"
  // returns to the hub to switch.
  const allGroups = [
    {
      label: 'ฐานข้อมูล',
      system: 'master',
      items: [
        { href: '/database', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'customers:view', match: (p) => p === '/database' },
        { href: '/database/products', name: 'ข้อมูลสินค้า', icon: Package, cap: 'products:view', match: (p) => p === '/database/products' || p.startsWith('/database/products/') },
        { href: '/database/customers', name: 'ข้อมูลลูกค้า', icon: Building2, cap: 'customers:view', match: (p) => p === '/database/customers' || p.startsWith('/database/customers/') },
        { href: '/database/holidays', name: 'วันหยุด (ปฏิทินทำการ)', icon: CalendarDays, cap: 'master:manage', match: (p) => p.startsWith('/database/holidays') },
      ],
    },
    {
      label: 'งานภาษีสรรพสามิต',
      system: 'tax',
      items: [
        { href: '/tax', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'history:view', match: (p) => p === '/tax' },
        { href: '/tax/registrations', name: 'การขึ้นทะเบียน', icon: ClipboardCheck, cap: 'history:view', match: (p) => p.startsWith('/tax/registrations') },
        { href: '/tax/filings', name: 'การยื่นชำระภาษี', icon: ReceiptText, cap: 'history:view', match: (p) => p.startsWith('/tax/filings') },
        { href: '/tax/reports', name: 'รายงาน', icon: BarChart3, cap: 'history:view', match: (p) => p === '/tax/reports' },
      ],
    },
    {
      label: 'จัดการโครงการ',
      system: 'pm',
      items: [
        { href: '/pm', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'pm:view', match: (p) => p === '/pm' },
        { href: '/pm/projects', name: 'โครงการ', icon: FolderKanban, cap: 'pm:view', match: (p) => p === '/pm/projects' || p.startsWith('/pm/projects/') },
        { href: '/pm/tasks', name: 'งานของฉัน', icon: ListTodo, cap: 'pm:view', match: (p) => p === '/pm/tasks' },
      ],
    },
    {
      label: 'งานสหมิตร',
      system: 'sahamit',
      items: [
        { href: '/sahamit', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'sahamit:view', match: (p) => p === '/sahamit' },
        { href: '/sahamit/forecast', name: 'Forecast', icon: LineChart, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/forecast') },
        { href: '/sahamit/po', name: 'Purchase Orders', icon: FileText, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/po') },
        { href: '/sahamit/reconcile', name: 'กระทบยอด', icon: ClipboardCheck, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/reconcile') },
        { href: '/sahamit/review', name: 'ตรวจการเปลี่ยน FC', icon: Flag, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/review') },
        { href: '/sahamit/material', name: 'วัสดุ / Lead time', icon: Boxes, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/material') },
        { href: '/sahamit/report', name: 'รายงานมูลค่า', icon: BarChart3, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/report') },
      ],
    },
  ];

  const systemSubtitle =
    activeSystem === 'master' ? 'ฐานข้อมูล'
      : activeSystem === 'pm' ? 'จัดการโครงการ'
        : activeSystem === 'sahamit' ? 'งานสหมิตร'
          : activeSystem === 'users' ? 'จัดการผู้ใช้'
            : activeSystem === 'audit' ? 'บันทึกการใช้งาน'
              : 'ภาษีสรรพสามิต';

  // Show only the current system's groups (+ 'both'), then only menus the role
  // is allowed to see.
  const navGroups = allGroups
    .filter((g) => g.system === 'both' || g.system === activeSystem)
    // SAHAMIT is team-gated (KA only) beyond the per-item capability check.
    .filter((g) => g.system !== 'sahamit' || canAccessSahamit(role, team))
    .map((g) => ({ ...g, items: g.items.filter((it) => can(role, it.cap)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="app-container" data-sidebar={isCollapsed ? "icon" : "expanded"}>
      {/* Dim backdrop behind the mobile drawer (≤1000px); tap to dismiss */}
      <div
        className={`sidebar-backdrop ${mobileOpen ? 'active' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand-section">
          <img src="/brand-logo.png" alt="Scent &amp; Sense" className="brand-logo-img" />
          <Link href="/home" className="brand-info-link">
            <div className="brand-info">
              <div className="brand-title">Scent &amp; Sense</div>
              <div className="brand-subtitle">{systemSubtitle}</div>
            </div>
          </Link>
          <button onClick={toggleSidebar} className="sidebar-toggle" title={isCollapsed ? "ขยายแถบเมนู" : "พับแถบเมนู"}>
            {isCollapsed ? <ChevronRight size={14} strokeWidth={1.5} /> : <ChevronLeft size={14} strokeWidth={1.5} />}
          </button>
        </div>

        <ul className="nav-links">
          <li className="nav-group">
            <Link
              href="/home"
              className={`nav-item ${pathname === '/home' ? 'active' : ''}`}
              title={isCollapsed ? 'หน้าแรก' : undefined}
            >
              <Home size={18} className="ico" />
              <span className="nav-label">หน้าแรก</span>
            </Link>
          </li>
          {navGroups.map((group, gi) => (
            <li key={gi} className="nav-group">
              {!isCollapsed && <div className="nav-section">{group.label}</div>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.match(pathname);
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={`nav-item ${active ? 'active' : ''}`}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Icon size={18} className="ico" />
                    <span className="nav-label">{item.name}</span>
                  </Link>
                );
              })}
            </li>
          ))}
        </ul>

        {/* Sidebar Footer containing Theme Toggle */}
        <div className="sidebar-footer">
          <button
            onClick={toggleTheme}
            className="btn ghost icon-only sidebar-theme-btn"
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <Sun size={16} className="ico" /> : <Moon size={16} className="ico" />}
          </button>
          {!isCollapsed && <span className="sidebar-footer-label">{isDark ? 'Dark' : 'Light'}</span>}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          {/* Hamburger — only visible ≤1000px (see .menu-btn), opens the drawer */}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="menu-btn mobile-hamburger"
            title={mobileOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-label={mobileOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} strokeWidth={2} /> : <Menu size={20} strokeWidth={2} />}
          </button>
          <div className="search-bar">
            <Search size={16} className="icon-l" strokeWidth={2} />
            <input type="text" placeholder="ค้นหา สินค้า, รหัสลูกค้า..." />
          </div>

          <div className="topbar-actions">
            {/* Login User Info */}
            <div className="topbar-user-info">
              <div className="user-avatar">{userInitials || userName.substring(0, 2).toUpperCase()}</div>
              <div className="user-info" style={{ display: 'flex', alignItems: 'center', flexDirection: 'row', gap: '8px' }}>
                <span className="user-name" style={{ fontSize: '13px', fontWeight: '600' }}>{userName}</span>
                <span className={`topbar-user-role ${role === 'admin' || role === 'ae_supervisor' || role === 'legal' ? 'admin' : (role === 'senior_ae' || role === 'ac' || role === 'ae') ? 'editor' : 'viewer'}`} style={{ fontSize: '10.5px', padding: '2px 8px', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                  {team ? `${ROLE_LABELS[role] || role} · ${TEAM_LABELS[team] || team}` : (ROLE_LABELS[role] || role)}
                </span>
              </div>
            </div>

            {/* Audit log (Admins only) */}
            {can(role, 'audit:view') && (
              <Link href="/audit" className="btn ghost icon-only" title="บันทึกการใช้งาน">
                <History size={16} strokeWidth={2} />
              </Link>
            )}

            {/* Manage Users (Admins only) */}
            {can(role, 'users:manage') && (
              <Link href="/users" className="btn ghost icon-only" title="จัดการผู้ใช้">
                <Users size={16} strokeWidth={2} />
              </Link>
            )}

            {/* Change own password */}
            {SUPABASE_CONFIGURED && (
              <button onClick={() => setShowPwd(true)} className="btn ghost icon-only" title="เปลี่ยนรหัสผ่าน">
                <KeyRound size={16} strokeWidth={2} />
              </button>
            )}

            {/* Logout Button */}
            <button onClick={handleLogout} className="btn ghost topbar-logout-btn flex items-center gap-1.5" title="ออกจากระบบ">
              <LogOut size={16} strokeWidth={2} />
              <span className="font-semibold">ออกจากระบบ</span>
            </button>
          </div>
        </header>

        <div className="page">
          <RoleContext.Provider value={role}>
            <TeamContext.Provider value={team}>{children}</TeamContext.Provider>
          </RoleContext.Provider>
        </div>
      </main>

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
