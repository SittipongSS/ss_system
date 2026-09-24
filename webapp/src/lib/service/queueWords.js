// ── ถ้อยคำกลางของงานจัดคิว — วัน · ระยะห่างจากวันนี้ · ภาระของไซต์ · อายุของคำร้อง ──
//
// ⭐ ชุดเดียวกันทั้งการ์ดในแผง "รายการงาน" (`scheduleQueueView`) และโมดัลจัดคิว
//    (`scheduleModal` · `requests/commitDue`) — คนจัดคิวอ่านการ์ดแล้วเปิดโมดัลต้องเจอคำเดิมเป๊ะ
// ⚠️ **ไฟล์ใบ (leaf) โดยเจตนา** — `scheduleQueueView` นำเข้า `requests/commitDue` อยู่แล้ว ถ้า
//    `commitDue` ต้องนำเข้าคำพวกนี้จาก `scheduleQueueView` กลับ จะได้ import วนสองไฟล์
//    ⇒ ย้ายคำกลางลงมาไว้ที่นี่ (ไม่นำเข้าอะไรจากชั้นจอ) แล้ว `scheduleQueueView` ส่งต่อ (re-export)
//    ให้ผู้เรียกเดิมไม่ต้องแก้ import
// ⚠️ **ไม่อ่านนาฬิกาเอง** — "วันนี้" มาจากผู้เรียกเสมอ (วันไทยจาก `queueWindow`/`todayIso`)
import { fmtMonthShort } from '@/lib/format';
import { businessDate } from '@/lib/businessDate';
import { accessConflict, accessTimeText, siteAddressText } from './sites';

const DAY_LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** "อ. 22 ก.ย." จากวันที่ล้วน — ไม่เลื่อนโซนเวลา (สตริงวันที่ไม่ใช่เวลา) */
export function dayText(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY_LABELS[weekday]} ${d} ${fmtMonthShort(iso)}`;
}

/** จำนวนวันระหว่างสองวันที่ (b − a) — ใช้บอก "อีก 3 วัน" · เลขคณิตของปฏิทินล้วน (UTC เที่ยงคืน) */
export function daysBetween(a, b) {
  const toUtc = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/**
 * "อีก 3 วัน" / "พรุ่งนี้" / "วันนี้" / "{pastLabel} n วัน" ของวันที่อ้างถึง — `{ text, tone }`
 * @param pastLabel คำของวันที่ผ่านไปแล้ว (ต่างกันตามเรื่อง: "เลยวันที่ต้องการ" · "วันนัดเดิมผ่านไปแล้ว" …)
 * ⚠️ ไม่มีวัน = `{ text: '', tone: '' }` (ไม่เดาว่าเป็นวันนี้)
 */
export function relDayText(date, todayIso, pastLabel) {
  if (!date) return { text: '', tone: '' };
  const n = daysBetween(todayIso, date);
  if (n < 0) return { text: `${pastLabel} ${-n} วัน`, tone: 'warn' };
  if (n === 0) return { text: 'วันนี้', tone: '' };
  if (n === 1) return { text: 'พรุ่งนี้', tone: '' };
  return { text: `อีก ${n} วัน`, tone: '' };
}

/**
 * คำสั้นของ "นัดชนช่วงที่ไซต์ให้เข้า" — บรรทัดผลลัพธ์ใต้ปุ่มของสองโมดัลจัดคิว (เหตุเต็มอยู่ที่แผงด่าน)
 * · วันที่ไซต์ไม่เปิด ⇒ "ส. 3 ต.ค. ไซต์ไม่ให้เข้า" (ไม่พูดว่านอกช่วงเวลาทั้งที่เวลาอยู่ในช่วง)
 * · เวลา ⇒ "นอกช่วงเข้าไซต์ 14:30–16:30"
 * · ไม่ชน / ไม่มีไซต์ = ''
 * ⚠️ ชน/ไม่ชนตัดสินที่ `accessConflict` ตัวเดียวกับด่าน ④ — ที่นี่แค่เลือกคำ
 */
export function accessWarnText(site, { date = null, startTime = null, endTime = null } = {}) {
  const conflict = site ? accessConflict(site, { date, startTime, endTime }) : null;
  if (!conflict) return '';
  if (conflict.kind === 'day') return `${dayText(date)} ไซต์ไม่ให้เข้า`;
  const range = accessTimeText(site);
  return range ? `นอกช่วงเข้าไซต์ ${range}` : 'นอกช่วงเข้าไซต์';
}

/* คำเตือนที่ไม่บล็อก ต่อท้ายบรรทัดผลลัพธ์ — "… · เกินภาระ 12 จุด (เตือนเท่านั้น)"
   ⭐ ตัวเดียวของสองโมดัลจัดคิว (ปล่อยร่าง · ลงคิว) — คำเตือนอ่านเหมือนกันทุกทาง */
export function withWarnings(text, warnings = []) {
  const list = (warnings || []).filter(Boolean);
  return list.length ? `${text} · ${list.join(' · ')} (เตือนเท่านั้น)` : text;
}

/**
 * ภาระของไซต์ "3 จุด · 2 แพ็ค" — ตัวเดียวของการ์ดและโมดัล
 * @param load `{ assets, packs }` ของไซต์ (`workload[siteId]`) · ไม่มี = ''
 * @param showZero ไซต์ที่รู้ภาระแล้วแต่เป็นศูนย์ (ไซต์ใหม่ยังไม่มีเครื่อง) โชว์ "0 จุด · 0 แพ็ค"
 *                 ⚠️ ค่าตั้งต้น = ไม่โชว์ — การ์ดเขียนขีดแทนศูนย์มาตั้งแต่ต้น (ช่องเล็ก · ศูนย์อ่านเหมือนเลขจริง)
 */
export function siteLoadText(load, { showZero = false } = {}) {
  if (!load) return '';
  const assets = load.assets || 0;
  const packs = load.packs || 0;
  if (!assets && !packs && !showZero) return '';
  return `${assets} จุด · ${packs} แพ็ค`;
}

/* วันไทยของจุดเวลา — ค่าเสีย = '' (ไม่ระเบิดทั้งแผงเพราะแถวเดียว) · ⚠️ ห้ามตัดสตริง ISO เอง (check:thaitime) */
export const thaiDayOf = (timestamp) => {
  if (!timestamp) return '';
  try { return businessDate(timestamp); } catch { return ''; }
};

/**
 * "ส่งเมื่อ พ. 23 ก.ย. · ค้างมา 1 วัน" ของคำร้อง — นับจากวันไทยที่ส่ง
 * ⚠️ ส่งวันนี้ = ไม่มีท่อน "ค้างมา" (ศูนย์วันไม่ใช่การค้าง)
 */
export function requestAgeText(request, todayIso) {
  const submittedOn = thaiDayOf(request?.submittedAt);
  const age = submittedOn ? Math.max(0, daysBetween(submittedOn, todayIso)) : null;
  return [
    submittedOn ? `ส่งเมื่อ ${dayText(submittedOn)}` : '',
    age ? `ค้างมา ${age} วัน` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * "ที่ไหน" ของไซต์ในโมดัลจัดคิว — "เขต BKK · เข้าทางลานจอด B1 แลกบัตรที่ รปภ."
 * ⭐ สองเรื่องที่คนขับรถต้องรู้ก่อนออก: เขตวิ่งงาน (`routeZone`) กับวิธีเข้า (`accessNote`)
 * ⚠️ ไม่มีทั้งสองอย่าง (ไซต์จากหน้าใบคำร้องที่ select มาแค่ที่อยู่) = ถอยไปที่อยู่ของไซต์ · ไม่มีเลย = ''
 */
export function siteWhereText(site) {
  if (!site) return '';
  const parts = [site.routeZone ? `เขต ${site.routeZone}` : '', site.accessNote || ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : siteAddressText(site);
}
