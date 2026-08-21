import {
  Building2, CalendarDays, FileBadge2, HardDrive, History, Layers,
  Palette, Settings, Signature, Users, WalletCards, Workflow,
} from 'lucide-react';
import { canUser, canManageCommercialPresets, canManageDocumentStandards } from '@/lib/permissions';

/* ── แผนที่ของ "เปลือกตั้งค่า" — แหล่งเดียวของทั้งแถบข้างและหน้ารวม ────────
 *
 * ⭐ มติผู้ใช้ 2026-08-20: หน้าตั้งค่าทุกหน้ามี **แถบรายการตั้งค่าค้างซ้ายมือ**
 * (เหมือนดรอปดาวน์ในหน้าโปรไฟล์ของบริการอื่น) ⇒ กระโดดข้ามหน้าได้โดยไม่ต้อง
 * ถอยกลับมาหน้ารวมก่อน และรู้ตลอดว่ายืนอยู่ตรงไหนของกอง
 *
 * ⚠️ **ห้ามมีรายการตั้งค่าสองชุด** — เดิมหน้ารวมสะกดรายการไว้เองในไฟล์หน้า
 * ทั้งชื่อ ไอคอน คำอธิบาย และเงื่อนไขสิทธิ์ · พอมีแถบข้างเพิ่มมาอีกที่ มันจะเพี้ยน
 * หากันทันทีที่ใครเพิ่มหน้าใหม่แล้วแก้ที่เดียว (กฎ "ฟอร์มเดียว" ของ AGENTS.md
 * ข้อเดียวกัน) ⇒ ทั้งสองที่อ่านไฟล์นี้
 *
 * ⚠️ `/users` และ `/audit` **ไม่ได้อยู่ใต้ `/settings`** แต่เป็นบริบทตั้งค่าเดียวกัน
 * (ดู `SETTINGS_PATHS` ใน config/navigation.js ที่นับสามรากนี้เป็นบริบทเดียวกัน)
 * ⇒ ต้องอยู่ในแผนที่นี้ด้วย ไม่งั้นเดินเข้าไปแล้วเมนูหายทั้งแถบ
 *
 * ⚠️ ด่านสิทธิ์จริงอยู่ที่หน้าและ API — `visible` ที่นี่คุมแค่ว่า "เห็นทางเข้าไหม"
 */

// ชื่อสั้นสำหรับแถบเมนู (`shortTitle`) ต่างจากหัวข้อเต็มของหน้าโดยตั้งใจ:
// แถบกว้าง 240px ชื่อยาวอย่าง "Workflow และ Timeline Template" ตัดท้ายทิ้งจนอ่านไม่ออก
export const SETTINGS_NAV = [
  {
    key: 'organization',
    title: 'องค์กร',
    blurb: 'ตัวตนของบริษัทและปฏิทินที่ทั้งระบบอ้างถึง',
    items: [
      {
        href: '/settings/company',
        icon: Building2,
        title: 'ข้อมูลบริษัท',
        shortTitle: 'ข้อมูลบริษัท',
        blurb: 'ชื่อนิติบุคคล ที่อยู่ เลขผู้เสียภาษี และช่องทางติดต่อ แบบมีเวอร์ชัน',
        visible: (user) => canUser(user, 'master:manage'),
      },
      {
        href: '/settings/holidays',
        icon: CalendarDays,
        title: 'วันหยุด (ปฏิทินทำการ)',
        shortTitle: 'วันหยุด',
        blurb: 'วันหยุดบริษัทและนักขัตฤกษ์ที่ใช้คำนวณไทม์ไลน์ทุกโครงการ',
        // ปฏิทินทำการเป็นข้อมูลอ่านได้ทั้งระบบ — ทุกคนที่เข้าเปลือกตั้งค่าได้เห็น
        visible: () => true,
      },
    ],
  },
  {
    key: 'documents',
    title: 'เอกสารและการค้า',
    blurb: 'สิ่งที่ปรากฏบนเอกสารที่ส่งออกนอกบริษัท',
    items: [
      {
        href: '/settings/document-standards',
        icon: FileBadge2,
        title: 'มาตรฐานเอกสาร',
        shortTitle: 'มาตรฐานเอกสาร',
        blurb: 'ชื่อเอกสาร รหัสแบบฟอร์ม Revision วันที่มีผล และรูปแบบเลขที่',
        visible: (user) => canManageDocumentStandards(user?.role),
      },
      {
        href: '/settings/commercial-presets',
        icon: WalletCards,
        title: 'คลังเงื่อนไขการค้า',
        shortTitle: 'เงื่อนไขการค้า',
        blurb: 'เทมเพลตเงื่อนไขการชำระและชุดหมายเหตุของใบเสนอราคา',
        visible: (user) => canManageCommercialPresets(user?.role),
      },
      {
        href: '/settings/signature-coverage',
        icon: Signature,
        title: 'ความพร้อมลายเซ็น',
        shortTitle: 'ความพร้อมลายเซ็น',
        blurb: 'ใครยังไม่มีลายเซ็นทั้งที่ต้องอนุมัติใบเสนอราคา/ใบสั่งขาย',
        visible: (user) => canUser(user, 'users:view') || canUser(user, 'users:manage'),
      },
    ],
  },
  {
    key: 'workflow',
    title: 'กระบวนการทำงาน',
    blurb: 'แม่แบบที่ระบบกางให้อัตโนมัติเมื่อมีงานใหม่',
    items: [
      {
        href: '/settings/workflow-templates',
        icon: Workflow,
        title: 'Workflow และ Timeline Template',
        shortTitle: 'Workflow Template',
        blurb: 'ขั้นตอน ระยะเวลา ผู้รับผิดชอบ และ dependency ของงานแต่ละสาย',
        visible: (user) => canUser(user, 'master:manage'),
      },
      {
        href: '/settings/cost-templates',
        icon: Layers,
        title: 'แม่แบบต้นทุนตามประเภทสินค้า',
        shortTitle: 'แม่แบบต้นทุน',
        blurb: 'โครงบรรทัดต้นทุนที่ใบขอราคาจะกางให้อัตโนมัติตามหมวดสินค้า',
        visible: (user) => canUser(user, 'master:manage'),
      },
    ],
  },
  {
    key: 'people',
    title: 'ผู้ใช้และการตรวจสอบ',
    blurb: 'ใครเข้าถึงอะไรได้ และใครแก้อะไรไปแล้ว',
    items: [
      {
        href: '/users',
        icon: Users,
        title: 'ผู้ใช้งาน',
        shortTitle: 'ผู้ใช้งาน',
        blurb: 'บัญชีผู้ใช้ บทบาท ทีม และสิทธิ์เพิ่มเติมรายคน',
        visible: (user) => canUser(user, 'users:view') || canUser(user, 'users:manage'),
      },
      {
        href: '/audit',
        icon: History,
        title: 'บันทึกการใช้งาน',
        shortTitle: 'บันทึกการใช้งาน',
        blurb: 'ประวัติการเพิ่ม แก้ และเปลี่ยนสถานะข้อมูลทั้งระบบ',
        visible: (user) => canUser(user, 'audit:view'),
      },
    ],
  },
  {
    key: 'platform',
    title: 'ระบบและเครื่องมือ',
    blurb: 'โครงสร้างเบื้องหลังที่ผู้ดูแลระบบเป็นคนแตะ',
    items: [
      {
        href: '/settings/storage',
        icon: HardDrive,
        title: 'ที่เก็บไฟล์ (Google Drive)',
        shortTitle: 'ที่เก็บไฟล์',
        blurb: 'ตรวจการเชื่อมต่อ Shared Drive ไฟล์แนบที่เปิดไม่ได้ และโครงโฟลเดอร์',
        // เครื่องมือที่ย้ายไฟล์จริงบน Drive — เฉพาะแอดมิน ไม่ใช่ users:view
        visible: (user) => canUser(user, 'users:manage'),
      },
      {
        href: '/settings/design-preview',
        icon: Palette,
        title: 'ต้นแบบดีไซน์ระบบ',
        shortTitle: 'ต้นแบบดีไซน์',
        blurb: 'ปุ่ม ตาราง ฟอร์ม ป้ายสถานะ และสีกลางทั้งหมดในหน้าเดียว',
        visible: () => true,
      },
    ],
  },
];

/** กลุ่ม+รายการที่ผู้ใช้คนนี้เห็น — กลุ่มที่ไม่เหลือรายการเลยถูกตัดทิ้งทั้งกลุ่ม */
export function settingsNavForUser(user) {
  return SETTINGS_NAV
    .map((group) => ({ ...group, items: group.items.filter((item) => item.visible(user)) }))
    .filter((group) => group.items.length > 0);
}

/** รายการทั้งหมดแบบแบน — ใช้หาว่ากำลังยืนอยู่หน้าไหน และใช้ค้นหา */
export function settingsNavItems(user) {
  return settingsNavForUser(user).flatMap((group) => group.items);
}

/* หา "หน้าที่กำลังเปิดอยู่" จาก pathname — ต้องเทียบแบบยาวสุดชนะ ไม่ใช่เจอตัวแรกแล้วหยุด
   (`/settings` เป็นคำนำหน้าของทุกหน้าย่อย ⇒ เจอตัวแรกจะไฮไลต์ผิดตลอด) */
export function activeSettingsHref(pathname, user) {
  const matches = settingsNavItems(user)
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`));
  return matches.sort((a, b) => b.length - a.length)[0] || null;
}

/* แปลงแผนที่ตั้งค่าให้เป็น "เมนูของระบบ" ที่ AppLayout วาดได้ตรง ๆ ─────────────
   ⭐ มติผู้ใช้ 2026-08-22: ตั้งค่าเลิกเป็นเปลือกพิเศษที่มีแถบรายการของตัวเอง —
   ใช้แถบข้าง/แถบล่างชุดเดียวกับทุกระบบ · แผนที่ยังเป็นไฟล์นี้ไฟล์เดียวเหมือนเดิม
   เปลี่ยนแค่ "ใครเป็นคนวาด"

   ⚠️ `match` ต้องเป็นแบบ **ยาวสุดชนะ** ไม่ใช่ `startsWith` เฉย ๆ — `/settings`
   เป็นคำนำหน้าของทุกหน้าย่อย ถ้าเทียบตรง ๆ "ภาพรวมการตั้งค่า" จะไฮไลต์ค้างตลอด
   ไม่ว่าจะเดินไปหน้าไหน (กับดักเดียวกับที่ `activeSettingsHref` แก้ไว้แล้ว) ⇒
   ยืมตัวนั้นมาตัดสินเลย

   ⚠️ ไม่มี `cap` — ด่านสิทธิ์ของเมนูตั้งค่าคือ `visible` ในแผนที่นี้ ซึ่ง
   `settingsNavForUser` กรองให้แล้วก่อนถึงมือ AppLayout */
export function settingsMenuItems(user) {
  const overview = {
    href: '/settings',
    name: 'ภาพรวมการตั้งค่า',
    shortName: 'ภาพรวม',
    icon: Settings,
    match: (pathname) => pathname === '/settings',
  };
  const items = settingsNavForUser(user).flatMap((group) => group.items.map((item) => ({
    href: item.href,
    name: item.shortTitle || item.title,
    icon: item.icon,
    group: group.title,
    match: (pathname) => activeSettingsHref(pathname, user) === item.href,
  })));
  return [overview, ...items];
}

/* ค้นหาในหน้ารวม — เทียบชื่อ ชื่อสั้น คำอธิบาย และ path
   (พิมพ์ "drive" หรือ "audit" ก็ต้องเจอ ทั้งที่ชื่อบนจอเป็นภาษาไทย) */
export function matchesSettingsQuery(item, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.shortTitle, item.blurb, item.href]
    .filter(Boolean)
    .some((text) => text.toLowerCase().includes(q));
}
