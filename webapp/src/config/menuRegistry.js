// ── ทะเบียนเมนูของทุกระบบ — ที่เดียวที่ประกาศว่า "ระบบนี้มีเมนูอะไรบ้าง" ────
//
// ⭐ ย้ายออกมาจาก `components/AppLayout.js` (ADR 0016 · PR1) **โดยไม่แก้เนื้อหา** —
// หน้าแรกใหม่กางเมนูของทุกระบบพร้อมกัน ถ้ามันอ่านทะเบียนคนละชุดกับเปลือก
// รายการเมนู การมองเห็น หรือ `countHref` จะเพี้ยนหากันภายในไม่กี่เดือน
// (เหตุผลเดียวกับที่ ADR 0005 ให้ `SYSTEM_CATALOG` เป็นของกลาง — รอบนี้ขยายจาก
// ระดับ "ระบบ" ลงไปถึงระดับ "เมนู")
//
// ⚠️ ไฟล์นี้เป็น **ข้อมูล + ฟังก์ชันล้วน** ไม่มี hook ไม่แตะ DOM ⇒ เทสต์ import ตรงได้
// ⚠️ **หนึ่งเมนูหนึ่งบรรทัด** และคงการย่อหน้าเดิมไว้ — เทสต์หลายตัวอ่านไฟล์นี้ด้วย
// regex รายบรรทัด (navMenuNames · navCounts · systems · entityIcon · fieldWorkAccess ·
// issueRouting) จัดรูปใหม่เมื่อไร ด่านพวกนั้นกลายเป็นชุดว่างแล้วผ่านทุกอย่างเงียบ ๆ
import { AirVent, ArrowDownToLine, Beaker, Boxes, Building2, Calculator, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, Factory, FileSignature, FileText, FlaskConical, FolderKanban, Hammer, Handshake, Inbox, LayoutDashboard, LifeBuoy, LineChart, ListTodo, MapPin, MessageCircleQuestion, Package, ReceiptText, ShoppingCart, SprayCan, Tags, Target, Trash2, Users, Wallet, Wrench } from 'lucide-react';
import {
  canAccessFinance, canAccessRd, canAnswerServiceRequests, canDoFieldWork, canEditProduction,
  canEditService, canManageProductCategories, canManageTeams, canUser, canViewCosting,
  canViewProduction, canViewRequests, canViewService, worksInSalesPipeline,
} from '@/lib/permissions';
import { sharedItemBelongsInGroup } from '@/config/navigation';
import { systemLandingForUser, systemsForUser } from '@/config/systems';

/* ── เมนูเอกสารร่วม — ประกาศครั้งเดียว ใช้ได้หลายกลุ่ม ────────────────────
   (มติผู้ใช้ 2026-08-22 · คู่กับ `ADOPTED_SHARED_PATHS` ใน config/navigation.js)

   ⭐ เอกสารพวกนี้อยู่ `/sa` ตามกฎสามชั้นชั้น 2 **แต่ฝ่ายที่ไม่ใช่ฝ่ายขายก็ทำงานกับมัน
   ทุกวัน** ⇒ ต้องขึ้นเมนูในบ้านของฝ่ายนั้นด้วย ไม่ใช่บังคับให้เขาเดินออกไปยืนใน
   เปลือก "บริหารงานขาย" ทุกครั้ง (กฎข้อ 8: ปลายทางต้องเป็นหน้าที่อยู่ในเมนูของเขา)

   ⚠️ **ห้ามก๊อปนิยามไปแปะซ้ำในแต่ละกลุ่ม** — `countHref`/`match` ของสองก้อนจะเพี้ยน
   หากันภายในไม่กี่เดือน (บทเรียนเดียวกับ ม-34 ที่ห้ามโคลนคิวคำร้อง) · `shared: true`
   คือธงที่ตัวกรองใน `accessibleGroups` ใช้ตัดสินว่ารายการนี้ควรขึ้นกลุ่มไหนของ "คนคนนี้"
   — ขึ้นได้กลุ่มเดียวเสมอ ไม่ใช่สองกลุ่มพร้อมกัน */
export const SHARED_DOC_ITEMS = {
  // เฟส D: ใบเสนอราคา FM-SA-01 (มติผู้ใช้: เมนูแยกเพื่อง่ายต่อการค้นหา)
  quotations: { href: '/sa/quotations', name: 'ใบเสนอราคา', countHref: '/sa/quotations?count=quotations', icon: FileText, cap: 'salesplan:view', shared: true, match: (p) => p.startsWith('/sa/quotations') || p.startsWith('/sales-planning/quotations') },
  salesOrders: { href: '/sa/sales-orders', name: 'ใบสั่งขาย', countHref: '/sa/sales-orders?count=salesOrders', icon: ClipboardList, cap: 'salesplan:view', shared: true, match: (p) => p.startsWith('/sa/sales-orders') || p.startsWith('/sales-planning/sales-orders') },
  contracts: { href: '/sa/contracts', name: 'สัญญา', countHref: '/sa/contracts?waiting=1', icon: FileSignature, cap: 'salesplan:view', shared: true, match: (p) => p.startsWith('/sa/contracts') || p.startsWith('/sales-planning/contracts') },
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

/* กลุ่มเมนูของทุกระบบ — หนึ่งกลุ่มต่อหนึ่งระบบใน `SYSTEM_CATALOG`
   (เดิมชื่อ `allGroups` ประกาศอยู่ในตัว `AppLayout` · ย้ายมาทั้งก้อนใน ADR 0016)
   แถวที่จอเห็นจริงมาจาก `menuGroupsForUser` ข้างล่าง ซึ่งกรองด้วยสิทธิ์ของคนดู */
export const MENU_GROUPS = [
    {
      system: 'master',
      items: [
        { href: '/database', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'customers:view', match: (p) => p === '/database' },
        { href: '/database/customers', name: 'ข้อมูลลูกค้า', countHref: '/database/customers?count=customers', icon: Building2, cap: 'customers:view', match: (p) => p === '/database/customers' || p.startsWith('/database/customers/') },
        { href: '/database/products', name: 'ข้อมูลสินค้า', countHref: '/database/products?count=products', icon: Package, cap: 'products:view', match: (p) => p === '/database/products' || p.startsWith('/database/products/') },
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
        /* ⭐ ทะเบียนไซต์ + ทะเบียนเครื่อง — ย้ายมาจากเมนูฝ่ายบริการ (มติผู้ใช้ 2026-09-17)
           กฎสามชั้นข้อ 3: ข้อมูลหลักที่ทุกฝ่ายใช้ร่วมอยู่ที่นี่ ไม่ว่าใครผลิต — ทรงเดียวกับ
           ทะเบียนกลิ่น/สูตรที่ RD ผลิตแต่ทุกคนเปิดอ่านได้ · ฝ่ายขายต้องตอบลูกค้าได้ว่ามี
           เครื่องกี่เครื่อง ตั้งอยู่ที่ไหน โดยไม่ต้องถาม TS
           ⚠️ cap `products:view` = กว้างเท่าทะเบียนสินค้าโดยตั้งใจ (ตรงข้ามกับทะเบียนวัสดุ
              ที่ต้องแคบเพราะมีราคาทุน — ทะเบียนนี้ไม่มีตัวเลขต้นทุน)
           ⚠️ **แก้ยังเป็นของ TS** (`canEditService`) — เมนูนี้เปิดทางอ่านอย่างเดียว
           ⚠️ `match` ต้องครอบเส้นทางเก่าใต้ `/service` ด้วย เพราะสองหน้านั้นเหลือเป็นตัวเด้ง
              (คนที่บุ๊กมาร์กไว้จะได้ไม่เจอแถบเมนูที่ไม่ไฮไลต์อะไรเลยระหว่างเด้ง) */
        { href: '/database/sites', name: 'ไซต์บริการ', icon: MapPin, cap: 'products:view', match: (p) => p.startsWith('/database/sites') || p.startsWith('/service/sites') },
        { href: '/database/assets', name: 'ทะเบียนเครื่อง', icon: AirVent, cap: 'products:view', match: (p) => p.startsWith('/database/assets') || p.startsWith('/service/assets') || p.startsWith('/service/models') },
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
      ],
    },
    {
      system: 'salesplan',
      items: [
        { href: '/sa/dashboard', name: 'ภาพรวม', icon: LayoutDashboard, cap: 'salesplan:view', visible: worksInSalesPipeline, match: (p) => p === '/sa/dashboard' || p === '/sa' || p === '/sales-planning' || p === '/sa/my-dashboard' || p === '/sa/kpi' },
        // เฟส C: คิวลีดของ Marketing/ฝ่ายขาย — role marketing เห็นเมนูนี้ตัวเดียว
        { href: '/sa/leads', name: 'ลีด', icon: Inbox, cap: 'salesplan:lead', match: (p) => p.startsWith('/sa/leads') || p.startsWith('/sales-planning/leads') },
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
        /* ── เครื่องมือ (utility) — ต้องอยู่ **ท้ายรายการและเรียงแบบนี้** ─────────────
           ⭐ มติผู้ใช้ 2026-08-26: ปฏิทินนัดมาก่อนวางเป้า และ **ลำดับต้องเหมือนกันทั้ง
           แถวบน · ลิ้นชัก · แถบล่างมือถือ**

           🪤 ลำดับจะตรงกันได้ก็ต่อเมื่อ utility อยู่ท้ายอาเรย์เท่านั้น — ลิ้นชักเรนเดอร์
           `flowItems` แล้วค่อย `utilityItems` (คั่นด้วย spacer) ส่วนแถวบนกับแถบล่าง
           ไล่อาเรย์ดิบเรียงเดียว · ถ้า utility ไปแทรกกลางอาเรย์ สองฝั่งจะเรียงไม่ตรงกัน
           ทันที (ของเดิมปฏิทินนัดอยู่อันดับ 3 แถวบนจึงขึ้นคนละที่กับลิ้นชัก)

           ปฏิทินนัด — อ่านจาก lead_events (kind='meeting') ที่บันทึกจากคิวลีด
           cap เดียวกับเมนู "ลีด" เพราะเป็นข้อมูลชุดเดียวกันคนละมุมมอง
           ⚠️ ไม่ใช่ปฏิทินของ /mgmt (คนละตาราง คนละ cap — AE เปิดตัวนั้นไม่ได้)

           🐞 **"วางเป้า" เคยเป็น JSX ฝังมือ ไม่ได้อยู่ในรายการนี้** — พอแถวระบบบนหัว
           (#1439) มาเป็นตัวเรนเดอร์ตัวที่สามที่ไล่จาก `items` เมนูนี้ก็ **หายไปจาก
           แถวบนเงียบ ๆ** ทั้งที่ยังอยู่ในลิ้นชักและแผ่นมือถือ (ผู้ใช้เจอเองบนจอ 26/08) */
        { href: '/sa/calendar', name: 'ปฏิทินนัด', icon: CalendarDays, cap: 'salesplan:lead', utility: true, match: (p) => p.startsWith('/sa/calendar') },
        { href: '/sa/targets', name: 'วางเป้า', icon: Target, cap: 'salesplan:target', utility: true, match: (p) => p.startsWith('/sa/targets') || p.startsWith('/sales-planning/targets') },
        /* ตรวจที่มาของ FC (mig 0337 · มติผู้ใช้ 2026-09-02) — ดีลที่มีใบเสนอราคา
           อนุมัติแล้วแต่ FC ยังไม่เดินตามใบ · เป็น utility เพราะไม่ใช่งานรายวัน และ
           ป้ายจะหดลงเรื่อย ๆ ตามที่ AE กดรับ เหลือเฉพาะดีลที่มีใบหลายฉบับจริง ๆ
           ⚠️ utility ต้องอยู่ท้ายอาเรย์เสมอ และห้ามแทรกก่อน "ปฏิทินนัด → วางเป้า"
              ซึ่งเป็นคู่ลำดับที่ผู้ใช้เคาะไว้ (26/08) */
        { href: '/sa/forecast-review', name: 'ตรวจที่มา FC', countHref: '/sa/forecast-review', icon: ClipboardCheck, cap: 'salesplan:view', visible: worksInSalesPipeline, utility: true, match: (p) => p.startsWith('/sa/forecast-review') },
        // จัดทีม (mig 0310 · มติผู้ใช้ 2026-08-28) — หัวหน้าฝ่ายขายกับผู้ช่วยที่ถูก
        // grant จัดทีมเองได้ ไม่ต้องรอแอดมิน · เป็น utility เพราะไม่ใช่งานรายวัน
        /* 🐞 **ต้องแคบด้วยฝ่ายด้วย ไม่ใช่ cap ล้วน** — ตั้งแต่หัวหน้าฝ่าย TS ได้
           `team:manage` (มติ 2026-08-30) เมนูนี้โผล่ให้เขาเห็น แล้วกดเข้าไปเจอ
           "ดูทีมของฝ่ายอื่นไม่ได้" ทุกครั้ง · เมนูที่กดแล้วเจอข้อความปฏิเสธเสมอ
           ไม่ควรมีอยู่ — ทีมของฝ่าย TS อยู่ที่เมนู "จัดทีม" ของธุรกิจบริการ */
        { href: '/sa/teams', name: 'จัดทีม', icon: Users, cap: 'team:manage', visible: (u) => canManageTeams(u, 'SA'), utility: true, match: (p) => p.startsWith('/sa/teams') },
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
      // ⚠️ เคยต้องพ่วง `users:manage` เข้าไปใน caps เพราะ admin
      // **ไม่ถือ `requests:answer`** (ตรวจ 2026-08-08) ใส่ cap เดียวแล้วเมนูถูกกรอง
      // ทิ้งจนเหลือศูนย์ แล้ว `.filter((g) => g.items.length > 0)` ตัดทั้งกลุ่ม =
      // แถบว่าง · **แก้ที่ต้นเหตุแล้ว 2026-08-28** — admin ถือทุก cap ในระบบ
      // (adminHoldsEveryCap.test.mjs คุมไว้) จึงเหลือ cap เดียวตามความหมายจริง
      // ตัวแคบจริงคือ `visible: canAccessRd` ซึ่งเป็นด่าน **ตัวเดียวกับที่การ์ด
      // ระบบใช้** จึงเพี้ยนหากันไม่ได้
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
        { href: '/rd', name: 'ภาพรวม', icon: LayoutDashboard, caps: ['requests:answer'], visible: canAccessRd, disabled: true, match: (p) => p === '/rd' },
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
        { href: '/rd/requests', name: 'คิวคำร้อง', icon: MessageCircleQuestion, caps: ['requests:answer'], visible: canAccessRd, match: (p) => p.startsWith('/rd/requests') || p.startsWith('/requests') },
        /* ⭐ **ตารางงานผู้ปรุงกลิ่น** (mig 0350 · มติผู้ใช้ 2026-09-08) — คิวข้างบนนับเป็น
           **ใบ** ส่วนหน้านี้นับเป็น **กลิ่น** · ใบพัฒนากลิ่นหนึ่งใบมีได้ถึง 4 ก้อนแจกให้
           คนละคนปรุง ⇒ คำถาม "กลิ่นก้อนนี้อยู่ในมือใคร" ตอบจากคิวไม่ได้เลย
           ⚠️ **ด่านเป็นชุดเดียวกับเมนูอื่นของโมดูล** (`requests:answer` + `canAccessRd`)
           โดยตั้งใจ — ผู้ปรุงต้องเห็นตารางของตัวเอง แม้จะแจกงานไม่ได้ · ด่านที่แคบกว่า
           เมนูจะทำให้คนที่งานอยู่ในมือมองไม่เห็นงานตัวเอง
           ⚠️ `shortName` เพราะชื่อเต็มล้นช่องแถบล่างของจอมือถือ (~71px ที่ 375px) */
        { href: '/rd/perfumers', name: 'งานผู้ปรุงกลิ่น', shortName: 'ผู้ปรุง', icon: SprayCan, caps: ['requests:answer'], visible: canAccessRd, match: (p) => p.startsWith('/rd/perfumers') },
        /* ⭐ **ใบสั่งขายที่เกี่ยวข้อง** (มติผู้ใช้ 2026-08-29) — บรีฟกลิ่นเกิดจากใบสั่งขาย
           ฝ่ายจึงต้องเห็นว่าออร์เดอร์นั้นสั่ง FG อะไร · มาคู่กับการปิดเมนู "บริหารงานขาย"
           ของฝ่ายนี้ (แพตเทิร์นเดียวกับที่ฝ่าย FN ได้เอกสารของตัวเองไปไว้ในโมดูลตัวเอง)
           ⚠️ **เอกสารไม่ได้ย้ายบ้าน** — กดแล้วไปที่ `/sa/sales-orders/[id]` ตามเดิม
           (กฎสามชั้น ชั้น 2) · เปลือกเดินตามคนดู ⇒ RD ยังยืนอยู่ในโมดูลตัวเอง
           ⚠️ `match` กินหน้าใบสั่งขายด้วย เพราะนั่นคือทางเดียวที่ฝ่ายเข้าถึงใบได้จริง
           (กฎข้อ 8 — ไฮไลต์ที่เมนูที่พาเขาไป ไม่ใช่เมนูที่เขากดไม่ได้) */
        { href: '/rd/sales-orders', name: 'ใบสั่งขายที่เกี่ยวข้อง', icon: FileText, caps: ['requests:answer'], visible: canAccessRd, match: (p) => p.startsWith('/rd/sales-orders') || p.startsWith('/sa/sales-orders') || p.startsWith('/sales-planning/sales-orders') },
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
        { href: '/finance/payments', name: 'ทะเบียนการชำระ', countHref: '/finance/payments?status=reported', icon: Wallet, caps: ['payments:confirm', 'users:manage'], visible: canAccessFinance, match: (p) => p.startsWith('/finance/payments') },
        /* คิวคำร้องที่ส่งถึงฝ่ายบัญชี (B-1 · ม-ก) — ชื่อ "คิวคำร้อง" ตรงกับของ RD
           โดยตั้งใจ: เป็นของอย่างเดียวกันคนละฝ่าย · ต้องไม่ชนกับ "คำร้อง" ของฝ่ายขาย
           ซึ่งเป็นคนละมุมของตารางเดียวกัน (ที่นั่นเปิดใบ ที่นี่ตอบใบ)
           ⚠️ ไอคอนตัวเดียวกับ `/requests` และ `/rd/requests` — หนึ่ง entity หนึ่งไอคอน */
        /* `match` กินใบคำร้องด้วย และ **ไม่มีเมนู "คำร้อง" (คิวรวม)** — เหตุผลเดียว
           กับของ RD ข้างบน (มติผู้ใช้ 2026-08-22: บัญชีไม่เปิดคำร้องเอง) */
        { href: '/finance/requests', name: 'คิวคำร้อง', icon: MessageCircleQuestion, caps: ['requests:answer'], visible: canAccessFinance, match: (p) => p.startsWith('/finance/requests') || p.startsWith('/requests') },
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
        // ไลน์ผลิต (mig 0184) = ชั้น "กำลัง" ของตารางผลิต · คนตั้งค่าคือฝ่าย PD
        // ⭐ ตั้งแต่ 2026-09-16 ทั้งโมดูลเหลือ PD กับ admin ⇒ canViewProduction กับ
        // canEditProduction ให้คนกลุ่มเดียวกันเกือบทั้งหมด · ยังแยกสองด่านไว้เหมือนเดิม
        // เพราะวันไหนเปิดคืนให้คลัง/QC อ่านบอร์ด หน้า *ตั้งค่า* ต้องไม่โผล่ตามไปด้วย
        // คิวมาก่อนไลน์ — PD เปิดระบบมาเพื่อดูว่าต้องผลิตอะไรก่อน ไม่ใช่มาตั้งค่าไลน์
        { href: '/production/jobs', name: 'คิวงานผลิต', countHref: '/production/jobs?count=productionJobs', icon: Hammer, cap: 'production:view', visible: canEditProduction, match: (p) => p.startsWith('/production/jobs') },
        // บอร์ดเปิดให้ **ทุกคนที่อ่านตารางผลิตได้** = PD กับ admin (มติ 2026-09-16)
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
        // งานวันนี้มาก่อนสุด — เจ้าหน้าที่เปิดระบบมาเพื่อดูงานตัวเองวันนี้ ไม่ใช่ตารางทั้งฝ่าย
        // (F-1 2026-08-27: เดิมชื่อ "นัดของฉัน" ที่ /service/my-visits — เปลี่ยนชื่อ+route
        // เพราะหน้านี้ไม่มีปุ่มสลับ "ทั้งทีม" แล้ว มุมมองข้ามคนย้ายไปหน้าจัดคิวเจ้าหน้าที่)
        // ⚠️ ชื่อต้องไม่ซ้ำกับ "งานของฉัน" ของระบบบริหารงานขาย (/sa/tasks) — คนละเรื่อง
        // กันคนละระบบ: ฝั่งขาย = งานติดตามส่วนบุคคล · ฝั่งนี้ = นัดเข้าไซต์ที่ต้องไปทำจริง
        // ชื่อซ้ำข้ามระบบทำให้คนจำไม่ได้ว่าของตัวเองอยู่เมนูไหน แล้วเปิดผิดหน้าประจำ
        // ใครเห็นเมนูนี้ = **คนที่แก้งานบริการได้** (มติผู้ใช้ 2026-07-31) — ฝ่ายบริการ TS ·
        // ทีมขาย SV · admin/หัวหน้าฝ่ายขาย · กว้างกว่า "คนที่รับงานได้" หนึ่งขั้นเพื่อให้
        // หัวหน้าเปิดดูรูปหน้าจอของเจ้าหน้าที่ได้ โดยไม่เปิดให้ฝ่ายขายทีมอื่นที่ไม่เกี่ยวเลย
        // 🐞 เดิมเปิดด้วย service:view = ฝ่ายขายทุกคนเห็นเมนูที่กดเข้าไปแล้วว่างเสมอ
        /* ⚠️ เจ้าหน้าที่หน้างานต้องเห็นเมนูนี้ — เขาไม่ถือ `service:edit` (แก้ตารางไม่ได้)
           แต่ "งานวันนี้" คือหน้าที่เขาใช้ทำงานทั้งวัน ⇒ ใช้ `canDoFieldWork` */
        { href: '/service/today', name: 'งานวันนี้', icon: Wrench, cap: 'service:view', visible: canDoFieldWork, match: (p) => p.startsWith('/service/today') },
        // จัดคิวเจ้าหน้าที่ = เครื่องมือวางแผนของ TS (F-1: เดิมชื่อ "ตารางเข้าบริการ") —
        // แคบเป็น canEditService เพราะเป็นหน้าลงมือจัดคิว ไม่ใช่หน้าอ่าน · ฝ่ายขายที่
        // อยากรู้ว่า "เจ้าหน้าที่เข้าเมื่อไหร่" ดูจากหน้าไซต์บริการซึ่งยังเปิดตามสิทธิ์อ่านเดิม
        { href: '/service/schedule', name: 'จัดคิวเจ้าหน้าที่', icon: CalendarDays, cap: 'service:view', visible: canEditService, match: (p) => p.startsWith('/service/schedule') },
        // งานเข้าใหม่ = ทางที่ใบสั่งขายสายบริการเดินมาถึงฝ่าย TS (เฟส 4 · 2026-08-28)
        // ⚠️ ไม่ใช่หน้า "สร้างงาน" — TS ไม่ใช่ต้นทางของงาน ทุกแถวมีต้นเรื่องเป็นใบที่
        // อนุมัติแล้ว · แคบเป็น canEditService เพราะเป็นหน้าลงมือผูกไซต์/โซน
        { href: '/service/intake', name: 'งานเข้าใหม่', icon: ArrowDownToLine, cap: 'service:view', visible: canEditService, match: (p) => p.startsWith('/service/intake') },
        /* คิวคำร้องประเมินพื้นที่จาก SA (mig 0314) — ทางที่ *งานของฝ่ายขาย* เดินมาถึง TS
           ⚠️ `match` กินใบคำร้อง (`/requests/[id]`) ด้วย เหมือน `/rd/requests` และ
              `/finance/requests` — เปิดใบแล้วเมนูต้องไม่ทิ้งคนไว้กลางอากาศ
           ⚠️ ไอคอนตัวเดียวกับคำร้องทุกที่ในระบบ — หนึ่ง entity หนึ่งไอคอน
           ⚠️ **visible เป็น canAnswerServiceRequests ไม่ใช่ canEditService** — คนที่เห็น
              คิวนี้คือคนที่ *ตอบ* ใบได้ (ฝ่าย TS) · ทีมขาย SV ถือ service:edit ด้วยแต่
              ไม่ใช่คนตอบคำร้องของฝ่าย TS ⇒ เห็นเมนูที่กดเข้าไปแล้วตอบอะไรไม่ได้เลย */
        { href: '/service/requests', name: 'คิวคำร้อง', icon: MessageCircleQuestion, cap: 'requests:answer', visible: canAnswerServiceRequests, match: (p) => p.startsWith('/service/requests') || p.startsWith('/requests') },
        // ⚠️ ต้องมี visible: canViewService/canEditService ทุกรายการ — cap service:view
        // ถือกว้างระดับ role (staff ทุกฝ่ายถือ) แล้วแคบด้วย **ฝ่าย TS** ที่ canViewService ·
        // ถ้าเช็คแค่ cap ฝ่ายคลัง/QC จะเห็นเมนูของทีมเจ้าหน้าที่บริการ ซึ่งขัดมติแยกทีม (PD ≠ TS)
        // ทะเบียนไซต์ = cap อ่าน เพราะฝ่ายขายต้องตอบได้ว่าลูกค้ามีเครื่องกี่จุด
        // ปุ่มแก้ในหน้าซ่อนตาม canEditService เอง
        /* ⭐ เอกสารร่วมที่เปลือกบริการรับมา (มติผู้ใช้ 2026-08-31) — TS อ่านใบสั่งขาย
           กับสัญญาได้ เพราะงานบริการทุกชิ้นอ้างสองอย่างนี้เป็นต้นเรื่อง (จัดสรรลงโซน ·
           ด่านเข้าไซต์ · รอบที่ขายไว้)
           ⚠️ **อ่านอย่างเดียว** — ฝ่าย TS ไม่มี `salesplan:edit` โดยเจตนา
           ⚠️ ต้องคู่กับ `ADOPTED_SHARED_PATHS.service` เสมอ ไม่งั้นกดแล้วเปลือกสลับ
              ไปงานขายซึ่งเป็นระบบที่ TS ไม่มีกลุ่มเมนูอีกแล้ว = แถบว่าง */
        SHARED_DOC_ITEMS.salesOrders,
        SHARED_DOC_ITEMS.contracts,
        /* ⭐ ทะเบียนสองตัวนี้ **ย้ายบ้านไปฐานข้อมูลแล้ว** (มติผู้ใช้ 2026-09-17) — ที่นี่เหลือเป็น
           ทางลัดของ TS ซึ่งใช้ทั้งสองหน้าเป็นเครื่องมือทำงานรายวัน ไม่ใช่ข้อมูลอ้างอิงนาน ๆ ครั้ง
           ⚠️ **หน้าเดียวกัน URL เดียวกัน** ไม่ใช่สำเนา — ต้องคู่กับ `ADOPTED_SHARED_PATHS.service`
              เสมอ ไม่งั้นกดแล้วเปลือกสลับไป "ฐานข้อมูล" ซึ่ง TS ไม่มีกลุ่มเมนู = แถบว่าง */
        { href: '/database/sites', name: 'ไซต์บริการ', icon: MapPin, cap: 'service:view', visible: canViewService, match: (p) => p.startsWith('/database/sites') || p.startsWith('/service/sites') },
        /* ⭐ ทะเบียนเครื่อง (เฟส B · mig 0332) — คู่กับไซต์บริการ วางติดกันเพราะคน
           ที่เปิดหาไซต์กับคนที่เปิดหาเครื่องคือคนเดียวกัน และสองหน้านี้ลิงก์หากันตลอด
           ⚠️ `match` ต้องครอบหน้าเครื่องรายตัวด้วย — URL ย้ายออกมาจากใต้ไซต์แล้ว
              ถ้าไม่ครอบ เปิดหน้าเครื่องแล้วจะไม่มีเมนูไหนไฮไลต์เลย */
        { href: '/database/assets', name: 'ทะเบียนเครื่อง', icon: AirVent, cap: 'service:view', visible: canViewService, match: (p) => p.startsWith('/database/assets') || p.startsWith('/service/assets') || p.startsWith('/service/models') },
        // จัดทีมเจ้าหน้าที่บริการ (mig 0310 · มติผู้ใช้ 2026-08-28 "TS ก็มีแยกทีม") — ทีมปฏิบัติงาน
        // จัดคนอย่างเดียว ไม่แตะสิทธิ์ · เป็น utility เพราะไม่ใช่งานรายวันของเจ้าหน้าที่
        /* ⚠️ แคบด้วย `canManageTeams(u,'TS')` เหมือนฝาแฝดที่ /sa/teams ไม่ใช่ `canEditService` —
           ของเดิมเปิดให้ทุกคนที่แก้งานบริการได้ ⇒ `ts_planner` (ไม่มี `team:manage`) เห็นเมนู
           ชื่อ "จัดทีม" แล้วเข้าไปเจอรายชื่อเปล่า ๆ ที่กดอะไรไม่ได้สักปุ่มและไม่มีอะไรบอกเหตุ
           — ผิดกฎ "ไม่มีสิทธิ์ = ไม่โชว์" ของระบบ */
        { href: '/service/teams', name: 'จัดทีม', icon: Users, cap: 'team:manage', visible: (u) => canManageTeams(u, 'TS'), utility: true, match: (p) => p.startsWith('/service/teams') },
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

/* เมนูของ "คนคนนี้" — ระบบที่เข้าถึงได้ พร้อมเมนูที่ผ่านด่านสิทธิ์แล้ว
 *
 * ⭐ ตัวเดียวที่ทั้งเปลือก (`AppLayout`) และหน้าแรก (ADR 0016) เรียกใช้ ⇒ สองที่
 *    ไม่มีทางแสดงเมนูคนละชุดกัน
 * ⚠️ `canUser` ไม่ใช่ `can` — สิทธิ์รายคน (เช่น SA ที่ได้ `mgmt:view` มาช่วยเลขา)
 *    ต้องเปิดระบบนั้นให้เขาด้วย
 * ⚠️ ยังไม่รู้ว่าใครกำลังดู (ไม่มี role) ⇒ คืนชุดว่าง ไม่ใช่เมนูของทุกคน */
export function menuGroupsForUser(user) {
  if (!user?.role) return [];
  const groupsBySystem = new Map(MENU_GROUPS.map((group) => [group.system, group]));
  return systemsForUser(user)
    .map((system) => {
      const group = groupsBySystem.get(system.key);
      if (!group) return null;
      return {
        ...group,
        label: system.label,
        home: systemLandingForUser(system, user),
        icon: system.icon,
        disabled: system.disabled,
        items: group.items.filter((item) => {
          const caps = item.caps || [item.cap];
          /* ⭐ เมนูเอกสารร่วมขึ้น **กลุ่มเดียวต่อคน** — บ้านของคนดูรับเส้นทางนั้นไปแล้ว
             ก็ขึ้นที่บ้านเขา ไม่งั้นขึ้นที่ "บริหารงานขาย" ตามเดิม
             ⚠️ ต้องตัดสองทาง: ตัดตัวซ้ำออกจากกลุ่มขาย **และ** ไม่ให้กลุ่มของฝ่าย
             โผล่ให้คนที่ไม่ได้อยู่ฝ่ายนั้น (เช่น admin ซึ่งเห็นทุกกลุ่ม) ไม่งั้นคนเดียว
             เห็นเมนูเดียวกันสองที่ แล้วกดอันหนึ่งเปลือกเปลี่ยนใต้เท้า */
          if (item.shared && !sharedItemBelongsInGroup(item.href, group.system, user)) return false;
          return caps.some((cap) => canUser(user, cap)) &&
            (!item.managerOnly || canManageProductCategories(user.role)) &&
            // ด่านเพิ่มสำหรับเมนูที่ cap กว้างกว่าผู้ใช้จริง (ดู costing:view)
            (!item.visible || item.visible(user));
        }),
      };
    })
    .filter(Boolean)
    .filter((g) => g.items.length > 0);
}
