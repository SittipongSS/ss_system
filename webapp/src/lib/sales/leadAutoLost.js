// ── ปิดลีดอัตโนมัติเมื่อถือครบ 10 วันทำการแล้วยังไม่ได้นัด (มติผู้ใช้ 2026-09-16 · ลงมือ 2026-10-05) ──
//
// ⭐ ทำไมต้องมีขาที่สาม: ตีกลับอัตโนมัติ (leadAutoBounce.js) นับจาก `followUpAt` ซึ่ง AE
// ตั้งเอง และทุกครั้งที่กด "ติดตามต่อ" ระบบบังคับกรอกวันใหม่ ⇒ ใบที่ถูกกดตามไปเรื่อย ๆ
// ไม่มีวันเลยกำหนด ไม่มีวันถูกตีกลับ · กติกานี้นับจาก **เวลาที่ใบอยู่ในมือคน** ซึ่งไม่มีใคร
// เลื่อนได้ ⇒ จับกองที่ตีกลับมองไม่เห็นได้ทั้งกอง
//
// 🔴 **ขัดกับคำเตือนหัวไฟล์ leadAutoBounce.js ("ปิดอัตโนมัติ = ลบหลักฐานคนดองงาน") โดยรู้ตัว**
// มติ 16/09 แก้จุดนั้นด้วยการใส่ **ฉลากความพยายามลงในรหัสเหตุผล** (ตามครบ / ตามไม่ครบ /
// ไม่เคยแตะ) ⇒ ใบที่ระบบปิดไม่ได้หายเงียบ มันไปขึ้นเป็นแถวของตัวเองในรายงาน "แพ้เพราะอะไร"
// แยกตามว่าคนถือใบทำอะไรไปบ้าง · และปิดผิดดึงกลับได้ด้วยปุ่ม "ลูกค้ากลับมา" (reopen · #1868)
//
// ⚠️ ไฟล์นี้ไม่ import `leads.js` (leads.js import ค่าคงที่จากที่นี่) — ทางเดียว ไม่มี cycle
// ท่าเดียวกับ leadAutoBounce.js · กติกาเป็นฟังก์ชันบริสุทธิ์ทั้งหมด route เหลือแค่ query + เขียน

/* ⭐ **พ้นกี่วันทำการถึงปิด** (มติผู้ใช้ 16/09: 10 วันทำการ)
   ⚠️ "พ้น N" = มากกว่า N ไม่ใช่เท่ากับ — กติกาเดียวกับ `AUTO_BOUNCE_AFTER_BUSINESS_DAYS`
   และนับแบบไม่นับวันเริ่ม (`countBusinessDays`) ⇒ มอบวันจันทร์ ใบยังอยู่ครบสองสัปดาห์
   ทำการเต็ม ถูกปิดเช้าวันอังคารของสัปดาห์ที่สาม */
export const AUTO_LOST_AFTER_BUSINESS_DAYS = 10;

/* ติดต่อกี่ครั้งถึงนับว่า "ตามครบ" — **ฉลาก ไม่ใช่เงื่อนไขตัด** (มติ 16/09)
   🔴 อ่านกลับเป็น "ต้องติดต่อครบ 3 ครั้งก่อนถึงตัดได้" เมื่อไร กติกาจะกลับหัวทันที:
   ไม่กดบันทึกการติดต่อ = ไม่มีวันครบ = ไม่มีวันถูกปิด ⇒ คนที่ดองงานรอด คนที่ตามจริงโดนล้างคิว
   ⚠️ นับ **ตลอดอายุใบ** ไม่ใช่เฉพาะในหน้าต่าง 10 วัน — วัดแล้ว (16/09) นิยามในหน้าต่าง
   ตีตราคนที่ตามครบจริงว่าตามไม่ครบ (12 ใบที่ตามครบ ได้ฉลากครบแค่ 4) */
export const AUTO_LOST_FULL_EFFORT = 3;

/* สถานะที่ระบบปิดได้ — ใบที่อยู่ในมือคนแต่ยังไม่ถึงขั้นนัด
   ⚠️ `meeting` ไม่อยู่ในลิสต์ (ถึงขั้นนัดแล้ว = สำเร็จในอัตราแปลงไปแล้ว) ·
   `new`/`screened` ไม่อยู่ (ยังไม่มีใครถือ — ไม่มีใครให้ติดฉลากความพยายาม) */
export const AUTO_LOST_STATUSES = ['assigned', 'contacted'];

/* สถานะที่นับว่า "อยู่ในมือคน" — นาฬิกาเดินเฉพาะช่วงนี้ */
export const LEAD_OWNED_STATUSES = ['assigned', 'contacted', 'meeting'];

/* เหตุการณ์ที่นับเป็น "ติดต่อหนึ่งครั้ง" — ต้องตรงกับ `LEAD_FOLLOW_UP_ACTIONS` ของ leads.js
   (สะกดซ้ำเพราะ import กลับไม่ได้ · เทสต์ล็อกให้ตรงกัน) */
export const AUTO_LOST_CONTACT_KINDS = ['contact', 'followup'];

/* ⭐ **ฉลากความพยายามอยู่ในรหัสเหตุผล** ไม่ใช่คอลัมน์แยก — สามรหัสนี้ขึ้นเป็นสามแถวในรายงาน
   "แพ้เพราะอะไร" ได้เลยโดยไม่มีคอลัมน์ใหม่ และป้ายใต้สถานะบนตารางลีดบอกฉลากได้ทันที
   ⚠️ เพิ่ม/เปลี่ยนรหัสต้องแก้ CHECK ของ `sales_leads.disqualifiedCode` ด้วย (mig 0402) */
export const AUTO_LOST_CODE_BY_EFFORT = Object.freeze({
  full: 'auto_followed',
  partial: 'auto_partial',
  none: 'auto_untouched',
});

const owned = (status) => LEAD_OWNED_STATUSES.includes(status);
const stamp = (row) => Date.parse(row?.createdAt);

/** ติดต่อไปแล้วกี่ครั้ง (ตลอดอายุใบ) และได้ฉลากแบบไหน */
export function leadFollowEffort(events = []) {
  const contacts = (events || []).filter((e) => AUTO_LOST_CONTACT_KINDS.includes(e?.kind)).length;
  const effort = contacts >= AUTO_LOST_FULL_EFFORT ? 'full' : contacts > 0 ? 'partial' : 'none';
  return { contacts, effort, code: AUTO_LOST_CODE_BY_EFFORT[effort] };
}

/**
 * ใบนี้อยู่ในมือคนมาแล้วกี่วันทำการ — **สะสมข้ามรอบตีกลับ** (มติผู้ใช้ 2026-10-05 "นับต่อ ไม่เริ่มใหม่")
 *
 * 🪤 ทำไมไม่ใช้ `assignedAt`: ตีกลับ (`leadBouncePatch`) ล้างมันเป็น null แล้ว `assign`
 *    รอบใหม่เขียน now ⇒ นาฬิกากลับไปศูนย์ทุกครั้งที่ใบวนคิว และตีกลับที่คนกดไม่มีเพดาน
 *    ⇒ ตีกลับแล้วคัดกลับมาทีมเดิมก็พ้นการปิดได้ตลอดกาล · ประวัติไม่เคยถูกล้าง จึงนับจากประวัติ
 *
 * กติกานาฬิกา:
 *   · **เดิน** เฉพาะช่วงที่ใบอยู่ในมือคน (assigned/contacted/meeting) — ช่วงนอนคิวคัดกรอง
 *     หลังตีกลับไม่นับ (ไม่ใช่เวลาของคนถือใบ)
 *   · **เปลี่ยนมือ (reassign) ไม่รีเซ็ต** — สลับใบกันในทีมแล้วพ้นการปิดไม่ได้
 *   · **ลูกค้ากลับมา (reopen) เริ่มนับใหม่** — เป็นโอกาสใหม่ที่คนกดรับผิดชอบด้วยเหตุผล
 *     ไม่รีเซ็ตแล้วใบที่เพิ่งดึงกลับจะถูกปิดซ้ำเช้าวันถัดไปทันที ปุ่มดึงกลับใช้ไม่ได้จริง
 *
 * ⚠️ อ่านช่วงจาก `fromStatus`/`toStatus` ของเหตุการณ์ ไม่ใช่จากชื่อ kind — ทางเข้า/ออกจาก
 *    มือคนมีหลายชนิด (assign · bounce · auto_bounce · disqualify · link_deal · unlink_deal ·
 *    create_deal) ไล่ลิสต์ชื่อเมื่อไร ชนิดใหม่ที่เพิ่มทีหลังจะทำนาฬิกาค้างเงียบ
 *
 * @param lead        แถวลีด (ใช้ assignedAt/firstAssignedAt/createdAt เมื่อประวัติขาด)
 * @param events      เหตุการณ์ของใบนี้ เรียงลำดับไหนก็ได้ (ฟังก์ชันเรียงเอง)
 * @param now         เวลาอ้างอิง (ISO)
 * @param daysBetween (fromIso, toIso) → จำนวนวันทำการ — ผู้เรียกส่งมาเพื่อไม่ต้องผูกกับ
 *                    ตาราง holidays (ท่าเดียวกับ `planAutoBounce`)
 * @returns จำนวนวันทำการ หรือ `null` ถ้าใบไม่ได้อยู่ในมือใคร / ไม่มีจุดเริ่มเลย
 */
export function leadOwnedBusinessDays(lead, events = [], { now, daysBetween } = {}) {
  if (!owned(lead?.status)) return null;
  const rows = (events || [])
    .filter((e) => Number.isFinite(stamp(e)))
    .sort((a, b) => stamp(a) - stamp(b));
  let days = 0;
  let openAt = null;
  for (const e of rows) {
    if (e.kind === 'reopen') {
      days = 0;
      openAt = owned(e.toStatus) ? e.createdAt : null;
      continue;
    }
    const from = owned(e.fromStatus);
    const into = owned(e.toStatus);
    if (!openAt && into && !from) openAt = e.createdAt;
    else if (openAt && from && e.toStatus && !into) {
      days += daysBetween(openAt, e.createdAt);
      openAt = null;
    }
  }
  /* ⚠️ ใบอยู่ในมือคนแต่ประวัติไม่มีช่วงที่เปิดค้าง = ประวัติขาด (ใบเก่าก่อนมี lead_events ·
     หรือ insert ล้มตอนมอบ) ⇒ ถอยไปใช้คอลัมน์ของรอบปัจจุบัน ไม่ใช่ปล่อยให้ใบไม่มีนาฬิกา */
  if (!openAt) openAt = lead.assignedAt || lead.firstAssignedAt || lead.createdAt || null;
  if (!openAt) return null;
  return days + daysBetween(openAt, now);
}

/** ข้อความที่จะบันทึกเป็นรายละเอียดของการปิด — อ่านแล้วต้องรู้ว่าทำไม และคนถือใบทำอะไรไปแล้ว */
export function autoLostReason({ days, contacts }) {
  const effort = contacts > 0 ? `ติดต่อไปแล้ว ${contacts} ครั้ง` : 'ไม่มีบันทึกการติดต่อเลย';
  return `ระบบปิดอัตโนมัติ — อยู่ในมือฝ่ายขาย ${days} วันทำการ`
    + ` (เกณฑ์ ${AUTO_LOST_AFTER_BUSINESS_DAYS}) ยังไม่ได้นัดประชุม · ${effort}`;
}

/**
 * ใบไหนต้องปิด
 *
 * @param leads    แถวลีดที่สถานะอยู่ใน `AUTO_LOST_STATUSES` (ใบสถานะอื่นถูกข้าม)
 * @param eventsOf (leadId) → เหตุการณ์ทั้งหมดของใบนั้น
 * @param ageOf    (lead, events) → วันทำการที่อยู่ในมือคน (`leadOwnedBusinessDays`)
 * @returns รายการ `{ lead, days, contacts, effort, code }` เรียงถือนานสุดก่อน
 */
export function planAutoLost(leads = [], { eventsOf, ageOf } = {}) {
  const out = [];
  for (const lead of leads || []) {
    if (!AUTO_LOST_STATUSES.includes(lead?.status)) continue;
    const events = eventsOf(lead.id) || [];
    /* ⭐ เคยนัดแล้วครั้งเดียว = ไม่ปิด (ตลอดอายุใบ) — นัดคือสิ่งที่กติกานี้วัด
       ไม่ใช่สถานะบนแถว (ตีกลับล้าง meetingAt ทิ้ง แต่ประวัติยังอยู่) */
    if (events.some((e) => e?.kind === 'meeting')) continue;
    const days = ageOf(lead, events);
    if (days == null || !(days > AUTO_LOST_AFTER_BUSINESS_DAYS)) continue;
    out.push({ lead, days, ...leadFollowEffort(events) });
  }
  // ถือนานสุดก่อน — ชนเพดานต่อรอบเมื่อไร ใบที่แย่ที่สุดต้องได้ถูกจัดการก่อน
  return out.sort((a, b) => b.days - a.days);
}

/** เหลืออีกกี่วันทำการก่อนระบบจะปิด — สำหรับบอกบนหน้าใบ
 *  ⚠️ กลับสมการของ `planAutoLost` (`days > N`) ตัวเดียวกันเป๊ะ: ปิดเมื่อ days ≥ N+1
 *  ถึง 0 = เข้าเกณฑ์แล้ว รอรอบถัดไปของ cron (จอต้องไม่บอกว่า "ปิดแล้ว")
 *  @param days จาก `leadOwnedBusinessDays` · `null` = ไม่มีนาฬิกา */
export function autoLostCountdown(days) {
  if (days == null) return null;
  return Math.max(0, AUTO_LOST_AFTER_BUSINESS_DAYS + 1 - days);
}
