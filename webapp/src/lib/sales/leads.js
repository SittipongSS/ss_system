// โมดูลลีด (Sales Revamp เฟส C) — enum/labels/กติกา transition + SLA วันทำการ.
// เส้นชีวิต: Marketing กรอกลีดรายวัน → Supervisor คัดกรองส่งทีม (SLA 1 วันทำการ) →
// Senior AE กระจายให้ AE (SLA 1 วันทำการ) → AE ติดต่อกลับ (SLA 1 วันทำการ) → นัดประชุม →
// เปิดลูกค้า (qualified) / ไม่ไปต่อ (disqualified) / ตีกลับทีมผิด (bounce → new).
// KPI/SLA คำนวณจาก timestamp ล้วน ๆ — ไม่มีการกรอกมือ · ทุกด่านวัดด้วย slaStage ตัวเดียว
// และหาวันด้วย businessDayKey (เวลาไทย) ตัวเดียวเท่านั้น — ดูเหตุผลที่ slaBusinessDays
import { countBusinessDays } from '@/lib/pm/dateHelpers';
import { businessDayKey } from '@/lib/datePeriods';
import { can, hasTeam, isReadOnlyObserver, isSuperuser } from '@/lib/permissions';
import { whereTeamIn } from '@/lib/teamScope';

export const LEAD_CHANNELS = [
  'chatcone_line', 'chatcone_meta', 'chatcone_tiktok', 'chatcone_ig', 'typeform', 'email',
  'phone', 'walkin', 'website',
];
export const LEAD_CHANNEL_LABELS = {
  chatcone_line: 'LINE',
  chatcone_meta: 'Meta',
  chatcone_tiktok: 'TikTok',
  chatcone_ig: 'IG',
  typeform: 'Typeform',
  email: 'อีเมล',
  phone: 'โทรเข้า',
  walkin: 'Walk-in',
  website: 'เว็บไซต์',
};
// กลุ่มช่องทาง (Online / Onsite / Website) — derive จาก channel ตอนเขียน
//
// 🔴 **เพิ่ม channel ใหม่ต้องแก้ 3 ที่พร้อมกัน** ไม่งั้นพังคนละแบบ:
//   1. `LEAD_CHANNELS` + `LEAD_CHANNEL_LABELS` ที่นี่ — ไม่เพิ่ม = API ตีกลับ "ช่องทางไม่ถูกต้อง"
//   2. ฟังก์ชันนี้ — ไม่เพิ่ม = ตกไปกลุ่ม 'onsite' เงียบ ๆ (ค่าตั้งต้นของ `return` ท้ายสุด)
//      แล้วรายงานแยกกลุ่มจะนับผิดโดยไม่มีอะไรฟ้อง
//   3. CHECK constraint ของ `sales_leads.channel` (mig 0129 → 0252) — ไม่เพิ่ม = บันทึกไม่ได้
//      ตอน insert จริง ทั้งที่ฟอร์มโชว์ตัวเลือกให้เลือกแล้ว
export function channelGroupOf(channel) {
  const value = String(channel || '');
  // 'email' = ลีดที่เข้าทางอีเมล (มติผู้ใช้ 2026-08-13 · IS-26080024) — จัดกลุ่ม online
  // ตามที่ผู้ใช้สั่ง ไม่ใช่ onsite แม้จะไม่ได้มาจากแพลตฟอร์มโฆษณา
  if (value.startsWith('chatcone_') || value === 'typeform' || value === 'email') return 'online';
  if (value === 'website') return 'website';
  return 'onsite'; // phone / walkin
}
export const CHANNEL_GROUP_LABELS = { online: 'Online', onsite: 'Onsite', website: 'Website' };
export const CHANNEL_GROUP_COLORS = { online: 'var(--blue)', onsite: 'var(--amber)', website: 'var(--teal)' };

export const LEAD_STATUSES = ['new', 'screened', 'assigned', 'contacted', 'meeting', 'qualified', 'disqualified'];
export const LEAD_STATUS_LABELS = {
  new: 'รอคัดกรอง',
  screened: 'รอกระจาย',
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
/* ── งบประมาณเป็นช่วงได้ (mig 0233) ────────────────────────────────────────
   ⭐ **ด่านเดียวใช้ทั้งฟอร์มและ API** ตามกติกา form-design-rules §2 — เงื่อนไขที่
   ปุ่มรู้แต่ฟอร์มไม่รู้ (หรือกลับกัน) คือจุดที่ผู้ใช้กดแล้วโดนตีกลับโดยไม่รู้ว่าเพราะอะไร
   `budget` = ต่ำสุด · `budgetMax` = สูงสุด (ว่าง = ระบุตัวเลขเดียว) */
export function leadBudgetError(form = {}) {
  const raw = (v) => (v === '' || v == null ? null : Number(v));
  const min = raw(form.budget);
  const max = raw(form.budgetMax);
  if (max == null) return '';
  if (!Number.isFinite(max) || max < 0) return 'งบประมาณสูงสุดต้องเป็นตัวเลขไม่ติดลบ';
  // ปลายบนลอย ๆ อ่านไม่ออกว่าแปลว่าอะไร — และทำให้การเรียงตามงบตกท้ายตารางเงียบ ๆ
  if (min == null) return 'กรอกงบประมาณสูงสุดแล้ว ต้องกรอกต่ำสุดด้วย';
  if (!Number.isFinite(min) || min < 0) return 'งบประมาณต่ำสุดต้องเป็นตัวเลขไม่ติดลบ';
  if (max < min) return 'งบประมาณสูงสุดต้องไม่น้อยกว่าต่ำสุด';
  return '';
}

/* ⭐ **คำเดียวที่ใช้แสดงงบของลีดทั้งระบบ** — ตาราง · หน้ารายละเอียด · ที่อื่นในอนาคต
   ห้ามให้แต่ละจอเขียนเงื่อนไข "มี budgetMax ไหม" เอง เพราะจอที่ลืมเช็คจะโชว์แค่
   ปลายล่างแล้วอ่านเหมือนงบน้อยกว่าจริง (เคสเดียวกับที่เคยเกิดกับป้ายอื่นในโปรเจกต์นี้)
   @param {(n: number) => string} money ตัวจัดรูปแบบเงินของจอนั้น (fmtMoney/fmtCompact) */
export function leadBudgetText(lead = {}, money = String, empty = 'ไม่ระบุ') {
  const min = lead.budget;
  const max = lead.budgetMax;
  if (min == null) return empty;
  if (max == null || Number(max) === Number(min)) return money(min);
  return `${money(min)} – ${money(max)}`;
}

/* ── วันติดตามต่อ (mig 0289) ───────────────────────────────────────────────
   ⭐ **ทุกการติดต่อต้องมีทางออก** (มติผู้ใช้ 2026-08-25) — `contacted` เคยเป็นสถานะ
   เดียวในเส้นทางที่ไม่มีนาฬิกา ลีดจึงนอนอยู่ได้ตลอดกาลโดยไม่มีอะไรทวง
   ⇒ `contact` และ `followup` **บังคับ** ระบุวันติดตามต่อ

   🪤 **ทางออกของเคส "ลูกค้าไม่สนใจแล้ว" ไม่ใช่การกรอกวันมั่ว ๆ** — `assigned` มี
   `disqualify` อยู่ในลิสต์อยู่แล้ว กดปิดตรงได้เลยโดยไม่ต้องผ่าน `contact`
   (เหตุผลที่คุยกับลูกค้าไปเขียนในช่องเหตุผลของ disqualify)

   ⭐ **ด่านเดียวใช้ทั้งฟอร์มและ API** ตามกติกา form-design-rules §2 — เงื่อนไขที่ปุ่ม
   รู้แต่ฟอร์มไม่รู้ (หรือกลับกัน) คือจุดที่ผู้ใช้กดแล้วโดนตีกลับโดยไม่รู้ว่าเพราะอะไร
   (ท่าเดียวกับ `leadBudgetError` ข้างล่าง) */
export const LEAD_FOLLOW_UP_ACTIONS = ['contact', 'followup'];

/** @returns ข้อความผิดพลาด หรือ '' ถ้าผ่าน */
export function leadFollowUpError(value) {
  if (value == null || value === '') return 'ต้องระบุวันติดตามต่อ';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return 'วันติดตามต่อไม่ถูกต้อง';
  return '';
}

/* ══ เหตุผลที่ลีดไม่ไปต่อ (mig 0290 · มติผู้ใช้ 2026-08-25) ═══════════════════
 *
 * ⭐ ที่มา: `disqualifiedReason` เป็นข้อความอิสระ และ **ไม่มีจอไหนอ่านมันเลย** —
 * เขียนที่ transition/route.js ที่เดียว ส่วน KPI มีแค่ % รวม ("ไม่ไปต่อ 32 จาก 113")
 * ตอบไม่ได้ว่าแพ้เพราะอะไร ⇒ เหตุผลที่ฝ่ายขายพิมพ์ทุกใบตลอดปีเป็นข้อมูลที่เขียนแล้วทิ้ง
 *
 * ⚠️ **รหัสคู่กับข้อความ ไม่ใช่แทนที่ข้อความ** — "งบไม่ถึง" / "งบไม่พอ" / "ลูกค้าบอกแพง"
 * คือเรื่องเดียวกันแต่ group by ไม่ได้ · ส่วนรายละเอียดที่ AE เขียนเองยังมีค่าเสมอ
 * (`disqualifiedReason` คงไว้ทุกประการ ไม่ได้ถูกแทนที่)
 *
 * 🔴 **เพิ่มรหัสใหม่ต้องแก้ 2 ที่พร้อมกัน** ไม่งั้นพังคนละแบบ:
 *   1. ลิสต์นี้ — ไม่เพิ่ม = ฟอร์มไม่มีตัวเลือก และ API ตีกลับ
 *   2. CHECK ของ `sales_leads.disqualifiedCode` (mig 0290) — ไม่เพิ่ม = **บันทึกไม่ได้
 *      ตอน update จริง ทั้งที่ฟอร์มโชว์ตัวเลือกให้เลือกแล้ว** (โรคเดียวกับ CHECK ของ
 *      `channel` ที่ต้องไล่แก้ตาม mig 0129 → 0252)
 *
 * `countable: false` = **ไม่อยู่ในตัวส่วน**ของอัตราแปลง ไม่ใช่แค่ไม่นับเป็นชนะ —
 * ลีดซ้ำกับข้อมูลติดต่อผิดไม่เคยเป็นโอกาสขาย นับเข้าไปแล้วอัตราแปลงจะต่ำลงตามปริมาณ
 * สแปมที่เข้ามา ซึ่งไม่ใช่ผลงานของใครเลย
 *
 * `detail: 'required'` = ต้องเขียนรายละเอียดด้วย — "อื่นๆ" ที่ไม่มีคำอธิบาย
 * นับเป็นข้อมูลไม่ได้ มันคือช่องที่ทำให้ทุกอย่างที่ไม่อยากคิดไหลมารวมกัน
 */
export const LEAD_LOST_REASONS = Object.freeze([
  { code: 'no_response', label: 'ติดต่อไม่ได้ / ลูกค้าเงียบ', countable: true },
  { code: 'budget', label: 'งบไม่ถึง', countable: true },
  { code: 'not_target', label: 'ไม่ตรงบริการ', countable: true },
  /* ⚠️ "ยังไม่พร้อม" ไม่ใช่แพ้ถาวร — ยังนับในตัวส่วนเพราะเป็นดีลที่เสียไปในงวดนี้จริง
     แต่รายงานควรแยกให้เห็น เพราะเป็นกองที่กลับมาถามใหม่ได้ ต่างจาก "เลือกเจ้าอื่น" */
  { code: 'timing', label: 'ยังไม่พร้อม ไว้ทีหลัง', countable: true },
  { code: 'competitor', label: 'เลือกเจ้าอื่น', countable: true },
  { code: 'duplicate', label: 'ลีดซ้ำ', countable: false },
  { code: 'invalid', label: 'ข้อมูลติดต่อผิด / สแปม', countable: false },
  { code: 'other', label: 'อื่นๆ', countable: true, detail: 'required' },
]);

export const LEAD_LOST_CODES = LEAD_LOST_REASONS.map((r) => r.code);
export const LEAD_LOST_LABELS = Object.fromEntries(LEAD_LOST_REASONS.map((r) => [r.code, r.label]));
/* ⚠️ **หามาจากลิสต์ ไม่ใช่สะกดซ้ำ** — สองที่ที่ต้องตรงกันเองคือสองที่ที่จะเพี้ยนหากัน
   ผู้อ่านหลักคือ `leadOutcome` (ตัวกรองตัวส่วนของอัตราแปลง) */
export const LEAD_LOST_UNCOUNTABLE = LEAD_LOST_REASONS.filter((r) => !r.countable).map((r) => r.code);

const LOST_DETAIL_REQUIRED = new Set(
  LEAD_LOST_REASONS.filter((r) => r.detail === 'required').map((r) => r.code),
);

/** ด่านเดียวใช้ทั้งฟอร์มและ API (form-design-rules §2)
 *  @returns ข้อความผิดพลาด หรือ '' ถ้าผ่าน */
export function leadLostReasonError({ code, detail } = {}) {
  if (!code) return 'ต้องเลือกเหตุผลที่ไม่ไปต่อ';
  if (!LEAD_LOST_CODES.includes(code)) return 'เหตุผลที่ไม่ไปต่อไม่ถูกต้อง';
  if (LOST_DETAIL_REQUIRED.has(code) && !String(detail || '').trim()) {
    return 'เลือก "อื่นๆ" แล้วต้องเขียนรายละเอียดด้วย';
  }
  return '';
}

/** คำที่ใช้แสดงเหตุผลของลีดที่ปิดแล้ว — ที่เดียวสำหรับทุกจอ
 *  ⚠️ ใบเก่าก่อน mig 0290 ไม่มีรหัส เหลือแต่ข้อความอิสระ — ต้องยังอ่านออก
 *  ไม่ใช่ขึ้น "ไม่ระบุ" ทั้งที่ AE เขียนเหตุผลไว้ครบ */
/** สรุป "แพ้เพราะอะไร" — ที่เดียวที่นับ
 *
 *  ⚠️ **เรียงตามลิสต์ ไม่ใช่ตามจำนวน** — รายงานที่สลับลำดับแถวทุกเดือนอ่านเทียบข้ามเดือน
 *  ไม่ได้ · แถวที่เป็น 0 ยังต้องขึ้น เพราะ "เดือนนี้ไม่มีใครแพ้เพราะราคาเลย" คือข้อมูล
 *  ไม่ใช่ความว่างเปล่า (กติกาเดียวกับวันที่ไม่มีลีดในกราฟรายวัน · IS-26080023)
 *
 *  ⚠️ ใบเก่าก่อน mig 0290 ไม่มีรหัส — เข้าแถว `unknown` แยกต่างหาก **ไม่ยัดเข้า 'other'**
 *  ("อื่นๆ" คือสิ่งที่ AE เลือกเอง ส่วน `unknown` คือของที่ระบบไม่เคยถาม สองอย่างนี้
 *  ปนกันเมื่อไรจะอ่านว่า "อื่นๆ" พุ่งขึ้นทั้งที่ไม่มีใครเลือกมันเพิ่มเลย)
 *
 *  @param rows ลีดของงวดที่เลือก (ทุกสถานะ — ฟังก์ชันกรองเอง)
 */
export function lostReasonRollup(rows = []) {
  const lost = (rows || []).filter((lead) => lead?.status === 'disqualified');
  const counts = new Map(LEAD_LOST_CODES.map((code) => [code, 0]));
  let unknown = 0;
  for (const lead of lost) {
    const code = lead?.disqualifiedCode;
    if (counts.has(code)) counts.set(code, counts.get(code) + 1);
    else unknown += 1;
  }
  const reasons = LEAD_LOST_REASONS.map(({ code, label, countable }) => ({
    code, label, countable, count: counts.get(code) || 0,
  }));
  const countedTotal = reasons.filter((r) => r.countable).reduce((sum, r) => sum + r.count, 0) + unknown;
  return {
    total: lost.length,
    // ⚠️ ตัวหารของคอลัมน์ "สัดส่วน" = เฉพาะใบที่นับเป็นแพ้จริง ไม่ใช่ทุกใบที่ปิด
    // ไม่งั้นสแปม 7 ใบจะไปกดสัดส่วนของเหตุผลจริงทุกแถวให้ดูเล็กลง
    countedTotal,
    excluded: lost.length - countedTotal,
    unknown,
    reasons,
  };
}

export function leadLostText(lead = {}, empty = 'ไม่ระบุ') {
  const label = LEAD_LOST_LABELS[lead.disqualifiedCode] || null;
  const detail = String(lead.disqualifiedReason || '').trim();
  if (!label) return detail || empty;
  return detail ? `${label} — ${detail}` : label;
}

export const LEAD_EDIT_LOCKED_STATUSES = ['qualified', 'disqualified'];
export const LEAD_DELETE_LOCKED_STATUSES = ['contacted', 'meeting', 'qualified', 'disqualified'];

// ── ใครเห็นลีดแค่ไหน (เฟส C) ─────────────────────────────────────────────
//   supervisor/admin/viewer/executive → ทุกใบ · marketing → ทุกใบ (ทีม intake
//   เห็นคิวรวมเพื่อไม่กรอกซ้ำ) · senior_ae/ac → **เฉพาะที่คัดกรองมาเข้าทีมแล้ว**
//   · ae → ที่ถูกมอบหมายให้ตัวเอง **หรือที่ตัวเองกรอก** · role อื่น (rd ฯลฯ) → ไม่เห็นเลย
//
// ⚠️ senior_ae/ac **ไม่เห็นคิวกลาง (`new`)** — ลีดที่ยังไม่คัดกรองมี team = null
// ซึ่ง `.in('team', …)` ไม่คืนให้ (บรรทัดคอมเมนต์เดิมเขียนว่าเห็น "คิวกลาง (new)" ด้วย
// ซึ่งไม่ตรงกับโค้ดมาตั้งแต่ต้น — แก้คำอธิบายให้ตรงของจริง 2026-08-04)
// `canEditLead` ยังยอมให้ senior_ae แก้ลีดที่ยังไม่มีทีม (`!lead.team`) อยู่ตามเดิม —
// แต่ **ไปไม่ถึงแล้ว**: ทั้ง GET / PATCH / DELETE ผ่านด่าน `inLeadScope` ก่อนเสมอ
// ซึ่งบังคับ `hasTeam(user, lead.team)` สำหรับ senior_ae/ac (ทีมของคน ∩ ทีมของลีด)
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
    // อยู่หลายทีมได้ ⇒ เห็นคิวของทุกทีมที่สังกัด (in ไม่ใช่ eq)
    return whereTeamIn(query, user);
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
  if (role === 'senior_ae' || role === 'ac') return hasTeam(user, lead.team);
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
  if (role === 'senior_ae') return !lead.team || hasTeam(user, lead.team);
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
  if ((role === 'senior_ae' || role === 'ac') && hasTeam(user, lead.team)) return true;
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
// ⭐ `followup` = **ติดตามครั้งที่สองขึ้นไป ไม่ขยับสถานะ** (มติผู้ใช้ 2026-08-25)
// 🐞 ของเดิมบันทึกการติดต่อซ้ำไม่ได้เลย — `contacted` ไม่มี `contact` ในลิสต์ ⇒ AE ที่โทร
// ตามรอบสองกดปุ่มไม่ได้ ต้องไปเขียนในเธรดกลางแทน ซึ่งไม่มีวันที่ให้ระบบทวงต่อ
// ⚠️ **ไม่เปิด `contacted → contact`** ทั้งที่ดูเหมือนแก้ง่ายกว่า — `contact` แปลว่า
// สถานะไปเป็น `contacted` (ดู TRANSITION_TO_STATUS) ⇒ ใช้จาก `meeting` แล้วลีดถอยหลัง
// จากที่นัดไว้ · `followup` ปลายทางเป็น null จึงใช้ได้ทั้งสองสถานะโดยไม่ดึงใครถอย
export const LEAD_TRANSITIONS = {
  new: ['screen', 'disqualify'],
  screened: ['assign', 'bounce', 'disqualify'],
  assigned: ['contact', 'reassign', 'bounce', 'disqualify'],
  contacted: ['followup', 'meeting', 'create_deal', 'reassign', 'bounce', 'disqualify'],
  meeting: ['followup', 'meeting', 'create_deal', 'reassign', 'bounce', 'disqualify'],
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
  /* ⭐ `followup` = **ติดตามต่อ ไม่เปลี่ยนขั้น** — null โดยเจตนา ท่าเดียวกับ reassign
     ⚠️ แมปเป็น 'contacted' เมื่อไร = ลีดที่นัดประชุมแล้วถอยกลับไป "ติดต่อแล้ว"
     ทุกครั้งที่โทรตาม ซึ่งเป็นเหตุผลเดียวกับที่ไม่เปิด `meeting → contact` */
  followup: null,
  /* ⭐ `reassign` = **เปลี่ยนมือ ไม่เปลี่ยนขั้น** (มติผู้ใช้ 2026-08-20) — ค่า null
     โดยเจตนา: ผู้เรียกต้องคงสถานะเดิมไว้ (`TRANSITION_TO_STATUS[action] ?? lead.status`)
     ⚠️ แมปเป็น 'assigned' เมื่อไร = ลีดที่ติดต่อ/นัดไปแล้วถอยกลับไป "รอติดต่อกลับ"
     ทุกครั้งที่ย้ายเจ้าของ ⇒ งานที่ทำไปแล้วหายจากผัง Funnel และปุ่มก้าวถัดไปเพี้ยน */
  reassign: null,
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

/* จำนวน id ต่อหนึ่ง `.in()` — PostgREST ยัดลิสต์ลง **query string** ทั้งก้อน
   id ของลีดยาว ~19 ตัวอักษร ⇒ 500 ใบ ≈ 10KB · ทั้งปี ≈ 30KB ซึ่งเกินลิมิตความยาว URL
   ของ PostgREST/reverse proxy · 200 ใบ ≈ 4KB ปลอดภัยและตรงกับที่ backfill-projects ใช้ */
export const LEAD_ID_CHUNK = 200;

/** ซอย id เป็นก้อนเท่า ๆ กันสำหรับ `.in()` — คืน [] ถ้าไม่มี id (ผู้เรียกจะได้ไม่ต้องยิง query) */
export function chunkLeadIds(ids = [], size = LEAD_ID_CHUNK) {
  const clean = (ids || []).filter(Boolean);
  const step = Number(size) > 0 ? Math.floor(Number(size)) : LEAD_ID_CHUNK;
  const out = [];
  for (let i = 0; i < clean.length; i += step) out.push(clean.slice(i, i + step));
  return out;
}

// SLA "ภายใน 1 วันทำการ": จำนวนวันทำการที่ผ่านไประหว่าง 2 เวลา ≤ 1
// (เกิดวันเดียวกัน = 0; ข้าม 1 วันทำการ = 1 → ยังทัน; ข้ามเสาร์-อาทิตย์/วันหยุดไม่นับ)
//
// 🐞 เดิมหาวันด้วย `String(iso).slice(0, 10)` = **วันแบบ UTC** ⇒ ทุกเหตุการณ์ที่เกิด
// ช่วง 00:00–07:00 ตามเวลาไทยถูกบันทึกเป็นวันก่อนหน้า นาฬิกา SLA เริ่มเดินเร็วไปหนึ่งวัน
// (ลีดดึกจาก LINE/Meta/Typeform มีจริงทุกวัน) · ที่แย่กว่าคือ **การ์ดค้างคิวข้าง ๆ ใช้
// วันไทยอยู่แล้ว** (businessDaysWaiting → businessDayKey) ⇒ ฟีเจอร์เดียวมีสองนาฬิกา
// เดินคนละเขตเวลา ตัวเลข % กับ "ค้างกี่วัน" จึงเถียงกันเองได้โดยไม่มีอะไรฟ้อง
// (ตรวจเจอ 2026-08-11 · ตอนนั้นทำให้ SLA กระจายเพี้ยนไป 1 ใบจาก 127)
//
// ⇒ ทั้งระบบใช้ `businessDayKey` ตัวเดียวเป็นนาฬิกา ห้ามหาวันจาก timestamp ด้วยวิธีอื่น
export function slaBusinessDays(fromIso, toIso, holidays) {
  const from = businessDayKey(fromIso);
  const to = businessDayKey(toIso);
  if (!from || !to) return null;
  return countBusinessDays(from, to, holidays);
}
export function slaHit(fromIso, toIso, holidays, limitDays = 1) {
  const d = slaBusinessDays(fromIso, toIso, holidays);
  // ค่าติดลบ = ข้อมูลเวลาผิดลำดับ (to ก่อน from เช่น firstContactAt ค้างจากรอบก่อน) —
  // อย่านับเป็น "ทัน" กันเคส KPI พองจากลีดที่ตีกลับแล้วมอบใหม่ (ต้นเหตุแก้ที่ bounce แล้ว)
  if (d == null || d < 0) return null;
  return d <= limitDays;
}

/** SLA ของ "หนึ่งด่าน" — คืน { checked, hit } ของลีดที่**ผ่านด่านนั้นไปแล้ว**
 *
 *  ทั้งสามด่านของเส้นทางลีดวัดด้วยกติกาเดียวกันเป๊ะ ต่างกันแค่คู่ timestamp:
 *    คัดกรอง   createdAt  → firstScreenedAt (หัวหน้าฝ่ายขายเลือกทีม)
 *    กระจาย    screenedAt → firstAssignedAt (Senior AE เลือก AE ครั้งแรกของรอบ)
 *    ติดต่อกลับ assignedAt → firstContactAt  (AE ติดต่อลูกค้าครั้งแรก)
 *
 *  ⚠️ สองด่านบนใช้คอลัมน์ "ครั้งแรก" อีกด่านใช้คอลัมน์ของ **เจ้าของปัจจุบัน** —
 *  ทั้งหมดล้างตอนตีกลับ (mig 0234/0273) โดยเจตนาคนละอย่าง:
 *  · rework ไม่ลบผลงานคัดกรอง/กระจายรอบแรก (คนมอบทันเวลาไปแล้ว ห้ามถูกลบผลงาน
 *    เพราะมีการเปลี่ยนผู้รับผิดชอบทีหลัง — mig 0273)
 *  · แต่คนที่รับใบต่อต้องเริ่มจับเวลาตอนที่ใบมาถึงมือเขา ไม่ใช่ของเจ้าของคนก่อน
 *
 *  ⚠️ `checked` นับเฉพาะใบที่มี **ทั้งสองเวลา** — ใบที่ยังไม่ถึงด่านถัดไปเป็น "ค้าง"
 *  ไม่ใช่ "พลาด" (ของค้างนับแยกจาก countLeadsByStatus ซึ่งดูสถานะ ณ ตอนนี้)
 *  ⚠️ `hit` เทียบ `=== true` ไม่ใช่ truthy — slaHit คืน null เมื่อข้อมูลเวลาผิดลำดับ
 *  ซึ่งต้องไม่ถูกนับเป็นทัน (ดูคอมเมนต์ใน slaHit)
 *
 *  แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะกติกาอยู่ในไฟล์ route แล้วเทสต์เข้าไม่ถึง
 *  (ท่าเดียวกับ meetingTimesSinceBounce / pickNextMeetingAt ข้างบน)
 */
export function slaStage(rows, fromKey, toKey, holidays, limitDays = 1) {
  const checked = (rows || []).filter((l) => l?.[fromKey] && l?.[toKey]);
  const hit = checked.filter((l) => slaHit(l[fromKey], l[toKey], holidays, limitDays) === true);
  return { checked: checked.length, hit: hit.length };
}

/* ── ป้ายของการ์ด SLA — ที่เดียวสำหรับสองจอ ────────────────────────────────
   แถบ KPI ของหน้าคิวลีดกับแท็บ "KPI ลีด" แสดงตัวเลขชุดเดียวกันจาก API ตัวเดียวกัน
   แต่เคยสะกดป้ายเอง**คนละที่** ⇒ #1171 แก้คำว่าของค้างที่แท็บ KPI แล้วหน้าคิวลีด
   ไม่ตาม สองจอเลยเรียกเลขตัวเดียวกันคนละชื่ออยู่พักหนึ่ง

   ⚠️ `pendingLabel` ของด่านคัดกรองต่างจากอีกสองด่าน **โดยเจตนา** — ของค้างขั้นนี้คือ
   คิวกลางที่ยังไม่มีทีม API จึงนับโดยไม่ใส่ตัวกรองทีม (ดู countLeadsByStatus ใน
   /api/sales-planning/leads/kpi) เลือกทีมอยู่แล้วเห็นเลขทั้งบริษัทข้าง ๆ % ของทีม
   โดยไม่มีอะไรบอก = อ่านผิดแน่นอน

   ไอคอนไม่อยู่ในลิสต์นี้เพราะเป็น JSX — แต่ละจอ map เอาเองจาก `key` (lib ต้องไม่ import react) */
export const LEAD_SLA_STAGES = [
  { key: 'screen', label: 'SLA คัดกรอง ≤1 วันทำการ', pendingLabel: 'ค้างทั้งบริษัท' },
  { key: 'assign', label: 'SLA กระจาย ≤1 วันทำการ', pendingLabel: 'ค้างตอนนี้' },
  { key: 'contact', label: 'SLA ติดต่อกลับ ≤1 วันทำการ', pendingLabel: 'ค้างตอนนี้' },
];

/** โน้ตใต้ตัวเลขของการ์ด SLA: `ทัน x/y · <ป้ายของค้าง> z`
 *
 *  ⚠️ `pending` ที่เป็น null = **นับไม่ได้** ต้องขึ้น "-" ห้ามกลบเป็น 0 — 0 อ่านว่า
 *  "ไม่มีของค้าง" ซึ่งเป็นคำตอบที่ดูปกติจนไม่มีใครสงสัย (ดู slaPendingTone)
 *  ส่วน hit/checked กลบเป็น 0 ได้ เพราะ 0/0 อ่านออกอยู่แล้วว่ายังไม่มีใบไหนถึงด่านนี้
 *
 *  ⚠️ สั้นเท่านี้เพราะ `.ui-metric em` เป็น nowrap + ellipsis — ยาวกว่านี้โดนตัดกลางคัน
 *  (แถบหน้าคิวลีดมีห้าช่อง ยิ่งแคบ) */
export function leadSlaNote(stage = {}, pendingLabel = 'ค้างตอนนี้') {
  return `ทัน ${stage.hit ?? 0}/${stage.checked ?? 0} · ${pendingLabel} ${stage.pending ?? '-'}`;
}

/* ══ "ลีดใบนี้ไปถึงไหน" — คำตอบเดียวของทั้งระบบ ══════════════════════════════
 *
 * ทำไมต้องมี: คำถามเดียวกันถูกตอบด้วยโค้ดคนละชุด **สี่ที่** และทุกที่อ่านจากคอลัมน์ดิบ
 *   1. `funnel` ใน /api/sales-planning/leads/kpi   `rows.filter(l => l.meetingAt)`
 *   2. `channelRollup` ข้างล่างไฟล์นี้              `if (lead.meetingAt) row.meeting += 1`
 *   3. `byAssignee` ใน route เดียวกัน               `if (l.meetingAt) b.meetings += 1`
 *   4. `myQueue`                                    `status === 'meeting' && meetingAt`
 * "ติดต่อแล้ว" (`firstContactAt`) ซ้ำสามที่ · "เปิดลูกค้า" (`status === 'qualified'`)
 * ซ้ำสามที่ เหมือนกัน · เปลี่ยนนิยามทีหนึ่งต้องไล่แก้สิบเอ็ดจุด ลืมจุดเดียวได้ตัวเลข
 * สองตัวบนจอเดียวกันที่ขัดกันเองโดยไม่มีอะไรฟ้อง — **เกิดมาแล้วจริง**: ส.ค. 2026
 * ผัง Funnel ขึ้น "มอบหมายแล้ว 56" ขณะที่ตาราง AE ข้างล่างรวมได้ 54
 *
 * 🔴 **คอลัมน์บนแถวลีดไม่ใช่ประวัติ — มันคือสถานะของรอบปัจจุบัน**
 * `bounce` ล้าง `meetingAt` และ `firstContactAt` ทิ้งทั้งคู่ (ดู transition/route.js)
 * ⇒ ลีดที่นัดประชุมไปแล้วจริง ๆ แล้วถูกตีกลับ จะ **หายจากตัวเศษ** ของอัตราแปลง
 * ทั้งที่นัดนั้นเกิดขึ้นจริงและมีคนไปนั่งประชุมมาแล้ว · ยิ่งมีการตีกลับอัตโนมัติเมื่อไร
 * ตัวเลขนี้จะถูกกลไกของระบบเองลบทิ้งเป็นประจำ
 * ⇒ ตัวชี้วัดต้องอ่านจาก `lead_events` ซึ่งไม่เคยถูกล้าง (ลบเฉพาะตอนลบลีดทั้งใบ)
 *
 * ⚠️ **`events: null` กับ `events: []` ไม่เหมือนกัน** — `null` = ผู้เรียกไม่ได้อ่าน
 * ประวัติมา (ถอยไปใช้คอลัมน์) · `[]` = อ่านมาแล้วไม่มีเหตุการณ์เลย (เชื่อตามนั้น)
 * ถ้าปล่อยให้ `[]` ถอยไปใช้คอลัมน์เงียบ ๆ จะได้ระบบที่ "อ่านประวัติแล้วแต่ตอบเหมือน
 * ไม่ได้อ่าน" ซึ่งเป็นความต่างที่ไม่มีวันมีใครสังเกตเห็นจนกว่าตัวเลขจะเพี้ยน
 * ⇒ คืน `basis` มาด้วยเสมอ จอที่ผสมสองแหล่งบนตารางเดียวจะได้จับได้ (ดู leadOutcomeTotals)
 */

/* ⚠️ กติกา "เหตุผลไหนไม่นับเข้าตัวส่วน" อยู่ที่ `LEAD_LOST_REASONS` ข้างบนที่เดียว
   (`countable: false`) — `LEAD_LOST_UNCOUNTABLE` หามาจากลิสต์นั้น ไม่ได้สะกดซ้ำ
   ⚠️ ใบเก่าที่ยังไม่มี `disqualifiedCode` คืน `undefined` แล้วถูกนับเป็น countable
   ตามเดิม (ปลอดภัยกว่าเดา) — ดู mig 0289 ที่ตั้งใจไม่ backfill */

/* เหตุการณ์ที่แปลว่า "ได้คุยกับลูกค้าแล้ว" — `followup` คือการติดต่อครั้งที่ 2 ขึ้นไป
   (ยังไม่มีใน CHECK ของ lead_events วันนี้ ใส่ไว้ให้พร้อมก่อนเพื่อไม่ต้องกลับมาแก้สองรอบ) */
const CONTACT_KINDS = new Set(['contact', 'followup']);

const hasKind = (events, test) => (events || []).some((e) => test(e?.kind));

/**
 * @param lead   แถวจาก `sales_leads`
 * @param events แถวจาก `lead_events` ของลีดใบนี้ · `null` = ไม่ได้อ่านมา (ใช้คอลัมน์แทน)
 * @returns {{ basis: 'events'|'row', reachedContact: boolean, reachedMeeting: boolean,
 *            won: boolean, lost: boolean, countable: boolean }}
 */
export function leadOutcome(lead = {}, events = null) {
  const status = lead?.status || null;
  /* ชนะ/แพ้อ่านจากสถานะเสมอ แม้จะมีประวัติ — สองสถานะนี้เป็นปลายทางที่ไม่มีทางถอย
     (`LEAD_TRANSITIONS.qualified` เหลือแค่ `create_deal` · `disqualified` ว่าง)
     คอลัมน์จึงไม่มีวันถูกล้างเหมือน meetingAt/firstContactAt */
  const won = status === 'qualified';
  const lost = status === 'disqualified';

  const code = lead?.disqualifiedCode || null;
  // ไม่ใช่ใบที่ปิดไป = อยู่ในตัวส่วนเสมอ (ยังเดินอยู่ก็คือยังมีโอกาส)
  const countable = !lost || !LEAD_LOST_UNCOUNTABLE.includes(code);

  if (events == null) {
    return {
      basis: 'row',
      /* ⚠️ ใบที่ **ถูกตีกลับ** ตอบผิดตรงนี้ — คอลัมน์ถูกล้างไปแล้ว · ไม่ใช่บั๊กของฟังก์ชัน
         แต่เป็นเพดานของแหล่งข้อมูล ผู้เรียกที่ต้องการเลขที่ถูกต้องต้องส่ง events มา */
      reachedContact: !!lead?.firstContactAt,
      reachedMeeting: !!lead?.meetingAt,
      won, lost, countable,
    };
  }

  /* ⚠️ **ไม่ตัดที่ bounce** — ต่างจาก `meetingTimesSinceBounce` ข้างบนโดยเจตนา
     ตัวนั้นตอบ "นัดถัดไปที่ต้องไป" (ของรอบปัจจุบัน) ตัวนี้ตอบ "เคยไปถึงขั้นนัดไหม"
     (ตลอดกาล) · สองคำถามนี้หน้าตาเหมือนกันจนเอาโค้ดมาใช้ร่วมกันได้ ห้ามทำ */
  return {
    basis: 'events',
    reachedContact: hasKind(events, (k) => CONTACT_KINDS.has(k)),
    reachedMeeting: hasKind(events, (k) => k === 'meeting'),
    won, lost, countable,
  };
}

/* เหตุการณ์ที่ `leadOutcome` ต้องใช้จริง — ดึงมาแค่นี้พอ ไม่ต้องลากประวัติทั้งก้อน
   (`won`/`lost` อ่านจากสถานะบนแถว ไม่ได้อ่านจากประวัติ) */
export const LEAD_OUTCOME_EVENT_KINDS = ['contact', 'followup', 'meeting'];

/** ผลของลีดทั้งชุด — **ทุกใบต้องใช้แหล่งเดียวกัน**
 *
 *  🪤 **all-or-nothing โดยเจตนา** — `eventsByLead = null` แปลว่าอ่านประวัติไม่ได้
 *  (query ล้ม/ก้อนใดก้อนหนึ่งพัง) ⇒ ถอยไปใช้คอลัมน์ **ทั้งกระดาน** ไม่ใช่เฉพาะใบที่พลาด
 *  ปล่อยให้บางใบอ่านจากประวัติ บางใบอ่านจากคอลัมน์ = ตัวเลขผสมสองนิยามในตารางเดียว
 *  ซึ่งไม่มีทางอธิบายได้ว่าทำไมสองแถวถึงนับไม่เหมือนกัน · `basis` ที่ `leadOutcomeTotals`
 *  คืนมาจะเป็น 'row' ให้หน้าจอขึ้นคำเตือนได้
 *
 *  ⚠️ ใบที่ **ไม่มีเหตุการณ์เลย** ต้องได้ `[]` ไม่ใช่ `undefined` — `[]` = อ่านแล้วว่าง
 *  (ลีดที่ยังไม่เคยติดต่อ) ส่วน `undefined` จะถอยไปอ่านคอลัมน์เงียบ ๆ แล้วใบนั้น
 *  จะนับคนละนิยามกับเพื่อนในตารางเดียวกัน
 */
export function leadOutcomesFor(rows = [], eventsByLead = null) {
  return (rows || []).map((lead) => leadOutcome(
    lead,
    eventsByLead ? (eventsByLead.get?.(lead?.id) ?? []) : null,
  ));
}

/** รวมผลของลีดหลายใบเป็นตัวเลขชุดเดียว — ที่เดียวที่หาร
 *
 *  🐞 สูตรอัตราแปลงเคยถูกเขียนสองที่: หน้าคิวลีดเขียน `(qualified / total) * 100` ตรง ๆ
 *  ใน JSX ส่วนแท็บ KPI ใช้ helper `pct()` ของตัวเอง — วันนี้ตรงกันเพราะคนเขียนระวัง
 *  ไม่ใช่เพราะโค้ดบังคับ
 *
 *  ⭐ **ตัวเศษ = เคยนัด _หรือ_ เปิดดีล** ไม่ใช่ "เคยนัด" อย่างเดียว —
 *  `LEAD_TRANSITIONS.contacted` มี `create_deal` อยู่ด้วย ⇒ ปิดดีลได้โดยไม่ต้องนัด
 *  (ข้อมูลจริง ส.ค. 2026: นัด 2 แต่เปิดลูกค้า 4) · นับแค่ "เคยนัด" เมื่อไร
 *  **ผลลัพธ์ที่ดีที่สุดจะได้คะแนนศูนย์**
 *
 *  ⚠️ `pct` คืน `null` เมื่อตัวส่วนเป็น 0 ไม่ใช่ 0 — "0%" อ่านว่าทำไม่ได้เลย
 *  ส่วน "ยังไม่มีข้อมูล" คือคนละเรื่อง (กติกาเดียวกับ slaPendingTone)
 *
 *  @param outcomes ผลจาก `leadOutcome` ของลีดแต่ละใบ
 */
export function leadOutcomeTotals(outcomes = []) {
  const list = outcomes || [];
  const countable = list.filter((o) => o?.countable);
  const reached = countable.filter((o) => o.reachedMeeting || o.won);
  return {
    total: list.length,
    countable: countable.length,
    excluded: list.length - countable.length,
    contacted: countable.filter((o) => o.reachedContact).length,
    meeting: countable.filter((o) => o.reachedMeeting).length,
    won: countable.filter((o) => o.won).length,
    lost: countable.filter((o) => o.lost).length,
    reached: reached.length,
    // เปิดดีลโดยไม่ผ่านนัด — แยกออกมาเพราะเป็นตัวเลขที่อธิบายว่าทำไมตัวเศษ > "นัด"
    wonWithoutMeeting: countable.filter((o) => o.won && !o.reachedMeeting).length,
    pct: countable.length ? (reached.length / countable.length) * 100 : null,
    /* 🪤 ตารางที่ผสมสองแหล่งบนจอเดียวกันคือจุดที่ตัวเลขจะขัดกันเอง — ผู้เรียกเช็คค่านี้
       แล้วขึ้นคำเตือนได้ ไม่ต้องรอให้ผู้ใช้มาทักว่าเลขไม่ตรง */
    basis: list.length && list.every((o) => o?.basis === 'events') ? 'events'
      : list.some((o) => o?.basis === 'events') ? 'mixed' : 'row',
  };
}

/** สรุปลีดรายช่องทาง — ตอบ "เข้ามาทางไหน แล้วติดต่อ/นัด/เปิดลูกค้าได้เท่าไร"
 *
 *  คืนสองชุดในแถวเดียวกันเพราะตอบคนละคำถาม:
 *  · **Funnel** `count` · `contacted` · `meeting` · `qualified` — สะสม ซ้อนทับกันได้
 *    (ใบที่เปิดลูกค้าแล้วก็ยังนับใน contacted ด้วย) ใช้ตอบ "ทำไปถึงไหน"
 *  · **สถานะตอนนี้** `won` · `lost` · `talking` · `untouched` — **ไม่ซ้อนกัน**
 *    ใบหนึ่งอยู่ได้ช่องเดียว รวมกันเท่ากับ `count` เป๊ะ ใช้วาดแท่งสัดส่วนได้ตรง ๆ
 *
 *  ⚠️ จัดช่องสถานะตามลำดับความสำคัญ ไม่ใช่ตาม timestamp: ปิดแล้ว (qualified/disqualified)
 *  มาก่อนเสมอ แล้วค่อยดูว่าเคยติดต่อไหม · ถ้าไล่จาก firstContactAt ก่อน ใบที่ปิดไปแล้ว
 *  จะไปโผล่ในช่อง "คุยอยู่" ด้วย แล้วผลรวมเกินจำนวนลีดจริง
 */
/** @param outcomeOf Map(leadId → ผลจาก `leadOutcome`) · ไม่ส่ง = คำนวณจากคอลัมน์เอง
 *  ⚠️ ผู้เรียกที่มีประวัติลีดอยู่แล้วต้องส่งมา ไม่งั้นตารางนี้จะนับจากคอลัมน์
 *  ขณะที่การ์ดข้าง ๆ นับจากประวัติ = สองนิยามบนจอเดียวกัน */
export function channelRollup(rows, outcomeOf = null) {
  const map = new Map();
  for (const lead of rows || []) {
    const channel = lead?.channel || 'unknown';
    if (!map.has(channel)) {
      map.set(channel, {
        channel, group: channelGroupOf(channel),
        count: 0, contacted: 0, meeting: 0, qualified: 0, disqualified: 0,
        won: 0, lost: 0, talking: 0, untouched: 0,
      });
    }
    const row = map.get(channel);
    /* ⭐ นิยาม "ไปถึงไหน" มาจาก `leadOutcome` ที่เดียว — เดิมเขียนเงื่อนไขเองตรงนี้
       แล้วมีอีกสองที่ใน KPI route ที่เขียนเงื่อนไขเดียวกันซ้ำ (funnel · byAssignee)
       ⚠️ ส่งเป็นแถวล้วน (ไม่มี events) = อ่านจากคอลัมน์ตามเดิมทุกประการ ตัวเลขไม่ขยับ
       การเปลี่ยนไปอ่านประวัติเป็นการเปลี่ยน **นิยาม** ซึ่งต้องเป็นคอมมิตของตัวเอง
       ไม่งั้นตัวเลขขยับแล้วไม่มีใครแยกออกว่าเพราะรวมโค้ดหรือเพราะเปลี่ยนนิยาม */
    const outcome = outcomeOf?.get(lead?.id) || leadOutcome(lead);
    row.count += 1;
    if (outcome.reachedContact) row.contacted += 1;
    if (outcome.reachedMeeting) row.meeting += 1;
    /* ⚠️ ช่องสถานะ (won/lost/talking/untouched) **ไม่ซ้อนกัน** ต่างจากช่อง funnel ข้างบน
       ลำดับความสำคัญเดิมทุกประการ: ปิดแล้วมาก่อน แล้วค่อยดูว่าเคยติดต่อไหม */
    if (outcome.won) { row.qualified += 1; row.won += 1; }
    else if (outcome.lost) { row.disqualified += 1; row.lost += 1; }
    else if (outcome.reachedContact) row.talking += 1;
    else row.untouched += 1;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel));
}

/** รวม "ค้างตอนนี้" รายคนเข้ากับสรุปผลงานรายเดือนของ AE
 *
 *  ⚠️ สองชุดนี้ **คนละขอบเขตเวลา** โดยเจตนา:
 *  · `monthly` = ผลงานของลีดที่เข้ามาในเดือนที่เลือก
 *  · `pendingByAssignee` = ใบที่ยังรอ AE ติดต่อ **ณ ตอนนี้** ไม่ผูกกับเดือน
 *    (ใบที่ค้างข้ามเดือนมาคือใบที่ต้องทวงที่สุด ตัดด้วยเดือนแล้วมันหาย)
 *
 *  🐞 ถ้าแค่เติมเลขลงแถวที่มีอยู่ จะพลาดเคสสำคัญที่สุด: **AE ที่เดือนนี้ไม่ได้รับลีดใหม่เลย
 *  แต่ยังกองของเก่าไว้** จะไม่มีแถวใน `monthly` ⇒ หายจากตารางทั้งที่เป็นคนที่ต้องตาม
 *  ⇒ เติมแถวให้คนกลุ่มนี้ด้วย โดยคอลัมน์ผลงานรายเดือนเป็น 0 ตามจริง
 *
 *  เรียงตามของค้างมากสุดก่อน — ตารางนี้มีไว้ตอบ "ตอนนี้ต้องไปตามใคร"
 */
export function withAssigneePending(monthly, pendingByAssignee, metaOf = {}) {
  const pending = pendingByAssignee || {};
  const meta = metaOf || {};
  const rows = (monthly || []).map((a) => ({ ...a, pending: pending[a.assigneeId] || 0 }));
  const seen = new Set(rows.map((a) => a.assigneeId));
  for (const [assigneeId, count] of Object.entries(pending)) {
    if (seen.has(assigneeId) || !count) continue;
    rows.push({
      assigneeId,
      // ชื่อ/ทีมมาจากใบที่เขาถือค้างอยู่ — คนกลุ่มนี้ไม่มีแถวของเดือนให้อ่าน
      name: meta[assigneeId]?.name || 'ไม่ระบุ',
      team: meta[assigneeId]?.team || null,
      assigned: 0, contacted: 0, slaHit: 0, meetings: 0, qualified: 0,
      pending: count,
    });
  }
  return rows.sort((a, b) => b.pending - a.pending || b.assigned - a.assigned);
}

/** โทนของการ์ด SLA — ตัดสินจาก "ตอนนี้ค้างกี่ใบ" ไม่ใช่จากเปอร์เซ็นต์ที่ทำได้
 *
 *  ⚠️ `pending == null` = **นับไม่ได้** (countLeadsByStatus ล้ม) ไม่ใช่ "ไม่มีของค้าง"
 *  🐞 ทั้งหน้าคิวลีดและแท็บ KPI เคยเขียน `(pending ?? 0) ? "warning" : "good"` ซึ่งกลบ
 *  null เป็น 0 แล้วการ์ดขึ้น**เขียว**ว่าเรียบร้อย ทั้งที่ตัวเลขข้างในโชว์ "-" อยู่โต้ง ๆ
 *  — เขียวคือคำตอบที่ดูปกติจนไม่มีใครสงสัย · ไม่รู้คำตอบ = ไม่ตัดสิน (คืน undefined)
 *
 *  อยู่ที่นี่เพราะสองหน้าจอโชว์ตัวเลขชุดเดียวกัน ถ้าต่างคนต่างเขียนเงื่อนไขมันเพี้ยนหากัน
 *  เงียบ ๆ แน่ (เคยเกิดแล้วรอบนี้: แก้แท็บ KPI ไปข้างเดียว หน้าคิวลีดยังเขียวอยู่)
 */
export function slaPendingTone(pending) {
  if (pending == null) return undefined;
  return pending ? 'warning' : 'good';
}
