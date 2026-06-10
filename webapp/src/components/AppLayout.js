"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Building2, Package, ClipboardCheck, ReceiptText, FileText, History, Search, LogOut, Moon, Sun, ChevronLeft, ChevronRight, Users, KeyRound, FolderKanban, ListTodo } from 'lucide-react';
import { createClient } from '@/lib/supabaseBrowser';
import { apiCache } from '@/lib/apiCache';
import { can, ROLE_LABELS } from '@/lib/permissions';
import { RoleContext } from '@/lib/roleContext';
import Modal from '@/components/Modal';

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
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeSystem, setActiveSystem] = useState('tax');

  // Self-service password change (any signed-in user, their own account only).
  const [showPwd, setShowPwd] = useState(false);
  const [mustChangePwd, setMustChangePwd] = useState(false); // forced on first login
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdDone, setPwdDone] = useState(false);

  const openPwd = () => {
    setPwdForm({ currentPassword: '', newPassword: '', confirm: '' });
    setPwdError('');
    setPwdDone(false);
    setShowPwd(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdError('');
    if (pwdForm.newPassword.length < 6) {
      setPwdError('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }
    if (pwdForm.newPassword !== pwdForm.confirm) {
      setPwdError('รหัสผ่านใหม่และการยืนยันไม่ตรงกัน');
      return;
    }
    setPwdSubmitting(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: pwdForm.currentPassword,
          newPassword: pwdForm.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPwdDone(true);
        setMustChangePwd(false); // unblock the app once the forced change is done
      } else {
        setPwdError(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
      }
    } catch {
      setPwdError('เกิดข้อผิดพลาด');
    }
    setPwdSubmitting(false);
  };

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
      let full = user.user_metadata?.name || user.email || 'user';
      let dName = full;
      let inits = full.substring(0, 2).toUpperCase();

      if (user.user_metadata) {
        const { firstName, lastName, name } = user.user_metadata;
        if (firstName) {
          dName = `${firstName}${lastName ? ' ' + lastName.charAt(0).toUpperCase() + '.' : ''}`;
          inits = `${firstName.charAt(0)}${lastName ? lastName.charAt(0) : ''}`.toUpperCase();
        } else if (name) {
          const parts = name.split(' ');
          if (parts.length > 1) {
            dName = `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
            inits = `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
          } else {
            dName = name;
            inits = name.substring(0, 2).toUpperCase();
          }
        }
      }

      // Role comes from app_metadata (service-role-only; users cannot self-edit it).
      setRole(user.app_metadata?.role || 'user');
      // Force a password change on first login / after an admin reset.
      setMustChangePwd(!!user.app_metadata?.must_change_password);
      setUserName(dName);
      setUserInitials(inits);
      try { localStorage.setItem('userName', full); } catch {}
      prefetchData();
    });
  }, [router]);

  useEffect(() => {
    const sys =
      pathname.startsWith('/projects') || pathname.startsWith('/tasks') ? 'pm'
      : pathname.startsWith('/customers') || pathname.startsWith('/products') ? 'master'
      : pathname === '/users' ? null
      : 'tax';
      
    if (sys) setActiveSystem(sys);
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
      label: 'ข้อมูลหลัก',
      system: 'master',
      items: [
        { href: '/products', name: 'ข้อมูลสินค้า', icon: Package, cap: 'products:view', match: (p) => p === '/products' || p.startsWith('/products/') },
        { href: '/customers', name: 'ข้อมูลลูกค้า', icon: Building2, cap: 'customers:view', match: (p) => p === '/customers' || p.startsWith('/customers/') },
      ],
    },
    {
      label: 'งานขาย (SA)',
      system: 'tax',
      items: [
        { href: '/tax/register', name: 'ยื่นขึ้นทะเบียนสินค้า', icon: ClipboardCheck, cap: 'products:edit', match: (p) => p === '/tax/register' || p.startsWith('/tax/register/') },
        { href: '/tax/payment', name: 'ยื่นชำระภาษี', icon: FileText, cap: 'sales:view', match: (p) => p === '/tax/payment' },
      ],
    },
    {
      label: 'ฝ่ายกฎหมาย (LG)',
      system: 'tax',
      items: [
        { href: '/tax/approve-register', name: 'อนุมัติขึ้นทะเบียน', icon: ClipboardCheck, cap: 'legal:view', match: (p) => p === '/tax/approve-register' },
        { href: '/tax/approve-payment', name: 'อนุมัติชำระภาษี', icon: ReceiptText, cap: 'legal:view', match: (p) => p === '/tax/approve-payment' },
      ],
    },
    {
      label: 'ระบบจัดการโครงการ',
      system: 'pm',
      items: [
        { href: '/projects', name: 'โครงการ', icon: FolderKanban, cap: 'pm:view', match: (p) => p === '/projects' || p.startsWith('/projects/') },
        { href: '/tasks', name: 'งานของฉัน', icon: ListTodo, cap: 'pm:view', match: (p) => p === '/tasks' },
      ],
    },
    {
      label: 'ประวัติ',
      system: 'tax',
      items: [
        { href: '/tax/history', name: 'ประวัติทั้งหมด', icon: History, cap: 'history:view', match: (p) => p === '/tax/history' },
      ],
    },
  ];

  const systemSubtitle =
    activeSystem === 'master' ? 'ระบบฐานข้อมูล'
      : activeSystem === 'pm' ? 'ระบบจัดการโครงการ'
        : 'ระบบภาษีสรรพสามิต';

  // Show only the current system's groups (+ 'both'), then only menus the role
  // is allowed to see.
  const navGroups = allGroups
    .filter((g) => g.system === 'both' || g.system === activeSystem)
    .map((g) => ({ ...g, items: g.items.filter((it) => can(role, it.cap)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="app-container" data-sidebar={isCollapsed ? "icon" : "expanded"}>
      {/* Sidebar Navigation */}
      <aside className="sidebar">
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
                <span className={`topbar-user-role ${role === 'ae_supervisor' || role === 'legal' ? 'admin' : (role === 'senior_ae' || role === 'ac' || role === 'ae') ? 'editor' : 'viewer'}`} style={{ fontSize: '10.5px', padding: '2px 8px', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                  {ROLE_LABELS[role] || role}
                </span>
              </div>
            </div>

            {/* Manage Users (Admins only) */}
            {can(role, 'users:manage') && (
              <Link href="/users" className="btn ghost icon-only" title="จัดการผู้ใช้">
                <Users size={16} strokeWidth={2} />
              </Link>
            )}

            {/* Change own password */}
            {SUPABASE_CONFIGURED && (
              <button onClick={openPwd} className="btn ghost icon-only" title="เปลี่ยนรหัสผ่าน">
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
          <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
        </div>
      </main>

      {/* Self-service change-password modal (forced & non-dismissible on first login) */}
      <Modal
        open={showPwd || mustChangePwd}
        onClose={() => setShowPwd(false)}
        title={mustChangePwd && !pwdDone ? "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน" : "เปลี่ยนรหัสผ่าน"}
        size="sm"
        dismissible={!mustChangePwd}
      >
        {pwdDone ? (
          <div className="p-2">
            <p className="text-[var(--text-2)]">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ครั้งถัดไปให้เข้าสู่ระบบด้วยรหัสผ่านใหม่</p>
            <div className="flex justify-end mt-8 pt-6 border-t border-[var(--border)]">
              <button onClick={() => setShowPwd(false)} className="btn btn-primary px-8">เสร็จสิ้น</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleChangePassword}>
            {mustChangePwd && (
              <p className="text-[var(--text-2)] text-sm mb-4">
                นี่เป็นการเข้าใช้งานครั้งแรก (หรือแอดมินเพิ่งรีเซ็ตรหัสให้) กรุณาตั้งรหัสผ่านใหม่ของคุณเองก่อนเริ่มใช้งานระบบ
              </p>
            )}
            <div className="grid gap-[18px]">
              <div className="form-group">
                <label>รหัสผ่านปัจจุบัน <span className="text-[var(--red)]">*</span></label>
                <input
                  type="password"
                  value={pwdForm.currentPassword}
                  onChange={(e) => setPwdForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  required
                  className="premium-input w-full"
                  autoComplete="current-password"
                />
              </div>
              <div className="form-group">
                <label>รหัสผ่านใหม่ <span className="text-[var(--red)]">*</span></label>
                <input
                  type="password"
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm((f) => ({ ...f, newPassword: e.target.value }))}
                  required
                  placeholder="อย่างน้อย 6 ตัวอักษร"
                  className="premium-input w-full"
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label>ยืนยันรหัสผ่านใหม่ <span className="text-[var(--red)]">*</span></label>
                <input
                  type="password"
                  value={pwdForm.confirm}
                  onChange={(e) => setPwdForm((f) => ({ ...f, confirm: e.target.value }))}
                  required
                  className="premium-input w-full"
                  autoComplete="new-password"
                />
              </div>
            </div>
            {pwdError && <p className="text-[var(--red)] text-sm mt-3">{pwdError}</p>}
            <div className="flex justify-end gap-2 mt-8 pt-6 border-t border-[var(--border)]">
              {!mustChangePwd && (
                <button type="button" onClick={() => setShowPwd(false)} className="btn">ยกเลิก</button>
              )}
              <button type="submit" disabled={pwdSubmitting} className="btn btn-primary px-8">
                {pwdSubmitting ? 'กำลังบันทึก...' : 'เปลี่ยนรหัสผ่าน'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
