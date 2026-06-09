"use client";
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Building2, Package, Scale, ReceiptText, Clock, Search, LogOut, Moon, Sun, ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabaseBrowser';
import { apiCache } from '@/lib/apiCache';
import { can } from '@/lib/permissions';
import { RoleContext } from '@/lib/roleContext';

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

  useEffect(() => {
    // Load theme + sidebar state (independent of auth)
    if (document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-theme') === 'dark') {
      setIsDark(true);
    }
    setIsCollapsed(localStorage.getItem('sidebarCollapsed') === 'true');

    // Auth: read the signed-in user from Supabase. If Supabase isn't configured
    // yet (local dev before setup), fall back to a permissive local session.
    if (!SUPABASE_CONFIGURED) {
      setRole('admin');
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
      setRole(user.user_metadata?.role || 'user');
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
      label: 'ดำเนินการ',
      items: [
        { href: '/legal', name: 'ระบบภาษี', icon: Scale, cap: 'legal:view', match: (p) => p === '/legal' },
        { href: '/sales', name: 'แจ้งยื่นภาษี', icon: ReceiptText, cap: 'sales:view', match: (p) => p === '/sales' },
      ],
    },
    {
      label: 'ประวัติ',
      items: [
        { href: '/tracking', name: 'ประวัติทั้งหมด', icon: Clock, cap: 'history:view', match: (p) => p === '/tracking' },
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
                <span className={`topbar-user-role ${role === 'admin' || role === 'legal' ? 'admin' : role === 'sales' ? 'editor' : 'viewer'}`} style={{ fontSize: '10px', width: 'fit-content' }}>
                  {role}
                </span>
              </div>
            </div>

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
    </div>
  );
}
