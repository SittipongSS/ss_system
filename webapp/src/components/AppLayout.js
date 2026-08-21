"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Building2, Bug, Package, Tags, ClipboardCheck, ClipboardList, ReceiptText, FileText, FileSignature, Inbox, LifeBuoy, LogOut, Moon, Sun, ChevronDown, Users, KeyRound, FolderKanban, Handshake, Hammer, ListTodo, ShoppingCart, LayoutDashboard, BarChart3, LineChart, Boxes, Target, Trash2, MessageCircleQuestion, MoreHorizontal, X, Settings as SettingsIcon, UserRound, Calculator, FlaskConical, Beaker, Factory, MapPin, CalendarDays, CalendarRange, Wallet, Wrench, Menu } from 'lucide-react';

import { createClient } from '@/lib/supabaseBrowser';
import { apiCache } from '@/lib/apiCache';
import { canUser, canAccessFinance, canAccessRd, worksInSalesPipeline, canManageProductCategories, canEditProduction, canViewProduction, canEditService, canViewService, canAnswerRequestsFor, canViewCosting, canViewRequests, departmentFor, normalizeDepartment, userTeams, ROLE_LABELS, TEAM_LABELS } from '@/lib/permissions';
import { fmtName } from '@/lib/format';
import { RoleContext, TeamContext, TeamsContext, ExtraCapsContext, DepartmentContext } from '@/lib/roleContext';
import BrandMark from '@/components/BrandMark';
import AccountMenu from '@/components/AccountMenu';
import MobileBottomNav from '@/components/MobileBottomNav';
import NotificationBell from '@/components/notifications/NotificationBell';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import ReportIssueModal from '@/components/issues/ReportIssueModal';
import useNavCounts, { navCountFor, navCountForSystem, navHrefFor } from '@/lib/nav/useNavCounts';
import { isBareShellPathname, isSettingsPathname, sharedItemBelongsInGroup, systemForPathname } from '@/config/navigation';
import SettingsShell from '@/components/settings/SettingsShell';
import useScrollTopOnNavigate from '@/lib/ui/useScrollTopOnNavigate';
import { getSystemByKey, RECENT_SYSTEM_STORAGE_KEY, SYSTEM_DISABLED_NOTE, systemLandingForUser, systemsForUser } from '@/config/systems';

/* 🪤 สองค่านี้ต้องเป็น "ตรงข้าม" ของจุดตัดใน globals.css เป๊ะ ๆ — CSS รู้เรื่องนี้
   เองไม่ได้เพราะมันคือ **พฤติกรรมของปุ่ม** ไม่ใช่หน้าตา:
   · เหนือ 1200px ปุ่มย่อ/กางไปสลับ "ความชอบถาวร" · ต่ำกว่านั้นไป "เปิด/ปิดชั่วคราว"
   · ≤768px ไม่มีแถบข้างเลย ใช้แถบล่างแทน
   (1200 + 0.02 = ค่าถัดไปที่ CSS ถือว่าพ้น `@media (max-width: 1200px)`) */
const SIDENAV_WIDE_QUERY = '(min-width: 1200.02px)';
const SIDENAV_BOTTOM_QUERY = '(max-width: 768px)';

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// (ตัด prefetch หลัง login ออก — มติผู้ใช้ 2026-07-17 เรื่องลด traffic: เดิมอุ่น
// cache ด้วยการดาวน์โหลด products/customers/orders/registrations "ทั้งตารางเต็ม
// ทุกคอลัมน์" ทุกครั้งที่เข้าระบบ แม้ผู้ใช้ไม่เคยเปิดหน้าเหล่านั้นเลย = จ่าย egress
// ฟรีทุก login. ตอนนี้แต่ละหน้า fetch เองตอนเปิดครั้งแรกแล้วแคชแบบ SWR ตามเดิม —
// ช้าลงเฉพาะคลิกแรกของหน้านั้น ๆ ไม่ใช่ทุกการเข้าระบบ)

/* ── เมนูเอกสารร่วม — ประกาศครั้งเดียว ใช้ได้หลายกลุ่ม ────────────────────
   (มติผู้ใช้ 2026-08-22 · คู่กับ `ADOPTED_SHARED_PATHS` ใน config/navigation.js)

   ⭐ เอกสารพวกนี้อยู่ `/sa` ตามกฎสามชั้นชั้น 2 **แต่ฝ่ายที่ไม่ใช่ฝ่ายขายก็ทำงานกับมัน
   ทุกวัน** ⇒ ต้องขึ้นเมนูในบ้านของฝ่ายนั้นด้วย ไม่ใช่บังคับให้เขาเดินออกไปยืนใน
   เปลือก "บริหารงานขาย" ทุกครั้ง (กฎข้อ 8: ปลายทางต้องเป็นหน้าที่อยู่ในเมนูของเขา)

   ⚠️ **ห้ามก๊อปนิยามไปแปะซ้ำในแต่ละกลุ่ม** — `countHref`/`match` ของสองก้อนจะเพี้ยน
   หากันภายในไม่กี่เดือน (บทเรียนเดียวกับ ม-34 ที่ห้ามโคลนคิวคำร้อง) · `shared: true`
   คือธงที่ตัวกรองใน `accessibleGroups` ใช้ตัดสินว่ารายการนี้ควรขึ้นกลุ่มไหนของ "คนคนนี้"
   — ขึ้นได้กลุ่มเดียวเสมอ ไม่ใช่สองกลุ่มพร้อมกัน */
const SHARED_DOC_ITEMS = {
  // เฟส D: ใบเสนอราคา FM-SA-01 (มติผู้ใช้: เมนูแยกเพื่อง่ายต่อการค้นหา)
  quotations: { href: '/sa/quotations', name: 'ใบเสนอราคา', countHref: '/sa/quotations?count=quotations', icon: FileText, cap: 'salesplan:view', shared: true, match: (p) => p.startsWith('/sa/quotations') || p.startsWith('/sales-planning/quotations') },
  salesOrders: { href: '/sa/sales-orders', name: 'ใบสั่งขาย', countHref: '/sa/sales-orders?count=salesOrders', icon: ClipboardList, cap: 'salesplan:view', shared: true, match: (p) => p.startsWith('/sa/sales-orders') || p.startsWith('/sales-planning/sales-orders') },
  contracts: { href: '/sa/contracts', name: 'สัญญา', icon: FileSignature, cap: 'salesplan:view', shared: true, match: (p) => p.startsWith('/sa/contracts') || p.startsWith('/sales-planning/contracts') },
  // คำร้องข้ามฝ่าย (mig 0173) — สอบถาม/พัฒนากลิ่น/พัฒนาสูตร/ขอเอกสาร/ติดตามของเข้า
  // อยู่กลไกเดียว · เป็น "งาน" ไม่ใช่ข้อมูลหลัก
  // ⭐ **ด่านของเมนูนี้ไม่ใช่ `canViewCosting` อีกแล้ว** (R-1 · ม-42) — คำร้องยืมด่าน
  // ของระบบขอราคาผลิตมาใช้ตั้งแต่ตอนที่มันยังเป็น "ระบบขอราคาวัสดุ" ⇒ ฝ่ายที่รับ
  // คำร้องได้แต่ไม่มีสิทธิ์เห็นต้นทุน (บัญชี) เปิดเมนูไม่ได้เลย
  // ⚠️ `canViewRequests` กว้างกว่าโดยตั้งใจ — การกันข้อมูลอยู่ที่ **แถว**
  // (lib/requests/access.js) ไม่ใช่ที่เมนู
  // ⚠️ ไม่มี cap ชื่อ `requests:view` — ด่านคือ **สองสาขาของ `canViewRequests`**
  requests: { href: '/requests', name: 'คำร้อง', icon: MessageCircleQuestion, caps: ['costing:view', 'requests:answer'], visible: canViewRequests, shared: true, match: (p) => p.startsWith('/requests') },
};

// เฟส T (Sales Revamp §5.1): navigation ทั้งระบบเป็น top bar 2 ชั้นตรึงบนสุด —
// ชั้นระบบ (โลโก้ navy + ตัวสลับระบบ + user actions) และชั้นเมนูของระบบปัจจุบัน
// (แนวนอน, จอแคบเลื่อนข้างได้). แทน sidebar เดิมทั้งหมด — เนื้อหาได้เต็มความกว้างจอ.
export default function AppLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  // เปลี่ยนหน้าจากเมนูแล้วจอเคยค้างที่เดิม — ดูเหตุผลใน useScrollTopOnNavigate
  useScrollTopOnNavigate();
  const [role, setRole] = useState(null);
  const [team, setTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [department, setDepartment] = useState(null); // ฝ่ายของผู้ใช้ (SA/RD/PC/...)
  const [extraCaps, setExtraCaps] = useState(null); // per-user LG/margin grants
  const [userName, setUserName] = useState('');
  const [userInitials, setUserInitials] = useState('');
  const [isDark, setIsDark] = useState(false);
  // ป้ายจำนวน "รอคุณทำ" บนเมนู — คีย์ที่ผู้ใช้ไม่มีสิทธิ์เห็นไม่ถูกส่งมาเลย
  const navCounts = useNavCounts(pathname);
  const [activeSystem, setActiveSystem] = useState('tax');
  const [sysMenuOpen, setSysMenuOpen] = useState(false); // dropdown สลับระบบ
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  /* เมนูของระบบเป็นแถบข้างทุกความกว้าง (มติผู้ใช้ 2026-08-21 — ไม่มีโหมดแถบบนแล้ว)
     สามชั้นจอ: >1200 กาง/ย่อเองแล้วดันเนื้อหา · 901–1200 ราง กางแล้วลอยทับ ·
     769–900 แฮมเบอร์เกอร์เปิดลิ้นชัก · ≤768 แถบล่างมือถือ

     สองสถานะแยกกันคนละหน้าที่ ห้ามยุบรวม:
     · `navCollapsed` = **ความชอบของผู้ใช้บนจอกว้าง** เก็บถาวรที่ `data-sidenav`
       บน <html> เพราะสคริปต์ก่อน hydrate ใน app/layout.js ต้องอ่านได้ก่อนเพนต์
       (ท่าเดียวกับธีม) ไม่งั้นแถบกางเต็มแล้วหุบให้เห็นทุกครั้งที่โหลดหน้า
     · `navOpen` = **การกางชั่วคราวบนจอกลาง/แคบ** ไม่เก็บถาวร ปิดเองเมื่อเปลี่ยนหน้า
       — ถ้าเอาไปปนกับความชอบข้างบน คนที่เปิดลิ้นชักบนแท็บเล็ตครั้งเดียวจะกลับไป
       เจอจอคอมกางค้างโดยไม่ได้สั่ง */
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  /* ⚠️ ใช้บอก **สถานะจริง** ให้ปุ่ม (aria-expanded / คำบนปุ่ม) เท่านั้น ห้ามเอาไป
     ตัดสินหน้าตา — หน้าตาทั้งหมดเป็นงานของ CSS ที่รู้ตั้งแต่เพนต์แรก ส่วนค่านี้
     ฝั่ง server ไม่มีทางรู้ จึงเป็น false หนึ่งเฟรมเสมอตอนโหลดหน้า */
  const [isWide, setIsWide] = useState(false);
  const sysMenuRef = useRef(null);

  /* ⚠️ ต้องประกาศ **ก่อน** effect ที่ตัดสินเปลือกระบบข้างล่าง — ตั้งแต่มติ 2026-08-22
     เปลือกของเอกสารร่วมเดินตาม *คนดู* ไม่ใช่ตาม URL อย่างเดียวอีกต่อไป
     ⚠️ ค่าเป็น null ทั้งหมดหนึ่งเฟรมแรกเสมอ (auth ยังไม่กลับ) ⇒ effect ต้องมี
     `role`/`department` อยู่ใน dependency ไม่งั้นเปลือกค้างที่ผลลัพธ์ของเฟรมนั้น */
  const userContext = { role, team, teams, department, extraCaps };

  // Self-service password change (any signed-in user, their own account only).
  const [showPwd, setShowPwd] = useState(false);
  const [showReport, setShowReport] = useState(false); // โมดัลแจ้งปัญหาระบบ (mig 0223)
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
      // team = ทีมหลัก (attribution) · teams = ทุกทีมที่สังกัด (ขอบเขตแถว) — คนอยู่หลายทีมได้
      setRole(user.app_metadata?.role || 'user');
      setTeam(user.app_metadata?.team || null);
      setTeams(userTeams({ team: user.app_metadata?.team, teams: user.app_metadata?.teams }));
      // ฝ่าย: กติกาเดียวกับ server (assignable-users) — department ตรง หรืออนุมานจาก role
      setDepartment(normalizeDepartment(user.app_metadata?.department) || departmentFor(user.app_metadata?.role) || null);
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
    setMobileMoreOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, role, department, extraCaps]);

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

  /* อ่านสถานะแถบข้างที่สคริปต์ก่อนเพนต์ตั้งไว้ ให้ปุ่มสลับเริ่มต้นตรงกับของจริง
     (เรนเดอร์ฝั่ง server ไม่มีทางรู้ค่านี้ จึงต้องมาเก็บตอน mount) */
  useEffect(() => {
    setNavCollapsed(document.documentElement.getAttribute('data-sidenav') === 'collapsed');
  }, []);

  /* ข้ามชั้นจอเมื่อไร ให้ล้างการกางชั่วคราวทิ้งเสมอ
     🐞 ไม่ล้างแล้วเจอของจริง: เปิดลิ้นชักบนจอ 850 แล้วลากหน้าต่างให้กว้างเกิน 1200
     — CSS ชั้นจอกว้างไม่มีกฎ .sidenav-open เลย แถบจึงกลับไปเป็นแถบปกติ แต่ state
     ยังค้างว่า "เปิดอยู่" ผลคือกดปุ่มย่อครั้งแรกไม่มีอะไรเกิดขึ้น (มันไปปิดของที่
     มองไม่เห็น) · ขอบ 900 ไม่ต้องล้าง เพราะลิ้นชักกับแถบลอยหน้าตาต่อเนื่องกันอยู่แล้ว */
  useEffect(() => {
    const wide = window.matchMedia(SIDENAV_WIDE_QUERY);
    const bottom = window.matchMedia(SIDENAV_BOTTOM_QUERY);
    const sync = () => { setIsWide(wide.matches); setNavOpen(false); };
    sync();
    wide.addEventListener('change', sync);
    bottom.addEventListener('change', sync);
    return () => {
      wide.removeEventListener('change', sync);
      bottom.removeEventListener('change', sync);
    };
  }, []);

  const toggleSideNav = () => {
    if (navOpen) { setNavOpen(false); return; }
    /* ⚠️ ถามชั้นจอ **สด ๆ ตอนกด** ไม่ใช่อ่านจาก `isWide` — ปุ่มต้องทำงานถูกเสมอ
       แม้ event ที่คอยอัปเดต state จะพลาดไปสักรอบ (ในเครื่องมือทดสอบที่ย่อ/ขยาย
       จอผ่าน CDP ทั้ง `resize` และ `matchMedia change` ไม่ยิงเลย ขณะที่ CSS
       คิดจุดตัดใหม่ปกติ) · `isWide` เอาไว้บอก *สถานะ* เท่านั้น พลาดแล้วแค่ป้าย
       บนปุ่มค้าง ไม่ใช่ปุ่มทำงานผิด */
    if (!window.matchMedia(SIDENAV_WIDE_QUERY).matches) { setNavOpen(true); return; }
    const next = !navCollapsed;
    document.documentElement.setAttribute('data-sidenav', next ? 'collapsed' : 'expanded');
    try { localStorage.sidenav = next ? 'collapsed' : 'expanded'; } catch {}
    setNavCollapsed(next);
  };

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

  if (!role) return null;

  // Each group belongs to a "system" (the cards on /home). The menu row shows
  // only the current system's items; the system dropdown switches systems.
  const allGroups = [
    {
      system: 'master',
      items: [
        { href: '/database', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'customers:view', match: (p) => p === '/database' },
        { href: '/database/customers', name: 'ข้อมูลลูกค้า', countHref: '/database/customers?count=customers', icon: Building2, cap: 'customers:view', match: (p) => p === '/database/customers' || p.startsWith('/database/customers/') },
        { href: '/database/products', name: 'ข้อมูลสินค้า', icon: Package, cap: 'products:view', match: (p) => p === '/database/products' || p.startsWith('/database/products/') },
        // ทะเบียนกลิ่น + สูตร (mig 0171) — ข้อมูลหลักของ RD ที่คำร้องขอราคา F/FB
        // อ้างถึง · อยู่ใต้ "ฐานข้อมูล" เพราะเป็น master data ไม่ใช่เอกสารงาน
        { href: '/database/scents', name: 'ทะเบียนกลิ่น', countHref: '/database/scents?count=scents', icon: FlaskConical, cap: 'products:view', match: (p) => p.startsWith('/database/scents') },
        { href: '/database/formulas', name: 'ทะเบียนสูตร', countHref: '/database/formulas?count=formulas', icon: Beaker, cap: 'products:view', match: (p) => p.startsWith('/database/formulas') },
        // ทะเบียนวัสดุ — ย้ายมาจาก /sa/materials เพราะเหตุผลที่เคยอยู่ใต้ "ขาย" คือ
        // แท็บคิวเคสขอราคา ซึ่งย้ายออกไปเป็นเมนู "คำร้อง" แล้ว (mig 0173) เหลือ
        // งานเดียวคือข้อมูลหลักราคาวัสดุ = ทรงเดียวกับกลิ่น/สูตร/สินค้า
        // ⚠️ cap ต้องคง costing:view + canViewCosting ไว้ ห้ามกลืนเป็น products:view
        //    ตามเพื่อนบ้านในกลุ่มนี้ — products:view อยู่ใน DEFAULT_CAPS (แทบทุกคนถือ)
        //    ส่วนแถวในทะเบียนนี้คือ **ราคาต้นทุน** ถ้าเปิดกว้างคือต้นทุนรั่วทั้งบริษัท
        // `disabled: true` = จางและกดไม่ได้ **ไม่ใช่ถอดออก** (มติผู้ใช้ 2026-08-12) —
        // ทะเบียนนี้เหลือบรรจุภัณฑ์ (PM) รอโมดูลจัดซื้อ (docs/rm-price-registry-split.md)
        // และยังว่างอยู่ · ราคา F/FB ย้ายไปทะเบียนกลิ่น/สูตรแล้ว จึงพักเมนูไว้ก่อน
        // เปิดใช้อีกครั้งตอนโมดูลจัดซื้อมา — แค่ลบ flag นี้
        { href: '/database/materials', name: 'ทะเบียนวัสดุ', icon: Boxes, cap: 'costing:view', visible: canViewCosting, disabled: true, match: (p) => p.startsWith('/database/materials') },
        { href: '/database/product-categories', name: 'หมวดสินค้า', icon: Tags, cap: 'products:view', managerOnly: true, match: (p) => p.startsWith('/database/product-categories') },
      ],
    },
    {
      system: 'tax',
      items: [
        { href: '/tax', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'history:view', match: (p) => p === '/tax' },
        { href: '/tax/registrations', name: 'การขึ้นทะเบียน', countHref: '/tax/registrations?status=mine', icon: ClipboardCheck, cap: 'history:view', match: (p) => p.startsWith('/tax/registrations') },
        // shortName ไม่ต้องมี — ระบบภาษีมี 4 เมนู ช่องบนแถบล่างจึงกว้าง 93.8px
        // ซึ่งพอดีป้ายนี้ (73.3px) · วัดในแอปจริง 2026-08-02
        { href: '/tax/filings', name: 'การยื่นชำระภาษี', countHref: '/tax/filings?status=mine', icon: ReceiptText, cap: 'history:view', match: (p) => p.startsWith('/tax/filings') },
        { href: '/tax/reports', name: 'รายงาน', icon: BarChart3, cap: 'history:view', match: (p) => p === '/tax/reports' },
      ],
    },
    {
      system: 'salesplan',
      items: [
        { href: '/sa/dashboard', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'salesplan:view', visible: worksInSalesPipeline, match: (p) => p === '/sa/dashboard' || p === '/sa' || p === '/sales-planning' || p === '/sa/my-dashboard' || p === '/sa/kpi' },
        // เฟส C: คิวลีดของ Marketing/ฝ่ายขาย — role marketing เห็นเมนูนี้ตัวเดียว
        { href: '/sa/leads', name: 'ลีด', icon: Inbox, cap: 'salesplan:lead', match: (p) => p.startsWith('/sa/leads') || p.startsWith('/sales-planning/leads') },
        /* ปฏิทินนัด — อ่านจาก lead_events (kind='meeting') ที่บันทึกจากคิวลีด
           cap เดียวกับเมนู "ลีด" เพราะเป็นข้อมูลชุดเดียวกันคนละมุมมอง
           ⭐ `utility: true` = อยู่กลุ่มขวาข้าง "วางเป้า" (มติผู้ใช้ 2026-08-21) — แถบซ้าย
           เป็น **ลำดับงาน** (ลีด → ดีล → ใบเสนอราคา → ใบสั่งขาย) ส่วนปฏิทินกับวางเป้า
           เป็นเครื่องมือที่เปิดเมื่อไรก็ได้ ไม่ใช่ขั้นของสายงาน · บนมือถือยังอยู่ในแผ่นเมนูตามเดิม
           ⚠️ ไม่ใช่ปฏิทินของ /mgmt (คนละตาราง คนละ cap — AE เปิดตัวนั้นไม่ได้) */
        { href: '/sa/calendar', name: 'ปฏิทินนัด', icon: CalendarDays, cap: 'salesplan:lead', utility: true, match: (p) => p.startsWith('/sa/calendar') },
        // "ดีล" = งานขายแต่ละก้อน (SCENT/NPD/RE-ORDER) — คำ "โครงการ" สงวนให้ตัว
        // project ฝั่ง execution ตามมาตรฐาน IA (SALES_REVAMP_PLAN §5)
        { href: '/sa/deals', name: 'ดีล', icon: Handshake, cap: 'salesplan:view', visible: worksInSalesPipeline, match: (p) => p === '/sa/deals' || p.startsWith('/sa/deals/') || p === '/sales-planning/deals' || p.startsWith('/sales-planning/deals/') },
        // เฟส B: หน้ารวมโครงการ (ภาชนะรวมดีล + KPI rollup) — เดิม /sa/projects เด้งไปหน้าดีล
        { href: '/sa/projects', name: 'โครงการ', countHref: '/sa/projects?count=projectCloses', icon: FolderKanban, cap: 'salesplan:view', visible: worksInSalesPipeline, match: (p) => p === '/sa/projects' || p.startsWith('/sa/projects/') || p.startsWith('/pm/projects') },
        /* เอกสารร่วมสามชนิด — นิยามอยู่ที่ `SHARED_DOC_ITEMS` เพราะฝ่าย FN มีเมนู
           ชุดนี้ในบ้านตัวเองด้วย (มติผู้ใช้ 2026-08-22) · ขึ้นได้กลุ่มเดียวต่อคน */
        SHARED_DOC_ITEMS.quotations,
        SHARED_DOC_ITEMS.salesOrders,
        SHARED_DOC_ITEMS.contracts,
        // (เมนู "สอบถาม RD" ถูกถอดใน mig 0174 — งานย้ายไปเมนู "คำร้อง" ข้างล่าง
        //  ซึ่งรับได้ทุกชนิดรวมสอบถาม/ขอเอกสาร ไม่ใช่แค่ถาม RD อย่างเดียว)
        // ใบขอราคาผลิต (mig 0141) — ฝ่ายขาย/RD/PC/ผู้บริหารใช้หน้าเดียวกัน
        // cap costing:view กว้างเกินจริง (role staff ถือทั้ง PD/WH/QC ด้วย) จึงต้อง
        // แคบด้วยฝ่ายผ่าน canViewCosting ไม่งั้นฝ่ายที่ไม่เกี่ยวเห็นเมนูต้นทุน
        // `disabled: true` = จางและกดไม่ได้ **ไม่ใช่ถอดออก** (มติผู้ใช้ 2026-08-09) —
        // ถอดเมื่อไร ฝ่ายขายจะไปเปิดใบผิดชนิดแทน แล้วเราไม่รู้ว่ามีคนรออยู่กี่ใบ
        // ⚠️ เปลือก UI เท่านั้น — /sa/costing ยังเข้าได้ถ้าพิมพ์ URL ตรง ๆ
        { href: '/sa/costing', name: 'ขอราคาผลิต', icon: Calculator, cap: 'costing:view', visible: canViewCosting, disabled: true, match: (p) => p.startsWith('/sa/costing') },
        // คำร้องข้ามฝ่าย (mig 0173) — เป็น "งาน" ไม่ใช่ข้อมูลหลัก จึงอยู่ใต้ขาย
        // ต่างจากทะเบียนวัสดุที่ย้ายไปฐานข้อมูลแล้ว · นิยาม + เหตุผลของด่านอยู่ที่
        // `SHARED_DOC_ITEMS` (ฝ่าย RD/FN มีเมนูตัวนี้ในบ้านตัวเอง)
        SHARED_DOC_ITEMS.requests,
        // (เมนู "ทะเบียนวัสดุ" ย้ายไปกลุ่ม "ฐานข้อมูล" — ดูหมายเหตุที่นั่น)
        { href: '/sa/tasks', name: 'งานของฉัน', icon: ListTodo, caps: ['salesplan:view', 'pm:view'], visible: worksInSalesPipeline, match: (p) => p === '/sa/tasks' || p.startsWith('/sa/tasks/') || p === '/pm/tasks' || p.startsWith('/pm/tasks/') },
      ],
    },
    {
      // วิจัยและพัฒนา — บ้านของฝ่าย RD (ม-29) · ระบบแยกจากบริหารงานขาย
      //
      // 🐞 **กลุ่มนี้หายไปตั้งแต่ P2 ที่สร้างระบบขึ้นมา** — `SYSTEM_CATALOG` มีการ์ด
      // แต่ `allGroups` ไม่มี `rd` ⇒ `menuItems` ว่าง ⇒ ฝ่าย RD สลับเข้าบ้านตัวเอง
      // แล้ว **ไปไหนต่อไม่ได้จากเมนูเลย**: เข้าคิวได้ทางเดียวคือกดตัวเลขบนภาพรวม
      // และเข้าไปแล้วกลับหน้าภาพรวมไม่ได้ · build/เทสต์จับไม่ได้เพราะทั้งสองหน้า
      // เรนเดอร์ปกติทุกอย่าง ผิดแค่เปลือกที่ครอบมัน (อาการเดียวกับ `/requests`
      // ที่เคยหลุดไปอยู่ใต้เมนูระบบภาษี) · เทสต์ "ทุกระบบต้องมีกลุ่มเมนูของตัวเอง"
      // ใน navMenuNames.test.mjs กันไม่ให้ระบบตัวถัดไปซ้ำรอย
      //
      // ⚠️ **caps ต้องมี `users:manage` ด้วย** — admin ไม่ถือ `requests:answer`
      // (ตรวจ 2026-08-08) ⇒ ใส่ cap เดียวแล้ว admin จะเห็นการ์ดระบบแต่เมนูถูกกรอง
      // ทิ้งจนเหลือศูนย์ แล้ว `.filter((g) => g.items.length > 0)` ตัดทั้งกลุ่ม =
      // แถบว่างเหมือนเดิม · ตัวแคบจริงคือ `visible: canAccessRd` ซึ่งเป็นด่าน
      // **ตัวเดียวกับที่การ์ดระบบใช้** จึงเพี้ยนหากันไม่ได้
      //
      // ⚠️ ทะเบียนกลิ่น/สูตรไม่อยู่ในเมนูนี้ทั้งที่ RD เป็นคนเขียน — มันเป็นข้อมูล
      // กลางที่อยู่ใต้ "ฐานข้อมูล" (ม-30) · ลิงก์ข้ามระบบจะสลับเปลือกทั้งแถบแล้ว
      // ไฮไลต์ไม่ติด (match ไม่มีวันเป็นจริง) ⇒ ใช้ตัวสลับระบบตามทางปกติ
      system: 'rd',
      items: [
        /* ⚠️ `disabled: true` = **จางและกดไม่ได้ ไม่ใช่ถอดออก** (แพตเทิร์นเดียวกับ
           "ภาพรวม" ของบัญชีและการเงิน · "ทะเบียนวัสดุ" · "ขอราคาผลิต")
           มติผู้ใช้ 2026-08-15 — เทาไว้ก่อนทั้งที่หน้ามีของจริง
           ⚠️ ซ่อนทิ้งไม่ได้ — คนที่เคยเห็นจะนึกว่าสิทธิ์ตัวเองหาย (เหตุผลเดียวกับการ์ดระบบ)
           ⚠️ **ต้องแก้ `landing` ของการ์ดระบบ `rd` พร้อมกันเสมอ** ไม่งั้นกดการ์ดแล้ว
           เด้งเข้าหน้าที่เมนูบอกว่ากดไม่ได้ — systems.test.mjs กันไว้แล้ว */
        { href: '/rd', name: 'ภาพรวม', icon: LayoutDashboard, caps: ['requests:answer', 'users:manage'], visible: canAccessRd, disabled: true, match: (p) => p === '/rd' },
        // ชื่อต้องไม่ซ้ำกับ "คำร้อง" ของระบบบริหารงานขาย — คนละมุมของตารางเดียวกัน:
        // ฝั่งขาย = ใบที่ฉันเปิด · ฝั่งนี้ = ใบที่ส่งมาถึงฝ่ายฉัน (กฎเดียวกับที่
        // "งานของฉัน" กับ "นัดของฉัน" เคยชนกันแล้วคนเปิดผิดหน้าประจำ)
        /* ⭐ `match` กินใบคำร้อง (`/requests/[id]`) ด้วย — **ไม่ใช่ของเกิน**
           ใบเป็นจอเดียวกันทั้งสองฝั่ง (ม-31) และเปลือกของมันเดินตามคนดู (กฎข้อ 9)
           ⇒ RD กดใบจากคิวแล้วยังยืนในบ้านตัวเอง เมนูต้องไฮไลต์ที่คิว ซึ่งเป็นที่เดียว
           ที่เขาเข้าถึงใบนั้นได้จริง (กฎข้อ 8)
           ⚠️ **ไม่มีเมนู "คำร้อง" (คิวรวม) ในโมดูลนี้** — มติผู้ใช้ 2026-08-22:
           *"บัญชี กับ RD ไม่มีที่ต้องเปิดเอง มีแต่ SA ที่ต้องเปิดมาหา"* ⇒ แท็บ
           "ที่ฉันเปิด" ของคิวรวมว่างเปล่าตลอดกาลสำหรับเขา · ประวัติงานของฝ่าย
           อยู่ในแท็บ "ประวัติ" ของคิวนี้แล้ว */
        { href: '/rd/requests', name: 'คิวคำร้อง', icon: MessageCircleQuestion, caps: ['requests:answer', 'users:manage'], visible: canAccessRd, match: (p) => p.startsWith('/rd/requests') || p.startsWith('/requests') },
      ],
    },
    {
      // บัญชีและการเงิน — บ้านของฝ่าย FN (มติผู้ใช้ 2026-08-13)
      //
      // ⚠️ ด่านเป็น `canAccessFinance` **ตัวเดียวกับที่การ์ดระบบใช้** — บทเรียนจาก
      // โมดูล RD ที่เคยแยกสองที่แล้วได้การ์ดที่กดเข้าไปเจอแถบเมนูว่าง
      //
      // 🐞 **caps ต้องมีเสมอ ห้ามเว้น** — รอบแรกเขียนแต่ `visible` แล้วเมนูหายทั้งกลุ่ม:
      // ตัวกรองอ่าน `item.caps || [item.cap]` ⇒ ได้ `[undefined]` ⇒ ไม่ผ่านสักข้อ ⇒
      // `items.length === 0` ⇒ `.filter((g) => g.items.length > 0)` ตัดทั้งกลุ่มทิ้ง
      // ได้เปลือกที่ขึ้นชื่อ "บัญชีและการเงิน" แต่แถบเมนูว่างเปล่า (อาการเดียวกับที่
      // คอมเมนต์ของกลุ่ม RD ข้างบนเตือนไว้ · เจอซ้ำเพราะเขียนคนละสาเหตุ)
      //
      // ⚠️ ต้องมีสองตัว: `payments:confirm` ครอบทั้ง role `finance` และคน FN ที่ยังถือ
      // `staff` (ยังไม่ย้าย role) ส่วน `users:manage` ให้ admin ซึ่งไม่ถือ payments:confirm
      // ⚠️ cap กว้างกว่าฝ่ายจริง (staff ฝ่ายอื่นก็ถือ payments:confirm) — ตัวแคบคือ
      // `visible: canAccessFinance` ซึ่งเป็น **ด่านเดียวกับที่การ์ดระบบใช้**
      system: 'finance',
      items: [
        /* ⚠️ `disabled: true` = **จางและกดไม่ได้ ไม่ใช่ถอดออก** (แพตเทิร์นเดียวกับ
           "ทะเบียนวัสดุ" และ "ขอราคาผลิต") — มติผู้ใช้ 2026-08-13:
           *"หน้าภาพรวมเทาไว้ก่อนก็ได้ เดี๋ยวรอโมดูลเสร็จค่อยทำ เพราะมันคือภาพรวมของทั้งหมด"*
           ⇒ ตอนนี้โมดูลมีของจริงอยู่หน้าเดียว ภาพรวมจึงเป็นภาพรวมของตัวเอง ซึ่งไม่มีค่า
           ⚠️ ซ่อนทิ้งไม่ได้ — คนที่เคยเห็นจะนึกว่าสิทธิ์ตัวเองหาย (เหตุผลเดียวกับการ์ดระบบ) */
        { href: '/finance', name: 'ภาพรวม', icon: LayoutDashboard, caps: ['payments:confirm', 'users:manage'], visible: canAccessFinance, disabled: true, match: (p) => p === '/finance' },
        // ชื่อ "ทะเบียนการชำระ" ไม่ใช่ "การชำระ" — ฝั่ง SO มีการ์ด "การชำระ" ของใบ
        // อยู่แล้ว · ชื่อซ้ำกันคนละที่คือสิ่งที่ทำให้คนเปิดผิดหน้าประจำ (กฎเดียวกับ
        // "คำร้อง" ของฝ่ายขาย vs "คิวคำร้อง" ของ RD)
        { href: '/finance/payments', name: 'ทะเบียนการชำระ', icon: Wallet, caps: ['payments:confirm', 'users:manage'], visible: canAccessFinance, match: (p) => p.startsWith('/finance/payments') },
        /* คิวคำร้องที่ส่งถึงฝ่ายบัญชี (B-1 · ม-ก) — ชื่อ "คิวคำร้อง" ตรงกับของ RD
           โดยตั้งใจ: เป็นของอย่างเดียวกันคนละฝ่าย · ต้องไม่ชนกับ "คำร้อง" ของฝ่ายขาย
           ซึ่งเป็นคนละมุมของตารางเดียวกัน (ที่นั่นเปิดใบ ที่นี่ตอบใบ)
           ⚠️ ไอคอนตัวเดียวกับ `/requests` และ `/rd/requests` — หนึ่ง entity หนึ่งไอคอน */
        /* `match` กินใบคำร้องด้วย และ **ไม่มีเมนู "คำร้อง" (คิวรวม)** — เหตุผลเดียว
           กับของ RD ข้างบน (มติผู้ใช้ 2026-08-22: บัญชีไม่เปิดคำร้องเอง) */
        { href: '/finance/requests', name: 'คิวคำร้อง', icon: MessageCircleQuestion, caps: ['requests:answer', 'users:manage'], visible: canAccessFinance, match: (p) => p.startsWith('/finance/requests') || p.startsWith('/requests') },
        /* ⭐ เอกสารขายที่ฝ่ายบัญชีทำงานด้วยจริง — **ย้ายมาจากกลุ่ม "บริหารงานขาย"**
           (มติผู้ใช้ 2026-08-22) · กฎข้อ 7 (2026-08-13) ตัดสินไปแล้วว่าเมนูของ FN
           คือใบเสนอราคา · ใบสั่งขาย · คำร้อง — แต่รายการเหล่านั้นถูกประกาศไว้ใน
           *กลุ่มของฝ่ายขาย* ⇒ FN จะเห็นได้ก็ต่อเมื่อเดินออกไปยืนในเปลือกคนอื่น
           ซึ่งคือสิ่งที่ผู้ใช้บอกว่า *"พอกดเข้าไป มันรูทเข้าไปที่บริหารงานขาย"*
           ⚠️ **ไม่ใช่ก๊อป** — เป็นตัวเดียวกับที่กลุ่มขายใช้ (`SHARED_DOC_ITEMS`)
           และตัวกรองใน `accessibleGroups` ให้ขึ้นได้กลุ่มเดียวต่อคนเสมอ
           ⚠️ "สัญญา" ติดมาด้วยเพราะวันนี้ FN เห็นอยู่แล้ว (cap `salesplan:view`
           ไม่มีด่านฝ่าย) — ย้ายบ้านต้องไม่ทำให้ใครเสียเมนูที่เคยมี */
        SHARED_DOC_ITEMS.quotations,
        SHARED_DOC_ITEMS.salesOrders,
        SHARED_DOC_ITEMS.contracts,
      ],
    },
    {
      // วางแผนผลิต — ระบบแยก ไม่ใช่เมนูใต้ "บริหารงานขาย" (มติผู้ใช้ 2026-07-30)
      system: 'production',
      items: [
        // ภาพรวมมาก่อนสุด (X-1) — เปิดระบบมาเห็นว่า "ต้องตัดสินใจอะไรก่อน" แล้วค่อย
        // กดเข้าคิว/บอร์ด · แยกจากภาพรวมของธุรกิจบริการ เพราะคนละทีมปฏิบัติงาน
        { href: '/production', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'production:view', visible: canViewProduction, match: (p) => p === '/production' },
        // ไลน์ผลิต (mig 0184) = ชั้น "กำลัง" ของตารางผลิต · คนตั้งค่าคือฝ่าย PC/PD
        // cap production:view กว้าง (ฝ่ายขายอ่านได้เพื่อตอบลูกค้า) แต่หน้า *ตั้งค่า*
        // ควรขึ้นเมนูเฉพาะคนที่แก้ได้จริง ไม่งั้นทุกคนเห็นเมนูที่กดไปแล้วทำอะไรไม่ได้
        // คิวมาก่อนไลน์ — PC เปิดระบบมาเพื่อดูว่าต้องผลิตอะไรก่อน ไม่ใช่มาตั้งค่าไลน์
        { href: '/production/jobs', name: 'คิวงานผลิต', countHref: '/production/jobs?count=productionJobs', icon: Hammer, cap: 'production:view', visible: canEditProduction, match: (p) => p.startsWith('/production/jobs') },
        // บอร์ดเปิดให้ **ทุกคนที่อ่านตารางผลิตได้** (P-3) — คลัง/QC/ฝ่ายขายเข้ามาดู
        // ว่าโรงงานจะผลิตวันไหน โดยไม่ต้องเดินไปถาม · TS ไม่เห็น (คนละทีมปฏิบัติงาน)
        { href: '/production/board', name: 'บอร์ดตารางผลิต', icon: CalendarRange, cap: 'production:view', visible: canViewProduction, match: (p) => p.startsWith('/production/board') },
        { href: '/production/lines', name: 'ไลน์ผลิต', icon: Factory, cap: 'production:edit', visible: canEditProduction, match: (p) => p.startsWith('/production/lines') },
      ],
    },
    {
      // ธุรกิจบริการของฝ่าย TS — คนละโมดูลกับผลิต (มติผู้ใช้ 2026-07-30)
      system: 'service',
      items: [
        // ภาพรวมมาก่อนสุด (X-1) — หัวหน้าทีมบริการเปิดมาเห็นนัดค้าง/วันนี้ใครไปไหน/
        // ไซต์ที่น้ำหอมกำลังจะหมด · **คนละหน้ากับภาพรวมของวางแผนผลิต** ตามมติแยกทีม
        { href: '/service', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'service:view', visible: canViewService, match: (p) => p === '/service' },
        // ทะเบียนไซต์ = cap อ่าน เพราะฝ่ายขายต้องตอบได้ว่าลูกค้ามีเครื่องกี่จุด
        // ปุ่มแก้ในหน้าซ่อนตาม canEditService เอง
        // ตารางมาก่อนทะเบียน — หน้าที่ช่าง/หัวหน้าเปิดทุกเช้าคือตาราง ไม่ใช่ทะเบียน
        // งานของฉันมาก่อนสุด — ช่างเปิดระบบมาเพื่อดูงานตัวเองวันนี้ ไม่ใช่ตารางทั้งฝ่าย
        // ⚠️ ชื่อต้องไม่ซ้ำกับ "งานของฉัน" ของระบบบริหารงานขาย (/sa/tasks) — คนละเรื่อง
        // กันคนละระบบ: ฝั่งขาย = งานติดตามส่วนบุคคล · ฝั่งนี้ = นัดเข้าไซต์ที่ต้องไปทำจริง
        // ชื่อซ้ำข้ามระบบทำให้คนจำไม่ได้ว่าของตัวเองอยู่เมนูไหน แล้วเปิดผิดหน้าประจำ
        // ใครเห็นเมนูนี้ = **คนที่แก้งานบริการได้** (มติผู้ใช้ 2026-07-31) — ฝ่ายช่าง TS ·
        // ทีมขาย SV · admin/หัวหน้าฝ่ายขาย · กว้างกว่า "คนที่รับงานได้" หนึ่งขั้นเพื่อให้
        // หัวหน้าเปิดดูรูปหน้าจอของช่างได้ โดยไม่เปิดให้ฝ่ายขายทีมอื่นที่ไม่เกี่ยวเลย
        // 🐞 เดิมเปิดด้วย service:view = ฝ่ายขายทุกคนเห็นเมนูที่กดเข้าไปแล้วว่างเสมอ
        { href: '/service/my-visits', name: 'นัดของฉัน', icon: Wrench, cap: 'service:view', visible: canEditService, match: (p) => p.startsWith('/service/my-visits') },
        // ⚠️ ต้องมี visible: canViewService ทุกรายการ — cap service:view ถือกว้างระดับ role
        // (staff ทุกฝ่ายถือ) แล้วแคบด้วย **ฝ่าย TS** ที่ canViewService · ถ้าเช็คแค่ cap
        // ฝ่ายคลัง/QC จะเห็นเมนูของทีมช่าง ซึ่งขัดมติแยกทีม (PD ≠ TS) ที่ตกลงไว้
        { href: '/service/schedule', name: 'ตารางเข้าบริการ', icon: CalendarDays, cap: 'service:view', visible: canViewService, match: (p) => p.startsWith('/service/schedule') },
        { href: '/service/sites', name: 'ไซต์บริการ', icon: MapPin, cap: 'service:view', visible: canViewService, match: (p) => p.startsWith('/service/sites') },
      ],
    },
    {
      system: 'mgmt',
      items: [
        { href: '/mgmt', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'mgmt:view', match: (p) => p === '/mgmt' },
        { href: '/mgmt/tasks', name: 'รายการงาน', countHref: '/mgmt/tasks?count=mgmtTasks', icon: ListTodo, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/tasks') },
        { href: '/mgmt/meetings', name: 'การประชุม', icon: Users, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/meetings') },
        { href: '/mgmt/rocks', name: 'Rock & Improve', shortName: 'Rocks', icon: Target, cap: 'mgmt:view', match: (p) => p.startsWith('/mgmt/rocks') },
        { href: '/mgmt/trash', name: 'ถังขยะ', icon: Trash2, cap: 'mgmt:edit', match: (p) => p.startsWith('/mgmt/trash') },
      ],
    },
    {
      system: 'sahamit',
      items: [
        { href: '/sahamit', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'sahamit:view', match: (p) => p === '/sahamit' },
        { href: '/sahamit/forecast', name: 'Forecast', icon: LineChart, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/forecast') },
        { href: '/sahamit/po', name: 'Purchase Orders', shortName: 'PO', icon: ShoppingCart, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/po') },
        { href: '/sahamit/reconcile', name: 'กระทบยอด', icon: ClipboardCheck, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/reconcile') },
        // "ของเข้า (สหมิตร)" — เดิมชื่อ "วัสดุ / Lead time" ซึ่งชนกับสองเมนูใหม่:
        // "ทะเบียนวัสดุ" (ฐานข้อมูล — ข้อมูลหลักราคาวัสดุ) และพาเนล "ของเข้า" ของ
        // โครงการ (mig 0176) · หน้านี้ทำงานเดียวกับพาเนลนั้นแต่เป็นของสายสหมิตร
        // ซึ่งติดตามราย PO line (pmDueDate/rmDueDate/arrivedAt — คนละตารางกัน)
        // shortName ตัด "(สหมิตร)" ทิ้ง — อยู่ในระบบสหมิตรอยู่แล้ว วงเล็บนั้นมีไว้กัน
        // สับสนกับ "ทะเบียนวัสดุ"/พาเนลของเข้าของโครงการ ซึ่งไม่ได้อยู่บนแถบนี้
        { href: '/sahamit/material', name: 'ของเข้า (สหมิตร)', shortName: 'ของเข้า', icon: Boxes, cap: 'sahamit:view', match: (p) => p.startsWith('/sahamit/material') },
      ],
    },
    {
      // แจ้งปัญหาระบบ (mig 0223) — เมนูเดียว · cap `issues:report` อยู่ใน
      // UNIVERSAL_CAPS จึงผ่านให้ทุก role ที่ล็อกอิน (รวม viewer) โดยไม่ต้องไล่
      // เติม cap ทีละ role
      system: 'support',
      items: [
        { href: '/support', name: 'เรื่องแจ้งปัญหา', shortName: 'แจ้งปัญหา', icon: LifeBuoy, cap: 'issues:report', match: (p) => p.startsWith('/support') },
      ],
    },
  ];

  // department จำเป็นสำหรับเมนูที่ cap อย่างเดียวกว้างเกิน แล้วต้องแคบด้วยฝ่าย
  // (เช่น ใบขอราคาผลิต — ฝ่ายจัดซื้อใช้ role staff ร่วมกับ PD/WH/QC)
  const activeSystemDefinition = getSystemByKey(activeSystem);
  // หน้าบัญชีของฉันพูดชื่อตัวเอง ไม่ยืมชื่อระบบที่เพิ่งเดินออกมา (มติผู้ใช้ 2026-08-14)
  // — เปลือกเดียวกับหน้าตั้งค่า: หัวบอกว่าอยู่ไหน แถบเมนูของระบบหายไปทั้งแถบ
  const isAccountContext = pathname === '/account';
  const systemSubtitle = isAccountContext
    ? 'บัญชีของฉัน'
    : activeSystem === 'settings'
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
        disabled: system.disabled,
        items: group.items.filter((item) => {
          const caps = item.caps || [item.cap];
          /* ⭐ เมนูเอกสารร่วมขึ้น **กลุ่มเดียวต่อคน** — บ้านของคนดูรับเส้นทางนั้นไปแล้ว
             ก็ขึ้นที่บ้านเขา ไม่งั้นขึ้นที่ "บริหารงานขาย" ตามเดิม
             ⚠️ ต้องตัดสองทาง: ตัดตัวซ้ำออกจากกลุ่มขาย **และ** ไม่ให้กลุ่มของฝ่าย
             โผล่ให้คนที่ไม่ได้อยู่ฝ่ายนั้น (เช่น admin ซึ่งเห็นทุกกลุ่ม) ไม่งั้นคนเดียว
             เห็นเมนูเดียวกันสองที่ แล้วกดอันหนึ่งเปลือกเปลี่ยนใต้เท้า */
          if (item.shared && !sharedItemBelongsInGroup(item.href, group.system, userContext)) return false;
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
  const isSettingsContext = isSettingsPathname(pathname);
  // เปลือกไร้แถบเมนู (ตั้งค่า · บัญชีของฉัน) — ล้างเมนูทิ้งที่จุดเดียวตรงนี้ แล้วทั้ง
  // แถบบน แถบล่างมือถือ และแผ่นเมนู "เพิ่มเติม" ว่างตามกันหมด ไม่ต้องไล่ปิดทีละที่
  const isBareShell = isBareShellPathname(pathname);
  const menuItems = isBareShell ? [] : (currentGroup?.items || []);
  /* แถบเมนูมีสองกลุ่ม: ลำดับงาน (ซ้าย) กับเครื่องมือ (ขวา ข้าง "วางเป้า")
     ⚠️ `menuItems` ยังเป็นก้อนเดียวสำหรับมือถือ — แผ่นเมนูล่างไม่มีสองฝั่งให้แบ่ง */
  const flowItems = menuItems.filter((item) => !item.utility);
  const utilityItems = menuItems.filter((item) => item.utility);
  const ActiveSystemIcon = isAccountContext
    ? UserRound
    : activeSystem === 'settings'
      ? SettingsIcon
      : (activeSystemDefinition?.icon || LayoutDashboard);

  /* แถบ "กางอยู่จริง" = กางทับชั่วคราว หรือ อยู่จอกว้างและผู้ใช้ไม่ได้สั่งย่อ */
  const sideNavExpanded = navOpen || (isWide && !navCollapsed);

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
    <div className={`app-container${navOpen ? ' sidenav-open' : ''}${isSettingsContext ? ' settings-context' : ''}${isAccountContext ? ' account-context' : ''}`}>
      {/* ── แถบระบบ: ตรึงบนสุดทุกความกว้าง (แถบเมนูของระบบย้ายไปอยู่นอก header) ── */}
      <header className="topnav">
        {/* ชั้นระบบ: โลโก้ (พื้น navy ตามมาตรฐานแบรนด์) + สลับระบบ + user actions */}
        <div className="topnav-system">
          {/* ⭐ กติกาการวางปุ่มคุมแถบ (มติผู้ใช้ 2026-08-22): **ปุ่มอยู่กับแถบเสมอ**
              คือหัวแถบเมนูเอง (ดู .sidenav-toggle ใน <nav> ข้างล่าง) — แฮมเบอร์เกอร์
              ตัวนี้มีไว้เฉพาะชั้นจอ 769–900 ที่ไม่มีแถบให้ปุ่มเกาะเลย จึงต้องมีทาง
              เข้าจากหัวแทน · CSS ซ่อนมันทุกชั้นจออื่น
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
              {/* ภาษาเดียวกับปุ่มในแถบ: ☰ เปิด ↔ ✕ ปิด — สลับ **อยู่กับที่** ผู้ใช้จึง
                  ไม่ต้องย้ายสายตาไปหาปุ่มปิดที่อื่น (ปุ่มในลิ้นชักถูกซ่อนในชั้นจอนี้) */}
              <Menu className="sidenav-burger-open" size={20} aria-hidden="true" />
              <X className="sidenav-burger-close" size={20} aria-hidden="true" />
            </button>
          )}
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
                  // ที่ปิดด้วย CSS ด้วยเหตุผลเดียวกับการ์ดหน้าแรก (ดู home/page.js)
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
                  return (
                    <Link
                      key={g.system}
                      href={g.home}
                      role="menuitem"
                      className={`topnav-sys-item ${g.system === activeSystem ? 'active' : ''}`}
                      aria-label={systemCount ? `${g.label} ${systemCount} รายการรอคุณ` : undefined}
                    >
                      <SystemIcon size={15} className="ico" /> {g.label}
                      {systemCount ? <span className="topnav-count">{systemCount > 99 ? '99+' : systemCount}</span> : null}
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
            {/* กระดิ่งอยู่ก่อน "ตั้งค่า" — งานของคุณสำคัญกว่าเมนูตั้งค่า และตำแหน่ง
                ขวาสุดถูก AccountMenu จองไว้แล้ว */}
            <NotificationBell />
            {/* topnav-settings-link = จุดเกาะให้ CSS ซ่อนเฉพาะตัวนี้บนมือถือ (ตั้งค่า
                มีอยู่ในแผ่นเมนูแล้ว) โดยไม่พลาดไปซ่อนกระดิ่งซึ่งใช้คลาสเดียวกัน
                ⚠️ ไอคอนล้วน ไม่มีป้ายชื่อ (มติผู้ใช้ 2026-08-22) — `aria-label` จึงเป็น
                ชื่อเดียวที่ screen reader อ่านได้ ถอดออกแล้วปุ่มนี้จะไม่มีชื่อเลย
                ขนาดไอคอน 17 เท่ากระดิ่งที่อยู่ติดกัน · ไม่ต้องเขียน CSS เพิ่ม เพราะ
                `.topnav-global-action` มี padding เท่ากันสองข้างอยู่แล้ว พอเหลือลูกตัว
                เดียวมันกลายเป็นจัตุรัสขนาดเดียวกับกระดิ่งเอง */}
            <Link
              href="/settings"
              className={`topnav-global-action topnav-settings-link${isSettingsContext ? ' active' : ''}`}
              aria-current={isSettingsContext ? 'page' : undefined}
              aria-label="ตั้งค่าระบบ"
              title="ตั้งค่าระบบ"
            >
              <SettingsIcon size={17} aria-hidden="true" />
            </Link>
            <AccountMenu
              userName={userName}
              userInitials={userInitials}
              roleLabel={teams.length
                ? `${ROLE_LABELS[role] || role} · ${teams.map((t) => TEAM_LABELS[t] || t).join(' + ')}`
                : (ROLE_LABELS[role] || role)}
              roleTone={role === 'admin' || role === 'ae_supervisor' || role === 'legal' || role === 'secretary' || role === 'executive' ? 'admin' : (role === 'senior_ae' || role === 'ac' || role === 'ae') ? 'editor' : 'viewer'}
              isDark={isDark}
              canChangePassword={SUPABASE_CONFIGURED}
              onToggleTheme={toggleTheme}
              onChangePassword={() => setShowPwd(true)}
              onReportIssue={() => setShowReport(true)}
              onLogout={handleLogout}
            />
          </div>
        </div>

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
        {/* เมนูของระบบปัจจุบัน — แถบข้างทุกความกว้าง (ดูสามชั้นจอที่ .topnav-menu
            ใน globals.css) · ≤768px ไม่วาด ใช้แถบล่างมือถือแทน */}
        {!isBareShell && <nav className="topnav-menu" aria-label={`เมนู${systemSubtitle}`}>
          {/* ปุ่มย่อ/กาง — อยู่หัวแถบ ชิดขวาเมื่อกาง กลางช่องเมื่อเป็นราง
              ⚠️ "กางอยู่จริงไหม" ไม่เท่ากับ "ผู้ใช้ตั้งค่าไว้ว่ากาง" — จอ ≤1200px แถบ
              เป็นรางเสมอไม่ว่าความชอบถาวรจะเป็นอะไร ถ้าอ่านจาก navCollapsed อย่างเดียว
              ปุ่มจะบอก screen reader ว่า "กางอยู่" ทั้งที่หน้าจอเห็นแต่ไอคอน */}
          <button
            type="button"
            className="sidenav-toggle"
            onClick={toggleSideNav}
            aria-label={`เมนู${systemSubtitle}`}
            aria-expanded={sideNavExpanded}
            title={navOpen ? 'ปิดแถบเมนู' : (sideNavExpanded ? 'ย่อแถบเมนู' : 'กางแถบเมนู')}
          >
            {/* ภาษาไอคอน = ปิด/เปิดแบบโมดัล (มติผู้ใช้ 2026-08-22): กางอยู่ = ✕ ปิด ·
                เป็นราง = แฮมเบอร์เกอร์ เปิด — ตัวเดียวกับที่หัวเว็บใช้ในชั้นจอที่ไม่มีแถบ
                ⭐ สลับกันด้วย CSS ไม่ใช่ด้วย state — "ตอนนี้กางหรือเป็นราง" ขึ้นกับ
                ความกว้างจอด้วย ซึ่งฝั่ง server ไม่รู้ ถ้าเลือกด้วย JS จะได้ไอคอนผิด
                หนึ่งเฟรมทุกครั้งที่โหลดหน้า (container query รู้ทันทีที่เพนต์) */}
            <X className="sidenav-ico-collapse" size={18} aria-hidden="true" />
            <Menu className="sidenav-ico-expand" size={18} aria-hidden="true" />
          </button>
          {flowItems.map((item) => renderMenuItem(item))}
          <span className="topnav-menu-spacer" />
          {utilityItems.map((item) => renderMenuItem(item, 'topnav-utility-item'))}
          {/* วางเป้าเป็นเมนูของระบบบริหารงานขายระบบเดียว — ไม่โชว์ตอนอยู่ระบบอื่น */}
          {activeSystem === 'salesplan' && canUser({ role, extraCaps }, 'salesplan:target') && (
            <Link
              href="/sa/targets"
              title="วางเป้า"
              className={`topnav-item topnav-utility-item ${pathname.startsWith('/sa/targets') || pathname.startsWith('/sales-planning/targets') ? 'active' : ''}`}
            >
              <Target size={16} className="ico" />
              <span>วางเป้า</span>
            </Link>
          )}
        </nav>}

        {/* Main Content Area */}
        <main className="main-content">
          <div className="page">
            <RoleContext.Provider value={role}>
              <ExtraCapsContext.Provider value={extraCaps}>
                <TeamContext.Provider value={team}>
                  <TeamsContext.Provider value={teams}>
                    <DepartmentContext.Provider value={department}>
                      {/* บริบทตั้งค่า (/settings · /users · /audit) ได้แถบรายการตั้งค่า
                          ค้างข้าง ๆ ทุกหน้า — มติผู้ใช้ 2026-08-20
                          ⚠️ ครอบที่นี่ ไม่ใช่ app/settings/layout.js เพราะ /users และ
                          /audit อยู่คนละราก (ดูหัว SettingsShell.js) */}
                      {isSettingsContext
                        ? <SettingsShell user={userContext} pathname={pathname}>{children}</SettingsShell>
                        : children}
                    </DepartmentContext.Provider>
                  </TeamsContext.Provider>
                </TeamContext.Provider>
              </ExtraCapsContext.Provider>
            </RoleContext.Provider>
          </div>
        </main>
      </div>

      {/* แถบเมนูล่างบนมือถือ — เมนูของระบบครบทุกตัว แบ่งหน้าปัดเอา (มติ 2026-08-02)
          ไม่โผล่ในเปลือกไร้เมนู (ตั้งค่า · บัญชีของฉัน) เพราะที่นั่นไม่มีเมนูของระบบ */}
      {!isBareShell && (
        <MobileBottomNav items={menuItems} pathname={pathname} label={systemSubtitle} counts={navCounts} />
      )}

      {mobileMoreOpen && (
        <div className="mobile-nav-sheet" role="dialog" aria-modal="true" aria-label={`เมนู${systemSubtitle}`}>
          <div className="mobile-nav-sheet-header">
            <div>
              <strong>{systemSubtitle}</strong>
              <span>บัญชีและเครื่องมือ</span>
            </div>
            <button type="button" className="btn-icon" onClick={() => setMobileMoreOpen(false)} aria-label="ปิดเมนู"><X size={20} /></button>
          </div>

          {/* ⭐ ไม่มีหัวข้อ "เมนูของระบบนี้" ที่นี่ (มติผู้ใช้ 2026-08-14) — แถบล่างแบก
              เมนูของระบบครบทุกตัวอยู่แล้วตั้งแต่มติ 2026-08-02 (แบ่งหน้าปัดเอา)
              การวางซ้ำในแผ่นนี้คือของเหลือจากกติกาเก่า "4+เพิ่มเติม" ที่ถูกล้มไปแล้ว
              ⚠️ แผ่นนี้เหลือหน้าที่เดียว = บัญชี/เครื่องมือ ซึ่งบนมือถือไม่มีทางเข้าอื่น
              (รวม "วางเป้า" ที่เป็นเมนูเสริมของบริหารงานขาย ไม่ได้อยู่บนแถบล่าง) */}
          <section className="mobile-nav-section">
            <h2>เครื่องมือ</h2>
            <div className="mobile-nav-grid">
              <Link href="/home" className={`mobile-nav-card${pathname === '/home' ? ' active' : ''}`}><Home size={20} /><span>หน้าหลัก</span></Link>
              {!isBareShell && activeSystem === 'salesplan' && canUser({ role, extraCaps }, 'salesplan:target') && <Link href="/sa/targets" className={`mobile-nav-card${pathname.startsWith('/sa/targets') || pathname.startsWith('/sales-planning/targets') ? ' active' : ''}`}><Target size={20} /><span>วางเป้า</span></Link>}
              <Link href="/settings" className={`mobile-nav-card${isSettingsContext ? ' active' : ''}`}><SettingsIcon size={20} /><span>ตั้งค่า</span></Link>
            </div>
          </section>

          <section className="mobile-nav-section mobile-account-actions">
            <h2>บัญชีและการตั้งค่า</h2>
            <Link href="/account" onClick={() => setMobileMoreOpen(false)}><UserRound size={18} /><span>บัญชีของฉัน</span></Link>
            <button type="button" onClick={toggleTheme}>{isDark ? <Sun size={18} /> : <Moon size={18} />}<span>{isDark ? 'โหมดสว่าง' : 'โหมดมืด'}</span></button>
            {SUPABASE_CONFIGURED && <button type="button" onClick={() => setShowPwd(true)}><KeyRound size={18} /><span>เปลี่ยนรหัสผ่าน</span></button>}
            {/* คู่กับ AccountMenu — แผ่นเมนูมือถือต้องมีทุกอย่างที่เมนูผู้ใช้มี
                ไม่งั้นคนที่ใช้มือถืออย่างเดียวจะไม่มีทางแจ้งปัญหาเลย */}
            <button type="button" onClick={() => { setMobileMoreOpen(false); setShowReport(true); }}><Bug size={18} /><span>แจ้งปัญหาระบบ</span></button>
            <Link href="/support" onClick={() => setMobileMoreOpen(false)}><LifeBuoy size={18} /><span>เรื่องที่ฉันแจ้ง</span></Link>
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

      {/* แจ้งปัญหาระบบ (mig 0223) — mount ที่นี่เพราะเปิดได้จากทุกหน้าผ่านเมนูผู้ใช้
          ตัวเดียวกับที่ปุ่มในหน้า /support เรียก (component เดียว ไม่มีฟอร์มชุดที่สอง) */}
      <ReportIssueModal open={showReport} onClose={() => setShowReport(false)} />
    </div>
  );
}
