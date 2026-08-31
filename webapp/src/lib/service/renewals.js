// ── ทะเบียนติดตามต่อสัญญาบริการ (mig 0327 · แผน §PR-E) ──────────────────────
//
// ⭐ **"ใครใกล้หมดอายุ" คำนวณสดเสมอ ไม่เก็บลงฐาน** — วันหมดคือ `endDate` ของรอบขาย
//   (`service_zone_terms`) ⇒ สถานะ "ใกล้หมด/หมดแล้ว" เป็นผลของวันที่ ณ ตอนเปิดหน้า
//   ไม่ใช่คอลัมน์ที่ต้องมีคนไปอัปเดต (กติกาเดียวกับ `termIsActive` และ serviceStatus
//   ที่ห้ามเก็บคำว่า Expired)
//
// ⭐ **ตาราง `service_renewal_followups` เก็บแค่ "ผลการติดตาม"** — แถวเกิดเมื่อมีคน
//   ลงมือติดตามเท่านั้น · ไซต์ที่ยังไม่มีใครแตะจะโผล่ในทะเบียนโดยไม่มีแถวในฐาน
//
// ⚠️ **หน่วยของทะเบียนคือ "ไซต์" ไม่ใช่ "รอบขาย"** — ไซต์เดียวมีหลายโซนที่ทยอยหมด
//   แต่การโทรหาลูกค้าเป็นเรื่องเดียว ⇒ ยุบเป็นแถวเดียวต่อไซต์ แล้วใช้ **วันหมดที่เร็วที่สุด**
//   เป็นตัวเรียง (ถ้าใช้วันที่ช้าที่สุด เรื่องจะโผล่ตอนสายไปแล้ว)
import { businessDate } from '@/lib/businessDate';
import { addDays, daysBetween } from '@/lib/sales/paymentCoverage';
import { termOrderActive } from './terms';

/* หน้าต่างเตือน — 90 วันตามแผน §PR-E
   ⚠️ ตัวเลขนี้อยู่ที่เดียว: ทั้งทะเบียน กระดิ่ง และเทสต์อ่านจากตัวนี้ */
export const RENEWAL_WINDOW_DAYS = 90;

/* สถานะของแถวในทะเบียน — คำนวณจากวันล้วน ไม่เกี่ยวกับตาราง followups
   ⚠️ `expired` ไม่ได้แปลว่า "จบเรื่อง" — รอบหมดแล้วแต่ยังไม่มีใครปิดเรื่อง คือแถวที่
   ต้องเด่นที่สุดในทะเบียน (ของจริงคือเครื่องยังอยู่หน้างานโดยไม่มีสัญญาครอบ) */
export const RENEWAL_STATES = Object.freeze(['expired', 'due_soon']);

export function renewalState(endDate, todayIso = businessDate()) {
  if (!endDate) return null;                       // ไม่มีวันจบ = รอบปลายเปิด ไม่ใช่ของที่ต้องตาม
  const left = daysBetween(todayIso, endDate);
  if (left === null) return null;
  if (left < 0) return 'expired';
  return left <= RENEWAL_WINDOW_DAYS ? 'due_soon' : null;
}

/**
 * แถวของทะเบียน — หนึ่งไซต์หนึ่งแถว
 *
 * @param sites        ไซต์ทั้งหมดที่ผู้เรียกมองเห็น
 * @param zones        โซนของไซต์เหล่านั้น (ใช้แค่ map zoneId → siteId)
 * @param terms        รอบขายของโซนเหล่านั้น
 * @param ordersById   Map ใบสั่งขาย — ใช้ตัดสินว่า term ยังมีผล (termOrderActive)
 * @param followups    แถวใน service_renewal_followups (เอาเฉพาะที่ยังเปิดอยู่มาแปะ)
 *
 * ⚠️ **term ที่ใบแม่ตายแล้วไม่นับ** — ใบถูก Rev./ยกเลิก = รอบนั้นไม่มีผล ถ้านับด้วย
 *   ทะเบียนจะเต็มไปด้วยไซต์ที่ "หมดอายุ" ทั้งที่ของจริงถูกแทนด้วยใบใหม่ไปแล้ว
 * ⚠️ **ไซต์ที่ปิดเรื่องไปแล้ว (renewed/declined) ไม่โผล่** ตราบใดที่ยังไม่มีรอบใหม่
 *   ที่เข้าเขตอีก — ผู้เรียกส่งเฉพาะ followup ที่ status='following' เข้ามา แล้วที่นี่
 *   ตัดไซต์ที่มีเรื่องปิดครอบวันหมดเดียวกันออกผ่าน `closedEndDates`
 */
export function renewalRows({
  sites = [], zones = [], terms = [], ordersById = new Map(),
  followups = [], closedEndDates = new Map(), todayIso = businessDate(),
} = {}) {
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const siteOfZone = new Map(zones.map((z) => [z.id, z.siteId]));
  const openBySite = new Map(followups.filter((f) => f?.status === 'following').map((f) => [f.siteId, f]));

  const bySite = new Map();
  for (const term of terms) {
    if (!termOrderActive(ordersById.get(term.salesOrderId))) continue;
    const siteId = siteOfZone.get(term.zoneId);
    if (!siteId || !sitesById.has(siteId)) continue;
    const state = renewalState(term.endDate, todayIso);
    if (!state) continue;
    /* ปิดเรื่องของรอบนี้ไปแล้ว = ไม่ต้องตามซ้ำ (เก็บวันหมดที่ปิดไปแล้วต่อไซต์)
       ⚠️ เทียบด้วย "วันหมด" ไม่ใช่แค่ siteId — ต่อสัญญารอบใหม่แล้วหมดอีกครั้งในปีหน้า
       ต้องโผล่ใหม่ ไม่ใช่เงียบไปตลอดกาลเพราะเคยปิดเรื่องไปครั้งหนึ่ง */
    if ((closedEndDates.get(siteId) || []).includes(term.endDate)) continue;

    const row = bySite.get(siteId) || {
      siteId,
      site: sitesById.get(siteId),
      endDate: term.endDate,
      terms: [],
      followup: openBySite.get(siteId) || null,
    };
    row.terms.push(term);
    // วันหมดของแถว = วันที่เร็วที่สุดในบรรดารอบที่เข้าเขต (เตือนตามของที่จะหมดก่อน)
    if (String(term.endDate) < String(row.endDate)) row.endDate = term.endDate;
    bySite.set(siteId, row);
  }

  return [...bySite.values()]
    .map((row) => ({
      ...row,
      state: renewalState(row.endDate, todayIso),
      daysLeft: daysBetween(todayIso, row.endDate),
    }))
    /* เรียง: หมดแล้วขึ้นก่อน แล้วค่อยเรียงตามวันหมด (ใกล้ที่สุดก่อน)
       ⚠️ ห้ามเรียงตามชื่อไซต์ — ทะเบียนนี้ตอบคำถาม "ต้องโทรใครก่อน" */
    .sort((a, b) => (a.daysLeft - b.daysLeft) || String(a.site?.name || '').localeCompare(String(b.site?.name || ''), 'th'));
}

/* ตัวเลขบนแถบสรุป 4 ช่อง (แผน §PR-E)
   ⚠️ "กำลังติดตาม" นับจากแถวที่มี followup เปิดอยู่ ไม่ใช่จำนวนแถวทั้งหมด —
   สองอย่างนี้ต่างกันตรง "มีคนรับเรื่องแล้วหรือยัง" ซึ่งเป็นคำถามของหัวหน้าทีม */
export function renewalCounts(rows = [], todayIso = businessDate()) {
  const soon30 = addDays(todayIso, 30);
  return {
    expired: rows.filter((r) => r.state === 'expired').length,
    dueIn30: rows.filter((r) => r.state === 'due_soon' && String(r.endDate) <= String(soon30)).length,
    dueSoon: rows.filter((r) => r.state === 'due_soon').length,
    following: rows.filter((r) => r.followup).length,
  };
}

/* ── บันทึกผลการติดตาม ─────────────────────────────────────────────────── */
export const FOLLOWUP_RESULTS = Object.freeze(['following', 'renewed', 'declined']);
export const FOLLOWUP_RESULT_LABELS = Object.freeze({
  following: 'ตามต่อ',
  renewed: 'ต่อสัญญา',
  declined: 'ไม่ต่อ',
});
export const FOLLOWUP_RESULT_HINTS = Object.freeze({
  following: 'ยังคุยกับลูกค้าอยู่ — นัดวันติดต่อครั้งหน้า',
  renewed: 'ลูกค้าตกลงต่อ — เปิดดีล RE-ORDER สายบริการให้',
  declined: 'ลูกค้าไม่ต่อ — ต้องบอกเหตุผล และฝ่ายบริการจะได้งานถอนเครื่อง',
});

export const DECLINE_REASON_MIN = 10;

/**
 * ด่านเดียวที่ทั้งโมดัลบนจอและ API ใช้ — คืนข้อความไทยเมื่อทำไม่ได้ หรือ null เมื่อผ่าน
 *
 * ⚠️ ด่านของ "เรื่องที่ปิดไปแล้ว" อยู่ที่นี่ ไม่ใช่ที่ UNIQUE index — index กันแค่
 *   เปิดซ้อนสองเรื่อง แต่ไม่ได้กันการแก้เรื่องที่ปิดไปแล้วให้กลับมามีชีวิต
 */
export function followupSaveError(followup, input = {}, { canEdit = false } = {}) {
  if (!canEdit) return 'บันทึกผลการติดตามได้เฉพาะฝ่ายขาย';
  if (followup && followup.status !== 'following') {
    return 'เรื่องนี้ปิดไปแล้ว — เปิดเรื่องใหม่เมื่อรอบถัดไปใกล้หมด';
  }
  if (!FOLLOWUP_RESULTS.includes(input.status)) return 'เลือกผลการติดตามก่อน';
  if (input.status === 'declined' && String(input.declineReason || '').trim().length < DECLINE_REASON_MIN) {
    return `เหตุผลที่ลูกค้าไม่ต่อ ต้องยาวอย่างน้อย ${DECLINE_REASON_MIN} ตัวอักษร`;
  }
  /* "ตามต่อ" ต้องมีวันนัดครั้งหน้า ไม่งั้นเรื่องจะค้างอยู่ในทะเบียนโดยไม่มีใครรู้ว่า
     ต้องกลับมาดูวันไหน (ของจริงคือเรื่องที่เปิดค้างครึ่งปีแล้วไม่มีใครแตะ) */
  if (input.status === 'following' && !input.nextContactOn) {
    return 'เลือกวันติดต่อครั้งหน้าด้วย — เรื่องที่ยังตามอยู่ต้องมีวันนัดเสมอ';
  }
  return null;
}

/** ค่าที่พร้อมเขียนลงฐาน — ผู้เรียกเติม id/ผู้ทำ/เวลาเอง */
export function followupPatch(input = {}, todayIso = businessDate()) {
  const status = input.status;
  const note = String(input.resultNote || '').trim();
  const reason = String(input.declineReason || '').trim();
  return {
    status,
    lastContactOn: input.lastContactOn || todayIso,
    // ปิดเรื่องแล้วไม่มีนัดครั้งหน้า (CHECK ของฐานไม่ได้บังคับ แต่ข้อมูลที่ค้างไว้อ่านลวงตา)
    nextContactOn: status === 'following' ? (input.nextContactOn || null) : null,
    resultNote: note || null,
    declineReason: status === 'declined' ? reason : null,
    closedAt: status === 'following' ? null : new Date().toISOString(),
  };
}
