"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Building2, Package, ClipboardCheck, ReceiptText, FileText, History, Search, LogOut, Moon, Sun, ChevronLeft, ChevronRight, Users, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabaseBrowser';
import { apiCache } from '@/lib/apiCache';
import { can } from '@/lib/permissions';
import { RoleContext } from '@/lib/roleContext';
import Modal from '@/components/Modal';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Warm the data cache right after login so the first click on any menu is
// instant (data is already fetched in the background).
function prefetchData() {
  for (const url of ['/api/products', '/api/customers', '/api/orders']) {
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
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

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
      setUserName('Local Dev');
      prefetchData();
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/');
        return;
      }
      const name = user.user_metadata?.name || user.email || 'user';
      // Role comes from app_metadata (service-role-only; users cannot self-edit it).
      setRole(user.app_metadata?.role || 'user');
      // Force a password change on first login / after an admin reset.
      setMustChangePwd(!!user.app_metadata?.must_change_password);
      setUserName(name);
      try { localStorage.setItem('userName', name); } catch {}
      prefetchData();
    });
  }, [router]);

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

  const allGroups = [
    {
      label: 'ทะเบียน',
      items: [
        { href: '/customers', name: 'ทะเบียนลูกค้า', icon: Building2, cap: 'customers:view', match: (p) => p === '/customers' || p.startsWith('/customers/') },
        { href: '/products', name: 'ทะเบียนสินค้า', icon: Package, cap: 'products:view', match: (p) => p === '/products' || p.startsWith('/products/') },
      ],
    },
    {
      label: 'ระบบภาษี (LG)',
      items: [
        { href: '/legal', name: 'ขึ้นทะเบียนสินค้า', icon: ClipboardCheck, cap: 'legal:view', match: (p) => p === '/legal' },
        { href: '/legal/tax', name: 'ยื่นชำระภาษี', icon: ReceiptText, cap: 'legal:view', match: (p) => p === '/legal/tax' },
      ],
    },
    {
      label: 'งานขาย (SA)',
      items: [
        { href: '/sales', name: 'ใบเสนอราคา / PO', icon: FileText, cap: 'sales:view', match: (p) => p === '/sales' },
      ],
    },
    {
      label: 'ประวัติ',
      items: [
        { href: '/tracking', name: 'ประวัติทั้งหมด', icon: History, cap: 'history:view', match: (p) => p === '/tracking' },
      ],
    },
    {
      label: 'ตั้งค่า',
      items: [
        { href: '/users', name: 'จัดการผู้ใช้', icon: Users, cap: 'users:manage', match: (p) => p === '/users' },
      ],
    },
  ];

  // Show only menus the current role is allowed to see
  const navGroups = allGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => can(role, it.cap)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="app-container" data-sidebar={isCollapsed ? "icon" : "expanded"}>
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-section">
          <img src="/brand-logo.png" alt="Scent &amp; Sense" className="brand-logo-img" />
          <Link href="/customers" className="brand-info-link">
            <div className="brand-info">
              <div className="brand-title">Scent &amp; Sense</div>
              <div className="brand-subtitle">ระบบภาษีสรรพสามิต</div>
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
              <div className="user-avatar">{userName.substring(0, 2).toUpperCase()}</div>
              <div className="user-info" style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="user-name" style={{ fontSize: '12.5px', fontWeight: '600' }}>{userName}</span>
                <span className={`topbar-user-role ${role === 'ae_supervisor' || role === 'legal' ? 'admin' : (role === 'senior_ae' || role === 'ac' || role === 'ae') ? 'editor' : 'viewer'}`} style={{ fontSize: '10px', width: 'fit-content' }}>
                  {role}
                </span>
              </div>
            </div>

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
