// โมดูลลีด (Sales Revamp เฟส C) — enum/labels/กติกา transition + SLA วันทำการ.
// เส้นชีวิต: Marketing กรอกลีดรายวัน → Supervisor คัดกรองส่งทีม (SLA 1 วันทำการ) →
// Senior AE กระจายให้ AE → AE ติดต่อกลับ (SLA 1 วันทำการ) → นัดประชุม →
// เปิดลูกค้า (qualified) / ไม่ไปต่อ (disqualified) / ตีกลับทีมผิด (bounce → new).
// KPI/SLA คำนวณจาก timestamp ล้วน ๆ — ไม่มีการกรอกมือ.
import { countBusinessDays } from '@/lib/pm/dateHelpers';

export const LEAD_CHANNELS = [
  'chatcone_line', 'chatcone_meta', 'chatcone_tiktok', 'chatcone_ig',
  'phone', 'walkin', 'website',
];
export const LEAD_CHANNEL_LABELS = {
  chatcone_line: 'LINE',
  chatcone_meta: 'Meta',
  chatcone_tiktok: 'TikTok',
  chatcone_ig: 'IG',
  phone: 'โทรเข้า',
  walkin: 'Walk-in',
  website: 'เว็บไซต์',
};
// กลุ่มช่องทาง (Online / Onsite / Website) — derive จาก channel ตอนเขียน
export function channelGroupOf(channel) {
  if (String(channel || '').startsWith('chatcone_')) return 'online';
  if (channel === 'website') return 'website';
  return 'onsite'; // phone / walkin
}
export const CHANNEL_GROUP_LABELS = { online: 'Online', onsite: 'Onsite', website: 'Website' };
export const CHANNEL_GROUP_COLORS = { online: 'var(--blue)', onsite: 'var(--amber)', website: 'var(--teal)' };

export const LEAD_STATUSES = ['new', 'screened', 'assigned', 'contacted', 'meeting', 'qualified', 'disqualified'];
export const LEAD_STATUS_LABELS = {
  new: 'รอคัดกรอง',
  screened: 'รอกระจาย (ได้ทีมแล้ว)',
  assigned: 'รอติดต่อกลับ',
  contacted: 'ติดต่อแล้ว',
  meeting: 'นัดประชุมแล้ว',
  qualified: 'เปิดลูกค้าแล้ว',
  disqualified: 'ไม่ไปต่อ',
};
export const LEAD_STATUS_COLORS = {
  new: 'var(--amber)',
  screened: 'var(--blue)',
  assigned: 'var(--violet)',
  contacted: 'var(--teal)',
  meeting: 'var(--teal)',
  qualified: 'var(--green)',
  disqualified: 'var(--red)',
};

export const SERVICE_INTERESTS = ['diffuser', 'workshop', 'product', 'other'];
export const SERVICE_INTEREST_LABELS = {
  diffuser: 'ระบบกระจายกลิ่น',
  workshop: 'Workshop',
  product: 'สินค้า (ระบุ)',
  other: 'อื่นๆ (ระบุ)',
};
// สนใจ "สินค้า/อื่นๆ" ต้องระบุรายละเอียด (spec ผู้ใช้)
export const SERVICE_DETAIL_REQUIRED = new Set(['product', 'other']);

export const MEETING_MODES = ['onsite_customer_visit', 'onsite_at_office', 'online'];
export const MEETING_MODE_LABELS = {
  onsite_customer_visit: 'ออกไปหาลูกค้า',
  onsite_at_office: 'ลูกค้าเข้ามา',
  online: 'Online',
};

// transition ที่ทำได้จากแต่ละสถานะ (กติกา flow — role บังคับเพิ่มใน handler)
export const LEAD_TRANSITIONS = {
  new: ['screen', 'disqualify'],
  screened: ['assign', 'bounce', 'disqualify'],
  assigned: ['contact', 'bounce', 'disqualify'],
  contacted: ['meeting', 'create_deal', 'bounce', 'disqualify'],
  meeting: ['create_deal', 'disqualify'],
  qualified: ['create_deal'],
  disqualified: [],
};
export const TRANSITION_TO_STATUS = {
  screen: 'screened',
  assign: 'assigned',
  contact: 'contacted',
  meeting: 'meeting',
  create_deal: 'qualified',
  disqualify: 'disqualified',
  bounce: 'new', // ทีมไม่ตรง → กลับคิวคัดกรอง (ล้างทีม/ผู้รับ)
};

// SLA "ภายใน 1 วันทำการ": จำนวนวันทำการที่ผ่านไประหว่าง 2 เวลา ≤ 1
// (เกิดวันเดียวกัน = 0; ข้าม 1 วันทำการ = 1 → ยังทัน; ข้ามเสาร์-อาทิตย์/วันหยุดไม่นับ)
export function slaBusinessDays(fromIso, toIso, holidays) {
  if (!fromIso || !toIso) return null;
  return countBusinessDays(String(fromIso).slice(0, 10), String(toIso).slice(0, 10), holidays);
}
export function slaHit(fromIso, toIso, holidays, limitDays = 1) {
  const d = slaBusinessDays(fromIso, toIso, holidays);
  // ค่าติดลบ = ข้อมูลเวลาผิดลำดับ (to ก่อน from เช่น firstContactAt ค้างจากรอบก่อน) —
  // อย่านับเป็น "ทัน" กันเคส KPI พองจากลีดที่ตีกลับแล้วมอบใหม่ (ต้นเหตุแก้ที่ bounce แล้ว)
  if (d == null || d < 0) return null;
  return d <= limitDays;
}
