// ── ภาษาของ URL รายการงาน (/service/schedule) — ถัง · ช่วง · "นัดวันนี้" — ไฟล์เบา ไม่มี React ──────
//
// ⭐ แยกจาก scheduleQueue.js เพื่อให้หน้าภาพรวม (/service) **ประกอบลิงก์และนับ "นัดวันนี้" ด้วยตัวตัดสินเดียวกับ
//    รายการงาน** โดยไม่ลากตัวตัดสินด่าน (visitGate → สัญญา · งวดเงิน · ใบสั่งขาย) เข้า bundle ของหน้าภาพรวม
//    · scheduleQueue.js re-export ทุกตัว ⇒ ผู้เรียกเดิม (หน้าจัดคิว · API · เทสต์) ไม่ต้องเปลี่ยน import
//    · ไฟล์นี้ import ได้แค่ visitStatus.js — ยามใน scheduleTodayRange.test.mjs จับ
// ⚠️ ไม่เรียก `businessDate()` เอง (กติกาเดียวกับ scheduleQueue.js) — "วันนี้" มากับผู้เรียกเสมอ
import { isOpenVisit } from './visitStatus';

// ── ถังของรายการงาน ────────────────────────────────────────────────────────
export const QUEUE_BUCKETS = Object.freeze(['waiting', 'overdue', 'scheduled', 'closed']);
export const QUEUE_BUCKET_LABELS = Object.freeze({ waiting: 'รอจัด', overdue: 'ค้าง', scheduled: 'จัดแล้ว', closed: 'ปิดแล้ว' });
/* หน่วยของตัวเลขบนถัง — ร่างยังไม่ใช่นัด (ยังไม่ถึงมือใคร) จึงนับเป็น "ใบ" */
export const QUEUE_BUCKET_UNITS = Object.freeze({ waiting: 'ใบ', overdue: 'นัด', scheduled: 'นัด', closed: 'นัด' });

// ── ช่วงของถัง "จัดแล้ว" ──────────────────────────────────────────────────
export const QUEUE_RANGES = Object.freeze(['all', '7d', 'unassigned']);
/* ⚠️ ป้าย "ยังไม่มีเจ้าหน้าที่" ต้องบอกขอบ 7 วันในตัว (ตรวจตัวเลข L22 · 26/10/2026) — ช่วงนี้นับเฉพาะนัดไม่มีเจ้าหน้าที่
   ที่ถึงคิวภายในวันนี้ + 6 (`inQueueRange` · จงใจ: นัดไกลยังไม่ต้องมอบหมาย) · 🐞 ป้ายเปล่าอ่านเป็น "ทุกนัดที่ยังไม่มีคน"
   ทั้งที่นัดไม่มีเจ้าหน้าที่ซึ่งไกลกว่า 7 วันไม่อยู่ในเลขไหนเลย · "7 วัน" = หน้าต่างเลื่อน ไม่ใช่สัปดาห์ อา.–ส. (มติเจ้าของ 26/10 · L21) */
export const QUEUE_RANGE_LABELS = Object.freeze({ all: 'ทั้งหมด', '7d': '7 วัน', unassigned: 'ยังไม่มีเจ้าหน้าที่ · 7 วัน' });

/* ⭐ "เฉพาะวันนี้" = ช่วงที่ **มากับลิงก์เท่านั้น** — ปลายทางของการ์ด "นัดวันนี้" บนหน้าภาพรวม (/service)
   🐞 ตรวจตัวกรอง 08/10 · H15: การ์ด "นัดวันนี้ 3" เคยเปิดช่วง 7 วัน (12 แถว · กลุ่มวันนี้ขึ้นก่อน) เพราะรายการงาน
      ไม่มีช่วงนี้ ⇒ มติเจ้าของ 19/10: การ์ดเปิดรายการ **วันนี้วันเดียว** — เลขบนการ์ด = จำนวนแถวที่เปิดเจอ
   ⚠️ ไม่อยู่ใน QUEUE_RANGES (แถบเลือกช่วง) โดยเจตนา — โชว์เป็นป้าย "กรอง: นัดวันนี้ … ×" ที่กดล้างได้แทน
      (ตัวกรองที่มากับลิงก์ต้องมองเห็นและล้างได้) · กดช่วงอื่นบนแถบ = แทนที่ตัวกรองนี้ในตัว (พารามิเตอร์เดียวกัน) */
export const QUEUE_RANGE_TODAY = 'today';
export const QUEUE_RANGE_TODAY_LABEL = 'นัดวันนี้';
/* ทุกค่าที่ `?range=` รับได้ — แถบเลือกช่วง + ช่วงที่มากับลิงก์ */
export const QUEUE_LINK_RANGES = Object.freeze([...QUEUE_RANGES, QUEUE_RANGE_TODAY]);

/** "นัดวันนี้" — **ตัวตัดสินเดียว** ของเลขบนการ์ด (`serviceCounts().today` · แผง "วันนี้ใครไปไหน")
 *  กับช่วง "เฉพาะวันนี้" ของรายการงาน (`inQueueRange(…, 'today')`) ⇒ เลขที่เห็น = แถวที่เปิดเจอ
 *  · ยังรอลงมือ (`isOpenVisit` = นัดไว้ | กำลังทำ) และวันนัดตรงวันนี้ — ร่าง/ปิดแล้ว/ยกเลิก/เลื่อน ไม่นับ
 *  ⚠️ `todayIso` ต้องมาจากนาฬิกาไทย (`businessDate()`) ที่ผู้เรียก
 *     ไม่มีวันนี้ (ว่าง/ผิดรูป) = ไม่ใช่วันนี้ ไม่ใช่ "ทุกวัน" */
export function isVisitToday(visit, todayIso) {
  if (!isOpenVisit(visit)) return false;
  const today = String(todayIso || '');
  return !!today && String(visit?.scheduledDate || '') === today;
}

/** ค่า `?range=` ของหน้าจัดคิว → ช่วงที่ใช้กรอง · ไม่มี/ไม่รู้จัก = 'all' (URL พิมพ์ผิดต้องไม่ทำให้รายการว่าง) */
export function queueRangeFrom(value) {
  return QUEUE_LINK_RANGES.includes(value) ? value : 'all';
}

/** ลิงก์เข้ารายการงานของหน้าจัดคิวที่ตั้งถัง/ช่วงไว้แล้ว — การ์ดหน้าภาพรวมสร้างลิงก์ด้วยตัวนี้ · หน้าจัดคิวอ่านกลับ
 *  ด้วย `queueRangeFrom` ⇒ เทสต์เทียบเลขบนการ์ดกับแถวที่เปิดเจอได้ตรง ๆ
 *  · tab ตั้งต้น ('waiting') กับช่วง 'all' ไม่ใส่ใน URL (รูปเดียวกับที่หน้าจัดคิวเขียนเอง — `setQuery`)
 *  · ช่วงใช้กับถัง "จัดแล้ว" เท่านั้น — ถังอื่นไม่ส่ง range (หน้าจัดคิวล้าง range ทุกครั้งที่สลับถังอยู่แล้ว) */
export function scheduleQueueHref({ tab = 'waiting', range = 'all' } = {}) {
  const params = new URLSearchParams();
  const bucket = QUEUE_BUCKETS.includes(tab) ? tab : 'waiting';
  if (bucket !== 'waiting') params.set('tab', bucket);
  const r = queueRangeFrom(range);
  if (bucket === 'scheduled' && r !== 'all') params.set('range', r);
  const qs = params.toString();
  return `/service/schedule${qs ? `?${qs}` : ''}`;
}
