"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Building2, Package, ClipboardCheck, ClipboardList, ReceiptText, FileText, Inbox, LogOut, Moon, Sun, ChevronDown, Users, KeyRound, FolderKanban, ListTodo, LayoutDashboard, BarChart3, LineChart, Boxes, Target, Trash2, MessageCircleQuestion, MoreHorizontal, X, Settings as SettingsIcon } from 'lucide-react';

// เส้นทางทั้งหมดที่ถือว่าอยู่ใต้เมนู "ตั้งค่า" (ให้ปุ่มติด active ตอนอยู่หน้าลูก)
const SETTINGS_PATHS = ['/settings', '/database/holidays', '/database/chat-webhooks', '/users', '/audit'];
import { createClient } from '@/lib/supabaseBrowser';
import { apiCache, cachedFetchJson } from '@/lib/apiCache';
import { can, canUser, canAccessSahamit, ROLE_LABELS, TEAM_LABELS } from '@/lib/permissions';
import { fmtName } from '@/lib/format';
import { RoleContext, TeamContext, ExtraCapsContext } from '@/lib/roleContext';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import { sortSystems, systemForPathname } from '@/config/navigation';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SYSTEM_ICONS = {
  salesplan: FolderKanban,
  tax: ReceiptText,
  sahamit: Boxes,
  master: Building2,
  mgmt: Users,
};

// Warm the data cache right after login so the first click on any menu is
// instant (data is already fetched in the background).
function prefetchData() {
  for (const url of ['/api/products', '/api/customers', '/api/orders', '/api/excise-registrations']) {
    // ผ่าน cachedFetchJson: ได้ timestamp ความสด — หน้าที่เปิดตามมาใน 2 นาที
    // ใช้ของที่อุ่นไว้เลย ไม่ยิงซ้ำ (ลด invocation + ภาระ DB)
    cachedFetchJson(url).catch(() => {});
  }
}

// เฟส T (Sales Revamp §5.1): navigation ทั้งระบบเป็น top bar 2 ชั้นตรึงบนสุด —
// ชั้นระบบ (โลโก้ navy + ตัวสลับระบบ + user actions) และชั้นเมนูของระบบปัจจุบัน
// (แนวนอน, จอแคบเลื่อนข้างได้). แทน sidebar เดิมทั้งหมด — เนื้อหาได้เต็มความกว้างจอ.
export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState(null);
  const [team, setTeam] = useState(null);
  const [extraCaps, setExtraCaps] = useState(null); // per-user LG/margin grants
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [isDark, setIsDark] = useState(false);
  const [activeSystem, setActiveSystem] = useState('tax');
  const [sysMenuOpen, setSysMenuOpen] = useState(false); // dropdown สลับระบบ
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const sysMenuRef = useRef(null);
  const bottomNavRef = useRef(null);

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
      setExtraCaps(Array.isArray(user.app_metadata?.extraCaps) ? user.app_metadata.extraCaps : []);
      // Force a password change on first login / after an admin reset.
      setMustChangePwd(!!user.app_metadata?.must_change_password);
      setUserName(dName);
      setUserInitials(inits);
      try { localStorage.setItem('userName', dName); } catch {}
      prefetchData();
    });
  }, [router]);

  useEffect(() => {
    const sys = systemForPathname(pathname);

    if (sys) setActiveSystem(sys);
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

  useEffect(() => {
    const activeItem = bottomNavRef.current?.querySelector('[aria-current="page"]');
    if (!activeItem) return;
    requestAnimationFrame(() => activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }));
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
      label: 'ฐานข้อมูล',
      system: 'master',
      home: '/database',
      items: [
        { href: '/database', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'customers:view', match: (p) => p === '/database' },
        { href: '/database/customers', name: 'ข้อมูลลูกค้า', icon: Building2, cap: 'customers:view', match: (p) => p === '/database/customers' || p.startsWith('/database/customers/') },
        { href: '/database/products', name: 'ข้อมูลสินค้า', icon: Package, cap: 'products:view', match: (p) => p === '/database/products' || p.startsWith('/database/products/') },
      ],
    },
    {
      label: 'งานภาษีสรรพสามิต',
      system: 'tax',
      home: '/tax',
      items: [
        { href: '/tax', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'history:view', match: (p) => p === '/tax' },
        { href: '/tax/registrations', name: 'การขึ้นทะเบียน', icon: ClipboardCheck, cap: 'history:view', match: (p) => p.startsWith('/tax/registrations') },
        { href: '/tax/filings', name: 'การยื่นชำระภาษี', icon: ReceiptText, cap: 'history:view', match: (p) => p.startsWith('/tax/filings') },
        { href: '/tax/reports', name: 'รายงาน', icon: BarChart3, cap: 'history:view', match: (p) => p === '/tax/reports' },
      ],
    },
    {
      label: 'บริหารงานขาย',
      system: 'salesplan',
      home: '/sa',
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
        { href: '/sa/tasks', name: 'งานของฉัน', icon: ListTodo, cap: 'salesplan:view', match: (p) => p === '/sa/tasks' || p.startsWith('/sa/tasks/') || p === '/pm/tasks' || p.startsWith('/pm/tasks/') },
      ],
    },
    {
      label: 'งานบริหาร',
      system: 'mgmt',
      home: '/mgmt',
      items: [
        { href: '/mgmt', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'mgmt:view', match: (p) => p === '/mgmt' },
        { href: '/mgmt/tasks', name: 'รายการงาน', icon: ListTodo, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/tasks') },
        { href: '/mgmt/meetings', name: 'การประชุม', icon: Users, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/meetings') },
        { href: '/mgmt/rocks', name: 'Rock & Improve', icon: Target, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/rocks') },
        { href: '/mgmt/trash', name: 'ถังขยะ', icon: Trash2, cap: 'mgmt:edit', match: (p) => p.startsWith('/mgmt/trash') },
      ],
    },
    {
      label: 'งานสหมิตร',
      system: 'sahamit',
      home: '/sahamit',
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

  const systemSubtitle =
    activeSystem === 'master' ? 'ฐานข้อมูล'
      : activeSystem === 'salesplan' ? 'บริหารงานขาย'
        : activeSystem === 'sahamit' ? 'งานสหมิตร'
          : activeSystem === 'mgmt' ? 'งานบริหาร'
            : activeSystem === 'users' ? 'จัดการผู้ใช้'
              : activeSystem === 'audit' ? 'บันทึกการใช้งาน'
                : 'ภาษีสรรพสามิต';

  // ระบบที่ผู้ใช้เข้าถึงได้ (ใช้ทั้ง dropdown สลับระบบ และกรองเมนูแถวล่าง).
  // canUser (not can) so a per-user grant — e.g. an SA granted mgmt:view to
  // help the secretary — surfaces that system too.
  const accessibleGroups = sortSystems(allGroups
    .filter((g) => g.system !== 'sahamit' || canAccessSahamit(role, team))
    .map((g) => ({ ...g, items: g.items.filter((it) => canUser({ role, extraCaps }, it.cap)) }))
    .filter((g) => g.items.length > 0));

  const currentGroup = accessibleGroups.find((g) => g.system === activeSystem) || null;
  const menuItems = currentGroup?.items || [];
  const ActiveSystemIcon = SYSTEM_ICONS[activeSystem] || LayoutDashboard;

  return (
    <div className="app-container">
      {/* ── Top bar 2 ชั้น (ตรึงบนสุดทั้งระบบ) ── */}
      <header className="topnav">
        {/* ชั้นระบบ: โลโก้ (พื้น navy ตามมาตรฐานแบรนด์) + สลับระบบ + user actions */}
        <div className="topnav-system">
          <Link href="/home" className="topnav-brand" title="หน้าแรก (สลับระบบ)">
            {/* โลโก้ตัวเต็มมี wordmark ในภาพแล้ว (มติผู้ใช้ 2026-07-16) — ไม่ใส่ข้อความซ้ำ */}
            <img src="/scent-sense-logo.png" alt="Scent &amp; Sense" className="topnav-brand-img" />
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
                  const SystemIcon = SYSTEM_ICONS[g.system] || LayoutDashboard;
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
            {/* Login User Info */}
            <div className="topbar-user-info">
              <div className="user-avatar">{userInitials || userName.substring(0, 2).toUpperCase()}</div>
              <div className="user-info" style={{ display: 'flex', alignItems: 'center', flexDirection: 'row', gap: '8px' }}>
                <span className="user-name" style={{ fontSize: '13px', fontWeight: '600' }}>{userName}</span>
                <span className={`topbar-user-role ${role === 'admin' || role === 'ae_supervisor' || role === 'legal' || role === 'secretary' ? 'admin' : (role === 'senior_ae' || role === 'ac' || role === 'ae') ? 'editor' : 'viewer'}`} style={{ fontSize: '10.5px', padding: '2px 8px', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                  {team ? `${ROLE_LABELS[role] || role} · ${TEAM_LABELS[team] || team}` : (ROLE_LABELS[role] || role)}
                </span>
              </div>
            </div>

            {/* Theme toggle (เดิมอยู่ footer ของ sidebar) */}
            <button onClick={toggleTheme} className="btn ghost icon-only" title={isDark ? 'Light mode' : 'Dark mode'}>
              {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
            </button>

            {/* บันทึกการใช้งาน + ผู้ใช้ ย้ายไปรวมในหน้า /settings (เมนู "ตั้งค่า") */}

            {/* Change own password */}
            {SUPABASE_CONFIGURED && (
              <button onClick={() => setShowPwd(true)} className="btn ghost icon-only" title="เปลี่ยนรหัสผ่าน">
                <KeyRound size={16} strokeWidth={2} />
              </button>
            )}

            {/* Logout Button */}
            <button onClick={handleLogout} className="btn ghost topbar-logout-btn flex items-center gap-1.5" title="ออกจากระบบ">
              <LogOut size={16} strokeWidth={2} />
              <span className="font-semibold topnav-logout-label">ออกจากระบบ</span>
            </button>
          </div>
        </div>

        {/* ชั้นเมนูของระบบปัจจุบัน — จอแคบเลื่อนแนวนอนได้ (ไม่มี drawer แล้ว) */}
        <nav className="topnav-menu" aria-label={`เมนู${systemSubtitle}`}>
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
          {canUser({ role, extraCaps }, 'salesplan:target') && (
            <Link
              href="/sa/targets"
              className={`topnav-item topnav-utility-item ${pathname.startsWith('/sa/targets') || pathname.startsWith('/sales-planning/targets') ? 'active' : ''}`}
            >
              <Target size={16} className="ico" />
              <span>วางเป้า</span>
            </Link>
          )}
          {/* เมนูระบบรวมจุดเดียว: ปฏิทิน/แจ้งเตือน/ผู้ใช้/audit ย้ายเข้า /settings ทั้งหมด */}
          <Link
            href="/settings"
            className={`topnav-item topnav-utility-item ${SETTINGS_PATHS.some((p) => pathname.startsWith(p)) ? 'active' : ''}`}
          >
            <SettingsIcon size={16} className="ico" />
            <span>ตั้งค่า</span>
          </Link>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="page">
          <RoleContext.Provider value={role}>
            <ExtraCapsContext.Provider value={extraCaps}>
              <TeamContext.Provider value={team}>{children}</TeamContext.Provider>
            </ExtraCapsContext.Provider>
          </RoleContext.Provider>
        </div>
      </main>

      <nav ref={bottomNavRef} className="mobile-bottom-nav" aria-label={`เมนู${systemSubtitle}`}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);
          return (
            <Link href={item.href} key={item.href} className={`mobile-bottom-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
              <Icon size={20} aria-hidden="true" />
              <span>{item.name}</span>
            </Link>
          );
        })}
        {!menuItems.length && (
          <Link href="/home" className={`mobile-bottom-item${pathname === '/home' ? ' active' : ''}`}>
            <Home size={20} aria-hidden="true" /><span>หน้าหลัก</span>
          </Link>
        )}
      </nav>

      {mobileMoreOpen && (
        <div className="mobile-nav-sheet" role="dialog" aria-modal="true" aria-label="เมนูเพิ่มเติม">
          <div className="mobile-nav-sheet-header">
            <div>
              <strong>{systemSubtitle}</strong>
              <span>เมนูเพิ่มเติมและการตั้งค่า</span>
            </div>
            <button type="button" className="btn-icon" onClick={() => setMobileMoreOpen(false)} aria-label="ปิดเมนู"><X size={20} /></button>
          </div>

          <section className="mobile-nav-section">
            <h2>เครื่องมือ</h2>
            <div className="mobile-nav-grid">
              <Link href="/home" className={`mobile-nav-card${pathname === '/home' ? ' active' : ''}`}><Home size={20} /><span>หน้าหลัก</span></Link>
              {canUser({ role, extraCaps }, 'salesplan:target') && <Link href="/sa/targets" className={`mobile-nav-card${pathname.startsWith('/sa/targets') || pathname.startsWith('/sales-planning/targets') ? ' active' : ''}`}><Target size={20} /><span>วางเป้า</span></Link>}
              <Link href="/settings" className={`mobile-nav-card${SETTINGS_PATHS.some((p) => pathname.startsWith(p)) ? ' active' : ''}`}><SettingsIcon size={20} /><span>ตั้งค่า</span></Link>
            </div>
          </section>

          <section className="mobile-nav-section mobile-account-actions">
            <h2>บัญชีและการตั้งค่า</h2>
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
