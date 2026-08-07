// โมดูลลีด (Sales Revamp เฟส C) — enum/labels/กติกา transition + SLA วันทำการ.
// เส้นชีวิต: Marketing กรอกลีดรายวัน → Supervisor คัดกรองส่งทีม (SLA 1 วันทำการ) →
// Senior AE กระจายให้ AE → AE ติดต่อกลับ (SLA 1 วันทำการ) → นัดประชุม →
// เปิดลูกค้า (qualified) / ไม่ไปต่อ (disqualified) / ตีกลับทีมผิด (bounce → new).
// KPI/SLA คำนวณจาก timestamp ล้วน ๆ — ไม่มีการกรอกมือ.
import { countBusinessDays } from '@/lib/pm/dateHelpers';
import { can, isReadOnlyObserver, isSuperuser } from '@/lib/permissions';

export const LEAD_CHANNELS = [
  'chatcone_line', 'chatcone_meta', 'chatcone_tiktok', 'chatcone_ig', 'typeform',
  'phone', 'walkin', 'website',
];
export const LEAD_CHANNEL_LABELS = {
  chatcone_line: 'LINE',
  chatcone_meta: 'Meta',
  chatcone_tiktok: 'TikTok',
  chatcone_ig: 'IG',
  typeform: 'Typeform',
  phone: 'โทรเข้า',
  walkin: 'Walk-in',
  website: 'เว็บไซต์',
};
// กลุ่มช่องทาง (Online / Onsite / Website) — derive จาก channel ตอนเขียน
// (เพิ่ม channel ใหม่ต้องเพิ่มใน CHECK constraint ของ sales_leads ด้วย — ดู mig 0129)
export function channelGroupOf(channel) {
  if (String(channel || '').startsWith('chatcone_') || channel === 'typeform') return 'online';
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

// ── สองชุด "สถานะที่ล็อก" ที่ห้ามใช้ปนกัน (มติผู้ใช้ 2026-08-08) ───────────────
// เดิมเป็นชุดเดียวคุมทั้งแก้และลบ = ลีดถูกปิดการแก้ทันทีที่เริ่มติดต่อ เหลือ admin คนเดียว
// ที่แก้ได้ ทั้งที่คนซึ่งรู้ข้อมูลใหม่คือ MKT ที่รับสายกับ AE ที่กำลังคุยกับลูกค้าอยู่
//
// แก้ไข → ล็อกตอน "เปิดดีลแล้ว/ปิดลีดแล้ว" เพราะจากจุดนั้นลีดกลายเป็น *บันทึกต้นทาง*
//   งานย้ายไปอยู่ที่ดีล ข้อมูลที่เปลี่ยนหลังจากนั้นต้องแก้ที่ดีล ไม่ใช่ย้อนมาแก้ต้นทาง
//   จนเอกสารสองใบเล่าเรื่องคนละอย่าง
// ลบ   → คงเข้มเท่าเดิมทุกประการ: แก้ผิดยังตามกลับได้จาก audit log แต่ลบแล้ว
//   `lead_events` หายตาม (ON DELETE CASCADE — mig 0091) กู้ไม่ได้
//   ฝ่ายขายจึงใช้ "ไม่ไปต่อ" (disqualify) แทนการลบเสมอ
export const LEAD_EDIT_LOCKED_STATUSES = ['qualified', 'disqualified'];
export const LEAD_DELETE_LOCKED_STATUSES = ['contacted', 'meeting', 'qualified', 'disqualified'];

// ── ใครเห็นลีดแค่ไหน (เฟส C) ─────────────────────────────────────────────
//   supervisor/admin/viewer/executive → ทุกใบ · marketing → ทุกใบ (ทีม intake
//   เห็นคิวรวมเพื่อไม่กรอกซ้ำ) · senior_ae/ac → **เฉพาะที่คัดกรองมาเข้าทีมแล้ว**
//   · ae → ที่ถูกมอบหมายให้ตัวเอง **หรือที่ตัวเองกรอก** · role อื่น (rd ฯลฯ) → ไม่เห็นเลย
//
// ⚠️ senior_ae/ac **ไม่เห็นคิวกลาง (`new`)** — ลีดที่ยังไม่คัดกรองมี team = null
// ซึ่ง `.eq('team', …)` ไม่คืนให้ (บรรทัดคอมเมนต์เดิมเขียนว่าเห็น "คิวกลาง (new)" ด้วย
// ซึ่งไม่ตรงกับโค้ดมาตั้งแต่ต้น — แก้คำอธิบายให้ตรงของจริง 2026-08-04)
// `canEditLead` ยังยอมให้ senior_ae แก้ลีดที่ยังไม่มีทีม (`!lead.team`) อยู่ตามเดิม —
// แต่ **ไปไม่ถึงแล้ว**: ทั้ง GET / PATCH / DELETE ผ่านด่าน `inLeadScope` ก่อนเสมอ
// ซึ่งบังคับ `!!lead.team && lead.team === user.team` สำหรับ senior_ae/ac
// (เดิม PATCH ไม่มีด่านนี้ ⇒ ยิง URL ตรงเข้าไปแก้ลีดในคิวกลางได้ · ปิดแล้ว 2026-08-08)
// ปล่อยสาขานี้ไว้เพราะมันไม่ใช่นโยบายที่ผิด — ที่ผิดคือด่านมองเห็นที่ขาดไป
//
// เดิมสามตัวนี้อยู่ในไฟล์ API route แล้วไฟล์อื่นต้อง `import … from '../route'` —
// ย้ายมาอยู่กับ canEditLead/canWorkLead ที่นี่เพราะทะเบียนเธรดกลาง (updateAccess)
// เป็น lib จะ import จาก app route ไม่ได้ · และสองตัวล่างต้องตรงกันเสมอ
// (`applyLeadScope` กรองที่ DB · `inLeadScope` ตัดสินแถวที่โหลดมาแล้ว)
export function applyLeadScope(query, user) {
  const role = user?.role;
  // supervisor sees all leads (to screen them)
  if (isSuperuser(role) || isReadOnlyObserver(role) || role === 'marketing') return query;
  if (role === 'senior_ae' || role === 'ac') {
    // Senior/AC only see leads that have been screened to their team.
    return query.eq('team', user?.team ?? '__no_team__');
  }
  if (role === 'ae') {
    return query.or(`assigneeId.eq.${user?.id ?? ''},createdBy.eq.${user?.id ?? ''}`);
  }
  return query.eq('id', '__no_lead_scope__');
}

// scope รายใบ — กติกาเดียวกับ applyLeadScope (ใช้กับ GET /leads/[id] ที่โหลดมาแล้ว)
export function inLeadScope(user, lead) {
  const role = user?.role;
  if (isSuperuser(role) || isReadOnlyObserver(role) || role === 'marketing') return true;
  if (role === 'senior_ae' || role === 'ac') return !!lead.team && lead.team === user?.team;
  if (role === 'ae') return lead.assigneeId === user?.id || lead.createdBy === user?.id;
  return false;
}

export function canViewLeads(user) {
  return !!user && (can(user.role, 'salesplan:lead') || can(user.role, 'salesplan:view'));
}

// ใครเพิ่มลีดเข้าคิวได้ — จุดเดียวให้ API route และหน้า list ใช้ร่วมกัน (ห้ามเขียนซ้ำ):
//   marketing → ช่องทางหลัก (ทีม intake) · admin/ae_supervisor (isSuperuser) →
//   มติผู้ใช้ 2026-07-30: หัวหน้าฝ่ายขายรับลีดตรงจากลูกค้า/งานแสดงสินค้าเองด้วย
//   ต้องกรอกเข้าคิวได้ ไม่ต้องฝาก MKT กรอกแทน (คนคัดกรองก็คือคนเดิม)
// ฝ่ายขายที่เหลือ (senior_ae/ac/ae) ยังเพิ่มไม่ได้ — ลีดต้องเข้าคิวกลางก่อนคัดกรอง
export function canCreateLead(role) {
  return role === 'marketing' || isSuperuser(role);
}

// เปิดดีลจากลีดได้ไหม — คนละเรื่องกับสิทธิ์ลีด: AC ทำงานคิวลีดได้แต่เปิดดีลไม่ได้
// (มติผู้ใช้) และ AE Supervisor จบงานที่คัดกรอง ไม่สร้างดีลจากคิว (มติ 2026-07-21)
//
// 🐞 หน้ารายละเอียดลีด (#864) เคยถามเป็น `useCan('salesplan:deal')` ซึ่ง **ไม่มีสิทธิ์ชื่อนี้
// อยู่ในระบบ** → can() คืน false เสมอ → ปุ่ม "เปิดดีลจากลีดนี้" ไม่เคยโผล่ให้ใครเห็นเลย
// สิทธิ์ที่สะกดผิดไม่ระเบิด มันแค่เงียบ — จึงย้ายมาเป็นฟังก์ชันที่เทสต์จับได้
export function canCreateDealFromLead(role) {
  return role === 'admin' || role === 'ae' || role === 'senior_ae';
}

// นโยบาย **แก้** ลีด — จุดเดียวให้ API route และหน้า list ใช้ร่วมกัน (ห้ามเขียนซ้ำ)
// ขอบเขต "ใบไหนบ้าง" ของแต่ละตำแหน่งไม่เปลี่ยนจากเดิม — ที่ปลดคือเรื่อง *สถานะ* อย่างเดียว
//   admin          → ทุกใบทุกสถานะ
//   ae_supervisor  → ทุกใบ ก่อนเปิดดีล
//   marketing      → ใบที่ตัวเองกรอก ก่อนเปิดดีล
//     ⭐ มติผู้ใช้ 2026-08-08 **กลับมติ 2026-07-20** (เดิม: คัดกรองแล้วห้ามแตะ) —
//     ลูกค้าโทรมาแก้เบอร์/เพิ่มงบหลังส่งเข้าทีมแล้วเป็นเรื่องปกติ และคนที่รับสายคือ MKT
//     ไม่ใช่ AE · ปิดทางแก้ = ข้อมูลผิดค้างอยู่ในระบบหรือไปโผล่ในช่องหมายเหตุแทน
//   senior_ae      → ลีดของทีมตัวเอง (หรือยังไม่มีทีม) ก่อนเปิดดีล
//   ae             → ใบที่ถูกมอบหรือกรอกเอง ก่อนเปิดดีล
//   ac             → **ไม่ได้เลย** (มติ 2026-08-08) — AC เป็นหลังบ้านของทีม SA
//     เดินงานให้ทีมได้ (ดู canWorkLead) แต่ไม่ใช่เจ้าของข้อมูลของใบไหน
export function canEditLead(user, lead) {
  const role = user?.role;
  if (role === 'admin') return true;
  if (LEAD_EDIT_LOCKED_STATUSES.includes(lead.status)) return false;
  if (isSuperuser(role)) return true;
  if (role === 'marketing') return !!user?.id && lead.createdBy === user.id;
  if (role === 'senior_ae') return !lead.team || lead.team === user?.team;
  if (role === 'ae') return (!!user?.id && (lead.assigneeId === user.id || lead.createdBy === user.id));
  return false;
}

// ขั้น "ทำงาน" ของคิวลีด (ติดต่อ/นัด/สร้างดีล) — ทีมเจ้าของงานเท่านั้น:
// admin / senior_ae|ac ทีมเดียวกับลีด / ae ผู้รับมอบ
// มติผู้ใช้ 2026-07-21: งานของ AE Supervisor จบที่คัดกรอง — หลังจากนั้นเหลือเฉพาะ
// ปุ่มกำกับดูแล (ตีกลับ/ไม่ไปต่อ); admin คงทำได้ทุกขั้นตามธรรมเนียมทั้งระบบ
export function canWorkLead(user, lead) {
  const role = user?.role;
  if (role === 'admin') return true;
  if ((role === 'senior_ae' || role === 'ac') && lead.team === user?.team) return true;
  if (role === 'ae' && !!user?.id && lead.assigneeId === user.id) return true;
  return false;
}

// ลบ = เข้มกว่าแก้ และ **ไม่ได้ปลดตามมติ 2026-08-08**: เฉพาะ admin/supervisor/marketing
// (ฝ่ายขายใช้ "ไม่ไปต่อ" แทนการลบ) · MKT ยังลบได้เฉพาะใบตัวเองที่ยังไม่ถูกคัดกรอง —
// ส่งเข้าทีมแล้วเป็นงานของฝ่ายขาย จะให้ต้นทางลบทิ้งกลางคันไม่ได้
export function canDeleteLead(user, lead) {
  const role = user?.role;
  if (role === 'admin') return true;
  if (LEAD_DELETE_LOCKED_STATUSES.includes(lead.status)) return false;
  if (isSuperuser(role)) return true;
  if (role === 'marketing') return lead.status === 'new' && !!user?.id && lead.createdBy === user.id;
  return false;
}

// transition ที่ทำได้จากแต่ละสถานะ (กติกา flow — role บังคับเพิ่มใน handler)
//
// ⭐ `meeting → meeting` = **นัดเพิ่ม / เลื่อนนัด** (มติผู้ใช้ 2026-08-08)
// เดิมนัดได้ครั้งเดียวต่อลีด: ถึงสถานะ `meeting` แล้วเหลือทางเดียวคือเปิดดีลหรือปิดลีด
// ⇒ เลื่อนนัดไม่ได้ นัดครั้งที่สองไม่ได้ ต้องให้แอดมินแก้ให้ · วนกลับตัวเองไม่ใช่การถอย
// สถานะจึงไม่ขยับ (TRANSITION_TO_STATUS.meeting === 'meeting') แค่มีเหตุการณ์เพิ่มในประวัติ
//
// ⭐ `meeting → bounce` — ตีกลับได้ถึงขั้นนัดแล้ว: บางทีทีมไม่ตรงเพิ่งโผล่ตอนคุยกันจริง
// ก่อนหน้านี้ตีกลับได้แค่ถึงขั้น `contacted` แล้วหน้าผาก็ปิดกลางทาง
//
// ⚠️ **ไม่เปิด `meeting → contact`** ทั้งที่ mockup เคยวาดปุ่มไว้ — `contact` แปลว่า
// สถานะกลับไปเป็น `contacted` (ดู TRANSITION_TO_STATUS) = ลีดถอยหลังจากที่นัดแล้ว
// บันทึกการคุยเพิ่มระหว่างรอประชุมใช้เธรดกลางซึ่งเปิดอยู่ทุกสถานะอยู่แล้ว
export const LEAD_TRANSITIONS = {
  new: ['screen', 'disqualify'],
  screened: ['assign', 'bounce', 'disqualify'],
  assigned: ['contact', 'bounce', 'disqualify'],
  contacted: ['meeting', 'create_deal', 'bounce', 'disqualify'],
  meeting: ['meeting', 'create_deal', 'bounce', 'disqualify'],
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

// ลีดต้นทางของดีล — ตัวตัดสินช่องเดียวที่ POST /deals ต้องใช้ทั้งตอน "ตรวจสิทธิ์" และ
// ตอน "เขียนคอลัมน์ sales_deals.leadId"
//
// คอลัมน์ leadId คือแหล่งจริง: หน้ารายละเอียดลีดหาดีลของลีดด้วย eq('leadId', id)
// เดิมด่านตรวจสิทธิ์อ่าน metadata.leadId + metadata.source === 'lead' แต่คอลัมน์เขียนจาก
// body.leadId — คนละช่องกัน ผลคือ:
//   * ส่ง leadId เดี่ยว ๆ → ผูกดีลกับลีดทีมอื่น/สถานะใดก็ได้ โดยไม่ผ่านด่านเลย
//     ลีดไม่ถูกปิดเป็น qualified และไม่มี lead_event = conversion นับตกหล่น
//   * ส่ง metadata.leadId เดี่ยว ๆ → ลีดถูกปิด qualified แต่คอลัมน์ว่าง
//     หน้าลีดจึงมองไม่เห็นดีลที่แตกจากมัน
// ส่งมาทั้งคู่แต่คนละค่า = เจตนากำกวม ต้องเด้งกลับ ไม่ใช่เงียบ ๆ เลือกข้างใดข้างหนึ่ง
export function sourceLeadIdOf(body = {}) {
  const direct = String(body?.leadId || '').trim();
  const nested = String(body?.metadata?.leadId || '').trim();
  if (direct && nested && direct !== nested) {
    return { leadId: null, error: 'ระบุลีดต้นทางไม่ตรงกัน (leadId กับ metadata.leadId) — ต้องเป็นลีดใบเดียวกัน' };
  }
  return { leadId: direct || nested || null, error: null };
}

// ── เวลานัดที่ควรค้างอยู่บนคอลัมน์ `sales_leads.meetingAt` ────────────────────
// ตั้งแต่เปิดให้ "นัดเพิ่ม / เลื่อนนัด" (มติ 2026-08-08) ลีดหนึ่งใบมีได้หลายนัด แต่คอลัมน์
// มีช่องเดียว — ทับด้วยนัดที่กดล่าสุดเฉย ๆ ไม่ได้ เพราะคนที่มาบันทึกนัด "ที่เพิ่งประชุมไป
// เมื่อวาน" ย้อนหลัง จะทับนัดจริงในอนาคตทิ้ง แล้วลีดหลุดจากงานที่ต้องทำใน my-dashboard
// (ซึ่งอ่าน `meetingAt >= วันนี้`) โดยไม่มีอะไรบอก
//
// แยกเป็นฟังก์ชันบริสุทธิ์สองตัวเพราะกติกาอยู่ในไฟล์ route แล้วเทสต์เข้าไม่ถึง
// (route เหลือหน้าที่เดียวคือ query แล้วส่งแถวมาให้)

/** นัดของ "รอบปัจจุบัน" — events เรียงใหม่→เก่า แล้วตัดที่ bounce ตัวแรกที่เจอ
 *  ⚠️ bounce = เริ่มรอบใหม่ (ล้างทีม/ผู้รับ/เวลาติดต่อ/เวลานัด) แต่ `lead_events` เก็บ
 *  ประวัติไว้หมด ไม่ตัดที่ bounce = นัดของเจ้าของคนเก่าฟื้นกลับมาบนลีดของเจ้าของคนใหม่ */
export function meetingTimesSinceBounce(events = []) {
  const times = [];
  for (const row of events) {
    if (row?.kind === 'bounce') break;
    if (row?.eventAt) times.push(row.eventAt);
  }
  return times;
}

/** นัดถัดไปที่ยังไม่ถึง — ไม่เหลือนัดในอนาคตแล้วก็ใช้นัดล่าสุดที่ผ่านมา
 *  (KPI/funnel ถามแค่ "มีนัดไหม" จึงนับถูกทั้งสองทาง)
 *  ⚠️ เทียบด้วย `Date.parse` ไม่ใช่เรียงสตริง — ค่าที่ client ส่งมาเป็น `…Z` ส่วนค่าที่อ่าน
 *  จาก timestamptz เป็น `…+00:00` เรียงสตริงข้ามสองรูปแบบนี้ให้ผลผิด */
export function pickNextMeetingAt(times = [], nowIso) {
  const stamped = times
    .map((iso) => ({ iso, ms: Date.parse(iso) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => a.ms - b.ms);
  if (!stamped.length) return null;
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) return stamped[stamped.length - 1].iso;
  return (stamped.find((entry) => entry.ms >= nowMs) || stamped[stamped.length - 1]).iso;
}

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
