import { Briefcase, CircleDollarSign, Database, LineChart, Scale } from 'lucide-react';
import { canAccessMgmt, canAccessSahamit, canUser } from '@/lib/permissions';

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
    landing: () => '/database',
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
