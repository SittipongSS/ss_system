import { Briefcase, CircleDollarSign, Database, Factory, LineChart, Scale, Wrench } from 'lucide-react';
import { canAccessMgmt, canAccessSahamit, canViewProduction, canUser, canViewService } from '@/lib/permissions';

export const RECENT_SYSTEM_STORAGE_KEY = 'ss:last-system';

export const SYSTEM_CATALOG = [
  {
    key: 'salesplan',
    label: 'บริหารงานขาย',
    description: 'จัดการลีด ดีล โครงการ เอกสารขาย และงานของทีมในพื้นที่เดียว',
    icon: CircleDollarSign,
    isVisible: (user) => ['salesplan:view', 'salesplan:lead', 'pm:view'].some((cap) => canUser(user, cap)),
    landing: (user) => {
      if (canUser(user, 'salesplan:view')) return '/sa';
      if (canUser(user, 'salesplan:lead')) return '/sa/leads';
      return '/sa/tasks';
    },
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
    // ⭐ X-1: ลงที่ **ภาพรวม** — ตอบ "มีอะไรค้าง / วันนี้ใครไปไหน / ไซต์ไหนกำลังจะ
    // มีปัญหา" ในหน้าเดียว แล้วค่อยกดต่อไปตาราง · **คนละหน้ากับภาพรวมของวางแผนผลิต**
    // ตามมติแยกทีม (TS ≠ PD) — ไม่มีปฏิทินรวมสองระบบ
    landing: () => '/service',
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
    isVisible: (user) => canAccessSahamit(user?.role, user?.team),
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
    landing: () => '/mgmt',
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
  return system?.isVisible(user) ? system : null;
}
