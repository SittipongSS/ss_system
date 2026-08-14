import { Briefcase, CircleDollarSign, Database, Factory, FlaskConical, LifeBuoy, LineChart, Scale, Wallet, Wrench } from 'lucide-react';
import { canAccessFinance, canAccessMgmt, worksInSalesPipeline, canAccessRd, canAccessSahamit, canViewProduction, canUser, canViewService, userTeams } from '@/lib/permissions';

export const RECENT_SYSTEM_STORAGE_KEY = 'ss:last-system';

// ── ระบบที่ยังไม่เปิดใช้ ────────────────────────────────────────────────
//
// `disabled: true` = **จางและกดไม่ได้ ไม่ใช่ซ่อน** (แพตเทิร์นเดียวกับปุ่มเลือกฝ่าย
// ที่ยังไม่เปิดใน `RequestForm`) · ซ่อนเมื่อไร คนที่เคยใช้ระบบนั้นจะนึกว่าสิทธิ์ตัวเอง
// หาย แล้วเดินมาถามผู้ดูแลทีละคน — การ์ดจาง ๆ ที่เขียนว่า "ยังไม่เปิดใช้" ตอบแทนได้เอง
//
// ⚠️ ด่านนี้เป็น **เปลือก UI เท่านั้น** ไม่ใช่ด่านสิทธิ์ — พิมพ์ URL ตรง ๆ ยังเข้าได้
// ถ้าวันไหนต้องปิดจริง ต้องปิดที่ `lib/permissions.js` หรือชั้น API ไม่ใช่ที่ไฟล์นี้
export const SYSTEM_DISABLED_NOTE = 'ยังไม่เปิดใช้';

export const SYSTEM_CATALOG = [
  {
    key: 'salesplan',
    label: 'บริหารงานขาย',
    description: 'จัดการลีด ดีล โครงการ เอกสารขาย และงานของทีมในพื้นที่เดียว',
    icon: CircleDollarSign,
    isVisible: (user) => ['salesplan:view', 'salesplan:lead', 'pm:view'].some((cap) => canUser(user, cap)),
    landing: (user) => {
      /* ⚠️ ปลายทางต้องเป็นหน้าที่ **อยู่ในเมนูของคนคนนั้น** — ไม่งั้นกดการ์ดระบบแล้วไป
         ยืนบนหน้าที่แถบเมนูไม่ไฮไลต์อะไรเลย · ฝ่ายบัญชีไม่มีแดชบอร์ดยอดขายในเมนู
         (มติ 2026-08-13 · กฎสามชั้น) เอกสารที่เขาเปิดจริงคือใบสั่งขาย */
      if (!worksInSalesPipeline(user) && canUser(user, 'salesplan:view')) return '/sa/sales-orders';
      if (canUser(user, 'salesplan:view')) return '/sa';
      if (canUser(user, 'salesplan:lead')) return '/sa/leads';
      return '/sa/tasks';
    },
  },
  {
    // วิจัยและพัฒนา — บ้านของฝ่าย RD (มติ ม-29 · 2026-08-07)
    // > "SA ในโมดูลบริหารงานขาย ส่วน RD ก็ใช้โมดูลวิจัยและพัฒนาเลย"
    //
    // ⚠️ **ทะเบียนกลิ่น/สูตรไม่ได้ย้ายมาที่นี่** (มติ ม-30) — ผู้ใช้ยืนยันเองว่า
    // *"มันก็เป็นฐานข้อมูลกลางนะ แค่มาจาก RD"* ⇒ อยู่ใต้ "ฐานข้อมูล" ต่อ · RD เขียน
    // ฝ่ายอื่นอ่าน · โมดูลนี้เก็บ **งานของฝ่าย** ไม่ใช่ข้อมูลหลักที่ฝ่ายนี้ผลิต
    key: 'rd',
    label: 'วิจัยและพัฒนา',
    description: 'คิวคำร้องที่รอฝ่าย R&D ตอบ — พัฒนากลิ่น พัฒนาสูตร และงานที่เลยกำหนด',
    icon: FlaskConical,
    // ⭐ ด่านอยู่ที่ `canAccessRd` ตัวเดียว — **แถบเมนูใน AppLayout ใช้ตัวเดียวกัน**
    // (เหตุผลว่าทำไมไม่ใช้ `canAnswerRequestsFor` และทำไม admin ต้องแยกสาขา
    //  อยู่ในคอมเมนต์ของฟังก์ชันนั้น) · แยกสองที่เมื่อไรก็ได้การ์ดที่กดแล้วไปเจอ
    //  เมนูว่าง ซึ่งเป็นบั๊กที่โมดูลนี้เพิ่งเป็นมา
    isVisible: (user) => canAccessRd(user),
    landing: () => '/rd',
  },
  {
    // วางแผนผลิต — แยกจาก "บริหารงานขาย" โดยเจตนา (มติผู้ใช้ 2026-07-30):
    // เจ้าของงานคือฝ่ายผลิต/จัดซื้อ ไม่ใช่ฝ่ายขาย · ฝ่ายขายเข้ามา *อ่าน* ได้เพื่อ
    // ตอบลูกค้าว่าผลิตวันไหน แต่ไม่ใช่เมนูในระบบงานของเขา
    key: 'production',
    label: 'วางแผนผลิต',
    description: 'ไลน์ผลิต กำลังผลิตต่อวัน และคิวงานผลิตของโรงงาน',
    icon: Factory,
    // ⭐ P-3 เปิดให้ **ทุกคนที่อ่านตารางผลิตได้** แล้ว — บอร์ดตอบคำถามที่ฝ่ายขาย/
    // คลัง/QC ถามจริง ("โรงงานจะผลิตวันไหน") ต่างจากตอน P-1 ที่มีแต่หน้าตั้งค่าไลน์
    // ซึ่งคนอ่านอย่างเดียวกดเข้าไปแล้วทำอะไรไม่ได้
    // ⚠️ canViewProduction แคบ staff เหลือ PC/PD/WH/QC — **ฝ่าย TS ไม่เห็น**
    //    เพราะเป็นคนละทีมปฏิบัติงาน (มติผู้ใช้ 2026-07-31)
    isVisible: (user) => canViewProduction(user),
    disabled: true, // ยังไม่เปิดใช้ (มติผู้ใช้ 2026-08-09) — ดูหมายเหตุที่ SYSTEM_DISABLED_NOTE
    // ⭐ X-1: ลงที่ **ภาพรวม** ทุกคน — หน้าเดียวที่ตอบพร้อมกันว่าต้องตัดสินใจอะไรก่อน
    // (สำหรับ PC/PD) และโรงงานจะผลิตอะไรวันไหน (สำหรับคลัง/QC/ฝ่ายขาย) แล้วค่อยกด
    // ต่อไปคิว/บอร์ดจากตรงนั้น · เลิกแยกปลายทางตามสิทธิ์เพราะทั้งสองกลุ่มเริ่มที่
    // คำถามเดียวกัน ("ตอนนี้สถานะเป็นยังไง") ต่างกันแค่ทำอะไรต่อ
    landing: () => '/production',
  },
  {
    // ธุรกิจบริการ (ฝ่าย TS) — แยกจาก "วางแผนผลิต" คนละโมดูล คนละตาราง คนละสิทธิ์
    // (มติผู้ใช้ 2026-07-30) · ต่างจากระบบผลิตตรงที่ **เปิดตามสิทธิ์อ่าน** เพราะ
    // ทะเบียนไซต์ตอบคำถามที่ฝ่ายขายถามจริง ("ลูกค้ารายนี้มีเครื่องกี่จุด")
    // ไม่ใช่หน้าตั้งค่าที่คนอ่านอย่างเดียวเข้าไปแล้วทำอะไรไม่ได้
    key: 'service',
    // ชื่อระบบ = "ธุรกิจบริการ" (มติผู้ใช้ 2026-07-31) — สื่อว่าเป็นสายธุรกิจ
    // ไม่ใช่ "งานบริการ" ที่ฟังเหมือนงานสนับสนุนภายใน
    label: 'ธุรกิจบริการ',
    description: 'ไซต์ติดตั้ง เครื่องกระจายกลิ่น และตารางเข้าบริการของฝ่ายเทคนิค',
    icon: Wrench,
    isVisible: (user) => canViewService(user),
    disabled: true, // ยังไม่เปิดใช้ (มติผู้ใช้ 2026-08-09) — ดูหมายเหตุที่ SYSTEM_DISABLED_NOTE
    // ⭐ X-1: ลงที่ **ภาพรวม** — ตอบ "มีอะไรค้าง / วันนี้ใครไปไหน / ไซต์ไหนกำลังจะ
    // มีปัญหา" ในหน้าเดียว แล้วค่อยกดต่อไปตาราง · **คนละหน้ากับภาพรวมของวางแผนผลิต**
    // ตามมติแยกทีม (TS ≠ PD) — ไม่มีปฏิทินรวมสองระบบ
    landing: () => '/service',
  },
  {
    // บัญชีและการเงิน — บ้านของฝ่าย FN (มติผู้ใช้ 2026-08-13)
    // > *"อยากสร้าง Module ของบัญชีและการเงินออกมาแบบวิจัยและพัฒนา · เอาตารางการ
    // >  ชำระของทุก SO ออกมารวมอยู่ในที่เดียว"*
    //
    // ⚠️ **ไม่ใช่ที่เก็บงวดชำระ** — งวดยังเป็นของใบ SO เหมือนเดิม (mig 0245) โมดูลนี้
    // เอามา **รวมให้อ่านข้ามใบ** และเป็นทางลงมือของฝ่ายบัญชี · แพตเทิร์นเดียวกับที่
    // ทะเบียนกลิ่นไม่ได้ย้ายเข้าโมดูล RD (ม-30): โมดูลของฝ่าย = งานของฝ่าย
    // ไม่ใช่ตารางที่ฝ่ายนั้นแตะ
    key: 'finance',
    label: 'บัญชีและการเงิน',
    description: 'ทะเบียนการชำระของทุกใบสั่งขาย พร้อมใบที่รอบัญชีตรวจและยอดที่ค้างรับ',
    icon: Wallet,
    // ⭐ ด่านตัวเดียวกับแถบเมนูใน AppLayout — แยกสองที่เมื่อไรได้การ์ดที่กดแล้วเมนูว่าง
    isVisible: (user) => canAccessFinance(user),
    landing: () => '/finance',
  },
  {
    key: 'tax',
    label: 'ภาษีสรรพสามิต',
    description: 'ดูภาพรวมทะเบียน การยื่นชำระภาษี และรายงานที่เกี่ยวข้อง',
    icon: Scale,
    isVisible: (user) => canUser(user, 'history:view'),
    landing: () => '/tax',
  },
  {
    key: 'sahamit',
    label: 'งานสหมิตร',
    description: 'ติดตาม Forecast, PO, การกระทบยอด และแผนวัสดุของงานสหมิตร',
    icon: LineChart,
    isVisible: (user) => canAccessSahamit(user?.role, userTeams(user)),
    landing: () => '/sahamit',
  },
  {
    key: 'master',
    label: 'ฐานข้อมูล',
    description: 'จัดการข้อมูลลูกค้า สินค้า และข้อมูลหลักที่ใช้ร่วมกันทุกระบบ',
    icon: Database,
    isVisible: (user) => canUser(user, 'customers:view') || canUser(user, 'products:view'),
    // หน้าภาพรวม /database ผสมสถิติลูกค้าไว้ด้วย — บทบาทที่มีแค่ products:view
    // (secretary, marketing) จึงลงที่หน้าสินค้าตรง ๆ แทน
    landing: (user) => (canUser(user, 'customers:view') ? '/database' : '/database/products'),
  },
  {
    key: 'mgmt',
    label: 'งานบริหาร',
    description: 'ติดตามงาน การประชุม และเป้าหมาย Rock & Improve ขององค์กร',
    icon: Briefcase,
    isVisible: (user) => canAccessMgmt(user),
    disabled: true, // ยังไม่เปิดใช้ (มติผู้ใช้ 2026-08-09) — ดูหมายเหตุที่ SYSTEM_DISABLED_NOTE
    landing: () => '/mgmt',
  },
  {
    // แจ้งปัญหาระบบ (mig 0223) — ระบบเดียวที่ **ทุกคนที่ล็อกอินเห็น** ไม่มีเงื่อนไข
    // cap · อยู่ท้ายสุดเพราะไม่ใช่ระบบงานประจำวันของใคร แต่ต้องหาเจอตอนที่ต้องใช้
    //
    // ⚠️ ไม่เอาไปไว้ใต้ "ตั้งค่า" ทั้งที่ดูเข้าพวก — เปลือกตั้งค่า `viewer` เข้าไม่ได้
    // แต่ viewer คือกลุ่มที่เจอบั๊กบ่อยที่สุดและต้องแจ้งได้ (มติ Q2/Q14)
    key: 'support',
    label: 'แจ้งปัญหาระบบ',
    description: 'ส่งบั๊ก ปัญหาการใช้งาน หรือคำขอปรับระบบถึงผู้ดูแล แล้วติดตามสถานะได้',
    icon: LifeBuoy,
    isVisible: () => true,
    landing: () => '/support',
  },
];

export const SYSTEM_ORDER = SYSTEM_CATALOG.map((system) => system.key);

export function getSystemByKey(key) {
  return SYSTEM_CATALOG.find((system) => system.key === key) || null;
}

export function systemsForUser(user) {
  return SYSTEM_CATALOG.filter((system) => system.isVisible(user));
}

export function systemLandingForUser(systemOrKey, user) {
  const system = typeof systemOrKey === 'string' ? getSystemByKey(systemOrKey) : systemOrKey;
  return system ? system.landing(user) : null;
}

export function recentSystemForUser(user, storedKey) {
  const system = getSystemByKey(storedKey);
  // ระบบที่ปิดอยู่ต้องไม่ขึ้นการ์ด "ทำงานต่อ" — คนที่ใช้ระบบนั้นเป็นระบบสุดท้ายก่อนปิด
  // จะเปิดหน้าแรกมาเจอปุ่มใหญ่ที่กดไปแล้วขัดกับการ์ดจาง ๆ ข้างล่างที่บอกว่ายังไม่เปิด
  return system?.isVisible(user) && !system.disabled ? system : null;
}
