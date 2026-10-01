// ── ด่าน "รับงาน" / ปุ่มจับเวลา ของนัดรายใบ — ตรรกะล้วน ไม่แตะ DB/HTTP (แผน operation-crew C7 · มติ 26/09) ──
//
// ⭐ route PATCH ของนัด (`visits/[id]/route.js`) ถามตัวนี้ **หลัง** ด่าน "ใบที่ปิดแล้ว" ของตัวเอง
//    (`body.stamp && isClosedVisit(before)` → 409 เดิม) ⇒ ใบที่ปิดแล้วไม่ใช่เรื่องของไฟล์นี้
// ⚠️ แยกเป็นไฟล์ตรรกะล้วนโดยตั้งใจ — route ลาก `next/headers` ⇒ unit test นำเข้าไม่ได้
//    (เหตุผลเดียวกับ `visitAccess.js`) · กติกาที่ทดสอบไม่ได้คือกติกาที่จะเพี้ยนเงียบ
// ⭐ route เรียก `visitMoveDecision` (ครอบ `stampDecision`) — ด่านตัดสินจาก **สถานะปลายทาง** ไม่ใช่แค่ปุ่มที่กด
import { isClosedVisit } from '../visitStatus';

/* ⭐ **ยังไม่ถึงวันนัด = รับงานไม่ได้ ทุกตำแหน่ง** (แผน C7 · R11)
   🐞 เดิม route ตั้ง `in_progress` ให้ทุกใบที่ยังไม่ปิด ⇒ กดรับงานของพรุ่งนี้ได้ แล้วนัดนั้นขึ้น "กำลังทำ"
      ตั้งแต่วันนี้ · ส่วน `stamp:'end'` บนนัดที่ยังไม่เริ่ม ตัวประทับเติมเริ่ม = จบ = ตอนนี้ (`visitStamp.js`)
      ⇒ "ไปแล้วเข้าไม่ได้" ปิดงานของอีกหลายวันข้างหน้าได้ทันที (นัดประเมินยังถอยใบคำร้อง + แจ้งฝ่ายขายด้วย)
   ⚠️ ทางออกเดียวคือผู้จัดคิวเลื่อนวันนัดเป็นวันนี้ (ต้องมีเหตุผล) — ฟอร์มนัดตั้ง "กำลังทำ/เข้าแล้ว" เองไม่ได้
      (`VISIT_STATUSES_MANUAL`) ⇒ ข้อความต้องชี้ทางนั้น ไม่ใช่บอกแค่ว่าไม่ได้ */
export const FUTURE_STAMP_ERROR = 'ยังไม่ถึงวันนัด · ให้ผู้จัดคิวเลื่อนนัดเป็นวันนี้ก่อน';

/* 🔴 **นัดที่ไม่อยู่บนตาราง รับงานไม่ได้** — เดิม route ตั้ง `in_progress` ให้ทุกสถานะที่ยังไม่ปิด
   ⇒ ร่าง (ยังไม่ผ่านด่านเข้าไซต์) · ยกเลิก · เลื่อนแล้ว กลายเป็น "กำลังทำ" ได้ด้วยการกดครั้งเดียว
   ⚠️ ร่างมีด่านเข้าไซต์ของ route คุมอยู่ก็จริง แต่ร่างที่ผ่านด่านจะข้ามจังหวะ "ลงคิว" ของผู้จัดคิวไปเป็น
      "กำลังทำ" ทันที และร่างที่ไม่ผ่านได้ข้อความเรื่องสัญญา/ชำระ ซึ่งไม่ได้บอกช่างว่านัดยังไม่ถูกลงคิว
      ⇒ ตอบตรงนี้ก่อนด้วยคำที่ช่างอ่านแล้วรู้ว่าต้องถามใคร */
export const DEAD_START_ERRORS = Object.freeze({
  draft: 'นัดนี้ยังเป็นร่าง ยังไม่ขึ้นคิว — รอผู้จัดคิวลงคิวก่อน',
  cancelled: 'นัดนี้ถูกยกเลิกแล้ว — รับงานไม่ได้ · ถามผู้จัดคิว',
  rescheduled: 'นัดนี้เลื่อนไปแล้ว — รับงานไม่ได้ · ถามผู้จัดคิว',
});

/** นัดนี้วันนัดยังไม่ถึงไหม — เทียบกับ "วันนี้" ตามนาฬิกาไทยที่ผู้เรียกส่งมา (`businessDate()`) */
const isFutureVisit = (visit, today) => {
  const day = String(visit?.scheduledDate ?? '').slice(0, 10);
  return !!day && !!today && day > today;
};

/**
 * ตัดสินปุ่มจับเวลาของนัดใบนี้ — คืน
 *   `null`             · ไปต่อตามปกติ
 *   `{ noop: true }`   · กดรับงานซ้ำบนใบที่กำลังทำ ⇒ ตอบ 200 พร้อมแถวเดิม **ไม่เขียนอะไรเลย**
 *   `{ error }`        · 409 พร้อมข้อความไทย
 *
 * @param visit  แถวก่อนแก้ (`before`)
 * @param stamp  `body.stamp` — 'start' | 'end' | อื่น ๆ (= ไม่ใช่ปุ่มจับเวลา)
 * @param today  `businessDate()` — ⚠️ วันไทยเสมอ ห้ามตัดจาก `toISOString()` (00:30 ไทย = เมื่อวานของ UTC)
 */
export function stampDecision(visit, stamp, today) {
  if (stamp === 'start') {
    /* ⭐ **กดซ้ำ = ไม่ทำอะไร** (แผน C7) — ผู้ช่วยที่เปิดรายการค้างไว้กดรับงานหลังหัวหน้าทีมกดไปแล้ว
       ต้องได้เข้างาน ไม่ใช่ toast ทางตัน · 🐞 เดิมกดซ้ำ = ประทับเวลาเริ่มใหม่ทับของคนแรก */
    if (visit?.status === 'in_progress') return { noop: true };
    const dead = DEAD_START_ERRORS[visit?.status];
    if (dead) return { error: dead };
    if (isFutureVisit(visit, today)) return { error: FUTURE_STAMP_ERROR };
    return null;
  }
  if (stamp !== 'end') return null;
  /* 🔴 **ส่งงานบนนัดที่ไม่อยู่บนตาราง = ไม่ได้ ทุกตำแหน่ง** (รีวิว S1 28/09) — เดิมกิ่งนี้ถามแค่ `scheduled`
     ⇒ นัดที่เลื่อนไปแล้ว/ยกเลิก/ร่าง ของวันข้างหน้า ยิง `stamp:'end'` + "ทำไม่ได้" แล้วปิดได้ 200
     ⚠️ ผู้จัดคิวที่ต้องการปิดใบพวกนี้เป็น "ทำไม่ได้" ใช้ฟอร์มแก้นัด (เลือกมือ ไม่ส่ง stamp) — ไม่ผ่านกิ่งนี้ */
  const dead = DEAD_CLOSE_ERRORS[visit?.status];
  if (dead) return { error: dead };
  /* ปิดงานก่อนวันนัด: กันเฉพาะใบที่ยัง "นัดไว้" — ใบที่กำลังทำอยู่แล้ว (เริ่มก่อนมีด่านนี้) ต้องปิดได้เสมอ
     ไม่งั้นค้าง "กำลังทำ" ถึงวันนัด */
  if (visit?.status === 'scheduled' && isFutureVisit(visit, today)) {
    return { error: FUTURE_STAMP_ERROR };
  }
  return null;
}

/* คู่ของ `DEAD_START_ERRORS` ฝั่งปุ่มส่งงาน — ข้อความต้องบอกว่า "ส่งงาน" ไม่ได้ ไม่ใช่ "รับงาน" */
export const DEAD_CLOSE_ERRORS = Object.freeze({
  draft: 'นัดนี้ยังเป็นร่าง ยังไม่ขึ้นคิว — ส่งงานไม่ได้ · รอผู้จัดคิวลงคิวก่อน',
  cancelled: 'นัดนี้ถูกยกเลิกแล้ว — ส่งงานไม่ได้ · ถามผู้จัดคิว',
  rescheduled: 'นัดนี้เลื่อนไปแล้ว — ส่งงานไม่ได้ · ถามผู้จัดคิว',
});

/* ── ด่านของ "การย้ายสถานะ" ไม่ใช่ของปุ่ม (รีวิว S1 28/09) ────────────────────────────────
   🐞 ด่านข้างบนตัดสินจาก `body.stamp` ⇒ คำขอที่ **ไม่ส่ง stamp** แต่ส่ง `status` มาตรง ๆ ข้ามได้ทุกข้อ:
      `{status:'in_progress'}` บนนัดของอีกสามวัน = "กำลังทำ" ที่ไม่มีเวลาเริ่ม (กดรับงานทีหลังก็กลายเป็น no-op)
      · `{status:'unable'}` / `closeFromAssets` ไม่มี stamp = ปิดงานล่วงหน้าหลายวัน (นัดประเมินถอยใบ+แจ้งฝ่ายขายด้วย)
      · ช่างตั้งนัดของตัวเองเป็น "ยกเลิก"/"เลื่อนแล้ว" ได้
   ⭐ กติกา: **ตัดสินจากสถานะปลายทาง** (`stamp:'start'` = กำลังทำ · ไม่งั้นค่าที่ส่งมา · ไม่ส่ง = เท่าเดิม)
      · "กำลังทำ" ตั้งได้ทางเดียวคือปุ่มรับงาน **ทุกตำแหน่ง** (route ตั้งให้เอง · ฟอร์มแก้นัดเลือกไม่ได้)
      · ช่าง (`ownWorkOnly`) เปลี่ยนสถานะได้แค่ผ่านปุ่มจับเวลา: รับงาน → กำลังทำ · ส่งงาน → เข้าแล้ว/ทำไม่ครบ/ทำไม่ได้
        ยกเลิก · เลื่อน · ตั้งกลับเป็นนัดไว้/ร่าง = งานของผู้จัดคิว
      · ผู้จัดคิวปิดเป็น "ทำไม่ได้" ด้วยมือจากฟอร์มแก้นัดได้ตามเดิม (`VISIT_STATUSES_MANUAL`) — ไม่ใช่เรื่องของด่านนี้ */
export const IN_PROGRESS_STAMP_ERROR = 'สถานะ "กำลังทำ" ตั้งได้จากปุ่มรับงานเท่านั้น — ระบบประทับเวลาเริ่มให้เอง';
export const CREW_STATUS_ERROR =
  'เจ้าหน้าที่เปลี่ยนสถานะนัดได้เฉพาะรับงานและส่งงาน — ยกเลิก เลื่อน หรือตั้งกลับเป็นนัดไว้ ต้องให้ผู้จัดคิวเป็นคนทำ';
export const CREW_CLOSE_STAMP_ERROR = 'ปิดงานต้องกดปุ่มส่งงาน — ระบบประทับเวลาจบให้เอง';

/** สถานะปลายทางของคำขอนี้ — ⚠️ ต้องตรงกับที่ `normalizeVisitInput` จะได้จาก `{...before, ...body}` (null = นัดไว้) */
export function targetVisitStatus(visit, body = {}) {
  if (body?.stamp === 'start') return 'in_progress';
  const status = body && Object.prototype.hasOwnProperty.call(body, 'status') ? body.status : visit?.status;
  return status ?? 'scheduled';
}

/**
 * ด่านเต็มของ PATCH นัด — ปุ่มจับเวลา (`stampDecision`) + การย้ายสถานะที่ไม่ได้มาจากปุ่ม
 * คืนแบบเดียวกับ `stampDecision` เพิ่ม `{ error, forbidden: true }` = 403 (เรื่องสิทธิ์ ไม่ใช่จังหวะ)
 *
 * @param body         body ของคำขอ **หลัง** route สรุป `closeFromAssets` ลง `body.status` แล้ว
 * @param ownWorkOnly  ธงจาก `requireVisit` — คนหน้างานที่ไม่ถือ `service:edit`
 * @param today        `businessDate()` — วันไทยเสมอ
 */
export function visitMoveDecision(visit, body = {}, { ownWorkOnly = false, today } = {}) {
  const stamp = body?.stamp;
  const stamped = stampDecision(visit, stamp, today);
  if (stamped) return stamped;
  const target = targetVisitStatus(visit, body);
  if (target === visit?.status) return null;
  if (target === 'in_progress') return stamp === 'start' ? null : { error: IN_PROGRESS_STAMP_ERROR };
  if (!ownWorkOnly) return null;
  if (!isClosedVisit({ status: target })) return { error: CREW_STATUS_ERROR, forbidden: true };
  /* ช่างปิดงานโดยไม่ส่ง stamp = ถามด่านเดียวกับปุ่มส่งงานก่อน (ข้อความวันข้างหน้า/ร่าง/ยกเลิกบอกทางได้ตรงกว่า)
     แล้วค่อยบังคับให้มาทางปุ่ม — เวลาจบต้องประทับที่ server (มติ 2026-08-02 ข้อ 5) ไม่ใช่เวลาที่พิมพ์มา
     ⚠️ ใบที่ปิดแล้วเปลี่ยนเป็นสถานะปิดอื่น (นัดประเมินที่ยังแก้ได้) ก็ตกข้อนี้ — ปุ่มส่งงานบนใบที่ปิดแล้ว = 409 อยู่แล้ว */
  const asEnd = stampDecision(visit, 'end', today);
  if (asEnd) return asEnd;
  if (stamp !== 'end') return { error: CREW_CLOSE_STAMP_ERROR };
  return null;
}

